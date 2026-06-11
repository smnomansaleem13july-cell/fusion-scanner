import { NextResponse } from 'next/server';
import { loadUniverse } from '@/lib/coingecko';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const count = Math.min(500, Math.max(10, parseInt(searchParams.get('count') || '100', 10)));
    const { coins, cgOk } = await loadUniverse(count);
    return NextResponse.json({ ok: true, coins, cgOk });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || 'Universe load failed' }, { status: 500 });
  }
}
