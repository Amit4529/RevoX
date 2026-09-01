'use client';

import { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';

function formatPaise(paise: number): string {
  const rupees = Math.floor(Math.abs(paise) / 100);
  const paiseRem = Math.abs(paise) % 100;
  const sign = paise < 0 ? '-' : '';
  return `${sign}₹${new Intl.NumberFormat('en-IN').format(rupees)}.${String(paiseRem).padStart(2, '0')}`;
}

const METRIC_DEFS: Record<string, string> = {
  exactMatchPrecision:  'Correct deterministic auto-matches (Tier A–C + TDS) / all deterministic auto-matches. Target: 100%.',
  coverage:             'Resolved cases (matched + closed) / total cases. Target: ≥ 95%.',
  honestyRate:          'Correct abstentions / cases designed to require abstention (safety + finance review). Target: 100%.',
  recoveryCompletion:   'Amount recovered from completed recovery actions / total eligible recoverable amount.',
  traceabilityCoverage: 'Raw records linked to case evidence chains / total raw records. Target: 100%.',
  blockedUnsafeActions: 'Total automated actions blocked by the Do Not Recover Firewall.',
  cashIntegrityCheck:   'Whether the cash bridge balances to zero unexplained difference.',
};

const TIER_LABELS: Record<string, string> = {
  tier_a:  'Tier A — Exact ID Match',
  tier_b:  'Tier B — Composite Match',
  tier_c:  'Tier C — Grouped Settlement',
  tier_c5: 'Tier C.5 — TDS Match',
  tier_d:  'Tier D — AI-Assisted Candidate',
  tier_e:  'Tier E — Honest Exception',
  unknown: 'Unknown',
};

const STATE_LABELS: Record<string, string> = {
  matched:               'Matched (Exact)',
  matched_with_tds:      'Matched with TDS',
  waiting_for_settlement:'Waiting for Settlement',
  recoverable:           'Recoverable',
  finance_review:        'Finance Review',
  risk_hold:             'Risk Hold',
  promise_to_pay:        'Promise to Pay',
  closed:                'Closed',
};

const STATE_BADGE: Record<string, string> = {
  matched:               'badge-matched',
  matched_with_tds:      'badge-matched_with_tds',
  waiting_for_settlement:'badge-waiting_for_settlement',
  recoverable:           'badge-recoverable',
  finance_review:        'badge-finance_review',
  risk_hold:             'badge-risk_hold',
  promise_to_pay:        'badge-promise_to_pay',
  closed:                'badge-closed',
};

function MetricRow({ label, value, def, isPercent, suffix }: { label: string; value: any; def: string; isPercent?: boolean; suffix?: string }) {
  return (
    <div style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{label}</div>
          <div className="definition">{def}</div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 16 }}>
          <span className="amount-large" style={{ fontSize: 22 }}>
            {typeof value === 'boolean'
              ? (value ? '✓' : '✗')
              : isPercent
                ? `${value}%`
                : `${value}${suffix ?? ''}`}
          </span>
        </div>
      </div>
      {isPercent && typeof value === 'number' && (
        <div style={{ marginTop: 8 }}>
          <div style={{ height: 4, background: 'var(--bg-surface-2)', borderRadius: 100, overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${Math.min(100, value)}%`,
                background: value >= 95 ? '#059669' : value >= 70 ? '#D97706' : '#DC2626',
                borderRadius: 100,
                transition: 'width 0.6s ease',
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default function MetricsPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/metrics')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const m = data?.metrics;

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-content">
        <div className="page-header">
          <h1 className="page-title">Metrics Dashboard</h1>
          <p className="page-subtitle">Ground-truth evaluation of reconciliation quality, honesty, and recovery performance.</p>
        </div>

        <div className="page-body">
          {loading ? (
            <div className="empty-state"><span className="spinner" style={{ width: 32, height: 32 }} /></div>
          ) : !m ? (
            <div className="empty-state">
              <div className="empty-icon">◈</div>
              <div className="empty-title">No metrics available</div>
              <div className="empty-desc">Run the reconciliation engine first.</div>
            </div>
          ) : (
            <>
              {/* Summary tiles */}
              <div className="metric-grid" style={{ marginBottom: 20 }}>
                <div className="metric-tile">
                  <div className="metric-tile-label">Total Cases</div>
                  <div className="metric-tile-value">{m.totalCases}</div>
                </div>
                <div className="metric-tile">
                  <div className="metric-tile-label">Raw Records</div>
                  <div className="metric-tile-value">{m.totalRawRecords}</div>
                </div>
                <div className="metric-tile" style={{ borderTop: '3px solid #059669' }}>
                  <div className="metric-tile-label">Precision</div>
                  <div className="metric-tile-value">{m.exactMatchPrecision}%</div>
                </div>
                <div className="metric-tile" style={{ borderTop: '3px solid #2563EB' }}>
                  <div className="metric-tile-label">Coverage</div>
                  <div className="metric-tile-value">{m.coverage}%</div>
                </div>
                <div className="metric-tile" style={{ borderTop: '3px solid #7C3AED' }}>
                  <div className="metric-tile-label">Honesty Rate</div>
                  <div className="metric-tile-value">{m.honestyRate}%</div>
                </div>
                <div className="metric-tile" style={{ borderTop: '3px solid #D97706' }}>
                  <div className="metric-tile-label">Recovery</div>
                  <div className="metric-tile-value">{m.recoveryCompletion}%</div>
                </div>
                <div className="metric-tile" style={{ borderTop: '3px solid #DC2626' }}>
                  <div className="metric-tile-label">Blocked Actions</div>
                  <div className="metric-tile-value">{m.blockedUnsafeActions}</div>
                </div>
                <div className="metric-tile" style={{ borderTop: '3px solid #059669' }}>
                  <div className="metric-tile-label">Traceability</div>
                  <div className="metric-tile-value">{m.traceabilityCoverage}%</div>
                </div>
              </div>

              <div className="two-col" style={{ marginBottom: 20 }}>

                {/* Detailed Metrics */}
                <div className="card">
                  <div className="card-header"><h2 className="card-title">Metric Definitions & Values</h2></div>
                  <div className="card-body">
                    <MetricRow label="Exact Match Precision"   value={m.exactMatchPrecision}  def={METRIC_DEFS.exactMatchPrecision}  isPercent />
                    <MetricRow label="Coverage"                value={m.coverage}             def={METRIC_DEFS.coverage}             isPercent />
                    <MetricRow label="Honesty Rate"            value={m.honestyRate}          def={METRIC_DEFS.honestyRate}          isPercent />
                    <MetricRow label="Recovery Completion"     value={m.recoveryCompletion}   def={METRIC_DEFS.recoveryCompletion}   isPercent />
                    <MetricRow label="Traceability Coverage"   value={m.traceabilityCoverage} def={METRIC_DEFS.traceabilityCoverage} isPercent />
                    <MetricRow label="Blocked Unsafe Actions"  value={m.blockedUnsafeActions} def={METRIC_DEFS.blockedUnsafeActions} />
                    <MetricRow label="Cash Integrity Check"    value={m.cashIntegrityCheck}   def={METRIC_DEFS.cashIntegrityCheck} />
                    <MetricRow
                      label="Cash Bridge Residual"
                      value={formatPaise(m.cashBridgeResidual ?? 0)}
                      def="Unexplained difference between captured payments and settled amounts. Should trend to zero."
                    />
                  </div>
                </div>

                {/* Tier Breakdown */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div className="card">
                    <div className="card-header"><h2 className="card-title">Reconciliation Tier Breakdown</h2></div>
                    <div className="card-body">
                      {Object.entries(m.tierBreakdown ?? {}).map(([tier, count]: [string, any]) => {
                        const total = m.totalCases || 1;
                        const pct = ((count / total) * 100).toFixed(1);
                        return (
                          <div key={tier} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
                              <span style={{ color: 'var(--text-secondary)' }}>{TIER_LABELS[tier] ?? tier}</span>
                              <span style={{ fontWeight: 700 }}>{count} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({pct}%)</span></span>
                            </div>
                            <div style={{ height: 4, background: 'var(--bg-surface-2)', borderRadius: 100, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${pct}%`, background: '#1D4ED8', borderRadius: 100 }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Cases by State */}
                  <div className="card">
                    <div className="card-header"><h2 className="card-title">Cases by State</h2></div>
                    <div className="card-body">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>State</th>
                            <th style={{ textAlign: 'right' }}>Cases</th>
                            <th style={{ textAlign: 'right' }}>%</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(m.casesByState ?? {}).map(([state, count]: [string, any]) => {
                            const pct = ((count / (m.totalCases || 1)) * 100).toFixed(1);
                            return (
                              <tr key={state} style={{ cursor: 'default' }}>
                                <td><span className={`badge ${STATE_BADGE[state] ?? ''}`}>{STATE_LABELS[state] ?? state}</span></td>
                                <td style={{ textAlign: 'right', fontWeight: 600 }}>{count}</td>
                                <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{pct}%</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>

              {/* Recovery amounts */}
              {m.eligibleRecoveryPaise > 0 && (
                <div className="card">
                  <div className="card-header"><h2 className="card-title">Recovery Value</h2></div>
                  <div className="card-body" style={{ display: 'flex', gap: 40 }}>
                    <div>
                      <div className="metric-tile-label">Eligible Recovery Pool</div>
                      <div className="amount-large">{formatPaise(m.eligibleRecoveryPaise)}</div>
                    </div>
                    <div>
                      <div className="metric-tile-label">Recovered (actions completed)</div>
                      <div className="amount-large" style={{ color: '#059669' }}>{formatPaise(m.recoveredPaise ?? 0)}</div>
                    </div>
                    <div>
                      <div className="metric-tile-label">Completion Rate</div>
                      <div className="amount-large">{m.recoveryCompletion}%</div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
