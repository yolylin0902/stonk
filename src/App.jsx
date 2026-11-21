import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { motion, AnimatePresence, MotionConfig } from 'framer-motion'
import Header from './components/Header'
import MarketTabs from './components/MarketTabs'
import DateSelector from './components/DateSelector'
import StockCard from './components/StockCard'
import AddStockCard from './components/AddStockCard'
import ParkSleepSection from './components/ParkSleepSection'
import { supabase } from './lib/supabase'
import { Loader2, BarChart3, Layers } from 'lucide-react'
import { IOS_SPRING, TACTILE_TAP } from './motion/iosMotion'

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

// 待分析個股的輪詢上限（每次 5 秒，最多 15 次約 75 秒），避免無休止請求消耗 Supabase 配額
const MAX_POLL_ATTEMPTS = 15

export default function App() {
  // 帳號與 Session 管理
  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [authSubmitting, setAuthSubmitting] = useState(false)
  const [authError, setAuthError] = useState('')
  const [nicknameInput, setNicknameInput] = useState('')

  // 市場與報表狀態
  const [market, setMarket] = useState('US') // 'US' or 'TW'
  const [marketDirection, setMarketDirection] = useState(1) // 切換方向: 1 (US -> TW), -1 (TW -> US)
  const [reports, setReports] = useState([])
  const [availableDates, setAvailableDates] = useState([])
  const [selectedDate, setSelectedDate] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  // 待分析個股的計數器與超時狀態
  const pollCountRef = useRef(0)
  const pollTimedOutRef = useRef(false)
  const [pollTimedOut, setPollTimedOut] = useState(false)
  const availableDatesRef = useRef([])
  availableDatesRef.current = availableDates
  const reportsRef = useRef([])
  reportsRef.current = reports

  // 盤中即時報價獨立暫存狀態（純記憶體疊加，不覆蓋資料庫收盤日報）
  const [liveQuotes, setLiveQuotes] = useState({})
  const lastFetchLiveQuotesRef = useRef(0)

  // 判斷是否正在檢視該市場最新日期（歷史日期檢視下一律看收盤日報）
  const isViewingLatestDate = useMemo(() => {
    return !selectedDate || (availableDates.length > 0 && selectedDate === availableDates[0])
  }, [selectedDate, availableDates])

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

  // 2. 撈取當日指定市場的報告：指數區獨立於 watchlist；持股區嚴格比對個人自選清單
  // isSilent: 背景靜默刷新（如定時輪詢或新增後同步），絕不切換全域 loading 避免破壞 DOM 與輸入焦點
  const loadReports = useCallback(async (targetMarket, targetDate, isSilent = false) => {
    try {
      if (!isSilent) {
        setLoading(true)
      }
      setErrorMsg('')

      // 撈取指定日期的全部報告 (包含指數與各股票)
      let allQuery = supabase.from('daily_reports').select('*')
      if (targetDate) {
        allQuery = allQuery.eq('report_date', targetDate)
      }
      const { data: allData } = await allQuery

      // 取得個人自選股表 (RLS 會自動依 user_id 篩選該登入者的標的)
      const { data: watchData } = await supabase.from('watchlist').select('*')

      // ── A. 大盤指數獨立處理：只要符合指數標準即呈現，不依賴個人 watchlist 是否有追蹤 ──
      const indexReports = (allData || []).filter(
        (r) => r.market === targetMarket && isMarketIndex(r.symbol)
      )

      // ── B. 個人持股嚴格比對：只呈現該使用者 watchlist 中有追蹤的個股 ──
      const userWatchlist = (watchData || []).filter(
        (w) => w.market === targetMarket
      )

      const foundMap = new Map()
      for (const r of allData || []) {
        if (r.market === targetMarket) {
          foundMap.set(r.symbol, r)
        }
      }

      // 判斷是否正在檢視該市場最新日期（留空或等於清單第一筆即為最新日期）
      const latestAvailableDate = availableDatesRef.current[0]
      const isLatestDate = !targetDate || targetDate === latestAvailableDate

      // 找出當日查無資料的缺漏標的
      const missingSymbols = []
      for (const w of userWatchlist) {
        if (!foundMap.has(w.symbol)) {
          missingSymbols.push(w.symbol)
        }
      }

      // 若在最新日期檢視，針對缺漏標的向 daily_reports 查詢各自最新一筆紀錄作為回退
      const fallbackMap = new Map()
      if (isLatestDate && missingSymbols.length > 0) {
        try {
          const { data: fbData } = await supabase
            .from('daily_reports')
            .select('*')
            .in('symbol', missingSymbols)
            .order('report_date', { ascending: false })

          if (fbData) {
            for (const fb of fbData) {
              if (!fallbackMap.has(fb.symbol)) {
                fallbackMap.set(fb.symbol, fb)
              }
            }
          }
        } catch (fbErr) {
          console.debug('回退查詢最新資料略過:', fbErr)
        }
      }

      const userStockReports = userWatchlist.map((w) => {
        const found = foundMap.get(w.symbol) || fallbackMap.get(w.symbol)
        if (found) {
          return found
        }

        // 歷史日期檢視下，缺漏資料不應標記為 isPending，亦不應觸發輪詢
        if (!isLatestDate) {
          return {
            id: 'history_missing_' + w.symbol,
            symbol: w.symbol,
            name: w.name,
            market: w.market,
            close_price: null,
            change_percent: null,
            sentiment: '中性',
            headline: '此歷史日期尚無紀錄',
            story_bullets: ['此標的於該歷史交易日無收盤資料。可切換至最新日期檢視即時分析。'],
            news_links: [],
            isPending: false,
          }
        }

        // 最新日期下剛加入但尚未有 daily_reports 的新標的
        const isTimedOut = pollTimedOutRef.current
        return {
          id: 'pending_' + w.symbol,
          symbol: w.symbol,
          name: w.name,
          market: w.market,
          close_price: null,
          change_percent: null,
          sentiment: '中性',
          headline: isTimedOut
            ? '暫未取得收盤報告，可稍後點擊右上角重新整理'
            : '即時分析中，正在抓取最新行情與新聞...',
          story_bullets: isTimedOut
            ? [
                '已將此標的加入自選追蹤，後端排程將於收盤後自動處理。',
                '點擊右上角重新整理按鈕可再次嘗試獲取最新報告。'
              ]
            : [
                '已成功將此標的加入個人自選，後端同步程式已自動響應。',
                '正在抓取最新交易日價格、漲跌幅與關鍵新聞故事。'
              ],
          news_links: [],
          isPending: !isTimedOut
        }
      })

      // 排序：pending 固定排在最前面，已完成分析者按漲跌幅排序
      const pendingList = userStockReports.filter((r) => r.isPending)
      const readyList = userStockReports.filter((r) => !r.isPending)
      readyList.sort(
        (a, b) => Number(b.change_percent || 0) - Number(a.change_percent || 0)
      )
      const sortedUserStocks = [...pendingList, ...readyList]

      const combined = [...indexReports, ...sortedUserStocks]
      setReports((prevReports) => {
        if (prevReports.length !== combined.length) return combined
        let hasChanged = false
        const next = combined.map((newItem, idx) => {
          const oldItem = prevReports[idx]
          if (!oldItem) {
            hasChanged = true
            return newItem
          }
          const isSame =
            oldItem.symbol === newItem.symbol &&
            oldItem.close_price === newItem.close_price &&
            oldItem.change_percent === newItem.change_percent &&
            oldItem.headline === newItem.headline &&
            oldItem.isPending === newItem.isPending &&
            oldItem.name === newItem.name
          if (isSame) {
            return oldItem
          } else {
            hasChanged = true
            return newItem
          }
        })
        return hasChanged ? next : prevReports
      })
    } catch (err) {
      console.error('撈取報告失敗:', err)
      setErrorMsg('載入報告失敗：' + (err.message || '請檢查網路連線或金鑰設定'))
      setReports([])
    } finally {
      if (!isSilent) {
        setLoading(false)
      }
      setRefreshing(false)
    }
  }, [])

  // 市場切換處理（記錄方向以產生空間滑動動效）
  const handleMarketChange = async (newMarket) => {
    if (newMarket === market) return
    const dir = newMarket === 'TW' ? 1 : -1
    setMarketDirection(dir)
    setMarket(newMarket)
    const latestDate = await loadAvailableDates(newMarket)
    await loadReports(newMarket, latestDate)
  }

  // 日期切換處理
  const handleDateChange = async (newDate) => {
    setSelectedDate(newDate)
    await loadReports(market, newDate)
  }

  // 背景獲取當前市場之盤中即時報價（mode: 'quote_only'，純記憶體運算，不寫入資料庫）
  const fetchLiveQuotes = useCallback(
    async (targetMarket, force = false) => {
      if (!session?.user) return
      const now = Date.now()
      if (!force && now - lastFetchLiveQuotesRef.current < 15000) {
        return // 15 秒防連點節流
      }
      lastFetchLiveQuotesRef.current = now

      try {
        const indexSymbols =
          targetMarket === 'TW'
            ? ['^TWII', '^TWOII']
            : ['^GSPC', '^IXIC', '^SOX', '^DJI']

        const currentReports = reportsRef.current || []
        const stockSymbols = currentReports
          .filter((r) => r.market === targetMarket)
          .map((r) => r.symbol)

        const symbols = Array.from(
          new Set([...indexSymbols, ...stockSymbols])
        )

        if (symbols.length === 0) return

        const { data, error } = await supabase.functions.invoke('sync-stock', {
          body: { mode: 'quote_only', symbols },
        })

        if (error) {
          console.warn('獲取盤中即時報價略過:', error)
          return
        }

        if (data?.quotes) {
          setLiveQuotes((prev) => ({ ...prev, ...data.quotes }))
        }
      } catch (err) {
        console.warn('背景更新盤中報價略過:', err)
      }
    },
    [session]
  )

  // 手動重新整理（同時刷新收盤日報與盤中即時行情）
  const handleRefresh = async () => {
    setRefreshing(true)
    pollCountRef.current = 0
    pollTimedOutRef.current = false
    setPollTimedOut(false)
    const latestDate = await loadAvailableDates(market)
    const targetDate = selectedDate || latestDate
    await Promise.allSettled([
      loadReports(market, targetDate, true),
      fetchLiveQuotes(market, true),
    ])
    setRefreshing(false)
  }

  // 登入後初始加載
  useEffect(() => {
    if (!session) return
    async function init() {
      const latestDate = await loadAvailableDates('US')
      await loadReports('US', latestDate)
    }
    init()
  }, [session, loadAvailableDates, loadReports])

  // 切換市場或報告載入後，靜默同步最新盤中行情
  useEffect(() => {
    if (session?.user && reports.length > 0) {
      fetchLiveQuotes(market, false)
    }
  }, [market, session, reports.length > 0, fetchLiveQuotes])

  // PWA 從背景回到前景時（且距離上次大於 60 秒），背景靜默刷新盤中即時行情
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const now = Date.now()
        if (now - lastFetchLiveQuotesRef.current > 60000) {
          fetchLiveQuotes(market, true)
        }
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [market, fetchLiveQuotes])

  // 穩定的待分析個股 Key，避免 reports 物件頻繁異動造成重複觸發
  const pendingKey = useMemo(() => {
    return reports
      .filter((r) => r.isPending)
      .map((r) => r.symbol)
      .sort()
      .join(',')
  }, [reports])

  // 若目前畫面上有尚未分析完成的新自選股，自動背景靜默輪詢（每 5 秒檢查一次，最多 15 次約 75 秒）
  useEffect(() => {
    if (!pendingKey) {
      pollCountRef.current = 0
      pollTimedOutRef.current = false
      setPollTimedOut(false)
      return
    }

    pollCountRef.current = 0
    pollTimedOutRef.current = false
    setPollTimedOut(false)

    const timer = setInterval(() => {
      pollCountRef.current += 1
      if (pollCountRef.current >= MAX_POLL_ATTEMPTS) {
        clearInterval(timer)
        pollTimedOutRef.current = true
        setPollTimedOut(true)
        loadReports(market, selectedDate, true)
        return
      }
      loadReports(market, selectedDate, true)
    }, 5000)

    return () => clearInterval(timer)
  }, [pendingKey, market, selectedDate, loadReports])

  // 分離出「指數區」與「自選個股區」
  const indexReports = useMemo(() => {
    return reports.filter((r) => isMarketIndex(r.symbol))
  }, [reports])

  const userStockReports = useMemo(() => {
    return reports.filter((r) => !isMarketIndex(r.symbol))
  }, [reports])

  // 自選股 symbol 清單，使用 useMemo 保持引用穩定
  const existingSymbols = useMemo(() => {
    return userStockReports.map((r) => r.symbol)
  }, [userStockReports])

  // 圖卡「一加（+）」：直接在自選股列表新增並寫入 Supabase watchlist
  const handleAddStock = useCallback(
    async ({ symbol, name, market: stockMarket }) => {
      if (!session?.user) return false
      try {
        const { error } = await supabase.from('watchlist').insert([
          {
            user_id: session.user.id,
            symbol,
            name,
            market: stockMarket,
          },
        ])

        if (error) {
          if (error.code === '23505') {
            throw new Error(`${symbol} 已在自選股清單中`)
          }
          throw error
        }

        pollCountRef.current = 0
        pollTimedOutRef.current = false
        setPollTimedOut(false)

        // 若使用者在歷史日期下新增股票，自動切換回最新日期檢視
        let targetDate = selectedDate
        const latestDate = availableDatesRef.current[0]
        if (latestDate && selectedDate !== latestDate) {
          setSelectedDate(latestDate)
          targetDate = latestDate
        }

        await loadReports(market, targetDate, true)

        // 非同步背景觸發雲端函式（不阻塞輸入框，讓使用者可繼續連續新增下一檔）
        supabase.functions
          .invoke('sync-stock', { body: { symbol, name, market: stockMarket } })
          .then(() => loadReports(market, targetDate, true))
          .catch((err) => console.error('雲端同步呼叫失敗:', err))

        return true
      } catch (err) {
        console.error('新增股票失敗:', err)
        throw err
      }
    },
    [session, market, selectedDate, loadReports]
  )

  // 圖卡「一減（−）」：直接在卡片上防誤觸兩段式移除
  const handleRemoveStock = useCallback(
    async (stockSymbol) => {
      if (!session?.user) return
      try {
        const { error } = await supabase
          .from('watchlist')
          .delete()
          .eq('user_id', session.user.id)
          .eq('symbol', stockSymbol)

        if (error) throw error

        // 本地立即過濾狀態以獲得平滑淡出反應
        setReports((prev) => prev.filter((r) => r.symbol !== stockSymbol))
      } catch (err) {
        console.error('移除自選股失敗:', err)
        setErrorMsg('移除自選股失敗：' + (err.message || '連線異常'))
      }
    },
    [session]
  )

  // Auth 載入中畫面
  if (authLoading) {
    return (
      <MotionConfig reducedMotion="user">
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
      </MotionConfig>
    )
  }

  // 未登入：呈現 Liquid Glass 歡迎卡片（iOS Context Menu 彈簧動效）
  if (!session) {
    return (
      <MotionConfig reducedMotion="user">
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

          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={IOS_SPRING.menu}
            className="w-full max-w-sm ios-glass rounded-[32px] p-7 border border-white/[0.12] shadow-2xl space-y-6"
          >
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
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3 rounded-2xl bg-[#FB7185]/[0.10] border border-[#FB7185]/[0.18] text-[#FDA4AF]/90 text-xs"
              >
                {authError}
              </motion.div>
            )}

            <div className="space-y-4">
              {/* Google 登入按鈕 */}
              <motion.button
                type="button"
                whileTap={TACTILE_TAP}
                transition={IOS_SPRING.snappy}
                onClick={handleGoogleSignIn}
                disabled={authSubmitting}
                className="w-full py-3.5 px-4 rounded-2xl bg-white/[0.12] hover:bg-white/[0.18] transition-colors flex items-center justify-center space-x-2.5 font-medium text-[13px] text-white border border-white/[0.14] shadow-sm disabled:opacity-40 select-none"
              >
                <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12.24 10.285V13.82h5.03c-.22 1.18-.89 2.18-1.91 2.85v2.37h3.09c1.81-1.67 2.85-4.13 2.85-7.06 0-.68-.06-1.34-.17-1.98l-8.89.285z" fill="#FFFFFF" fillOpacity="0.85"/>
                  <path d="M12 21.6c2.6 0 4.79-.86 6.39-2.34l-3.09-2.37c-.86.58-1.96.93-3.3.93-2.53 0-4.68-1.71-5.45-4.01H3.35v2.45A9.6 9.6 0 0 0 12 21.6z" fill="#FFFFFF" fillOpacity="0.7"/>
                  <path d="M6.55 13.81c-.2-.59-.31-1.22-.31-1.87s.11-1.28.31-1.87V7.62H3.35A9.593 9.593 0 0 0 2.4 12c0 1.55.37 3.01.95 4.38l3.2-2.57z" fill="#FFFFFF" fillOpacity="0.6"/>
                  <path d="M12 5.74c1.41 0 2.68.49 3.68 1.44l2.76-2.76C16.78 2.86 14.59 2 12 2 7.74 2 4.09 4.45 2.4 8.04l3.2 2.49c.77-2.3 2.92-4.01 5.45-4.01z" fill="#FFFFFF" fillOpacity="0.75"/>
                </svg>
                <span>使用 Google 帳號登入</span>
              </motion.button>

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
                <motion.button
                  type="submit"
                  whileTap={TACTILE_TAP}
                  transition={IOS_SPRING.snappy}
                  disabled={authSubmitting || !nicknameInput.trim()}
                  className="w-full py-3 px-4 rounded-2xl bg-white/[0.08] hover:bg-white/[0.14] transition-colors flex items-center justify-center space-x-2 font-medium text-[13px] text-white/90 border border-white/[0.10] disabled:opacity-40 select-none"
                >
                  {authSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin text-white/70" strokeWidth={1.75} />
                  ) : (
                    <span>快速開始 (匿名永久登入)</span>
                  )}
                </motion.button>
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
          </motion.div>
        </div>
      </MotionConfig>
    )
  }

  // 已登入：展示主儀表板
  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen bg-transparent text-white flex flex-col">
        {/* 玻璃後方低彩度光影 */}
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
        {/* 頂部導航（僅保留標題、目前暱稱膠囊與重新整理按鈕） */}
        <Header
          user={session.user}
          onSignOut={handleSignOut}
          onRefresh={handleRefresh}
          isRefreshing={refreshing}
        />

        {/* 主內容區塊 - Mobile-First 容器 */}
        <main className="flex-1 max-w-md w-full mx-auto px-4 py-4 space-y-4">
          {/* 市場頁籤切換（共享元素物理滑塊） */}
          <MarketTabs
            activeMarket={market}
            onSelectMarket={handleMarketChange}
          />

          {/* 美股／台股切換方向性過渡容器 */}
          <AnimatePresence mode="wait" custom={marketDirection}>
            <motion.div
              key={market}
              custom={marketDirection}
              initial={{ opacity: 0, x: marketDirection * 18 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -marketDirection * 18 }}
              transition={IOS_SPRING.smooth}
              className="space-y-4"
            >
              {/* 日期選擇器與持倉過濾開關 */}
              <div className="space-y-2">
                {availableDates.length > 0 && (
                  <DateSelector
                    availableDates={availableDates}
                    selectedDate={selectedDate}
                    onSelectDate={handleDateChange}
                  />
                )}

                {/* 切換主要指數與自選個股字卡（共享滑塊） */}
                <div className="flex items-center justify-end px-1">
                  <div className="relative flex items-center p-1 bg-white/[0.07] rounded-full border border-white/[0.07]">
                    <motion.button
                      type="button"
                      whileTap={TACTILE_TAP}
                      onClick={() => setCardViewMode('INDEX')}
                      className="relative z-10 flex items-center space-x-1.5 px-3.5 py-1.5 rounded-full text-[12px] font-medium transition-colors duration-150 outline-none select-none"
                    >
                      {cardViewMode === 'INDEX' && (
                        <motion.div
                          layoutId="view-mode-pill"
                          transition={IOS_SPRING.snappy}
                          className="absolute inset-0 rounded-full bg-white/[0.16] shadow-sm -z-10"
                        />
                      )}
                      <BarChart3 className="w-3.5 h-3.5" strokeWidth={1.75} />
                      <span className={cardViewMode === 'INDEX' ? 'text-white font-semibold' : 'text-white/40 hover:text-white/60'}>
                        指數
                      </span>
                    </motion.button>
                    <motion.button
                      type="button"
                      whileTap={TACTILE_TAP}
                      onClick={() => setCardViewMode('STOCKS')}
                      className="relative z-10 flex items-center space-x-1.5 px-3.5 py-1.5 rounded-full text-[12px] font-medium transition-colors duration-150 outline-none select-none"
                    >
                      {cardViewMode === 'STOCKS' && (
                        <motion.div
                          layoutId="view-mode-pill"
                          transition={IOS_SPRING.snappy}
                          className="absolute inset-0 rounded-full bg-white/[0.16] shadow-sm -z-10"
                        />
                      )}
                      <Layers className="w-3.5 h-3.5" strokeWidth={1.75} />
                      <span className={cardViewMode === 'STOCKS' ? 'text-white font-semibold' : 'text-white/40 hover:text-white/60'}>
                        個股
                      </span>
                    </motion.button>
                  </div>
                </div>
              </div>

              {/* 睡公園避難倒數 & 附近佔位雷達 */}
              <ParkSleepSection />

              {/* 錯誤警告條 */}
              {errorMsg && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-3.5 rounded-2xl bg-[#FB7185]/[0.10] border border-[#FB7185]/[0.18] text-[#FDA4AF]/90 text-xs flex items-start space-x-2.5"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5 opacity-80"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  <div className="flex-1 leading-relaxed">{errorMsg}</div>
                </motion.div>
              )}

              {/* 報告列表載入狀態 */}
              {loading ? (
                <div className="py-20 flex flex-col items-center justify-center space-y-3">
                  <Loader2 className="w-7 h-7 animate-spin text-white/25" />
                  <span className="text-xs text-white/40 font-medium tracking-wide">
                    {market === 'US' ? '美股' : '台股'}
                  </span>
                </div>
              ) : (
                <AnimatePresence mode="wait">
                  <motion.div
                    key={`${market}-${selectedDate}`}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={IOS_SPRING.smooth}
                    className="space-y-5 pb-10"
                  >
                    {/* 1. 市場指數區 — 僅在 INDEX 模式顯示（獨立穩定顯示，popLayout 補位） */}
                    {cardViewMode === 'INDEX' && (
                      <motion.section
                        key="index-section"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={IOS_SPRING.smooth}
                        className="space-y-3"
                      >
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
                            <AnimatePresence mode="popLayout" initial={false}>
                              {indexReports.map((report) => (
                                <StockCard
                                  key={report.symbol}
                                  report={report}
                                  liveQuote={isViewingLatestDate ? liveQuotes[report.symbol] : null}
                                />
                              ))}
                            </AnimatePresence>
                          </div>
                        )}
                      </motion.section>
                    )}

                    {/* 2. 自選個股區 — 僅在 STOCKS 模式顯示 */}
                    {cardViewMode === 'STOCKS' && (
                      <motion.section
                        key="stocks-section"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={IOS_SPRING.smooth}
                        className="space-y-3"
                      >
                        <div className="flex items-center justify-between px-1">
                          <span className="text-[11px] font-medium text-white/40 uppercase tracking-widest">
                            自選股
                          </span>
                          <span className="text-[10px] text-white/25 tabular-nums">
                            {userStockReports.length}
                          </span>
                        </div>

                        {/* 個人個股圖卡列表與流暢補位 */}
                        <div className="space-y-3">
                          <AnimatePresence mode="popLayout" initial={false}>
                            {userStockReports.map((report) => (
                              <StockCard
                                key={report.symbol}
                                report={report}
                                onRemove={handleRemoveStock}
                                liveQuote={isViewingLatestDate ? liveQuotes[report.symbol] : null}
                              />
                            ))}
                          </AnimatePresence>

                          {/* 圖卡「一加（+）」：列表最末端原地展開的半透明霧面玻璃新增圖卡 */}
                          <AddStockCard
                            market={market}
                            onAddStock={handleAddStock}
                            existingSymbols={existingSymbols}
                          />
                        </div>
                      </motion.section>
                    )}
                  </motion.div>
                </AnimatePresence>
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </MotionConfig>
  )
}
