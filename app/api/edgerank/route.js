import { NextResponse } from 'next/server';
import { fetchKlines } from '@/lib/binance';
import { edgeFactors } from '@/lib/edgerank';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// POST { pairs: [{sym,last,chg,qv}...] } → rows with factors
// (Composite z-score client pe hota hai kyunki wo poore set par depend karta hai)
export async function POST(req) {
  try {
    const body = await req.json();
    const pairs = Array.isArray(body.pairs) ? body.pairs.slice(0, 16) : [];
    if (!pairs.length) return NextResponse.json({ ok: true, rows: [] });

    const rows = await Promise.all(
      pairs.map(async (p) => {
        try {
          const k = await fetchKlines(p.sym, '1h', 200);
          if (k.length < 170) return null;
          return { ...p, f: edgeFactors(k) };
        } catch (e) {
          return null;
        }
      })
    );

    return NextResponse.json({ ok: true, rows: rows.filter(Boolean) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || 'EdgeRank scan failed' }, { status: 500 });
  }
}
