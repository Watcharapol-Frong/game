import type { PumpActionLog, BartTrialLog, BartSummaryMetrics, Game1Payload } from './types';

const EARLY_TRIAL_GUARD_COUNT = 5;
const EARLY_TRIAL_MIN_THRESHOLD = 6;

export function generateBurstThreshold(maxCapacity: number = 32, trialIndex: number = 0): number {
  const raw = Math.floor(Math.random() * maxCapacity) + 1;
  if (trialIndex > 0 && trialIndex <= EARLY_TRIAL_GUARD_COUNT) {
    return Math.max(raw, EARLY_TRIAL_MIN_THRESHOLD);
  }
  return raw;
}

export function computeSummaryMetrics(trials: BartTrialLog[]): BartSummaryMetrics {
  const unexploded = trials.filter((t) => !t.isExploded);
  const exploded = trials.filter((t) => t.isExploded);

  const adjustedAveragePumps =
    unexploded.length > 0
      ? unexploded.reduce((sum, t) => sum + t.pumpsCompleted, 0) / unexploded.length
      : 0;

  const overallAveragePumps =
    trials.reduce((sum, t) => sum + t.pumpsCompleted, 0) / trials.length;

  const totalPointsEarned = trials.reduce((sum, t) => sum + t.pointsEarned, 0);

  const totalLatencies: number[] = [];
  trials.forEach((t) => {
    t.pumpTelemetry.forEach((p) => totalLatencies.push(p.latencyFromPreviousMs));
  });
  const averagePumpLatencyMs =
    totalLatencies.length > 0
      ? totalLatencies.reduce((a, b) => a + b, 0) / totalLatencies.length
      : 0;

  // Corrected delta: compare trial after explosion to the last unexploded baseline,
  // not to the exploded trial itself (which inflates the reference point).
  const adaptationDeltas: number[] = [];
  let lastUnexplodedPumps: number | null = null;
  for (let i = 0; i < trials.length - 1; i++) {
    if (!trials[i].isExploded) {
      lastUnexplodedPumps = trials[i].pumpsCompleted;
    } else if (lastUnexplodedPumps !== null) {
      // Pumps[N+1] - Pumps[N-1 (last unexploded)]
      const delta = trials[i + 1].pumpsCompleted - lastUnexplodedPumps;
      adaptationDeltas.push(delta);
    }
  }
  const postExplosionAdaptationDelta =
    adaptationDeltas.length > 0
      ? adaptationDeltas.reduce((a, b) => a + b, 0) / adaptationDeltas.length
      : 0;

  return {
    totalTrials: trials.length,
    explodedTrialsCount: exploded.length,
    unexplodedTrialsCount: unexploded.length,
    adjustedAveragePumps: Number(adjustedAveragePumps.toFixed(2)),
    overallAveragePumps: Number(overallAveragePumps.toFixed(2)),
    totalPointsEarned,
    averagePumpLatencyMs: Number(averagePumpLatencyMs.toFixed(2)),
    postExplosionAdaptationDelta: Number(postExplosionAdaptationDelta.toFixed(2)),
  };
}

export class BartGameEngine {
  private sessionId: string;
  private currentTrialIndex: number = 0;
  private trialsLog: BartTrialLog[] = [];
  private thresholds: number[] = [];
  private currentTrialPumps: number = 0;
  private currentTrialTelemetry: PumpActionLog[] = [];
  private totalPoints: number = 0;
  private lastActionTimestamp: number = 0;
  private startedAt: number = 0;
  private state: 'IDLE' | 'READY_TRIAL' | 'ACTIVE_TRIAL' | 'GAME_OVER' = 'IDLE';

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  public initializeGame(): void {
    this.thresholds = Array.from({ length: 20 }, (_, i) => generateBurstThreshold(32, i + 1));
    this.currentTrialIndex = 1;
    this.trialsLog = [];
    this.totalPoints = 0;
    this.startedAt = Date.now();
    this.state = 'READY_TRIAL';
    this.startNewTrial();
  }

  private startNewTrial(): void {
    this.currentTrialPumps = 0;
    this.currentTrialTelemetry = [];
    this.lastActionTimestamp = Date.now();
    this.state = 'ACTIVE_TRIAL';
  }

  public pump(): { isExploded: boolean; currentPumps: number; unbankedPoints: number } {
    if (this.state !== 'ACTIVE_TRIAL') {
      throw new Error('Cannot pump: Trial is not active.');
    }

    const now = Date.now();
    const latency = now - this.lastActionTimestamp;
    this.lastActionTimestamp = now;

    this.currentTrialPumps += 1;
    this.currentTrialTelemetry.push({
      pumpIndex: this.currentTrialPumps,
      timestampMs: now,
      latencyFromPreviousMs: latency,
    });

    const threshold = this.thresholds[this.currentTrialIndex - 1];

    if (this.currentTrialPumps >= threshold) {
      this.trialsLog.push({
        trialIndex: this.currentTrialIndex,
        explosionThreshold: threshold,
        pumpsCompleted: this.currentTrialPumps,
        isExploded: true,
        pointsEarned: 0,
        pumpTelemetry: [...this.currentTrialTelemetry],
      });
      this.advanceProgress();
      return { isExploded: true, currentPumps: this.currentTrialPumps, unbankedPoints: 0 };
    }

    return {
      isExploded: false,
      currentPumps: this.currentTrialPumps,
      unbankedPoints: this.currentTrialPumps,
    };
  }

  public bank(): { bankedPoints: number; totalPoints: number; isGameOver: boolean } {
    if (this.state !== 'ACTIVE_TRIAL' || this.currentTrialPumps === 0) {
      throw new Error('Cannot bank: Invalid state or 0 pumps.');
    }

    const now = Date.now();
    const bankLatency = now - this.lastActionTimestamp;
    const pointsEarned = this.currentTrialPumps;
    this.totalPoints += pointsEarned;

    this.trialsLog.push({
      trialIndex: this.currentTrialIndex,
      explosionThreshold: this.thresholds[this.currentTrialIndex - 1],
      pumpsCompleted: this.currentTrialPumps,
      isExploded: false,
      pointsEarned,
      pumpTelemetry: [...this.currentTrialTelemetry],
      bankDecisionLatencyMs: bankLatency,
    });

    const isGameOver = this.advanceProgress();
    return { bankedPoints: pointsEarned, totalPoints: this.totalPoints, isGameOver };
  }

  private advanceProgress(): boolean {
    if (this.currentTrialIndex >= 20) {
      this.state = 'GAME_OVER';
      return true;
    }
    this.currentTrialIndex += 1;
    this.startNewTrial();
    return false;
  }

  public getPayload(): Game1Payload {
    if (this.state !== 'GAME_OVER') {
      throw new Error('Cannot export payload before game completion.');
    }
    const summary = computeSummaryMetrics(this.trialsLog);
    return {
      sessionId: this.sessionId,
      gameId: 'game1_bart',
      startedAt: new Date(this.startedAt).toISOString(),
      completedAt: new Date().toISOString(),
      summaryMetrics: summary,
      trials: this.trialsLog,
    };
  }

  public getCurrentTrialIndex(): number {
    return this.currentTrialIndex;
  }

  public getTotalPoints(): number {
    return this.totalPoints;
  }

  public isGameOver(): boolean {
    return this.state === 'GAME_OVER';
  }
}
