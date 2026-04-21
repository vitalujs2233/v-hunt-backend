function checkLiquidity({
amountInTon,
expectedTonBack,
minTonBackRatio = 0.97
}) {
const amountIn = Number(amountInTon || 0);
const tonBack = Number(expectedTonBack || 0);

if (!amountIn || !tonBack) {
return {
ok: false,
reason: "no-liquidity-data"
};
}

const ratio = tonBack / amountIn;

if (ratio < minTonBackRatio) {
return {
ok: false,
reason: "low-liquidity",
tonBackRatio: +ratio.toFixed(4)
};
}

return {
ok: true,
tonBackRatio: +ratio.toFixed(4)
};
}

function checkProfit({
estimatedProfitTon,
minProfitTon = 0.01
}) {
const profit = Number(estimatedProfitTon || 0);

if (profit <= minProfitTon) {
return {
ok: false,
reason: "no-profit"
};
}

return {
ok: true
};
}

module.exports = {
checkLiquidity,
checkProfit
};
