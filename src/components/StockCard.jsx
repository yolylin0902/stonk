import React, { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, ChevronUp, Loader2, ExternalLink } from 'lucide-react'
import { IOS_SPRING, TACTILE_TAP, LIST_ITEM_VARIANTS } from '../motion/iosMotion'

export default function StockCard({ report, onRemove }) {
  const [isNewsExpanded, setIsNewsExpanded] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const timerRef = useRef(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const handleDeleteClick = (e) => {
    e.stopPropagation()
    if (!confirmDelete) {
      setConfirmDelete(true)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        setConfirmDelete(false)
      }, 3000)
    } else {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (onRemove) {
        onRemove(symbol)
      }
    }
  }

  const {
    symbol = '',
    name = '',
    market = 'US',
    close_price,
    change_percent,
    sentiment,
    headline,
    story_bullets,
    news_links,
  } = report || {}

  const isUS = market === 'US'
  const numChangePct = change_percent != null ? Number(change_percent) : null
  const isUp = numChangePct != null && numChangePct > 0
  const isDown = numChangePct != null && numChangePct < 0

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
  const sentimentCls = 'bg-white/[0.09] text-white/80 text-[11px] px-2.5 py-0.5 rounded-full font-medium'

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

  // 安全解析陣列或 JSON 字串
  const parseSafeArray = (val) => {
    if (!val) return []
    if (Array.isArray(val)) return val
    if (typeof val === 'string') {
      try {
        const parsed = JSON.parse(val)
        return Array.isArray(parsed) ? parsed : []
      } catch {
        return val.trim() ? [val] : []
      }
    }
    return []
  }

  const bullets = parseSafeArray(story_bullets)
  const news = parseSafeArray(news_links)

  return (
    <motion.article
      layout="position"
      variants={LIST_ITEM_VARIANTS}
      initial="hidden"
      animate="visible"
      exit="exit"
      transition={IOS_SPRING.smooth}
      className="ios-glass rounded-[28px] p-5 select-none"
    >
      {/* ── Row 1: Symbol / Name  ·  Price / Change  ·  Remove Action ── */}
      <div className="flex items-start justify-between">
        {/* Left: symbol (large) + name below */}
        <div className="truncate mr-2">
          <h2 className="text-[22px] font-bold text-white tracking-tight leading-tight tabular truncate">
            {symbol}
          </h2>
          <p className="text-[13px] text-white/55 font-normal mt-0.5 leading-tight truncate max-w-[170px]">
            {name}
          </p>
        </div>

        {/* Right: price + change capsule + direct delete button */}
        <div className="flex items-start space-x-2.5 flex-shrink-0">
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
                <span className="text-[12px] text-white/30">分析中</span>
              </div>
            )}
          </div>

          {/* 直覺單色霧面玻璃圓形按鈕（兩段式原地平滑變形膠囊） */}
          {onRemove && (
            <div className="pt-0.5">
              <motion.button
                layout
                type="button"
                whileTap={TACTILE_TAP}
                transition={IOS_SPRING.snappy}
                onClick={handleDeleteClick}
                aria-label={`移除 ${symbol}`}
                title={confirmDelete ? '確認移除' : '移除此追蹤標的'}
                className={`flex items-center justify-center transition-colors duration-150 ${
                  confirmDelete
                    ? 'h-7 px-2.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[11px] font-medium shadow-sm'
                    : 'w-7 h-7 rounded-full bg-white/[0.06] hover:bg-rose-400/15 text-white/45 hover:text-rose-300 border border-white/[0.07] hover:border-rose-400/20'
                }`}
              >
                {confirmDelete ? (
                  <motion.span
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    transition={IOS_SPRING.snappy}
                  >
                    移除
                  </motion.span>
                ) : (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                )}
              </motion.button>
            </div>
          )}
        </div>
      </div>

      {/* ── Row 2: Headline (one-sentence reason) ── */}
      {headline && (
        <div className="mt-4">
          {sentiment && (
            <span className={sentimentCls}>{sentiment}</span>
          )}
          <p className="text-[15px] font-medium text-white/95 leading-snug tracking-tight mt-2">
            {headline}
          </p>
        </div>
      )}

      {/* ── Row 3: Bullet points ── */}
      {bullets && bullets.length > 0 && (
        <div className="mt-4 space-y-2 border-t border-white/[0.07] pt-4">
          {bullets.map((bullet, idx) => (
            <div key={idx} className="flex items-start space-x-2.5">
              <span className="flex-shrink-0 w-[18px] h-[18px] rounded-full bg-white/[0.09] text-white/60 font-semibold flex items-center justify-center text-[10px] tabular mt-0.5">
                {idx + 1}
              </span>
              <p className="text-[13.5px] text-white/80 leading-relaxed flex-1">
                {bullet}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* ── Row 4: News fold ── */}
      {news && news.length > 0 && (
        <div className="mt-4 border-t border-white/[0.07] pt-3">
          <motion.button
            type="button"
            whileTap={TACTILE_TAP}
            onClick={() => setIsNewsExpanded(!isNewsExpanded)}
            className="w-full flex items-center justify-between py-0.5 text-[13px] text-white/50 hover:text-white/70 transition-colors font-medium"
          >
            <span>相關報導</span>
            {isNewsExpanded ? (
              <ChevronUp className="w-4 h-4" strokeWidth={1.75} />
            ) : (
              <ChevronDown className="w-4 h-4" strokeWidth={1.75} />
            )}
          </motion.button>

          <AnimatePresence>
            {isNewsExpanded && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={IOS_SPRING.smooth}
                className="mt-2 space-y-1 overflow-hidden"
              >
                {news.map((item, idx) => (
                  <a
                    key={idx}
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-center justify-between p-2.5 rounded-2xl bg-white/[0.04] hover:bg-white/[0.07] transition-all"
                  >
                    <span className="text-[13px] text-white/75 group-hover:text-white/95 transition-colors line-clamp-2 flex-1 pr-2 leading-snug">
                      {item.title}
                    </span>
                    <ExternalLink
                      className="w-3.5 h-3.5 text-white/35 group-hover:text-white/60 flex-shrink-0 transition-colors"
                      strokeWidth={1.75}
                    />
                  </a>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </motion.article>
  )
}
