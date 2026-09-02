// ============================================
// Hinglish Voice Recovery Integration
//
// VoiceProvider interface with two adapters:
// 1. Browser demo adapter (always works — SpeechSynthesis)
// 2. Twilio adapter (optional — controlled by ENABLE_OUTBOUND_CALLS)
//
// Voice only proposed when: recoverable + voice consent + no opt-out +
// no risk hold + no active PTP + no contact cap breach.
// PTP extraction: "Main Friday ko pay kar dunga" → structured PTP.
// ============================================

import { PrismaClient } from '@prisma/client';
import { v4 as uuid } from 'uuid';

// ---- Types ----

export interface VoiceCallInput {
  caseId: string;
  caseNumber: string;
  customerName: string;
  amountPaise: number;
  invoiceOrOrderRef: string;
  merchantName: string;
  paymentLinkUrl?: string;
}

export interface VoiceCallReceipt {
  success: boolean;
  simulated: boolean;
  callId: string;
  provider: 'browser' | 'twilio';
  script: string;
  status: string;
  receipt: string;
  error?: string;
}

export interface VoiceCallStatus {
  callId: string;
  status: 'initiated' | 'ringing' | 'in-progress' | 'completed' | 'failed' | 'no-answer';
  duration?: number;
  customerResponse?: CustomerVoiceResponse;
}

export type CustomerVoiceResponse = 'pay_now' | 'promise_friday' | 'need_help' | 'opt_out' | 'no_answer';

export interface VoiceProvider {
  startCall(input: VoiceCallInput): Promise<VoiceCallReceipt>;
  handleProviderWebhook(rawBody: string, headers: Record<string, string>): Promise<void>;
  getCallStatus(providerCallId: string): Promise<VoiceCallStatus>;
}

// ---- Hinglish Script Templates ----

export const HINGLISH_SCRIPT_TEMPLATE = `Namaste, main {{merchantName}} ki payment assistance team se bol raha hoon. Aapke {{invoiceOrOrderRef}} ke liye {{amount}} ka payment abhi pending dikh raha hai. Agar aap pay karna chahte hain, hum aapko ek secure payment link bhej sakte hain. Hum kabhi OTP, UPI PIN, card number ya bank details nahi maangenge. Payment link ke liye 1 dabaiye, Friday tak payment ka promise dene ke liye 2, support ke liye 3, aur future calls band karne ke liye 9.`;

export const ENGLISH_SCRIPT_TEMPLATE = `Hello, this is the payment assistance team from {{merchantName}}. We noticed that a payment of {{amount}} for {{invoiceOrOrderRef}} is currently pending. If you'd like to pay, we can send you a secure payment link. We will never ask for OTP, UPI PIN, card number, or bank details. Press 1 for payment link, 2 to promise payment by Friday, 3 for support, or 9 to opt out of future calls.`;

export function renderScript(template: string, input: VoiceCallInput): string {
  const amount = `₹${(input.amountPaise / 100).toFixed(2)}`;
  return template
    .replace(/\{\{merchantName\}\}/g, input.merchantName || 'CIC Demo Merchant')
    .replace(/\{\{invoiceOrOrderRef\}\}/g, input.invoiceOrOrderRef || input.caseNumber)
    .replace(/\{\{amount\}\}/g, amount);
}

// ---- PTP Extraction ----

const PTP_PATTERNS: Array<{ pattern: RegExp; extractDay: () => Date }> = [
  {
    pattern: /friday|शुक्रवार/i,
    extractDay: () => {
      const d = new Date();
      const daysUntilFriday = (5 - d.getDay() + 7) % 7 || 7;
      d.setDate(d.getDate() + daysUntilFriday);
      return d;
    },
  },
  {
    pattern: /monday|सोमवार/i,
    extractDay: () => {
      const d = new Date();
      const daysUntilMonday = (1 - d.getDay() + 7) % 7 || 7;
      d.setDate(d.getDate() + daysUntilMonday);
      return d;
    },
  },
  {
    pattern: /tomorrow|kal/i,
    extractDay: () => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      return d;
    },
  },
  {
    pattern: /next week|agle hafte/i,
    extractDay: () => {
      const d = new Date();
      d.setDate(d.getDate() + 7);
      return d;
    },
  },
];

export function extractPTPDate(transcript: string): Date | null {
  for (const { pattern, extractDay } of PTP_PATTERNS) {
    if (pattern.test(transcript)) {
      return extractDay();
    }
  }
  return null;
}

// ---- Config ----

function isTwilioEnabled(): boolean {
  return process.env.ENABLE_OUTBOUND_CALLS === 'true' &&
    !!process.env.TWILIO_ACCOUNT_SID &&
    !!process.env.TWILIO_AUTH_TOKEN &&
    !!process.env.TWILIO_FROM_NUMBER &&
    !!process.env.VOICE_TEST_TO_NUMBER;
}

// ---- Browser Demo Adapter ----

