// ============================================
// Promise-to-Pay State Machine
//
// States: active → kept | broken | cancelled
// 
// Capture: amount, date, case ID, source, transcript
// On active: pause normal reminders/retries
// On payment: mark kept, reconcile, close
// On missed: mark broken, resume at next policy stage
// ============================================

import { PrismaClient } from '@prisma/client';

export type PTPState = 'active' | 'kept' | 'broken' | 'cancelled';

export interface PTPInput {
  recoveryCaseId: string;
  customerId: string;
  amountPaise: number;
  promisedDate: Date;
  source: 'voice' | 'chat' | 'manual' | 'browser_demo';
  transcript?: string;
}

export interface PTPResult {
  success: boolean;
  ptpId: string;
  state: PTPState;
  message: string;
  auditEventId?: string;
}

/**
 * Capture a new Promise-to-Pay
 * - Sets case state to 'promise_to_pay'
 * - Creates PTP record
 * - Creates audit event
 * - Pauses standard dunning
 */
export async function capturePTP(
  prisma: PrismaClient,
  input: PTPInput
): Promise<PTPResult> {
  // Validate the recovery case exists and is recoverable
  const recoveryCase = await prisma.recoveryCase.findUnique({
    where: { id: input.recoveryCaseId },
    include: { promiseToPays: { where: { state: 'active' } } },
  });

  if (!recoveryCase) {
    return { success: false, ptpId: '', state: 'active', message: 'Recovery case not found.' };
  }

  if (recoveryCase.cashState !== 'recoverable' && recoveryCase.cashState !== 'promise_to_pay') {
    return {
      success: false,
      ptpId: '',
      state: 'active',
      message: `Cannot create PTP for case in state "${recoveryCase.cashState}". Only "recoverable" cases accept PTPs.`,
    };
  }

  // Check for existing active PTP
  if (recoveryCase.promiseToPays.length > 0) {
    return {
      success: false,
      ptpId: recoveryCase.promiseToPays[0].id,
      state: 'active',
      message: 'An active Promise-to-Pay already exists for this case. Cancel or resolve it first.',
    };
  }

  // Validate promise date is in the future
  if (input.promisedDate <= new Date()) {
    return { success: false, ptpId: '', state: 'active', message: 'Promised date must be in the future.' };
  }

  // Validate amount matches case outstanding (or is reasonable)
  if (input.amountPaise <= 0) {
    return { success: false, ptpId: '', state: 'active', message: 'Promised amount must be positive.' };
  }

  // Create PTP record
  const ptp = await prisma.promiseToPay.create({
    data: {
      recoveryCaseId: input.recoveryCaseId,
      customerId: input.customerId,
      amountPaise: input.amountPaise,
      promisedDate: input.promisedDate,
      source: input.source,
      transcript: input.transcript || null,
      state: 'active',
    },
  });

  // Update case state to promise_to_pay
  await prisma.recoveryCase.update({
    where: { id: input.recoveryCaseId },
    data: {
      cashState: 'promise_to_pay',
      // Update allowed/blocked actions
      allowedActions: JSON.stringify([]),
      blockedActions: JSON.stringify([
        { action: 'retry_payment', reasons: ['Active Promise-to-Pay — standard dunning paused'] },
        { action: 'reminder_sms', reasons: ['Active Promise-to-Pay — standard dunning paused'] },
        { action: 'reminder_email', reasons: ['Active Promise-to-Pay — standard dunning paused'] },
        { action: 'voice_call', reasons: ['Active Promise-to-Pay — standard dunning paused'] },
        { action: 'payment_link', reasons: ['Active Promise-to-Pay — dunning paused until ' + input.promisedDate.toLocaleDateString()] },
      ]),
    },
  });

  // Create audit event
  const audit = await prisma.auditEvent.create({
    data: {
      caseId: input.recoveryCaseId,
      actor: 'ptp-state-machine',
      actorVersion: '1.0-demo',
      eventType: 'PTP_CREATED',
      inputRecordRefs: JSON.stringify([ptp.id, input.recoveryCaseId]),
      ruleOrPromptVersion: 'ptp_v1',
      decision: JSON.stringify({
        action: 'capture_ptp',
        amountPaise: input.amountPaise,
        promisedDate: input.promisedDate.toISOString(),
        source: input.source,
      }),
      reasons: JSON.stringify([
        `Promise to pay ₹${(input.amountPaise / 100).toFixed(2)} by ${input.promisedDate.toLocaleDateString()}`,
        `Source: ${input.source}`,
        'Standard dunning paused',
      ]),
      policySnapshot: '1.0-demo',
    },
  });

  return {
    success: true,
    ptpId: ptp.id,
    state: 'active',
    message: `Promise-to-Pay captured: ₹${(input.amountPaise / 100).toFixed(2)} by ${input.promisedDate.toLocaleDateString()}. Dunning paused.`,
    auditEventId: audit.id,
  };
}

