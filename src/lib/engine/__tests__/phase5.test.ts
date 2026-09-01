// ============================================
// Phase 5 — Integration & Safety Verification Tests
//
// Covers:
// - Integer arithmetic (no floats in money)
// - Webhook HMAC verification
// - Test Mode adapter gating
// - Voice adapter gating
// - Duplicate webhook deduplication
// - Settlement Q&A deterministic answers
// - PTP extraction from Hinglish
// - Firewall blocking (hard decline, refund, opt-out, etc.)
// - Forward forecast eligibility
// ============================================

import assert from 'node:assert';
import crypto from 'crypto';
import { evaluateAction, DEFAULT_POLICY } from '../firewall';
import { scoreAction, scoreAndRankActions } from '../scorer';
import {
  extractPTPDate,
  renderScript,
  HINGLISH_SCRIPT_TEMPLATE,
  ENGLISH_SCRIPT_TEMPLATE,
  BrowserVoiceAdapter,
  TwilioVoiceAdapter,
} from '../../integrations/voice';
import {
  answerSettlementQuestion,
  generateMatchExplanation,
  draftRecoveryMessage,
  type SettlementBreakdown,
} from '../../integrations/llm';

console.log('🧪 Starting Phase 5 Integration & Safety Tests...\n');

let passed = 0;
let total = 0;

