// ============================================
// Recovery Action Scorer
// 
// Transparent, explainable scoring for each allowed action.
// Formula: expectedNetRecovery = outstandingAmount
//   * predictedSuccessProbability
//   * merchantMarginFactor
//   - communicationCost
//   - customerFrictionCost
//
// This is a DEMO HEURISTIC — not a production ML claim.
// Shows inputs and why the selected action beat alternatives.
// ============================================

export interface ActionScore {
  action: string;
  outstandingAmountPaise: number;
  predictedSuccessProbability: number;
  merchantMarginFactor: number;
  communicationCostPaise: number;
  customerFrictionCostPaise: number;
  expectedNetRecoveryPaise: number;
  rank: number;
  explanation: string;
  inputs: Record<string, string | number>;
}

// Success probability heuristics per action type and diagnosis
const SUCCESS_PROBABILITIES: Record<string, Record<string, number>> = {
  retry_payment: {
    gateway_timeout: 0.72,
    network_error: 0.65,
    insufficient_funds: 0.45,
    card_expired: 0.0, // Card expired, retry won't help
    default: 0.35,
  },
  payment_link: {
    gateway_timeout: 0.55,
    network_error: 0.50,
    insufficient_funds: 0.40,
    card_expired: 0.48,
    checkout_abandonment_high_intent: 0.62,
    invoice_overdue: 0.45,
    invoice_partial_payment: 0.50,
    default: 0.35,
  },
  reminder_sms: {
    invoice_overdue: 0.30,
    invoice_partial_payment: 0.25,
    checkout_abandonment_high_intent: 0.22,
    insufficient_funds: 0.28,
    default: 0.18,
  },
  reminder_email: {
    invoice_overdue: 0.35,
    invoice_partial_payment: 0.30,
    checkout_abandonment_high_intent: 0.28,
    insufficient_funds: 0.22,
    default: 0.15,
  },
  reminder_whatsapp: {
    invoice_overdue: 0.42,
    invoice_partial_payment: 0.38,
    checkout_abandonment_high_intent: 0.45,
    insufficient_funds: 0.32,
    default: 0.25,
  },
  voice_call: {
    invoice_overdue: 0.55,
    invoice_partial_payment: 0.48,
    default: 0.30,
  },
  propose_rail_switch: {
    insufficient_funds: 0.60,
    default: 0.40,
  },
  manual_review: {
    default: 0.20,
  },
  escalation: {
    default: 0.15,
  },
};

// Communication costs in paise (demo values)
const COMMUNICATION_COSTS: Record<string, number> = {
  retry_payment: 0,          // No cost — API call
  payment_link: 50,          // ₹0.50 link creation
  reminder_sms: 25,          // ₹0.25 SMS
  reminder_email: 10,        // ₹0.10 email
  reminder_whatsapp: 75,     // ₹0.75 WhatsApp business API
  voice_call: 300,           // ₹3.00 voice call
  propose_rail_switch: 100,  // ₹1.00 setup
  manual_review: 5000,       // ₹50 ops team cost
  escalation: 10000,         // ₹100 escalation
};

// Customer friction costs in paise (impact on relationship)
const FRICTION_COSTS: Record<string, number> = {
  retry_payment: 0,           // Invisible to customer
  payment_link: 100,          // Minimal — helpful
  reminder_sms: 200,          // Low friction
  reminder_email: 100,        // Low friction
  reminder_whatsapp: 150,     // Low-medium
  voice_call: 500,            // Higher friction
  propose_rail_switch: 300,   // Medium — requires action
  manual_review: 0,           // No customer impact
  escalation: 2000,           // High friction
};

// Merchant margin factor — fraction of revenue retained
const MERCHANT_MARGIN = 0.92; // 92% margin after platform fees

/**
 * Score a single action for a recovery case.
 * Uses integer arithmetic for the final amount.
 */
