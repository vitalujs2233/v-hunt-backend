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
version: "NEW_UI_V2",
time: new Date().toISOString()
});
});

app.get("/api/listings/live", async (_req, res) => {
try {
const result = await getListings();

res.json({
ok: true,
data: result.data || result,
ui: "EXCHANGE_MODE"
});

} catch (error) {
res.status(500).json({
ok: false,
error: error.message || "listing scanner failed",
data: []
});
}
});

app.listen(PORT, () => {
console.log("V-HUNT started on port", PORT);
});
