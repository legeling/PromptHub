import { makeBatch, makeOutput } from "../../fixtures/generation-workbench";
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ImageGenerationReferencePicker } from "../../../src/renderer/components/prompt/ImageGenerationReferencePicker";
import { ImageGenerationWorkbench } from "../../../src/renderer/components/prompt/ImageGenerationWorkbench";
import { TopBar } from "../../../src/renderer/components/layout/TopBar";
import { usePromptStore } from "../../../src/renderer/stores/prompt.store";
import { useSettingsStore } from "../../../src/renderer/stores/settings.store";
import { useUIStore } from "../../../src/renderer/stores/ui.store";
import { renderWithI18n } from "../../helpers/i18n";

const runner = vi.hoisted(() => ({
  load: vi.fn().mockResolvedValue([]),
  start: vi.fn(),
  cancel: vi.fn(),
  favorite: vi.fn(),
  retry: vi.fn(),
  copyToPrompt: vi.fn(),
  listeners: [] as Array<(batches: unknown[]) => void>,
}));

const copyImage = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("../../../src/renderer/services/generation-image-clipboard", () => ({
  copyGenerationImage: copyImage,
}));

const clipboard = vi.hoisted(() => ({
  writeText: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../src/renderer/services/generation-workbench-runner", () => ({
  loadGenerationBatches: runner.load,
  startGenerationBatch: runner.start,
  cancelGenerationBatch: runner.cancel,
  setGenerationOutputFavorite: runner.favorite,
  retryGenerationBatch: runner.retry,
  copyGenerationOutputToPromptMedia: runner.copyToPrompt,
  getSupportedGenerationAspectRatios: () => ["1:1", "4:5", "16:9", "9:16"],
  subscribeGenerationBatches: (listener: (batches: unknown[]) => void) => {
    runner.listeners.push(listener);
    return () => {
      runner.listeners = runner.listeners.filter((item) => item !== listener);
    };
  },
}));

const toast = vi.hoisted(() => vi.fn());
vi.mock("../../../src/renderer/components/ui/Toast", () => ({
  useToast: () => ({ showToast: toast }),
}));

Object.defineProperty(navigator, "clipboard", {
  value: clipboard,
  configurable: true,
});

function emitBatches(batches: unknown[]) {
  act(() => runner.listeners.forEach((listener) => listener(batches)));
}

