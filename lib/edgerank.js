// EdgeRank factor engine — Claude_EdgeRank HTML se exact port.
// Per-coin factors server pe compute hote hain (1h klines);
// cross-sectional z-score composite client pe hota hai (poore set par chahiye).

const clip = (x, a, b) => Math.max(a, Math.min(b, x));

function emaArr(arr, p) {
  const k = 2 / (p + 1);
  const out = new Array(arr.length).fill(null);
  let s = 0;
  for (let i = 0; i < p; i++) s += arr[i];
  out[p - 1] = s / p;
  for (let i = p; i < arr.length; i++) out[i] = arr[i] * k + out[i - 1] * (1 - k);
  return out;
}

function atrArr(h, l, c, p = 14) {
  const tr = [];
  for (let i = 0; i < h.length; i++) {
    tr.push(i === 0 ? h[i] - l[i] : Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1])));
  }
  const out = new Array(tr.length).fill(null);
  let s = 0;
  for (let i = 0; i < p; i++) s += tr[i];
  out[p - 1] = s / p;
  for (let i = p; i < tr.length; i++) out[i] = (out[i - 1] * (p - 1) + tr[i]) / p;
  return out;
}

function stdev(arr) {
  const m = arr.reduce((a, b) => a + b, 0) / arr.length;
  return Math.sqrt(arr.reduce((s, x) => s + (x - m) * (x - m), 0) / arr.length);
}

function linreg(y) {
  const n = y.length;
  let sx = 0, sy = 0, sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) { sx += i; sy += y[i]; sxy += i * y[i]; sxx += i * i; }
  const den = n * sxx - sx * sx;
  if (den === 0) return { slope: 0, r2: 0 };
  const slope = (n * sxy - sx * sy) / den;
  const b = (sy - slope * sx) / n;
  let ssr = 0, sst = 0;
  const my = sy / n;
  for (let i = 0; i < n; i++) {
    const f = slope * i + b;
    ssr += (y[i] - f) * (y[i] - f);
    sst += (y[i] - my) * (y[i] - my);
  }
  return { slope, r2: sst === 0 ? 0 : clip(1 - ssr / sst, 0, 1) };
}

// Per-coin factors from 1h candles ({open,high,low,close,volume} format)
export function edgeFactors(klines) {
  const c = klines.map((x) => x.close);
  const h = klines.map((x) => x.high);
  const l = klines.map((x) => x.low);
  const v = klines.map((x) => x.volume);
  const i = c.length - 1;
  const A = atrArr(h, l, c, 14)[i] || 1e-9;
  const atrPct = A / c[i];

  // Risk-adjusted multi-horizon momentum (24h/72h/168h)
  const ret = (n) => (i - n >= 0 && c[i - n] > 0 ? c[i] / c[i - n] - 1 : 0);
  const mom = (0.3 * ret(24) + 0.4 * ret(72) + 0.3 * ret(168)) / Math.max(atrPct, 1e-6);

  // Trend quality: linreg on log close, 50 bars
  const seg = c.slice(i - 49, i + 1).map(Math.log);
  const { slope, r2 } = linreg(seg);
  const tq = Math.sign(slope) * r2;

  // TTM squeeze: BB(20,2) inside KC(20, 1.5xATR20)
  const e20 = emaArr(c, 20), a20 = atrArr(h, l, c, 20);
  const sqzAt = (j) => {
    if (e20[j] == null || a20[j] == null) return false;
    const win = c.slice(j - 19, j + 1);
    const sd = stdev(win);
    const bbU = e20[j] + 2 * sd, bbL = e20[j] - 2 * sd;
    const kcU = e20[j] + 1.5 * a20[j], kcL = e20[j] - 1.5 * a20[j];
    return bbU < kcU && bbL > kcL;
  };
  const sqzNow = sqzAt(i);
  let sqzFired = 0;
  if (!sqzNow) {
    for (let j = i - 1; j >= i - 5 && j >= 20; j--) {
      if (sqzAt(j)) { sqzFired = Math.sign(c[i] - e20[i]) || 0; break; }
    }
  }

  // RVOL: last 24h volume vs avg of previous 6 windows
  const sum = (a, s, e) => { let t = 0; for (let x = s; x < e; x++) t += a[x]; return t; };
  const v24 = sum(v, i - 23, i + 1);
  let base = 0, nw = 0;
  for (let w = 1; w <= 6; w++) {
    const e0 = i - 23 - 24 * (w - 1);
    const s0 = e0 - 24;
    if (s0 >= 0) { base += sum(v, s0, e0); nw++; }
  }
  const rvol = nw > 0 && base > 0 ? v24 / (base / nw) : 1;

  // 100-bar breakout proximity (in ATRs)
  let hh = -Infinity, ll = Infinity;
  const st = Math.max(0, i - 100);
  for (let j = st; j < i; j++) { if (h[j] > hh) hh = h[j]; if (l[j] < ll) ll = l[j]; }
  const dHi = (hh - c[i]) / A, dLo = (c[i] - ll) / A;
  let brk = 0, brkTxt;
  if (dHi <= 0) { brk = 1; brkTxt = 'ABOVE↑'; }
  else if (dLo <= 0) { brk = -1; brkTxt = 'BELOW↓'; }
  else if (dHi <= 0.6) { brk = 0.6; brkTxt = dHi.toFixed(1) + '·hi'; }
  else if (dLo <= 0.6) { brk = -0.6; brkTxt = dLo.toFixed(1) + '·lo'; }
  else brkTxt = Math.min(dHi, dLo).toFixed(1) + ' ATR';

  const e50 = emaArr(c, 50)[i];
  const aboveE50 = e50 != null ? c[i] > e50 : false;

  return {
    mom, tq, sqzNow, sqzFired, rvol, brk, brkTxt,
    atr1h: A, close: c[i], aboveE50,
    spark: c.slice(i - 47, i + 1),
  };
}
