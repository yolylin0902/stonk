import React, { useState, useEffect, useMemo } from 'react'
import { X, Plus, Trash2, AlertCircle, Check, Loader2, Sparkles, CheckSquare, Square, Search, ArrowRight } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { autoLookupStock } from '../lib/stockLookup'

export default function WatchlistModal({
  isOpen,
  onClose,
  onUpdated,
  currentProfile,
  onUpdateProfileHoldings
}) {
  const [watchlist, setWatchlist] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('ALL') // 'ALL', 'US', 'TW'

  // 輸入狀態
  const [symbolInput, setSymbolInput] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [feedback, setFeedback] = useState({ type: '', message: '' })

  // 即時自動辨識股票
  const detectedStock = useMemo(() => {
    return autoLookupStock(symbolInput)
  }, [symbolInput])

  useEffect(() => {
    if (isOpen) {
      loadWatchlist()
      setFeedback({ type: '', message: '' })
      setSymbolInput('')
    }
  }, [isOpen])

  const loadWatchlist = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('watchlist')
        .select('*')
        .order('market')
        .order('symbol')

      if (error) throw error
      setWatchlist(data || [])
    } catch (err) {
      console.error('讀取自選股失敗:', err)
      setFeedback({ type: 'error', message: '讀取自選股失敗：' + (err.message || '連線異常') })
    } finally {
      setLoading(false)
    }
  }

  const handleAddStock = async (e) => {
    e.preventDefault()
    if (!symbolInput.trim()) {
      setFeedback({ type: 'error', message: '請輸入股票代號（例如 SMCI, 2330, NVDA）' })
      return
    }

    // 自動爬梳代號與公司名稱
    const stockInfo = detectedStock || autoLookupStock(symbolInput)
    if (!stockInfo) {
      setFeedback({ type: 'error', message: '無法辨識此代號，請確認代號是否正確！' })
      return
    }

    const { symbol: cleanSymbol, name: cleanName, market: cleanMarket } = stockInfo

    try {
      setIsSubmitting(true)
      setFeedback({ type: '', message: '' })

      const { data, error } = await supabase.from('watchlist').insert([
        {
          symbol: cleanSymbol,
          name: cleanName,
          market: cleanMarket,
        },
      ]).select()

      if (error) {
        if (error.code === '23505') {
          // 已存在於資料庫，但自動幫當前成員打勾加入持倉
          if (currentProfile && onUpdateProfileHoldings) {
            onUpdateProfileHoldings(cleanSymbol, true)
            setFeedback({ type: 'success', message: `✨ ${cleanName} (${cleanSymbol}) 已加入【${currentProfile.name}】的持倉！` })
          } else {
            setFeedback({ type: 'error', message: `${cleanSymbol} 已在觀察庫中！` })
          }
          setSymbolInput('')
          loadWatchlist()
          if (onUpdated) onUpdated()
          return
        }
        throw error
      }

      // 新增成功，自動勾選加入當前使用者持倉
      if (currentProfile && onUpdateProfileHoldings) {
        onUpdateProfileHoldings(cleanSymbol, true)
      }

      setFeedback({
        type: 'success',
        message: `🎉 已自動識別並加入：${cleanName} (${cleanSymbol})！`
      })
      setSymbolInput('')
      loadWatchlist()
      if (onUpdated) onUpdated()
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || '新增失敗' })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteStock = async (id, stockName, stockSymbol) => {
    if (!confirm(`確定要從資料庫完全移除 ${stockName} (${stockSymbol}) 嗎？`)) {
      return
    }

    try {
      const { error } = await supabase.from('watchlist').delete().eq('id', id)
      if (error) throw error

      if (currentProfile && onUpdateProfileHoldings) {
        onUpdateProfileHoldings(stockSymbol, false)
      }

      setFeedback({ type: 'success', message: `已移除 ${stockName} (${stockSymbol})` })
      loadWatchlist()
      if (onUpdated) onUpdated()
    } catch (err) {
      setFeedback({ type: 'error', message: '刪除失敗：' + err.message })
    }
  }

  const toggleMemberHolding = (stockSymbol) => {
    if (!currentProfile || !onUpdateProfileHoldings) return
    const isCurrentlyHeld = currentProfile.holdings?.includes(stockSymbol)
    onUpdateProfileHoldings(stockSymbol, !isCurrentlyHeld)
  }

  if (!isOpen) return null

  const filteredWatchlist = activeTab === 'ALL'
    ? watchlist
    : watchlist.filter((s) => s.market === activeTab)

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
      <div className="w-full sm:max-w-md bg-[#0F172A] rounded-t-3xl sm:rounded-2xl border border-slate-800 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Modal 標題列 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-900/50">
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-base font-bold text-white">管理持倉與自選股</h2>
              {currentProfile && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 font-semibold border border-blue-500/30">
                  {currentProfile.avatar} {currentProfile.name}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">輸入代號自動識別公司名稱並加入觀察</p>
          </div>
          <button
            onClick={onClose}
            aria-label="關閉視窗"
            className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 回饋訊息 */}
        {feedback.message && (
          <div
            className={`mx-5 mt-4 p-3 rounded-xl text-xs flex items-center space-x-2 border ${
              feedback.type === 'error'
                ? 'bg-rose-500/10 text-rose-300 border-rose-500/20'
                : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
            }`}
          >
            {feedback.type === 'error' ? (
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-400" />
            ) : (
              <Check className="w-4 h-4 flex-shrink-0 text-emerald-400" />
            )}
            <span>{feedback.message}</span>
          </div>
        )}

        {/* 智慧極簡新增股票表單（只要輸入代號，自動爬出名稱與市場） */}
        <form onSubmit={handleAddStock} className="p-4 border-b border-slate-800 bg-slate-900/40 space-y-2.5">
          <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
            <span>新增追蹤標的</span>
            <span className="text-[10px] text-blue-400 font-normal">免打中文 · 自動抓取</span>
          </label>
          
          <div className="flex space-x-2">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="輸入代號 (如 SMCI, 2330, NVDA, TSLA)"
                value={symbolInput}
                onChange={(e) => setSymbolInput(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-xs text-white uppercase placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono tracking-wide"
                autoFocus
              />
            </div>
            <button
              type="submit"
              disabled={isSubmitting || !symbolInput.trim()}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold text-xs flex items-center space-x-1 shadow-md shadow-blue-600/30 hover:opacity-95 active:scale-95 disabled:opacity-40 transition-all flex-shrink-0"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  <span>加入觀察</span>
                </>
              )}
            </button>
          </div>

          {/* 即時智慧識別預覽條 */}
          {symbolInput.trim() && (
            <div className="rounded-xl bg-slate-800/60 border border-slate-700/60 px-3 py-2 text-xs flex items-center justify-between animate-fadeIn">
              {detectedStock ? (
                <div className="flex items-center space-x-2 truncate">
                  <span className="text-sm">{detectedStock.market === 'US' ? '🇺🇸' : '🇹🇼'}</span>
                  <div className="truncate">
                    <span className="font-bold text-white mr-1.5">{detectedStock.name}</span>
                    <span className="font-mono text-slate-400 text-[11px] font-semibold">({detectedStock.symbol})</span>
                  </div>
                </div>
              ) : (
                <div className="text-slate-400 text-[11px]">
                  正在識別代號... (台股請輸代碼如 2330，美股如 NVDA)
                </div>
              )}
              {detectedStock && (
                <span className="text-[10px] text-emerald-400 font-semibold px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 flex-shrink-0 ml-2">
                  已識別
                </span>
              )}
            </div>
          )}
        </form>

        {/* 頁籤篩選 */}
        <div className="flex items-center px-5 py-2 bg-slate-900/50 border-b border-slate-800/80 justify-between">
          <div className="flex space-x-2">
            {[
              { id: 'ALL', label: '全部' },
              { id: 'US', label: '美股' },
              { id: 'TW', label: '台股' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'bg-blue-600 text-white font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-slate-400">
            共 {filteredWatchlist.length} 檔
          </span>
        </div>

        {/* 自選股清單列表（含個人持倉勾選） */}
        <div className="p-5 overflow-y-auto flex-1 space-y-2">
          {loading ? (
            <div className="py-8 text-center text-slate-400 flex flex-col items-center justify-center space-y-2">
              <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
              <span className="text-xs">載入清單中...</span>
            </div>
          ) : filteredWatchlist.length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-xs">
              目前暫無自選個股，輸入代號即可一鍵加入！
            </div>
          ) : (
            filteredWatchlist.map((item) => {
              const isHeld = currentProfile?.holdings?.includes(item.symbol)
              return (
                <div
                  key={item.id}
                  className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                    isHeld
                      ? 'bg-blue-950/20 border-blue-500/40'
                      : 'bg-slate-900 border-slate-800/80 hover:border-slate-700'
                  }`}
                >
                  {/* 左側：勾選設為目前成員的持倉 */}
                  <div
                    onClick={() => toggleMemberHolding(item.symbol)}
                    className="flex items-center space-x-3 cursor-pointer flex-1 select-none"
                  >
                    <button
                      type="button"
                      className={`p-1 rounded-lg transition-colors ${
                        isHeld ? 'text-blue-400' : 'text-slate-600 hover:text-slate-400'
                      }`}
                    >
                      {isHeld ? (
                        <CheckSquare className="w-4 h-4 text-blue-400" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>

                    <div className="flex items-center space-x-2">
                      <span className="text-base">
                        {item.market === 'US' ? '🇺🇸' : '🇹🇼'}
                      </span>
                      <div>
                        <div className="text-xs font-bold text-white flex items-center space-x-1.5">
                          <span>{item.name}</span>
                          <span className="text-[11px] font-mono text-slate-400 font-medium">
                            {item.symbol}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 flex items-center space-x-1">
                          <span>{item.market === 'US' ? '美股' : '台股'}</span>
                          {isHeld && (
                            <span className="text-blue-400 font-medium">· 已入持倉</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 右側刪除按鈕 */}
                  <button
                    onClick={() => handleDeleteStock(item.id, item.name, item.symbol)}
                    aria-label="刪除"
                    className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 active:scale-90 transition-all ml-2"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
