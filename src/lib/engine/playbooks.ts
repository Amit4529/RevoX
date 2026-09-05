// ============================================
// Recovery Playbooks — Action Execution Layer
//
// Each playbook handles a specific recovery scenario:
// A. Transient payment failure → retry + payment link
// B. Insufficient funds / recurring → timing-aware retry + rail switch
// C. High-intent checkout abandonment → payment link
// D. B2B overdue invoice → payment request + PTP
// ============================================

import { PrismaClient } from '@prisma/client';
import { evaluateAllActions, loadPolicy, type PolicyConfig } from './firewall';
import { scoreAndRankActions, generateRecommendationExplanation } from './scorer';
import { capturePTP } from './ptp';
import { getRecommendedPlaybook, getDiagnosis } from './diagnosis';
import { v4 as uuid } from 'uuid';

export interface PlaybookResult {
  success: boolean;
  actionId: string;
  actionType: string;
  status: string;
  receipt: string;
  explanation: string;
  auditEventId: string;
  blockedReason?: string;
  playbookUsed?: string;
  nextStep?: string;
}

export interface PlaybookPlan {
  playbookId: string;
  playbookLabel: string;
  caseId: string;
  diagnosisCode: string;
  steps: PlaybookStep[];
  currentStepIndex: number;
  isComplete: boolean;
}

export interface PlaybookStep {
  stepNumber: number;
  action: string;
  description: string;
  isAllowed: boolean;
  blockedReason?: string;
  waitCondition?: string;
}

// ============================================
// PLAYBOOK A: Transient Payment Failure
//
// Flow: wait window → max 2 retries in 7 days →
//       payment link fallback → re-reconcile on success
// ============================================

async function playbookA(
  prisma: PrismaClient,
  caseId: string,
  policy: PolicyConfig,
): Promise<PlaybookPlan> {
  const recoveryCase = await prisma.recoveryCase.findUnique({
    where: { id: caseId },
    include: { recoveryActions: { orderBy: { createdAt: 'desc' } } },
  });

  if (!recoveryCase) throw new Error('Recovery case not found');

  const retryWindow = new Date();
  retryWindow.setDate(retryWindow.getDate() - policy.retries.windowDays);

  const recentRetries = recoveryCase.recoveryActions.filter(
    a => a.actionType === 'retry_payment' && a.createdAt >= retryWindow
  );
  const retryCount = recentRetries.length;
  const maxRetries = policy.retries.maxRetries;

  const { allowed } = await evaluateAllActions(prisma, caseId, policy);
  const allowedActions = new Set(allowed.map(a => a.action));

  const steps: PlaybookStep[] = [];
  let stepNum = 1;

  // Step 1: Wait window (4–12 hours for transient failures)
  const lastAction = recoveryCase.recoveryActions[0];
  const hoursSinceLastAction = lastAction
    ? (Date.now() - new Date(lastAction.createdAt).getTime()) / (1000 * 60 * 60)
    : Infinity;

  if (hoursSinceLastAction < 4) {
    steps.push({
      stepNumber: stepNum++,
      action: 'wait',
      description: `Wait ${Math.ceil(4 - hoursSinceLastAction)} more hours before next action (transient failure cool-down).`,
      isAllowed: false,
      blockedReason: 'Cool-down period active',
      waitCondition: `Wait until ${Math.ceil(4 - hoursSinceLastAction)}h elapsed since last action`,
    });
  }

  // Step 2: Retry payment (up to max retries)
  if (retryCount < maxRetries) {
    const canRetry = allowedActions.has('retry_payment');
    // For card_expired, skip retry — go straight to payment link
    const isCardExpired = recoveryCase.diagnosisCode === 'card_expired';
    steps.push({
      stepNumber: stepNum++,
      action: 'retry_payment',
      description: isCardExpired
        ? 'Skip retry — card is expired, retry will always fail. Proceed to payment link.'
        : `Retry payment (attempt ${retryCount + 1}/${maxRetries} in ${policy.retries.windowDays}-day window).`,
      isAllowed: canRetry && !isCardExpired,
      blockedReason: isCardExpired
        ? 'Card expired — retry futile'
        : !canRetry ? 'Blocked by firewall' : undefined,
    });
  }

  // Step 3: Payment link fallback
  if (retryCount >= maxRetries || recoveryCase.diagnosisCode === 'card_expired') {
    const canSendLink = allowedActions.has('payment_link');
    steps.push({
      stepNumber: stepNum++,
      action: 'payment_link',
      description: retryCount >= maxRetries
        ? `Retry cap reached (${maxRetries}/${maxRetries}). Sending secure payment link as fallback.`
        : 'Sending payment link (card expired — direct to new payment method).',
      isAllowed: canSendLink,
      blockedReason: !canSendLink ? 'Blocked by firewall' : undefined,
    });
  }

  // Step 4: Email reminder with link
  if (retryCount >= maxRetries) {
    const canEmail = allowedActions.has('reminder_email');
    steps.push({
      stepNumber: stepNum++,
      action: 'reminder_email',
      description: 'Send payment reminder email with embedded payment link.',
      isAllowed: canEmail,
      blockedReason: !canEmail ? 'Blocked by firewall' : undefined,
    });
  }

  // Determine current step
  let currentStepIndex = 0;
  if (hoursSinceLastAction >= 4) currentStepIndex = Math.min(1, steps.length - 1);
  if (retryCount >= maxRetries) currentStepIndex = Math.min(2, steps.length - 1);

  return {
    playbookId: 'playbook_a',
    playbookLabel: 'Playbook A: Transient Payment Failure',
    caseId,
    diagnosisCode: recoveryCase.diagnosisCode,
    steps,
    currentStepIndex,
    isComplete: steps.every(s => !s.isAllowed),
  };
}

