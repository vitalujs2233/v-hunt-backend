const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8080;

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

app.get("/api/scanner/live", (_req, res) => {
  const pairs = [
    "TON/USDT",
    "TON/NOT",
    "TON/DOGS",
    "TON/GRAM",
    "TON/BOLT",
    "TON/JETTON",
    "USDT/TON",
    "DOGS/TON",
    "NOT/TON",
    "TON/USDC",
    "TON/BTC",
    "TON/ETH",
    "USDT/NOT",
    "USDT/DOGS",
    "USDT/GRAM",
    "DOGS/NOT",
    "BOLT/TON",
    "GRAM/TON"
  ];

  const deals = pairs.map((pair, index) => {
    const buyPrice = +(Math.random() * 2 + 0.001).toFixed(4);
    const sellPrice = +(buyPrice + Math.random() * 0.05).toFixed(4);
    const grossSpread = ((sellPrice - buyPrice) / buyPrice * 100);
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
      risk: netSpread > 1.5 ? "low" : netSpread > 0.7 ? "medium" : "high"
    };
  });

  res.json({
    ok: true,
    source: "DYNAMIC-SCANNER",
    deals
  });
});
  const deals = pairs.map((pair) => {
    const buyPrice = +(Math.random() * 2 + 0.001).toFixed(4);
    const sellPrice = +(buyPrice + Math.random() * 0.05).toFixed(4);

    return {
      pair,
      buyDex: Math.random() > 0.5 ? "STON" : "DeDust",
      sellDex: Math.random() > 0.5 ? "STON" : "DeDust",
      buyPrice,
      sellPrice,
      spread: ((sellPrice - buyPrice) / buyPrice * 100).toFixed(2) + "%"
    };
  });

  res.json({
    ok: true,
    source: "DYNAMIC-SCANNER",
    deals
  });
});

app.listen(PORT, () => {
  console.log("Server started on port", PORT);
});
