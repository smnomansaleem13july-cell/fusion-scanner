// ICT/SMC + Turtle Soup — FUSION_SCRENNER.html se exact port

import { avg, clamp, last } from './indicators';

export function findSwings(candles, p = 3) {
  const highs = [], lows = [];
  for (let i = p; i < candles.length - p; i++) {
    let hi = true, lo = true;
    for (let j = 1; j <= p; j++) {
      if (candles[i].high <= candles[i - j].high || candles[i].high <= candles[i + j].high) hi = false;
      if (candles[i].low >= candles[i - j].low || candles[i].low >= candles[i + j].low) lo = false;
    }
    if (hi) highs.push({ idx: i, price: candles[i].high, time: candles[i].time });
    if (lo) lows.push({ idx: i, price: candles[i].low, time: candles[i].time });
  }
  return { highs, lows };
}

export function getStructure(highs, lows) {
  if (highs.length < 2 || lows.length < 2) return 'range';
  const h1 = highs[highs.length - 1].price, h0 = highs[highs.length - 2].price;
  const l1 = lows[lows.length - 1].price, l0 = lows[lows.length - 2].price;
  if (h1 > h0 && l1 > l0) return 'bullish';
  if (h1 < h0 && l1 < l0) return 'bearish';
  return 'range';
}

export function detectLiqSweep(candles, highs, lows) {
  if (!highs.length || !lows.length || candles.length < 4) return null;
  const lh = last(highs).price, ll = last(lows).price;
  for (const c of candles.slice(-3)) {
    if (c.high > lh && c.close < lh) return 'bsl';
    if (c.low < ll && c.close > ll) return 'ssl';
  }
  return null;
}

export function findOrderBlocks(candles) {
  const obs = [], recent = candles.slice(-70);
  for (let i = 2; i < recent.length - 4; i++) {
    const c = recent[i];
    const next = recent.slice(i + 1, i + 5);
    const body = Math.abs(c.close - c.open);
    if (!body) continue;
    const bullDisp = c.close < c.open && next.filter((x) => x.close > x.open).length >= 2 && last(next).close > c.high * 1.002;
    const bearDisp = c.close > c.open && next.filter((x) => x.close < x.open).length >= 2 && last(next).close < c.low * 0.998;
    if (bullDisp) obs.push({ type: 'long', high: c.high, low: c.low, idx: i });
    if (bearDisp) obs.push({ type: 'short', high: c.high, low: c.low, idx: i });
  }
  return obs.slice(-5);
}

export function findFVGs(candles) {
  const fvgs = [], recent = candles.slice(-70);
  for (let i = 1; i < recent.length - 1; i++) {
    const a = recent[i - 1], c = recent[i + 1];
    const bull = c.low - a.high;
    const bear = a.low - c.high;
    if (bull > 0 && bull / recent[i].close > 0.001) fvgs.push({ type: 'long', top: c.low, bot: a.high, mid: (c.low + a.high) / 2, idx: i });
    if (bear > 0 && bear / recent[i].close > 0.001) fvgs.push({ type: 'short', top: a.low, bot: c.high, mid: (a.low + c.high) / 2, idx: i });
  }
  return fvgs.slice(-6);
}

export function getPremiumDiscount(candles, n = 24) {
  const r = candles.slice(-n);
  const hi = Math.max(...r.map((c) => c.high));
  const lo = Math.min(...r.map((c) => c.low));
  const price = last(candles).close;
  const eq = (hi + lo) / 2;
  return { zone: price > eq ? 'premium' : 'discount', pct: ((price - lo) / (hi - lo || 1)) * 100, hi, lo, eq };
}

export function checkOTE(candles, highs, lows) {
  if (!highs.length || !lows.length) return null;
  const h = last(highs), l = last(lows);
  const price = last(candles).close;
  const range = h.price - l.price;
  if (range <= 0) return null;
  if (h.idx > l.idx) {
    const ret = (h.price - price) / range;
    if (ret >= 0.62 && ret <= 0.786) return 'long';
  } else {
    const ret = (price - l.price) / range;
    if (ret >= 0.214 && ret <= 0.38) return 'short';
  }
  return null;
}

export function getKillZone() {
  const d = new Date();
  const m = d.getUTCHours() * 60 + d.getUTCMinutes();
  if (m >= 120 && m < 300) return { active: true, name: 'London KZ' };
  if (m >= 420 && m < 600) return { active: true, name: 'NY AM KZ' };
  if (m >= 780 && m < 960) return { active: false, name: 'NY PM' };
  return { active: false, name: 'Off hours' };
}

