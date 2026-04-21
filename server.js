// AUTO_SCANNER_FORCE_REDEPLOY_002
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { Address } = require("@ton/core");
const { TonClient4 } = require("@ton/ton");
const {
  Factory,
  MAINNET_FACTORY_ADDR,
  Asset,
  PoolType,
  ReadinessStatus
} = require("@dedust/sdk");
const { scanMarkets } = require("./auto_scanner");
const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8080;
const CACHE_TTL_MS = 15000;
const REFRESH_INTERVAL_MS = 12000;
const DEX_FEE_RATE = 0.003;
const GAS_BUFFER_TON = 0.05;
const SERVICE_FEE_TON = 0.02;
const SERVICE_FEE_WALLET = "UQCWnrQ8uMswELtmUkZuC1wuqZoUe9E5XonXxVxcrUzgvnGS";
const STON_SDK_RPC_ENDPOINT = process.env.STON_SDK_RPC_ENDPOINT || "https://toncenter.com/api/v2/jsonRPC";
const STON_REFERRAL_BPS = Number(process.env.STON_REFERRAL_BPS || 10);

const tonClient = new TonClient4({
  endpoint: "https://mainnet-v4.tonhubapi.com"
});

const dedustFactory = tonClient.open(
  Factory.createFromAddress(MAINNET_FACTORY_ADDR)
);

const configPath = path.join(__dirname, "swap_config.json");
const SWAP_CONFIG = JSON.parse(fs.readFileSync(configPath, "utf-8"));

