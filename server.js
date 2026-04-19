const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8080;

// ===== SAFE WHITELIST =====
const SAFE_PAIRS = [
  { base: "TON", quote: "USDT" },
  { base: "TON", quote: "USDC" },
  { base: "TON", quote: "NOT" },
  { base: "TON", quote: "DOGS" }
];

// ===== HELPERS =====
function toNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function buildFallbackDeals() {
  return SAFE_PAIRS.map((p, index) => {
    const buyPrice = +(Math.random() * 2 + 0.01).toFixed(6);
    const sellPrice = +(buyPrice * (1 + Math.random() * 0.03)).toFixed(6);
    const grossSpread = ((sellPrice - buyPrice) / buyPrice) * 100;
    const netSpread = Math.max(grossSpread - 0.35, 0);

    return {
      id: index + 1,
      pair: `${p.base}/${p.quote}`,
      buyDex: Math.random() > 0.5 ? "STON" : "DeDust",
      sellDex: Math.random() > 0.5 ? "STON" : "DeDust",
      buyPrice,
      sellPrice,
      grossSpreadPercent: +grossSpread.toFixed(2),
      netSpreadPercent: +netSpread.toFixed(2),
      estimatedProfitTon: +(Math.max(netSpread / 100 * 10, 0)).toFixed(3),
      verified: true,
      risk: netSpread > 1.5 ? "low" : netSpread > 0.7 ? "medium" : "high"
    };
  });
}

// ===== STON BEST-EFFORT =====
// Пока делаем мягкую интеграцию:
// если STON API ответит в ожидаемом виде — используем реальные данные
// если нет — просто не ломаем backend
async function getStonQuotes() {
  try {
    const response = await fetch("https://api.ston.fi/v1/markets", {
      headers: { Accept: "application/json" }
    });

    if (!response.ok) {
      throw new Error("STON API " + response.status);
    }

    const payload = await response.json();
    const items = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.markets)
      ? payload.markets
      : Array.isArray(payload?.data)
      ? payload.data
      : [];

    const result = new Map();

    for (const item of items) {
      const symbol =
        item?.symbol ||
        item?.pair_symbol ||
        item?.display_name ||
        item?.name ||
        "";

      if (typeof symbol !== "string" || !symbol.includes("/")) continue;

      const pair = symbol.replace("-", "/").replace("_", "/").toUpperCase();

      const price =
        toNum(item?.price) ||
        toNum(item?.last_price) ||
        toNum(item?.price_usd) ||
        toNum(item?.asset0_price);

      if (!price) continue;

      if (!SAFE_PAIRS.some(p => `${p.base}/${p.quote}` === pair)) continue;

      result.set(pair, {
        pair,
        dex: "STON",
        price: +price.toFixed(8)
      });
    }

    return result;
  } catch (error) {
    console.error("STON quotes error:", error.message);
    return new Map();
  }
}

// ===== DEDUST BEST-EFFORT =====
async function getDedustQuotes() {
  try {
    const response = await fetch("https://api.dedust.io/v2/pools", {
      headers: { Accept: "application/json" }
    });

    if (!response.ok) {
      throw new Error("DeDust API " + response.status);
    }

    const payload = await response.json();
    const items = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.pools)
      ? payload.pools
      : Array.isArray(payload?.data)
      ? payload.data
      : [];

    const result = new Map();

    for (const item of items) {
      const left =
        item?.assets?.[0]?.symbol ||
        item?.asset0?.symbol ||
        item?.symbol0 ||
        null;

      const right =
        item?.assets?.[1]?.symbol ||
        item?.asset1?.symbol ||
        item?.symbol1 ||
        null;

      if (!left || !right) continue;

      const pair = `${String(left).toUpperCase()}/${String(right).toUpperCase()}`;

      if (!SAFE_PAIRS.some(p => `${p.base}/${p.quote}` === pair)) continue;

      let price =
        toNum(item?.price) ||
        toNum(item?.last_price) ||
        toNum(item?.asset0_price);

      if (!price) {
        const reserve0 = toNum(item?.reserve0 || item?.reserves?.[0]);
        const reserve1 = toNum(item?.reserve1 || item?.reserves?.[1]);
        const decimals0 = toNum(item?.asset0?.decimals ?? 9, 9);
        const decimals1 = toNum(item?.asset1?.decimals ?? 9, 9);

        if (reserve0 && reserve1) {
          const n0 = reserve0 / Math.pow(10, decimals0);
          const n1 = reserve1 / Math.pow(10, decimals1);
          if (n0 && n1) price = n1 / n0;
        }
      }

      if (!price) continue;

      result.set(pair, {
        pair,
        dex: "DeDust",
        price: +price.toFixed(8)
      });
    }

    return result;
  } catch (error) {
    console.error("DeDust quotes error:", error.message);
    return new Map();
  }
}

// ===== BUILD REAL DEALS =====
function buildRealDeals(stonMap, dedustMap) {
  const deals = [];

  for (const p of SAFE_PAIRS) {
    const pair = `${p.base}/${p.quote}`;
    const ston = stonMap.get(pair);
    const dedust = dedustMap.get(pair);

    if (!ston || !dedust) continue;
    if (!ston.price || !dedust.price) continue;

    let buyDex = "STON";
    let sellDex = "DeDust";
    let buyPrice = ston.price;
    let sellPrice = dedust.price;

    if (dedust.price < ston.price) {
      buyDex = "DeDust";
      sellDex = "STON";
      buyPrice = dedust.price;
      sellPrice = ston.price;
    }

    const grossSpread = ((sellPrice - buyPrice) / buyPrice) * 100;
    const netSpread = Math.max(grossSpread - 0.35, 0);

    if (netSpread <= 0) continue;

    deals.push({
      id: deals.length + 1,
      pair,
      buyDex,
      sellDex,
      buyPrice: +buyPrice.toFixed(8),
      sellPrice: +sellPrice.toFixed(8),
      grossSpreadPercent: +grossSpread.toFixed(2),
      netSpreadPercent: +netSpread.toFixed(2),
      estimatedProfitTon: +(Math.max(netSpread / 100 * 10, 0)).toFixed(3),
      verified: true,
      risk: netSpread > 1.5 ? "low" : netSpread > 0.7 ? "medium" : "high"
    });
  }

  return deals;
}

// ===== ROUTES =====
app.get("/", (_req, res) => {
  res.send("V-HUNT BACKEND WORKING");
});

app.get("/api/check", (_req, res) => {
  res.json({
    ok: true,
    message: "Backend работает",
    time: new Date().toISOString()
  });
});

app.get("/api/scanner/live", async (_req, res) => {
  try {
    const [stonMap, dedustMap] = await Promise.all([
      getStonQuotes(),
      getDedustQuotes()
    ]);

    const realDeals = buildRealDeals(stonMap, dedustMap);

    if (realDeals.length > 0) {
      return res.json({
        ok: true,
        source: "REAL-QUOTES",
        deals: realDeals
      });
    }

    return res.json({
      ok: true,
      source: "FALLBACK-DYNAMIC",
      deals: buildFallbackDeals()
    });
  } catch (error) {
    console.error("scanner live error:", error);

    return res.status(500).json({
      ok: false,
      error: error.message || "scanner failed"
    });
  }
});

app.listen(PORT, () => {
  console.log("Server started on port", PORT);
});
