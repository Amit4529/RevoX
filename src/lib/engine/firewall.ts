// ============================================
// Do Not Recover Firewall
// 
// DETERMINISTIC CODE — NOT prompt instructions.
// This is the policy enforcement layer that sits between
// the reconciliation engine and the recovery action queue.
// 
// Every action must pass through ALL gates.
// If any gate fails, the action is BLOCKED with a reason.
// ============================================

import { PrismaClient } from '@prisma/client';

export interface PolicyGateResult {
  passed: boolean;
  gateId: string;
  gateName: string;
  reason: string;
}

export interface FirewallDecision {
  allowed: boolean;
  action: string;
  caseId: string;
  gatesPassed: PolicyGateResult[];
  gatesFailed: PolicyGateResult[];
  policyVersion: string;
  evaluatedAt: Date;
}

export interface PolicyConfig {
  policyVersion: string;
  contact: {
    maxTouchesAcrossChannels: number;
    periodDays: number;
    quietHoursLocal: string;
    requireConsentForWhatsApp: boolean;
    stopOnOptOut: boolean;
  };
  retries: {
    maxRetries: number;
    windowDays: number;
    eligibleFailureCategories: string[];
    blockedFailureCategories: string[];
  };
  railSwitch: {
    minimumConsecutiveUpiAutopayFailures: number;
    requireSeededEnachEligibility: boolean;
    requireNewCustomerAuthorization: boolean;
    requireHumanApproval: boolean;
  };
  promiseToPay: {
    pauseStandardDunning: boolean;
    graceDays: number;
  };
  approvals: {
    highValueThresholdPaise: number;
    requireApprovalFor: string[];
  };
  risk: {
    blockAutomationAboveScore: number;
  };
}

/**
 * Load the active policy from database
 */
export async function loadPolicy(prisma: PrismaClient): Promise<PolicyConfig> {
  const policy = await prisma.policy.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: 'desc' },
  });

  if (!policy) {
    // Return defaults
    return DEFAULT_POLICY;
  }

  return JSON.parse(policy.config) as PolicyConfig;
}

export const DEFAULT_POLICY: PolicyConfig = {
  policyVersion: '1.0-demo',
  contact: {
    maxTouchesAcrossChannels: 3,
    periodDays: 14,
    quietHoursLocal: '19:00-10:00',
    requireConsentForWhatsApp: true,
    stopOnOptOut: true,
  },
  retries: {
    maxRetries: 2,
    windowDays: 7,
    eligibleFailureCategories: ['transient', 'insufficient_funds'],
    blockedFailureCategories: ['hard_decline', 'revoked_mandate', 'expired_authorization'],
  },
  railSwitch: {
    minimumConsecutiveUpiAutopayFailures: 2,
    requireSeededEnachEligibility: true,
    requireNewCustomerAuthorization: true,
    requireHumanApproval: true,
  },
  promiseToPay: {
    pauseStandardDunning: true,
    graceDays: 1,
  },
  approvals: {
    highValueThresholdPaise: 2500000,
    requireApprovalFor: ['final_escalation', 'discount', 'writeoff'],
  },
  risk: {
    blockAutomationAboveScore: 0.7,
  },
};

// ============================================
// GATE DEFINITIONS
// Each gate is a pure function: (context) => PolicyGateResult
// ============================================

interface GateContext {
  caseId: string;
  cashState: string;
  diagnosisCode: string;
  action: string;
  outstandingAmountPaise: number;
  customerId?: string;
  customerOptedOut?: boolean;
  customerConsent?: boolean;
  existingTouchCount?: number;
  existingRetryCount?: number;
  failureCategory?: string;
  hasRefund?: boolean;
  hasDispute?: boolean;
  hasDuplicate?: boolean;
  hasSuccessAfterFailure?: boolean;
  hasActivePTP?: boolean;
  ptpDate?: Date;
  ptpGraceDays?: number;
  riskScore?: number;
  mandateStatus?: string;
  mandateConsecutiveFailures?: number;
  enachEligible?: boolean;
  currentHour?: number; // 0-23 in customer local time
  policy: PolicyConfig;
}

