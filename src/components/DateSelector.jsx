import React, { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Calendar, ChevronDown, Check } from 'lucide-react'
import { TACTILE_TAP, IOS_SPRING } from '../motion/iosMotion'

export default function DateSelector({ availableDates, selectedDate, onSelectDate }) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef(null)

  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false)
      }
    }

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('touchstart', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  if (!availableDates || availableDates.length === 0) {
    return null
  }

  const formatDateLabel = (dateStr) => {
    try {
      const parts = dateStr.split('-')
      if (parts.length === 3) {
        const d = new Date(parts[0], parts[1] - 1, parts[2])
        const weekdays = ['日', '一', '二', '三', '四', '五', '六']
        const weekday = weekdays[d.getDay()]
        return `${parts[1]}/${parts[2]} 週${weekday}`
      }
    } catch {
      // fallback
    }
    return dateStr
  }

  return (
    <div className="flex items-center justify-between px-1 select-none relative">
      {/* 標題 */}
      <div className="flex items-center space-x-1.5 text-[13px] text-white/45 font-medium">
        <Calendar
          className="w-3.5 h-3.5"
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <span>收盤日</span>
      </div>

      {/* 自訂 iOS Liquid Glass Context Menu */}
      <div ref={dropdownRef} className="relative inline-block">
        <motion.button
          type="button"
          whileTap={TACTILE_TAP}
          onClick={() => setIsOpen(!isOpen)}
          aria-expanded={isOpen}
          aria-label="選擇收盤報告日期"
          className="bg-white/[0.07] hover:bg-white/[0.11] active:bg-white/[0.13] border border-white/[0.08] text-white/85 text-[13px] font-medium py-1.5 px-3 rounded-full flex items-center space-x-2 transition-colors cursor-pointer select-none"
        >
          <span className="tabular-nums">{formatDateLabel(selectedDate)}</span>
          <motion.div
            animate={{ rotate: isOpen ? 180 : 0 }}
            transition={IOS_SPRING.snappy}
            className="flex items-center justify-center pointer-events-none"
          >
            <ChevronDown className="w-3.5 h-3.5 text-white/40" strokeWidth={1.75} />
          </motion.div>
        </motion.button>

        {/* 展開之浮動面板（精準定位在按鈕下方，不蓋住觸發鈕） */}
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: -6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: -4 }}
              transition={IOS_SPRING.menu}
              className="absolute right-0 top-full mt-2 z-50 min-w-[160px] p-1.5 rounded-[20px] bg-[#1c1c1e]/85 backdrop-blur-2xl border border-white/15 shadow-[0_18px_40px_rgba(0,0,0,0.48)] origin-top-right overflow-hidden space-y-0.5 select-none"
            >
              {availableDates.map((date) => {
                const isSelected = date === selectedDate
                return (
                  <motion.button
                    key={date}
                    type="button"
                    whileTap={TACTILE_TAP}
                    onClick={() => {
                      onSelectDate(date)
                      setIsOpen(false)
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-[14px] text-[13px] font-medium transition-colors text-left ${
                      isSelected
                        ? 'bg-white/15 text-white shadow-sm'
                        : 'text-white/70 hover:bg-white/[0.08] hover:text-white'
                    }`}
                  >
                    <span className="tabular-nums">{formatDateLabel(date)}</span>
                    {isSelected && (
                      <Check className="w-3.5 h-3.5 text-white ml-2 flex-shrink-0" strokeWidth={2} />
                    )}
                  </motion.button>
                )
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
