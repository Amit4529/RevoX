// ============================================
// AI / LLM Integration — Structured Output with Deterministic Fallback
//
// Allowed: alias generation, match explanation, message drafting,
//          voice response classification, Settlement Q&A
// Prohibited: monetary calc, match decisions, policy bypass,
//             API calls, consent inference
//
// Full deterministic fallback when OPENAI_API_KEY is absent.
// Rejects invalid LLM responses → logs → falls back safely.
// ============================================

import { z } from 'zod';

// ---- Config ----

function isLLMEnabled(): boolean {
  return (
    (!!process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.length > 5) ||
    (!!process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.length > 10)
  );
}

// ---- Zod Schemas for LLM Responses ----

export const SettlementQAResponseSchema = z.object({
  answer: z.string(),
  reconciliationStatus: z.enum(['reconciled', 'partial', 'unresolved', 'finance_review']),
  grossPaise: z.number().int(),
  deductionLines: z.array(z.object({
    label: z.string(),
    amountPaise: z.number().int(),
  })),
  netPaise: z.number().int(),
  bankCreditPaise: z.number().int(),
  residualPaise: z.number().int(),
  evidenceRefs: z.array(z.string()),
  ruleIds: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  unknowns: z.array(z.string()),
});

export type SettlementQAResponse = z.infer<typeof SettlementQAResponseSchema>;

export const MatchExplanationSchema = z.object({
  candidateRecordIds: z.array(z.string()),
  aliasInterpretation: z.string(),
  supportingEvidence: z.array(z.string()),
  contradictions: z.array(z.string()),
  recommendedDisposition: z.enum(['review', 'abstain']),
  confidence: z.number().min(0).max(1),
});

export type MatchExplanation = z.infer<typeof MatchExplanationSchema>;

export const MessageDraftSchema = z.object({
  subject: z.string().optional(),
  body: z.string(),
  channel: z.enum(['sms', 'email', 'whatsapp']),
  templateVariables: z.record(z.string(), z.string()),
});

export type MessageDraft = z.infer<typeof MessageDraftSchema>;

// ---- Settlement Q&A ----

export interface SettlementBreakdown {
  settlementId: string;
  grossPaise: number;
  feePaise: number;
  taxPaise: number;
  adjustmentPaise: number;
  netPaise: number;
  bankCreditPaise: number;
  status: string;
  linkedPayments: Array<{ paymentId: string; amountPaise: number; status: string }>;
  matchTier?: string;
  matchScore?: number;
  caseId?: string;
  caseNumber?: string;
  cashState?: string;
  diagnosisCode?: string;
  auditEvents: Array<{ eventType: string; reasons: string[]; createdAt: string }>;
}

/**
 * Generate a Settlement Q&A answer from a deterministic breakdown.
 * Uses LLM for natural language if available; otherwise uses templates.
 */
export async function answerSettlementQuestion(
  question: string,
  breakdown: SettlementBreakdown,
): Promise<SettlementQAResponse> {
  const deterministicAnswer = generateDeterministicQA(question, breakdown);

  if (isLLMEnabled()) {
    try {
      const llmAnswer = await callLLMForQA(question, breakdown, deterministicAnswer);
      // Validate with Zod
      const parsed = SettlementQAResponseSchema.safeParse(llmAnswer);
      if (parsed.success) {
        // LLM may only rephrase — verify monetary values match deterministic calculation
        if (parsed.data.grossPaise === deterministicAnswer.grossPaise &&
            parsed.data.netPaise === deterministicAnswer.netPaise &&
            parsed.data.residualPaise === deterministicAnswer.residualPaise) {
          return parsed.data;
        }
        console.warn('LLM response had monetary mismatch — using deterministic fallback');
      } else {
        console.warn('LLM response failed Zod validation — using deterministic fallback', parsed.error);
      }
    } catch (error) {
      console.error('LLM call failed — using deterministic fallback', error);
    }
  }

  return deterministicAnswer;
}