/**
 * Mark PTP as kept (payment received)
 */
export async function markPTPKept(
  prisma: PrismaClient,
  ptpId: string
): Promise<PTPResult> {
  const ptp = await prisma.promiseToPay.findUnique({
    where: { id: ptpId },
    include: { recoveryCase: true },
  });

  if (!ptp) {
    return { success: false, ptpId, state: 'active', message: 'PTP record not found.' };
  }

  if (ptp.state !== 'active') {
    return { success: false, ptpId, state: ptp.state as PTPState, message: `PTP is already "${ptp.state}".` };
  }

  // Update PTP state
  await prisma.promiseToPay.update({
    where: { id: ptpId },
    data: { state: 'kept', resolvedAt: new Date() },
  });

  // Close the recovery case
  await prisma.recoveryCase.update({
    where: { id: ptp.recoveryCaseId },
    data: {
      cashState: 'closed',
      outstandingAmountPaise: 0,
      allowedActions: JSON.stringify([]),
      blockedActions: JSON.stringify([]),
    },
  });

  // Audit event
  await prisma.auditEvent.create({
    data: {
      caseId: ptp.recoveryCaseId,
      actor: 'ptp-state-machine',
      actorVersion: '1.0-demo',
      eventType: 'PTP_KEPT',
      inputRecordRefs: JSON.stringify([ptpId]),
      ruleOrPromptVersion: 'ptp_v1',
      decision: JSON.stringify({ action: 'mark_kept', resolvedAt: new Date().toISOString() }),
      reasons: JSON.stringify([
        `Payment received. PTP of ₹${(ptp.amountPaise / 100).toFixed(2)} kept.`,
        'Recovery case closed.',
      ]),
      policySnapshot: '1.0-demo',
    },
  });

  return { success: true, ptpId, state: 'kept', message: 'Promise-to-Pay marked as kept. Case closed.' };
}

/**
 * Mark PTP as broken (payment not received by promised date + grace)
 * Resumes recovery at NEXT policy stage — never resets to aggressive stage one
 */
