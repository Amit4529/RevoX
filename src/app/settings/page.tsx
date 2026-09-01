'use client';

import { useState, useEffect, useCallback } from 'react';
import Sidebar from '@/components/Sidebar';

const POLICY_FIELDS = [
  { key: 'retries.maxRetries',                       label: 'Max Retries (per window)', hint: 'Maximum payment retries before falling back to payment link', type: 'number' },
  { key: 'retries.windowDays',                       label: 'Retry Window (days)',       hint: 'Number of days the retry cap applies over', type: 'number' },
  { key: 'contactLimits.maxTouchesPerWindow',        label: 'Max Contact Touches',       hint: 'Max outbound contact attempts per window', type: 'number' },
  { key: 'contactLimits.windowDays',                 label: 'Contact Window (days)',      hint: 'Days over which the touch limit applies', type: 'number' },
  { key: 'quietHours.startHour',                     label: 'Quiet Hours Start (24h)',    hint: 'Hour (0-23) when outbound comms are blocked', type: 'number' },
  { key: 'quietHours.endHour',                       label: 'Quiet Hours End (24h)',      hint: 'Hour (0-23) when outbound comms resume', type: 'number' },
  { key: 'approvals.highValueThresholdPaise',        label: 'High-Value Threshold (₹)',  hint: 'Cases above this require manual approval (in rupees, stored as paise)', type: 'number', divisor: 100 },
  { key: 'riskScore.blockThreshold',                 label: 'Risk Score Block Threshold', hint: 'Risk score (0.0-1.0) above which recovery is blocked', type: 'number', step: 0.01 },
  { key: 'railSwitch.minimumConsecutiveUpiAutopayFailures', label: 'Rail Switch — Min UPI Failures', hint: 'Consecutive UPI Autopay failures required before proposing rail switch', type: 'number' },
];

function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((o, k) => o?.[k], obj);
}

