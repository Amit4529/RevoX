// ============================================
// Recovery Actions API
// Execute, score, and list recovery actions
// ============================================

import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { executeRecoveryAction } from '@/lib/engine/playbooks';
import { evaluateAllActions } from '@/lib/engine/firewall';
import { scoreAndRankActions, generateRecommendationExplanation } from '@/lib/engine/scorer';

// POST: Execute a recovery action
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { caseId, action, params } = body;

    if (!caseId || !action) {
      return NextResponse.json(
        { error: 'Missing required fields: caseId, action' },
        { status: 400 }
      );
    }

    const result = await executeRecoveryAction(prisma, caseId, action, params);

    return NextResponse.json(result, {
      status: result.success ? 200 : 403,
    });
  } catch (error) {
    console.error('Recovery action error:', error);
    return NextResponse.json(
      { error: 'Recovery action failed', details: String(error) },
      { status: 500 }
    );
  }
}

// GET: Get allowed/blocked actions and scores for a case
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const caseId = searchParams.get('caseId');

    if (!caseId) {
      return NextResponse.json({ error: 'Missing caseId parameter' }, { status: 400 });
    }

    const recoveryCase = await prisma.recoveryCase.findUnique({
      where: { id: caseId },
    });

    if (!recoveryCase) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    }

    // Evaluate all actions through firewall
    const { allowed, blocked } = await evaluateAllActions(prisma, caseId);

    // Score the allowed actions
    const allowedActionNames = allowed.map(a => a.action);
    const scores = scoreAndRankActions(
      allowedActionNames,
      recoveryCase.diagnosisCode,
      recoveryCase.outstandingAmountPaise
    );

    const recommendation = generateRecommendationExplanation(scores);

    // Get past actions for this case
    const pastActions = await prisma.recoveryAction.findMany({
      where: { recoveryCaseId: caseId },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      caseId,
      caseNumber: recoveryCase.caseNumber,
      cashState: recoveryCase.cashState,
      outstandingAmountPaise: recoveryCase.outstandingAmountPaise,
      allowed: allowed.map(a => ({
        action: a.action,
        gatesPassed: a.gatesPassed.map(g => ({ id: g.gateId, name: g.gateName, reason: g.reason })),
      })),
      blocked: blocked.map(b => ({
        action: b.action,
        gatesFailed: b.gatesFailed.map(g => ({ id: g.gateId, name: g.gateName, reason: g.reason })),
      })),
      scores,
      recommendation,
      pastActions: pastActions.map(a => ({
        id: a.id,
        type: a.actionType,
        status: a.status,
        receipt: a.executionReceipt,
        createdAt: a.createdAt,
      })),
    });
  } catch (error) {
    console.error('Recovery actions GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch actions', details: String(error) },
      { status: 500 }
    );
  }
}
