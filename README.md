# 每日美股／台股收盤漲跌故事儀表板 (Stock Story Dashboard)

專為手機優先（Mobile-First）設計的現代化深色金融科技（FinTech）PWA 儀表板，支援美股與台股每日盤後自動抓取行情、新聞 RSS，並透過 Google Gemini AI 歸納 25 字以內核心原因與 3 點重點故事。配合 GitHub Actions 與 Vercel 達成完全雲端自動化運作。

![Tech Stack](https://img.shields.io/badge/Stack-Vite%20%7C%20React%20%7C%20TailwindCSS%20%7C%20Supabase-blue)
![Python](https://img.shields.io/badge/Python-3.11+-brightgreen)
![Gemini](https://img.shields.io/badge/AI-Gemini%203.5%20Flash-orange)

---

## 📱 核心特色

1. **手機優先響應式與 PWA：**
   - 專為 iPhone 等行動裝置單手滑動體驗最佳化。
   - 支援 Safari「加入主畫面」獨立 App 模式（PWA）。
2. **美股／台股客製化行情色彩：**
   - 🇺🇸 **美股**：綠漲紅跌（遵循美股慣例）。
   - 🇹🇼 **台股**：紅漲綠跌（遵循台股慣例）。
3. **AI 智慧收盤快訊：**
   - 自動過濾雜訊，生成 25 字內關鍵漲跌原因。
   - 條列 3 點精準繁體中文分析，並附帶最新新聞來源連結。
4. **自選股即時管理：**
   - 支援直接在網頁端新增／移除美股與台股追蹤標的。
5. **完全雲端自動化（零伺服器維護）：**
   - 前端部署於 **Vercel**（零配置快速發布）。
   - 後端爬蟲排程託管於 **GitHub Actions**（定時自動更新）。
   - 資料庫採用 **Supabase**（PostgreSQL 雲端直連）。

---

## ⚙️ 雲端自動化設定步驟

### 1. Supabase 資料庫設定
在 Supabase 專案的 **SQL Editor** 中執行根目錄的 [`supabase_setup.sql`](./supabase_setup.sql)，即會自動建立 `watchlist` 與 `daily_reports` 表、預設初始股票並配置讀寫權限。

### 2. GitHub Actions Secrets 設定
請進入您的 GitHub 倉庫：`Settings` -> `Secrets and variables` -> `Actions` -> `New repository secret`，新增以下 4 個 Secrets：

| Secret 名稱 | 內容說明 | 範例值 |
| :--- | :--- | :--- |
| `SUPABASE_URL` | Supabase 專案網址 | `https://xxxx.supabase.co` |
| `SUPABASE_KEY` | Supabase anon key 或 service role key | `sb_publishable_...` |
| `GEMINI_API_KEY` | Google AI Studio 金鑰 | `AIzaSy...` |
| `GEMINI_MODEL` | 使用的模型名稱（可選） | `gemini-3.5-flash` |

排程執行時間（UTC）：
- **美股盤後**：台灣時間週二至週六 05:35 (`cron: '35 21 * * 1-5'`)
- **台股盤後**：台灣時間週一至週五 14:05 (`cron: '5 6 * * 1-5'`)

### 3. Vercel 部署設定
1. 在 [Vercel](https://vercel.com) 點擊 **Add New Project**，匯入此 GitHub 倉庫。
2. Framework Preset 選擇 **Vite**。
3. 在 **Environment Variables** 新增：
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. 點擊 **Deploy** 即可完成部署！

---

## 💻 本地端開發指南

### 前端啟動
```bash
# 安裝相依套件
npm install

# 啟動開發伺服器
npm run dev

# 生產環境打包測試
npm run build
```

### 後端爬蟲手動執行
```bash
# 建立虛擬環境並安裝相依
python3 -m venv venv
source venv/bin/activate
pip install -r scripts/requirements.txt

# 執行測試（前 2 檔）
python scripts/fetch_and_analyze.py --market US --limit 2
python scripts/fetch_and_analyze.py --market TW --limit 2

# 執行完整爬蟲
python scripts/fetch_and_analyze.py
```
