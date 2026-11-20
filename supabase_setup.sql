-- ================================================================
-- 每日美股／台股收盤漲跌故事儀表板 (Stock Story Dashboard)
-- Supabase 初始化 SQL 腳本
-- 請在 Supabase Dashboard 的 SQL Editor 中貼上並執行此檔案內容
-- ================================================================

-- 1. 建立自選股清單資料表 (watchlist)
CREATE TABLE IF NOT EXISTS watchlist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    symbol TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    market TEXT NOT NULL CHECK (market IN ('US', 'TW')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2. 插入預設美股與台股自選股（若已存在則忽略）
INSERT INTO watchlist (symbol, name, market) VALUES
    -- 美股 (US)
    ('AAPL', '蘋果', 'US'),
    ('MSFT', '微軟', 'US'),
    ('GOOGL', 'Alphabet', 'US'),
    ('AMZN', '亞馬遜', 'US'),
    ('NVDA', '輝達', 'US'),
    ('META', 'Meta', 'US'),
    ('TSLA', '特斯拉', 'US'),
    ('AMD', '超微', 'US'),
    -- 台股 (TW)
    ('2330.TW', '台積電', 'TW'),
    ('2454.TW', '聯發科', 'TW'),
    ('3711.TW', '日月光投控', 'TW'),
    ('0050.TW', '元大台灣50', 'TW')
ON CONFLICT (symbol) DO NOTHING;

-- 3. 建立每日個股收盤與 AI 分析報告表 (daily_reports)
CREATE TABLE IF NOT EXISTS daily_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_date DATE NOT NULL,
    market TEXT NOT NULL CHECK (market IN ('US', 'TW')),
    symbol TEXT NOT NULL,
    name TEXT NOT NULL,
    close_price NUMERIC(12, 2) NOT NULL,
    change_percent NUMERIC(8, 2) NOT NULL,
    sentiment TEXT NOT NULL,
    headline TEXT NOT NULL,
    story_bullets JSONB NOT NULL DEFAULT '[]'::jsonb,
    news_links JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT daily_reports_date_symbol_key UNIQUE (report_date, symbol)
);

-- 4. 建立常用查詢索引（加速按日期與市場撈取資料）
CREATE INDEX IF NOT EXISTS idx_daily_reports_date_market ON daily_reports (report_date DESC, market);
CREATE INDEX IF NOT EXISTS idx_daily_reports_symbol ON daily_reports (symbol);

-- 5. 權限設定（個人自用專案，關閉 RLS 並授予 anon/authenticated 完整權限，確保前端直連與後端寫入順暢）
ALTER TABLE watchlist DISABLE ROW LEVEL SECURITY;
ALTER TABLE daily_reports DISABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.watchlist TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.daily_reports TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;