function generateDeterministicQA(question: string, b: SettlementBreakdown): SettlementQAResponse {
  const residualPaise = b.netPaise - b.bankCreditPaise;
  const isReconciled = Math.abs(residualPaise) < 100; // within ₹1 tolerance
  const deductionLines: Array<{ label: string; amountPaise: number }> = [];

  if (b.feePaise > 0) deductionLines.push({ label: 'Platform fee', amountPaise: b.feePaise });
  if (b.taxPaise > 0) deductionLines.push({ label: 'GST on fee', amountPaise: b.taxPaise });
  if (b.adjustmentPaise !== 0) deductionLines.push({ label: 'Adjustments', amountPaise: b.adjustmentPaise });

  const totalDeductions = deductionLines.reduce((s, d) => s + d.amountPaise, 0);
  const expectedNet = b.grossPaise - totalDeductions;

  let answer: string;
  let status: 'reconciled' | 'partial' | 'unresolved' | 'finance_review';
  const unknowns: string[] = [];

  if (isReconciled) {
    status = 'reconciled';
    const deductionText = deductionLines.map(d =>
      `${d.label}: ₹${(d.amountPaise / 100).toFixed(2)}`
    ).join('; ');
    answer = `Settlement ${b.settlementId} is reconciled. Gross: ₹${(b.grossPaise / 100).toFixed(2)}. Deductions: ${deductionText || 'none'}. Expected net: ₹${(expectedNet / 100).toFixed(2)}. Bank credit: ₹${(b.bankCreditPaise / 100).toFixed(2)}. The amounts match — this settlement is correctly processed.`;
  } else {
    const diff = Math.abs(residualPaise);
    status = diff > 50000 ? 'finance_review' : 'unresolved';

    if (residualPaise > 0) {
      answer = `Settlement ${b.settlementId} shows a shortfall. Net expected: ₹${(b.netPaise / 100).toFixed(2)}, but bank credit is ₹${(b.bankCreditPaise / 100).toFixed(2)} — a difference of ₹${(diff / 100).toFixed(2)}. `;
      if (b.adjustmentPaise !== 0) {
        answer += `There is an adjustment of ₹${(Math.abs(b.adjustmentPaise) / 100).toFixed(2)} which partially explains the gap. `;
      }
      unknowns.push(`Unexplained shortfall of ₹${(diff / 100).toFixed(2)}`);
      answer += `This requires finance review.`;
    } else {
      answer = `Settlement ${b.settlementId} received more than expected. Net expected: ₹${(b.netPaise / 100).toFixed(2)}, bank credit: ₹${(b.bankCreditPaise / 100).toFixed(2)} — an overpayment of ₹${(diff / 100).toFixed(2)}. Investigate for possible duplicate credit.`;
      unknowns.push(`Unexplained excess of ₹${(diff / 100).toFixed(2)}`);
    }
  }

  return {
    answer,
    reconciliationStatus: status,
    grossPaise: b.grossPaise,
    deductionLines,
    netPaise: b.netPaise,
    bankCreditPaise: b.bankCreditPaise,
    residualPaise,
    evidenceRefs: [b.settlementId, ...b.linkedPayments.map(p => p.paymentId)],
    ruleIds: b.matchTier ? [b.matchTier] : [],
    confidence: isReconciled ? 1.0 : 0.6,
    unknowns,
  };
}

async function callLLMForQA(
  question: string,
  breakdown: SettlementBreakdown,
  deterministicAnswer: SettlementQAResponse,
): Promise<any> {
  const geminiKey = process.env.GEMINI_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  const systemPrompt = `You are a finance operations assistant for the Cash Integrity Controller (CIC). Your job is to answer questions about settlements using ONLY the verified facts provided.

RULES:
- You MUST use the exact monetary values from the deterministic breakdown. Do NOT calculate or invent any numbers.
- You MUST return a JSON object matching the schema: {"answer": string, "reconciliationStatus": "reconciled"|"partial"|"unresolved"|"finance_review", "grossPaise": int, "deductionLines": [{"label": string, "amountPaise": int}], "netPaise": int, "bankCreditPaise": int, "residualPaise": int, "evidenceRefs": string[], "ruleIds": string[], "confidence": float (0-1), "unknowns": string[]}
- You may rephrase the answer in clearer language but MUST keep all monetary values identical to the deterministic answer.
- If you don't know something, add it to the "unknowns" array.
- NEVER claim reconciliation without verified deterministic proof.`;

  const userPrompt = `Question: ${question}

Settlement breakdown (verified facts):
${JSON.stringify(breakdown, null, 2)}

Deterministic answer (use these exact monetary values):
${JSON.stringify(deterministicAnswer, null, 2)}

Return a JSON object only.`;

  if (geminiKey) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          { role: 'user', parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.1,
        }
      }),
    });

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('No Gemini response content: ' + JSON.stringify(data));
    return JSON.parse(text);
  }

  if (openaiKey) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
        max_tokens: 1000,
      }),
    });

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('No OpenAI response content');
    return JSON.parse(content);
  }

  throw new Error('No LLM API key configured');
}

// ---- Match Explanation (deterministic fallback) ----

export function generateMatchExplanation(
  matchData: {
    ruleTier: string;
    score: number;
    mathExplanation: string;
    evidenceRefs: string[];
  },
): MatchExplanation {
  // Always deterministic — LLM may only rephrase
  return {
    candidateRecordIds: matchData.evidenceRefs,
    aliasInterpretation: `Matched via ${matchData.ruleTier.replace('_', ' ').toUpperCase()} with score ${(matchData.score * 100).toFixed(0)}%`,
    supportingEvidence: [matchData.mathExplanation],
    contradictions: [],
    recommendedDisposition: matchData.score >= 0.7 ? 'review' : 'abstain',
    confidence: matchData.score,
  };
}

// ---- Message Drafting (deterministic template) ----

export function draftRecoveryMessage(
  channel: 'sms' | 'email' | 'whatsapp',
  variables: { caseNumber: string; amount: string; paymentLinkUrl: string; merchantName: string },
): MessageDraft {
  const templates: Record<string, string> = {
    sms: `Hi, a payment of ${variables.amount} for ${variables.caseNumber} is pending. Pay securely: ${variables.paymentLinkUrl} — ${variables.merchantName}`,
    email: `Dear Customer,\n\nWe noticed a pending payment of ${variables.amount} for ${variables.caseNumber}. You can pay securely using this link: ${variables.paymentLinkUrl}\n\nWe will never ask for your OTP, UPI PIN, or card details.\n\nBest regards,\n${variables.merchantName} Payment Team`,
    whatsapp: `Hi! A payment of ${variables.amount} for ${variables.caseNumber} is pending. Pay securely here: ${variables.paymentLinkUrl} 🔒\n\nWe never ask for OTP, PIN, or card details. — ${variables.merchantName}`,
  };

  return {
    subject: channel === 'email' ? `Payment reminder: ${variables.caseNumber}` : undefined,
    body: templates[channel] || templates.sms,
    channel,
    templateVariables: variables,
  };
}
