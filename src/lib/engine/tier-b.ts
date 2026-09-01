// ============================================
// Tier B: Deterministic Composite Match
// Match normalized reference/UTR + amount + unique date window
// Auto-match only if the candidate is unique
// ============================================

import type { MatchResult, EvidenceEdgeData } from './types';

interface InvoiceRecord {
  id: string;
  invoiceId: string;
  customerId: string;
  grossAmountPaise: number;
  netAmountPaise: number;
  outstandingPaise: number;
  status: string;
  dueDate: Date;
  rawPayload: string | null;
}

interface BankRecord {
  id: string;
  utr: string | null;
  creditPaise: number;
  narration: string;
  transactionDate: Date;
}

interface PaymentRecord {
  id: string;
  providerId: string;
  amountPaise: number;
  status: string;
  capturedAt: Date | null;
}

// Configurable date window for composite matching (in days)
const DATE_WINDOW_DAYS = 3;

export interface TierBResult {
  matches: {
    sourceType: 'invoice' | 'payment';
    sourceId: string;
    bankId: string;
    match: MatchResult;
    edges: EvidenceEdgeData[];
  }[];
  unmatchedInvoices: string[];
  unmatchedPayments: string[];
  unmatchedBankTxns: string[];
}

/**
 * Normalize a reference string for matching
 */
function normalizeRef(ref: string): string {
  return ref.toUpperCase().replace(/[\s\-_./]/g, '').trim();
}

/**
 * Check if two dates are within the configured window
 */
function withinDateWindow(date1: Date, date2: Date): boolean {
  const diffMs = Math.abs(date1.getTime() - date2.getTime());
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays <= DATE_WINDOW_DAYS;
}

/**
 * Check if a bank narration contains a reference to a record
 */
function narrationContainsRef(narration: string, ref: string): boolean {
  const normNarration = normalizeRef(narration);
  const normRef = normalizeRef(ref);
  return normNarration.includes(normRef);
}

/**
 * Tier B: Deterministic Composite Match
 * 
 * Match invoices/payments to bank transactions using:
 * - Normalized UTR/reference match
 * - Amount match (integer paise)
 * - Date window constraint (configurable)
 * - Only auto-match if candidate is UNIQUE
 */
