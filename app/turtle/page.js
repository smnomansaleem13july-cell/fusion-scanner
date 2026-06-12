'use client';

import { useEffect, useMemo, useState } from 'react';
import Nav from '@/components/Nav';
import { useScanStore } from '@/lib/scanStore';
import { runTurtle, stopTurtle, TURTLE_INIT } from '@/lib/scanners';

const CHECK_COLS = ['Swing H/L', 'Liq Sweep', 'MSS/CHoCH', 'FVG', 'FVG Retest'];

const fmt = (n) => {
  if (!Number.isFinite(n)) return '--';
  if (Math.abs(n) >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (Math.abs(n) >= 1) return n.toFixed(4);
  if (Math.abs(n) >= 0.01) return n.toFixed(5);
  return n.toFixed(8);
};

// Original jaisa session detection
function getSession() {
  const h = new Date().getUTCHours();
  if (h >= 0 && h < 8) return 'ASIAN';
  if (h >= 7 && h < 12) return 'LONDON';
  if (h >= 12 && h < 21) return 'NEW YORK';
  return 'ASIAN';
}

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'bull', label: '● Bullish', color: 'var(--green)' },
  { id: 'bear', label: '● Bearish', color: 'var(--red)' },
  { id: 'full', label: '★ Full Setup' },
  { id: 'sweep', label: 'Liq Sweep' },
  { id: 'mss', label: 'MSS/CHoCH' },
  { id: 'fvg', label: 'FVG' },
];

export default function TurtleSoup() {
  const st = useScanStore('turtle', TURTLE_INIT);
  const { rows, scanning, progress, scanned, total } = st;
  const [coinCount, setCoinCount] = useState(100);
  const [tf, setTf] = useState('15m');
  const [filter, setFilter] = useState('all');
  const [session, setSession] = useState('');
  const [clock, setClock] = useState('');

  useEffect(() => {
    const tick = () => {
      setSession(getSession());
      setClock(new Date().toISOString().slice(11, 16) + ' UTC');
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const view = useMemo(() => {
    let v = [...rows];
    if (filter === 'bull') v = v.filter((r) => r.direction === 'bull');
    else if (filter === 'bear') v = v.filter((r) => r.direction === 'bear');
    else if (filter === 'full') v = v.filter((r) => r.score === 5);
    else if (filter === 'sweep') v = v.filter((r) => r.checks[1]);
    else if (filter === 'mss') v = v.filter((r) => r.checks[2]);
    else if (filter === 'fvg') v = v.filter((r) => r.checks[3]);
    v.sort((a, b) => b.score - a.score || Math.abs(b.change24h || 0) - Math.abs(a.change24h || 0));
    return v;
  }, [rows, filter]);

  const stats = useMemo(() => ({
    bull: rows.filter((r) => r.direction === 'bull').length,
    bear: rows.filter((r) => r.direction === 'bear').length,
    full: rows.filter((r) => r.score === 5).length,
  }), [rows]);

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">
          <div className="mark">🐢</div>
          <div>
            <h1>Turtle Soup Scanner</h1>
            <div className="sub">Liquidity grab reversal · Top coins by market cap</div>
          </div>
        </div>
        <Nav />
        <div className="status">
          <span className="mono">{session}</span>
          <span className="mono">{clock}</span>
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
        <div className="chips">
          {FILTERS.map((f) => (
            <button key={f.id} className={'chip' + (filter === f.id ? ' on' : '')} style={f.color && filter !== f.id ? { color: f.color } : undefined} onClick={() => setFilter(f.id)}>{f.label}</button>
          ))}
        </div>
        <div className="actions">
          <button className="primary" onClick={() => runTurtle({ coinCount, tf })} disabled={scanning}>{scanning ? 'Scanning…' : '▶ Scan'}</button>
          <button className="danger" onClick={stopTurtle} disabled={!scanning}>Stop</button>
        </div>
      </div>

      <div className="stats">
        <div className="stat"><div className="k">Scanned</div><div className="v">{scanned}/{total || '--'}</div></div>
        <div className="stat"><div className="k">Setups</div><div className="v">{rows.length}</div></div>
        <div className="stat"><div className="k">Bullish</div><div className="v" style={{ color: 'var(--green)' }}>{stats.bull}</div></div>
        <div className="stat"><div className="k">Bearish</div><div className="v" style={{ color: 'var(--red)' }}>{stats.bear}</div></div>
        <div className="stat"><div className="k">Full Setup ✓✓✓✓✓</div><div className="v" style={{ color: 'var(--cyan)' }}>{stats.full}</div></div>
      </div>

      <div className={'progress' + (scanning || progress.text ? ' visible' : '')}>
        <div className="bar"><div className="fill" style={{ width: progress.pct + '%' }} /></div>
        <div className="progress-text">{progress.text}</div>
      </div>

      <div className="main">
        <div className="table-wrap">
          {view.length === 0 ? (
            <div className="empty">
              <p style={{ fontSize: 28, margin: '0 0 10px' }}>🐢</p>
              {scanning
                ? <p>Scanning… setups yahan aayenge. Doosre tab pe bhi ja sakte ho — scan chalta rahega.</p>
                : <p><b>TURTLE SOUP SCANNER READY</b><br />Timeframe select karke <b>▶ Scan</b> dabao.<br />Checks: Swing H/L → Liquidity Sweep → MSS/CHoCH → FVG → FVG Retest</p>}
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>#</th><th>Symbol</th><th>Price</th><th>Chg%</th><th>Direction</th>
                  {CHECK_COLS.map((c) => <th key={c}>{c}</th>)}
                  <th>Score</th><th>Session</th><th>Location</th>
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
                    <td className="mono">${fmt(r.price)}</td>
                    <td className={'mono ' + ((r.change24h ?? 0) >= 0 ? 'chg-pos' : 'chg-neg')}>{(r.change24h ?? 0) >= 0 ? '+' : ''}{(r.change24h ?? 0).toFixed(2)}%</td>
                    <td>
                      {r.direction === 'bull' && <span className="pill long">▲ BULL</span>}
                      {r.direction === 'bear' && <span className="pill short">▼ BEAR</span>}
                      {r.direction === 'none' && <span className="loc-pill">--</span>}
                    </td>
                    {r.checks.map((on, j) => (
                      <td key={j} className="mono" style={{ textAlign: 'center', color: on ? 'var(--green)' : 'var(--soft)', fontWeight: 800 }}>{on ? '✓' : '○'}</td>
                    ))}
                    <td className="mono" style={{ fontWeight: 800, color: r.score === 5 ? 'var(--cyan)' : r.score >= 3 ? 'var(--green)' : 'var(--muted)' }}>{r.score}/5</td>
                    <td><span className="loc-pill">{session}</span></td>
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