type Gate = (ctx: GateContext) => PolicyGateResult;

// ---- Gate 1: Cash State Gate ----
const cashStateGate: Gate = (ctx) => {
  const blockedStates = ['waiting_for_settlement', 'finance_review', 'risk_hold', 'closed'];
  const blocked = blockedStates.includes(ctx.cashState);
  return {
    passed: !blocked,
    gateId: 'GATE_CASH_STATE',
    gateName: 'Cash State',
    reason: blocked
      ? `Recovery automation blocked: case is "${ctx.cashState}". Only "recoverable" cases may enter recovery.`
      : `Case state "${ctx.cashState}" permits recovery actions.`,
  };
};

// ---- Gate 2: Refund/Dispute/Duplicate Gate ----
const refundDisputeGate: Gate = (ctx) => {
  if (ctx.hasRefund) {
    return { passed: false, gateId: 'GATE_REFUND', gateName: 'Refund Check', reason: 'Payment has been refunded. No recovery permitted.' };
  }
  if (ctx.hasDispute) {
    return { passed: false, gateId: 'GATE_DISPUTE', gateName: 'Dispute Check', reason: 'Active dispute/chargeback exists. No recovery automation.' };
  }
  if (ctx.hasDuplicate) {
    return { passed: false, gateId: 'GATE_DUPLICATE', gateName: 'Duplicate Check', reason: 'Duplicate payment detected. No recovery — risk of double-charging.' };
  }
  if (ctx.hasSuccessAfterFailure) {
    return { passed: false, gateId: 'GATE_POST_SUCCESS', gateName: 'Post-Failure Success', reason: 'A successful payment exists after the failure. Case is resolved.' };
  }
  return { passed: true, gateId: 'GATE_REFUND_DISPUTE', gateName: 'Refund/Dispute/Duplicate', reason: 'No refund, dispute, duplicate or post-failure success detected.' };
};

// ---- Gate 3: Opt-out / Consent Gate ----
const consentGate: Gate = (ctx) => {
  if (ctx.policy.contact.stopOnOptOut && ctx.customerOptedOut) {
    return { passed: false, gateId: 'GATE_OPT_OUT', gateName: 'Customer Opt-Out', reason: 'Customer has opted out of communications. Policy requires respecting opt-out.' };
  }

  // WhatsApp requires explicit consent
  if (ctx.action === 'reminder_whatsapp' && ctx.policy.contact.requireConsentForWhatsApp && !ctx.customerConsent) {
    return { passed: false, gateId: 'GATE_WHATSAPP_CONSENT', gateName: 'WhatsApp Consent', reason: 'WhatsApp messages require explicit customer consent (policy: requireConsentForWhatsApp=true).' };
  }

  return { passed: true, gateId: 'GATE_CONSENT', gateName: 'Consent Check', reason: 'Customer consent/opt-out checks passed.' };
};

// ---- Gate 4: Contact Cap Gate ----
const contactCapGate: Gate = (ctx) => {
  const isContactAction = ['reminder_sms', 'reminder_email', 'reminder_whatsapp', 'voice_call'].includes(ctx.action);
  if (!isContactAction) {
    return { passed: true, gateId: 'GATE_CONTACT_CAP', gateName: 'Contact Cap', reason: 'Action is not a contact — cap does not apply.' };
  }

  const maxTouches = ctx.policy.contact.maxTouchesAcrossChannels;
  const currentTouches = ctx.existingTouchCount || 0;

  if (currentTouches >= maxTouches) {
    return {
      passed: false,
      gateId: 'GATE_CONTACT_CAP',
      gateName: 'Contact Cap',
      reason: `Contact cap reached: ${currentTouches}/${maxTouches} touches in ${ctx.policy.contact.periodDays} days. Policy blocks additional contact.`,
    };
  }

  return {
    passed: true,
    gateId: 'GATE_CONTACT_CAP',
    gateName: 'Contact Cap',
    reason: `Contact cap OK: ${currentTouches}/${maxTouches} touches used in ${ctx.policy.contact.periodDays}-day window.`,
  };
};

