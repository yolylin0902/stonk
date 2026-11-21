#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
即時監聽與自動同步自選股腳本 (auto_sync_watchlist.py)
--------------------------------------------------
功能：
1. 輪詢 Supabase 的 watchlist 清單。
2. 比對 daily_reports，一旦發現使用者新加入自選股（如 2303.TW, TSLA, 星宇航空 等），
   立即自動抓取股價、最新新聞並透過 Gemini AI 產出收盤分析報告寫入 daily_reports。
3. 確保使用者在前端無論搜尋與加入任何冷熱門股票，都能在數十秒內自動產出完整卡片。
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

def process_single_stock(sb, item, configs):
    symbol = item["symbol"]
    name = item["name"]
    market = item.get("market", "US")

    logger.info(f"⚡ 正在即時處理新自選股: {symbol} ({name}) - {market}...")

    price_info = fetch_stock_price(symbol)
    if not price_info:
        logger.warning(f"⚠️ {symbol}: 無法獲取即時股價，寫入防呆說明報告脫離等待")
        fallback_record = {
            "report_date": datetime.now().strftime("%Y-%m-%d"),
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

    report_date = price_info["report_date"]
    close_price = price_info["close_price"]
    change_percent = price_info["change_percent"]

    # 抓取新聞
    news_list = fetch_google_news(symbol, name, market, limit=6)

    # AI 歸納分析
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

    report_data = {
        "report_date": report_date,
        "market": market,
        "symbol": symbol,
        "name": name,
        "close_price": close_price,
        "change_percent": change_percent,
        "sentiment": story.get("sentiment", "中性"),
        "headline": story.get("headline", ""),
        "story_bullets": story.get("story_bullets", []),
        "news_links": news_list,
    }

    ok = upsert_daily_report(sb, report_data)
    if ok:
        logger.info(f"🎉 成功完成新個股分析並儲存: {symbol} ({name}) - 價格: {close_price}, 漲跌: {change_percent}%")
    return ok

def main_loop(poll_interval: int = 8, single_run: bool = False):
    configs = get_env_configs()
    sb = create_client(configs["supabase_url"], configs["supabase_key"])
    logger.info("🚀 啟動自選股即時監聽同步守護程序...")

    while True:
        try:
            # 撈取 watchlist
            w_res = sb.table("watchlist").select("*").execute()
            watchlist = w_res.data or []

            # 撈取 daily_reports 中所有 symbol
            d_res = sb.table("daily_reports").select("symbol, report_date").execute()
            existing_symbols = set(r["symbol"] for r in (d_res.data or []))

            # 找出尚未產出 daily_reports 的標的（依 symbol 去重避免重複分析）
            missing = []
            seen_missing = set()
            for w in watchlist:
                sym = (w.get("symbol") or "").strip().upper()
                if sym and sym not in existing_symbols and sym not in seen_missing:
                    seen_missing.add(sym)
                    missing.append(w)

            if missing:
                logger.info(f"🔍 偵測到 {len(missing)} 檔新加入且尚未分析之個股: {[m['symbol'] for m in missing]}")
                for item in missing:
                    try:
                        process_single_stock(sb, item, configs)
                        # 短暫停頓避免觸發過快請求
                        time.sleep(2)
                    except Exception as err:
                        logger.error(f"❌ 處理 {item.get('symbol')} 時發生錯誤: {err}")
            
            if single_run:
                break

        except Exception as e:
            logger.error(f"⚠️ 監聽輪詢異常: {e}")

        time.sleep(poll_interval)

if __name__ == "__main__":
    single = "--once" in sys.argv
    main_loop(poll_interval=8, single_run=single)
