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
import { Loader2, AlertCircle, Eye, EyeOff } from 'lucide-react'

export default function App() {
  const [market, setMarket] = useState('US') // 'US' or 'TW'
  const [reports, setReports] = useState([])
  const [allDateReports, setAllDateReports] = useState([]) // 用於家庭成員計算所有市場個股慘況
  const [availableDates, setAvailableDates] = useState([])
  const [selectedDate, setSelectedDate] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [isWatchlistModalOpen, setIsWatchlistModalOpen] = useState(false)
  const [marketCounts, setMarketCounts] = useState({ US: 0, TW: 0 })

  // Netflix 家庭成員狀態管理 (持久化於 localStorage)
  const [profiles, setProfiles] = useState(() => getStoredProfiles())
  const [activeProfileId, setActiveProfile] = useState(() => getActiveProfileId())
  const [filterOnlyHoldings, setFilterOnlyHoldings] = useState(false) // 是否僅看該朋友持倉

  const currentProfile = useMemo(() => {
    return profiles.find((p) => p.id === activeProfileId) || profiles[0]
  }, [profiles, activeProfileId])

  // 切換家庭成員
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

  // 更新當前成員的持股清單
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

  // 2. 撈取當日指定市場的個股報告，同時拉取當日全市場資料給家庭頭像分析
  const loadReports = useCallback(async (targetMarket, targetDate) => {
    try {
      setLoading(true)
      setErrorMsg('')

      // 撈取當日全市場資料（給偷看跌多慘用）
      let allQuery = supabase.from('daily_reports').select('*')
      if (targetDate) {
        allQuery = allQuery.eq('report_date', targetDate)
      }
      const { data: allData } = await allQuery
      if (allData) {
        setAllDateReports(allData)
      }

      // 篩選當前市場報告
      const currentMarketReports = (allData || []).filter(
        (r) => r.market === targetMarket
      )
      setReports(
        currentMarketReports.sort(
          (a, b) => Number(b.change_percent) - Number(a.change_percent)
        )
      )
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

  // 根據家庭成員持倉過濾顯示的報告清單
  const displayedReports = useMemo(() => {
    if (!filterOnlyHoldings) return reports
    const memberHoldings = currentProfile?.holdings || []
    return reports.filter((r) => memberHoldings.includes(r.symbol))
  }, [reports, filterOnlyHoldings, currentProfile])

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

          {/* 使用者持倉過濾開關 */}
          <div className="flex items-center justify-between px-1 text-xs">
            <span className="text-slate-400">
              顯示標的：
              <span className="text-white font-medium">
                {filterOnlyHoldings
                  ? `只看 ${currentProfile.name} 的自選 (${currentProfile.holdings?.length || 0}檔)`
                  : '全市場收盤報告'}
              </span>
            </span>
            <button
              onClick={() => setFilterOnlyHoldings(!filterOnlyHoldings)}
              className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all ${
                filterOnlyHoldings
                  ? 'bg-blue-600/20 text-blue-300 border-blue-500/40 shadow-sm'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {filterOnlyHoldings ? (
                <>
                  <Eye className="w-3 h-3 text-blue-400" />
                  <span>顯示全部</span>
                </>
              ) : (
                <>
                  <EyeOff className="w-3 h-3 text-slate-400" />
                  <span>只看此人持股</span>
                </>
              )}
            </button>
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
              正在獲取 {market === 'US' ? '美股' : '台股'} 最新收盤故事...
            </span>
          </div>
        ) : displayedReports.length === 0 ? (
          <EmptyState
            market={market}
            selectedDate={selectedDate}
            onOpenWatchlist={() => setIsWatchlistModalOpen(true)}
          />
        ) : (
          <div className="space-y-3.5 pb-8">
            {displayedReports.map((report) => (
              <StockCard key={report.id || report.symbol} report={report} />
            ))}
          </div>
        )}
      </main>

      {/* 管理自選股彈出視窗（支援為特定成員打勾持倉） */}
      <WatchlistModal
        isOpen={isWatchlistModalOpen}
        onClose={() => setIsWatchlistModalOpen(false)}
        onUpdated={handleRefresh}
        currentProfile={currentProfile}
        onUpdateProfileHoldings={handleUpdateProfileHoldings}
      />

      {/* 底部行動安全區域與版本資訊 */}
      <footer className="text-center py-4 text-[10px] text-slate-400 border-t border-slate-900 safe-bottom">
        收盤漲跌故事儀表板 · 韭菜家庭方案 · 自動化雲端運作
      </footer>
    </div>
  )
}