// ---- Gate 5: Quiet Hours Gate ----
const quietHoursGate: Gate = (ctx) => {
  const isContactAction = ['reminder_sms', 'reminder_email', 'reminder_whatsapp', 'voice_call'].includes(ctx.action);
  if (!isContactAction) {
    return { passed: true, gateId: 'GATE_QUIET_HOURS', gateName: 'Quiet Hours', reason: 'Action is not a contact — quiet hours do not apply.' };
  }

  const quietHours = ctx.policy.contact.quietHoursLocal;
  const [startStr, endStr] = quietHours.split('-');
  const start = parseInt(startStr.split(':')[0]);
  const end = parseInt(endStr.split(':')[0]);
  const currentHour = ctx.currentHour ?? new Date().getHours();

  // Quiet hours span midnight (e.g., 19:00-10:00)
  let inQuietHours: boolean;
  if (start > end) {
    inQuietHours = currentHour >= start || currentHour < end;
  } else {
    inQuietHours = currentHour >= start && currentHour < end;
  }

  if (inQuietHours) {
    return {
      passed: false,
      gateId: 'GATE_QUIET_HOURS',
      gateName: 'Quiet Hours',
      reason: `Current time (${currentHour}:00) is within quiet hours (${quietHours}). Contact blocked until ${endStr}.`,
    };
  }

  return {
    passed: true,
    gateId: 'GATE_QUIET_HOURS',
    gateName: 'Quiet Hours',
    reason: `Current time (${currentHour}:00) is outside quiet hours (${quietHours}).`,
  };
};

// ---- Gate 6: Promise-to-Pay Gate ----
const ptpGate: Gate = (ctx) => {
  if (!ctx.hasActivePTP) {
    return { passed: true, gateId: 'GATE_PTP', gateName: 'Promise-to-Pay', reason: 'No active Promise-to-Pay exists.' };
  }

  if (ctx.policy.promiseToPay.pauseStandardDunning) {
    // Check if PTP grace period has elapsed
    if (ctx.ptpDate) {
      const graceEnd = new Date(ctx.ptpDate);
      graceEnd.setDate(graceEnd.getDate() + ctx.policy.promiseToPay.graceDays);

      if (new Date() <= graceEnd) {
        return {
          passed: false,
          gateId: 'GATE_PTP',
          gateName: 'Promise-to-Pay',
          reason: `Active Promise-to-Pay until ${ctx.ptpDate.toLocaleDateString()} + ${ctx.policy.promiseToPay.graceDays} day(s) grace. Standard dunning paused.`,
        };
      }
    } else {
      return {
        passed: false,
        gateId: 'GATE_PTP',
        gateName: 'Promise-to-Pay',
        reason: `Active Promise-to-Pay exists. Standard dunning paused per policy (pauseStandardDunning=true).`,
      };
    }
  }

  return { passed: true, gateId: 'GATE_PTP', gateName: 'Promise-to-Pay', reason: 'PTP grace period has elapsed.' };
};

// ---- Gate 7: Hard Decline / Mandate Gate ----
const hardDeclineGate: Gate = (ctx) => {
  if (ctx.action === 'retry_payment') {
    const blockedCategories = ctx.policy.retries.blockedFailureCategories;
    if (ctx.failureCategory && blockedCategories.includes(ctx.failureCategory)) {
      return {
        passed: false,
        gateId: 'GATE_HARD_DECLINE',
        gateName: 'Hard Decline Block',
        reason: `Retry blocked: failure category "${ctx.failureCategory}" is in blockedFailureCategories [${blockedCategories.join(', ')}].`,
      };
    }

    // Check mandate status
    if (ctx.mandateStatus === 'revoked') {
      return { passed: false, gateId: 'GATE_MANDATE', gateName: 'Mandate Check', reason: 'Mandate has been revoked. Cannot retry on this authorization.' };
    }
    if (ctx.mandateStatus === 'unknown') {
      return { passed: false, gateId: 'GATE_MANDATE', gateName: 'Mandate Check', reason: 'Mandate status unknown. Cannot retry without verified authorization.' };
    }
  }

  return { passed: true, gateId: 'GATE_HARD_DECLINE', gateName: 'Hard Decline/Mandate', reason: 'No hard decline or mandate block applies.' };
};

