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
    strategicCourage: number;      // 0 - 100
    cognitiveAdaptability: number; // 0 - 100
    selectiveFocus: number;        // 0 - 100
    impulseControl: number;        // 0 - 100
    collaborationTrust: number;    // 0 - 100
    strategicResilience: number;   // 0 - 100
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
  const flankerPes = normalizeTarget(game3_flanker.postErrorSlowingMs, 0, 80, 250);

  // Game 4: PGG
  const pggTrust = normalizeDirect(game4_pgg.initialContribution, 2, 10);
  const pggProsocial = normalizeDirect(game4_pgg.averageContribution, 2, 9);
  // freeRiderSensitivity is logged in raw coins (round-over-round contribution
  // delta, endowment = 10/round); rescale to a 0–1 fraction of the endowment
  // so it lines up with the 0.0/0.25/0.80 sweet-spot window below.
  const pggBoundaries = normalizeTarget(game4_pgg.freeRiderSensitivity / 10, 0.0, 0.25, 0.80);
  const pggDecayStability = normalizeTarget(game4_pgg.cooperationDecaySlope, -0.80, -0.15, 0.40);

  // --- Synthesis into 6 Core Axes ---

  // 1. Strategic Courage & Risk Acumen — Game 1 (BART) 80% + Game 4 (PGG) 20%
  const strategicCourage = (bartRiskAcumen * 0.50) + (pggTrust * 0.30) + (bartExplosionTolerance * 0.20);

  // 2. Cognitive Adaptability & Shift — Game 2 (WCST) 85% + Game 1 (BART) 15%
  const cognitiveAdaptability = (wcstPerseverative * 0.40) + (wcstCategories * 0.30) + (wcstFirstRuleSpeed * 0.20) + (wcstRuleMaintenance * 0.10);

  // 3. Selective Focus & Attentional Control — Game 3 (Flanker) 85% + Game 2 (WCST) 15%
  const selectiveFocus = (flankerInterference * 0.50) + (flankerIncongruentAcc * 0.35) + (wcstRuleMaintenance * 0.15);

  // 4. Impulse & Quality Control — Game 3 (Flanker) 60% + Game 1 (BART) 40%
  const impulseControl = (flankerIncongruentAcc * 0.40) + (flankerImpulse * 0.30) + (bartImpulseControl * 0.30);

  // 5. Team Collaboration & Social Trust — Game 4 (PGG) 80% + Game 2 (WCST) 20%
  const collaborationTrust = (pggProsocial * 0.50) + (pggTrust * 0.30) + (pggDecayStability * 0.20);

  // 6. Strategic Resilience & Boundaries — Game 4 (PGG) 60% + Game 3 (Flanker PES) 40%
  const strategicResilience = (pggBoundaries * 0.40) + (pggDecayStability * 0.30) + (flankerPes * 0.30);

  const axes = {
    strategicCourage: clamp(strategicCourage),
    cognitiveAdaptability: clamp(cognitiveAdaptability),
    selectiveFocus: clamp(selectiveFocus),
    impulseControl: clamp(impulseControl),
    collaborationTrust: clamp(collaborationTrust),
    strategicResilience: clamp(strategicResilience),
  };

  const overallIndex = clamp(
    (axes.strategicCourage +
      axes.cognitiveAdaptability +
      axes.selectiveFocus +
      axes.impulseControl +
      axes.collaborationTrust +
      axes.strategicResilience) / 6
  );

  return {
    sessionId: data.sessionId,
    generatedAt: new Date().toISOString(),
    axes,
    overallIndex,
  };
}
