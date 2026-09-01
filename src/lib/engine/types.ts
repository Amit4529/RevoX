// ============================================
// Reconciliation Engine — Core Types
// ============================================

export interface MatchResult {
  matched: boolean;
  ruleTier: 'tier_a' | 'tier_b' | 'tier_c' | 'tier_c5' | 'tier_d' | 'tier_e';
  ruleId: string;
  confidence: number;
  evidenceRefs: string[];
  calculation: string;
  confidenceBasis: string;
  sourceRecordIds: string[];
  targetRecordIds: string[];
  mathExplanation: string;
  status: 'auto_matched' | 'review_required' | 'exception' | 'abstain';
}

export interface CashBridgeValues {
  expectedPaise: number;
  capturedPaise: number;
  pendingSettlementPaise: number;
  gatewaySettledPaise: number;
  bankCreditedPaise: number;
  financeExceptionsPaise: number;
  eligibleRecoveryPaise: number;
  recoveredPaise: number;
  tdsPaise: number;
}

export interface RecoveryCaseData {
  caseNumber: string;
  cashState: string;
  priority: string;
  outstandingAmountPaise: number;
  grossAmountPaise: number;
  expectedNetAmountPaise: number;
  observedBankAmountPaise: number;
  diagnosisCode: string;
  diagnosisText: string;
  confidence: number;
  evidenceRefs: string[];
  allowedActions: string[];
  blockedActions: { action: string; reasons: string[] }[];
  matchResult?: MatchResult;
}

export interface EvidenceEdgeData {
  sourceType: string;
  sourceId: string;
  targetType: string;
  targetId: string;
  edgeType: string;
  ruleId: string;
  confidence: number;
  explanation: string;
  sourceRefs: string[];
}

export interface ReconciliationResult {
  cases: RecoveryCaseData[];
  edges: EvidenceEdgeData[];
  cashBridge: CashBridgeValues;
  metrics: {
    totalRecordsProcessed: number;
    autoMatched: number;
    reviewRequired: number;
    exceptions: number;
    elapsedMs: number;
  };
}
