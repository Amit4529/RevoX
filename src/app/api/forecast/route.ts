// ============================================
// Forecast API — Forward Cash Projections
// Formula: projectedCash(t) = settledBank + PTP×P(kept) + recovery×P(success) + pendingSettlement
// Low / Base / High scenarios with documented probability bands
// ============================================

import { NextResponse } from 'next/server';
import prisma from '@/lib/db';

const P_KEPT_BASE = 0.72;   // 72% of PTPs are kept historically
const P_KEPT_LOW  = 0.50;
const P_KEPT_HIGH = 0.90;

const P_RECOVERY_BASE = 0.55; // 55% average recovery success across all action types
const P_RECOVERY_LOW  = 0.30;
const P_RECOVERY_HIGH = 0.78;

const P_SETTLEMENT_BASE = 0.95; // 95% of pending settlements resolve
const P_SETTLEMENT_LOW  = 0.85;
const P_SETTLEMENT_HIGH = 1.00;

function projectForHorizon(
  settledBankPaise: number,
  ptpPaise: number,
  recoverablePaise: number,
  pendingSettlementPaise: number,
  daysHorizon: number,
  pKept: number,
  pRecovery: number,
  pSettlement: number,
): number {
  // Time decay: recovery probability decreases with longer horizon (cases age)
  const decayFactor = Math.max(0.6, 1 - (daysHorizon - 7) * 0.01);
  return Math.round(
    settledBankPaise +
    ptpPaise * pKept +
    recoverablePaise * pRecovery * decayFactor +
    pendingSettlementPaise * pSettlement
  );
}

export async function GET() {
  try {
    // Gather current state from DB
    const [bankCredits, ptpCases, recoverableCases, waitingCases, recoveredActions] = await Promise.all([
      prisma.bankTransaction.aggregate({
        where: { type: 'credit' },
        _sum: { creditPaise: true },
      }),
      prisma.recoveryCase.aggregate({
        where: { cashState: 'promise_to_pay' },
        _sum: { outstandingAmountPaise: true },
      }),
      prisma.recoveryCase.aggregate({
        where: { cashState: 'recoverable' },
        _sum: { outstandingAmountPaise: true },
      }),
      prisma.recoveryCase.aggregate({
        where: { cashState: 'waiting_for_settlement' },
        _sum: { outstandingAmountPaise: true },
      }),
      prisma.recoveryAction.count({
        where: { status: 'completed' },
      }),
    ]);

    const settledBankPaise = bankCredits._sum.creditPaise || 0;
    const ptpPaise = ptpCases._sum.outstandingAmountPaise || 0;
    const recoverablePaise = recoverableCases._sum.outstandingAmountPaise || 0;
    const pendingPaise = waitingCases._sum.outstandingAmountPaise || 0;

    const horizons = [7, 14, 30];
    const forecasts = horizons.map(days => ({
      days,
      low:  projectForHorizon(settledBankPaise, ptpPaise, recoverablePaise, pendingPaise, days, P_KEPT_LOW, P_RECOVERY_LOW, P_SETTLEMENT_LOW),
      base: projectForHorizon(settledBankPaise, ptpPaise, recoverablePaise, pendingPaise, days, P_KEPT_BASE, P_RECOVERY_BASE, P_SETTLEMENT_BASE),
      high: projectForHorizon(settledBankPaise, ptpPaise, recoverablePaise, pendingPaise, days, P_KEPT_HIGH, P_RECOVERY_HIGH, P_SETTLEMENT_HIGH),
    }));

    // Component breakdown for the base scenario
    const components = {
      settledBankPaise,
      ptpExpectedPaise: Math.round(ptpPaise * P_KEPT_BASE),
      recoveryExpectedPaise: Math.round(recoverablePaise * P_RECOVERY_BASE),
      pendingSettlementExpectedPaise: Math.round(pendingPaise * P_SETTLEMENT_BASE),
    };

    return NextResponse.json({
      forecasts,
      components,
      inputs: {
        settledBankPaise,
        ptpTotalPaise: ptpPaise,
        recoverableTotalPaise: recoverablePaise,
        pendingSettlementPaise: pendingPaise,
        completedRecoveryActions: recoveredActions,
      },
      probabilities: {
        base: { pKept: P_KEPT_BASE, pRecovery: P_RECOVERY_BASE, pSettlement: P_SETTLEMENT_BASE },
        low:  { pKept: P_KEPT_LOW,  pRecovery: P_RECOVERY_LOW,  pSettlement: P_SETTLEMENT_LOW  },
        high: { pKept: P_KEPT_HIGH, pRecovery: P_RECOVERY_HIGH, pSettlement: P_SETTLEMENT_HIGH },
      },
      label: 'Forecast — not settled cash',
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Forecast error:', error);
    return NextResponse.json(
      { error: 'Failed to compute forecast', details: String(error) },
      { status: 500 }
    );
  }
}
