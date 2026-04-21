const TOKENS = require("./market_tokens");
const CONFIG = require("./scanner_config");

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
let buyPrice = ston.price;
let sellPrice = dedust.price;

if (dedust.price < ston.price) {
buyDex = "DeDust";
sellDex = "STON";
buyPrice = dedust.price;
sellPrice = ston.price;
}

const amountInTon = CONFIG.TRADE_AMOUNT_TON;
const rawSpreadPercent = ((sellPrice - buyPrice) / buyPrice) * 100;

const expectedTokenOut = amountInTon * buyPrice * (1 - CONFIG.DEX_FEE_RATE);
const expectedTonBack = (expectedTokenOut / sellPrice) * (1 - CONFIG.DEX_FEE_RATE);

const dexFeeTon = amountInTon * CONFIG.DEX_FEE_RATE * 2;
const estimatedProfitTon =
expectedTonBack - amountInTon - CONFIG.GAS_BUFFER_TON - CONFIG.SERVICE_FEE_TON;

const estimatedProfitPercent =
amountInTon > 0 ? (estimatedProfitTon / amountInTon) * 100 : 0;

const tonBackRatio = amountInTon > 0 ? expectedTonBack / amountInTon : 0;
const liquidityOk = tonBackRatio >= CONFIG.MIN_TON_BACK_RATIO;
const canExecute = liquidityOk && estimatedProfitTon > CONFIG.MIN_PROFIT_TON;

if (!canExecute) continue;

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
gasFeeTon: +CONFIG.GAS_BUFFER_TON.toFixed(3),
serviceFeeTon: +CONFIG.SERVICE_FEE_TON.toFixed(3),
estimatedProfitTon: +estimatedProfitTon.toFixed(3),
canExecute: true,
verified: true,
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
