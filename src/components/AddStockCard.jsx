import React, { useState, useMemo, useRef, useEffect, memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, X, Loader2, Check, AlertCircle } from 'lucide-react'
import { autoLookupStock, searchStocksTwoWay, ensureStockData } from '../lib/stockLookup'
import { IOS_SPRING, TACTILE_TAP, CARD_TAP } from '../motion/iosMotion'

function AddStockCard({ market, onAddStock, existingSymbols = [] }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [inputVal, setInputVal] = useState('')
  const [nameVal, setNameVal] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [feedback, setFeedback] = useState({ type: '', message: '' })
  const [dictReady, setDictReady] = useState(false)
  const inputRef = useRef(null)

  // 展開新增卡片時，非同步預載台美股大字典
  useEffect(() => {
    if (isExpanded) {
      ensureStockData().then(() => {
        setDictReady(true)
      })
    }
  }, [isExpanded])

  const isTW = market === 'TW'

  // 即時自動格式化代號 (大寫、美股特殊點換連字號)
  const normalizedSymbol = useMemo(() => {
    let clean = inputVal.trim().toUpperCase()
    if (!clean) return ''
    if (isTW) {
      if (/^\d{4,6}$/.test(clean)) {
        return clean
      }
      return clean
    } else {
      if (/^[A-Z]{1,5}\.[A-Z]$/.test(clean)) {
        return clean.replace('.', '-')
      }
      return clean
    }
  }, [inputVal, isTW])

  // 多筆模糊建議選項 (全台股上市+上櫃 & 美股)
  const suggestions = useMemo(() => {
    if (!inputVal.trim() || inputVal.trim().length < 1) return []
    return searchStocksTwoWay(inputVal.trim(), 4)
  }, [inputVal, dictReady])

  // 最優單筆辨識資訊
  const detectedInfo = useMemo(() => {
    if (!inputVal.trim()) return null
    if (suggestions.length > 0) return suggestions[0]
    return autoLookupStock(normalizedSymbol)
  }, [inputVal, suggestions, normalizedSymbol, dictReady])

  const handleExpand = () => {
    setIsExpanded(true)
    setFeedback({ type: '', message: '' })
    requestAnimationFrame(() => {
      inputRef.current?.focus()
    })
  }

  const handleCollapse = () => {
    setIsExpanded(false)
    setInputVal('')
    setNameVal('')
    setFeedback({ type: '', message: '' })
  }

  // 核心統一送出函式：嚴格空值與格式防呆
  const submitStock = async (rawSymbol, rawName = '') => {
    setFeedback({ type: '', message: '' })
    if (isSubmitting) return

    let sym = (rawSymbol || '').trim()
    let name = (rawName || '').trim()

    // 1. 若為空字串，直接擋下
    if (!sym) {
      setFeedback({ type: 'error', message: '請輸入有效的股票代號' })
      return
    }

    // 2. 嚴格防呆：阻擋純中文或未成功解析之中文代號
    if (/[\u4e00-\u9fa5]/.test(sym)) {
      setFeedback({ type: 'error', message: `「${sym}」查無對應之英數代號，請直接輸入代號（如 2330）` })
      return
    }

    // 3. 代號正規化
    let cleanUpper = sym.toUpperCase().replace(/\s+/g, '')

    // 美股小數點轉連字號 (例如 BRK.B -> BRK-B)
    if (!isTW && /^[A-Z]{1,5}\.[A-Z]$/.test(cleanUpper)) {
      cleanUpper = cleanUpper.replace('.', '-')
    }

    // 台股純數字 (4~6碼) 自動補 .TW
    if (isTW && /^\d{4,6}$/.test(cleanUpper)) {
      cleanUpper = `${cleanUpper}.TW`
    }

    // 4. 嚴格格式校驗：1~12 位大寫英數、點或連字號
    if (!/^[A-Z0-9.\-]{1,12}$/.test(cleanUpper)) {
      setFeedback({ type: 'error', message: `代號格式不正確：${cleanUpper}` })
      return
    }

    // 5. 阻擋大盤指數
    if (cleanUpper.startsWith('^')) {
      setFeedback({ type: 'error', message: '大盤指數已固定於指數區，無需手動新增' })
      return
    }

    // 6. 重複自選股檢查
    if (existingSymbols.includes(cleanUpper)) {
      setFeedback({ type: 'error', message: `${cleanUpper} 已在自選股清單中` })
      return
    }

    // 7. 補齊公司名稱
    if (!name) {
      if (detectedInfo?.name && (detectedInfo.symbol === cleanUpper || detectedInfo.symbol === sym)) {
        name = detectedInfo.name
      } else {
        name = cleanUpper
      }
    }

    try {
      setIsSubmitting(true)
      const success = await onAddStock({
        symbol: cleanUpper,
        name: name,
        market: isTW ? 'TW' : 'US',
      })

      if (success) {
        setFeedback({ type: 'success', message: `已加入 ${cleanUpper} (${name})` })
        setInputVal('')
        setNameVal('')
        requestAnimationFrame(() => {
          inputRef.current?.focus()
        })
        setTimeout(() => {
          setFeedback((prev) => (prev.type === 'success' ? { type: '', message: '' } : prev))
        }, 3500)
      }
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || '新增失敗' })
    } finally {
      setIsSubmitting(false)
    }
  }

  // 表單送出處理（使用者按下 Enter 或點擊「加入」）
  const handleSubmit = async (e) => {
    e.preventDefault()
    let raw = inputVal.trim()
    if (!raw) {
      setFeedback({ type: 'error', message: '請輸入股票代號（例如 NVDA、2330、元太）' })
      return
    }

    let targetSymbol = ''
    let targetName = nameVal.trim()

    // 1. 若輸入包含中文，由 suggestions 或 detectedInfo 解析出精準英數代號
    if (/[\u4e00-\u9fa5]/.test(raw)) {
      if (suggestions.length > 0 && suggestions[0].symbol) {
        targetSymbol = suggestions[0].symbol
        if (!targetName) targetName = suggestions[0].name || raw
      } else if (detectedInfo?.symbol && !/[\u4e00-\u9fa5]/.test(detectedInfo.symbol)) {
        targetSymbol = detectedInfo.symbol
        if (!targetName) targetName = detectedInfo.name || raw
      } else {
        setFeedback({ type: 'error', message: `查無「${raw}」對應之股票代號，請直接輸入代號（如 2330）` })
        return
      }
    } else {
      // 2. 純英數代號輸入
      const clean = raw.toUpperCase().replace(/\s+/g, '')
      if (isTW && /^\d{4,6}$/.test(clean)) {
        const found = suggestions.find((s) => s.symbol === `${clean}.TWO` || s.symbol === `${clean}.TW`)
        if (found) {
          targetSymbol = found.symbol
          if (!targetName) targetName = found.name
        } else {
          targetSymbol = `${clean}.TW`
        }
      } else {
        targetSymbol = clean
      }
    }

    await submitStock(targetSymbol, targetName)
  }

  return (
    <motion.div layout="position" transition={IOS_SPRING.smooth} className="w-full">
      <AnimatePresence mode="wait">
        {!isExpanded ? (
          <motion.button
            key="collapsed"
            type="button"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.12 }}
            whileTap={CARD_TAP}
            onClick={handleExpand}
            className="w-full ios-glass rounded-[28px] p-5 border border-dashed border-white/[0.14] hover:border-white/[0.25] hover:bg-white/[0.05] cursor-pointer flex items-center justify-center space-x-2.5 text-white/50 hover:text-white/85 group select-none"
          >
            <span className="w-7 h-7 rounded-full bg-white/[0.08] group-hover:bg-white/[0.14] flex items-center justify-center transition-colors">
              <Plus className="w-4 h-4 text-white/70 group-hover:text-white" strokeWidth={2} />
            </span>
            <span className="text-[14px] font-medium tracking-tight">
              新增{isTW ? '台股' : '美股'}追蹤標的
            </span>
          </motion.button>
        ) : (
          <motion.div
            key="expanded"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="w-full ios-glass rounded-[28px] p-5 border border-white/[0.16] shadow-xl space-y-3.5"
          >
            {/* 標題與收合按鈕 */}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-[16px] font-semibold text-white tracking-tight">
                  新增{isTW ? '台股' : '美股'}自選股
                </h3>
                <p className="text-[12px] text-white/45 mt-0.5">
                  支援全市場任意代號或中文名稱，支援連續新增
                </p>
              </div>
              <motion.button
                type="button"
                whileTap={TACTILE_TAP}
                onClick={handleCollapse}
                aria-label="收合"
                className="w-7 h-7 rounded-full bg-white/[0.07] hover:bg-white/[0.14] text-white/50 hover:text-white flex items-center justify-center transition-colors"
              >
                <X className="w-3.5 h-3.5" strokeWidth={2} />
              </motion.button>
            </div>

            {/* 回饋狀態 */}
            {feedback.message && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
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
              </motion.div>
            )}

            {/* 表單 */}
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="space-y-2">
                <div className="relative">
                  <input
                    ref={inputRef}
                    type="text"
                    autoFocus
                    placeholder={isTW ? '輸入台股代號或中文 (如 2330, 8069, 元太, 鴻海)' : '輸入美股代號或名稱 (如 NVDA, RKLB, BRK-B)'}
                    value={inputVal}
                    onChange={(e) => setInputVal(e.target.value)}
                    className="w-full bg-white/[0.06] border border-white/[0.10] rounded-2xl px-4 py-3 text-[13px] text-white placeholder-white/30 focus:outline-none focus:border-white/[0.24] font-sans tracking-wide transition-colors"
                  />
                </div>

                {/* 搜尋下拉推薦標籤 (點選直接一鍵加入) */}
                {suggestions.length > 0 && inputVal.trim() && (
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {suggestions.slice(0, 3).map((item) => (
                      <button
                        key={item.symbol}
                        type="button"
                        disabled={isSubmitting}
                        onClick={() => submitStock(item.symbol, item.name)}
                        className="px-2.5 py-1.5 rounded-lg bg-white/[0.08] hover:bg-white/[0.15] active:bg-white/[0.22] border border-white/[0.10] text-[11px] text-white/90 flex items-center space-x-1.5 transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        <Plus className="w-3 h-3 text-white/50" strokeWidth={2} />
                        <span className="font-semibold text-white/95">{item.name}</span>
                        <span className="text-white/40 font-mono">({item.symbol})</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* 當無任何建議膠囊且輸入非空時，顯示簡潔直接新增確認提示 */}
                {suggestions.length === 0 && inputVal.trim() && (
                  <div className="flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.07] text-xs">
                    <span className="text-white/40 text-[11px]">將直接新增：</span>
                    <span className="font-mono font-medium text-white/80">{normalizedSymbol || inputVal.trim()}</span>
                  </div>
                )}

                {/* 選填自訂名稱 */}
                {inputVal.trim() && (
                  <input
                    type="text"
                    placeholder="選填自訂公司名稱 (留空由系統自動聯網補齊)"
                    value={nameVal}
                    onChange={(e) => setNameVal(e.target.value)}
                    className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3.5 py-2 text-[12px] text-white placeholder-white/25 focus:outline-none focus:border-white/[0.18] font-sans transition-colors"
                  />
                )}
              </div>

              {/* 按鈕組 */}
              <div className="flex items-center justify-end space-x-2 pt-1">
                <motion.button
                  type="button"
                  whileTap={TACTILE_TAP}
                  onClick={handleCollapse}
                  className="px-4 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.10] text-white/60 hover:text-white text-[13px] font-medium transition-colors"
                >
                  完成
                </motion.button>
                <motion.button
                  type="submit"
                  whileTap={TACTILE_TAP}
                  onMouseDown={(e) => e.preventDefault()}
                  disabled={isSubmitting || !inputVal.trim()}
                  className="px-5 py-2 rounded-xl bg-white/[0.16] hover:bg-white/[0.22] text-white text-[13px] font-medium flex items-center space-x-1.5 transition-colors disabled:opacity-40 shadow-sm"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.75} />
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5" strokeWidth={2} />
                      <span>加入</span>
                    </>
                  )}
                </motion.button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export default memo(AddStockCard)
