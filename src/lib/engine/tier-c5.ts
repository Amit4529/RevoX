// ============================================
// Tier C.5: Deterministic B2B TDS Line-Item Matcher
// India-specific tax-line matching rule for invoice shortfall
// NEVER matches simply because gross - bank = X%
// Requires actual invoice/payer evidence
// ============================================

import type { MatchResult, EvidenceEdgeData } from './types';

interface InvoiceRecord {
  id: string;
  invoiceId: string;
  customerId: string;
  grossAmountPaise: number;
  netAmountPaise: number;
  outstandingPaise: number;
  gstAmountPaise: number;
  tdsApplicable: boolean;
  tdsBasePaise: number | null;
  tdsRate: number | null;
  tdsRuleId: string | null;
  status: string;
}

interface TdsRuleRecord {
  id: string;
  ruleId: string;
  section: string;
  ratePercent: number;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  description: string | null;
}

interface TdsEvidenceRecord {
  id: string;
  invoiceId: string;
  tdsRuleId: string;
  declaredBasePaise: number;
  expectedTdsPaise: number;
  actualTdsPaise: number | null;
  payerReference: string | null;
  reviewStatus: string;
}

interface BankRecord {
  id: string;
  utr: string | null;
  creditPaise: number;
  narration: string;
  transactionDate: Date;
}

export interface TierC5Result {
  matches: {
    invoiceId: string;
    bankId: string;
    tdsRuleId: string;
    tdsAmountPaise: number;
    match: MatchResult;
    edges: EvidenceEdgeData[];
  }[];
  reviewCases: {
    invoiceId: string;
    bankId: string;
    reason: string;
    details: string;
  }[];
}

/**
 * Tier C.5: TDS Line-Item Matcher
 * 
 * Requirements from prompt:
 * - Evaluate against versioned/configurable TdsRule, effective date, declared tds_base_paise
 * - NEVER match simply because gross - bank = 1%, 2%, or 10%
 * - Must have actual TDS evidence/base and matching rule
 * - Show: invoice gross, GST, TDS base, rate, expected TDS, received bank, residual
 * - If all declared facts match → matched_with_tds
 * - If evidence missing → finance_review (don't guess)
 */
