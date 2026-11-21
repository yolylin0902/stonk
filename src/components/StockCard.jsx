import React, { Component } from 'react'
import { motion } from 'framer-motion'
import { Loader2, AlertTriangle } from 'lucide-react'
import { CARD_TAP } from '../motion/iosMotion'

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
        <div className="w-full min-h-[122px] text-left ios-glass rounded-[24px] p-4 border border-rose-500/20 bg-rose-500/[0.04] flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[16px] font-semibold text-rose-300">{sym}</span>
            <AlertTriangle className="w-4 h-4 text-rose-300" strokeWidth={2} />
          </div>
          <p className="text-[11px] text-rose-300/80">格式異常</p>
        </div>
      )
    }
    return this.props.children
  }
}

function StockCardContent({ report, liveQuote, isIndex, onSelect }) {
  const {
    symbol = '',
    name = '',
    market = 'US',
    close_price,
    change_percent,
    report_date,
    isPending,
    isAiPending,
  } = report || {}

  // 判斷是否顯示盤中即時報價疊加層（不更動既有收盤報告，僅在盤中/最新交易時段視覺疊加）
  let isLiveOverlay = false
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

      if (state === 'REGULAR' || state === 'PRE' || state === 'POST' || isDateNewer) {
        isLiveOverlay = true
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

  // 漲跌幅文字
  const changePctText = numChangePct != null
    ? `${numChangePct > 0 ? '+' : ''}${numChangePct.toFixed(2)}%`
    : '同步中'

  return (
    <motion.button
      type="button"
      whileTap={CARD_TAP}
      onClick={() => onSelect?.(symbol)}
      className="w-full min-h-[122px] text-left ios-glass rounded-[24px] p-4 border border-white/[0.12] flex flex-col justify-between transition-colors active:bg-white/[0.08]"
    >
      {/* 頂部列：股票代號與狀態微標 */}
      <div>
        <div className="flex items-center justify-between gap-1.5">
          <h2 className="text-[16px] font-semibold tracking-tight text-white truncate leading-tight">
            {symbol}
          </h2>
          {report?.isPending || report?.isAiPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-white/40 shrink-0" strokeWidth={1.75} />
          ) : isLiveOverlay ? (
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/80 animate-pulse shrink-0" />
          ) : null}
        </div>
        {/* 名稱列 */}
        <p className="text-[12px] text-white/50 truncate mt-0.5 leading-tight">
          {name || symbol}
        </p>
      </div>

      {/* 底部數值區 */}
      <div className="mt-3 flex flex-col items-start gap-1.5">
        <span className={`text-[20px] font-semibold tabular-nums tracking-tight leading-none ${trendTextColor}`}>
          {formattedPrice}
        </span>
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium tabular-nums ${trendCapsuleCls}`}>
          {changePctText}
        </span>
      </div>
    </motion.button>
  )
}

export default function StockCard(props) {
  return (
    <StockCardErrorBoundary report={props.report}>
      <StockCardContent {...props} />
    </StockCardErrorBoundary>
  )
}
