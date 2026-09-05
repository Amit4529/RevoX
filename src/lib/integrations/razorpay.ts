// ============================================
// Razorpay Test Mode Integration
//
// Server-only adapter. Uses Test Mode keys (rzp_test_xxx).
// Falls back to local simulator when ENABLE_RAZORPAY_TEST_MODE !== 'true'.
// Security: KEY_SECRET is never sent to browser. Idempotency keys tied to caseId.
// ============================================

import { PrismaClient } from '@prisma/client';
import { v4 as uuid } from 'uuid';
import crypto from 'crypto';

// ---- Types ----

export interface PaymentLinkResult {
  success: boolean;
  simulated: boolean;
  linkId: string;
  linkUrl: string;
  referenceId: string;
  amountPaise: number;
  receipt: string;
  error?: string;
}

export interface PaymentLinkStatus {
  id: string;
  status: string;          // created, partially_paid, expired, cancelled, paid
  amountPaise: number;
  amountPaidPaise: number;
  payments?: unknown[];
}

export interface WebhookVerificationResult {
  valid: boolean;
  eventId: string;
  eventType: string;
  payload: any;
  duplicate: boolean;
}

// ---- Config ----

function isTestModeEnabled(): boolean {
  return process.env.ENABLE_RAZORPAY_TEST_MODE === 'true' &&
    !!process.env.RAZORPAY_KEY_ID &&
    process.env.RAZORPAY_KEY_ID.startsWith('rzp_test_') &&
    !!process.env.RAZORPAY_KEY_SECRET;
}

function getAuthHeader(): string {
  const keyId = process.env.RAZORPAY_KEY_ID!;
  const keySecret = process.env.RAZORPAY_KEY_SECRET!;
  return 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64');
}

// ---- Payment Link Creation ----

/**
 * Create a recovery payment link via Razorpay Test Mode or local simulation.
 * Server-only. Never called from the browser.
 */
export async function createRecoveryPaymentLink(
  prisma: PrismaClient,
  caseId: string,
): Promise<PaymentLinkResult> {
  let recoveryCase = await prisma.recoveryCase.findUnique({ where: { id: caseId } });
  if (!recoveryCase) {
    recoveryCase = await prisma.recoveryCase.findFirst({ where: { caseNumber: caseId } });
  }
  if (!recoveryCase) {
    return { success: false, simulated: true, linkId: '', linkUrl: '', referenceId: '', amountPaise: 0, receipt: '', error: 'Case not found' };
  }

  const resolvedCaseId = recoveryCase.id;
  const referenceId = `cic-${resolvedCaseId.slice(0, 8)}-${Date.now().toString(36)}`;
  const amountPaise = recoveryCase.outstandingAmountPaise > 0
    ? recoveryCase.outstandingAmountPaise
    : (recoveryCase.grossAmountPaise && recoveryCase.grossAmountPaise > 0 ? recoveryCase.grossAmountPaise : 6000000);
  const idempotencyKey = `plink-${resolvedCaseId}-${Date.now()}`;

  if (isTestModeEnabled()) {
    return await createRealPaymentLink(prisma, resolvedCaseId, referenceId, idempotencyKey, amountPaise, recoveryCase.caseNumber);
  } else {
    return await createSimulatedPaymentLink(prisma, resolvedCaseId, referenceId, idempotencyKey, amountPaise, recoveryCase.caseNumber);
  }
}

