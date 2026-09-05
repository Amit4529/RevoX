'use client';

import { useState, useEffect, useCallback } from 'react';
import Sidebar from '@/components/Sidebar';

// ---- Helpers ----
function formatPaise(paise: number): string {
  const rupees = Math.floor(Math.abs(paise) / 100);
  const paiseRem = Math.abs(paise) % 100;
  const sign = paise < 0 ? '-' : '';
  return `${sign}₹${new Intl.NumberFormat('en-IN').format(rupees)}.${String(paiseRem).padStart(2, '0')}`;
}

function formatPaiseShort(paise: number): string {
  const rupees = Math.abs(paise) / 100;
  if (rupees >= 10000000) return `₹${(rupees / 10000000).toFixed(1)}Cr`;
  if (rupees >= 100000) return `₹${(rupees / 100000).toFixed(1)}L`;
  if (rupees >= 1000) return `₹${(rupees / 1000).toFixed(1)}K`;
  return `₹${rupees.toFixed(0)}`;
}

const STATE_LABELS: Record<string, { label: string; color: string }> = {
  matched:               { label: 'Matched',      color: '#059669' },
  matched_with_tds:      { label: 'Matched (TDS)',color: '#0D9488' },
  waiting_for_settlement:{ label: 'Waiting',      color: '#2563EB' },
  recoverable:           { label: 'Recoverable',  color: '#D97706' },
  finance_review:        { label: 'Fin. Review',  color: '#7C3AED' },
  risk_hold:             { label: 'Risk Hold',    color: '#DC2626' },
  promise_to_pay:        { label: 'PTP',          color: '#0891B2' },
  closed:                { label: 'Closed',       color: '#6B7280' },
};

