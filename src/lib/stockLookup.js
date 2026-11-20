import stockData from './stockDirectory.json'

/**
 * 根據使用者輸入的代號，自動爬梳/查找正確的股票代號與公司名稱
 * @param {string} rawInput - 使用者輸入的文字（如 'SMCI', '2330', 'nvda', '0050.TW'）
 * @returns {{ symbol: string, name: string, market: 'US' | 'TW' } | null}
 */
export function autoLookupStock(rawInput) {
  if (!rawInput) return null
  const clean = rawInput.trim().toUpperCase()

  // 1. 先判斷是否為台股格式（純數字 4~6 碼，或帶有 .TW / .TWO）
  const isTaiwanPattern = /^\d{4,6}(\.TW|\.TWO)?$/.test(clean) || clean.endsWith('.TW') || clean.endsWith('.TWO')

  if (isTaiwanPattern) {
    const baseCode = clean.replace(/\.TW|\.TWO/g, '')
    // 先查純代號，再查後綴
    const twName = stockData.TW[baseCode] || stockData.TW[clean] || stockData.TW[baseCode + '.TW'] || stockData.TW[baseCode + '.TWO']
    
    if (twName) {
      const isOtc = clean.endsWith('.TWO') || (stockData.TW[baseCode + '.TWO'] && !stockData.TW[baseCode + '.TW'])
      return {
        symbol: baseCode + (isOtc ? '.TWO' : '.TW'),
        name: twName,
        market: 'TW'
      }
    }

    // 若台股資料庫暫無該冷門股，但格式確定是數字代碼
    return {
      symbol: clean.includes('.') ? clean : clean + '.TW',
      name: `台股 ${baseCode}`,
      market: 'TW'
    }
  }

  // 2. 判斷美股（英文字母）
  const usName = stockData.US[clean]
  if (usName) {
    return {
      symbol: clean,
      name: usName,
      market: 'US'
    }
  }

  // 3. 特殊台股代號（少數台股為英數混合）
  if (stockData.TW[clean]) {
    return {
      symbol: clean.includes('.') ? clean : clean + '.TW',
      name: stockData.TW[clean],
      market: 'TW'
    }
  }

  // 4. 若美股清單中無完全匹配，自動保留乾淨代號
  if (/^[A-Z]{1,6}$/.test(clean)) {
    return {
      symbol: clean,
      name: `${clean} Corp`,
      market: 'US'
    }
  }

  return null
}
