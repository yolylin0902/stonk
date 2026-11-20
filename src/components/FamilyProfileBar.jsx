import React, { useState } from 'react'
import { Users, Plus, UserCheck, X } from 'lucide-react'

export default function FamilyProfileBar({
  profiles,
  activeProfileId,
  onSelectProfile,
  onAddProfile,
  onDeleteProfile
}) {
  const [showAddModal, setShowAddModal] = useState(false)
  const [newMemberName, setNewMemberName] = useState('')
  const [newMemberAvatar, setNewMemberAvatar] = useState('😎')

  const handleCreateMember = (e) => {
    e.preventDefault()
    if (!newMemberName.trim()) return
    onAddProfile({
      id: 'user_' + Date.now(),
      name: newMemberName.trim(),
      avatar: newMemberAvatar.trim() || '😎',
      holdings: []
    })
    setNewMemberName('')
    setNewMemberAvatar('😎')
    setShowAddModal(false)
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-[#0e1422] p-3 text-slate-100 shadow-md">
      {/* 簡潔的標題 */}
      <div className="flex items-center justify-between mb-2 px-0.5">
        <div className="flex items-center space-x-1.5 text-xs font-semibold text-slate-300">
          <Users className="w-3.5 h-3.5 text-blue-400" />
          <span>使用者自選持倉切換</span>
        </div>
      </div>

      {/* 使用者橫向切換列 */}
      <div className="flex items-center space-x-2 overflow-x-auto pb-1 scrollbar-none">
        {profiles.map((profile) => {
          const isActive = profile.id === activeProfileId
          const count = profile.holdings ? profile.holdings.length : 0

          return (
            <div
              key={profile.id}
              className={`flex-shrink-0 flex items-center space-x-2 px-3 py-1.5 rounded-xl border transition-all ${
                isActive
                  ? 'bg-blue-600/20 border-blue-500/80 shadow-sm'
                  : 'bg-slate-900/60 border-slate-800 hover:bg-slate-800/60 text-slate-400'
              }`}
            >
              <button
                onClick={() => onSelectProfile(profile.id)}
                className="flex items-center space-x-2 text-left"
              >
                <span className="text-base select-none">{profile.avatar || '👤'}</span>
                <div>
                  <div className="flex items-center space-x-1">
                    <span className={`text-xs font-bold ${isActive ? 'text-white' : 'text-slate-300'}`}>
                      {profile.name}
                    </span>
                    {isActive && <UserCheck className="w-3 h-3 text-blue-400" />}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {count > 0 ? `${count} 檔持股` : '尚無持股'}
                  </div>
                </div>
              </button>

              {/* 若非唯一使用者，可刪除 */}
              {profiles.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    if (confirm(`確定要刪除使用者「${profile.name}」嗎？`)) {
                      onDeleteProfile(profile.id)
                    }
                  }}
                  className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors"
                  title="刪除使用者"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          )
        })}

        {/* 新增使用者按鈕 */}
        <button
          onClick={() => setShowAddModal(true)}
          className="flex-shrink-0 flex items-center space-x-1 px-3 py-2 rounded-xl border border-dashed border-slate-700 hover:border-slate-500 text-slate-400 hover:text-slate-200 text-xs transition-all"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>新增使用者</span>
        </button>
      </div>

      {/* 新增使用者彈出視窗 */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-xs rounded-2xl border border-slate-700 bg-slate-900 p-4 shadow-xl space-y-3">
            <h4 className="text-sm font-bold text-white">新增使用者</h4>
            <form onSubmit={handleCreateMember} className="space-y-3">
              <div>
                <label className="text-xs text-slate-400">名稱</label>
                <input
                  type="text"
                  placeholder="例如：小明、老王"
                  value={newMemberName}
                  onChange={(e) => setNewMemberName(e.target.value)}
                  className="mt-1 w-full rounded-xl bg-slate-800 border border-slate-700 px-3 py-2 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  自訂頭像（可用手機或電腦輸入法自由輸入任何 Emoji）
                </label>
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 rounded-xl border border-blue-500/50 bg-blue-950/30 flex items-center justify-center text-2xl flex-shrink-0">
                    {newMemberAvatar || '❓'}
                  </div>
                  <input
                    type="text"
                    maxLength={4}
                    placeholder="輸入表情如 🚀"
                    value={newMemberAvatar}
                    onChange={(e) => setNewMemberAvatar(e.target.value)}
                    className="flex-1 rounded-xl bg-slate-800 border border-slate-700 px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 text-center font-emoji"
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  💡 手機點擊輸入框時，可直接切換鍵盤的表情符號鍵選取任何 Emoji。
                </p>
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-1.5 rounded-xl text-xs text-slate-400 hover:text-white"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white"
                >
                  確認新增
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
