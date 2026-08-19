export type TargetDirection = 'left' | 'right';
export type FlankerCondition = 'congruent' | 'incongruent';

export interface FlankerTrial {
  condition: FlankerCondition;
  targetDirection: TargetDirection;
}

export interface FlankerTrialLog {
  trialIndex: number;
  condition: FlankerCondition;
  targetDirection: TargetDirection;
  response: TargetDirection | 'timeout';
  isCorrect: boolean;
  reactionTimeMs: number | null;
  isImpulsive: boolean;
  isTimeout: boolean;
}

export interface FlankerSummaryMetrics {
  totalTrials: number;
  congruentTrials: number;
  incongruentTrials: number;
  totalCorrect: number;
  totalErrors: number;
  timeouts: number;
  timeoutRate: number;
  meanCongruentRtMs: number;
  meanIncongruentRtMs: number;
  congruentAccuracy: number;
  incongruentAccuracy: number;
  flankerEffectMs: number;
  postErrorSlowingMs: number;
  impulsiveErrorCount: number;
}

export interface Game3Payload {
  sessionId: string;
  gameId: 'game3_flanker';
  startedAt: string;
  completedAt: string;
  summaryMetrics: FlankerSummaryMetrics;
  trials: FlankerTrialLog[];
}
