import { NextResponse } from 'next/server';
import { fetchKlines, loadTickers } from '@/lib/binance';
import { analyzeTurtleSoup } from '@/lib/turtle';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const TF_LIMIT = { '5m': 100, '15m': 80, '1h': 60, '4h': 50 };

// POST { coins: [meta...], tf } → turtle soup rows (score >= 1)
export async function POST(req) {
  try {
    const body = await req.json();
    const coins = Array.isArray(body.coins) ? body.coins.slice(0, 12) : [];
    const tf = ['5m', '15m', '1h', '4h'].includes(body.tf) ? body.tf : '15m';
    if (!coins.length) return NextResponse.json({ ok: true, rows: [] });

    const tickers = await loadTickers();

    const rows = await Promise.all(
      coins.map(async (meta) => {
        try {
          const klines = await fetchKlines(meta.symbol, tf, TF_LIMIT[tf] || 80);
          if (klines.length < 20) return null;
          const a = analyzeTurtleSoup(klines);
          if (!a || a.score < 1) return null;
          const t = tickers[meta.symbol];
          return {
            ...meta,
            ...a,
            change24h: t?.change ?? meta.cgChange ?? a.change,
            quoteVolume: t?.quoteVolume || 0,
            timeframe: tf,
          };
        } catch (e) {
          return null;
        }
      })
    );

    return NextResponse.json({ ok: true, rows: rows.filter(Boolean), scanned: coins.length });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || 'Turtle scan failed' }, { status: 500 });
  }
}
