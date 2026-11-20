import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('⚠️ Supabase URL 或 ANON KEY 尚未設定，請檢查 .env.local 或 Vercel 環境變數。')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
