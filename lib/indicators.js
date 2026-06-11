// Technical indicators — FUSION_SCRENNER.html se exact port (same math, same thresholds)

export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
export const sum = (arr) => arr.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
export const avg = (arr) => (arr.length ? sum(arr) / arr.length : 0);
export const last = (arr) => arr[arr.length - 1];

export function confirmedCandles(candles) {
  if (!candles.length) return [];
  const now = Date.now();
  if (last(candles).closeTime > now) return candles.slice(0, -1);
  return candles;
}

export function ema(arr, p) {
  if (arr.length < p) return [];
  const k = 2 / (p + 1);
  let v = avg(arr.slice(0, p));
  const out = Array(p - 1).fill(null);
  out.push(v);
  for (let i = p; i < arr.length; i++) {
    v = arr[i] * k + v * (1 - k);
    out.push(v);
  }
  return out;
}

export function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gains += d; else losses -= d;
  }
  let ag = gains / period, al = losses / period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    ag = (ag * (period - 1) + (d > 0 ? d : 0)) / period;
    al = (al * (period - 1) + (d < 0 ? -d : 0)) / period;
  }
  return al === 0 ? 100 : 100 - 100 / (1 + ag / al);
}

export function calcMACD(closes) {
  if (closes.length < 35) return null;
  const e12 = ema(closes, 12), e26 = ema(closes, 26);
  const macdArr = [];
  for (let i = 0; i < closes.length; i++) {
    if (e12[i] != null && e26[i] != null) macdArr.push(e12[i] - e26[i]);
  }
  if (macdArr.length < 10) return null;
  const signal = ema(macdArr, 9);
  const macd = last(macdArr);
  const sig = last(signal);
  const hist = macd - sig;
  const prevHist = macdArr[macdArr.length - 2] - signal[signal.length - 2];
  const dir = hist > 0 && hist > prevHist ? 'long' : hist < 0 && hist < prevHist ? 'short' : 'neutral';
  return { macd, signal: sig, hist, prevHist, dir };
}

export function calcVWAP(candles, n = 24) {
  const slice = candles.slice(-n);
  let tpv = 0, vol = 0;
  for (const c of slice) {
    const typical = (c.high + c.low + c.close) / 3;
    tpv += typical * c.volume;
    vol += c.volume;
  }
  return vol ? tpv / vol : null;
}

export function detectPattern(candles) {
  if (candles.length < 3) return null;
  const n = candles.length - 1;
  const c = candles[n], p = candles[n - 1], pp = candles[n - 2];
  const body = Math.abs(c.close - c.open);
  const range = c.high - c.low || 1;
  if (p.close < p.open && c.close > c.open && c.close > p.open && c.open < p.close) return { type: 'long', name: 'Bull engulf' };
  if (p.close > p.open && c.close < c.open && c.close < p.open && c.open > p.close) return { type: 'short', name: 'Bear engulf' };
  if (c.close > c.open && c.open - c.low > body * 2 && c.high - c.close < body * 0.45) return { type: 'long', name: 'Hammer' };
  if (c.close < c.open && c.high - c.open > body * 2 && c.close - c.low < body * 0.45) return { type: 'short', name: 'Shooting star' };
  if (body < range * 0.1) return { type: 'neutral', name: 'Doji' };
  if (pp.close < pp.open && Math.abs(p.close - p.open) < (p.high - p.low) * 0.35 && c.close > c.open && c.close > (pp.open + pp.close) / 2) return { type: 'long', name: 'Morning star' };
  if (pp.close > pp.open && Math.abs(p.close - p.open) < (p.high - p.low) * 0.35 && c.close < c.open && c.close < (pp.open + pp.close) / 2) return { type: 'short', name: 'Evening star' };
  return null;
}

