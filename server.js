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
    "NOT/TON"
  ];

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
