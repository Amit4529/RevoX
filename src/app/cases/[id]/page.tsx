'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Sidebar from '@/components/Sidebar';

function formatPaise(paise: number): string {
  const rupees = Math.floor(Math.abs(paise) / 100);
  const paiseRem = Math.abs(paise) % 100;
  const sign = paise < 0 ? '-' : '';
  return `${sign}₹${new Intl.NumberFormat('en-IN').format(rupees)}.${String(paiseRem).padStart(2, '0')}`;
}

const STATE_BADGE: Record<string, string> = {
  matched:                'badge-matched',
  matched_with_tds:       'badge-matched_with_tds',
  waiting_for_settlement: 'badge-waiting_for_settlement',
  recoverable:            'badge-recoverable',
  finance_review:         'badge-finance_review',
  risk_hold:              'badge-risk_hold',
  promise_to_pay:         'badge-promise_to_pay',
  closed:                 'badge-closed',
};

const STATE_LABEL: Record<string, string> = {
  matched:                'Matched',
  matched_with_tds:       'Matched (TDS)',
  waiting_for_settlement: 'Waiting',
  recoverable:            'Recoverable',
  finance_review:         'Finance Review',
  risk_hold:              'Risk Hold',
  promise_to_pay:         'Promise to Pay',
  closed:                 'Closed',
};

const EDGE_COLORS: Record<string, string> = {
  payment:        '#1D4ED8',
  settlement:     '#059669',
  bank_transaction:'#059669',
  invoice:        '#7C3AED',
  checkout:       '#D97706',
};