export class BrowserVoiceAdapter implements VoiceProvider {
  async startCall(input: VoiceCallInput): Promise<VoiceCallReceipt> {
    const script = renderScript(HINGLISH_SCRIPT_TEMPLATE, input);
    const callId = `call_browser_${uuid().slice(0, 12)}`;

    return {
      success: true,
      simulated: true,
      callId,
      provider: 'browser',
      script,
      status: 'initiated',
      receipt: `BROWSER VOICE SIMULATOR\nCall ID: ${callId}\nScript rendered with ${input.caseNumber}\nUse the response selector to simulate customer interaction.`,
    };
  }

  async handleProviderWebhook(): Promise<void> {
    // Browser adapter has no external webhook
  }

  async getCallStatus(callId: string): Promise<VoiceCallStatus> {
    return { callId, status: 'completed' };
  }
}

// ---- Twilio Adapter ----

export class TwilioVoiceAdapter implements VoiceProvider {
  async startCall(input: VoiceCallInput): Promise<VoiceCallReceipt> {
    if (!isTwilioEnabled()) {
      return {
        success: false,
        simulated: true,
        callId: '',
        provider: 'twilio',
        script: '',
        status: 'failed',
        receipt: '',
        error: 'Voice provider not configured. Set ENABLE_OUTBOUND_CALLS=true with Twilio credentials.',
      };
    }

    const script = renderScript(HINGLISH_SCRIPT_TEMPLATE, input);
    const callId = `call_twilio_${uuid().slice(0, 12)}`;
    const toNumber = process.env.VOICE_TEST_TO_NUMBER!;

    try {
      const accountSid = process.env.TWILIO_ACCOUNT_SID!;
      const authToken = process.env.TWILIO_AUTH_TOKEN!;
      const fromNumber = process.env.TWILIO_FROM_NUMBER!;
      const amountStr = `₹${(input.amountPaise / 100).toFixed(2)}`;
      const callUrl = `${process.env.APP_BASE_URL || 'http://localhost:3000'}/api/webhook/twilio?caseId=${encodeURIComponent(input.caseId)}&caseNumber=${encodeURIComponent(input.caseNumber)}&amount=${encodeURIComponent(amountStr)}`;

      const params = new URLSearchParams();
      params.append('To', toNumber);
      params.append('From', fromNumber);
      params.append('Url', callUrl);

      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`,
        {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: params.toString(),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          simulated: false,
          callId,
          provider: 'twilio',
          script,
          status: 'failed',
          receipt: '',
          error: `Twilio error: ${data.message || JSON.stringify(data)}`,
        };
      }

      return {
        success: true,
        simulated: false,
        callId: data.sid || callId,
        provider: 'twilio',
        script,
        status: 'initiated',
        receipt: `TWILIO VOICE CALL\nCall SID: ${data.sid}\nTo: ${toNumber} (test number)\nFrom: ${fromNumber}\nStatus: ${data.status}`,
      };
    } catch (error: any) {
      return {
        success: false,
        simulated: false,
        callId,
        provider: 'twilio',
        script,
        status: 'failed',
        receipt: '',
        error: String(error),
      };
    }
  }

  async handleProviderWebhook(): Promise<void> {
    // Handled by the webhook route
  }

  async getCallStatus(callId: string): Promise<VoiceCallStatus> {
    if (!isTwilioEnabled()) {
      return { callId, status: 'failed' };
    }
    try {
      const accountSid = process.env.TWILIO_ACCOUNT_SID!;
      const authToken = process.env.TWILIO_AUTH_TOKEN!;
      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls/${callId}.json`,
        { headers: { 'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64') } }
      );
      const data = await response.json();
      return {
        callId,
        status: data.status === 'completed' ? 'completed' : data.status === 'no-answer' ? 'no-answer' : 'in-progress',
        duration: data.duration ? parseInt(data.duration) : undefined,
      };
    } catch {
      return { callId, status: 'failed' };
    }
  }
}

// ---- TwiML Generation ----

