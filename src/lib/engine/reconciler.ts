// ============================================
// Reconciliation Orchestrator
// Runs all tiers in sequence: A → B → C → C.5 → D → E
// Creates RecoveryCase records from results
// ============================================

import { PrismaClient } from '@prisma/client';
import { runTierA } from './tier-a';
import { runTierB } from './tier-b';
import { runTierC, runTierCInvoices } from './tier-c';
import { runTierC5 } from './tier-c5';
import { runTierD } from './tier-d';
import { runTierE, type ExceptionCase } from './tier-e';
import type { CashBridgeValues } from './types';

let caseCounter = 0;
function nextCaseNumber(prefix: string): string {
  caseCounter++;
  return `CIC-${prefix}-${String(caseCounter).padStart(4, '0')}`;
}

function determineCashState(exception: ExceptionCase): string {
  switch (exception.diagnosisCode) {
    case 'matched_exact':
    case 'matched_composite':
    case 'matched_grouped':
      return 'matched';
    case 'tds_matched':
      return 'matched_with_tds';
    case 'pending_settlement':
    case 'bank_lag':
      return 'waiting_for_settlement';
    case 'gateway_timeout':
    case 'network_error':
    case 'insufficient_funds':
    case 'card_expired':
    case 'checkout_abandonment_high_intent':
    case 'invoice_overdue':
    case 'invoice_partial_payment':
      return 'recoverable';
    case 'unknown_fee_short_settlement':
    case 'duplicate_bank_credit':
    case 'ambiguous_alias':
    case 'missing_reference':
    case 'tds_review_required':
      return 'finance_review';
    case 'risk_hold':
    case 'anomaly_detected':
      return 'risk_hold';
    case 'promise_to_pay_active':
      return 'promise_to_pay';
    case 'hard_decline':
    case 'mandate_revoked':
    case 'mandate_unknown':
    case 'refund_issued':
    case 'dispute_chargeback':
    case 'duplicate_payment':
    case 'checkout_abandonment_low_intent':
      return 'closed';
    default:
      return 'finance_review';
  }
}

function determinePriority(amountPaise: number, cashState: string): string {
  if (cashState === 'matched' || cashState === 'matched_with_tds' || cashState === 'closed') return 'low';
  if (amountPaise >= 2500000) return 'critical'; // ₹25,000+
  if (amountPaise >= 1000000) return 'high';     // ₹10,000+
  if (amountPaise >= 250000) return 'medium';     // ₹2,500+
  return 'low';
}

function determineAllowedActions(cashState: string, diagnosisCode: string): string[] {
  switch (cashState) {
    case 'recoverable':
      if (['gateway_timeout', 'network_error'].includes(diagnosisCode)) {
        return ['retry_payment', 'payment_link', 'reminder_email'];
      }
      if (diagnosisCode === 'insufficient_funds') {
        return ['retry_payment', 'payment_link', 'reminder_sms', 'reminder_email'];
      }
      if (diagnosisCode === 'card_expired') {
        return ['payment_link', 'reminder_email', 'reminder_sms'];
      }
      if (diagnosisCode === 'checkout_abandonment_high_intent') {
        return ['payment_link', 'reminder_email', 'reminder_whatsapp'];
      }
      if (['invoice_overdue', 'invoice_partial_payment'].includes(diagnosisCode)) {
        return ['payment_link', 'reminder_email', 'voice_call'];
      }
      return ['payment_link', 'reminder_email'];
    default:
      return [];
  }
}

