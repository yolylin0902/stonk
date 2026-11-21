import React from 'react'

export default function MarketTabs({ activeMarket, onSelectMarket }) {
  const tabs = [
    { key: 'US', label: '美股' },
    { key: 'TW', label: '台股' },
  ]

  return (
    <div className="relative flex p-1 bg-white/[0.07] rounded-full border border-white/[0.07]">
      {/* 絕對定位的半透明霧面玻璃膠囊滑塊 */}
      <div
        className={`absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-full bg-white/[0.16] shadow-sm transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] pointer-events-none ${
          activeMarket === 'TW' ? 'translate-x-full' : 'translate-x-0'
        }`}
      />

      {tabs.map((tab) => {
        const isActive = activeMarket === tab.key
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onSelectMarket(tab.key)}
            className="relative z-10 flex-1 flex items-center justify-center py-2 rounded-full text-[14px] font-medium transition-colors duration-200 active:scale-[0.98]"
          >
            <span
              className={`transition-colors duration-200 ${
                isActive ? 'text-white font-semibold' : 'text-white/45 hover:text-white/70'
              }`}
            >
              {tab.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}
