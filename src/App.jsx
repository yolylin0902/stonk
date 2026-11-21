import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import Header from './components/Header'
import MarketTabs from './components/MarketTabs'
import DateSelector from './components/DateSelector'
import StockCard from './components/StockCard'
import WatchlistModal from './components/WatchlistModal'
import EmptyState from './components/EmptyState'
import ParkSleepSection from './components/ParkSleepSection'
import { supabase } from './lib/supabase'
import { Loader2, BarChart3, Layers, Plus } from 'lucide-react'

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

// 待分析個股的輪詢上限（每次 4 秒，最多 6 次約 24 秒），避免無休止請求消耗 Supabase 配額
const MAX_POLL_ATTEMPTS = 6

export default function App() {
  // 帳號與 Session 管理
  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [authSubmitting, setAuthSubmitting] = useState(false)
  const [authError, setAuthError] = useState('')
  const [nicknameInput, setNicknameInput] = useState('')

  // 市場與報表狀態
  const [market, setMarket] = useState('US') // 'US' or 'TW'
  const [reports, setReports] = useState([])
  const [availableDates, setAvailableDates] = useState([])
  const [selectedDate, setSelectedDate] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [isWatchlistModalOpen, setIsWatchlistModalOpen] = useState(false)
  const [marketCounts, setMarketCounts] = useState({ US: 0, TW: 0 })

  // 待分析個股的計數器與超時狀態
  const pollCountRef = useRef(0)
  const [pollTimedOut, setPollTimedOut] = useState(false)

  // 檢視模式：自選個股 (STOCKS) 或 主要指數 (INDEX)
  const [cardViewMode, setCardViewMode] = useState('STOCKS')

  // 監聽 Supabase 驗證狀態
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      setSession(currentSession)
      setAuthLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession)
      setAuthLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  // Google OAuth 登入
  const handleGoogleSignIn = async () => {
    try {
      setAuthSubmitting(true)
      setAuthError('')
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin + window.location.pathname,
        },
      })
      if (error) throw error
    } catch (err) {
      setAuthError(err.message || 'Google 登入失敗')
      setAuthSubmitting(false)
    }
  }

  // 快速暱稱匿名登入（具備永久獨立 auth.uid()）
  const handleAnonymousSignIn = async (e) => {
    e.preventDefault()
    const trimmed = nicknameInput.trim()
    if (!trimmed) {
      setAuthError('請輸入您的暱稱')
      return
    }
    try {
      setAuthSubmitting(true)
      setAuthError('')
      const { error } = await supabase.auth.signInAnonymously({
        options: {
          data: {
            display_name: trimmed,
          },
        },
      })
      if (error) throw error
    } catch (err) {
      setAuthError(err.message || '快速登入失敗')
      setAuthSubmitting(false)
    }
  }

  // 登出
  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut()
    } catch (err) {
      console.error('登出失敗:', err)
    }
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

  // 2. 撈取當日指定市場的報告，並整合個人 watchlist 中剛新增尚未爬取報告的標的
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

      // 取得個人自選股表 (RLS 會自動篩選該使用者的標的)
      const { data: watchData } = await supabase.from('watchlist').select('*')

      const currentMarketReports = (allData || []).filter(
        (r) => r.market === targetMarket
      )

      // 檢查是否有在個人 watchlist 但尚未產出 daily_reports 的標的
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
          headline: pollTimedOut
            ? '暫未取得當日報告，請稍後點擊右上角重新整理'
            : '即時分析中，正在抓取最新行情與新聞...',
          story_bullets: pollTimedOut
            ? [
                '已將此標的加入自選追蹤，後端排程將於收盤後自動處理。',
                '若需立即更新，可確認背景同步守護程式是否已啟動。',
                '點擊右上角重新整理按鈕可再次嘗試獲取最新報告。'
              ]
            : [
                '已成功將此標的加入自選追蹤，後端同步守護程序已自動響應。',
                '正在透過金融數據源抓取最新交易日價格與漲跌幅。',
                '正在爬梳即時新聞並歸納關鍵驅動原因，完成後自動呈現。'
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
  }, [pollTimedOut])

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
    pollCountRef.current = 0
    setPollTimedOut(false)
    const latestDate = await loadAvailableDates(market)
    const targetDate = selectedDate || latestDate
    await loadReports(market, targetDate)
    await loadMarketCounts(targetDate)
  }

  // 登入後初始加載
  useEffect(() => {
    if (!session) return
    async function init() {
      const latestDate = await loadAvailableDates('US')
      await loadReports('US', latestDate)
      await loadMarketCounts(latestDate)
    }
    init()
  }, [session, loadAvailableDates, loadReports, loadMarketCounts])

  // 穩定的待分析個股 Key，避免 reports 物件頻繁異動造成重複觸發
  const pendingKey = useMemo(() => {
    return reports
      .filter((r) => r.isPending)
      .map((r) => r.symbol)
      .sort()
      .join(',')
  }, [reports])

  // 若目前畫面上有尚未分析完成的新自選股，自動短暫輪詢；超過 MAX_POLL_ATTEMPTS 次自動停止
  useEffect(() => {
    if (!pendingKey) {
      pollCountRef.current = 0
      setPollTimedOut(false)
      return
    }

    pollCountRef.current = 0
    setPollTimedOut(false)

    const timer = setInterval(() => {
      pollCountRef.current += 1
      if (pollCountRef.current >= MAX_POLL_ATTEMPTS) {
        clearInterval(timer)
        setPollTimedOut(true)
        return
      }
      loadReports(market, selectedDate)
    }, 4000)

    return () => clearInterval(timer)
  }, [pendingKey, market, selectedDate, loadReports])

  // 分離出「指數區」與「自選個股區」
  const indexReports = useMemo(() => {
    return reports.filter((r) => isMarketIndex(r.symbol))
  }, [reports])

  const userStockReports = useMemo(() => {
    return reports.filter((r) => !isMarketIndex(r.symbol))
  }, [reports])

  // Auth 載入中畫面
  if (authLoading) {
    return (
      <div className="min-h-screen bg-transparent text-white flex items-center justify-center">
        <div
          aria-hidden="true"
          className="fixed inset-0 -z-10 pointer-events-none overflow-hidden"
          style={{
            background: `
              radial-gradient(circle at 18% 15%, rgba(180, 200, 230, 0.16), transparent 45%),
              radial-gradient(circle at 85% 48%, rgba(130, 155, 195, 0.13), transparent 50%),
              radial-gradient(circle at 25% 85%, rgba(165, 180, 205, 0.12), transparent 45%)
            `
          }}
        />
        <div className="flex flex-col items-center space-y-3">
          <Loader2 className="w-7 h-7 animate-spin text-white/30" strokeWidth={1.75} />
          <span className="text-xs text-white/40 font-medium tracking-wide">載入中...</span>
        </div>
      </div>
    )
  }

  // 未登入：呈現 Liquid Glass 登入視窗
  if (!session) {
    return (
      <div className="min-h-screen bg-transparent text-white flex flex-col justify-center items-center px-4 py-8">
        <div
          aria-hidden="true"
          className="fixed inset-0 -z-10 pointer-events-none overflow-hidden"
          style={{
            background: `
              radial-gradient(circle at 18% 15%, rgba(180, 200, 230, 0.16), transparent 45%),
              radial-gradient(circle at 85% 48%, rgba(130, 155, 195, 0.13), transparent 50%),
              radial-gradient(circle at 25% 85%, rgba(165, 180, 205, 0.12), transparent 45%)
            `
          }}
        />

        <div className="w-full max-w-sm ios-glass rounded-[32px] p-7 border border-white/[0.12] shadow-2xl space-y-6">
          <div className="text-center space-y-1.5">
            <span className="text-[11px] font-semibold tracking-widest uppercase text-white/40">
              Personalized Watchlist
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-white">
              盤後市場分析
            </h1>
            <p className="text-xs text-white/50 leading-relaxed pt-1">
              個人獨立持股追蹤 · AI 收盤故事 · 即時避難雷達
            </p>
          </div>

          {authError && (
            <div className="p-3 rounded-2xl bg-[#FB7185]/[0.10] border border-[#FB7185]/[0.18] text-[#FDA4AF]/90 text-xs">
              {authError}
            </div>
          )}

          <div className="space-y-4">
            {/* Google 登入按鈕 */}
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={authSubmitting}
              className="w-full py-3.5 px-4 rounded-2xl bg-white/[0.12] hover:bg-white/[0.18] active:scale-[0.98] transition-all duration-150 flex items-center justify-center space-x-2.5 font-medium text-[13px] text-white border border-white/[0.14] shadow-sm disabled:opacity-40"
            >
              <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12.24 10.285V13.82h5.03c-.22 1.18-.89 2.18-1.91 2.85v2.37h3.09c1.81-1.67 2.85-4.13 2.85-7.06 0-.68-.06-1.34-.17-1.98l-8.89.285z" fill="#FFFFFF" fillOpacity="0.85"/>
                <path d="M12 21.6c2.6 0 4.79-.86 6.39-2.34l-3.09-2.37c-.86.58-1.96.93-3.3.93-2.53 0-4.68-1.71-5.45-4.01H3.35v2.45A9.6 9.6 0 0 0 12 21.6z" fill="#FFFFFF" fillOpacity="0.7"/>
                <path d="M6.55 13.81c-.2-.59-.31-1.22-.31-1.87s.11-1.28.31-1.87V7.62H3.35A9.593 9.593 0 0 0 2.4 12c0 1.55.37 3.01.95 4.38l3.2-2.57z" fill="#FFFFFF" fillOpacity="0.6"/>
                <path d="M12 5.74c1.41 0 2.68.49 3.68 1.44l2.76-2.76C16.78 2.86 14.59 2 12 2 7.74 2 4.09 4.45 2.4 8.04l3.2 2.49c.77-2.3 2.92-4.01 5.45-4.01z" fill="#FFFFFF" fillOpacity="0.75"/>
              </svg>
              <span>使用 Google 帳號登入</span>
            </button>

            {/* 分隔線 */}
            <div className="relative py-1 flex items-center justify-center">
              <div className="border-t border-white/[0.08] w-full" />
              <span className="bg-[#0e1219] px-3 text-[11px] text-white/35 font-medium rounded-full absolute">
                或快速暱稱登入
              </span>
            </div>

            {/* 快速暱稱永久登入表單 */}
            <form onSubmit={handleAnonymousSignIn} className="space-y-3">
              <div>
                <input
                  type="text"
                  placeholder="輸入你的暱稱 (如 菜鳥韭菜 / 投資家)"
                  value={nicknameInput}
                  onChange={(e) => setNicknameInput(e.target.value)}
                  className="w-full bg-white/[0.06] border border-white/[0.10] rounded-2xl px-4 py-3 text-[13px] text-white placeholder-white/30 focus:outline-none focus:border-white/[0.24] font-sans tracking-wide transition-colors"
                />
              </div>
              <button
                type="submit"
                disabled={authSubmitting || !nicknameInput.trim()}
                className="w-full py-3 px-4 rounded-2xl bg-white/[0.08] hover:bg-white/[0.14] active:scale-[0.98] transition-all duration-150 flex items-center justify-center space-x-2 font-medium text-[13px] text-white/90 border border-white/[0.10] disabled:opacity-40"
              >
                {authSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin text-white/70" strokeWidth={1.75} />
                ) : (
                  <span>快速開始 (匿名永久登入)</span>
                )}
              </button>
            </form>
          </div>

          {/* 隱私權政策連結 */}
          <div className="pt-2 text-center border-t border-white/[0.06]">
            <a
              href="./privacy.html"
              target="_blank"
              rel="noreferrer"
              className="text-[11px] text-white/40 hover:text-white/70 transition-colors underline underline-offset-4"
            >
              隱私權政策 (Privacy Policy)
            </a>
          </div>
        </div>
      </div>
    )
  }

  // 已登入：展示主儀表板
  return (
    <div className="min-h-screen bg-transparent text-white flex flex-col">
      {/* 玻璃後方低彩度光影（左上、右中、左下 3 團冷銀灰與深海霧藍，滑動時呈現通透折射） */}
      <div
        aria-hidden="true"
        className="fixed inset-0 -z-10 pointer-events-none overflow-hidden"
        style={{
          background: `
            radial-gradient(circle at 18% 15%, rgba(180, 200, 230, 0.16), transparent 45%),
            radial-gradient(circle at 85% 48%, rgba(130, 155, 195, 0.13), transparent 50%),
            radial-gradient(circle at 25% 85%, rgba(165, 180, 205, 0.12), transparent 45%)
          `
        }}
      />
      {/* 頂部導航 */}
      <Header
        user={session.user}
        onSignOut={handleSignOut}
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
          <div className="flex items-center justify-end px-1">
            <div className="flex items-center p-1 bg-white/[0.07] rounded-full">
              <button
                type="button"
                onClick={() => setCardViewMode('INDEX')}
                className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-full text-[12px] font-medium transition-all duration-150 active:scale-[0.97] ${
                  cardViewMode === 'INDEX'
                    ? 'bg-white/[0.16] text-white shadow-sm'
                    : 'text-white/40 hover:text-white/60'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5" strokeWidth={1.75} />
                <span>指數</span>
              </button>
              <button
                type="button"
                onClick={() => setCardViewMode('STOCKS')}
                className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-full text-[12px] font-medium transition-all duration-150 active:scale-[0.97] ${
                  cardViewMode === 'STOCKS'
                    ? 'bg-white/[0.16] text-white shadow-sm'
                    : 'text-white/40 hover:text-white/60'
                }`}
              >
                <Layers className="w-3.5 h-3.5" strokeWidth={1.75} />
                <span>個股</span>
              </button>
            </div>
          </div>
        </div>

        {/* 睡公園避難倒數 & 附近佔位雷達 */}
        <ParkSleepSection />

        {/* 錯誤警告條 */}
        {errorMsg && (
          <div className="p-3.5 rounded-2xl bg-[#FB7185]/[0.10] border border-[#FB7185]/[0.18] text-[#FDA4AF]/90 text-xs flex items-start space-x-2.5">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5 opacity-80"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <div className="flex-1 leading-relaxed">{errorMsg}</div>
          </div>
        )}

        {/* 報告列表載入狀態 */}
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center space-y-3">
            <Loader2 className="w-7 h-7 animate-spin text-white/25" />
            <span className="text-xs text-white/40 font-medium tracking-wide">
              {market === 'US' ? '美股' : '台股'}
            </span>
          </div>
        ) : reports.length === 0 ? (
          <EmptyState
            market={market}
            selectedDate={selectedDate}
            onOpenWatchlist={() => setIsWatchlistModalOpen(true)}
          />
        ) : (
          <div className="space-y-5 pb-10">
            {/* 1. 市場指數區 — 僅在 INDEX 模式顯示 */}
            {cardViewMode === 'INDEX' && (
              <section className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <span className="text-[11px] font-medium text-white/40 uppercase tracking-widest">
                    {market === 'US' ? '美股指數' : '台股指數'}
                  </span>
                  <span className="text-[10px] text-white/25 tabular-nums">{indexReports.length}</span>
                </div>
                {indexReports.length === 0 ? (
                  <div className="p-8 rounded-[24px] border border-dashed border-white/[0.07] bg-white/[0.02] text-center">
                    <p className="text-xs text-white/40">暫無指數數據</p>
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

            {/* 2. 自選個股區 — 僅在 STOCKS 模式顯示 */}
            {cardViewMode === 'STOCKS' && (
              <section className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <span className="text-[11px] font-medium text-white/40 uppercase tracking-widest">
                    自選股
                  </span>
                  <button
                    onClick={() => setIsWatchlistModalOpen(true)}
                    className="flex items-center space-x-1 text-[12px] text-white/50 hover:text-white/80 transition-colors duration-150 font-medium"
                  >
                    <Plus className="w-3.5 h-3.5" strokeWidth={1.75} />
                    <span>管理</span>
                  </button>
                </div>

                {userStockReports.length === 0 ? (
                  <div className="p-8 rounded-[24px] border border-dashed border-white/[0.07] bg-white/[0.02] text-center space-y-3">
                    <p className="text-xs text-white/40">尚無自選股</p>
                    <button
                      onClick={() => setIsWatchlistModalOpen(true)}
                      className="px-4 py-2 rounded-full bg-white/[0.08] hover:bg-white/[0.12] text-white/70 text-xs font-medium transition-all duration-150 active:scale-[0.97]"
                    >
                      + 新增自選股
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
        user={session.user}
      />
    </div>
  )
}
