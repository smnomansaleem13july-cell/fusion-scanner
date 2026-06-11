import { NextResponse } from 'next/server';
import { loadTickers } from '@/lib/binance';
import { analyzeSymbol } from '@/lib/fusion';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// POST { coins: [meta...], tf, mtf, liq, minScore, dirFilter }
// Frontend batches bhejti hai (8-10 coins per call), server analysis karta hai.
export async function POST(req) {
  try {
    const body = await req.json();
    const coins = Array.isArray(body.coins) ? body.coins.slice(0, 12) : [];
    const tf = ['5m', '15m', '1h', '4h', '1d'].includes(body.tf) ? body.tf : '15m';
    const mtf = !!body.mtf;
    const liq = !!body.liq;
    const minScore = Number.isFinite(body.minScore) ? body.minScore : 0;
    const dirFilter = body.dirFilter === 'long' || body.dirFilter === 'short' ? body.dirFilter : 'all';

    if (!coins.length) return NextResponse.json({ ok: true, rows: [], scanned: 0 });

    const tickers = await loadTickers();

    const results = await Promise.all(
      coins.map(async (meta) => {
        try {
          const row = await analyzeSymbol(meta, tf, tickers[meta.symbol], { mtf, liqRequired: liq });
          if (!row) return null;
          if (dirFilter !== 'all' && row.dir !== dirFilter) return null;
          if (row.score < minScore) return null;
          return row;
        } catch (e) {
          return null;
        }
      })
    );

    return NextResponse.json({ ok: true, rows: results.filter(Boolean), scanned: coins.length });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || 'Scan failed' }, { status: 500 });
  }
}
