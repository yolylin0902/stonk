import React, { useState } from 'react'
import { ChevronDown, ChevronUp, Loader2, ExternalLink } from 'lucide-react'

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

  // 顏色邏輯：美股綠漲紅跌，台股紅漲綠跌 (降彩度霧面版)
  let trendTextColor = 'text-white/45'
  let trendCapsuleCls = 'bg-white/[0.07] text-white/45'

  if (isUS) {
    if (isUp) {
      trendTextColor = 'text-[#6EE7B7]/90'
      trendCapsuleCls = 'bg-[#34D399]/[0.12] text-[#6EE7B7]/90'
    } else if (isDown) {
      trendTextColor = 'text-[#FDA4AF]/90'
      trendCapsuleCls = 'bg-[#FB7185]/[0.12] text-[#FDA4AF]/90'
    }
  } else {
    if (isUp) {
      trendTextColor = 'text-[#FDA4AF]/90'
      trendCapsuleCls = 'bg-[#FB7185]/[0.12] text-[#FDA4AF]/90'
    } else if (isDown) {
      trendTextColor = 'text-[#6EE7B7]/90'
      trendCapsuleCls = 'bg-[#34D399]/[0.12] text-[#6EE7B7]/90'
    }
  }

  // 情緒膠囊：統一低調霧面白
  const sentimentCls = 'bg-white/[0.07] text-white/70 text-[11px] px-2.5 py-0.5 rounded-full'

  // 價格格式化
  const formattedPrice = close_price != null
    ? (isUS
        ? `$${Number(close_price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : `${Number(close_price).toLocaleString('zh-TW', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}`)
    : '—'

  // 漲跌幅文字
  const changePctText = change_percent != null
    ? `${change_percent > 0 ? '+' : ''}${change_percent}%`
    : null

  // story_bullets
  const bullets = Array.isArray(story_bullets)
    ? story_bullets
    : typeof story_bullets === 'string'
    ? JSON.parse(story_bullets || '[]')
    : []

  // news_links
  const news = Array.isArray(news_links)
    ? news_links
    : typeof news_links === 'string'
    ? JSON.parse(news_links || '[]')
    : []

  return (
    <article className="ios-glass rounded-[28px] p-5 transition-all duration-150 ease-out active:scale-[0.995]">
      {/* ── Row 1: Symbol / Name  ·  Price / Change ── */}
      <div className="flex items-start justify-between">
        {/* Left: symbol (large) + name below */}
        <div>
          <h2 className="text-[22px] font-bold text-white tracking-tight leading-tight tabular">
            {symbol}
          </h2>
          <p className="text-[13px] text-white/40 font-normal mt-0.5 leading-tight truncate max-w-[160px]">
            {name}
          </p>
        </div>

        {/* Right: price + change capsule */}
        <div className="text-right">
          {close_price != null ? (
            <>
              <div className={`text-[22px] font-semibold tracking-tight tabular ${trendTextColor}`}>
                {formattedPrice}
              </div>
              <div className="mt-1 flex justify-end">
                {changePctText && (
                  <span className={`text-[12px] font-semibold tabular px-2.5 py-0.5 rounded-full ${trendCapsuleCls}`}>
                    {changePctText}
                  </span>
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center space-x-1.5 mt-1">
              <Loader2 className="w-3.5 h-3.5 text-white/30 animate-spin" strokeWidth={1.75} />
              <span className="text-[12px] text-white/30">更新中</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Row 2: Headline (one-sentence reason) ── */}
      {headline && (
        <div className="mt-4">
          {/* Sentiment tag */}
          {sentiment && (
            <span className={sentimentCls}>{sentiment}</span>
          )}
          <p className="text-[15px] font-medium text-white/92 leading-snug tracking-tight mt-2">
            {headline}
          </p>
        </div>
      )}

      {/* ── Row 3: Bullet points ── */}
      {bullets && bullets.length > 0 && (
        <div className="mt-4 space-y-2 border-t border-white/[0.07] pt-4">
          {bullets.map((bullet, idx) => (
            <div key={idx} className="flex items-start space-x-2.5">
              <span className="flex-shrink-0 w-[18px] h-[18px] rounded-full bg-white/[0.07] text-white/45 font-semibold flex items-center justify-center text-[10px] tabular mt-0.5">
                {idx + 1}
              </span>
              <p className="text-[13.5px] text-white/68 leading-relaxed flex-1">
                {bullet}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* ── Row 4: News fold ── */}
      {news && news.length > 0 && (
        <div className="mt-4 border-t border-white/[0.07] pt-3">
          <button
            onClick={() => setIsNewsExpanded(!isNewsExpanded)}
            className="w-full flex items-center justify-between py-0.5 text-[13px] text-white/40 hover:text-white/60 transition-colors font-medium active:scale-[0.98]"
          >
            <span>相關報導</span>
            {isNewsExpanded ? (
              <ChevronUp className="w-4 h-4" strokeWidth={1.75} />
            ) : (
              <ChevronDown className="w-4 h-4" strokeWidth={1.75} />
            )}
          </button>

          {isNewsExpanded && (
            <div className="mt-2 space-y-1 ios-fade-in">
              {news.map((item, idx) => (
                <a
                  key={idx}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center justify-between p-2.5 rounded-2xl bg-white/[0.04] hover:bg-white/[0.07] transition-all"
                >
                  <span className="text-[13px] text-white/60 group-hover:text-white/80 transition-colors line-clamp-2 flex-1 pr-2 leading-snug">
                    {item.title}
                  </span>
                  <ExternalLink
                    className="w-3.5 h-3.5 text-white/25 group-hover:text-white/50 flex-shrink-0 transition-colors"
                    strokeWidth={1.75}
                  />
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </article>
  )
}