// ---- Gate 8: Retry Cap Gate ----
const retryCapGate: Gate = (ctx) => {
  if (ctx.action !== 'retry_payment') {
    return { passed: true, gateId: 'GATE_RETRY_CAP', gateName: 'Retry Cap', reason: 'Action is not a retry — cap does not apply.' };
  }

  const maxRetries = ctx.policy.retries.maxRetries;
  const currentRetries = ctx.existingRetryCount || 0;

  if (currentRetries >= maxRetries) {
    return {
      passed: false,
      gateId: 'GATE_RETRY_CAP',
      gateName: 'Retry Cap',
      reason: `Retry cap reached: ${currentRetries}/${maxRetries} retries in ${ctx.policy.retries.windowDays}-day window.`,
    };
  }

  // Check if failure category is eligible
  const eligibleCategories = ctx.policy.retries.eligibleFailureCategories;
  if (ctx.failureCategory && !eligibleCategories.includes(ctx.failureCategory)) {
    return {
      passed: false,
      gateId: 'GATE_RETRY_ELIGIBLE',
      gateName: 'Retry Eligibility',
      reason: `Failure category "${ctx.failureCategory}" is not in eligibleFailureCategories [${eligibleCategories.join(', ')}].`,
    };
  }

  return {
    passed: true,
    gateId: 'GATE_RETRY_CAP',
    gateName: 'Retry Cap',
    reason: `Retry permitted: ${currentRetries}/${maxRetries} used. Category "${ctx.failureCategory || 'unknown'}" is eligible.`,
  };
};

// ---- Gate 9: High Value Approval Gate ----
const highValueGate: Gate = (ctx) => {
  if (ctx.outstandingAmountPaise >= ctx.policy.approvals.highValueThresholdPaise) {
    const requiresApproval = ctx.policy.approvals.requireApprovalFor.includes(ctx.action) ||
      ctx.policy.approvals.requireApprovalFor.includes('high_value_recovery');

    if (requiresApproval) {
      return {
        passed: false,
        gateId: 'GATE_HIGH_VALUE',
        gateName: 'High Value Approval',
        reason: `Amount ₹${(ctx.outstandingAmountPaise / 100).toFixed(2)} exceeds high-value threshold ₹${(ctx.policy.approvals.highValueThresholdPaise / 100).toFixed(2)}. Requires manual approval.`,
      };
    }
  }

  return { passed: true, gateId: 'GATE_HIGH_VALUE', gateName: 'High Value', reason: 'Amount is within auto-approval threshold.' };
};

// ---- Gate 10: Risk Score Gate ----
const riskScoreGate: Gate = (ctx) => {
  if (ctx.riskScore !== undefined && ctx.riskScore >= ctx.policy.risk.blockAutomationAboveScore) {
    return {
      passed: false,
      gateId: 'GATE_RISK_SCORE',
      gateName: 'Risk Score',
      reason: `Risk score ${ctx.riskScore.toFixed(2)} exceeds automation threshold ${ctx.policy.risk.blockAutomationAboveScore}. Blocked.`,
    };
  }

  return {
    passed: true,
    gateId: 'GATE_RISK_SCORE',
    gateName: 'Risk Score',
    reason: ctx.riskScore !== undefined
      ? `Risk score ${ctx.riskScore.toFixed(2)} is below threshold ${ctx.policy.risk.blockAutomationAboveScore}.`
      : 'No risk signal present.',
  };
};

