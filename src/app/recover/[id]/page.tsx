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

export default function RecoveryPanel() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const [caseData, setCaseData] = useState<any>(null);
  const [plan, setPlan] = useState<any>(null);
  const [scores, setScores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [execResult, setExecResult] = useState<any>(null);

  // PTP form
  const [ptpAmountRs, setPtpAmountRs] = useState('');
  const [ptpDate, setPtpDate] = useState('');
  const [ptpTranscript, setPtpTranscript] = useState('');
  const [ptpStatus, setPtpStatus] = useState<'idle' | 'submitting' | 'done' | 'error'>('idle');
  const [ptpMsg, setPtpMsg] = useState('');

  // Voice
  const [voiceRunning, setVoiceRunning] = useState(false);
  const [voiceStarting, setVoiceStarting] = useState(false);
  const [voiceCallData, setVoiceCallData] = useState<any>(null);
  const [voiceResponseSubmitting, setVoiceResponseSubmitting] = useState(false);
  const [voiceResponseResult, setVoiceResponseResult] = useState<any>(null);


  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, p] = await Promise.all([
        fetch(`/api/cases/${id}`).then(r => r.json()),
        fetch(`/api/playbook?caseId=${id}`).then(r => r.json()),
      ]);
      setCaseData(c);
      setPlan(p.plan);

      // Get scored actions
      if (c.allowedActions?.length > 0) {
        const scoresRes = await fetch(`/api/actions?caseId=${id}`);
        if (scoresRes.ok) {
          const scoresData = await scoresRes.json();
          setScores(scoresData.scores ?? []);
        }
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh every 10 seconds — silent (no loading spinner)
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const [c, p] = await Promise.all([
          fetch(`/api/cases/${id}`).then(r => r.json()),
          fetch(`/api/playbook?caseId=${id}`).then(r => r.json()),
        ]);
        setCaseData(c);
        setPlan(p.plan);
        if (c.allowedActions?.length > 0) {
          const scoresRes = await fetch(`/api/actions?caseId=${id}`);
          if (scoresRes.ok) {
            const scoresData = await scoresRes.json();
            setScores(scoresData.scores ?? []);
          }
        }
      } catch { /* silent */ }
    }, 10000);
    return () => clearInterval(interval);
  }, [id]);

  const executeAction = async (actionType: string) => {
    setExecuting(true);
    setExecResult(null);
    try {
      const res = await fetch('/api/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caseId: id, action: actionType }),
      });
      const data = await res.json();
      setExecResult({ ...data, _status: res.status });
      // Refresh
      await load();
    } catch (err: any) {
      setExecResult({ success: false, explanation: String(err) });
    }
    setExecuting(false);
  };

  const runNextPlaybookStep = async () => {
    setExecuting(true);
    setExecResult(null);
    try {
      const res = await fetch('/api/playbook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caseId: id }),
      });
      const data = await res.json();
      setExecResult({ ...data, _status: res.status });
      await load();
    } catch (err: any) {
      setExecResult({ success: false, explanation: String(err) });
    }
    setExecuting(false);
  };

  const submitPTP = async () => {
    if (!ptpAmountRs || !ptpDate || !caseData?.id) return;
    setPtpStatus('submitting');
    try {
      const customerId = (() => {
        const refs: string[] = caseData.evidenceRefs ?? [];
        return refs[0] ?? '';
      })();

      const res = await fetch('/api/ptp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'capture',
          recoveryCaseId: id,
          customerId,
          amountPaise: Math.round(parseFloat(ptpAmountRs) * 100),
          promisedDate: ptpDate,
          source: 'browser_demo',
          transcript: ptpTranscript || undefined,
        }),
      });
      if (res.ok) {
        setPtpStatus('done');
        setPtpMsg('PTP captured and state machine started.');
        await load();
      } else {
        const err = await res.json();
        setPtpStatus('error');
        setPtpMsg(err.error ?? 'Failed to capture PTP');
      }
    } catch (err: any) {
      setPtpStatus('error');
      setPtpMsg(String(err));
    }
  };

  const speakScript = () => {
    if (!caseData) return;
    setVoiceRunning(true);
    const amount = formatPaise(caseData.outstandingAmountPaise);
    const script = voiceCallData?.script ||
      `Namaste, main CIC Demo Merchant ki payment assistance team se bol raha hoon. Aapke ${caseData.caseNumber} ke liye ${amount} ka payment abhi pending dikh raha hai. Payment link ke liye 1 dabaiye, Friday tak payment ka promise dene ke liye 2, support ke liye 3, aur future calls band karne ke liye 9.`;
    const utt = new SpeechSynthesisUtterance(script);
    utt.lang = 'hi-IN';
    utt.rate = 0.9;
    utt.onend = () => setVoiceRunning(false);
    utt.onerror = () => setVoiceRunning(false);
    window.speechSynthesis.speak(utt);
  };

  const stopVoice = () => {
    window.speechSynthesis.cancel();
    setVoiceRunning(false);
  };

  const startVoiceCall = async () => {
    setVoiceStarting(true);
    setVoiceCallData(null);
    setVoiceResponseResult(null);
    try {
      const res = await fetch('/api/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', caseId: id }),
      });
      const data = await res.json();
      setVoiceCallData(data);
      if (data.success) {
        // Auto-play the script in browser mode
        if (data.simulated) {
          speakScript();
        }
      }
    } catch (err: any) {
      setVoiceCallData({ success: false, error: String(err) });
    }
    setVoiceStarting(false);
  };

  const submitVoiceResponse = async (response: 'pay_now' | 'promise_friday' | 'need_help' | 'opt_out' | 'no_answer') => {
    if (!voiceCallData?.callId) return;
    setVoiceResponseSubmitting(true);
    try {
      const res = await fetch('/api/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'respond',
          caseId: id,
          callId: voiceCallData.callId,
          response,
          transcript: response === 'promise_friday' ? 'Main Friday ko pay kar dunga' : undefined,
        }),
      });
      const data = await res.json();
      setVoiceResponseResult(data);
      await load();
    } catch (err: any) {
      setVoiceResponseResult({ success: false, message: String(err) });
    }
    setVoiceResponseSubmitting(false);
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

  const allowedActions: string[] = caseData?.allowedActions ?? [];
  const maxScore = scores.length > 0 ? Math.max(...scores.map((s: any) => s.expectedNetRecoveryPaise)) : 1;

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-content">
        <div className="page-header">
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
            <Link href="/queue" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Queue</Link>
            {' / '}
            <Link href={`/cases/${id}`} style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>{caseData?.caseNumber}</Link>
            {' / '}
            <span style={{ color: 'var(--text-primary)' }}>Recovery Panel</span>
          </div>
          <h1 className="page-title">Recovery & Outcome — {caseData?.caseNumber}</h1>
          <p className="page-subtitle">
            Execute recovery actions, run playbook steps, capture a Promise-to-Pay, or simulate a voice call.
            &nbsp;Outstanding: <strong>{formatPaise(caseData?.outstandingAmountPaise ?? 0)}</strong>
          </p>
        </div>

        <div className="page-body">

          {/* Active Promise-to-Pay Banner */}
          {caseData?.promiseToPays?.some((p: any) => p.state === 'active') && (
            <div style={{
              marginBottom: 20,
              padding: 16,
              background: 'rgba(8, 145, 178, 0.08)',
              border: '1px solid rgba(8, 145, 178, 0.3)',
              borderRadius: 8,
              display: 'flex',
              gap: 16,
              alignItems: 'center'
            }}>
              <div style={{ fontSize: 28 }}>🤝</div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#0891B2', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Active Promise-to-Pay (PTP) On File
                  </span>
                  <span className="badge badge-blue">Dunning Paused</span>
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--text-primary)', lineHeight: 1.5 }}>
                  Customer committed to pay <strong>{formatPaise(caseData.promiseToPays.find((p: any) => p.state === 'active')?.amountPaise || caseData.outstandingAmountPaise)}</strong> by <strong>{new Date(caseData.promiseToPays.find((p: any) => p.state === 'active')?.promisedDate).toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' })}</strong> (via {caseData.promiseToPays.find((p: any) => p.state === 'active')?.source}).
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 4 }}>
                  ⏱ <strong>Automated Agent Policy:</strong> All automated reminders and calls are paused. If payment is not received by the promised date (+ 1 day grace), the recovery agent will automatically trigger follow-up at the escalation stage.
                </div>
              </div>
            </div>
          )}

          {/* Execution Result */}
          {execResult && (
            <div className={`alert ${execResult.success ? 'alert-success' : execResult._status === 403 ? 'alert-warning' : 'alert-danger'}`} style={{ marginBottom: 20 }}>
              <div>
                <strong>{execResult.success ? '✓ Action executed' : execResult._status === 403 ? '⊘ Blocked by Firewall' : '✗ Failed'}</strong>
                <div style={{ marginTop: 4, whiteSpace: 'pre-line' }}>{execResult.explanation}</div>
                {execResult.receipt && (
                  <div className="receipt-block" style={{ marginTop: 8 }}>
                    Receipt: {execResult.receipt}
                    {execResult.playbookUsed && `\nPlaybook: ${execResult.playbookUsed}`}
                    {execResult.nextStep && `\nNext step: ${execResult.nextStep}`}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="two-col" style={{ marginBottom: 20 }}>

            {/* Playbook Plan */}
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">Playbook Plan</h2>
                {plan && (
                  <span style={{ fontSize: 11.5, color: 'var(--text-secondary)', fontWeight: 500 }}>
                    {plan.playbookLabel}
                  </span>
                )}
              </div>
              <div className="card-body">
                {!plan || plan.playbookId === 'none' ? (
                  <div className="empty-state" style={{ padding: 20 }}>
                    <div className="empty-icon">⊘</div>
                    <div className="empty-desc">No automated playbook for this case. Manual review required.</div>
                  </div>
                ) : (
                  <>
                    <div className="playbook-steps">
                      {plan.steps.map((step: any, i: number) => {
                        const isCurrent = i === plan.currentStepIndex;
                        const isDone = i < plan.currentStepIndex;
                        return (
                          <div key={step.stepNumber} className="playbook-step">
                            <div className={`step-number ${isCurrent ? 'current' : isDone ? 'done' : ''}`}>
                              {isDone ? '✓' : step.stepNumber}
                            </div>
                            <div className="step-content">
                              <div className="step-action">{step.action}</div>
                              <div className="step-description">{step.description}</div>
                              {!step.isAllowed && step.blockedReason && (
                                <div className="step-blocked">⊘ {step.blockedReason}</div>
                              )}
                              {step.waitCondition && (
                                <div style={{ fontSize: 11, color: 'var(--color-waiting)', marginTop: 4 }}>
                                  ⏱ {step.waitCondition}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <button
                      id="btn-run-playbook"
                      className="btn btn-primary"
                      style={{ marginTop: 16, width: '100%' }}
                      onClick={runNextPlaybookStep}
                      disabled={executing || plan.isComplete}
                    >
                      {executing ? <><span className="spinner" /> Executing…</> : plan.isComplete ? 'Playbook Complete' : '▶ Run Next Step'}
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Scored Actions */}
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">Action Scores (Ranked)</h2>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Expected net recovery, paise-integer</span>
              </div>
              <div className="card-body">
                {scores.length === 0 && allowedActions.length === 0 ? (
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    No actions permitted by firewall for this case.
                  </div>
                ) : scores.length === 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {allowedActions.map((a: string) => (
                      <button
                        key={a}
                        id={`btn-action-${a}`}
                        className="btn btn-secondary btn-sm"
                        onClick={() => executeAction(a)}
                        disabled={executing}
                        style={{ justifyContent: 'flex-start' }}
                      >
                        <span className="mono">{a}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div>
                    {scores.map((s: any) => (
                      <div key={s.action} className="score-row">
                        <div className="score-action">{s.action}</div>
                        <div className="score-bar-track">
                          <div
                            className="score-bar-fill"
                            style={{ width: `${Math.min(100, (s.expectedNetRecoveryPaise / maxScore) * 100).toFixed(1)}%` }}
                          />
                        </div>
                        <div className="score-value">{formatPaise(s.expectedNetRecoveryPaise)}</div>
                        <button
                          id={`btn-action-${s.action}`}
                          className="btn btn-secondary btn-sm"
                          onClick={() => executeAction(s.action)}
                          disabled={executing}
                        >
                          Execute
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Recent Actions */}
                {caseData?.recoveryActions?.length > 0 && (
                  <>
                    <hr className="divider" />
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                      Executed Actions
                    </div>
                    {caseData.recoveryActions.map((a: any) => {
                      // Extract payment link URL from receipt
                      let linkUrl = '';
                      let linkId = '';
                      if (a.actionType === 'payment_link' && a.executionReceipt) {
                        try {
                          const receiptStr = typeof a.executionReceipt === 'string' ? a.executionReceipt : JSON.stringify(a.executionReceipt);
                          const receiptData = JSON.parse(receiptStr);
                          linkUrl = receiptData.linkUrl || '';
                          linkId = receiptData.linkId || '';
                        } catch {
                          // Try to extract URL from string
                          const urlMatch = String(a.executionReceipt).match(/https?:\/\/[^\s"]+/);
                          if (urlMatch) linkUrl = urlMatch[0];
                        }
                      }

                      return (
                        <div key={a.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)', fontSize: 12.5 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                            <span className="mono" style={{ fontWeight: 600 }}>{a.actionType}</span>
                            <span className={`badge ${a.status === 'completed' ? 'badge-green' : 'badge-amber'}`}>{a.status}</span>
                          </div>

                          {/* Show clickable payment link */}
                          {linkUrl && (
                            <div style={{ margin: '8px 0', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                              <a
                                href={linkUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn btn-primary btn-sm"
                                style={{ fontSize: 11, padding: '6px 14px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                              >
                                🔗 Open Payment Link
                              </a>
                              <span style={{ fontSize: 10.5, color: 'var(--text-muted)', alignSelf: 'center' }}>
                                {linkUrl}
                              </span>
                            </div>
                          )}

                          {a.executionReceipt && !linkUrl && (
                            <div className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                              Receipt: {typeof a.executionReceipt === 'object' ? JSON.stringify(a.executionReceipt) : a.executionReceipt}
                            </div>
                          )}
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            {new Date(a.createdAt).toLocaleString('en-IN')}
                          </div>
                        </div>
                      );
                    })}

                    {/* Simulate Payment Button — show when there's a payment_link action and case isn't closed */}
                    {caseData.recoveryActions.some((a: any) => a.actionType === 'payment_link') && caseData.cashState !== 'closed' && (
                      <div style={{ marginTop: 12, padding: 12, background: 'rgba(5, 150, 105, 0.08)', borderRadius: 8, border: '1px solid rgba(5, 150, 105, 0.2)' }}>
                        <div style={{ fontSize: 11, color: '#059669', fontWeight: 600, marginBottom: 6 }}>
                          💰 DEMO: Simulate Customer Payment
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
                          Click below to simulate the customer completing payment. This triggers the same flow as a real Razorpay webhook.
                        </div>
                        <button
                          id="btn-simulate-payment"
                          className="btn btn-sm"
                          style={{
                            background: 'linear-gradient(135deg, #059669, #10B981)',
                            color: 'white',
                            border: 'none',
                            padding: '8px 20px',
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                          onClick={async () => {
                            try {
                              const res = await fetch('/api/simulate-payment', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ caseId: id }),
                              });
                              const data = await res.json();
                              if (data.success) {
                                alert(`✅ ${data.message}`);
                                load(); // Refresh data
                              } else {
                                alert(`❌ ${data.error}`);
                              }
                            } catch (err) {
                              alert(`❌ Failed: ${err}`);
                            }
                          }}
                        >
                          ✅ Simulate Payment Received ({formatPaise(caseData.outstandingAmountPaise)})
                        </button>
                      </div>
                    )}

                    {/* Show recovery success when closed */}
                    {caseData.cashState === 'closed' && caseData.recoveryActions.some((a: any) => a.actionType === 'payment_link') && (
                      <div style={{ marginTop: 12, padding: 12, background: 'rgba(5, 150, 105, 0.12)', borderRadius: 8, border: '1px solid rgba(5, 150, 105, 0.3)', textAlign: 'center' }}>
                        <div style={{ fontSize: 18, marginBottom: 4 }}>🎉</div>
                        <div style={{ fontSize: 13, color: '#059669', fontWeight: 700 }}>Recovery Completed</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                          Payment received. Case {caseData.caseNumber} has been resolved and closed.
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Promise-to-Pay */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-header">
              <h2 className="card-title">Promise-to-Pay Capture</h2>
              {caseData?.promiseToPays?.length > 0 && (
                <span className="badge badge-blue">{caseData.promiseToPays.length} PTP(s) on file</span>
              )}
            </div>
            <div className="card-body">
              {/* Existing PTPs */}
              {caseData?.promiseToPays?.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  {caseData.promiseToPays.map((ptp: any) => (
                    <div key={ptp.id} style={{ display: 'flex', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
                      <span className={`badge ${ptp.state === 'active' ? 'badge-blue' : ptp.state === 'kept' ? 'badge-green' : 'badge-red'}`}>{ptp.state}</span>
                      <span className="amount">{formatPaise(ptp.amountPaise)}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>by {new Date(ptp.promisedDate).toLocaleDateString('en-IN')}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>via {ptp.source}</span>
                    </div>
                  ))}
                </div>
              )}

              {ptpStatus === 'done' ? (
                <div className="alert alert-success">{ptpMsg}</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="policy-field">
                    <label>Amount (₹)</label>
                    <input
                      type="number"
                      className="policy-input"
                      placeholder={`${(caseData?.outstandingAmountPaise ?? 0) / 100}`}
                      value={ptpAmountRs}
                      onChange={e => setPtpAmountRs(e.target.value)}
                    />
                  </div>
                  <div className="policy-field">
                    <label>Promised Date</label>
                    <input
                      type="date"
                      className="policy-input"
                      value={ptpDate}
                      onChange={e => setPtpDate(e.target.value)}
                      min={new Date().toISOString().split('T')[0]}
                    />
                  </div>
                  <div className="policy-field" style={{ gridColumn: '1/-1' }}>
                    <label>Transcript / Customer Statement (optional)</label>
                    <textarea
                      className="input"
                      rows={2}
                      placeholder="e.g. Customer said: will pay by next Friday"
                      value={ptpTranscript}
                      onChange={e => setPtpTranscript(e.target.value)}
                    />
                  </div>
                  <div style={{ gridColumn: '1/-1', display: 'flex', gap: 8 }}>
                    <button
                      id="btn-capture-ptp"
                      className="btn btn-primary btn-sm"
                      onClick={submitPTP}
                      disabled={!ptpAmountRs || !ptpDate || ptpStatus === 'submitting'}
                    >
                      {ptpStatus === 'submitting' ? <><span className="spinner" /> Capturing…</> : 'Capture PTP'}
                    </button>
                    {ptpStatus === 'error' && <div className="alert alert-danger" style={{ margin: 0, padding: '5px 10px' }}>{ptpMsg}</div>}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Voice Call Recovery */}
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Hinglish Voice Recovery</h2>
              <span className="chip chip-voice" style={{ fontSize: 10, padding: '2px 8px' }}>
                <span className="chip-dot" style={{ background: '#c084fc' }} />
                {voiceCallData?.provider === 'twilio' ? 'TWILIO TEST CALL' : 'BROWSER VOICE'}
              </span>
            </div>
            <div className="card-body">
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
                Voice recovery using approved Hinglish script. Creates real audit events and state transitions.
                {voiceCallData?.simulated && ' Using browser SpeechSynthesis. Set ENABLE_OUTBOUND_CALLS=true for Twilio.'}
              </div>

              {/* Script preview */}
              <div className="receipt-block" style={{ marginBottom: 14, fontSize: 12, whiteSpace: 'pre-wrap' }}>
                {voiceCallData?.script || `"Namaste, main CIC Demo Merchant ki payment assistance team se bol raha hoon. Aapke ${caseData?.caseNumber} ke liye ${formatPaise(caseData?.outstandingAmountPaise ?? 0)} ka payment abhi pending dikh raha hai. Payment link ke liye 1, Friday tak promise ke liye 2, support ke liye 3, aur calls band karne ke liye 9."`}
              </div>

              {/* Start / Play controls */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <button
                  id="btn-voice-start"
                  className="btn btn-primary btn-sm"
                  onClick={startVoiceCall}
                  disabled={voiceRunning || voiceStarting}
                >
                  {voiceStarting ? <><span className="spinner" /> Starting…</> : voiceRunning ? '📞 Call Active' : '📞 Start Voice Call'}
                </button>
                <button
                  id="btn-voice-play"
                  className="btn btn-ghost btn-sm"
                  onClick={speakScript}
                  disabled={voiceRunning || !voiceCallData}
                >
                  🔊 Play Script (Browser)
                </button>
                {voiceRunning && (
                  <button id="btn-voice-stop" className="btn btn-danger btn-sm" onClick={stopVoice}>
                    ⏹ Stop
                  </button>
                )}
              </div>

              {/* Voice call result */}
              {voiceCallData && (
                <div className="alert alert-success" style={{ marginBottom: 12 }}>
                  <strong>Call initiated:</strong> {voiceCallData.callId}
                  {voiceCallData.simulated && ' (Simulated)'}
                </div>
              )}

              {/* Response selector */}
              {voiceCallData && !voiceResponseResult && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                    Simulate Customer Response
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {[
                      { key: 'pay_now', label: '1 — Pay Now (send link)', color: 'btn-success' },
                      { key: 'promise_friday', label: '2 — Promise Friday (PTP)', color: 'btn-primary' },
                      { key: 'need_help', label: '3 — Need Help (support)', color: 'btn-secondary' },
                      { key: 'opt_out', label: '9 — Opt Out (stop calls)', color: 'btn-danger' },
                      { key: 'no_answer', label: '∅ — No Answer', color: 'btn-ghost' },
                    ].map(r => (
                      <button
                        key={r.key}
                        id={`btn-voice-${r.key}`}
                        className={`btn btn-sm ${r.color}`}
                        onClick={() => submitVoiceResponse(r.key as any)}
                        disabled={voiceResponseSubmitting}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Response result */}
              {voiceResponseResult && (
                <div className="alert alert-success" style={{ marginTop: 12 }}>
                  <strong>✓ Response processed:</strong> {voiceResponseResult.message}
                  {voiceResponseResult.ptpProposed && (
                    <div style={{ marginTop: 6 }}>
                      <strong>PTP proposed for: {voiceResponseResult.ptpDate}</strong>
                      <br />Confirm in the Promise-to-Pay section above to persist.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

