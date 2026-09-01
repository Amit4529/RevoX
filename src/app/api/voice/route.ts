// ============================================
// Voice API
// POST /api/voice — start a voice call or process a response
//
// start: initiates browser sim or Twilio call
// respond: processes customer response, creates audit events
// ============================================

import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { startVoiceCall, processVoiceResponse, type CustomerVoiceResponse } from '@/lib/integrations/voice';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === 'start') {
      const { caseId } = body;
      if (!caseId) {
        return NextResponse.json({ error: 'Missing caseId' }, { status: 400 });
      }

      const result = await startVoiceCall(prisma, caseId);
      return NextResponse.json(result, { status: result.success ? 200 : 500 });
    }

    if (action === 'respond') {
      const { caseId, callId, response, transcript } = body as {
        caseId: string;
        callId: string;
        response: CustomerVoiceResponse;
        transcript?: string;
      };

      if (!caseId || !callId || !response) {
        return NextResponse.json({ error: 'Missing caseId, callId, or response' }, { status: 400 });
      }

      const validResponses: CustomerVoiceResponse[] = ['pay_now', 'promise_friday', 'need_help', 'opt_out', 'no_answer'];
      if (!validResponses.includes(response)) {
        return NextResponse.json({ error: `Invalid response. Must be one of: ${validResponses.join(', ')}` }, { status: 400 });
      }

      const result = await processVoiceResponse(prisma, caseId, callId, response, transcript);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: 'Invalid action. Use "start" or "respond".' }, { status: 400 });
  } catch (error) {
    console.error('Voice API error:', error);
    return NextResponse.json(
      { error: 'Voice operation failed', details: String(error) },
      { status: 500 }
    );
  }
}
