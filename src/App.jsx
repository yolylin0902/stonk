import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { motion, AnimatePresence, MotionConfig } from 'framer-motion'
import Header from './components/Header'
import MarketTabs from './components/MarketTabs'
import DateSelector from './components/DateSelector'
import StockCard from './components/StockCard'
import AddStockCard from './components/AddStockCard'
import ParkSleepSection from './components/ParkSleepSection'
import { supabase } from './lib/supabase'
import { autoLookupStock } from './lib/stockLookup'
import { loadTwStockMap, resolveDisplayName } from './lib/twStockMap'
import { Loader2, BarChart3, Layers } from 'lucide-react'
import { IOS_SPRING, TACTILE_TAP } from './motion/iosMotion'

// 判定標的之新聞總結是否需要由 AI 重整或翻譯（包含未完成佔位文字，或舊版殘留的未翻譯純英文新聞標題）
export const needsAiAnalysis = (headline) => {
  if (!headline) return true
  if (headline.includes('AI 新聞分析整理中') || headline.includes('正在抓取')) return true
  // 若繁體中文字元少於 3 個且包含英文字串，判定為未翻譯的英文新聞標題，需自動透過 AI 重整
  const chineseChars = headline.match(/[\u4e00-\u9fa5]/g) || []
  if (chineseChars.length < 3 && /[a-zA-Z]{4,}/.test(headline)) {
    return true
  }
  return false
}

// 取得市場兩段式檢查點資訊與對齊日期
// 台股（UTC+8 台灣時間）：第一波 14:05（盤後即時新聞與收盤定價）、第二波 17:15（納入三大法人籌碼與傍晚深度分析）
// 美股（美東時間）：第一波 16:35（正規盤收盤與盤後快訊）、第二波 18:30（盤後交易與華爾街完整總結）
export const getMarketCheckpointInfo = (targetMarket, now = new Date()) => {
  const tz = targetMarket === 'TW' ? 'Asia/Taipei' : 'America/New_York'
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    weekday: 'short',
    hour12: false,
  }).formatToParts(now)

  const getPart = (type) => parts.find((p) => p.type === type)?.value || ''
  const year = parseInt(getPart('year'), 10)
  const month = parseInt(getPart('month'), 10) - 1
  const day = parseInt(getPart('day'), 10)
  const hour = parseInt(getPart('hour'), 10)
  const minute = parseInt(getPart('minute'), 10)
  const weekday = getPart('weekday')

  const currentMinutes = hour * 60 + minute
  const cp1 = targetMarket === 'TW' ? 14 * 60 + 5 : 16 * 60 + 35
  const cp2 = targetMarket === 'TW' ? 17 * 60 + 15 : 18 * 60 + 30

  let cpYear = year, cpMonth = month, cpDay = day, cpHour = 0, cpMinute = 0
  let stage = 0

  const isWeekend = weekday === 'Sat' || weekday === 'Sun'
  if (isWeekend) {
    const daysToSubtract = weekday === 'Sat' ? 1 : 2
    const fridayDate = new Date(Date.UTC(year, month, day))
    fridayDate.setUTCDate(fridayDate.getUTCDate() - daysToSubtract)

    cpYear = fridayDate.getUTCFullYear()
    cpMonth = fridayDate.getUTCMonth()
    cpDay = fridayDate.getUTCDate()
    cpHour = Math.floor(cp2 / 60)
    cpMinute = cp2 % 60
    stage = 2
  } else {
    if (currentMinutes >= cp2) {
      cpHour = Math.floor(cp2 / 60)
      cpMinute = cp2 % 60
      stage = 2
    } else if (currentMinutes >= cp1) {
      cpHour = Math.floor(cp1 / 60)
      cpMinute = cp1 % 60
      stage = 1
    } else {
      const prevTradingDate = new Date(Date.UTC(year, month, day))
      const daysToSubtract = weekday === 'Mon' ? 3 : 1
      prevTradingDate.setUTCDate(prevTradingDate.getUTCDate() - daysToSubtract)

      cpYear = prevTradingDate.getUTCFullYear()
      cpMonth = prevTradingDate.getUTCMonth()
      cpDay = prevTradingDate.getUTCDate()
      cpHour = Math.floor(cp2 / 60)
      cpMinute = cp2 % 60
      stage = 2
    }
  }

  const yStr = cpYear
  const mStr = String(cpMonth + 1).padStart(2, '0')
  const dStr = String(cpDay).padStart(2, '0')
  const targetTradingDate = `${yStr}-${mStr}-${dStr}`

  const getUtcTimestamp = (y, mo, da, h, mi, timeZone) => {
    const utcGuess = new Date(Date.UTC(y, mo, da, h, mi, 0))
    const invParts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric',
      hour12: false,
    }).formatToParts(utcGuess)
    const getP = (t) => invParts.find((p) => p.type === t)?.value || '0'
    const asLocal = new Date(Date.UTC(
      parseInt(getP('year'), 10),
      parseInt(getP('month'), 10) - 1,
      parseInt(getP('day'), 10),
      parseInt(getP('hour'), 10),
      parseInt(getP('minute'), 10),
      parseInt(getP('second'), 10)
    ))
    const offset = asLocal.getTime() - utcGuess.getTime()
    return utcGuess.getTime() - offset
  }

  const checkpointTimestamp = getUtcTimestamp(cpYear, cpMonth, cpDay, cpHour, cpMinute, tz)
  return { targetTradingDate, stage, checkpointTimestamp }
}