export default function CaseFilePage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [reviewAction, setReviewAction] = useState<'approve' | 'reject' | 'override' | ''>('');
  const [reviewReason, setReviewReason] = useState('');
  const [overrideState, setOverrideState] = useState('');
  const [reviewStatus, setReviewStatus] = useState<'idle' | 'submitting' | 'done' | 'error'>('idle');
  const [reviewMsg, setReviewMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/cases/${id}`);
      if (res.ok) setData(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const submitReview = async () => {
    if (!reviewAction || !reviewReason) return;
    setReviewStatus('submitting');
    try {
      const res = await fetch(`/api/cases/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: reviewAction, reason: reviewReason, newCashState: overrideState || undefined }),
      });
      if (res.ok) {
        setReviewStatus('done');
        setReviewMsg('Review submitted and recorded in audit trail.');
        await load();
      } else {
        setReviewStatus('error');
        setReviewMsg('Failed to submit review.');
      }
    } catch {
      setReviewStatus('error');
      setReviewMsg('Network error.');
    }
  };

  if (loading) {
    return (
      <div className="app-shell">
        <Sidebar />
        <div className="main-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span className="spinner" style={{ width: 32, height: 32 }} />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="app-shell">
        <Sidebar />
        <div className="main-content">
          <div className="empty-state">
            <div className="empty-title">Case not found</div>
            <button className="btn btn-secondary" onClick={() => router.push('/queue')}>← Back to Queue</button>
          </div>
        </div>
      </div>
    );
  }

  const allowedActions: string[] = data.allowedActions ?? [];
  const blockedActions: any[] = data.blockedActions ?? [];

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-content">
        <div className="page-header">
          {/* Breadcrumb */}
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
            <Link href="/queue" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Queue</Link>
            {' / '}
            <span style={{ color: 'var(--text-primary)' }}>{data.caseNumber}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
            <div>
              <h1 className="page-title" style={{ marginBottom: 6 }}>{data.caseNumber}</h1>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span className={`badge ${STATE_BADGE[data.cashState] ?? ''}`}>{STATE_LABEL[data.cashState] ?? data.cashState}</span>
                <span className={`badge badge-${data.priority}`}>{data.priority} priority</span>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  Confidence: <strong>{Math.round((data.confidence ?? 0) * 100)}%</strong>
                </span>
              </div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div className="amount-large">{formatPaise(data.outstandingAmountPaise)}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Outstanding</div>
              <Link href={`/recover/${id}`} className="btn btn-primary btn-sm" style={{ marginTop: 8, display: 'inline-flex' }}>
                Recovery Panel →
              </Link>
            </div>
          </div>
        </div>

        <div className="page-body">
          <div className="two-col" style={{ marginBottom: 20 }}>

            {/* Diagnosis Panel */}
            <div className="card">
              <div className="card-header"><h2 className="card-title">Diagnosis</h2></div>
              <div className="card-body">
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Code</div>
                  <div className="mono" style={{ fontSize: 14, fontWeight: 700, marginTop: 3 }}>{data.diagnosisCode}</div>
                </div>
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Explanation</div>
                  <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.6 }}>{data.diagnosisText}</div>
                </div>
                <hr className="divider" style={{ margin: '12px 0' }} />
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Financials</div>
                  {[
                    { label: 'Gross Amount', v: data.grossAmountPaise },
                    { label: 'Expected Net', v: data.expectedNetAmountPaise },
                    { label: 'Observed Bank', v: data.observedBankAmountPaise },
                  ].map(row => (
                    <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>{row.label}</span>
                      <span className="amount">{formatPaise(row.v ?? 0)}</span>
                    </div>
                  ))}
                </div>

                {/* Matching Calculation */}
                {data.reconciliationMatches?.[0] && (
                  <>
                    <hr className="divider" style={{ margin: '12px 0' }} />
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Rule Tier & Calculation</div>
                    <div className="mono" style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginBottom: 6 }}>
                      {data.reconciliationMatches[0].ruleTier?.replace('_', ' ').toUpperCase()} &nbsp;|&nbsp; Score: {(data.reconciliationMatches[0].candidateScore * 100).toFixed(0)}%
                    </div>
                    <div className="calc-block" style={{ fontSize: 11.5 }}>
                      {data.reconciliationMatches[0].mathExplanation || '—'}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Allowed vs Blocked Actions */}
            <div className="card">
              <div className="card-header"><h2 className="card-title">Allowed vs Blocked Actions</h2></div>
              <div className="card-body">
                <div className="action-comparison">
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-matched)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                      ✓ Allowed ({allowedActions.length})
                    </div>
                    <div className="action-list">
                      {allowedActions.length === 0 && (
                        <div style={{ fontSize: 12.5, color: 'var(--text-muted)', fontStyle: 'italic' }}>No actions permitted</div>
                      )}
                      {allowedActions.map((a: string) => (
                        <div key={a} className="action-item action-item-allowed">
                          <span className="action-name">{a}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-risk)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                      ⊘ Blocked ({blockedActions.length})
                    </div>
                    <div className="action-list">
                      {blockedActions.length === 0 && (
                        <div style={{ fontSize: 12.5, color: 'var(--text-muted)', fontStyle: 'italic' }}>No actions blocked</div>
                      )}
                      {blockedActions.map((b: any) => (
                        <div key={b.action} className="action-item action-item-blocked">
                          <div>
                            <div className="action-name">{b.action}</div>
                            {b.reasons?.map((r: string, i: number) => (
                              <div key={i} className="action-reason">{r}</div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Evidence Timeline */}
          {data.evidenceEdges?.length > 0 && (
            <div className="card section-gap" style={{ marginBottom: 20 }}>
              <div className="card-header">
                <h2 className="card-title">Evidence Graph</h2>
                <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{data.evidenceEdges.length} edges</span>
              </div>
              <div className="card-body">
                <div className="evidence-timeline">
                  {data.evidenceEdges.slice(0, 12).map((edge: any, i: number) => (
                    <div key={edge.id ?? i} className="evidence-item">
                      <div className="evidence-dot" style={{ background: EDGE_COLORS[edge.sourceType] ?? '#94A3B8' }} />
                      <div className="evidence-content">
                        <div className="evidence-type">{edge.edgeType?.replace(/_/g, ' ')} &nbsp;|&nbsp; {edge.ruleId}</div>
                        <div className="evidence-ref">
                          {edge.sourceType}/{edge.sourceId?.slice(0, 12)}… → {edge.targetType}/{edge.targetId?.slice(0, 12)}…
                        </div>
                        <div className="evidence-explanation">{edge.explanation}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                          Confidence: {Math.round((edge.confidence ?? 0) * 100)}%
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Risk Signals */}
          {data.riskSignals?.length > 0 && (
            <div className="card" style={{ marginBottom: 20 }}>
              <div className="card-header">
                <h2 className="card-title">Risk Signals</h2>
                <span className="badge badge-red">{data.riskSignals.length} signals</span>
              </div>
              <div className="card-body">
                {data.riskSignals.map((s: any) => (
                  <div key={s.id} style={{ display: 'flex', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                    <span className={`badge badge-${s.severity === 'high' ? 'red' : s.severity === 'medium' ? 'amber' : 'blue'}`}>
                      {s.severity}
                    </span>
                    <div>
                      <div style={{ fontSize: 12.5, fontWeight: 600 }}>{s.signalType?.replace(/_/g, ' ')}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{s.description}</div>
                    </div>
                    {s.score > 0 && (
                      <span className="mono" style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--color-risk)', fontWeight: 600 }}>
                        Score: {s.score.toFixed(2)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Audit Log */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-header">
              <h2 className="card-title">Audit Trail</h2>
              <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{data.auditEvents?.length ?? 0} events</span>
            </div>
            <div className="card-body scroll-y">
              {(!data.auditEvents || data.auditEvents.length === 0) ? (
                <div style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>No audit events yet.</div>
              ) : (
                data.auditEvents.map((e: any) => (
                  <div key={e.id} className="audit-entry">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <span className={`audit-event-type ${e.eventType?.includes('BLOCKED') ? 'badge badge-blocked' : e.eventType?.includes('HUMAN') ? 'badge badge-amber' : 'badge badge-blue'}`} style={{ fontSize: 11 }}>
                        {e.eventType}
                      </span>
                      <span className="audit-meta">{new Date(e.createdAt).toLocaleString('en-IN')}</span>
                    </div>
                    <div className="audit-meta" style={{ marginTop: 4 }}>
                      Actor: <strong>{e.actor}</strong> &nbsp;·&nbsp; Policy: {e.policySnapshot}
                    </div>
                    {e.reasons?.map((r: string, i: number) => (
                      <div key={i} className="audit-reason">{r}</div>
                    ))}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Settlement Q&A Inspector */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-header">
              <h2 className="card-title">Settlement Q&A Inspector</h2>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Ask about any linked settlement</span>
            </div>
            <div className="card-body">
              <SettlementQA caseId={id} />
            </div>
          </div>

          {/* Human Review */}
          <div className="card">
            <div className="card-header"><h2 className="card-title">Human Review</h2></div>
            <div className="card-body">
              {reviewStatus === 'done' ? (
                <div className="alert alert-success">{reviewMsg}</div>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                    {(['approve', 'reject', 'override'] as const).map(a => (
                      <button
                        key={a}
                        id={`btn-review-${a}`}
                        className={`btn btn-sm ${reviewAction === a ? (a === 'reject' ? 'btn-danger' : a === 'approve' ? 'btn-success' : 'btn-primary') : 'btn-ghost'}`}
                        onClick={() => setReviewAction(a)}
                      >
                        {a === 'approve' ? '✓ Approve' : a === 'reject' ? '✗ Reject' : '⟳ Override State'}
                      </button>
                    ))}
                  </div>

                  {reviewAction === 'override' && (
                    <div className="policy-field" style={{ marginBottom: 10 }}>
                      <label>New Cash State</label>
                      <select className="filter-select" value={overrideState} onChange={e => setOverrideState(e.target.value)}>
                        <option value="">Select…</option>
                        {['matched', 'recoverable', 'finance_review', 'closed', 'risk_hold'].map(s => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {reviewAction && (
                    <>
                      <div className="policy-field">
                        <label>Reason (required)</label>
                        <textarea
                          className="input"
                          rows={2}
                          placeholder="Explain the review decision…"
                          value={reviewReason}
                          onChange={e => setReviewReason(e.target.value)}
                        />
                      </div>
                      <button
                        id="btn-submit-review"
                        className="btn btn-primary btn-sm"
                        onClick={submitReview}
                        disabled={!reviewReason || reviewStatus === 'submitting'}
                      >
                        {reviewStatus === 'submitting' ? <><span className="spinner" /> Submitting…</> : 'Submit Review'}
                      </button>
                      {reviewStatus === 'error' && <div className="alert alert-danger" style={{ marginTop: 8 }}>{reviewMsg}</div>}
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- Settlement Q&A Component ----
function SettlementQA({ caseId }: { caseId: string }) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const ask = async () => {
    if (!question.trim()) return;
    setLoading(true);
    setAnswer(null);
    try {
      const res = await fetch('/api/settlement-qa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, caseId }),
      });
      const data = await res.json();
      setAnswer(data);
    } catch {
      setAnswer({ error: 'Failed to get answer' });
    }
    setLoading(false);
  };

  const copyExplanation = () => {
    if (answer?.answer) {
      navigator.clipboard.writeText(answer.answer);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input
          id="settlement-qa-input"
          className="input"
          style={{ flex: 1, height: 36 }}
          placeholder="e.g. Why did settlement set_883 differ by ₹340?"
          value={question}
          onChange={e => setQuestion(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && ask()}
        />
        <button
          id="btn-settlement-qa"
          className="btn btn-primary btn-sm"
          onClick={ask}
          disabled={loading || !question.trim()}
        >
          {loading ? <><span className="spinner" /> Analyzing…</> : 'Ask'}
        </button>
      </div>

      {answer && !answer.error && (
        <div>
          {/* Status badge */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
            <span className={`badge ${answer.reconciliationStatus === 'reconciled' ? 'badge-green' : answer.reconciliationStatus === 'finance_review' ? 'badge-red' : 'badge-amber'}`}>
              {answer.reconciliationStatus}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Confidence: {Math.round((answer.confidence ?? 0) * 100)}%
            </span>
            {answer.llmUsed !== undefined && (
              <span className={`chip ${answer.llmUsed ? 'chip-voice' : 'chip-demo'}`} style={{ fontSize: 9, padding: '1px 6px' }}>
                {answer.llmUsed ? 'LLM' : 'DETERMINISTIC'}
              </span>
            )}
          </div>

          {/* Answer text */}
          <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.65, marginBottom: 12 }}>
            {answer.answer}
          </div>

          {/* Calculation block */}
          <div className="calc-block" style={{ marginBottom: 12, fontSize: 12 }}>
            <div>Gross:       {formatPaise(answer.grossPaise)}</div>
            {answer.deductionLines?.map((d: any, i: number) => (
              <div key={i}>  − {d.label}: {formatPaise(d.amountPaise)}</div>
            ))}
            <div style={{ borderTop: '1px solid var(--border)', marginTop: 4, paddingTop: 4 }}>
              Net:         {formatPaise(answer.netPaise)}
            </div>
            <div>Bank credit: {formatPaise(answer.bankCreditPaise)}</div>
            <div style={{ fontWeight: 700, color: Math.abs(answer.residualPaise) < 100 ? 'var(--color-matched)' : 'var(--color-risk)' }}>
              Residual:    {formatPaise(answer.residualPaise)}
            </div>
          </div>

          {/* Evidence chips */}
          {answer.evidenceRefs?.length > 0 && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
              {answer.evidenceRefs.map((ref: string) => (
                <span key={ref} className="badge badge-blue" style={{ fontSize: 10 }}>{ref}</span>
              ))}
              {answer.ruleIds?.map((r: string) => (
                <span key={r} className="badge badge-matched" style={{ fontSize: 10 }}>{r}</span>
              ))}
            </div>
          )}

          {/* Unknowns */}
          {answer.unknowns?.length > 0 && (
            <div className="what-would-change" style={{ marginBottom: 10 }}>
              <strong>Unknowns / Finance review required:</strong>
              {answer.unknowns.map((u: string, i: number) => <div key={i}>• {u}</div>)}
            </div>
          )}

          {/* Copy button */}
          <button className="btn btn-ghost btn-sm" onClick={copyExplanation}>
            {copied ? '✓ Copied' : '📋 Copy Explanation'}
          </button>
        </div>
      )}

      {answer?.error && (
        <div className="alert alert-danger">{answer.error}</div>
      )}
    </div>
  );
}

