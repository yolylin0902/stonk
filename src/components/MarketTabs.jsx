import React from 'react'

export default function MarketTabs({ activeMarket, onSelectMarket, counts }) {
  const tabs = [
    { key: 'US', label: '美股', count: counts.US || 0 },
    { key: 'TW', label: '台股', count: counts.TW || 0 },
  ]

  return (
    <div className="flex p-1 bg-white/[0.07] rounded-full border border-white/[0.07]">
      {tabs.map((tab) => {
        const isActive = activeMarket === tab.key
        return (
          <button
            key={tab.key}
            onClick={() => onSelectMarket(tab.key)}
            className={`flex-1 flex items-center justify-center space-x-2 py-2 rounded-full text-[14px] font-medium transition-all duration-200 active:scale-[0.97] ${
              isActive
                ? 'bg-white/[0.16] text-white shadow-sm'
                : 'text-white/45 hover:text-white/70'
            }`}
          >
            <span>{tab.label}</span>
            <span
              className={`text-[11px] font-semibold tabular ${
                isActive ? 'text-white/70' : 'text-white/25'
              }`}
            >
              {tab.count}
            </span>
          </button>
        )
      })}
    </div>
  )
}
