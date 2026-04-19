const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8080;

const configPath = path.join(__dirname, "swap_config.json");
const SWAP_CONFIG = JSON.parse(fs.readFileSync(configPath, "utf-8"));

function formatPrice(amountOut, amountIn) {
  if (!amountIn || !amountOut) return 0;
  return +(amountOut / amountIn).toFixed(8);
}

function buildFallbackDeals() {
  return SWAP_CONFIG.pairs.map((p, index) => {
    const buyPrice = +(Math.random() * 2 + 0.01).toFixed(6);
    const sellPrice = +(buyPrice * (1 + Math.random() * 0.03)).toFixed(6);
    const grossSpread = ((sellPrice - buyPrice) / buyPrice) * 100;
    const netSpread = Math.max(grossSpread - 0.35, 0);

    return {
      id: index + 1,
      pair: p.pair,
      buyDex: "STON",
      sellDex: "DeDust",
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

async function getStonAssets() {
  try {
    const { StonApiClient } = require("@ston-fi/api");
    const apiClient = new StonApiClient();

    const assets = await apiClient.getAssets();
    return Array.isArray(assets) ? assets : [];
  } catch (error) {
    console.error("STON assets error:", error.message);
    return [];
  }
}

function findAssetAddressBySymbol(assets, symbol) {
  const upper = String(symbol || "").toUpperCase();

  const found = assets.find((asset) => {
    const metaSymbol =
      asset?.meta?.symbol ||
      asset?.meta?.displayName ||
      asset?.symbol ||
      "";
    return String(metaSymbol).toUpperCase() === upper;
  });

  if (!found) return null;

  return (
    found?.contractAddress ||
    found?.address ||
    found?.assetAddress ||
    null
  );
}

async function getStonQuote(pairCfg) {
  try {
    const { StonApiClient } = require("@ston-fi/api");
    const apiClient = new StonApiClient();

    const assets = await getStonAssets();

    const offerAddress =
      String(pairCfg.baseSymbol).toUpperCase() === "TON"
        ? "ton"
        : findAssetAddressBySymbol(assets, pairCfg.baseSymbol);

    const askAddress =
      String(pairCfg.quoteSymbol).toUpperCase() === "TON"
        ? "ton"
        : findAssetAddressBySymbol(assets, pairCfg.quoteSymbol);

    if (!offerAddress || !askAddress) {
      return {
        ok: false,
        reason: "asset-address-not-found",
        debug: {
          baseSymbol: pairCfg.baseSymbol,
          quoteSymbol: pairCfg.quoteSymbol,
          offerAddress,
          askAddress
        }
      };
    }

    const offerUnits = BigInt(
      Math.floor(Number(pairCfg.amountInBase) * Math.pow(10, pairCfg.baseDecimals))
    ).toString();

    const simulationResult = await apiClient.simulateSwap({
      offerAddress,
      askAddress,
      offerUnits,
      slippageTolerance: "0.01"
    });

    const askUnits =
      simulationResult?.minAskUnits ||
      simulationResult?.askUnits ||
      simulationResult?.estimatedAskUnits ||
      simulationResult?.router?.minAskUnits ||
      null;

    const amountOutHuman = askUnits
      ? Number(askUnits) / Math.pow(10, pairCfg.quoteDecimals)
      : 0;

    const amountInHuman = Number(pairCfg.amountInBase);
    const price = formatPrice(amountOutHuman, amountInHuman);

    if (!price) {
      return {
        ok: false,
        reason: "no-price",
        debug: {
          offerAddress,
          askAddress,
          simulationResult
        }
      };
    }

    return {
      ok: true,
      dex: "STON",
      pair: pairCfg.pair,
      amountIn: amountInHuman,
      amountOut: +amountOutHuman.toFixed(6),
      price,
      debug: {
        offerAddress,
        askAddress
      }
    };
  } catch (error) {
    return {
      ok: false,
      reason: error.message || "ston-simulate-error"
    };
  }
}

async function getDedustQuotePlaceholder() {
  return null;
}

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

app.get("/api/debug/assets", async (_req, res) => {
  try {
    const assets = await getStonAssets();

    const short = assets.slice(0, 20).map((asset) => ({
      symbol: asset?.meta?.symbol || asset?.meta?.displayName || asset?.symbol || null,
      contractAddress: asset?.contractAddress || asset?.address || asset?.assetAddress || null
    }));

    res.json({
      ok: true,
      source: "STON-ASSETS",
      total: assets.length,
      sample: short
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message || "assets debug failed"
    });
  }
});

app.get("/api/debug/ston", async (_req, res) => {
  try {
    const pairCfg = SWAP_CONFIG.pairs[0];
    const ston = await getStonQuote(pairCfg);

    return res.json({
      ok: true,
      source: "STON-DEBUG",
      pair: pairCfg,
      result: ston
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message || "debug failed"
    });
  }
});

app.get("/api/scanner/live", async (_req, res) => {
  try {
    const deals = [];

    for (const pairCfg of SWAP_CONFIG.pairs) {
      const ston = await getStonQuote(pairCfg);
      const dedust = await getDedustQuotePlaceholder(pairCfg);

      if (ston?.ok && dedust) {
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

        if (netSpread > 0) {
          deals.push({
            id: deals.length + 1,
            pair: pairCfg.pair,
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
      } else if (ston?.ok) {
        deals.push({
          id: deals.length + 1,
          pair: pairCfg.pair,
          buyDex: "STON",
          sellDex: "—",
          buyPrice: +ston.price.toFixed(8),
          sellPrice: +ston.price.toFixed(8),
          grossSpreadPercent: 0,
          netSpreadPercent: 0,
          estimatedProfitTon: 0,
          verified: true,
          risk: "low",
          note: "STON real quote ok, DeDust quote pending"
        });
      }
    }

    if (deals.length > 0) {
      return res.json({
        ok: true,
        source: "STON-REAL-QUOTE",
        deals
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
