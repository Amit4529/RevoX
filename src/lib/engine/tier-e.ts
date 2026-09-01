// ============================================
// Tier E: Honest Exception
// Produces explicit exception objects, NEVER a vague "failed"
// Explains: expected, observed, missing evidence, candidates, next owner
// ============================================

import type { MatchResult, EvidenceEdgeData } from './types';

export interface ExceptionCase {
  sourceType: string;
  sourceId: string;
  sourceRef: string;
  expectedAmountPaise: number;
  observedAmountPaise: number | null;
  missingEvidence: string[];
  contradictions: string[];
  candidateCount: number;
  confidence: number;
  nextOwner: string;
  diagnosisCode: string;
  diagnosisText: string;
  match: MatchResult;
  edges: EvidenceEdgeData[];
}

export interface TierEResult {
  exceptions: ExceptionCase[];
}

/**
 * Tier E: Generate honest exceptions for all unmatched records
 * Each exception must explain exactly what's missing or wrong
 */
export function runTierE(
  unmatchedRecords: {
    type: string;
    id: string;
    ref: string;
    amountPaise: number;
    status: string;
    relatedIds: string[];
    context: Record<string, unknown>;
  }[]
): TierEResult {
  const exceptions: ExceptionCase[] = [];

  for (const record of unmatchedRecords) {
    const missingEvidence: string[] = [];
    const contradictions: string[] = [];
    let diagnosisCode = 'unknown';
    let diagnosisText = '';
    let nextOwner = 'finance_team';

    // Classify the exception based on record type and context
    switch (record.type) {
      case 'payment_failed': {
        const failureCategory = record.context.failureCategory as string;
        const failureCode = record.context.failureCode as string;

        if (['hard_decline', 'revoked_mandate'].includes(failureCategory)) {
          diagnosisCode = failureCategory === 'hard_decline' ? 'hard_decline' : 'mandate_revoked';
          diagnosisText = `Payment ${record.ref} failed: ${failureCode}. ${failureCategory === 'hard_decline' ? 'Bank refused the transaction.' : 'Customer revoked payment mandate.'}`;
          nextOwner = 'closed_no_action';
        } else if (failureCategory === 'transient' || failureCategory === 'insufficient_funds') {
          diagnosisCode = failureCategory === 'transient' ? 'gateway_timeout' : 'insufficient_funds';
          diagnosisText = `Payment ${record.ref} failed: ${failureCode}. Potentially recoverable.`;
          nextOwner = 'recovery_engine';
        } else if (failureCategory === 'expired') {
          diagnosisCode = 'card_expired';
          diagnosisText = `Payment ${record.ref} failed: ${failureCode}. Card/method expired.`;
          nextOwner = 'recovery_engine';
        } else {
          diagnosisCode = 'unknown';
          diagnosisText = `Payment ${record.ref} failed: ${failureCode}. Requires investigation.`;
          nextOwner = 'finance_team';
        }
        missingEvidence.push('No successful payment or settlement found');
        break;
      }

      case 'payment_refunded': {
        diagnosisCode = 'refund_issued';
        diagnosisText = `Payment ${record.ref} has been refunded. No recovery action permitted.`;
        nextOwner = 'closed_no_action';
        break;
      }

      case 'payment_disputed': {
        diagnosisCode = 'dispute_chargeback';
        diagnosisText = `Payment ${record.ref} has an active dispute/chargeback. No recovery automation.`;
        nextOwner = 'closed_no_action';
        break;
      }

      case 'payment_duplicate': {
        diagnosisCode = 'duplicate_payment';
        diagnosisText = `Payment ${record.ref}: duplicate attempt detected. Later payment may have succeeded.`;
        nextOwner = 'closed_no_action';
        contradictions.push('Multiple payment attempts for same order');
        break;
      }

      case 'payment_pending_settlement': {
        diagnosisCode = 'pending_settlement';
        diagnosisText = `Payment ${record.ref} captured but settlement window has not elapsed. No customer contact.`;
        nextOwner = 'waiting';
        missingEvidence.push('Settlement not yet created or within expected window');
        break;
      }

      case 'invoice_overdue': {
        diagnosisCode = 'invoice_overdue';
        diagnosisText = `Invoice ${record.ref}: ₹${(record.amountPaise / 100).toFixed(2)} overdue. No matching payment or bank credit found.`;
        nextOwner = 'recovery_engine';
        missingEvidence.push('No bank credit matching invoice amount');
        break;
      }

      case 'invoice_partial': {
        diagnosisCode = 'invoice_partial_payment';
        diagnosisText = `Invoice ${record.ref}: partial payment received. Outstanding: ₹${(record.amountPaise / 100).toFixed(2)}.`;
        nextOwner = 'recovery_engine';
        missingEvidence.push('Remaining balance not paid');
        break;
      }

      case 'invoice_disputed': {
        diagnosisCode = 'dispute_chargeback';
        diagnosisText = `Invoice ${record.ref}: dispute raised by customer. No recovery automation.`;
        nextOwner = 'closed_no_action';
        break;
      }

      case 'checkout_abandoned_high': {
        diagnosisCode = 'checkout_abandonment_high_intent';
        diagnosisText = `Checkout ${record.ref}: high-intent abandonment (payment method selected). Eligible for payment link.`;
        nextOwner = 'recovery_engine';
        missingEvidence.push('No completed payment found');
        break;
      }

      case 'checkout_abandoned_low': {
        diagnosisCode = 'checkout_abandonment_low_intent';
        diagnosisText = `Checkout ${record.ref}: low-intent abandonment (cart stage only). Not eligible for aggressive recovery.`;
        nextOwner = 'low_priority';
        missingEvidence.push('Customer did not progress past cart stage');
        break;
      }

      case 'checkout_opted_out': {
        diagnosisCode = 'checkout_abandonment_high_intent';
        diagnosisText = `Checkout ${record.ref}: high-intent but customer has opted out. No communication permitted.`;
        nextOwner = 'closed_no_action';
        contradictions.push('Customer opt-out prevents recovery');
        break;
      }

      case 'bank_unmatched': {
        diagnosisCode = 'missing_reference';
        diagnosisText = `Bank credit ${record.ref}: ₹${(record.amountPaise / 100).toFixed(2)} with no matching payment, invoice, or settlement.`;
        nextOwner = 'finance_team';
        missingEvidence.push('No traceable source record for this bank credit');
        break;
      }

      case 'settlement_short': {
        diagnosisCode = 'unknown_fee_short_settlement';
        diagnosisText = `Settlement ${record.ref}: unexplained shortfall. Expected vs actual amounts do not reconcile.`;
        nextOwner = 'finance_team';
        missingEvidence.push('No fee/tax/adjustment explanation for the difference');
        break;
      }

      case 'duplicate_bank_credit': {
        diagnosisCode = 'duplicate_bank_credit';
        diagnosisText = `Bank credit ${record.ref}: potential duplicate credit detected (same amount, same day, different UTR).`;
        nextOwner = 'finance_team';
        contradictions.push('Multiple credits with same amount on same date');
        break;
      }

      case 'ambiguous_alias': {
        diagnosisCode = 'ambiguous_alias';
        diagnosisText = `${record.ref}: ambiguous — multiple invoices match the same bank credit. Cannot auto-resolve.`;
        nextOwner = 'finance_team';
        contradictions.push('Multiple source records match one bank transaction');
        break;
      }

      case 'tds_no_evidence': {
        diagnosisCode = 'tds_review_required';
        diagnosisText = `${record.ref}: shortfall looks like TDS deduction but no TDS evidence declared. Cannot assume tax treatment.`;
        nextOwner = 'finance_team';
        missingEvidence.push('No TDS evidence, rule, or base amount declared');
        break;
      }

      default: {
        diagnosisCode = 'unknown';
        diagnosisText = `Record ${record.ref}: unclassified. Requires manual investigation.`;
        nextOwner = 'finance_team';
      }
    }

    const calc = [
      `Exception for ${record.ref}:`,
      `  Type: ${record.type}`,
      `  Amount: ₹${(record.amountPaise / 100).toFixed(2)}`,
      `  Status: ${record.status}`,
      `  Diagnosis: ${diagnosisCode}`,
      missingEvidence.length > 0 ? `  Missing: ${missingEvidence.join('; ')}` : null,
      contradictions.length > 0 ? `  Contradictions: ${contradictions.join('; ')}` : null,
      `  Next owner: ${nextOwner}`,
      `  ⚠ EXCEPTION — requires resolution`,
    ].filter(Boolean).join('\n');

    const match: MatchResult = {
      matched: false,
      ruleTier: 'tier_e',
      ruleId: 'TIER_E_EXCEPTION',
      confidence: 0,
      evidenceRefs: [record.id, ...record.relatedIds],
      calculation: calc,
      confidenceBasis: `No match found: ${missingEvidence.join(', ')}`,
      sourceRecordIds: [record.id],
      targetRecordIds: record.relatedIds,
      mathExplanation: calc,
      status: 'exception',
    };

    const edges: EvidenceEdgeData[] = [{
      sourceType: record.type,
      sourceId: record.id,
      targetType: 'exception',
      targetId: record.id,
      edgeType: 'exception',
      ruleId: 'TIER_E_EXCEPTION',
      confidence: 0,
      explanation: diagnosisText,
      sourceRefs: [record.id, ...record.relatedIds],
    }];

    exceptions.push({
      sourceType: record.type,
      sourceId: record.id,
      sourceRef: record.ref,
      expectedAmountPaise: record.amountPaise,
      observedAmountPaise: null,
      missingEvidence,
      contradictions,
      candidateCount: 0,
      confidence: 0,
      nextOwner,
      diagnosisCode,
      diagnosisText,
      match,
      edges,
    });
  }

  return { exceptions };
}
