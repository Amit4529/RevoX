// ============================================
// Reconcile API — Trigger reconciliation engine
// ============================================

import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { runReconciliation } from '@/lib/engine/reconciler';

export async function POST() {
  try {
    const result = await runReconciliation(prisma);

    return NextResponse.json({
      success: true,
      casesCreated: result.casesCreated,
      cashBridge: result.cashBridge,
      metrics: result.metrics,
    });
  } catch (error) {
    console.error('Reconciliation error:', error);
    return NextResponse.json(
      { error: 'Reconciliation failed', details: String(error) },
      { status: 500 }
    );
  }
}
