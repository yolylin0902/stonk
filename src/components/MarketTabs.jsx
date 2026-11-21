import React from 'react'
import { motion } from 'framer-motion'
import { IOS_SPRING, TACTILE_TAP } from '../motion/iosMotion'

export default function MarketTabs({ activeMarket, onSelectMarket }) {
  const tabs = [
    { key: 'US', label: '美股' },
    { key: 'TW', label: '台股' },
  ]

  return (
    <div className="relative flex p-1 bg-white/[0.07] rounded-full border border-white/[0.07]">
      {tabs.map((tab) => {
        const isActive = activeMarket === tab.key
        return (
          <motion.button
            key={tab.key}
            type="button"
            whileTap={TACTILE_TAP}
            onClick={() => onSelectMarket(tab.key)}
            className="relative flex-1 flex items-center justify-center py-2 rounded-full text-[14px] font-medium transition-colors duration-150 outline-none select-none"
          >
            {isActive && (
              <motion.div
                layoutId="market-segment-pill"
                transition={IOS_SPRING.snappy}
                className="absolute inset-0 rounded-full bg-white/[0.16] shadow-sm"
              />
            )}
            <span
              className={`relative z-10 transition-colors duration-150 ${
                isActive ? 'text-white font-semibold' : 'text-white/45 hover:text-white/70'
              }`}
            >
              {tab.label}
            </span>
          </motion.button>
        )
      })}
    </div>
  )
}