export function runTierC5(
  invoices: InvoiceRecord[],
  tdsRules: TdsRuleRecord[],
  tdsEvidence: TdsEvidenceRecord[],
  bankTxns: BankRecord[],
  alreadyMatchedInvoiceIds: Set<string>,
  alreadyMatchedBankIds: Set<string>,
  referenceDate: Date = new Date()
): TierC5Result {
  const matches: TierC5Result['matches'] = [];
  const reviewCases: TierC5Result['reviewCases'] = [];

  // Build lookups
  const ruleById = new Map<string, TdsRuleRecord>();
  for (const rule of tdsRules) ruleById.set(rule.id, rule);

  const evidenceByInvoice = new Map<string, TdsEvidenceRecord[]>();
  for (const ev of tdsEvidence) {
    const existing = evidenceByInvoice.get(ev.invoiceId) || [];
    existing.push(ev);
    evidenceByInvoice.set(ev.invoiceId, existing);
  }

  // Filter TDS-applicable invoices that aren't already matched
  const tdsInvoices = invoices.filter(inv =>
    !alreadyMatchedInvoiceIds.has(inv.id) &&
    inv.tdsApplicable &&
    inv.tdsRuleId !== null &&
    inv.tdsBasePaise !== null &&
    inv.tdsRate !== null
  );

  const availableBankTxns = bankTxns.filter(b => !alreadyMatchedBankIds.has(b.id));

  for (const invoice of tdsInvoices) {
    // Step 1: Get and validate TDS rule
    const rule = ruleById.get(invoice.tdsRuleId!);
    if (!rule) {
      reviewCases.push({
        invoiceId: invoice.id,
        bankId: '',
        reason: 'TDS rule not found',
        details: `Invoice ${invoice.invoiceId} references TDS rule ${invoice.tdsRuleId} which does not exist`,
      });
      continue;
    }

    // Step 2: Check rule effective date
    if (referenceDate < rule.effectiveFrom) {
      reviewCases.push({
        invoiceId: invoice.id,
        bankId: '',
        reason: 'TDS rule not yet effective',
        details: `Rule ${rule.ruleId} effective from ${rule.effectiveFrom.toISOString()} but reference date is ${referenceDate.toISOString()}`,
      });
      continue;
    }
    if (rule.effectiveTo && referenceDate > rule.effectiveTo) {
      reviewCases.push({
        invoiceId: invoice.id,
        bankId: '',
        reason: 'TDS rule expired',
        details: `Rule ${rule.ruleId} expired on ${rule.effectiveTo.toISOString()}`,
      });
      continue;
    }

    // Step 3: Check TDS evidence exists
    const evidence = evidenceByInvoice.get(invoice.id);
    if (!evidence || evidence.length === 0) {
      reviewCases.push({
        invoiceId: invoice.id,
        bankId: '',
        reason: 'No TDS evidence',
        details: `Invoice ${invoice.invoiceId} has tdsApplicable=true but no TDS evidence records. Cannot assume TDS.`,
      });
      continue;
    }

    // Step 4: Calculate expected TDS amount using INTEGER arithmetic
    const tdsBasePaise = invoice.tdsBasePaise!;
    // TDS amount = base × rate (using integer math)
    // We multiply by rate and round, but since rates are like 0.01, 0.02, 0.10,
    // we can compute: tdsBasePaise * ratePercent
    const expectedTdsPaise = Math.round(tdsBasePaise * invoice.tdsRate!);

    // Step 5: Calculate expected bank amount
    // Bank should receive: invoice gross - TDS amount
    const expectedBankPaise = invoice.grossAmountPaise - expectedTdsPaise;

    // Step 6: Verify evidence matches
    const verifiedEvidence = evidence.find(ev =>
      ev.reviewStatus === 'verified' &&
      ev.declaredBasePaise === tdsBasePaise &&
      ev.expectedTdsPaise === expectedTdsPaise
    );

    if (!verifiedEvidence) {
      reviewCases.push({
        invoiceId: invoice.id,
        bankId: '',
        reason: 'TDS evidence not verified or mismatched',
        details: `Invoice ${invoice.invoiceId}: declared base ₹${(tdsBasePaise / 100).toFixed(2)}, expected TDS ₹${(expectedTdsPaise / 100).toFixed(2)}, but no verified matching evidence found`,
      });
      continue;
    }

    // Step 7: Find bank credit matching expected amount
    const candidates = availableBankTxns.filter(bank => {
      if (alreadyMatchedBankIds.has(bank.id)) return false;
      return bank.creditPaise === expectedBankPaise;
    });

    if (candidates.length === 0) {
      reviewCases.push({
        invoiceId: invoice.id,
        bankId: '',
        reason: 'No bank credit matching expected post-TDS amount',
        details: `Invoice ${invoice.invoiceId}: expected ₹${(expectedBankPaise / 100).toFixed(2)} after TDS, but no bank credit found`,
      });
      continue;
    }

    if (candidates.length > 1) {
      reviewCases.push({
        invoiceId: invoice.id,
        bankId: '',
        reason: 'Multiple bank credits match post-TDS amount — ambiguous',
        details: `Invoice ${invoice.invoiceId}: ${candidates.length} bank credits of ₹${(expectedBankPaise / 100).toFixed(2)} found. Cannot auto-match.`,
      });
      continue;
    }

    const bank = candidates[0];

    // Step 8: Compute residual
    const residualPaise = expectedBankPaise - bank.creditPaise; // Should be 0 for exact match

    // Build detailed calculation
    const calcLines = [
      `TDS Line-Item Match for ${invoice.invoiceId}:`,
      `  Invoice gross: ₹${(invoice.grossAmountPaise / 100).toFixed(2)}`,
    ];
    if (invoice.gstAmountPaise > 0) {
      calcLines.push(`  GST component: ₹${(invoice.gstAmountPaise / 100).toFixed(2)}`);
      calcLines.push(`  Material/service value: ₹${((invoice.grossAmountPaise - invoice.gstAmountPaise) / 100).toFixed(2)}`);
    }
    calcLines.push(
      `  TDS base (declared): ₹${(tdsBasePaise / 100).toFixed(2)}`,
      `  TDS rate: ${(invoice.tdsRate! * 100).toFixed(0)}% (Rule: ${rule.ruleId}, Section ${rule.section})`,
      `  Expected TDS: ₹${(expectedTdsPaise / 100).toFixed(2)}`,
      `  Expected bank credit: ₹${(invoice.grossAmountPaise / 100).toFixed(2)} - ₹${(expectedTdsPaise / 100).toFixed(2)} = ₹${(expectedBankPaise / 100).toFixed(2)}`,
      `  Actual bank credit: ₹${(bank.creditPaise / 100).toFixed(2)}`,
      `  Residual: ₹${(residualPaise / 100).toFixed(2)}`,
      `  Payer reference: ${verifiedEvidence.payerReference || 'N/A'}`,
      `  Evidence status: ${verifiedEvidence.reviewStatus}`,
      `  ✓ MATCHED WITH TDS DEDUCTION`,
    );
    const calc = calcLines.join('\n');

    const match: MatchResult = {
      matched: true,
      ruleTier: 'tier_c5',
      ruleId: `TIER_C5_TDS_${rule.ruleId}`,
      confidence: 0.98,
      evidenceRefs: [invoice.id, bank.id, verifiedEvidence.id, rule.id],
      calculation: calc,
      confidenceBasis: `TDS match: verified evidence, rule ${rule.ruleId} (${rule.section} @ ${(invoice.tdsRate! * 100).toFixed(0)}%), arithmetic verified, unique bank credit`,
      sourceRecordIds: [invoice.id],
      targetRecordIds: [bank.id],
      mathExplanation: calc,
      status: 'auto_matched',
    };

    const edges: EvidenceEdgeData[] = [
      {
        sourceType: 'invoice',
        sourceId: invoice.id,
        targetType: 'bank_transaction',
        targetId: bank.id,
        edgeType: 'tds_match',
        ruleId: `TIER_C5_TDS_${rule.ruleId}`,
        confidence: 0.98,
        explanation: `Invoice ${invoice.invoiceId} matched to bank ${bank.utr || bank.id} after TDS deduction of ₹${(expectedTdsPaise / 100).toFixed(2)} (${rule.section} @ ${(invoice.tdsRate! * 100).toFixed(0)}%)`,
        sourceRefs: [invoice.id, bank.id, verifiedEvidence.id],
      },
    ];

    matches.push({
      invoiceId: invoice.id,
      bankId: bank.id,
      tdsRuleId: rule.id,
      tdsAmountPaise: expectedTdsPaise,
      match,
      edges,
    });
    alreadyMatchedInvoiceIds.add(invoice.id);
    alreadyMatchedBankIds.add(bank.id);
  }

  // Also check invoices that LOOK like TDS but lack evidence
  // These should go to finance_review
  const suspiciousTdsInvoices = invoices.filter(inv =>
    !alreadyMatchedInvoiceIds.has(inv.id) &&
    !inv.tdsApplicable &&
    inv.outstandingPaise > 0
  );

  for (const invoice of suspiciousTdsInvoices) {
    // Find bank credits close to invoice gross
    for (const bank of availableBankTxns) {
      if (alreadyMatchedBankIds.has(bank.id)) continue;

      const diff = invoice.grossAmountPaise - bank.creditPaise;
      if (diff <= 0) continue;

      // Check if diff looks like 1%, 2%, or 10% of gross
      const percentages = [0.01, 0.02, 0.10];
      for (const pct of percentages) {
        const expectedDeduction = Math.round(invoice.grossAmountPaise * pct);
        if (Math.abs(diff - expectedDeduction) < 100) { // within ₹1 tolerance
          // This LOOKS like TDS but has no evidence — DON'T match, send to review
          reviewCases.push({
            invoiceId: invoice.id,
            bankId: bank.id,
            reason: `Shortfall resembles ${(pct * 100).toFixed(0)}% TDS but no evidence declared`,
            details: `Invoice ${invoice.invoiceId}: gross ₹${(invoice.grossAmountPaise / 100).toFixed(2)}, bank credit ₹${(bank.creditPaise / 100).toFixed(2)}, difference ₹${(diff / 100).toFixed(2)} ≈ ${(pct * 100).toFixed(0)}% of gross. However, tdsApplicable=false and no TDS evidence exists. Cannot assume TDS — requires finance review.`,
          });
        }
      }
    }
  }

  return { matches, reviewCases };
}
