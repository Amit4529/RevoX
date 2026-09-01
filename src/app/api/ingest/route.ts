// ============================================
// Ingestion API — Load seeded batch or upload CSV/JSON
// ============================================

import { NextResponse } from 'next/server';
import prisma from '@/lib/db';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === 'load_seed') {
      return await loadSeededBatch();
    }

    return NextResponse.json({ error: 'Invalid action. Use "load_seed".' }, { status: 400 });
  } catch (error) {
    console.error('Ingestion error:', error);
    return NextResponse.json(
      { error: 'Ingestion failed', details: String(error) },
      { status: 500 }
    );
  }
}

async function loadSeededBatch() {
  const startTime = Date.now();

  // Count existing records by source type
  const [payments, invoices, settlements, bankTxns, checkouts, comms] = await Promise.all([
    prisma.paymentAttempt.count(),
    prisma.invoice.count(),
    prisma.settlement.count(),
    prisma.bankTransaction.count(),
    prisma.checkoutSession.count(),
    prisma.communication.count(),
  ]);

  const totalRecords = payments + invoices + settlements + bankTxns + checkouts + comms;

  if (totalRecords === 0) {
    return NextResponse.json(
      { error: 'No seed data found. Run `npm run db:seed` first.' },
      { status: 400 }
    );
  }

  // Create ingestion batch record
  const batch = await prisma.ingestionBatch.create({
    data: {
      sourceLabel: 'seeded_demo',
      totalRecords,
      ingested: totalRecords,
      rejected: 0,
      duplicates: 0,
      status: 'completed',
      completedAt: new Date(),
      elapsedMs: Date.now() - startTime,
    },
  });

  // Create ingestion records for traceability
  const allPayments = await prisma.paymentAttempt.findMany({ select: { id: true, providerId: true, gatewayResponse: true } });
  const allInvoices = await prisma.invoice.findMany({ select: { id: true, invoiceId: true } });
  const allSettlements = await prisma.settlement.findMany({ select: { id: true, settlementId: true } });
  const allBankTxns = await prisma.bankTransaction.findMany({ select: { id: true, utr: true } });
  const allCheckouts = await prisma.checkoutSession.findMany({ select: { id: true, sessionId: true } });
  const allComms = await prisma.communication.findMany({ select: { id: true, channel: true } });

  // Batch create ingestion records
  const ingestionRecords = [
    ...allPayments.map(p => ({
      batchId: batch.id,
      sourceType: 'gateway',
      rawPayload: p.gatewayResponse || JSON.stringify({ providerId: p.providerId }),
      payloadHash: p.providerId,
      status: 'ingested',
      entityId: p.id,
      entityType: 'PaymentAttempt',
    })),
    ...allInvoices.map(inv => ({
      batchId: batch.id,
      sourceType: 'invoice',
      rawPayload: JSON.stringify({ invoiceId: inv.invoiceId }),
      payloadHash: inv.invoiceId,
      status: 'ingested',
      entityId: inv.id,
      entityType: 'Invoice',
    })),
    ...allSettlements.map(s => ({
      batchId: batch.id,
      sourceType: 'settlement',
      rawPayload: JSON.stringify({ settlementId: s.settlementId }),
      payloadHash: s.settlementId,
      status: 'ingested',
      entityId: s.id,
      entityType: 'Settlement',
    })),
    ...allBankTxns.map(b => ({
      batchId: batch.id,
      sourceType: 'bank_statement',
      rawPayload: JSON.stringify({ utr: b.utr }),
      payloadHash: b.utr || b.id,
      status: 'ingested',
      entityId: b.id,
      entityType: 'BankTransaction',
    })),
    ...allCheckouts.map(c => ({
      batchId: batch.id,
      sourceType: 'checkout',
      rawPayload: JSON.stringify({ sessionId: c.sessionId }),
      payloadHash: c.sessionId,
      status: 'ingested',
      entityId: c.id,
      entityType: 'CheckoutSession',
    })),
    ...allComms.map(c => ({
      batchId: batch.id,
      sourceType: 'communication',
      rawPayload: JSON.stringify({ channel: c.channel }),
      payloadHash: c.id,
      status: 'ingested',
      entityId: c.id,
      entityType: 'Communication',
    })),
  ];

  // Create all ingestion records
  await prisma.ingestionRecord.createMany({
    data: ingestionRecords,
  });

  const elapsedMs = Date.now() - startTime;

  // Update batch with final elapsed time
  await prisma.ingestionBatch.update({
    where: { id: batch.id },
    data: { elapsedMs },
  });

  return NextResponse.json({
    success: true,
    batchId: batch.id,
    summary: {
      totalRecords,
      bySource: {
        gateway: payments,
        invoice: invoices,
        settlement: settlements,
        bank_statement: bankTxns,
        checkout: checkouts,
        communication: comms,
      },
      ingested: totalRecords,
      rejected: 0,
      duplicates: 0,
      elapsedMs,
    },
  });
}
