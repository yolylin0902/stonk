import stockData from './stockDirectory.json'

// 常見台美股別名與中英文快捷對照表（保證最頂級熱門股第一時間秒中）
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
  '台積電': { symbol: '2330.TW', name: '台積電', market: 'TW' },
  '台積': { symbol: '2330.TW', name: '台積電', market: 'TW' },
  '2330': { symbol: '2330.TW', name: '台積電', market: 'TW' },
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

/**
 * 雙向股票搜尋（代號 ⇄ 中英文關鍵字）
 * @param {string} rawQuery - 輸入文字（代號或關鍵字，如 'google', '聯發科', 'smci', '2330'）
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

  // 1. 檢查常用別名（最優先命中）
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

  // 2. 搜尋台股 (TW)
  for (const [sym, name] of Object.entries(stockData.TW)) {
    const lowerName = name.toLowerCase()
    const cleanSym = sym.includes('.') ? sym : sym + '.TW'
    const baseCode = sym.replace(/\.TW|\.TWO/g, '')

    // 排除長度超過 5 的權證等衍生性商品干擾，優先展示本股
    const isWarrant = baseCode.length >= 6

    const isExact = sym.toUpperCase() === upperQ || baseCode === upperQ || name === clean
    const isStart = sym.toUpperCase().startsWith(upperQ) || baseCode.startsWith(upperQ) || lowerName.startsWith(q)
    const isInclude = sym.toLowerCase().includes(q) || lowerName.includes(q)

    if (isExact) {
      addResult(exactMatches, { symbol: cleanSym, name, market: 'TW' })
    } else if (isStart && !isWarrant) {
      addResult(startMatches, { symbol: cleanSym, name, market: 'TW' })
    } else if (isInclude && !isWarrant) {
      addResult(includeMatches, { symbol: cleanSym, name, market: 'TW' })
    }
  }

  // 3. 搜尋美股 (US)
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

  // 1. 先用雙向搜尋找最佳已知結果
  const searchResults = searchStocksTwoWay(rawInput, 1)
  if (searchResults.length > 0) {
    return searchResults[0]
  }

  // 2. 判斷是否為台股格式 (純數字 4~6 碼，或帶有 .TW / .TWO)
  if (/^\d{4,6}(\.TW|\.TWO)?$/.test(clean)) {
    const baseCode = clean.replace(/\.TW|\.TWO/g, '')
    return {
      symbol: clean.includes('.') ? clean : clean + '.TW',
      name: `台股 ${baseCode}`,
      market: 'TW'
    }
  }

  // 3. 若為美股代號 (支援一般英文字母或含連字號如 BRK-B)
  if (/^[A-Z0-9\-]{1,8}$/.test(clean)) {
    return {
      symbol: clean,
      name: clean,
      market: 'US'
    }
  }

  return null
}
