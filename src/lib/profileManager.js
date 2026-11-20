// Netflix 家庭方案預設成員與頭像配置
export const DEFAULT_PROFILES = [
  {
    id: 'steve',
    name: 'Steve',
    avatar: '😎',
    color: 'from-blue-600 to-indigo-600',
    title: '帶頭大哥 / 當沖舵手',
    holdings: ['NVDA', 'AAPL', 'TSLA', '2330.TW']
  },
  {
    id: 'albert',
    name: '韭菜小明',
    avatar: '🤡',
    color: 'from-rose-600 to-orange-600',
    title: '公園預備隊員 / 本多終勝',
    holdings: ['AMD', '0050.TW', 'TSLA']
  },
  {
    id: 'kevin',
    name: '抄底阿豪',
    avatar: '🦁',
    color: 'from-emerald-600 to-teal-600',
    title: '鑽石手 / 永不認賠',
    holdings: ['GOOGL', 'MSFT', '2454.TW']
  },
  {
    id: 'guest',
    name: '路過散戶',
    avatar: '🐱',
    color: 'from-purple-600 to-pink-600',
    title: '定期定額佛系看盤',
    holdings: ['AMZN', '3711.TW', '0050.TW']
  }
]

const STORAGE_KEY_PROFILES = 'stonk_family_profiles'
const STORAGE_KEY_CURRENT = 'stonk_active_profile_id'

export function getStoredProfiles() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PROFILES)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
  } catch (e) {
    console.warn('讀取家庭成員失敗，使用預設成員:', e)
  }
  return DEFAULT_PROFILES
}

export function saveStoredProfiles(profiles) {
  try {
    localStorage.setItem(STORAGE_KEY_PROFILES, JSON.stringify(profiles))
  } catch (e) {
    console.error('儲存家庭成員失敗:', e)
  }
}

export function getActiveProfileId() {
  try {
    const active = localStorage.getItem(STORAGE_KEY_CURRENT)
    if (active) return active
  } catch {}
  return DEFAULT_PROFILES[0].id
}

export function setActiveProfileId(id) {
  try {
    localStorage.setItem(STORAGE_KEY_CURRENT, id)
  } catch {}
}
