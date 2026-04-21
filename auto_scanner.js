const TOKENS = require("./market_tokens");
const CONFIG = require("./scanner_config");

const stabilityMemory = new Map();

function getPairKey(baseSymbol, quoteSymbol) {
  return `${String(baseSymbol || "").toUpperCase()}/${String(quoteSymbol || "").toUpperCase()}`;
}

function rememberSpread(pairKey, spreadValue) {
  const prev = stabilityMemory.get(pairKey) || [];
  prev.push(Number(spreadValue || 0));

  while (prev.length > 3) {
    prev.shift();
  }

  stabilityMemory.set(pairKey, prev);
  return prev;
}

function isStablePositive(history, minPercent = 1.0) {
  if (!Array.isArray(history) || history.length < 3) return false;
  return history.every((value) => Number(value) >= Number(minPercent));
}

async function scanMarkets({
  getStonQuote,
  getDedustQuote
}) {
  const deals = [];

  for (const token of TOKENS) {
    if (!token.enabled) continue;

    try {
      const pairCfg = {
        pair: `${CONFIG.BASE_SYMBOL}/${token.symbol}`,
        baseSymbol: CONFIG.BASE_SYMBOL,
        quoteSymbol: token.symbol,
        baseAddress: CONFIG.BASE_ADDRESS,
        quoteAddress: token.address,
        baseDecimals: CONFIG.BASE_DECIMALS,
        quoteDecimals: token.decimals,
        amountInBase: String(CONFIG.TRADE_AMOUNT_TON)
      };

      const ston = await getStonQuote(pairCfg);
      const dedust = await getDedustQuote(pairCfg);

      if (!ston?.ok || !dedust?.ok) continue;

      let buyDex = "STON";
      let sellDex = "DeDust";
      let buyPrice = Number(ston.price);
      let sellPrice = Number(dedust.price);

      if (Number(dedust.price) < Number(ston.price)) {
        buyDex = "DeDust";
        sellDex = "STON";
        buyPrice = Number(dedust.price);
        sellPrice = Number(ston.price);
      }

      if (!buyPrice || !sellPrice) continue;

      const amountInTon = Number(CONFIG.TRADE_AMOUNT_TON);
      const rawSpreadPercent = ((sellPrice - buyPrice) / buyPrice) * 100;

      const expectedTokenOut = amountInTon * buyPrice * (1 - Number(CONFIG.DEX_FEE_RATE));
      const expectedTonBack = (expectedTokenOut / sellPrice) * (1 - Number(CONFIG.DEX_FEE_RATE));

      const dexFeeTon = amountInTon * Number(CONFIG.DEX_FEE_RATE) * 2;
      const estimatedProfitTon =
        expectedTonBack - amountInTon - Number(CONFIG.GAS_BUFFER_TON) - Number(CONFIG.SERVICE_FEE_TON);

      const estimatedProfitPercent =
        amountInTon > 0 ? (estimatedProfitTon / amountInTon) * 100 : 0;

      const tonBackRatio = amountInTon > 0 ? expectedTonBack / amountInTon : 0;
      const liquidityOk = tonBackRatio >= Number(CONFIG.MIN_TON_BACK_RATIO);
      const canExecute = liquidityOk && estimatedProfitTon > Number(CONFIG.MIN_PROFIT_TON);

      const pairKey = getPairKey(pairCfg.baseSymbol, pairCfg.quoteSymbol);
      const spreadHistory = rememberSpread(pairKey, estimatedProfitPercent);
      const stablePositive = isStablePositive(spreadHistory, 1.0);

      if (!canExecute) continue;
      if (!stablePositive) continue;

      deals.push({
        pair: pairCfg.pair,
        buyDex,
        sellDex,
        buyPrice: +buyPrice.toFixed(8),
        sellPrice: +sellPrice.toFixed(8),
        rawSpreadPercent: +rawSpreadPercent.toFixed(2),
        grossSpreadPercent: +rawSpreadPercent.toFixed(2),
        netSpreadPercent: +estimatedProfitPercent.toFixed(2),
        expectedTokenOut: +expectedTokenOut.toFixed(6),
        expectedTonBack: +expectedTonBack.toFixed(6),
        dexFeeTon: +dexFeeTon.toFixed(3),
        gasFeeTon: +Number(CONFIG.GAS_BUFFER_TON).toFixed(3),
        serviceFeeTon: +Number(CONFIG.SERVICE_FEE_TON).toFixed(3),
        estimatedProfitTon: +estimatedProfitTon.toFixed(3),
        canExecute: true,
        verified: true,
        stabilityChecks: spreadHistory.length,
        stable: true,
        risk: estimatedProfitTon > 0.15 ? "low" : "medium"
      });
    } catch (error) {
      continue;
    }
  }

  deals.sort((a, b) => b.estimatedProfitTon - a.estimatedProfitTon);
  return deals;
}

module.exports = {
  scanMarkets
};