function determineBlockedActions(cashState: string, diagnosisCode: string, context: Record<string, unknown> = {}): { action: string; reasons: string[] }[] {
  const blocked: { action: string; reasons: string[] }[] = [];

  if (['waiting_for_settlement', 'finance_review', 'risk_hold', 'closed'].includes(cashState)) {
    blocked.push(
      { action: 'retry_payment', reasons: [`Case is ${cashState} — no customer recovery automation`] },
      { action: 'payment_link', reasons: [`Case is ${cashState} — no customer recovery automation`] },
      { action: 'reminder_sms', reasons: [`Case is ${cashState} — no customer contact`] },
      { action: 'reminder_email', reasons: [`Case is ${cashState} — no customer contact`] },
      { action: 'reminder_whatsapp', reasons: [`Case is ${cashState} — no customer contact`] },
      { action: 'voice_call', reasons: [`Case is ${cashState} — no customer contact`] },
    );
  }

  if (cashState === 'promise_to_pay') {
    blocked.push(
      { action: 'retry_payment', reasons: ['Active Promise-to-Pay — standard dunning paused'] },
      { action: 'reminder_sms', reasons: ['Active Promise-to-Pay — standard dunning paused'] },
      { action: 'reminder_email', reasons: ['Active Promise-to-Pay — standard dunning paused'] },
      { action: 'voice_call', reasons: ['Active Promise-to-Pay — standard dunning paused'] },
    );
  }

  if (diagnosisCode === 'hard_decline') {
    blocked.push({ action: 'retry_payment', reasons: ['Hard decline — bank refused, retrying will fail'] });
  }
  if (diagnosisCode === 'mandate_revoked') {
    blocked.push({ action: 'retry_payment', reasons: ['Mandate revoked — customer cancelled authorization'] });
  }
  if (diagnosisCode === 'refund_issued') {
    blocked.push({ action: 'payment_link', reasons: ['Payment already refunded'] });
  }
  if (diagnosisCode === 'dispute_chargeback') {
    blocked.push({ action: 'payment_link', reasons: ['Active dispute — no recovery permitted'] });
    blocked.push({ action: 'voice_call', reasons: ['Active dispute — no customer contact'] });
  }

  if (context.optedOut) {
    blocked.push(
      { action: 'reminder_sms', reasons: ['Customer opted out'] },
      { action: 'reminder_email', reasons: ['Customer opted out'] },
      { action: 'reminder_whatsapp', reasons: ['Customer opted out'] },
      { action: 'voice_call', reasons: ['Customer opted out'] },
    );
  }

  return blocked;
}

/**
 * Run the complete reconciliation engine
 */