// ============================================
// PLAYBOOK B: Insufficient Funds / Recurring
//
// Flow: validate mandate → timing-aware retry (after salary) →
//       cap visibility → cross-rail switch (eNACH) after 2 failures
// ============================================

async function playbookB(
  prisma: PrismaClient,
  caseId: string,
  policy: PolicyConfig,
): Promise<PlaybookPlan> {
  const recoveryCase = await prisma.recoveryCase.findUnique({
    where: { id: caseId },
    include: { recoveryActions: { orderBy: { createdAt: 'desc' } } },
  });

  if (!recoveryCase) throw new Error('Recovery case not found');

  const { allowed } = await evaluateAllActions(prisma, caseId, policy);
  const allowedActions = new Set(allowed.map(a => a.action));

  // Parse gateway response for mandate info
  let mandateConsecutiveFailures = 0;
  let enachEligible = false;
  const evidenceRefs = JSON.parse(recoveryCase.evidenceRefs) as string[];

  for (const ref of evidenceRefs) {
    const payment = await prisma.paymentAttempt.findUnique({ where: { id: ref } });
    if (payment?.gatewayResponse) {
      try {
        const gw = JSON.parse(payment.gatewayResponse);
        mandateConsecutiveFailures = gw.consecutive_failures || 0;
        enachEligible = gw.enach_eligible || false;
      } catch { /* ignore parse errors */ }
      break;
    }
  }

  const retryWindow = new Date();
  retryWindow.setDate(retryWindow.getDate() - policy.retries.windowDays);
  const recentRetries = recoveryCase.recoveryActions.filter(
    a => a.actionType === 'retry_payment' && a.createdAt >= retryWindow
  );
  const retryCount = recentRetries.length;

  const steps: PlaybookStep[] = [];
  let stepNum = 1;

  // Step 1: Timing-aware retry (suggest after 1st of month for salary)
  const today = new Date();
  const dayOfMonth = today.getDate();
  const isNearSalaryDay = dayOfMonth >= 1 && dayOfMonth <= 5;

  if (retryCount < policy.retries.maxRetries) {
    const canRetry = allowedActions.has('retry_payment');
    steps.push({
      stepNumber: stepNum++,
      action: 'retry_payment',
      description: isNearSalaryDay
        ? `Timing-aware retry: near salary credit window (day ${dayOfMonth}). Good time to retry insufficient funds.`
        : `Retry payment (${retryCount + 1}/${policy.retries.maxRetries}). Consider waiting until salary credit window (1st–5th of month).`,
      isAllowed: canRetry,
      blockedReason: !canRetry ? 'Blocked by firewall' : undefined,
      waitCondition: !isNearSalaryDay ? 'Optimal: wait until 1st–5th of month for salary credit' : undefined,
    });
  }

  // Step 2: Payment link with alternative methods
  const canSendLink = allowedActions.has('payment_link');
  steps.push({
    stepNumber: stepNum++,
    action: 'payment_link',
    description: 'Send payment link suggesting alternative payment methods (UPI, netbanking, wallet).',
    isAllowed: canSendLink,
    blockedReason: !canSendLink ? 'Blocked by firewall' : undefined,
  });

  // Step 3: SMS reminder
  const canSMS = allowedActions.has('reminder_sms');
  steps.push({
    stepNumber: stepNum++,
    action: 'reminder_sms',
    description: 'Send SMS reminder with payment link.',
    isAllowed: canSMS,
    blockedReason: !canSMS ? 'Blocked by firewall' : undefined,
  });

  // Step 4: Rail switch proposal (after 2+ UPI Autopay failures with eNACH eligibility)
  const minFailures = policy.railSwitch.minimumConsecutiveUpiAutopayFailures;
  if (mandateConsecutiveFailures >= minFailures) {
    const canSwitch = allowedActions.has('propose_rail_switch');
    steps.push({
      stepNumber: stepNum++,
      action: 'propose_rail_switch',
      description: enachEligible
        ? `Propose rail switch: ${mandateConsecutiveFailures} consecutive UPI Autopay failures detected. Customer is eNACH-eligible. Requires new customer authorization and human approval.`
        : `Rail switch blocked: ${mandateConsecutiveFailures} failures detected, but customer is NOT eNACH-eligible.`,
      isAllowed: canSwitch && enachEligible,
      blockedReason: !enachEligible
        ? 'Customer not eNACH-eligible'
        : !canSwitch ? 'Requires human approval per policy' : undefined,
    });
  }

  const currentStepIndex = Math.min(retryCount, steps.length - 1);

  return {
    playbookId: 'playbook_b',
    playbookLabel: 'Playbook B: Insufficient Funds / Recurring',
    caseId,
    diagnosisCode: recoveryCase.diagnosisCode,
    steps,
    currentStepIndex,
    isComplete: steps.every(s => !s.isAllowed),
  };
}

