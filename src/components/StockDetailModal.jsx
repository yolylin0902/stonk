import React, { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Trash2, ExternalLink, Loader2 } from 'lucide-react'
import { IOS_SPRING, TACTILE_TAP } from '../motion/iosMotion'

export default function StockDetailModal({
  report,
  liveQuote,
  isIndex = false,
  onClose,
  onRemove,
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)

  // 1. 生命週期防呆：Esc 鍵關閉與鎖定 Body 捲動
  useEffect(() => {
    if (!report) return
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose?.()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = originalOverflow
    }
  }, [report, onClose])

  if (!report) return null

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
    report_date,
    isPending,
    isAiPending,
  } = report

  // 判斷是否顯示盤中即時報價疊加層
  let isLiveOverlay = false
  let liveTagLabel = ''
  let displayPrice = close_price
  let displayChangePct = change_percent

  if (liveQuote && !isPending) {
    const hasValidLivePrice = Number.isFinite(Number(liveQuote.price))
    const hasValidLiveChange = Number.isFinite(Number(liveQuote.change_percent))

    if (hasValidLivePrice && hasValidLiveChange) {
      const state = (liveQuote.market_state || '').toUpperCase()
      const quoteDateStr = liveQuote.market_time
        ? new Date(liveQuote.market_time * 1000).toISOString().split('T')[0]
        : null
      const isDateNewer = Boolean(quoteDateStr && report_date && quoteDateStr > report_date)

      if (state === 'REGULAR') {
        isLiveOverlay = true
        liveTagLabel = '盤中即時'
      } else if (state === 'PRE') {
        isLiveOverlay = true
        liveTagLabel = '盤前'
      } else if (state === 'POST') {
        isLiveOverlay = true
        liveTagLabel = '盤後'
      } else if (isDateNewer) {
        isLiveOverlay = true
        liveTagLabel = '最新'
      }

      if (isLiveOverlay) {
        displayPrice = liveQuote.price
        displayChangePct = liveQuote.change_percent
      }
    }
  }

  const isUS = market === 'US'
  const numClose = displayPrice != null && Number.isFinite(Number(displayPrice)) ? Number(displayPrice) : null
  const numChangePct = displayChangePct != null && Number.isFinite(Number(displayChangePct)) ? Number(displayChangePct) : null
  const isUp = numChangePct != null && numChangePct > 0
  const isDown = numChangePct != null && numChangePct < 0

  // 顏色邏輯：美股綠漲紅跌，台股紅漲綠跌
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

  const formattedPrice = numClose != null
    ? (isUS
        ? `$${numClose.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : `${numClose.toLocaleString('zh-TW', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}`)
    : '--'

  const changePctText = numChangePct != null
    ? `${numChangePct > 0 ? '+' : ''}${numChangePct.toFixed(2)}%`
    : '同步中'

  const sentimentCls = 'bg-white/[0.09] text-white/80 text-[11px] px-2.5 py-0.5 rounded-full font-medium'

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

  const rawBullets = parseSafeArray(story_bullets)
  const bullets = rawBullets
    .map((b) => (typeof b === 'string' ? b : typeof b === 'object' && b !== null ? b.text || JSON.stringify(b) : ''))
    .filter(Boolean)
    .map((b) => {
      const chineseCount = (b.match(/[\u4e00-\u9fa5]/g) || []).length
      if (chineseCount < 3 && /[a-zA-Z]{4,}/.test(b)) {
        return '焦點動態：市場持續關注該標的近期產業供應鏈最新發展與市場評價調整。'
      }
      return b
    })

  let safeHeadline = headline
  if (headline) {
    const chineseInHeadline = (headline.match(/[\u4e00-\u9fa5]/g) || []).length
    if (chineseInHeadline < 3 && /[a-zA-Z]{4,}/.test(headline)) {
      safeHeadline = `${name || symbol}最新收盤行情與盤後產業焦點分析`
    }
  }

  const rawNews = parseSafeArray(news_links)
  const news = rawNews
    .map((item) => {
      if (typeof item === 'string') return { title: item, url: '#' }
      if (typeof item === 'object' && item !== null) {
        return {
          title: item.title || item.name || '相關報導',
          url: item.url || item.link || '#',
        }
      }
      return null
    })
    .filter(Boolean)

  const handleRemoveClick = (e) => {
    e.stopPropagation()
    if (!confirmDelete) {
      setConfirmDelete(true)
      setTimeout(() => setConfirmDelete(false), 3000)
    } else {
      onRemove?.(symbol)
      onClose?.()
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={onClose}
      >
        <motion.div
          className="w-full max-w-md max-h-[82vh] flex flex-col ios-glass rounded-[30px] border border-white/[0.16] shadow-[0_24px_60px_rgba(0,0,0,0.65)] overflow-hidden bg-[#16181d]/85"
          initial={{ opacity: 0, scale: 0.9, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.93, y: 8 }}
          transition={IOS_SPRING.menu || { type: 'spring', stiffness: 420, damping: 32 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* 1. 頂部固定區 */}
          <div className="px-5 pt-5 pb-4 border-b border-white/[0.08] shrink-0">
            {/* 第一行：代號與全名 + 右側操作按鈕群 */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="text-[22px] font-bold text-white tracking-tight leading-tight">
                  {symbol}
                </h2>
                <p className="text-[13px] text-white/55 font-normal mt-0.5 leading-snug">
                  {name || symbol}
                </p>
              </div>

              <div className="flex items-center space-x-2 shrink-0 pt-0.5">
                {/* 僅在非指數且有 onRemove 時顯示刪除按鈕 */}
                {!isIndex && onRemove && (
                  <motion.button
                    type="button"
                    whileTap={TACTILE_TAP}
                    transition={IOS_SPRING.snappy}
                    onClick={handleRemoveClick}
                    aria-label="移除自選股"
                    title={confirmDelete ? '再次點擊確認移除' : '移除此追蹤標的'}
                    className={`flex items-center justify-center transition-colors duration-150 ${
                      confirmDelete
                        ? 'h-8 px-3 rounded-full bg-rose-500/25 text-rose-300 border border-rose-500/40 text-[11px] font-medium'
                        : 'w-8 h-8 rounded-full bg-white/[0.06] hover:bg-rose-500/20 text-white/50 hover:text-rose-300 border border-white/[0.08]'
                    }`}
                  >
                    {confirmDelete ? (
                      <span>確認</span>
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                    )}
                  </motion.button>
                )}

                {/* 關閉按鈕 */}
                <motion.button
                  type="button"
                  whileTap={TACTILE_TAP}
                  transition={IOS_SPRING.snappy}
                  onClick={onClose}
                  aria-label="關閉"
                  className="w-8 h-8 rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-white/60 hover:text-white border border-white/[0.08] flex items-center justify-center transition-colors"
                >
                  <X className="w-4 h-4" strokeWidth={2} />
                </motion.button>
              </div>
            </div>

            {/* 第二行：大字體價格、漲跌幅膠囊、盤中即時/日期標籤 */}
            <div className="mt-3.5 flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <span className={`text-[24px] font-semibold tracking-tight tabular-nums ${trendTextColor}`}>
                  {formattedPrice}
                </span>
                <span className={`text-[12px] font-semibold tabular-nums px-2.5 py-0.5 rounded-full ${trendCapsuleCls}`}>
                  {changePctText}
                </span>
              </div>

              {/* 盤中即時標籤或日期 */}
              {isLiveOverlay && liveTagLabel ? (
                <span className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-md bg-white/[0.08] border border-white/[0.10] text-[10px] text-white/70 font-medium">
                  {liveTagLabel === '盤中即時' && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  )}
                  <span>{liveTagLabel}</span>
                </span>
              ) : (
                <span className="text-[12px] text-white/35 tabular-nums">
                  {report_date}
                </span>
              )}
            </div>
          </div>

          {/* 2. 下方可捲動內容區 */}
          <div className="px-5 py-4 overflow-y-auto overscroll-contain space-y-4">
            {/* 焦點短評 */}
            {safeHeadline ? (
              <div>
                <div className="flex items-center space-x-2">
                  {sentiment && (
                    <span className={sentimentCls}>{sentiment}</span>
                  )}
                  {isAiPending && (
                    <span className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-full bg-white/[0.06] border border-white/[0.08] text-[11px] text-white/50 font-normal">
                      <Loader2 className="w-3 h-3 text-white/40 animate-spin" strokeWidth={1.75} />
                      <span>AI 新聞摘要中</span>
                    </span>
                  )}
                </div>
                <p className="text-[15px] font-medium text-white/95 leading-snug tracking-tight mt-2">
                  {safeHeadline}
                </p>
              </div>
            ) : (
              <div className="flex items-center space-x-2 text-[12px] text-white/40">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/70" />
                <span>已加入自選 · 等待行情同步</span>
              </div>
            )}

            {/* 重點分析列表 */}
            {bullets && bullets.length > 0 && (
              <div className="space-y-2.5 border-t border-white/[0.07] pt-4">
                {bullets.map((bullet, idx) => (
                  <div key={idx} className="flex items-start space-x-2.5">
                    <span className="flex-shrink-0 w-[18px] h-[18px] rounded-full bg-white/[0.09] text-white/60 font-semibold flex items-center justify-center text-[10px] tabular-nums mt-0.5">
                      {idx + 1}
                    </span>
                    <p className="text-[13.5px] text-white/80 leading-relaxed flex-1">
                      {bullet}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* 相關報導 */}
            {news && news.length > 0 && (
              <div className="border-t border-white/[0.07] pt-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[13px] text-white/50 font-medium">相關報導</span>
                </div>
                <div className="space-y-1.5">
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
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