export function calcBollinger(closes, period = 20, mult = 2) {
  if (closes.length < period + 10) return null;
  const n = closes.length - 1;
  const slice = closes.slice(n - period + 1, n + 1);
  const mid = avg(slice);
  const variance = avg(slice.map((v) => Math.pow(v - mid, 2)));
  const std = Math.sqrt(variance);
  const upper = mid + mult * std;
  const lower = mid - mult * std;
  const width = ((upper - lower) / mid) * 100;
  const widths = [];
  for (let i = Math.max(period - 1, n - 50); i <= n; i++) {
    const s = closes.slice(i - period + 1, i + 1);
    const m = avg(s);
    const st = Math.sqrt(avg(s.map((v) => Math.pow(v - m, 2))));
    widths.push(((m + mult * st - (m - mult * st)) / m) * 100);
  }
  const avgWidth = avg(widths);
  return {
    mid, upper, lower, width,
    isSqueeze: width < avgWidth * 0.75,
    breakoutUp: closes[n] > upper && closes[n - 1] <= upper,
    breakoutDown: closes[n] < lower && closes[n - 1] >= lower,
  };
}

export function calcOBV(candles) {
  if (candles.length < 15) return null;
  let obv = 0;
  const series = [0];
  for (let i = 1; i < candles.length; i++) {
    obv += candles[i].close > candles[i - 1].close ? candles[i].volume : candles[i].close < candles[i - 1].close ? -candles[i].volume : 0;
    series.push(obv);
  }
  const n = series.length - 1;
  const p = Math.max(0, n - 10);
  const obvTrend = series[n] > series[p] ? 'long' : series[n] < series[p] ? 'short' : 'neutral';
  const priceTrend = candles[n].close > candles[p].close ? 'long' : candles[n].close < candles[p].close ? 'short' : 'neutral';
  return {
    obv: series[n],
    obvTrend,
    priceTrend,
    confirms: obvTrend === priceTrend && obvTrend !== 'neutral',
    bullDiv: priceTrend === 'short' && obvTrend === 'long',
    bearDiv: priceTrend === 'long' && obvTrend === 'short',
  };
}

export function calcStochRSI(closes, rsiPeriod = 14, stochPeriod = 14) {
  if (closes.length < rsiPeriod + stochPeriod + 8) return null;
  const rsiArr = [];
  for (let i = rsiPeriod + 1; i <= closes.length; i++) {
    rsiArr.push(calcRSI(closes.slice(0, i), rsiPeriod));
  }
  const kRaw = [];
  for (let i = stochPeriod - 1; i < rsiArr.length; i++) {
    const slice = rsiArr.slice(i - stochPeriod + 1, i + 1);
    const hi = Math.max(...slice), lo = Math.min(...slice);
    kRaw.push(hi === lo ? 50 : ((rsiArr[i] - lo) / (hi - lo)) * 100);
  }
  const smooth = (arr, p) => arr.map((_, i) => (i < p - 1 ? null : avg(arr.slice(i - p + 1, i + 1)))).filter((v) => v != null);
  const K = smooth(kRaw, 3), D = smooth(K, 3);
  if (K.length < 2 || D.length < 2) return null;
  const k = last(K), d = last(D), kp = K[K.length - 2], dp = D[D.length - 2];
  return {
    k, d,
    zone: k < 20 ? 'oversold' : k > 80 ? 'overbought' : 'neutral',
    crossUp: kp <= dp && k > d,
    crossDown: kp >= dp && k < d,
  };
}

export function calcATR(candles, period = 14) {
  if (candles.length < period + 2) return null;
  const tr = [];
  for (let i = 1; i < candles.length; i++) {
    tr.push(Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    ));
  }
  let atr = avg(tr.slice(0, period));
  for (let i = period; i < tr.length; i++) atr = (atr * (period - 1) + tr[i]) / period;
  const entry = last(candles).close;
  const atrPct = (atr / entry) * 100;
  return {
    atr, atrPct,
    long: { sl: entry - atr * 1.5, tp1: entry + atr * 2.25, tp2: entry + atr * 3.75 },
    short: { sl: entry + atr * 1.5, tp1: entry - atr * 2.25, tp2: entry - atr * 3.75 },
  };
}