export async function markPTPBroken(
  prisma: PrismaClient,
  ptpId: string,
  graceDays: number = 1
): Promise<PTPResult> {
  const ptp = await prisma.promiseToPay.findUnique({
    where: { id: ptpId },
    include: { recoveryCase: true },
  });

  if (!ptp) {
    return { success: false, ptpId, state: 'active', message: 'PTP record not found.' };
  }

  if (ptp.state !== 'active') {
    return { success: false, ptpId, state: ptp.state as PTPState, message: `PTP is already "${ptp.state}".` };
  }

  // Check if grace period has elapsed
  const graceEnd = new Date(ptp.promisedDate);
  graceEnd.setDate(graceEnd.getDate() + graceDays);

  if (new Date() < graceEnd) {
    return {
      success: false,
      ptpId,
      state: 'active',
      message: `Grace period has not elapsed. PTP due ${ptp.promisedDate.toLocaleDateString()} + ${graceDays} day(s) grace = ${graceEnd.toLocaleDateString()}.`,
    };
  }

  // Update PTP state
  await prisma.promiseToPay.update({
    where: { id: ptpId },
    data: { state: 'broken', resolvedAt: new Date() },
  });

  // Resume recovery — but at NEXT stage, never back to stage one
  // Allowed actions are limited after a broken PTP
  await prisma.recoveryCase.update({
    where: { id: ptp.recoveryCaseId },
    data: {
      cashState: 'recoverable',
      diagnosisCode: 'promise_to_pay_broken',
      diagnosisText: `Promise-to-Pay broken: ₹${(ptp.amountPaise / 100).toFixed(2)} was due by ${ptp.promisedDate.toLocaleDateString()}. Resuming at next policy stage.`,
      // After broken PTP, only allow escalation-level actions, not initial stages
      allowedActions: JSON.stringify(['payment_link', 'voice_call', 'escalation']),
      blockedActions: JSON.stringify([
        { action: 'retry_payment', reasons: ['Post-PTP-broken: retry not appropriate at this recovery stage'] },
        { action: 'reminder_sms', reasons: ['Post-PTP-broken: SMS already sent in previous stage'] },
        { action: 'reminder_email', reasons: ['Post-PTP-broken: email already sent. Next stage is escalation.'] },
      ]),
    },
  });

  // Audit event
  await prisma.auditEvent.create({
    data: {
      caseId: ptp.recoveryCaseId,
      actor: 'ptp-state-machine',
      actorVersion: '1.0-demo',
      eventType: 'PTP_BROKEN',
      inputRecordRefs: JSON.stringify([ptpId]),
      ruleOrPromptVersion: 'ptp_v1',
      decision: JSON.stringify({
        action: 'mark_broken',
        promisedDate: ptp.promisedDate.toISOString(),
        graceElapsed: true,
        nextStage: 'escalation_level',
      }),
      reasons: JSON.stringify([
        `PTP broken: ₹${(ptp.amountPaise / 100).toFixed(2)} not received by ${ptp.promisedDate.toLocaleDateString()} + ${graceDays} day(s).`,
        'Resuming at escalation-level recovery. NOT resetting to aggressive stage one.',
      ]),
      policySnapshot: '1.0-demo',
    },
  });

  return {
    success: true,
    ptpId,
    state: 'broken',
    message: `Promise-to-Pay broken. Resuming at next recovery stage (escalation-level). Never resetting to stage one.`,
  };
}

/**
 * Cancel a PTP (manual action)
 */
export async function cancelPTP(
  prisma: PrismaClient,
  ptpId: string
): Promise<PTPResult> {
  const ptp = await prisma.promiseToPay.findUnique({
    where: { id: ptpId },
    include: { recoveryCase: true },
  });

  if (!ptp) {
    return { success: false, ptpId, state: 'active', message: 'PTP record not found.' };
  }

  if (ptp.state !== 'active') {
    return { success: false, ptpId, state: ptp.state as PTPState, message: `PTP is already "${ptp.state}".` };
  }

  await prisma.promiseToPay.update({
    where: { id: ptpId },
    data: { state: 'cancelled', resolvedAt: new Date() },
  });

  // Restore case to recoverable
  await prisma.recoveryCase.update({
    where: { id: ptp.recoveryCaseId },
    data: { cashState: 'recoverable' },
  });

  await prisma.auditEvent.create({
    data: {
      caseId: ptp.recoveryCaseId,
      actor: 'ptp-state-machine',
      actorVersion: '1.0-demo',
      eventType: 'PTP_CANCELLED',
      inputRecordRefs: JSON.stringify([ptpId]),
      ruleOrPromptVersion: 'ptp_v1',
      decision: JSON.stringify({ action: 'cancel' }),
      reasons: JSON.stringify(['PTP cancelled by operator. Case returned to recoverable.']),
      policySnapshot: '1.0-demo',
    },
  });

  return { success: true, ptpId, state: 'cancelled', message: 'PTP cancelled. Case returned to recoverable.' };
}

/**
 * Check all active PTPs and mark broken ones
 */
export async function checkExpiredPTPs(
  prisma: PrismaClient,
  graceDays: number = 1
): Promise<{ checked: number; broken: number }> {
  const activePTPs = await prisma.promiseToPay.findMany({
    where: { state: 'active' },
  });

  let broken = 0;
  for (const ptp of activePTPs) {
    const graceEnd = new Date(ptp.promisedDate);
    graceEnd.setDate(graceEnd.getDate() + graceDays);

    if (new Date() > graceEnd) {
      await markPTPBroken(prisma, ptp.id, graceDays);
      broken++;
    }
  }

  return { checked: activePTPs.length, broken };
}
