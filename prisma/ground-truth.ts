// ============================================
// Ground Truth — Hidden Answer Key
// Used ONLY for post-processing evaluation, never for decisions
// ============================================

export interface GroundTruthEntry {
  caseId: string;
  expectedCashState: string;
  expectedRuleTier: string;
  expectedAction: 'no_action' | 'recovery' | 'finance_review' | 'risk_hold';
  relatedRecordIds: string[];
  description: string;
}

// 42 deterministic resolved matches
export const DETERMINISTIC_MATCHES: GroundTruthEntry[] = [
  // --- Tier A: Exact ID matches (20 cases) ---
  { caseId: 'CIC-DM-0001', expectedCashState: 'matched', expectedRuleTier: 'tier_a', expectedAction: 'no_action', relatedRecordIds: ['pay_001', 'set_001', 'bank_001'], description: 'Exact payment → settlement → bank match via provider ID' },
  { caseId: 'CIC-DM-0002', expectedCashState: 'matched', expectedRuleTier: 'tier_a', expectedAction: 'no_action', relatedRecordIds: ['pay_002', 'set_002', 'bank_002'], description: 'Exact ID match — ₹5,000 card payment' },
  { caseId: 'CIC-DM-0003', expectedCashState: 'matched', expectedRuleTier: 'tier_a', expectedAction: 'no_action', relatedRecordIds: ['pay_003', 'set_003', 'bank_003'], description: 'Exact ID match — ₹12,500 UPI payment' },
  { caseId: 'CIC-DM-0004', expectedCashState: 'matched', expectedRuleTier: 'tier_a', expectedAction: 'no_action', relatedRecordIds: ['pay_004', 'set_004', 'bank_004'], description: 'Exact ID match — ₹8,200 netbanking' },
  { caseId: 'CIC-DM-0005', expectedCashState: 'matched', expectedRuleTier: 'tier_a', expectedAction: 'no_action', relatedRecordIds: ['pay_005', 'set_005', 'bank_005'], description: 'Exact ID match — ₹3,000 wallet payment' },
  { caseId: 'CIC-DM-0006', expectedCashState: 'matched', expectedRuleTier: 'tier_a', expectedAction: 'no_action', relatedRecordIds: ['pay_006', 'set_006', 'bank_006'], description: 'Exact ID match — ₹25,000 card payment' },
  { caseId: 'CIC-DM-0007', expectedCashState: 'matched', expectedRuleTier: 'tier_a', expectedAction: 'no_action', relatedRecordIds: ['pay_007', 'set_007', 'bank_007'], description: 'Exact ID match — ₹1,500 UPI payment' },
  { caseId: 'CIC-DM-0008', expectedCashState: 'matched', expectedRuleTier: 'tier_a', expectedAction: 'no_action', relatedRecordIds: ['pay_008', 'set_008', 'bank_008'], description: 'Exact ID match — ₹7,800 card payment' },
  { caseId: 'CIC-DM-0009', expectedCashState: 'matched', expectedRuleTier: 'tier_a', expectedAction: 'no_action', relatedRecordIds: ['pay_009', 'set_009', 'bank_009'], description: 'Exact ID match — ₹15,000 netbanking' },
  { caseId: 'CIC-DM-0010', expectedCashState: 'matched', expectedRuleTier: 'tier_a', expectedAction: 'no_action', relatedRecordIds: ['pay_010', 'set_010', 'bank_010'], description: 'Exact ID match — ₹4,200 UPI payment' },
  { caseId: 'CIC-DM-0011', expectedCashState: 'matched', expectedRuleTier: 'tier_a', expectedAction: 'no_action', relatedRecordIds: ['pay_011', 'set_011'], description: 'Exact ID match — settled but bank not yet posted (within window)' },
  { caseId: 'CIC-DM-0012', expectedCashState: 'matched', expectedRuleTier: 'tier_a', expectedAction: 'no_action', relatedRecordIds: ['pay_012', 'set_012', 'bank_011'], description: 'Exact ID match — ₹6,600 card payment' },
  { caseId: 'CIC-DM-0013', expectedCashState: 'matched', expectedRuleTier: 'tier_a', expectedAction: 'no_action', relatedRecordIds: ['pay_013', 'set_013', 'bank_012'], description: 'Exact ID match — ₹9,400 UPI' },
  { caseId: 'CIC-DM-0014', expectedCashState: 'matched', expectedRuleTier: 'tier_a', expectedAction: 'no_action', relatedRecordIds: ['pay_014', 'set_014', 'bank_013'], description: 'Exact ID match — ₹2,100 wallet' },
  { caseId: 'CIC-DM-0015', expectedCashState: 'matched', expectedRuleTier: 'tier_a', expectedAction: 'no_action', relatedRecordIds: ['pay_015', 'set_015', 'bank_014'], description: 'Exact ID match — ₹18,000 card' },
  { caseId: 'CIC-DM-0016', expectedCashState: 'matched', expectedRuleTier: 'tier_a', expectedAction: 'no_action', relatedRecordIds: ['pay_016'], description: 'Payment captured, settlement pending (in valid window)' },
  { caseId: 'CIC-DM-0017', expectedCashState: 'matched', expectedRuleTier: 'tier_a', expectedAction: 'no_action', relatedRecordIds: ['pay_017', 'set_016', 'bank_015'], description: 'Exact ID match — ₹11,200 netbanking' },
  { caseId: 'CIC-DM-0018', expectedCashState: 'matched', expectedRuleTier: 'tier_a', expectedAction: 'no_action', relatedRecordIds: ['pay_018', 'set_017', 'bank_016'], description: 'Exact ID match — ₹3,500 UPI' },
  { caseId: 'CIC-DM-0019', expectedCashState: 'matched', expectedRuleTier: 'tier_a', expectedAction: 'no_action', relatedRecordIds: ['pay_019', 'set_018', 'bank_017'], description: 'Exact ID match — ₹22,000 card' },
  { caseId: 'CIC-DM-0020', expectedCashState: 'matched', expectedRuleTier: 'tier_a', expectedAction: 'no_action', relatedRecordIds: ['pay_020', 'set_019', 'bank_018'], description: 'Exact ID match — ₹5,500 UPI' },

  // --- Tier B: Deterministic composite matches (10 cases) ---
  { caseId: 'CIC-DM-0021', expectedCashState: 'matched', expectedRuleTier: 'tier_b', expectedAction: 'no_action', relatedRecordIds: ['pay_021', 'bank_019'], description: 'Composite: UTR + amount + date window match' },
  { caseId: 'CIC-DM-0022', expectedCashState: 'matched', expectedRuleTier: 'tier_b', expectedAction: 'no_action', relatedRecordIds: ['pay_022', 'bank_020'], description: 'Composite: normalized reference + amount match' },
  { caseId: 'CIC-DM-0023', expectedCashState: 'matched', expectedRuleTier: 'tier_b', expectedAction: 'no_action', relatedRecordIds: ['inv_001', 'bank_extra_01'], description: 'Invoice-to-bank composite match via reference' },
  { caseId: 'CIC-DM-0024', expectedCashState: 'matched', expectedRuleTier: 'tier_b', expectedAction: 'no_action', relatedRecordIds: ['inv_002', 'bank_extra_02'], description: 'Invoice composite match — normalized customer name' },
  { caseId: 'CIC-DM-0025', expectedCashState: 'matched', expectedRuleTier: 'tier_b', expectedAction: 'no_action', relatedRecordIds: ['inv_003', 'bank_extra_03'], description: 'Invoice-to-bank composite — UTR reference' },
  { caseId: 'CIC-DM-0026', expectedCashState: 'matched', expectedRuleTier: 'tier_b', expectedAction: 'no_action', relatedRecordIds: ['inv_004', 'bank_extra_04'], description: 'Composite match with unique date + amount' },
  { caseId: 'CIC-DM-0027', expectedCashState: 'matched', expectedRuleTier: 'tier_b', expectedAction: 'no_action', relatedRecordIds: ['inv_005', 'bank_extra_05'], description: 'Invoice composite match — exact amount in window' },
  { caseId: 'CIC-DM-0028', expectedCashState: 'matched', expectedRuleTier: 'tier_b', expectedAction: 'no_action', relatedRecordIds: ['pay_023', 'bank_extra_06'], description: 'Payment-to-bank composite via UTR' },
  { caseId: 'CIC-DM-0029', expectedCashState: 'matched', expectedRuleTier: 'tier_b', expectedAction: 'no_action', relatedRecordIds: ['pay_024', 'bank_extra_07'], description: 'Composite with date window ±2 days' },
  { caseId: 'CIC-DM-0030', expectedCashState: 'matched', expectedRuleTier: 'tier_b', expectedAction: 'no_action', relatedRecordIds: ['inv_006', 'bank_extra_08'], description: 'Invoice composite — reference + amount match' },

  // --- Tier C: Grouped settlement matches (8 cases) ---
  { caseId: 'CIC-DM-0031', expectedCashState: 'matched', expectedRuleTier: 'tier_c', expectedAction: 'no_action', relatedRecordIds: ['pay_025', 'pay_026', 'pay_027', 'set_020', 'bank_extra_09'], description: 'Grouped: 3 payments → 1 settlement → 1 bank credit. Net = gross - fees - tax' },
  { caseId: 'CIC-DM-0032', expectedCashState: 'matched', expectedRuleTier: 'tier_c', expectedAction: 'no_action', relatedRecordIds: ['pay_028', 'pay_029', 'set_021', 'bank_extra_10'], description: 'Grouped: 2 payments → settlement with refund adjustment' },
  { caseId: 'CIC-DM-0033', expectedCashState: 'matched', expectedRuleTier: 'tier_c', expectedAction: 'no_action', relatedRecordIds: ['pay_030', 'pay_031', 'pay_032', 'pay_033', 'set_022', 'bank_extra_11'], description: 'Grouped: 4 payments → settlement. Full reconciliation example: gross ₹10,000; fee ₹200; GST ₹36; refund ₹104; net ₹9,660' },
  { caseId: 'CIC-DM-0034', expectedCashState: 'matched', expectedRuleTier: 'tier_c', expectedAction: 'no_action', relatedRecordIds: ['pay_034', 'pay_035', 'set_extra_01', 'bank_extra_12'], description: 'Grouped: 2 payments in single settlement batch' },
  { caseId: 'CIC-DM-0035', expectedCashState: 'matched', expectedRuleTier: 'tier_c', expectedAction: 'no_action', relatedRecordIds: ['pay_036', 'pay_037', 'pay_038', 'set_extra_02', 'bank_extra_13'], description: 'Grouped: 3 card payments in settlement' },
  { caseId: 'CIC-DM-0036', expectedCashState: 'matched', expectedRuleTier: 'tier_c', expectedAction: 'no_action', relatedRecordIds: ['pay_039', 'pay_040', 'set_extra_03', 'bank_extra_14'], description: 'Grouped: 2 UPI payments in settlement' },
  { caseId: 'CIC-DM-0037', expectedCashState: 'matched', expectedRuleTier: 'tier_c', expectedAction: 'no_action', relatedRecordIds: ['inv_007', 'inv_008', 'bank_extra_15'], description: 'Grouped: 2 invoice payments in single bank credit' },
  { caseId: 'CIC-DM-0038', expectedCashState: 'matched', expectedRuleTier: 'tier_c', expectedAction: 'no_action', relatedRecordIds: ['inv_009', 'inv_010', 'inv_011', 'bank_extra_16'], description: 'Grouped: 3 invoices paid in 1 bank transfer' },

  // --- Tier C.5: TDS matches (4 cases) ---
  { caseId: 'CIC-DM-0039', expectedCashState: 'matched_with_tds', expectedRuleTier: 'tier_c5', expectedAction: 'no_action', relatedRecordIds: ['inv_012', 'bank_extra_17'], description: 'TDS 1%: Invoice ₹1,00,000 gross, TDS base ₹1,00,000, TDS ₹1,000, received ₹99,000' },
  { caseId: 'CIC-DM-0040', expectedCashState: 'matched_with_tds', expectedRuleTier: 'tier_c5', expectedAction: 'no_action', relatedRecordIds: ['inv_013', 'bank_extra_18'], description: 'TDS 2%: Invoice ₹50,000 gross, TDS base ₹50,000, TDS ₹1,000, received ₹49,000' },
  { caseId: 'CIC-DM-0041', expectedCashState: 'matched_with_tds', expectedRuleTier: 'tier_c5', expectedAction: 'no_action', relatedRecordIds: ['inv_014', 'bank_extra_19'], description: 'TDS 10%: Invoice ₹2,00,000 gross, TDS base ₹2,00,000, TDS ₹20,000, received ₹1,80,000' },
  { caseId: 'CIC-DM-0042', expectedCashState: 'matched_with_tds', expectedRuleTier: 'tier_c5', expectedAction: 'no_action', relatedRecordIds: ['inv_015', 'bank_extra_20'], description: 'TDS 1% with GST: Invoice ₹1,18,000 gross (₹1,00,000 + ₹18,000 GST), TDS base ₹1,00,000, TDS ₹1,000, received ₹1,17,000' },
];

