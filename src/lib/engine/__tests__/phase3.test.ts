// ============================================
// Phase 3 Verification & Safety Constraint Tests
// ============================================

import assert from 'node:assert';
import { evaluateAction, DEFAULT_POLICY } from '../firewall';
import { scoreAction, scoreAndRankActions } from '../scorer';
import { DIAGNOSIS_TAXONOMY, getDiagnosis, getRecommendedPlaybook } from '../diagnosis';
import { selectPlaybook } from '../playbooks';

console.log('🧪 Starting Phase 3 Engine & Safety Verification Tests...\n');

let passed = 0;
let total = 0;

function test(name: string, fn: () => void) {
  total++;
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     ${err.message}`);
  }
}

// -------------------------------------------------------------
// 1. DO NOT RECOVER FIREWALL TESTS
// -------------------------------------------------------------
console.log('--- 1. Firewall Gate Enforcement ---');

test('Cash State Gate: blocks recovery on waiting_for_settlement or finance_review', () => {
  const result1 = evaluateAction({
    caseId: 'test-1',
    cashState: 'waiting_for_settlement',
    diagnosisCode: 'pending_settlement',
    action: 'payment_link',
    outstandingAmountPaise: 100000,
    policy: DEFAULT_POLICY,
  });
  assert.strictEqual(result1.allowed, false);
  assert.ok(result1.gatesFailed.some(g => g.gateId === 'GATE_CASH_STATE'));

  const result2 = evaluateAction({
    caseId: 'test-2',
    cashState: 'finance_review',
    diagnosisCode: 'unknown_fee_short_settlement',
    action: 'retry_payment',
    outstandingAmountPaise: 100000,
    policy: DEFAULT_POLICY,
  });
  assert.strictEqual(result2.allowed, false);
});

test('Refund Gate: blocks recovery when payment is refunded', () => {
  const result = evaluateAction({
    caseId: 'test-3',
    cashState: 'recoverable',
    diagnosisCode: 'refund_issued',
    action: 'payment_link',
    outstandingAmountPaise: 100000,
    hasRefund: true,
    policy: DEFAULT_POLICY,
  });
  assert.strictEqual(result.allowed, false);
  assert.ok(result.gatesFailed.some(g => g.gateId === 'GATE_REFUND'));
});

test('Dispute Gate: blocks recovery when dispute is active', () => {
  const result = evaluateAction({
    caseId: 'test-4',
    cashState: 'recoverable',
    diagnosisCode: 'dispute_chargeback',
    action: 'payment_link',
    outstandingAmountPaise: 100000,
    hasDispute: true,
    policy: DEFAULT_POLICY,
  });
  assert.strictEqual(result.allowed, false);
  assert.ok(result.gatesFailed.some(g => g.gateId === 'GATE_DISPUTE'));
});

test('Opt-Out Gate: blocks contact if customer opted out', () => {
  const result = evaluateAction({
    caseId: 'test-5',
    cashState: 'recoverable',
    diagnosisCode: 'checkout_abandonment_high_intent',
    action: 'reminder_sms',
    outstandingAmountPaise: 50000,
    customerOptedOut: true,
    policy: DEFAULT_POLICY,
  });
  assert.strictEqual(result.allowed, false);
  assert.ok(result.gatesFailed.some(g => g.gateId === 'GATE_OPT_OUT'));
});

test('WhatsApp Consent Gate: blocks WhatsApp without explicit consent', () => {
  const result = evaluateAction({
    caseId: 'test-6',
    cashState: 'recoverable',
    diagnosisCode: 'checkout_abandonment_high_intent',
    action: 'reminder_whatsapp',
    outstandingAmountPaise: 50000,
    customerConsent: false,
    policy: DEFAULT_POLICY,
  });
  assert.strictEqual(result.allowed, false);
  assert.ok(result.gatesFailed.some(g => g.gateId === 'GATE_WHATSAPP_CONSENT'));
});

test('Hard Decline Gate: blocks retry_payment on hard_decline or revoked_mandate', () => {
  const result = evaluateAction({
    caseId: 'test-7',
    cashState: 'recoverable',
    diagnosisCode: 'hard_decline',
    action: 'retry_payment',
    outstandingAmountPaise: 100000,
    failureCategory: 'hard_decline',
    policy: DEFAULT_POLICY,
  });
  assert.strictEqual(result.allowed, false);
  assert.ok(result.gatesFailed.some(g => g.gateId === 'GATE_HARD_DECLINE'));
});

test('PTP Gate: pauses standard dunning while active PTP is within grace period', () => {
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 3);

  const result = evaluateAction({
    caseId: 'test-8',
    cashState: 'recoverable',
    diagnosisCode: 'invoice_overdue',
    action: 'reminder_sms',
    outstandingAmountPaise: 200000,
    hasActivePTP: true,
    ptpDate: futureDate,
    policy: DEFAULT_POLICY,
  });
  assert.strictEqual(result.allowed, false);
  assert.ok(result.gatesFailed.some(g => g.gateId === 'GATE_PTP'));
});

test('Rail Switch Gate: requires minimum consecutive failures & eNACH eligibility', () => {
  // Only 1 failure -> blocked
  const res1 = evaluateAction({
    caseId: 'test-9a',
    cashState: 'recoverable',
    diagnosisCode: 'insufficient_funds',
    action: 'propose_rail_switch',
    outstandingAmountPaise: 50000,
    mandateConsecutiveFailures: 1,
    enachEligible: true,
    policy: DEFAULT_POLICY,
  });
  assert.strictEqual(res1.allowed, false);
  assert.ok(res1.gatesFailed.some(g => g.gateId === 'GATE_RAIL_SWITCH_MIN'));

  // 2 failures, not eligible -> blocked
  const res2 = evaluateAction({
    caseId: 'test-9b',
    cashState: 'recoverable',
    diagnosisCode: 'insufficient_funds',
    action: 'propose_rail_switch',
    outstandingAmountPaise: 50000,
    mandateConsecutiveFailures: 2,
    enachEligible: false,
    policy: DEFAULT_POLICY,
  });
  assert.strictEqual(res2.allowed, false);
  assert.ok(res2.gatesFailed.some(g => g.gateId === 'GATE_RAIL_SWITCH_ENACH'));
});

// -------------------------------------------------------------
// 2. RECOVERY ACTION SCORER TESTS
// -------------------------------------------------------------
console.log('\n--- 2. Recovery Action Scorer ---');

test('Scorer calculates expectedNetRecovery in integer paise with transparent inputs', () => {
  const score = scoreAction('payment_link', 'invoice_overdue', 100000); // ₹1,000.00
  assert.ok(score.expectedNetRecoveryPaise > 0);
  assert.strictEqual(Number.isInteger(score.expectedNetRecoveryPaise), true);
  assert.ok(score.explanation.includes('expected net recovery'));
});

test('scoreAndRankActions sorts highest expected net recovery first', () => {
  const ranked = scoreAndRankActions(
    ['reminder_sms', 'payment_link', 'reminder_email'],
    'invoice_overdue',
    500000
  );
  assert.strictEqual(ranked.length, 3);
  assert.strictEqual(ranked[0].rank, 1);
  assert.ok(ranked[0].expectedNetRecoveryPaise >= ranked[1].expectedNetRecoveryPaise);
  assert.ok(ranked[1].expectedNetRecoveryPaise >= ranked[2].expectedNetRecoveryPaise);
});

// -------------------------------------------------------------
// 3. DIAGNOSIS TAXONOMY & PLAYBOOKS
// -------------------------------------------------------------
console.log('\n--- 3. Diagnosis Taxonomy & Playbook Mapping ---');

test('All 14+ diagnosis codes have complete taxonomy entries', () => {
  const codes = [
    'gateway_timeout',
    'network_error',
    'insufficient_funds',
    'card_expired',
    'payment_method_invalid',
    'hard_decline',
    'mandate_revoked',
    'mandate_unknown',
    'refund_issued',
    'dispute_chargeback',
    'duplicate_payment',
    'checkout_abandonment_high_intent',
    'checkout_abandonment_low_intent',
    'invoice_overdue',
    'invoice_partial_payment',
    'pending_settlement',
    'bank_lag',
    'unknown_fee_short_settlement',
    'duplicate_bank_credit',
    'ambiguous_alias',
    'missing_reference',
    'tds_matched',
    'tds_review_required',
    'risk_hold',
    'anomaly_detected',
    'promise_to_pay_active',
    'promise_to_pay_broken',
  ];

  for (const code of codes) {
    const diag = getDiagnosis(code);
    assert.ok(diag, `Diagnosis ${code} must exist`);
    assert.strictEqual(diag.code, code);
    assert.ok(diag.description.length > 0);
    assert.ok(diag.whatWouldChangeMind.length > 0);
  }
});

test('Playbook routing: maps diagnoses to Playbook A, B, C, D properly', () => {
  assert.strictEqual(selectPlaybook('gateway_timeout'), 'A');
  assert.strictEqual(selectPlaybook('network_error'), 'A');
  assert.strictEqual(selectPlaybook('insufficient_funds'), 'B');
  assert.strictEqual(selectPlaybook('checkout_abandonment_high_intent'), 'C');
  assert.strictEqual(selectPlaybook('invoice_overdue'), 'D');
  assert.strictEqual(selectPlaybook('invoice_partial_payment'), 'D');
  assert.strictEqual(selectPlaybook('hard_decline'), null);
  assert.strictEqual(selectPlaybook('refund_issued'), null);
});

// Summary
console.log(`\n===========================================`);
console.log(`Results: ${passed}/${total} passed`);
console.log(`===========================================\n`);

if (passed !== total) {
  process.exit(1);
}
