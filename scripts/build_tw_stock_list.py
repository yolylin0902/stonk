#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
全台灣上市＋上櫃完整標的清單建置腳本 (build_tw_stock_list.py)
-------------------------------------------------------
從證交所（TWSE OpenAPI）與櫃買中心（TPEX OpenAPI）取得全台上市與上櫃股票/ETF清單，
並自動標註正確的 Yahoo Finance 後綴（.TW 或 .TWO），產出精簡靜態檔 src/data/twStocks.json。
"""

import json
import logging
import os
import re
import urllib.request
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("BuildTWStockList")

def main():
    root_dir = Path(__file__).resolve().parent.parent
    output_dir = root_dir / "src" / "data"
    output_dir.mkdir(parents=True, exist_ok=True)
    output_file = output_dir / "twStocks.json"

    tw_stocks = {}

    # 1. 抓取台灣證券交易所 (TWSE) 上市標的
    logger.info("📡 正在向證交所 (TWSE) 撈取上市標的清單...")
    try:
        twse_url = "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL"
        req = urllib.request.Request(twse_url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            twse_raw = json.loads(resp.read().decode("utf-8"))

        for item in twse_raw:
            code = item.get("Code", "").strip()
            name = item.get("Name", "").strip()
            if not code or not name:
                continue
            # 排除一般認購/認售權證 (通常為 6 碼且以 03~08 開頭)
            if re.match(r"^0[3-8]\d{4}$", code):
                continue

            tw_stocks[code] = {
                "symbol": f"{code}.TW",
                "name": name,
                "code": code,
                "market": "TW",
                "type": "TWSE"
            }
        logger.info(f"✅ TWSE 上市標的載入完成：共 {len(tw_stocks)} 檔")
    except Exception as e:
        logger.error(f"❌ 撈取 TWSE 上市標的失敗: {e}")

    # 2. 抓取證券櫃檯買賣中心 (TPEX) 上櫃標的
    logger.info("📡 正在向櫃買中心 (TPEX) 撈取上櫃標的清單...")
    try:
        tpex_url = "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes"
        req = urllib.request.Request(tpex_url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            tpex_raw = json.loads(resp.read().decode("utf-8"))

        tpex_count = 0
        for item in tpex_raw:
            code = item.get("SecuritiesCompanyCode", "").strip()
            name = item.get("CompanyName", "").strip()
            if not code or not name:
                continue
            # 排除上櫃權證 (通常以 7 開頭之 6 碼)
            if re.match(r"^7\d{5}$", code):
                continue

            if code not in tw_stocks:
                tw_stocks[code] = {
                    "symbol": f"{code}.TWO",
                    "name": name,
                    "code": code,
                    "market": "TW",
                    "type": "TPEX"
                }
                tpex_count += 1
        logger.info(f"✅ TPEX 上櫃標的載入完成：共新增 {tpex_count} 檔")
    except Exception as e:
        logger.error(f"❌ 撈取 TPEX 上櫃標的失敗: {e}")

    # 3. 補充重要的大盤與核心指數標的
    critical_indexes = {
        "^TWII": {"symbol": "^TWII", "name": "台灣加權指數", "code": "^TWII", "market": "TW", "type": "INDEX"},
        "^TWOII": {"symbol": "^TWOII", "name": "櫃買指數", "code": "^TWOII", "market": "TW", "type": "INDEX"},
    }
    for k, v in critical_indexes.items():
        tw_stocks[k] = v

    # 4. 寫入 json
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(tw_stocks, f, ensure_ascii=False, indent=2)

    logger.info(f"🎉 產出完成！總計收錄 {len(tw_stocks)} 檔台股上市/上櫃與指數標的 -> {output_file}")

if __name__ == "__main__":
    main()
