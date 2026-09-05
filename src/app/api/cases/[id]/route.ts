// ============================================
// Case Detail API — Single recovery case with all evidence
// ============================================

import { NextResponse } from 'next/server';
import prisma from '@/lib/db';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    let recoveryCase = await prisma.recoveryCase.findUnique({
      where: { id },
      include: {
        reconciliationMatches: true,
        policyDecisions: {
          include: { policy: true },
        },
        recoveryActions: { orderBy: { createdAt: 'desc' } },
        promiseToPays: { orderBy: { createdAt: 'desc' } },
        evidenceEdges: true,
        auditEvents: { orderBy: { createdAt: 'desc' } },
        riskSignals: true,
        experimentAssignment: true,
      },
    });

    // Fallback: try finding by caseNumber if UUID lookup failed
    if (!recoveryCase) {
      recoveryCase = await prisma.recoveryCase.findFirst({
        where: { caseNumber: id },
        include: {
          reconciliationMatches: true,
          policyDecisions: {
            include: { policy: true },
          },
          recoveryActions: { orderBy: { createdAt: 'desc' } },
          promiseToPays: { orderBy: { createdAt: 'desc' } },
          evidenceEdges: true,
          auditEvents: { orderBy: { createdAt: 'desc' } },
          riskSignals: true,
          experimentAssignment: true,
        },
      });
    }

    if (!recoveryCase) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    }

    const parsed = {
      ...recoveryCase,
      evidenceRefs: JSON.parse(recoveryCase.evidenceRefs),
      allowedActions: JSON.parse(recoveryCase.allowedActions),
      blockedActions: JSON.parse(recoveryCase.blockedActions),
      auditEvents: recoveryCase.auditEvents.map(e => ({
        ...e,
        inputRecordRefs: JSON.parse(e.inputRecordRefs),
        reasons: JSON.parse(e.reasons),
        decision: e.decision ? JSON.parse(e.decision) : null,
        metadata: e.metadata ? JSON.parse(e.metadata) : null,
      })),
      policyDecisions: recoveryCase.policyDecisions.map(pd => ({
        ...pd,
        gatesPassed: JSON.parse(pd.gatesPassed),
        gatesFailed: JSON.parse(pd.gatesFailed),
      })),
      recoveryActions: recoveryCase.recoveryActions.map(a => ({
        ...a,
        executionDetails: a.outcomeReference
          ? (() => { try { return JSON.parse(a.outcomeReference!); } catch { return null; } })()
          : null,
      })),
    };

    return NextResponse.json(parsed);
  } catch (error) {
    console.error('Case detail error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch case', details: String(error) },
      { status: 500 }
    );
  }
}

// Human review: approve / reject / override with reason
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { action, reason, newCashState } = body as {
      action: 'approve' | 'reject' | 'override';
      reason: string;
      newCashState?: string;
    };

    const recoveryCase = await prisma.recoveryCase.findUnique({ where: { id } });
    if (!recoveryCase) return NextResponse.json({ error: 'Case not found' }, { status: 404 });

    // Determine new state based on action
    let targetState = recoveryCase.cashState;
    if (action === 'approve') {
      targetState = 'closed';
    } else if (action === 'reject') {
      targetState = 'finance_review';
    } else if (action === 'override' && newCashState) {
      targetState = newCashState;
    }

    // Update case state
    await prisma.recoveryCase.update({
      where: { id },
      data: { cashState: targetState },
    });

    const audit = await prisma.auditEvent.create({
      data: {
        caseId: id,
        actor: 'human-reviewer',
        actorVersion: '1.0-demo',
        eventType: `HUMAN_REVIEW_${action.toUpperCase()}`,
        inputRecordRefs: JSON.stringify([id]),
        ruleOrPromptVersion: 'manual',
        decision: JSON.stringify({ action, newCashState }),
        reasons: JSON.stringify([reason || `Human ${action}`]),
        policySnapshot: 'manual-review',
      },
    });

    return NextResponse.json({ success: true, auditId: audit.id });
  } catch (error) {
    console.error('Case review error:', error);
    return NextResponse.json(
      { error: 'Failed to apply review', details: String(error) },
      { status: 500 }
    );
  }
}
