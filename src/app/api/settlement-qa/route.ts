// ============================================
// Settlement Q&A API
// POST /api/settlement-qa
//
// Input: { question, settlementId?, caseId? }
// Returns: structured answer with deterministic figures,
// deduction lines, evidence refs, and confidence.
// Works with or without LLM API key.
// Now also handles case-level queries (CIC-RE-XXXX).
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
      const setMatch = question.match(/set[_-]?(\\w+)/i);
      if (setMatch) {
        settlement = await prisma.settlement.findFirst({
          where: { settlementId: { contains: setMatch[0] } },
          include: { lines: { include: { paymentAttempt: true } } },
        });
      }
    }

    // --- NEW: Extract case number from question (e.g. "CIC-RE-0066") ---
    let resolvedCase: any = null;

    // Try caseId (UUID or caseNumber)
    if (caseId) {
      resolvedCase = await prisma.recoveryCase.findUnique({
        where: { id: caseId },
        include: {
          reconciliationMatches: true,
          auditEvents: { take: 10, orderBy: { createdAt: 'desc' } },
          evidenceEdges: true,
          recoveryActions: { take: 5, orderBy: { createdAt: 'desc' } },
        },
      });
      if (!resolvedCase) {
        resolvedCase = await prisma.recoveryCase.findFirst({
          where: { caseNumber: caseId },
          include: {
            reconciliationMatches: true,
            auditEvents: { take: 10, orderBy: { createdAt: 'desc' } },
            evidenceEdges: true,
            recoveryActions: { take: 5, orderBy: { createdAt: 'desc' } },
          },
        });
      }
    }

    // Try extracting case number from question (CIC-XX-XXXX)
    if (!resolvedCase) {
      const caseMatch = question.match(/CIC[_-]([A-Z]{2})[_-](\d+)/i);
      if (caseMatch) {
        const caseNumber = `CIC-${caseMatch[1].toUpperCase()}-${caseMatch[2].padStart(4, '0')}`;
        resolvedCase = await prisma.recoveryCase.findFirst({
          where: { caseNumber },
          include: {
            reconciliationMatches: true,
            auditEvents: { take: 10, orderBy: { createdAt: 'desc' } },
            evidenceEdges: true,
            recoveryActions: { take: 5, orderBy: { createdAt: 'desc' } },
          },
        });
      }
    }

    // If caseId provided, get the settlement linked to that case
    if (!settlement && resolvedCase) {
      const setEdge = resolvedCase.evidenceEdges?.find(
        (e: any) => e.sourceType === 'settlement' || e.targetType === 'settlement'
      );
      if (setEdge) {
        const setId = setEdge.sourceType === 'settlement' ? setEdge.sourceId : setEdge.targetId;
        settlement = await prisma.settlement.findUnique({
          where: { id: setId },
          include: { lines: { include: { paymentAttempt: true } } },
        });
      }
    }

    // --- If we have the case but no settlement, answer from case data directly ---
    if (!settlement && resolvedCase) {
      const rc = resolvedCase;
      const match = rc.reconciliationMatches?.[0];
      const actions = rc.recoveryActions || [];
      const audits = rc.auditEvents || [];

      // Build a rich, human-readable answer about the case
      const lines: string[] = [];
      lines.push(`**Case ${rc.caseNumber}** — ${rc.cashState?.replace(/_/g, ' ') ?? 'unknown state'}`);
      lines.push('');

      // Diagnosis
      if (rc.diagnosisCode) {
        lines.push(`**Diagnosis:** ${rc.diagnosisCode.replace(/_/g, ' ')}`);
      }

      // Reconciliation info
      if (match) {
        lines.push(`**Reconciliation Tier:** ${match.ruleTier ?? 'unmatched'} (confidence: ${match.candidateScore ?? 'N/A'})`);
      } else {
        lines.push('**Reconciliation:** No match found yet — this case is in the honest exception tier.');
      }

      // Outstanding amount
      if (rc.outstandingAmountPaise != null) {
        const amt = (rc.outstandingAmountPaise / 100).toLocaleString('en-IN', { style: 'currency', currency: 'INR' });
        lines.push(`**Outstanding Amount:** ${amt}`);
      }

      // Recovery actions
      if (actions.length > 0) {
        lines.push('');
        lines.push('**Recovery Actions Taken:**');
        for (const a of actions) {
          const date = new Date(a.createdAt).toLocaleDateString('en-IN');
          lines.push(`• ${a.actionType} — ${a.status} (${date})${a.receipt ? ` — Receipt: ${a.receipt}` : ''}`);
        }
      }

      // Recent audit events
      if (audits.length > 0) {
        lines.push('');
        lines.push('**Recent Audit Trail:**');
        for (const ae of audits.slice(0, 5)) {
          const date = new Date(ae.createdAt).toLocaleDateString('en-IN');
          let reasons = '—';
          try { reasons = JSON.parse(ae.reasons).join(', '); } catch { reasons = ae.reasons; }
          lines.push(`• ${ae.eventType} (${date}) — ${reasons}`);
        }
      }

      // Priority info
      if (rc.priorityScore != null) {
        lines.push('');
        lines.push(`**Priority Score:** ${rc.priorityScore}`);
      }
      if (rc.nextEscalation) {
        lines.push(`**Next Escalation:** ${new Date(rc.nextEscalation).toLocaleDateString('en-IN')}`);
      }

      const answerText = lines.join('\n');

      return NextResponse.json({
        answer: answerText,
        reconciliationStatus: rc.cashState ?? 'unknown',
        grossPaise: rc.outstandingAmountPaise ?? 0,
        deductionLines: [],
        netPaise: 0,
        bankCreditPaise: 0,
        residualPaise: 0,
        evidenceRefs: rc.evidenceEdges?.map((e: any) => `${e.sourceType}:${e.sourceId}→${e.targetType}:${e.targetId}`) || [],
        ruleIds: match ? [match.ruleTier] : [],
        confidence: match ? (match.candidateScore ?? 80) : 50,
        unknowns: [],
        settlementDetails: {
          caseNumber: rc.caseNumber,
          cashState: rc.cashState,
          diagnosisCode: rc.diagnosisCode,
          matchTier: match?.ruleTier,
        },
        llmUsed: false,
      });
    }

    // --- No settlement AND no case found ---
    if (!settlement) {
      return NextResponse.json({
        answer: 'I could not find a settlement or case matching your question. Try asking about a specific case (e.g., "CIC-RE-0066") or settlement (e.g., "set_883").',
        reconciliationStatus: 'unresolved',
        grossPaise: 0,
        deductionLines: [],
        netPaise: 0,
        bankCreditPaise: 0,
        residualPaise: 0,
        evidenceRefs: [],
        ruleIds: [],
        confidence: 0,
        unknowns: ['No matching record found'],
      });
    }

    // --- Settlement found: full settlement-level Q&A ---
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
