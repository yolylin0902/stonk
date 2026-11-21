#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
即時監聽與自動同步自選股腳本 (auto_sync_watchlist.py)
--------------------------------------------------
功能：
1. 輪詢 Supabase 的 watchlist 清單，檢查在最新日期 (或今日) 尚未有報告之新自選股。
2. 兩階段極速寫入 (Two-Phase Upsert)：
   - 第一階段 (1~2 秒內)：立即寫入股價與漲跌幅，前端在第一個輪詢週期即可看見真實行情脫離等待。
   - 第二階段 (背景補完)：抓取最新 Google News 並呼叫 Gemini AI 產出收盤分析報告補齊。
3. 全市場容錯：台股 .TW 自動回退 .TWO、無效代號自動寫入防呆卡片不卡死。
"""

import os
import sys
import time
import logging
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv

current_dir = Path(__file__).resolve().parent
project_root = current_dir.parent
for env_file in [project_root / ".env.local", project_root / ".env", current_dir / ".env"]:
    if env_file.exists():
        load_dotenv(dotenv_path=env_file)
        break

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("AutoSync")

from supabase import create_client
from fetch_and_analyze import (
    get_env_configs,
    fetch_stock_price,
    fetch_google_news,
    analyze_stock_story,
    upsert_daily_report,
    enrich_stock_name,
)

def process_single_stock(sb, item, configs, latest_date_by_market):
    symbol = item["symbol"]
    name = item["name"]
    market = item.get("market", "US")
    market_latest_date = latest_date_by_market.get(market) or datetime.now().strftime("%Y-%m-%d")

    logger.info(f"⚡ 正在即時處理新自選股: {symbol} ({name}) - {market} (對齊日期: {market_latest_date})...")

    price_info = fetch_stock_price(symbol)
    if not price_info:
        logger.warning(f"⚠️ {symbol}: 無法獲取即時股價，寫入防呆說明報告脫離等待")
        fallback_record = {
            "report_date": market_latest_date,
            "market": market,
            "symbol": symbol,
            "name": name,
            "close_price": None,
            "change_percent": 0.0,
            "sentiment": "中性",
            "headline": "查無報價（請確認股票代號是否正確）",
            "story_bullets": [
                "Yahoo Finance 目前查無此代號之即時或收盤行情數據。",
                "請確認代號拼寫或市場類別（如台股上櫃代號為 .TWO）。",
                "若為無效標的，可點擊卡片右上角按鈕將其自自選移除。"
            ],
            "news_links": [],
        }
        upsert_daily_report(sb, fallback_record)
        return True

    resolved_sym = price_info.get("resolved_symbol", symbol)
    enriched_name = enrich_stock_name(symbol, name, resolved_sym)
    if enriched_name and enriched_name != name:
        name = enriched_name
        try:
            sb.table("watchlist").update({"name": name}).eq("symbol", symbol).execute()
        except Exception:
            pass

    # 若自動回退解析出更精準的後綴（例如 8069.TWO 代替 8069.TW），同步更新 watchlist
    if resolved_sym != symbol:
        try:
            sb.table("watchlist").update({"symbol": resolved_sym, "name": name}).eq("symbol", symbol).execute()
            logger.info(f"🔄 已將 watchlist 中 {symbol} 更新為精確代號: {resolved_sym}")
        except Exception as upd_err:
            logger.debug(f"更新 watchlist symbol 略過: {upd_err}")

    # 確保寫入日期與市場最新檢視日期對齊
    report_date = market_latest_date
    close_price = price_info["close_price"]
    change_percent = price_info["change_percent"]

    # ── 【第一階段：秒速報價寫入 (1~2 秒)】──
    # 立即寫入行情，讓前端在第一個輪詢週期即可看見真實股價並解除 pending
    phase1_record = {
        "report_date": report_date,
        "market": market,
        "symbol": symbol,
        "name": name,
        "close_price": close_price,
        "change_percent": change_percent,
        "sentiment": "中性",
        "headline": "已同步最新報價，AI 新聞分析整理中...",
        "story_bullets": [
            "最新盤中交易行情已即時同步更新。",
            "相關關鍵催化新聞與 AI 分析正在背景整理歸納中..."
        ],
        "news_links": [],
    }
    upsert_daily_report(sb, phase1_record)
    # 若 resolved_sym 不同，兩者皆寫入確保前端無縫讀取
    if resolved_sym != symbol:
        phase1_record_alt = dict(phase1_record)
        phase1_record_alt["symbol"] = resolved_sym
        upsert_daily_report(sb, phase1_record_alt)

    logger.info(f"⚡ [階段一] 秒速報價已寫入: {symbol} - 價格: {close_price}, 漲跌: {change_percent}%")

    # ── 【第二階段：背景補完新聞與 AI 分析】──
    news_list = fetch_google_news(symbol, name, market, limit=6)
    story = {}
    if news_list:
        try:
            story = analyze_stock_story(
                symbol=symbol,
                name=name,
                market=market,
                close_price=close_price,
                change_percent=change_percent,
                news_list=news_list,
                api_key=configs["gemini_api_key"],
                model_name=configs["gemini_model"],
            )
        except Exception as ai_err:
            logger.warning(f"⚠️ {symbol} AI 分析略過: {ai_err}")

    headline = story.get("headline") or "盤中即時報價，收盤後自動更新完整新聞摘要"
    story_bullets = story.get("story_bullets") or [
        "最新盤中交易行情已即時同步更新。",
        "關鍵催化新聞與 AI 收盤分析將於收盤後自動彙整。"
    ]
    sentiment = story.get("sentiment", "中性")

    phase2_record = {
        "report_date": report_date,
        "market": market,
        "symbol": symbol,
        "name": name,
        "close_price": close_price,
        "change_percent": change_percent,
        "sentiment": sentiment,
        "headline": headline,
        "story_bullets": story_bullets,
        "news_links": news_list,
    }

    ok = upsert_daily_report(sb, phase2_record)
    if resolved_sym != symbol:
        phase2_record_alt = dict(phase2_record)
        phase2_record_alt["symbol"] = resolved_sym
        upsert_daily_report(sb, phase2_record_alt)

    if ok:
        logger.info(f"🎉 [階段二] 完整 AI 分析報告已補齊: {symbol} ({name})")
    return ok

def main_loop(poll_interval: int = 6, single_run: bool = False):
    configs = get_env_configs()
    sb = create_client(configs["supabase_url"], configs["supabase_key"])
    logger.info("🚀 啟動自選股即時監聽同步守護程序 (兩階段極速寫入模式)...")

    while True:
        try:
            # 1. 查詢各市場在 daily_reports 中的最新 report_date
            latest_date_by_market = {}
            for m in ["US", "TW"]:
                try:
                    res = (
                        sb.table("daily_reports")
                        .select("report_date")
                        .eq("market", m)
                        .order("report_date", ascending=False)
                        .limit(1)
                        .execute()
                    )
                    if res.data and len(res.data) > 0:
                        latest_date_by_market[m] = res.data[0]["report_date"]
                    else:
                        latest_date_by_market[m] = datetime.now().strftime("%Y-%m-%d")
                except Exception as e:
                    latest_date_by_market[m] = datetime.now().strftime("%Y-%m-%d")

            # 2. 撈取 watchlist
            w_res = sb.table("watchlist").select("*").execute()
            watchlist = w_res.data or []

            # 3. 查詢各市場最新日期中已完成的 symbols
            existing_today_symbols = set()
            for m, l_date in latest_date_by_market.items():
                try:
                    d_res = (
                        sb.table("daily_reports")
                        .select("symbol")
                        .eq("market", m)
                        .eq("report_date", l_date)
                        .limit(1000)
                        .execute()
                    )
                    if d_res.data:
                        for r in d_res.data:
                            existing_today_symbols.add(r["symbol"].strip().upper())
                except Exception as e:
                    logger.debug(f"查詢 {m} 現有標的略過: {e}")

            # 4. 找出尚未產出最新報告的標的（依 symbol 去重避免重複分析）
            missing = []
            seen_missing = set()
            for w in watchlist:
                sym = (w.get("symbol") or "").strip().upper()
                if sym and sym not in existing_today_symbols and sym not in seen_missing:
                    seen_missing.add(sym)
                    missing.append(w)

            if missing:
                logger.info(f"🔍 偵測到 {len(missing)} 檔新加入且最新日期尚未有報告之個股: {[m['symbol'] for m in missing]}")
                for item in missing:
                    try:
                        process_single_stock(sb, item, configs, latest_date_by_market)
                        time.sleep(1)
                    except Exception as err:
                        logger.error(f"❌ 處理 {item.get('symbol')} 時發生錯誤: {err}")

            if single_run:
                break

        except Exception as e:
            logger.error(f"⚠️ 監聽輪詢異常: {e}")

        time.sleep(poll_interval)

if __name__ == "__main__":
    single = "--once" in sys.argv
    main_loop(poll_interval=6, single_run=single)
