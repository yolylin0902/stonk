// 初始預設單一使用者（其餘讓使用者按「+ 新增使用者」自訂）
export const DEFAULT_PROFILES = [
  {
    id: 'user_default',
    name: '我',
    avatar: '😎',
    holdings: []
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
    console.warn('讀取使用者列表失敗:', e)
  }
  return DEFAULT_PROFILES
}

export function saveStoredProfiles(profiles) {
  try {
    localStorage.setItem(STORAGE_KEY_PROFILES, JSON.stringify(profiles))
  } catch (e) {
    console.error('儲存使用者列表失敗:', e)
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
