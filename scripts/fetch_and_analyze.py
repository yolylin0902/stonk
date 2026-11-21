#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
每日美股／台股收盤漲跌故事爬蟲與 AI 分析腳本 (fetch_and_analyze.py)
-------------------------------------------------------------
功能：
1. 從 Supabase 的 watchlist 撈取追蹤清單。
2. 透過 yfinance 取得最新 2 個交易日收盤價，計算漲跌幅。
3. 透過 Google News RSS 抓取最新 6 則新聞。
4. 使用 Gemini API (google-genai SDK) 歸納漲跌故事、情緒標籤與精簡重點。
5. 將結果 upsert 寫入 Supabase 的 daily_reports。

用法：
  python fetch_and_analyze.py                     # 執行所有市場 (US + TW)
  python fetch_and_analyze.py --market US         # 僅執行美股
  python fetch_and_analyze.py --market TW         # 僅執行台股
  python fetch_and_analyze.py --market US --limit 2 # 測試模式：僅執行美股前 2 檔
"""

from __future__ import annotations

import argparse
import json
import logging
import math
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

# 載入環境變數
from dotenv import load_dotenv

# 依序尋找目前目錄或專案根目錄的 .env / .env.local
current_dir = Path(__file__).resolve().parent
project_root = current_dir.parent
for env_file in [project_root / ".env.local", project_root / ".env", current_dir / ".env"]:
    if env_file.exists():
        load_dotenv(dotenv_path=env_file)
        break

# 設定日誌格式
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("StockStory")

# 檢查相依套件
try:
    import feedparser
    import yfinance as yf
    from supabase import Client, create_client
except ImportError as e:
    logger.error(
        f"缺少必要套件：{e}。請先執行 pip install -r scripts/requirements.txt 安裝依賴！"
    )
    sys.exit(1)

# 嘗試匯入 google-genai SDK
try:
    from google import genai
    from google.genai import types
except ImportError:
    genai = None
    types = None
    logger.warning("未偵測到 google-genai 套件，將於需要使用 AI 分析時檢查。")


# ----------------------------------------------------------------------
# 環境變數與配置檢查
# ----------------------------------------------------------------------
def get_env_configs() -> Dict[str, str]:
    """取得並驗證必要的環境變數（優先支援 SERVICE_ROLE_KEY 以穿透 RLS 讀取各使用者清單）。"""
    supabase_url = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL")
    supabase_key = (
        os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        or os.getenv("SUPABASE_KEY")
        or os.getenv("VITE_SUPABASE_ANON_KEY")
    )
    gemini_api_key = os.getenv("GEMINI_API_KEY")
    gemini_model = (os.getenv("GEMINI_MODEL") or "gemini-2.5-flash").strip() or "gemini-2.5-flash"

    missing = []
    if not supabase_url:
        missing.append("SUPABASE_URL (或 VITE_SUPABASE_URL)")
    if not supabase_key:
        missing.append("SUPABASE_SERVICE_ROLE_KEY 或 SUPABASE_KEY (或 VITE_SUPABASE_ANON_KEY)")
    if not gemini_api_key:
        missing.append("GEMINI_API_KEY")

    if missing:
        logger.error(f"❌ 缺少必要環境變數：{', '.join(missing)}")
        logger.error("請確認專案根目錄的 .env 檔案已正確設定。可參考 .env.example")
        sys.exit(1)

    return {
        "supabase_url": supabase_url,
        "supabase_key": supabase_key,
        "gemini_api_key": gemini_api_key,
        "gemini_model": gemini_model,
    }


# ----------------------------------------------------------------------
# Supabase 操作
# ----------------------------------------------------------------------
def init_supabase(url: str, key: str) -> Client:
    """初始化 Supabase 客戶端。"""
    try:
        return create_client(url, key)
    except Exception as e:
        logger.error(f"❌ 初始化 Supabase 失敗: {e}")
        sys.exit(1)


def fetch_watchlist(client: Client, market: Optional[str] = None) -> List[Dict[str, Any]]:
    """從 Supabase 的 watchlist 資料表讀取自選股清單，並依 symbol 去重。"""
    try:
        query = client.table("watchlist").select("id, symbol, name, market")
        if market:
            query = query.eq("market", market.upper())
        response = query.order("symbol").execute()
        raw_list = response.data or []

        # 依 symbol 去重 (Deduplicate)，避免多人追蹤同一檔股票時重複抓取與呼叫 AI
        unique_stocks: List[Dict[str, Any]] = []
        seen_symbols = set()
        for item in raw_list:
            sym = (item.get("symbol") or "").strip().upper()
            if sym and sym not in seen_symbols:
                seen_symbols.add(sym)
                unique_stocks.append(item)

        logger.info(
            f"✅ 成功從 Supabase 讀取 {len(raw_list)} 筆自選股，去重後共 {len(unique_stocks)} 檔 (市場篩選: {market or '全部'})"
        )
        return unique_stocks
    except Exception as e:
        err_msg = str(e)
        logger.error(f"❌ 讀取 watchlist 資料失敗: {err_msg}")
        return []


def upsert_daily_report(client: Client, report_data: Dict[str, Any]) -> bool:
    """將分析後的報告寫入 (upsert) Supabase 的 daily_reports 資料表。"""
    try:
        client.table("daily_reports").upsert(
            report_data, on_conflict="report_date,symbol"
        ).execute()
        logger.info(
            f"💾 成功儲存報告至 Supabase: {report_data['symbol']} ({report_data['report_date']})"
        )
        return True
    except Exception as e:
        logger.error(f"❌ 儲存至 daily_reports 失敗 ({report_data.get('symbol')}): {e}")
        return False


# ----------------------------------------------------------------------
# 股價獲取 (yfinance)
# ----------------------------------------------------------------------
def fetch_stock_price(symbol: str) -> Optional[Dict[str, Any]]:
    """
    透過 yfinance 取得最新交易日收盤價與漲跌幅。
    結合 fast_info 與 history 雙重保證，徹底解決美股盤後數據 NaN 導致抓到舊日期的問題。
    """
    try:
        ticker = yf.Ticker(symbol)
        
        # 1. 優先嘗試取得 fast_info 即時與最新收盤數據
        fi = ticker.fast_info
        fast_last = getattr(fi, "last_price", None)
        fast_prev = getattr(fi, "regular_market_previous_close", None) or getattr(fi, "previous_close", None)

        # 2. 取得歷史資料以定位精確交易日
        hist = ticker.history(period="1mo")
        if hist.empty or len(hist) < 2:
            hist = ticker.history(period="3mo")

        if hist.empty:
            logger.warning(f"⚠️ {symbol}: 無法取得歷史股價資料。")
            return None

        # 取得最後一筆的日期（即使該筆 Close 是 NaN，日期也是最新的交易日）
        latest_date = hist.index[-1].strftime("%Y-%m-%d")

        # 若 fast_info 資料齊全且數值有效，以 fast_info 為準（最即時精確）
        if fast_last is not None and fast_prev is not None and fast_prev > 0:
            f_last = float(fast_last)
            f_prev = float(fast_prev)
            if not (math.isnan(f_last) or math.isnan(f_prev)):
                close_price = round(f_last, 2)
                prev_close = round(f_prev, 2)
                change_percent = round(((close_price - prev_close) / prev_close) * 100, 2)
                return {
                    "report_date": latest_date,
                    "close_price": close_price,
                    "change_percent": change_percent,
                    "prev_close": prev_close,
                }

        # 備用方案：從 history 清除 NaN 後計算
        valid_hist = hist.dropna(subset=["Close"])
        if len(valid_hist) < 2:
            logger.warning(f"⚠️ {symbol}: 有效歷史收盤資料不足 2 個交易日。")
            return None

        latest_row = valid_hist.iloc[-1]
        prev_row = valid_hist.iloc[-2]
        close_raw = float(latest_row["Close"])
        prev_raw = float(prev_row["Close"])
        if math.isnan(close_raw) or math.isnan(prev_raw):
            logger.warning(f"⚠️ {symbol}: 收盤價包含 NaN。")
            return None

        report_date = valid_hist.index[-1].strftime("%Y-%m-%d")
        close_price = round(close_raw, 2)
        prev_close = round(prev_raw, 2)
        change_percent = round(((close_price - prev_close) / prev_close) * 100, 2) if prev_close > 0 else 0.0

        return {
            "report_date": report_date,
            "close_price": close_price,
            "change_percent": change_percent,
            "prev_close": prev_close,
        }
    except Exception as e:
        logger.error(f"❌ 抓取 {symbol} 股價資訊失敗: {e}")
        return None


# ----------------------------------------------------------------------
# Google News RSS 抓取
# ----------------------------------------------------------------------
def fetch_google_news(symbol: str, name: str, market: str, limit: int = 6) -> List[Dict[str, str]]:
    """
    抓取 Google News RSS 最新新聞。
    美股語系：hl=en-US&gl=US&ceid=US:en
    台股語系：hl=zh-TW&gl=TW&ceid=TW:zh-Hant
    """
    clean_sym = symbol.replace("^", "").replace(".TW", "").replace(".TWO", "").strip()
    clean_name = re.sub(r"\(.*?\)", "", name).strip()
    if market.upper() == "US":
        query = f"{clean_name} {clean_sym} stock news"
        hl, gl, ceid = "en-US", "US", "US:en"
    else:
        query = f"{clean_name} {clean_sym} 股價 新聞"
        hl, gl, ceid = "zh-TW", "TW", "TW:zh-Hant"

    encoded_query = urllib.parse.quote(query)
    rss_url = f"https://news.google.com/rss/search?q={encoded_query}&hl={hl}&gl={gl}&ceid={ceid}"

    news_list: List[Dict[str, str]] = []
    try:
        # 加上 User-Agent 避免被擋
        req = urllib.request.Request(
            rss_url,
            headers={
                "User-Agent": (
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/120.0.0.0 Safari/537.36"
                )
            },
        )
        with urllib.request.urlopen(req, timeout=10) as response:
            content = response.read()

        feed = feedparser.parse(content)
        for entry in feed.entries[:limit]:
            title = entry.get("title", "").strip()
            # 移除常見新聞來源後綴以保持簡潔（例如 " - Yahoo Finance"）
            cleaned_title = re.sub(r"\s+-\s+[^-]+$", "", title)
            link = entry.get("link", "").strip()
            if title and link:
                news_list.append({"title": cleaned_title or title, "url": link})

        logger.info(f"📰 {symbol} ({name}): 抓取到 {len(news_list)} 則最新相關新聞")
    except Exception as e:
        logger.warning(f"⚠️ 抓取 {symbol} 新聞 RSS 失敗: {e}")

    return news_list


# ----------------------------------------------------------------------
# Gemini AI 歸納分析 (使用 google-genai SDK)
# ----------------------------------------------------------------------
def analyze_stock_story(
    symbol: str,
    name: str,
    market: str,
    close_price: float,
    change_percent: float,
    news_list: List[Dict[str, str]],
    api_key: str,
    model_name: str,
) -> Dict[str, Any]:
    """
    使用 google-genai 呼叫 Gemini 模型，輸出嚴格 JSON 格式的情緒標籤、核心一句話與 3 點重點。
    """
    if genai is None or types is None:
        raise RuntimeError("未安裝 google-genai 套件，請執行 pip install google-genai")

    client = genai.Client(api_key=api_key)

    news_context = "\n".join([f"- {n['title']}" for n in news_list]) if news_list else "無近期新聞"
    trend_str = f"上漲 {change_percent}%" if change_percent > 0 else (f"下跌 {abs(change_percent)}%" if change_percent < 0 else "平盤 0.0%")

    prompt = f"""你是一位資深全球財經與股票市場分析師。請根據以下股票收盤資訊與相關最新新聞，歸納出今天的收盤重點故事。