// ============================================
// PLAYBOOK C: High-Intent Checkout Abandonment
//
// Flow: signals-based → secure payment link →
//       method recommendation → stop conditions
// ============================================

async function playbookC(
  prisma: PrismaClient,
  caseId: string,
  policy: PolicyConfig,
): Promise<PlaybookPlan> {
  const recoveryCase = await prisma.recoveryCase.findUnique({
    where: { id: caseId },
    include: { recoveryActions: { orderBy: { createdAt: 'desc' } } },
  });

  if (!recoveryCase) throw new Error('Recovery case not found');

  const { allowed } = await evaluateAllActions(prisma, caseId, policy);
  const allowedActions = new Set(allowed.map(a => a.action));

  // Get checkout session details
  const evidenceRefs = JSON.parse(recoveryCase.evidenceRefs) as string[];
  let checkoutSession = null;
  for (const ref of evidenceRefs) {
    checkoutSession = await prisma.checkoutSession.findUnique({ where: { id: ref } });
    if (checkoutSession) break;
  }

  const steps: PlaybookStep[] = [];
  let stepNum = 1;

  // Step 1: Signal assessment
  const stageReached = checkoutSession?.stageReached || 'unknown';
  const paymentMethod = checkoutSession?.paymentMethod;
  const hasConsent = checkoutSession?.consentGiven || false;

  steps.push({
    stepNumber: stepNum++,
    action: 'assess_signals',
    description: [
      `Intent signals: stage reached = "${stageReached}"`,
      paymentMethod ? `preferred method = ${paymentMethod}` : 'no payment method selected',
      `consent = ${hasConsent ? 'yes' : 'no'}`,
      `cart value = ₹${(recoveryCase.outstandingAmountPaise / 100).toFixed(2)}`,
    ].join(', '),
    isAllowed: true,
  });

  // Step 2: Payment link (personalized)
  const canSendLink = allowedActions.has('payment_link');
  steps.push({
    stepNumber: stepNum++,
    action: 'payment_link',
    description: paymentMethod
      ? `Send payment link with pre-selected method (${paymentMethod}) based on customer's last attempt.`
      : 'Send payment link with multiple method options.',
    isAllowed: canSendLink,
    blockedReason: !canSendLink ? 'Blocked by firewall' : undefined,
  });

  // Step 3: Email reminder (if consented)
  const canEmail = allowedActions.has('reminder_email');
  steps.push({
    stepNumber: stepNum++,
    action: 'reminder_email',
    description: 'Send abandonment recovery email with embedded payment link and product summary.',
    isAllowed: canEmail,
    blockedReason: !canEmail ? 'Blocked by firewall' : undefined,
  });

  // Step 4: WhatsApp (if consented and available)
  if (hasConsent) {
    const canWhatsApp = allowedActions.has('reminder_whatsapp');
    steps.push({
      stepNumber: stepNum++,
      action: 'reminder_whatsapp',
      description: 'Send WhatsApp reminder with payment link (consent verified).',
      isAllowed: canWhatsApp,
      blockedReason: !canWhatsApp ? 'Blocked by firewall' : undefined,
    });
  }

  // Stop conditions
  const existingActions = recoveryCase.recoveryActions.length;
  const currentStepIndex = Math.min(existingActions, steps.length - 1);

  return {
    playbookId: 'playbook_c',
    playbookLabel: 'Playbook C: High-Intent Checkout Abandonment',
    caseId,
    diagnosisCode: recoveryCase.diagnosisCode,
    steps,
    currentStepIndex,
    isComplete: steps.every(s => !s.isAllowed),
  };
}