export async function runReconciliation(prisma: PrismaClient): Promise<{
  casesCreated: number;
  cashBridge: CashBridgeValues;
  metrics: {
    totalRecordsProcessed: number;
    tierAMatches: number;
    tierBMatches: number;
    tierCMatches: number;
    tierC5Matches: number;
    tierDCandidates: number;
    tierEExceptions: number;
    autoMatched: number;
    reviewRequired: number;
    elapsedMs: number;
  };
}> {
  const startTime = Date.now();
  caseCounter = 0;

  // Clear existing cases and related records for clean re-run
  await prisma.$transaction([
    prisma.auditEvent.deleteMany(),
    prisma.experimentAssignment.deleteMany(),
    prisma.riskSignal.deleteMany(),
    prisma.promiseToPay.deleteMany(),
    prisma.recoveryAction.deleteMany(),
    prisma.policyDecision.deleteMany(),
    prisma.reconciliationMatch.deleteMany(),
    prisma.evidenceEdge.deleteMany(),
    prisma.recoveryCase.deleteMany(),
  ]);

  // Load all data
  const [payments, invoices, settlements, bankTxns, checkouts, customers, tdsRules, tdsEvidence] = await Promise.all([
    prisma.paymentAttempt.findMany(),
    prisma.invoice.findMany(),
    prisma.settlement.findMany({ include: { lines: true } }),
    prisma.bankTransaction.findMany(),
    prisma.checkoutSession.findMany(),
    prisma.customer.findMany(),
    prisma.tdsRule.findMany(),
    prisma.tdsEvidence.findMany(),
  ]);

  const totalRecords = payments.length + invoices.length + settlements.length + bankTxns.length + checkouts.length;

  // Track what's matched across tiers
  const matchedPaymentIds = new Set<string>();
  const matchedSettlementIds = new Set<string>();
  const matchedBankIds = new Set<string>();
  const matchedInvoiceIds = new Set<string>();

  const allCaseData: {
    caseNumber: string;
    cashState: string;
    priority: string;
    outstandingAmountPaise: number;
    grossAmountPaise: number;
    expectedNetAmountPaise: number;
    observedBankAmountPaise: number;
    diagnosisCode: string;
    diagnosisText: string;
    confidence: number;
    evidenceRefs: string[];
    allowedActions: string[];
    blockedActions: { action: string; reasons: string[] }[];
    ruleTier: string;
    mathExplanation: string;
    edges: { sourceType: string; sourceId: string; targetType: string; targetId: string; edgeType: string; ruleId: string; confidence: number; explanation: string; sourceRefs: string[] }[];
  }[] = [];

  // ============================================
  // TIER A: Exact ID Match
  // ============================================
  const tierAResult = runTierA(payments, settlements, bankTxns);

  for (const m of tierAResult.matchedPaymentSettlements) {
    matchedPaymentIds.add(m.paymentId);
    matchedSettlementIds.add(m.settlementId);
    if (m.bankId) matchedBankIds.add(m.bankId);

    const payment = payments.find(p => p.id === m.paymentId)!;
    const settlement = settlements.find(s => s.id === m.settlementId)!;

    allCaseData.push({
      caseNumber: nextCaseNumber('DM'),
      cashState: 'matched',
      priority: 'low',
      outstandingAmountPaise: 0,
      grossAmountPaise: payment.amountPaise,
      expectedNetAmountPaise: settlement.netAmountPaise,
      observedBankAmountPaise: m.bankId ? (bankTxns.find(b => b.id === m.bankId)?.creditPaise || 0) : 0,
      diagnosisCode: 'matched_exact',
      diagnosisText: m.match.calculation,
      confidence: m.match.confidence,
      evidenceRefs: m.match.evidenceRefs,
      allowedActions: [],
      blockedActions: [],
      ruleTier: 'tier_a',
      mathExplanation: m.match.mathExplanation,
      edges: m.edges,
    });
  }

  // ============================================
  // TIER B: Composite Match
  // ============================================
  const tierBResult = runTierB(invoices, payments, bankTxns, matchedBankIds, matchedPaymentIds);

  for (const m of tierBResult.matches) {
    if (m.sourceType === 'invoice') matchedInvoiceIds.add(m.sourceId);
    else matchedPaymentIds.add(m.sourceId);
    matchedBankIds.add(m.bankId);

    const source = m.sourceType === 'invoice'
      ? invoices.find(i => i.id === m.sourceId)
      : payments.find(p => p.id === m.sourceId);
    const bank = bankTxns.find(b => b.id === m.bankId)!;

    allCaseData.push({
      caseNumber: nextCaseNumber('DM'),
      cashState: 'matched',
      priority: 'low',
      outstandingAmountPaise: 0,
      grossAmountPaise: source ? ('grossAmountPaise' in source ? source.grossAmountPaise : source.amountPaise) : 0,
      expectedNetAmountPaise: bank.creditPaise,
      observedBankAmountPaise: bank.creditPaise,
      diagnosisCode: 'matched_composite',
      diagnosisText: m.match.calculation,
      confidence: m.match.confidence,
      evidenceRefs: m.match.evidenceRefs,
      allowedActions: [],
      blockedActions: [],
      ruleTier: 'tier_b',
      mathExplanation: m.match.mathExplanation,
      edges: m.edges,
    });
  }

  // ============================================
  // TIER C: Grouped Settlement Match
  // ============================================
  const tierCResult = runTierC(settlements, bankTxns, matchedSettlementIds, matchedBankIds);

  for (const m of tierCResult.matches) {
    matchedSettlementIds.add(m.settlementId);
    matchedBankIds.add(m.bankId);
    for (const pid of m.paymentIds) matchedPaymentIds.add(pid);

    const settlement = settlements.find(s => s.id === m.settlementId)!;
    const bank = bankTxns.find(b => b.id === m.bankId)!;

    allCaseData.push({
      caseNumber: nextCaseNumber('DM'),
      cashState: 'matched',
      priority: 'low',
      outstandingAmountPaise: 0,
      grossAmountPaise: settlement.grossAmountPaise,
      expectedNetAmountPaise: settlement.netAmountPaise,
      observedBankAmountPaise: bank.creditPaise,
      diagnosisCode: 'matched_grouped',
      diagnosisText: m.match.calculation,
      confidence: m.match.confidence,
      evidenceRefs: m.match.evidenceRefs,
      allowedActions: [],
      blockedActions: [],
      ruleTier: 'tier_c',
      mathExplanation: m.match.mathExplanation,
      edges: m.edges,
    });
  }

  // Grouped invoice matches
  const tierCInvResult = runTierCInvoices(invoices, bankTxns, matchedInvoiceIds, matchedBankIds);

  for (const m of tierCInvResult.matches) {
    for (const iid of m.invoiceIds) matchedInvoiceIds.add(iid);
    matchedBankIds.add(m.bankId);

    const totalGross = m.invoiceIds.reduce((sum, iid) => {
      const inv = invoices.find(i => i.id === iid);
      return sum + (inv?.grossAmountPaise || 0);
    }, 0);
    const bank = bankTxns.find(b => b.id === m.bankId)!;

    allCaseData.push({
      caseNumber: nextCaseNumber('DM'),
      cashState: 'matched',
      priority: 'low',
      outstandingAmountPaise: 0,
      grossAmountPaise: totalGross,
      expectedNetAmountPaise: bank.creditPaise,
      observedBankAmountPaise: bank.creditPaise,
      diagnosisCode: 'matched_grouped',
      diagnosisText: m.match.calculation,
      confidence: m.match.confidence,
      evidenceRefs: m.match.evidenceRefs,
      allowedActions: [],
      blockedActions: [],
      ruleTier: 'tier_c',
      mathExplanation: m.match.mathExplanation,
      edges: m.edges,
    });
  }

  // ============================================
  // TIER C.5: TDS Match
  // ============================================
  const tierC5Result = runTierC5(invoices, tdsRules, tdsEvidence, bankTxns, matchedInvoiceIds, matchedBankIds);

  for (const m of tierC5Result.matches) {
    matchedInvoiceIds.add(m.invoiceId);
    matchedBankIds.add(m.bankId);

    const invoice = invoices.find(i => i.id === m.invoiceId)!;
    const bank = bankTxns.find(b => b.id === m.bankId)!;

    allCaseData.push({
      caseNumber: nextCaseNumber('DM'),
      cashState: 'matched_with_tds',
      priority: 'low',
      outstandingAmountPaise: 0,
      grossAmountPaise: invoice.grossAmountPaise,
      expectedNetAmountPaise: bank.creditPaise,
      observedBankAmountPaise: bank.creditPaise,
      diagnosisCode: 'tds_matched',
      diagnosisText: m.match.calculation,
      confidence: m.match.confidence,
      evidenceRefs: m.match.evidenceRefs,
      allowedActions: [],
      blockedActions: determineBlockedActions('matched_with_tds', 'tds_matched'),
      ruleTier: 'tier_c5',
      mathExplanation: m.match.mathExplanation,
      edges: m.edges,
    });
  }

  // TDS review cases
  for (const rc of tierC5Result.reviewCases) {
    if (rc.invoiceId && !matchedInvoiceIds.has(rc.invoiceId)) {
      const invoice = invoices.find(i => i.id === rc.invoiceId);
      if (invoice) {
        allCaseData.push({
          caseNumber: nextCaseNumber('FR'),
          cashState: 'finance_review',
          priority: determinePriority(invoice.grossAmountPaise, 'finance_review'),
          outstandingAmountPaise: invoice.outstandingPaise,
          grossAmountPaise: invoice.grossAmountPaise,
          expectedNetAmountPaise: 0,
          observedBankAmountPaise: rc.bankId ? (bankTxns.find(b => b.id === rc.bankId)?.creditPaise || 0) : 0,
          diagnosisCode: 'tds_review_required',
          diagnosisText: rc.details,
          confidence: 0,
          evidenceRefs: [rc.invoiceId, rc.bankId].filter(Boolean),
          allowedActions: [],
          blockedActions: determineBlockedActions('finance_review', 'tds_review_required'),
          ruleTier: 'tier_e',
          mathExplanation: rc.details,
          edges: [],
        });
        matchedInvoiceIds.add(rc.invoiceId);
      }
    }
  }

  // ============================================
  // TIER D: AI-Assisted Candidates
  // ============================================
  const tierDResult = runTierD(invoices, bankTxns, matchedInvoiceIds, matchedBankIds);

  for (const c of tierDResult.candidates) {
    allCaseData.push({
      caseNumber: nextCaseNumber('FR'),
      cashState: 'finance_review',
      priority: 'medium',
      outstandingAmountPaise: 0,
      grossAmountPaise: invoices.find(i => i.id === c.sourceId)?.grossAmountPaise || 0,
      expectedNetAmountPaise: 0,
      observedBankAmountPaise: bankTxns.find(b => b.id === c.bankId)?.creditPaise || 0,
      diagnosisCode: 'ambiguous_alias',
      diagnosisText: c.match.calculation,
      confidence: c.confidence,
      evidenceRefs: [c.sourceId, c.bankId],
      allowedActions: [],
      blockedActions: determineBlockedActions('finance_review', 'ambiguous_alias'),
      ruleTier: 'tier_d',
      mathExplanation: c.match.mathExplanation,
      edges: c.edges,
    });
    matchedInvoiceIds.add(c.sourceId);
  }

  // ============================================
  // TIER E: Honest Exceptions (all remaining)
  // ============================================
  const unmatchedRecords: Parameters<typeof runTierE>[0] = [];

  // Unmatched failed payments
  for (const payment of payments) {
    if (matchedPaymentIds.has(payment.id)) continue;

    if (payment.status === 'failed') {
      unmatchedRecords.push({
        type: 'payment_failed',
        id: payment.id,
        ref: payment.providerId,
        amountPaise: payment.amountPaise,
        status: payment.status,
        relatedIds: [payment.orderId],
        context: {
          failureCategory: payment.failureCategory,
          failureCode: payment.failureCode,
          gatewayResponse: payment.gatewayResponse,
        },
      });
    } else if (payment.status === 'refunded') {
      unmatchedRecords.push({
        type: 'payment_refunded',
        id: payment.id,
        ref: payment.providerId,
        amountPaise: payment.amountPaise,
        status: payment.status,
        relatedIds: [payment.orderId],
        context: {},
      });
    } else if (payment.status === 'captured') {
      // Check if it's a dispute case
      const gateway = payment.gatewayResponse ? JSON.parse(payment.gatewayResponse) : {};
      if (gateway.dispute_id) {
        unmatchedRecords.push({
          type: 'payment_disputed',
          id: payment.id,
          ref: payment.providerId,
          amountPaise: payment.amountPaise,
          status: payment.status,
          relatedIds: [payment.orderId],
          context: { disputeId: gateway.dispute_id },
        });
      } else {
        // Check if pending settlement
        const hasSettlement = settlements.some(s => s.lines.some(l => l.paymentAttemptId === payment.id));
        if (!hasSettlement) {
          unmatchedRecords.push({
            type: 'payment_pending_settlement',
            id: payment.id,
            ref: payment.providerId,
            amountPaise: payment.amountPaise,
            status: payment.status,
            relatedIds: [payment.orderId],
            context: {},
          });
        }
      }
    }
  }

  // Check for duplicate payment attempts on same order
  const paymentsByOrder = new Map<string, typeof payments>();
  for (const p of payments) {
    const existing = paymentsByOrder.get(p.orderId) || [];
    existing.push(p);
    paymentsByOrder.set(p.orderId, existing);
  }
  for (const [orderId, orderPayments] of paymentsByOrder) {
    if (orderPayments.length > 1) {
      const hasFailed = orderPayments.some(p => p.status === 'failed');
      const hasSuccess = orderPayments.some(p => p.status === 'captured');
      if (hasFailed && hasSuccess) {
        // The failed one is a duplicate — mark as closed
        const failedPayment = orderPayments.find(p => p.status === 'failed' && !matchedPaymentIds.has(p.id));
        if (failedPayment) {
          // Remove from unmatched if already there and re-add as duplicate
          const idx = unmatchedRecords.findIndex(r => r.id === failedPayment.id);
          if (idx >= 0) unmatchedRecords.splice(idx, 1);
          unmatchedRecords.push({
            type: 'payment_duplicate',
            id: failedPayment.id,
            ref: failedPayment.providerId,
            amountPaise: failedPayment.amountPaise,
            status: failedPayment.status,
            relatedIds: orderPayments.map(p => p.id),
            context: {},
          });
        }
      }
    }
  }

  // Unmatched invoices
  for (const invoice of invoices) {
    if (matchedInvoiceIds.has(invoice.id)) continue;

    if (invoice.status === 'overdue') {
      unmatchedRecords.push({
        type: 'invoice_overdue',
        id: invoice.id,
        ref: invoice.invoiceId,
        amountPaise: invoice.outstandingPaise,
        status: invoice.status,
        relatedIds: [invoice.customerId],
        context: {},
      });
    } else if (invoice.status === 'partial') {
      unmatchedRecords.push({
        type: 'invoice_partial',
        id: invoice.id,
        ref: invoice.invoiceId,
        amountPaise: invoice.outstandingPaise,
        status: invoice.status,
        relatedIds: [invoice.customerId],
        context: {},
      });
    } else if (invoice.disputeStatus === 'raised' || invoice.status === 'disputed') {
      unmatchedRecords.push({
        type: 'invoice_disputed',
        id: invoice.id,
        ref: invoice.invoiceId,
        amountPaise: invoice.outstandingPaise,
        status: invoice.status,
        relatedIds: [invoice.customerId],
        context: {},
      });
    } else if (invoice.status === 'sent' && invoice.outstandingPaise > 0) {
      // Check if this is the INV-208 exception or other finance review
      unmatchedRecords.push({
        type: 'invoice_overdue',
        id: invoice.id,
        ref: invoice.invoiceId,
        amountPaise: invoice.outstandingPaise,
        status: invoice.status,
        relatedIds: [invoice.customerId],
        context: {},
      });
    }
  }

  // Unmatched checkouts
  for (const checkout of checkouts) {
    if (checkout.abandonmentStatus === 'high_intent') {
      const customer = customers.find(c => c.id === checkout.customerId);
      if (customer?.optedOut) {
        unmatchedRecords.push({
          type: 'checkout_opted_out',
          id: checkout.id,
          ref: checkout.sessionId,
          amountPaise: checkout.cartValuePaise,
          status: 'abandoned',
          relatedIds: checkout.orderId ? [checkout.orderId] : [],
          context: { optedOut: true },
        });
      } else {
        unmatchedRecords.push({
          type: 'checkout_abandoned_high',
          id: checkout.id,
          ref: checkout.sessionId,
          amountPaise: checkout.cartValuePaise,
          status: 'abandoned',
          relatedIds: checkout.orderId ? [checkout.orderId] : [],
          context: {},
        });
      }
    } else if (checkout.abandonmentStatus === 'low_intent') {
      unmatchedRecords.push({
        type: 'checkout_abandoned_low',
        id: checkout.id,
        ref: checkout.sessionId,
        amountPaise: checkout.cartValuePaise,
        status: 'abandoned',
        relatedIds: [],
        context: {},
      });
    }
  }

  // Unmatched bank transactions
  for (const bank of bankTxns) {
    if (matchedBankIds.has(bank.id)) continue;
    // Check for duplicates
    const sameAmountSameDay = bankTxns.filter(b =>
      b.id !== bank.id &&
      b.creditPaise === bank.creditPaise &&
      b.transactionDate.toDateString() === bank.transactionDate.toDateString()
    );
    if (sameAmountSameDay.length > 0) {
      unmatchedRecords.push({
        type: 'duplicate_bank_credit',
        id: bank.id,
        ref: bank.utr || bank.id,
        amountPaise: bank.creditPaise,
        status: 'unmatched',
        relatedIds: sameAmountSameDay.map(b => b.id),
        context: {},
      });
    } else {
      unmatchedRecords.push({
        type: 'bank_unmatched',
        id: bank.id,
        ref: bank.utr || bank.id,
        amountPaise: bank.creditPaise,
        status: 'unmatched',
        relatedIds: [],
        context: {},
      });
    }
  }

  const tierEResult = runTierE(unmatchedRecords);

  for (const exc of tierEResult.exceptions) {
    const cashState = determineCashState(exc);
    const priority = determinePriority(exc.expectedAmountPaise, cashState);
    const customer = exc.sourceType.includes('checkout') 
      ? customers.find(c => checkouts.find(ch => ch.id === exc.sourceId)?.customerId === c.id)
      : null;

    allCaseData.push({
      caseNumber: nextCaseNumber(
        cashState === 'recoverable' ? 'RE' :
        cashState === 'finance_review' ? 'FR' :
        cashState === 'risk_hold' ? 'RH' :
        cashState === 'waiting_for_settlement' ? 'WS' :
        cashState === 'closed' ? 'SA' : 'GN'
      ),
      cashState,
      priority,
      outstandingAmountPaise: exc.expectedAmountPaise,
      grossAmountPaise: exc.expectedAmountPaise,
      expectedNetAmountPaise: 0,
      observedBankAmountPaise: exc.observedAmountPaise || 0,
      diagnosisCode: exc.diagnosisCode,
      diagnosisText: exc.diagnosisText,
      confidence: exc.confidence,
      evidenceRefs: [exc.sourceId, ...exc.match.evidenceRefs],
      allowedActions: determineAllowedActions(cashState, exc.diagnosisCode),
      blockedActions: determineBlockedActions(cashState, exc.diagnosisCode, { optedOut: customer?.optedOut }),
      ruleTier: 'tier_e',
      mathExplanation: exc.match.mathExplanation,
      edges: exc.edges,
    });
  }

  // ============================================
  // Persist all cases to database
  // ============================================
  const policy = await prisma.policy.findFirst({ where: { isActive: true } });

  for (const caseData of allCaseData) {
    const recoveryCase = await prisma.recoveryCase.create({
      data: {
        caseNumber: caseData.caseNumber,
        cashState: caseData.cashState,
        priority: caseData.priority,
        outstandingAmountPaise: caseData.outstandingAmountPaise,
        grossAmountPaise: caseData.grossAmountPaise,
        expectedNetAmountPaise: caseData.expectedNetAmountPaise,
        observedBankAmountPaise: caseData.observedBankAmountPaise,
        diagnosisCode: caseData.diagnosisCode,
        diagnosisText: caseData.diagnosisText,
        confidence: caseData.confidence,
        evidenceRefs: JSON.stringify(caseData.evidenceRefs),
        policySnapshotVersion: policy?.version || '1.0-demo',
        allowedActions: JSON.stringify(caseData.allowedActions),
        blockedActions: JSON.stringify(caseData.blockedActions),
      },
    });

    // Create reconciliation match
    await prisma.reconciliationMatch.create({
      data: {
        recoveryCaseId: recoveryCase.id,
        status: caseData.cashState === 'matched' || caseData.cashState === 'matched_with_tds' ? 'auto_matched' : 'exception',
        ruleTier: caseData.ruleTier,
        candidateScore: caseData.confidence,
        mathExplanation: caseData.mathExplanation,
      },
    });

    // Create evidence edges
    for (const edge of caseData.edges) {
      await prisma.evidenceEdge.create({
        data: {
          recoveryCaseId: recoveryCase.id,
          sourceType: edge.sourceType,
          sourceId: edge.sourceId,
          targetType: edge.targetType,
          targetId: edge.targetId,
          edgeType: edge.edgeType,
          ruleId: edge.ruleId,
          confidence: edge.confidence,
          explanation: edge.explanation,
          sourceRefs: JSON.stringify(edge.sourceRefs),
        },
      });
    }

    // Create audit event
    await prisma.auditEvent.create({
      data: {
        caseId: recoveryCase.id,
        actor: 'reconciliation-engine',
        actorVersion: '1.0-demo',
        eventType: caseData.cashState === 'matched' || caseData.cashState === 'matched_with_tds' ? 'MATCH_CREATED' : 'EXCEPTION_CREATED',
        inputRecordRefs: JSON.stringify(caseData.evidenceRefs),
        ruleOrPromptVersion: caseData.ruleTier,
        decision: JSON.stringify({ cashState: caseData.cashState, diagnosisCode: caseData.diagnosisCode }),
        reasons: JSON.stringify([caseData.diagnosisText.substring(0, 200)]),
        policySnapshot: policy?.version || '1.0-demo',
      },
    });

    // Assign to experiment cohort (80% treatment, 20% holdout)
    if (caseData.cashState === 'recoverable') {
      const cohort = Math.random() < 0.8 ? 'treatment' : 'holdout';
      await prisma.experimentAssignment.create({
        data: {
          recoveryCaseId: recoveryCase.id,
          cohort,
        },
      });
    }
  }

  // ============================================
  // Compute Cash Bridge
  // ============================================
  const cashBridge = await computeCashBridge(prisma);

  const elapsedMs = Date.now() - startTime;

  return {
    casesCreated: allCaseData.length,
    cashBridge,
    metrics: {
      totalRecordsProcessed: totalRecords,
      tierAMatches: tierAResult.matchedPaymentSettlements.length,
      tierBMatches: tierBResult.matches.length,
      tierCMatches: tierCResult.matches.length + tierCInvResult.matches.length,
      tierC5Matches: tierC5Result.matches.length,
      tierDCandidates: tierDResult.candidates.length,
      tierEExceptions: tierEResult.exceptions.length,
      autoMatched: allCaseData.filter(c => c.cashState === 'matched' || c.cashState === 'matched_with_tds').length,
      reviewRequired: allCaseData.filter(c => c.cashState === 'finance_review').length,
      elapsedMs,
    },
  };
}

