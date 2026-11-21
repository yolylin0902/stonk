-- ================================================================
-- 每日收盤行情分析儀表板 (Stock Story Dashboard)
-- 帳號與權限架構升級腳本 (v2.0: 個人獨立持股 + Supabase Auth RLS)
-- 請複製以下整段 SQL 貼進 Supabase Dashboard 的 SQL Editor 執行
-- ================================================================

-- 1. 擴充 watchlist 資料表，綁定 Supabase Auth 使用者
ALTER TABLE public.watchlist 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- 2. 清除舊版未綁定使用者的歷史無主測試資料
DELETE FROM public.watchlist WHERE user_id IS NULL;

-- 3. 將 user_id 設為必填 (NOT NULL)
ALTER TABLE public.watchlist 
ALTER COLUMN user_id SET NOT NULL;

-- 4. 移除舊版單一股票代號唯一約束 (原本每檔股票全站只能有一筆)
ALTER TABLE public.watchlist 
DROP CONSTRAINT IF EXISTS watchlist_symbol_key;

-- 5. 新增 (user_id, symbol) 複合唯一約束，讓不同使用者可各自追蹤同一檔股票
ALTER TABLE public.watchlist 
DROP CONSTRAINT IF EXISTS watchlist_user_symbol_unique;

ALTER TABLE public.watchlist 
ADD CONSTRAINT watchlist_user_symbol_unique UNIQUE (user_id, symbol);

-- 6. 為 user_id 建立查詢索引以最佳化查詢效能
CREATE INDEX IF NOT EXISTS idx_watchlist_user_id ON public.watchlist(user_id);

-- ================================================================
-- 權限控制 (Row Level Security - RLS)
-- ================================================================

-- 7. 開啟 watchlist 資料表的 RLS
ALTER TABLE public.watchlist ENABLE ROW LEVEL SECURITY;

-- 刪除舊政策以防重複執行報錯
DROP POLICY IF EXISTS "Users can manage their own watchlist" ON public.watchlist;
DROP POLICY IF EXISTS "Allow individual user select" ON public.watchlist;
DROP POLICY IF EXISTS "Allow individual user insert" ON public.watchlist;
DROP POLICY IF EXISTS "Allow individual user update" ON public.watchlist;
DROP POLICY IF EXISTS "Allow individual user delete" ON public.watchlist;

-- 建立嚴格個人隔離政策：已登入使用者僅能管理自己的自選股 (SELECT, INSERT, UPDATE, DELETE)
CREATE POLICY "Users can manage their own watchlist" 
ON public.watchlist 
FOR ALL 
TO authenticated 
USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() = user_id);

-- 8. 開啟 daily_reports 資料表的 RLS
ALTER TABLE public.daily_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated read daily_reports" ON public.daily_reports;
DROP POLICY IF EXISTS "Allow anon read daily_reports" ON public.daily_reports;

-- 建立每日分析報告讀取政策：允許所有已登入 (authenticated) 使用者讀取
CREATE POLICY "Allow authenticated read daily_reports" 
ON public.daily_reports 
FOR SELECT 
TO authenticated 
USING (true);

-- 9. 授予 service_role 完整存取權限 (後端 Python 爬蟲專用，自動穿透 RLS)
GRANT ALL ON TABLE public.watchlist TO service_role;
GRANT ALL ON TABLE public.daily_reports TO service_role;
GRANT USAGE ON SCHEMA public TO service_role;