// ============================================
// PLAYBOOK D: B2B Overdue Invoice
//
// Flow: verify no late credit/dispute → payment request →
//       partial payment policy → PTP capture →
//       human approval for escalation
// ============================================

async function playbookD(
  prisma: PrismaClient,
  caseId: string,
  policy: PolicyConfig,
): Promise<PlaybookPlan> {
  const recoveryCase = await prisma.recoveryCase.findUnique({
    where: { id: caseId },
    include: {
      recoveryActions: { orderBy: { createdAt: 'desc' } },
      promiseToPays: { where: { state: 'active' } },
    },
  });

  if (!recoveryCase) throw new Error('Recovery case not found');

  const { allowed } = await evaluateAllActions(prisma, caseId, policy);
  const allowedActions = new Set(allowed.map(a => a.action));
  const hasPTP = recoveryCase.promiseToPays.length > 0;
  const isBrokenPTP = recoveryCase.diagnosisCode === 'promise_to_pay_broken';

  const steps: PlaybookStep[] = [];
  let stepNum = 1;

  // Step 1: Verify no late credit or dispute
  steps.push({
    stepNumber: stepNum++,
    action: 'verify_preconditions',
    description: 'Verify: no late bank credit matching this invoice, no active dispute, no refund in progress.',
    isAllowed: true,
  });

  // Step 2: Payment link / request
  const canSendLink = allowedActions.has('payment_link');
  steps.push({
    stepNumber: stepNum++,
    action: 'payment_link',
    description: isBrokenPTP
      ? 'Send updated payment link (post-PTP-broken escalation stage).'
      : `Send B2B payment request for outstanding ₹${(recoveryCase.outstandingAmountPaise / 100).toFixed(2)}.`,
    isAllowed: canSendLink,
    blockedReason: !canSendLink ? 'Blocked by firewall' : undefined,
  });

  // Step 3: Email reminder
  const canEmail = allowedActions.has('reminder_email');
  if (!isBrokenPTP) {
    steps.push({
      stepNumber: stepNum++,
      action: 'reminder_email',
      description: 'Send formal payment reminder email with invoice details and payment link.',
      isAllowed: canEmail,
      blockedReason: !canEmail ? 'Blocked by firewall' : undefined,
    });
  }

  // Step 4: Voice call (for high-value or overdue)
  const canVoice = allowedActions.has('voice_call');
  steps.push({
    stepNumber: stepNum++,
    action: 'voice_call',
    description: hasPTP
      ? 'Voice call blocked: active Promise-to-Pay exists.'
      : isBrokenPTP
        ? 'Follow-up voice call (post-PTP-broken stage). May capture new PTP or confirm payment.'
        : 'Courtesy voice call to discuss payment. May result in Promise-to-Pay capture.',
    isAllowed: canVoice && !hasPTP,
    blockedReason: hasPTP ? 'Active PTP — dunning paused' : !canVoice ? 'Blocked by firewall' : undefined,
  });

  // Step 5: PTP opportunity
  if (!hasPTP && !isBrokenPTP) {
    steps.push({
      stepNumber: stepNum++,
      action: 'capture_ptp',
      description: 'If customer promises to pay during voice call, capture structured Promise-to-Pay (amount, date, transcript).',
      isAllowed: true,
    });
  }

  // Step 6: Escalation (requires human approval for high-value)
  const isHighValue = recoveryCase.outstandingAmountPaise >= policy.approvals.highValueThresholdPaise;
  const canEscalate = allowedActions.has('escalation');
  steps.push({
    stepNumber: stepNum++,
    action: 'escalation',
    description: isHighValue
      ? `Escalation requires manual approval: outstanding ₹${(recoveryCase.outstandingAmountPaise / 100).toFixed(2)} exceeds threshold ₹${(policy.approvals.highValueThresholdPaise / 100).toFixed(2)}.`
      : 'Escalate to finance ops team for further action.',
    isAllowed: canEscalate,
    blockedReason: !canEscalate
      ? isHighValue ? 'Requires manual approval (high value)' : 'Blocked by firewall'
      : undefined,
  });

  const existingActions = recoveryCase.recoveryActions.length;
  const currentStepIndex = Math.min(existingActions, steps.length - 1);

  return {
    playbookId: 'playbook_d',
    playbookLabel: 'Playbook D: B2B Overdue Invoice',
    caseId,
    diagnosisCode: recoveryCase.diagnosisCode,
    steps,
    currentStepIndex,
    isComplete: steps.every(s => !s.isAllowed),
  };
}