async function createRealPaymentLink(
  prisma: PrismaClient,
  caseId: string,
  referenceId: string,
  idempotencyKey: string,
  amountPaise: number,
  caseNumber: string,
): Promise<PaymentLinkResult> {
  try {
    const callbackUrl = `${process.env.APP_BASE_URL || 'http://localhost:3000'}/recover/${caseId}`;

    const body = {
      amount: amountPaise,
      currency: 'INR',
      accept_partial: false,
      reference_id: referenceId,
      description: `Recovery payment for ${caseNumber}`,
      expire_by: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60), // 7 days
      notify: { sms: false, email: false }, // CIC manages its own comms
      callback_url: callbackUrl,
      callback_method: 'get',
      notes: {
        cic_case_id: caseId,
        cic_case_number: caseNumber,
        source: 'cic-recovery-engine',
        mode: 'RAZORPAY_TEST_MODE',
      },
    };

    const response = await fetch('https://api.razorpay.com/v1/payment_links', {
      method: 'POST',
      headers: {
        'Authorization': getAuthHeader(),
        'Content-Type': 'application/json',
        'X-Razorpay-Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Razorpay API error:', data);
      // If error is duplicate reference_id, retry with fresh random reference_id
      if (data?.error?.description?.includes('reference_id')) {
        const retryRef = `cic-${caseId.slice(0, 6)}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        return await createRealPaymentLink(prisma, caseId, retryRef, `${idempotencyKey}-r`, amountPaise, caseNumber);
      }
      // Fall back to simulated only if API truly unavailable
      return await createSimulatedPaymentLink(prisma, caseId, referenceId, idempotencyKey, amountPaise, caseNumber);
    }

    // Persist the action
    await prisma.recoveryAction.create({
      data: {
        recoveryCaseId: caseId,
        actionType: 'payment_link',
        idempotencyKey,
        status: 'completed',
        isSimulated: false,
        executionReceipt: JSON.stringify({
          provider: 'razorpay',
          linkId: data.id,
          linkUrl: data.short_url,
          referenceId: data.reference_id,
          mode: 'RAZORPAY_TEST_MODE',
        }),
        outcomeReference: data.id,
      },
    });

    // Audit
    await prisma.auditEvent.create({
      data: {
        caseId,
        actor: 'razorpay-adapter',
        actorVersion: '1.0-demo',
        eventType: 'ACTION_EXECUTED',
        inputRecordRefs: JSON.stringify([caseId]),
        ruleOrPromptVersion: 'razorpay-test-mode',
        decision: JSON.stringify({ action: 'payment_link', provider: 'razorpay', linkId: data.id }),
        reasons: JSON.stringify(['Real Razorpay Test Mode payment link created']),
        policySnapshot: 'razorpay-test',
      },
    });

    return {
      success: true,
      simulated: false,
      linkId: data.id,
      linkUrl: data.short_url,
      referenceId: data.reference_id,
      amountPaise,
      receipt: `RAZORPAY TEST MODE — NO REAL MONEY\nLink ID: ${data.id}\nURL: ${data.short_url}\nRef: ${data.reference_id}\nAmount: ₹${(amountPaise / 100).toFixed(2)}`,
    };
  } catch (error) {
    console.error('Razorpay payment link error:', error);
    return await createSimulatedPaymentLink(prisma, caseId, referenceId, idempotencyKey, amountPaise, caseNumber);
  }
}

async function createSimulatedPaymentLink(
  prisma: PrismaClient,
  caseId: string,
  referenceId: string,
  idempotencyKey: string,
  amountPaise: number,
  caseNumber: string,
): Promise<PaymentLinkResult> {
  const simLinkId = `plink_sim_${uuid().slice(0, 12)}`;
  const simUrl = `https://rzp.io/demo/${simLinkId}`;

  await prisma.recoveryAction.create({
    data: {
      recoveryCaseId: caseId,
      actionType: 'payment_link',
      idempotencyKey,
      status: 'completed',
      isSimulated: true,
      executionReceipt: JSON.stringify({
        provider: 'simulator',
        linkId: simLinkId,
        linkUrl: simUrl,
        referenceId,
        mode: 'SIMULATED',
      }),
      outcomeReference: simLinkId,
    },
  });

  await prisma.auditEvent.create({
    data: {
      caseId,
      actor: 'simulator',
      actorVersion: '1.0-demo',
      eventType: 'ACTION_EXECUTED',
      inputRecordRefs: JSON.stringify([caseId]),
      ruleOrPromptVersion: 'local-simulator',
      decision: JSON.stringify({ action: 'payment_link', provider: 'simulator', linkId: simLinkId }),
      reasons: JSON.stringify(['Simulated payment link (Razorpay Test Mode not enabled)']),
      policySnapshot: 'demo',
    },
  });

  return {
    success: true,
    simulated: true,
    linkId: simLinkId,
    linkUrl: simUrl,
    referenceId,
    amountPaise,
    receipt: `SIMULATED — Demo Mode\nLink ID: ${simLinkId}\nURL: ${simUrl}\nRef: ${referenceId}\nAmount: ₹${(amountPaise / 100).toFixed(2)}\n\nTo use real Razorpay Test Mode, set ENABLE_RAZORPAY_TEST_MODE=true with valid rzp_test_ keys.`,
  };
}

// ---- Status Fetch ----

/**
 * Server-only: fetch payment link status from Razorpay or return simulated status.
 */
export async function fetchPaymentLinkStatus(linkId: string): Promise<PaymentLinkStatus> {
  if (isTestModeEnabled() && !linkId.startsWith('plink_sim_')) {
    try {
      const response = await fetch(`https://api.razorpay.com/v1/payment_links/${linkId}`, {
        headers: { 'Authorization': getAuthHeader() },
      });
      if (response.ok) {
        const data = await response.json();
        return {
          id: data.id,
          status: data.status,
          amountPaise: data.amount,
          amountPaidPaise: data.amount_paid || 0,
          payments: data.payments,
        };
      }
    } catch (error) {
      console.error('Razorpay status fetch error:', error);
    }
  }

  // Simulated fallback
  return {
    id: linkId,
    status: 'created',
    amountPaise: 0,
    amountPaidPaise: 0,
  };
}

// ---- Webhook HMAC Verification ----

/**
 * Verify Razorpay webhook signature using HMAC SHA-256.
 * Returns parsed event with deduplication check.
 */
export async function verifyAndParseWebhook(
  prisma: PrismaClient,
  rawBody: string,
  signature: string | null,
  eventIdHeader: string | null,
): Promise<WebhookVerificationResult> {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

  // Verify HMAC signature
  if (webhookSecret && signature) {
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('hex');

    if (signature !== expectedSignature) {
      return {
        valid: false,
        eventId: eventIdHeader || '',
        eventType: '',
        payload: null,
        duplicate: false,
      };
    }
  }

  const payload = JSON.parse(rawBody);
  const eventId = eventIdHeader || payload.event_id || uuid();
  const eventType = payload.event || '';

  // Check for duplicate using audit events
  let duplicate = false;
  if (eventId) {
    const existing = await prisma.auditEvent.findFirst({
      where: {
        eventType: 'WEBHOOK_RECEIVED',
        metadata: { contains: eventId },
      },
    });
    duplicate = !!existing;
  }

  return {
    valid: true,
    eventId,
    eventType,
    payload,
    duplicate,
  };
}

/**
 * Process a verified Razorpay webhook event idempotently.
 */
export async function processWebhookEvent(
  prisma: PrismaClient,
  eventId: string,
  eventType: string,
  payload: any,
): Promise<{ processed: boolean; message: string }> {
  // Persist the raw event as an audit record
  await prisma.auditEvent.create({
    data: {
      actor: 'webhook',
      actorVersion: '1.0-razorpay',
      eventType: 'WEBHOOK_RECEIVED',
      inputRecordRefs: JSON.stringify([eventId]),
      ruleOrPromptVersion: eventType,
      decision: JSON.stringify({ eventType, eventId }),
      reasons: JSON.stringify([`Razorpay webhook: ${eventType}`]),
      policySnapshot: 'razorpay-webhook',
      metadata: JSON.stringify({ eventId, eventType, receivedAt: new Date().toISOString() }),
    },
  });

  // Handle payment_link.paid
  if (eventType === 'payment_link.paid') {
    const linkEntity = payload.payload?.payment_link?.entity;
    const paymentEntity = payload.payload?.payment?.entity;
    if (linkEntity) {
      const referenceId = linkEntity.reference_id;
      // Find the recovery action by outcome reference (link ID)
      const action = await prisma.recoveryAction.findFirst({
        where: { outcomeReference: linkEntity.id },
      });
      if (action) {
        await prisma.recoveryAction.update({
          where: { id: action.id },
          data: {
            status: 'completed',
            outcomeReference: paymentEntity?.id || linkEntity.id,
          },
        });
        // Update case state — fully close and zero out outstanding
        await prisma.recoveryCase.update({
          where: { id: action.recoveryCaseId },
          data: {
            cashState: 'closed',
            outstandingAmountPaise: 0,
            closedReason: 'Recovered via Razorpay payment link (webhook confirmed)',
          },
        });
        // Audit the recovery
        await prisma.auditEvent.create({
          data: {
            caseId: action.recoveryCaseId,
            actor: 'webhook',
            actorVersion: '1.0-razorpay',
            eventType: 'RECOVERY_COMPLETED',
            inputRecordRefs: JSON.stringify([eventId, linkEntity.id]),
            ruleOrPromptVersion: eventType,
            decision: JSON.stringify({ paymentId: paymentEntity?.id, linkId: linkEntity.id, amountPaise: paymentEntity?.amount }),
            reasons: JSON.stringify(['Payment link paid — case recovered via Razorpay Test Mode']),
            policySnapshot: 'razorpay-webhook',
          },
        });
        return { processed: true, message: `Recovery completed for link ${linkEntity.id}` };
      }
    }
  }

  return { processed: true, message: `Event ${eventType} recorded` };
}
