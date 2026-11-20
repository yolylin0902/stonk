import React from 'react'
import { Sparkles, SlidersHorizontal, RefreshCw } from 'lucide-react'

export default function Header({ onOpenWatchlist, onRefresh, isRefreshing }) {
  return (
    <header className="sticky top-0 z-30 bg-[#0B0F19]/90 backdrop-blur-md border-b border-slate-800/80 safe-top">
      <div className="max-w-md mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-emerald-500 p-0.5 shadow-lg shadow-blue-500/20">
            <div className="w-full h-full bg-[#0B0F19] rounded-[10px] flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-emerald-400" />
            </div>
          </div>
          <div>
            <div className="flex items-center space-x-1.5">
              <h1 className="text-base font-bold text-white tracking-tight">漲跌原因分析</h1>
              <span className="text-[10px] px-1.5 py-0.5 bg-blue-500/10 text-blue-400 font-semibold rounded-md border border-blue-500/20">AI</span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium">每日收盤精華 · 核心原因解密</p>
          </div>
        </div>

        <div className="flex items-center space-x-1.5">
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            aria-label="重新整理"
            className="p-2 rounded-xl bg-slate-800/60 hover:bg-slate-700/60 active:scale-95 text-slate-300 hover:text-white transition-all border border-slate-700/50"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-blue-400' : ''}`} />
          </button>
          
          <button
            onClick={onOpenWatchlist}
            aria-label="管理自選股"
            className="flex items-center space-x-1 px-2.5 py-1.5 rounded-xl bg-blue-600/10 hover:bg-blue-600/20 active:scale-95 text-blue-400 hover:text-blue-300 transition-all border border-blue-500/20 text-xs font-medium"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>自選股</span>
          </button>
        </div>
      </div>
    </header>
  )
}