// ============================================
// Playbook Selection & Orchestration
// ============================================

/**
 * Select the appropriate playbook for a recovery case
 */
export function selectPlaybook(diagnosisCode: string): 'A' | 'B' | 'C' | 'D' | null {
  return getRecommendedPlaybook(diagnosisCode);
}

/**
 * Generate a playbook plan for a recovery case (preview, no execution)
 */
export async function previewPlaybook(
  prisma: PrismaClient,
  caseId: string,
): Promise<PlaybookPlan | null> {
  let recoveryCase = await prisma.recoveryCase.findUnique({
    where: { id: caseId },
  });
  // Fallback: try finding by caseNumber
  if (!recoveryCase) {
    recoveryCase = await prisma.recoveryCase.findFirst({
      where: { caseNumber: caseId },
    });
  }

  if (!recoveryCase) return null;

  const resolvedId = recoveryCase.id;
  const playbook = selectPlaybook(recoveryCase.diagnosisCode);
  const policy = await loadPolicy(prisma);

  switch (playbook) {
    case 'A': return playbookA(prisma, resolvedId, policy);
    case 'B': return playbookB(prisma, resolvedId, policy);
    case 'C': return playbookC(prisma, resolvedId, policy);
    case 'D': return playbookD(prisma, resolvedId, policy);
    default:
      return {
        playbookId: 'none',
        playbookLabel: 'No Playbook — ' + getDiagnosis(recoveryCase.diagnosisCode).label,
        caseId: resolvedId,
        diagnosisCode: recoveryCase.diagnosisCode,
        steps: [{
          stepNumber: 1,
          action: 'manual_review',
          description: getDiagnosis(recoveryCase.diagnosisCode).whatWouldChangeMind,
          isAllowed: false,
          blockedReason: 'No automated playbook for this diagnosis. ' + getDiagnosis(recoveryCase.diagnosisCode).description,
        }],
        currentStepIndex: 0,
        isComplete: true,
      };
  }
}

/**
 * Run the next step of the appropriate playbook for a case.
 * Returns the result of executing the recommended action.
 */
export async function runPlaybook(
  prisma: PrismaClient,
  caseId: string,
): Promise<PlaybookResult> {
  const plan = await previewPlaybook(prisma, caseId);

  if (!plan) {
    return {
      success: false,
      actionId: '',
      actionType: '',
      status: 'rejected',
      receipt: '',
      explanation: 'Recovery case not found.',
      auditEventId: '',
    };
  }

  // Find the next executable step
  const nextStep = plan.steps.find(
    (s, i) => i >= plan.currentStepIndex && s.isAllowed && !['wait', 'assess_signals', 'verify_preconditions', 'capture_ptp'].includes(s.action)
  );

  if (!nextStep) {
    return {
      success: false,
      actionId: '',
      actionType: '',
      status: 'no_action',
      receipt: '',
      explanation: plan.isComplete
        ? `${plan.playbookLabel}: All steps complete or blocked. No further automated action available.`
        : `${plan.playbookLabel}: Next step requires waiting or manual intervention.`,
      auditEventId: '',
      playbookUsed: plan.playbookLabel,
      nextStep: plan.steps.find(s => !s.isAllowed)?.description,
    };
  }

  // Execute the action through the standard flow
  const result = await executeRecoveryAction(prisma, caseId, nextStep.action);

  return {
    ...result,
    playbookUsed: plan.playbookLabel,
    nextStep: plan.steps[plan.steps.indexOf(nextStep) + 1]?.description,
  };
}

