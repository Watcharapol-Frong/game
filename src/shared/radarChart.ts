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

export function computeRadarScore(game1: Game1Metrics): RadarScore {
  const maxPumps = 32;
  // Risk-taking: linear scale, 32 pumps = 100
  const riskTaking = clamp100((game1.adjustedAveragePumps / maxPumps) * 100);
  // Impulse control: inverse of explode rate
  const impulseControl = clamp100(
    (1 - game1.explodedTrialsCount / game1.totalTrials) * 100,
  );

  return {
    riskTaking,
    impulseControl,
    cognitiveFlexibility: 0, // populated when game2 is implemented
    prosociality: 0,          // populated when game4 is implemented
    processingSpeed: 0,       // populated when game3 is implemented
    sustainedAttention: 0,    // populated when game3 is implemented
  };
}
