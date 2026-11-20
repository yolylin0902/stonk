import React, { useState, useEffect } from 'react'
import { X, Plus, Trash2, AlertCircle, Check, Loader2, Sparkles, CheckSquare, Square } from 'lucide-react'
import { supabase } from '../lib/supabase'

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

  // 表單狀態
  const [symbol, setSymbol] = useState('')
  const [name, setName] = useState('')
  const [market, setMarket] = useState('US')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [feedback, setFeedback] = useState({ type: '', message: '' })

  useEffect(() => {
    if (isOpen) {
      loadWatchlist()
      setFeedback({ type: '', message: '' })
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
    if (!symbol.trim() || !name.trim()) {
      setFeedback({ type: 'error', message: '請填寫股票代號與公司名稱' })
      return
    }

    const cleanSymbol = symbol.trim().toUpperCase()
    const cleanName = name.trim()

    // 格式防呆
    if (market === 'TW' && !cleanSymbol.endsWith('.TW') && !cleanSymbol.endsWith('.TWO')) {
      setFeedback({ type: 'error', message: '台股代號請加上 .TW (例如 2330.TW)' })
      return
    }

    try {
      setIsSubmitting(true)
      setFeedback({ type: '', message: '' })

      const { data, error } = await supabase.from('watchlist').insert([
        {
          symbol: cleanSymbol,
          name: cleanName,
          market: market,
        },
      ]).select()

      if (error) {
        if (error.code === '23505') {
          // 已存在於資料庫，但自動幫當前成員打勾加入持倉
          if (currentProfile && onUpdateProfileHoldings) {
            onUpdateProfileHoldings(cleanSymbol, true)
            setFeedback({ type: 'success', message: `${cleanSymbol} 已加入 ${currentProfile.name} 的個人持倉！` })
          } else {
            throw new Error('此股票代號已存在於自選庫中！')
          }
          setSymbol('')
          setName('')
          loadWatchlist()
          return
        }
        throw error
      }

      // 新增成功的同時，自動勾選加入當前家庭成員的持倉
      if (currentProfile && onUpdateProfileHoldings) {
        onUpdateProfileHoldings(cleanSymbol, true)
      }

      setFeedback({ type: 'success', message: `已成功新增 ${cleanName} (${cleanSymbol}) 並納入 ${currentProfile?.name || '個人'} 持倉！` })
      setSymbol('')
      setName('')
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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
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
            <p className="text-xs text-slate-400">勾選為【{currentProfile?.name}】持股，或新增全域追蹤股票</p>
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

        {/* 新增股票表單 */}
        <form onSubmit={handleAddStock} className="p-5 border-b border-slate-800 bg-slate-900/30">
          <div className="text-xs font-semibold text-slate-300 mb-2.5">新增追蹤標的</div>
          
          <div className="grid grid-cols-3 gap-2 mb-2.5">
            <div className="col-span-1">
              <label htmlFor="market-select" className="text-[10px] text-slate-400 block mb-1">市場</label>
              <select
                id="market-select"
                value={market}
                onChange={(e) => setMarket(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-xs text-white focus:outline-none focus:border-blue-500 font-medium"
              >
                <option value="US">🇺🇸 美股</option>
                <option value="TW">🇹🇼 台股</option>
              </select>
            </div>

            <div className="col-span-2">
              <label htmlFor="symbol-input" className="text-[10px] text-slate-400 block mb-1">
                代號 {market === 'TW' ? '(如 2330.TW)' : '(如 NVDA)'}
              </label>
              <input
                id="symbol-input"
                type="text"
                placeholder={market === 'TW' ? '2330.TW' : 'NVDA'}
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white uppercase placeholder-slate-600 focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>
          </div>

          <div className="flex space-x-2">
            <div className="flex-1">
              <label htmlFor="name-input" className="text-[10px] text-slate-400 block mb-1">公司名稱 (如 輝達)</label>
              <input
                id="name-input"
                type="text"
                placeholder="公司名稱"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 font-medium"
              />
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={isSubmitting}
                className="h-[37px] px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold text-xs flex items-center space-x-1.5 shadow-md shadow-blue-600/30 hover:opacity-95 active:scale-95 disabled:opacity-50 transition-all"
              >
                {isSubmitting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <>
                    <Plus className="w-3.5 h-3.5" />
                    <span>新增</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>

        {/* 頁籤篩選 */}
        <div className="flex items-center px-5 py-2.5 bg-slate-900/50 border-b border-slate-800/80 justify-between">
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
              目前暫無股票，請利用上方表單新增！
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
