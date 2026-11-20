import React from 'react'
import { RefreshCw, SlidersHorizontal } from 'lucide-react'

export default function Header({ onOpenWatchlist, onRefresh, isRefreshing }) {
  return (
    <header className="sticky top-0 z-30 ios-glass safe-top">
      <div className="max-w-md mx-auto px-4 pt-4 pb-3 flex items-end justify-between">
        {/* Large iOS-style title */}
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight text-white leading-tight">
            盤後
          </h1>
          <p className="text-[13px] text-white/40 font-normal mt-0.5 tracking-tight">
            市場
          </p>
        </div>

        {/* Right-side controls */}
        <div className="flex items-center space-x-2 pb-1">
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            aria-label="重新整理"
            className="w-8 h-8 rounded-full ios-glass-control flex items-center justify-center active:scale-[0.92] transition-all duration-150 ease-out"
          >
            <RefreshCw
              className={`w-[15px] h-[15px] text-white/70 ${isRefreshing ? 'animate-spin' : ''}`}
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </button>

          <button
            onClick={onOpenWatchlist}
            aria-label="自選股"
            className="h-8 px-3 rounded-full ios-glass-control flex items-center space-x-1.5 active:scale-[0.95] transition-all duration-150 ease-out"
          >
            <SlidersHorizontal
              className="w-[13px] h-[13px] text-white/70"
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <span className="text-[13px] text-white/70 font-medium">自選股</span>
          </button>
        </div>
      </div>
    </header>
  )
}
