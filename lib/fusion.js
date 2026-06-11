// Fusion scoring engine — 6-layer composite (EMA 18% / Momentum 18% / ICT 24% /
// Turtle 16% / Flow 14% / Risk 10%) — FUSION_SCRENNER.html se exact port

import {
  avg, clamp, last, sum, confirmedCandles,
  calcRSI, calcMACD, calcVWAP, calcBollinger, calcOBV, calcStochRSI,
  calcATR, calcADX, detectSR, detectPattern, detectEMA,
} from './indicators';
import { runICT, runTurtle } from './ict';
import { fetchKlines } from './binance';

export const TF_HIGHER = { '5m': '15m', '15m': '1h', '1h': '4h', '4h': '1d' };
export const TF_LIMIT = { '5m': 170, '15m': 170, '1h': 160, '4h': 140, '1d': 110 };

function calcVolumeFlow(candles, ticker) {
  const vols = candles.map((c) => c.quoteVolume || c.volume * c.close);
  const curVol = last(vols) || 0;
  const base = avg(vols.slice(-22, -1));
  const rvol = base ? curVol / base : 1;
  const recent = candles.slice(-20);
  const buy = sum(recent.map((c) => c.takerBuyQuote || 0));
  const total = sum(recent.map((c) => c.quoteVolume || 0));
  const sell = Math.max(0, total - buy);
  const delta = total ? ((buy - sell) / total) * 100 : 0;
  const lastDelta = last(candles).quoteVolume
    ? (((last(candles).takerBuyQuote || 0) * 2 - last(candles).quoteVolume) / last(candles).quoteVolume) * 100
    : 0;
  return {
    rvol,
    delta,
    lastDelta,
    quoteVolume: ticker?.quoteVolume || curVol,
    priceChange: ticker?.change ?? ((last(candles).close - candles[0].close) / candles[0].close) * 100,
    flowDir: delta > 4 ? 'long' : delta < -4 ? 'short' : 'neutral',
  };
}

function momentumScore(dir, parts, price) {
  const { rsi, macd, vwap, bb, obv, stoch, adx, pattern } = parts;
  let score = 0;
  const reasons = [];
  if (rsi != null) {
    if (dir === 'long' && rsi > 50 && rsi < 72) { score += 16; reasons.push('RSI aligned'); }
    else if (dir === 'short' && rsi < 50 && rsi > 28) { score += 16; reasons.push('RSI aligned'); }
    else if ((dir === 'long' && rsi > 35 && rsi <= 50) || (dir === 'short' && rsi >= 50 && rsi < 65)) score += 9;
  }
  if (macd) {
    if (macd.dir === dir) { score += 16; reasons.push('MACD'); }
    else if (macd.dir === 'neutral') score += 5;
  }
  if (vwap) {
    if ((dir === 'long' && price > vwap) || (dir === 'short' && price < vwap)) { score += 10; reasons.push('VWAP'); }
    else score += 3;
  }
  if (bb) {
    if ((dir === 'long' && bb.breakoutUp) || (dir === 'short' && bb.breakoutDown)) { score += 14; reasons.push('BB break'); }
    else if (bb.isSqueeze) { score += 8; reasons.push('BB squeeze'); }
  }
  if (obv) {
    if (obv.obvTrend === dir && obv.confirms) { score += 14; reasons.push('OBV'); }
    else if ((dir === 'long' && obv.bullDiv) || (dir === 'short' && obv.bearDiv)) { score += 10; reasons.push('OBV div'); }
  }
  if (stoch) {
    if ((dir === 'long' && stoch.crossUp && stoch.k < 35) || (dir === 'short' && stoch.crossDown && stoch.k > 65)) { score += 12; reasons.push('StochRSI'); }
    else if ((dir === 'long' && stoch.zone === 'oversold') || (dir === 'short' && stoch.zone === 'overbought')) score += 6;
  }
  if (adx) {
    if (adx.trending && adx.dir === dir) { score += adx.adx >= 40 ? 12 : 9; reasons.push('ADX'); }
    else if (adx.trending) score += 3;
  }
  if (pattern) {
    if (pattern.type === dir) { score += 6; reasons.push(pattern.name); }
    else if (pattern.type === 'neutral') score += 2;
  }
  return { score: clamp(Math.round(score), 0, 100), reasons };
}

