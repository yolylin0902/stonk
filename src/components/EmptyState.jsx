import React from 'react'
import { Plus } from 'lucide-react'

export default function EmptyState({ market, selectedDate, onOpenWatchlist }) {
  return (
    <div className="py-14 px-4 text-center rounded-[28px] ios-glass my-4 ios-fade-in">
      {/* 極簡空狀態圖示 */}
      <div className="w-11 h-11 rounded-full bg-white/[0.06] border border-white/[0.08] flex items-center justify-center mx-auto mb-4">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="text-white/35">
          <rect x="3" y="3" width="18" height="18" rx="4"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="15" x2="12" y2="15"/>
        </svg>
      </div>
      <h3 className="text-[15px] font-semibold text-white/92 mb-1">
        {selectedDate ? `${selectedDate}` : ''} {market === 'US' ? '美股' : '台股'}
      </h3>
      <p className="text-[13px] text-white/45 max-w-xs mx-auto mb-5 leading-relaxed">
        {selectedDate ? '該日期暫無報告' : '尚無報告資料'}
      </p>
      <button
        onClick={onOpenWatchlist}
        className="inline-flex items-center space-x-1.5 px-5 py-2.5 rounded-full bg-white/[0.10] hover:bg-white/[0.15] text-white/70 text-[13px] font-medium transition-all duration-150 active:scale-[0.97]"
      >
        <Plus className="w-3.5 h-3.5" strokeWidth={1.75} />
        <span>自選股</span>
      </button>
    </div>
  )
}