// 8 recovery-eligible cases
export const RECOVERY_ELIGIBLE: GroundTruthEntry[] = [
  { caseId: 'CIC-RE-0001', expectedCashState: 'recoverable', expectedRuleTier: 'tier_e', expectedAction: 'recovery', relatedRecordIds: ['pay_fail_001', 'ord_fail_001'], description: 'Transient payment failure — network timeout, eligible for retry' },
  { caseId: 'CIC-RE-0002', expectedCashState: 'recoverable', expectedRuleTier: 'tier_e', expectedAction: 'recovery', relatedRecordIds: ['pay_fail_002', 'ord_fail_002'], description: 'Insufficient funds — recurring UPI Autopay, valid mandate' },
  { caseId: 'CIC-RE-0003', expectedCashState: 'recoverable', expectedRuleTier: 'tier_e', expectedAction: 'recovery', relatedRecordIds: ['pay_fail_003', 'ord_fail_003'], description: 'Insufficient funds — second consecutive UPI Autopay failure, eNACH eligible' },
  { caseId: 'CIC-RE-0004', expectedCashState: 'recoverable', expectedRuleTier: 'tier_e', expectedAction: 'recovery', relatedRecordIds: ['chk_001', 'ord_chk_001'], description: 'High-intent checkout abandonment — address completed, payment method selected' },
  { caseId: 'CIC-RE-0005', expectedCashState: 'recoverable', expectedRuleTier: 'tier_e', expectedAction: 'recovery', relatedRecordIds: ['inv_overdue_001'], description: 'B2B overdue invoice — no payment received past due date' },
  { caseId: 'CIC-RE-0006', expectedCashState: 'recoverable', expectedRuleTier: 'tier_e', expectedAction: 'recovery', relatedRecordIds: ['inv_overdue_002'], description: 'B2B overdue invoice — partial payment received' },
  { caseId: 'CIC-RE-0007', expectedCashState: 'promise_to_pay', expectedRuleTier: 'tier_e', expectedAction: 'recovery', relatedRecordIds: ['inv_overdue_003', 'ptp_001'], description: 'Overdue invoice with Promise-to-Pay — Friday promise' },
  { caseId: 'CIC-RE-0008', expectedCashState: 'recoverable', expectedRuleTier: 'tier_e', expectedAction: 'recovery', relatedRecordIds: ['pay_fail_004', 'ord_fail_004'], description: 'Card expired — payment link eligible' },
];