function generateTwiML(script: string, gatherUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="hi-IN" voice="Polly.Aditi">${escapeXml(script)}</Say>
  <Gather input="dtmf" numDigits="1" action="${escapeXml(gatherUrl)}" method="POST" timeout="10">
    <Say language="hi-IN" voice="Polly.Aditi">Payment link ke liye 1, promise ke liye 2, support ke liye 3, opt out ke liye 9 dabaiye.</Say>
  </Gather>
  <Say language="hi-IN" voice="Polly.Aditi">Koi response nahi mila. Hum baad mein try karenge. Dhanyavaad.</Say>
</Response>`;
}

function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---- Factory ----

export function getVoiceProvider(): VoiceProvider {
  if (isTwilioEnabled()) {
    return new TwilioVoiceAdapter();
  }
  return new BrowserVoiceAdapter();
}

// ---- Voice Call Orchestrator ----

/**
 * Start a voice call for a recovery case.
 * Creates audit events and real application state.
 */
export async function startVoiceCall(
  prisma: PrismaClient,
  caseId: string,
): Promise<VoiceCallReceipt> {
  const recoveryCase = await prisma.recoveryCase.findUnique({ where: { id: caseId } });
  if (!recoveryCase) {
    return { success: false, simulated: true, callId: '', provider: 'browser', script: '', status: 'failed', receipt: '', error: 'Case not found' };
  }

  const provider = getVoiceProvider();
  const input: VoiceCallInput = {
    caseId,
    caseNumber: recoveryCase.caseNumber,
    customerName: 'Customer',
    amountPaise: recoveryCase.outstandingAmountPaise,
    invoiceOrOrderRef: recoveryCase.caseNumber,
    merchantName: 'CIC Demo Merchant',
  };

  const result = await provider.startCall(input);

  // Create recovery action
  const idempotencyKey = `voice-${caseId}-${Date.now()}`;
  await prisma.recoveryAction.create({
    data: {
      recoveryCaseId: caseId,
      actionType: 'voice_call',
      idempotencyKey,
      status: result.success ? 'executing' : 'failed',
      isSimulated: result.simulated,
      executionReceipt: result.receipt,
      outcomeReference: result.callId,
    },
  });

  // Audit event
  await prisma.auditEvent.create({
    data: {
      caseId,
      actor: result.provider === 'twilio' ? 'twilio-adapter' : 'browser-voice',
      actorVersion: '1.0-demo',
      eventType: 'ACTION_EXECUTED',
      inputRecordRefs: JSON.stringify([caseId]),
      ruleOrPromptVersion: result.provider,
      decision: JSON.stringify({ action: 'voice_call', callId: result.callId, provider: result.provider }),
      reasons: JSON.stringify([result.simulated ? 'Browser voice simulation initiated' : 'Twilio outbound call placed']),
      policySnapshot: 'voice-recovery',
    },
  });

  return result;
}

/**
 * Process a customer's voice response and take appropriate action.
 */
export async function processVoiceResponse(
  prisma: PrismaClient,
  caseId: string,
  callId: string,
  response: CustomerVoiceResponse,
  transcript?: string,
): Promise<{ success: boolean; message: string; ptpProposed?: boolean; ptpDate?: string }> {
  const recoveryCase = await prisma.recoveryCase.findUnique({ where: { id: caseId } });
  if (!recoveryCase) {
    return { success: false, message: 'Case not found' };
  }

  // Audit the response
  await prisma.auditEvent.create({
    data: {
      caseId,
      actor: 'voice-response',
      actorVersion: '1.0-demo',
      eventType: 'VOICE_RESPONSE_RECEIVED',
      inputRecordRefs: JSON.stringify([caseId, callId]),
      ruleOrPromptVersion: 'voice-response-handler',
      decision: JSON.stringify({ response, transcript }),
      reasons: JSON.stringify([`Customer response: ${response}`]),
      policySnapshot: 'voice-recovery',
    },
  });

  // Update recovery action
  const action = await prisma.recoveryAction.findFirst({
    where: { outcomeReference: callId },
  });
  if (action) {
    await prisma.recoveryAction.update({
      where: { id: action.id },
      data: { status: 'completed', executionReceipt: `${action.executionReceipt}\n\nCustomer response: ${response}` },
    });
  }

  switch (response) {
    case 'pay_now':
      return { success: true, message: 'Customer wants to pay now. Sending secure payment link.' };

    case 'promise_friday': {
      // Extract PTP date
      const ptpDate = extractPTPDate(transcript || 'Friday') || (() => {
        const d = new Date();
        const daysUntilFriday = (5 - d.getDay() + 7) % 7 || 7;
        d.setDate(d.getDate() + daysUntilFriday);
        return d;
      })();

      return {
        success: true,
        message: `PTP proposed for ${ptpDate.toLocaleDateString('en-IN')}. Awaiting confirmation to persist.`,
        ptpProposed: true,
        ptpDate: ptpDate.toISOString().split('T')[0],
      };
    }

    case 'need_help':
      return { success: true, message: 'Customer requested human support. Escalating to support queue.' };

    case 'opt_out': {
      // Record opt-out in audit trail
      await prisma.auditEvent.create({
        data: {
          caseId,
          actor: 'voice-response',
          actorVersion: '1.0-demo',
          eventType: 'CUSTOMER_OPT_OUT',
          inputRecordRefs: JSON.stringify([caseId, callId]),
          ruleOrPromptVersion: 'voice-response-handler',
          decision: JSON.stringify({ response: 'opt_out', channel: 'voice' }),
          reasons: JSON.stringify(['Customer opted out of future calls during voice recovery']),
          policySnapshot: 'voice-recovery',
        },
      });
      return { success: true, message: 'Customer opted out. No further contact will be made via voice.' };
    }

    case 'no_answer':
      return { success: true, message: 'No answer from customer. Will retry according to policy schedule.' };

    default:
      return { success: false, message: `Unknown response: ${response}` };
  }
}
