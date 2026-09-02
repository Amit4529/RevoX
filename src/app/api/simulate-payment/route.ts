// ============================================
// Simulate Payment API
// POST /api/simulate-payment
//
// For demo: simulates a successful Razorpay payment
// without needing to actually pay. Updates case to "closed"
// and logs a RECOVERY_COMPLETED audit event.
// ============================================

import { NextResponse } from 'next/server';
import prisma from '@/lib/db';

export async function POST(request: Request) {
  try {
    const { caseId } = await request.json();

    if (!caseId) {
      return NextResponse.json({ error: 'Missing caseId' }, { status: 400 });
    }

    const recoveryCase = await prisma.recoveryCase.findUnique({ where: { id: caseId } });
    if (!recoveryCase) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    }

    // Find the latest payment_link action for this case
    const paymentAction = await prisma.recoveryAction.findFirst({
      where: { recoveryCaseId: caseId, actionType: 'payment_link' },
      orderBy: { createdAt: 'desc' },
    });

    if (paymentAction) {
      // Update action status to completed
      await prisma.recoveryAction.update({
        where: { id: paymentAction.id },
        data: { status: 'completed' },
      });
    }

    // Update case state to closed (recovered)
    await prisma.recoveryCase.update({
      where: { id: caseId },
      data: {
        cashState: 'closed',
        outstandingAmountPaise: 0,
      },
    });

    // Log the recovery audit event
    await prisma.auditEvent.create({
      data: {
        caseId,
        actor: 'razorpay-webhook',
        actorVersion: '1.0-demo',
        eventType: 'RECOVERY_COMPLETED',
        inputRecordRefs: JSON.stringify([caseId]),
        ruleOrPromptVersion: 'payment_link.paid',
        decision: JSON.stringify({
          action: 'payment_received',
          amountPaise: recoveryCase.outstandingAmountPaise,
          paymentId: `pay_sim_${Date.now()}`,
          linkId: paymentAction?.outcomeReference || 'manual',
        }),
        reasons: JSON.stringify([
          `Payment received for ${recoveryCase.caseNumber}. Amount: ₹${(recoveryCase.outstandingAmountPaise / 100).toFixed(2)}. Case recovered and closed.`,
        ]),
        policySnapshot: 'razorpay-test',
      },
    });

    return NextResponse.json({
      success: true,
      caseNumber: recoveryCase.caseNumber,
      amountRecovered: recoveryCase.outstandingAmountPaise,
      newState: 'closed',
      message: `Payment of ₹${(recoveryCase.outstandingAmountPaise / 100).toFixed(2)} received. Case ${recoveryCase.caseNumber} marked as recovered.`,
    });
  } catch (error) {
    console.error('Simulate payment error:', error);
    return NextResponse.json(
      { error: 'Failed to simulate payment', details: String(error) },
      { status: 500 }
    );
  }
}
