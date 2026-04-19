import express from "express";
import cors from "cors";

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8080;

// 🔥 ПРОСТОЙ ТЕСТ (чтобы убедиться что Railway работает)
app.get("/", (req, res) => {
  res.send("V-HUNT BACKEND WORKING 🚀");
});

// 🔥 ТЕСТ API
app.get("/api/check", (req, res) => {
  res.json({
    ok: true,
    message: "Backend работает",
    time: new Date().toISOString()
  });
});

// 🔥 ПОКА ДАЕМ ПРОСТЫЕ ДАННЫЕ (НЕ mock из старого проекта!)
app.get("/api/scanner/live", (req, res) => {
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
      }
    ]
  });
});

app.listen(PORT, () => {
  console.log("Server started on port", PORT);
});