function flowScore(dir, flow) {
  let score = 0;
  const reasons = [];
  if (flow.rvol >= 3) { score += 38; reasons.push('RVOL ' + flow.rvol.toFixed(1) + 'x'); }
  else if (flow.rvol >= 2) { score += 28; reasons.push('RVOL ' + flow.rvol.toFixed(1) + 'x'); }
  else if (flow.rvol >= 1.35) { score += 17; reasons.push('RVOL ' + flow.rvol.toFixed(1) + 'x'); }
  else if (flow.rvol >= 0.85) score += 8;
  if ((dir === 'long' && flow.delta > 4) || (dir === 'short' && flow.delta < -4)) { score += 30; reasons.push('Taker delta'); }
  else if (Math.abs(flow.delta) > 2) score += 10;
  if ((dir === 'long' && flow.lastDelta > 8) || (dir === 'short' && flow.lastDelta < -8)) { score += 12; reasons.push('Last flow'); }
  if (flow.quoteVolume >= 100000000) score += 20;
  else if (flow.quoteVolume >= 25000000) score += 13;
  else if (flow.quoteVolume >= 5000000) score += 7;
  return { score: clamp(Math.round(score), 0, 100), reasons };
}

function riskScore(dir, atr, sr, price) {
  let score = 0;
  const reasons = [];
  if (atr) {
    if (atr.atrPct >= 0.25 && atr.atrPct <= 5.5) { score += 42; reasons.push('ATR ok'); }
    else if (atr.atrPct > 0.12) score += 20;
  }
  if (sr) {
    if (dir === 'long' && sr.nearS) { score += 28; reasons.push('Near support'); }
    else if (dir === 'short' && sr.nearR) { score += 28; reasons.push('Near resistance'); }
    else if (sr.atLevel) score += 12;
    if (dir === 'long' && sr.nearR && sr.nearS) {
      const rr = (sr.nearR - price) / (price - sr.nearS || price * 0.01);
      if (rr >= 1.5) { score += 24; reasons.push('RR ' + rr.toFixed(1)); }
    }
    if (dir === 'short' && sr.nearS && sr.nearR) {
      const rr = (price - sr.nearS) / (sr.nearR - price || price * 0.01);
      if (rr >= 1.5) { score += 24; reasons.push('RR ' + rr.toFixed(1)); }
    }
  }
  if (!reasons.includes('RR') && atr) score += 10;
  return { score: clamp(Math.round(score), 0, 100), reasons };
}

function chooseDirection(emaData, ict, turtle, parts, flow) {
  const votes = { long: 0, short: 0 };
  const add = (dir, weight) => { if (dir === 'long' || dir === 'short') votes[dir] += weight; };
  add(emaData.dir, emaData.cross?.length ? 22 : 12);
  add(ict.dir, ict.sweep ? 24 : ict.bos || ict.choch ? 18 : 10);
  add(turtle.dir, turtle.score * 4);
  if (parts.macd) add(parts.macd.dir, 8);
  if (parts.adx?.trending) add(parts.adx.dir, 8);
  if (parts.obv?.obvTrend) add(parts.obv.obvTrend, 6);
  if (flow.flowDir !== 'neutral') add(flow.flowDir, 7);
  if (votes.long === votes.short) return emaData.dir !== 'neutral' ? emaData.dir : ict.dir !== 'neutral' ? ict.dir : 'neutral';
  return votes.long > votes.short ? 'long' : 'short';
}

export function grade(score) {
  if (score >= 85) return { text: 'A+', cls: 'long', label: 'Elite' };
  if (score >= 75) return { text: 'A', cls: 'info', label: 'Strong' };
  if (score >= 65) return { text: 'B', cls: 'watch', label: 'Good' };
  if (score >= 50) return { text: 'C', cls: 'orange', label: 'Watch' };
  return { text: 'D', cls: 'neutral', label: 'Weak' };
}

