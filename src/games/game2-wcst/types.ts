export type WagashiColor = 'green' | 'blue' | 'red';
export type WagashiShape = 'flower' | 'leaf' | 'round';
export type WagashiCount = 1 | 2 | 3;
export type SortingDimension = 'color' | 'shape' | 'count';

export interface WagashiCard {
  color: WagashiColor;
  shape: WagashiShape;
  count: WagashiCount;
}

export interface WcstTrialLog {
  trialIndex: number;
  presentedCard: WagashiCard;
  selectedTargetIndex: number;
  activeRule: SortingDimension;
  matchedDimensions: SortingDimension[];
  isCorrect: boolean;
  isPerseverativeError: boolean;
  reactionTimeMs: number;
}

export interface WcstSummaryMetrics {
  totalTrials: number;
  categoriesCompleted: number;
  totalCorrect: number;
  totalErrors: number;
  perseverativeErrors: number;
  nonPerseverativeErrors: number;
  perseverativeErrorRate: number;
  trialsToFirstCategory: number;
  failureToMaintainSet: number;
  averageReactionTimeMs: number;
}

export interface Game2Payload {
  sessionId: string;
  gameId: 'game2_wcst';
  startedAt: string;
  completedAt: string;
  summaryMetrics: WcstSummaryMetrics;
  trials: WcstTrialLog[];
}
