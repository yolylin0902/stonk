import React, { useState } from 'react'
import { Users, Eye, TrendingDown, TrendingUp, Plus, UserCheck } from 'lucide-react'

export default function FamilyProfileBar({
  profiles,
  activeProfileId,
  onSelectProfile,
  onAddProfile,
  reports = []
}) {
  const [showAddModal, setShowAddModal] = useState(false)
  const [newMemberName, setNewMemberName] = useState('')
  const [newMemberAvatar, setNewMemberAvatar] = useState('🦊')

  // 計算每位朋友的持股當日平均跌幅（偷看跌多慘）
  const getProfileSummary = (profile) => {
    if (!profile.holdings || profile.holdings.length === 0) return { avgChange: 0, count: 0, worstStock: null }
    
    // 找出該成員持股在今日 reports 中的資料
    const matched = reports.filter(r => profile.holdings.includes(r.symbol))
    if (matched.length === 0) return { avgChange: 0, count: profile.holdings.length, worstStock: null }
    
    const sum = matched.reduce((acc, r) => acc + Number(r.change_percent || 0), 0)
    const avg = sum / matched.length
    
    // 找出跌最慘的一檔
    const sorted = [...matched].sort((a, b) => Number(a.change_percent) - Number(b.change_percent))
    const worst = sorted[0]
    
    return {
      avgChange: avg,
      count: profile.holdings.length,
      worstStock: worst
    }
  }

  const handleCreateMember = (e) => {
    e.preventDefault()
    if (!newMemberName.trim()) return
    onAddProfile({
      id: 'member_' + Date.now(),
      name: newMemberName.trim(),
      avatar: newMemberAvatar,
      color: 'from-amber-600 to-rose-600',
      title: '韭菜生力軍',
      holdings: ['AAPL', '2330.TW']
    })
    setNewMemberName('')
    setShowAddModal(false)
  }

  const currentProfile = profiles.find(p => p.id === activeProfileId) || profiles[0]

  return (
    <div className="rounded-2xl border border-slate-800 bg-[#0e1422] p-3 text-slate-100 shadow-md">
      {/* 標題與偷看標籤 */}
      <div className="flex items-center justify-between mb-2.5 px-0.5">
        <div className="flex items-center space-x-1.5 text-xs font-bold text-slate-200">
          <Users className="w-3.5 h-3.5 text-blue-400" />
          <span>韭菜家庭成員 (Netflix模式)</span>
        </div>
        <span className="flex items-center space-x-1 text-[11px] text-slate-400">
          <Eye className="w-3 h-3 text-rose-400" />
          <span>切換偷看持倉</span>
        </span>
      </div>

      {/* 水平滑動 / 點選的成員頭像列 */}
      <div className="flex items-center space-x-2.5 overflow-x-auto pb-1 scrollbar-none">
        {profiles.map((profile) => {
          const isActive = profile.id === activeProfileId
          const summary = getProfileSummary(profile)
          const isLosing = summary.avgChange < 0
          
          return (
            <button
              key={profile.id}
              onClick={() => onSelectProfile(profile.id)}
              className={`flex-shrink-0 flex items-center space-x-2 px-3 py-1.5 rounded-xl border transition-all text-left ${
                isActive
                  ? 'bg-gradient-to-r from-blue-900/40 to-slate-800/90 border-blue-500/80 shadow-md shadow-blue-500/20'
                  : 'bg-slate-900/50 border-slate-800/80 hover:bg-slate-800/60'
              }`}
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-lg bg-gradient-to-br ${profile.color} shadow-sm flex-shrink-0`}>
                {profile.avatar}
              </div>
              <div className="min-w-0 pr-1">
                <div className="flex items-center space-x-1">
                  <span className={`text-xs font-bold truncate ${isActive ? 'text-white' : 'text-slate-300'}`}>
                    {profile.name}
                  </span>
                  {isActive && <UserCheck className="w-3 h-3 text-blue-400 flex-shrink-0" />}
                </div>
                <div className="flex items-center space-x-1 text-[10px]">
                  {summary.count > 0 ? (
                    <span className={`font-mono font-medium ${isLosing ? 'text-rose-400' : 'text-emerald-400'}`}>
                      {summary.avgChange > 0 ? '+' : ''}{summary.avgChange.toFixed(1)}%
                    </span>
                  ) : (
                    <span className="text-slate-400">未選股</span>
                  )}
                  <span className="text-slate-400 text-[9px]">({summary.count}檔)</span>
                </div>
              </div>
            </button>
          )
        })}

        {/* 新增朋友按鈕 */}
        <button
          onClick={() => setShowAddModal(true)}
          className="flex-shrink-0 flex items-center space-x-1 px-3 py-2 rounded-xl border border-dashed border-slate-700 hover:border-slate-500 text-slate-400 hover:text-slate-200 text-xs transition-all"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>加朋友</span>
        </button>
      </div>

      {/* 當前偷看對象慘況速報條 */}
      <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400 px-1">
        <div className="flex items-center space-x-1.5 truncate">
          <span>目前查看：<strong className="text-white">{currentProfile.name}</strong></span>
          <span className="text-slate-400">·</span>
          <span className="text-slate-400">{currentProfile.title}</span>
        </div>
        {getProfileSummary(currentProfile).worstStock && (
          <span className="flex-shrink-0 font-mono text-rose-400 text-[10px]">
            🔥 慘: {getProfileSummary(currentProfile).worstStock.symbol} ({getProfileSummary(currentProfile).worstStock.change_percent}%)
          </span>
        )}
      </div>

      {/* 新增朋友 Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-xs rounded-2xl border border-slate-700 bg-slate-900 p-4 shadow-xl space-y-3">
            <h4 className="text-sm font-bold text-white flex items-center space-x-1.5">
              <span>新增家庭成員</span>
            </h4>
            <form onSubmit={handleCreateMember} className="space-y-3">
              <div>
                <label className="text-xs text-slate-400">朋友暱稱</label>
                <input
                  type="text"
                  placeholder="例如：當沖老王"
                  value={newMemberName}
                  onChange={(e) => setNewMemberName(e.target.value)}
                  className="mt-1 w-full rounded-xl bg-slate-800 border border-slate-700 px-3 py-2 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-xs text-slate-400">選擇頭像</label>
                <div className="flex space-x-2 mt-1">
                  {['🤠', '🤑', '🐸', '🤡', '🦊', '🚀'].map(emoji => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => setNewMemberAvatar(emoji)}
                      className={`w-8 h-8 rounded-lg flex items-center justify-center text-lg border ${
                        newMemberAvatar === emoji ? 'border-blue-500 bg-blue-900/30' : 'border-slate-800 bg-slate-800/60'
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
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
