export const PROMPT_GRAPH_SIMULATION = {
  cooldownTimeMs: 750,
  alphaMin: 0.08,
  velocityDecay: 0.32,
  motion: {
    off: { warmupTicks: 24, cooldownTicks: 0, alphaDecay: 0.18 },
    reduced: { warmupTicks: 8, cooldownTicks: 12, alphaDecay: 0.12 },
    standard: { warmupTicks: 24, cooldownTicks: 30, alphaDecay: 0.1 },
  },
};
