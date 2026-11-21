// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface SyncRequest {
  symbol: string;
  name?: string;
  market?: "US" | "TW";
}

interface PriceResult {
  resolvedSymbol: string;
  closePrice: number;
  changePercent: number;
  shortName?: string;
}

// 輔助函式：從 Yahoo Finance 抓取股價與漲跌幅（支援 query2 與 query1）
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

      return {
        resolvedSymbol: symbol,
        closePrice: Math.round(Number(regularMarketPrice) * 100) / 100,
        changePercent: Math.round(changePercent * 100) / 100,
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
    const query = name && name !== symbol ? `${name} ${cleanSym}` : cleanSym;
    let url = "";
    if (market === "TW") {
      url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=zh-TW&gl=TW&ceid=TW:zh-Hant`;
    } else {
      url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
    }

    const resp = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
    if (!resp.ok) return [];

    const xml = await resp.text();
    const items: Array<{ title: string; link: string }> = [];
    const itemRegex = /<item>[\s\S]*?<title>(.*?)<\/title>[\s\S]*?<link>(.*?)<\/link>[\s\S]*?<\/item>/gi;
    let match;
    while ((match = itemRegex.exec(xml)) !== null && items.length < 5) {
      let rawTitle = match[1] || "";
      rawTitle = rawTitle
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .trim();
      const link = (match[2] || "").trim();
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

// 輔助函式：呼叫 Gemini 進行故事分析
async function analyzeWithGemini(
  symbol: string,
  name: string,
  market: string,
  closePrice: number,
  changePercent: number,
  newsItems: Array<{ title: string; link: string }>,
  apiKey: string
): Promise<{ sentiment: string; headline: string; story_bullets: string[] } | null> {
  if (!apiKey) return null;

  const newsSummary = newsItems.map((n, i) => `${i + 1}. ${n.title}`).join("\n");
  const trend = changePercent > 0 ? `上漲 ${changePercent}%` : (changePercent < 0 ? `下跌 ${Math.abs(changePercent)}%` : "持平 0.0%");

  const prompt = `你是一位專業且客觀的股市分析師。請針對以下股票最新交易日行情與焦點新聞，進行精簡扼要的盤後焦點分析。
股票名稱：${name} (${symbol})
所屬市場：${market === "TW" ? "台股" : "美股"}
最新收盤價：${closePrice}
最新漲跌幅：${trend}

相關最新新聞：
${newsSummary || "（目前查無最新即時新聞，請根據該股產業趨勢與漲跌幅客觀綜述）"}

請嚴格輸出 JSON 格式（不要使用 Markdown 標記，直接輸出合法 JSON），欄位規範如下：
1. "sentiment": 僅能為 "利多"、"利空" 或 "中性"（字串）。
2. "headline": 20 字以內的繁體中文精闢總結 headline（說明今日漲跌或市場核心主因）。
3. "story_bullets": 2 到 3 點繁體中文重點條列（陣列字串），每點 30~50 字，依序說明：
   - 核心驅動事件或財報/法說/總經消息。
   - 產業地位、技術面或法人買賣超動向。
   - 後續應留意的觀察關鍵指標。

輸出範例格式：
{
  "sentiment": "利多",
  "headline": "AI伺服器拉貨動能強勁，營收創高激勵股價突破",
  "story_bullets": [
    "受惠最新一季法說會釋出樂觀指引，AI伺服器電源與散熱需求持續增溫。",
    "外資法人連續三個交易日擴大買超，技術線型突破月線支撐。",
    "後續需持續留意新一代晶片量產時程與全球科技股總體評價變化。"
  ]
}`;

  const models = ["gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-3.8-flash"];
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
        console.warn(`Gemini model ${model} returned status ${res.status}`);
        continue;
      }

      const json = await res.json();
      const rawText = json?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) continue;

      const parsed = JSON.parse(rawText.trim());
      if (parsed && parsed.headline && Array.isArray(parsed.story_bullets)) {
        return {
          sentiment: ["利多", "利空", "中性"].includes(parsed.sentiment) ? parsed.sentiment : (changePercent > 0.5 ? "利多" : (changePercent < -0.5 ? "利空" : "中性")),
          headline: String(parsed.headline).trim(),
          story_bullets: parsed.story_bullets.map((b: any) => String(b).trim()).slice(0, 3),
        };
      }
    } catch (err) {
      console.warn(`Gemini model ${model} error:`, err);
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
        // 更新 symbol 為精確的 .TWO
        symbol = altSymbol;
      }
    }

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

    // 若有 shortName 且原 name === symbol，更新名稱
    if (priceInfo.shortName && (name === symbol || !name)) {
      name = priceInfo.shortName;
      // 順便同步回更新 watchlist 中的名稱
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
      close_price: priceInfo.closePrice,
      change_percent: priceInfo.changePercent,
      sentiment: priceInfo.changePercent > 0.5 ? "利多" : (priceInfo.changePercent < -0.5 ? "利空" : "中性"),
      headline: "已同步最新報價，AI 新聞分析整理中...",
      story_bullets: [
        `已取得最新交易資訊：價格 ${priceInfo.closePrice}，漲跌幅 ${priceInfo.changePercent > 0 ? "+" : ""}${priceInfo.changePercent}%。`,
        "系統正同步擷取關鍵市場新聞並交由 AI 產生深度盤後重點...",
      ],
      news_links: [],
    };
    await adminClient.from("daily_reports").upsert(phase1Record, { onConflict: "report_date,symbol" });

    // 6. 第二階段：抓取 Google News RSS 與呼叫 Gemini 生成故事
    const newsItems = await fetchGoogleNews(symbol, name, market);
    let aiResult = null;
    if (geminiApiKey) {
      aiResult = await analyzeWithGemini(
        symbol,
        name,
        market,
        priceInfo.closePrice,
        priceInfo.changePercent,
        newsItems,
        geminiApiKey
      );
    }

    // 若 AI 產出成功，補完該筆紀錄
    if (aiResult) {
      const phase2Record = {
        report_date: reportDate,
        market: market,
        symbol: symbol,
        name: name,
        close_price: priceInfo.closePrice,
        change_percent: priceInfo.changePercent,
        sentiment: aiResult.sentiment,
        headline: aiResult.headline,
        story_bullets: aiResult.story_bullets,
        news_links: newsItems,
      };
      await adminClient.from("daily_reports").upsert(phase2Record, { onConflict: "report_date,symbol" });
    } else if (newsItems.length > 0) {
      // 若 AI 未產出但有新聞，使用新聞標題作為條列
      const fallbackPhase2 = {
        report_date: reportDate,
        market: market,
        symbol: symbol,
        name: name,
        close_price: priceInfo.closePrice,
        change_percent: priceInfo.changePercent,
        sentiment: priceInfo.changePercent > 0.5 ? "利多" : (priceInfo.changePercent < -0.5 ? "利空" : "中性"),
        headline: newsItems[0]?.title || `最新行情收盤於 ${priceInfo.closePrice}`,
        story_bullets: newsItems.slice(0, 3).map((n) => n.title),
        news_links: newsItems,
      };
      await adminClient.from("daily_reports").upsert(fallbackPhase2, { onConflict: "report_date,symbol" });
    }

    return new Response(
      JSON.stringify({
        status: "success",
        symbol,
        market,
        report_date: reportDate,
        close_price: priceInfo.closePrice,
        change_percent: priceInfo.changePercent,
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