/**
 * Compute the cash bridge values from current database state
 */
export async function computeCashBridge(prisma: PrismaClient): Promise<CashBridgeValues> {
  const [capturedPayments, allSettlements, bankCredits, recoverableCases, tdsMatches] = await Promise.all([
    prisma.paymentAttempt.aggregate({
      where: { status: 'captured' },
      _sum: { amountPaise: true },
    }),
    prisma.settlement.findMany(),
    prisma.bankTransaction.aggregate({
      where: { type: 'credit' },
      _sum: { creditPaise: true },
    }),
    prisma.recoveryCase.aggregate({
      where: { cashState: 'recoverable' },
      _sum: { outstandingAmountPaise: true },
    }),
    prisma.recoveryCase.aggregate({
      where: { cashState: 'matched_with_tds' },
      _sum: { grossAmountPaise: true },
    }),
  ]);

  const expectedPaise = capturedPayments._sum.amountPaise || 0;
  const settledGross = allSettlements
    .filter(s => s.status === 'settled')
    .reduce((sum, s) => sum + s.grossAmountPaise, 0);
  const settledNet = allSettlements
    .filter(s => s.status === 'settled')
    .reduce((sum, s) => sum + s.netAmountPaise, 0);
  const pendingSettlement = allSettlements
    .filter(s => s.status !== 'settled')
    .reduce((sum, s) => sum + s.netAmountPaise, 0);
  const bankCredited = bankCredits._sum.creditPaise || 0;

  // Finance exceptions = cases that aren't matched and aren't recoverable
  const financeExceptions = await prisma.recoveryCase.aggregate({
    where: { cashState: { in: ['finance_review', 'risk_hold'] } },
    _sum: { outstandingAmountPaise: true },
  });

  // Recovered = completed recovery actions
  const recovered = await prisma.recoveryAction.aggregate({
    where: { status: 'completed' },
    _count: true,
  });

  return {
    expectedPaise,
    capturedPaise: expectedPaise,
    pendingSettlementPaise: pendingSettlement,
    gatewaySettledPaise: settledNet,
    bankCreditedPaise: bankCredited,
    financeExceptionsPaise: financeExceptions._sum.outstandingAmountPaise || 0,
    eligibleRecoveryPaise: recoverableCases._sum.outstandingAmountPaise || 0,
    recoveredPaise: 0,
    tdsPaise: tdsMatches._sum.grossAmountPaise || 0,
  };
}
