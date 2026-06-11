import { NextResponse } from 'next/server';
import { loadUniverse } from '@/lib/coingecko';
import { STABLES } from '@/lib/binance';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const CG = 'https://api.coingecko.com/api/v3';

async function cgOnlyUniverse(count) {
  const pages = Math.ceil(Math.min(count, 300) / 100);
  const coins = [];
  for (let page = 1; page <= pages; page++) {
    try {
      const url =
        CG + '/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=' +
        page + '&sparkline=false&price_change_percentage=24h';
      const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(14000) });
      if (!res.ok) break;
      const data = await res.json();
      for (const coin of data) {
        const base = String(coin.symbol || '').toUpperCase();
        const sym = base + 'USDT';
        if (!base || STABLES.has(base)) continue;
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
      if (page < pages) await new Promise((r) => setTimeout(r, 450));
    } catch {
      break;
    }
  }
  return coins.slice(0, count);
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const count = Math.min(500, Math.max(10, parseInt(searchParams.get('count') || '100', 10)));

  // Primary path: Binance + CoinGecko combined
  try {
    const { coins, cgOk } = await loadUniverse(count);
    return NextResponse.json({ ok: true, coins, cgOk });
  } catch {
    // Binance fully blocked — try CoinGecko-only universe
    try {
      const coins = await cgOnlyUniverse(count);
      if (coins.length) return NextResponse.json({ ok: true, coins, cgOk: true });
    } catch {}
    return NextResponse.json(
      { ok: false, error: 'Binance unreachable and CoinGecko failed' },
      { status: 500 }
    );
  }
}
