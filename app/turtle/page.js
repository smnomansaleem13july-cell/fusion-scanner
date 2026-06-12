'use client';

import { useMemo, useRef, useState } from 'react';
import Nav from '@/components/Nav';

const CHECK_LABELS = ['Swing', 'Sweep', 'MSS', 'FVG', 'Retest'];

const fmt = (n) => {
  if (!Number.isFinite(n)) return '--';
  if (Math.abs(n) >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (Math.abs(n) >= 1) return n.toFixed(4);
  if (Math.abs(n) >= 0.01) return n.toFixed(5);
  return n.toFixed(8);
};
const fmtVol = (n) => {
  if (!Number.isFinite(n) || !n) return '--';
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  return (n / 1e3).toFixed(1) + 'K';
};

export default function TurtleSoup() {
  const [coinCount, setCoinCount] = useState(100);
  const [tf, setTf] = useState('15m');
  const [minScore, setMinScore] = useState(3);
  const [dirFilter, setDirFilter] = useState('all');
  const [rows, setRows] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState({ pct: 0, text: '' });
  const [scanned, setScanned] = useState(0);
  const [total, setTotal] = useState(0);
  const stopRef = useRef(false);

  async function scan() {
    if (scanning) return;
    stopRef.current = false;
    setScanning(true);
    setRows([]);
    setScanned(0);
    setTotal(0);
    try {
      setProgress({ pct: 2, text: 'Loading market-cap universe (server cached)...' });
      const uRes = await fetch('/api/universe?count=' + coinCount);
      const uData = await uRes.json();
      if (!uData.ok || !uData.coins?.length) throw new Error(uData.error || 'Universe load failed');
      const coins = uData.coins;
      setTotal(coins.length);

      const batchSize = 10;
      let done = 0;
      for (let i = 0; i < coins.length; i += batchSize) {
        if (stopRef.current) break;
        const batch = coins.slice(i, i + batchSize);
        setProgress({ pct: (i / coins.length) * 100, text: 'Scanning ' + batch.map((c) => c.base).join(', ') });
        try {
          const res = await fetch('/api/turtle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ coins: batch, tf }),
          });
          const data = await res.json();
          if (data.ok && data.rows?.length) setRows((prev) => [...prev, ...data.rows]);
        } catch (e) { /* batch fail — continue */ }
        done += batch.length;
        setScanned(done);
      }
      setProgress({ pct: 100, text: stopRef.current ? 'Stopped' : 'Scan complete' });
    } catch (e) {
      setProgress({ pct: 0, text: 'Error: ' + (e.message || 'scan failed') });
    } finally {
      setScanning(false);
    }
  }

  const view = useMemo(() => {
    let v = rows.filter((r) => r.score >= minScore);
    if (dirFilter === 'bull') v = v.filter((r) => r.direction === 'bull');
    if (dirFilter === 'bear') v = v.filter((r) => r.direction === 'bear');
    v.sort((a, b) => b.score - a.score || Math.abs(b.change24h || 0) - Math.abs(a.change24h || 0));
    return v;
  }, [rows, minScore, dirFilter]);

  const stats = useMemo(() => ({
    bull: rows.filter((r) => r.direction === 'bull').length,
    bear: rows.filter((r) => r.direction === 'bear').length,
    full: rows.filter((r) => r.score === 5).length,
  }), [rows]);

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">
          <div className="mark">TS</div>
          <div>
            <h1>Turtle Soup</h1>
            <div className="sub">ICT liquidity grab reversal · 5-point checklist</div>
          </div>
        </div>
        <Nav />
        <div className="status">
          <span className="mono">{scanned}/{total || '--'} scanned</span>
        </div>
      </div>

      <div className="controls">
        <div className="field">
          <label htmlFor="ts-count">Coins</label>
          <select id="ts-count" value={coinCount} onChange={(e) => setCoinCount(+e.target.value)}>
            <option value={50}>Top 50</option>
            <option value={100}>Top 100</option>
            <option value={200}>Top 200</option>
            <option value={500}>Top 500</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="ts-tf">Timeframe</label>
          <select id="ts-tf" value={tf} onChange={(e) => setTf(e.target.value)}>
            <option value="5m">5m</option>
            <option value="15m">15m</option>
            <option value="1h">1h</option>
            <option value="4h">4h</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="ts-min">Min checks</label>
          <select id="ts-min" value={minScore} onChange={(e) => setMinScore(+e.target.value)}>
            <option value={1}>1+</option>
            <option value={2}>2+</option>
            <option value={3}>3+</option>
            <option value={4}>4+</option>
            <option value={5}>5/5 only</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="ts-dir">Direction</label>
          <select id="ts-dir" value={dirFilter} onChange={(e) => setDirFilter(e.target.value)}>
            <option value="all">All</option>
            <option value="bull">Bull only</option>
            <option value="bear">Bear only</option>
          </select>
        </div>
        <div className="actions">
          <button className="primary" onClick={scan} disabled={scanning}>{scanning ? 'Scanning…' : 'Start scan'}</button>
          <button className="danger" onClick={() => { stopRef.current = true; }} disabled={!scanning}>Stop</button>
        </div>
      </div>

      <div className="stats">
        <div className="stat"><div className="k">Setups</div><div className="v">{rows.length}</div></div>
        <div className="stat"><div className="k">Bull</div><div className="v" style={{ color: 'var(--green)' }}>{stats.bull}</div></div>
        <div className="stat"><div className="k">Bear</div><div className="v" style={{ color: 'var(--red)' }}>{stats.bear}</div></div>
        <div className="stat"><div className="k">Full 5/5</div><div className="v" style={{ color: 'var(--cyan)' }}>{stats.full}</div></div>
      </div>

      <div className={'progress' + (scanning || progress.text ? ' visible' : '')}>
        <div className="bar"><div className="fill" style={{ width: progress.pct + '%' }} /></div>
        <div className="progress-text">{progress.text}</div>
      </div>

      <div className="main">
        <div className="table-wrap">
          {view.length === 0 ? (
            <div className="empty">
              {scanning
                ? <p>Scanning… setups yahan aayenge.</p>
                : <p><b>No setups yet.</b><br />Coins + timeframe select karke <b>Start scan</b> dabao. Har coin pe 5-point Turtle Soup checklist chalegi: Swing → Sweep → MSS → FVG → Retest.</p>}
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>#</th><th>Coin</th><th>Dir</th><th>Checklist</th><th>Score</th><th>Price</th><th>24h</th><th>Volume</th><th>Location</th>
                </tr>
              </thead>
              <tbody>
                {view.map((r, i) => (
                  <tr key={r.symbol}>
                    <td className="mono" style={{ color: 'var(--soft)' }}>{i + 1}</td>
                    <td>
                      <div className="coin">
                        {r.image ? <img src={r.image} alt="" loading="lazy" /> : <span className="ph">{r.base.slice(0, 3)}</span>}
                        <div>
                          <div className="nm">{r.base}</div>
                          <div className="rk">#{r.rank} · {r.timeframe}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      {r.direction === 'bull' && <span className="pill long">BULL</span>}
                      {r.direction === 'bear' && <span className="pill short">BEAR</span>}
                      {r.direction === 'none' && <span className="loc-pill">--</span>}
                    </td>
                    <td>
                      <div className="ck-dots">
                        {r.checks.map((on, j) => (
                          <span key={j} className={'ck-dot' + (on ? ' on' : '')} title={CHECK_LABELS[j]}>{j + 1}</span>
                        ))}
                      </div>
                    </td>
                    <td className="mono" style={{ fontWeight: 800, color: r.score === 5 ? 'var(--cyan)' : r.score >= 3 ? 'var(--green)' : 'var(--muted)' }}>{r.score}/5</td>
                    <td className="mono">${fmt(r.price)}</td>
                    <td className={'mono ' + ((r.change24h ?? 0) >= 0 ? 'chg-pos' : 'chg-neg')}>{(r.change24h ?? 0) >= 0 ? '+' : ''}{(r.change24h ?? 0).toFixed(2)}%</td>
                    <td className="mono">{fmtVol(r.quoteVolume)}</td>
                    <td><span className="loc-pill">{r.location}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