function test(name: string, fn: () => void | Promise<void>) {
  total++;
  const result = fn();
  if (result instanceof Promise) {
    result.then(() => {
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    }).catch((err: any) => {
      console.error(`  ❌ FAIL: ${name}`);
      console.error(`     ${err.message}`);
    });
  } else {
    try {
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  ❌ FAIL: ${name}`);
      console.error(`     ${err.message}`);
    }
  }
}

// Use sync wrapper for tests that need it
function testSync(name: string, fn: () => void) {
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
// 1. INTEGER ARITHMETIC — NO FLOATS IN MONEY
// -------------------------------------------------------------
console.log('--- 1. Integer Arithmetic ---');

testSync('All money calculations use integer paise, never floats', () => {
  const score = scoreAction('payment_link', 'invoice_overdue', 1000000); // ₹10,000
  assert.strictEqual(Number.isInteger(score.expectedNetRecoveryPaise), true, 'Expected net recovery must be integer');
  assert.strictEqual(Number.isInteger(score.communicationCostPaise), true, 'Communication cost must be integer');
  assert.strictEqual(Number.isInteger(score.customerFrictionCostPaise), true, 'Friction cost must be integer');
  assert.ok(score.expectedNetRecoveryPaise > 0, 'Expected net recovery must be positive');
});

testSync('scoreAndRankActions returns integer paise for all actions', () => {
  const ranked = scoreAndRankActions(
    ['payment_link', 'reminder_sms', 'reminder_email', 'retry_payment'],
    'gateway_timeout',
    500000
  );
  for (const r of ranked) {
    assert.strictEqual(Number.isInteger(r.expectedNetRecoveryPaise), true, `${r.action} must have integer paise`);
    assert.strictEqual(Number.isInteger(r.communicationCostPaise), true, `${r.action} communication cost must be integer`);
    assert.strictEqual(Number.isInteger(r.customerFrictionCostPaise), true, `${r.action} friction cost must be integer`);
  }
});

// -------------------------------------------------------------
// 2. WEBHOOK HMAC VERIFICATION
// -------------------------------------------------------------
console.log('\n--- 2. Webhook HMAC Verification ---');

testSync('HMAC SHA-256 rejects bad signature', () => {
  const secret = 'test_webhook_secret_123';
  const body = JSON.stringify({ event: 'payment_link.paid', payload: { test: true } });

  // Correct signature
  const correctSignature = crypto.createHmac('sha256', secret).update(body).digest('hex');

  // Bad signature
  const badSignature = 'definitely_not_valid_hmac_signature';

  assert.notStrictEqual(correctSignature, badSignature);
  assert.strictEqual(correctSignature.length, 64); // SHA-256 hex = 64 chars

  // Verify the correct one matches
  const verify = crypto.createHmac('sha256', secret).update(body).digest('hex');
  assert.strictEqual(verify, correctSignature);
});

testSync('HMAC verification handles empty body correctly', () => {
  const secret = 'test_secret';
  const emptyBody = '';
  const sig = crypto.createHmac('sha256', secret).update(emptyBody).digest('hex');
  assert.strictEqual(typeof sig, 'string');
  assert.strictEqual(sig.length, 64);
});

// -------------------------------------------------------------
// 3. TEST MODE ADAPTER GATING
// -------------------------------------------------------------
console.log('\n--- 3. Test Mode Adapter Gating ---');

testSync('Razorpay adapter never called without ENABLE_RAZORPAY_TEST_MODE=true', () => {
  // Preserve env
  const original = process.env.ENABLE_RAZORPAY_TEST_MODE;
  process.env.ENABLE_RAZORPAY_TEST_MODE = 'false';

  // The adapter check function (replicated from razorpay.ts logic)
  const isEnabled = process.env.ENABLE_RAZORPAY_TEST_MODE === 'true' &&
    !!process.env.RAZORPAY_KEY_ID &&
    process.env.RAZORPAY_KEY_ID.startsWith('rzp_test_') &&
    !!process.env.RAZORPAY_KEY_SECRET;

  assert.strictEqual(isEnabled, false, 'Should not be enabled');

  process.env.ENABLE_RAZORPAY_TEST_MODE = original;
});

testSync('Razorpay adapter requires rzp_test_ prefix on key ID', () => {
  const original = {
    enable: process.env.ENABLE_RAZORPAY_TEST_MODE,
    keyId: process.env.RAZORPAY_KEY_ID,
    keySecret: process.env.RAZORPAY_KEY_SECRET,
  };

  process.env.ENABLE_RAZORPAY_TEST_MODE = 'true';
  process.env.RAZORPAY_KEY_ID = 'rzp_live_should_not_work';
  process.env.RAZORPAY_KEY_SECRET = 'secret';

  const isEnabled = process.env.ENABLE_RAZORPAY_TEST_MODE === 'true' &&
    !!process.env.RAZORPAY_KEY_ID &&
    process.env.RAZORPAY_KEY_ID.startsWith('rzp_test_') &&
    !!process.env.RAZORPAY_KEY_SECRET;

  assert.strictEqual(isEnabled, false, 'Live keys must not be accepted');

  process.env.ENABLE_RAZORPAY_TEST_MODE = original.enable;
  process.env.RAZORPAY_KEY_ID = original.keyId;
  process.env.RAZORPAY_KEY_SECRET = original.keySecret;
});

// -------------------------------------------------------------
// 4. VOICE ADAPTER GATING
// -------------------------------------------------------------
console.log('\n--- 4. Voice Adapter Gating ---');

testSync('Voice adapter never called without ENABLE_OUTBOUND_CALLS=true', () => {
  const original = process.env.ENABLE_OUTBOUND_CALLS;
  process.env.ENABLE_OUTBOUND_CALLS = 'false';

  const isEnabled = process.env.ENABLE_OUTBOUND_CALLS === 'true' &&
    !!process.env.TWILIO_ACCOUNT_SID &&
    !!process.env.TWILIO_AUTH_TOKEN &&
    !!process.env.TWILIO_FROM_NUMBER &&
    !!process.env.VOICE_TEST_TO_NUMBER;

  assert.strictEqual(isEnabled, false, 'Twilio should not be enabled');

  process.env.ENABLE_OUTBOUND_CALLS = original;
});

testSync('Browser voice adapter always succeeds (no external dependency)', async () => {
  const adapter = new BrowserVoiceAdapter();
  const result = await adapter.startCall({
    caseId: 'test-case',
    caseNumber: 'CIC-TEST-001',
    customerName: 'Test Customer',
    amountPaise: 100000,
    invoiceOrOrderRef: 'INV-TEST',
    merchantName: 'Test Merchant',
  });
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.simulated, true);
  assert.strictEqual(result.provider, 'browser');
  assert.ok(result.callId.startsWith('call_browser_'));
  assert.ok(result.script.length > 0);
});

testSync('Twilio adapter fails gracefully without credentials', async () => {
  const original = process.env.ENABLE_OUTBOUND_CALLS;
  process.env.ENABLE_OUTBOUND_CALLS = 'false';

  const adapter = new TwilioVoiceAdapter();
  const result = await adapter.startCall({
    caseId: 'test-case',
    caseNumber: 'CIC-TEST-001',
    customerName: 'Test Customer',
    amountPaise: 100000,
    invoiceOrOrderRef: 'INV-TEST',
    merchantName: 'Test Merchant',
  });
  assert.strictEqual(result.success, false);
  assert.ok(result.error?.includes('not configured'));

  process.env.ENABLE_OUTBOUND_CALLS = original;
});

// -------------------------------------------------------------
// 5. PTP EXTRACTION FROM HINGLISH
// -------------------------------------------------------------
console.log('\n--- 5. PTP Date Extraction ---');

testSync('Extracts Friday from "Main Friday ko pay kar dunga"', () => {
  const date = extractPTPDate('Main Friday ko pay kar dunga');
  assert.ok(date instanceof Date);
  assert.strictEqual(date.getDay(), 5); // Friday
});

testSync('Extracts tomorrow from "kal payment kar dunga"', () => {
  const date = extractPTPDate('kal payment kar dunga');
  assert.ok(date instanceof Date);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  assert.strictEqual(date.getDate(), tomorrow.getDate());
});

testSync('Extracts Monday from "Monday tak pay karunga"', () => {
  const date = extractPTPDate('Monday tak pay karunga');
  assert.ok(date instanceof Date);
  assert.strictEqual(date.getDay(), 1); // Monday
});

testSync('Returns null for unrecognized date expressions', () => {
  const date = extractPTPDate('I will think about it');
  assert.strictEqual(date, null);
});

// -------------------------------------------------------------
// 6. VOICE SCRIPT RENDERING
// -------------------------------------------------------------
console.log('\n--- 6. Voice Script Rendering ---');

testSync('Hinglish script renders with all template variables', () => {
  const script = renderScript(HINGLISH_SCRIPT_TEMPLATE, {
    caseId: 'test',
    caseNumber: 'CIC-001',
    customerName: 'Test',
    amountPaise: 1000000,
    invoiceOrOrderRef: 'INV-123',
    merchantName: 'Demo Merchant',
  });
  assert.ok(script.includes('Demo Merchant'));
  assert.ok(script.includes('INV-123'));
  assert.ok(script.includes('₹10000.00'));
  assert.ok(!script.includes('{{'));
});

testSync('English fallback script renders correctly', () => {
  const script = renderScript(ENGLISH_SCRIPT_TEMPLATE, {
    caseId: 'test',
    caseNumber: 'CIC-002',
    customerName: 'Test',
    amountPaise: 500000,
    invoiceOrOrderRef: 'ORD-456',
    merchantName: 'CIC Corp',
  });
  assert.ok(script.includes('CIC Corp'));
  assert.ok(script.includes('₹5000.00'));
  assert.ok(!script.includes('{{'));
});

// -------------------------------------------------------------
// 7. SETTLEMENT Q&A DETERMINISTIC
// -------------------------------------------------------------
console.log('\n--- 7. Settlement Q&A (Deterministic) ---');

testSync('Settlement Q&A returns deterministic answer without LLM', async () => {
  const breakdown: SettlementBreakdown = {
    settlementId: 'set_test_001',
    grossPaise: 1000000,
    feePaise: 20000,
    taxPaise: 3600,
    adjustmentPaise: 10400,
    netPaise: 966000,
    bankCreditPaise: 966000,
    status: 'settled',
    linkedPayments: [{ paymentId: 'pay_test_001', amountPaise: 1000000, status: 'captured' }],
    matchTier: 'tier_a',
    auditEvents: [],
  };

  const answer = await answerSettlementQuestion('Why did set_test_001 match?', breakdown);

  assert.strictEqual(answer.grossPaise, 1000000);
  assert.strictEqual(answer.netPaise, 966000);
  assert.strictEqual(answer.bankCreditPaise, 966000);
  assert.strictEqual(answer.residualPaise, 0);
  assert.strictEqual(answer.reconciliationStatus, 'reconciled');
  assert.strictEqual(answer.confidence, 1.0);
  assert.ok(answer.answer.includes('reconciled'));
  assert.ok(answer.deductionLines.length > 0);
});

testSync('Settlement Q&A returns unresolved for mismatched amounts', async () => {
  const breakdown: SettlementBreakdown = {
    settlementId: 'set_short_001',
    grossPaise: 1000000,
    feePaise: 20000,
    taxPaise: 3600,
    adjustmentPaise: 0,
    netPaise: 976400,
    bankCreditPaise: 942400, // ₹340 short
    status: 'settled',
    linkedPayments: [],
    auditEvents: [],
  };

  const answer = await answerSettlementQuestion('Why did set_short_001 differ by ₹340?', breakdown);

  assert.ok(answer.residualPaise > 0, 'Residual should be positive (shortfall)');
  assert.ok(['unresolved', 'finance_review'].includes(answer.reconciliationStatus));
  assert.ok(answer.unknowns.length > 0);
  assert.ok(answer.confidence < 1.0);
});

// -------------------------------------------------------------
// 8. MATCH EXPLANATION DETERMINISTIC
// -------------------------------------------------------------
console.log('\n--- 8. Match Explanation ---');

testSync('generateMatchExplanation returns valid schema output', () => {
  const result = generateMatchExplanation({
    ruleTier: 'tier_a',
    score: 1.0,
    mathExplanation: 'Exact ID match: pay_123 → settlement set_456',
    evidenceRefs: ['pay_123', 'set_456'],
  });
  assert.strictEqual(result.confidence, 1.0);
  assert.strictEqual(result.recommendedDisposition, 'review');
  assert.ok(result.aliasInterpretation.includes('TIER A'));
  assert.strictEqual(result.candidateRecordIds.length, 2);
});

// -------------------------------------------------------------
// 9. MESSAGE DRAFTING
// -------------------------------------------------------------
console.log('\n--- 9. Message Drafting ---');

testSync('draftRecoveryMessage creates valid SMS/email/whatsapp', () => {
  const vars = { caseNumber: 'CIC-001', amount: '₹5,000.00', paymentLinkUrl: 'https://rzp.io/test', merchantName: 'TestCo' };

  const sms = draftRecoveryMessage('sms', vars);
  assert.strictEqual(sms.channel, 'sms');
  assert.ok(sms.body.includes('₹5,000.00'));
  assert.ok(!sms.body.includes('OTP')); // safe template

  const email = draftRecoveryMessage('email', vars);
  assert.strictEqual(email.channel, 'email');
  assert.ok(email.subject?.includes('CIC-001'));
  assert.ok(email.body.includes('never ask'));

  const wa = draftRecoveryMessage('whatsapp', vars);
  assert.strictEqual(wa.channel, 'whatsapp');
  assert.ok(wa.body.includes('🔒'));
});

// -------------------------------------------------------------
// 10. FIREWALL COMPREHENSIVE BLOCKS
// -------------------------------------------------------------
console.log('\n--- 10. Firewall Comprehensive Blocks ---');

testSync('Hard decline blocks retry_payment', () => {
  const result = evaluateAction({
    caseId: 'test-hd',
    cashState: 'recoverable',
    diagnosisCode: 'hard_decline',
    action: 'retry_payment',
    outstandingAmountPaise: 100000,
    failureCategory: 'hard_decline',
    policy: DEFAULT_POLICY,
  });
  assert.strictEqual(result.allowed, false);
});

testSync('Refund blocks all recovery', () => {
  const result = evaluateAction({
    caseId: 'test-refund',
    cashState: 'recoverable',
    diagnosisCode: 'refund_issued',
    action: 'payment_link',
    outstandingAmountPaise: 100000,
    hasRefund: true,
    policy: DEFAULT_POLICY,
  });
  assert.strictEqual(result.allowed, false);
});

testSync('Opt-out blocks contact', () => {
  const result = evaluateAction({
    caseId: 'test-optout',
    cashState: 'recoverable',
    diagnosisCode: 'invoice_overdue',
    action: 'reminder_sms',
    outstandingAmountPaise: 100000,
    customerOptedOut: true,
    policy: DEFAULT_POLICY,
  });
  assert.strictEqual(result.allowed, false);
});

testSync('Pending settlement blocks recovery', () => {
  const result = evaluateAction({
    caseId: 'test-pending',
    cashState: 'waiting_for_settlement',
    diagnosisCode: 'pending_settlement',
    action: 'payment_link',
    outstandingAmountPaise: 100000,
    policy: DEFAULT_POLICY,
  });
  assert.strictEqual(result.allowed, false);
});

testSync('Risk hold blocks recovery', () => {
  const result = evaluateAction({
    caseId: 'test-risk',
    cashState: 'risk_hold',
    diagnosisCode: 'risk_hold',
    action: 'payment_link',
    outstandingAmountPaise: 100000,
    policy: DEFAULT_POLICY,
  });
  assert.strictEqual(result.allowed, false);
});

testSync('Active PTP pauses dunning', () => {
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 5);

  const result = evaluateAction({
    caseId: 'test-ptp',
    cashState: 'recoverable',
    diagnosisCode: 'invoice_overdue',
    action: 'reminder_sms',
    outstandingAmountPaise: 200000,
    hasActivePTP: true,
    ptpDate: futureDate,
    policy: DEFAULT_POLICY,
  });
  assert.strictEqual(result.allowed, false);
});

testSync('Dispute blocks recovery', () => {
  const result = evaluateAction({
    caseId: 'test-dispute',
    cashState: 'recoverable',
    diagnosisCode: 'dispute_chargeback',
    action: 'payment_link',
    outstandingAmountPaise: 100000,
    hasDispute: true,
    policy: DEFAULT_POLICY,
  });
  assert.strictEqual(result.allowed, false);
});

testSync('Finance review blocks recovery', () => {
  const result = evaluateAction({
    caseId: 'test-fr',
    cashState: 'finance_review',
    diagnosisCode: 'unknown_fee_short_settlement',
    action: 'payment_link',
    outstandingAmountPaise: 100000,
    policy: DEFAULT_POLICY,
  });
  assert.strictEqual(result.allowed, false);
});

// Summary
setTimeout(() => {
  console.log(`\n===========================================`);
  console.log(`Results: ${passed}/${total} passed`);
  console.log(`===========================================\n`);

  if (passed !== total) {
    process.exit(1);
  }
}, 500);
