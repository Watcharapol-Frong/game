import type {
  WagashiCard,
  WagashiColor,
  WagashiShape,
  WagashiCount,
  SortingDimension,
  WcstTrialLog,
  WcstSummaryMetrics,
  Game2Payload,
} from './types';

export class WcstGameEngine {
  private sessionId: string;
  private currentTrialIndex: number = 0;
  private ruleSequence: SortingDimension[] = ['color', 'shape', 'count', 'color', 'shape', 'count'];
  private currentRuleIndex: number = 0;
  private consecutiveCorrect: number = 0;
  private trialsLog: WcstTrialLog[] = [];
  private lastActionTimestamp: number = 0;
  private currentCard: WagashiCard | null = null;
  private startedAt: number = 0;
  private state: 'IDLE' | 'ACTIVE_TRIAL' | 'GAME_OVER' = 'IDLE';

  public readonly targetPlates: WagashiCard[] = [
    { count: 1, shape: 'flower', color: 'green' },
    { count: 2, shape: 'leaf',   color: 'blue'  },
    { count: 3, shape: 'round',  color: 'red'   },
  ];

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  public initializeGame(): WagashiCard {
    this.currentTrialIndex = 1;
    this.currentRuleIndex = 0;
    this.consecutiveCorrect = 0;
    this.trialsLog = [];
    this.startedAt = Date.now();
    this.state = 'ACTIVE_TRIAL';
    return this.nextCard();
  }

  private getRandomCard(): WagashiCard {
    const colors: WagashiColor[] = ['green', 'blue', 'red'];
    const shapes: WagashiShape[] = ['flower', 'leaf', 'round'];
    const counts: WagashiCount[] = [1, 2, 3];
    return {
      color:  colors[Math.floor(Math.random() * 3)],
      shape:  shapes[Math.floor(Math.random() * 3)],
      count:  counts[Math.floor(Math.random() * 3)],
    };
  }

  private nextCard(): WagashiCard {
    this.currentCard = this.getRandomCard();
    this.lastActionTimestamp = Date.now();
    return this.currentCard;
  }

  public submitChoice(targetIndex: number): {
    isCorrect: boolean;
    isGameOver: boolean;
    nextCard: WagashiCard | null;
  } {
    if (this.state !== 'ACTIVE_TRIAL' || !this.currentCard) {
      throw new Error('Game is not active.');
    }

    const now = Date.now();
    const reactionTime = now - this.lastActionTimestamp;
    const target = this.targetPlates[targetIndex];
    const activeRule = this.ruleSequence[this.currentRuleIndex];
    const previousRule =
      this.currentRuleIndex > 0 ? this.ruleSequence[this.currentRuleIndex - 1] : null;

    const matchedDimensions: SortingDimension[] = [];
    if (this.currentCard.color === target.color) matchedDimensions.push('color');
    if (this.currentCard.shape === target.shape) matchedDimensions.push('shape');
    if (this.currentCard.count === target.count) matchedDimensions.push('count');

    const isCorrect = matchedDimensions.includes(activeRule);
    let isPerseverative = false;

    if (!isCorrect) {
      this.consecutiveCorrect = 0;
      if (previousRule && matchedDimensions.includes(previousRule)) {
        isPerseverative = true;
      }
    } else {
      this.consecutiveCorrect += 1;
      if (this.consecutiveCorrect === 6) {
        this.currentRuleIndex = Math.min(this.currentRuleIndex + 1, this.ruleSequence.length - 1);
        this.consecutiveCorrect = 0;
      }
    }

    this.trialsLog.push({
      trialIndex: this.currentTrialIndex,
      presentedCard: { ...this.currentCard },
      selectedTargetIndex: targetIndex,
      activeRule,
      matchedDimensions,
      isCorrect,
      isPerseverativeError: isPerseverative,
      reactionTimeMs: reactionTime,
    });

    if (this.currentTrialIndex >= 40) {
      this.state = 'GAME_OVER';
      return { isCorrect, isGameOver: true, nextCard: null };
    }

    this.currentTrialIndex += 1;
    const next = this.nextCard();
    return { isCorrect, isGameOver: false, nextCard: next };
  }

  public getPayload(): Game2Payload {
    if (this.state !== 'GAME_OVER') throw new Error('Game not completed.');

    const totalTrials = this.trialsLog.length;
    const correctTrials = this.trialsLog.filter((t) => t.isCorrect);
    const errorTrials   = this.trialsLog.filter((t) => !t.isCorrect);
    const perseverativeErrors = this.trialsLog.filter((t) => t.isPerseverativeError).length;
    const nonPerseverativeErrors = errorTrials.length - perseverativeErrors;

    // categories completed: count streaks of exactly 6 consecutive correct
    let categoriesCompleted = 0;
    let streak = 0;
    let trialsToFirstCategory = 0;
    let foundFirst = false;
    this.trialsLog.forEach((t, idx) => {
      if (t.isCorrect) {
        streak++;
        if (streak === 6) {
          categoriesCompleted++;
          streak = 0;
          if (!foundFirst) {
            trialsToFirstCategory = idx + 1;
            foundFirst = true;
          }
        }
      } else {
        streak = 0;
      }
    });

    // failureToMaintainSet: streak of 3–5 correct broken by an error
    let failureToMaintainSet = 0;
    let run = 0;
    for (const t of this.trialsLog) {
      if (t.isCorrect) {
        run++;
      } else {
        if (run >= 3 && run < 6) failureToMaintainSet++;
        run = 0;
      }
    }

    const avgRT = this.trialsLog.reduce((a, b) => a + b.reactionTimeMs, 0) / totalTrials;

    const summaryMetrics: WcstSummaryMetrics = {
      totalTrials,
      categoriesCompleted,
      totalCorrect: correctTrials.length,
      totalErrors: errorTrials.length,
      perseverativeErrors,
      nonPerseverativeErrors,
      perseverativeErrorRate:
        errorTrials.length > 0
          ? Number((perseverativeErrors / errorTrials.length).toFixed(2))
          : 0,
      trialsToFirstCategory: foundFirst ? trialsToFirstCategory : totalTrials,
      failureToMaintainSet,
      averageReactionTimeMs: Number(avgRT.toFixed(2)),
    };

    return {
      sessionId: this.sessionId,
      gameId: 'game2_wcst',
      startedAt: new Date(this.startedAt).toISOString(),
      completedAt: new Date().toISOString(),
      summaryMetrics,
      trials: this.trialsLog,
    };
  }

  public getCurrentTrialIndex(): number { return this.currentTrialIndex; }
  public getCurrentCard(): WagashiCard | null { return this.currentCard; }
  public isGameOver(): boolean { return this.state === 'GAME_OVER'; }
}
