// ============================================
// Tier C: Deterministic Grouped Settlement Match
// Match a bank credit to a settlement composition:
// net = gross payments - known fees - taxes - transfers +/- adjustments/refunds
// Integer arithmetic only; visibly show each component
// ============================================

import type { MatchResult, EvidenceEdgeData } from './types';

interface SettlementRecord {
  id: string;
  settlementId: string;
  grossAmountPaise: number;
  feePaise: number;
  taxPaise: number;
  adjustmentPaise: number;
  netAmountPaise: number;
  status: string;
  settledAt: Date | null;
  lines: {
    id: string;
    paymentAttemptId: string;
    grossPaise: number;
    feePaise: number;
    taxPaise: number;
    netPaise: number;
  }[];
}

interface BankRecord {
  id: string;
  utr: string | null;
  creditPaise: number;
  narration: string;
  transactionDate: Date;
}

export interface TierCResult {
  matches: {
    settlementId: string;
    bankId: string;
    paymentIds: string[];
    match: MatchResult;
    edges: EvidenceEdgeData[];
  }[];
  unmatchedSettlements: string[];
  unmatchedBankTxns: string[];
}

/**
 * Verify settlement arithmetic integrity using INTEGER arithmetic only.
 * Returns the breakdown string and whether math is valid.
 */
function verifySettlementArithmetic(settlement: SettlementRecord): {
  valid: boolean;
  breakdown: string;
  computedNet: number;
} {
  // Sum line-level values
  const linesGross = settlement.lines.reduce((sum, l) => sum + l.grossPaise, 0);
  const linesFees = settlement.lines.reduce((sum, l) => sum + l.feePaise, 0);
  const linesTax = settlement.lines.reduce((sum, l) => sum + l.taxPaise, 0);

  // Compute expected net from settlement header
  // net = gross - fees - tax + adjustments (adjustments can be negative for refunds)
  const computedNet = settlement.grossAmountPaise - settlement.feePaise - settlement.taxPaise + settlement.adjustmentPaise;

  const valid = computedNet === settlement.netAmountPaise;

  const paymentLines = settlement.lines.map((l, i) => 
    `  Payment ${i + 1} (${l.paymentAttemptId}): gross ₹${(l.grossPaise / 100).toFixed(2)}, fee ₹${(l.feePaise / 100).toFixed(2)}, tax ₹${(l.taxPaise / 100).toFixed(2)}, net ₹${(l.netPaise / 100).toFixed(2)}`
  ).join('\n');

  const breakdown = [
    `Settlement ${settlement.settlementId}:`,
    `  Gross: ₹${(settlement.grossAmountPaise / 100).toFixed(2)} (${settlement.lines.length} payments)`,
    paymentLines,
    `  Total gross: ₹${(linesGross / 100).toFixed(2)}`,
    `  Fees: -₹${(settlement.feePaise / 100).toFixed(2)}`,
    `  Tax: -₹${(settlement.taxPaise / 100).toFixed(2)}`,
    settlement.adjustmentPaise !== 0 ? `  Adjustments: ${settlement.adjustmentPaise >= 0 ? '+' : ''}₹${(settlement.adjustmentPaise / 100).toFixed(2)}` : null,
    `  Net: ₹${(settlement.netAmountPaise / 100).toFixed(2)}`,
    `  Computed: ${settlement.grossAmountPaise} - ${settlement.feePaise} - ${settlement.taxPaise} ${settlement.adjustmentPaise !== 0 ? `+ (${settlement.adjustmentPaise})` : ''} = ${computedNet} paise`,
    valid ? '  ✓ Arithmetic verified' : `  ✗ MISMATCH: computed ${computedNet} vs stated ${settlement.netAmountPaise}`,
  ].filter(Boolean).join('\n');

  return { valid, breakdown, computedNet };
}

/**
 * Tier C: Grouped Settlement Match
 * 
 * For settlements with multiple payment lines:
 * 1. Verify settlement arithmetic (integer only)
 * 2. Find bank credit matching settlement net
 * 3. Auto-match only if arithmetic is verified and bank match is unique
 */