export function analyzeComposite(meta, candles, ticker, opts = {}) {
  const liqRequired = !!opts.liqRequired;
  const c = confirmedCandles(candles);
  if (c.length < 60) return null;
  const closes = c.map((x) => x.close);
  const price = last(c).close;
  const emaData = detectEMA(c);
  const ict = runICT(c);
  const turtle = runTurtle(c);
  const parts = {
    rsi: calcRSI(closes),
    macd: calcMACD(closes),
    vwap: calcVWAP(c),
    bb: calcBollinger(closes),
    obv: calcOBV(c),
    stoch: calcStochRSI(closes),
    atr: calcATR(c),
    adx: calcADX(c),
    sr: detectSR(c),
    pattern: detectPattern(c),
  };
  const flow = calcVolumeFlow(c, ticker);
  const dir = chooseDirection(emaData, ict, turtle, parts, flow);
  if (dir === 'neutral') return null;

  const momentum = momentumScore(dir, parts, price);
  const flowSc = flowScore(dir, flow);
  const risk = riskScore(dir, parts.atr, parts.sr, price);
  const ictAligned = ict.dir === dir ? ict.score : Math.round(ict.score * 0.35);
  const turtleAligned = turtle.dir === dir ? (turtle.score / 5) * 100 : turtle.score >= 3 ? (turtle.score / 5) * 45 : (turtle.score / 5) * 30;
  const emaAligned = emaData.dir === dir ? emaData.score : Math.round(emaData.score * 0.4);

  const breakdown = {
    ema: clamp(Math.round(emaAligned), 0, 100),
    momentum: momentum.score,
    ict: clamp(Math.round(ictAligned), 0, 100),
    turtle: clamp(Math.round(turtleAligned), 0, 100),
    flow: flowSc.score,
    risk: risk.score,
  };

  let score = Math.round(
    breakdown.ema * 0.18 +
    breakdown.momentum * 0.18 +
    breakdown.ict * 0.24 +
    breakdown.turtle * 0.16 +
    breakdown.flow * 0.14 +
    breakdown.risk * 0.10
  );

  const reasons = [];
  if (emaData.dir === dir && (emaData.cross?.length || emaData.score >= 50)) reasons.push(emaData.label);
  if (ict.dir === dir) reasons.push(...ict.signals.slice(0, 3));
  if (turtle.dir === dir || turtle.score >= 3) reasons.push('Turtle ' + turtle.score + '/5');
  reasons.push(...momentum.reasons.slice(0, 4));
  reasons.push(...flowSc.reasons.slice(0, 3));
  reasons.push(...risk.reasons.slice(0, 2));

  const majorAgree = [
    breakdown.ema >= 55,
    breakdown.momentum >= 55,
    breakdown.ict >= 55,
    breakdown.turtle >= 55,
    breakdown.flow >= 55,
  ].filter(Boolean).length;

  const conflicts = [];
  if (emaData.dir !== 'neutral' && emaData.dir !== dir) conflicts.push('EMA conflict');
  if (ict.dir !== 'neutral' && ict.dir !== dir) conflicts.push('ICT conflict');
  if (turtle.dir !== 'neutral' && turtle.dir !== dir) conflicts.push('Turtle conflict');
  if (parts.macd && parts.macd.dir !== 'neutral' && parts.macd.dir !== dir) conflicts.push('MACD conflict');
  if (flow.flowDir !== 'neutral' && flow.flowDir !== dir) conflicts.push('Flow conflict');

  if (conflicts.length >= 2) score -= 12;
  else if (conflicts.length === 1) score -= 5;
  if (majorAgree < 2) score = Math.min(score, 68);
  if (liqRequired && !ict.sweep && !ict.fvgs?.length && !ict.obs?.length && turtle.score < 3) score = Math.min(score, 74);
  if (flow.rvol < 0.65) score = Math.min(score, 70);
  if (parts.atr && parts.atr.atrPct < 0.12) score = Math.min(score, 64);
  if (parts.rsi != null && ((dir === 'long' && parts.rsi > 78) || (dir === 'short' && parts.rsi < 22))) score -= 8;
  score = clamp(Math.round(score), 0, 100);

  const g = grade(score);
  return {
    ...meta,
    dir,
    bias: dir === 'long' ? 'LONG' : 'SHORT',
    score,
    grade: g,
    price,
    change: ticker?.change ?? meta.cgChange ?? flow.priceChange,
    quoteVolume: flow.quoteVolume,
    emaData: { dir: emaData.dir, score: emaData.score, label: emaData.label, spread: emaData.spread },
    ict: {
      score: ict.score, dir: ict.dir, structure: ict.structure, bos: ict.bos, choch: ict.choch,
      sweep: ict.sweep, ote: ict.ote, signals: ict.signals,
      pd: ict.pd ? { zone: ict.pd.zone, pct: ict.pd.pct } : null,
      obCount: ict.obs?.length || 0, fvgCount: ict.fvgs?.length || 0,
    },
    turtle: { score: turtle.score, dir: turtle.dir, labels: turtle.labels, location: turtle.location },
    parts: {
      rsi: parts.rsi,
      macd: parts.macd ? { dir: parts.macd.dir, hist: parts.macd.hist } : null,
      vwap: parts.vwap,
      bb: parts.bb ? { isSqueeze: parts.bb.isSqueeze, breakoutUp: parts.bb.breakoutUp, breakoutDown: parts.bb.breakoutDown, width: parts.bb.width } : null,
      obv: parts.obv ? { obvTrend: parts.obv.obvTrend, confirms: parts.obv.confirms, bullDiv: parts.obv.bullDiv, bearDiv: parts.obv.bearDiv } : null,
      stoch: parts.stoch ? { k: parts.stoch.k, d: parts.stoch.d, zone: parts.stoch.zone } : null,
      atr: parts.atr,
      adx: parts.adx ? { adx: parts.adx.adx, dir: parts.adx.dir, trending: parts.adx.trending, strength: parts.adx.strength } : null,
      sr: parts.sr,
      pattern: parts.pattern,
    },
    flow: { rvol: flow.rvol, delta: flow.delta, lastDelta: flow.lastDelta, flowDir: flow.flowDir },
    breakdown,
    reasons: [...new Set(reasons)].slice(0, 10),
    conflicts,
    majorAgree,
  };
}

