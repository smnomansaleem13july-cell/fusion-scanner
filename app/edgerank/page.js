'use client';

import { useMemo, useState } from 'react';
import Nav from '@/components/Nav';
import { useScanStore } from '@/lib/scanStore';
import { runEdge, stopEdge, setEdgeAuto, EDGE_INIT } from '@/lib/scanners';

const fmtP = (p) => (p >= 1000 ? p.toLocaleString(undefined, { maximumFractionDigits: 1 }) : p >= 10 ? p.toFixed(2) : p >= 0.1 ? p.toFixed(4) : p.toPrecision(4));

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

// Original HTML jaisa 7-point setup eval
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
    { name: 'Trigger (SQZ/BRK)', pass: trig, val: f.sqzFired !== 0 ? 'SQZ' : f.brkTxt },
    { name: 'RVOL ≥ 1.5x', pass: f.rvol >= 1.5, val: f.rvol.toFixed(1) + 'x' },
  ];
  return { dir, checks, count: checks.filter((c) => c.pass).length };
}

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'long', label: 'Long bias' },
  { id: 'short', label: 'Short bias' },
  { id: 'squeeze', label: 'Squeeze' },
  { id: 'rvol', label: 'RVOL 1.5x+' },
  { id: 'setup6', label: 'Setup 6+' },
];

