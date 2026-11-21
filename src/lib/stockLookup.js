import { loadTwStockList, getTwStockNameSync } from './twStockMap'

// 常見台美股別名與中英文快捷對照表（保證最頂級熱門股第一時間秒中，無需等待大字典下載）
const COMMON_ALIASES = {
  'GOOGLE': { symbol: 'GOOGL', name: 'Alphabet (Google)', market: 'US' },
  'GOOG': { symbol: 'GOOGL', name: 'Alphabet (Google)', market: 'US' },
  '谷歌': { symbol: 'GOOGL', name: 'Alphabet (Google)', market: 'US' },
  'ALPHABET': { symbol: 'GOOGL', name: 'Alphabet (Google)', market: 'US' },
  'META': { symbol: 'META', name: 'Meta Platforms (臉書)', market: 'US' },
  'FB': { symbol: 'META', name: 'Meta Platforms (臉書)', market: 'US' },
  '臉書': { symbol: 'META', name: 'Meta Platforms (臉書)', market: 'US' },
  'AMAZON': { symbol: 'AMZN', name: '亞馬遜 (Amazon)', market: 'US' },
  'AMZN': { symbol: 'AMZN', name: '亞馬遜 (Amazon)', market: 'US' },
  '亞馬遜': { symbol: 'AMZN', name: '亞馬遜 (Amazon)', market: 'US' },
  'MICROSOFT': { symbol: 'MSFT', name: '微軟 (Microsoft)', market: 'US' },
  'MSFT': { symbol: 'MSFT', name: '微軟 (Microsoft)', market: 'US' },
  '微軟': { symbol: 'MSFT', name: '微軟 (Microsoft)', market: 'US' },
  'APPLE': { symbol: 'AAPL', name: '蘋果 (Apple)', market: 'US' },
  'AAPL': { symbol: 'AAPL', name: '蘋果 (Apple)', market: 'US' },
  '蘋果': { symbol: 'AAPL', name: '蘋果 (Apple)', market: 'US' },
  'TESLA': { symbol: 'TSLA', name: '特斯拉 (Tesla)', market: 'US' },
  'TSLA': { symbol: 'TSLA', name: '特斯拉 (Tesla)', market: 'US' },
  '特斯拉': { symbol: 'TSLA', name: '特斯拉 (Tesla)', market: 'US' },
  'NVIDIA': { symbol: 'NVDA', name: '輝達 (NVIDIA)', market: 'US' },
  'NVDA': { symbol: 'NVDA', name: '輝達 (NVIDIA)', market: 'US' },
  '輝達': { symbol: 'NVDA', name: '輝達 (NVIDIA)', market: 'US' },
  'SMCI': { symbol: 'SMCI', name: '美超微 (Super Micro)', market: 'US' },
  'SUPERMICRO': { symbol: 'SMCI', name: '美超微 (Super Micro)', market: 'US' },
  '美超微': { symbol: 'SMCI', name: '美超微 (Super Micro)', market: 'US' },
  '超微': { symbol: 'AMD', name: '超微半導體 (AMD)', market: 'US' },
  'AMD': { symbol: 'AMD', name: '超微半導體 (AMD)', market: 'US' },
  'MICRON': { symbol: 'MU', name: '美光科技 (Micron)', market: 'US' },
  'MU': { symbol: 'MU', name: '美光科技 (Micron)', market: 'US' },
  '美光': { symbol: 'MU', name: '美光科技 (Micron)', market: 'US' },
  '美光科技': { symbol: 'MU', name: '美光科技 (Micron)', market: 'US' },
  'TSM': { symbol: 'TSM', name: '台積電 ADR', market: 'US' },
  'ASML': { symbol: 'ASML', name: '艾司摩爾 (ASML)', market: 'US' },
  '艾司摩爾': { symbol: 'ASML', name: '艾司摩爾 (ASML)', market: 'US' },
  'PLTR': { symbol: 'PLTR', name: '帕蘭提爾 (Palantir)', market: 'US' },
  'PALANTIR': { symbol: 'PLTR', name: '帕蘭提爾 (Palantir)', market: 'US' },
  '帕蘭提爾': { symbol: 'PLTR', name: '帕蘭提爾 (Palantir)', market: 'US' },
  'ARM': { symbol: 'ARM', name: '安謀 (ARM)', market: 'US' },
  '安謀': { symbol: 'ARM', name: '安謀 (ARM)', market: 'US' },
  'AVGO': { symbol: 'AVGO', name: '博通 (Broadcom)', market: 'US' },
  'BROADCOM': { symbol: 'AVGO', name: '博通 (Broadcom)', market: 'US' },
  '博通': { symbol: 'AVGO', name: '博通 (Broadcom)', market: 'US' },
  'QCOM': { symbol: 'QCOM', name: '高通 (Qualcomm)', market: 'US' },
  'QUALCOMM': { symbol: 'QCOM', name: '高通 (Qualcomm)', market: 'US' },
  '高通': { symbol: 'QCOM', name: '高通 (Qualcomm)', market: 'US' },
  'INTC': { symbol: 'INTC', name: '英特爾 (Intel)', market: 'US' },
  'INTEL': { symbol: 'INTC', name: '英特爾 (Intel)', market: 'US' },
  '英特爾': { symbol: 'INTC', name: '英特爾 (Intel)', market: 'US' },
  'NFLX': { symbol: 'NFLX', name: '網飛 (Netflix)', market: 'US' },
  'NETFLIX': { symbol: 'NFLX', name: '網飛 (Netflix)', market: 'US' },
  '網飛': { symbol: 'NFLX', name: '網飛 (Netflix)', market: 'US' },
  'COIN': { symbol: 'COIN', name: 'Coinbase', market: 'US' },
  'COINBASE': { symbol: 'COIN', name: 'Coinbase', market: 'US' },
  'CRWD': { symbol: 'CRWD', name: 'CrowdStrike (資安)', market: 'US' },
  'CROWDSTRIKE': { symbol: 'CRWD', name: 'CrowdStrike (資安)', market: 'US' },
  'COST': { symbol: 'COST', name: '好市多 (Costco)', market: 'US' },
  'COSTCO': { symbol: 'COST', name: '好市多 (Costco)', market: 'US' },
  '好市多': { symbol: 'COST', name: '好市多 (Costco)', market: 'US' },
  'DIS': { symbol: 'DIS', name: '迪士尼 (Disney)', market: 'US' },
  'DISNEY': { symbol: 'DIS', name: '迪士尼 (Disney)', market: 'US' },
  '迪士尼': { symbol: 'DIS', name: '迪士尼 (Disney)', market: 'US' },
  'MSTR': { symbol: 'MSTR', name: '微策 (MicroStrategy)', market: 'US' },
  'MICROSTRATEGY': { symbol: 'MSTR', name: '微策 (MicroStrategy)', market: 'US' },
  'RKLB': { symbol: 'RKLB', name: '火箭實驗室 (Rocket Lab)', market: 'US' },
  'ROCKETLAB': { symbol: 'RKLB', name: '火箭實驗室 (Rocket Lab)', market: 'US' },
  'UBER': { symbol: 'UBER', name: '優步 (Uber)', market: 'US' },
  '優步': { symbol: 'UBER', name: '優步 (Uber)', market: 'US' },
  'ABNB': { symbol: 'ABNB', name: '愛彼迎 (Airbnb)', market: 'US' },
  'AIRBNB': { symbol: 'ABNB', name: '愛彼迎 (Airbnb)', market: 'US' },
  'BABA': { symbol: 'BABA', name: '阿里巴巴 (Alibaba)', market: 'US' },
  'ALIBABA': { symbol: 'BABA', name: '阿里巴巴 (Alibaba)', market: 'US' },
  '阿里巴巴': { symbol: 'BABA', name: '阿里巴巴 (Alibaba)', market: 'US' },
  'PDD': { symbol: 'PDD', name: '拼多多 (PDD)', market: 'US' },
  '拼多多': { symbol: 'PDD', name: '拼多多 (PDD)', market: 'US' },
  'SNOW': { symbol: 'SNOW', name: 'Snowflake', market: 'US' },
  'SHOP': { symbol: 'SHOP', name: 'Shopify', market: 'US' },
  'SPOT': { symbol: 'SPOT', name: 'Spotify', market: 'US' },
  'DELL': { symbol: 'DELL', name: '戴爾 (Dell)', market: 'US' },
  '戴爾': { symbol: 'DELL', name: '戴爾 (Dell)', market: 'US' },
  'ORCL': { symbol: 'ORCL', name: '甲骨文 (Oracle)', market: 'US' },
  '甲骨文': { symbol: 'ORCL', name: '甲骨文 (Oracle)', market: 'US' },
  'BA': { symbol: 'BA', name: '波音 (Boeing)', market: 'US' },
  '波音': { symbol: 'BA', name: '波音 (Boeing)', market: 'US' },
  'CAT': { symbol: 'CAT', name: '開拓重工 (Caterpillar)', market: 'US' },
  'JPM': { symbol: 'JPM', name: '摩根大通 (JPMorgan)', market: 'US' },
  '摩根大通': { symbol: 'JPM', name: '摩根大通 (JPMorgan)', market: 'US' },
  'V': { symbol: 'V', name: 'Visa', market: 'US' },
  'MA': { symbol: 'MA', name: '萬事達卡 (Mastercard)', market: 'US' },
  'LLY': { symbol: 'LLY', name: '禮來 (Eli Lilly)', market: 'US' },
  '禮來': { symbol: 'LLY', name: '禮來 (Eli Lilly)', market: 'US' },
  'WMT': { symbol: 'WMT', name: '沃爾瑪 (Walmart)', market: 'US' },
  '沃爾瑪': { symbol: 'WMT', name: '沃爾瑪 (Walmart)', market: 'US' },
  'NKE': { symbol: 'NKE', name: '耐吉 (Nike)', market: 'US' },
  '耐吉': { symbol: 'NKE', name: '耐吉 (Nike)', market: 'US' },
  'SBUX': { symbol: 'SBUX', name: '星巴克 (Starbucks)', market: 'US' },
  '星巴克': { symbol: 'SBUX', name: '星巴克 (Starbucks)', market: 'US' },
  'MCD': { symbol: 'MCD', name: '麥當勞 (McDonald)', market: 'US' },
  '麥當勞': { symbol: 'MCD', name: '麥當勞 (McDonald)', market: 'US' },
  'KO': { symbol: 'KO', name: '可口可樂 (Coca-Cola)', market: 'US' },
  '可口可樂': { symbol: 'KO', name: '可口可樂 (Coca-Cola)', market: 'US' },
  'QQQ': { symbol: 'QQQ', name: '那斯達克100 ETF', market: 'US' },
  'SOXX': { symbol: 'SOXX', name: '費城半導體 ETF', market: 'US' },
  'SMH': { symbol: 'SMH', name: 'VanEck 半導體 ETF', market: 'US' },
  'SPY': { symbol: 'SPY', name: 'S&P 500 ETF (SPY)', market: 'US' },
  'VOO': { symbol: 'VOO', name: 'Vanguard S&P 500 (VOO)', market: 'US' },
  'TLT': { symbol: 'TLT', name: '美國20年公債 ETF', market: 'US' },
  'BRK.B': { symbol: 'BRK-B', name: '波克夏 (Berkshire)', market: 'US' },
  'BRK-B': { symbol: 'BRK-B', name: '波克夏 (Berkshire)', market: 'US' },
  '波克夏': { symbol: 'BRK-B', name: '波克夏 (Berkshire)', market: 'US' },
  '台積電': { symbol: '2330.TW', name: '台積電', market: 'TW' },
  '台積': { symbol: '2330.TW', name: '台積電', market: 'TW' },
  '2330': { symbol: '2330.TW', name: '台積電', market: 'TW' },
  '台達電': { symbol: '2308.TW', name: '台達電', market: 'TW' },
  '2308': { symbol: '2308.TW', name: '台達電', market: 'TW' },
  '元太': { symbol: '8069.TWO', name: '元太', market: 'TW' },
  '8069': { symbol: '8069.TWO', name: '元太', market: 'TW' },
  '群聯': { symbol: '8299.TWO', name: '群聯', market: 'TW' },
  '8299': { symbol: '8299.TWO', name: '群聯', market: 'TW' },
  '聯發科': { symbol: '2454.TW', name: '聯發科', market: 'TW' },
  '發哥': { symbol: '2454.TW', name: '聯發科', market: 'TW' },
  '2454': { symbol: '2454.TW', name: '聯發科', market: 'TW' },
  '鴻海': { symbol: '2317.TW', name: '鴻海', market: 'TW' },
  '2317': { symbol: '2317.TW', name: '鴻海', market: 'TW' },
  '廣達': { symbol: '2382.TW', name: '廣達', market: 'TW' },
  '2382': { symbol: '2382.TW', name: '廣達', market: 'TW' },
  '緯創': { symbol: '3231.TW', name: '緯創', market: 'TW' },
  '3231': { symbol: '3231.TW', name: '緯創', market: 'TW' },
  '技嘉': { symbol: '2376.TW', name: '技嘉', market: 'TW' },
  '2376': { symbol: '2376.TW', name: '技嘉', market: 'TW' },
  '世芯': { symbol: '3661.TW', name: '世芯-KY', market: 'TW' },
  '3661': { symbol: '3661.TW', name: '世芯-KY', market: 'TW' },
  '創意': { symbol: '3443.TW', name: '創意', market: 'TW' },
  '3443': { symbol: '3443.TW', name: '創意', market: 'TW' },
  '富邦金': { symbol: '2881.TW', name: '富邦金', market: 'TW' },
  '國泰金': { symbol: '2882.TW', name: '國泰金', market: 'TW' },
  '0050': { symbol: '0050.TW', name: '元大台灣50', market: 'TW' },
  '0056': { symbol: '0056.TW', name: '元大高股息', market: 'TW' },
  '00878': { symbol: '00878.TW', name: '國泰永續高股息', market: 'TW' },
  '00919': { symbol: '00919.TW', name: '群益台灣精選高息', market: 'TW' },
  '00929': { symbol: '00929.TW', name: '復華台灣科技優息', market: 'TW' },
  '0052': { symbol: '0052.TW', name: '富邦科技', market: 'TW' },
  '台灣50': { symbol: '0050.TW', name: '元大台灣50', market: 'TW' },
}