/**
 * Execute a recovery action on a case.
 * Runs through: firewall → score → execute → audit
 */
export async function executeRecoveryAction(
  prisma: PrismaClient,
  caseId: string,
  requestedAction: string,
  executionParams?: Record<string, unknown>
): Promise<PlaybookResult> {
  // Step 1: Load the case
  let recoveryCase = await prisma.recoveryCase.findUnique({
    where: { id: caseId },
  });
  if (!recoveryCase) {
    recoveryCase = await prisma.recoveryCase.findFirst({
      where: { caseNumber: caseId },
    });
  }

  if (!recoveryCase) {
    return {
      success: false,
      actionId: '',
      actionType: requestedAction,
      status: 'rejected',
      receipt: '',
      explanation: 'Recovery case not found.',
      auditEventId: '',
    };
  }

  const resolvedCaseId = recoveryCase.id;

  // Step 2: Run through firewall
  const { allowed, blocked } = await evaluateAllActions(prisma, resolvedCaseId);
  const isAllowed = allowed.some(a => a.action === requestedAction);
  const blockedDecision = blocked.find(b => b.action === requestedAction);

  if (!isAllowed) {
    const reason = blockedDecision
      ? blockedDecision.gatesFailed.map(g => `${g.gateName}: ${g.reason}`).join(' | ')
      : 'Action not permitted by policy.';

    // Log the blocked attempt
    const audit = await prisma.auditEvent.create({
      data: {
        caseId,
        actor: 'recovery-engine',
        actorVersion: '1.0-demo',
        eventType: 'ACTION_BLOCKED',
        inputRecordRefs: JSON.stringify([caseId]),
        ruleOrPromptVersion: blockedDecision?.policyVersion || '1.0-demo',
        decision: JSON.stringify({
          action: requestedAction,
          blocked: true,
          gatesFailed: blockedDecision?.gatesFailed.map(g => g.gateId),
        }),
        reasons: JSON.stringify(blockedDecision?.gatesFailed.map(g => g.reason) || [reason]),
        policySnapshot: blockedDecision?.policyVersion || '1.0-demo',
      },
    });

    return {
      success: false,
      actionId: '',
      actionType: requestedAction,
      status: 'blocked',
      receipt: '',
      explanation: `BLOCKED by Do Not Recover Firewall: ${reason}`,
      auditEventId: audit.id,
      blockedReason: reason,
    };
  }

  // Step 3: Score the action and generate explanation
  const allowedActions = allowed.map(a => a.action);
  const scores = scoreAndRankActions(
    allowedActions,
    recoveryCase.diagnosisCode,
    recoveryCase.outstandingAmountPaise
  );
  const recommendation = generateRecommendationExplanation(scores);
  const actionScore = scores.find(s => s.action === requestedAction);

  // Step 4: Execute the action (simulated in demo mode)
  const idempotencyKey = `cic_${caseId}_${requestedAction}_${Date.now()}`;
  let receipt = '';
  let executionDetails = {};

  switch (requestedAction) {
    case 'retry_payment':
      receipt = await simulateRetryPayment(caseId, recoveryCase.outstandingAmountPaise);
      executionDetails = { retryId: receipt, method: 'api_call', simulated: true };
      break;

    case 'payment_link':
      receipt = await simulatePaymentLink(caseId, recoveryCase.outstandingAmountPaise);
      executionDetails = { linkId: receipt, url: `https://rzp.io/l/${receipt}`, expiresIn: '72h', simulated: true };
      break;

    case 'reminder_sms':
      receipt = await simulateReminder('sms', caseId);
      executionDetails = { messageId: receipt, channel: 'sms', template: 'payment_reminder_v1', simulated: true };
      break;

    case 'reminder_email':
      receipt = await simulateReminder('email', caseId);
      executionDetails = { messageId: receipt, channel: 'email', template: 'payment_reminder_v1', simulated: true };
      break;

    case 'reminder_whatsapp':
      receipt = await simulateReminder('whatsapp', caseId);
      executionDetails = { messageId: receipt, channel: 'whatsapp', template: 'payment_reminder_whatsapp_v1', simulated: true };
      break;

    case 'voice_call':
      receipt = await simulateVoiceCall(caseId);
      executionDetails = { callId: receipt, simulated: true, duration: '0:00', status: 'queued' };
      break;

    case 'propose_rail_switch':
      receipt = `rail_switch_${uuid().substring(0, 8)}`;
      executionDetails = { proposalId: receipt, fromRail: 'upi_autopay', toRail: 'enach', requiresCustomerAuth: true, simulated: true };
      break;

    case 'manual_review':
      receipt = `review_${uuid().substring(0, 8)}`;
      executionDetails = { reviewId: receipt, assignedTo: 'finance_ops_queue', simulated: true };
      break;

    case 'escalation':
      receipt = `esc_${uuid().substring(0, 8)}`;
      executionDetails = { escalationId: receipt, level: 'manager', simulated: true };
      break;

    default:
      receipt = `action_${uuid().substring(0, 8)}`;
      executionDetails = { simulated: true };
  }

  // Step 5: Create recovery action record
  const action = await prisma.recoveryAction.create({
    data: {
      recoveryCaseId: caseId,
      actionType: requestedAction,
      idempotencyKey,
      status: 'completed',
      executionReceipt: receipt,
      outcomeReference: JSON.stringify(executionDetails),
    },
  });

  // Step 6: Create policy decision record
  const policy = await loadPolicy(prisma);
  const policyRecord = await prisma.policy.findFirst({ where: { isActive: true } });
  if (policyRecord) {
    await prisma.policyDecision.create({
      data: {
        recoveryCaseId: caseId,
        policyId: policyRecord.id,
        action: requestedAction,
        allowed: true,
        gatesPassed: JSON.stringify(allowed.find(a => a.action === requestedAction)?.gatesPassed.map(g => g.gateId) || []),
        gatesFailed: JSON.stringify([]),
      },
    });
  }

  // Step 7: Create audit event
  const audit = await prisma.auditEvent.create({
    data: {
      caseId,
      actor: 'recovery-engine',
      actorVersion: '1.0-demo',
      eventType: 'ACTION_EXECUTED',
      inputRecordRefs: JSON.stringify([caseId, action.id]),
      ruleOrPromptVersion: '1.0-demo',
      decision: JSON.stringify({
        action: requestedAction,
        idempotencyKey,
        receipt,
        score: actionScore ? {
          expectedNetRecoveryPaise: actionScore.expectedNetRecoveryPaise,
          probability: actionScore.predictedSuccessProbability,
          rank: actionScore.rank,
        } : null,
      }),
      reasons: JSON.stringify([
        `Action "${requestedAction}" executed for case ${recoveryCase.caseNumber}.`,
        actionScore ? `Expected recovery: ₹${(actionScore.expectedNetRecoveryPaise / 100).toFixed(2)} (rank #${actionScore.rank})` : '',
        `Receipt: ${receipt}`,
      ].filter(Boolean)),
      policySnapshot: policy.policyVersion,
    },
  });

  return {
    success: true,
    actionId: action.id,
    actionType: requestedAction,
    status: 'completed',
    receipt,
    explanation: [
      `Action "${requestedAction}" executed successfully.`,
      '',
      recommendation,
    ].join('\n'),
    auditEventId: audit.id,
  };
}

// ============================================
// Simulated action handlers (demo mode)
// ============================================

async function simulateRetryPayment(caseId: string, amountPaise: number): Promise<string> {
  // In production, this would call Razorpay's retry API
  // In demo mode, we simulate with a receipt
  return `retry_${uuid().substring(0, 8)}_${amountPaise}p`;
}

async function simulatePaymentLink(caseId: string, amountPaise: number): Promise<string> {
  // In production, this would call POST /v1/payment_links
  return `plink_${uuid().substring(0, 8)}`;
}

async function simulateReminder(channel: string, caseId: string): Promise<string> {
  return `msg_${channel}_${uuid().substring(0, 8)}`;
}

async function simulateVoiceCall(caseId: string): Promise<string> {
  return `call_${uuid().substring(0, 8)}`;
}
