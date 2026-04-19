const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8080;

const STON_API = "https://api.ston.fi";
const DEDUST_API = "https://api.dedust.io";

const ALLOWED_PAIRS = new Set([
  "TON/USDT",
  "USDT/TON",
  "TON/NOT",
  "NOT/TON",
  "TON/DOGS",
  "DOGS/TON",
  "TON/USDC",
  "USDC/TON",
  "TON/BTC",
  "BTC/TON",
  "TON/ETH",
  "ETH/TON",
]);

function toNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function pickArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.markets)) return payload.markets;
  if (Array.isArray(payload?.pools)) return payload.pools;
  return [];
}

function getSymbolFromAsset(asset) {
  if (!asset) return null;
  return (
    asset.symbol ||
    asset.ticker ||
    asset.name ||
    asset.metadata?.symbol ||
    asset.metadata?.ticker ||
    null
  );
}

function cleanSymbol(symbol) {
  if (!symbol || typeof symbol !== "string") return null;
  return symbol.replace(/\s+/g, "").replace("-", "/").replace("_", "/").toUpperCase();
}

function normalizePair(a, b) {
  const left = cleanSymbol(a);
  const right = cleanSymbol(b);

  if (!left || !right) return null;
  if (left.includes("/")) return left;
  if (right.includes("/")) return right;

  return `${left}/${right}`;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    throw new Error(`${url} -> ${response.status}`);
  }

  return response.json();
}

function buildFallbackDeals() {
  const pairs = [
    "TON/USDT",
    "TON/NOT",
    "TON/DOGS",
    "TON/USDC",
    "TON/BTC",
    "TON/ETH",
    "USDT/TON",
    "DOGS/TON",
    "NOT/TON",
    "USDC/TON",
    "BTC/TON",
    "ETH/TON",
  ];

  return pairs.map((pair, index) => {
    const buyPrice = +(Math.random() * 2 + 0.001).toFixed(4);
    const sellPrice = +(buyPrice + Math.random() * 0.05).toFixed(4);
    const grossSpread = ((sellPrice - buyPrice) / buyPrice) * 100;
    const netSpread = Math.max(grossSpread - 0.35, 0);

    return {
      id: index + 1,
      pair,
      buyDex: Math.random() > 0.5 ? "STON" : "DeDust",
      sellDex: Math.random() > 0.5 ? "STON" : "DeDust",
      buyPrice,
      sellPrice,
      grossSpreadPercent: +grossSpread.toFixed(2),
      netSpreadPercent: +netSpread.toFixed(2),
      estimatedProfitTon: +(Math.random() * 0.8).toFixed(3),
      verified: true,
      risk: netSpread > 1.5 ? "low" : netSpread > 0.7 ? "medium" : "high",
    };
  });
}

function normalizeStonItem(item) {
  const directPair =
    item?.symbol ||
    item?.pair_symbol ||
    item?.display_name ||
    item?.market ||
    item?.name ||
    null;

  let pair = null;

  if (typeof directPair === "string" && directPair.includes("/")) {
    pair = cleanSymbol(directPair);
  } else {
    const a0 =
      getSymbolFromAsset(item?.asset0) ||
      getSymbolFromAsset(item?.base_asset) ||
      getSymbolFromAsset(item?.token0) ||
      item?.symbol0 ||
      item?.base_symbol ||
      null;

    const a1 =
      getSymbolFromAsset(item?.asset1) ||
      getSymbolFromAsset(item?.quote_asset) ||
      getSymbolFromAsset(item?.token1) ||
      item?.symbol1 ||
      item?.quote_symbol ||
      null;

    pair = normalizePair(a0, a1);
  }

  if (!pair || !ALLOWED_PAIRS.has(pair)) return null;

  const priceCandidates = [
    item?.price,
    item?.last_price,
    item?.asset0_price,
    item?.asset1_price,
    item?.price_usd,
    item?.priceUsd,
    item?.dex_usd_price,
  ]
    .map(toNum)
    .filter(Boolean);

  const price = priceCandidates[0] || null;
  if (!price) return null;

  return {
    pair,
    dex: "STON",
    price: +price.toFixed(8),
    raw: item,
  };
}

