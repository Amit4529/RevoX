// ============================================
// Playbook API — Preview and Run Recovery Playbooks
// ============================================

import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { previewPlaybook, runPlaybook, selectPlaybook } from '@/lib/engine/playbooks';

// GET: Preview playbook steps for a recovery case
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const caseId = searchParams.get('caseId');

    if (!caseId) {
      return NextResponse.json({ error: 'Missing caseId parameter' }, { status: 400 });
    }

    const plan = await previewPlaybook(prisma, caseId);

    if (!plan) {
      return NextResponse.json({ error: 'Recovery case not found' }, { status: 404 });
    }

    return NextResponse.json({
      plan,
      recommendedPlaybook: selectPlaybook(plan.diagnosisCode),
    });
  } catch (error) {
    console.error('Playbook preview error:', error);
    return NextResponse.json(
      { error: 'Failed to preview playbook', details: String(error) },
      { status: 500 }
    );
  }
}

// POST: Run next step of the recovery playbook
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { caseId } = body;

    if (!caseId) {
      return NextResponse.json({ error: 'Missing required field: caseId' }, { status: 400 });
    }

    const result = await runPlaybook(prisma, caseId);

    return NextResponse.json(result, {
      status: result.success ? 200 : result.status === 'blocked' ? 403 : 400,
    });
  } catch (error) {
    console.error('Playbook execution error:', error);
    return NextResponse.json(
      { error: 'Failed to execute playbook', details: String(error) },
      { status: 500 }
    );
  }
}