export default function CommandCenter() {
  const [dashboard, setDashboard] = useState<any>(null);
  const [forecast, setForecast] = useState<any>(null);
  const [runStatus, setRunStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [runMsg, setRunMsg] = useState('');
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);

  const loadDashboard = useCallback(async () => {
    try {
      const [d, f] = await Promise.all([
        fetch('/api/dashboard').then(r => r.json()),
        fetch('/api/forecast').then(r => r.json()),
      ]);
      setDashboard(d);
      setForecast(f);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  // Auto-refresh every 10 seconds — silent (no loading spinner)
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const [d, f] = await Promise.all([
          fetch('/api/dashboard').then(r => r.json()),
          fetch('/api/forecast').then(r => r.json()),
        ]);
        setDashboard(d);
        setForecast(f);
      } catch { /* silent */ }
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleRun = async () => {
    setRunStatus('loading');
    setRunMsg('Running reconciliation engine…');
    const t0 = Date.now();
    try {
      const r = await fetch('/api/reconcile', { method: 'POST' });
      const data = await r.json();
      setElapsedMs(Date.now() - t0);
      if (r.ok) {
        setRunStatus('done');
        setRunMsg(`✓ Created ${data.casesCreated ?? 0} cases in ${data.metrics?.elapsedMs ?? '?'}ms`);
        await loadDashboard();
      } else {
        setRunStatus('error');
        setRunMsg(data.error || 'Reconciliation failed');
      }
    } catch (err: any) {
      setRunStatus('error');
      setRunMsg(String(err));
      setElapsedMs(Date.now() - t0);
    }
  };

  // Cash bridge items
  const bridge = dashboard?.cashBridge;
  const maxVal = bridge ? Math.max(bridge.expectedPaise, 1) : 1;

  const bridgeRows = bridge ? [
    { label: 'Expected (captured payments)', paise: bridge.expectedPaise, color: '#1D4ED8' },
    { label: 'Gateway settled (net)',        paise: bridge.settledNetPaise, color: '#059669' },
    { label: 'Bank credited',               paise: bridge.bankCreditedPaise, color: '#059669' },
    { label: 'Recoverable exceptions',      paise: bridge.exceptionsPaise, color: '#D97706' },
  ] : [];

  const stateMap: Record<string, { count: number; totalPaise: number }> = dashboard?.casesByState ?? {};
  const orderedStates = ['matched', 'matched_with_tds', 'waiting_for_settlement', 'recoverable', 'finance_review', 'risk_hold', 'promise_to_pay', 'closed'];



  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-content">
        <div className="page-header">
          <h1 className="page-title">Batch Command Center</h1>
          <p className="page-subtitle">Run the reconciliation engine, inspect the cash bridge, and forecast forward cash positions.</p>
        </div>

        <div className="page-body">

          {/* Run Controls */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-header">
              <h2 className="card-title">Reconciliation Engine</h2>
              <button
                id="btn-run-reconciliation"
                className={`btn ${runStatus === 'loading' ? 'btn-secondary' : 'btn-primary'}`}
                onClick={handleRun}
                disabled={runStatus === 'loading'}
              >
                {runStatus === 'loading' ? <><span className="spinner" /> Running…</> : '▶ Run Engine'}
              </button>
            </div>
            <div className="card-body" style={{ paddingTop: 14, paddingBottom: 14 }}>
              {runStatus !== 'idle' && (
                <div className={`status-banner ${runStatus === 'loading' ? 'status-running' : runStatus === 'done' ? 'status-done' : 'status-error'}`} style={{ marginBottom: 14 }}>
                  {runStatus === 'loading' && <span className="spinner" />}
                  {runMsg}
                  {elapsedMs && runStatus === 'done' && <span style={{ marginLeft: 'auto', fontSize: 11, opacity: 0.7 }}>{elapsedMs}ms total</span>}
                </div>
              )}

              {/* Source counts */}
              {dashboard?.sourceCounts && (
                <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                  {Object.entries(dashboard.sourceCounts).map(([key, val]) => key !== 'total' && (
                    <div key={key} style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 18, fontWeight: 700 }}>{String(val)}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'capitalize' }}>{key.replace('_', ' ')}</div>
                    </div>
                  ))}
                  <div style={{ textAlign: 'center', borderLeft: '1px solid var(--border)', paddingLeft: 20 }}>
                    <div style={{ fontSize: 18, fontWeight: 700 }}>{String(dashboard.sourceCounts.total ?? 0)}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Total Records</div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Case State Quick Metrics */}
          {dashboard && (
            <div className="metric-grid" style={{ marginBottom: 20 }}>
              {orderedStates.map(state => {
                const info = stateMap[state] ?? { count: 0, totalPaise: 0 };
                const cfg = STATE_LABELS[state];
                return (
                  <div className="metric-tile" key={state} style={{ borderTop: `3px solid ${cfg?.color}` }}>
                    <div className="metric-tile-label">{cfg?.label ?? state}</div>
                    <div className="metric-tile-value">{info.count}</div>
                    {info.totalPaise > 0 && (
                      <div className="metric-tile-sub">{formatPaiseShort(info.totalPaise)}</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="two-col" style={{ marginBottom: 20 }}>
            {/* Cash Bridge Waterfall */}
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">Cash Bridge Waterfall</h2>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Expected → Captured → Settled → Bank</span>
              </div>
              <div className="card-body">
                {bridge ? (
                  <div className="waterfall">
                    {bridgeRows.map((row, i) => (
                      <div key={i} className="waterfall-row">
                        <div className="waterfall-label">{row.label}</div>
                        <div className="waterfall-bar-track">
                          <div
                            className="waterfall-bar-fill"
                            style={{
                              width: `${Math.min(100, (row.paise / maxVal) * 100).toFixed(1)}%`,
                              background: row.color,
                            }}
                          />
                        </div>
                        <div className="waterfall-amount">{formatPaise(row.paise)}</div>
                      </div>
                    ))}
                    <div style={{ marginTop: 14, padding: '10px 0', borderTop: '2px solid var(--border)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                        <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Total cases</span>
                        <span style={{ fontWeight: 700 }}>{dashboard?.totalCases ?? 0}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="empty-state" style={{ padding: 30 }}>
                    <div className="empty-icon">◈</div>
                    <div className="empty-desc">Run the engine to generate cash bridge data</div>
                  </div>
                )}
              </div>
            </div>

            {/* Forward Cash Forecaster */}
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">Forward Cash Forecast</h2>
                <span style={{ fontSize: 10, color: 'var(--color-recoverable)', fontWeight: 600, letterSpacing: '0.05em' }}>
                  FORECAST — NOT SETTLED CASH
                </span>
              </div>
              <div className="card-body">
                {forecast?.forecasts ? (
                  <>
                    <div className="forecast-horizons">
                      {forecast.forecasts.map((f: any) => (
                        <div key={f.days} className="forecast-horizon-card">
                          <div className="forecast-horizon-label">{f.days}-Day Horizon</div>
                          <div className="forecast-scenario">
                            <span className="forecast-scenario-label">High</span>
                            <span className="forecast-high">{formatPaiseShort(f.high)}</span>
                          </div>
                          <div className="forecast-scenario" style={{ padding: '6px 0', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', margin: '4px 0' }}>
                            <span className="forecast-scenario-label" style={{ fontWeight: 600 }}>Base</span>
                            <span className="forecast-base">{formatPaise(f.base)}</span>
                          </div>
                          <div className="forecast-scenario">
                            <span className="forecast-scenario-label">Low</span>
                            <span className="forecast-low">{formatPaiseShort(f.low)}</span>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Component breakdown */}
                    {forecast.components && (
                      <div style={{ marginTop: 16 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                          Base Scenario Components
                        </div>
                        {[
                          { label: 'Settled bank credits', paise: forecast.components.settledBankPaise, color: '#059669' },
                          { label: 'PTP × P(kept=72%)', paise: forecast.components.ptpExpectedPaise, color: '#0891B2' },
                          { label: 'Recovery × P(success=55%)', paise: forecast.components.recoveryExpectedPaise, color: '#D97706' },
                          { label: 'Pending × P(settle=95%)', paise: forecast.components.pendingSettlementExpectedPaise, color: '#2563EB' },
                        ].map((c, i) => (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: i < 3 ? '1px solid var(--border)' : 'none', fontSize: 12.5 }}>
                            <span style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ width: 8, height: 8, borderRadius: 2, background: c.color, display: 'inline-block' }} />
                              {c.label}
                            </span>
                            <span className="amount">{formatPaise(c.paise)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 10 }}>
                      Generated: {forecast.generatedAt ? new Date(forecast.generatedAt).toLocaleString('en-IN') : '—'}
                    </div>
                  </>
                ) : (
                  <div className="empty-state" style={{ padding: 30 }}>
                    <div className="empty-icon">📈</div>
                    <div className="empty-desc">Run the engine to generate forecast data</div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Latest Batch */}
          {dashboard?.latestBatch && (
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">Latest Ingestion Batch</h2>
                <span className={`badge ${dashboard.latestBatch.status === 'completed' ? 'badge-green' : 'badge-amber'}`}>
                  {dashboard.latestBatch.status}
                </span>
              </div>
              <div className="card-body" style={{ display: 'flex', gap: 32 }}>
                <div>
                  <div className="metric-tile-label">Source</div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{dashboard.latestBatch.sourceLabel}</div>
                </div>
                <div>
                  <div className="metric-tile-label">Records</div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{dashboard.latestBatch.totalRecords}</div>
                </div>
                <div>
                  <div className="metric-tile-label">Elapsed</div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{dashboard.latestBatch.elapsedMs}ms</div>
                </div>
                <div>
                  <div className="metric-tile-label">Started</div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>
                    {new Date(dashboard.latestBatch.startedAt).toLocaleString('en-IN')}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
