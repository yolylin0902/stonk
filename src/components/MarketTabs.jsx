import React from 'react'

export default function MarketTabs({ activeMarket, onSelectMarket, counts }) {
  const tabs = [
    { key: 'US', label: '美股盤後', flag: '🇺🇸', count: counts.US || 0 },
    { key: 'TW', label: '台股盤後', flag: '🇹🇼', count: counts.TW || 0 },
  ]

  return (
    <div className="grid grid-cols-2 p-1 bg-slate-900/80 rounded-2xl border border-slate-800">
      {tabs.map((tab) => {
        const isActive = activeMarket === tab.key
        return (
          <button
            key={tab.key}
            onClick={() => onSelectMarket(tab.key)}
            className={`flex items-center justify-center space-x-2 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 active:scale-[0.98] ${
              isActive
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-600/25'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            <span>{tab.flag}</span>
            <span>{tab.label}</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                isActive ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-400'
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
