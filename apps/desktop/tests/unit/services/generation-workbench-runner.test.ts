import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GenerationBatchManifest } from "@prompthub/shared/types";

const generateImage = vi.hoisted(() => vi.fn());

vi.mock("../../../src/renderer/services/ai", () => ({ generateImage }));

function batch(statuses: GenerationBatchManifest["slots"][number]["status"][]) {
  return {
    kind: "prompthub-generation-batch" as const,
    version: 1 as const,
    id: "8fc4e265-f289-4e68-bc7b-2a23af715a87",
    title: "Poster",
    status: "queued" as const,
    resolvedPrompt: "A poster",
    model: { id: "model-1", provider: "openai", model: "gpt-image-1" },
    parameters: { aspectRatio: "4:5", quality: "hd" as const },
    targetCount: statuses.length,
    slots: statuses.map((status, index) => ({ index, status })),
    counts: {
      total: statuses.length,
      pending: statuses.filter((status) => status === "pending").length,
      running: 0,
      succeeded: statuses.filter((status) => status === "succeeded").length,
      failed: statuses.filter((status) => status === "failed").length,
      cancelled: 0,
      interrupted: 0,
    },
    createdAt: "2026-07-15T00:00:00.000Z",
    updatedAt: "2026-07-15T00:00:00.000Z",
  } satisfies GenerationBatchManifest;
}