describe("ImageGenerationWorkbench", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runner.listeners = [];
    runner.load.mockResolvedValue([]);
    runner.start.mockResolvedValue({ id: "batch-1" });
    runner.copyToPrompt.mockResolvedValue("copied-output.png");
    vi.mocked(window.electron!.selectImage!).mockResolvedValue([]);
    vi.mocked(window.electron!.saveImage!).mockResolvedValue([]);
    vi.mocked(window.electron!.saveImageBuffer!).mockResolvedValue(null);
    const sourcePrompt = {
      id: "image-prompt-1",
      title: "Architecture poster",
      promptType: "image" as const,
      userPrompt: "Minimal white concrete house",
      variables: [],
      tags: [],
      isFavorite: false,
      isPinned: false,
      version: 2,
      currentVersion: 2,
      usageCount: 0,
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
    };
    usePromptStore.setState({
      prompts: [sourcePrompt],
      promptDetailCache: { [sourcePrompt.id]: sourcePrompt },
    });
    useSettingsStore.setState({
      aiModels: [
        {
          id: "image-model-1",
          type: "image",
          provider: "openai",
          apiProtocol: "openai",
          apiKey: "test-key",
          apiUrl: "https://example.com/v1",
          model: "gpt-image-1",
        },
      ],
    });
    useUIStore.setState({
      isSidebarCollapsed: false,
      isWorkbenchSidebarExpanded: false,
    });
  });

  it("uses themed selectors and submits the chosen ratio and quality", async () => {
    await renderWithI18n(<ImageGenerationWorkbench />);
    expect(screen.queryByRole("combobox")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Source Prompt" }));
    fireEvent.click(
      screen.getByRole("option", { name: "Architecture poster" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Model" }));
    fireEvent.click(screen.getByRole("option", { name: "gpt-image-1" }));
    fireEvent.click(screen.getByRole("button", { name: "Ratio" }));
    fireEvent.click(screen.getByRole("option", { name: "16:9" }));
    fireEvent.click(screen.getByRole("button", { name: "Quality" }));
    fireEvent.click(screen.getByRole("option", { name: "High" }));
    expect(screen.queryByRole("listbox")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    await waitFor(() => expect(runner.start).toHaveBeenCalled());
    expect(runner.start.mock.calls[0][0]).toMatchObject({
      aspectRatio: "16:9",
      quality: "hd",
    });
  });

  it("prefills an image Prompt and submits a bounded local batch", async () => {
    await renderWithI18n(<ImageGenerationWorkbench />);

    expect(screen.getByLabelText("Image count")).toHaveValue(1);
    fireEvent.click(screen.getByRole("button", { name: "Increase count" }));
    expect(screen.getByLabelText("Image count")).toHaveValue(2);
    fireEvent.click(screen.getByRole("button", { name: "Decrease count" }));
    expect(screen.getByLabelText("Image count")).toHaveValue(1);

    fireEvent.click(screen.getByRole("button", { name: "Source Prompt" }));
    fireEvent.click(
      screen.getByRole("option", { name: "Architecture poster" }),
    );
    expect(screen.getByRole("textbox")).toHaveValue(
      "Minimal white concrete house",
    );
    fireEvent.change(screen.getByLabelText("Image count"), {
      target: { value: "12" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));

    await waitFor(() => expect(runner.start).toHaveBeenCalledTimes(1));
    expect(runner.start.mock.calls[0][0]).toMatchObject({
      title: "Architecture poster",
      sourcePromptId: "image-prompt-1",
      sourcePromptVersion: 2,
      prompt: "Minimal white concrete house",
      targetCount: 12,
    });
  });

  it("submits only explicitly selected Prompt references with a compatible model", async () => {
    usePromptStore.setState({
      prompts: [
        {
          ...usePromptStore.getState().prompts[0],
          images: ["reference.webp"],
        },
      ],
    });
    useSettingsStore.setState({
      aiModels: [
        {
          ...useSettingsStore.getState().aiModels[0],
          provider: "google",
          apiProtocol: "gemini",
          model: "gemini-2.5-flash-image",
        },
      ],
    });
    await renderWithI18n(<ImageGenerationWorkbench />);

    fireEvent.click(screen.getByRole("button", { name: "Source Prompt" }));
    fireEvent.click(
      screen.getByRole("option", { name: "Architecture poster" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Reference images" }));
    expect(screen.getAllByText("0 reference(s)")).toHaveLength(2);
    fireEvent.click(
      screen.getByRole("button", { name: "Choose from Prompts" }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Select reference.webp from Architecture poster",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit image" }));

    await waitFor(() => expect(runner.start).toHaveBeenCalled());
    expect(runner.start.mock.calls[0][0]).toMatchObject({
      referenceImages: [
        {
          source: "prompt",
          fileName: "reference.webp",
          promptId: "image-prompt-1",
        },
      ],
    });
  });

  it("bounds the Prompt reference gallery and reveals more media on demand", async () => {
    usePromptStore.setState({
      prompts: [
        {
          ...usePromptStore.getState().prompts[0],
          images: Array.from({ length: 25 }, (_, index) => `ref-${index}.png`),
        },
      ],
    });
    useSettingsStore.setState({
      aiModels: [
        {
          ...useSettingsStore.getState().aiModels[0],
          provider: "google",
          apiProtocol: "gemini",
          model: "gemini-2.5-flash-image",
        },
      ],
    });
    await renderWithI18n(<ImageGenerationWorkbench />);

    fireEvent.click(screen.getByRole("button", { name: "Reference images" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Choose from Prompts" }),
    );

    expect(
      screen.getByRole("button", {
        name: "Select ref-23.png from Architecture poster",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "Select ref-24.png from Architecture poster",
      }),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Show more Prompt images" }),
    );
    expect(
      screen.getByRole("button", {
        name: "Select ref-24.png from Architecture poster",
      }),
    ).toBeInTheDocument();
  });

  it("keeps an orphaned Prompt reference identifiable after its source is gone", async () => {
    await renderWithI18n(
      <ImageGenerationReferencePicker
        prompts={[]}
        references={[
          {
            source: "prompt",
            fileName: "orphaned-reference.png",
            promptId: "deleted-prompt",
          },
        ]}
        onAddLocalImages={vi.fn()}
        onDropLocalImages={vi.fn()}
        onAddPromptImage={vi.fn()}
        onRemove={vi.fn()}
        onMove={vi.fn()}
      />,
    );

    const reference = screen.getByRole("listitem", {
      name: "Reference image 1: orphaned-reference.png",
    });
    expect(screen.getByText("Prompt media")).toBeInTheDocument();
    fireEvent.dragStart(reference);
    fireEvent.dragEnd(reference);
  });

  it("does not silently select source Prompt images", async () => {
    usePromptStore.setState({
      prompts: [
        {
          ...usePromptStore.getState().prompts[0],
          images: ["reference.webp"],
        },
      ],
    });
    useSettingsStore.setState({
      aiModels: [
        {
          ...useSettingsStore.getState().aiModels[0],
          provider: "google",
          apiProtocol: "gemini",
          model: "gemini-2.5-flash-image",
        },
      ],
    });
    await renderWithI18n(<ImageGenerationWorkbench />);

    fireEvent.click(screen.getByRole("button", { name: "Source Prompt" }));
    fireEvent.click(
      screen.getByRole("option", { name: "Architecture poster" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));

    await waitFor(() => expect(runner.start).toHaveBeenCalled());
    expect(runner.start.mock.calls[0][0].referenceImages).toEqual([]);
  });

  it("adds local references from the file picker and removes them", async () => {
    useSettingsStore.setState({
      aiModels: [
        {
          ...useSettingsStore.getState().aiModels[0],
          provider: "google",
          apiProtocol: "gemini",
          model: "gemini-2.5-flash-image",
        },
      ],
    });
    vi.mocked(window.electron!.selectImage!).mockResolvedValue([
      "/tmp/reference.png",
    ]);
    vi.mocked(window.electron!.saveImage!).mockResolvedValue([
      "managed-reference.png",
    ]);
    await renderWithI18n(<ImageGenerationWorkbench />);

    fireEvent.click(screen.getByRole("button", { name: "Reference images" }));
    fireEvent.click(screen.getByRole("button", { name: "Add local images" }));
    expect(await screen.findAllByText("1 reference(s)")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Edit image" })).toBeVisible();
    expect(window.electron!.saveImage).toHaveBeenCalledWith([
      "/tmp/reference.png",
    ]);

    fireEvent.click(
      screen.getByRole("button", { name: "Remove managed-reference.png" }),
    );
    expect(screen.getAllByText("0 reference(s)")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Generate" })).toBeVisible();
  });

  it("does not copy unsupported picker files into managed reference storage", async () => {
    useSettingsStore.setState({
      aiModels: [
        {
          ...useSettingsStore.getState().aiModels[0],
          provider: "google",
          apiProtocol: "gemini",
          model: "gemini-2.5-flash-image",
        },
      ],
    });
    vi.mocked(window.electron!.selectImage!).mockResolvedValue([
      "/tmp/reference.gif",
      "/tmp/reference.webp",
    ]);
    vi.mocked(window.electron!.saveImage!).mockResolvedValue([
      "managed-reference.webp",
    ]);
    await renderWithI18n(<ImageGenerationWorkbench />);

    fireEvent.click(screen.getByRole("button", { name: "Reference images" }));
    fireEvent.click(screen.getByRole("button", { name: "Add local images" }));

    expect(await screen.findAllByText("1 reference(s)")).toHaveLength(2);
    expect(window.electron!.saveImage).toHaveBeenCalledWith([
      "/tmp/reference.webp",
    ]);
  });

  it("accepts dropped local images and preserves drag ordering", async () => {
    usePromptStore.setState({
      prompts: [
        {
          ...usePromptStore.getState().prompts[0],
          images: ["prompt-reference.webp", "animated-reference.gif"],
        },
      ],
    });
    useSettingsStore.setState({
      aiModels: [
        {
          ...useSettingsStore.getState().aiModels[0],
          provider: "google",
          apiProtocol: "gemini",
          model: "gemini-2.5-flash-image",
        },
      ],
    });
    vi.mocked(window.electron!.saveImageBuffer!).mockResolvedValue(
      "dropped-reference.png",
    );
    await renderWithI18n(<ImageGenerationWorkbench />);

    fireEvent.click(screen.getByRole("button", { name: "Reference images" }));
    const dropped = new File([new Uint8Array([1, 2, 3])], "dropped.png", {
      type: "image/png",
    });
    Object.defineProperty(dropped, "arrayBuffer", {
      value: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]).buffer),
    });
    const dropzone = screen.getByTestId("generation-reference-dropzone");
    fireEvent.dragOver(dropzone, {
      dataTransfer: { dropEffect: "none", files: [dropped] },
    });
    fireEvent.drop(dropzone, {
      dataTransfer: { files: [dropped] },
    });
    expect(await screen.findAllByText("1 reference(s)")).toHaveLength(2);

    fireEvent.click(
      screen.getByRole("button", { name: "Choose from Prompts" }),
    );
    expect(
      screen.queryByRole("button", {
        name: "Select animated-reference.gif from Architecture poster",
      }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Select prompt-reference.webp from Architecture poster",
      }),
    );
    const first = screen.getByRole("listitem", {
      name: "Reference image 1: dropped-reference.png",
    });
    const second = screen.getByRole("listitem", {
      name: "Reference image 2: prompt-reference.webp",
    });
    fireEvent.dragStart(first);
    fireEvent.dragOver(second);
    fireEvent.drop(second);
    fireEvent.dragOver(dropzone, {
      dataTransfer: { dropEffect: "none", files: [dropped] },
    });
    fireEvent.drop(dropzone, {
      dataTransfer: { files: [dropped] },
    });
    await waitFor(() =>
      expect(window.electron!.saveImageBuffer).toHaveBeenCalledTimes(2),
    );
    expect(
      screen.getByRole("button", { name: "Add local images" }),
    ).toBeEnabled();

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "A poster" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Edit image" }));
    await waitFor(() => expect(runner.start).toHaveBeenCalled());
    expect(runner.start.mock.calls[0][0].referenceImages).toEqual([
      {
        source: "prompt",
        fileName: "prompt-reference.webp",
        promptId: "image-prompt-1",
      },
      { source: "local", fileName: "dropped-reference.png" },
    ]);
  });

  it("keeps generation disabled for invalid counts", async () => {
    await renderWithI18n(<ImageGenerationWorkbench />);
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Poster" },
    });
    fireEvent.change(screen.getByLabelText("Image count"), {
      target: { value: "101" },
    });
    expect(screen.getByRole("button", { name: "Generate" })).toBeDisabled();
  });

  it("explains why generation is unavailable when no image model is configured", async () => {
    useSettingsStore.setState({ aiModels: [] });

    await renderWithI18n(<ImageGenerationWorkbench />);
    expect(screen.getByRole("button", { name: "Model" })).toBeDisabled();

    expect(
      screen.getByText("Please configure an image model in settings first"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate" })).toBeDisabled();
  });

  it("requires Prompt variables and submits the resolved snapshot without an Advanced toggle", async () => {
    const variablePrompt = {
      ...usePromptStore.getState().promptDetailCache["image-prompt-1"],
      userPrompt: "A {{style}} poster for {{subject:PromptHub}}",
      variables: [
        { name: "style", type: "text" as const, required: true },
        { name: "subject", type: "text" as const, required: false },
      ],
    };
    usePromptStore.setState({
      prompts: [variablePrompt],
      promptDetailCache: { [variablePrompt.id]: variablePrompt },
    });
    await renderWithI18n(<ImageGenerationWorkbench />);

    fireEvent.click(screen.getByRole("button", { name: "Source Prompt" }));
    fireEvent.click(
      screen.getByRole("option", { name: "Architecture poster" }),
    );
    expect(
      screen.queryByRole("button", { name: "Advanced" }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("style")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("style"), {
      target: { value: "Swiss" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));

    await waitFor(() => expect(runner.start).toHaveBeenCalled());
    expect(runner.start.mock.calls[0][0]).toMatchObject({
      prompt: "A Swiss poster for PromptHub",
      variableValues: { style: "Swiss", subject: "" },
    });
  });

  it("reflows the gallery beside an on-demand inspector without covering it", async () => {
    useUIStore.setState({ appModule: "prompt", viewMode: "prompt" });
    usePromptStore.setState({ viewMode: "generation", searchQuery: "" });
    await renderWithI18n(
      <>
        <TopBar onOpenSettings={vi.fn()} />
        <ImageGenerationWorkbench />
      </>,
    );

    const gallery = screen.getByTestId("generation-gallery");
    const config = screen.getByTestId("generation-config-panel");
    const content = screen.getByTestId("generation-workbench-content");
    expect(
      screen.queryByTestId("generation-batch-rail"),
    ).not.toBeInTheDocument();
    expect(content).toHaveClass("flex", "min-h-0", "flex-1", "overflow-hidden");
    expect(content.previousElementSibling?.tagName).toBe("HEADER");
    expect(gallery.parentElement).toBe(content);
    expect(config.parentElement).toBe(content);
    expect(gallery).toHaveClass("flex-1");
    expect(config).toHaveClass(
      "w-[clamp(320px,30vw,390px)]",
      "shrink-0",
      "border-l",
    );
    expect(config).not.toHaveClass("absolute", "fixed", "top-14", "bottom-0");
    expect(
      within(config).getByRole("tab", { name: "Generation settings" }),
    ).toHaveAttribute("aria-selected", "true");
    expect(
      within(config).getByRole("tab", { name: "History works" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "New batch" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Expand" }));
    expect(useUIStore.getState().isWorkbenchSidebarExpanded).toBe(true);
    expect(
      screen.queryByTestId("generation-config-panel"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Image Workbench" }),
    ).toHaveClass("sr-only");
    const compactNewBatch = screen.getByRole("button", { name: "New batch" });
    expect(compactNewBatch).toHaveClass("w-8", "px-0");
    expect(within(compactNewBatch).getByText("New batch")).toHaveClass(
      "sr-only",
    );
    fireEvent.click(screen.getByRole("button", { name: "Collapse" }));
    expect(useUIStore.getState().isWorkbenchSidebarExpanded).toBe(false);
    expect(
      screen.queryByTestId("generation-config-panel"),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Details" }));
    expect(useUIStore.getState().isWorkbenchSidebarExpanded).toBe(false);
    expect(screen.getByTestId("generation-config-panel")).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Image Workbench" }),
    ).not.toHaveClass("sr-only");
    fireEvent.click(screen.getByRole("button", { name: "Close details" }));
    expect(
      screen.queryByTestId("generation-config-panel"),
    ).not.toBeInTheDocument();
  });

  it("keeps New and History mutually exclusive with the Prompts secondary sidebar", async () => {
    useUIStore.setState({ appModule: "prompt", viewMode: "prompt" });
    usePromptStore.setState({ viewMode: "generation", searchQuery: "" });
    await renderWithI18n(
      <>
        <TopBar onOpenSettings={vi.fn()} />
        <ImageGenerationWorkbench />
      </>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Close details" }));
    fireEvent.click(screen.getByRole("button", { name: "Expand" }));
    expect(useUIStore.getState().isWorkbenchSidebarExpanded).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "New batch" }));
    expect(useUIStore.getState().isWorkbenchSidebarExpanded).toBe(false);
    expect(
      screen.getByRole("tab", { name: "Generation settings" }),
    ).toHaveAttribute("aria-selected", "true");

    fireEvent.click(screen.getByRole("button", { name: "Close details" }));
    fireEvent.click(screen.getByRole("button", { name: "Expand" }));
    fireEvent.click(screen.getByRole("button", { name: "History works" }));
    expect(useUIStore.getState().isWorkbenchSidebarExpanded).toBe(false);
    expect(screen.getByRole("tab", { name: "History works" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("switches batches from the compact header menu", async () => {
    await renderWithI18n(<ImageGenerationWorkbench />);
    const batchA = makeBatch();
    const batchB = makeBatch({
      id: "batch-2",
      title: "Neon city",
      slots: [
        { index: 0, status: "succeeded", output: makeOutput("output-9", 0) },
      ],
      counts: {
        total: 1,
        pending: 0,
        running: 0,
        succeeded: 1,
        failed: 0,
        cancelled: 0,
        interrupted: 0,
      },
    });
    emitBatches([batchA, batchB]);

    fireEvent.click(screen.getByRole("button", { name: "Switch batch" }));
    const menu = screen.getByRole("listbox", { name: "Switch batch" });
    expect(within(menu).getByText("Architecture poster")).toBeInTheDocument();
    fireEvent.click(within(menu).getByText("Neon city"));

    expect(
      screen.getByRole("button", { name: "Switch batch" }),
    ).toHaveTextContent("Neon city");
    expect(
      screen.getByRole("button", { name: "Generated image 1" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Generated image 2" }),
    ).not.toBeInTheDocument();
  });

  it("opens a clean draft while keeping batch history reachable", async () => {
    await renderWithI18n(<ImageGenerationWorkbench />);
    emitBatches([makeBatch()]);
    expect(
      screen.getByRole("button", { name: "Generated image 1" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Details" }));
    fireEvent.change(screen.getByLabelText("Image count"), {
      target: { value: "8" },
    });

    fireEvent.click(screen.getByRole("button", { name: "New batch" }));

    expect(
      screen.getByRole("tab", { name: "Generation settings" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveValue("");
    expect(screen.getByLabelText("Image count")).toHaveValue(1);
    expect(
      screen.queryByRole("button", { name: "Generated image 1" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("Choose a Prompt and model to start a new batch."),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Switch batch" }));
    fireEvent.click(
      within(screen.getByRole("listbox", { name: "Switch batch" })).getByText(
        "Architecture poster",
      ),
    );
    expect(
      screen.getByRole("button", { name: "Generated image 1" }),
    ).toBeInTheDocument();
  });

  it("keeps basic image parameters visible and reference images collapsed", async () => {
    useSettingsStore.setState({
      aiModels: [
        {
          ...useSettingsStore.getState().aiModels[0],
          provider: "google",
          apiProtocol: "gemini",
          model: "gemini-2.5-flash-image",
        },
      ],
    });
    await renderWithI18n(<ImageGenerationWorkbench />);

    const model = screen.getByLabelText("Model");
    fireEvent.click(model);
    fireEvent.click(
      screen.getByRole("option", { name: "gemini-2.5-flash-image" }),
    );

    expect(screen.getByLabelText("Ratio")).toHaveTextContent("1:1");
    expect(screen.getByLabelText("Quality")).toHaveTextContent("Standard");
    expect(screen.getByText("Image count")).toBeInTheDocument();
    expect(screen.getByLabelText("Image count").closest("footer")).toBeNull();
    fireEvent.click(screen.getByLabelText("Ratio"));
    fireEvent.click(screen.getByRole("option", { name: "4:5" }));
    expect(screen.getByLabelText("Ratio")).toHaveTextContent("4:5");
    fireEvent.click(screen.getByLabelText("Quality"));
    fireEvent.click(screen.getByRole("option", { name: "High" }));
    expect(screen.getByLabelText("Quality")).toHaveTextContent("High");

    const referenceImages = screen.getByRole("button", {
      name: "Reference images",
    });
    expect(referenceImages).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("None")).not.toBeInTheDocument();

    fireEvent.click(referenceImages);
    expect(referenceImages).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByText("0 reference(s)")).toHaveLength(2);
    expect(screen.getByTestId("generation-reference-dropzone")).toHaveClass(
      "min-h-28",
      "border-dashed",
    );
  });

  it("uploads and submits every reference for an arbitrary custom image model", async () => {
    usePromptStore.setState({
      prompts: [
        {
          ...usePromptStore.getState().prompts[0],
          images: ["reference.webp"],
        },
      ],
    });
    useSettingsStore.setState({
      aiModels: [
        {
          ...useSettingsStore.getState().aiModels[0],
          provider: "custom",
          model: "studio-image-model",
        },
      ],
    });
    await renderWithI18n(<ImageGenerationWorkbench />);

    fireEvent.click(screen.getByRole("button", { name: "Reference images" }));

    const fileNames = ["a.png", "b.png", "c.png", "d.png", "e.png"];
    vi.mocked(window.electron!.selectImage!).mockResolvedValue(fileNames);
    vi.mocked(window.electron!.saveImage!).mockResolvedValue(fileNames);
    fireEvent.click(screen.getByRole("button", { name: "Add local images" }));
    await waitFor(() =>
      expect(screen.getAllByRole("listitem")).toHaveLength(fileNames.length),
    );
    expect(window.electron!.saveImage).toHaveBeenCalledWith(fileNames);
    expect(
      screen.getByRole("button", { name: "Add local images" }),
    ).toBeEnabled();
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "A poster" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Edit image" }));
    await waitFor(() => expect(runner.start).toHaveBeenCalled());
    expect(runner.start.mock.calls[0][0].referenceImages).toEqual(
      fileNames.map((fileName) => ({ source: "local", fileName })),
    );
    expect(runner.start.mock.calls[0][1]).toMatchObject({
      model: "studio-image-model",
      provider: "custom",
    });
  });

  it("keeps gallery filters, sort, and density inside one workbench menu", async () => {
    await renderWithI18n(<ImageGenerationWorkbench />);

    expect(
      screen.queryByRole("button", { name: "All works" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Latest first" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Compact grid" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Workbench actions" }));
    const menu = screen.getByRole("menu", { name: "Workbench actions" });
    fireEvent.click(within(menu).getByRole("button", { name: "All works" }));
    expect(within(menu).getByRole("button", { name: "All works" })).toHaveClass(
      "text-primary",
    );
    expect(
      within(menu).getByRole("button", { name: "Latest first" }),
    ).toBeVisible();
    expect(
      within(menu).getByRole("button", { name: "Compact grid" }),
    ).toBeVisible();
    expect(
      within(menu).getByRole("button", { name: "Large grid" }),
    ).toBeVisible();
    expect(
      within(menu).getByRole("button", { name: "List view" }),
    ).toBeVisible();
  });

  it("returns to the focused review surface after a successful submit", async () => {
    await renderWithI18n(<ImageGenerationWorkbench />);
    expect(
      screen.getByRole("tab", { name: "Generation settings" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Source Prompt" }));
    fireEvent.click(
      screen.getByRole("option", { name: "Architecture poster" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    await waitFor(() => expect(runner.start).toHaveBeenCalled());

    expect(
      screen.queryByTestId("generation-config-panel"),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Details" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Details" }));
    expect(screen.getByTestId("generation-config-panel")).toHaveClass(
      "w-[clamp(320px,30vw,390px)]",
    );
    expect(
      screen.getByRole("tab", { name: "Generation settings" }),
    ).toBeVisible();
  });

  it("opens the on-demand inspector for bounded history and closes it", async () => {
    await renderWithI18n(<ImageGenerationWorkbench />);
    const batchA = makeBatch();
    const batchB = makeBatch({ id: "batch-2", title: "Neon city" });
    emitBatches([batchA, batchB]);

    expect(
      screen.queryByTestId("generation-config-panel"),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "History works" }));

    expect(screen.getByRole("tab", { name: "History works" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      screen.getByRole("button", { name: /Architecture poster/ }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: /Neon city/ })).toBeVisible();
    expect(screen.queryByLabelText("Model")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Neon city/ }));
    expect(
      screen.getByRole("button", { name: "Switch batch" }),
    ).toHaveTextContent("Neon city");
    expect(screen.getByRole("tab", { name: "History works" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: "Close details" }));
    expect(
      screen.queryByTestId("generation-config-panel"),
    ).not.toBeInTheDocument();
  });

  it("bounds mounted history rows and shows an empty history state", async () => {
    await renderWithI18n(<ImageGenerationWorkbench />);
    fireEvent.click(screen.getByRole("button", { name: "History works" }));
    expect(screen.getByText("No generation history yet.")).toBeVisible();

    const statuses = [
      "succeeded",
      "failed",
      "partially_succeeded",
      "running",
      "queued",
      "cancelling",
      "cancelled",
    ] as const;
    emitBatches(
      Array.from({ length: 101 }, (_, index) =>
        makeBatch({
          id: `batch-${index}`,
          title: `History batch ${index}`,
          status: statuses[index % statuses.length],
          model: {
            id: "image-model-1",
            provider: "openai",
            model: "gpt-image-1",
            name: index === 0 ? "GPT Image" : undefined,
          },
        }),
      ),
    );

    const panel = screen.getByRole("tabpanel");
    expect(within(panel).getAllByRole("button")).toHaveLength(100);
    expect(
      within(panel).getByText(/Showing the latest 100 batches/),
    ).toBeVisible();
    expect(screen.queryByText("History batch 100")).not.toBeInTheDocument();
  });

  it("uses a focused review stage with a switchable thumbnail strip", async () => {
    await renderWithI18n(<ImageGenerationWorkbench />);
    emitBatches([makeBatch()]);

    const primary = screen.getByTestId("generation-primary-preview");
    const moreActions = screen.getByRole("button", { name: "More actions" });
    expect(primary.parentElement).not.toContainElement(moreActions);
    expect(
      moreActions.compareDocumentPosition(primary) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getAllByTestId("generation-review-thumbnail")[0]).toHaveClass(
      "aspect-video",
      "w-[clamp(112px,13vw,180px)]",
    );
    expect(within(primary).getByRole("img")).toHaveAttribute(
      "src",
      expect.stringContaining("output-1.png"),
    );

    fireEvent.click(screen.getByRole("button", { name: "Generated image 2" }));
    expect(within(primary).getByRole("img")).toHaveAttribute(
      "src",
      expect.stringContaining("output-2.png"),
    );
    expect(
      screen.getByRole("button", { name: "Selected generated image 2" }),
    ).toBeVisible();
  });

  it("keeps review actions behind More and right-click on the focused stage", async () => {
    const updatePrompt = vi.fn().mockResolvedValue(undefined);
    usePromptStore.setState({ updatePrompt });
    const imageModel = useSettingsStore.getState().aiModels[0];
    useSettingsStore.setState({
      aiModels: [
        { ...imageModel, provider: "custom", model: "studio-image-model" },
        { ...imageModel, id: "other-image-model" },
      ],
    });
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    await renderWithI18n(<ImageGenerationWorkbench />);
    emitBatches([
      makeBatch({
        sourcePromptId: "image-prompt-1",
        targetCount: 5,
        slots: [
          {
            index: 0,
            status: "succeeded",
            output: makeOutput("output-1", 0, true),
          },
          { index: 1, status: "running" },
          { index: 2, status: "failed" },
          { index: 3, status: "interrupted" },
          { index: 4, status: "pending" },
        ],
        counts: {
          total: 5,
          pending: 1,
          running: 1,
          succeeded: 1,
          failed: 1,
          cancelled: 0,
          interrupted: 1,
        },
      }),
    ]);

    expect(screen.getAllByTestId("generation-review-thumbnail")).toHaveLength(
      5,
    );
    expect(screen.getByText("Generating")).toBeVisible();
    expect(screen.getByText("Generation failed")).toBeVisible();
    expect(screen.getByText("Interrupted")).toBeVisible();
    const stage = screen
      .getByTestId("generation-primary-preview")
      .closest("section") as HTMLElement;

    expect(
      within(stage).queryByRole("button", { name: "Favorite" }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(stage).getByRole("button", { name: "More actions" }),
    );
    expect(within(stage).getByText("More")).toBeVisible();
    let menu = within(stage).getByRole("menu", { name: "More actions" });
    fireEvent.click(within(menu).getByRole("button", { name: "Favorite" }));
    await waitFor(() =>
      expect(runner.favorite).toHaveBeenCalledWith(
        "batch-1",
        "output-1",
        false,
      ),
    );
    fireEvent.contextMenu(screen.getByTestId("generation-primary-preview"));
    menu = within(stage).getByRole("menu", { name: "More actions" });
    fireEvent.click(within(menu).getByRole("button", { name: "Download" }));
    expect(anchorClick).toHaveBeenCalledTimes(1);
    fireEvent.click(
      within(stage).getByRole("button", { name: "More actions" }),
    );
    menu = within(stage).getByRole("menu", { name: "More actions" });
    fireEvent.click(within(menu).getByRole("button", { name: "Copy Prompt" }));
    await waitFor(() =>
      expect(clipboard.writeText).toHaveBeenCalledWith(
        "Minimal white concrete house",
      ),
    );
    fireEvent.click(
      within(stage).getByRole("button", { name: "More actions" }),
    );
    menu = within(stage).getByRole("menu", { name: "More actions" });
    fireEvent.click(
      within(menu).getByRole("button", { name: "Add to Prompt" }),
    );
    await waitFor(() =>
      expect(runner.copyToPrompt).toHaveBeenCalledWith("batch-1", "output-1"),
    );
    act(() => {
      useUIStore.setState({ isWorkbenchSidebarExpanded: true });
    });
    fireEvent.click(
      within(stage).getByRole("button", { name: "Continue from this image" }),
    );
    expect(useUIStore.getState().isWorkbenchSidebarExpanded).toBe(false);
    expect(screen.getByTestId("generation-config-panel")).toBeVisible();
    expect(screen.getByRole("button", { name: "Edit image" })).toBeVisible();
    expect(screen.getByLabelText("Model")).toHaveTextContent(
      "studio-image-model",
    );
    expect(screen.getByRole("textbox")).toHaveValue(
      "Minimal white concrete house",
    );
    fireEvent.click(screen.getByRole("button", { name: "Reference images" }));
    expect(screen.getAllByText("1 reference(s)")).toHaveLength(2);
    expect(screen.getByText("Generated output")).toBeVisible();
    anchorClick.mockRestore();
  });

  it("renders failed slots as compact neutral states instead of large red cards", async () => {
    await renderWithI18n(<ImageGenerationWorkbench />);
    emitBatches([
      makeBatch({
        status: "failed",
        slots: [
          { index: 0, status: "failed" },
          { index: 1, status: "interrupted" },
        ],
        counts: {
          total: 2,
          pending: 0,
          running: 0,
          succeeded: 0,
          failed: 1,
          cancelled: 0,
          interrupted: 1,
        },
      }),
    ]);

    const failed = screen.getByTestId("generation-output-state-0");
    expect(failed).toHaveClass("border-border");
    expect(failed).not.toHaveClass("aspect-[4/5]", "bg-destructive/[0.035]");
  });

  it("shows the current batch identity, a batch switcher, and live header progress", async () => {
    await renderWithI18n(<ImageGenerationWorkbench />);
    const running = makeBatch({
      id: "batch-run",
      title: "Running batch",
      status: "running",
      targetCount: 4,
      slots: [
        { index: 0, status: "succeeded", output: makeOutput("output-1", 0) },
        { index: 1, status: "running" },
        { index: 2, status: "pending" },
        { index: 3, status: "pending" },
      ],
      counts: {
        total: 4,
        pending: 2,
        running: 1,
        succeeded: 1,
        failed: 0,
        cancelled: 0,
        interrupted: 0,
      },
      completedAt: undefined,
    });
    const done = makeBatch({ id: "batch-2", title: "Neon city" });
    emitBatches([running, done]);

    const switcher = screen.getByRole("button", { name: "Switch batch" });
    expect(switcher).toHaveTextContent("Running batch");
    expect(switcher).toHaveTextContent("1/4");
    expect(
      screen.getByRole("progressbar", { name: "Batch progress" }),
    ).toHaveAttribute("aria-valuenow", "25");

    fireEvent.click(switcher);
    const listbox = screen.getByRole("listbox", { name: "Switch batch" });
    fireEvent.click(within(listbox).getByText("Neon city"));

    expect(
      screen.getByRole("button", { name: "Switch batch" }),
    ).toHaveTextContent("Neon city");
    expect(
      screen.queryByRole("progressbar", { name: "Batch progress" }),
    ).not.toBeInTheDocument();
  });

  it("opens the lightbox from a tile and navigates with arrow keys and Escape", async () => {
    await renderWithI18n(<ImageGenerationWorkbench />);
    emitBatches([makeBatch()]);

    fireEvent.click(screen.getByRole("button", { name: "Generated image 1" }));

    const dialog = screen.getByRole("dialog", { name: "Architecture poster" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog.parentElement).toBe(document.body);
    const zoomIn = within(dialog).getByRole("button", { name: "Zoom in" });
    const reset = within(dialog).getByRole("button", { name: "Reset zoom" });
    fireEvent.click(zoomIn);
    expect(reset).toHaveTextContent("125%");
    fireEvent.wheel(within(dialog).getByRole("img"), { deltaY: -100 });
    expect(reset).toHaveTextContent("150%");
    fireEvent.click(reset);
    expect(reset).toHaveTextContent("100%");
    fireEvent.click(zoomIn);
    // Newest-first ordering places slot 2 before slot 1 in the visible sequence.
    expect(within(dialog).getByText("2 / 2")).toBeInTheDocument();
    expect(
      within(dialog).getByRole("img", { name: "Generated image 1" }),
    ).toHaveAttribute("src", expect.stringContaining("output-1.png"));

    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(within(dialog).getByText("1 / 2")).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Reset zoom" }),
    ).toHaveTextContent("100%");
    expect(
      within(dialog).getByRole("img", { name: "Generated image 2" }),
    ).toHaveAttribute("src", expect.stringContaining("output-2.png"));

    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(within(dialog).getByText("2 / 2")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "ArrowLeft" });
    expect(within(dialog).getByText("1 / 2")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps preview focus contained and closes on Escape even after image failure", async () => {
    await renderWithI18n(<ImageGenerationWorkbench />);
    emitBatches([makeBatch()]);
    const trigger = screen.getByRole("button", { name: "Generated image 1" });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Architecture poster" });
    const close = within(dialog).getByRole("button", { name: "Close viewer" });
    expect(close).toHaveFocus();
    const buttons = within(dialog).getAllByRole("button");
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(buttons[buttons.length - 1]).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "Tab" });
    expect(close).toHaveFocus();
    fireEvent.error(within(dialog).getByRole("img"));
    expect(within(dialog).getByText("Image load failed")).toBeInTheDocument();
    const backgroundKey = vi.fn();
    document.addEventListener("keydown", backgroundKey);
    try {
      fireEvent.keyDown(close, { key: "Escape" });
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
      expect(backgroundKey).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener("keydown", backgroundKey);
    }
    fireEvent.click(trigger);
    expect(
      screen.getByRole("button", { name: "Reset zoom" }),
    ).toHaveTextContent("100%");
    fireEvent.click(screen.getByRole("button", { name: "Close viewer" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps the viewer open and reports a failed image copy", async () => {
    copyImage.mockRejectedValueOnce(new Error("Clipboard denied"));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await renderWithI18n(<ImageGenerationWorkbench />);
      emitBatches([makeBatch()]);
      fireEvent.click(
        screen.getByRole("button", { name: "Generated image 1" }),
      );
      fireEvent.click(
        within(screen.getByRole("dialog")).getByRole("button", {
          name: "Copy image",
        }),
      );
      await waitFor(() =>
        expect(toast).toHaveBeenCalledWith("Copy failed", "error"),
      );
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(clipboard.writeText).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });

  it("runs favorite, copy-image, download, and attach actions from the lightbox", async () => {
    const updatePrompt = vi.fn().mockResolvedValue(undefined);
    usePromptStore.setState({ updatePrompt });
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    await renderWithI18n(<ImageGenerationWorkbench />);
    emitBatches([makeBatch({ sourcePromptId: "image-prompt-1" })]);

    fireEvent.click(screen.getByRole("button", { name: "Generated image 1" }));
    const dialog = screen.getByRole("dialog", { name: "Architecture poster" });

    fireEvent.click(within(dialog).getByRole("button", { name: "Favorite" }));
    await waitFor(() =>
      expect(runner.favorite).toHaveBeenCalledWith("batch-1", "output-1", true),
    );

    fireEvent.click(within(dialog).getByRole("button", { name: "Copy image" }));
    await waitFor(() =>
      expect(copyImage).toHaveBeenCalledWith("batch-1", "output-1"),
    );
    expect(clipboard.writeText).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Download" }));
    expect(anchorClick).toHaveBeenCalledTimes(1);

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Add to Prompt" }),
    );
    await waitFor(() =>
      expect(runner.copyToPrompt).toHaveBeenCalledWith("batch-1", "output-1"),
    );
    await waitFor(() =>
      expect(updatePrompt).toHaveBeenCalledWith("image-prompt-1", {
        images: ["copied-output.png"],
      }),
    );

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Close viewer" }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    anchorClick.mockRestore();
  });

  it("toggles selection via hover checkbox and Shift+click without a multi-select mode", async () => {
    await renderWithI18n(<ImageGenerationWorkbench />);
    emitBatches([makeBatch()]);

    expect(
      screen.queryByRole("checkbox", { name: "Multi-select" }),
    ).not.toBeInTheDocument();

    const firstCheckbox = screen.getByRole("checkbox", {
      name: "Select image 1",
    });
    expect(firstCheckbox).toHaveClass("group-hover:flex");
    expect(firstCheckbox).toHaveAttribute("aria-checked", "false");

    fireEvent.click(firstCheckbox);
    expect(firstCheckbox).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("1 selected")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Generated image 2" }), {
      shiftKey: true,
    });
    expect(screen.getByText("2 selected")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Generated image 1" }));
    expect(
      screen.getByRole("dialog", { name: "Architecture poster" }),
    ).toBeInTheDocument();
    expect(screen.getByText("2 selected")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });

    fireEvent.click(screen.getByRole("checkbox", { name: "Select image 1" }));
    expect(screen.getByText("1 selected")).toBeInTheDocument();
  });

  it("keeps the action bar visible and retains the current preview after clearing selection", async () => {
    await renderWithI18n(<ImageGenerationWorkbench />);
    const toolbar = screen.getByRole("toolbar", { name: "Image actions" });
    expect(
      within(toolbar).getByRole("button", { name: "Favorite" }),
    ).toBeDisabled();
    emitBatches([makeBatch()]);
    expect(within(toolbar).getByText("Current image")).toBeInTheDocument();
    fireEvent.click(
      within(toolbar).getByRole("button", { name: "Copy image" }),
    );
    await waitFor(() =>
      expect(copyImage).toHaveBeenCalledWith("batch-1", "output-1"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Generated image 2" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select image 1" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select image 2" }));
    expect(within(toolbar).getByText("2 selected")).toBeInTheDocument();
    expect(
      within(toolbar).getByRole("button", { name: "Copy image" }),
    ).toBeDisabled();
    fireEvent.click(
      within(toolbar).getByRole("button", { name: "Clear Selection" }),
    );
    expect(screen.getByTestId("generation-primary-preview")).toHaveAttribute(
      "aria-label",
      "Generated image 2",
    );
    expect(screen.getByRole("toolbar", { name: "Image actions" })).toBe(
      toolbar,
    );
    fireEvent.click(within(toolbar).getByRole("button", { name: "Favorite" }));
    await waitFor(() =>
      expect(runner.favorite).toHaveBeenCalledWith("batch-1", "output-2", true),
    );
  });

  it("favorites every selected output from the bottom action bar", async () => {
    await renderWithI18n(<ImageGenerationWorkbench />);
    emitBatches([makeBatch()]);

    fireEvent.click(screen.getByRole("checkbox", { name: "Select image 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Generated image 2" }), {
      ctrlKey: true,
    });
    const actionBar = screen.getByText("2 selected").parentElement;
    expect(actionBar).not.toBeNull();
    fireEvent.click(
      within(actionBar as HTMLElement).getByRole("button", {
        name: "Favorite",
      }),
    );

    await waitFor(() => {
      expect(runner.favorite).toHaveBeenCalledWith("batch-1", "output-1", true);
      expect(runner.favorite).toHaveBeenCalledWith("batch-1", "output-2", true);
    });
  });

  it("switches gallery layouts and sort order", async () => {
    await renderWithI18n(<ImageGenerationWorkbench />);
    emitBatches([makeBatch()]);

    fireEvent.click(screen.getByRole("button", { name: "Workbench actions" }));
    const menu = screen.getByRole("menu", { name: "Workbench actions" });
    const compact = screen.getByRole("button", { name: "Compact grid" });
    const large = screen.getByRole("button", { name: "Large grid" });
    expect(compact).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(large);
    expect(large).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(within(menu).getByRole("button", { name: "Latest first" }));
    expect(
      screen.getByRole("button", { name: "Oldest first" }),
    ).toBeInTheDocument();
  });

  it("dismisses workbench actions without changing the persistent layout", async () => {
    await renderWithI18n(<ImageGenerationWorkbench />);

    const options = screen.getByRole("button", { name: "Workbench actions" });
    fireEvent.click(options);
    expect(
      screen.getByRole("menu", { name: "Workbench actions" }),
    ).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("generation-batch-rail"),
    ).not.toBeInTheDocument();

    fireEvent.click(options);
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("keeps cancel and retry actions inside the workbench menu", async () => {
    await renderWithI18n(<ImageGenerationWorkbench />);
    const running = makeBatch({
      status: "running",
      counts: {
        total: 2,
        pending: 1,
        running: 1,
        succeeded: 0,
        failed: 0,
        cancelled: 0,
        interrupted: 0,
      },
      completedAt: undefined,
    });
    emitBatches([running]);

    fireEvent.click(screen.getByRole("button", { name: "Workbench actions" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel remaining" }));
    await waitFor(() => expect(runner.cancel).toHaveBeenCalledWith("batch-1"));

    const failed = makeBatch({
      status: "failed",
      counts: {
        total: 2,
        pending: 0,
        running: 0,
        succeeded: 0,
        failed: 1,
        cancelled: 0,
        interrupted: 1,
      },
    });
    emitBatches([failed]);
    fireEvent.click(screen.getByRole("button", { name: "Workbench actions" }));
    fireEvent.click(screen.getByRole("button", { name: "Retry failed" }));

    await waitFor(() =>
      expect(runner.retry).toHaveBeenCalledWith(
        failed,
        expect.objectContaining({ id: "image-model-1" }),
      ),
    );
  });

  it("shows a submission error without collapsing the composer", async () => {
    runner.start.mockRejectedValueOnce(new Error("provider unavailable"));
    await renderWithI18n(<ImageGenerationWorkbench />);
    fireEvent.click(screen.getByRole("button", { name: "Source Prompt" }));
    fireEvent.click(
      screen.getByRole("option", { name: "Architecture poster" }),
    );

    const generate = screen.getByRole("button", { name: "Generate" });
    await waitFor(() => expect(generate).toBeEnabled());
    fireEvent.click(generate);

    expect(await screen.findByText("provider unavailable")).toBeVisible();
    expect(
      screen.getByRole("tab", { name: "Generation settings" }),
    ).toBeVisible();
  });
});
