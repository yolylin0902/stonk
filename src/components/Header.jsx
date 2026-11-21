import React from 'react'
import { RefreshCw, LogOut } from 'lucide-react'

export default function Header({
  user,
  onSignOut,
  onRefresh,
  isRefreshing,
}) {
  const displayName =
    user?.user_metadata?.display_name ||
    user?.user_metadata?.full_name ||
    user?.email?.split('@')[0] ||
    '個人帳號'

  return (
    <header className="sticky top-0 z-30 ios-glass safe-top">
      <div className="max-w-md mx-auto px-4 pt-4 pb-3 flex items-end justify-between">
        {/* Large iOS-style title */}
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight text-white leading-tight">
            盤後
          </h1>
          <p className="text-[12px] text-white/40 font-normal mt-0.5 tracking-tight">
            市場
          </p>
        </div>

        {/* Right-side controls */}
        <div className="flex items-center space-x-1.5 pb-1">
          {user && (
            <button
              onClick={onSignOut}
              title="點擊登出"
              aria-label="登出"
              className="h-8 px-2.5 rounded-full ios-glass-control flex items-center space-x-1.5 active:scale-[0.95] transition-all duration-150 ease-out text-white/70 hover:text-white"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/80" />
              <span className="text-[12px] font-medium max-w-[80px] truncate">
                {displayName}
              </span>
              <LogOut
                className="w-[12px] h-[12px] text-white/40"
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </button>
          )}

          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            aria-label="重新整理"
            className="w-8 h-8 rounded-full ios-glass-control flex items-center justify-center active:scale-[0.92] transition-all duration-150 ease-out"
          >
            <RefreshCw
              className={`w-[14px] h-[14px] text-white/70 ${isRefreshing ? 'animate-spin' : ''}`}
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </button>
        </div>
      </div>
    </header>
  )
}