export function scoreAction(
  action: string,
  diagnosisCode: string,
  outstandingAmountPaise: number
): ActionScore {
  // Get success probability
  const actionProbs = SUCCESS_PROBABILITIES[action] || SUCCESS_PROBABILITIES.manual_review;
  const probability = actionProbs[diagnosisCode] || actionProbs.default || 0.15;

  const commCost = COMMUNICATION_COSTS[action] || 0;
  const frictionCost = FRICTION_COSTS[action] || 0;

  // Calculate: outstanding * probability * margin - costs
  // Use integer math at the end
  const expectedGross = Math.round(outstandingAmountPaise * probability * MERCHANT_MARGIN);
  const expectedNet = Math.max(0, expectedGross - commCost - frictionCost);

  const explanation = [
    `${action}: ₹${(outstandingAmountPaise / 100).toFixed(2)}`,
    `× ${(probability * 100).toFixed(0)}% success probability`,
    `× ${(MERCHANT_MARGIN * 100).toFixed(0)}% margin`,
    `- ₹${(commCost / 100).toFixed(2)} communication cost`,
    `- ₹${(frictionCost / 100).toFixed(2)} friction cost`,
    `= ₹${(expectedNet / 100).toFixed(2)} expected net recovery`,
  ].join(' ');

  return {
    action,
    outstandingAmountPaise,
    predictedSuccessProbability: probability,
    merchantMarginFactor: MERCHANT_MARGIN,
    communicationCostPaise: commCost,
    customerFrictionCostPaise: frictionCost,
    expectedNetRecoveryPaise: expectedNet,
    rank: 0, // Will be set during ranking
    explanation,
    inputs: {
      outstandingAmountPaise,
      diagnosisCode,
      probability: Math.round(probability * 100),
      marginPercent: Math.round(MERCHANT_MARGIN * 100),
      commCostPaise: commCost,
      frictionCostPaise: frictionCost,
    },
  };
}

/**
 * Score and rank ALL allowed actions for a recovery case.
 * Returns sorted by expectedNetRecovery descending.
 * The top-ranked action is the recommended one.
 */
export function scoreAndRankActions(
  allowedActions: string[],
  diagnosisCode: string,
  outstandingAmountPaise: number
): ActionScore[] {
  if (allowedActions.length === 0) return [];

  const scores = allowedActions.map(action =>
    scoreAction(action, diagnosisCode, outstandingAmountPaise)
  );

  // Sort by expected net recovery descending
  scores.sort((a, b) => b.expectedNetRecoveryPaise - a.expectedNetRecoveryPaise);

  // Assign ranks
  scores.forEach((score, index) => {
    score.rank = index + 1;
  });

  return scores;
}

/**
 * Generate a comparison explanation for why the top action was chosen.
 */
export function generateRecommendationExplanation(scores: ActionScore[]): string {
  if (scores.length === 0) return 'No actions available.';
  if (scores.length === 1) return `Only one action available: ${scores[0].action}. ${scores[0].explanation}`;

  const best = scores[0];
  const runner = scores[1];

  const lines = [
    `Recommended: ${best.action} (₹${(best.expectedNetRecoveryPaise / 100).toFixed(2)} expected net recovery)`,
    '',
    `Why ${best.action} over ${runner.action}:`,
    `  ${best.action}: ${(best.predictedSuccessProbability * 100).toFixed(0)}% success × ₹${(best.outstandingAmountPaise / 100).toFixed(2)} = ₹${(best.expectedNetRecoveryPaise / 100).toFixed(2)} net`,
    `  ${runner.action}: ${(runner.predictedSuccessProbability * 100).toFixed(0)}% success × ₹${(runner.outstandingAmountPaise / 100).toFixed(2)} = ₹${(runner.expectedNetRecoveryPaise / 100).toFixed(2)} net`,
    `  Difference: ₹${((best.expectedNetRecoveryPaise - runner.expectedNetRecoveryPaise) / 100).toFixed(2)} higher expected recovery`,
    '',
    'All scored actions:',
    ...scores.map(s => `  #${s.rank} ${s.action}: ₹${(s.expectedNetRecoveryPaise / 100).toFixed(2)} (${(s.predictedSuccessProbability * 100).toFixed(0)}% success, ₹${(s.communicationCostPaise / 100).toFixed(2)} cost, ₹${(s.customerFrictionCostPaise / 100).toFixed(2)} friction)`),
  ];

  return lines.join('\n');
}
