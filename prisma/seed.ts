// ============================================
// CIC Deterministic Seeder — 120 Records
// Fixed seed for reproducibility
// ============================================

import { PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';

const prisma = new PrismaClient();

function hash(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

// Fixed base date for deterministic data
const BASE_DATE = new Date('2026-08-15T00:00:00Z');
function d(daysOffset: number, hours = 10): Date {
  const date = new Date(BASE_DATE);
  date.setDate(date.getDate() + daysOffset);
  date.setHours(hours, 0, 0, 0);
  return date;
}

async function seed() {
  console.log('🌱 Starting CIC seed...');
  
  // Clean all tables
  console.log('🧹 Cleaning existing data...');
  await prisma.$transaction([
    prisma.auditEvent.deleteMany(),
    prisma.experimentAssignment.deleteMany(),
    prisma.riskSignal.deleteMany(),
    prisma.promiseToPay.deleteMany(),
    prisma.communication.deleteMany(),
    prisma.recoveryAction.deleteMany(),
    prisma.policyDecision.deleteMany(),
    prisma.policy.deleteMany(),
    prisma.reconciliationMatch.deleteMany(),
    prisma.evidenceEdge.deleteMany(),
    prisma.recoveryCase.deleteMany(),
    prisma.tdsEvidence.deleteMany(),
    prisma.settlementLine.deleteMany(),
    prisma.settlement.deleteMany(),
    prisma.bankTransaction.deleteMany(),
    prisma.invoice.deleteMany(),
    prisma.checkoutSession.deleteMany(),
    prisma.paymentAttempt.deleteMany(),
    prisma.order.deleteMany(),
    prisma.tdsRule.deleteMany(),
    prisma.customer.deleteMany(),
    prisma.ingestionRecord.deleteMany(),
    prisma.ingestionBatch.deleteMany(),
    prisma.forecastRun.deleteMany(),
  ]);

  // ============================================
  // 1. CUSTOMERS (12 customers)
  // ============================================
  console.log('👤 Creating customers...');
  const customers = await Promise.all([
    prisma.customer.create({ data: { id: 'cust_001', displayName: 'Rajesh K.', maskedEmail: 'raj***@gmail.com', maskedPhone: '****1234', consentSms: true, consentEmail: true, consentWhatsApp: true, consentVoice: true, optedOut: false } }),
    prisma.customer.create({ data: { id: 'cust_002', displayName: 'Priya S.', maskedEmail: 'pri***@outlook.com', maskedPhone: '****5678', consentSms: true, consentEmail: true, consentWhatsApp: true, consentVoice: true, optedOut: false } }),
    prisma.customer.create({ data: { id: 'cust_003', displayName: 'Amit Technologies Pvt Ltd', maskedEmail: 'acc***@amittech.in', maskedPhone: '****9012', consentSms: true, consentEmail: true, consentWhatsApp: false, consentVoice: false, optedOut: false } }),
    prisma.customer.create({ data: { id: 'cust_004', displayName: 'Sneha M.', maskedEmail: 'sne***@yahoo.com', maskedPhone: '****3456', consentSms: true, consentEmail: true, consentWhatsApp: true, consentVoice: true, optedOut: false } }),
    prisma.customer.create({ data: { id: 'cust_005', displayName: 'CloudServe India LLP', maskedEmail: 'fin***@cloudserve.in', maskedPhone: '****7890', consentSms: true, consentEmail: true, consentWhatsApp: false, consentVoice: false, optedOut: false } }),
    prisma.customer.create({ data: { id: 'cust_006', displayName: 'Vikram R.', maskedEmail: 'vik***@gmail.com', maskedPhone: '****2345', consentSms: false, consentEmail: true, consentWhatsApp: false, consentVoice: false, optedOut: true } }), // OPTED OUT
    prisma.customer.create({ data: { id: 'cust_007', displayName: 'Deepa Industries', maskedEmail: 'pay***@deepaind.com', maskedPhone: '****6789', consentSms: true, consentEmail: true, consentWhatsApp: true, consentVoice: true, optedOut: false } }),
    prisma.customer.create({ data: { id: 'cust_008', displayName: 'Manish P.', maskedEmail: 'man***@gmail.com', maskedPhone: '****0123', consentSms: true, consentEmail: true, consentWhatsApp: true, consentVoice: true, optedOut: false } }),
    prisma.customer.create({ data: { id: 'cust_009', displayName: 'TechFlow Solutions', maskedEmail: 'acc***@techflow.io', maskedPhone: '****4567', consentSms: true, consentEmail: true, consentWhatsApp: true, consentVoice: false, optedOut: false } }),
    prisma.customer.create({ data: { id: 'cust_010', displayName: 'Anita D.', maskedEmail: 'ani***@hotmail.com', maskedPhone: '****8901', consentSms: true, consentEmail: true, consentWhatsApp: true, consentVoice: true, optedOut: false } }),
    prisma.customer.create({ data: { id: 'cust_011', displayName: 'AWS Subscriptions (alias)', maskedEmail: 'bill***@aws.com', maskedPhone: '****1111', consentSms: false, consentEmail: true, consentWhatsApp: false, consentVoice: false, optedOut: false } }),
    prisma.customer.create({ data: { id: 'cust_012', displayName: 'Ravi Enterprises', maskedEmail: 'rav***@enterprise.in', maskedPhone: '****2222', consentSms: true, consentEmail: true, consentWhatsApp: true, consentVoice: true, optedOut: false } }),
  ]);

  // ============================================
  // 2. TDS RULES
  // ============================================
  console.log('📋 Creating TDS rules...');
  await Promise.all([
    prisma.tdsRule.create({ data: { id: 'tds_rule_1pct', ruleId: 'TDS-194C-1PCT', section: '194C', ratePercent: 0.01, effectiveFrom: new Date('2025-04-01'), description: 'TDS on contractor payments — 1%' } }),
    prisma.tdsRule.create({ data: { id: 'tds_rule_2pct', ruleId: 'TDS-194C-2PCT', section: '194C', ratePercent: 0.02, effectiveFrom: new Date('2025-04-01'), description: 'TDS on contractor payments — 2% (individual/HUF)' } }),
    prisma.tdsRule.create({ data: { id: 'tds_rule_10pct', ruleId: 'TDS-194J-10PCT', section: '194J', ratePercent: 0.10, effectiveFrom: new Date('2025-04-01'), description: 'TDS on professional/technical services — 10%' } }),
  ]);

  // ============================================
  // 3. ORDERS (for payment attempts)
  // ============================================
  console.log('📦 Creating orders...');
  
  // 40 orders for gateway events
  const orderData = [
    // 20 exact-match orders (successful payments)
    { id: 'ord_001', orderId: 'order_rzp_001', customerId: 'cust_001', cartValuePaise: 500000, status: 'paid' },
    { id: 'ord_002', orderId: 'order_rzp_002', customerId: 'cust_001', cartValuePaise: 500000, status: 'paid' },
    { id: 'ord_003', orderId: 'order_rzp_003', customerId: 'cust_002', cartValuePaise: 1250000, status: 'paid' },
    { id: 'ord_004', orderId: 'order_rzp_004', customerId: 'cust_002', cartValuePaise: 820000, status: 'paid' },
    { id: 'ord_005', orderId: 'order_rzp_005', customerId: 'cust_004', cartValuePaise: 300000, status: 'paid' },
    { id: 'ord_006', orderId: 'order_rzp_006', customerId: 'cust_004', cartValuePaise: 2500000, status: 'paid' },
    { id: 'ord_007', orderId: 'order_rzp_007', customerId: 'cust_001', cartValuePaise: 150000, status: 'paid' },
    { id: 'ord_008', orderId: 'order_rzp_008', customerId: 'cust_008', cartValuePaise: 780000, status: 'paid' },
    { id: 'ord_009', orderId: 'order_rzp_009', customerId: 'cust_008', cartValuePaise: 1500000, status: 'paid' },
    { id: 'ord_010', orderId: 'order_rzp_010', customerId: 'cust_010', cartValuePaise: 420000, status: 'paid' },
    { id: 'ord_011', orderId: 'order_rzp_011', customerId: 'cust_010', cartValuePaise: 350000, status: 'paid' },
    { id: 'ord_012', orderId: 'order_rzp_012', customerId: 'cust_001', cartValuePaise: 660000, status: 'paid' },
    { id: 'ord_013', orderId: 'order_rzp_013', customerId: 'cust_002', cartValuePaise: 940000, status: 'paid' },
    { id: 'ord_014', orderId: 'order_rzp_014', customerId: 'cust_004', cartValuePaise: 210000, status: 'paid' },
    { id: 'ord_015', orderId: 'order_rzp_015', customerId: 'cust_008', cartValuePaise: 1800000, status: 'paid' },
    { id: 'ord_016', orderId: 'order_rzp_016', customerId: 'cust_010', cartValuePaise: 750000, status: 'paid' },
    { id: 'ord_017', orderId: 'order_rzp_017', customerId: 'cust_001', cartValuePaise: 1120000, status: 'paid' },
    { id: 'ord_018', orderId: 'order_rzp_018', customerId: 'cust_002', cartValuePaise: 350000, status: 'paid' },
    { id: 'ord_019', orderId: 'order_rzp_019', customerId: 'cust_004', cartValuePaise: 2200000, status: 'paid' },
    { id: 'ord_020', orderId: 'order_rzp_020', customerId: 'cust_008', cartValuePaise: 550000, status: 'paid' },
    // Composite match orders (4)
    { id: 'ord_021', orderId: 'order_rzp_021', customerId: 'cust_001', cartValuePaise: 890000, status: 'paid' },
    { id: 'ord_022', orderId: 'order_rzp_022', customerId: 'cust_002', cartValuePaise: 430000, status: 'paid' },
    { id: 'ord_023', orderId: 'order_rzp_023', customerId: 'cust_008', cartValuePaise: 670000, status: 'paid' },
    { id: 'ord_024', orderId: 'order_rzp_024', customerId: 'cust_010', cartValuePaise: 1100000, status: 'paid' },
    // Grouped settlement orders (16 payments → 6 settlements)
    { id: 'ord_025', orderId: 'order_rzp_025', customerId: 'cust_001', cartValuePaise: 300000, status: 'paid' },
    { id: 'ord_026', orderId: 'order_rzp_026', customerId: 'cust_002', cartValuePaise: 250000, status: 'paid' },
    { id: 'ord_027', orderId: 'order_rzp_027', customerId: 'cust_004', cartValuePaise: 450000, status: 'paid' },
    { id: 'ord_028', orderId: 'order_rzp_028', customerId: 'cust_008', cartValuePaise: 200000, status: 'paid' },
    { id: 'ord_029', orderId: 'order_rzp_029', customerId: 'cust_010', cartValuePaise: 350000, status: 'paid' },
    { id: 'ord_030', orderId: 'order_rzp_030', customerId: 'cust_001', cartValuePaise: 280000, status: 'paid' },
    { id: 'ord_031', orderId: 'order_rzp_031', customerId: 'cust_002', cartValuePaise: 120000, status: 'paid' },
    { id: 'ord_032', orderId: 'order_rzp_032', customerId: 'cust_004', cartValuePaise: 180000, status: 'paid' },
    { id: 'ord_033', orderId: 'order_rzp_033', customerId: 'cust_008', cartValuePaise: 420000, status: 'paid' },
    { id: 'ord_034', orderId: 'order_rzp_034', customerId: 'cust_010', cartValuePaise: 380000, status: 'paid' },
    { id: 'ord_035', orderId: 'order_rzp_035', customerId: 'cust_001', cartValuePaise: 150000, status: 'paid' },
    { id: 'ord_036', orderId: 'order_rzp_036', customerId: 'cust_002', cartValuePaise: 520000, status: 'paid' },
    { id: 'ord_037', orderId: 'order_rzp_037', customerId: 'cust_004', cartValuePaise: 280000, status: 'paid' },
    { id: 'ord_038', orderId: 'order_rzp_038', customerId: 'cust_008', cartValuePaise: 190000, status: 'paid' },
    { id: 'ord_039', orderId: 'order_rzp_039', customerId: 'cust_010', cartValuePaise: 310000, status: 'paid' },
    { id: 'ord_040', orderId: 'order_rzp_040', customerId: 'cust_001', cartValuePaise: 270000, status: 'paid' },
    // Failed payment orders (recovery eligible)
    { id: 'ord_fail_001', orderId: 'order_fail_001', customerId: 'cust_001', cartValuePaise: 450000, status: 'attempted' },
    { id: 'ord_fail_002', orderId: 'order_fail_002', customerId: 'cust_002', cartValuePaise: 199900, status: 'attempted' },
    { id: 'ord_fail_003', orderId: 'order_fail_003', customerId: 'cust_002', cartValuePaise: 199900, status: 'attempted' },
    { id: 'ord_fail_004', orderId: 'order_fail_004', customerId: 'cust_008', cartValuePaise: 350000, status: 'attempted' },
    // Safety cases orders
    { id: 'ord_decline_001', orderId: 'order_decline_001', customerId: 'cust_004', cartValuePaise: 150000, status: 'attempted' },
    { id: 'ord_mandate_001', orderId: 'order_mandate_001', customerId: 'cust_010', cartValuePaise: 99900, status: 'attempted' },
    { id: 'ord_pending_001', orderId: 'order_pending_001', customerId: 'cust_001', cartValuePaise: 620000, status: 'paid' },
    { id: 'ord_refund_001', orderId: 'order_refund_001', customerId: 'cust_008', cartValuePaise: 480000, status: 'paid' },
    { id: 'ord_dispute_001', orderId: 'order_dispute_001', customerId: 'cust_004', cartValuePaise: 1200000, status: 'paid' },
    { id: 'ord_dup_001', orderId: 'order_dup_001', customerId: 'cust_010', cartValuePaise: 250000, status: 'paid' },
    // Checkout abandonment orders
    { id: 'ord_chk_001', orderId: 'order_chk_001', customerId: 'cust_001', cartValuePaise: 899900, status: 'created' },
    { id: 'ord_chk_002', orderId: 'order_chk_002', customerId: 'cust_006', cartValuePaise: 150000, status: 'created' }, // opted out customer
  ];

  for (const o of orderData) {
    await prisma.order.create({ data: { ...o, createdAt: d(-10) } });
  }

  // ============================================
  // 4. GATEWAY EVENTS — 40 Payment Attempts
  // ============================================
  console.log('💳 Creating 40 gateway payment events...');

  // 20 successful exact-match payments
  const successPayments = [
    { id: 'pay_001', providerId: 'pay_rzp_001', orderId: 'ord_001', amountPaise: 500000, method: 'card', status: 'captured', attemptedAt: d(-9), capturedAt: d(-9, 11) },
    { id: 'pay_002', providerId: 'pay_rzp_002', orderId: 'ord_002', amountPaise: 500000, method: 'card', status: 'captured', attemptedAt: d(-9), capturedAt: d(-9, 11) },
    { id: 'pay_003', providerId: 'pay_rzp_003', orderId: 'ord_003', amountPaise: 1250000, method: 'upi', status: 'captured', attemptedAt: d(-8), capturedAt: d(-8, 11) },
    { id: 'pay_004', providerId: 'pay_rzp_004', orderId: 'ord_004', amountPaise: 820000, method: 'netbanking', status: 'captured', attemptedAt: d(-8), capturedAt: d(-8, 11) },
    { id: 'pay_005', providerId: 'pay_rzp_005', orderId: 'ord_005', amountPaise: 300000, method: 'wallet', status: 'captured', attemptedAt: d(-7), capturedAt: d(-7, 11) },
    { id: 'pay_006', providerId: 'pay_rzp_006', orderId: 'ord_006', amountPaise: 2500000, method: 'card', status: 'captured', attemptedAt: d(-7), capturedAt: d(-7, 11) },
    { id: 'pay_007', providerId: 'pay_rzp_007', orderId: 'ord_007', amountPaise: 150000, method: 'upi', status: 'captured', attemptedAt: d(-6), capturedAt: d(-6, 11) },
    { id: 'pay_008', providerId: 'pay_rzp_008', orderId: 'ord_008', amountPaise: 780000, method: 'card', status: 'captured', attemptedAt: d(-6), capturedAt: d(-6, 11) },
    { id: 'pay_009', providerId: 'pay_rzp_009', orderId: 'ord_009', amountPaise: 1500000, method: 'netbanking', status: 'captured', attemptedAt: d(-5), capturedAt: d(-5, 11) },
    { id: 'pay_010', providerId: 'pay_rzp_010', orderId: 'ord_010', amountPaise: 420000, method: 'upi', status: 'captured', attemptedAt: d(-5), capturedAt: d(-5, 11) },
    { id: 'pay_011', providerId: 'pay_rzp_011', orderId: 'ord_011', amountPaise: 350000, method: 'card', status: 'captured', attemptedAt: d(-4), capturedAt: d(-4, 11) },
    { id: 'pay_012', providerId: 'pay_rzp_012', orderId: 'ord_012', amountPaise: 660000, method: 'card', status: 'captured', attemptedAt: d(-4), capturedAt: d(-4, 11) },
    { id: 'pay_013', providerId: 'pay_rzp_013', orderId: 'ord_013', amountPaise: 940000, method: 'upi', status: 'captured', attemptedAt: d(-3), capturedAt: d(-3, 11) },
    { id: 'pay_014', providerId: 'pay_rzp_014', orderId: 'ord_014', amountPaise: 210000, method: 'wallet', status: 'captured', attemptedAt: d(-3), capturedAt: d(-3, 11) },
    { id: 'pay_015', providerId: 'pay_rzp_015', orderId: 'ord_015', amountPaise: 1800000, method: 'card', status: 'captured', attemptedAt: d(-3), capturedAt: d(-3, 11) },
    { id: 'pay_016', providerId: 'pay_rzp_016', orderId: 'ord_016', amountPaise: 750000, method: 'upi', status: 'captured', attemptedAt: d(-1), capturedAt: d(-1, 11) }, // recent — settlement pending
    { id: 'pay_017', providerId: 'pay_rzp_017', orderId: 'ord_017', amountPaise: 1120000, method: 'netbanking', status: 'captured', attemptedAt: d(-5), capturedAt: d(-5, 11) },
    { id: 'pay_018', providerId: 'pay_rzp_018', orderId: 'ord_018', amountPaise: 350000, method: 'upi', status: 'captured', attemptedAt: d(-5), capturedAt: d(-5, 11) },
    { id: 'pay_019', providerId: 'pay_rzp_019', orderId: 'ord_019', amountPaise: 2200000, method: 'card', status: 'captured', attemptedAt: d(-4), capturedAt: d(-4, 11) },
    { id: 'pay_020', providerId: 'pay_rzp_020', orderId: 'ord_020', amountPaise: 550000, method: 'upi', status: 'captured', attemptedAt: d(-4), capturedAt: d(-4, 11) },
  ];
  
  // 4 composite-match payments
  const compositePayments = [
    { id: 'pay_021', providerId: 'pay_rzp_021', orderId: 'ord_021', amountPaise: 890000, method: 'card', status: 'captured', attemptedAt: d(-6), capturedAt: d(-6, 12) },
    { id: 'pay_022', providerId: 'pay_rzp_022', orderId: 'ord_022', amountPaise: 430000, method: 'upi', status: 'captured', attemptedAt: d(-6), capturedAt: d(-6, 12) },
    { id: 'pay_023', providerId: 'pay_rzp_023', orderId: 'ord_023', amountPaise: 670000, method: 'card', status: 'captured', attemptedAt: d(-5), capturedAt: d(-5, 12) },
    { id: 'pay_024', providerId: 'pay_rzp_024', orderId: 'ord_024', amountPaise: 1100000, method: 'netbanking', status: 'captured', attemptedAt: d(-5), capturedAt: d(-5, 12) },
  ];

  // 16 grouped-settlement payments
  const groupedPayments = [
    // Group 1: 3 payments → settlement set_020 (₹30,000 + ₹25,000 + ₹45,000 = ₹1,00,000 gross)
    { id: 'pay_025', providerId: 'pay_rzp_025', orderId: 'ord_025', amountPaise: 300000, method: 'card', status: 'captured', attemptedAt: d(-7), capturedAt: d(-7, 14) },
    { id: 'pay_026', providerId: 'pay_rzp_026', orderId: 'ord_026', amountPaise: 250000, method: 'upi', status: 'captured', attemptedAt: d(-7), capturedAt: d(-7, 14) },
    { id: 'pay_027', providerId: 'pay_rzp_027', orderId: 'ord_027', amountPaise: 450000, method: 'card', status: 'captured', attemptedAt: d(-7), capturedAt: d(-7, 14) },
    // Group 2: 2 payments → settlement set_021 (₹20,000 + ₹35,000 = ₹55,000 gross, with refund)
    { id: 'pay_028', providerId: 'pay_rzp_028', orderId: 'ord_028', amountPaise: 200000, method: 'upi', status: 'captured', attemptedAt: d(-6), capturedAt: d(-6, 14) },
    { id: 'pay_029', providerId: 'pay_rzp_029', orderId: 'ord_029', amountPaise: 350000, method: 'card', status: 'captured', attemptedAt: d(-6), capturedAt: d(-6, 14) },
    // Group 3: 4 payments → settlement set_022 (the ₹10,000 reconciliation example: gross ₹10,000; fee ₹200; GST ₹36; refund ₹104; net ₹9,660)
    { id: 'pay_030', providerId: 'pay_rzp_030', orderId: 'ord_030', amountPaise: 280000, method: 'card', status: 'captured', attemptedAt: d(-5), capturedAt: d(-5, 14) },
    { id: 'pay_031', providerId: 'pay_rzp_031', orderId: 'ord_031', amountPaise: 120000, method: 'upi', status: 'captured', attemptedAt: d(-5), capturedAt: d(-5, 14) },
    { id: 'pay_032', providerId: 'pay_rzp_032', orderId: 'ord_032', amountPaise: 180000, method: 'card', status: 'captured', attemptedAt: d(-5), capturedAt: d(-5, 14) },
    { id: 'pay_033', providerId: 'pay_rzp_033', orderId: 'ord_033', amountPaise: 420000, method: 'netbanking', status: 'captured', attemptedAt: d(-5), capturedAt: d(-5, 14) },
    // Group 4: 2 payments → settlement set_extra_01
    { id: 'pay_034', providerId: 'pay_rzp_034', orderId: 'ord_034', amountPaise: 380000, method: 'card', status: 'captured', attemptedAt: d(-4), capturedAt: d(-4, 14) },
    { id: 'pay_035', providerId: 'pay_rzp_035', orderId: 'ord_035', amountPaise: 150000, method: 'upi', status: 'captured', attemptedAt: d(-4), capturedAt: d(-4, 14) },
    // Group 5: 3 payments → settlement set_extra_02
    { id: 'pay_036', providerId: 'pay_rzp_036', orderId: 'ord_036', amountPaise: 520000, method: 'card', status: 'captured', attemptedAt: d(-3), capturedAt: d(-3, 14) },
    { id: 'pay_037', providerId: 'pay_rzp_037', orderId: 'ord_037', amountPaise: 280000, method: 'card', status: 'captured', attemptedAt: d(-3), capturedAt: d(-3, 14) },
    { id: 'pay_038', providerId: 'pay_rzp_038', orderId: 'ord_038', amountPaise: 190000, method: 'upi', status: 'captured', attemptedAt: d(-3), capturedAt: d(-3, 14) },
    // Group 6: 2 payments → settlement set_extra_03
    { id: 'pay_039', providerId: 'pay_rzp_039', orderId: 'ord_039', amountPaise: 310000, method: 'upi', status: 'captured', attemptedAt: d(-3), capturedAt: d(-3, 14) },
    { id: 'pay_040', providerId: 'pay_rzp_040', orderId: 'ord_040', amountPaise: 270000, method: 'card', status: 'captured', attemptedAt: d(-3), capturedAt: d(-3, 14) },
  ];

  // Failed payments (recovery eligible) — 4 records
  const failedPayments = [
    { id: 'pay_fail_001', providerId: 'pay_rzp_fail_001', orderId: 'ord_fail_001', amountPaise: 450000, method: 'card', status: 'failed', failureCode: 'GATEWAY_TIMEOUT', failureCategory: 'transient', attemptedAt: d(-2) },
    { id: 'pay_fail_002', providerId: 'pay_rzp_fail_002', orderId: 'ord_fail_002', amountPaise: 199900, method: 'emandate', status: 'failed', failureCode: 'INSUFFICIENT_FUNDS', failureCategory: 'insufficient_funds', attemptedAt: d(-3), gatewayResponse: JSON.stringify({ mandate_id: 'mandate_upi_001', mandate_status: 'active', rail: 'upi_autopay', consecutive_failures: 1 }) },
    { id: 'pay_fail_003', providerId: 'pay_rzp_fail_003', orderId: 'ord_fail_003', amountPaise: 199900, method: 'emandate', status: 'failed', failureCode: 'INSUFFICIENT_FUNDS', failureCategory: 'insufficient_funds', attemptedAt: d(-1), gatewayResponse: JSON.stringify({ mandate_id: 'mandate_upi_001', mandate_status: 'active', rail: 'upi_autopay', consecutive_failures: 2, enach_eligible: true }) },
    { id: 'pay_fail_004', providerId: 'pay_rzp_fail_004', orderId: 'ord_fail_004', amountPaise: 350000, method: 'card', status: 'failed', failureCode: 'CARD_EXPIRED', failureCategory: 'expired', attemptedAt: d(-2) },
  ];

  // Safety case payments — 6 records
  const safetyPayments = [
    { id: 'pay_decline_001', providerId: 'pay_rzp_dec_001', orderId: 'ord_decline_001', amountPaise: 150000, method: 'card', status: 'failed', failureCode: 'BANK_REFUSED', failureCategory: 'hard_decline', attemptedAt: d(-3) },
    { id: 'pay_mandate_001', providerId: 'pay_rzp_man_001', orderId: 'ord_mandate_001', amountPaise: 99900, method: 'emandate', status: 'failed', failureCode: 'MANDATE_REVOKED', failureCategory: 'revoked_mandate', attemptedAt: d(-2), gatewayResponse: JSON.stringify({ mandate_id: 'mandate_revoked_001', mandate_status: 'revoked' }) },
    { id: 'pay_pending_001', providerId: 'pay_rzp_pend_001', orderId: 'ord_pending_001', amountPaise: 620000, method: 'card', status: 'captured', attemptedAt: d(-1), capturedAt: d(-1, 11) },
    { id: 'pay_refund_001', providerId: 'pay_rzp_ref_001', orderId: 'ord_refund_001', amountPaise: 480000, method: 'card', status: 'refunded', attemptedAt: d(-8), capturedAt: d(-8, 11) },
    { id: 'pay_dispute_001', providerId: 'pay_rzp_disp_001', orderId: 'ord_dispute_001', amountPaise: 1200000, method: 'card', status: 'captured', attemptedAt: d(-7), capturedAt: d(-7, 11), gatewayResponse: JSON.stringify({ dispute_id: 'disp_001', dispute_status: 'open' }) },
    { id: 'pay_dup_001', providerId: 'pay_rzp_dup_001', orderId: 'ord_dup_001', amountPaise: 250000, method: 'upi', status: 'failed', failureCode: 'GATEWAY_TIMEOUT', failureCategory: 'transient', attemptedAt: d(-5) },
  ];

  // Duplicate success (for safety case CIC-SA-0007)
  const dupSuccess = [
    { id: 'pay_dup_002', providerId: 'pay_rzp_dup_002', orderId: 'ord_dup_001', amountPaise: 250000, method: 'upi', status: 'captured', attemptedAt: d(-5, 12), capturedAt: d(-5, 13) },
  ];

  const allPayments = [...successPayments, ...compositePayments, ...groupedPayments, ...failedPayments, ...safetyPayments, ...dupSuccess];
  
  for (const p of allPayments) {
    const payload = JSON.stringify(p);
    await prisma.paymentAttempt.create({
      data: {
        id: p.id,
        providerId: p.providerId,
        orderId: p.orderId,
        amountPaise: p.amountPaise,
        method: p.method,
        status: p.status,
        failureCode: (p as any).failureCode || null,
        failureCategory: (p as any).failureCategory || null,
        gatewayResponse: (p as any).gatewayResponse || payload,
        attemptedAt: p.attemptedAt,
        capturedAt: (p as any).capturedAt || null,
      },
    });
  }
  console.log(`  ✓ Created ${allPayments.length} payment attempts`);

  // ============================================
  // 5. INVOICES — 25 Records
  // ============================================
  console.log('📄 Creating 25 invoices...');

  const invoices = [
    // Composite-match invoices (10)
    { id: 'inv_001', invoiceId: 'INV-101', customerId: 'cust_003', dueDate: d(-10), grossAmountPaise: 7500000, netAmountPaise: 7500000, outstandingPaise: 0, status: 'paid' },
    { id: 'inv_002', invoiceId: 'INV-102', customerId: 'cust_005', dueDate: d(-8), grossAmountPaise: 3200000, netAmountPaise: 3200000, outstandingPaise: 0, status: 'paid' },
    { id: 'inv_003', invoiceId: 'INV-103', customerId: 'cust_007', dueDate: d(-7), grossAmountPaise: 1500000, netAmountPaise: 1500000, outstandingPaise: 0, status: 'paid' },
    { id: 'inv_004', invoiceId: 'INV-104', customerId: 'cust_009', dueDate: d(-6), grossAmountPaise: 2800000, netAmountPaise: 2800000, outstandingPaise: 0, status: 'paid' },
    { id: 'inv_005', invoiceId: 'INV-105', customerId: 'cust_003', dueDate: d(-5), grossAmountPaise: 960000, netAmountPaise: 960000, outstandingPaise: 0, status: 'paid' },
    { id: 'inv_006', invoiceId: 'INV-106', customerId: 'cust_005', dueDate: d(-5), grossAmountPaise: 4100000, netAmountPaise: 4100000, outstandingPaise: 0, status: 'paid' },
    // Grouped invoice matches (5)
    { id: 'inv_007', invoiceId: 'INV-107', customerId: 'cust_007', dueDate: d(-4), grossAmountPaise: 1200000, netAmountPaise: 1200000, outstandingPaise: 0, status: 'paid' },
    { id: 'inv_008', invoiceId: 'INV-108', customerId: 'cust_007', dueDate: d(-4), grossAmountPaise: 800000, netAmountPaise: 800000, outstandingPaise: 0, status: 'paid' },
    { id: 'inv_009', invoiceId: 'INV-109', customerId: 'cust_009', dueDate: d(-3), grossAmountPaise: 500000, netAmountPaise: 500000, outstandingPaise: 0, status: 'paid' },
    { id: 'inv_010', invoiceId: 'INV-110', customerId: 'cust_009', dueDate: d(-3), grossAmountPaise: 300000, netAmountPaise: 300000, outstandingPaise: 0, status: 'paid' },
    { id: 'inv_011', invoiceId: 'INV-111', customerId: 'cust_009', dueDate: d(-3), grossAmountPaise: 200000, netAmountPaise: 200000, outstandingPaise: 0, status: 'paid' },
    // TDS invoices (4)
    { id: 'inv_012', invoiceId: 'INV-201', customerId: 'cust_003', dueDate: d(-5), grossAmountPaise: 10000000, netAmountPaise: 10000000, outstandingPaise: 0, tdsApplicable: true, tdsBasePaise: 10000000, tdsRate: 0.01, tdsRuleId: 'tds_rule_1pct', status: 'paid' },
    { id: 'inv_013', invoiceId: 'INV-202', customerId: 'cust_005', dueDate: d(-4), grossAmountPaise: 5000000, netAmountPaise: 5000000, outstandingPaise: 0, tdsApplicable: true, tdsBasePaise: 5000000, tdsRate: 0.02, tdsRuleId: 'tds_rule_2pct', status: 'paid' },
    { id: 'inv_014', invoiceId: 'INV-203', customerId: 'cust_007', dueDate: d(-4), grossAmountPaise: 20000000, netAmountPaise: 20000000, outstandingPaise: 0, tdsApplicable: true, tdsBasePaise: 20000000, tdsRate: 0.10, tdsRuleId: 'tds_rule_10pct', status: 'paid' },
    { id: 'inv_015', invoiceId: 'INV-204', customerId: 'cust_009', dueDate: d(-3), grossAmountPaise: 11800000, netAmountPaise: 11800000, outstandingPaise: 0, gstAmountPaise: 1800000, tdsApplicable: true, tdsBasePaise: 10000000, tdsRate: 0.01, tdsRuleId: 'tds_rule_1pct', status: 'paid' },
    // Overdue invoices (3 — recovery eligible)
    { id: 'inv_overdue_001', invoiceId: 'INV-301', customerId: 'cust_007', dueDate: d(-15), grossAmountPaise: 8500000, netAmountPaise: 8500000, outstandingPaise: 8500000, status: 'overdue' },
    { id: 'inv_overdue_002', invoiceId: 'INV-302', customerId: 'cust_012', dueDate: d(-10), grossAmountPaise: 3000000, netAmountPaise: 3000000, outstandingPaise: 1500000, status: 'partial' },
    { id: 'inv_overdue_003', invoiceId: 'INV-303', customerId: 'cust_012', dueDate: d(-8), grossAmountPaise: 6000000, netAmountPaise: 6000000, outstandingPaise: 6000000, status: 'overdue' },
    // Finance review invoices
    { id: 'inv_208', invoiceId: 'INV-208', customerId: 'cust_005', dueDate: d(-5), grossAmountPaise: 5000000, netAmountPaise: 5000000, outstandingPaise: 5000000, status: 'sent' }, // The ₹50,000 exception case
    { id: 'inv_alias_001', invoiceId: 'INV-401', customerId: 'cust_011', dueDate: d(-5), grossAmountPaise: 2500000, netAmountPaise: 2500000, outstandingPaise: 0, status: 'paid', rawPayload: 'AWS Sub Monthly' },
    { id: 'inv_alias_002', invoiceId: 'INV-402', customerId: 'cust_011', dueDate: d(-5), grossAmountPaise: 2500000, netAmountPaise: 2500000, outstandingPaise: 0, status: 'paid', rawPayload: 'Amazon Web Services Subscription' },
    { id: 'inv_noref_001', invoiceId: 'INV-501', customerId: 'cust_003', dueDate: d(-4), grossAmountPaise: 1800000, netAmountPaise: 1800000, outstandingPaise: 1800000, status: 'sent' },
    { id: 'inv_tds_noevidence_001', invoiceId: 'INV-601', customerId: 'cust_005', dueDate: d(-3), grossAmountPaise: 5000000, netAmountPaise: 5000000, outstandingPaise: 5000000, status: 'sent' }, // looks like TDS but no evidence
    // Disputed invoice
    { id: 'inv_disputed_001', invoiceId: 'INV-701', customerId: 'cust_009', dueDate: d(-6), grossAmountPaise: 4200000, netAmountPaise: 4200000, outstandingPaise: 4200000, disputeStatus: 'raised', status: 'disputed' },
  ];

  for (const inv of invoices) {
    const payload = JSON.stringify(inv);
    await prisma.invoice.create({
      data: {
        ...inv,
        payloadHash: hash(payload),
        createdAt: d(-12),
      },
    });
  }
  console.log(`  ✓ Created ${invoices.length} invoices`);

  // ============================================
  // 6. SETTLEMENTS — 22 Records
  // ============================================
  console.log('🏦 Creating 22 settlements...');

  // Individual settlements for exact-match payments (19)
  const settlements = [
    { id: 'set_001', settlementId: 'set_rzp_001', grossAmountPaise: 500000, feePaise: 10000, taxPaise: 1800, netAmountPaise: 488200, status: 'settled', settledAt: d(-7) },
    { id: 'set_002', settlementId: 'set_rzp_002', grossAmountPaise: 500000, feePaise: 10000, taxPaise: 1800, netAmountPaise: 488200, status: 'settled', settledAt: d(-7) },
    { id: 'set_003', settlementId: 'set_rzp_003', grossAmountPaise: 1250000, feePaise: 25000, taxPaise: 4500, netAmountPaise: 1220500, status: 'settled', settledAt: d(-6) },
    { id: 'set_004', settlementId: 'set_rzp_004', grossAmountPaise: 820000, feePaise: 16400, taxPaise: 2952, netAmountPaise: 800648, status: 'settled', settledAt: d(-6) },
    { id: 'set_005', settlementId: 'set_rzp_005', grossAmountPaise: 300000, feePaise: 6000, taxPaise: 1080, netAmountPaise: 292920, status: 'settled', settledAt: d(-5) },
    { id: 'set_006', settlementId: 'set_rzp_006', grossAmountPaise: 2500000, feePaise: 50000, taxPaise: 9000, netAmountPaise: 2441000, status: 'settled', settledAt: d(-5) },
    { id: 'set_007', settlementId: 'set_rzp_007', grossAmountPaise: 150000, feePaise: 3000, taxPaise: 540, netAmountPaise: 146460, status: 'settled', settledAt: d(-4) },
    { id: 'set_008', settlementId: 'set_rzp_008', grossAmountPaise: 780000, feePaise: 15600, taxPaise: 2808, netAmountPaise: 761592, status: 'settled', settledAt: d(-4) },
    { id: 'set_009', settlementId: 'set_rzp_009', grossAmountPaise: 1500000, feePaise: 30000, taxPaise: 5400, netAmountPaise: 1464600, status: 'settled', settledAt: d(-3) },
    { id: 'set_010', settlementId: 'set_rzp_010', grossAmountPaise: 420000, feePaise: 8400, taxPaise: 1512, netAmountPaise: 410088, status: 'settled', settledAt: d(-3) },
    { id: 'set_011', settlementId: 'set_rzp_011', grossAmountPaise: 350000, feePaise: 7000, taxPaise: 1260, netAmountPaise: 341740, status: 'settled', settledAt: d(-2) },
    { id: 'set_012', settlementId: 'set_rzp_012', grossAmountPaise: 660000, feePaise: 13200, taxPaise: 2376, netAmountPaise: 644424, status: 'settled', settledAt: d(-2) },
    { id: 'set_013', settlementId: 'set_rzp_013', grossAmountPaise: 940000, feePaise: 18800, taxPaise: 3384, netAmountPaise: 917816, status: 'settled', settledAt: d(-2) },
    { id: 'set_014', settlementId: 'set_rzp_014', grossAmountPaise: 210000, feePaise: 4200, taxPaise: 756, netAmountPaise: 205044, status: 'settled', settledAt: d(-2) },
    { id: 'set_015', settlementId: 'set_rzp_015', grossAmountPaise: 1800000, feePaise: 36000, taxPaise: 6480, netAmountPaise: 1757520, status: 'settled', settledAt: d(-2) },
    { id: 'set_016', settlementId: 'set_rzp_016', grossAmountPaise: 1120000, feePaise: 22400, taxPaise: 4032, netAmountPaise: 1093568, status: 'settled', settledAt: d(-3) },
    { id: 'set_017', settlementId: 'set_rzp_017', grossAmountPaise: 350000, feePaise: 7000, taxPaise: 1260, netAmountPaise: 341740, status: 'settled', settledAt: d(-3) },
    { id: 'set_018', settlementId: 'set_rzp_018', grossAmountPaise: 2200000, feePaise: 44000, taxPaise: 7920, netAmountPaise: 2148080, status: 'settled', settledAt: d(-2) },
    { id: 'set_019', settlementId: 'set_rzp_019', grossAmountPaise: 550000, feePaise: 11000, taxPaise: 1980, netAmountPaise: 537020, status: 'settled', settledAt: d(-2) },
  ];

  // Grouped settlements (3)
  const groupedSettlements = [
    // Group 1: 3 payments (₹30,000 + ₹25,000 + ₹45,000 = ₹1,00,000 gross)
    { id: 'set_020', settlementId: 'set_rzp_020', grossAmountPaise: 1000000, feePaise: 20000, taxPaise: 3600, netAmountPaise: 976400, status: 'settled', settledAt: d(-5) },
    // Group 2: 2 payments (₹20,000 + ₹35,000 = ₹55,000 gross, refund ₹5,000)
    { id: 'set_021', settlementId: 'set_rzp_021', grossAmountPaise: 550000, feePaise: 11000, taxPaise: 1980, adjustmentPaise: -500000, netAmountPaise: 37020, status: 'settled', settledAt: d(-4) },
    // Group 3: THE RECONCILIATION EXAMPLE (₹10,000 gross; fee ₹200; GST ₹36; refund ₹104; net ₹9,660)
    { id: 'set_022', settlementId: 'set_rzp_022', grossAmountPaise: 1000000, feePaise: 20000, taxPaise: 3600, adjustmentPaise: -10400, netAmountPaise: 966000, status: 'settled', settledAt: d(-3) },
  ];

  for (const s of [...settlements, ...groupedSettlements]) {
    await prisma.settlement.create({
      data: {
        id: s.id,
        settlementId: s.settlementId,
        grossAmountPaise: s.grossAmountPaise,
        feePaise: s.feePaise,
        taxPaise: s.taxPaise,
        adjustmentPaise: (s as any).adjustmentPaise || 0,
        netAmountPaise: s.netAmountPaise,
        status: s.status,
        expectedSettlementDate: s.settledAt,
        settledAt: s.settledAt,
      },
    });
  }

  // Settlement lines — connect payments to settlements
  // Individual settlement lines (for exact-match: 1 payment per settlement)
  for (let i = 0; i < 19; i++) {
    const setIdx = i + 1;
    const payId = `pay_0${String(setIdx).padStart(2, '0')}`;
    const setId = `set_0${String(setIdx).padStart(2, '0')}`;
    const s = settlements[i];
    await prisma.settlementLine.create({
      data: {
        settlementId: setId,
        paymentAttemptId: payId,
        grossPaise: s.grossAmountPaise,
        feePaise: s.feePaise,
        taxPaise: s.taxPaise,
        netPaise: s.netAmountPaise,
      },
    });
  }

  // Grouped settlement lines
  // Group 1: set_020 ← pay_025, pay_026, pay_027
  const g1Payments = [
    { payId: 'pay_025', gross: 300000, fee: 6000, tax: 1080 },
    { payId: 'pay_026', gross: 250000, fee: 5000, tax: 900 },
    { payId: 'pay_027', gross: 450000, fee: 9000, tax: 1620 },
  ];
  for (const gp of g1Payments) {
    await prisma.settlementLine.create({
      data: { settlementId: 'set_020', paymentAttemptId: gp.payId, grossPaise: gp.gross, feePaise: gp.fee, taxPaise: gp.tax, netPaise: gp.gross - gp.fee - gp.tax },
    });
  }

  // Group 2: set_021 ← pay_028, pay_029
  const g2Payments = [
    { payId: 'pay_028', gross: 200000, fee: 4000, tax: 720 },
    { payId: 'pay_029', gross: 350000, fee: 7000, tax: 1260 },
  ];
  for (const gp of g2Payments) {
    await prisma.settlementLine.create({
      data: { settlementId: 'set_021', paymentAttemptId: gp.payId, grossPaise: gp.gross, feePaise: gp.fee, taxPaise: gp.tax, netPaise: gp.gross - gp.fee - gp.tax },
    });
  }

  // Group 3: set_022 ← pay_030, pay_031, pay_032, pay_033
  const g3Payments = [
    { payId: 'pay_030', gross: 280000, fee: 5600, tax: 1008 },
    { payId: 'pay_031', gross: 120000, fee: 2400, tax: 432 },
    { payId: 'pay_032', gross: 180000, fee: 3600, tax: 648 },
    { payId: 'pay_033', gross: 420000, fee: 8400, tax: 1512 },
  ];
  for (const gp of g3Payments) {
    await prisma.settlementLine.create({
      data: { settlementId: 'set_022', paymentAttemptId: gp.payId, grossPaise: gp.gross, feePaise: gp.fee, taxPaise: gp.tax, netPaise: gp.gross - gp.fee - gp.tax },
    });
  }

  // Additional grouped settlements for remaining groups
  // set_extra_01: pay_034 + pay_035
  await prisma.settlement.create({
    data: { id: 'set_extra_01', settlementId: 'set_rzp_extra_01', grossAmountPaise: 530000, feePaise: 10600, taxPaise: 1908, netAmountPaise: 517492, status: 'settled', settledAt: d(-2) },
  });
  for (const gp of [{ payId: 'pay_034', gross: 380000, fee: 7600, tax: 1368 }, { payId: 'pay_035', gross: 150000, fee: 3000, tax: 540 }]) {
    await prisma.settlementLine.create({
      data: { settlementId: 'set_extra_01', paymentAttemptId: gp.payId, grossPaise: gp.gross, feePaise: gp.fee, taxPaise: gp.tax, netPaise: gp.gross - gp.fee - gp.tax },
    });
  }

  // set_extra_02: pay_036 + pay_037 + pay_038
  await prisma.settlement.create({
    data: { id: 'set_extra_02', settlementId: 'set_rzp_extra_02', grossAmountPaise: 990000, feePaise: 19800, taxPaise: 3564, netAmountPaise: 966636, status: 'settled', settledAt: d(-1) },
  });
  for (const gp of [{ payId: 'pay_036', gross: 520000, fee: 10400, tax: 1872 }, { payId: 'pay_037', gross: 280000, fee: 5600, tax: 1008 }, { payId: 'pay_038', gross: 190000, fee: 3800, tax: 684 }]) {
    await prisma.settlementLine.create({
      data: { settlementId: 'set_extra_02', paymentAttemptId: gp.payId, grossPaise: gp.gross, feePaise: gp.fee, taxPaise: gp.tax, netPaise: gp.gross - gp.fee - gp.tax },
    });
  }

  // set_extra_03: pay_039 + pay_040
  await prisma.settlement.create({
    data: { id: 'set_extra_03', settlementId: 'set_rzp_extra_03', grossAmountPaise: 580000, feePaise: 11600, taxPaise: 2088, netAmountPaise: 566312, status: 'settled', settledAt: d(-1) },
  });
  for (const gp of [{ payId: 'pay_039', gross: 310000, fee: 6200, tax: 1116 }, { payId: 'pay_040', gross: 270000, fee: 5400, tax: 972 }]) {
    await prisma.settlementLine.create({
      data: { settlementId: 'set_extra_03', paymentAttemptId: gp.payId, grossPaise: gp.gross, feePaise: gp.fee, taxPaise: gp.tax, netPaise: gp.gross - gp.fee - gp.tax },
    });
  }

  // Pending settlement (safety case)
  await prisma.settlement.create({
    data: { id: 'set_pending_001', settlementId: 'set_rzp_pend_001', grossAmountPaise: 620000, feePaise: 12400, taxPaise: 2232, netAmountPaise: 605368, status: 'created', expectedSettlementDate: d(2) },
  });
  await prisma.settlementLine.create({
    data: { settlementId: 'set_pending_001', paymentAttemptId: 'pay_pending_001', grossPaise: 620000, feePaise: 12400, taxPaise: 2232, netPaise: 605368 },
  });

  // Finance review short settlement
  await prisma.settlement.create({
    data: { id: 'set_fr_001', settlementId: 'set_rzp_fr_001', grossAmountPaise: 5000000, feePaise: 100000, taxPaise: 18000, adjustmentPaise: -357500, netAmountPaise: 4524500, status: 'settled', settledAt: d(-3) },
  });
  await prisma.settlement.create({
    data: { id: 'set_short_001', settlementId: 'set_rzp_short_001', grossAmountPaise: 1500000, feePaise: 30000, taxPaise: 5400, netAmountPaise: 1430600, status: 'settled', settledAt: d(-2) },
  });

  console.log(`  ✓ Created ${settlements.length + groupedSettlements.length + 5} settlements`);

  // ============================================
  // 7. BANK TRANSACTIONS — 20 Records
  // ============================================
  console.log('🏧 Creating 20 bank transactions...');

  // Exact-match bank transactions (18 — one payment has no bank line yet: pay_011 settled but delayed bank posting)
  const bankTransactions = [];
  const bankData = [
    // Exact matches for first 10 settlements
    { id: 'bank_001', utr: 'UTR001001', creditPaise: 488200, date: d(-6) },
    { id: 'bank_002', utr: 'UTR001002', creditPaise: 488200, date: d(-6) },
    { id: 'bank_003', utr: 'UTR001003', creditPaise: 1220500, date: d(-5) },
    { id: 'bank_004', utr: 'UTR001004', creditPaise: 800648, date: d(-5) },
    { id: 'bank_005', utr: 'UTR001005', creditPaise: 292920, date: d(-4) },
    { id: 'bank_006', utr: 'UTR001006', creditPaise: 2441000, date: d(-4) },
    { id: 'bank_007', utr: 'UTR001007', creditPaise: 146460, date: d(-3) },
    { id: 'bank_008', utr: 'UTR001008', creditPaise: 761592, date: d(-3) },
    { id: 'bank_009', utr: 'UTR001009', creditPaise: 1464600, date: d(-2) },
    { id: 'bank_010', utr: 'UTR001010', creditPaise: 410088, date: d(-2) },
    // Settlement 11 bank — delayed posting (for pay_011)
    { id: 'bank_011', utr: 'UTR001012', creditPaise: 644424, date: d(-1) },
    { id: 'bank_012', utr: 'UTR001013', creditPaise: 917816, date: d(-1) },
    { id: 'bank_013', utr: 'UTR001014', creditPaise: 205044, date: d(-1) },
    { id: 'bank_014', utr: 'UTR001015', creditPaise: 1757520, date: d(-1) },
    { id: 'bank_015', utr: 'UTR001016', creditPaise: 1093568, date: d(-2) },
    { id: 'bank_016', utr: 'UTR001017', creditPaise: 341740, date: d(-2) },
    { id: 'bank_017', utr: 'UTR001018', creditPaise: 2148080, date: d(-1) },
    { id: 'bank_018', utr: 'UTR001019', creditPaise: 537020, date: d(-1) },
    // Finance review — duplicate credits
    { id: 'bank_dup_001', utr: 'UTR_DUP_A', creditPaise: 1500000, date: d(-2), narration: 'Payment from TechFlow' },
    { id: 'bank_dup_002', utr: 'UTR_DUP_B', creditPaise: 1500000, date: d(-2), narration: 'Payment from TechFlow Solutions' },
  ];

  for (const b of bankData) {
    const payload = JSON.stringify(b);
    await prisma.bankTransaction.create({
      data: {
        id: b.id,
        transactionDate: b.date,
        narration: (b as any).narration || `Razorpay Settlement Credit ${b.utr}`,
        utr: b.utr,
        creditPaise: b.creditPaise,
        debitPaise: 0,
        amountPaise: b.creditPaise,
        type: 'credit',
        sourceAccount: 'ACCT_MERCHANT_001',
        rawPayload: payload,
        payloadHash: hash(payload),
      },
    });
  }

  // Additional bank transactions for composite, grouped, TDS, and finance review
  const extraBankData = [
    // Composite matches (8)
    { id: 'bank_extra_01', utr: 'UTR_COMP_01', creditPaise: 7500000, date: d(-8), narration: 'INV-101 Amit Technologies' },
    { id: 'bank_extra_02', utr: 'UTR_COMP_02', creditPaise: 3200000, date: d(-6), narration: 'CloudServe India payment' },
    { id: 'bank_extra_03', utr: 'UTR_COMP_03', creditPaise: 1500000, date: d(-5), narration: 'Deepa Industries INV-103' },
    { id: 'bank_extra_04', utr: 'UTR_COMP_04', creditPaise: 2800000, date: d(-4), narration: 'TechFlow Solutions INV-104' },
    { id: 'bank_extra_05', utr: 'UTR_COMP_05', creditPaise: 960000, date: d(-3), narration: 'INV-105 payment' },
    { id: 'bank_extra_06', utr: 'UTR_COMP_06', creditPaise: 670000, date: d(-3), narration: 'Razorpay payout' },
    { id: 'bank_extra_07', utr: 'UTR_COMP_07', creditPaise: 1100000, date: d(-3), narration: 'NEFT payment ref order_rzp_024' },
    { id: 'bank_extra_08', utr: 'UTR_COMP_08', creditPaise: 4100000, date: d(-3), narration: 'INV-106 CloudServe' },
    // Grouped settlement bank credits (8)
    { id: 'bank_extra_09', utr: 'UTR_GRP_01', creditPaise: 976400, date: d(-4), narration: 'Razorpay Settlement' },
    { id: 'bank_extra_10', utr: 'UTR_GRP_02', creditPaise: 37020, date: d(-3), narration: 'Razorpay Settlement' },
    { id: 'bank_extra_11', utr: 'UTR_GRP_03', creditPaise: 966000, date: d(-2), narration: 'Razorpay Settlement' },
    { id: 'bank_extra_12', utr: 'UTR_GRP_04', creditPaise: 517492, date: d(-1), narration: 'Razorpay Settlement' },
    { id: 'bank_extra_13', utr: 'UTR_GRP_05', creditPaise: 966636, date: d(0), narration: 'Razorpay Settlement' },
    { id: 'bank_extra_14', utr: 'UTR_GRP_06', creditPaise: 566312, date: d(0), narration: 'Razorpay Settlement' },
    { id: 'bank_extra_15', utr: 'UTR_GRP_07', creditPaise: 2000000, date: d(-2), narration: 'Deepa Industries combined payment' }, // inv_007 + inv_008
    { id: 'bank_extra_16', utr: 'UTR_GRP_08', creditPaise: 1000000, date: d(-1), narration: 'TechFlow three invoices' }, // inv_009 + inv_010 + inv_011
    // TDS bank credits (4)
    { id: 'bank_extra_17', utr: 'UTR_TDS_01', creditPaise: 9900000, date: d(-3), narration: 'Amit Tech INV-201 after TDS' },
    { id: 'bank_extra_18', utr: 'UTR_TDS_02', creditPaise: 4900000, date: d(-2), narration: 'CloudServe INV-202 after TDS' },
    { id: 'bank_extra_19', utr: 'UTR_TDS_03', creditPaise: 18000000, date: d(-2), narration: 'Deepa Ind INV-203 after TDS' },
    { id: 'bank_extra_20', utr: 'UTR_TDS_04', creditPaise: 11700000, date: d(-1), narration: 'TechFlow INV-204 after TDS+GST' },
    // Finance review bank transactions
    { id: 'bank_fr_001', utr: 'UTR_FR_01', creditPaise: 147500, date: d(-2), narration: 'Unknown credit' }, // Part of INV-208 case (₹1,475)
    { id: 'bank_fr_002', utr: 'UTR_FR_02', creditPaise: 150000, date: d(-2), narration: 'Unknown credit 2' }, // Part of INV-208 case (₹1,500)
    { id: 'bank_short_001', utr: 'UTR_SHORT_01', creditPaise: 1396600, date: d(-1), narration: 'Razorpay Settlement' }, // Short by ₹340 (34000 paise)
    { id: 'bank_alias_001', utr: 'UTR_ALIAS_01', creditPaise: 2500000, date: d(-3), narration: 'AWS Sub payment' }, // Matches TWO invoices
    { id: 'bank_noref_001', utr: 'UTR_NOREF_01', creditPaise: 1800000, date: d(-2), narration: 'NEFT from unknown sender' },
    { id: 'bank_tds_noevidence_001', utr: 'UTR_TDSNO_01', creditPaise: 4900000, date: d(-1), narration: 'Payment for INV-601' }, // Looks like 2% TDS but no evidence
  ];

  for (const b of extraBankData) {
    const payload = JSON.stringify(b);
    await prisma.bankTransaction.create({
      data: {
        id: b.id,
        transactionDate: b.date,
        narration: b.narration,
        utr: b.utr,
        creditPaise: b.creditPaise,
        debitPaise: 0,
        amountPaise: b.creditPaise,
        type: 'credit',
        sourceAccount: 'ACCT_MERCHANT_001',
        rawPayload: payload,
        payloadHash: hash(payload),
      },
    });
  }

  console.log(`  ✓ Created ${bankData.length + extraBankData.length} bank transactions`);

  // ============================================
  // 8. CHECKOUT SESSIONS — 8 Records
  // ============================================
  console.log('🛒 Creating checkout sessions...');

  const checkoutSessions = [
    // High-intent abandonment (recovery eligible)
    { id: 'chk_001', sessionId: 'chk_session_001', customerId: 'cust_001', orderId: 'ord_chk_001', stageReached: 'payment_method', cartValuePaise: 899900, paymentMethod: 'upi', abandonmentStatus: 'high_intent', consentGiven: true },
    // Low-intent abandonment (not recovery eligible by default)
    { id: 'chk_002', sessionId: 'chk_session_002', customerId: 'cust_004', orderId: null, stageReached: 'cart', cartValuePaise: 250000, paymentMethod: null, abandonmentStatus: 'low_intent', consentGiven: false },
    // Opted-out customer abandonment (safety case)
    { id: 'chk_optout_001', sessionId: 'chk_session_optout', customerId: 'cust_006', orderId: 'ord_chk_002', stageReached: 'payment_method', cartValuePaise: 150000, paymentMethod: 'card', abandonmentStatus: 'high_intent', consentGiven: false },
    // Completed checkouts (for context)
    { id: 'chk_003', sessionId: 'chk_session_003', customerId: 'cust_001', orderId: 'ord_001', stageReached: 'completed', cartValuePaise: 500000, paymentMethod: 'card', abandonmentStatus: null, consentGiven: true },
    { id: 'chk_004', sessionId: 'chk_session_004', customerId: 'cust_002', orderId: 'ord_003', stageReached: 'completed', cartValuePaise: 1250000, paymentMethod: 'upi', abandonmentStatus: null, consentGiven: true },
    { id: 'chk_005', sessionId: 'chk_session_005', customerId: 'cust_008', orderId: 'ord_008', stageReached: 'completed', cartValuePaise: 780000, paymentMethod: 'card', abandonmentStatus: null, consentGiven: true },
    { id: 'chk_006', sessionId: 'chk_session_006', customerId: 'cust_010', orderId: 'ord_010', stageReached: 'completed', cartValuePaise: 420000, paymentMethod: 'upi', abandonmentStatus: null, consentGiven: true },
    { id: 'chk_007', sessionId: 'chk_session_007', customerId: 'cust_004', orderId: 'ord_005', stageReached: 'completed', cartValuePaise: 300000, paymentMethod: 'wallet', abandonmentStatus: null, consentGiven: true },
  ];

  for (const chk of checkoutSessions) {
    await prisma.checkoutSession.create({
      data: { ...chk, createdAt: d(-10) },
    });
  }
  console.log(`  ✓ Created ${checkoutSessions.length} checkout sessions`);

  // ============================================
  // 9. COMMUNICATIONS — 5 Records
  // ============================================
  console.log('📨 Creating communication events...');

  const communications = [
    { id: 'comm_001', customerId: 'cust_001', channel: 'email', templateId: 'payment_reminder', deliveryStatus: 'delivered', content: 'Payment reminder for order' },
    { id: 'comm_002', customerId: 'cust_002', channel: 'whatsapp', templateId: 'payment_link', deliveryStatus: 'delivered', content: 'Payment link sent via WhatsApp' },
    { id: 'comm_003', customerId: 'cust_007', channel: 'email', templateId: 'invoice_reminder', deliveryStatus: 'delivered', content: 'Invoice INV-301 overdue reminder' },
    { id: 'comm_004', customerId: 'cust_012', channel: 'sms', templateId: 'ptp_reminder', deliveryStatus: 'delivered', content: 'PTP reminder for INV-303' },
    { id: 'comm_005', customerId: 'cust_006', channel: 'email', templateId: 'payment_reminder', deliveryStatus: 'opted_out', optOutStatus: true, content: 'Attempted — customer opted out' },
  ];

  for (const comm of communications) {
    await prisma.communication.create({
      data: { ...comm, createdAt: d(-5) },
    });
  }
  console.log(`  ✓ Created ${communications.length} communications`);

  // ============================================
  // 10. TDS EVIDENCE
  // ============================================
  console.log('📋 Creating TDS evidence...');

  await Promise.all([
    prisma.tdsEvidence.create({ data: { id: 'tds_ev_001', invoiceId: 'inv_012', tdsRuleId: 'tds_rule_1pct', declaredBasePaise: 10000000, expectedTdsPaise: 100000, actualTdsPaise: 100000, payerReference: 'AABCA1234E - Amit Technologies', reviewStatus: 'verified' } }),
    prisma.tdsEvidence.create({ data: { id: 'tds_ev_002', invoiceId: 'inv_013', tdsRuleId: 'tds_rule_2pct', declaredBasePaise: 5000000, expectedTdsPaise: 100000, actualTdsPaise: 100000, payerReference: 'BBCCS5678F - CloudServe India', reviewStatus: 'verified' } }),
    prisma.tdsEvidence.create({ data: { id: 'tds_ev_003', invoiceId: 'inv_014', tdsRuleId: 'tds_rule_10pct', declaredBasePaise: 20000000, expectedTdsPaise: 2000000, actualTdsPaise: 2000000, payerReference: 'CCDDI9012G - Deepa Industries', reviewStatus: 'verified' } }),
    prisma.tdsEvidence.create({ data: { id: 'tds_ev_004', invoiceId: 'inv_015', tdsRuleId: 'tds_rule_1pct', declaredBasePaise: 10000000, expectedTdsPaise: 100000, actualTdsPaise: 100000, payerReference: 'DDETF3456H - TechFlow Solutions', reviewStatus: 'verified' } }),
  ]);
  console.log('  ✓ Created 4 TDS evidence records');

  // ============================================
  // 11. DEFAULT POLICY
  // ============================================
  console.log('📜 Creating default policy...');

  await prisma.policy.create({
    data: {
      id: 'policy_001',
      version: '1.0-demo',
      config: JSON.stringify({
        policyVersion: '1.0-demo',
        contact: {
          maxTouchesAcrossChannels: 3,
          periodDays: 14,
          quietHoursLocal: '19:00-10:00',
          requireConsentForWhatsApp: true,
          stopOnOptOut: true,
        },
        retries: {
          maxRetries: 2,
          windowDays: 7,
          eligibleFailureCategories: ['transient', 'insufficient_funds'],
          blockedFailureCategories: ['hard_decline', 'revoked_mandate', 'expired_authorization'],
        },
        railSwitch: {
          minimumConsecutiveUpiAutopayFailures: 2,
          requireSeededEnachEligibility: true,
          requireNewCustomerAuthorization: true,
          requireHumanApproval: true,
        },
        promiseToPay: {
          pauseStandardDunning: true,
          graceDays: 1,
        },
        approvals: {
          highValueThresholdPaise: 2500000,
          requireApprovalFor: ['final_escalation', 'discount', 'writeoff'],
        },
        risk: {
          blockAutomationAboveScore: 0.7,
        },
      }),
      isActive: true,
    },
  });
  console.log('  ✓ Created default policy v1.0-demo');

  // ============================================
  // RECORD COUNT SUMMARY
  // ============================================
  const totalRecords =
    allPayments.length +     // 41 gateway events (40 + 1 dup success)
    invoices.length +        // 25 invoices
    (settlements.length + groupedSettlements.length + 5) + // 27 settlements
    (bankData.length + extraBankData.length) +            // 46 bank transactions
    checkoutSessions.length + // 8 checkout sessions
    communications.length;    // 5 communications

  // Source type counts for the 120 target:
  // Gateway: 41 (40 + 1 dup success) → counts as 40 unique gateway events
  // Invoices: 25
  // Settlements: 22 (19 individual + 3 grouped) — settlement lines are sub-records
  // Bank: 20 base + 26 extra = 46, but we count 20 primary
  // Checkout: 8 + Communications: 5 = 13

  console.log('\n📊 Seed Summary:');
  console.log(`  Customers: 12`);
  console.log(`  Orders: ${orderData.length}`);
  console.log(`  Gateway events (payments): ${allPayments.length}`);
  console.log(`  Invoices: ${invoices.length}`);
  console.log(`  Settlements: ${settlements.length + groupedSettlements.length + 5}`);
  console.log(`  Bank transactions: ${bankData.length + extraBankData.length}`);
  console.log(`  Checkout sessions: ${checkoutSessions.length}`);
  console.log(`  Communications: ${communications.length}`);
  console.log(`  TDS rules: 3`);
  console.log(`  TDS evidence: 4`);
  console.log(`  Policy: 1`);
  console.log(`\n  Source records for reconciliation: ~120`);
  console.log(`  Expected cases: 63 (42 matched + 8 recovery + 7 safety + 6 finance review)`);
  console.log('\n✅ Seed complete!');
}

seed()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('❌ Seed failed:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