export function runICT(candles) {
  if (candles.length < 35) return { score: 0, dir: 'neutral', signals: [] };
  const { highs, lows } = findSwings(candles, 3);
  const structure = getStructure(highs, lows);
  const cur = last(candles).close;
  const bos =
    structure === 'bullish' && highs.length >= 2 && cur > highs[highs.length - 2].price ? 'long'
    : structure === 'bearish' && lows.length >= 2 && cur < lows[lows.length - 2].price ? 'short' : null;
  const choch =
    structure === 'bullish' && lows.length && cur < last(lows).price ? 'short'
    : structure === 'bearish' && highs.length && cur > last(highs).price ? 'long' : null;
  const sweep = detectLiqSweep(candles, highs, lows);
  const obs = findOrderBlocks(candles);
  const fvgs = findFVGs(candles);
  const pd = getPremiumDiscount(candles);
  const ote = checkOTE(candles, highs, lows);
  let dir = 'neutral';
  if (sweep === 'ssl') dir = 'long';
  else if (sweep === 'bsl') dir = 'short';
  else if (choch) dir = choch;
  else if (bos) dir = bos;
  else if (structure === 'bullish') dir = 'long';
  else if (structure === 'bearish') dir = 'short';

  let score = 0;
  const signals = [];
  if (structure !== 'range') { score += 12; signals.push(structure === 'bullish' ? 'Bull structure' : 'Bear structure'); }
  if (bos) { score += 10; signals.push('BOS'); }
  if (choch) { score += 12; signals.push('CHoCH'); }
  if (sweep) { score += 22; signals.push(sweep === 'ssl' ? 'SSL sweep' : 'BSL sweep'); }
  const alignedOB = obs.some((o) => o.type === dir);
  const alignedFVG = fvgs.some((f) => f.type === dir);
  if (obs.length) { score += alignedOB ? 14 : 6; signals.push(obs.length + ' OB'); }
  if (fvgs.length) { score += alignedFVG ? 11 : 5; signals.push(fvgs.length + ' FVG'); }
  if ((dir === 'long' && pd.zone === 'discount') || (dir === 'short' && pd.zone === 'premium')) { score += 10; signals.push('P/D aligned'); }
  if (ote === dir) { score += 12; signals.push('OTE'); }
  const kz = getKillZone();
  if (kz.active) { score += 4; signals.push(kz.name); }

  return { score: clamp(Math.round(score), 0, 100), dir, structure, bos, choch, sweep, obs, fvgs, pd, ote, signals, highs, lows };
}

export function runTurtle(candles) {
  if (candles.length < 25) return { score: 0, dir: 'neutral', checks: [], labels: [] };
  const recent = candles.slice(-24);
  const l = last(recent), p = recent[recent.length - 2];
  let swingHigh = -Infinity, swingLow = Infinity, highIdx = -1, lowIdx = -1;
  for (let i = 2; i < recent.length - 2; i++) {
    const c = recent[i];
    if (c.high > recent[i - 1].high && c.high > recent[i - 2].high && c.high > recent[i + 1].high && c.high > recent[i + 2].high && c.high > swingHigh) {
      swingHigh = c.high; highIdx = i;
    }
    if (c.low < recent[i - 1].low && c.low < recent[i - 2].low && c.low < recent[i + 1].low && c.low < recent[i + 2].low && c.low < swingLow) {
      swingLow = c.low; lowIdx = i;
    }
  }
  const hasSwing = highIdx !== -1 || lowIdx !== -1;
  let bullSweep = false, bearSweep = false;
  if (highIdx !== -1) {
    for (let i = highIdx + 1; i < recent.length; i++) {
      if (recent[i].high > swingHigh && recent[i].close < swingHigh) { bearSweep = true; break; }
    }
  }
  if (lowIdx !== -1) {
    for (let i = lowIdx + 1; i < recent.length; i++) {
      if (recent[i].low < swingLow && recent[i].close > swingLow) { bullSweep = true; break; }
    }
  }
  let mss = false;
  if (bullSweep && highIdx !== -1 && Math.max(...recent.slice(-5).map((c) => c.close)) > swingHigh * 1.001) mss = true;
  if (bearSweep && lowIdx !== -1 && Math.min(...recent.slice(-5).map((c) => c.close)) < swingLow * 0.999) mss = true;
  if (!mss && recent.length >= 8) {
    const b = recent.slice(-6);
    if (b[0].close > b[2].close && b[2].close > b[4].close && l.close > b[3].high) mss = true;
    if (b[0].close < b[2].close && b[2].close < b[4].close && l.close < b[3].low) mss = true;
  }
  let fvgBull = false, fvgBear = false;
  for (let i = 1; i < recent.length - 1; i++) {
    if (recent[i + 1].low > recent[i - 1].high) fvgBull = true;
    if (recent[i + 1].high < recent[i - 1].low) fvgBear = true;
  }
  const fvg = fvgBull || fvgBear;
  let retest = false;
  if (fvg && mss) {
    const body = Math.abs(l.close - l.open);
    const avgBody = avg(recent.slice(-10).map((c) => Math.abs(c.close - c.open)));
    retest = body < avgBody * 0.65 || (fvgBull && l.low <= p.high) || (fvgBear && l.high >= p.low);
  }
  const checks = [hasSwing, bullSweep || bearSweep, mss, fvg, retest];
  const dir = bullSweep && mss ? 'long' : bearSweep && mss ? 'short' : 'neutral';
  return {
    score: checks.filter(Boolean).length,
    dir,
    checks,
    labels: ['Swing', 'Sweep', 'MSS', 'FVG', 'Retest'].filter((_, i) => checks[i]),
    location:
      l.close > Math.max(...recent.slice(-10).map((c) => c.high)) * 0.985 ? 'near high'
      : l.close < Math.min(...recent.slice(-10).map((c) => c.low)) * 1.015 ? 'near low' : 'range',
  };
}
