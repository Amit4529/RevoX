// ============================================
// Promise-to-Pay API
// ============================================

import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { capturePTP, markPTPKept, markPTPBroken, cancelPTP, checkExpiredPTPs } from '@/lib/engine/ptp';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action } = body;

    switch (action) {
      case 'capture': {
        const { recoveryCaseId, customerId, amountPaise, promisedDate, source, transcript } = body;

        if (!recoveryCaseId || !customerId || !amountPaise || !promisedDate) {
          return NextResponse.json(
            { error: 'Missing required fields: recoveryCaseId, customerId, amountPaise, promisedDate' },
            { status: 400 }
          );
        }

        const result = await capturePTP(prisma, {
          recoveryCaseId,
          customerId,
          amountPaise: parseInt(amountPaise),
          promisedDate: new Date(promisedDate),
          source: source || 'browser_demo',
          transcript,
        });

        return NextResponse.json(result, { status: result.success ? 200 : 400 });
      }

      case 'mark_kept': {
        const result = await markPTPKept(prisma, body.ptpId);
        return NextResponse.json(result, { status: result.success ? 200 : 400 });
      }

      case 'mark_broken': {
        const result = await markPTPBroken(prisma, body.ptpId, body.graceDays || 1);
        return NextResponse.json(result, { status: result.success ? 200 : 400 });
      }

      case 'cancel': {
        const result = await cancelPTP(prisma, body.ptpId);
        return NextResponse.json(result, { status: result.success ? 200 : 400 });
      }

      case 'check_expired': {
        const result = await checkExpiredPTPs(prisma, body.graceDays || 1);
        return NextResponse.json({ success: true, ...result });
      }

      default:
        return NextResponse.json(
          { error: 'Invalid action. Use: capture, mark_kept, mark_broken, cancel, check_expired' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('PTP API error:', error);
    return NextResponse.json(
      { error: 'PTP operation failed', details: String(error) },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const caseId = searchParams.get('caseId');

    const where: Record<string, unknown> = {};
    if (caseId) where.recoveryCaseId = caseId;

    const ptps = await prisma.promiseToPay.findMany({
      where,
      include: {
        recoveryCase: {
          select: { caseNumber: true, cashState: true, outstandingAmountPaise: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ promiseToPays: ptps });
  } catch (error) {
    console.error('PTP GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch PTPs', details: String(error) },
      { status: 500 }
    );
  }
}
