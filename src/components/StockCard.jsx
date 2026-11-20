import React, { useState } from 'react'
import { TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp, ExternalLink, Newspaper } from 'lucide-react'

export default function StockCard({ report }) {
  const [isNewsExpanded, setIsNewsExpanded] = useState(false)

  const {
    symbol,
    name,
    market,
    close_price,
    change_percent,
    sentiment,
    headline,
    story_bullets,
    news_links,
  } = report

  const isUS = market === 'US'
  const isUp = change_percent > 0
  const isDown = change_percent < 0
  const isFlat = change_percent === 0

  // 顏色邏輯：美股綠漲紅跌，台股紅漲綠跌
  let trendColor = 'text-slate-400'
  let trendBg = 'bg-slate-800/60 border-slate-700/50'

  if (isUS) {
    if (isUp) {
      trendColor = 'text-emerald-400'
      trendBg = 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
    } else if (isDown) {
      trendColor = 'text-rose-400'
      trendBg = 'bg-rose-500/10 border-rose-500/20 text-rose-400'
    }
  } else {
    // 台股：紅漲綠跌
    if (isUp) {
      trendColor = 'text-rose-400'
      trendBg = 'bg-rose-500/10 border-rose-500/20 text-rose-400'
    } else if (isDown) {
      trendColor = 'text-emerald-400'
      trendBg = 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
    }
  }

  // 情緒 Badge 樣式
  let sentimentBadge = 'bg-slate-800 text-slate-300 border-slate-700'
  if (sentiment === '利多') {
    sentimentBadge = isUS
      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
      : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
  } else if (sentiment === '利空') {
    sentimentBadge = isUS
      ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
      : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
  } else {
    sentimentBadge = 'bg-blue-500/15 text-blue-300 border-blue-500/30'
  }

  // 價格格式化
  const formattedPrice = isUS
    ? `$${Number(close_price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `NT$ ${Number(close_price).toLocaleString('zh-TW', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}`

  // 確保 story_bullets 為陣列
  const bullets = Array.isArray(story_bullets)
    ? story_bullets
    : typeof story_bullets === 'string'
    ? JSON.parse(story_bullets || '[]')
    : []

  // 確保 news_links 為陣列
  const news = Array.isArray(news_links)
    ? news_links
    : typeof news_links === 'string'
    ? JSON.parse(news_links || '[]')
    : []

  return (
    <article className="bg-slate-900/90 rounded-2xl border border-slate-800 p-4 shadow-lg shadow-black/20 hover:border-slate-700 transition-all duration-200">
      {/* 頂部：股票資訊與收盤價、漲跌幅 */}
      <div className="flex items-start justify-between pb-3 border-b border-slate-800/80">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-base font-bold text-white tracking-tight">{name}</h2>
            <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
              {symbol}
            </span>
          </div>
          <div className="text-xs text-slate-400 mt-0.5 font-medium">
            {isUS ? '美股' : '台股'}
          </div>
        </div>

        <div className="text-right">
          <div className="text-lg font-extrabold text-white tracking-tight font-mono">
            {formattedPrice}
          </div>
          <div className="flex items-center justify-end space-x-1.5 mt-0.5">
            <span
              className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-xs font-bold border ${trendBg}`}
            >
              {isUp && <TrendingUp className="w-3 h-3" />}
              {isDown && <TrendingDown className="w-3 h-3" />}
              {isFlat && <Minus className="w-3 h-3" />}
              <span>
                {change_percent > 0 ? `+${change_percent}` : change_percent}%
              </span>
            </span>
          </div>
        </div>
      </div>

      {/* 核心一句話原因與情緒標籤 */}
      <div className="mt-3.5">
        <div className="flex items-center space-x-2 mb-1.5">
          <span
            className={`text-[11px] font-bold px-2 py-0.5 rounded-md border ${sentimentBadge}`}
          >
            {sentiment || '中性'}
          </span>
          <span className="text-[11px] text-slate-400 font-medium">AI 收盤快訊</span>
        </div>
        <p className="text-sm font-semibold text-slate-100 leading-snug tracking-tight">
          {headline}
        </p>
      </div>

      {/* 3 點重點故事 */}
      {bullets && bullets.length > 0 && (
        <div className="mt-3 bg-slate-950/60 rounded-xl p-3 border border-slate-800/70">
          <div className="space-y-2">
            {bullets.map((bullet, idx) => (
              <div key={idx} className="flex items-start space-x-2 text-xs leading-relaxed text-slate-300">
                <span className="flex-shrink-0 w-4 h-4 rounded-full bg-blue-500/10 text-blue-400 font-bold flex items-center justify-center text-[10px] mt-0.5">
                  {idx + 1}
                </span>
                <span className="flex-1">{bullet}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 相關新聞展開區塊 */}
      {news && news.length > 0 && (
        <div className="mt-3 pt-2.5 border-t border-slate-800/60">
          <button
            onClick={() => setIsNewsExpanded(!isNewsExpanded)}
            className="w-full flex items-center justify-between py-1 text-xs text-slate-400 hover:text-slate-200 transition-colors font-medium active:scale-[0.99]"
          >
            <div className="flex items-center space-x-1.5">
              <Newspaper className="w-3.5 h-3.5 text-blue-400" />
              <span>相關新聞來源 ({news.length})</span>
            </div>
            {isNewsExpanded ? (
              <ChevronUp className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            )}
          </button>

          {isNewsExpanded && (
            <div className="mt-2 space-y-1.5 animate-fadeIn">
              {news.map((item, idx) => (
                <a
                  key={idx}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-start justify-between p-2 rounded-lg bg-slate-950/40 hover:bg-slate-800/40 border border-slate-800/40 hover:border-slate-700/60 transition-all text-xs"
                >
                  <span className="text-slate-300 group-hover:text-blue-400 transition-colors line-clamp-1 flex-1 pr-2">
                    {item.title}
                  </span>
                  <ExternalLink className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-400 flex-shrink-0 mt-0.5 transition-colors" />
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </article>
  )
}
