// ============================================
// Settlement Q&A API
// POST /api/settlement-qa
//
// Input: { question, settlementId?, caseId? }
// Returns: structured answer with deterministic figures,
// deduction lines, evidence refs, and confidence.
// Works with or without LLM API key.
// ============================================

import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { answerSettlementQuestion, type SettlementBreakdown } from '@/lib/integrations/llm';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { question, settlementId, caseId } = body as {
      question: string;
      settlementId?: string;
      caseId?: string;
    };

    if (!question) {
      return NextResponse.json({ error: 'Missing question' }, { status: 400 });
    }

    // Try to resolve settlement from the question or provided IDs
    let settlement: any = null;

    if (settlementId) {
      settlement = await prisma.settlement.findFirst({
        where: {
          OR: [
            { id: settlementId },
            { settlementId: settlementId },
          ],
        },
        include: { lines: { include: { paymentAttempt: true } } },
      });
    }

    // Try to extract settlement ID from question (e.g. "set_883")
    if (!settlement) {
      const setMatch = question.match(/set[_-]?(\w+)/i);
      if (setMatch) {
        settlement = await prisma.settlement.findFirst({
          where: { settlementId: { contains: setMatch[0] } },
          include: { lines: { include: { paymentAttempt: true } } },
        });
      }
    }

    // If caseId provided, get the settlement linked to that case
    if (!settlement && caseId) {
      const rc = await prisma.recoveryCase.findUnique({
        where: { id: caseId },
        include: { evidenceEdges: true },
      });
      if (rc) {
        const setEdge = rc.evidenceEdges.find(e => e.sourceType === 'settlement' || e.targetType === 'settlement');
        if (setEdge) {
          const setId = setEdge.sourceType === 'settlement' ? setEdge.sourceId : setEdge.targetId;
          settlement = await prisma.settlement.findUnique({
            where: { id: setId },
            include: { lines: { include: { paymentAttempt: true } } },
          });
        }
      }
    }

    if (!settlement) {
      return NextResponse.json({
        answer: 'I could not find a settlement matching your question. Please provide a settlement ID (e.g., "set_883") or select a specific case to inspect.',
        reconciliationStatus: 'unresolved',
        grossPaise: 0,
        deductionLines: [],
        netPaise: 0,
        bankCreditPaise: 0,
        residualPaise: 0,
        evidenceRefs: [],
        ruleIds: [],
        confidence: 0,
        unknowns: ['Settlement not found'],
      });
    }

    // Get bank credit for this settlement (match by UTR or narration)
    const bankTxns = await prisma.bankTransaction.findMany({
      where: {
        OR: [
          { narration: { contains: settlement.settlementId } },
          { utr: { contains: settlement.settlementId } },
        ],
      },
    });
    const bankCreditPaise = bankTxns.reduce((s: number, t: any) => s + t.creditPaise, 0) || settlement.netAmountPaise;

    // Get reconciliation match and case if available
    let matchTier: string | undefined;
    let matchScore: number | undefined;
    let caseNumber: string | undefined;
    let cashState: string | undefined;
    let diagnosisCode: string | undefined;
    let relatedCaseId: string | undefined;
    const auditEvents: Array<{ eventType: string; reasons: string[]; createdAt: string }> = [];

    // Find the case linked to this settlement via evidence edges
    const edge = await prisma.evidenceEdge.findFirst({
      where: {
        OR: [
          { sourceId: settlement.id, sourceType: 'settlement' },
          { targetId: settlement.id, targetType: 'settlement' },
        ],
      },
    });

    if (edge) {
      relatedCaseId = edge.recoveryCaseId;
      const rc = await prisma.recoveryCase.findUnique({
        where: { id: relatedCaseId },
        include: {
          reconciliationMatches: true,
          auditEvents: { take: 5, orderBy: { createdAt: 'desc' } },
        },
      });
      if (rc) {
        caseNumber = rc.caseNumber;
        cashState = rc.cashState;
        diagnosisCode = rc.diagnosisCode;
        if (rc.reconciliationMatches.length > 0) {
          matchTier = rc.reconciliationMatches[0].ruleTier;
          matchScore = rc.reconciliationMatches[0].candidateScore ?? undefined;
        }
        for (const ae of rc.auditEvents) {
          auditEvents.push({
            eventType: ae.eventType,
            reasons: JSON.parse(ae.reasons),
            createdAt: ae.createdAt.toISOString(),
          });
        }
      }
    }

    const breakdown: SettlementBreakdown = {
      settlementId: settlement.settlementId,
      grossPaise: settlement.grossAmountPaise,
      feePaise: settlement.feePaise,
      taxPaise: settlement.taxPaise,
      adjustmentPaise: settlement.adjustmentPaise,
      netPaise: settlement.netAmountPaise,
      bankCreditPaise,
      status: settlement.status,
      linkedPayments: settlement.lines.map((l: any) => ({
        paymentId: l.paymentAttempt.providerId,
        amountPaise: l.grossPaise,
        status: l.paymentAttempt.status,
      })),
      matchTier,
      matchScore,
      caseId: relatedCaseId,
      caseNumber,
      cashState,
      diagnosisCode,
      auditEvents,
    };

    const answer = await answerSettlementQuestion(question, breakdown);

    return NextResponse.json({
      ...answer,
      settlementDetails: {
        settlementId: settlement.settlementId,
        status: settlement.status,
        caseNumber,
        cashState,
        diagnosisCode,
        matchTier,
      },
      llmUsed: !!process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.length > 10,
    });
  } catch (error) {
    console.error('Settlement Q&A error:', error);
    return NextResponse.json(
      { error: 'Settlement Q&A failed', details: String(error) },
      { status: 500 }
    );
  }
}
