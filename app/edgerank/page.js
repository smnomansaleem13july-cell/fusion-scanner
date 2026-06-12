'use client';

import { useMemo, useRef, useState } from 'react';
import Nav from '@/components/Nav';

const clip = (x, a, b) => Math.max(a, Math.min(b, x));

function stdev(arr) {
  const m = arr.reduce((a, b) => a + b, 0) / arr.length;
  return Math.sqrt(arr.reduce((s, x) => s + (x - m) * (x - m), 0) / arr.length);
}
function zscores(vals) {
  const ok = vals.filter((v) => isFinite(v));
  const m = ok.reduce((a, b) => a + b, 0) / ok.length;
  const sd = stdev(ok) || 1e-9;
  return vals.map((v) => (isFinite(v) ? (v - m) / sd : 0));
}

// Composite: mom z 42% + trend quality 28% + breakout 16% + squeeze 14%, RVOL boost
function compositeScores(rows) {
  const zMom = zscores(rows.map((r) => r.f.mom));
  rows.forEach((r, idx) => {
    const zm = clip(zMom[idx], -2.5, 2.5) / 2.5;
    let score = 42 * zm + 28 * r.f.tq + 16 * clip(r.f.brk, -1, 1) + 14 * r.f.sqzFired;
    if (r.f.rvol >= 1.5) score *= 1.08;
    r.score = clip(score, -100, 100);
    r.rs = Math.round((zMom.filter((z) => z <= zMom[idx]).length / zMom.length) * 100);
  });
}

function Spark({ data, w = 92, h = 22 }) {
  if (!data || data.length < 2) return null;
  const mn = Math.min(...data), mx = Math.max(...data), rg = mx - mn || 1;
  const pts = data.map((v, i) => `${((i / (data.length - 1)) * w).toFixed(1)},${(h - 2 - ((v - mn) / rg) * (h - 4)).toFixed(1)}`).join(' ');
  const col = data[data.length - 1] >= data[0] ? '#16c784' : '#f05267';
  return (
    <svg className="spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <polyline points={pts} fill="none" stroke={col} strokeWidth="1.3" />
    </svg>
  );
}

const fmtP = (p) => (p >= 1000 ? p.toLocaleString(undefined, { maximumFractionDigits: 1 }) : p >= 10 ? p.toFixed(2) : p >= 0.1 ? p.toFixed(4) : p.toPrecision(4));

function evalSetup(r, regime) {
  const g = regime || { rgm: 'MIXED', breadth: 50 };
  const dir = r.score >= 0 ? 1 : -1;
  const f = r.f;
  const trig = f.sqzFired === dir || (dir > 0 && f.brk >= 0.6) || (dir < 0 && f.brk <= -0.6);
  const checks = [
    { name: 'Regime aligned', pass: (dir > 0 && g.rgm === 'RISK-ON') || (dir < 0 && g.rgm === 'RISK-OFF'), val: g.rgm },
    { name: 'Breadth', pass: dir > 0 ? g.breadth >= 60 : g.breadth <= 40, val: g.breadth + '%' },
    { name: 'RS extreme', pass: dir > 0 ? r.rs >= 80 : r.rs <= 20, val: 'RS ' + r.rs },
    { name: 'Trend quality', pass: Math.abs(f.tq) >= 0.5 && Math.sign(f.tq) === dir, val: 'TQ ' + (f.tq >= 0 ? '+' : '') + Math.round(f.tq * 100) },
    { name: 'Score strength', pass: Math.abs(r.score) >= 40, val: (r.score > 0 ? '+' : '') + Math.round(r.score) },
    { name: 'Trigger', pass: trig, val: f.sqzFired !== 0 ? 'SQZ' : f.brkTxt },
    { name: 'RVOL', pass: f.rvol >= 1.5, val: f.rvol.toFixed(1) + 'x' },
  ];
  return { dir, checks, count: checks.filter((c) => c.pass).length };
}

