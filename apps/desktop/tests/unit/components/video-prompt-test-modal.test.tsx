import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { Prompt } from "@prompthub/shared/types";
import { VideoPromptTestModal } from "../../../src/renderer/components/prompt/VideoPromptTestModal";
import { normalizePersistedAIModels } from "../../../src/renderer/stores/settings/settings-ai";
import { useSettingsStore } from "../../../src/renderer/stores/settings.store";
import { renderWithI18n } from "../../helpers/i18n";

afterEach(() => {
  sessionStorage.clear();
  vi.unstubAllGlobals();
});
it("runs a video-only prompt with both reference kinds and reopens its task without resubmission", async () => {
  const models = normalizePersistedAIModels([
    {
      id: "v",
      model: "seedance",
      type: "video",
      videoProtocol: "ark",
      provider: "doubao",
      apiKey: "fixture",
      apiUrl: "https://ark.example/api/v3",
    },
  ]);
  useSettingsStore.setState({ aiModels: models });
  const request = vi
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      body: JSON.stringify({ id: "movie-17" }),
    })
    .mockResolvedValueOnce({
      ok: true,
      body: JSON.stringify({
        status: "succeeded",
        content: { video_url: "https://cdn.example/result.mp4" },
      }),
    });
  vi.stubGlobal("api", { ai: { request } });
  vi.stubGlobal("electron", { readImageBase64: async () => "YWJj" });
  const prompt: Prompt = {
    id: "prompt",
    title: "Camera",
    userPrompt: "Pan left",
    promptType: "video",
    images: ["still.png"],
    videos: ["clip.mp4"],
    isFavorite: false,
    isPinned: false,
    tags: [],
    variables: [],
    usageCount: 0,
    version: 1,
    currentVersion: 1,
    createdAt: "",
    updatedAt: "",
  };
  const dialog = () =>
    renderWithI18n(<VideoPromptTestModal prompt={prompt} onClose={vi.fn()} />, {
      language: "en",
    });
  const first = await dialog();
  const generate = await screen.findByRole("button", {
    name: "Generate video",
  });
  expect(generate).toBeDisabled();
  fireEvent.change(screen.getByRole("textbox", { name: "clip.mp4" }), {
    target: { value: "asset://clip" },
  });
  fireEvent.click(generate);
  expect(await screen.findByText("movie-17")).toBeVisible();
  expect(JSON.parse(request.mock.calls[0][0].body).content).toEqual([
    { type: "text", text: "Pan left" },
    {
      type: "image_url",
      role: "reference_image",
      image_url: { url: "data:image/png;base64,YWJj" },
    },
    {
      type: "video_url",
      role: "reference_video",
      video_url: { url: "asset://clip" },
    },
  ]);
  first.unmount();
  await dialog();
  fireEvent.click(await screen.findByRole("button", { name: "Refresh" }));
  await waitFor(() =>
    expect(
      screen.getByRole("link", { name: "Open original video" }),
    ).toHaveAttribute("href", "https://cdn.example/result.mp4"),
  );
  expect(request.mock.calls.map(([call]) => call.method)).toEqual([
    "POST",
    "GET",
  ]);
});
