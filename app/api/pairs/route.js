import { NextResponse } from 'next/server';
import { loadTickers, STABLES } from '@/lib/binance';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const EXCLUDE = /(UP|DOWN|BULL|BEAR)USDT$/;

// Top N USDT pairs by 24h quote volume (EdgeRank universe) — cached tickers se
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const count = Math.min(500, Math.max(10, parseInt(searchParams.get('count') || '100', 10)));
    const tickers = await loadTickers();
    const pairs = Object.values(tickers)
      .filter((t) => t.symbol.endsWith('USDT') && !EXCLUDE.test(t.symbol) && !STABLES.has(t.symbol.replace('USDT', '')) && t.quoteVolume > 0)
      .sort((a, b) => b.quoteVolume - a.quoteVolume)
      .slice(0, count)
      .map((t) => ({ sym: t.symbol, last: t.price, chg: t.change, qv: t.quoteVolume }));
    return NextResponse.json({ ok: true, pairs });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || 'Pairs load failed' }, { status: 500 });
  }
}
