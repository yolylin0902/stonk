// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface SyncRequest {
  mode?: "full" | "quote_only";
  symbols?: string[];
  symbol?: string;
  name?: string;
  market?: "US" | "TW";
}

interface PriceResult {
  symbol: string;
  resolvedSymbol: string;
  price: number;
  change_percent: number;
  market_state: string; // 'REGULAR' | 'PRE' | 'POST' | 'CLOSED'
  market_time: number;  // epoch seconds
  shortName?: string;
}

// 輔助函式：從 Yahoo Finance 抓取即時報價與市場狀態（支援 query2 與 query1）
async function fetchYahooPrice(symbol: string): Promise<PriceResult | null> {
  const userAgent =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
  const endpoints = [
    `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`,
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`,
  ];

  for (const url of endpoints) {
    try {
      const resp = await fetch(url, {
        headers: { "User-Agent": userAgent },
      });
      if (!resp.ok) continue;

      const data = await resp.json();
      const result = data?.chart?.result?.[0];
      if (!result) continue;

      const meta = result.meta;
      const regularMarketPrice = meta?.regularMarketPrice;
      if (regularMarketPrice === undefined || regularMarketPrice === null) continue;

      let changePercent = 0;
      if (meta?.regularMarketChangePercent !== undefined && meta?.regularMarketChangePercent !== null) {
        changePercent = Number(meta.regularMarketChangePercent);
      } else {
        const prevClose = meta?.chartPreviousClose || meta?.previousClose;
        if (prevClose && prevClose > 0) {
          changePercent = ((regularMarketPrice - prevClose) / prevClose) * 100;
        } else {
          const quotes = result.indicators?.quote?.[0]?.close?.filter((c: any) => typeof c === "number") || [];
          if (quotes.length >= 2) {
            const last = quotes[quotes.length - 1];
            const prev = quotes[quotes.length - 2];
            changePercent = ((last - prev) / prev) * 100;
          }
        }
      }

      // 判斷市場狀態 (REGULAR / PRE / POST / CLOSED)
      let marketState = "CLOSED";
      if (meta?.marketState) {
        marketState = String(meta.marketState).toUpperCase();
      } else {
        const now = Math.floor(Date.now() / 1000);
        const period = meta?.currentTradingPeriod;
        if (period) {
          if (period.regular && now >= period.regular.start && now < period.regular.end) {
            marketState = "REGULAR";
          } else if (period.pre && now >= period.pre.start && now < period.pre.end) {
            marketState = "PRE";
          } else if (period.post && now >= period.post.start && now < period.post.end) {
            marketState = "POST";
          }
        }
      }

      const marketTime = Number(meta?.regularMarketTime) || Math.floor(Date.now() / 1000);

      return {
        symbol,
        resolvedSymbol: symbol,
        price: Math.round(Number(regularMarketPrice) * 100) / 100,
        change_percent: Math.round(changePercent * 100) / 100,
        market_state: marketState,
        market_time: marketTime,
        shortName: meta?.shortName || undefined,
      };
    } catch (e) {
      console.warn(`Yahoo API error for ${symbol} on ${url}:`, e);
    }
  }
  return null;
}

// 輔助函式：抓取與解析 Google News RSS（繁體中文／英文）
async function fetchGoogleNews(symbol: string, name: string, market: string): Promise<Array<{ title: string; link: string }>> {
  try {
    const cleanSym = symbol.replace(/\.TWO?$/i, "");
    let query = "";
    if (market === "TW") {
      const cleanName = name && name !== symbol ? name.replace(/\([^)]*\)/g, "").trim() : "";
      query = cleanName ? `${cleanName} ${cleanSym}` : `${cleanSym} 股票`;
    } else {
      query = `${cleanSym} stock news`;
    }

    const url = market === "TW"
      ? `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=zh-TW&gl=TW&ceid=TW:zh-Hant`
      : `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;

    const resp = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
    if (!resp.ok) return [];

    const xml = await resp.text();
    const items: Array<{ title: string; link: string }> = [];
    const itemRegex = /<item>[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<link>([\s\S]*?)<\/link>[\s\S]*?<\/item>/gi;
    let match;
    while ((match = itemRegex.exec(xml)) !== null && items.length < 5) {
      let rawTitle = (match[1] || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
      rawTitle = rawTitle
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .trim();
      let link = (match[2] || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim();
      if (rawTitle && link) {
        items.push({ title: rawTitle, link });
      }
    }
    return items;
  } catch (err) {
    console.warn("fetchGoogleNews error:", err);
    return [];
  }
}

// 輔助函式：呼叫 Gemini 進行故事分析（保證回傳純 JSON，支援無新聞保底分析）
interface AnalysisResult {
  chinese_name?: string;
  sentiment: string;
  headline: string;
  story_bullets: string[];
}

function isStrictlyChinese(text: string): boolean {
  if (!text) return false;
  const chineseChars = text.match(/[\u4e00-\u9fa5]/g) || [];
  if (chineseChars.length < 4) return false;
  // 不能包含 4 個以上連續英文單字（判定為未翻譯的英文句子）
  if (/[a-zA-Z]{2,}\s+[a-zA-Z]{2,}\s+[a-zA-Z]{2,}\s+[a-zA-Z]{2,}/.test(text)) {
    return false;
  }
  return true;
}

async function analyzeWithGemini(
  symbol: string,
  name: string,
  market: string,
  closePrice: number,
  changePercent: number,
  newsItems: Array<{ title: string; link: string }>,
  apiKey: string
): Promise<AnalysisResult | null> {
  if (!apiKey) {
    console.warn("analyzeWithGemini: No GEMINI_API_KEY provided");
    return null;
  }

  const newsSummary = newsItems.map((n, i) => `${i + 1}. ${n.title}`).join("\n");
  const trend = changePercent > 0
    ? `上漲 ${changePercent}%`
    : (changePercent < 0 ? `下跌 ${Math.abs(changePercent)}%` : "持平 0.0%");

  const prompt = `你是一位專業且客觀的股市分析師。請針對以下股票最新交易日行情與焦點新聞，進行精簡扼要的盤後焦點分析。
股票代號：${symbol}
原始名稱：${name}
所屬市場：${market === "TW" ? "台股" : "美股"}
最新收盤價：${closePrice}
最新漲跌幅：${trend}

相關最新新聞：
${newsSummary || "（目前查無最新即時新聞，請根據該股所屬產業地位、市場大盤整體氛圍與今日漲跌幅客觀綜述）"}

請嚴格輸出純 JSON 格式（絕對不要使用 Markdown 標籤如 \`\`\`json，直接輸出合法 JSON 物件），欄位規範如下：
1. "chinese_name": 該股票的繁體中文簡潔名稱（例如："安謀"、"帕蘭提爾"、"好市多"、"特斯拉"、"迪士尼"、"火箭實驗室"；若無通用中文譯名則為知名品牌名加中文領域如 "CrowdStrike (資安)"）。
2. "sentiment": 僅能為 "利多"、"利空" 或 "中性"（字串）。
3. "headline": 20 字以內的繁體中文精闢總結 headline（說明今日漲跌或市場核心主因；無論新聞為何種語言，一律以道地繁體中文呈現，嚴禁殘留任何英文標題或英文句子）。
4. "story_bullets": 2 到 3 點繁體中文重點條列（陣列字串），每點 30~50 字，依序說明：
   - 核心驅動事件、產業趨勢或大盤氛圍。
   - 技術面、評價面或法人資金動向。
   - 後續應留意的觀察關鍵指標。
   （特別注意：若輸入之新聞為英文，務必完整翻譯並精準編譯為客觀繁體中文重點，絕對不可出現未翻譯之英文句子或英文標籤）。
5. 嚴格禁止使用任何 Emoji 表情符號（如 📈、📉、🚀、⚠️、🔥 等）。

輸出範例格式：
{
  "chinese_name": "超微半導體",
  "sentiment": "利多",
  "headline": "AI伺服器拉貨動能強勁，營收創高激勵股價突破",
  "story_bullets": [
    "受惠最新一季法說會釋出樂觀指引，AI伺服器電源與散熱需求持續增溫。",
    "外資法人連續三個交易日擴大買超，技術線型突破月線支撐。",
    "後續需持續留意新一代晶片量產時程與全球科技股總體評價變化。"
  ]
}`;

  const models = ["gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-2.5-flash", "gemini-3.8-flash"];
  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.2,
          },
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.warn(`Gemini model ${model} status ${res.status}: ${errText}`);
        continue;
      }

      const json = await res.json();
      let rawText = json?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) continue;

      // 清理可能殘留的 markdown 標記 (```json ... ```)
      rawText = rawText.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();

      const parsed = JSON.parse(rawText);
      if (
        parsed &&
        parsed.headline &&
        Array.isArray(parsed.story_bullets) &&
        isStrictlyChinese(parsed.headline) &&
        parsed.story_bullets.every((b: any) => isStrictlyChinese(String(b)))
      ) {
        return {
          chinese_name: parsed.chinese_name ? String(parsed.chinese_name).trim() : undefined,
          sentiment: ["利多", "利空", "中性"].includes(parsed.sentiment)
            ? parsed.sentiment
            : (changePercent > 0.5 ? "利多" : (changePercent < -0.5 ? "利空" : "中性")),
          headline: String(parsed.headline).trim(),
          story_bullets: parsed.story_bullets.map((b: any) => String(b).trim()).slice(0, 3),
        };
      }
    } catch (err) {
      console.error(`Gemini model ${model} parse error:`, err);
    }
  }

  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. 驗證 Authorization
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY") ?? "";

    let isAuthorized = false;
    if (supabaseServiceKey && authHeader.includes(supabaseServiceKey)) {
      isAuthorized = true;
    } else {
      const userClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error: userError } = await userClient.auth.getUser();
      if (!userError && user) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      return new Response(JSON.stringify({ error: "Unauthorized user session" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: SyncRequest = await req.json();

    // ─────────────────────────────────────────────────────────────────
    // 模式 A：純即時報價模式 (quote_only)
    // 專供盤中多檔並行抓價，純記憶體運算，絕不寫入資料庫、不抓新聞、不呼叫 Gemini
    // ─────────────────────────────────────────────────────────────────
    if (body.mode === "quote_only") {
      const symbolsToFetch = Array.isArray(body.symbols) && body.symbols.length > 0
        ? body.symbols
        : (body.symbol ? [body.symbol] : []);

      if (symbolsToFetch.length === 0) {
        return new Response(JSON.stringify({ status: "success", quotes: {} }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // 並行向 Yahoo Finance 請求所有標的即時價格
      const quoteResults = await Promise.all(
        symbolsToFetch.map(async (sym) => {
          try {
            const clean = sym.trim();
            if (!clean) return null;
            let info = await fetchYahooPrice(clean);
            if (!info && clean.endsWith(".TW")) {
              info = await fetchYahooPrice(clean.replace(/\.TW$/, ".TWO"));
            }
            if (!info) return null;
            return { originalSymbol: clean, info };
          } catch (e) {
            console.warn(`Failed to fetch quote for ${sym}:`, e);
            return null;
          }
        })
      );

      const quotesMap: Record<
        string,
        { price: number; change_percent: number; market_state: string; market_time: number }
      > = {};

      for (const res of quoteResults) {
        if (res && res.info) {
          const item = {
            price: res.info.price,
            change_percent: res.info.change_percent,
            market_state: res.info.market_state,
            market_time: res.info.market_time,
          };
          quotesMap[res.originalSymbol] = item;
          if (res.info.resolvedSymbol && res.info.resolvedSymbol !== res.originalSymbol) {
            quotesMap[res.info.resolvedSymbol] = item;
          }
        }
      }

      return new Response(JSON.stringify({ status: "success", quotes: quotesMap }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─────────────────────────────────────────────────────────────────
    // 模式 B：完整新增同步模式 (full)
    // 兩階段寫入資料庫 + Google News + Gemini 故事分析
    // ─────────────────────────────────────────────────────────────────
    let symbol = (body.symbol || "").trim();
    let name = (body.name || "").trim() || symbol;
    const market = body.market || (symbol.includes(".TW") || /^\d{4,6}/.test(symbol) ? "TW" : "US");

    if (!symbol) {
      return new Response(JSON.stringify({ error: "Missing symbol" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. 建立管理員 Client 負責寫入資料表
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // 3. 對齊市場最新日期 (防呆)
    const { data: latestDateData } = await adminClient
      .from("daily_reports")
      .select("report_date")
      .eq("market", market)
      .order("report_date", { ascending: false })
      .limit(1);

    const reportDate = latestDateData?.[0]?.report_date || new Date().toISOString().split("T")[0];

    // 4. 抓取股價 (含 .TW -> .TWO 自動切換)
    let priceInfo = await fetchYahooPrice(symbol);
    if (!priceInfo && symbol.endsWith(".TW")) {
      const altSymbol = symbol.replace(/\.TW$/, ".TWO");
      priceInfo = await fetchYahooPrice(altSymbol);
      if (priceInfo) {
        symbol = altSymbol;
      }
    }

    const isPlaceholder = (n?: string, sym?: string) => {
      if (!n || typeof n !== "string") return true;
      const t = n.trim();
      if (!t) return true;
      if (sym) {
        const cleanSym = sym.trim().toUpperCase();
        const baseCode = cleanSym.replace(/\.(TW|TWO)$/i, "");
        if (t.toUpperCase() === cleanSym || t.toUpperCase() === baseCode) return true;
      }
      if (/^台股\s*[A-Z0-9.\-]+$/i.test(t)) return true;
      if (/^美股\s*[A-Z0-9.\-]+$/i.test(t)) return true;
      return false;
    };

    // 防呆：避免以「台股 XXXX」等佔位字覆蓋既有 daily_reports 中的正確公司名稱
    try {
      const { data: existingReport } = await adminClient
        .from("daily_reports")
        .select("name")
        .eq("report_date", reportDate)
        .eq("symbol", symbol)
        .maybeSingle();

      if (existingReport?.name && !isPlaceholder(existingReport.name, symbol) && isPlaceholder(name, symbol)) {
        name = existingReport.name;
      }
    } catch (_) {}

    // 若查無報價，寫入防呆紀錄並回傳 not_found
    if (!priceInfo) {
      const fallbackRecord = {
        report_date: reportDate,
        market: market,
        symbol: symbol,
        name: name,
        close_price: null,
        change_percent: 0.0,
        sentiment: "中性",
        headline: "查無報價（請確認股票代號是否正確）",
        story_bullets: [
          "Yahoo Finance 目前查無此代號之即時或收盤行情數據。",
          "請確認代號拼寫或市場類別（如台股上櫃代號為 .TWO）。",
          "若為無效標的，可點擊卡片右上角按鈕將其自自選移除。",
        ],
        news_links: [],
      };
      await adminClient.from("daily_reports").upsert(fallbackRecord, { onConflict: "report_date,symbol" });
      return new Response(JSON.stringify({ status: "not_found", symbol, report_date: reportDate }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 若有 shortName 且原名稱為佔位字或等於代號，更新名稱
    if (priceInfo.shortName && isPlaceholder(name, symbol)) {
      name = priceInfo.shortName;
      try {
        await adminClient.from("watchlist").update({ name }).eq("symbol", symbol);
      } catch (_) {}
    }

    // 5. 第一階段：立刻寫入最新價格與漲跌幅，讓前端瞬間取得行情
    const phase1Record = {
      report_date: reportDate,
      market: market,
      symbol: symbol,
      name: name,
      close_price: priceInfo.price,
      change_percent: priceInfo.change_percent,
      sentiment: priceInfo.change_percent > 0.5 ? "利多" : (priceInfo.change_percent < -0.5 ? "利空" : "中性"),
      headline: "已同步最新報價，AI 新聞分析整理中...",
      story_bullets: [
        `已取得最新交易資訊：價格 ${priceInfo.price}，漲跌幅 ${priceInfo.change_percent > 0 ? "+" : ""}${priceInfo.change_percent}%。`,
        "系統正同步擷取關鍵市場新聞並交由 AI 產生深度盤後重點...",
      ],
      news_links: [],
    };
    await adminClient.from("daily_reports").upsert(phase1Record, { onConflict: "report_date,symbol" });

    // 6. 第二階段：抓取 Google News RSS 與呼叫 Gemini 生成故事（若名稱為佔位字則以乾淨代號搜尋）
    const newsQueryName = isPlaceholder(name, symbol) ? "" : name;
    const newsItems = await fetchGoogleNews(symbol, newsQueryName, market);
    let aiResult = null;
    if (geminiApiKey) {
      try {
        aiResult = await analyzeWithGemini(
          symbol,
          name,
          market,
          priceInfo.price,
          priceInfo.change_percent,
          newsItems,
          geminiApiKey
        );
      } catch (geminiErr) {
        console.error("Gemini 分析過程異常:", geminiErr);
      }
    } else {
      console.warn("未設定 GEMINI_API_KEY，將使用新聞標題或行情保底");
    }

    // 關鍵保底：若 AI 成功則寫入 AI 結果；若 AI 未回傳則產生全繁體中文行情保底，絕不輸出未翻譯的英文新聞標題
    if (aiResult) {
      // 若 AI 提供繁體中文標準名稱，且目前名稱為代號或純英文，主動升級為中文友善名稱
      if (aiResult.chinese_name && (name === symbol || !/[\u4e00-\u9fa5]/.test(name))) {
        const cleanCn = aiResult.chinese_name.trim();
        name = cleanCn.includes(symbol) ? cleanCn : `${cleanCn} (${symbol})`;
        try {
          await adminClient.from("watchlist").update({ name }).eq("symbol", symbol);
        } catch (_) {}
      }

      const phase2Record = {
        report_date: reportDate,
        market: market,
        symbol: symbol,
        name: name,
        close_price: priceInfo.price,
        change_percent: priceInfo.change_percent,
        sentiment: aiResult.sentiment,
        headline: aiResult.headline,
        story_bullets: aiResult.story_bullets,
        news_links: newsItems,
      };
      await adminClient.from("daily_reports").upsert(phase2Record, { onConflict: "report_date,symbol" });
    } else {
      const trendStr = priceInfo.change_percent > 0
        ? `上漲 ${priceInfo.change_percent}%`
        : (priceInfo.change_percent < -0.5 ? `下跌 ${Math.abs(priceInfo.change_percent)}%` : `持平`);
      const guaranteedRecord = {
        report_date: reportDate,
        market: market,
        symbol: symbol,
        name: name,
        close_price: priceInfo.price,
        change_percent: priceInfo.change_percent,
        sentiment: priceInfo.change_percent > 0.5 ? "利多" : (priceInfo.change_percent < -0.5 ? "利空" : "中性"),
        headline: `${name || symbol}收盤報 ${priceInfo.price}（${trendStr}），市場密切關注產業後續動態`,
        story_bullets: [
          `當日行情：標的最新交易價格為 ${priceInfo.price}，全日表現為 ${trendStr}。`,
          `市場動態：所屬產業板塊呈現震盪走勢，市場資金持續觀察供應鏈與總體經濟指引。`,
          `後續觀察：宜留意短線關鍵支撐位表現，以及後續法說會與重要產業消息公布。`,
        ],
        news_links: newsItems,
      };
      await adminClient.from("daily_reports").upsert(guaranteedRecord, { onConflict: "report_date,symbol" });
    }

    return new Response(
      JSON.stringify({
        status: "success",
        symbol,
        market,
        report_date: reportDate,
        close_price: priceInfo.price,
        change_percent: priceInfo.change_percent,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    console.error("sync-stock edge function error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
