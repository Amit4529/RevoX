// ============================================
// Zod schemas for all API boundaries
// ============================================

import { z } from 'zod';

// ---- Cash State enum ----
export const CashStateSchema = z.enum([
  'matched',
  'matched_with_tds',
  'waiting_for_settlement',
  'recoverable',
  'finance_review',
  'risk_hold',
  'promise_to_pay',
  'closed',
]);
export type CashState = z.infer<typeof CashStateSchema>;

// ---- Priority enum ----
export const PrioritySchema = z.enum(['critical', 'high', 'medium', 'low']);
export type Priority = z.infer<typeof PrioritySchema>;

// ---- Diagnosis codes ----
export const DiagnosisCodeSchema = z.enum([
  'gateway_timeout',
  'network_error',
  'insufficient_funds',
  'card_expired',
  'payment_method_invalid',
  'hard_decline',
  'mandate_revoked',
  'mandate_unknown',
  'checkout_abandonment_high_intent',
  'checkout_abandonment_low_intent',
  'invoice_overdue',
  'invoice_partial_payment',
  'promise_to_pay_active',
  'promise_to_pay_kept',
  'promise_to_pay_broken',
  'pending_settlement',
  'bank_lag',
  'unknown_fee_short_settlement',
  'duplicate_payment',
  'refund_issued',
  'dispute_chargeback',
  'risk_hold',
  'anomaly_detected',
  'tds_matched',
  'tds_review_required',
  'ambiguous_alias',
  'missing_reference',
  'duplicate_bank_credit',
  'matched_exact',
  'matched_composite',
  'matched_grouped',
  'unknown',
]);
export type DiagnosisCode = z.infer<typeof DiagnosisCodeSchema>;

// ---- Recovery Action types ----
export const RecoveryActionTypeSchema = z.enum([
  'payment_link',
  'retry_payment',
  'reminder_sms',
  'reminder_email',
  'reminder_whatsapp',
  'voice_call',
  'propose_rail_switch',
  'manual_review',
  'escalation',
]);
export type RecoveryActionType = z.infer<typeof RecoveryActionTypeSchema>;

// ---- Rule Tier ----
export const RuleTierSchema = z.enum([
  'tier_a',
  'tier_b',
  'tier_c',
  'tier_c5',
  'tier_d',
  'tier_e',
]);
export type RuleTier = z.infer<typeof RuleTierSchema>;

// ---- Recovery Case (API response) ----
export const RecoveryCaseResponseSchema = z.object({
  id: z.string(),
  caseNumber: z.string(),
  cashState: CashStateSchema,
  priority: PrioritySchema,
  outstandingAmountPaise: z.number().int(),
  grossAmountPaise: z.number().int().optional(),
  expectedNetAmountPaise: z.number().int().optional(),
  observedBankAmountPaise: z.number().int().optional(),
  diagnosisCode: z.string(),
  diagnosisText: z.string(),
  confidence: z.number().min(0).max(1),
  evidenceRefs: z.array(z.string()),
  policySnapshotVersion: z.string().optional(),
  allowedActions: z.array(z.string()),
  blockedActions: z.array(z.object({
    action: z.string(),
    reasons: z.array(z.string()),
  })),
});
export type RecoveryCaseResponse = z.infer<typeof RecoveryCaseResponseSchema>;

// ---- Blocked Action ----
export const BlockedActionSchema = z.object({
  action: z.string(),
  reasons: z.array(z.string()),
});
export type BlockedAction = z.infer<typeof BlockedActionSchema>;

// ---- Policy Config ----
export const PolicyConfigSchema = z.object({
  policyVersion: z.string(),
  contact: z.object({
    maxTouchesAcrossChannels: z.number().int(),
    periodDays: z.number().int(),
    quietHoursLocal: z.string(),
    requireConsentForWhatsApp: z.boolean(),
    stopOnOptOut: z.boolean(),
  }),
  retries: z.object({
    maxRetries: z.number().int(),
    windowDays: z.number().int(),
    eligibleFailureCategories: z.array(z.string()),
    blockedFailureCategories: z.array(z.string()),
  }),
  railSwitch: z.object({
    minimumConsecutiveUpiAutopayFailures: z.number().int(),
    requireSeededEnachEligibility: z.boolean(),
    requireNewCustomerAuthorization: z.boolean(),
    requireHumanApproval: z.boolean(),
  }),
  promiseToPay: z.object({
    pauseStandardDunning: z.boolean(),
    graceDays: z.number().int(),
  }),
  approvals: z.object({
    highValueThresholdPaise: z.number().int(),
    requireApprovalFor: z.array(z.string()),
  }),
  risk: z.object({
    blockAutomationAboveScore: z.number(),
  }),
});
export type PolicyConfig = z.infer<typeof PolicyConfigSchema>;

