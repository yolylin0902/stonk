import React, { Component } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, Loader2, ExternalLink, AlertTriangle } from 'lucide-react'

/**
 * 單張卡片 Error Boundary：隔離單一標的之渲染例外，避免任何髒資料引發全頁白屏
 */
export class StockCardErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('StockCard 渲染錯誤:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      const { report } = this.props
      const sym = report?.symbol || '未知標的'
      return (
        <div className="w-full ios-glass rounded-[22px] p-4 border border-rose-500/20 bg-rose-500/[0.04] flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-[15px] font-semibold text-rose-300">{sym}</span>
            <span className="text-[12px] text-rose-300/80">格式異常</span>
          </div>
          <AlertTriangle className="w-4 h-4 text-rose-300" strokeWidth={2} />
        </div>
      )
    }
    return this.props.children
  }
}

// 取得卡片所屬的兩段式檢查點階段與時間資訊 (Stage 1: 盤後快報, Stage 2: 籌碼/盤後完整版)
export const getReportStageInfo = (report) => {
  if (!report || report.isPending) return null
  if (report.headline?.includes('查無報價') || report.headline?.includes('尚無紀錄')) return null

  const targetMarket = report.market || 'US'
  const tz = targetMarket === 'TW' ? 'Asia/Taipei' : 'America/New_York'

  let stage = report.stage
  let timeFormatted = ''

  const timestamp = report.updated_at || report.created_at
  if (timestamp) {
    const dateObj = new Date(timestamp)
    if (!isNaN(dateObj.getTime())) {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hour: 'numeric',
        minute: 'numeric',
        hour12: false,
      }).formatToParts(dateObj)
      const getP = (t) => parts.find((p) => p.type === t)?.value || '0'
      const h = parseInt(getP('hour'), 10)
      const m = parseInt(getP('minute'), 10)
      const totalMin = h * 60 + m

      timeFormatted = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`

      if (!stage) {
        // 台股: CP1 = 14:05 (845m), CP2 = 17:15 (1035m)
        // 美股: CP1 = 16:35 (995m), CP2 = 18:30 (1110m)
        const cp1 = targetMarket === 'TW' ? 14 * 60 + 5 : 16 * 60 + 35
        const cp2 = targetMarket === 'TW' ? 17 * 60 + 15 : 18 * 60 + 30

        if (totalMin >= cp2 || totalMin < 12 * 60) {
          stage = 2
        } else if (totalMin >= cp1) {
          stage = 1
        } else {
          stage = 2
        }
      }
    }
  }

  if (!stage) return null

  const label = stage === 2
    ? (targetMarket === 'TW' ? '籌碼完整版' : '盤後完整版')
    : '盤後快報'

  return { stage, label, timeFormatted }
}

function StockCardContent({
  report,
  liveQuote,
  isIndex = false,
  isExpanded = false,
  onToggle,
  onRemove,
}) {
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
  } = report || {}

  const stageInfo = getReportStageInfo(report)

  // 判斷是否顯示盤中即時報價疊加層（不更動既有收盤報告，僅在盤中/最新交易時段視覺疊加）
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

  // 價格格式化
  const formattedPrice = numClose != null
    ? (isUS
        ? `$${numClose.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : `${numClose.toLocaleString('zh-TW', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}`)
    : '--'

  // 計算漲跌價差（金額 / 點數）
  // 優先使用原始傳入欄位（若有 change 或 prev_close），若無則由現價與漲跌幅反推昨收與價差
  let changeDiffText = null
  if (numClose != null && numChangePct != null) {
    let diff = null
    if (report?.change != null && Number.isFinite(Number(report.change))) {
      diff = Number(report.change)
    } else if (report?.prev_close != null && Number.isFinite(Number(report.prev_close)) && Number(report.prev_close) > 0) {
      diff = numClose - Number(report.prev_close)
    } else if (1 + numChangePct / 100 > 0) {
      const impliedPrevClose = numClose / (1 + numChangePct / 100)
      diff = numClose - impliedPrevClose
    }

    if (diff != null && Number.isFinite(diff)) {
      const sign = diff > 0 ? '+' : (diff < 0 ? '-' : '')
      const absDiff = Math.abs(diff)
      const formattedDiff = absDiff >= 1000
        ? absDiff.toLocaleString(isUS ? 'en-US' : 'zh-TW', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : absDiff.toFixed(2)
      changeDiffText = `${sign}${formattedDiff}`
    }
  }

  // 漲跌幅文字與並列顯示 (例如: +12.50 (+1.25%) 或 -5.00 (-0.80%))
  const changePctText = numChangePct != null
    ? `${numChangePct > 0 ? '+' : ''}${numChangePct.toFixed(2)}%`
    : '同步中'

  const changeBadgeText = numChangePct != null
    ? (changeDiffText ? `${changeDiffText} (${changePctText})` : changePctText)
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

  return (
    <div className="w-full ios-glass rounded-[22px] border border-white/[0.12] overflow-hidden transition-colors">
      {/* 頂部可點擊橫條 */}
      <button
        type="button"
        onClick={() => onToggle?.(symbol)}
        aria-expanded={isExpanded}
        className="w-full px-4 py-3.5 flex items-center justify-between gap-3 text-left transition-colors active:bg-white/[0.06]"
      >
        {/* 左側：代號 + 狀態標記 + 名稱 */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[16px] font-semibold tracking-tight text-white shrink-0">
              {symbol}
            </span>
            {isPending || isAiPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-white/40 shrink-0" strokeWidth={1.75} />
            ) : isLiveOverlay ? (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/80 animate-pulse shrink-0" />
            ) : null}
          </div>
          <p className="text-[12px] text-white/50 truncate mt-0.5 leading-tight flex items-center gap-1.5">
            <span className="truncate">{name || symbol}</span>
            {stageInfo && (
              <span className={`text-[10px] shrink-0 font-medium ${
                stageInfo.stage === 2 ? 'text-emerald-400/80' : 'text-sky-400/80'
              }`}>
                · {stageInfo.label}
              </span>
            )}
          </p>
        </div>

        {/* 右側：股價 + 漲跌價差與漲跌幅 + 箭頭指示 */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="flex flex-col items-end text-right">
            <span className={`text-[15px] sm:text-[16px] font-semibold tabular-nums leading-tight ${trendTextColor}`}>
              {formattedPrice}
            </span>
            <span className={`mt-1 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-medium tabular-nums tracking-tight whitespace-nowrap ${trendCapsuleCls}`}>
              {changeBadgeText}
            </span>
          </div>
          <ChevronDown
            className="w-4 h-4 text-white/40 transition-transform duration-200 shrink-0"
            style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
          />
        </div>
      </button>

      {/* 下半部平滑手風琴展開區（嚴格零外距/零內距在 motion.div 身上以消除最後一幀跳動） */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            key="accordion-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-3 border-t border-white/[0.08] space-y-3.5">
              {/* 頂部資訊與操作列 */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center flex-wrap gap-2">
                  {sentiment && (
                    <span className={sentimentCls}>{sentiment}</span>
                  )}
                  {stageInfo && !isPending && (
                    <span className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[10px] font-medium border ${
                      stageInfo.stage === 2
                        ? 'bg-emerald-500/[0.12] text-emerald-300 border-emerald-500/20'
                        : 'bg-sky-500/[0.12] text-sky-300 border-sky-500/20'
                    }`}>
                      <span>{stageInfo.label}</span>
                      {stageInfo.timeFormatted && (
                        <>
                          <span className="text-white/20">·</span>
                          <span className="tabular-nums opacity-80">{stageInfo.timeFormatted}</span>
                        </>
                      )}
                    </span>
                  )}
                  {isLiveOverlay && liveTagLabel ? (
                    <span className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-md bg-white/[0.08] border border-white/[0.10] text-[10px] text-white/70 font-medium">
                      {liveTagLabel === '盤中即時' && (
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      )}
                      <span>{liveTagLabel}</span>
                    </span>
                  ) : (
                    <span className="text-[11px] text-white/40 tabular-nums">
                      {report_date}
                    </span>
                  )}
                  {isAiPending && (
                    <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-white/[0.06] border border-white/[0.08] text-[10px] text-white/50 font-normal">
                      <Loader2 className="w-3 h-3 text-white/40 animate-spin" strokeWidth={1.75} />
                      <span>AI 整理中</span>
                    </span>
                  )}
                </div>

                {/* 僅在非指數且有 onRemove 時顯示移除按鈕 */}
                {!isIndex && onRemove && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onRemove(symbol)
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] text-white/55 hover:text-rose-300 bg-white/[0.05] hover:bg-rose-500/15 border border-white/[0.08] transition-colors"
                  >
                    移除
                  </button>
                )}
              </div>

              {/* 焦點短評 (AI 標題) */}
              {safeHeadline ? (
                <p className="text-[14px] font-medium text-white/95 leading-snug tracking-tight">
                  {safeHeadline}
                </p>
              ) : (
                <div className="flex items-center space-x-2 text-[12px] text-white/40">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/70" />
                  <span>已加入自選 · 等待行情同步</span>
                </div>
              )}

              {/* 重點分析條列 */}
              {bullets && bullets.length > 0 && (
                <div className="space-y-2 border-t border-white/[0.06] pt-3">
                  {bullets.map((bullet, idx) => (
                    <div key={idx} className="flex items-start space-x-2.5">
                      <span className="flex-shrink-0 w-[18px] h-[18px] rounded-full bg-white/[0.09] text-white/60 font-semibold flex items-center justify-center text-[10px] tabular-nums mt-0.5">
                        {idx + 1}
                      </span>
                      <p className="text-[13px] text-white/80 leading-relaxed flex-1">
                        {bullet}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {/* 相關報導 */}
              {news && news.length > 0 && (
                <div className="border-t border-white/[0.06] pt-2.5">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[12px] text-white/45 font-medium">相關報導</span>
                  </div>
                  <div className="space-y-1">
                    {news.map((item, idx) => (
                      <a
                        key={idx}
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group flex items-center justify-between p-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] transition-all"
                      >
                        <span className="text-[12.5px] text-white/70 group-hover:text-white/95 transition-colors line-clamp-1 flex-1 pr-2">
                          {item.title}
                        </span>
                        <ExternalLink
                          className="w-3.5 h-3.5 text-white/35 group-hover:text-white/60 shrink-0 transition-colors"
                          strokeWidth={1.75}
                        />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function StockCard(props) {
  return (
    <StockCardErrorBoundary report={props.report}>
      <StockCardContent {...props} />
    </StockCardErrorBoundary>
  )
}
