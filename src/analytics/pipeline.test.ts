import { describe, it, expect } from 'vitest';
import { calculateRadarProfile } from './pipeline';
import type { CompleteAssessmentPayload } from './pipeline';
import type { BartSummaryMetrics } from '../games/game1-bart/types';
import type { WcstSummaryMetrics } from '../games/game2-wcst/types';
import type { FlankerSummaryMetrics } from '../games/game3-flanker/types';
import type { PggSummaryMetrics } from '../games/game4-pgg/types';

function mockBart(overrides: Partial<BartSummaryMetrics> = {}): BartSummaryMetrics {
  return {
    totalTrials: 20,
    explodedTrialsCount: 4,
    unexplodedTrialsCount: 16,
    adjustedAveragePumps: 14.8,
    overallAveragePumps: 12.1,
    totalPointsEarned: 240,
    averagePumpLatencyMs: 280,
    postExplosionAdaptationDelta: -1.2,
    ...overrides,
  };
}

function mockWcst(overrides: Partial<WcstSummaryMetrics> = {}): WcstSummaryMetrics {
  return {
    totalTrials: 40,
    categoriesCompleted: 4,
    totalCorrect: 32,
    totalErrors: 8,
    perseverativeErrors: 1,
    nonPerseverativeErrors: 3,
    perseverativeErrorRate: 0.125,
    trialsToFirstCategory: 7,
    failureToMaintainSet: 0,
    averageReactionTimeMs: 1450,
    ...overrides,
  };
}

function mockFlanker(overrides: Partial<FlankerSummaryMetrics> = {}): FlankerSummaryMetrics {
  return {
    totalTrials: 48,
    congruentTrials: 24,
    incongruentTrials: 24,
    totalCorrect: 46,
    totalErrors: 2,
    timeouts: 1,
    timeoutRate: 0.021,
    meanCongruentRtMs: 420,
    meanIncongruentRtMs: 486,
    congruentAccuracy: 0.958,
    incongruentAccuracy: 0.958,
    flankerEffectMs: 66.18,
    postErrorSlowingMs: 80.11,
    impulsiveErrorCount: 0,
    ...overrides,
  };
}

function mockPgg(overrides: Partial<PggSummaryMetrics> = {}): PggSummaryMetrics {
  return {
    totalRounds: 8,
    initialContribution: 8,
    averageContribution: 6.25,
    freeRiderSensitivity: 0.14,
    cooperationDecaySlope: -0.24,
    meanDecisionLatencyMs: 3400,
    finalCumulativePayoff: 95.2,
    ...overrides,
  };
}

function mockPayload(overrides: Partial<CompleteAssessmentPayload> = {}): CompleteAssessmentPayload {
  return {
    sessionId: 'sess_test',
    game1_bart: mockBart(),
    game2_wcst: mockWcst(),
    game3_flanker: mockFlanker(),
    game4_pgg: mockPgg(),
    ...overrides,
  };
}

describe('calculateRadarProfile', () => {
  it('matches hand-verified output for the spec mock scenario', () => {
    const result = calculateRadarProfile(mockPayload({ sessionId: 'sess_ktp_integrated_test' }));

    expect(result.sessionId).toBe('sess_ktp_integrated_test');
    expect(result.axes.riskTolerance).toBeCloseTo(86.59, 1);
    expect(result.axes.learningAgility).toBeCloseTo(89.24, 1);
    expect(result.axes.criticalThinking).toBeCloseTo(80.67, 1);
    expect(result.axes.decisionMakingUnderPressure).toBeCloseTo(93.54, 1);
    expect(result.axes.collaborationMindset).toBeCloseTo(70.09, 1);
    expect(result.axes.resilienceAndAdaptability).toBeCloseTo(67.03, 1);
    expect(result.overallIndex).toBeCloseTo(81.19, 1);
  });

  it('floors every axis to 0 when every underlying metric is worst-case', () => {
    const payload = mockPayload({
      game1_bart: mockBart({
        adjustedAveragePumps: 2,        // below normalizeTarget min (4)
        explodedTrialsCount: 12,        // above normalizeInverted worst (10)
        postExplosionAdaptationDelta: 10, // |10| above worst (8)
      }),
      game2_wcst: mockWcst({
        categoriesCompleted: 0,
        perseverativeErrors: 15,
        trialsToFirstCategory: 40,      // engine's "never completed" default
        failureToMaintainSet: 5,
      }),
      game3_flanker: mockFlanker({
        flankerEffectMs: 300,
        incongruentAccuracy: 0.5,
        impulsiveErrorCount: 6,
        postErrorSlowingMs: 300,
      }),
      game4_pgg: mockPgg({
        initialContribution: 0,
        averageContribution: 0,
        freeRiderSensitivity: 0,
        cooperationDecaySlope: -1,
      }),
    });

    const result = calculateRadarProfile(payload);

    for (const [axis, score] of Object.entries(result.axes)) {
      expect(score, `${axis} should floor to 0`).toBe(0);
    }
    expect(result.overallIndex).toBe(0);
  });

  it('caps every axis at 100 when every underlying metric hits its sweet spot / ceiling', () => {
    const payload = mockPayload({
      game1_bart: mockBart({
        adjustedAveragePumps: 15,       // exact target
        explodedTrialsCount: 2,         // best value
        postExplosionAdaptationDelta: 0,
      }),
      game2_wcst: mockWcst({
        categoriesCompleted: 5,
        perseverativeErrors: 0,
        trialsToFirstCategory: 6,
        failureToMaintainSet: 0,
      }),
      game3_flanker: mockFlanker({
        flankerEffectMs: 20,
        incongruentAccuracy: 1.0,
        impulsiveErrorCount: 0,
        postErrorSlowingMs: 80,         // exact target
      }),
      game4_pgg: mockPgg({
        initialContribution: 10,
        averageContribution: 9,
        freeRiderSensitivity: 0.5,      // exact target
        cooperationDecaySlope: -0.15,   // exact target
      }),
    });

    const result = calculateRadarProfile(payload);

    for (const [axis, score] of Object.entries(result.axes)) {
      expect(score, `${axis} should cap at 100`).toBe(100);
    }
    expect(result.overallIndex).toBe(100);
  });

  it('overallIndex is always the mean of the 6 axes', () => {
    const result = calculateRadarProfile(mockPayload());
    const mean = Number(
      (
        (result.axes.riskTolerance +
          result.axes.learningAgility +
          result.axes.criticalThinking +
          result.axes.decisionMakingUnderPressure +
          result.axes.collaborationMindset +
          result.axes.resilienceAndAdaptability) /
        6
      ).toFixed(2),
    );
    expect(result.overallIndex).toBe(mean);
  });

  it('never produces NaN or out-of-range scores, even with unusual (e.g. negative) deltas', () => {
    const payload = mockPayload({
      game4_pgg: mockPgg({
        freeRiderSensitivity: -3,   // user increased contributions over time
        cooperationDecaySlope: 0.9, // beyond the modeled range
      }),
    });

    const result = calculateRadarProfile(payload);

    for (const score of Object.values(result.axes)) {
      expect(Number.isFinite(score)).toBe(true);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });

  it('produces a valid ISO timestamp for generatedAt', () => {
    const result = calculateRadarProfile(mockPayload());
    expect(Number.isNaN(Date.parse(result.generatedAt))).toBe(false);
  });
});