// ---- Gate 11: Rail Switch Gate ----
const railSwitchGate: Gate = (ctx) => {
  if (ctx.action !== 'propose_rail_switch') {
    return { passed: true, gateId: 'GATE_RAIL_SWITCH', gateName: 'Rail Switch', reason: 'Action is not a rail switch proposal.' };
  }

  const minFailures = ctx.policy.railSwitch.minimumConsecutiveUpiAutopayFailures;
  const consecutiveFailures = ctx.mandateConsecutiveFailures || 0;

  if (consecutiveFailures < minFailures) {
    return {
      passed: false,
      gateId: 'GATE_RAIL_SWITCH_MIN',
      gateName: 'Rail Switch Minimum Failures',
      reason: `Need ${minFailures} consecutive UPI Autopay failures before proposing rail switch. Current: ${consecutiveFailures}.`,
    };
  }

  if (ctx.policy.railSwitch.requireSeededEnachEligibility && !ctx.enachEligible) {
    return {
      passed: false,
      gateId: 'GATE_RAIL_SWITCH_ENACH',
      gateName: 'eNACH Eligibility',
      reason: 'Rail switch requires seeded eNACH eligibility data. Customer is not marked eligible.',
    };
  }

  if (ctx.policy.railSwitch.requireHumanApproval) {
    return {
      passed: false,
      gateId: 'GATE_RAIL_SWITCH_APPROVAL',
      gateName: 'Rail Switch Human Approval',
      reason: 'Rail switch proposal requires human approval (policy: requireHumanApproval=true).',
    };
  }

  return { passed: true, gateId: 'GATE_RAIL_SWITCH', gateName: 'Rail Switch', reason: 'Rail switch requirements met.' };
};

// ---- Gate 12: Settlement Ambiguity Gate ----
const ambiguityGate: Gate = (ctx) => {
  const ambiguousCodes = ['ambiguous_alias', 'missing_reference', 'unknown_fee_short_settlement', 'duplicate_bank_credit'];
  if (ambiguousCodes.includes(ctx.diagnosisCode)) {
    return {
      passed: false,
      gateId: 'GATE_AMBIGUITY',
      gateName: 'Financial Ambiguity',
      reason: `Diagnosis "${ctx.diagnosisCode}" indicates financial ambiguity or unexplained settlement difference. Recovery blocked.`,
    };
  }

  return { passed: true, gateId: 'GATE_AMBIGUITY', gateName: 'Financial Ambiguity', reason: 'No financial ambiguity detected.' };
};

// ============================================
// ALL GATES in evaluation order
// ============================================
const ALL_GATES: Gate[] = [
  cashStateGate,
  refundDisputeGate,
  ambiguityGate,
  consentGate,
  contactCapGate,
  quietHoursGate,
  ptpGate,
  hardDeclineGate,
  retryCapGate,
  highValueGate,
  riskScoreGate,
  railSwitchGate,
];

/**
 * Evaluate a single action against all policy gates.
 * Returns a FirewallDecision with all gates passed/failed.
 */
export function evaluateAction(ctx: GateContext): FirewallDecision {
  const passed: PolicyGateResult[] = [];
  const failed: PolicyGateResult[] = [];

  for (const gate of ALL_GATES) {
    const result = gate(ctx);
    if (result.passed) {
      passed.push(result);
    } else {
      failed.push(result);
    }
  }

  return {
    allowed: failed.length === 0,
    action: ctx.action,
    caseId: ctx.caseId,
    gatesPassed: passed,
    gatesFailed: failed,
    policyVersion: ctx.policy.policyVersion,
    evaluatedAt: new Date(),
  };
}

/**
 * Evaluate ALL possible actions for a recovery case.
 * Returns allowed and blocked lists with explanations.
 */