const publishNotificationMock = vi.fn().mockResolvedValue({ success: true });
describe("generation workbench runner", () => {
  it("reports one partial-failure summary for an entire batch", async () => {
    vi.mocked(window.api.generation.create).mockResolvedValue(
      batch(["pending", "pending"]),
    );
    vi.mocked(window.api.generation.commitOutput).mockResolvedValue(
      batch(["succeeded", "pending"]),
    );
    vi.mocked(window.api.generation.failSlot).mockResolvedValue(
      batch(["succeeded", "failed"]),
    );
    generateImage
      .mockResolvedValueOnce({ data: [{ b64_json: "aW1hZ2U=" }] })
      .mockRejectedValueOnce(new Error("provider unavailable"));
    const { startGenerationBatch } =
      await import("../../../src/renderer/services/generation-workbench-runner");
    await startGenerationBatch(
      {
        prompt: "A poster",
        model: { id: "model-1", provider: "openai", model: "gpt-image-1" },
        targetCount: 2,
      },
      {
        id: "model-1",
        type: "image",
        provider: "openai",
        model: "gpt-image-1",
        apiProtocol: "openai",
        apiKey: "test-key",
        apiUrl: "https://example.invalid/v1",
      },
    );
    await vi.waitFor(() =>
      expect(publishNotificationMock).toHaveBeenCalledWith(
        expect.objectContaining({
          category: "generation",
          outcome: "attention",
        }),
      ),
    );
    expect(publishNotificationMock).toHaveBeenCalledTimes(1);
  });

  it("does not announce completion after a batch was cancelled", async () => {
    let finish: (value: { data: Array<{ b64_json: string }> }) => void = () =>
      undefined;
    generateImage.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    vi.mocked(window.api.generation.cancel).mockResolvedValue(
      batch(["cancelled"]),
    );
    const { startGenerationBatch, cancelGenerationBatch } =
      await import("../../../src/renderer/services/generation-workbench-runner");
    const started = await startGenerationBatch(
      {
        prompt: "A poster",
        model: { id: "model-1", provider: "openai", model: "gpt-image-1" },
        targetCount: 1,
      },
      {
        id: "model-1",
        type: "image",
        provider: "openai",
        model: "gpt-image-1",
        apiProtocol: "openai",
        apiKey: "test-key",
        apiUrl: "https://example.invalid/v1",
      },
    );
    await vi.waitFor(() => expect(generateImage).toHaveBeenCalled());
    await cancelGenerationBatch(started.id);
    finish({ data: [{ b64_json: "aW1hZ2U=" }] });
    await Promise.resolve();
    await Promise.resolve();
    expect(window.api.generation.commitOutput).not.toHaveBeenCalled();
    expect(publishNotificationMock).not.toHaveBeenCalled();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    publishNotificationMock.mockResolvedValue({
      success: true,
      delivery: "inApp",
    });
    const initial = batch(["pending"]);
    Object.assign(window, {
      api: {
        generation: {
          create: vi.fn().mockResolvedValue(initial),
          markSlotRunning: vi.fn().mockResolvedValue({
            ...initial,
            slots: [{ index: 0, status: "running" }],
          }),
          commitOutput: vi.fn().mockResolvedValue({
            ...initial,
            status: "succeeded",
            slots: [{ index: 0, status: "succeeded" }],
          }),
          commitRemoteOutput: vi.fn().mockResolvedValue({
            ...initial,
            status: "succeeded",
            slots: [{ index: 0, status: "succeeded" }],
          }),
          failSlot: vi.fn(),
          cancel: vi.fn(),
          retryFailed: vi.fn(),
          setFavorite: vi.fn(),
          readOutputReference: vi.fn(),
        },
      },
      electron: {
        applicationNotifications: { publish: publishNotificationMock },
        downloadImage: vi.fn(),
        readImageBase64: vi.fn(),
      },
    });
    generateImage.mockResolvedValue({ data: [{ b64_json: "aW1hZ2U=" }] });
  });

  it("maps workbench parameters to the provider adapter and commits progressively", async () => {
    const { startGenerationBatch } =
      await import("../../../src/renderer/services/generation-workbench-runner");
    const config = {
      id: "model-1",
      type: "image" as const,
      provider: "openai",
      apiProtocol: "openai" as const,
      apiKey: "key",
      apiUrl: "https://example.com/v1",
      model: "gpt-image-1",
    };

    await startGenerationBatch(
      {
        prompt: "A poster",
        model: { id: "model-1", provider: "openai", model: "gpt-image-1" },
        targetCount: 1,
        aspectRatio: "4:5",
        quality: "hd",
      },
      config,
    );
    await vi.waitFor(() =>
      expect(window.api.generation.commitOutput).toHaveBeenCalled(),
    );

    await vi.waitFor(() =>
      expect(publishNotificationMock).toHaveBeenCalledWith(
        expect.objectContaining({ category: "generation", outcome: "success" }),
      ),
    );
    expect(publishNotificationMock).toHaveBeenCalledTimes(1);
    expect(generateImage).toHaveBeenCalledWith(config, "A poster", {
      quality: "hd",
      size: "1024x1536",
      n: 1,
      response_format: "b64_json",
    });
  });

  it("maps workbench ratios to Ideogram's aspect-ratio enum", async () => {
    const { startGenerationBatch } =
      await import("../../../src/renderer/services/generation-workbench-runner");
    const config = {
      id: "ideogram-model",
      type: "image" as const,
      provider: "ideogram",
      apiProtocol: "openai" as const,
      apiKey: "key",
      apiUrl: "https://api.ideogram.ai",
      model: "V_3",
    };

    await startGenerationBatch(
      {
        prompt: "A poster",
        model: {
          id: config.id,
          provider: config.provider,
          model: config.model,
        },
        targetCount: 1,
        aspectRatio: "4:5",
      },
      config,
    );
    await vi.waitFor(() => expect(generateImage).toHaveBeenCalled());

    expect(generateImage).toHaveBeenCalledWith(
      config,
      "A poster",
      expect.objectContaining({ aspect_ratio: "ASPECT_4_5" }),
    );
  });

  it("preflights and forwards Prompt references for supported models", async () => {
    const initial = batch(["pending"]);
    vi.mocked(window.api.generation.create).mockImplementation(
      async (input) => ({
        ...initial,
        referenceImages: input.referenceImages,
      }),
    );
    vi.mocked(window.electron!.readImageBase64!).mockResolvedValue("cmVm");
    const { startGenerationBatch } =
      await import("../../../src/renderer/services/generation-workbench-runner");
    const config = {
      id: "gemini-image",
      type: "image" as const,
      provider: "google",
      apiProtocol: "gemini" as const,
      apiKey: "key",
      apiUrl: "https://generativelanguage.googleapis.com/v1beta",
      model: "gemini-2.5-flash-image",
    };

    await startGenerationBatch(
      {
        prompt: "A poster",
        model: {
          id: config.id,
          provider: config.provider,
          model: config.model,
        },
        targetCount: 1,
        referenceImages: [{ source: "prompt", fileName: "reference.webp" }],
      },
      config,
    );

    await vi.waitFor(() => expect(generateImage).toHaveBeenCalled());
    expect(generateImage).toHaveBeenCalledWith(
      config,
      "A poster",
      expect.objectContaining({
        referenceImages: [{ base64: "cmVm", mimeType: "image/webp" }],
      }),
    );
  });

  it("loads managed local references through the same safe media bridge", async () => {
    const initial = batch(["pending"]);
    vi.mocked(window.api.generation.create).mockImplementation(
      async (input) => ({
        ...initial,
        referenceImages: input.referenceImages,
      }),
    );
    vi.mocked(window.electron!.readImageBase64!).mockResolvedValue("bG9jYWw=");
    const { startGenerationBatch } =
      await import("../../../src/renderer/services/generation-workbench-runner");
    const config = {
      id: "gemini-image",
      type: "image" as const,
      provider: "google",
      apiProtocol: "gemini" as const,
      apiKey: "key",
      apiUrl: "https://generativelanguage.googleapis.com/v1beta",
      model: "gemini-2.5-flash-image",
    };

    await startGenerationBatch(
      {
        prompt: "A poster",
        model: {
          id: config.id,
          provider: config.provider,
          model: config.model,
        },
        targetCount: 1,
        referenceImages: [
          { source: "local", fileName: "managed-reference.png" },
        ],
      },
      config,
    );

    await vi.waitFor(() => expect(generateImage).toHaveBeenCalled());
    expect(window.electron!.readImageBase64).toHaveBeenCalledWith(
      "managed-reference.png",
    );
    expect(generateImage).toHaveBeenCalledWith(
      config,
      "A poster",
      expect.objectContaining({
        referenceImages: [{ base64: "bG9jYWw=", mimeType: "image/png" }],
      }),
    );
  });

  it("supports ordered references for GPT Image models", async () => {
    const initial = batch(["pending"]);
    vi.mocked(window.api.generation.create).mockImplementation(
      async (input) => ({
        ...initial,
        resolvedPrompt: input.prompt,
        referenceImages: input.referenceImages,
      }),
    );
    vi.mocked(window.electron!.readImageBase64!).mockResolvedValue("cmVm");
    const { startGenerationBatch } =
      await import("../../../src/renderer/services/generation-workbench-runner");
    const config = {
      id: "openai-image",
      type: "image" as const,
      provider: "openai",
      apiProtocol: "openai" as const,
      apiKey: "key",
      apiUrl: "https://api.openai.com/v1",
      model: "gpt-image-1",
    };

    await startGenerationBatch(
      {
        prompt: "A poster",
        model: {
          id: config.id,
          provider: config.provider,
          model: config.model,
        },
        targetCount: 1,
        referenceImages: [{ source: "prompt", fileName: "reference.png" }],
      },
      config,
    );

    await vi.waitFor(() => expect(generateImage).toHaveBeenCalled());
    expect(generateImage).toHaveBeenCalledWith(
      config,
      "A poster",
      expect.objectContaining({
        referenceImages: [{ base64: "cmVm", mimeType: "image/png" }],
      }),
    );
  });

  it("loads a persisted generation output through the verified generation bridge", async () => {
    const initial = batch(["pending"]);
    vi.mocked(window.api.generation.create).mockImplementation(
      async (input) => ({
        ...initial,
        resolvedPrompt: input.prompt,
        referenceImages: input.referenceImages,
      }),
    );
    vi.mocked(window.api.generation.readOutputReference).mockResolvedValue({
      fileName: "output.webp",
      mimeType: "image/webp",
      base64: "Z2VuZXJhdGVk",
    });
    const { startGenerationBatch } =
      await import("../../../src/renderer/services/generation-workbench-runner");
    const config = {
      id: "openai-image",
      type: "image" as const,
      provider: "openai",
      apiProtocol: "openai" as const,
      apiKey: "key",
      apiUrl: "https://api.openai.com/v1",
      model: "gpt-image-1",
    };

    await startGenerationBatch(
      {
        prompt: "Turn the sky blue",
        model: {
          id: config.id,
          provider: config.provider,
          model: config.model,
        },
        targetCount: 1,
        referenceImages: [
          {
            source: "generation",
            batchId: "8fc4e265-f289-4e68-bc7b-2a23af715a87",
            outputId: "output-1",
            fileName: "output.webp",
          },
        ],
      },
      config,
    );

    expect(window.api.generation.readOutputReference).toHaveBeenCalledWith({
      batchId: "8fc4e265-f289-4e68-bc7b-2a23af715a87",
      outputId: "output-1",
    });
    await vi.waitFor(() =>
      expect(generateImage).toHaveBeenCalledWith(
        config,
        "Turn the sky blue",
        expect.objectContaining({
          referenceImages: [{ base64: "Z2VuZXJhdGVk", mimeType: "image/webp" }],
        }),
      ),
    );
  });

  it("rejects incomplete generation references before creating a batch", async () => {
    const { startGenerationBatch } =
      await import("../../../src/renderer/services/generation-workbench-runner");
    const config = {
      id: "openai-image",
      type: "image" as const,
      provider: "openai",
      apiProtocol: "openai" as const,
      apiKey: "key",
      apiUrl: "https://api.openai.com/v1",
      model: "gpt-image-1",
    };

    await expect(
      startGenerationBatch(
        {
          prompt: "A poster",
          model: {
            id: config.id,
            provider: config.provider,
            model: config.model,
          },
          targetCount: 1,
          referenceImages: [{ source: "generation", fileName: "output.png" }],
        },
        config,
      ),
    ).rejects.toThrow(/generation reference/i);
    expect(window.api.generation.create).not.toHaveBeenCalled();
  });

  it.each(["custom", "flux", "ideogram", "recraft", "replicate", "stability"])(
    "forwards references for arbitrary image models from %s",
    async (provider) => {
      const { startGenerationBatch } =
        await import("../../../src/renderer/services/generation-workbench-runner");
      const config = {
        id: "dall-e-image",
        type: "image" as const,
        provider,
        apiProtocol: "openai" as const,
        apiKey: "key",
        apiUrl: "https://api.openai.com/v1",
        model: "studio-image-model",
      };

      vi.mocked(window.electron!.readImageBase64!).mockResolvedValue("cmVm");
      await startGenerationBatch(
        {
          prompt: "A poster",
          model: {
            id: config.id,
            provider: config.provider,
            model: config.model,
          },
          targetCount: 1,
          referenceImages: [{ source: "prompt", fileName: "reference.png" }],
        },
        config,
      );
      await vi.waitFor(() => expect(generateImage).toHaveBeenCalled());
      expect(generateImage).toHaveBeenCalledWith(
        config,
        "A poster",
        expect.objectContaining({
          referenceImages: [{ base64: "cmVm", mimeType: "image/png" }],
        }),
      );
    },
  );

  it.each(["openai", "gemini"] as const)(
    "forwards all ordered references without an application count limit for %s",
    async (apiProtocol) => {
      const { startGenerationBatch } =
        await import("../../../src/renderer/services/generation-workbench-runner");
      const config = {
        id: "gemini-image",
        type: "image" as const,
        provider: "google",
        apiProtocol,
        apiKey: "key",
        apiUrl: "https://generativelanguage.googleapis.com/v1beta",
        model: "gemini-2.5-flash-image",
      };

      const fileNames = ["a.png", "b.png", "c.png", "d.png", "e.png"];
      for (const [index] of fileNames.entries()) {
        vi.mocked(window.electron!.readImageBase64!).mockResolvedValueOnce(
          `image-${index}`,
        );
      }
      await startGenerationBatch(
        {
          prompt: "A poster",
          model: {
            id: config.id,
            provider: config.provider,
            model: config.model,
          },
          targetCount: 1,
          referenceImages: fileNames.map((fileName) => ({
            source: "prompt" as const,
            fileName,
          })),
        },
        config,
      );
      await vi.waitFor(() => expect(generateImage).toHaveBeenCalled());
      expect(generateImage).toHaveBeenCalledWith(
        config,
        "A poster",
        expect.objectContaining({
          referenceImages: fileNames.map((_, index) => ({
            base64: `image-${index}`,
            mimeType: "image/png",
          })),
        }),
      );
    },
  );

  it("commits remote outputs without writing temporary Prompt media", async () => {
    generateImage.mockResolvedValue({
      data: [{ url: "https://cdn.example.com/output.jpg" }],
    });
    const { startGenerationBatch } =
      await import("../../../src/renderer/services/generation-workbench-runner");

    await startGenerationBatch(
      {
        prompt: "A poster",
        model: { id: "model-1", provider: "openai", model: "gpt-image-1" },
        targetCount: 1,
      },
      {
        id: "model-1",
        type: "image",
        provider: "openai",
        apiProtocol: "openai",
        apiKey: "key",
        apiUrl: "https://example.com/v1",
        model: "gpt-image-1",
      },
    );

    await vi.waitFor(() =>
      expect(window.api.generation.commitRemoteOutput).toHaveBeenCalledWith({
        batchId: expect.any(String),
        slotIndex: 0,
        url: "https://cdn.example.com/output.jpg",
      }),
    );
    expect(window.electron?.downloadImage).not.toHaveBeenCalled();
  });

  it("retries only slots returned as pending", async () => {
    const retried = batch(["succeeded", "pending"]);
    vi.mocked(window.api.generation.retryFailed).mockResolvedValue(retried);
    vi.mocked(window.api.generation.markSlotRunning).mockResolvedValue({
      ...retried,
      slots: [retried.slots[0], { index: 1, status: "running" }],
    });
    const { retryGenerationBatch } =
      await import("../../../src/renderer/services/generation-workbench-runner");

    await retryGenerationBatch(retried, {
      id: "model-1",
      type: "image",
      provider: "openai",
      apiProtocol: "openai",
      apiKey: "key",
      apiUrl: "https://example.com/v1",
      model: "gpt-image-1",
    });
    await vi.waitFor(() =>
      expect(window.api.generation.markSlotRunning).toHaveBeenCalledWith(
        retried.id,
        1,
      ),
    );
    expect(window.api.generation.markSlotRunning).toHaveBeenCalledTimes(1);
  });
});
