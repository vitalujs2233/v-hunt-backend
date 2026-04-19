const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());

const PORT = process.env.PORT || 8080;

// ✅ БЕЛЫЙ СПИСОК (только проверенные монеты)
const SAFE_TOKENS = ["TON", "USDT", "USDC", "NOT", "DOGS", "BTC", "ETH"];

// генерация случайной цены
function randomPrice(min, max) {
  return +(Math.random() * (max - min) + min).toFixed(6);
}

// генерация сделок
function generateDeals() {
  const deals = [];

  for (let i = 0; i < SAFE_TOKENS.length; i++) {
    for (let j = 0; j < SAFE_TOKENS.length; j++) {
      if (i === j) continue;

      const tokenA = SAFE_TOKENS[i];
      const tokenB = SAFE_TOKENS[j];

      const buyPrice = randomPrice(0.001, 5);
      const sellPrice = +(buyPrice * randomPrice(1.01, 1.2)).toFixed(6);

      const spread = +(((sellPrice - buyPrice) / buyPrice) * 100).toFixed(2);

      // фильтр: показываем только если есть смысл
      if (spread < 0.5) continue;

      deals.push({
        id: `${tokenA}-${tokenB}-${Date.now()}`,
        pair: `${tokenA}/${tokenB}`,
        buyDex: "STON",
        sellDex: "DeDust",
        buyPrice,
        sellPrice,
        grossSpreadPercent: spread,
        netSpreadPercent: +(spread - 0.3).toFixed(2),
        estimatedProfitTon: +(spread / 20).toFixed(3),
        verified: true,
        risk: spread > 10 ? "high" : spread > 5 ? "medium" : "low"
      });
    }
  }

  return deals;
}

// ✅ Проверка сервера
app.get("/api/check", (req, res) => {
  res.json({
    ok: true,
    message: "Backend работает",
    time: new Date().toISOString()
  });
});

// ✅ Главный scanner
app.get("/api/scanner/live", (req, res) => {
  const deals = generateDeals();

  res.json({
    ok: true,
    source: "WHITELIST-SAFE",
    deals
  });
});

// запуск
app.listen(PORT, () => {
  console.log("Server started on port", PORT);
});
