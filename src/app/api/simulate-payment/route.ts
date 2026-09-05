// ============================================
// Payment Status & Simulation API
// POST & GET /api/simulate-payment
//
// Checks live Razorpay payment status or simulates
// successful payment completion for demo/pitch.
// Updates case to "closed", resets outstanding to 0,
// and logs a RECOVERY_COMPLETED audit event.
// ============================================

import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { fetchPaymentLinkStatus } from '@/lib/integrations/razorpay';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const caseId = searchParams.get('caseId');

    if (!caseId) {
      return NextResponse.json({ error: 'Missing caseId' }, { status: 400 });
    }

    let recoveryCase = await prisma.recoveryCase.findUnique({ where: { id: caseId } });
    if (!recoveryCase) {
      recoveryCase = await prisma.recoveryCase.findFirst({ where: { caseNumber: caseId } });
    }
    if (!recoveryCase) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    }

    const resolvedId = recoveryCase.id;

    // Find the latest payment_link action
    const paymentAction = await prisma.recoveryAction.findFirst({
      where: { recoveryCaseId: resolvedId, actionType: 'payment_link' },
      orderBy: { createdAt: 'desc' },
    });

    let linkUrl = '';
    let linkId = paymentAction?.outcomeReference || '';
    if (paymentAction?.executionReceipt) {
      try {
        const rc = JSON.parse(paymentAction.executionReceipt);
        linkUrl = rc.linkUrl || rc.url || '';
        if (!linkId) linkId = rc.linkId || '';
      } catch {
        // if not json, might be string
      }
    }

    if (!linkUrl && paymentAction?.outcomeReference?.startsWith('plink_')) {
      linkUrl = `https://rzp.io/i/${paymentAction.outcomeReference}`;
    }

    // Also check audit events for payment link url
    if (!linkUrl) {
      const linkAudit = await prisma.auditEvent.findFirst({
        where: { caseId: resolvedId, eventType: 'PAYMENT_LINK_CREATED' },
        orderBy: { createdAt: 'desc' },
      });
      if (linkAudit?.decision) {
        try {
          const dec = JSON.parse(linkAudit.decision);
          if (dec.linkUrl) linkUrl = dec.linkUrl;
          if (dec.linkId && !linkId) linkId = dec.linkId;
        } catch {}
      }
    }

    // If case is already closed
    if (recoveryCase.cashState === 'closed') {
      return NextResponse.json({
        paid: true,
        status: 'closed',
        caseNumber: recoveryCase.caseNumber,
        linkUrl,
        linkId,
        message: 'Case is fully recovered and closed.',
      });
    }

    // Check live Razorpay status if linkId exists
    let liveStatus = 'created';
    if (linkId && linkId.startsWith('plink_')) {
      try {
        const statusRes = await fetchPaymentLinkStatus(linkId);
        liveStatus = statusRes.status;
        if (statusRes.status === 'paid') {
          // Complete recovery in DB!
          await completeCaseRecovery(prisma, resolvedId, recoveryCase, paymentAction?.id, linkId);
          return NextResponse.json({
            paid: true,
            status: 'closed',
            caseNumber: recoveryCase.caseNumber,
            linkUrl,
            linkId,
            message: `Razorpay payment verified! Case ${recoveryCase.caseNumber} recovered and closed.`,
          });
        }
      } catch (err) {
        console.error('Error fetching Razorpay payment status:', err);
      }
    }

    return NextResponse.json({
      paid: false,
      status: liveStatus,
      caseNumber: recoveryCase.caseNumber,
      cashState: recoveryCase.cashState,
      linkUrl,
      linkId,
    });
  } catch (error) {
    console.error('Payment status GET error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { caseId, mode } = await request.json();

    if (!caseId) {
      return NextResponse.json({ error: 'Missing caseId' }, { status: 400 });
    }

    let recoveryCase = await prisma.recoveryCase.findUnique({ where: { id: caseId } });
    if (!recoveryCase) {
      recoveryCase = await prisma.recoveryCase.findFirst({ where: { caseNumber: caseId } });
    }
    if (!recoveryCase) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    }

    const resolvedId = recoveryCase.id;

    // Find the latest payment_link action
    const paymentAction = await prisma.recoveryAction.findFirst({
      where: { recoveryCaseId: resolvedId, actionType: 'payment_link' },
      orderBy: { createdAt: 'desc' },
    });

    const linkId = paymentAction?.outcomeReference || 'plink_test';

    // If mode is 'verify', check live Razorpay first
    if (mode === 'verify' && linkId.startsWith('plink_')) {
      try {
        const statusRes = await fetchPaymentLinkStatus(linkId);
        if (statusRes.status !== 'paid') {
          return NextResponse.json({
            success: false,
            status: statusRes.status,
            message: `Payment status is "${statusRes.status}". Complete payment on Razorpay or use instant demo button.`,
          });
        }
      } catch (err) {
        console.error('Verify error:', err);
      }
    }

    // Mark case as recovered and closed
    const result = await completeCaseRecovery(prisma, resolvedId, recoveryCase, paymentAction?.id, linkId);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Simulate payment error:', error);
    return NextResponse.json(
      { error: 'Failed to complete payment', details: String(error) },
      { status: 500 }
    );
  }
}

async function completeCaseRecovery(
  prisma: any,
  resolvedId: string,
  recoveryCase: any,
  paymentActionId?: string,
  linkId?: string,
) {
  if (paymentActionId) {
    await prisma.recoveryAction.update({
      where: { id: paymentActionId },
      data: { status: 'completed' },
    });
  }

  // Update case state to closed (recovered)
  await prisma.recoveryCase.update({
    where: { id: resolvedId },
    data: {
      cashState: 'closed',
      outstandingAmountPaise: 0,
      closedReason: 'Recovered via Razorpay payment link',
    },
  });

  // Log the recovery audit event
  await prisma.auditEvent.create({
    data: {
      caseId: resolvedId,
      actor: 'razorpay-test',
      actorVersion: '1.0-demo',
      eventType: 'RECOVERY_COMPLETED',
      inputRecordRefs: JSON.stringify([resolvedId]),
      ruleOrPromptVersion: 'payment_link.paid',
      decision: JSON.stringify({
        action: 'payment_received',
        amountPaise: recoveryCase.outstandingAmountPaise,
        paymentId: `pay_test_${Date.now()}`,
        linkId: linkId || 'manual',
      }),
      reasons: JSON.stringify([
        `Payment received for ${recoveryCase.caseNumber}. Amount: ₹${(recoveryCase.outstandingAmountPaise / 100).toFixed(2)}. Revenue leakage recovered, case closed.`,
      ]),
      policySnapshot: 'razorpay-test',
    },
  });

  return {
    success: true,
    caseNumber: recoveryCase.caseNumber,
    amountRecovered: recoveryCase.outstandingAmountPaise,
    newState: 'closed',
    message: `Payment of ₹${(recoveryCase.outstandingAmountPaise / 100).toFixed(2)} received. Case ${recoveryCase.caseNumber} marked as recovered!`,
  };
}
