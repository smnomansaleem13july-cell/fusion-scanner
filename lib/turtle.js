// Turtle Soup 5-point checklist — turtle_soup_M_cap_500.html se exact port
// Checks: ① Swing H/L ② Liquidity Sweep ③ MSS/CHoCH ④ FVG ⑤ FVG Retest

export function analyzeTurtleSoup(candles) {
  if (!candles || candles.length < 20) return null;
  const recent = candles.slice(-20);
  const last = recent[recent.length - 1];
  const prev = recent[recent.length - 2];

  // ① Swing High / Swing Low
  let swingHighIdx = -1, swingLowIdx = -1;
  let swingHigh = -Infinity, swingLow = Infinity;
  for (let i = 2; i < recent.length - 2; i++) {
    const c = recent[i];
    if (c.high > recent[i - 1].high && c.high > recent[i - 2].high && c.high > recent[i + 1].high && c.high > recent[i + 2].high) {
      if (c.high > swingHigh) { swingHigh = c.high; swingHighIdx = i; }
    }
    if (c.low < recent[i - 1].low && c.low < recent[i - 2].low && c.low < recent[i + 1].low && c.low < recent[i + 2].low) {
      if (c.low < swingLow) { swingLow = c.low; swingLowIdx = i; }
    }
  }
  const hasSwingHL = swingHighIdx !== -1 || swingLowIdx !== -1;

  // ② Liquidity Sweep
  let liqSweepBear = false, liqSweepBull = false;
  if (swingHighIdx !== -1) {
    for (let i = swingHighIdx + 1; i < recent.length; i++) {
      if (recent[i].high > swingHigh && recent[i].close < swingHigh) { liqSweepBear = true; break; }
    }
  }
  if (swingLowIdx !== -1) {
    for (let i = swingLowIdx + 1; i < recent.length; i++) {
      if (recent[i].low < swingLow && recent[i].close > swingLow) { liqSweepBull = true; break; }
    }
  }
  const hasLiqSweep = liqSweepBear || liqSweepBull;

  // ③ MSS / CHoCH
  let hasMSS = false;
  if (liqSweepBear && swingLowIdx !== -1) {
    const lowestClose = Math.min(...recent.slice(-5).map((c) => c.close));
    if (lowestClose < swingLow * 0.999) hasMSS = true;
    if (last.close < prev.low && prev.close < recent[recent.length - 3].low) hasMSS = true;
  }
  if (liqSweepBull && swingHighIdx !== -1) {
    const highestClose = Math.max(...recent.slice(-5).map((c) => c.close));
    if (highestClose > swingHigh * 1.001) hasMSS = true;
    if (last.close > prev.high && prev.close > recent[recent.length - 3].high) hasMSS = true;
  }
  if (!hasMSS) {
    const b = recent.slice(-6);
    const downSwing = b[0].close > b[2].close && b[2].close > b[4].close;
    const upSwing = b[0].close < b[2].close && b[2].close < b[4].close;
    if (downSwing && last.close > b[b.length - 3].high) hasMSS = true;
    if (upSwing && last.close < b[b.length - 3].low) hasMSS = true;
  }

  // ④ FVG
  let hasFVG = false, fvgBull = false, fvgBear = false;
  for (let i = 1; i < recent.length - 1; i++) {
    const a = recent[i - 1], c = recent[i + 1];
    if (c.low > a.high) { hasFVG = true; fvgBull = true; }
    if (c.high < a.low) { hasFVG = true; fvgBear = true; }
  }

  // ⑤ FVG Retest
  let hasFVGRetest = false;
  if (hasFVG && hasMSS) {
    for (let i = 5; i < recent.length - 1; i++) {
      const a = recent[i - 2], c = recent[i];
      if (fvgBull && c.low > a.high) {
        for (let j = i + 1; j < recent.length; j++) {
          if (recent[j].low <= c.high && recent[j].low >= a.high) { hasFVGRetest = true; break; }
        }
      }
      if (fvgBear && c.high < a.low) {
        for (let j = i + 1; j < recent.length; j++) {
          if (recent[j].high >= c.low && recent[j].high <= a.low) { hasFVGRetest = true; break; }
        }
      }
    }
    if (!hasFVGRetest) {
      const bodyRange = Math.abs(last.close - last.open);
      const avgRange = recent.slice(-10).reduce((s, c) => s + Math.abs(c.close - c.open), 0) / 10;
      if (bodyRange < avgRange * 0.5 && (fvgBull ? last.close < prev.close : last.close > prev.close)) {
        hasFVGRetest = true;
      }
    }
  }

  // Direction + score + location
  let direction = 'none';
  if (liqSweepBull && hasMSS) direction = 'bull';
  if (liqSweepBear && hasMSS) direction = 'bear';
  const checks = [hasSwingHL, hasLiqSweep, hasMSS, hasFVG, hasFVGRetest];
  const score = checks.filter(Boolean).length;

  const highLast10 = Math.max(...recent.slice(-10).map((c) => c.high));
  const lowLast10 = Math.min(...recent.slice(-10).map((c) => c.low));
  const range = highLast10 - lowLast10;
  let location = 'RANGE';
  if (last.close > highLast10 - range * 0.15) location = 'NEAR HIGH';
  else if (last.close < lowLast10 + range * 0.15) location = 'NEAR LOW';

  return {
    price: last.close,
    change: ((last.close - candles[0].close) / candles[0].close) * 100,
    direction,
    checks,
    score,
    location,
    details: { swingHigh, swingLow, liqSweepBull, liqSweepBear },
  };
}
