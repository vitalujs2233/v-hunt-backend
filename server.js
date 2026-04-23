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
  setHeaders: (res, filePath) => {
    if (filePath.endsWith(".html") || filePath.endsWith(".js") || filePath.endsWith(".css")) {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      res.setHeader("Surrogate-Control", "no-store");
    }
  }
}));

app.get("/", (_req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/api/check", (_req, res) => {
  res.json({
    ok: true,
    message: "V-HUNT backend работает",
    source: "LISTING_SCANNER",
    time: new Date().toISOString()
  });
});

app.get("/api/listings/live", async (_req, res) => {
  try {
    const result = await getListings();
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.json(result);
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message || "listing scanner failed"
    });
  }
});

app.listen(PORT, () => {
  console.log("Server started on port", PORT);
});