export default function EdgeRank() {
  const [count, setCount] = useState(100);
  const [filter, setFilter] = useState('all');
  const [rows, setRows] = useState([]);
  const [regime, setRegime] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState('');
  const [selected, setSelected] = useState(null);
  const stopRef = useRef(false);

  async function scan() {
    if (scanning) return;
    stopRef.current = false;
    setScanning(true);
    setRows([]);
    setSelected(null);
    setRegime(null);
    try {
      setProgress('Loading top pairs...');
      const pRes = await fetch('/api/pairs?count=' + count);
      const pData = await pRes.json();
      if (!pData.ok) throw new Error(pData.error || 'Pairs load failed');
      const pairs = pData.pairs;
      if (!pairs.some((p) => p.sym === 'BTCUSDT')) pairs.push({ sym: 'BTCUSDT', last: 0, chg: 0, qv: 0, btcOnly: true });

      const collected = [];
      const batchSize = 14;
      for (let i = 0; i < pairs.length; i += batchSize) {
        if (stopRef.current) break;
        setProgress(`Scanning ${Math.min(i + batchSize, pairs.length)}/${pairs.length}...`);
        const res = await fetch('/api/edgerank', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pairs: pairs.slice(i, i + batchSize) }),
        });
        const data = await res.json();
        if (data.ok && data.rows) collected.push(...data.rows);
      }

      // Regime from BTC + breadth
      const btc = collected.find((r) => r.sym === 'BTCUSDT');
      const breadth = collected.length ? Math.round((100 * collected.filter((r) => r.f.aboveE50).length) / collected.length) : 50;
      let rgm = 'MIXED', cls = 'rg-mix';
      if (btc) {
        const up = btc.f.tq > 0.15 && btc.f.aboveE50;
        const dn = btc.f.tq < -0.15 && !btc.f.aboveE50;
        if (up && breadth >= 60) { rgm = 'RISK-ON'; cls = 'rg-on'; }
        else if (dn && breadth <= 40) { rgm = 'RISK-OFF'; cls = 'rg-off'; }
      }
      setRegime({ rgm, cls, breadth });

      const ok = collected.filter((r) => !r.btcOnly);
      compositeScores(ok);
      ok.sort((a, b) => b.score - a.score);
      setRows(ok);
      setProgress(`Done — ${ok.length} coins ranked`);
    } catch (e) {
      setProgress('Error: ' + (e.message || 'scan failed'));
    } finally {
      setScanning(false);
    }
  }

  const view = useMemo(() => {
    if (filter === 'long') return rows.filter((r) => r.score >= 0);
    if (filter === 'short') return rows.filter((r) => r.score < 0);
    if (filter === 'strong') return rows.filter((r) => Math.abs(r.score) >= 40);
    return rows;
  }, [rows, filter]);

  const ev = selected ? evalSetup(selected, regime) : null;

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">
          <div className="mark">ER</div>
          <div>
            <h1>EdgeRank</h1>
            <div className="sub">Cross-sectional momentum ranking · 1h</div>
          </div>
        </div>
        <Nav />
        <div className="status">
          {regime && <span className={'regime-pill ' + regime.cls}>{regime.rgm} · breadth {regime.breadth}%</span>}
        </div>
      </div>

      <div className="controls">
        <div className="field">
          <label htmlFor="er-count">Pairs</label>
          <select id="er-count" value={count} onChange={(e) => setCount(+e.target.value)}>
            <option value={30}>Top 30</option>
            <option value={50}>Top 50</option>
            <option value={100}>Top 100</option>
            <option value={250}>Top 250</option>
            <option value={500}>Top 500</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="er-filter">Filter</label>
          <select id="er-filter" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">All</option>
            <option value="long">Long bias</option>
            <option value="short">Short bias</option>
            <option value="strong">Strong (|score| ≥ 40)</option>
          </select>
        </div>
        <div className="actions">
          <button className="primary" onClick={scan} disabled={scanning}>{scanning ? 'Scanning…' : 'Scan'}</button>
          <button className="danger" onClick={() => { stopRef.current = true; }} disabled={!scanning}>Stop</button>
        </div>
      </div>

      <div className={'progress' + (progress ? ' visible' : '')}>
        <div className="progress-text">{progress}</div>
      </div>

      <div className="main">
        <div className="table-wrap">
          {view.length === 0 ? (
            <div className="empty">
              {scanning ? <p>Scanning…</p> : <p><b>No rankings yet.</b><br />Press <b>Scan</b> — top pairs 1h momentum, trend quality, squeeze aur breakout par rank honge.</p>}
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>#</th><th>Symbol</th><th>Score</th><th>RS</th><th>Price</th><th>24h</th><th>TQ</th><th>RVOL</th><th>Breakout</th><th>48h</th>
                </tr>
              </thead>
              <tbody>
                {view.map((r, i) => (
                  <tr key={r.sym} className={selected?.sym === r.sym ? 'selected' : ''} onClick={() => setSelected(r)}>
                    <td className="mono" style={{ color: 'var(--soft)' }}>{i + 1}</td>
                    <td><b>{r.sym.replace('USDT', '')}</b></td>
                    <td className={r.score >= 0 ? 'heat-pos mono' : 'heat-neg mono'}>{r.score >= 0 ? '+' : ''}{Math.round(r.score)}</td>
                    <td className="mono">{r.rs}</td>
                    <td className="mono">${fmtP(r.f.close)}</td>
                    <td className={'mono ' + (r.chg >= 0 ? 'chg-pos' : 'chg-neg')}>{r.chg >= 0 ? '+' : ''}{r.chg.toFixed(2)}%</td>
                    <td className="mono" style={{ color: r.f.tq >= 0 ? 'var(--green)' : 'var(--red)' }}>{(r.f.tq >= 0 ? '+' : '') + Math.round(r.f.tq * 100)}</td>
                    <td className="mono">{r.f.rvol.toFixed(1)}x</td>
                    <td className="mono" style={{ fontSize: 11 }}>{r.f.sqzNow ? 'SQZ·on' : r.f.sqzFired !== 0 ? 'SQZ→' + (r.f.sqzFired > 0 ? 'up' : 'dn') : r.f.brkTxt}</td>
                    <td><Spark data={r.f.spark} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {selected && ev && (
          <aside className="side">
            <div className="side-head">
              <div>
                <h2>{selected.sym.replace('USDT', '')} <span className={'pill ' + (ev.dir > 0 ? 'long' : 'short')}>{ev.dir > 0 ? 'LONG' : 'SHORT'}</span></h2>
                <div className="sub">Score {(selected.score > 0 ? '+' : '') + Math.round(selected.score)} · RS {selected.rs}</div>
              </div>
              <button className="ghost" onClick={() => setSelected(null)} aria-label="Close details">✕</button>
            </div>
            <div className="side-body">
              <div className="panel">
                <h3>Pre-trade checklist — {ev.count}/7</h3>
                {ev.checks.map((c) => (
                  <div className="kv" key={c.name}>
                    <span className="k">{c.pass ? '✓ ' : '✗ '}{c.name}</span>
                    <span className="v" style={{ color: c.pass ? 'var(--green)' : 'var(--soft)' }}>{c.val}</span>
                  </div>
                ))}
                <div className="kv" style={{ marginTop: 8, borderTop: '1px solid var(--line)', paddingTop: 8 }}>
                  <span className="k">Verdict</span>
                  <span className="v" style={{ color: ev.count === 7 ? 'var(--green)' : 'var(--amber)' }}>{ev.count === 7 ? 'GO ✓' : 'SETUP ' + ev.count + '/7'}</span>
                </div>
              </div>
              <div className="panel">
                <h3>Factors</h3>
                <div className="kv"><span className="k">Momentum (risk-adj)</span><span className="v">{selected.f.mom.toFixed(2)}</span></div>
                <div className="kv"><span className="k">Trend quality</span><span className="v">{(selected.f.tq >= 0 ? '+' : '') + Math.round(selected.f.tq * 100)}</span></div>
                <div className="kv"><span className="k">Squeeze</span><span className="v">{selected.f.sqzNow ? 'Active' : selected.f.sqzFired !== 0 ? 'Fired ' + (selected.f.sqzFired > 0 ? 'up' : 'down') : '--'}</span></div>
                <div className="kv"><span className="k">Breakout</span><span className="v">{selected.f.brkTxt}</span></div>
                <div className="kv"><span className="k">RVOL</span><span className="v">{selected.f.rvol.toFixed(2)}x</span></div>
                <div className="kv"><span className="k">Above EMA50</span><span className="v">{selected.f.aboveE50 ? 'Yes' : 'No'}</span></div>
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
