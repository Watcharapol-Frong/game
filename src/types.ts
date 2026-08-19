export interface PumpActionLog {
  pumpIndex: number;
  timestampMs: number;
  latencyFromPreviousMs: number;
}

export interface BartTrialLog {
  trialIndex: number;
  explosionThreshold: number;
  pumpsCompleted: number;
  isExploded: boolean;
  pointsEarned: number;
  pumpTelemetry: PumpActionLog[];
  bankDecisionLatencyMs?: number;
}

export interface BartSummaryMetrics {
  totalTrials: number;
  explodedTrialsCount: number;
  unexplodedTrialsCount: number;
  adjustedAveragePumps: number;
  overallAveragePumps: number;
  totalPointsEarned: number;
  averagePumpLatencyMs: number;
  postExplosionAdaptationDelta: number;
}

export interface Game1Payload {
  sessionId: string;
  gameId: 'game1_bart';
  startedAt: string;
  completedAt: string;
  summaryMetrics: BartSummaryMetrics;
  trials: BartTrialLog[];
}
