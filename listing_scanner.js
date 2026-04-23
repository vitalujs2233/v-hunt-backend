const https = require("https");

function getText(url) {
  return new Promise((resolve, reject) => {
    https
      .get(
        url,
        {
          headers: {
            "User-Agent": "Mozilla/5.0 V-HUNT Listing Scanner"
          }
        },
        (res) => {
          let data = "";
          res.on("data", (chunk) => {
            data += chunk;
          });
          res.on("end", () => resolve(data));
        }
      )
      .on("error", reject);
  });
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(
        url,
        {
          headers: {
            "User-Agent": "Mozilla/5.0 V-HUNT Listing Scanner",
            "Accept": "application/json"
          }
        },
        (res) => {
          let data = "";

          res.on("data", (chunk) => {
            data += chunk;
          });

          res.on("end", () => {
            try {
              const json = JSON.parse(data);
              resolve(json);
            } catch (err) {
              reject(err);
            }
          });
        }
      )
      .on("error", reject);
  });
}

function normalizeBybitItem(item) {
  const title = String(item?.title || "").trim();
  const description = String(item?.description || "").trim();
  const typeKey = String(item?.type?.key || "").trim();
  const typeTitle = String(item?.type?.title || "").trim();
  const tags = Array.isArray(item?.tags) ? item.tags : [];
  const url = String(item?.url || "").trim();

  const isListing =
    typeKey === "new_crypto" ||
    /new listing/i.test(title) ||
    /new listings/i.test(typeTitle);

  if (!isListing) return null;

  const pairMatch = title.match(/\(([A-Z0-9]+)\)/);
  const symbolFromBrackets = pairMatch ? pairMatch[1] : null;

  return {
    exchange: "Bybit",
    title,
    description,
    symbol: symbolFromBrackets || null,
    pair: symbolFromBrackets ? `${symbolFromBrackets}/USDT` : null,
    tags,
    url,
    publishedAt: item?.publishTime || item?.dateTimestamp || null,
    status: "new_listing"
  };
}

async function getBybitListings(limit = 20) {
  const url = `https://api.bybit.com/v5/announcements/index?locale=en-US&limit=${limit}`;
  const json = await getJson(url);
  const list = json?.result?.list || [];
  return list.map(normalizeBybitItem).filter(Boolean);
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeOkxTitle(title) {
  return stripHtml(title).replace(/Published on.*$/i, "").trim();
}

function extractSymbolFromTitle(title) {
  const clean = String(title || "");
  const match1 = clean.match(/\b([A-Z0-9]{2,})USDT\b/i);
  if (match1) return match1[1].toUpperCase();

  const match2 = clean.match(/\b([A-Z0-9]{2,})\/(?:USDⓈ|USD|USDT)\b/i);
  if (match2) return match2[1].toUpperCase();

  const match3 = clean.match(/\(([A-Z0-9]{2,})\)/);
  if (match3) return match3[1].toUpperCase();

  return null;
}

function extractPairFromTitle(title) {
  const clean = String(title || "");

  const match1 = clean.match(/\b([A-Z0-9]{2,})USDT\b/i);
  if (match1) return `${match1[1].toUpperCase()}/USDT`;

  const match2 = clean.match(/\b([A-Z0-9]{2,})\/(USDⓈ|USD|USDT)\b/i);
  if (match2) return `${match2[1].toUpperCase()}/${match2[2].toUpperCase()}`;

  return null;
}

async function getOkxListings(limit = 10) {
  const url = "https://www.okx.com/help/section/announcements-new-listings";
  const html = await getText(url);

  const cardRegex = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const results = [];
  const seen = new Set();
  let match;

  while ((match = cardRegex.exec(html)) !== null && results.length < limit) {
    const href = match[1];
    const block = match[2];

    if (!/\/help\//i.test(href)) continue;

    const title = normalizeOkxTitle(block);
    if (!title) continue;
    if (!/list|launch/i.test(title)) continue;
    if (/delist/i.test(title)) continue;

    const fullUrl = href.startsWith("http") ? href : `https://www.okx.com${href}`;
    if (seen.has(fullUrl)) continue;
    seen.add(fullUrl);

    const symbol = extractSymbolFromTitle(title);
    const pair = extractPairFromTitle(title);

    results.push({
      exchange: "OKX",
      title,
      description: "Official OKX new listing announcement",
      symbol: symbol || null,
      pair: pair || null,
      tags: ["New Listings"],
      url: fullUrl,
      publishedAt: null,
      status: "new_listing"
    });
  }

  return results;
}

async function getListings() {
  const all = [];
  const errors = [];

  try {
    const bybit = await getBybitListings(20);
    all.push(...bybit);
  } catch (error) {
    errors.push(`BYBIT: ${error.message}`);
  }

  try {
    const okx = await getOkxListings(10);
    all.push(...okx);
  } catch (error) {
    errors.push(`OKX: ${error.message}`);
  }

  return {
    ok: all.length > 0,
    source: "BYBIT_API+OKX",
    total: all.length,
    errors,
    data: all
  };
}

module.exports = {
  getListings
};
