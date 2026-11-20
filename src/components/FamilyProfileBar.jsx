import React, { useState } from 'react'
import { Users, Plus, X } from 'lucide-react'

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
    <div className="ios-glass rounded-[20px] p-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-2.5 px-0.5">
        <div className="flex items-center space-x-1.5 text-[12px] text-white/45 font-medium">
          <Users
            className="w-3.5 h-3.5"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <span>使用者</span>
        </div>
      </div>

      {/* Profile scroll */}
      <div className="flex items-center space-x-2 overflow-x-auto pb-0.5 scrollbar-none">
        {profiles.map((profile) => {
          const isActive = profile.id === activeProfileId
          const count = profile.holdings ? profile.holdings.length : 0

          return (
            <div
              key={profile.id}
              className={`flex-shrink-0 flex items-center space-x-2 px-3 py-1.5 rounded-full border transition-all duration-150 ${
                isActive
                  ? 'bg-white/[0.14] border-white/[0.18]'
                  : 'bg-white/[0.05] border-white/[0.06] hover:bg-white/[0.09]'
              }`}
            >
              <button
                onClick={() => onSelectProfile(profile.id)}
                className="flex items-center space-x-2 text-left"
              >
                <span className="text-[16px] select-none leading-none">{profile.avatar || '👤'}</span>
                <div>
                  <div className={`text-[13px] font-semibold leading-tight ${isActive ? 'text-white' : 'text-white/60'}`}>
                    {profile.name}
                  </div>
                  <div className="text-[11px] text-white/30 tabular">
                    {count > 0 ? `${count} 檔` : '—'}
                  </div>
                </div>
              </button>

              {profiles.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    if (confirm(`確定要刪除「${profile.name}」嗎？`)) {
                      onDeleteProfile(profile.id)
                    }
                  }}
                  className="p-0.5 text-white/20 hover:text-white/60 transition-colors"
                  title="刪除使用者"
                >
                  <X className="w-3 h-3" strokeWidth={1.75} />
                </button>
              )}
            </div>
          )
        })}

        {/* Add button */}
        <button
          onClick={() => setShowAddModal(true)}
          className="flex-shrink-0 flex items-center space-x-1 px-3 py-1.5 rounded-full border border-dashed border-white/[0.14] hover:border-white/25 text-white/35 hover:text-white/60 text-[13px] transition-all"
        >
          <Plus className="w-3.5 h-3.5" strokeWidth={1.75} />
        </button>
      </div>

      {/* Add member modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-md ios-fade-in">
          <div className="w-full max-w-xs ios-glass rounded-[24px] p-5 shadow-2xl space-y-4 mx-4">
            <h4 className="text-[17px] font-semibold text-white tracking-tight">新增使用者</h4>
            <form onSubmit={handleCreateMember} className="space-y-3">
              <div>
                <label className="text-[12px] text-white/45 block mb-1.5">名稱</label>
                <input
                  type="text"
                  placeholder="小明、老王…"
                  value={newMemberName}
                  onChange={(e) => setNewMemberName(e.target.value)}
                  className="w-full rounded-xl bg-white/[0.07] border border-white/[0.10] px-3.5 py-2.5 text-[14px] text-white placeholder-white/25 focus:outline-none focus:border-white/25 transition-all"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-[12px] text-white/45 block mb-1.5">
                  頭像（使用輸入法選表情符號）
                </label>
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 rounded-2xl border border-white/[0.12] bg-white/[0.06] flex items-center justify-center text-2xl flex-shrink-0">
                    {newMemberAvatar || '❓'}
                  </div>
                  <input
                    type="text"
                    maxLength={4}
                    placeholder="輸入表情"
                    value={newMemberAvatar}
                    onChange={(e) => setNewMemberAvatar(e.target.value)}
                    className="flex-1 rounded-xl bg-white/[0.07] border border-white/[0.10] px-3 py-2.5 text-[18px] text-white placeholder-white/25 focus:outline-none focus:border-white/25 text-center"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-full text-[14px] text-white/50 hover:text-white transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-full bg-white/[0.14] hover:bg-white/[0.20] text-[14px] font-semibold text-white transition-all active:scale-[0.97]"
                >
                  確認
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
