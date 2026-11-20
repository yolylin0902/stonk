import { createClient } from '@supabase/supabase-js'

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL || 'https://rzqzucggsvxannhlffmg.supabase.co'
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'sb_publishable_hj1sF1pKIKrG4VH4W7XgQw_vCu4IiRL'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