// 7 safety/no-action cases
export const SAFETY_NO_ACTION: GroundTruthEntry[] = [
  { caseId: 'CIC-SA-0001', expectedCashState: 'closed', expectedRuleTier: 'tier_a', expectedAction: 'no_action', relatedRecordIds: ['pay_decline_001'], description: 'Hard decline — bank refused, no retry allowed' },
  { caseId: 'CIC-SA-0002', expectedCashState: 'closed', expectedRuleTier: 'tier_a', expectedAction: 'no_action', relatedRecordIds: ['pay_mandate_001'], description: 'Revoked mandate — customer cancelled authorization' },
  { caseId: 'CIC-SA-0003', expectedCashState: 'waiting_for_settlement', expectedRuleTier: 'tier_a', expectedAction: 'no_action', relatedRecordIds: ['pay_pending_001', 'set_pending_001'], description: 'Pending settlement — within expected window, no contact' },
  { caseId: 'CIC-SA-0004', expectedCashState: 'closed', expectedRuleTier: 'tier_a', expectedAction: 'no_action', relatedRecordIds: ['pay_refund_001'], description: 'Refund issued — payment already refunded' },
  { caseId: 'CIC-SA-0005', expectedCashState: 'closed', expectedRuleTier: 'tier_a', expectedAction: 'no_action', relatedRecordIds: ['pay_dispute_001'], description: 'Active dispute/chargeback — blocked from recovery' },
  { caseId: 'CIC-SA-0006', expectedCashState: 'closed', expectedRuleTier: 'tier_a', expectedAction: 'no_action', relatedRecordIds: ['chk_optout_001'], description: 'Customer opted out — no communication allowed' },
  { caseId: 'CIC-SA-0007', expectedCashState: 'closed', expectedRuleTier: 'tier_a', expectedAction: 'no_action', relatedRecordIds: ['pay_dup_001', 'pay_dup_002'], description: 'Duplicate payment attempt — later payment succeeded' },
];

