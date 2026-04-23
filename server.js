const express = require("express");
const cors = require("cors");
const path = require("path");
const { getListings } = require("./listing_scanner");

const app = express();
const PORT = process.env.PORT || 8080;

app.disable("etag");

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");
  next();
});

app.use(express.static(__dirname, {
  etag: false,
  lastModified: false,
  setHeaders: (res) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Surrogate-Control", "no-store");
  }
}));

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/api/check", (_req, res) => {
  res.json({
    ok: true,
    message: "V-HUNT backend работает",
    source: "LISTING_SCANNER",
    version: "2.0",
    time: new Date().toISOString()
  });
});

app.get("/api/listings/live", async (_req, res) => {
  try {
    const result = await getListings();
    res.json({
      ...result,
      version: "2.0",
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message || "listing scanner failed",
      generatedAt: new Date().toISOString()
    });
  }
});

app.listen(PORT, () => {
  console.log(`V-HUNT server started on port ${PORT}`);
});