// 動態載入的大型字典快取（首頁不靜態載入，大幅縮減首屏 bundle 體積）
let twStocksData = null
let stockData = null
let loadPromise = null

/**
 * 預先或隨選非同步載入台美股大字典
 * @returns {Promise<{ twStocksData: object, stockData: object }>}
 */
export function ensureStockData() {
  if (twStocksData && stockData) {
    return Promise.resolve({ twStocksData, stockData })
  }
  if (!loadPromise) {
    loadPromise = Promise.all([
      loadTwStockList().then((list) => {
        twStocksData = list
      }),
      import('./stockDirectory.json').then((m) => {
        stockData = m.default || m
      }),
    ]).then(() => ({ twStocksData, stockData }))
  }
  return loadPromise
}

/**
 * 雙向股票搜尋（代號 ⇄ 中英文關鍵字）
 * 完整涵蓋全台灣上市 (TWSE) 與上櫃 (TPEX) 2,800+ 檔標的，及美股核心標的
 * @param {string} rawQuery - 輸入文字（代號或關鍵字，如 'google', '聯發科', '8069', '元太'）
 * @param {number} limit - 最大建議筆數
 * @returns {Array<{ symbol: string, name: string, market: 'US' | 'TW' }>}
 */
export function searchStocksTwoWay(rawQuery, limit = 8) {
  if (!rawQuery || !rawQuery.trim()) return []
  const clean = rawQuery.trim()
  const q = clean.toLowerCase()
  const upperQ = clean.toUpperCase()

  const exactMatches = []
  const startMatches = []
  const includeMatches = []
  const seenSymbols = new Set()

  function addResult(list, item) {
    const cleanSym = item.symbol.toUpperCase()
    if (seenSymbols.has(cleanSym)) return
    seenSymbols.add(cleanSym)
    list.push(item)
  }

  // 1. 檢查常用別名（最優先命中，同步即時回傳）
  if (COMMON_ALIASES[upperQ]) {
    addResult(exactMatches, COMMON_ALIASES[upperQ])
  }
  for (const [aliasKey, aliasVal] of Object.entries(COMMON_ALIASES)) {
    if (aliasKey.toLowerCase() === q || aliasKey === clean) {
      addResult(exactMatches, aliasVal)
    } else if (aliasKey.toLowerCase().startsWith(q)) {
      addResult(startMatches, aliasVal)
    }
  }

  // 若背景大字典尚未載入，背景觸發載入
  if (!twStocksData || !stockData) {
    ensureStockData()
  }

  // 2. 搜尋全台股清單（官方 2,800+ 檔上市 .TW 與上櫃 .TWO 精確匹配）
  if (twStocksData) {
    const list = Array.isArray(twStocksData) ? twStocksData : Object.values(twStocksData)
    for (const item of list) {
      const code = item.code || ''
      const name = item.name || ''
      const sym = item.symbol || ''
      const lowerName = name.toLowerCase()

      const isExact = code === upperQ || sym.toUpperCase() === upperQ || name === clean
      const isStart = code.startsWith(upperQ) || sym.toUpperCase().startsWith(upperQ) || lowerName.startsWith(q)
      const isInclude = code.includes(upperQ) || lowerName.includes(q)

      if (isExact) {
        addResult(exactMatches, { symbol: sym, name, market: 'TW' })
      } else if (isStart) {
        addResult(startMatches, { symbol: sym, name, market: 'TW' })
      } else if (isInclude) {
        addResult(includeMatches, { symbol: sym, name, market: 'TW' })
      }
    }
  }

  // 3. 搜尋美股 (US)
  if (stockData?.US) {
    for (const [sym, name] of Object.entries(stockData.US)) {
      const lowerName = name.toLowerCase()
      const isExact = sym.toUpperCase() === upperQ || name === clean
      const isStart = sym.toUpperCase().startsWith(upperQ) || lowerName.startsWith(q)
      const isInclude = sym.toLowerCase().includes(q) || lowerName.includes(q)

      if (isExact) {
        addResult(exactMatches, { symbol: sym, name, market: 'US' })
      } else if (isStart) {
        addResult(startMatches, { symbol: sym, name, market: 'US' })
      } else if (isInclude) {
        addResult(includeMatches, { symbol: sym, name, market: 'US' })
      }
    }
  }

  const combined = [...exactMatches, ...startMatches, ...includeMatches]
  return combined.slice(0, limit)
}

