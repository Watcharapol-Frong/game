export interface AiContribution {
  aiId: 'ai_1' | 'ai_2' | 'ai_3';
  name: string;
  role: 'Conditional Cooperator' | 'Stable Cooperator' | 'Persistent Free-rider';
  contribution: number; // 0 to 10
}

export interface PggRoundLog {
  roundIndex: number;          // 1 to 8
  userContribution: number;    // 0 to 10
  decisionLatencyMs: number;
  isTimeout: boolean;
  aiContributions: AiContribution[];
  totalPool: number;           // user + sum(ai)
  multipliedPool: number;      // totalPool * 1.6
  individualShare: number;     // multipliedPool / 4
  userRoundPayoff: number;     // (10 - userContribution) + individualShare
  userCumulativePayoff: number;
}

export interface PggSummaryMetrics {
  totalRounds: number;                   // 8
  initialContribution: number;           // g_1 — Baseline Trust & Altruism
  averageContribution: number;           // g_bar — Prosocial Orientation
  freeRiderSensitivity: number;
  cooperationDecaySlope: number;
  meanDecisionLatencyMs: number;
  finalCumulativePayoff: number;
}

export interface Game4Payload {
  sessionId: string;
  gameId: 'game4_pgg';
  startedAt: string;
  completedAt: string;
  summaryMetrics: PggSummaryMetrics;
  rounds: PggRoundLog[];
}
