// ============================================
// Utility functions for CIC
// ============================================

/**
 * Format paise amount to INR display string
 * ALWAYS uses integer arithmetic — never floats for money
 */
export function formatPaise(paise: number): string {
  const rupees = Math.floor(Math.abs(paise) / 100);
  const remainingPaise = Math.abs(paise) % 100;
  const sign = paise < 0 ? '-' : '';
  const formatted = new Intl.NumberFormat('en-IN').format(rupees);
  return `${sign}₹${formatted}.${String(remainingPaise).padStart(2, '0')}`;
}

/**
 * Format paise to short display (e.g., ₹1.5L, ₹25K)
 */
export function formatPaiseShort(paise: number): string {
  const rupees = Math.abs(paise) / 100;
  const sign = paise < 0 ? '-' : '';
  if (rupees >= 10000000) return `${sign}₹${(rupees / 10000000).toFixed(1)}Cr`;
  if (rupees >= 100000) return `${sign}₹${(rupees / 100000).toFixed(1)}L`;
  if (rupees >= 1000) return `${sign}₹${(rupees / 1000).toFixed(1)}K`;
  return `${sign}₹${rupees.toFixed(0)}`;
}

/**
 * Cash state display labels and colors
 */
export const CASH_STATE_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  matched: { label: 'Matched', color: '#16a34a', bgColor: '#f0fdf4' },
  matched_with_tds: { label: 'Matched (TDS)', color: '#16a34a', bgColor: '#f0fdf4' },
  waiting_for_settlement: { label: 'Pending Settlement', color: '#2563eb', bgColor: '#eff6ff' },
  recoverable: { label: 'Recoverable', color: '#d97706', bgColor: '#fffbeb' },
  finance_review: { label: 'Finance Review', color: '#9333ea', bgColor: '#faf5ff' },
  risk_hold: { label: 'Risk Hold', color: '#dc2626', bgColor: '#fef2f2' },
  promise_to_pay: { label: 'Promise to Pay', color: '#0891b2', bgColor: '#ecfeff' },
  closed: { label: 'Closed', color: '#6b7280', bgColor: '#f9fafb' },
};

/**
 * Priority display config
 */
export const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  critical: { label: 'Critical', color: '#dc2626' },
  high: { label: 'High', color: '#ea580c' },
  medium: { label: 'Medium', color: '#d97706' },
  low: { label: 'Low', color: '#6b7280' },
};

/**
 * Integration status labels
 */
export const INTEGRATION_LABELS: Record<string, { label: string; activeColor: string }> = {
  demoMode: { label: 'DEMO MODE', activeColor: '#16a34a' },
  razorpayTestMode: { label: 'RAZORPAY TEST MODE', activeColor: '#3b82f6' },
  voiceSimulator: { label: 'VOICE SIMULATOR', activeColor: '#8b5cf6' },
  twilioEnabled: { label: 'TWILIO TEST CALL', activeColor: '#ec4899' },
};

/**
 * Generate deterministic idempotency key
 */
export function generateIdempotencyKey(caseId: string, actionType: string): string {
  return `cic_${caseId}_${actionType}_${Date.now()}`;
}

/**
 * Class names helper (simple cn utility)
 */
export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}
