import React from 'react'
import { Calendar, ChevronDown } from 'lucide-react'

export default function DateSelector({ availableDates, selectedDate, onSelectDate }) {
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
    <div className="flex items-center justify-between px-1">
      <div className="flex items-center space-x-1.5 text-[13px] text-white/45 font-medium">
        <Calendar
          className="w-3.5 h-3.5"
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <span>收盤日</span>
      </div>

      <div className="relative inline-block">
        <select
          value={selectedDate}
          onChange={(e) => onSelectDate(e.target.value)}
          aria-label="選擇收盤報告日期"
          className="bg-white/[0.07] border border-white/[0.08] text-white/80 text-[13px] font-medium py-1.5 pl-3 pr-7 rounded-full focus:outline-none focus:border-white/20 transition-all cursor-pointer"
        >
          {availableDates.map((date) => (
            <option key={date} value={date} className="bg-[#1c1c1e] text-white">
              {formatDateLabel(date)}
            </option>
          ))}
        </select>
        <ChevronDown
          className="w-3.5 h-3.5 text-white/35 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
          strokeWidth={1.75}
        />
      </div>
    </div>
  )
}
