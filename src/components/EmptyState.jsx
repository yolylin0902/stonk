import React from 'react'
import { Sparkles, Calendar, Plus } from 'lucide-react'

export default function EmptyState({ market, selectedDate, onOpenWatchlist }) {
  const isUS = market === 'US'

  return (
    <div className="py-12 px-4 text-center rounded-2xl bg-slate-900/40 border border-slate-800/80 my-4">
      <div className="w-12 h-12 rounded-2xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center mx-auto mb-3 shadow-inner">
        <Sparkles className="w-6 h-6 text-slate-400" />
      </div>
      <h3 className="text-sm font-bold text-white mb-1">
        尚未產出 {selectedDate ? `${selectedDate} ` : ''}{isUS ? '美股' : '台股'} 盤後故事
      </h3>
      <p className="text-xs text-slate-400 max-w-xs mx-auto mb-4 leading-relaxed">
        {selectedDate
          ? `該日期無收盤分析報告。通常在收盤後（美股 05:35 / 台股 14:05）自動執行生成。`
          : '目前尚無報告資料，可確認自選股清單或執行排程爬蟲。'}
      </p>
      
      <button
        onClick={onOpenWatchlist}
        className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 text-xs font-semibold border border-blue-500/20 transition-all active:scale-95"
      >
        <Plus className="w-3.5 h-3.5" />
        <span>查看或新增自選股</span>
      </button>
    </div>
  )
}
