import type {
  TargetDirection,
  FlankerCondition,
  FlankerTrial,
  FlankerTrialLog,
  FlankerSummaryMetrics,
  Game3Payload,
} from './types';

export class MeenFocusEngine {
  private sessionId: string;
  private trialSequence: FlankerTrial[] = [];
  private trialIndex: number = 0;
  private trialsLog: FlankerTrialLog[] = [];
  private startedAt: number = 0;
  private stimulusStartTime: number = 0;
  private state: 'IDLE' | 'AWAITING_INPUT' | 'GAME_OVER' = 'IDLE';

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  public initSequence(): void {
    const seq: FlankerTrial[] = [
      ...Array(12).fill(null).map(() => ({ condition: 'congruent'   as FlankerCondition, targetDirection: 'left'  as TargetDirection })),
      ...Array(12).fill(null).map(() => ({ condition: 'congruent'   as FlankerCondition, targetDirection: 'right' as TargetDirection })),
      ...Array(12).fill(null).map(() => ({ condition: 'incongruent' as FlankerCondition, targetDirection: 'left'  as TargetDirection })),
      ...Array(12).fill(null).map(() => ({ condition: 'incongruent' as FlankerCondition, targetDirection: 'right' as TargetDirection })),
    ];
    for (let i = seq.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [seq[i], seq[j]] = [seq[j], seq[i]];
    }
    this.trialSequence = seq;
    this.trialIndex = 0;
    this.trialsLog = [];
    this.state = 'IDLE';
  }

  public startGame(): FlankerTrial {
    if (this.trialSequence.length === 0) this.initSequence();
    this.startedAt = Date.now();
    this.stimulusStartTime = Date.now();
    this.state = 'AWAITING_INPUT';
    return this.trialSequence[0];
  }

  public getCurrentTrial(): FlankerTrial {
    return this.trialSequence[this.trialIndex];
  }

  public handleResponse(response: TargetDirection | 'timeout'): {
    isCorrect: boolean;
    isGameOver: boolean;
    nextTrial: FlankerTrial | null;
  } {
    if (this.state !== 'AWAITING_INPUT') throw new Error('Game is not awaiting input.');

    const currentTrial = this.trialSequence[this.trialIndex];
    const reactionTimeMs = response === 'timeout' ? null : Date.now() - this.stimulusStartTime;
    const isCorrect = response === currentTrial.targetDirection;
    const isImpulsive = reactionTimeMs !== null && reactionTimeMs < 200 && !isCorrect;
    const isTimeout = response === 'timeout';

    this.trialsLog.push({
      trialIndex: this.trialIndex,
      condition: currentTrial.condition,
      targetDirection: currentTrial.targetDirection,
      response,
      isCorrect,
      reactionTimeMs,
      isImpulsive,
      isTimeout,
    });

    if (this.trialIndex + 1 >= 48) {
      this.state = 'GAME_OVER';
      return { isCorrect, isGameOver: true, nextTrial: null };
    }

    this.trialIndex++;
    this.stimulusStartTime = Date.now();
    return { isCorrect, isGameOver: false, nextTrial: this.trialSequence[this.trialIndex] };
  }

  public getPayload(): Game3Payload {
    if (this.state !== 'GAME_OVER') throw new Error('Game not completed.');

    const totalTrials = this.trialsLog.length;
    const congruentLogs   = this.trialsLog.filter(t => t.condition === 'congruent');
    const incongruentLogs = this.trialsLog.filter(t => t.condition === 'incongruent');
    const timeouts = this.trialsLog.filter(t => t.isTimeout).length;
    const totalCorrect = this.trialsLog.filter(t => t.isCorrect).length;
    const totalErrors  = totalTrials - totalCorrect;

    const correctCongruentRts   = congruentLogs.filter(t => t.isCorrect && t.reactionTimeMs !== null).map(t => t.reactionTimeMs as number);
    const correctIncongruentRts = incongruentLogs.filter(t => t.isCorrect && t.reactionTimeMs !== null).map(t => t.reactionTimeMs as number);

    const mean = (arr: number[]) => arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length;

    const meanCongruentRtMs   = Number(mean(correctCongruentRts).toFixed(2));
    const meanIncongruentRtMs = Number(mean(correctIncongruentRts).toFixed(2));
    const flankerEffectMs = Number((meanIncongruentRtMs - meanCongruentRtMs).toFixed(2));

    // Post-error slowing: compare RT of correct trials following an error vs following a correct
    const postErrorRts: number[]   = [];
    const postCorrectRts: number[] = [];
    for (let i = 1; i < this.trialsLog.length; i++) {
      const prev = this.trialsLog[i - 1];
      const cur  = this.trialsLog[i];
      if (cur.isCorrect && cur.reactionTimeMs !== null) {
        if (!prev.isCorrect) {
          postErrorRts.push(cur.reactionTimeMs);
        } else {
          postCorrectRts.push(cur.reactionTimeMs);
        }
      }
    }
    const postErrorSlowingMs = Number((mean(postErrorRts) - mean(postCorrectRts)).toFixed(2));

    const congruentAccuracy   = Number((congruentLogs.filter(t => t.isCorrect).length / 24).toFixed(3));
    const incongruentAccuracy = Number((incongruentLogs.filter(t => t.isCorrect).length / 24).toFixed(3));
    const impulsiveErrorCount = this.trialsLog.filter(t => t.isImpulsive).length;

    const summaryMetrics: FlankerSummaryMetrics = {
      totalTrials,
      congruentTrials: congruentLogs.length,
      incongruentTrials: incongruentLogs.length,
      totalCorrect,
      totalErrors,
      timeouts,
      timeoutRate: Number((timeouts / totalTrials).toFixed(3)),
      meanCongruentRtMs,
      meanIncongruentRtMs,
      congruentAccuracy,
      incongruentAccuracy,
      flankerEffectMs,
      postErrorSlowingMs,
      impulsiveErrorCount,
    };

    return {
      sessionId: this.sessionId,
      gameId: 'game3_flanker',
      startedAt: new Date(this.startedAt).toISOString(),
      completedAt: new Date().toISOString(),
      summaryMetrics,
      trials: this.trialsLog,
    };
  }

  public getCurrentTrialIndex(): number { return this.trialIndex; }
  public isGameOver(): boolean { return this.state === 'GAME_OVER'; }
}
