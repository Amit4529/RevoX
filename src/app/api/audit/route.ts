// ============================================
// Audit Trail API — Append-only event log
// ============================================

import { NextResponse } from 'next/server';
import prisma from '@/lib/db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const caseId = searchParams.get('caseId');
    const eventType = searchParams.get('eventType');
    const limit = parseInt(searchParams.get('limit') || '100');
    const page = parseInt(searchParams.get('page') || '1');

    const where: Record<string, unknown> = {};
    if (caseId) where.caseId = caseId;
    if (eventType) where.eventType = eventType;

    const [events, total] = await Promise.all([
      prisma.auditEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.auditEvent.count({ where }),
    ]);

    const parsed = events.map(e => ({
      ...e,
      inputRecordRefs: JSON.parse(e.inputRecordRefs),
      reasons: JSON.parse(e.reasons),
      decision: e.decision ? JSON.parse(e.decision) : null,
      metadata: e.metadata ? JSON.parse(e.metadata) : null,
    }));

    return NextResponse.json({
      events: parsed,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('Audit API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch audit events', details: String(error) },
      { status: 500 }
    );
  }
}
