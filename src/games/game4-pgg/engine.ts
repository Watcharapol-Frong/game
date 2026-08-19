import type {
  AiContribution,
  PggRoundLog,
  PggSummaryMetrics,
  Game4Payload,
} from './types';

export class KongNeighborhoodEngine {
  private sessionId: string;
  private currentRound: number = 0;
  private roundsLog: PggRoundLog[] = [];
  private roundStartTimestamp: number = 0;
  private cumulativePayoff: number = 0;
  private startedAt: number = 0;
  private state: 'IDLE' | 'AWAITING_INPUT' | 'GAME_OVER' = 'IDLE';

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  public startRound(): { roundIndex: number; endowment: number; timeLimitMs: number } {
    if (this.currentRound >= 8) {
      this.state = 'GAME_OVER';
      throw new Error('Game 4 already completed.');
    }
    if (this.currentRound === 0) this.startedAt = Date.now();
    this.state = 'AWAITING_INPUT';
    this.roundStartTimestamp = performance.now();
    return {
      roundIndex: this.currentRound + 1,
      endowment: 10,
      timeLimitMs: 10000,
    };
  }

  private generateAiContributions(round: number, lastGroupMean: number): AiContribution[] {
    // AI 1: Conditional Cooperator — tracks prior group mean ±1
    let ai1Contrib = round === 1 ? 6 : Math.round(lastGroupMean + (Math.random() * 2 - 1));
    ai1Contrib = Math.max(0, Math.min(10, ai1Contrib));

    // AI 2: Stable Cooperator (7 - 9)
    const ai2Contrib = Math.floor(Math.random() * 3) + 7;

    // AI 3: Persistent Free-rider (0 - 2)
    const ai3Contrib = Math.floor(Math.random() * 3);

    return [
      { aiId: 'ai_1', name: 'AI 1', role: 'Conditional Cooperator', contribution: ai1Contrib },
      { aiId: 'ai_2', name: 'AI 2', role: 'Stable Cooperator', contribution: ai2Contrib },
      { aiId: 'ai_3', name: 'AI 3', role: 'Persistent Free-rider', contribution: ai3Contrib },
    ];
  }

  public submitContribution(contribution: number, isTimeout: boolean = false): PggRoundLog {
    if (this.state !== 'AWAITING_INPUT') throw new Error('No active round.');

    const userContribution = isTimeout ? 0 : Math.max(0, Math.min(10, Math.round(contribution)));
    const decisionLatencyMs = Math.round(performance.now() - this.roundStartTimestamp);

    const lastRound = this.roundsLog[this.roundsLog.length - 1];
    const lastGroupMean = lastRound ? lastRound.totalPool / 4 : 5.5;

    const aiContributions = this.generateAiContributions(this.currentRound + 1, lastGroupMean);
    const aiTotal = aiContributions.reduce((sum, ai) => sum + ai.contribution, 0);

    const totalPool = userContribution + aiTotal;
    const multipliedPool = Number((totalPool * 1.6).toFixed(2));
    const individualShare = Number((multipliedPool / 4).toFixed(2));
    const userRoundPayoff = Number(((10 - userContribution) + individualShare).toFixed(2));

    this.cumulativePayoff = Number((this.cumulativePayoff + userRoundPayoff).toFixed(2));

    const roundLog: PggRoundLog = {
      roundIndex: this.currentRound + 1,
      userContribution,
      decisionLatencyMs,
      isTimeout,
      aiContributions,
      totalPool,
      multipliedPool,
      individualShare,
      userRoundPayoff,
      userCumulativePayoff: this.cumulativePayoff,
    };

    this.roundsLog.push(roundLog);
    this.currentRound++;

    if (this.currentRound >= 8) {
      this.state = 'GAME_OVER';
    } else {
      this.state = 'IDLE';
    }

    return roundLog;
  }

  public getPayload(): Game4Payload {
    if (this.state !== 'GAME_OVER') throw new Error('Game not finished.');

    const initialContribution = this.roundsLog[0].userContribution;
    const avgContribution = this.roundsLog.reduce((sum, r) => sum + r.userContribution, 0) / 8;
    const meanLatency = this.roundsLog.reduce((sum, r) => sum + r.decisionLatencyMs, 0) / 8;

    // Cooperation Decay Slope: simple linear regression, x = round index [1..8], y = userContribution
    const n = 8;
    const xMean = 4.5;
    const yMean = avgContribution;
    let numerator = 0;
    let denominator = 0;
    for (let i = 0; i < n; i++) {
      const x = i + 1;
      const y = this.roundsLog[i].userContribution;
      numerator += (x - xMean) * (y - yMean);
      denominator += Math.pow(x - xMean, 2);
    }
    const slope = denominator !== 0 ? numerator / denominator : 0;

    // Free-rider Sensitivity: round-over-round contribution delta
    const sensitivityDeltas: number[] = [];
    for (let i = 1; i < n; i++) {
      const prevRound = this.roundsLog[i - 1];
      const currentRound = this.roundsLog[i];
      const delta = prevRound.userContribution - currentRound.userContribution;
      sensitivityDeltas.push(delta);
    }
    const meanSensitivity = sensitivityDeltas.length > 0
      ? sensitivityDeltas.reduce((a, b) => a + b, 0) / sensitivityDeltas.length
      : 0;

    const summary: PggSummaryMetrics = {
      totalRounds: 8,
      initialContribution,
      averageContribution: Number(avgContribution.toFixed(2)),
      freeRiderSensitivity: Number(meanSensitivity.toFixed(2)),
      cooperationDecaySlope: Number(slope.toFixed(2)),
      meanDecisionLatencyMs: Number(meanLatency.toFixed(2)),
      finalCumulativePayoff: this.cumulativePayoff,
    };

    return {
      sessionId: this.sessionId,
      gameId: 'game4_pgg',
      startedAt: new Date(this.startedAt).toISOString(),
      completedAt: new Date().toISOString(),
      summaryMetrics: summary,
      rounds: this.roundsLog,
    };
  }

  public getCurrentRound(): number { return this.currentRound; }
  public isGameOver(): boolean { return this.state === 'GAME_OVER'; }
}