export function calcADX(candles, period = 14) {
  if (candles.length < period * 2 + 3) return null;
  const tr = [], plusDM = [], minusDM = [];
  for (let i = 1; i < candles.length; i++) {
    const up = candles[i].high - candles[i - 1].high;
    const down = candles[i - 1].low - candles[i].low;
    tr.push(Math.max(candles[i].high - candles[i].low, Math.abs(candles[i].high - candles[i - 1].close), Math.abs(candles[i].low - candles[i - 1].close)));
    plusDM.push(up > down && up > 0 ? up : 0);
    minusDM.push(down > up && down > 0 ? down : 0);
  }
  const wilder = (arr, p) => {
    let val = sum(arr.slice(0, p));
    const out = [val];
    for (let i = p; i < arr.length; i++) {
      val = val - val / p + arr[i];
      out.push(val);
    }
    return out;
  };
  const trS = wilder(tr, period), pS = wilder(plusDM, period), mS = wilder(minusDM, period);
  const plus = pS.map((v, i) => (trS[i] ? (v / trS[i]) * 100 : 0));
  const minus = mS.map((v, i) => (trS[i] ? (v / trS[i]) * 100 : 0));
  const dx = plus.map((v, i) => (v + minus[i] ? (Math.abs(v - minus[i]) / (v + minus[i])) * 100 : 0));
  const adxSeries = wilder(dx, period).map((v) => v / period);
  const adx = last(adxSeries), dip = last(plus), dim = last(minus);
  return {
    adx, dip, dim,
    dir: dip > dim ? 'long' : 'short',
    trending: adx >= 22,
    strength: adx >= 40 ? 'very strong' : adx >= 25 ? 'strong' : adx >= 15 ? 'moderate' : 'weak',
  };
}

export function detectSR(candles) {
  if (candles.length < 35) return null;
  const p = 4, levels = [];
  for (let i = p; i < candles.length - p; i++) {
    let ph = true, pl = true;
    for (let j = 1; j <= p; j++) {
      if (candles[i].high <= candles[i - j].high || candles[i].high <= candles[i + j].high) ph = false;
      if (candles[i].low >= candles[i - j].low || candles[i].low >= candles[i + j].low) pl = false;
    }
    if (ph) levels.push({ type: 'R', price: candles[i].high });
    if (pl) levels.push({ type: 'S', price: candles[i].low });
  }
  const price = last(candles).close;
  const nearR = levels.filter((l) => l.type === 'R' && l.price > price && l.price - price < price * 0.055).sort((a, b) => a.price - b.price)[0] || null;
  const nearS = levels.filter((l) => l.type === 'S' && l.price < price && price - l.price < price * 0.055).sort((a, b) => b.price - a.price)[0] || null;
  const atLevel = levels.some((l) => Math.abs(l.price - price) < price * 0.012);
  return { nearR: nearR && nearR.price, nearS: nearS && nearS.price, atLevel, levelCount: levels.length };
}

export function detectEMA(candles) {
  const closes = candles.map((c) => c.close);
  if (closes.length < 35) return { dir: 'neutral', score: 0, label: 'No EMA' };
  const e5 = ema(closes, 5), e9 = ema(closes, 9), e15 = ema(closes, 15), e50 = ema(closes, 50);
  const n = closes.length - 1, p = n - 1;
  const cross = [];
  const addCross = (fast, slow, name) => {
    if (fast[p] <= slow[p] && fast[n] > slow[n]) cross.push({ dir: 'long', name });
    if (fast[p] >= slow[p] && fast[n] < slow[n]) cross.push({ dir: 'short', name });
  };
  addCross(e5, e15, 'EMA5/15');
  addCross(e9, e15, 'EMA9/15');
  addCross(e5, e9, 'EMA5/9');
  const alignLong = e5[n] > e9[n] && e9[n] > e15[n];
  const alignShort = e5[n] < e9[n] && e9[n] < e15[n];
  const e50Long = e50[n] ? closes[n] > e50[n] : false;
  const e50Short = e50[n] ? closes[n] < e50[n] : false;
  const spread = (Math.abs(e5[n] - e15[n]) / closes[n]) * 100;
  let dir = cross[0]?.dir || (alignLong ? 'long' : alignShort ? 'short' : 'neutral');
  let score = 0;
  if (cross.length) score += 62;
  if (alignLong || alignShort) score += 18;
  if ((dir === 'long' && e50Long) || (dir === 'short' && e50Short)) score += 10;
  score += clamp(spread * 16, 0, 10);
  return {
    dir,
    score: Math.round(clamp(score, 0, 100)),
    cross,
    alignLong,
    alignShort,
    spread,
    label: cross.length ? cross.map((c) => c.name).join(', ') : alignLong ? 'Stack long' : alignShort ? 'Stack short' : 'Mixed',
  };
}
