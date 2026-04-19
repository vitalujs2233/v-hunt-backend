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
  res.json({
    ok: true,
    source: "NEW-BACKEND",
    deals: [
      {
        pair: "TON/USDT",
        buyDex: "STON",
        sellDex: "DeDust",
        buyPrice: 2.14,
        sellPrice: 2.19,
        profit: "есть спред"
      },
      {
        pair: "TON/NOT",
        buyDex: "DeDust",
        sellDex: "STON",
        buyPrice: 0.183,
        sellPrice: 0.187,
        profit: "средний спред"
      },
      {
        pair: "TON/DOGS",
        buyDex: "STON",
        sellDex: "DeDust",
        buyPrice: 0.0031,
        sellPrice: 0.0032,
        profit: "малый спред"
      },
      {
        pair: "USDT/TON",
        buyDex: "DeDust",
        sellDex: "STON",
        buyPrice: 0.467,
        sellPrice: 0.472,
        profit: "обратное направление"
      }
    ]
  });
});

app.listen(PORT, () => {
  console.log("Server started on port", PORT);
});