// 6 finance-review exceptions
export const FINANCE_REVIEW: GroundTruthEntry[] = [
  { caseId: 'CIC-FR-0001', expectedCashState: 'finance_review', expectedRuleTier: 'tier_e', expectedAction: 'finance_review', relatedRecordIds: ['inv_208', 'set_fr_001', 'bank_fr_001', 'bank_fr_002'], description: 'INV-208 ₹50,000: Settlement ₹48,525, two bank credits ₹1,475 and ₹1,500 — ambiguous, no auto-match' },
  { caseId: 'CIC-FR-0002', expectedCashState: 'finance_review', expectedRuleTier: 'tier_e', expectedAction: 'finance_review', relatedRecordIds: ['set_short_001', 'bank_short_001'], description: 'Unexplained short settlement — ₹340 difference with no fee/tax explanation' },
  { caseId: 'CIC-FR-0003', expectedCashState: 'finance_review', expectedRuleTier: 'tier_e', expectedAction: 'finance_review', relatedRecordIds: ['inv_alias_001', 'inv_alias_002', 'bank_alias_001'], description: 'Ambiguous alias — "AWS Sub" could be two different invoices with same amount' },
  { caseId: 'CIC-FR-0004', expectedCashState: 'finance_review', expectedRuleTier: 'tier_e', expectedAction: 'finance_review', relatedRecordIds: ['bank_dup_001', 'bank_dup_002'], description: 'Duplicate bank credit — same amount, same day, different UTR' },
  { caseId: 'CIC-FR-0005', expectedCashState: 'finance_review', expectedRuleTier: 'tier_e', expectedAction: 'finance_review', relatedRecordIds: ['inv_noref_001', 'bank_noref_001'], description: 'Missing invoice reference — bank credit with no traceable invoice/payment' },
  { caseId: 'CIC-FR-0006', expectedCashState: 'finance_review', expectedRuleTier: 'tier_e', expectedAction: 'finance_review', relatedRecordIds: ['inv_tds_noevidence_001', 'bank_tds_noevidence_001'], description: 'TDS-like shortfall but no TDS evidence/base declared — cannot assume TDS, needs review' },
];

// Combine all for evaluation
export const ALL_GROUND_TRUTH: GroundTruthEntry[] = [
  ...DETERMINISTIC_MATCHES,
  ...RECOVERY_ELIGIBLE,
  ...SAFETY_NO_ACTION,
  ...FINANCE_REVIEW,
];

// Total: 42 + 8 + 7 + 6 = 63 cases built from 120 raw records