// 取得特定市場在目前當地時間下，最近一次「應完成盤後新聞整理」的交易日期 (YYYY-MM-DD)
export const getExpectedMarketDate = (targetMarket) => {
  return getMarketCheckpointInfo(targetMarket).targetTradingDate
}

// 判定既有報告是否過期：
// 規則：找出當下時間點之前最近一個已通過的檢查點，只要報告所屬日期早於該交易日，
// 或同一交易日內 updated_at 早於該檢查點時間戳，就判定新聞摘要過期並觸發重整覆蓋
export const isReportStale = (report, targetMarket) => {
  if (!report) return true
  const cpInfo = getMarketCheckpointInfo(targetMarket)
  if (!report.report_date || report.report_date < cpInfo.targetTradingDate) {
    return true
  }
  const reportTime = new Date(report.updated_at || report.created_at || 0).getTime()
  if (reportTime < cpInfo.checkpointTimestamp) {
    return true
  }
  return false
}

// 判斷是否為真正的官方純大盤指數（嚴格只認 ^ 開頭，例如美股 ^GSPC, ^IXIC, ^DJI, ^SOX；台股 ^TWII）
// 所有 ETF（例如 QQQ, SOXX, SPY, 0050.TW 等）皆歸類在一般自選個股區，不列入指數區
export const isMarketIndex = (symbol) => {
  if (!symbol) return false
  return symbol.startsWith('^')
}

