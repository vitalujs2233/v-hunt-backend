const https = require("https");

function getJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
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
      })
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

async function getListings() {
  try {
    const bybit = await getBybitListings(20);

    return {
      ok: true,
      source: "BYBIT_API",
      total: bybit.length,
      data: bybit
    };
  } catch (error) {
    return {
      ok: false,
      source: "BYBIT_API",
      error: error.message || "listing scanner failed",
      data: []
    };
  }
}

module.exports = {
  getListings
};
