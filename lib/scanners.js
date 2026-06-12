'use client';

// Scan loops module level pe chalti hain — page switch karne par bhi
// scan continue rehta hai aur results store me aate rehte hain.

import { getState, setState } from './scanStore';

const flags = { fusion: { stop: false }, edge: { stop: false, timer: null }, turtle: { stop: false } };

export const FUSION_INIT = {
  rows: [], scanning: false, progress: { pct: 0, text: '' }, scanned: 0, total: 0,
  api: { text: 'Idle', kind: 'ok' },
};
export const EDGE_INIT = {
  rows: [], regime: null, scanning: false, progress: '', auto: false, lastRun: null,
};
export const TURTLE_INIT = {
  rows: [], scanning: false, progress: { pct: 0, text: '' }, scanned: 0, total: 0,
};

/* ───────── Fusion ───────── */
export async function runFusion(opts) {
  if (getState('fusion')?.scanning) return;
  flags.fusion.stop = false;
  setState('fusion', { scanning: true, rows: [], scanned: 0, total: 0, api: { text: 'Loading APIs', kind: 'warn' }, progress: { pct: 0, text: 'Loading market-cap universe (server cached)' } });
  try {
    const uRes = await fetch('/api/universe?count=' + opts.coinCount);
    const uData = await uRes.json();
    if (!uData.ok || !uData.coins?.length) throw new Error(uData.error || 'No tradable coins found');
    const coins = uData.coins;
    setState('fusion', { total: coins.length, api: { text: uData.cgOk ? 'APIs live' : 'CG fallback (volume)', kind: uData.cgOk ? 'ok' : 'warn' } });

    const batchSize = 8;
    let done = 0;
    for (let i = 0; i < coins.length; i += batchSize) {
      if (flags.fusion.stop) break;
      const batch = coins.slice(i, i + batchSize);
      setState('fusion', { progress: { pct: (i / coins.length) * 100, text: 'Scanning ' + batch.map((c) => c.base).join(', ') } });
      try {
        const res = await fetch('/api/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ coins: batch, tf: opts.tf, mtf: opts.mtf, liq: opts.liq, minScore: opts.minScore, dirFilter: opts.dirFilter }),
        });
        const data = await res.json();
        if (data.ok && data.rows?.length) setState('fusion', (s) => ({ rows: [...s.rows, ...data.rows] }));
      } catch (e) { /* batch fail — continue */ }
      done += batch.length;
      setState('fusion', { scanned: done });
    }
    setState('fusion', { progress: { pct: 100, text: flags.fusion.stop ? 'Stopped' : 'Scan complete' } });
  } catch (e) {
    setState('fusion', { api: { text: 'API error', kind: 'bad' }, progress: { pct: 0, text: 'Error: ' + (e.message || 'scan failed') } });
  } finally {
    setState('fusion', { scanning: false });
  }
}
export function stopFusion() { flags.fusion.stop = true; }

