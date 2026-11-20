import React from 'react'
import { Calendar, ChevronDown } from 'lucide-react'

export default function DateSelector({ availableDates, selectedDate, onSelectDate }) {
  if (!availableDates || availableDates.length === 0) {
    return null
  }

  // 格式化顯示文字，例如 2026-11-20 (今日) 或 (週五)
  const formatDateLabel = (dateStr) => {
    try {
      const parts = dateStr.split('-')
      if (parts.length === 3) {
        const d = new Date(parts[0], parts[1] - 1, parts[2])
        const weekdays = ['日', '一', '二', '三', '四', '五', '六']
        const weekday = weekdays[d.getDay()]
        return `${parts[1]}/${parts[2]} (週${weekday})`
      }
    } catch {
      // fallback
    }
    return dateStr
  }

  return (
    <div className="flex items-center justify-between px-1">
      <div className="flex items-center space-x-1.5 text-xs text-slate-400 font-medium">
        <Calendar className="w-3.5 h-3.5 text-blue-400" />
        <span>收盤日期</span>
      </div>

      <div className="relative inline-block">
        <select
          value={selectedDate}
          onChange={(e) => onSelectDate(e.target.value)}
          aria-label="選擇收盤報告日期"
          className="appearance-none bg-slate-900 border border-slate-800 text-slate-200 text-xs font-semibold py-1.5 pl-3 pr-7 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all cursor-pointer"
        >
          {availableDates.map((date) => (
            <option key={date} value={date} className="bg-slate-900 text-slate-200">
              {date} · {formatDateLabel(date)}
            </option>
          ))}
        </select>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
      </div>
    </div>
  )
}
