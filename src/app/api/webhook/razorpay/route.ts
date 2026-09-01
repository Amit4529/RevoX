// ============================================
// Razorpay Webhook Endpoint
// POST /api/webhook/razorpay
//
// HMAC SHA-256 verification, deduplication, idempotent processing.
// Fast 2xx reply. Secrets never logged.
// ============================================

import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { verifyAndParseWebhook, processWebhookEvent } from '@/lib/integrations/razorpay';

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get('x-razorpay-signature');
    const eventId = request.headers.get('x-razorpay-event-id');

    // Verify and parse
    const verification = await verifyAndParseWebhook(prisma, rawBody, signature, eventId);

    if (!verification.valid) {
      console.error('Webhook HMAC verification failed');
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 }
      );
    }

    if (verification.duplicate) {
      // Idempotent — already processed
      return NextResponse.json({ status: 'already_processed', eventId: verification.eventId });
    }

    // Process idempotently — fast reply
    const result = await processWebhookEvent(
      prisma,
      verification.eventId,
      verification.eventType,
      verification.payload,
    );

    return NextResponse.json({
      status: 'ok',
      eventId: verification.eventId,
      eventType: verification.eventType,
      processed: result.processed,
      message: result.message,
    });
  } catch (error) {
    console.error('Webhook processing error:', error);
    // Still return 200 to prevent retry storms
    return NextResponse.json({ status: 'error', message: 'Internal processing error' });
  }
}
