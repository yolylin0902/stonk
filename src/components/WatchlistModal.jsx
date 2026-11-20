import React, { useState, useEffect, useMemo, useRef } from 'react'
import { X, Plus, Trash2, AlertCircle, Check, Loader2, Sparkles, CheckSquare, Square, Search, ArrowRight, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { autoLookupStock, searchStocksTwoWay } from '../lib/stockLookup'

export default function WatchlistModal({
  isOpen,
  onClose,
  onUpdated,
  currentProfile,
  onUpdateProfileHoldings
}) {
  const [watchlist, setWatchlist] = useState([])
  const [reportsMap, setReportsMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('ALL') // 'ALL', 'US', 'TW'

  // 輸入狀態與雙向搜尋
  const [symbolInput, setSymbolInput] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [feedback, setFeedback] = useState({ type: '', message: '' })
  const [isDropdownFocused, setIsDropdownFocused] = useState(false)

  // 雙向搜尋建議清單 (支援中文/英文關鍵字與股票代號)
  const searchResults = useMemo(() => {
    return searchStocksTwoWay(symbolInput, 8)
  }, [symbolInput])

  // 即時自動辨識之最佳股票
  const detectedStock = useMemo(() => {
    return searchResults[0] || autoLookupStock(symbolInput)
  }, [searchResults, symbolInput])

  useEffect(() => {
    if (isOpen) {
      loadWatchlist()
      setFeedback({ type: '', message: '' })
      setSymbolInput('')
    }
  }, [isOpen])

  // 讀取自選股清單（同時交叉比對 daily_reports，讀取最新股價、漲跌幅與情緒資訊）
  const loadWatchlist = async () => {
    try {
      setLoading(true)
      // 1. 撈取 watchlist 表
      const { data: watchData, error: wError } = await supabase
        .from('watchlist')
        .select('*')
        .order('market')
        .order('symbol')

      if (wError) throw wError

      // 2. 撈取 daily_reports 中所有現存的個股資訊 (包含價格、漲跌幅、情緒)
      const { data: drData } = await supabase
        .from('daily_reports')
        .select('symbol, name, market, close_price, change_percent, sentiment, headline')

      const rMap = {}
      if (drData) {
        for (const dr of drData) {
          rMap[dr.symbol] = dr
        }
      }
      setReportsMap(rMap)

      const existingSymbols = new Set((watchData || []).map((w) => w.symbol))
      const extraFromReports = []

      if (drData) {
        for (const dr of drData) {
          if (!existingSymbols.has(dr.symbol) && !extraFromReports.some((e) => e.symbol === dr.symbol)) {
            extraFromReports.push({
              id: 'dr_' + dr.symbol,
              symbol: dr.symbol,
              name: dr.name || dr.symbol,
              market: dr.market || 'US',
              isOrphaned: true
            })
          }
        }
      }

      setWatchlist([...(watchData || []), ...extraFromReports])
    } catch (err) {
      console.error('讀取自選股失敗:', err)
      setFeedback({ type: 'error', message: '讀取自選股失敗：' + (err.message || '連線異常') })
    } finally {
      setLoading(false)
    }
  }

  // 選取並加入股票（支援點擊搜尋建議直接加入）
  const handleSelectAndAddStock = async (stockInfo) => {
    if (!stockInfo) return
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
            setFeedback({ type: 'success', message: `✨ ${cleanName} (${cleanSymbol}) 已勾選加入【${currentProfile.name}】的持倉！` })
          } else {
            setFeedback({ type: 'error', message: `${cleanSymbol} 已在觀察庫中！` })
          }
          setSymbolInput('')
          setIsDropdownFocused(false)
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
        message: `🎉 已成功加入【${cleanName} (${cleanSymbol})】！即時同步守護程序已啟動，幾秒內即可在儀表板看到完整報告！`
      })
      setSymbolInput('')
      setIsDropdownFocused(false)
      loadWatchlist()
      if (onUpdated) onUpdated()
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || '新增失敗' })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleAddStock = async (e) => {
    e.preventDefault()
    if (!symbolInput.trim()) {
      setFeedback({ type: 'error', message: '請輸入股票代號或關鍵字（例如 google, 聯發科, SMCI, 2330）' })
      return
    }

    const stockInfo = detectedStock || autoLookupStock(symbolInput)
    if (!stockInfo) {
      setFeedback({ type: 'error', message: '無法辨識此股票，請確認代號或公司名稱！' })
      return
    }

    await handleSelectAndAddStock(stockInfo)
  }

  // 徹底刪除股票：同時清除 watchlist 與 daily_reports 報告，解決打錯名稱 (如 SMCI 美光) 刪不掉的問題
  const handleDeleteStock = async (id, stockName, stockSymbol) => {
    if (!confirm(`確定要完全刪除 ${stockName} (${stockSymbol}) 嗎？\n這將同時清除觀察清單與儀表板上的分析紀錄。`)) {
      return
    }

    try {
      // 1. 從 watchlist 刪除（以 id 與 symbol 雙重確保）
      if (id && !id.startsWith('dr_')) {
        await supabase.from('watchlist').delete().eq('id', id)
      }
      await supabase.from('watchlist').delete().eq('symbol', stockSymbol)

      // 2. 徹底清除 daily_reports 中的歷史紀錄
      await supabase.from('daily_reports').delete().eq('symbol', stockSymbol)

      // 3. 從當前使用者持倉中移除
      if (currentProfile && onUpdateProfileHoldings) {
        onUpdateProfileHoldings(stockSymbol, false)
      }

      setFeedback({ type: 'success', message: `✅ 已徹底移除 ${stockName} (${stockSymbol})` })
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
            <p className="text-xs text-slate-400 mt-0.5">搜尋代號或名稱，即時顯示最新行情與資訊</p>
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

        {/* 雙向智慧搜尋新增表單（打代號、打中文、打英文皆可搜尋） */}
        <div className="p-4 border-b border-slate-800 bg-slate-900/40 relative">
          <form onSubmit={handleAddStock} className="space-y-2">
            <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
              <span className="flex items-center space-x-1">
                <Search className="w-3.5 h-3.5 text-blue-400" />
                <span>雙向搜尋股票</span>
              </span>
              <span className="text-[10px] text-blue-400 font-normal">代號或中英文名稱皆可</span>
            </label>
            
            <div className="flex space-x-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="輸入代號或名稱 (如 google, 聯發科, SMCI, 2330)"
                  value={symbolInput}
                  onChange={(e) => {
                    setSymbolInput(e.target.value)
                    setIsDropdownFocused(true)
                  }}
                  onFocus={() => setIsDropdownFocused(true)}
                  className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 font-sans tracking-wide"
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
          </form>

          {/* 雙向搜尋即時下拉建議選單（每檔股票即時展示價格、漲跌幅與持股資訊） */}
          {symbolInput.trim() && isDropdownFocused && searchResults.length > 0 && (
            <div className="absolute left-4 right-4 top-[82px] z-20 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden divide-y divide-slate-800 max-h-64 overflow-y-auto">
              <div className="px-3 py-1.5 bg-slate-950/90 text-[10px] text-slate-400 font-medium flex justify-between items-center sticky top-0 z-10">
                <span>搜尋建議與最新行情</span>
                <span className="text-blue-400">共 {searchResults.length} 筆</span>
              </div>
              {searchResults.map((item) => {
                const isAlreadyIn = watchlist.some((w) => w.symbol === item.symbol)
                const reportInfo = reportsMap[item.symbol]
                const isHeld = currentProfile?.holdings?.includes(item.symbol)
                const isUS = item.market === 'US'
                const hasPrice = reportInfo && reportInfo.close_price != null
                const changePct = reportInfo?.change_percent
                const isUp = changePct > 0
                const isDown = changePct < 0

                let priceColor = 'text-slate-400'
                if (hasPrice) {
                  if (isUS) {
                    priceColor = isUp ? 'text-emerald-400' : (isDown ? 'text-rose-400' : 'text-slate-300')
                  } else {
                    priceColor = isUp ? 'text-rose-400' : (isDown ? 'text-emerald-400' : 'text-slate-300')
                  }
                }

                return (
                  <button
                    key={item.symbol}
                    type="button"
                    onClick={() => handleSelectAndAddStock(item)}
                    className="w-full text-left px-3.5 py-2.5 hover:bg-slate-800/80 flex items-center justify-between transition-colors group"
                  >
                    <div className="flex items-center space-x-2 truncate">
                      <span className="text-sm">{item.market === 'US' ? '🇺🇸' : '🇹🇼'}</span>
                      <span className="font-mono text-xs font-bold text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20">
                        {item.symbol}
                      </span>
                      <span className="text-xs text-slate-200 font-medium truncate group-hover:text-white">
                        {item.name}
                      </span>
                    </div>

                    {/* 即時股價與持股狀態展示 */}
                    <div className="flex items-center space-x-2.5 flex-shrink-0 ml-2">
                      {hasPrice ? (
                        <div className="text-right">
                          <div className="text-xs font-mono font-bold text-white">
                            {isUS ? `$${reportInfo.close_price}` : `NT$ ${reportInfo.close_price}`}
                          </div>
                          <div className={`text-[10px] font-mono font-semibold ${priceColor}`}>
                            {changePct > 0 ? `+${changePct}` : changePct}%
                          </div>
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-500 font-medium">
                          ⚡ 即時同步
                        </span>
                      )}
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-lg border transition-all ${
                        isHeld
                          ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                          : isAlreadyIn
                          ? 'bg-slate-800 text-slate-300 border-slate-700'
                          : 'bg-blue-600 hover:bg-blue-500 text-white border-blue-500 shadow-sm'
                      }`}>
                        {isHeld ? '持倉中' : isAlreadyIn ? '已觀察' : '+ 加入'}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {/* 若無下拉時，展示目前辨識結果 */}
          {symbolInput.trim() && !isDropdownFocused && detectedStock && (
            <div className="mt-2 rounded-xl bg-slate-800/60 border border-slate-700/60 px-3 py-2 text-xs flex items-center justify-between">
              <div className="flex items-center space-x-2 truncate">
                <span className="text-sm">{detectedStock.market === 'US' ? '🇺🇸' : '🇹🇼'}</span>
                <div className="truncate">
                  <span className="font-bold text-white mr-1.5">{detectedStock.name}</span>
                  <span className="font-mono text-slate-400 text-[11px] font-semibold">({detectedStock.symbol})</span>
                </div>
              </div>
              <span className="text-[10px] text-emerald-400 font-semibold px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 flex-shrink-0 ml-2">
                已辨識
              </span>
            </div>
          )}
        </div>

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

        {/* 自選股清單列表（含個人持倉勾選與即時報價展示） */}
        <div className="p-5 overflow-y-auto flex-1 space-y-2">
          {loading ? (
            <div className="py-8 text-center text-slate-400 flex flex-col items-center justify-center space-y-2">
              <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
              <span className="text-xs">載入清單中...</span>
            </div>
          ) : filteredWatchlist.length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-xs">
              目前暫無自選個股，輸入代號或公司關鍵字即可一鍵加入！
            </div>
          ) : (
            filteredWatchlist.map((item) => {
              const isHeld = currentProfile?.holdings?.includes(item.symbol)
              const reportInfo = reportsMap[item.symbol]
              const isUS = item.market === 'US'
              const hasPrice = reportInfo && reportInfo.close_price != null
              const changePct = reportInfo?.change_percent
              const isUp = changePct > 0
              const isDown = changePct < 0

              let priceColor = 'text-slate-400'
              if (hasPrice) {
                if (isUS) {
                  priceColor = isUp ? 'text-emerald-400' : (isDown ? 'text-rose-400' : 'text-slate-300')
                } else {
                  priceColor = isUp ? 'text-rose-400' : (isDown ? 'text-emerald-400' : 'text-slate-300')
                }
              }

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
                    className="flex items-center space-x-3 cursor-pointer flex-1 select-none truncate mr-2"
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

                    <div className="flex items-center space-x-2 truncate">
                      <span className="text-base flex-shrink-0">
                        {item.market === 'US' ? '🇺🇸' : '🇹🇼'}
                      </span>
                      <div className="truncate">
                        <div className="text-xs font-bold text-white flex items-center space-x-1.5 truncate">
                          <span className="truncate">{item.name}</span>
                          <span className="text-[11px] font-mono text-slate-400 font-medium flex-shrink-0">
                            {item.symbol}
                          </span>
                          {item.isOrphaned && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30 flex-shrink-0">
                              報告殘留
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400 flex items-center space-x-1 mt-0.5">
                          <span>{item.market === 'US' ? '美股' : '台股'}</span>
                          {isHeld && (
                            <span className="text-blue-400 font-medium">· 已入持倉</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 右側：即時報價展示與刪除按鈕 */}
                  <div className="flex items-center space-x-3 flex-shrink-0">
                    {hasPrice && (
                      <div className="text-right">
                        <div className="text-xs font-mono font-bold text-white">
                          {isUS ? `$${reportInfo.close_price}` : `NT$ ${reportInfo.close_price}`}
                        </div>
                        <div className={`text-[10px] font-mono font-semibold ${priceColor}`}>
                          {changePct > 0 ? `+${changePct}` : changePct}%
                        </div>
                      </div>
                    )}

                    <button
                      onClick={() => handleDeleteStock(item.id, item.name, item.symbol)}
                      aria-label="刪除"
                      title="完全刪除（清除自選與分析報告）"
                      className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 active:scale-90 transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
