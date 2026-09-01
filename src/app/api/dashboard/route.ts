// ============================================
// Dashboard API — Summary stats for command center
// ============================================

import { NextResponse } from 'next/server';
import prisma from '@/lib/db';

export async function GET() {
  try {
    // Get counts by cash state
    const cashStateCounts = await prisma.recoveryCase.groupBy({
      by: ['cashState'],
      _count: true,
      _sum: { outstandingAmountPaise: true },
    });

    // Build cash state summary
    const stateMap: Record<string, { count: number; totalPaise: number }> = {};
    for (const row of cashStateCounts) {
      stateMap[row.cashState] = {
        count: row._count,
        totalPaise: row._sum.outstandingAmountPaise || 0,
      };
    }

    // Get source counts
    const [payments, invoices, settlements, bankTxns, checkouts, comms] = await Promise.all([
      prisma.paymentAttempt.count(),
      prisma.invoice.count(),
      prisma.settlement.count(),
      prisma.bankTransaction.count(),
      prisma.checkoutSession.count(),
      prisma.communication.count(),
    ]);

    // Get latest batch info
    const latestBatch = await prisma.ingestionBatch.findFirst({
      orderBy: { startedAt: 'desc' },
    });

    // Total cases
    const totalCases = await prisma.recoveryCase.count();

    // Total matched value
    const matchedValue = await prisma.recoveryCase.aggregate({
      where: { cashState: { in: ['matched', 'matched_with_tds'] } },
      _sum: { grossAmountPaise: true },
    });

    // Total recovery eligible value
    const recoverableValue = await prisma.recoveryCase.aggregate({
      where: { cashState: 'recoverable' },
      _sum: { outstandingAmountPaise: true },
    });

    // Total recovered (closed cases that were previously recoverable)
    const recoveredActions = await prisma.recoveryAction.aggregate({
      where: { status: 'completed' },
      _count: true,
    });

    // Blocked actions count
    const blockedCount = await prisma.auditEvent.count({
      where: { eventType: 'ACTION_BLOCKED' },
    });

    // Integration status
    const integrationStatus = {
      demoMode: true,
      razorpayTestMode: process.env.ENABLE_RAZORPAY_TEST_MODE === 'true',
      voiceSimulator: true,
      twilioEnabled: process.env.ENABLE_OUTBOUND_CALLS === 'true',
    };

    // Cash bridge values
    const allSettlements = await prisma.settlement.findMany();
    const allBankCredits = await prisma.bankTransaction.aggregate({
      where: { type: 'credit' },
      _sum: { creditPaise: true },
    });
    const allPaymentsCapture = await prisma.paymentAttempt.aggregate({
      where: { status: 'captured' },
      _sum: { amountPaise: true },
    });

    const totalExpected = allPaymentsCapture._sum.amountPaise || 0;
    const totalSettledGross = allSettlements.reduce((sum, s) => sum + s.grossAmountPaise, 0);
    const totalFees = allSettlements.reduce((sum, s) => sum + s.feePaise + s.taxPaise, 0);
    const totalSettledNet = allSettlements.reduce((sum, s) => sum + s.netAmountPaise, 0);
    const totalBankCredit = allBankCredits._sum.creditPaise || 0;

    return NextResponse.json({
      sourceCounts: {
        gateway: payments,
        invoice: invoices,
        settlement: settlements,
        bank_statement: bankTxns,
        checkout: checkouts,
        communication: comms,
        total: payments + invoices + settlements + bankTxns + checkouts + comms,
      },
      casesByState: stateMap,
      totalCases,
      cashBridge: {
        expectedPaise: totalExpected,
        capturedPaise: totalExpected,
        settledGrossPaise: totalSettledGross,
        feesTaxPaise: totalFees,
        settledNetPaise: totalSettledNet,
        bankCreditedPaise: totalBankCredit,
        exceptionsPaise: (recoverableValue._sum.outstandingAmountPaise || 0),
        recoveredPaise: 0, // Will be calculated when recovery actions complete
      },
      metrics: {
        matchedValuePaise: matchedValue._sum.grossAmountPaise || 0,
        recoverableValuePaise: recoverableValue._sum.outstandingAmountPaise || 0,
        recoveredActions: recoveredActions._count,
        blockedUnsafeActions: blockedCount,
      },
      latestBatch: latestBatch ? {
        id: latestBatch.id,
        sourceLabel: latestBatch.sourceLabel,
        totalRecords: latestBatch.totalRecords,
        status: latestBatch.status,
        elapsedMs: latestBatch.elapsedMs,
        startedAt: latestBatch.startedAt,
      } : null,
      integrationStatus,
    });
  } catch (error) {
    console.error('Dashboard API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch dashboard data', details: String(error) },
      { status: 500 }
    );
  }
}
