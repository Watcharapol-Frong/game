// Computes a normalised 6-axis psychometric score for radar chart rendering.
// Axes: RiskTaking, Impulse Control, Cognitive Flexibility,
//       Prosociality, Processing Speed, Sustained Attention

export interface RadarScore {
  riskTaking: number;        // 0–100, from game1-bart adjustedAveragePumps
  impulseControl: number;    // 0–100, from game1-bart explode rate (inverted)
  cognitiveFlexibility: number; // 0–100, from game2-wcst (stub)
  prosociality: number;         // 0–100, from game4-pgg (stub)
  processingSpeed: number;      // 0–100, from game3-flanker RT (stub)
  sustainedAttention: number;   // 0–100, from game3-flanker accuracy (stub)
}

// Clamp a value to [0, 100]
function clamp100(v: number): number {
  return Math.max(0, Math.min(100, v));
}

export interface Game1Metrics {
  adjustedAveragePumps: number;
  explodedTrialsCount: number;
  totalTrials: number;
}

export interface Game2Metrics {
  categoriesCompleted: number;    // 0–6
  perseverativeErrorRate: number; // 0.0–1.0
}

export interface Game3Metrics {
  meanCongruentRtMs: number;    // processing speed proxy — lower = faster
  incongruentAccuracy: number;  // 0.0–1.0 — sustained attention proxy
}

export function computeRadarScore(game1: Game1Metrics, game2?: Game2Metrics, game3?: Game3Metrics): RadarScore {
  const maxPumps = 32;
  const riskTaking = clamp100((game1.adjustedAveragePumps / maxPumps) * 100);
  const impulseControl = clamp100(
    (1 - game1.explodedTrialsCount / game1.totalTrials) * 100,
  );

  // cognitiveFlexibility: how many categories cleared, penalised by perseverative error rate
  const cognitiveFlexibility = game2
    ? clamp100((game2.categoriesCompleted / 6) * 100 * (1 - game2.perseverativeErrorRate))
    : 0;

  // processingSpeed: 400 ms → 100, 1200 ms → 0
  const processingSpeed = game3
    ? clamp100(((1200 - game3.meanCongruentRtMs) / 800) * 100)
    : 0;

  // sustainedAttention: incongruent accuracy maps directly to 0–100
  const sustainedAttention = game3
    ? clamp100(game3.incongruentAccuracy * 100)
    : 0;

  return {
    riskTaking,
    impulseControl,
    cognitiveFlexibility,
    prosociality: 0,
    processingSpeed,
    sustainedAttention,
  };
}
