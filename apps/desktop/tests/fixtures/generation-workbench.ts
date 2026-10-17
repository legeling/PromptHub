export function makeOutput(
  id: string,
  slotIndex: number,
  favorite = false,
): Record<string, unknown> {
  return {
    id,
    slotIndex,
    fileName: `${id}.png`,
    mimeType: "image/png",
    byteSize: 20,
    sha256: "a".repeat(64),
    createdAt: "2026-07-15T08:00:00.000Z",
    favorite,
  };
}

export function makeBatch(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    kind: "prompthub-generation-batch",
    version: 1,
    id: "batch-1",
    title: "Architecture poster",
    status: "succeeded",
    resolvedPrompt: "Minimal white concrete house",
    model: {
      id: "image-model-1",
      provider: "openai",
      model: "gpt-image-1",
    },
    parameters: { aspectRatio: "4:5" },
    targetCount: 2,
    slots: [
      { index: 0, status: "succeeded", output: makeOutput("output-1", 0) },
      { index: 1, status: "succeeded", output: makeOutput("output-2", 1) },
    ],
    counts: {
      total: 2,
      pending: 0,
      running: 0,
      succeeded: 2,
      failed: 0,
      cancelled: 0,
      interrupted: 0,
    },
    createdAt: "2026-07-15T08:00:00.000Z",
    updatedAt: "2026-07-15T08:01:00.000Z",
    completedAt: "2026-07-15T08:01:00.000Z",
    ...overrides,
  };
}
