// Data-to-Radar-Chart Pipeline
// Consumes the summaryMetrics of all 4 games and synthesizes a 6-axis
// psychometric radar chart (0–100 scale) via min-max normalization,
// inversion (for metrics where lower is better), and weighted synthesis.

import type { BartSummaryMetrics } from '../games/game1-bart/types';
import type { WcstSummaryMetrics } from '../games/game2-wcst/types';
import type { FlankerSummaryMetrics } from '../games/game3-flanker/types';
import type { PggSummaryMetrics } from '../games/game4-pgg/types';

// ==========================================
// 1. Payload Interfaces
// ==========================================
// Reuses each game's real summaryMetrics type directly, so this pipeline
// consumes actual Game1Payload/Game2Payload/Game3Payload/Game4Payload
// output with no adapter layer.

export interface CompleteAssessmentPayload {
  sessionId: string;
  game1_bart: BartSummaryMetrics;
  game2_wcst: WcstSummaryMetrics;
  game3_flanker: FlankerSummaryMetrics;
  game4_pgg: PggSummaryMetrics;
}

export interface RadarChartOutput {
  sessionId: string;
  generatedAt: string;
  axes: {
    riskTolerance: number;               // 0 - 100
    learningAgility: number;             // 0 - 100
    criticalThinking: number;            // 0 - 100
    decisionMakingUnderPressure: number; // 0 - 100
    collaborationMindset: number;        // 0 - 100
    resilienceAndAdaptability: number;   // 0 - 100
  };
  overallIndex: number;
}

// ==========================================
// 2. Normalization Helper Utilities
// ==========================================

/** Direct min-max scaling: higher raw value → higher score. */
function normalizeDirect(value: number, min: number, max: number): number {
  if (value <= min) return 0;
  if (value >= max) return 100;
  return ((value - min) / (max - min)) * 100;
}

/** For metrics where a lower raw value is better (errors, RT cost, etc). */
function normalizeInverted(value: number, bestVal: number, worstVal: number): number {
  if (value <= bestVal) return 100;
  if (value >= worstVal) return 0;
  return ((worstVal - value) / (worstVal - bestVal)) * 100;
}

/** For metrics with an ideal "sweet spot" between two extremes. */
function normalizeTarget(value: number, min: number, target: number, max: number): number {
  if (value <= min || value >= max) return 0;
  if (value === target) return 100;
  if (value < target) return ((value - min) / (target - min)) * 100;
  return ((max - value) / (max - target)) * 100;
}

function clamp(value: number): number {
  return Number(Math.max(0, Math.min(100, value)).toFixed(2));
}

// ==========================================
// 3. Main Data-to-Radar-Chart Function
// ==========================================

export function calculateRadarProfile(data: CompleteAssessmentPayload): RadarChartOutput {
  const { game1_bart, game2_wcst, game3_flanker, game4_pgg } = data;

  // --- Sub-metric Scores (0 - 100) ---

  // Game 1: BART
  const bartRiskAcumen = normalizeTarget(game1_bart.adjustedAveragePumps, 4, 15, 26);
  const bartExplosionTolerance = normalizeInverted(game1_bart.explodedTrialsCount, 2, 10);
  const bartImpulseControl = normalizeInverted(Math.abs(game1_bart.postExplosionAdaptationDelta), 1, 8);

  // Game 2: WCST
  const wcstCategories = normalizeDirect(game2_wcst.categoriesCompleted, 0, 5);
  const wcstPerseverative = normalizeInverted(game2_wcst.perseverativeErrors, 0, 12);
  const wcstFirstRuleSpeed = normalizeInverted(game2_wcst.trialsToFirstCategory, 6, 20);
  const wcstRuleMaintenance = normalizeInverted(game2_wcst.failureToMaintainSet, 0, 3);

  // Game 3: Flanker
  const flankerInterference = normalizeInverted(game3_flanker.flankerEffectMs, 20, 180);
  const flankerIncongruentAcc = normalizeDirect(game3_flanker.incongruentAccuracy, 0.70, 1.0);
  const flankerImpulse = normalizeInverted(game3_flanker.impulsiveErrorCount, 0, 4);
  const flankerPes = normalizeTarget(game3_flanker.postErrorSlowingMs, -100, 80, 250);

  // Game 4: PGG
  const pggTrust = normalizeDirect(game4_pgg.initialContribution, 2, 10);
  const pggProsocial = normalizeDirect(game4_pgg.averageContribution, 2, 9);
  // freeRiderSensitivity is logged in raw coins (round-over-round contribution
  // delta, endowment = 10/round). Realistic values run ~0.1-0.5; a moderate
  // pull-back (~0.5 coins/round) is the healthiest boundary-setting response,
  // near-total defection reaction (~2.5) is over-reactive.
  const pggBoundaries = normalizeTarget(game4_pgg.freeRiderSensitivity, 0.0, 0.5, 2.5);
  const pggDecayStability = normalizeTarget(game4_pgg.cooperationDecaySlope, -0.80, -0.15, 0.40);

  // --- Synthesis into 6 Core Axes ---

  // 1. Risk Tolerance — Game 1 (BART) 80% + Game 4 (PGG) 20%
  const riskTolerance = (bartRiskAcumen * 0.50) + (pggTrust * 0.30) + (bartExplosionTolerance * 0.20);

  // 2. Learning Agility — Game 2 (WCST) 85% + Game 1 (BART) 15%
  const learningAgility = (wcstPerseverative * 0.40) + (wcstCategories * 0.30) + (wcstFirstRuleSpeed * 0.20) + (wcstRuleMaintenance * 0.10);

  // 3. Critical Thinking — Game 3 (Flanker) 85% + Game 2 (WCST) 15%
  const criticalThinking = (flankerInterference * 0.50) + (flankerIncongruentAcc * 0.35) + (wcstRuleMaintenance * 0.15);

  // 4. Decision Making Under Pressure — Game 3 (Flanker) 60% + Game 1 (BART) 40%
  const decisionMakingUnderPressure = (flankerIncongruentAcc * 0.40) + (flankerImpulse * 0.30) + (bartImpulseControl * 0.30);

  // 5. Collaboration Mindset — Game 4 (PGG) 80% + Game 2 (WCST) 20%
  const collaborationMindset = (pggProsocial * 0.50) + (pggTrust * 0.30) + (pggDecayStability * 0.20);

  // 6. Resilience & Adaptability — Game 4 (PGG) 60% + Game 3 (Flanker PES) 40%
  // postErrorSlowingMs gets a safe recovery zone below 0: real post-error RT is
  // often small or slightly negative from natural noise, and shouldn't floor to
  // 0 as if it were a total failure to adapt.
  const resilienceAndAdaptability = (pggBoundaries * 0.40) + (pggDecayStability * 0.30) + (flankerPes * 0.30);

  const axes = {
    riskTolerance: clamp(riskTolerance),
    learningAgility: clamp(learningAgility),
    criticalThinking: clamp(criticalThinking),
    decisionMakingUnderPressure: clamp(decisionMakingUnderPressure),
    collaborationMindset: clamp(collaborationMindset),
    resilienceAndAdaptability: clamp(resilienceAndAdaptability),
  };

  const overallIndex = clamp(
    (axes.riskTolerance +
      axes.learningAgility +
      axes.criticalThinking +
      axes.decisionMakingUnderPressure +
      axes.collaborationMindset +
      axes.resilienceAndAdaptability) / 6
  );

  return {
    sessionId: data.sessionId,
    generatedAt: new Date().toISOString(),
    axes,
    overallIndex,
  };
}