export default function EdgeRank() {
  const st = useScanStore('edge', EDGE_INIT);
  const [count, setCount] = useState(100);
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState(null);

  const opts = { count };

  // Setup counts compute (regime-dependent)
  const withSetup = useMemo(() => {
    return st.rows.map((r) => ({ ...r, setup: evalSetup(r, st.regime) }));
  }, [st.rows, st.regime]);

  const view = useMemo(() => {
    let v = withSetup;
    if (filter === 'long') v = v.filter((r) => r.score >= 0);
    else if (filter === 'short') v = v.filter((r) => r.score < 0);
    else if (filter === 'squeeze') v = v.filter((r) => r.f.sqzNow || r.f.sqzFired !== 0);
    else if (filter === 'rvol') v = v.filter((r) => r.f.rvol >= 1.5);
    else if (filter === 'setup6') v = v.filter((r) => r.setup.count >= 6);
    return v;
  }, [withSetup, filter]);

  const sel = selected ? withSetup.find((r) => r.sym === selected) : null;
  const g = st.regime;

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
          {g && (
            <>
              <span className={'regime-pill ' + g.cls}>{g.rgm}</span>
              <span className="mono">BTC TQ {(g.btcTq >= 0 ? '+' : '') + Math.round((g.btcTq || 0) * 100)}</span>
              <span className="mono">Breadth {g.breadth}%</span>
            </>
          )}
        </div>
      </div>

      {g && (
        <div className="breadth-bar" title={'Breadth ' + g.breadth + '%'}>
          <div className="breadth-fill" style={{ width: g.breadth + '%' }} />
        </div>
      )}

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
        <div className="chips">
          {FILTERS.map((f) => (
            <button key={f.id} className={'chip' + (filter === f.id ? ' on' : '')} onClick={() => setFilter(f.id)}>{f.label}</button>
          ))}
        </div>
        <div className="actions">
          <button className="primary" onClick={() => runEdge(opts)} disabled={st.scanning}>{st.scanning ? 'Scanning…' : 'Scan'}</button>
          <button className={st.auto ? 'chip on' : 'chip'} onClick={() => setEdgeAuto(!st.auto, opts)}>Auto {count >= 250 ? '180s' : '60s'}</button>
          <button className="danger" onClick={stopEdge} disabled={!st.scanning}>Stop</button>
        </div>
      </div>

      <div className={'progress' + (st.progress ? ' visible' : '')}>
        <div className="progress-text">{st.progress}</div>
      </div>

      <div className="main">
        <div className="table-wrap">
          {view.length === 0 ? (
            <div className="empty">
              {st.scanning ? <p>Scanning…</p> : <p><b>No rankings yet.</b><br />Press <b>Scan</b>. Scan background me chalta rahega — doosre tab pe jaake wapas aao to data yahi milega.</p>}
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>#</th><th>Pair</th><th>Score</th><th>Setup</th><th>RS</th><th>Trend Q</th><th>SQZ</th><th>RVOL</th><th>100H BRK</th><th>24h</th><th>Price</th><th>48h</th>
                </tr>
              </thead>
              <tbody>
                {view.map((r, i) => (
                  <tr key={r.sym} className={selected === r.sym ? 'selected' : ''} onClick={() => setSelected(r.sym)}>
                    <td className="mono" style={{ color: 'var(--soft)' }}>{i + 1}</td>
                    <td><b>{r.sym.replace('USDT', '')}</b></td>
                    <td className={r.score >= 0 ? 'heat-pos mono' : 'heat-neg mono'}>{r.score >= 0 ? '+' : ''}{Math.round(r.score)}</td>
                    <td className="mono" style={{ fontWeight: 800, color: r.setup.count >= 6 ? 'var(--cyan)' : r.setup.count >= 4 ? 'var(--green)' : 'var(--muted)' }}>{r.setup.count}/7</td>
                    <td className="mono">{r.rs}</td>
                    <td className="mono" style={{ color: r.f.tq >= 0 ? 'var(--green)' : 'var(--red)' }}>{(r.f.tq >= 0 ? '+' : '') + Math.round(r.f.tq * 100)}</td>
                    <td className="mono" style={{ fontSize: 11, color: r.f.sqzFired > 0 ? 'var(--green)' : r.f.sqzFired < 0 ? 'var(--red)' : r.f.sqzNow ? 'var(--amber)' : 'var(--soft)' }}>
                      {r.f.sqzNow ? '●ON' : r.f.sqzFired > 0 ? 'FIRED↑' : r.f.sqzFired < 0 ? 'FIRED↓' : '—'}
                    </td>
                    <td className="mono">{r.f.rvol.toFixed(1)}x</td>
                    <td className="mono" style={{ fontSize: 11 }}>{r.f.brkTxt}</td>
                    <td className={'mono ' + (r.chg >= 0 ? 'chg-pos' : 'chg-neg')}>{r.chg >= 0 ? '+' : ''}{r.chg.toFixed(1)}%</td>
                    <td className="mono">${fmtP(r.f.close)}</td>
                    <td><Spark data={r.f.spark} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {sel && (
          <aside className="side">
            <div className="side-head">
              <div>
                <h2>{sel.sym.replace('USDT', '')} <span className={'pill ' + (sel.setup.dir > 0 ? 'long' : 'short')}>{sel.setup.dir > 0 ? 'LONG' : 'SHORT'}</span></h2>
                <div className="sub">Score {(sel.score > 0 ? '+' : '') + Math.round(sel.score)} · RS {sel.rs} · Setup {sel.setup.count}/7</div>
              </div>
              <button className="ghost" onClick={() => setSelected(null)} aria-label="Close details">✕</button>
            </div>
            <div className="side-body">
              <div className="panel">
                <h3>Pre-trade checklist — {sel.setup.count}/7</h3>
                {sel.setup.checks.map((c) => (
                  <div className="kv" key={c.name}>
                    <span className="k" style={{ color: c.pass ? 'var(--green)' : 'var(--soft)' }}>{c.pass ? '✓ ' : '✗ '}{c.name}</span>
                    <span className="v">{c.val}</span>
                  </div>
                ))}
                <div className="kv" style={{ marginTop: 8, borderTop: '1px solid var(--line)', paddingTop: 8 }}>
                  <span className="k">Verdict</span>
                  <span className="v" style={{ color: sel.setup.count === 7 ? 'var(--green)' : 'var(--amber)' }}>{sel.setup.count === 7 ? 'GO ✓' : 'SETUP ' + sel.setup.count + '/7'}</span>
                </div>
              </div>
              <div className="panel">
                <h3>Factors</h3>
                <div className="kv"><span className="k">Momentum (risk-adj)</span><span className="v">{sel.f.mom.toFixed(2)}</span></div>
                <div className="kv"><span className="k">Trend quality</span><span className="v">{(sel.f.tq >= 0 ? '+' : '') + Math.round(sel.f.tq * 100)}</span></div>
                <div className="kv"><span className="k">Squeeze</span><span className="v">{sel.f.sqzNow ? 'Active' : sel.f.sqzFired !== 0 ? 'Fired ' + (sel.f.sqzFired > 0 ? 'up' : 'down') : '--'}</span></div>
                <div className="kv"><span className="k">Breakout</span><span className="v">{sel.f.brkTxt}</span></div>
                <div className="kv"><span className="k">RVOL</span><span className="v">{sel.f.rvol.toFixed(2)}x</span></div>
                <div className="kv"><span className="k">Above EMA50</span><span className="v">{sel.f.aboveE50 ? 'Yes' : 'No'}</span></div>
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
