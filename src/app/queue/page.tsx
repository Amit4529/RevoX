'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';

function formatPaise(paise: number): string {
  const rupees = Math.floor(Math.abs(paise) / 100);
  const paiseRem = Math.abs(paise) % 100;
  const sign = paise < 0 ? '-' : '';
  return `${sign}₹${new Intl.NumberFormat('en-IN').format(rupees)}.${String(paiseRem).padStart(2, '0')}`;
}

const STATE_OPTIONS = [
  { value: '', label: 'All States' },
  { value: 'recoverable',            label: 'Recoverable' },
  { value: 'matched',                label: 'Matched' },
  { value: 'matched_with_tds',       label: 'Matched (TDS)' },
  { value: 'waiting_for_settlement', label: 'Waiting for Settlement' },
  { value: 'finance_review',         label: 'Finance Review' },
  { value: 'risk_hold',              label: 'Risk Hold' },
  { value: 'promise_to_pay',         label: 'Promise to Pay' },
  { value: 'closed',                 label: 'Closed' },
];

const PRIORITY_OPTIONS = [
  { value: '', label: 'All Priorities' },
  { value: 'critical', label: 'Critical' },
  { value: 'high',     label: 'High' },
  { value: 'medium',   label: 'Medium' },
  { value: 'low',      label: 'Low' },
];

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

const STATE_LABEL: Record<string, string> = {
  matched:               'Matched',
  matched_with_tds:      'Matched (TDS)',
  waiting_for_settlement:'Waiting',
  recoverable:           'Recoverable',
  finance_review:        'Fin. Review',
  risk_hold:             'Risk Hold',
  promise_to_pay:        'PTP',
  closed:                'Closed',
};

const SAFE_STATES = new Set(['recoverable', 'promise_to_pay']);

export default function QueuePage() {
  const router = useRouter();
  const [cases, setCases] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [stateFilter, setStateFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [safeOnly, setSafeOnly] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (stateFilter) params.set('cashState', stateFilter);
      if (priorityFilter) params.set('priority', priorityFilter);
      const data = await fetch(`/api/cases?${params}`).then(r => r.json());
      let rows = data.cases ?? [];
      if (safeOnly) rows = rows.filter((c: any) => SAFE_STATES.has(c.cashState));
      setCases(rows);
      setTotal(data.total ?? rows.length);
    } catch { /* ignore */ }
    setLoading(false);
  }, [stateFilter, priorityFilter, safeOnly]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-content">
        <div className="page-header">
          <h1 className="page-title">Cash Integrity Queue</h1>
          <p className="page-subtitle">Prioritized cases sorted by outstanding amount. Click any row to open the Evidence Case File.</p>
        </div>

        <div className="page-body">
          {/* Filters */}
          <div className="filters-bar">
            <select
              id="filter-state"
              className="filter-select"
              value={stateFilter}
              onChange={e => setStateFilter(e.target.value)}
            >
              {STATE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>

            <select
              id="filter-priority"
              className="filter-select"
              value={priorityFilter}
              onChange={e => setPriorityFilter(e.target.value)}
            >
              {PRIORITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>

            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {loading ? 'Loading…' : `${cases.length} of ${total} cases`}
            </span>

            <div className="toggle-row">
              <input
                type="checkbox"
                id="toggle-safe"
                className="toggle"
                checked={safeOnly}
                onChange={e => setSafeOnly(e.target.checked)}
              />
              <label htmlFor="toggle-safe" className="toggle-label">Safe actions only</label>
            </div>
          </div>

          {/* Table */}
          <div className="card">
            {loading ? (
              <div className="empty-state">
                <span className="spinner" style={{ width: 24, height: 24 }} />
              </div>
            ) : cases.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">≡</div>
                <div className="empty-title">No cases found</div>
                <div className="empty-desc">Run the reconciliation engine from the Command Center to populate the queue.</div>
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Case #</th>
                    <th>State</th>
                    <th>Priority</th>
                    <th style={{ textAlign: 'right' }}>Outstanding</th>
                    <th>Diagnosis</th>
                    <th>Next Best Action</th>
                    <th>Confidence</th>
                    <th>Blocked</th>
                  </tr>
                </thead>
                <tbody>
                  {cases.map((c: any) => {
                    const allowed: string[] = Array.isArray(c.allowedActions) ? c.allowedActions : [];
                    const blocked: any[] = Array.isArray(c.blockedActions) ? c.blockedActions : [];
                    const nextAction = allowed[0];
                    const isBlocked = allowed.length === 0;

                    return (
                      <tr
                        key={c.id}
                        onClick={() => router.push(`/cases/${c.id}`)}
                        title="Click to open Evidence Case File"
                      >
                        <td>
                          <span className="mono" style={{ fontWeight: 600 }}>{c.caseNumber}</span>
                        </td>
                        <td>
                          <span className={`badge ${STATE_BADGE[c.cashState] ?? ''}`}>
                            {STATE_LABEL[c.cashState] ?? c.cashState}
                          </span>
                        </td>
                        <td>
                          <span className={`badge badge-${c.priority}`}>{c.priority}</span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <span className="amount">{formatPaise(c.outstandingAmountPaise)}</span>
                        </td>
                        <td>
                          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                            {c.diagnosisCode?.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td>
                          {nextAction ? (
                            <span className="mono" style={{ fontSize: 12, color: '#1D4ED8', fontWeight: 600 }}>
                              {nextAction}
                            </span>
                          ) : (
                            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>—</span>
                          )}
                        </td>
                        <td>
                          <div className="confidence-bar">
                            <div className="confidence-track">
                              <div
                                className="confidence-fill"
                                style={{ width: `${Math.round((c.confidence ?? 0) * 100)}%` }}
                              />
                            </div>
                            <span className="confidence-label">{Math.round((c.confidence ?? 0) * 100)}%</span>
                          </div>
                        </td>
                        <td>
                          {isBlocked && blocked.length > 0 ? (
                            <span className="badge badge-blocked">
                              ⊘ {blocked.length} blocked
                            </span>
                          ) : (
                            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
