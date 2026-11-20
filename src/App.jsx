import React, { useState, useEffect, useCallback } from 'react'
import Header from './components/Header'
import MarketTabs from './components/MarketTabs'
import DateSelector from './components/DateSelector'
import StockCard from './components/StockCard'
import WatchlistModal from './components/WatchlistModal'
import EmptyState from './components/EmptyState'
import { supabase } from './lib/supabase'
import { Loader2, AlertCircle } from 'lucide-react'

export default function App() {
  const [market, setMarket] = useState('US') // 'US' or 'TW'
  const [reports, setReports] = useState([])
  const [availableDates, setAvailableDates] = useState([])
  const [selectedDate, setSelectedDate] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [isWatchlistModalOpen, setIsWatchlistModalOpen] = useState(false)
  const [marketCounts, setMarketCounts] = useState({ US: 0, TW: 0 })

  // 1. 撈取特定市場的所有有資料的日期
  const loadAvailableDates = useCallback(async (currentMarket) => {
    try {
      const { data, error } = await supabase
        .table('daily_reports')
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

  // 2. 撈取當日指定市場的個股報告
  const loadReports = useCallback(async (targetMarket, targetDate) => {
    try {
      setLoading(true)
      setErrorMsg('')

      let query = supabase
        .table('daily_reports')
        .select('*')
        .eq('market', targetMarket)

      if (targetDate) {
        query = query.eq('report_date', targetDate)
      }

      const { data, error } = await query
        .order('change_percent', { ascending: false }) // 按漲幅由高到低排列

      if (error) throw error
      setReports(data || [])
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
      let query = supabase.table('daily_reports').select('market')
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
        {/* 市場頁籤切換 (美股盤後 / 台股盤後) */}
        <MarketTabs
          activeMarket={market}
          onSelectMarket={handleMarketChange}
          counts={marketCounts}
        />

        {/* 日期選擇器 */}
        {availableDates.length > 0 && (
          <DateSelector
            availableDates={availableDates}
            selectedDate={selectedDate}
            onSelectDate={handleDateChange}
          />
        )}

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
        ) : reports.length === 0 ? (
          <EmptyState
            market={market}
            selectedDate={selectedDate}
            onOpenWatchlist={() => setIsWatchlistModalOpen(true)}
          />
        ) : (
          <div className="space-y-3.5 pb-8">
            {reports.map((report) => (
              <StockCard key={report.id || report.symbol} report={report} />
            ))}
          </div>
        )}
      </main>

      {/* 管理自選股彈出視窗 */}
      <WatchlistModal
        isOpen={isWatchlistModalOpen}
        onClose={() => setIsWatchlistModalOpen(false)}
        onUpdated={handleRefresh}
      />

      {/* 底部行動安全區域與版本資訊 */}
      <footer className="text-center py-4 text-[10px] text-slate-400 border-t border-slate-900 safe-bottom">
        收盤漲跌故事儀表板 · 自動化雲端運作 · Vercel + GitHub Actions
      </footer>
    </div>
  )
}
