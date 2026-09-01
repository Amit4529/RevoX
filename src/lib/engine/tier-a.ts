// ============================================
// Tier A: Exact ID Match
// Match provider payment/order/settlement/invoice IDs
// Exact amount relationship required
// Auto-match only when all constraints pass
// ============================================

import type { MatchResult, EvidenceEdgeData } from './types';

interface PaymentRecord {
  id: string;
  providerId: string;
  orderId: string;
  amountPaise: number;
  status: string;
  method: string;
  failureCode: string | null;
  failureCategory: string | null;
  capturedAt: Date | null;
  gatewayResponse: string | null;
}

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

export interface TierAResult {
  matchedPaymentSettlements: {
    paymentId: string;
    settlementId: string;
    settlementLineId: string;
    bankId: string | null;
    match: MatchResult;
    edges: EvidenceEdgeData[];
  }[];
  unmatchedPayments: string[];
  unmatchedSettlements: string[];
  unmatchedBankTxns: string[];
}

/**
 * Tier A: Exact ID Match
 * 
 * 1. Match payments to settlement lines via payment ID
 * 2. Match settlements to bank transactions via settlement net amount
 * 
 * All amount comparisons use integer paise — NEVER floats.
 */
export function runTierA(
  payments: PaymentRecord[],
  settlements: SettlementRecord[],
  bankTxns: BankRecord[]
): TierAResult {
  const matchedPaymentSettlements: TierAResult['matchedPaymentSettlements'] = [];
  const matchedPaymentIds = new Set<string>();
  const matchedSettlementIds = new Set<string>();
  const matchedBankIds = new Set<string>();

  // Build lookup: payment ID -> settlement line
  const paymentToSettlementLine = new Map<string, { settlement: SettlementRecord; line: SettlementRecord['lines'][0] }>();
  for (const settlement of settlements) {
    for (const line of settlement.lines) {
      paymentToSettlementLine.set(line.paymentAttemptId, { settlement, line });
    }
  }

  // Build lookup: settlement net amount -> bank transactions (for exact amount match)
  // We match settlement net to bank credit
  const bankByAmount = new Map<number, BankRecord[]>();
  for (const bank of bankTxns) {
    const existing = bankByAmount.get(bank.creditPaise) || [];
    existing.push(bank);
    bankByAmount.set(bank.creditPaise, existing);
  }

  // Only process captured payments for Tier A matching
  const capturedPayments = payments.filter(p => p.status === 'captured');

  for (const payment of capturedPayments) {
    const settlementMatch = paymentToSettlementLine.get(payment.id);
    if (!settlementMatch) continue;

    const { settlement, line } = settlementMatch;

    // Verify exact amount: payment amount must equal settlement line gross
    // Integer comparison — no floats
    if (payment.amountPaise !== line.grossPaise) continue;

    // For individual settlements (1 line), try to find bank match
    let bankMatch: BankRecord | null = null;
    if (settlement.lines.length === 1) {
      // Find bank credit matching settlement net amount
      const candidates = bankByAmount.get(settlement.netAmountPaise) || [];
      const available = candidates.filter(b => !matchedBankIds.has(b.id));
      if (available.length === 1) {
        // Unique match — auto-match
        bankMatch = available[0];
        matchedBankIds.add(bankMatch.id);
      }
      // If multiple candidates, don't auto-match (would be Tier B or higher)
    }

    const evidenceRefs = [payment.id, settlement.id, line.id];
    if (bankMatch) evidenceRefs.push(bankMatch.id);

    // Build calculation explanation
    const calc = bankMatch
      ? `Payment ${payment.providerId}: ₹${(payment.amountPaise / 100).toFixed(2)} → ` +
        `Settlement ${settlement.settlementId}: gross ₹${(line.grossPaise / 100).toFixed(2)}, ` +
        `fee ₹${(line.feePaise / 100).toFixed(2)}, tax ₹${(line.taxPaise / 100).toFixed(2)}, ` +
        `net ₹${(line.netPaise / 100).toFixed(2)} → ` +
        `Bank ${bankMatch.utr || bankMatch.id}: ₹${(bankMatch.creditPaise / 100).toFixed(2)} ✓ EXACT MATCH`
      : `Payment ${payment.providerId}: ₹${(payment.amountPaise / 100).toFixed(2)} → ` +
        `Settlement ${settlement.settlementId}: gross ₹${(line.grossPaise / 100).toFixed(2)}, ` +
        `net ₹${(line.netPaise / 100).toFixed(2)} ✓ SETTLEMENT MATCHED (bank pending)`;

    const match: MatchResult = {
      matched: true,
      ruleTier: 'tier_a',
      ruleId: 'TIER_A_EXACT_ID',
      confidence: bankMatch ? 1.0 : 0.95,
      evidenceRefs,
      calculation: calc,
      confidenceBasis: bankMatch
        ? 'Exact payment ID → settlement line → bank credit amount match'
        : 'Exact payment ID → settlement line match; bank credit pending/not yet posted',
      sourceRecordIds: [payment.id],
      targetRecordIds: bankMatch ? [settlement.id, bankMatch.id] : [settlement.id],
      mathExplanation: calc,
      status: 'auto_matched',
    };

    const edges: EvidenceEdgeData[] = [
      {
        sourceType: 'payment',
        sourceId: payment.id,
        targetType: 'settlement',
        targetId: settlement.id,
        edgeType: 'exact_id',
        ruleId: 'TIER_A_EXACT_ID',
        confidence: 1.0,
        explanation: `Payment ${payment.providerId} linked to settlement ${settlement.settlementId} via settlement line`,
        sourceRefs: [payment.id, line.id],
      },
    ];

    if (bankMatch) {
      edges.push({
        sourceType: 'settlement',
        sourceId: settlement.id,
        targetType: 'bank_transaction',
        targetId: bankMatch.id,
        edgeType: 'exact_id',
        ruleId: 'TIER_A_EXACT_AMOUNT',
        confidence: 1.0,
        explanation: `Settlement net ₹${(settlement.netAmountPaise / 100).toFixed(2)} exactly matches bank credit ₹${(bankMatch.creditPaise / 100).toFixed(2)}`,
        sourceRefs: [settlement.id, bankMatch.id],
      });
    }

    matchedPaymentSettlements.push({
      paymentId: payment.id,
      settlementId: settlement.id,
      settlementLineId: line.id,
      bankId: bankMatch?.id || null,
      match,
      edges,
    });

    matchedPaymentIds.add(payment.id);
    matchedSettlementIds.add(settlement.id);
  }

  // Collect unmatched
  const unmatchedPayments = payments
    .filter(p => !matchedPaymentIds.has(p.id))
    .map(p => p.id);
  const unmatchedSettlements = settlements
    .filter(s => !matchedSettlementIds.has(s.id))
    .map(s => s.id);
  const unmatchedBankTxns = bankTxns
    .filter(b => !matchedBankIds.has(b.id))
    .map(b => b.id);

  return {
    matchedPaymentSettlements,
    unmatchedPayments,
    unmatchedSettlements,
    unmatchedBankTxns,
  };
}