export function runTierB(
  invoices: InvoiceRecord[],
  payments: PaymentRecord[],
  bankTxns: BankRecord[],
  alreadyMatchedBankIds: Set<string>,
  alreadyMatchedPaymentIds: Set<string>
): TierBResult {
  const matches: TierBResult['matches'] = [];
  const matchedInvoiceIds = new Set<string>();
  const matchedPaymentIds = new Set<string>();
  const matchedBankIds = new Set<string>(alreadyMatchedBankIds);

  const availableBankTxns = bankTxns.filter(b => !alreadyMatchedBankIds.has(b.id));
  const availablePayments = payments.filter(p => 
    !alreadyMatchedPaymentIds.has(p.id) && p.status === 'captured'
  );

  // --- Invoice to Bank matching ---
  for (const invoice of invoices) {
    if (invoice.outstandingPaise > 0 && invoice.status !== 'paid') continue; // Skip unpaid
    
    // Find bank transactions that match by:
    // 1. Amount equals invoice gross/net
    // 2. Narration contains invoice ID or UTR matches
    // 3. Within date window
    const candidates = availableBankTxns.filter(bank => {
      if (matchedBankIds.has(bank.id)) return false;

      // Amount must match exactly (integer comparison)
      const amountMatch = bank.creditPaise === invoice.grossAmountPaise || 
                          bank.creditPaise === invoice.netAmountPaise;
      if (!amountMatch) return false;

      // Reference match: narration contains invoice ID
      const refMatch = narrationContainsRef(bank.narration, invoice.invoiceId) ||
                       (bank.utr && narrationContainsRef(invoice.invoiceId, bank.utr || ''));
      
      // Date window check
      const dateMatch = withinDateWindow(bank.transactionDate, invoice.dueDate);

      return (refMatch || dateMatch) && amountMatch;
    });

    // Only auto-match if exactly ONE unique candidate
    if (candidates.length === 1) {
      const bank = candidates[0];
      const calc = `Invoice ${invoice.invoiceId}: ₹${(invoice.grossAmountPaise / 100).toFixed(2)} → ` +
        `Bank ${bank.utr || bank.id}: ₹${(bank.creditPaise / 100).toFixed(2)} ` +
        `(date window: ±${DATE_WINDOW_DAYS} days) ✓ COMPOSITE MATCH`;

      const match: MatchResult = {
        matched: true,
        ruleTier: 'tier_b',
        ruleId: 'TIER_B_COMPOSITE',
        confidence: 0.95,
        evidenceRefs: [invoice.id, bank.id],
        calculation: calc,
        confidenceBasis: `Unique composite match: amount ₹${(bank.creditPaise / 100).toFixed(2)} + reference/date window (±${DATE_WINDOW_DAYS} days)`,
        sourceRecordIds: [invoice.id],
        targetRecordIds: [bank.id],
        mathExplanation: calc,
        status: 'auto_matched',
      };

      const edges: EvidenceEdgeData[] = [{
        sourceType: 'invoice',
        sourceId: invoice.id,
        targetType: 'bank_transaction',
        targetId: bank.id,
        edgeType: 'composite',
        ruleId: 'TIER_B_COMPOSITE',
        confidence: 0.95,
        explanation: `Invoice ${invoice.invoiceId} composite-matched to bank credit ${bank.utr || bank.id}: amount ₹${(bank.creditPaise / 100).toFixed(2)} within ${DATE_WINDOW_DAYS}-day window`,
        sourceRefs: [invoice.id, bank.id],
      }];

      matches.push({ sourceType: 'invoice', sourceId: invoice.id, bankId: bank.id, match, edges });
      matchedInvoiceIds.add(invoice.id);
      matchedBankIds.add(bank.id);
    }
  }

  // --- Payment to Bank matching (for payments without settlement) ---
  for (const payment of availablePayments) {
    const candidates = availableBankTxns.filter(bank => {
      if (matchedBankIds.has(bank.id)) return false;

      // Check UTR/reference in narration
      const refMatch = narrationContainsRef(bank.narration, payment.providerId) ||
                       (bank.utr && normalizeRef(bank.utr).includes(normalizeRef(payment.providerId)));
      
      // Amount match
      const amountMatch = bank.creditPaise === payment.amountPaise;

      // Date window
      const dateMatch = payment.capturedAt ? withinDateWindow(bank.transactionDate, payment.capturedAt) : false;

      return amountMatch && (refMatch || dateMatch);
    });

    if (candidates.length === 1) {
      const bank = candidates[0];
      const calc = `Payment ${payment.providerId}: ₹${(payment.amountPaise / 100).toFixed(2)} → ` +
        `Bank ${bank.utr || bank.id}: ₹${(bank.creditPaise / 100).toFixed(2)} ` +
        `(date window: ±${DATE_WINDOW_DAYS} days) ✓ COMPOSITE MATCH`;

      const match: MatchResult = {
        matched: true,
        ruleTier: 'tier_b',
        ruleId: 'TIER_B_COMPOSITE',
        confidence: 0.93,
        evidenceRefs: [payment.id, bank.id],
        calculation: calc,
        confidenceBasis: `Unique composite match: payment amount + UTR/reference/date`,
        sourceRecordIds: [payment.id],
        targetRecordIds: [bank.id],
        mathExplanation: calc,
        status: 'auto_matched',
      };

      const edges: EvidenceEdgeData[] = [{
        sourceType: 'payment',
        sourceId: payment.id,
        targetType: 'bank_transaction',
        targetId: bank.id,
        edgeType: 'composite',
        ruleId: 'TIER_B_COMPOSITE',
        confidence: 0.93,
        explanation: `Payment ${payment.providerId} composite-matched to bank credit ${bank.utr || bank.id}`,
        sourceRefs: [payment.id, bank.id],
      }];

      matches.push({ sourceType: 'payment', sourceId: payment.id, bankId: bank.id, match, edges });
      matchedPaymentIds.add(payment.id);
      matchedBankIds.add(bank.id);
    }
  }

  const unmatchedInvoices = invoices
    .filter(inv => !matchedInvoiceIds.has(inv.id) && inv.status === 'paid')
    .map(inv => inv.id);
  const unmatchedPayments = availablePayments
    .filter(p => !matchedPaymentIds.has(p.id))
    .map(p => p.id);
  const unmatchedBankTxns = availableBankTxns
    .filter(b => !matchedBankIds.has(b.id))
    .map(b => b.id);

  return { matches, unmatchedInvoices, unmatchedPayments, unmatchedBankTxns };
}