/* ───────── EdgeRank ───────── */
export async function runEdge(opts) {
  if (getState('edge')?.scanning) return;
  flags.edge.stop = false;
  setState('edge', { scanning: true, rows: [], regime: null, progress: 'Loading top pairs...' });
  try {
    const pRes = await fetch('/api/pairs?count=' + opts.count);
    const pData = await pRes.json();
    if (!pData.ok) throw new Error(pData.error || 'Pairs load failed');
    const pairs = pData.pairs;
    if (!pairs.some((p) => p.sym === 'BTCUSDT')) pairs.push({ sym: 'BTCUSDT', last: 0, chg: 0, qv: 0, btcOnly: true });

    const collected = [];
    const batchSize = 14;
    for (let i = 0; i < pairs.length; i += batchSize) {
      if (flags.edge.stop) break;
      setState('edge', { progress: `Scanning ${Math.min(i + batchSize, pairs.length)}/${pairs.length}...` });
      const res = await fetch('/api/edgerank', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pairs: pairs.slice(i, i + batchSize) }),
      });
      const data = await res.json();
      if (data.ok && data.rows) collected.push(...data.rows);
    }

    const btc = collected.find((r) => r.sym === 'BTCUSDT');
    const breadth = collected.length ? Math.round((100 * collected.filter((r) => r.f.aboveE50).length) / collected.length) : 50;
    let rgm = 'MIXED', cls = 'rg-mix';
    if (btc) {
      const up = btc.f.tq > 0.15 && btc.f.aboveE50;
      const dn = btc.f.tq < -0.15 && !btc.f.aboveE50;
      if (up && breadth >= 60) { rgm = 'RISK-ON'; cls = 'rg-on'; }
      else if (dn && breadth <= 40) { rgm = 'RISK-OFF'; cls = 'rg-off'; }
    }
    const regime = { rgm, cls, breadth, btcTq: btc ? btc.f.tq : 0 };

    const ok = collected.filter((r) => !r.btcOnly);
    // Composite (cross-sectional) — z-scores poore set par
    const moms = ok.map((r) => r.f.mom);
    const valid = moms.filter((v) => isFinite(v));
    const m = valid.reduce((a, b) => a + b, 0) / (valid.length || 1);
    const sd = Math.sqrt(valid.reduce((s, x) => s + (x - m) * (x - m), 0) / (valid.length || 1)) || 1e-9;
    const z = moms.map((v) => (isFinite(v) ? (v - m) / sd : 0));
    const clip = (x, a, b) => Math.max(a, Math.min(b, x));
    ok.forEach((r, idx) => {
      const zm = clip(z[idx], -2.5, 2.5) / 2.5;
      let score = 42 * zm + 28 * r.f.tq + 16 * clip(r.f.brk, -1, 1) + 14 * r.f.sqzFired;
      if (r.f.rvol >= 1.5) score *= 1.08;
      r.score = clip(score, -100, 100);
      r.rs = Math.round((z.filter((x) => x <= z[idx]).length / z.length) * 100);
    });
    ok.sort((a, b) => b.score - a.score);
    setState('edge', { rows: ok, regime, progress: `Done — ${ok.length} coins ranked`, lastRun: Date.now() });
  } catch (e) {
    setState('edge', { progress: 'Error: ' + (e.message || 'scan failed') });
  } finally {
    setState('edge', { scanning: false });
    scheduleEdgeAuto(opts);
  }
}
export function stopEdge() {
  flags.edge.stop = true;
  if (flags.edge.timer) { clearTimeout(flags.edge.timer); flags.edge.timer = null; }
}
export function setEdgeAuto(on, opts) {
  setState('edge', { auto: on });
  if (!on && flags.edge.timer) { clearTimeout(flags.edge.timer); flags.edge.timer = null; }
  if (on && !getState('edge')?.scanning) scheduleEdgeAuto(opts);
}
function scheduleEdgeAuto(opts) {
  if (!getState('edge')?.auto) return;
  if (flags.edge.timer) clearTimeout(flags.edge.timer);
  const secs = opts.count >= 250 ? 180 : 60; // original cdSecs() jaisa
  flags.edge.timer = setTimeout(() => runEdge(opts), secs * 1000);
}

/* ───────── Turtle ───────── */
export async function runTurtle(opts) {
  if (getState('turtle')?.scanning) return;
  flags.turtle.stop = false;
  setState('turtle', { scanning: true, rows: [], scanned: 0, total: 0, progress: { pct: 2, text: 'Loading market-cap universe (server cached)...' } });
  try {
    const uRes = await fetch('/api/universe?count=' + opts.coinCount);
    const uData = await uRes.json();
    if (!uData.ok || !uData.coins?.length) throw new Error(uData.error || 'Universe load failed');
    const coins = uData.coins;
    setState('turtle', { total: coins.length });

    const batchSize = 10;
    let done = 0;
    for (let i = 0; i < coins.length; i += batchSize) {
      if (flags.turtle.stop) break;
      const batch = coins.slice(i, i + batchSize);
      setState('turtle', { progress: { pct: (i / coins.length) * 100, text: 'Scanning ' + batch.map((c) => c.base).join(', ') } });
      try {
        const res = await fetch('/api/turtle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ coins: batch, tf: opts.tf }),
        });
        const data = await res.json();
        if (data.ok && data.rows?.length) setState('turtle', (s) => ({ rows: [...s.rows, ...data.rows] }));
      } catch (e) { /* continue */ }
      done += batch.length;
      setState('turtle', { scanned: done });
    }
    setState('turtle', { progress: { pct: 100, text: flags.turtle.stop ? 'Stopped' : 'Scan complete' } });
  } catch (e) {
    setState('turtle', { progress: { pct: 0, text: 'Error: ' + (e.message || 'scan failed') } });
  } finally {
    setState('turtle', { scanning: false });
  }
}
export function stopTurtle() { flags.turtle.stop = true; }