【股票資訊】
- 代號：{symbol}
- 名稱：{name}
- 市場：{market}
- 最新收盤價：{close_price}
- 當日漲跌幅：{trend_str} ({change_percent}%)

【最新相關新聞標題】
{news_context}

【分析任務與格式規範】
請以繁體中文（台灣習慣用語）輸出嚴格的 JSON 格式，包含以下三個欄位：
1. "sentiment": 僅限填入 "利多"、"利空" 或 "中性" 之一。
2. "headline": 25 字以內的一句話核心原因，直指今日股價走勢最關鍵催化劑（切勿廢話或長篇大論）。
3. "story_bullets": 剛好 3 點繁體中文重點列表，每點一句話，3 點總字數嚴格控制在 120 字以內，總結驅動因素、市場氛圍或後續關注點。

請直接回傳合法的 JSON 字串，不要包含任何開頭結尾的 markdown 語法或額外文字。
JSON 格式範例：
{{
  "sentiment": "利多",
  "headline": "輝達獲外資上調目標價，AI伺服器需求強勁帶動大漲",
  "story_bullets": [
    "外資券商看好次世代晶片出貨量，全面調升評等與獲利預估。",
    "大型科技股財報釋出資本支出擴大訊號，激勵半導體族群買盤。",
    "今日成交量顯著放大，突破近期盤整區間展現強勢多頭格局。"
  ]
}}
"""

    models_to_try = [model_name]
    if model_name != "gemini-3.5-flash-lite":
        models_to_try.append("gemini-3.5-flash-lite")

    last_error = None
    for current_model in models_to_try:
        try:
            config = types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.2,
            )
            response = client.models.generate_content(
                model=current_model,
                contents=prompt,
                config=config,
            )

            response_text = response.text.strip()
            # 優先搜尋最外層的 JSON 物件，安全過濾前後說明文字與 markdown 標記
            json_match = re.search(r"\{.*\}", response_text, re.DOTALL)
            if json_match:
                clean_json_str = json_match.group(0).strip()
            else:
                clean_json_str = re.sub(r"^```(?:json)?\s*", "", response_text, flags=re.MULTILINE)
                clean_json_str = re.sub(r"```$", "", clean_json_str, flags=re.MULTILINE).strip()

            data = json.loads(clean_json_str)

            sentiment = data.get("sentiment", "中性")
            if sentiment not in ["利多", "利空", "中性"]:
                sentiment = "利多" if change_percent > 0 else ("利空" if change_percent < 0 else "中性")

            headline = data.get("headline", f"{name} 收盤走勢整理")[:30]
            story_bullets = data.get("story_bullets", [])
            if not isinstance(story_bullets, list) or len(story_bullets) == 0:
                story_bullets = [
                    f"{name} 當日收盤價 {close_price}，漲跌幅 {change_percent}%。",
                    "市場關注後續財報表現與產業總體經濟環境變化。",
                    "建議持續留意成交量能變化與技術線型支撐壓力。",
                ]

            return {
                "sentiment": sentiment,
                "headline": headline,
                "story_bullets": story_bullets[:3],
            }
        except Exception as e:
            last_error = e
            logger.warning(f"⚠️ Gemini 模型 ({current_model}) 呼叫失敗: {e}，嘗試備用方案...")

    logger.error(f"❌ Gemini AI 分析 {symbol} 最終失敗: {last_error}")
    # Fallback 智慧規則生成（若有新聞，直接萃取最新新聞作為快訊與重點）
    sentiment = "利多" if change_percent > 0.5 else ("利空" if change_percent < -0.5 else "中性")
    trend_str = f"上漲 {change_percent}%" if change_percent > 0 else (f"下跌 {abs(change_percent)}%" if change_percent < 0 else "平盤 0.0%")
    
    if news_list and len(news_list) > 0:
        headline = news_list[0]["title"][:28]
        story_bullets = [n["title"] for n in news_list[:3]]
        while len(story_bullets) < 3:
            story_bullets.append(f"{name} 今日{trend_str}，收盤價報 {close_price}。")
    else:
        headline = f"{name} 今日{trend_str}，收在 {close_price}"
        story_bullets = [
            f"{name} ({symbol}) 當日收盤報 {close_price}，漲跌幅 {change_percent}%。",
            "當前主要受總體市場盤勢波動及相關族群輪動影響。",
            "建議持續追蹤後續即時新聞與技術線型支撐壓力。",
        ]

    return {
        "sentiment": sentiment,
        "headline": headline,
        "story_bullets": story_bullets[:3],
    }


# ----------------------------------------------------------------------
# 核心大盤指數與基準標的（確保排程每日必爬，不依賴個人自選股清單是否有追蹤）
# ----------------------------------------------------------------------
DEFAULT_MARKET_INDEXES: Dict[str, List[Dict[str, Any]]] = {
    "US": [
        {"symbol": "^GSPC", "name": "標普 500 指數", "market": "US"},
        {"symbol": "^IXIC", "name": "那斯達克綜合指數", "market": "US"},
        {"symbol": "^DJI", "name": "道瓊工業指數", "market": "US"},
        {"symbol": "SOXX", "name": "費城半導體 ETF", "market": "US"},
    ],
    "TW": [
        {"symbol": "^TWII", "name": "台灣加權指數", "market": "TW"},
        {"symbol": "0050.TW", "name": "元大台灣50", "market": "TW"},
    ],
}


# ----------------------------------------------------------------------
# 主執行流程
# ----------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(description="每日美股／台股收盤漲跌故事爬蟲與 AI 分析工具")
    parser.add_argument(
        "--market",
        type=str,
        choices=["US", "TW"],
        default=None,
        help="指定執行市場：US (美股) 或 TW (台股)。若不指定則兩個市場皆執行。",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="限制每個市場處理的股票數量（測試用，例如 --limit 2 只跑前 2 檔）",
    )
    args = parser.parse_args()

    logger.info("🚀 啟動每日收盤漲跌故事爬蟲與分析程序...")
    configs = get_env_configs()

    # 初始化 Supabase
    supabase_client = init_supabase(configs["supabase_url"], configs["supabase_key"])

    markets_to_run = [args.market] if args.market else ["US", "TW"]

    total_processed = 0
    total_succeeded = 0

    for m in markets_to_run:
        logger.info(f"\n==========================================")
        logger.info(f"📊 開始處理市場：{m}")
        logger.info(f"==========================================")

        # 1. 取得該市場的固定大盤指數（永遠獨立更新）
        market_indexes = DEFAULT_MARKET_INDEXES.get(m, [])

        # 2. 取得使用者自選股（經 SERVICE_ROLE 穿透 RLS 撈取全體去重標的）
        user_stocks = fetch_watchlist(supabase_client, market=m)

        # 3. 合併大盤指數與自選股，並依 symbol 去重（大盤指數置前）
        stocks = []
        seen_syms = set()
        for idx_item in market_indexes:
            sym = idx_item["symbol"].upper()
            if sym not in seen_syms:
                seen_syms.add(sym)
                stocks.append(idx_item)

        for u_item in user_stocks:
            sym = (u_item.get("symbol") or "").upper()
            if sym and sym not in seen_syms:
                seen_syms.add(sym)
                stocks.append(u_item)

        if not stocks:
            logger.warning(f"⚠️ 在市場 {m} 中無任何大盤指數或自選股可處理。")
            continue

        if args.limit and args.limit > 0:
            stocks = stocks[: args.limit]
            logger.info(f"🧪 測試模式啟動：僅選取前 {len(stocks)} 檔股票進行處理")

        for idx, stock in enumerate(stocks, 1):
            try:
                symbol = stock.get("symbol", "")
                name = stock.get("name", symbol)
                market_type = stock.get("market", m)
                if not symbol:
                    logger.warning(f"⏩ 跳過第 {idx} 筆：無效的股票代號")
                    continue

                logger.info(f"\n[{idx}/{len(stocks)}] 正在處理: {symbol} ({name}) - {market_type}...")

                total_processed += 1

                # 1. 抓取收盤價與計算漲跌幅
                price_info = fetch_stock_price(symbol)
                if not price_info:
                    logger.warning(f"⏩ 跳過 {symbol}：無法取得足夠的行情數據")
                    continue

                report_date = price_info["report_date"]
                close_price = price_info["close_price"]
                change_percent = price_info["change_percent"]
                logger.info(
                    f"📈 {symbol} 最新收盤日: {report_date}, 價格: {close_price}, 漲跌幅: {change_percent}%"
                )

                # 2. 抓取相關新聞
                news_items = fetch_google_news(symbol, name, market_type, limit=6)

                # 3. 呼叫 Gemini AI 進行新聞摘要與歸納
                logger.info(f"🤖 正在呼叫 Gemini 模型 ({configs['gemini_model']}) 進行 AI 漲跌故事分析...")
                ai_analysis = analyze_stock_story(
                    symbol=symbol,
                    name=name,
                    market=market_type,
                    close_price=close_price,
                    change_percent=change_percent,
                    news_list=news_items,
                    api_key=configs["gemini_api_key"],
                    model_name=configs["gemini_model"],
                )

                # 4. 組裝資料並 Upsert 到 Supabase
                report_record = {
                    "report_date": report_date,
                    "market": market_type,
                    "symbol": symbol,
                    "name": name,
                    "close_price": close_price,
                    "change_percent": change_percent,
                    "sentiment": ai_analysis["sentiment"],
                    "headline": ai_analysis["headline"],
                    "story_bullets": ai_analysis["story_bullets"],
                    "news_links": news_items,
                }

                success = upsert_daily_report(supabase_client, report_record)
                if success:
                    total_succeeded += 1

                # 延遲 4 秒保護 Gemini 免費版 15 RPM 限制
                time.sleep(4)
            except Exception as stock_err:
                logger.error(f"❌ 處理 {stock.get('symbol', '未知標的')} 時發生未預期例外: {stock_err}，已隔離跳過，不影響其他股票")
                time.sleep(2)
                continue

    logger.info(f"\n==========================================")
    logger.info(
        f"🎉 處理完畢！總共處理 {total_processed} 檔，成功寫入 {total_succeeded} 檔報告。"
    )
    logger.info(f"==========================================")


if __name__ == "__main__":
    main()