function setNestedValue(obj: any, path: string, value: any): any {
  const keys = path.split('.');
  const result = { ...obj };
  let cur: any = result;
  for (let i = 0; i < keys.length - 1; i++) {
    cur[keys[i]] = { ...cur[keys[i]] };
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
  return result;
}

export default function SettingsPage() {
  const [policy, setPolicy] = useState<any>(null);
  const [edits, setEdits] = useState<any>({});
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [saveMsg, setSaveMsg] = useState('');
  const [resetStatus, setResetStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [resetMsg, setResetMsg] = useState('');
  const [reconcileStatus, setReconcileStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [reconcileMsg, setReconcileMsg] = useState('');

  const loadPolicy = useCallback(async () => {
    try {
      const res = await fetch('/api/policy');
      if (res.ok) {
        const data = await res.json();
        setPolicy(data.policy);
        setEdits(data.policy?.policyJson ? JSON.parse(data.policy.policyJson) : {});
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadPolicy(); }, [loadPolicy]);

  const savePolicy = async () => {
    setSaveStatus('saving');
    try {
      const res = await fetch('/api/policy', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ policyJson: JSON.stringify(edits) }),
      });
      if (res.ok) {
        setSaveStatus('done');
        setSaveMsg('Policy saved successfully.');
        await loadPolicy();
      } else {
        setSaveStatus('error');
        setSaveMsg('Failed to save policy.');
      }
    } catch (err: any) {
      setSaveStatus('error');
      setSaveMsg(String(err));
    }
  };

  const resetPolicy = async () => {
    setSaveStatus('saving');
    try {
      const res = await fetch('/api/policy', { method: 'POST' });
      if (res.ok) {
        setSaveStatus('done');
        setSaveMsg('Policy reset to defaults.');
        await loadPolicy();
      }
    } catch { setSaveStatus('error'); setSaveMsg('Reset failed.'); }
  };

  const resetData = async () => {
    setResetStatus('running');
    setResetMsg('Resetting and reseeding database…');
    try {
      const res = await fetch('/api/reset', { method: 'POST' });
      if (res.ok) {
        setResetStatus('done');
        setResetMsg('Database reset and reseeded successfully.');
      } else {
        setResetStatus('error');
        setResetMsg('Reset failed.');
      }
    } catch (err: any) {
      setResetStatus('error');
      setResetMsg(String(err));
    }
  };

  const runReconcile = async () => {
    setReconcileStatus('running');
    setReconcileMsg('Running reconciliation engine…');
    try {
      const res = await fetch('/api/reconcile', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setReconcileStatus('done');
        setReconcileMsg(`✓ Created ${data.casesCreated ?? 0} cases in ${data.metrics?.elapsedMs ?? '?'}ms`);
      } else {
        setReconcileStatus('error');
        setReconcileMsg(data.error ?? 'Failed');
      }
    } catch (err: any) {
      setReconcileStatus('error');
      setReconcileMsg(String(err));
    }
  };

  const getFieldValue = (field: typeof POLICY_FIELDS[0]): string => {
    const raw = getNestedValue(edits, field.key);
    if (raw == null) return '';
    if (field.divisor) return String(raw / field.divisor);
    return String(raw);
  };

  const setFieldValue = (field: typeof POLICY_FIELDS[0], value: string) => {
    let parsed: number = parseFloat(value);
    if (isNaN(parsed)) return;
    if (field.divisor) parsed = Math.round(parsed * field.divisor);
    setEdits((prev: any) => setNestedValue(prev, field.key, parsed));
    setSaveStatus('idle');
  };

  const envVars = [
    { label: 'DATABASE_URL',              hint: 'SQLite file path',              configured: true },
    { label: 'RAZORPAY_KEY_ID',           hint: 'rzp_test_xxx',                  configured: false },
    { label: 'RAZORPAY_KEY_SECRET',       hint: 'Razorpay API secret key',       configured: false },
    { label: 'ENABLE_RAZORPAY_TEST_MODE', hint: 'Set to "true" to enable',       configured: false },
    { label: 'APP_BASE_URL',              hint: 'http://localhost:3000',          configured: true },
    { label: 'OPENAI_API_KEY',            hint: 'Optional — enables LLM features', configured: false },
    { label: 'ENABLE_OUTBOUND_CALLS',     hint: 'Set to "true" for Twilio calls', configured: false },
    { label: 'TWILIO_ACCOUNT_SID',        hint: 'Twilio account identifier',     configured: false },
    { label: 'TWILIO_AUTH_TOKEN',         hint: 'Twilio auth token',             configured: false },
    { label: 'TWILIO_FROM_NUMBER',        hint: 'Phone number for Twilio calls', configured: false },
  ];

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-content">
        <div className="page-header">
          <h1 className="page-title">Settings / Demo Control</h1>
          <p className="page-subtitle">Configure policy parameters, view integration status, and manage demo data.</p>
        </div>

        <div className="page-body">
          <div className="two-col" style={{ alignItems: 'start', marginBottom: 20 }}>

            {/* Policy Editor */}
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">Policy Configuration</h2>
                {policy && (
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>v{policy.version}</span>
                )}
              </div>
              <div className="card-body">
                {!policy ? (
                  <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading policy…</div>
                ) : (
                  <>
                    {POLICY_FIELDS.map(field => (
                      <div key={field.key} className="policy-field">
                        <label>{field.label}</label>
                        <input
                          id={`policy-${field.key.replace(/\./g, '-')}`}
                          type="number"
                          className="policy-input"
                          value={getFieldValue(field)}
                          step={field.step ?? 1}
                          onChange={e => setFieldValue(field, e.target.value)}
                        />
                        <span className="policy-field-hint">{field.hint}</span>
                      </div>
                    ))}

                    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                      <button
                        id="btn-save-policy"
                        className="btn btn-primary btn-sm"
                        onClick={savePolicy}
                        disabled={saveStatus === 'saving'}
                      >
                        {saveStatus === 'saving' ? <><span className="spinner" /> Saving…</> : 'Save Policy'}
                      </button>
                      <button
                        id="btn-reset-policy"
                        className="btn btn-ghost btn-sm"
                        onClick={resetPolicy}
                      >
                        Reset to Defaults
                      </button>
                    </div>

                    {saveStatus !== 'idle' && (
                      <div className={`alert ${saveStatus === 'done' ? 'alert-success' : 'alert-danger'}`} style={{ marginTop: 10 }}>
                        {saveMsg}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Demo Controls & Environment */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Demo Actions */}
              <div className="card">
                <div className="card-header"><h2 className="card-title">Demo Actions</h2></div>
                <div className="card-body">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div>
                      <button
                        id="btn-reset-data"
                        className="btn btn-danger"
                        onClick={resetData}
                        disabled={resetStatus === 'running'}
                        style={{ width: '100%', justifyContent: 'center' }}
                      >
                        {resetStatus === 'running' ? <><span className="spinner" /> Resetting…</> : '🔄 Reset & Reseed Database'}
                      </button>
                      {resetStatus !== 'idle' && (
                        <div className={`alert ${resetStatus === 'done' ? 'alert-success' : 'alert-danger'}`} style={{ marginTop: 8 }}>
                          {resetMsg}
                        </div>
                      )}
                    </div>
                    <div>
                      <button
                        id="btn-reconcile"
                        className="btn btn-primary"
                        onClick={runReconcile}
                        disabled={reconcileStatus === 'running'}
                        style={{ width: '100%', justifyContent: 'center' }}
                      >
                        {reconcileStatus === 'running' ? <><span className="spinner" /> Running…</> : '▶ Re-run Reconciliation'}
                      </button>
                      {reconcileStatus !== 'idle' && (
                        <div className={`alert ${reconcileStatus === 'done' ? 'alert-success' : 'alert-danger'}`} style={{ marginTop: 8 }}>
                          {reconcileMsg}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Environment Variables */}
              <div className="card">
                <div className="card-header"><h2 className="card-title">Environment Variables</h2></div>
                <div className="card-body">
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                    Configure these in your <span className="mono">.env</span> file.
                  </div>
                  {envVars.map(v => (
                    <div key={v.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                      <div>
                        <div className="mono" style={{ fontWeight: 600, fontSize: 11.5 }}>{v.label}</div>
                        <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>{v.hint}</div>
                      </div>
                      <span className={`badge ${v.configured ? 'badge-green' : 'chip-inactive'}`} style={{ fontSize: 10, padding: '2px 6px' }}>
                        {v.configured ? 'set' : 'not set'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Policy JSON Preview */}
          {edits && Object.keys(edits).length > 0 && (
            <div className="card">
              <div className="card-header"><h2 className="card-title">Policy JSON (Current)</h2></div>
              <div className="card-body">
                <div className="calc-block" style={{ fontSize: 11.5, maxHeight: 300, overflowY: 'auto' }}>
                  {JSON.stringify(edits, null, 2)}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
