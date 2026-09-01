// ============================================
// Cases API — List and manage recovery cases
// ============================================

import { NextResponse } from 'next/server';
import prisma from '@/lib/db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const cashState = searchParams.get('cashState');
    const priority = searchParams.get('priority');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');

    const where: Record<string, unknown> = {};
    if (cashState) where.cashState = cashState;
    if (priority) where.priority = priority;

    const [cases, total] = await Promise.all([
      prisma.recoveryCase.findMany({
        where,
        orderBy: [
          { priority: 'asc' },
          { outstandingAmountPaise: 'desc' },
        ],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.recoveryCase.count({ where }),
    ]);

    // Parse JSON fields for response
    const parsedCases = cases.map(c => ({
      ...c,
      evidenceRefs: JSON.parse(c.evidenceRefs),
      allowedActions: JSON.parse(c.allowedActions),
      blockedActions: JSON.parse(c.blockedActions),
    }));

    return NextResponse.json({
      cases: parsedCases,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('Cases API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch cases', details: String(error) },
      { status: 500 }
    );
  }
}