export async function evaluateAllActions(
  prisma: PrismaClient,
  caseId: string,
  policy?: PolicyConfig
): Promise<{
  allowed: FirewallDecision[];
  blocked: FirewallDecision[];
}> {
  const activePolicy = policy || await loadPolicy(prisma);

  let recoveryCase = await prisma.recoveryCase.findUnique({
    where: { id: caseId },
    include: {
      recoveryActions: true,
      promiseToPays: { where: { state: 'active' } },
      riskSignals: true,
    },
  });
  if (!recoveryCase) {
    recoveryCase = await prisma.recoveryCase.findFirst({
      where: { caseNumber: caseId },
      include: {
        recoveryActions: true,
        promiseToPays: { where: { state: 'active' } },
        riskSignals: true,
      },
    });
  }

  if (!recoveryCase) {
    return { allowed: [], blocked: [] };
  }

  const resolvedCaseId = recoveryCase.id;

  // Get customer info
  const evidenceRefs = JSON.parse(recoveryCase.evidenceRefs) as string[];
  
  // Determine customer from evidence
  let customer = null;
  for (const ref of evidenceRefs) {
    const invoice = await prisma.invoice.findUnique({ where: { id: ref }, select: { customerId: true } });
    if (invoice) {
      customer = await prisma.customer.findUnique({ where: { id: invoice.customerId } });
      break;
    }
    const payment = await prisma.paymentAttempt.findUnique({
      where: { id: ref },
      include: { order: { include: { customer: true } } },
    });
    if (payment?.order?.customer) {
      customer = payment.order.customer;
      break;
    }
  }

  // Count existing touches in the policy period
  const periodStart = new Date();
  periodStart.setDate(periodStart.getDate() - activePolicy.contact.periodDays);
  const touchCount = await prisma.communication.count({
    where: {
      customerId: customer?.id || '',
      createdAt: { gte: periodStart },
    },
  });

  // Count existing retries
  const retryStart = new Date();
  retryStart.setDate(retryStart.getDate() - activePolicy.retries.windowDays);
  const retryCount = await prisma.recoveryAction.count({
    where: {
      recoveryCaseId: resolvedCaseId,
      actionType: 'retry_payment',
      createdAt: { gte: retryStart },
    },
  });

  // Parse gateway response for failure details
  let failureCategory = '';
  let mandateStatus = '';
  let mandateConsecutiveFailures = 0;
  let enachEligible = false;

  for (const ref of evidenceRefs) {
    const payment = await prisma.paymentAttempt.findUnique({ where: { id: ref } });
    if (payment) {
      failureCategory = payment.failureCategory || '';
      if (payment.gatewayResponse) {
        try {
          const gw = JSON.parse(payment.gatewayResponse);
          mandateStatus = gw.mandate_status || '';
          mandateConsecutiveFailures = gw.consecutive_failures || 0;
          enachEligible = gw.enach_eligible || false;
        } catch {}
      }
      break;
    }
  }

  // Active PTP
  const activePTP = recoveryCase.promiseToPays[0];
  
  // Risk signals
  const maxRiskScore = recoveryCase.riskSignals.reduce((max, s) => Math.max(max, s.score), 0);

  // Check refund/dispute/duplicate from diagnosis
  const hasRefund = recoveryCase.diagnosisCode === 'refund_issued';
  const hasDispute = recoveryCase.diagnosisCode === 'dispute_chargeback';
  const hasDuplicate = recoveryCase.diagnosisCode === 'duplicate_payment';

  // Define all possible actions
  const allActions = [
    'retry_payment',
    'payment_link',
    'reminder_sms',
    'reminder_email',
    'reminder_whatsapp',
    'voice_call',
    'propose_rail_switch',
    'manual_review',
    'escalation',
  ];

  const allowed: FirewallDecision[] = [];
  const blocked: FirewallDecision[] = [];

  for (const action of allActions) {
    const ctx: GateContext = {
      caseId: resolvedCaseId,
      cashState: recoveryCase.cashState,
      diagnosisCode: recoveryCase.diagnosisCode,
      action,
      outstandingAmountPaise: recoveryCase.outstandingAmountPaise,
      customerId: customer?.id,
      customerOptedOut: customer?.optedOut || false,
      customerConsent: customer?.consentWhatsApp || customer?.consentSms || false,
      existingTouchCount: touchCount,
      existingRetryCount: retryCount,
      failureCategory,
      hasRefund,
      hasDispute,
      hasDuplicate,
      hasSuccessAfterFailure: false,
      hasActivePTP: !!activePTP,
      ptpDate: activePTP?.promisedDate || undefined,
      ptpGraceDays: activePolicy.promiseToPay.graceDays,
      riskScore: maxRiskScore > 0 ? maxRiskScore : undefined,
      mandateStatus,
      mandateConsecutiveFailures,
      enachEligible,
      currentHour: 14, // Demo: assume business hours
      policy: activePolicy,
    };

    const decision = evaluateAction(ctx);
    if (decision.allowed) {
      allowed.push(decision);
    } else {
      blocked.push(decision);
    }
  }

  return { allowed, blocked };
}
