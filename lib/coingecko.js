import { cachedFetch } from './cache';
import { fetchJSON, STABLES, loadTickers, loadExchangeSymbols } from './binance';

const CG = 'https://api.coingecko.com/api/v3';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Market-cap pages — cached 10 MINUTES. Market cap ranking itni jaldi nahi
// badalti, isliye free-tier limit kabhi hit nahi hogi: 5 pages / 10 min total,
// chahe 100 users ho ya 1.
async function loadCoinGeckoPage(page) {
  return cachedFetch(`cg:markets:${page}`, 600_000, async () => {
    const url =
      CG +
      '/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=' +
      page +
      '&sparkline=false&price_change_percentage=24h';
    return fetchJSON(url, 14000);
  });
}

export async function loadUniverse(count) {
  const tickers = await loadTickers();
  let validSet = new Set();
  try {
    validSet = new Set(await loadExchangeSymbols());
  } catch (e) {
    // fallback below
  }

  const coins = [];
  const pages = Math.ceil(count / 100);
  let cgOk = true;

  for (let page = 1; page <= pages; page++) {
    try {
      const data = await loadCoinGeckoPage(page);
      for (const coin of data) {
        const base = String(coin.symbol || '').toUpperCase();
        const sym = base + 'USDT';
        if (!base || STABLES.has(base)) continue;
        if (validSet.size && !validSet.has(sym)) continue;
        if (coins.some((c) => c.symbol === sym)) continue;
        coins.push({
          symbol: sym,
          base,
          name: coin.name || base,
          rank: coin.market_cap_rank || coins.length + 1,
          image: coin.image || '',
          marketCap: coin.market_cap || 0,
          cgPrice: coin.current_price || null,
          cgChange: coin.price_change_percentage_24h ?? null,
        });
      }
      if (page < pages) await sleep(450); // server-side pacing, cache hone par skip ho jata hai
    } catch (e) {
      cgOk = false;
      break;
    }
  }

  // Volume fallback (CoinGecko down/limited ho to)
  if (coins.length < Math.min(30, count)) {
    coins.length = 0;
  }
  if (coins.length < count) {
    const existing = new Set(coins.map((c) => c.symbol));
    const fallback = Object.values(tickers)
      .filter((t) => t.symbol.endsWith('USDT'))
      .filter((t) => !STABLES.has(t.symbol.replace('USDT', '')))
      .filter((t) => !validSet.size || validSet.has(t.symbol))
      .sort((a, b) => (b.quoteVolume || 0) - (a.quoteVolume || 0));
    for (const t of fallback) {
      if (coins.length >= count) break;
      if (existing.has(t.symbol)) continue;
      coins.push({
        symbol: t.symbol,
        base: t.symbol.replace('USDT', ''),
        name: t.symbol.replace('USDT', ''),
        rank: coins.length + 1,
        image: '',
        marketCap: 0,
        cgPrice: null,
        cgChange: null,
      });
    }
  }

  return { coins: coins.slice(0, count), cgOk, tickerCount: Object.keys(tickers).length };
}
