// ============================================
// Policy API — View and edit the active policy
// ============================================

import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { loadPolicy, DEFAULT_POLICY } from '@/lib/engine/firewall';

export async function GET() {
  try {
    const policy = await loadPolicy(prisma);
    const policyRecord = await prisma.policy.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      policy,
      metadata: policyRecord ? {
        id: policyRecord.id,
        version: policyRecord.version,
        isActive: policyRecord.isActive,
        createdAt: policyRecord.createdAt,
        updatedAt: policyRecord.updatedAt,
      } : null,
    });
  } catch (error) {
    console.error('Policy GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch policy', details: String(error) },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { policy: updatedPolicy } = body;

    if (!updatedPolicy) {
      return NextResponse.json({ error: 'Missing policy object' }, { status: 400 });
    }

    // Validate the policy has the required structure
    const required = ['policyVersion', 'contact', 'retries', 'railSwitch', 'promiseToPay', 'approvals', 'risk'];
    for (const field of required) {
      if (!(field in updatedPolicy)) {
        return NextResponse.json(
          { error: `Missing required field: ${field}` },
          { status: 400 }
        );
      }
    }

    // Deactivate current active policy
    await prisma.policy.updateMany({
      where: { isActive: true },
      data: { isActive: false },
    });

    // Create new policy version
    const newPolicy = await prisma.policy.create({
      data: {
        version: updatedPolicy.policyVersion || `1.0-demo-${Date.now()}`,
        config: JSON.stringify(updatedPolicy),
        isActive: true,
      },
    });

    // Audit event
    await prisma.auditEvent.create({
      data: {
        actor: 'policy-editor',
        actorVersion: '1.0-demo',
        eventType: 'POLICY_UPDATED',
        inputRecordRefs: JSON.stringify([newPolicy.id]),
        ruleOrPromptVersion: newPolicy.version,
        decision: JSON.stringify({ newVersion: newPolicy.version }),
        reasons: JSON.stringify(['Policy updated via editor']),
        policySnapshot: newPolicy.version,
      },
    });

    return NextResponse.json({
      success: true,
      policyId: newPolicy.id,
      version: newPolicy.version,
    });
  } catch (error) {
    console.error('Policy PUT error:', error);
    return NextResponse.json(
      { error: 'Failed to update policy', details: String(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === 'reset_default') {
      // Reset to default policy
      await prisma.policy.updateMany({
        where: { isActive: true },
        data: { isActive: false },
      });

      const newPolicy = await prisma.policy.create({
        data: {
          version: '1.0-demo',
          config: JSON.stringify(DEFAULT_POLICY),
          isActive: true,
        },
      });

      return NextResponse.json({
        success: true,
        message: 'Policy reset to defaults.',
        version: newPolicy.version,
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Policy POST error:', error);
    return NextResponse.json(
      { error: 'Failed to process policy action', details: String(error) },
      { status: 500 }
    );
  }
}
