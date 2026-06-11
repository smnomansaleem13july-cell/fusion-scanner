import { cachedFetch } from './cache';

const BASES = [
  'https://api.binance.com',
  'https://api1.binance.com',
  'https://api2.binance.com',
  'https://api3.binance.com',
];

const STABLES = new Set(['USDT','USDC','BUSD','DAI','TUSD','USDP','GUSD','FRAX','LUSD','SUSD','USDN','UST','FDUSD','PYUSD']);

async function fetchJSON(url, ms = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

async function fetchBinance(path, ms = 10000) {
  let lastErr;
  for (const base of BASES) {
    try {
      return await fetchJSON(base + path, ms);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('Binance unreachable');
}

// 24h tickers — cached 45s (sab users share karte hain)
export async function loadTickers() {
  return cachedFetch('bnb:tickers', 45_000, async () => {
    const data = await fetchBinance('/api/v3/ticker/24hr', 13000);
    const map = {};
    for (const t of data) {
      if (t.symbol && t.symbol.endsWith('USDT')) {
        map[t.symbol] = {
          symbol: t.symbol,
          price: parseFloat(t.lastPrice),
          quoteVolume: parseFloat(t.quoteVolume),
          change: parseFloat(t.priceChangePercent),
          high: parseFloat(t.highPrice),
          low: parseFloat(t.lowPrice),
        };
      }
    }
    return map;
  });
}

// Tradable USDT symbols — cached 1 hour
export async function loadExchangeSymbols() {
  return cachedFetch('bnb:exchangeInfo', 3_600_000, async () => {
    const data = await fetchBinance('/api/v3/exchangeInfo', 13000);
    return data.symbols
      .filter((s) => s.quoteAsset === 'USDT' && s.status === 'TRADING')
      .map((s) => s.symbol);
  });
}

// Klines — cached 25s per symbol+tf (scan ke time hammering nahi hoti)
export async function fetchKlines(symbol, tf, limit) {
  return cachedFetch(`bnb:kl:${symbol}:${tf}:${limit}`, 25_000, async () => {
    const data = await fetchBinance(
      '/api/v3/klines?symbol=' + encodeURIComponent(symbol) +
      '&interval=' + encodeURIComponent(tf) + '&limit=' + limit,
      9000
    );
    return data
      .map((k) => ({
        time: Number(k[0]),
        closeTime: Number(k[6]),
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5]),
        quoteVolume: parseFloat(k[7]),
        takerBuyBase: parseFloat(k[9]),
        takerBuyQuote: parseFloat(k[10]),
      }))
      .filter((c) => Number.isFinite(c.close));
  });
}

export { STABLES, fetchJSON };
