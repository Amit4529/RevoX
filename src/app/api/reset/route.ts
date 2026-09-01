// ============================================
// Reset API — Clear all data safely
// ============================================

import { NextResponse } from 'next/server';
import prisma from '@/lib/db';

export async function POST() {
  try {
    // Delete in dependency order
    await prisma.$transaction([
      prisma.auditEvent.deleteMany(),
      prisma.experimentAssignment.deleteMany(),
      prisma.riskSignal.deleteMany(),
      prisma.promiseToPay.deleteMany(),
      prisma.communication.deleteMany(),
      prisma.recoveryAction.deleteMany(),
      prisma.policyDecision.deleteMany(),
      prisma.reconciliationMatch.deleteMany(),
      prisma.evidenceEdge.deleteMany(),
      prisma.recoveryCase.deleteMany(),
      prisma.ingestionRecord.deleteMany(),
      prisma.ingestionBatch.deleteMany(),
      prisma.forecastRun.deleteMany(),
      prisma.tdsEvidence.deleteMany(),
      prisma.settlementLine.deleteMany(),
      prisma.settlement.deleteMany(),
      prisma.bankTransaction.deleteMany(),
      prisma.invoice.deleteMany(),
      prisma.checkoutSession.deleteMany(),
      prisma.paymentAttempt.deleteMany(),
      prisma.order.deleteMany(),
      prisma.tdsRule.deleteMany(),
      prisma.customer.deleteMany(),
      prisma.policy.deleteMany(),
    ]);

    return NextResponse.json({
      success: true,
      message: 'All data has been cleared. Run seed to reload demo data.',
    });
  } catch (error) {
    console.error('Reset error:', error);
    return NextResponse.json(
      { error: 'Failed to reset data', details: String(error) },
      { status: 500 }
    );
  }
}