const scannerCache = {
  deals: [],
  source: "CACHE-EMPTY",
  updatedAt: 0,
  isRefreshing: false,
  lastError: null
};

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
    const tradeAmountTon = Number(p.amountInBase || 10);

    return {
      id: index + 1,
      pair: p.pair,
      buyDex: "STON",
      sellDex: "DeDust",
      buyPrice,
      sellPrice,
      grossSpreadPercent: +grossSpread.toFixed(2),
      netSpreadPercent: +netSpread.toFixed(2),
      estimatedProfitTon: +(Math.max((netSpread / 100) * tradeAmountTon, 0)).toFixed(3),
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
      pairCfg.baseAddress ||
      (String(pairCfg.baseSymbol).toUpperCase() === "TON"
        ? "ton"
        : findAssetAddressBySymbol(assets, pairCfg.baseSymbol));

    const askAddress =
      pairCfg.quoteAddress ||
      (String(pairCfg.quoteSymbol).toUpperCase() === "TON"
        ? "ton"
        : findAssetAddressBySymbol(assets, pairCfg.quoteSymbol));

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

async function getDedustQuote(pairCfg) {
  try {
    const TON = Asset.native();
    const QUOTE = Asset.jetton(Address.parse(pairCfg.quoteAddress));

    const pool = tonClient.open(
      await dedustFactory.getPool(PoolType.VOLATILE, [TON, QUOTE])
    );

    const readiness = await pool.getReadinessStatus();

    if (readiness !== ReadinessStatus.READY) {
      return {
        ok: false,
        reason: "dedust-pool-not-ready",
        debug: {
          readiness: String(readiness)
        }
      };
    }

    const amountIn = BigInt(
      Math.floor(Number(pairCfg.amountInBase) * 10 ** pairCfg.baseDecimals)
    );

    const result = await pool.getEstimatedSwapOut({
      assetIn: TON,
      amountIn
    });

    const amountOutRaw =
      result?.amountOut ??
      result?.amount_out ??
      result?.outAmount ??
      result?.askUnits ??
      result;

    const amountOut = Number(amountOutRaw) / 10 ** pairCfg.quoteDecimals;
    const price = formatPrice(amountOut, Number(pairCfg.amountInBase));

    if (!price) {
      return {
        ok: false,
        reason: "no-price",
        debug: { result }
      };
    }

    return {
      ok: true,
      dex: "DeDust",
      pair: pairCfg.pair,
      amountIn: Number(pairCfg.amountInBase),
      amountOut: +amountOut.toFixed(6),
      price
    };
  } catch (error) {
    return {
      ok: false,
      reason: error.message || "dedust-error"
    };
  }
}

async function buildLiveDeals() {
  const deals = await scanMarkets({
    getStonQuote,
    getDedustQuote
  });

  return deals.map((deal, index) => ({
    id: index + 1,
    ...deal
  }));
}

async function refreshScannerCache() {
  if (scannerCache.isRefreshing) return scannerCache;
  scannerCache.isRefreshing = true;

  try {
    const deals = await buildLiveDeals();

    scannerCache.deals = deals;
    scannerCache.source = "SCANNER-LIVE-V3-CACHED";
    scannerCache.updatedAt = Date.now();
    scannerCache.lastError = null;
  } catch (error) {
    console.error("refreshScannerCache error:", error);
    scannerCache.lastError = error.message || "refresh failed";

    if (!scannerCache.deals.length) {
      scannerCache.deals = [];
      scannerCache.source = "SCANNER-LIVE-V3-CACHED";
      scannerCache.updatedAt = Date.now();
    }
  } finally {
    scannerCache.isRefreshing = false;
  }

  return scannerCache;
}

function getCacheAgeMs() {
  return scannerCache.updatedAt ? Date.now() - scannerCache.updatedAt : null;
}

function isCacheFresh() {
  const age = getCacheAgeMs();
  return age !== null && age < CACHE_TTL_MS && scannerCache.deals.length > 0;
}

app.get("/", (_req, res) => {
  res.send("V-HUNT BACKEND WORKING");
});

app.get("/api/check", (_req, res) => {
  res.json({
    ok: true,
    message: "Backend работает",
    build: "AUTO_SCANNER_FIX_001",
    time: new Date().toISOString(),
    cacheAgeMs: getCacheAgeMs(),
    cacheDeals: scannerCache.deals.length,
    cacheSource: scannerCache.source
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

app.get("/api/debug/dedust", async (_req, res) => {
  try {
    const pairCfg = SWAP_CONFIG.pairs[0];
    const dedust = await getDedustQuote(pairCfg);

    return res.json({
      ok: true,
      source: "DEDUST-DEBUG-V2",
      time: Date.now(),
      pair: pairCfg,
      result: dedust
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message || "dedust debug failed"
    });
  }
});

app.get("/api/scanner/live", async (_req, res) => {
  try {
    if (!isCacheFresh()) {
      await refreshScannerCache();
    }

    return res.json({
      ok: true,
      source: scannerCache.source,
      cacheAgeMs: getCacheAgeMs(),
      deals: scannerCache.deals
    });
  } catch (error) {
    console.error("scanner live error:", error);
    return res.status(500).json({
      ok: false,
      error: error.message || "scanner failed"
    });
  }
});

app.get("/api/scanner/live2", async (_req, res) => {
  try {
    if (!scannerCache.deals.length) {
      await refreshScannerCache();
    } else if (!isCacheFresh()) {
      refreshScannerCache().catch((error) => {
        console.error("background cache refresh error:", error);
      });
    }

    return res.json({
      ok: true,
      source: scannerCache.source,
      time: Date.now(),
      cacheAgeMs: getCacheAgeMs(),
      deals: scannerCache.deals
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message || "scanner live2 failed"
    });
  }
});

refreshScannerCache().catch((error) => {
  console.error("initial cache warmup error:", error);
});

setInterval(() => {
  refreshScannerCache().catch((error) => {
    console.error("interval cache refresh error:", error);
  });
}, REFRESH_INTERVAL_MS);


app.get("/api/quote/roundtrip", async (req, res) => {
  try {
    const pair = String(req.query.pair || "").trim();
    const amount = Number(req.query.amount || 0);

    if (!pair) {
      return res.status(400).json({
        ok: false,
        error: "pair is required"
      });
    }

    if (!amount || amount <= 0) {
      return res.status(400).json({
        ok: false,
        error: "amount must be greater than 0"
      });
    }

    const pairCfgBase = SWAP_CONFIG.pairs.find((p) => p.pair === pair);

    if (!pairCfgBase) {
      return res.status(404).json({
        ok: false,
        error: "pair not found in swap_config"
      });
    }

    const pairCfg = {
      ...pairCfgBase,
      amountInBase: String(amount)
    };

    const ston = await getStonQuote(pairCfg);
    const dedust = await getDedustQuote(pairCfg);

    if (!ston?.ok || !dedust?.ok) {
      return res.json({
        ok: false,
        pair,
        amountInTon: amount,
        ston,
        dedust,
        error: "quote unavailable on one of dexes"
      });
    }

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

    const amountInTon = amount;
    const rawSpreadPercent = ((sellPrice - buyPrice) / buyPrice) * 100;
    const expectedTokenOut = amountInTon * buyPrice * (1 - DEX_FEE_RATE);
    const expectedTonBack = (expectedTokenOut / sellPrice) * (1 - DEX_FEE_RATE);
    const dexFeeTon = amountInTon * DEX_FEE_RATE * 2;
    const estimatedProfitTon = expectedTonBack - amountInTon - GAS_BUFFER_TON - SERVICE_FEE_TON;
    const estimatedProfitPercent = amountInTon > 0
      ? (estimatedProfitTon / amountInTon) * 100
      : 0;

    return res.json({
      ok: true,
      pair,
      amountInTon,
      buyDex,
      sellDex,
      buyPrice: +buyPrice.toFixed(8),
      sellPrice: +sellPrice.toFixed(8),
      rawSpreadPercent: +rawSpreadPercent.toFixed(2),
      expectedTokenOut: +expectedTokenOut.toFixed(6),
      expectedTonBack: +expectedTonBack.toFixed(6),
      dexFeeTon: +dexFeeTon.toFixed(3),
      gasFeeTon: +GAS_BUFFER_TON.toFixed(3),
      serviceFeeTon: +SERVICE_FEE_TON.toFixed(3),
      serviceFeeWallet: SERVICE_FEE_WALLET,
      estimatedProfitTon: +estimatedProfitTon.toFixed(3),
      estimatedProfitPercent: +estimatedProfitPercent.toFixed(2),
      canExecute: estimatedProfitTon > 0
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message || "roundtrip quote failed"
    });
  }
});


app.get("/api/tx/ston-buy", async (req, res) => {
  try {
    const pair = String(req.query.pair || "").trim();
    const amount = Number(req.query.amount || 0);
    const wallet = String(req.query.wallet || "").trim();

    if (!pair) {
      return res.status(400).json({
        ok: false,
        error: "pair is required"
      });
    }

    if (!amount || amount <= 0) {
      return res.status(400).json({
        ok: false,
        error: "amount must be greater than 0"
      });
    }

    if (!wallet) {
      return res.status(400).json({
        ok: false,
        error: "wallet is required"
      });
    }

    const pairCfgBase = SWAP_CONFIG.pairs.find((p) => p.pair === pair);

    if (!pairCfgBase) {
      return res.status(404).json({
        ok: false,
        error: "pair not found in swap_config"
      });
    }

    if (String(pairCfgBase.baseSymbol || "").toUpperCase() !== "TON") {
      return res.status(400).json({
        ok: false,
        error: "only TON -> jetton buy is supported in this step"
      });
    }

    const pairCfg = {
      ...pairCfgBase,
      amountInBase: String(amount)
    };

    const { StonApiClient } = require("@ston-fi/api");
    const { dexFactory, Client } = require("@ston-fi/sdk");

    const apiClient = new StonApiClient();

    const offerUnits = BigInt(
      Math.floor(Number(pairCfg.amountInBase) * Math.pow(10, pairCfg.baseDecimals))
    ).toString();

    const simulationResult = await apiClient.simulateSwap({
      offerAddress: pairCfg.baseAddress || "ton",
      askAddress: pairCfg.quoteAddress,
      offerUnits,
      slippageTolerance: "0.01"
    });

    const { router: routerInfo } = simulationResult;

    if (!routerInfo?.address || !routerInfo?.ptonMasterAddress) {
      return res.status(500).json({
        ok: false,
        error: "router info missing in simulation result"
      });
    }

    const tonApiClient = new Client({
      endpoint: STON_SDK_RPC_ENDPOINT
    });

    const dexContracts = dexFactory(routerInfo);
    const router = tonApiClient.open(
      dexContracts.Router.create(routerInfo.address)
    );
    const proxyTon = dexContracts.pTON.create(routerInfo.ptonMasterAddress);

    const txParams = await router.getSwapTonToJettonTxParams({
      userWalletAddress: wallet,
      offerAmount: simulationResult.offerUnits,
      minAskAmount: simulationResult.minAskUnits,
      askJettonAddress: simulationResult.askAddress,
      proxyTon,
      referralAddress: SERVICE_FEE_WALLET,
      referralValue: STON_REFERRAL_BPS
    });

    return res.json({
      ok: true,
      step: "STON_BUY",
      pair,
      amountInTon: amount,
      wallet,
      referralAddress: SERVICE_FEE_WALLET,
      referralValue: STON_REFERRAL_BPS,
      routerAddress: routerInfo.address,
      ptonMasterAddress: routerInfo.ptonMasterAddress,
      simulation: {
        offerUnits: simulationResult.offerUnits,
        minAskUnits: simulationResult.minAskUnits,
        askAddress: simulationResult.askAddress
      },
      tonConnectMessage: {
        address: txParams.to.toString(),
        amount: txParams.value.toString(),
        payload: txParams.body?.toBoc().toString("base64") || null
      }
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message || "ston buy tx build failed"
    });
  }
});


app.get("/api/tx/ston-sell", async (req, res) => {
  try {
    const pair = String(req.query.pair || "").trim();
    const amount = Number(req.query.amount || 0);
    const wallet = String(req.query.wallet || "").trim();

    if (!pair) {
      return res.status(400).json({
        ok: false,
        error: "pair is required"
      });
    }

    if (!amount || amount <= 0) {
      return res.status(400).json({
        ok: false,
        error: "amount must be greater than 0"
      });
    }

    if (!wallet) {
      return res.status(400).json({
        ok: false,
        error: "wallet is required"
      });
    }

    const pairCfgBase = SWAP_CONFIG.pairs.find((p) => p.pair === pair);

    if (!pairCfgBase) {
      return res.status(404).json({
        ok: false,
        error: "pair not found in swap_config"
      });
    }

    if (String(pairCfgBase.baseSymbol || "").toUpperCase() !== "TON") {
      return res.status(400).json({
        ok: false,
        error: "only jetton -> TON sell is supported in this step"
      });
    }

    const { StonApiClient } = require("@ston-fi/api");
    const { dexFactory, Client } = require("@ston-fi/sdk");

    const apiClient = new StonApiClient();

    const offerUnits = BigInt(
      Math.floor(Number(amount) * Math.pow(10, pairCfgBase.quoteDecimals))
    ).toString();

    const simulationResult = await apiClient.simulateSwap({
      offerAddress: pairCfgBase.quoteAddress,
      askAddress: pairCfgBase.baseAddress || "ton",
      offerUnits,
      slippageTolerance: "0.01"
    });

    const { router: routerInfo } = simulationResult;

    if (!routerInfo?.address || !routerInfo?.ptonMasterAddress) {
      return res.status(500).json({
        ok: false,
        error: "router info missing in simulation result"
      });
    }

    const tonApiClient = new Client({
      endpoint: STON_SDK_RPC_ENDPOINT
    });

    const dexContracts = dexFactory(routerInfo);
    const router = tonApiClient.open(
      dexContracts.Router.create(routerInfo.address)
    );
    const proxyTon = dexContracts.pTON.create(routerInfo.ptonMasterAddress);

    const txParams = await router.getSwapJettonToTonTxParams({
      userWalletAddress: wallet,
      offerJettonAddress: pairCfgBase.quoteAddress,
      offerAmount: simulationResult.offerUnits,
      minAskAmount: simulationResult.minAskUnits,
      proxyTon,
      referralAddress: SERVICE_FEE_WALLET,
      referralValue: STON_REFERRAL_BPS
    });

    return res.json({
      ok: true,
      step: "STON_SELL",
      pair,
      amountInJetton: amount,
      wallet,
      referralAddress: SERVICE_FEE_WALLET,
      referralValue: STON_REFERRAL_BPS,
      routerAddress: routerInfo.address,
      ptonMasterAddress: routerInfo.ptonMasterAddress,
      simulation: {
        offerUnits: simulationResult.offerUnits,
        minAskUnits: simulationResult.minAskUnits,
        askAddress: simulationResult.askAddress
      },
      tonConnectMessage: {
        address: txParams.to.toString(),
        amount: txParams.value.toString(),
        payload: txParams.body?.toBoc().toString("base64") || null
      }
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message || "ston sell tx build failed"
    });
  }
});

app.listen(PORT, () => {
  console.log("Server started on port", PORT);
});