// ---- Ingestion ----
export const IngestionSourceSchema = z.enum([
  'gateway',
  'invoice',
  'settlement',
  'bank_statement',
  'checkout',
  'communication',
]);
export type IngestionSource = z.infer<typeof IngestionSourceSchema>;

export const UploadRecordSchema = z.object({
  sourceType: IngestionSourceSchema,
  data: z.record(z.string(), z.unknown()),
});

export const BatchUploadSchema = z.object({
  records: z.array(UploadRecordSchema),
});

// ---- AI Candidate Explanation (LLM output) ----
export const AICandidateExplanationSchema = z.object({
  candidateRecordIds: z.array(z.string()),
  aliasInterpretation: z.string(),
  supportingEvidence: z.array(z.string()),
  contradictions: z.array(z.string()),
  recommendedDisposition: z.enum(['review', 'abstain']),
  confidence: z.number().min(0).max(1),
});
export type AICandidateExplanation = z.infer<typeof AICandidateExplanationSchema>;

// ---- Settlement Q&A ----
export const SettlementQAResponseSchema = z.object({
  answer: z.string(),
  reconciliationStatus: z.string(),
  grossPaise: z.number().int(),
  deductionLines: z.array(z.object({
    label: z.string(),
    amountPaise: z.number().int(),
  })),
  netPaise: z.number().int(),
  bankCreditPaise: z.number().int(),
  residualPaise: z.number().int(),
  evidenceRefs: z.array(z.string()),
  ruleIds: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  unknowns: z.array(z.string()),
});
export type SettlementQAResponse = z.infer<typeof SettlementQAResponseSchema>;

// ---- Audit Event ----
export const AuditEventSchema = z.object({
  caseId: z.string().optional(),
  actor: z.string(),
  actorVersion: z.string().default('1.0-demo'),
  eventType: z.string(),
  inputRecordRefs: z.array(z.string()),
  ruleOrPromptVersion: z.string().optional(),
  decision: z.record(z.string(), z.unknown()).optional(),
  reasons: z.array(z.string()),
  policySnapshot: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type AuditEventInput = z.infer<typeof AuditEventSchema>;

// ---- Promise to Pay ----
export const PromiseToPayInputSchema = z.object({
  recoveryCaseId: z.string(),
  customerId: z.string(),
  amountPaise: z.number().int().positive(),
  promisedDate: z.string().datetime(),
  source: z.enum(['voice', 'chat', 'manual', 'browser_demo']),
  transcript: z.string().optional(),
});
export type PromiseToPayInput = z.infer<typeof PromiseToPayInputSchema>;

// ---- Voice Call ----
export const VoiceCallInputSchema = z.object({
  caseId: z.string(),
  customerId: z.string(),
  merchantName: z.string(),
  invoiceOrOrderReference: z.string(),
  amountPaise: z.number().int().positive(),
  paymentLinkUrl: z.string().optional(),
});
export type VoiceCallInput = z.infer<typeof VoiceCallInputSchema>;

// ---- Forward Cash Forecast ----
export const ForecastLineSchema = z.object({
  label: z.string(),
  amountPaise: z.number().int(),
  probability: z.number().min(0).max(1).optional(),
  caseIds: z.array(z.string()).optional(),
});

export const ForecastHorizonSchema = z.object({
  days: z.number().int(),
  lowPaise: z.number().int(),
  basePaise: z.number().int(),
  highPaise: z.number().int(),
  components: z.array(ForecastLineSchema),
});

export const ForecastResponseSchema = z.object({
  asOfTimestamp: z.string().datetime(),
  settledBankCashPaise: z.number().int(),
  horizons: z.array(ForecastHorizonSchema),
});
