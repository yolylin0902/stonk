/**
 * 台股字典快取與統一公司名稱解析模組
 * 保持獨立 chunk 拆包，避免將 370KB 的 twStocks.json 打包進首屏主 bundle。
 */

let twStockList = null
let twStockListPromise = null
let twStockMap = null
let twStockMapPromise = null

/**
 * 判定名稱是否為無效的佔位字（如「台股 2330」、「2330.TW」或空字串）
 * @param {string} name
 * @param {string} symbol
 * @returns {boolean}
 */
export function isPlaceholderName(name, symbol) {
  if (!name || typeof name !== 'string') return true
  const trimmed = name.trim()
  if (!trimmed) return true

  const upperName = trimmed.toUpperCase()
  const cleanSym = (symbol || '').trim().toUpperCase()
  const baseCode = cleanSym.replace(/\.(TW|TWO)$/i, '')

  // 與代號本身或去除副檔名相同
  if (upperName === cleanSym || upperName === baseCode) return true

  // 格式符合「台股 XXXX」或「美股 XXXX」
  if (/^台股\s*[A-Z0-9.\-]+$/i.test(trimmed)) return true
  if (/^美股\s*[A-Z0-9.\-]+$/i.test(trimmed)) return true

  return false
}

/**
 * 單例非同步載入台股清單陣列
 * @returns {Promise<Array<{ symbol: string, name: string, code: string, market: string, type: string }>>}
 */
export function loadTwStockList() {
  if (twStockList) {
    return Promise.resolve(twStockList)
  }
  if (!twStockListPromise) {
    twStockListPromise = import('../data/twStocks.json')
      .then((m) => {
        const raw = m.default || m
        const list = Array.isArray(raw) ? raw : Object.values(raw)
        twStockList = list
        return list
      })
      .catch((err) => {
        twStockListPromise = null
        console.error('載入台股字典清單失敗:', err)
        return []
      })
  }
  return twStockListPromise
}

/**
 * 單例非同步載入台股代號對照 Map（Map<代號, 中文名稱>）
 * 同時支援純數字（'2330'）、上市（'2330.TW'）與上櫃（'8069.TWO'）快速查詢
 * @returns {Promise<Map<string, string>>}
 */
export function loadTwStockMap() {
  if (twStockMap) {
    return Promise.resolve(twStockMap)
  }
  if (!twStockMapPromise) {
    twStockMapPromise = loadTwStockList().then((list) => {
      const map = new Map()
      for (const item of list) {
        if (!item || !item.name) continue
        const code = (item.code || '').trim().toUpperCase()
        const sym = (item.symbol || '').trim().toUpperCase()
        const name = (item.name || '').trim()

        if (code) {
          map.set(code, name)
          map.set(`${code}.TW`, name)
          map.set(`${code}.TWO`, name)
        }
        if (sym) {
          map.set(sym, name)
          const base = sym.replace(/\.(TW|TWO)$/i, '')
          if (base) map.set(base, name)
        }
      }
      twStockMap = map
      return map
    })
  }
  return twStockMapPromise
}

/**
 * 同步讀取目前快取中的台股名稱（若字典已預載完成即可直接取得）
 * @param {string} symbol
 * @returns {string | null}
 */
export function getTwStockNameSync(symbol) {
  if (!twStockMap || !symbol) return null
  const cleanSym = symbol.trim().toUpperCase()
  const baseCode = cleanSym.replace(/\.(TW|TWO)$/i, '')
  return twStockMap.get(cleanSym) || twStockMap.get(baseCode) || null
}

/**
 * 統一股票名稱解析函式
 * 消除冷啟動時因字典未加載而產生「台股 2330」等佔位字現象
 *
 * @param {string} symbol - 股票代號（例如 '2330.TW', 'NVDA', '^TWII'）
 * @param {string} market - 市場類別（'TW' | 'US'）
 * @param {Array<string | undefined | null>} candidates - 備選名稱候選列（例如 [found?.name, watchlist?.name]）
 * @param {Map<string, string> | null} twMap - 已加載之台股對照 Map（選填，若有預載則優先查詢）
 * @returns {string} 最終安全顯示名稱
 */
export function resolveDisplayName(symbol, market, candidates = [], twMap = null) {
  if (!symbol) return ''
  const cleanSym = symbol.trim().toUpperCase()
  const isIndex = cleanSym.startsWith('^')
  const isTW = market === 'TW'

  // 1. 台股（非純大盤指數）解析順序：
  if (isTW && !isIndex) {
    const activeMap = twMap || twStockMap
    if (activeMap && typeof activeMap.get === 'function') {
      const baseCode = cleanSym.replace(/\.(TW|TWO)$/i, '')
      const fromMap = activeMap.get(cleanSym) || activeMap.get(baseCode)
      if (fromMap && !isPlaceholderName(fromMap, cleanSym)) {
        return fromMap
      }
    }

    // 依序檢查候選名稱，回傳第一個非佔位字
    for (const cand of candidates) {
      if (cand && !isPlaceholderName(cand, cleanSym)) {
        return cand.trim()
      }
    }

    // 若皆無，回傳乾淨代號
    return cleanSym
  }

  // 2. 美股或大盤指數解析順序：
  for (const cand of candidates) {
    if (cand && !isPlaceholderName(cand, cleanSym)) {
      return cand.trim()
    }
  }

  return cleanSym
}