export function runTierC(
  settlements: SettlementRecord[],
  bankTxns: BankRecord[],
  alreadyMatchedSettlementIds: Set<string>,
  alreadyMatchedBankIds: Set<string>
): TierCResult {
  const matches: TierCResult['matches'] = [];
  const matchedSettlementIds = new Set<string>();
  const matchedBankIds = new Set<string>(alreadyMatchedBankIds);

  // Only process settlements with multiple lines (grouped)
  // Also process unmatched single-line settlements
  const eligibleSettlements = settlements.filter(s => 
    !alreadyMatchedSettlementIds.has(s.id) && 
    s.status === 'settled' &&
    s.lines.length > 0
  );

  const availableBankTxns = bankTxns.filter(b => !alreadyMatchedBankIds.has(b.id));

  for (const settlement of eligibleSettlements) {
    // Step 1: Verify arithmetic
    const arithmetic = verifySettlementArithmetic(settlement);
    if (!arithmetic.valid) {
      // Arithmetic doesn't verify — this becomes a finance_review exception
      continue;
    }

    // Step 2: Find bank credit matching settlement net amount (exact integer match)
    const candidates = availableBankTxns.filter(bank => {
      if (matchedBankIds.has(bank.id)) return false;
      return bank.creditPaise === settlement.netAmountPaise;
    });

    if (candidates.length !== 1) continue; // Must be unique

    const bank = candidates[0];
    const paymentIds = settlement.lines.map(l => l.paymentAttemptId);

    const calc = [
      arithmetic.breakdown,
      `  → Bank ${bank.utr || bank.id}: ₹${(bank.creditPaise / 100).toFixed(2)}`,
      `  ✓ GROUPED SETTLEMENT MATCH (${settlement.lines.length} payments)`,
    ].join('\n');

    const match: MatchResult = {
      matched: true,
      ruleTier: 'tier_c',
      ruleId: 'TIER_C_GROUPED_SETTLEMENT',
      confidence: 1.0,
      evidenceRefs: [settlement.id, bank.id, ...paymentIds],
      calculation: calc,
      confidenceBasis: `Grouped settlement: ${settlement.lines.length} payments → verified arithmetic → unique bank credit match`,
      sourceRecordIds: paymentIds,
      targetRecordIds: [settlement.id, bank.id],
      mathExplanation: calc,
      status: 'auto_matched',
    };

    const edges: EvidenceEdgeData[] = [
      // Payment → Settlement edges
      ...settlement.lines.map(line => ({
        sourceType: 'payment',
        sourceId: line.paymentAttemptId,
        targetType: 'settlement',
        targetId: settlement.id,
        edgeType: 'grouped_settlement',
        ruleId: 'TIER_C_GROUPED_SETTLEMENT',
        confidence: 1.0,
        explanation: `Payment ${line.paymentAttemptId}: gross ₹${(line.grossPaise / 100).toFixed(2)} in grouped settlement ${settlement.settlementId}`,
        sourceRefs: [line.paymentAttemptId, settlement.id],
      })),
      // Settlement → Bank edge
      {
        sourceType: 'settlement',
        sourceId: settlement.id,
        targetType: 'bank_transaction',
        targetId: bank.id,
        edgeType: 'grouped_settlement',
        ruleId: 'TIER_C_GROUPED_SETTLEMENT',
        confidence: 1.0,
        explanation: `Settlement ${settlement.settlementId} net ₹${(settlement.netAmountPaise / 100).toFixed(2)} matches bank credit ₹${(bank.creditPaise / 100).toFixed(2)}`,
        sourceRefs: [settlement.id, bank.id],
      },
    ];

    matches.push({
      settlementId: settlement.id,
      bankId: bank.id,
      paymentIds,
      match,
      edges,
    });

    matchedSettlementIds.add(settlement.id);
    matchedBankIds.add(bank.id);
    // Also mark all payment IDs as matched
  }

  const unmatchedSettlements = eligibleSettlements
    .filter(s => !matchedSettlementIds.has(s.id))
    .map(s => s.id);
  const unmatchedBankTxns = availableBankTxns
    .filter(b => !matchedBankIds.has(b.id))
    .map(b => b.id);

  return { matches, unmatchedSettlements, unmatchedBankTxns };
}

// Also match grouped invoice payments to bank
export interface TierCInvoiceResult {
  matches: {
    invoiceIds: string[];
    bankId: string;
    match: MatchResult;
    edges: EvidenceEdgeData[];
  }[];
}

interface InvoiceRecord {
  id: string;
  invoiceId: string;
  customerId: string;
  grossAmountPaise: number;
  status: string;
}