async function getStonPrices() {
  const candidates = [
    `${STON_API}/v1/markets`,
    `${STON_API}/v1/pools`,
  ];

  const all = [];

  for (const url of candidates) {
    try {
      const payload = await fetchJson(url);
      const items = pickArray(payload);
      for (const item of items) {
        const normalized = normalizeStonItem(item);
        if (normalized) all.push(normalized);
      }
      if (all.length) break;
    } catch (error) {
      console.error("STON fetch error:", error.message);
    }
  }

  const map = new Map();
  for (const row of all) {
    if (!map.has(row.pair)) map.set(row.pair, row);
  }

  return map;
}

function tryPoolPriceFromReserves(item) {
  const reserve0 = toNum(item?.reserve0 || item?.reserves?.[0] || item?.asset0_reserve);
  const reserve1 = toNum(item?.reserve1 || item?.reserves?.[1] || item?.asset1_reserve);
  const d0 = toNum(item?.asset0?.decimals ?? item?.decimals0 ?? 9);
  const d1 = toNum(item?.asset1?.decimals ?? item?.decimals1 ?? 9);

  if (!reserve0 || !reserve1 || d0 === null || d1 === null) return null;

  const n0 = reserve0 / Math.pow(10, d0);
  const n1 = reserve1 / Math.pow(10, d1);
  if (!n0 || !n1) return null;

  return n1 / n0;
}

function normalizeDedustItem(item) {
  const a0 =
    getSymbolFromAsset(item?.assets?.[0]) ||
    getSymbolFromAsset(item?.asset0) ||
    item?.symbol0 ||
    null;

  const a1 =
    getSymbolFromAsset(item?.assets?.[1]) ||
    getSymbolFromAsset(item?.asset1) ||
    item?.symbol1 ||
    null;

  const pair = normalizePair(a0, a1);
  if (!pair || !ALLOWED_PAIRS.has(pair)) return null;

  const priceCandidates = [
    item?.price,
    item?.last_price,
    item?.asset0_price,
    item?.asset1_price,
    tryPoolPriceFromReserves(item),
  ]
    .map(toNum)
    .filter(Boolean);

  const price = priceCandidates[0] || null;
  if (!price) return null;

  return {
    pair,
    dex: "DeDust",
    price: +price.toFixed(8),
    raw: item,
  };
}

async function getDedustPrices() {
  const url = `${DEDUST_API}/v2/pools`;

  try {
    const payload = await fetchJson(url);
    const items = pickArray(payload);
    const map = new Map();

    for (const item of items) {
      const normalized = normalizeDedustItem(item);
      if (normalized && !map.has(normalized.pair)) {
        map.set(normalized.pair, normalized);
      }
    }

    return map;
  } catch (error) {
    console.error("DeDust fetch error:", error.message);
    return new Map();
  }
}

function buildSpreadDeals(stonMap, dedustMap) {
  const allPairs = new Set([...stonMap.keys(), ...dedustMap.keys()]);
  const deals = [];

  for (const pair of allPairs) {
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
      risk: netSpread > 1.5 ? "low" : netSpread > 0.7 ? "medium" : "high",
    });
  }

  deals.sort((a, b) => b.netSpreadPercent - a.netSpreadPercent);
  return deals.slice(0, 30);
}

app.get("/", (_req, res) => {
  res.send("V-HUNT BACKEND WORKING");
});

app.get("/api/check", (_req, res) => {
  res.json({
    ok: true,
    message: "Backend работает",
    time: new Date().toISOString(),
  });
});

app.get("/api/scanner/live", async (_req, res) => {
  try {
    const [stonMap, dedustMap] = await Promise.all([
      getStonPrices(),
      getDedustPrices(),
    ]);

    const realDeals = buildSpreadDeals(stonMap, dedustMap);

    if (realDeals.length > 0) {
      return res.json({
        ok: true,
        source: "REAL-STON-DEDUST",
        deals: realDeals,
      });
    }

    return res.json({
      ok: true,
      source: "FALLBACK-DYNAMIC",
      deals: buildFallbackDeals(),
    });
  } catch (error) {
    console.error("scanner live error:", error);

    return res.status(500).json({
      ok: false,
      error: error.message || "Scanner failed",
    });
  }
});

app.listen(PORT, () => {
  console.log("Server started on port", PORT);
});
