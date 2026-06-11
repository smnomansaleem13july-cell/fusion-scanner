'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

const COLORS = { long: '#16c784', short: '#f05267', watch: '#eab84d', neutral: '#9ca6b6', cyan: '#28b4d8', violet: '#9b7cf6', orange: '#f59e4b' };

const fmt = (n) => {
  if (!Number.isFinite(n)) return '--';
  if (Math.abs(n) >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (Math.abs(n) >= 1) return n.toFixed(4);
  if (Math.abs(n) >= 0.01) return n.toFixed(5);
  return n.toFixed(8);
};
const fmtVol = (n) => {
  if (!Number.isFinite(n)) return '--';
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return n.toFixed(0);
};
const scoreColor = (s) => (s >= 85 ? COLORS.long : s >= 75 ? COLORS.cyan : s >= 65 ? COLORS.watch : s >= 50 ? COLORS.orange : COLORS.short);
const gradeColor = (cls) => ({ long: COLORS.long, info: COLORS.cyan, watch: COLORS.watch, orange: COLORS.orange, neutral: COLORS.neutral }[cls] || COLORS.neutral);

function sessionLabel(d) {
  const m = d.getUTCHours() * 60 + d.getUTCMinutes();
  if (m >= 0 && m < 120) return 'Asian';
  if (m >= 120 && m < 300) return 'London KZ';
  if (m >= 420 && m < 600) return 'NY AM KZ';
  if (m >= 780 && m < 960) return 'NY PM';
  return 'Off hours';
}

export default function Scanner() {
  const [coinCount, setCoinCount] = useState(100);
  const [tf, setTf] = useState('15m');
  const [dirFilter, setDirFilter] = useState('all');
  const [minScore, setMinScore] = useState(60);
  const [sortMode, setSortMode] = useState('score');
  const [mtf, setMtf] = useState(true);
  const [liq, setLiq] = useState(true);
  const [search, setSearch] = useState('');

  const [rows, setRows] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState({ pct: 0, text: '' });
  const [scanned, setScanned] = useState(0);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState(null);
  const [api, setApi] = useState({ text: 'Idle', kind: 'ok' });
  const [clock, setClock] = useState('');
  const [session, setSession] = useState('');
  const [toast, setToast] = useState('');

  const stopRef = useRef(false);
  const toastT = useRef(null);

  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setClock(d.toISOString().slice(11, 19) + ' UTC');
      setSession(sessionLabel(d));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const showToast = (msg) => {
    setToast(msg);
    clearTimeout(toastT.current);
    toastT.current = setTimeout(() => setToast(''), 4200);
  };

  async function startScan() {
    if (scanning) return;
    stopRef.current = false;
    setScanning(true);
    setRows([]);
    setSelected(null);
    setScanned(0);
    setTotal(0);
    setApi({ text: 'Loading APIs', kind: 'warn' });
    setProgress({ pct: 0, text: 'Loading market-cap universe (server cached)' });

    try {
      const uRes = await fetch('/api/universe?count=' + coinCount);
      const uData = await uRes.json();
      if (!uData.ok || !uData.coins?.length) throw new Error(uData.error || 'No tradable coins found');
      const coins = uData.coins;
      setTotal(coins.length);
      setApi({ text: uData.cgOk ? 'APIs live' : 'CG fallback (volume)', kind: uData.cgOk ? 'ok' : 'warn' });

      const batchSize = 8;
      let done = 0;
      for (let i = 0; i < coins.length; i += batchSize) {
        if (stopRef.current) break;
        const batch = coins.slice(i, i + batchSize);
        setProgress({ pct: (i / coins.length) * 100, text: 'Scanning ' + batch.map((c) => c.base).join(', ') });
        try {
          const res = await fetch('/api/scan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ coins: batch, tf, mtf, liq, minScore, dirFilter }),
          });
          const data = await res.json();
          done += batch.length;
          setScanned(done);
          if (data.ok && data.rows?.length) {
            setRows((prev) => [...prev, ...data.rows]);
          }
        } catch (e) {
          done += batch.length;
          setScanned(done);
        }
      }
      setProgress({ pct: 100, text: stopRef.current ? 'Stopped' : 'Scan complete' });
      showToast(stopRef.current ? 'Scan stopped' : 'Scan complete');
    } catch (e) {
      setApi({ text: 'API error', kind: 'bad' });
      showToast(e.message || 'Scan failed');
    } finally {
      setScanning(false);
    }
  }

  function stopScan() {
    stopRef.current = true;
  }

  function clearAll() {
    setRows([]);
    setSelected(null);
    setScanned(0);
    setTotal(0);
    setProgress({ pct: 0, text: '' });
  }

  const view = useMemo(() => {
    let v = [...rows];
    const q = search.trim().toUpperCase();
    if (q) v = v.filter((r) => r.symbol.includes(q) || (r.name || '').toUpperCase().includes(q));
    if (sortMode === 'score') v.sort((a, b) => b.score - a.score);
    else if (sortMode === 'change') v.sort((a, b) => (b.change || 0) - (a.change || 0));
    else if (sortMode === 'volume') v.sort((a, b) => (b.quoteVolume || 0) - (a.quoteVolume || 0));
    else if (sortMode === 'rank') v.sort((a, b) => (a.rank || 9999) - (b.rank || 9999));
    return v;
  }, [rows, search, sortMode]);

  const stats = useMemo(() => {
    const longs = rows.filter((r) => r.dir === 'long').length;
    const shorts = rows.filter((r) => r.dir === 'short').length;
    const elite = rows.filter((r) => r.score >= 85).length;
    const avgS = rows.length ? Math.round(rows.reduce((a, r) => a + r.score, 0) / rows.length) : 0;
    const best = rows.length ? rows.reduce((a, r) => (r.score > a.score ? r : a)) : null;
    return { longs, shorts, elite, avgS, best };
  }, [rows]);

  function exportCSV() {
    if (!rows.length) return showToast('No rows to export');
    const head = ['Symbol','Name','Rank','Bias','Score','Grade','Price','Change%','Volume','TF','Reasons','Conflicts'];
    const lines = [head.join(',')];
    for (const r of view) {
      lines.push([
        r.symbol, '"' + (r.name || '') + '"', r.rank, r.bias, r.score, r.grade.text,
        r.price, (r.change ?? 0).toFixed(2), Math.round(r.quoteVolume || 0), r.timeframe,
        '"' + (r.reasons || []).join(' | ') + '"',
        '"' + (r.conflicts || []).join(' | ') + '"',
      ].join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'fusion-scan-' + new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-') + '.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const sel = selected;

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">
          <div className="mark">AS</div>
          <div>
            <h1>AlphaScan Fusion</h1>
            <div className="sub">EMA + Momentum + ICT/SMC + Turtle + Flow + Risk</div>
          </div>
        </div>
        <div className="status">
          <span><span className={'dot ' + api.kind}></span>{api.text}</span>
          <span className="mono">{session}</span>
          <span className="mono">{clock}</span>
        </div>
      </div>

      <div className="controls">
        <div className="field">
          <label htmlFor="coin-count">Coins</label>
          <select id="coin-count" value={coinCount} onChange={(e) => setCoinCount(+e.target.value)}>
            <option value={50}>Top 50</option>
            <option value={100}>Top 100</option>
            <option value={200}>Top 200</option>
            <option value={300}>Top 300</option>
            <option value={500}>Top 500</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="tf">Timeframe</label>
          <select id="tf" value={tf} onChange={(e) => setTf(e.target.value)}>
            <option value="5m">5m</option>
            <option value="15m">15m</option>
            <option value="1h">1h</option>
            <option value="4h">4h</option>
            <option value="1d">1d</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="dir">Direction</label>
          <select id="dir" value={dirFilter} onChange={(e) => setDirFilter(e.target.value)}>
            <option value="all">Long + Short</option>
            <option value="long">Long only</option>
            <option value="short">Short only</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="min-score">Min score</label>
          <select id="min-score" value={minScore} onChange={(e) => setMinScore(+e.target.value)}>
            <option value={50}>50+</option>
            <option value={60}>60+</option>
            <option value={70}>70+</option>
            <option value={75}>75+ (A)</option>
            <option value={85}>85+ (A+)</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="sort">Sort</label>
          <select id="sort" value={sortMode} onChange={(e) => setSortMode(e.target.value)}>
            <option value="score">Score</option>
            <option value="change">24h change</option>
            <option value="volume">Volume</option>
            <option value="rank">MCap rank</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="search">Search</label>
          <input id="search" type="search" placeholder="BTC, SOL..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="checks">
          <label><input type="checkbox" checked={mtf} onChange={(e) => setMtf(e.target.checked)} /> MTF confirm</label>
          <label><input type="checkbox" checked={liq} onChange={(e) => setLiq(e.target.checked)} /> Liquidity required</label>
        </div>
        <div className="actions">
          <button className="primary" onClick={startScan} disabled={scanning}>{scanning ? 'Scanning…' : 'Start scan'}</button>
          <button className="danger" onClick={stopScan} disabled={!scanning}>Stop</button>
          <button className="ghost" onClick={exportCSV}>Export CSV</button>
          <button className="ghost" onClick={clearAll}>Clear</button>
        </div>
      </div>

      <div className="stats">
        <div className="stat"><div className="k">Scanned</div><div className="v">{scanned}/{total || '--'}</div></div>
        <div className="stat"><div className="k">Signals</div><div className="v">{rows.length}</div></div>
        <div className="stat"><div className="k">Elite A+</div><div className="v" style={{ color: COLORS.long }}>{stats.elite}</div></div>
        <div className="stat"><div className="k">Long</div><div className="v" style={{ color: COLORS.long }}>{stats.longs}</div></div>
        <div className="stat"><div className="k">Short</div><div className="v" style={{ color: COLORS.short }}>{stats.shorts}</div></div>
        <div className="stat"><div className="k">Avg score</div><div className="v">{stats.avgS || '--'}</div></div>
        <div className="stat"><div className="k">Best</div><div className="v" style={{ color: COLORS.cyan }}>{stats.best ? stats.best.base + ' ' + stats.best.score : '--'}</div></div>
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
                ? <p>Scanning… signals appear here as they're found.</p>
                : <p><b>No signals yet.</b><br />Pick coins + timeframe and press <b>Start scan</b>. Analysis runs on the server with shared caching, so rate limits won't slow it down.</p>}
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Coin</th>
                  <th>Bias</th>
                  <th>Score</th>
                  <th>Grade</th>
                  <th>Price</th>
                  <th>24h</th>
                  <th>Volume</th>
                  <th>Signals</th>
                </tr>
              </thead>
              <tbody>
                {view.map((r, i) => (
                  <tr key={r.symbol + r.timeframe} className={sel?.symbol === r.symbol ? 'selected' : ''} onClick={() => setSelected(r)}>
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
                    <td><span className={'pill ' + r.dir}>{r.bias}</span></td>
                    <td>
                      <div className="score-cell">
                        <span className="mono" style={{ fontWeight: 800, color: scoreColor(r.score) }}>{r.score}</span>
                        <span className="score-bar"><i style={{ width: r.score + '%', background: scoreColor(r.score) }} /></span>
                      </div>
                    </td>
                    <td><span className="gradeb" style={{ color: gradeColor(r.grade.cls), border: '1px solid ' + gradeColor(r.grade.cls) + '55', background: gradeColor(r.grade.cls) + '14' }}>{r.grade.text}</span></td>
                    <td className="mono">${fmt(r.price)}</td>
                    <td className={'mono ' + ((r.change ?? 0) >= 0 ? 'chg-pos' : 'chg-neg')}>{(r.change ?? 0) >= 0 ? '+' : ''}{(r.change ?? 0).toFixed(2)}%</td>
                    <td className="mono">{fmtVol(r.quoteVolume)}</td>
                    <td>
                      <div className="reason-tags">
                        {(r.reasons || []).slice(0, 5).map((t) => <span key={t} className="tag">{t}</span>)}
                      </div>
                    </td>
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
                <h2>{sel.base} <span className={'pill ' + sel.dir} style={{ verticalAlign: 'middle' }}>{sel.bias}</span></h2>
                <div className="sub">{sel.name} · #{sel.rank} · {sel.timeframe} · ${fmt(sel.price)}</div>
              </div>
              <button className="ghost" onClick={() => setSelected(null)} aria-label="Close details">✕</button>
            </div>
            <div className="side-body">
              <div className="panel">
                <h3>Fusion breakdown — {sel.score} ({sel.grade.label})</h3>
                {[
                  ['EMA', sel.breakdown.ema], ['Momentum', sel.breakdown.momentum], ['ICT', sel.breakdown.ict],
                  ['Turtle', sel.breakdown.turtle], ['Flow', sel.breakdown.flow], ['Risk', sel.breakdown.risk],
                ].map(([k, v]) => (
                  <div className="bd-row" key={k}>
                    <span className="lbl">{k}</span>
                    <span className="trk"><i style={{ width: v + '%', background: scoreColor(v) }} /></span>
                    <span className="num">{v}</span>
                  </div>
                ))}
                {sel.mtf && (
                  <div className="kv" style={{ marginTop: 6 }}>
                    <span className="k">MTF {sel.mtf.timeframe}</span>
                    <span className="v" style={{ color: sel.mtf.agree ? COLORS.long : sel.mtf.conflict ? COLORS.short : COLORS.neutral }}>
                      {sel.mtf.agree ? 'Agrees' : sel.mtf.conflict ? 'Conflicts' : 'Mixed'}
                    </span>
                  </div>
                )}
              </div>

              <div className="panel">
                <h3>ICT / SMC</h3>
                <div className="kv"><span className="k">Structure</span><span className="v">{sel.ict.structure}</span></div>
                <div className="kv"><span className="k">BOS / CHoCH</span><span className="v">{sel.ict.bos || sel.ict.choch || '--'}</span></div>
                <div className="kv"><span className="k">Liquidity sweep</span><span className="v">{sel.ict.sweep ? sel.ict.sweep.toUpperCase() : '--'}</span></div>
                <div className="kv"><span className="k">OB / FVG</span><span className="v">{sel.ict.obCount} / {sel.ict.fvgCount}</span></div>
                <div className="kv"><span className="k">P/D zone</span><span className="v">{sel.ict.pd ? sel.ict.pd.zone + ' (' + sel.ict.pd.pct.toFixed(0) + '%)' : '--'}</span></div>
                <div className="kv"><span className="k">OTE</span><span className="v">{sel.ict.ote || '--'}</span></div>
                <div className="kv"><span className="k">Turtle Soup</span><span className="v">{sel.turtle.score}/5 {sel.turtle.labels?.length ? '(' + sel.turtle.labels.join(', ') + ')' : ''}</span></div>
              </div>

              {sel.parts.atr && (
                <div className="panel">
                  <h3>Trade levels (ATR)</h3>
                  <div className="kv"><span className="k">Entry</span><span className="v">${fmt(sel.price)}</span></div>
                  <div className="kv"><span className="k">Stop loss</span><span className="v" style={{ color: COLORS.short }}>${fmt(sel.parts.atr[sel.dir].sl)}</span></div>
                  <div className="kv"><span className="k">TP1 (1.5R)</span><span className="v" style={{ color: COLORS.long }}>${fmt(sel.parts.atr[sel.dir].tp1)}</span></div>
                  <div className="kv"><span className="k">TP2 (2.5R)</span><span className="v" style={{ color: COLORS.long }}>${fmt(sel.parts.atr[sel.dir].tp2)}</span></div>
                  <div className="kv"><span className="k">ATR %</span><span className="v">{sel.parts.atr.atrPct.toFixed(2)}%</span></div>
                </div>
              )}

              <div className="panel">
                <h3>Momentum + Flow</h3>
                <div className="kv"><span className="k">RSI</span><span className="v">{sel.parts.rsi != null ? sel.parts.rsi.toFixed(1) : '--'}</span></div>
                <div className="kv"><span className="k">MACD</span><span className="v">{sel.parts.macd ? sel.parts.macd.dir : '--'}</span></div>
                <div className="kv"><span className="k">StochRSI</span><span className="v">{sel.parts.stoch ? sel.parts.stoch.k.toFixed(0) + ' (' + sel.parts.stoch.zone + ')' : '--'}</span></div>
                <div className="kv"><span className="k">ADX</span><span className="v">{sel.parts.adx ? sel.parts.adx.adx.toFixed(0) + ' ' + sel.parts.adx.strength : '--'}</span></div>
                <div className="kv"><span className="k">RVOL</span><span className="v">{sel.flow.rvol.toFixed(2)}x</span></div>
                <div className="kv"><span className="k">Taker delta</span><span className="v" style={{ color: sel.flow.delta >= 0 ? COLORS.long : COLORS.short }}>{sel.flow.delta.toFixed(1)}%</span></div>
                <div className="kv"><span className="k">Pattern</span><span className="v">{sel.parts.pattern ? sel.parts.pattern.name : '--'}</span></div>
              </div>

              <div className="panel">
                <h3>Signals</h3>
                <div className="reason-tags" style={{ maxWidth: 'none' }}>
                  {(sel.reasons || []).map((t) => <span key={t} className="tag">{t}</span>)}
                </div>
                {!!sel.conflicts?.length && (
                  <>
                    <h3 style={{ marginTop: 12 }}>Conflicts</h3>
                    <div className="reason-tags" style={{ maxWidth: 'none' }}>
                      {sel.conflicts.map((t) => <span key={t} className="tag" style={{ color: COLORS.short, borderColor: 'rgba(240,82,103,.4)' }}>{t}</span>)}
                    </div>
                  </>
                )}
              </div>
            </div>
          </aside>
        )}
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
