// ============================================
// Twilio Webhook / TwiML Callback
// POST /api/webhook/twilio
//
// Handles DTMF responses from Twilio voice calls.
// 1 = payment link, 2 = PTP, 3 = support, 9 = opt-out
// ============================================

import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const digits = formData.get('Digits')?.toString() || '';
    const callSid = formData.get('CallSid')?.toString() || '';

    let responseMessage = '';
    let twiml = '';

    switch (digits) {
      case '1':
        responseMessage = 'Aapko abhi ek secure payment link bheja ja raha hai. Payment link aapke registered number par aayega. Dhanyavaad.';
        break;
      case '2':
        responseMessage = 'Aapka payment promise record kar liya gaya hai. Hum Friday tak wait karenge. Agar tab tak payment nahi aata, hum phir se contact karenge. Dhanyavaad.';
        break;
      case '3':
        responseMessage = 'Hum aapko humare support team se connect kar rahe hain. Kripya hold karein. Dhanyavaad.';
        break;
      case '9':
        responseMessage = 'Aapki request record kar li gayi hai. Hum aapko aage calls nahi karenge. Agar aapko baad mein help chahiye, toh humare support se contact karein. Dhanyavaad.';
        break;
      default:
        responseMessage = 'Maaf kijiye, hum aapka response samajh nahi paaye. Kripya 1, 2, 3 ya 9 mein se koi ek dabaiye.';
    }

    twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="hi-IN" voice="Polly.Aditi">${escapeXml(responseMessage)}</Say>
</Response>`;

    return new Response(twiml, {
      headers: { 'Content-Type': 'text/xml' },
    });
  } catch (error) {
    console.error('Twilio webhook error:', error);
    const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Sorry, an error occurred. Please try again later.</Say>
</Response>`;
    return new Response(errorTwiml, {
      headers: { 'Content-Type': 'text/xml' },
    });
  }
}

function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
