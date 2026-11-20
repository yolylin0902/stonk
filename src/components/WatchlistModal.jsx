import React, { useState, useEffect, useMemo, useRef } from 'react'
import { X, Plus, Trash2, AlertCircle, Check, Loader2, CheckSquare, Square, Search } from 'lucide-react'
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
            setFeedback({ type: 'success', message: `${cleanName} (${cleanSymbol}) 已加入持倉` })
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
        message: `已加入【${cleanName} (${cleanSymbol})】`
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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-md">
      <div className="w-full sm:max-w-md ios-glass rounded-t-[32px] sm:rounded-[28px] shadow-2xl overflow-hidden max-h-[92vh] flex flex-col ios-fade-in">
        {/* iOS Grabber */}
        <div className="w-9 h-1 rounded-full bg-white/25 mx-auto mt-3 mb-1 flex-shrink-0" />

        {/* Modal 標題列 */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.07] flex-shrink-0">
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-[17px] font-semibold text-white/95 tracking-tight">自選股</h2>
              {currentProfile && (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/[0.08] text-white/60 font-medium">
                  {currentProfile.avatar} {currentProfile.name}
                </span>
              )}
            </div>
            <p className="text-[12px] text-white/40 mt-0.5">搜尋代號或名稱加入觀察</p>
          </div>
          <button
            onClick={onClose}
            aria-label="關閉視窗"
            className="p-2 rounded-full bg-white/[0.08] hover:bg-white/[0.14] text-white/60 hover:text-white transition-all duration-150 active:scale-[0.94]"
          >
            <X className="w-4 h-4" strokeWidth={1.75} />
          </button>
        </div>

        {/* 回饋訊息 */}
        {feedback.message && (
          <div
            className={`mx-5 mt-3 p-3 rounded-2xl text-xs flex items-center space-x-2 ${
              feedback.type === 'error'
                ? 'bg-[#FB7185]/[0.10] text-[#FDA4AF]/90 border border-[#FB7185]/[0.18]'
                : 'bg-[#34D399]/[0.08] text-[#6EE7B7]/90 border border-[#34D399]/[0.15]'
            }`}
          >
            {feedback.type === 'error' ? (
              <AlertCircle className="w-4 h-4 flex-shrink-0 opacity-80" strokeWidth={1.75} />
            ) : (
              <Check className="w-4 h-4 flex-shrink-0 opacity-80" strokeWidth={1.75} />
            )}
            <span>{feedback.message}</span>
          </div>
        )}

        {/* 雙向智慧搜尋新增表單 */}
        <div className="p-4 border-b border-white/[0.07] relative flex-shrink-0">
          <form onSubmit={handleAddStock} className="space-y-2">
            <label className="text-[11px] font-medium text-white/45 flex items-center justify-between">
              <span className="flex items-center space-x-1.5">
                <Search className="w-3.5 h-3.5" strokeWidth={1.75} />
                <span>搜尋</span>
              </span>
              <span className="text-[10px] text-white/30">代號或中英文名稱</span>
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
                  className="w-full bg-white/[0.06] border border-white/[0.09] rounded-xl px-3.5 py-2.5 text-[13px] text-white placeholder-white/30 focus:outline-none focus:border-white/[0.20] font-sans tracking-wide transition-colors"
                  autoFocus
                />
              </div>
              <button
                type="submit"
                disabled={isSubmitting || !symbolInput.trim()}
                className="px-4 py-2.5 rounded-xl bg-white/[0.14] hover:bg-white/[0.20] text-white font-medium text-[13px] flex items-center space-x-1.5 active:scale-[0.97] disabled:opacity-30 transition-all duration-150 flex-shrink-0"
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.75} />
                ) : (
                  <>
                    <Plus className="w-4 h-4" strokeWidth={1.75} />
                    <span>加入</span>
                  </>
                )}
              </button>
            </div>
          </form>

          {/* 雙向搜尋即時下拉建議選單（每檔股票即時展示價格、漲跌幅與持股資訊） */}
          {symbolInput.trim() && isDropdownFocused && searchResults.length > 0 && (
            <div className="absolute left-4 right-4 top-[82px] z-20 bg-[#1c1c1e]/95 backdrop-blur-xl border border-white/[0.12] rounded-2xl shadow-2xl overflow-hidden divide-y divide-white/[0.07] max-h-64 overflow-y-auto">
              <div className="px-3 py-1.5 bg-[#161618]/90 text-[10px] text-white/40 font-medium flex justify-between items-center sticky top-0 z-10 border-b border-white/[0.06]">
                <span>搜尋建議</span>
                <span className="text-white/50 tabular-nums">共 {searchResults.length} 筆</span>
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

                let priceColor = 'text-white/40'
                if (hasPrice) {
                  if (isUS) {
                    priceColor = isUp ? 'text-[#6EE7B7]/90' : (isDown ? 'text-[#FDA4AF]/90' : 'text-white/50')
                  } else {
                    priceColor = isUp ? 'text-[#FDA4AF]/90' : (isDown ? 'text-[#6EE7B7]/90' : 'text-white/50')
                  }
                }

                return (
                  <button
                    key={item.symbol}
                    type="button"
                    onClick={() => handleSelectAndAddStock(item)}
                    className="w-full text-left px-3.5 py-2.5 hover:bg-white/[0.06] flex items-center justify-between transition-colors group"
                  >
                    <div className="flex items-center space-x-2 truncate">
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/[0.07] text-white/50 flex-shrink-0">
                        {item.market === 'US' ? 'US' : 'TW'}
                      </span>
                      <span className="font-mono text-xs font-semibold text-white/80 bg-white/[0.08] px-1.5 py-0.5 rounded">
                        {item.symbol}
                      </span>
                      <span className="text-xs text-white/70 font-medium truncate group-hover:text-white">
                        {item.name}
                      </span>
                    </div>

                    {/* 即時股價與持股狀態展示 */}
                    <div className="flex items-center space-x-2.5 flex-shrink-0 ml-2">
                      {hasPrice ? (
                        <div className="text-right">
                          <div className="text-xs font-mono font-semibold text-white/90 tabular-nums tracking-tight">
                            {isUS ? `$${reportInfo.close_price}` : `NT$ ${reportInfo.close_price}`}
                          </div>
                          <div className={`text-[10px] font-mono font-semibold tabular-nums tracking-tight ${priceColor}`}>
                            {changePct > 0 ? `+${changePct}` : changePct}%
                          </div>
                        </div>
                      ) : (
                        <span className="text-[10px] text-white/30 font-medium">
                          同步中
                        </span>
                      )}
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-lg border transition-all ${
                        isHeld
                          ? 'bg-white/[0.12] text-white/90 border-white/[0.15]'
                          : isAlreadyIn
                          ? 'bg-white/[0.06] text-white/50 border-white/[0.08]'
                          : 'bg-white/[0.16] hover:bg-white/[0.22] text-white border-white/[0.18]'
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
            <div className="mt-2 rounded-2xl bg-white/[0.04] border border-white/[0.08] px-3.5 py-2 text-xs flex items-center justify-between">
              <div className="flex items-center space-x-2 truncate">
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/[0.07] text-white/50">
                  {detectedStock.market === 'US' ? 'US' : 'TW'}
                </span>
                <div className="truncate">
                  <span className="font-semibold text-white/90 mr-1.5">{detectedStock.name}</span>
                  <span className="font-mono text-white/45 text-[11px] font-medium">({detectedStock.symbol})</span>
                </div>
              </div>
              <span className="text-[10px] text-white/60 font-medium px-2 py-0.5 rounded-full bg-white/[0.08] border border-white/[0.10] flex-shrink-0 ml-2">
                已辨識
              </span>
            </div>
          )}
        </div>

        {/* 頁籤篩選 (iOS Segmented Control) */}
        <div className="flex items-center px-5 py-2.5 border-b border-white/[0.07] justify-between flex-shrink-0">
          <div className="flex p-0.5 bg-white/[0.06] rounded-full space-x-0.5">
            {[
              { id: 'ALL', label: '全部' },
              { id: 'US', label: '美股' },
              { id: 'TW', label: '台股' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`text-xs px-3 py-1 rounded-full font-medium transition-all duration-150 ${
                  activeTab === tab.id
                    ? 'bg-white/[0.16] text-white shadow-sm'
                    : 'text-white/40 hover:text-white/70'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-white/35 tabular-nums">
            {filteredWatchlist.length} 檔
          </span>
        </div>

        {/* 自選股清單列表（含個人持倉勾選與即時報價展示） */}
        <div className="p-5 overflow-y-auto flex-1 space-y-2">
          {loading ? (
            <div className="py-8 text-center text-white/40 flex flex-col items-center justify-center space-y-2">
              <Loader2 className="w-5 h-5 animate-spin text-white/30" strokeWidth={1.75} />
              <span className="text-xs">載入中...</span>
            </div>
          ) : filteredWatchlist.length === 0 ? (
            <div className="py-8 text-center text-white/35 text-xs">
              目前暫無自選股，輸入代號或名稱即可加入
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

              let priceColor = 'text-white/40'
              if (hasPrice) {
                if (isUS) {
                  priceColor = isUp ? 'text-[#6EE7B7]/90' : (isDown ? 'text-[#FDA4AF]/90' : 'text-white/50')
                } else {
                  priceColor = isUp ? 'text-[#FDA4AF]/90' : (isDown ? 'text-[#6EE7B7]/90' : 'text-white/50')
                }
              }

              return (
                <div
                  key={item.id}
                  className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all duration-150 ${
                    isHeld
                      ? 'bg-white/[0.07] border-white/[0.12]'
                      : 'bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.05]'
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
                        isHeld ? 'text-white/90' : 'text-white/25 hover:text-white/50'
                      }`}
                    >
                      {isHeld ? (
                        <CheckSquare className="w-4 h-4 text-white/90" strokeWidth={1.75} />
                      ) : (
                        <Square className="w-4 h-4" strokeWidth={1.75} />
                      )}
                    </button>

                    <div className="flex items-center space-x-2 truncate">
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/[0.06] text-white/45 flex-shrink-0">
                        {item.market === 'US' ? 'US' : 'TW'}
                      </span>
                      <div className="truncate">
                        <div className="text-xs font-semibold text-white/90 flex items-center space-x-1.5 truncate">
                          <span className="truncate">{item.name}</span>
                          <span className="text-[11px] font-mono text-white/45 font-medium flex-shrink-0">
                            {item.symbol}
                          </span>
                          {item.isOrphaned && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-white/[0.08] text-white/50 border border-white/[0.10] flex-shrink-0">
                              歷史資料
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-white/40 flex items-center space-x-1 mt-0.5">
                          <span>{item.market === 'US' ? '美股' : '台股'}</span>
                          {isHeld && (
                            <span className="text-white/60 font-medium">· 已入持倉</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 右側：即時報價展示與刪除按鈕 */}
                  <div className="flex items-center space-x-3 flex-shrink-0">
                    {hasPrice && (
                      <div className="text-right">
                        <div className="text-xs font-mono font-semibold text-white/90 tabular-nums tracking-tight">
                          {isUS ? `$${reportInfo.close_price}` : `NT$ ${reportInfo.close_price}`}
                        </div>
                        <div className={`text-[10px] font-mono font-semibold tabular-nums tracking-tight ${priceColor}`}>
                          {changePct > 0 ? `+${changePct}` : changePct}%
                        </div>
                      </div>
                    )}

                    <button
                      onClick={() => handleDeleteStock(item.id, item.name, item.symbol)}
                      aria-label="刪除"
                      title="刪除"
                      className="p-2 rounded-full text-white/30 hover:text-[#FDA4AF] hover:bg-white/[0.06] active:scale-95 transition-all duration-150"
                    >
                      <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
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
