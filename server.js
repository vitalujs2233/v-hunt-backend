const express = require("express");
const cors = require("cors");
const path = require("path");
const { getListings } = require("./listing_scanner");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const PORT = process.env.PORT || 8080;

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/api/check", (_req, res) => {
  res.json({
    ok: true,
    message: "V-HUNT backend работает",
    source: "LISTING_SCANNER",
    version: "NEW_EXCHANGE_UI_V1",
    time: new Date().toISOString()
  });
});

app.get("/api/listings/live", async (_req, res) => {
  try {
    const result = await getListings();
    res.json({
      ...result,
      uiVersion: "NEW_EXCHANGE_UI_V1"
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message || "listing scanner failed",
      data: [],
      uiVersion: "NEW_EXCHANGE_UI_V1"
    });
  }
});

app.listen(PORT, () => {
  console.log("V-HUNT started on port", PORT);
});
