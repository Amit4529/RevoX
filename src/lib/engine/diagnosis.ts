// ============================================
// Diagnosis Taxonomy
//
// All 14+ diagnosis codes with:
//   - Cash-state classification
//   - Recovery eligibility
//   - Recommended playbook
//   - "What would change my mind" text
// ============================================

export interface DiagnosisEntry {
  code: string;
  label: string;
  description: string;
  defaultCashState: string;
  recoveryEligible: boolean;
  recommendedPlaybook: 'A' | 'B' | 'C' | 'D' | null;
  playbookLabel: string | null;
  whatWouldChangeMind: string;
  severity: 'info' | 'warning' | 'critical';
}

export const DIAGNOSIS_TAXONOMY: Record<string, DiagnosisEntry> = {
  // ---- Payment Failure Diagnoses ----
  gateway_timeout: {
    code: 'gateway_timeout',
    label: 'Gateway Timeout',
    description: 'Payment attempt timed out at the gateway level. The charge may or may not have been attempted by the issuing bank.',
    defaultCashState: 'recoverable',
    recoveryEligible: true,
    recommendedPlaybook: 'A',
    playbookLabel: 'Playbook A: Transient Payment Failure',
    whatWouldChangeMind: 'A late capture webhook confirming the original charge succeeded, or a bank statement credit matching this amount.',
    severity: 'warning',
  },
  network_error: {
    code: 'network_error',
    label: 'Network Error',
    description: 'Payment failed due to a network-level error between gateway and issuer. Typically transient.',
    defaultCashState: 'recoverable',
    recoveryEligible: true,
    recommendedPlaybook: 'A',
    playbookLabel: 'Playbook A: Transient Payment Failure',
    whatWouldChangeMind: 'A successful retry or a delayed webhook confirming capture.',
    severity: 'warning',
  },
  insufficient_funds: {
    code: 'insufficient_funds',
    label: 'Insufficient Funds',
    description: 'Customer account had insufficient funds at payment time. May succeed if retried at a different time (e.g., after salary credit).',
    defaultCashState: 'recoverable',
    recoveryEligible: true,
    recommendedPlaybook: 'B',
    playbookLabel: 'Playbook B: Insufficient Funds / Recurring',
    whatWouldChangeMind: 'A successful retry at a different time, or customer switching to a different payment method with available funds.',
    severity: 'warning',
  },
  card_expired: {
    code: 'card_expired',
    label: 'Card Expired',
    description: 'Payment card has expired. Retry on the same card will always fail. Customer needs to provide updated card details.',
    defaultCashState: 'recoverable',
    recoveryEligible: true,
    recommendedPlaybook: 'A',
    playbookLabel: 'Playbook A: Transient Payment Failure (payment link only)',
    whatWouldChangeMind: 'Customer completing payment via a fresh payment link with updated card or alternate method.',
    severity: 'warning',
  },
  payment_method_invalid: {
    code: 'payment_method_invalid',
    label: 'Payment Method Invalid',
    description: 'The payment method is no longer valid (e.g., closed account, blocked card).',
    defaultCashState: 'recoverable',
    recoveryEligible: true,
    recommendedPlaybook: 'A',
    playbookLabel: 'Playbook A: Transient Payment Failure (payment link only)',
    whatWouldChangeMind: 'Customer paying via a different valid payment method.',
    severity: 'warning',
  },

  // ---- Hard Block Diagnoses (no recovery) ----
  hard_decline: {
    code: 'hard_decline',
    label: 'Hard Decline',
    description: 'Bank issued a hard decline. Retrying will fail. Root cause may be fraud block, sanctions, or permanently closed account.',
    defaultCashState: 'closed',
    recoveryEligible: false,
    recommendedPlaybook: null,
    playbookLabel: null,
    whatWouldChangeMind: 'A reversal of the decline by the issuing bank (extremely rare). Manual investigation recommended.',
    severity: 'critical',
  },
  mandate_revoked: {
    code: 'mandate_revoked',
    label: 'Mandate Revoked',
    description: 'Customer has revoked the recurring payment mandate (UPI Autopay, eNACH, etc.). Cannot retry on this authorization.',
    defaultCashState: 'closed',
    recoveryEligible: false,
    recommendedPlaybook: null,
    playbookLabel: null,
    whatWouldChangeMind: 'Customer re-authorizing a new mandate for this subscription.',
    severity: 'critical',
  },
  mandate_unknown: {
    code: 'mandate_unknown',
    label: 'Mandate Status Unknown',
    description: 'Mandate status could not be confirmed with the bank. Cannot retry without verified authorization.',
    defaultCashState: 'closed',
    recoveryEligible: false,
    recommendedPlaybook: null,
    playbookLabel: null,
    whatWouldChangeMind: 'Confirmation from the bank that the mandate is still active.',
    severity: 'critical',
  },
  refund_issued: {
    code: 'refund_issued',
    label: 'Refund Issued',
    description: 'A refund has already been processed for this payment. No recovery is possible or appropriate.',
    defaultCashState: 'closed',
    recoveryEligible: false,
    recommendedPlaybook: null,
    playbookLabel: null,
    whatWouldChangeMind: 'Nothing — refund is a terminal state. If refund was erroneous, requires manual escalation outside CIC.',
    severity: 'info',
  },
  dispute_chargeback: {
    code: 'dispute_chargeback',
    label: 'Dispute / Chargeback',
    description: 'An active dispute or chargeback exists. Recovery automation is blocked to avoid regulatory and legal risk.',
    defaultCashState: 'closed',
    recoveryEligible: false,
    recommendedPlaybook: null,
    playbookLabel: null,
    whatWouldChangeMind: 'Dispute resolution in merchant\'s favor by the card network or bank.',
    severity: 'critical',
  },
  duplicate_payment: {
    code: 'duplicate_payment',
    label: 'Duplicate Payment',
    description: 'A successful payment already exists for the same order. This failed attempt is a duplicate — no recovery needed.',
    defaultCashState: 'closed',
    recoveryEligible: false,
    recommendedPlaybook: null,
    playbookLabel: null,
    whatWouldChangeMind: 'If the "successful" payment is later reversed, this case may re-enter recovery.',
    severity: 'info',
  },

  // ---- Checkout Abandonment ----
  checkout_abandonment_high_intent: {
    code: 'checkout_abandonment_high_intent',
    label: 'High-Intent Checkout Abandonment',
    description: 'Customer reached the payment stage but did not complete. High recovery potential with a timely, personalized nudge.',
    defaultCashState: 'recoverable',
    recoveryEligible: true,
    recommendedPlaybook: 'C',
    playbookLabel: 'Playbook C: High-Intent Checkout Abandonment',
    whatWouldChangeMind: 'Customer completing payment, or opting out, or the cart session expiring beyond recovery window.',
    severity: 'warning',
  },
  checkout_abandonment_low_intent: {
    code: 'checkout_abandonment_low_intent',
    label: 'Low-Intent Checkout Abandonment',
    description: 'Customer abandoned early in the checkout flow (before payment method selection). Low recovery potential.',
    defaultCashState: 'closed',
    recoveryEligible: false,
    recommendedPlaybook: null,
    playbookLabel: null,
    whatWouldChangeMind: 'Customer returning to complete checkout on their own. No proactive recovery recommended.',
    severity: 'info',
  },

  // ---- Invoice Diagnoses ----
  invoice_overdue: {
    code: 'invoice_overdue',
    label: 'Invoice Overdue',
    description: 'B2B invoice is past due date with outstanding balance. Recovery follows the overdue invoice playbook.',
    defaultCashState: 'recoverable',
    recoveryEligible: true,
    recommendedPlaybook: 'D',
    playbookLabel: 'Playbook D: B2B Overdue Invoice',
    whatWouldChangeMind: 'A late bank credit matching the invoice amount, or a partial payment reducing the outstanding.',
    severity: 'warning',
  },
  invoice_partial_payment: {
    code: 'invoice_partial_payment',
    label: 'Invoice Partial Payment',
    description: 'Invoice has been partially paid. Outstanding balance remains.',
    defaultCashState: 'recoverable',
    recoveryEligible: true,
    recommendedPlaybook: 'D',
    playbookLabel: 'Playbook D: B2B Overdue Invoice',
    whatWouldChangeMind: 'Remaining payment received, or a Promise-to-Pay captured for the balance.',
    severity: 'warning',
  },

  // ---- Settlement / Finance Diagnoses ----
  pending_settlement: {
    code: 'pending_settlement',
    label: 'Pending Settlement',
    description: 'Payment captured but settlement not yet processed by gateway. Expected to resolve automatically.',
    defaultCashState: 'waiting_for_settlement',
    recoveryEligible: false,
    recommendedPlaybook: null,
    playbookLabel: null,
    whatWouldChangeMind: 'Settlement event arriving from gateway within normal T+2/T+3 window.',
    severity: 'info',
  },
  bank_lag: {
    code: 'bank_lag',
    label: 'Bank Processing Lag',
    description: 'Settlement processed but bank credit not yet received. Likely a normal banking delay.',
    defaultCashState: 'waiting_for_settlement',
    recoveryEligible: false,
    recommendedPlaybook: null,
    playbookLabel: null,
    whatWouldChangeMind: 'Bank credit appearing in bank statement within 1–3 business days.',
    severity: 'info',
  },
  unknown_fee_short_settlement: {
    code: 'unknown_fee_short_settlement',
    label: 'Unknown Fee / Short Settlement',
    description: 'Settlement amount is less than expected after accounting for known fees and taxes. The difference is unexplained.',
    defaultCashState: 'finance_review',
    recoveryEligible: false,
    recommendedPlaybook: null,
    playbookLabel: null,
    whatWouldChangeMind: 'Identification of the specific fee or adjustment that explains the shortfall.',
    severity: 'warning',
  },
  duplicate_bank_credit: {
    code: 'duplicate_bank_credit',
    label: 'Duplicate Bank Credit',
    description: 'Multiple bank credits of the same amount on the same day. Requires manual verification to avoid double-counting.',
    defaultCashState: 'finance_review',
    recoveryEligible: false,
    recommendedPlaybook: null,
    playbookLabel: null,
    whatWouldChangeMind: 'Confirmation that each credit corresponds to a distinct settlement or payment.',
    severity: 'warning',
  },
  ambiguous_alias: {
    code: 'ambiguous_alias',
    label: 'Ambiguous Alias Match',
    description: 'AI candidate matching found a possible match via name/alias normalization, but confidence is insufficient for auto-match.',
    defaultCashState: 'finance_review',
    recoveryEligible: false,
    recommendedPlaybook: null,
    playbookLabel: null,
    whatWouldChangeMind: 'Human confirmation of the alias mapping, or additional evidence linking the records.',
    severity: 'warning',
  },
  missing_reference: {
    code: 'missing_reference',
    label: 'Missing Reference',
    description: 'Bank transaction has no UTR or reference that can be linked to a settlement or payment.',
    defaultCashState: 'finance_review',
    recoveryEligible: false,
    recommendedPlaybook: null,
    playbookLabel: null,
    whatWouldChangeMind: 'Bank or gateway providing the missing reference via updated statement or API response.',
    severity: 'warning',
  },

  // ---- TDS ----
  tds_matched: {
    code: 'tds_matched',
    label: 'TDS Match Verified',
    description: 'Invoice matched with TDS deduction. Deducted amount is consistent with declared TDS rule and evidence.',
    defaultCashState: 'matched_with_tds',
    recoveryEligible: false,
    recommendedPlaybook: null,
    playbookLabel: null,
    whatWouldChangeMind: 'Already resolved — TDS matching is complete.',
    severity: 'info',
  },
  tds_review_required: {
    code: 'tds_review_required',
    label: 'TDS Review Required',
    description: 'TDS deduction found but evidence is incomplete or rate doesn\'t match declared rules. Requires manual verification.',
    defaultCashState: 'finance_review',
    recoveryEligible: false,
    recommendedPlaybook: null,
    playbookLabel: null,
    whatWouldChangeMind: 'Deductor providing TDS certificate, or corrected TDS evidence matching the declared rate.',
    severity: 'warning',
  },

  // ---- Risk / Anomaly ----
  risk_hold: {
    code: 'risk_hold',
    label: 'Risk Hold',
    description: 'Case flagged by risk engine. Automation blocked until risk review is complete.',
    defaultCashState: 'risk_hold',
    recoveryEligible: false,
    recommendedPlaybook: null,
    playbookLabel: null,
    whatWouldChangeMind: 'Risk reviewer clearing the hold and confirming the case is safe for recovery.',
    severity: 'critical',
  },
  anomaly_detected: {
    code: 'anomaly_detected',
    label: 'Anomaly Detected',
    description: 'Unusual pattern detected (e.g., sudden spike in failures, cross-method attempts, refund-after-recovery).',
    defaultCashState: 'risk_hold',
    recoveryEligible: false,
    recommendedPlaybook: null,
    playbookLabel: null,
    whatWouldChangeMind: 'Investigation confirming the anomaly is benign (e.g., legitimate bulk order).',
    severity: 'critical',
  },

  // ---- PTP ----
  promise_to_pay_active: {
    code: 'promise_to_pay_active',
    label: 'Promise-to-Pay Active',
    description: 'Customer has made a promise to pay by a specific date. Standard dunning is paused.',
    defaultCashState: 'promise_to_pay',
    recoveryEligible: false,
    recommendedPlaybook: null,
    playbookLabel: null,
    whatWouldChangeMind: 'Payment arriving by the promised date (PTP kept), or grace period expiring without payment (PTP broken).',
    severity: 'info',
  },
  promise_to_pay_kept: {
    code: 'promise_to_pay_kept',
    label: 'Promise-to-Pay Kept',
    description: 'Customer fulfilled their promise to pay. Case closed.',
    defaultCashState: 'closed',
    recoveryEligible: false,
    recommendedPlaybook: null,
    playbookLabel: null,
    whatWouldChangeMind: 'Already resolved.',
    severity: 'info',
  },
  promise_to_pay_broken: {
    code: 'promise_to_pay_broken',
    label: 'Promise-to-Pay Broken',
    description: 'Customer did not pay by the promised date + grace period. Recovery resumes at next policy stage (NOT stage 1).',
    defaultCashState: 'recoverable',
    recoveryEligible: true,
    recommendedPlaybook: 'D',
    playbookLabel: 'Playbook D: B2B Overdue Invoice (escalation stage)',
    whatWouldChangeMind: 'Late payment arriving, or customer re-promising with a new date.',
    severity: 'warning',
  },

  // ---- Reconciliation Match (informational) ----
  matched_exact: {
    code: 'matched_exact',
    label: 'Exact ID Match',
    description: 'Payment matched to settlement and bank credit via exact provider ID.',
    defaultCashState: 'matched',
    recoveryEligible: false,
    recommendedPlaybook: null,
    playbookLabel: null,
    whatWouldChangeMind: 'Already resolved.',
    severity: 'info',
  },
  matched_composite: {
    code: 'matched_composite',
    label: 'Composite Match',
    description: 'Matched via normalized reference + amount + date window.',
    defaultCashState: 'matched',
    recoveryEligible: false,
    recommendedPlaybook: null,
    playbookLabel: null,
    whatWouldChangeMind: 'Already resolved.',
    severity: 'info',
  },
  matched_grouped: {
    code: 'matched_grouped',
    label: 'Grouped Settlement Match',
    description: 'Bank credit matched to a grouped settlement via component decomposition.',
    defaultCashState: 'matched',
    recoveryEligible: false,
    recommendedPlaybook: null,
    playbookLabel: null,
    whatWouldChangeMind: 'Already resolved.',
    severity: 'info',
  },

  // ---- Catch-all ----
  unknown: {
    code: 'unknown',
    label: 'Unknown',
    description: 'Diagnosis could not be determined. Requires manual investigation.',
    defaultCashState: 'finance_review',
    recoveryEligible: false,
    recommendedPlaybook: null,
    playbookLabel: null,
    whatWouldChangeMind: 'Additional evidence or context to classify this case properly.',
    severity: 'warning',
  },
};

/**
 * Look up a diagnosis entry by code
 */
export function getDiagnosis(code: string): DiagnosisEntry {
  return DIAGNOSIS_TAXONOMY[code] || DIAGNOSIS_TAXONOMY.unknown;
}

/**
 * Get all recovery-eligible diagnosis codes
 */
export function getRecoverableDiagnoses(): DiagnosisEntry[] {
  return Object.values(DIAGNOSIS_TAXONOMY).filter(d => d.recoveryEligible);
}

/**
 * Get all diagnosis codes that map to a specific cash state
 */
export function getDiagnosesByCashState(cashState: string): DiagnosisEntry[] {
  return Object.values(DIAGNOSIS_TAXONOMY).filter(d => d.defaultCashState === cashState);
}

/**
 * Get the recommended playbook letter for a diagnosis code
 */
export function getRecommendedPlaybook(code: string): 'A' | 'B' | 'C' | 'D' | null {
  const entry = DIAGNOSIS_TAXONOMY[code];
  return entry?.recommendedPlaybook || null;
}