/**
 * 根據使用者輸入的文字，自動推導最佳的股票資訊
 * @param {string} rawInput - 使用者輸入（代號或關鍵字）
 * @returns {{ symbol: string, name: string, market: 'US' | 'TW' } | null}
 */
export function autoLookupStock(rawInput) {
  if (!rawInput || !rawInput.trim()) return null
  let clean = rawInput.trim().toUpperCase()

  // 美股特殊代號處理：BRK.B -> BRK-B
  if (/^[A-Z]{1,5}\.[A-Z]$/.test(clean)) {
    clean = clean.replace('.', '-')
  }

  // 1. 先用雙向搜尋找最佳已知結果（包含全台股上市上櫃）
  const searchResults = searchStocksTwoWay(rawInput, 1)
  if (searchResults.length > 0) {
    return searchResults[0]
  }

  // 2. 判斷是否為台股格式 (純數字 4~6 碼，或帶有 .TW / .TWO)
  if (/^\d{4,6}(\.TW|\.TWO)?$/.test(clean)) {
    const baseCode = clean.replace(/\.TW|\.TWO/g, '')
    const syncName = getTwStockNameSync(clean) || getTwStockNameSync(baseCode)
    return {
      symbol: clean.includes('.') ? clean : clean + '.TW',
      name: syncName || clean,
      market: 'TW'
    }
  }

  // 3. 若為美股代號 (支援一般英文字母或含連字號如 BRK-B、RKLB、ASTS)
  if (/^[A-Z0-9\-]{1,8}$/.test(clean)) {
    return {
      symbol: clean,
      name: clean,
      market: 'US'
    }
  }

  return null
}