/**
 * Tier C Invoice Grouping: Multiple invoices paid in a single bank transfer
 * Groups invoices by customer, sums amounts, matches to bank credit
 */
export function runTierCInvoices(
  invoices: InvoiceRecord[],
  bankTxns: BankRecord[],
  alreadyMatchedInvoiceIds: Set<string>,
  alreadyMatchedBankIds: Set<string>
): TierCInvoiceResult {
  const matches: TierCInvoiceResult['matches'] = [];
  const matchedBankIds = new Set<string>(alreadyMatchedBankIds);

  // Group paid invoices by customer
  const paidInvoices = invoices.filter(inv => 
    !alreadyMatchedInvoiceIds.has(inv.id) && inv.status === 'paid'
  );

  const byCustomer = new Map<string, InvoiceRecord[]>();
  for (const inv of paidInvoices) {
    const existing = byCustomer.get(inv.customerId) || [];
    existing.push(inv);
    byCustomer.set(inv.customerId, existing);
  }

  // For each customer with multiple invoices, try grouped matching
  for (const [customerId, custInvoices] of byCustomer) {
    if (custInvoices.length < 2) continue;

    // Try all combinations of 2+ invoices
    // For the seeded data, try pairs and triples
    for (let size = custInvoices.length; size >= 2; size--) {
      const combos = getCombinations(custInvoices, size);
      for (const combo of combos) {
        const totalPaise = combo.reduce((sum, inv) => sum + inv.grossAmountPaise, 0);
        const invoiceIds = combo.map(inv => inv.id);

        // Check if any of these invoices are already matched
        if (invoiceIds.some(id => alreadyMatchedInvoiceIds.has(id))) continue;

        // Find unique bank match
        const candidates = bankTxns.filter(bank => {
          if (matchedBankIds.has(bank.id)) return false;
          return bank.creditPaise === totalPaise;
        });

        if (candidates.length === 1) {
          const bank = candidates[0];

          const invoiceList = combo.map(inv => 
            `  ${inv.invoiceId}: ₹${(inv.grossAmountPaise / 100).toFixed(2)}`
          ).join('\n');

          const calc = [
            `Grouped Invoice Payment:`,
            invoiceList,
            `  Total: ₹${(totalPaise / 100).toFixed(2)}`,
            `  → Bank ${bank.utr || bank.id}: ₹${(bank.creditPaise / 100).toFixed(2)}`,
            `  ✓ GROUPED INVOICE MATCH (${combo.length} invoices)`,
          ].join('\n');

          const match: MatchResult = {
            matched: true,
            ruleTier: 'tier_c',
            ruleId: 'TIER_C_GROUPED_INVOICE',
            confidence: 0.95,
            evidenceRefs: [...invoiceIds, bank.id],
            calculation: calc,
            confidenceBasis: `${combo.length} invoices from same customer sum to exact bank credit amount`,
            sourceRecordIds: invoiceIds,
            targetRecordIds: [bank.id],
            mathExplanation: calc,
            status: 'auto_matched',
          };

          const edges: EvidenceEdgeData[] = combo.map(inv => ({
            sourceType: 'invoice',
            sourceId: inv.id,
            targetType: 'bank_transaction',
            targetId: bank.id,
            edgeType: 'grouped_settlement',
            ruleId: 'TIER_C_GROUPED_INVOICE',
            confidence: 0.95,
            explanation: `Invoice ${inv.invoiceId} (₹${(inv.grossAmountPaise / 100).toFixed(2)}) in grouped payment to bank ${bank.utr || bank.id}`,
            sourceRefs: [inv.id, bank.id],
          }));

          matches.push({ invoiceIds, bankId: bank.id, match, edges });
          matchedBankIds.add(bank.id);
          for (const id of invoiceIds) alreadyMatchedInvoiceIds.add(id);
          break; // Found match for this group
        }
      }
    }
  }

  return { matches };
}

/**
 * Get all combinations of size `k` from array
 */
function getCombinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  
  const result: T[][] = [];
  
  function combine(start: number, current: T[]) {
    if (current.length === k) {
      result.push([...current]);
      return;
    }
    for (let i = start; i < arr.length; i++) {
      current.push(arr[i]);
      combine(i + 1, current);
      current.pop();
    }
  }
  
  combine(0, []);
  return result;
}
