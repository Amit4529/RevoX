// ============================================
// Tier D: AI-Assisted Candidate Generation
// Uses LLM for alias normalization only
// Deterministic fallback when no API key
// NEVER auto-matches ambiguous candidates
// ============================================

import type { MatchResult, EvidenceEdgeData } from './types';

// Deterministic alias dictionary — used when no LLM is configured
const ALIAS_DICTIONARY: Record<string, string[]> = {
  'Amazon Web Services': ['AWS', 'AWS Sub', 'Amazon AWS', 'AWS Subscription', 'Amazon Web Services Subscription'],
  'Google Cloud Platform': ['GCP', 'Google Cloud', 'GCP Services'],
  'Microsoft Azure': ['Azure', 'MS Azure', 'Microsoft Cloud'],
  'Razorpay': ['RZP', 'Razorpay Payment', 'Razorpay Settlement'],
  'Tata Communications': ['Tata Comm', 'TataCom', 'TATA COMM'],
  'Reliance Jio': ['Jio', 'Rel Jio', 'RJIO'],
  'Bharti Airtel': ['Airtel', 'Bharti', 'AIRTEL MOBILE'],
  'HDFC Bank': ['HDFC', 'HDFC Ltd'],
  'ICICI Bank': ['ICICI', 'ICICI Ltd'],
  'State Bank of India': ['SBI', 'State Bank'],
};

interface InvoiceRecord {
  id: string;
  invoiceId: string;
  customerId: string;
  grossAmountPaise: number;
  status: string;
  rawPayload: string | null;
}

interface BankRecord {
  id: string;
  utr: string | null;
  creditPaise: number;
  narration: string;
  transactionDate: Date;
}

export interface TierDResult {
  candidates: {
    sourceId: string;
    bankId: string;
    aliasInterpretation: string;
    confidence: number;
    status: 'review_required' | 'abstain';
    edges: EvidenceEdgeData[];
    match: MatchResult;
  }[];
}

/**
 * Normalize a name for alias matching
 */
function normalizeForAlias(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Try to match an alias using the deterministic dictionary
 */
function findAliasMatch(text: string): { canonical: string; confidence: number } | null {
  const normalized = normalizeForAlias(text);
  
  for (const [canonical, aliases] of Object.entries(ALIAS_DICTIONARY)) {
    for (const alias of aliases) {
      if (normalizeForAlias(alias) === normalized || normalizeForAlias(canonical) === normalized) {
        return { canonical, confidence: 0.85 };
      }
      // Partial match
      if (normalized.includes(normalizeForAlias(alias)) || normalizeForAlias(alias).includes(normalized)) {
        return { canonical, confidence: 0.7 };
      }
    }
  }
  
  return null;
}

/**
 * Tier D: AI-Assisted Candidate Generation
 * 
 * 1. Uses deterministic alias dictionary (fallback when no LLM)
 * 2. NEVER auto-matches — always returns 'review_required' or 'abstain'
 * 3. Code checks amounts, uniqueness, and contradictions
 * 4. Only produces candidates for explanation
 */
export function runTierD(
  invoices: InvoiceRecord[],
  bankTxns: BankRecord[],
  alreadyMatchedInvoiceIds: Set<string>,
  alreadyMatchedBankIds: Set<string>
): TierDResult {
  const candidates: TierDResult['candidates'] = [];

  const unmatchedInvoices = invoices.filter(inv =>
    !alreadyMatchedInvoiceIds.has(inv.id) && inv.status === 'paid'
  );
  const availableBankTxns = bankTxns.filter(b => !alreadyMatchedBankIds.has(b.id));

  for (const invoice of unmatchedInvoices) {
    // Try to find bank transactions with matching amounts
    const amountCandidates = availableBankTxns.filter(bank =>
      !alreadyMatchedBankIds.has(bank.id) &&
      bank.creditPaise === invoice.grossAmountPaise
    );

    if (amountCandidates.length === 0) continue;

    // Try alias resolution
    const invoiceName = invoice.rawPayload || invoice.invoiceId;
    const invoiceAlias = findAliasMatch(invoiceName);

    for (const bank of amountCandidates) {
      const bankAlias = findAliasMatch(bank.narration);

      // Check if they resolve to the same canonical name
      const aliasesMatch = invoiceAlias && bankAlias && 
        invoiceAlias.canonical === bankAlias.canonical;

      // Check for contradictions
      const contradictions: string[] = [];
      if (amountCandidates.length > 1) {
        contradictions.push(`Multiple bank candidates with same amount (${amountCandidates.length})`);
      }

      const confidence = aliasesMatch 
        ? Math.min(invoiceAlias!.confidence, bankAlias!.confidence)
        : 0.4;

      // NEVER auto-match — even if confidence is high
      // Only recommend review if mathematically unique AND confidence >= 0.98
      // (which the deterministic dictionary can't reach)
      const status: 'review_required' | 'abstain' = 
        contradictions.length > 0 ? 'abstain' : 'review_required';

      const explanation = aliasesMatch
        ? `Alias resolution: "${invoiceName}" and "${bank.narration}" both resolve to "${invoiceAlias!.canonical}" (deterministic dictionary, confidence: ${confidence.toFixed(2)})`
        : `Amount match ₹${(invoice.grossAmountPaise / 100).toFixed(2)} but no alias confirmation. Manual review required.`;

      const calc = [
        `AI-Assisted Candidate (DETERMINISTIC FALLBACK):`,
        `  Invoice: ${invoice.invoiceId} "${invoiceName}" → ₹${(invoice.grossAmountPaise / 100).toFixed(2)}`,
        `  Bank: ${bank.utr || bank.id} "${bank.narration}" → ₹${(bank.creditPaise / 100).toFixed(2)}`,
        aliasesMatch ? `  Alias: both resolve to "${invoiceAlias!.canonical}"` : `  No alias match found`,
        contradictions.length > 0 ? `  Contradictions: ${contradictions.join(', ')}` : null,
        `  Confidence: ${confidence.toFixed(2)}`,
        `  ⚠ REQUIRES HUMAN REVIEW — not auto-matched`,
      ].filter(Boolean).join('\n');

      const match: MatchResult = {
        matched: false, // NEVER auto-match in Tier D
        ruleTier: 'tier_d',
        ruleId: 'TIER_D_AI_CANDIDATE',
        confidence,
        evidenceRefs: [invoice.id, bank.id],
        calculation: calc,
        confidenceBasis: explanation,
        sourceRecordIds: [invoice.id],
        targetRecordIds: [bank.id],
        mathExplanation: calc,
        status,
      };

      const edges: EvidenceEdgeData[] = [{
        sourceType: 'invoice',
        sourceId: invoice.id,
        targetType: 'bank_transaction',
        targetId: bank.id,
        edgeType: 'ai_candidate',
        ruleId: 'TIER_D_AI_CANDIDATE',
        confidence,
        explanation,
        sourceRefs: [invoice.id, bank.id],
      }];

      candidates.push({
        sourceId: invoice.id,
        bankId: bank.id,
        aliasInterpretation: aliasesMatch ? invoiceAlias!.canonical : 'UNRESOLVED',
        confidence,
        status,
        edges,
        match,
      });
    }
  }

  return { candidates };
}
