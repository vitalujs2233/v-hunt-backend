const pairs = require("./pairs");
const { checkLiquidity, checkProfit } = require("./filters");

async function scanDeals({
getStonQuote,
getDedustQuote,
dexFeeRate,
gasBufferTon,
serviceFeeTon
}) {
const deals = [];

for (const pairCfg of pairs) {
try {
const amountInTon = Number(pairCfg.amountInBase || 10);

const ston = await getStonQuote(pairCfg);
const dedust = await getDedustQuote(pairCfg);

if (!ston?.ok || !dedust?.ok) {
continue;
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

const rawSpreadPercent = ((sellPrice - buyPrice) / buyPrice) * 100;

const expectedTokenOut = amountInTon * buyPrice * (1 - dexFeeRate);
const expectedTonBack = (expectedTokenOut / sellPrice) * (1 - dexFeeRate);
const dexFeeTon = amountInTon * dexFeeRate * 2;

const estimatedProfitTon =
expectedTonBack - amountInTon - gasBufferTon - serviceFeeTon;

const estimatedProfitPercent =
amountInTon > 0 ? (estimatedProfitTon / amountInTon) * 100 : 0;

const liquidityCheck = checkLiquidity({
amountInTon,
expectedTonBack
});

const profitCheck = checkProfit({
estimatedProfitTon
});

if (!liquidityCheck.ok || !profitCheck.ok) {
continue;
}

deals.push({
pair: pairCfg.pair,
buyDex,
sellDex,
buyPrice: +buyPrice.toFixed(8),
sellPrice: +sellPrice.toFixed(8),
rawSpreadPercent: +rawSpreadPercent.toFixed(2),
expectedTokenOut: +expectedTokenOut.toFixed(6),
expectedTonBack: +expectedTonBack.toFixed(6),
dexFeeTon: +dexFeeTon.toFixed(3),
gasFeeTon: +gasBufferTon.toFixed(3),
serviceFeeTon: +serviceFeeTon.toFixed(3),
estimatedProfitTon: +estimatedProfitTon.toFixed(3),
estimatedProfitPercent: +estimatedProfitPercent.toFixed(2),
liquidityOk: liquidityCheck.ok,
tonBackRatio: liquidityCheck.tonBackRatio,
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
scanDeals
};
