import React, { useState, useEffect, useCallback, useMemo } from 'react'
import Header from './components/Header'
import MarketTabs from './components/MarketTabs'
import DateSelector from './components/DateSelector'
import StockCard from './components/StockCard'
import WatchlistModal from './components/WatchlistModal'
import EmptyState from './components/EmptyState'
import ParkSleepSection from './components/ParkSleepSection'
import FamilyProfileBar from './components/FamilyProfileBar'
import {
  getStoredProfiles,
  saveStoredProfiles,
  getActiveProfileId,
  setActiveProfileId
} from './lib/profileManager'
import { supabase } from './lib/supabase'
import { Loader2, AlertCircle, BarChart3, Layers, Plus } from 'lucide-react'

// 判斷是否為市場指數或核心 ETF (放在指數區)
export const isMarketIndex = (symbol) => {
  if (!symbol) return false
  if (symbol.startsWith('^')) return true
  // 台股市場大盤與核心領域 ETF
  if (['0050.TW', '0056.TW', '00878.TW', '0052.TW', '00919.TW', '00929.TW'].includes(symbol)) return true
  // 美股主要指數型 ETF
  if (['SPY', 'QQQ', 'DIA', 'IWM', 'SOXX'].includes(symbol)) return true
  return false
}

export default function App() {
  const [market, setMarket] = useState('US') // 'US' or 'TW'
  const [reports, setReports] = useState([])
  const [allDateReports, setAllDateReports] = useState([])
  const [availableDates, setAvailableDates] = useState([])
  const [selectedDate, setSelectedDate] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [isWatchlistModalOpen, setIsWatchlistModalOpen] = useState(false)
  const [marketCounts, setMarketCounts] = useState({ US: 0, TW: 0 })

  // 使用者狀態管理 (持久化於 localStorage)
  const [profiles, setProfiles] = useState(() => getStoredProfiles())
  const [activeProfileId, setActiveProfile] = useState(() => getActiveProfileId())
  const [cardViewMode, setCardViewMode] = useState('STOCKS') // 'STOCKS' (自選個股) 或 'INDEX' (主要指數)

  const currentProfile = useMemo(() => {
    return profiles.find((p) => p.id === activeProfileId) || profiles[0]
  }, [profiles, activeProfileId])

  // 切換使用者
  const handleSelectProfile = (id) => {
    setActiveProfile(id)
    setActiveProfileId(id)
  }

  // 新增使用者
  const handleAddProfile = (newProfile) => {
    const updated = [...profiles, newProfile]
    setProfiles(updated)
    saveStoredProfiles(updated)
    handleSelectProfile(newProfile.id)
  }

  // 刪除使用者
  const handleDeleteProfile = (id) => {
    const updated = profiles.filter((p) => p.id !== id)
    setProfiles(updated)
    saveStoredProfiles(updated)
    if (activeProfileId === id && updated.length > 0) {
      handleSelectProfile(updated[0].id)
    }
  }

  // 更新當前使用者的持股清單
  const handleUpdateProfileHoldings = (symbol, isAdd) => {
    const updated = profiles.map((p) => {
      if (p.id === activeProfileId) {
        const currentHoldings = p.holdings || []
        const newHoldings = isAdd
          ? Array.from(new Set([...currentHoldings, symbol]))
          : currentHoldings.filter((s) => s !== symbol)
        return { ...p, holdings: newHoldings }
      }
      return p
    })
    setProfiles(updated)
    saveStoredProfiles(updated)
  }

  // 1. 撈取特定市場的所有有資料的日期
  const loadAvailableDates = useCallback(async (currentMarket) => {
    try {
      const { data, error } = await supabase
        .from('daily_reports')
        .select('report_date, market')
        .order('report_date', { ascending: false })

      if (error) throw error

      if (!data || data.length === 0) {
        setAvailableDates([])
        setSelectedDate('')
        return ''
      }

      // 取得該市場的唯一日期清單
      const marketDates = Array.from(
        new Set(
          data
            .filter((r) => r.market === currentMarket)
            .map((r) => r.report_date)
        )
      )

      setAvailableDates(marketDates)

      // 預設選中該市場的最新日期
      const latestDate = marketDates[0] || ''
      setSelectedDate(latestDate)
      return latestDate
    } catch (err) {
      console.error('撈取可用日期失敗:', err)
      setErrorMsg('無法載入日期清單：' + (err.message || '連線錯誤'))
      return ''
    }
  }, [])

  // 2. 撈取當日指定市場的報告，並整合 watchlist 中剛新增尚未爬取報告的標的
  const loadReports = useCallback(async (targetMarket, targetDate) => {
    try {
      setLoading(true)
      setErrorMsg('')

      // 撈取全量報告
      let allQuery = supabase.from('daily_reports').select('*')
      if (targetDate) {
        allQuery = allQuery.eq('report_date', targetDate)
      }
      const { data: allData } = await allQuery
      if (allData) {
        setAllDateReports(allData)
      }

      // 取得自選股表以確保使用者新加入的個股 (如 SMCI) 即使尚未爬蟲也能顯示
      const { data: watchData } = await supabase.from('watchlist').select('*')

      const currentMarketReports = (allData || []).filter(
        (r) => r.market === targetMarket
      )

      // 檢查是否有在 watchlist 但尚未產出 daily_reports 的標的
      const missingFromReports = (watchData || [])
        .filter(
          (w) =>
            w.market === targetMarket &&
            !currentMarketReports.some((r) => r.symbol === w.symbol)
        )
        .map((w) => ({
          id: 'pending_' + w.symbol,
          symbol: w.symbol,
          name: w.name,
          market: w.market,
          close_price: null,
          change_percent: null,
          sentiment: '中性',
          headline: '⚡ AI 即時分析中，正在抓取最新盤勢與新聞...',
          story_bullets: [
            '已成功將此標的加入自選追蹤，後端同步守護程序已自動響應。',
            '正在透過金融數據源抓取最新交易日價格與漲跌幅。',
            'Gemini AI 正在爬梳即時新聞並歸納關鍵驅動原因，完成後自動呈現。'
          ],
          news_links: [],
          isPending: true
        }))

      const combined = [...currentMarketReports, ...missingFromReports].sort(
        (a, b) => {
          // 指數置頂，其餘按漲跌幅排序
          const aIsIdx = isMarketIndex(a.symbol)
          const bIsIdx = isMarketIndex(b.symbol)
          if (aIsIdx && !bIsIdx) return -1
          if (!aIsIdx && bIsIdx) return 1
          return Number(b.change_percent || 0) - Number(a.change_percent || 0)
        }
      )

      setReports(combined)
    } catch (err) {
      console.error('撈取報告失敗:', err)
      setErrorMsg('載入報告失敗：' + (err.message || '請檢查網路連線或金鑰設定'))
      setReports([])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  // 3. 統計各市場的報告數量
  const loadMarketCounts = useCallback(async (targetDate) => {
    try {
      let query = supabase.from('daily_reports').select('market')
      if (targetDate) {
        query = query.eq('report_date', targetDate)
      }
      const { data } = await query
      if (data) {
        const us = data.filter((d) => d.market === 'US').length
        const tw = data.filter((d) => d.market === 'TW').length
        setMarketCounts({ US: us, TW: tw })
      }
    } catch {
      // 靜默
    }
  }, [])

  // 市場切換處理
  const handleMarketChange = async (newMarket) => {
    setMarket(newMarket)
    const latestDate = await loadAvailableDates(newMarket)
    await loadReports(newMarket, latestDate)
    await loadMarketCounts(latestDate)
  }

  // 日期切換處理
  const handleDateChange = async (newDate) => {
    setSelectedDate(newDate)
    await loadReports(market, newDate)
    await loadMarketCounts(newDate)
  }

  // 手動重新整理
  const handleRefresh = async () => {
    setRefreshing(true)
    const latestDate = await loadAvailableDates(market)
    const targetDate = selectedDate || latestDate
    await loadReports(market, targetDate)
    await loadMarketCounts(targetDate)
  }

  // 初始加載
  useEffect(() => {
    async function init() {
      const latestDate = await loadAvailableDates('US')
      await loadReports('US', latestDate)
      await loadMarketCounts(latestDate)
    }
    init()
  }, [loadAvailableDates, loadReports, loadMarketCounts])

  // 若目前畫面上有尚未分析完成的新自選股，自動短暫輪詢以實現即時「幾秒內自動更新」體驗
  useEffect(() => {
    const hasPending = reports.some((r) => r.isPending)
    if (!hasPending) return

    const timer = setInterval(() => {
      loadReports(market, selectedDate)
    }, 4000)

    return () => clearInterval(timer)
  }, [reports, market, selectedDate, loadReports])

  // 分離出「指數區」與「自選個股區」
  const indexReports = useMemo(() => {
    return reports.filter((r) => isMarketIndex(r.symbol))
  }, [reports])

  const userStockReports = useMemo(() => {
    return reports.filter((r) => !isMarketIndex(r.symbol))
  }, [reports])

  return (
    <div className="min-h-screen bg-[#0B0F19] text-slate-100 flex flex-col selection:bg-blue-600 selection:text-white">
      {/* 頂部導航 */}
      <Header
        onOpenWatchlist={() => setIsWatchlistModalOpen(true)}
        onRefresh={handleRefresh}
        isRefreshing={refreshing}
      />

      {/* 主內容區塊 - Mobile-First 容器 */}
      <main className="flex-1 max-w-md w-full mx-auto px-4 py-4 space-y-4">
        {/* 使用者模式切換欄位 */}
        <FamilyProfileBar
          profiles={profiles}
          activeProfileId={activeProfileId}
          onSelectProfile={handleSelectProfile}
          onAddProfile={handleAddProfile}
          onDeleteProfile={handleDeleteProfile}
        />

        {/* 市場頁籤切換 (美股盤後 / 台股盤後) */}
        <MarketTabs
          activeMarket={market}
          onSelectMarket={handleMarketChange}
          counts={marketCounts}
        />

        {/* 日期選擇器與持倉過濾開關 */}
        <div className="space-y-2">
          {availableDates.length > 0 && (
            <DateSelector
              availableDates={availableDates}
              selectedDate={selectedDate}
              onSelectDate={handleDateChange}
            />
          )}

          {/* 切換主要指數與自選個股字卡 */}
          <div className="flex items-center justify-between px-1 text-xs">
            <span className="text-slate-400">
              字卡模式：
              <span className="text-white font-bold ml-1">
                {cardViewMode === 'INDEX'
                  ? (market === 'US' ? '美股主要指數' : '台股主要指數/ETF')
                  : '自選個股'}
              </span>
            </span>

            <div className="flex items-center p-0.5 bg-slate-900 border border-slate-800 rounded-xl shadow-inner">
              <button
                type="button"
                onClick={() => setCardViewMode('INDEX')}
                className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  cardViewMode === 'INDEX'
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                <span>主要指數</span>
                <span className="text-[10px] opacity-80 font-mono">({indexReports.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setCardViewMode('STOCKS')}
                className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  cardViewMode === 'STOCKS'
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>自選個股</span>
                <span className="text-[10px] opacity-80 font-mono">({userStockReports.length})</span>
              </button>
            </div>
          </div>
        </div>

        {/* 睡公園避難倒數 & 附近佔位雷達 */}
        <ParkSleepSection />

        {/* 錯誤警告條 */}
        {errorMsg && (
          <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-start space-x-2.5">
            <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-400 mt-0.5" />
            <div className="flex-1 leading-relaxed">{errorMsg}</div>
          </div>
        )}

        {/* 報告列表載入狀態 */}
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center space-y-3 text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            <span className="text-xs font-medium tracking-wide">
              正在獲取 {market === 'US' ? '美股' : '台股'} 最新收盤走勢...
            </span>
          </div>
        ) : reports.length === 0 ? (
          <EmptyState
            market={market}
            selectedDate={selectedDate}
            onOpenWatchlist={() => setIsWatchlistModalOpen(true)}
          />
        ) : (
          <div className="space-y-5 pb-8">
            {/* 1. 市場指數區 (四大指數 / 核心 ETF) - 僅在 cardViewMode === 'INDEX' 時顯示 */}
            {cardViewMode === 'INDEX' && (
              <section className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center space-x-1.5 text-xs font-bold text-slate-200">
                    <BarChart3 className="w-4 h-4 text-blue-400" />
                    <span>{market === 'US' ? '美股四大指數區' : '台股指數與市場 ETF'}</span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono">大盤基準 ({indexReports.length})</span>
                </div>
                {indexReports.length === 0 ? (
                  <div className="p-8 rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 text-center space-y-2">
                    <p className="text-xs text-slate-400">目前尚無指數數據</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {indexReports.map((report) => (
                      <StockCard key={report.id || report.symbol} report={report} />
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* 2. 自選個股區 (使用者自由新增) - 僅在 cardViewMode === 'STOCKS' 時顯示 */}
            {cardViewMode === 'STOCKS' && (
              <section className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center space-x-1.5 text-xs font-bold text-slate-200">
                    <Layers className="w-4 h-4 text-emerald-400" />
                    <span>自選個股區 ({userStockReports.length})</span>
                  </div>
                  <button
                    onClick={() => setIsWatchlistModalOpen(true)}
                    className="flex items-center space-x-1 text-[11px] text-blue-400 hover:text-blue-300 font-medium"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>新增自選股</span>
                  </button>
                </div>

                {userStockReports.length === 0 ? (
                  <div className="p-8 rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 text-center space-y-3">
                    <p className="text-xs text-slate-400">
                      目前尚無自選個股，留給使用者自由新增！
                    </p>
                    <button
                      onClick={() => setIsWatchlistModalOpen(true)}
                      className="px-4 py-2 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30 text-xs font-semibold hover:bg-blue-600/30 active:scale-95 transition-all"
                    >
                      + 新增自選個股 (例如 SMCI, NVDA)
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {userStockReports.map((report) => (
                      <StockCard key={report.id || report.symbol} report={report} />
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>
        )}
      </main>

      {/* 管理自選股彈出視窗 */}
      <WatchlistModal
        isOpen={isWatchlistModalOpen}
        onClose={() => setIsWatchlistModalOpen(false)}
        onUpdated={handleRefresh}
        currentProfile={currentProfile}
        onUpdateProfileHoldings={handleUpdateProfileHoldings}
      />
    </div>
  )
}
