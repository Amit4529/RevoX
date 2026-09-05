// ============================================
// Twilio Webhook / TwiML Endpoint
// GET & POST /api/webhook/twilio
//
// Handles initial call script generation AND DTMF responses.
// 1 = payment link (creates link + sends SMS + updates DB),
// 2 = PTP (captures Friday PTP in DB),
// 3 = support,
// 9 = opt-out (records opt-out)
// ============================================

import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { createRecoveryPaymentLink } from '@/lib/integrations/razorpay';
import { capturePTP } from '@/lib/engine/ptp';

export async function GET(request: Request) {
  return handleTwilioRequest(request);
}

export async function POST(request: Request) {
  return handleTwilioRequest(request);
}

async function handleTwilioRequest(request: Request) {
  try {
    const url = new URL(request.url);
    let digits = url.searchParams.get('Digits') || '';
    let caseId = url.searchParams.get('caseId') || '';
    const caseNumber = url.searchParams.get('caseNumber') || 'CIC-RE-0066';
    const amount = url.searchParams.get('amount') || '₹85,000.00';

    if (request.method === 'POST') {
      try {
        const formData = await request.formData();
        const d = formData.get('Digits')?.toString();
        if (d) digits = d;
      } catch { /* ignore */ }
    }

    // Resolve caseId to the actual UUID
    let rc = await prisma.recoveryCase.findUnique({ where: { id: caseId } });
    if (!rc && caseNumber) {
      rc = await prisma.recoveryCase.findFirst({ where: { caseNumber } });
    }
    if (!rc && caseId) {
      rc = await prisma.recoveryCase.findFirst({ where: { caseNumber: caseId } });
    }
    if (rc) {
      caseId = rc.id;
    }

    let baseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';
    try {
      const fs = require('fs');
      if (fs.existsSync('tunnel_url.txt')) {
        const t = fs.readFileSync('tunnel_url.txt', 'utf8').trim();
        if (t.startsWith('https://')) baseUrl = t;
      }
    } catch {}

    const callbackUrl = `${baseUrl}/api/webhook/twilio?caseId=${encodeURIComponent(caseId)}&caseNumber=${encodeURIComponent(caseNumber)}&amount=${encodeURIComponent(amount)}`;

    let twiml = '';

    if (!digits) {
      // Initial Call Script
      const script = `Namaste, main RevoX Demo Merchant ki payment assistance team se bol raha hoon. Aapke case ${caseNumber} ke liye ${amount} ka payment abhi pending dikh raha hai. Hum kabhi OTP, UPI PIN, card number ya bank details nahi maangenge. Payment link paane ke liye 1 dabaiye. Friday tak payment promise ke liye 2 dabaiye. Support ke liye 3 dabaiye. Aur future calls band karne ke liye 9 dabaiye.`;

      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="dtmf" numDigits="1" action="${escapeXml(callbackUrl)}" method="POST" timeout="10">
    <Say language="hi-IN" voice="Polly.Aditi">${escapeXml(script)}</Say>
  </Gather>
  <Say language="hi-IN" voice="Polly.Aditi">Koi response nahi mila. Hum baad mein try karenge. Dhanyavaad.</Say>
  <Hangup/>
</Response>`;
    } else {
      // Customer Response Handling
      let responseMessage = '';

      switch (digits) {
        case '1': {
          console.log(`[Twilio DTMF] Customer pressed 1 (Pay Now) for case ${caseNumber} (caseId: ${caseId})`);

          // 1. Create real Payment Link
          let linkUrl = '';
          let linkId = '';
          if (caseId) {
            try {
              const linkResult = await createRecoveryPaymentLink(prisma, caseId);
              linkUrl = linkResult.linkUrl || `https://rzp.io/demo/${linkResult.linkId}`;
              linkId = linkResult.linkId;
              console.log(`[Twilio DTMF] Payment link created: ${linkUrl} (id: ${linkId})`);
            } catch (err) {
              console.error('[Twilio DTMF] Failed to create payment link:', err);
            }
          } else {
            console.error('[Twilio DTMF] No caseId available — cannot create payment link');
          }

          // 2. Send SMS to user's phone via Twilio
          const accountSid = process.env.TWILIO_ACCOUNT_SID;
          const authToken = process.env.TWILIO_AUTH_TOKEN;
          const fromNumber = process.env.TWILIO_FROM_NUMBER;
          const toNumber = process.env.VOICE_TEST_TO_NUMBER;

          if (accountSid && authToken && fromNumber && toNumber && linkUrl) {
            try {
              const smsBody = `[RevoX Recovery] Payment link for case ${caseNumber} (${amount}): ${linkUrl}. Click to complete your payment securely.`;
              const smsParams = new URLSearchParams();
              smsParams.append('To', toNumber);
              smsParams.append('From', fromNumber);
              smsParams.append('Body', smsBody);

              console.log(`[Twilio SMS] Sending to ${toNumber}: ${smsBody.slice(0, 80)}...`);

              const smsRes = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
                method: 'POST',
                headers: {
                  'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
                  'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: smsParams.toString(),
              });

              const smsData = await smsRes.json();
              if (smsRes.ok) {
                console.log(`[Twilio SMS] ✅ Sent successfully. SID: ${smsData.sid}`);
                responseMessage = `Aapko abhi ek secure payment link SMS bheja ja raha hai. Payment link par click karke payment karein. Case number ${caseNumber}. Dhanyavaad.`;
              } else {
                console.error(`[Twilio SMS] ❌ Failed:`, smsData);
                // SMS failed but payment link was created — tell customer the link URL directly in the call
                responseMessage = `Aapka payment link ready hai. Link hai: ${linkUrl}. Yeh link 7 din tak valid hai. Dhanyavaad.`;
              }
            } catch (smsErr) {
              console.error('[Twilio SMS] Exception:', smsErr);
              responseMessage = `Aapka payment link ready hai. Kripya apne registered email check karein. Dhanyavaad.`;
            }
          } else {
            responseMessage = 'Aapko abhi ek secure payment link bheja ja raha hai. Dhanyavaad.';
          }

          // 3. Log Audit Event
          if (caseId) {
            await prisma.auditEvent.create({
              data: {
                caseId,
                actor: 'twilio-voice',
                actorVersion: '1.0-demo',
                eventType: 'VOICE_RESPONSE_RECEIVED',
                inputRecordRefs: JSON.stringify([caseId]),
                ruleOrPromptVersion: 'dtmf-1-pay-now',
                decision: JSON.stringify({ action: 'payment_link_requested', linkUrl, linkId }),
                reasons: JSON.stringify([`Customer pressed 1 on phone call: Payment link created (${linkUrl})`]),
                policySnapshot: 'voice-recovery',
              },
            });
          }
          break;
        }

        case '2': {
          console.log(`[Twilio DTMF] Customer pressed 2 (PTP) for case ${caseNumber} (caseId: ${caseId})`);
          responseMessage = 'Aapka payment promise record kar liya gaya hai. Hum Friday tak wait karenge. Dhanyavaad.';

          if (caseId) {
            try {
              // Calculate next Friday
              const d = new Date();
              const daysUntilFriday = (5 - d.getDay() + 7) % 7 || 7;
              d.setDate(d.getDate() + daysUntilFriday);
              const fridayStr = d.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' });

              const recoveryCase = await prisma.recoveryCase.findUnique({ where: { id: caseId } });
              if (recoveryCase) {
                const ptpResult = await capturePTP(prisma, {
                  recoveryCaseId: caseId,
                  customerId: 'cust_demo',
                  amountPaise: recoveryCase.outstandingAmountPaise,
                  promisedDate: d,
                  source: 'voice',
                  transcript: `Customer pressed 2 on phone call — Promised to pay ₹${(recoveryCase.outstandingAmountPaise / 100).toFixed(2)} by ${fridayStr}`,
                });
                console.log(`[Twilio DTMF] PTP result:`, ptpResult);

                // Also log voice response audit event
                await prisma.auditEvent.create({
                  data: {
                    caseId,
                    actor: 'twilio-voice',
                    actorVersion: '1.0-demo',
                    eventType: 'VOICE_RESPONSE_RECEIVED',
                    inputRecordRefs: JSON.stringify([caseId]),
                    ruleOrPromptVersion: 'dtmf-2-promise-friday',
                    decision: JSON.stringify({
                      action: 'promise_to_pay',
                      promisedDate: d.toISOString(),
                      amountPaise: recoveryCase.outstandingAmountPaise,
                      ptpSuccess: ptpResult.success,
                    }),
                    reasons: JSON.stringify([
                      `Customer pressed 2 on phone call: Promise to pay ₹${(recoveryCase.outstandingAmountPaise / 100).toFixed(2)} by ${fridayStr}`,
                      'All automated dunning paused until promised date + 1 day grace',
                      `Agent will auto-follow-up on ${fridayStr} if payment not received`,
                    ]),
                    policySnapshot: 'voice-recovery',
                  },
                });

                responseMessage = `Aapka payment promise record ho gaya hai. Amount ${amount}, Friday ${fridayStr} tak. Hum tab tak wait karenge. Dhanyavaad.`;
              }

            } catch (ptpErr) {
              console.error('[Twilio DTMF] Failed to capture PTP:', ptpErr);
            }
          }
          break;
        }

        case '3':
          responseMessage = 'Hum aapko humare support team se connect kar rahe hain. Kripya hold karein. Dhanyavaad.';
          break;

        case '9': {
          console.log(`[Twilio DTMF] Customer pressed 9 (Opt Out) for case ${caseNumber} (caseId: ${caseId})`);
          responseMessage = 'Aapki request record kar li gayi hai. Hum aapko aage calls nahi karenge. Dhanyavaad.';
          if (caseId) {
            await prisma.auditEvent.create({
              data: {
                caseId,
                actor: 'twilio-voice',
                actorVersion: '1.0-demo',
                eventType: 'CUSTOMER_OPT_OUT',
                inputRecordRefs: JSON.stringify([caseId]),
                ruleOrPromptVersion: 'dtmf-9-opt-out',
                decision: JSON.stringify({ action: 'opt_out', channel: 'voice' }),
                reasons: JSON.stringify(['Customer pressed 9 on phone call: Opted out of future recovery contact']),
                policySnapshot: 'voice-recovery',
              },
            });
          }
          break;
        }

        default:
          responseMessage = 'Dhanyavaad. Aapka response record ho gaya hai.';
      }

      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="hi-IN" voice="Polly.Aditi">${escapeXml(responseMessage)}</Say>
  <Hangup/>
</Response>`;
    }

    return new Response(twiml, {
      headers: { 'Content-Type': 'text/xml' },
    });
  } catch (error) {
    console.error('Twilio webhook error:', error);
    const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Namaste, RevoX payment assistance call complete. Thank you.</Say>
</Response>`;
    return new Response(errorTwiml, {
      headers: { 'Content-Type': 'text/xml' },
    });
  }
}

function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