// 待分析個股的輪詢上限（每次 4 秒，最多 10 次約 40 秒），避免無休止請求消耗 Supabase 配額
const MAX_POLL_ATTEMPTS = 10

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
  const marketRef = useRef(market)
  marketRef.current = market
  const selectedDateRef = useRef(selectedDate)
  selectedDateRef.current = selectedDate
  const availableDatesRef = useRef([])
  availableDatesRef.current = availableDates
  const reportsRef = useRef([])
  reportsRef.current = reports
  const sessionRef = useRef(session)
  sessionRef.current = session

  // 自我修復（Self-Healing）節流紀錄與最新函式參照
  const lastSelfHealRef = useRef(new Map())
  const loadReportsRef = useRef(null)

  // 盤中即時報價獨立暫存狀態（純記憶體疊加，不覆蓋資料庫收盤日報）
  const [liveQuotes, setLiveQuotes] = useState({})
  const lastFetchLiveQuotesRef = useRef(0)
  const isRefreshingRef = useRef(false)
  const lastAutoRefreshRef = useRef(0)

  // 判斷是否正在檢視該市場最新日期（歷史日期檢視下一律看收盤日報）
  const isViewingLatestDate = useMemo(() => {
    return !selectedDate || (availableDates.length > 0 && selectedDate === availableDates[0])
  }, [selectedDate, availableDates])

  // 檢視模式：自選個股 (STOCKS) 或 主要指數 (INDEX)
  const [cardViewMode, setCardViewMode] = useState('STOCKS')

  // 原地手風琴展開狀態（以 Set 記錄已展開的 symbol 代號）
  const [expandedSymbols, setExpandedSymbols] = useState(() => new Set())

  const handleToggleCard = useCallback((symbol) => {
    setExpandedSymbols((prev) => {
      const next = new Set(prev)
      if (next.has(symbol)) {
        next.delete(symbol)
      } else {
        next.add(symbol)
      }
      return next
    })
  }, [])

  // 監聽 Supabase 驗證狀態（保持完全同步，絕不 await 任何非同步呼叫）
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      setSession(currentSession)
      setAuthLoading(false)
    }).catch(() => {
      setAuthLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, currentSession) => {
      setSession(currentSession)
      setAuthLoading(false)
      if (event === 'SIGNED_OUT') {
        setReports([])
        setLiveQuotes({})
        setAuthSubmitting(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  // Google OAuth 登入
  const handleGoogleSignIn = async () => {
    if (authSubmitting) return
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
    } finally {
      setAuthSubmitting(false)
    }
  }

  // 快速暱稱匿名登入（具備永久獨立 auth.uid()）
  const handleAnonymousSignIn = async (e) => {
    e.preventDefault()
    if (authSubmitting) return
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
    } finally {
      setAuthSubmitting(false)
    }
  }

  // 加固登出流程：徹底清除計時器、畫面狀態與本地 session
  const handleSignOut = async () => {
    // 1. 先清除本地輪詢與畫面狀態
    pollCountRef.current = 0
    pollTimedOutRef.current = false
    setPollTimedOut(false)
    setExpandedSymbols(new Set())
    setReports([])
    setLiveQuotes({})
    setErrorMsg('')
    setLoading(false)
    setRefreshing(false)
    setAuthSubmitting(false)
    setAuthError('')

    // 2. 執行登出（加上 local scope 與 2 秒逾時保護）
    try {
      const signOutPromise = supabase.auth.signOut({ scope: 'local' })
      const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 2000))
      await Promise.race([signOutPromise, timeoutPromise])
    } catch (err) {
      console.warn('Supabase signOut 略過:', err)
    } finally {
      // 確保本地狀態完全歸零
      setSession(null)
      setAuthLoading(false)
      setAuthSubmitting(false)
      setNicknameInput('')
    }
  }

  // 自我修復（Self-Healing）：針對卡在「AI 新聞分析整理中」或未翻譯英文標題之標的，在背景非同步呼叫 sync-stock 補齊繁中分析
  const triggerSelfHeal = useCallback((stuckStocks, targetMarket, targetDate) => {
    const now = Date.now()
    let delay = 0
    for (const stock of stuckStocks) {
      const lastHeal = lastSelfHealRef.current.get(stock.symbol) || 0
      if (now - lastHeal > 20000) {
        lastSelfHealRef.current.set(stock.symbol, now)
        const currentStock = stock
        const currentDelay = delay
        delay += 800

        const effectiveName = resolveDisplayName(
          currentStock.symbol,
          currentStock.market || targetMarket,
          [currentStock.name]
        )

        const cpInfo = getMarketCheckpointInfo(currentStock.market || targetMarket)

        setTimeout(() => {
          supabase.functions
            .invoke('sync-stock', {
              body: {
                mode: 'full',
                symbol: currentStock.symbol,
                name: effectiveName,
                market: currentStock.market || targetMarket,
                stage: cpInfo.stage,
              },
            })
            .then(() => {
              loadReportsRef.current?.(targetMarket, targetDate, true)
            })
            .catch((err) => {
              console.warn(`自癒觸發失敗 [${currentStock.symbol}]:`, err)
            })
        }, currentDelay)
      }
    }
  }, [])

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

      // 取得該市場的唯一日期清單，並保證包含該市場最新應完成盤後整理的交易日期
      const expectedDate = getExpectedMarketDate(currentMarket)
      const rawMarketDates = (data || [])
        .filter((r) => r.market === currentMarket)
        .map((r) => r.report_date)

      const marketDates = Array.from(
        new Set([expectedDate, ...rawMarketDates].filter(Boolean))
      ).sort().reverse()

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

      // 撈取指定日期的全部報告 (包含指數與各股票)，若為台股市場並行預載台股字典
      let allQuery = supabase.from('daily_reports').select('*')
      if (targetDate) {
        allQuery = allQuery.eq('report_date', targetDate)
      }

      const [allRes, watchRes, twMap] = await Promise.all([
        allQuery,
        supabase.from('watchlist').select('*'),
        targetMarket === 'TW' ? loadTwStockMap() : Promise.resolve(null),
      ])

      const allData = allRes?.data || []
      const watchData = watchRes?.data || []

      // ── A. 大盤指數獨立處理：僅呈現純大盤指數（嚴格限定 ^ 開頭），並依 symbol 去重 ──
      const rawIndexReports = allData.filter(
        (r) => r.market === targetMarket && isMarketIndex(r.symbol)
      )
      const indexMap = new Map()
      for (const ir of rawIndexReports) {
        if (!indexMap.has(ir.symbol)) {
          const resolvedName = resolveDisplayName(ir.symbol, targetMarket, [ir.name], twMap)
          indexMap.set(ir.symbol, { ...ir, name: resolvedName })
        }
      }
      const indexReports = Array.from(indexMap.values())

      // ── B. 個人自選持股嚴格比對：只呈現使用者 watchlist 中的個股或 ETF（嚴格過濾排除 ^ 開頭大盤指數），並去重 ──
      const userWatchlistMap = new Map()
      for (const w of watchData || []) {
        if (w.market === targetMarket && !isMarketIndex(w.symbol)) {
          if (!userWatchlistMap.has(w.symbol)) {
            userWatchlistMap.set(w.symbol, w)
          }
        }
      }
      const userWatchlist = Array.from(userWatchlistMap.values())

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
          const isStale = isLatestDate && isReportStale(found, targetMarket)
          const isAiPending = Boolean(
            isLatestDate &&
            !pollTimedOutRef.current &&
            (needsAiAnalysis(found.headline) || isStale)
          )
          const resolvedName = resolveDisplayName(
            w.symbol,
            targetMarket,
            [found.name, w.name],
            twMap
          )
          return {
            ...found,
            name: resolvedName,
            isAiPending,
            isPending: false,
          }
        }

        // 歷史日期檢視下，缺漏資料不應標記為 isPending，亦不應觸發輪詢
        if (!isLatestDate) {
          const resolvedName = resolveDisplayName(
            w.symbol,
            targetMarket,
            [w.name],
            twMap
          )
          return {
            id: 'history_missing_' + w.symbol,
            symbol: w.symbol,
            name: resolvedName,
            market: w.market,
            close_price: null,
            change_percent: null,
            sentiment: '中性',
            headline: '此歷史日期尚無紀錄',
            story_bullets: ['此標的於該歷史交易日無收盤資料。可切換至最新日期檢視即時分析。'],
            news_links: [],
            isPending: false,
            isAiPending: false,
          }
        }

        // 最新日期下剛加入但尚未有 daily_reports 的新標的
        const isTimedOut = pollTimedOutRef.current
        const resolvedName = resolveDisplayName(
          w.symbol,
          targetMarket,
          [w.name],
          twMap
        )
        return {
          id: 'pending_' + w.symbol,
          symbol: w.symbol,
          name: resolvedName,
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
          isPending: !isTimedOut,
          isAiPending: false,
        }
      })

      // 排序：pending 固定排在最前面，已完成分析者按漲跌幅排序
      const pendingList = userStockReports.filter((r) => r.isPending)
      const readyList = userStockReports.filter((r) => !r.isPending)
      readyList.sort(
        (a, b) => Number(b.change_percent || 0) - Number(a.change_percent || 0)
      )
      const sortedUserStocks = [...pendingList, ...readyList]

      // 自我修復（Self-Healing）：若有卡在「AI 新聞分析整理中」、英文新聞標題、或新聞摘要已過期之標的，背景非同步重新觸發 sync-stock mode: 'full'
      if (isLatestDate && sessionRef.current?.user) {
        const stuckStocks = userStockReports.filter(
          (r) => needsAiAnalysis(r.headline) || isReportStale(r, targetMarket)
        )
        if (stuckStocks.length > 0) {
          triggerSelfHeal(stuckStocks, targetMarket, targetDate)
        }
      }

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
            oldItem.isAiPending === newItem.isAiPending &&
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
    }
  }, [])

  // 市場切換處理（記錄方向以產生空間滑動動效）
  const handleMarketChange = async (newMarket) => {
    if (newMarket === market) return
    setExpandedSymbols(new Set())
    const dir = newMarket === 'TW' ? 1 : -1
    setMarketDirection(dir)
    setMarket(newMarket)
    marketRef.current = newMarket
    const latestDate = await loadAvailableDates(newMarket)
    await loadReports(newMarket, latestDate)
    triggerRefresh(newMarket, true)
  }

  // 日期切換處理
  const handleDateChange = async (newDate) => {
    setExpandedSymbols(new Set())
    setSelectedDate(newDate)
    selectedDateRef.current = newDate
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

  // 觸發重新整理（同時刷新收盤日報與盤中即時行情，支援自訂市場與靜默/冷卻控制）
  const triggerRefresh = useCallback(async (targetMarket, force = false) => {
    if (isRefreshingRef.current) return
    const now = Date.now()
    if (!force && now - lastAutoRefreshRef.current < 60000) {
      return // 60 秒冷卻防重複觸發
    }
    lastAutoRefreshRef.current = now
    isRefreshingRef.current = true
    setRefreshing(true)

    try {
      const curMarket = targetMarket || marketRef.current || 'US'
      pollCountRef.current = 0
      pollTimedOutRef.current = false
      setPollTimedOut(false)
      lastSelfHealRef.current.clear()

      const latestDate = await loadAvailableDates(curMarket)
      const targetDate = selectedDateRef.current || latestDate

      await Promise.allSettled([
        loadReports(curMarket, targetDate, true),
        fetchLiveQuotes(curMarket, true),
      ])
    } catch (err) {
      console.warn('重新整理或背景同步異常:', err)
    } finally {
      isRefreshingRef.current = false
      setRefreshing(false)
    }
  }, [loadAvailableDates, loadReports, fetchLiveQuotes])

  // 手動點擊重新整理按鈕（強制忽略冷卻時間）
  const handleRefresh = useCallback(() => {
    return triggerRefresh(marketRef.current, true)
  }, [triggerRefresh])

  // 登入後初始加載：改由獨立監聽 session?.user?.id 來觸發，徹底消除 Supabase 非同步死鎖
  // 先呈現資料庫快取，完成後在背景自動觸發即時報價更新
  const userId = session?.user?.id
  useEffect(() => {
    if (!userId) return
    let isCancelled = false
    async function init() {
      try {
        const curMarket = marketRef.current || 'US'
        const latestDate = await loadAvailableDates(curMarket)
        if (!isCancelled) {
          await loadReports(curMarket, latestDate)
          if (!isCancelled) {
            // 資料庫報告與自選股呈現後，立即在背景觸發最新報價與市場日報同步
            triggerRefresh(curMarket, true)
          }
        }
      } catch (err) {
        console.error('初始載入失敗:', err)
      }
    }
    init()
    return () => {
      isCancelled = true
    }
  }, [userId, loadAvailableDates, loadReports, triggerRefresh])

  // 監聽 visibilitychange（從手機背景切回）與 focus 事件：60 秒冷卻自動背景更新最新即時報價
  useEffect(() => {
    if (!userId) return

    const handleAutoSync = () => {
      if (document.visibilityState === 'visible') {
        const curMarket = marketRef.current || 'US'
        triggerRefresh(curMarket, false)
      }
    }

    document.addEventListener('visibilitychange', handleAutoSync)
    window.addEventListener('focus', handleAutoSync)
    return () => {
      document.removeEventListener('visibilitychange', handleAutoSync)
      window.removeEventListener('focus', handleAutoSync)
    }
  }, [userId, triggerRefresh])

  // 同步 loadReports 參照給自癒背景任務使用
  useEffect(() => {
    loadReportsRef.current = loadReports
  }, [loadReports])

  // 穩定的待分析個股 Key，包含未取得報價 (isPending) 或等待 AI 新聞分析 (isAiPending)
  const pendingKey = useMemo(() => {
    return reports
      .filter((r) => r.isPending || r.isAiPending)
      .map((r) => r.symbol)
      .sort()
      .join(',')
  }, [reports])

  // 若目前畫面上有尚未分析完成的新自選股，自動背景靜默輪詢（每 4 秒檢查一次，最多 10 次約 40 秒）
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
    }, 4000)

    return () => clearInterval(timer)
  }, [pendingKey, market, selectedDate, loadReports])

  // 分離出「純指數區」與「自選個股/ETF 區」，並依 symbol 嚴格去重
  const indexReports = useMemo(() => {
    const map = new Map()
    for (const r of reports) {
      if (isMarketIndex(r.symbol) && !map.has(r.symbol)) {
        map.set(r.symbol, r)
      }
    }
    return Array.from(map.values())
  }, [reports])

  const userStockReports = useMemo(() => {
    const map = new Map()
    for (const r of reports) {
      if (!isMarketIndex(r.symbol) && !map.has(r.symbol)) {
        map.set(r.symbol, r)
      }
    }
    return Array.from(map.values())
  }, [reports])

  // 自選股 symbol 清單，使用 useMemo 保持引用穩定
  const existingSymbols = useMemo(() => {
    return userStockReports.map((r) => r.symbol)
  }, [userStockReports])

  // 圖卡「一加（+）」：直接在自選股列表新增並寫入 Supabase watchlist
  const handleAddStock = useCallback(
    async ({ symbol, name, market: stockMarket }) => {
      if (!session?.user) return false
      const cleanSym = (symbol || '').trim().toUpperCase()
      if (!cleanSym || !/^[A-Z0-9.\-]{1,12}$/.test(cleanSym) || cleanSym.startsWith('^')) {
        console.warn('拒絕新增無效標的代號:', symbol)
        return false
      }
      try {
        let finalName = (name || cleanSym).trim()
        if (stockMarket === 'TW') {
          const twMap = await loadTwStockMap()
          const resolved = resolveDisplayName(cleanSym, 'TW', [finalName], twMap)
          if (resolved) finalName = resolved
        }
        const { error } = await supabase.from('watchlist').insert([
          {
            user_id: session.user.id,
            symbol: cleanSym,
            name: finalName,
            market: stockMarket,
          },
        ])

        if (error) {
          if (error.code === '23505') {
            throw new Error(`${cleanSym} 已在自選股清單中`)
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
          .invoke('sync-stock', { body: { symbol: cleanSym, name: finalName, market: stockMarket } })
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

        setExpandedSymbols((prev) => {
          if (!prev.has(stockSymbol)) return prev
          const next = new Set(prev)
          next.delete(stockSymbol)
          return next
        })

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
                      onClick={() => {
                        setExpandedSymbols(new Set())
                        setCardViewMode('INDEX')
                      }}
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
                      onClick={() => {
                        setExpandedSymbols(new Set())
                        setCardViewMode('STOCKS')
                      }}
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

              {/* 周邊休閒公園 · 避難鄰里分析 */}
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
                    {/* 1. 市場指數區 — 僅在 INDEX 模式顯示（單欄手風琴橫條） */}
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
                            {indexReports.map((report) => (
                              <StockCard
                                key={report.symbol}
                                report={report}
                                isIndex={true}
                                isExpanded={expandedSymbols.has(report.symbol)}
                                onToggle={handleToggleCard}
                                liveQuote={isViewingLatestDate ? liveQuotes[report.symbol] : null}
                              />
                            ))}
                          </div>
                        )}
                      </motion.section>
                    )}

                    {/* 2. 自選個股區 — 僅在 STOCKS 模式顯示（單欄手風琴橫條） */}
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
                          {userStockReports.length === 0 ? (
                            <div className="p-8 rounded-[24px] border border-dashed border-white/[0.07] bg-white/[0.02] text-center">
                              <p className="text-xs text-white/40">尚未加入自選標的</p>
                            </div>
                          ) : (
                            <div className="space-y-3">
                              {userStockReports.map((report) => (
                                <StockCard
                                  key={report.symbol}
                                  report={report}
                                  isIndex={false}
                                  isExpanded={expandedSymbols.has(report.symbol)}
                                  onToggle={handleToggleCard}
                                  onRemove={handleRemoveStock}
                                  liveQuote={isViewingLatestDate ? liveQuotes[report.symbol] : null}
                                />
                              ))}
                            </div>
                          )}

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
