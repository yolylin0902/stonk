import React, { useState, useMemo } from 'react'
import { Plus, X, Loader2, Check, AlertCircle } from 'lucide-react'
import { autoLookupStock, searchStocksTwoWay } from '../lib/stockLookup'

export default function AddStockCard({ market, onAddStock, existingSymbols = [] }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [inputVal, setInputVal] = useState('')
  const [nameVal, setNameVal] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [feedback, setFeedback] = useState({ type: '', message: '' })

  const isTW = market === 'TW'

  // 即時自動辨識標的與格式化代號
  const normalizedSymbol = useMemo(() => {
    let clean = inputVal.trim().toUpperCase()
    if (isTW && /^\d{4,6}$/.test(clean)) {
      clean = `${clean}.TW`
    }
    return clean
  }, [inputVal, isTW])

  // 嘗試透過已知字典或模糊搜尋辨識
  const detectedInfo = useMemo(() => {
    if (!inputVal.trim()) return null
    // 先搜代號
    const direct = autoLookupStock(normalizedSymbol)
    if (direct) return direct
    // 再搜名稱
    const searchRes = searchStocksTwoWay(inputVal.trim(), 1)
    if (searchRes.length > 0) return searchRes[0]
    return null
  }, [inputVal, normalizedSymbol])

  const handleExpand = () => {
    setIsExpanded(true)
    setFeedback({ type: '', message: '' })
  }

  const handleCollapse = () => {
    setIsExpanded(false)
    setInputVal('')
    setNameVal('')
    setFeedback({ type: '', message: '' })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setFeedback({ type: '', message: '' })

    let targetSymbol = normalizedSymbol
    let targetName = nameVal.trim()

    if (detectedInfo) {
      targetSymbol = detectedInfo.symbol
      if (!targetName) targetName = detectedInfo.name
    }

    if (!targetSymbol) {
      setFeedback({ type: 'error', message: '請輸入股票代號（例如 NVDA、2330）' })
      return
    }

    if (existingSymbols.includes(targetSymbol)) {
      setFeedback({ type: 'error', message: `${targetSymbol} 已在您的自選清單中` })
      return
    }

    if (!targetName) {
      targetName = targetSymbol
    }

    try {
      setIsSubmitting(true)
      const success = await onAddStock({
        symbol: targetSymbol,
        name: targetName,
        market: isTW ? 'TW' : 'US',
      })

      if (success) {
        setFeedback({ type: 'success', message: `已加入 ${targetSymbol} (${targetName})` })
        setInputVal('')
        setNameVal('')
      }
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || '新增失敗' })
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isExpanded) {
    return (
      <button
        type="button"
        onClick={handleExpand}
        className="w-full ios-glass rounded-[28px] p-5 border border-dashed border-white/[0.14] hover:border-white/[0.25] hover:bg-white/[0.05] cursor-pointer transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] flex items-center justify-center space-x-2.5 text-white/50 hover:text-white/85 active:scale-[0.985] group"
      >
        <span className="w-7 h-7 rounded-full bg-white/[0.08] group-hover:bg-white/[0.14] flex items-center justify-center transition-colors">
          <Plus className="w-4 h-4 text-white/70 group-hover:text-white" strokeWidth={2} />
        </span>
        <span className="text-[14px] font-medium tracking-tight">
          新增{isTW ? '台股' : '美股'}追蹤標的
        </span>
      </button>
    )
  }

  return (
    <div className="ios-glass rounded-[28px] p-5 border border-white/[0.16] shadow-xl transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] space-y-4 ios-card-transition">
      {/* 標題與收合按鈕 */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[16px] font-semibold text-white tracking-tight">
            新增{isTW ? '台股' : '美股'}自選股
          </h3>
          <p className="text-[12px] text-white/45 mt-0.5">
            輸入代號或名稱，即時加入個人收盤分析
          </p>
        </div>
        <button
          type="button"
          onClick={handleCollapse}
          aria-label="收合"
          className="w-7 h-7 rounded-full bg-white/[0.07] hover:bg-white/[0.14] text-white/50 hover:text-white flex items-center justify-center transition-all duration-150 active:scale-90"
        >
          <X className="w-3.5 h-3.5" strokeWidth={2} />
        </button>
      </div>

      {/* 回饋狀態 */}
      {feedback.message && (
        <div
          className={`p-2.5 rounded-xl text-xs flex items-center space-x-2 ${
            feedback.type === 'error'
              ? 'bg-[#FB7185]/[0.10] text-[#FDA4AF]/90 border border-[#FB7185]/[0.18]'
              : 'bg-[#34D399]/[0.08] text-[#6EE7B7]/90 border border-[#34D399]/[0.15]'
          }`}
        >
          {feedback.type === 'error' ? (
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 opacity-80" strokeWidth={1.75} />
          ) : (
            <Check className="w-3.5 h-3.5 flex-shrink-0 opacity-80" strokeWidth={1.75} />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* 極簡新增表單 */}
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="space-y-2">
          <div className="relative">
            <input
              type="text"
              autoFocus
              placeholder={isTW ? '輸入台股代號或名稱 (如 2330, 鴻海)' : '輸入美股代號或名稱 (如 NVDA, AAPL)'}
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              className="w-full bg-white/[0.06] border border-white/[0.10] rounded-2xl px-4 py-3 text-[13px] text-white placeholder-white/30 focus:outline-none focus:border-white/[0.24] font-sans tracking-wide transition-colors"
            />
          </div>

          {/* 自動辨識提示膠囊 */}
          {detectedInfo && (
            <div className="flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-white/[0.05] border border-white/[0.08] text-xs">
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/[0.08] text-white/50">
                已辨識
              </span>
              <span className="font-semibold text-white/90">{detectedInfo.name}</span>
              <span className="text-white/45 font-mono text-[11px]">({detectedInfo.symbol})</span>
            </div>
          )}

          {/* 選填自訂名稱（若未辨識出名稱） */}
          {!detectedInfo && inputVal.trim() && (
            <input
              type="text"
              placeholder="選填公司名稱 (留空預設使用代號)"
              value={nameVal}
              onChange={(e) => setNameVal(e.target.value)}
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3.5 py-2 text-[12px] text-white placeholder-white/25 focus:outline-none focus:border-white/[0.18] font-sans transition-colors"
            />
          )}
        </div>

        {/* 按鈕組 */}
        <div className="flex items-center justify-end space-x-2 pt-1">
          <button
            type="button"
            onClick={handleCollapse}
            className="px-4 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.10] text-white/60 hover:text-white text-[13px] font-medium transition-all duration-150 active:scale-95"
          >
            完成
          </button>
          <button
            type="submit"
            disabled={isSubmitting || !inputVal.trim()}
            className="px-5 py-2 rounded-xl bg-white/[0.16] hover:bg-white/[0.22] text-white text-[13px] font-medium flex items-center space-x-1.5 transition-all duration-150 active:scale-95 disabled:opacity-40 shadow-sm"
          >
            {isSubmitting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.75} />
            ) : (
              <>
                <Plus className="w-3.5 h-3.5" strokeWidth={2} />
                <span>加入</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  )
}