async function addMTF(row, tf) {
  const higher = TF_HIGHER[tf];
  if (!higher || row.score < 55) return row;
  try {
    const raw = await fetchKlines(row.symbol, higher, TF_LIMIT[higher] || 100);
    const candles = confirmedCandles(raw);
    if (candles.length < 45) return row;
    const e = detectEMA(candles);
    const ict = runICT(candles);
    const agree = e.dir === row.dir || ict.dir === row.dir;
    const conflict = e.dir !== 'neutral' && e.dir !== row.dir && ict.dir !== 'neutral' && ict.dir !== row.dir;
    if (agree) {
      row.score = clamp(row.score + 5, 0, 100);
      row.reasons.unshift('MTF ' + higher);
      row.breakdown.risk = clamp(row.breakdown.risk + 8, 0, 100);
    } else if (conflict) {
      row.score = clamp(row.score - 7, 0, 100);
      row.conflicts.push('MTF conflict');
    }
    row.grade = grade(row.score);
    row.mtf = { timeframe: higher, ema: e.dir, ict: ict.dir, agree, conflict };
  } catch (e) {
    // MTF optional hai — fail ho to base score rakho
  }
  return row;
}

export async function analyzeSymbol(meta, tf, ticker, opts = {}) {
  const candles = await fetchKlines(meta.symbol, tf, TF_LIMIT[tf] || 160);
  let row = analyzeComposite(meta, candles, ticker, opts);
  if (!row) return null;
  row.timeframe = tf;
  if (opts.mtf) row = await addMTF(row, tf);
  return row;
}
