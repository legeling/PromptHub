import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FormEvent } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ImagePromptReverseModal } from "../../../src/renderer/components/prompt/ImagePromptReverseModal";
import { ToastProvider } from "../../../src/renderer/components/ui/Toast";
import { useFolderStore } from "../../../src/renderer/stores/folder.store";
import { usePromptStore } from "../../../src/renderer/stores/prompt.store";
import { useSettingsStore } from "../../../src/renderer/stores/settings.store";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";

const chatCompletionMock = vi.hoisted(() => vi.fn());
const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

function isHiddenFromAccessibility(element: Element): boolean {
  let current: Element | null = element;
  while (current) {
    if (current.getAttribute("aria-hidden") === "true") {
      return true;
    }
    current = current.parentElement;
  }
  return false;
}

vi.mock("../../../src/renderer/services/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/renderer/services/ai")>();
  return {
    ...actual,
    chatCompletion: (...args: unknown[]) => chatCompletionMock(...args),
  };
});

function createImageFile(content: string, fileName: string): File {
  const file = new File([content], fileName, { type: "image/png" });
  Object.defineProperty(file, "arrayBuffer", {
    value: vi.fn().mockResolvedValue(new ArrayBuffer(1)),
  });
  return file;
}

function createOversizedImageFile(): File {
  const file = createImageFile("oversized", "oversized.png");
  Object.defineProperty(file, "size", {
    configurable: true,
    value: 21 * 1024 * 1024,
  });
  return file;
}

describe("ImagePromptReverseModal", () => {
  const writeTextMock = vi.fn();

  const selectSavedImage = async (user: ReturnType<typeof userEvent.setup>) => {
    window.electron.selectImage = vi.fn().mockResolvedValue(["/tmp/reference.png"]);
    window.electron.saveImage = vi.fn().mockResolvedValue(["saved-reference.png"]);
    window.electron.readImageBase64 = vi.fn().mockResolvedValue("iVBORw0KGgo=");

    await user.click(screen.getByText("拖入图片、粘贴截图，或点击选择"));
    await screen.findByText("saved-reference.png");
  };

  beforeEach(() => {
    chatCompletionMock.mockReset();
    writeTextMock.mockReset();
    installWindowMocks();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: writeTextMock.mockResolvedValue(undefined),
      },
    });

    useFolderStore.setState({
      folders: [
        {
          id: "folder-1",
          name: "Marketing",
          createdAt: new Date("2026-05-01T00:00:00.000Z").toISOString(),
          updatedAt: new Date("2026-05-01T00:00:00.000Z").toISOString(),
          order: 0,
          icon: "folder",
        },
      ],
      selectedFolderId: null,
      expandedIds: new Set(),
      unlockedFolderIds: new Set(),
    } as Partial<ReturnType<typeof useFolderStore.getState>>);

    usePromptStore.setState({
      prompts: [
        {
          id: "prompt-1",
          title: "Existing image prompt",
          userPrompt: "test",
          tags: ["product"],
          createdAt: new Date("2026-05-01T00:00:00.000Z").toISOString(),
          updatedAt: new Date("2026-05-01T00:00:00.000Z").toISOString(),
        },
      ],
      selectedId: null,
      selectedIds: [],
      isLoading: false,
      searchQuery: "",
      filterTags: [],
      promptTypeFilter: "all",
      sortBy: "updatedAt",
      sortOrder: "desc",
      viewMode: "card",
      galleryImageSize: "medium",
      kanbanColumns: 3,
    } as Partial<ReturnType<typeof usePromptStore.getState>>);

    useSettingsStore.setState({
      aiProvider: "openai",
      aiApiProtocol: "openai",
      aiApiKey: "legacy-key",
      aiApiUrl: "https://legacy.example.com/v1",
      aiModel: "gpt-4o",
      aiModels: [
        {
          id: "image-reverse-chat",
          type: "chat",
          provider: "openai",
          apiProtocol: "openai",
          apiKey: "scenario-key",
          apiUrl: "https://scenario.example.com/v1",
          model: "gpt-4o-vision",
          capabilities: { vision: true },
        },
      ],
      scenarioModelDefaults: {
        imageReverse: "image-reverse-chat",
      },
      modelRouteDefaults: {
        visionText: "image-reverse-chat",
      },
      imageReverseAttachReferenceByDefault: true,
      enableNotifications: false,
    } as Partial<ReturnType<typeof useSettingsStore.getState>>);
  });

  it("keeps the pointer backdrop presentational while preserving click close", async () => {
    const onClose = vi.fn();

    await renderWithI18n(
      <ToastProvider>
        <ImagePromptReverseModal
          isOpen
          onClose={onClose}
          onCreate={vi.fn()}
        />
      </ToastProvider>,
      { language: "en" },
    );

    const backdrop = screen.getByTestId("image-prompt-reverse-backdrop");
    expect(backdrop).toHaveAttribute("role", "presentation");
    expect(backdrop).toHaveAttribute("aria-hidden", "true");

    fireEvent.click(backdrop);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  afterEach(() => {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: originalCreateObjectURL,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: originalRevokeObjectURL,
    });
  });

  it("reverses a selected image into an editable draft before creating a prompt", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockResolvedValue({ id: "created-prompt" });
    const onClose = vi.fn();
    window.electron.selectImage = vi.fn().mockResolvedValue(["/tmp/reference.png"]);
    window.electron.saveImage = vi.fn().mockResolvedValue(["saved-reference.png"]);
    window.electron.readImageBase64 = vi.fn().mockResolvedValue("iVBORw0KGgo=");
    chatCompletionMock.mockResolvedValue({
      content: JSON.stringify({
        title: "电影感产品图",
        promptType: "image",
        systemPrompt: "",
        userPrompt: "cinematic product photo, soft studio light, shallow depth of field",
        description: "反推产品摄影生图提示词",
        suggestedFolder: "Marketing",
        tags: ["image", "product"],
      }),
    });

    await renderWithI18n(
      <ToastProvider>
        <ImagePromptReverseModal
          isOpen
          onClose={onClose}
          onCreate={onCreate}
        />
      </ToastProvider>,
      { language: "zh" },
    );

    expect(screen.getByRole("heading", { name: "图片反推" })).toBeInTheDocument();
    expect(document.querySelector(".max-w-2xl")).toHaveClass("animate-in");
    expect(document.querySelector(".max-w-2xl")).toHaveClass("zoom-in-95");
    expect(screen.queryByText("输出类型")).not.toBeInTheDocument();
    expect(screen.getByText("绘图")).toBeInTheDocument();
    expect(screen.getByText("保存为参考图")).toBeInTheDocument();
    expect(
      screen.queryByText("开启后，新建的生图 Prompt 会保留这张图片作为参考图。"),
    ).not.toBeInTheDocument();
    expect(
      screen
        .getByText("拖入图片、粘贴截图，或点击选择")
        .compareDocumentPosition(
          screen.getByRole("textbox", { name: "补充说明（可选）" }),
        ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    const reverseButton = screen.getByRole("button", { name: "开始反推" });
    expect(reverseButton).toBeDisabled();

    await user.click(screen.getByText("拖入图片、粘贴截图，或点击选择"));
    expect(await screen.findByText("saved-reference.png")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "移除" })).toBeInTheDocument();

    await user.type(
      screen.getByRole("textbox", { name: "补充说明（可选）" }),
      "更适合写实生图模型",
    );
    await user.click(reverseButton);

    await waitFor(() => {
      expect(chatCompletionMock).toHaveBeenCalledTimes(1);
    });

    expect(chatCompletionMock.mock.calls[0][0]).toMatchObject({
      apiKey: "scenario-key",
      model: "gpt-4o-vision",
      type: "chat",
    });

    const messages = chatCompletionMock.mock.calls[0][1] as Array<{
      role: string;
      content: unknown;
    }>;
    expect(messages[1].content).toEqual([
      expect.objectContaining({
        type: "text",
        text: expect.stringContaining("更适合写实生图模型"),
      }),
      expect.objectContaining({
        type: "image_url",
        image_url: expect.objectContaining({
          url: "data:image/png;base64,iVBORw0KGgo=",
          detail: "high",
        }),
      }),
    ]);

    expect(
      await screen.findByDisplayValue(
        "cinematic product photo, soft studio light, shallow depth of field",
      ),
    ).toBeInTheDocument();
    expect(onCreate).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText("反推标题"));
    await user.type(screen.getByLabelText("反推标题"), "确认后的产品图");
    await user.click(screen.getByRole("button", { name: "创建提示词" }));

    await waitFor(() => {
      expect(onCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "确认后的产品图",
          promptType: "image",
          userPrompt:
            "cinematic product photo, soft studio light, shallow depth of field",
          folderId: "folder-1",
          tags: ["image", "product"],
          images: ["saved-reference.png"],
          variables: [],
        }),
      );
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("creates prompt variables from reversed PromptHub placeholders", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockResolvedValue({ id: "created-prompt" });
    chatCompletionMock.mockResolvedValue({
      content: JSON.stringify({
        title: "动漫人像",
        promptType: "image",
        systemPrompt: "",
        userPrompt:
          "masterpiece anime illustration, {{subject}}, {{pose}}, {{background}}, {{color_palette}}, avoid {{negative_prompt}}",
        description: "可复用动漫人像生图提示词",
        suggestedFolder: null,
        tags: ["image"],
      }),
    });

    await renderWithI18n(
      <ToastProvider>
        <ImagePromptReverseModal
          isOpen
          onClose={vi.fn()}
          onCreate={onCreate}
        />
      </ToastProvider>,
      { language: "zh" },
    );

    await selectSavedImage(user);
    await user.click(screen.getByRole("button", { name: "开始反推" }));
    await screen.findByDisplayValue(/{{subject}}/);
    await user.click(screen.getByRole("button", { name: "创建提示词" }));

    await waitFor(() => {
      expect(onCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          variables: [
            expect.objectContaining({ name: "subject", type: "text" }),
            expect.objectContaining({ name: "pose", type: "text" }),
            expect.objectContaining({ name: "background", type: "text" }),
            expect.objectContaining({ name: "color_palette", type: "text" }),
            expect.objectContaining({ name: "negative_prompt", type: "text" }),
          ],
        }),
      );
    });
  });

  it("normalizes default-value variables from reversed image prompts", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockResolvedValue({ id: "created-prompt" });
    chatCompletionMock.mockResolvedValue({
      content: JSON.stringify({
        title: "默认变量生图",
        promptType: "image",
        systemPrompt: "",
        userPrompt:
          "cinematic {{ subject : glass perfume bottle }}, {{lighting:soft studio}}, avoid {{negative_prompt:harsh shadows}}",
        description: "带默认值变量的生图提示词",
        suggestedFolder: null,
        tags: ["image"],
      }),
    });

    await renderWithI18n(
      <ToastProvider>
        <ImagePromptReverseModal
          isOpen
          onClose={vi.fn()}
          onCreate={onCreate}
        />
      </ToastProvider>,
      { language: "zh" },
    );

    await selectSavedImage(user);
    await user.click(screen.getByRole("button", { name: "开始反推" }));
    await screen.findByDisplayValue(/glass perfume bottle/u);
    await user.click(screen.getByRole("button", { name: "创建提示词" }));

    await waitFor(() => {
      expect(onCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          variables: [
            expect.objectContaining({
              name: "subject",
              type: "text",
              defaultValue: "glass perfume bottle",
            }),
            expect.objectContaining({
              name: "lighting",
              type: "text",
              defaultValue: "soft studio",
            }),
            expect.objectContaining({
              name: "negative_prompt",
              type: "text",
              defaultValue: "harsh shadows",
            }),
          ],
        }),
      );
    });
  });

  it("remembers when the user disables attaching the source image as a reference", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockResolvedValue({ id: "created-prompt" });
    window.electron.selectImage = vi.fn().mockResolvedValue(["/tmp/reference.png"]);
    window.electron.saveImage = vi.fn().mockResolvedValue(["saved-reference.png"]);
    window.electron.readImageBase64 = vi.fn().mockResolvedValue("iVBORw0KGgo=");
    chatCompletionMock.mockResolvedValue({
      content: JSON.stringify({
        title: "干净产品图",
        promptType: "image",
        systemPrompt: "",
        userPrompt: "clean product photo, white background, soft studio lighting",
        description: "产品图提示词",
        suggestedFolder: null,
        tags: ["product"],
      }),
    });

    await renderWithI18n(
      <ToastProvider>
        <ImagePromptReverseModal
          isOpen
          onClose={vi.fn()}
          onCreate={onCreate}
        />
      </ToastProvider>,
      { language: "zh" },
    );

    await user.click(screen.getByText("保存为参考图"));

    expect(
      useSettingsStore.getState().imageReverseAttachReferenceByDefault,
    ).toBe(false);

    await user.click(screen.getByText("拖入图片、粘贴截图，或点击选择"));
    await screen.findByText("saved-reference.png");
    await user.click(screen.getByRole("button", { name: "开始反推" }));

    expect(await screen.findByText("反推草稿")).toBeInTheDocument();
    expect(onCreate).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "创建提示词" }));

    await waitFor(() => {
      expect(onCreate).toHaveBeenCalledTimes(1);
    });

    expect(onCreate.mock.calls[0][0]).toMatchObject({
      title: "干净产品图",
      promptType: "image",
      userPrompt: "clean product photo, white background, soft studio lighting",
      tags: ["product"],
    });
    expect(onCreate.mock.calls[0][0].images).toBeUndefined();
  });

  it("highlights the image drop zone while dragging over it", async () => {
    await renderWithI18n(
      <ToastProvider>
        <ImagePromptReverseModal
          isOpen
          onClose={vi.fn()}
          onCreate={vi.fn()}
        />
      </ToastProvider>,
      { language: "zh" },
    );

    const dropZone = screen.getByRole("button", {
      name: /拖入图片、粘贴截图，或点击选择/,
    });

    fireEvent.dragEnter(dropZone);
    expect(dropZone).toHaveClass("border-primary/70");
    expect(dropZone).toHaveClass("bg-primary/5");

    fireEvent.dragLeave(dropZone);
    expect(dropZone).not.toHaveClass("border-primary/70");
  });

  it("revokes pasted image preview object URLs exactly once when replaced or unmounted", async () => {
    const createObjectURL = vi.fn()
      .mockReturnValueOnce("blob:first-preview")
      .mockReturnValueOnce("blob:second-preview");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURL,
    });
    window.electron.saveImageBuffer = vi.fn()
      .mockResolvedValueOnce("first-reference.png")
      .mockResolvedValueOnce("second-reference.png");

    const { unmount } = await renderWithI18n(
      <ToastProvider>
        <ImagePromptReverseModal
          isOpen
          onClose={vi.fn()}
          onCreate={vi.fn()}
        />
      </ToastProvider>,
      { language: "zh" },
    );

    const dropZone = screen.getByRole("button", {
      name: /拖入图片、粘贴截图，或点击选择/,
    });
    const firstFile = createImageFile("first", "first.png");
    const secondFile = createImageFile("second", "second.png");

    fireEvent.drop(dropZone, {
      dataTransfer: { files: [firstFile] },
    });
    expect(await screen.findByText("first.png")).toBeInTheDocument();

    fireEvent.drop(dropZone, {
      dataTransfer: { files: [secondFile] },
    });
    expect(await screen.findByText("second.png")).toBeInTheDocument();

    await waitFor(() => {
      expect(
        revokeObjectURL.mock.calls.filter(([url]) => url === "blob:first-preview"),
      ).toHaveLength(1);
    });

    unmount();

    expect(
      revokeObjectURL.mock.calls.filter(([url]) => url === "blob:second-preview"),
    ).toHaveLength(1);
  });

  it("rejects oversized dropped images before reading them into memory", async () => {
    const createObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectURL,
    });
    window.electron.saveImageBuffer = vi.fn().mockResolvedValue("oversized.png");
    const oversizedFile = createOversizedImageFile();

    await renderWithI18n(
      <ToastProvider>
        <ImagePromptReverseModal
          isOpen
          onClose={vi.fn()}
          onCreate={vi.fn()}
        />
      </ToastProvider>,
      { language: "en" },
    );

    const dropZone = screen.getByRole("button", {
      name: /Drop an image, paste a screenshot, or click to choose/,
    });

    fireEvent.drop(dropZone, {
      dataTransfer: { files: [oversizedFile] },
    });

    expect(oversizedFile.arrayBuffer).not.toHaveBeenCalled();
    expect(window.electron.saveImageBuffer).not.toHaveBeenCalled();
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(screen.queryByText("oversized.png")).not.toBeInTheDocument();
  });

  it("revokes pasted image preview object URLs when the modal is closed without unmounting", async () => {
    const createObjectURL = vi.fn().mockReturnValue("blob:close-preview");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURL,
    });
    window.electron.saveImageBuffer = vi.fn().mockResolvedValue("close-reference.png");

    const onCreate = vi.fn();
    const onClose = vi.fn();
    const { rerender } = await renderWithI18n(
      <ToastProvider>
        <ImagePromptReverseModal
          isOpen
          onClose={onClose}
          onCreate={onCreate}
        />
      </ToastProvider>,
      { language: "zh" },
    );

    const dropZone = screen.getByRole("button", {
      name: /拖入图片、粘贴截图，或点击选择/,
    });

    fireEvent.drop(dropZone, {
      dataTransfer: { files: [createImageFile("close", "close.png")] },
    });
    expect(await screen.findByText("close.png")).toBeInTheDocument();

    rerender(
      <ToastProvider>
        <ImagePromptReverseModal
          isOpen={false}
          onClose={onClose}
          onCreate={onCreate}
        />
      </ToastProvider>,
    );

    await waitFor(() => {
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:close-preview");
    });
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
  });

  it("does not show a dropped image after the modal closes before save completes", async () => {
    const createObjectURL = vi.fn().mockReturnValue("blob:late-preview");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURL,
    });
    let resolveSaveImageBuffer: (fileName: string) => void = () => undefined;
    window.electron.saveImageBuffer = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveSaveImageBuffer = resolve;
        }),
    );

    const onCreate = vi.fn();
    const onClose = vi.fn();
    const { rerender } = await renderWithI18n(
      <ToastProvider>
        <ImagePromptReverseModal
          isOpen
          onClose={onClose}
          onCreate={onCreate}
        />
      </ToastProvider>,
      { language: "zh" },
    );

    const dropZone = screen.getByRole("button", {
      name: /拖入图片、粘贴截图，或点击选择/,
    });

    fireEvent.drop(dropZone, {
      dataTransfer: { files: [createImageFile("late", "late.png")] },
    });

    await waitFor(() => {
      expect(window.electron.saveImageBuffer).toHaveBeenCalled();
    });

    rerender(
      <ToastProvider>
        <ImagePromptReverseModal
          isOpen={false}
          onClose={onClose}
          onCreate={onCreate}
        />
      </ToastProvider>,
    );

    await act(async () => {
      resolveSaveImageBuffer("late-reference.png");
      await Promise.resolve();
    });

    expect(createObjectURL).not.toHaveBeenCalled();
    expect(screen.queryByText("图片已添加")).not.toBeInTheDocument();

    rerender(
      <ToastProvider>
        <ImagePromptReverseModal
          isOpen
          onClose={onClose}
          onCreate={onCreate}
        />
      </ToastProvider>,
    );

    expect(screen.queryByText("late.png")).not.toBeInTheDocument();
    expect(screen.queryByText("late-reference.png")).not.toBeInTheDocument();
  });

  it("does not show a selected image after the modal closes before base64 read completes", async () => {
    const user = userEvent.setup();
    let resolveReadImageBase64: (base64: string) => void = () => undefined;
    window.electron.selectImage = vi.fn().mockResolvedValue(["/tmp/late-reference.png"]);
    window.electron.saveImage = vi.fn().mockResolvedValue(["late-reference.png"]);
    window.electron.readImageBase64 = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveReadImageBase64 = resolve;
        }),
    );

    const onCreate = vi.fn();
    const onClose = vi.fn();
    const { rerender } = await renderWithI18n(
      <ToastProvider>
        <ImagePromptReverseModal
          isOpen
          onClose={onClose}
          onCreate={onCreate}
        />
      </ToastProvider>,
      { language: "zh" },
    );

    await user.click(screen.getByText("拖入图片、粘贴截图，或点击选择"));

    await waitFor(() => {
      expect(window.electron.readImageBase64).toHaveBeenCalledWith(
        "late-reference.png",
      );
    });

    rerender(
      <ToastProvider>
        <ImagePromptReverseModal
          isOpen={false}
          onClose={onClose}
          onCreate={onCreate}
        />
      </ToastProvider>,
    );

    await act(async () => {
      resolveReadImageBase64("iVBORw0KGgo=");
      await Promise.resolve();
    });
    expect(screen.queryByText("图片已添加")).not.toBeInTheDocument();

    rerender(
      <ToastProvider>
        <ImagePromptReverseModal
          isOpen
          onClose={onClose}
          onCreate={onCreate}
        />
      </ToastProvider>,
    );

    expect(screen.queryByText("late-reference.png")).not.toBeInTheDocument();
  });

  it("allows copying the reversed prompt without creating a stored prompt", async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: writeTextMock.mockResolvedValue(undefined),
      },
    });
    const onCreate = vi.fn().mockResolvedValue({ id: "created-prompt" });
    chatCompletionMock.mockResolvedValue({
      content: JSON.stringify({
        title: "霓虹机器人图",
        promptType: "image",
        systemPrompt: "",
        userPrompt: "neon robot icon, blue glow, dark background",
        description: "反推图标生图提示词",
        suggestedFolder: null,
        tags: ["icon"],
      }),
    });

    await renderWithI18n(
      <ToastProvider>
        <ImagePromptReverseModal
          isOpen
          onClose={vi.fn()}
          onCreate={onCreate}
        />
      </ToastProvider>,
      { language: "zh" },
    );

    await selectSavedImage(user);
    await user.click(screen.getByRole("button", { name: "开始反推" }));
    await screen.findByDisplayValue(
      "neon robot icon, blue glow, dark background",
    );
    await user.click(screen.getByRole("button", { name: "复制提示词" }));

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith(
        "neon robot icon, blue glow, dark background",
      );
    });
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("keeps rendered image reverse actions non-submit with decorative icons hidden", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockResolvedValue({ id: "created-prompt" });
    const onSubmit = vi.fn((event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
    });
    chatCompletionMock.mockResolvedValue({
      content: JSON.stringify({
        title: "表单语义检查",
        promptType: "image",
        systemPrompt: "",
        userPrompt: "semantic image prompt",
        description: "按钮语义检查",
        suggestedFolder: null,
        tags: ["image"],
      }),
    });

    await renderWithI18n(
      <ToastProvider>
        <form onSubmit={onSubmit}>
          <ImagePromptReverseModal
            isOpen
            onClose={vi.fn()}
            onCreate={onCreate}
          />
        </form>
      </ToastProvider>,
      { language: "zh" },
    );

    await selectSavedImage(user);
    await user.click(screen.getByRole("button", { name: "开始反推" }));
    await screen.findByDisplayValue("semantic image prompt");

    const buttons = screen.getAllByRole("button");
    for (const button of buttons) {
      if (button.tagName === "BUTTON") {
        expect(button).toHaveAttribute("type", "button");
      }
    }

    for (const icon of document.querySelectorAll("button svg")) {
      expect(isHiddenFromAccessibility(icon)).toBe(true);
    }

    await user.click(screen.getByRole("button", { name: "复制提示词" }));
    await user.click(screen.getByRole("button", { name: "创建提示词" }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits the generated prompt only once while creation is pending", async () => {
    const user = userEvent.setup();
    let resolveCreate: (value: { id: string }) => void = () => undefined;
    const onCreate = vi.fn(
      () =>
        new Promise<{ id: string }>((resolve) => {
          resolveCreate = resolve;
        }),
    );
    const onClose = vi.fn();
    chatCompletionMock.mockResolvedValue({
      content: JSON.stringify({
        title: "重复点击保护",
        promptType: "image",
        systemPrompt: "",
        userPrompt: "single create prompt",
        description: "防重复创建",
        suggestedFolder: null,
        tags: ["image"],
      }),
    });

    await renderWithI18n(
      <ToastProvider>
        <ImagePromptReverseModal
          isOpen
          onClose={onClose}
          onCreate={onCreate}
        />
      </ToastProvider>,
      { language: "zh" },
    );

    await selectSavedImage(user);
    await user.click(screen.getByRole("button", { name: "开始反推" }));
    await screen.findByDisplayValue("single create prompt");

    const createButton = screen.getByRole("button", { name: "创建提示词" });
    fireEvent.click(createButton);
    fireEvent.click(createButton);

    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(createButton).toBeDisabled();

    await act(async () => {
      resolveCreate({ id: "created-prompt" });
      await Promise.resolve();
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close after create completes if the modal closed first", async () => {
    const user = userEvent.setup();
    let resolveCreate: (value: { id: string }) => void = () => undefined;
    const onCreate = vi.fn(
      () =>
        new Promise<{ id: string }>((resolve) => {
          resolveCreate = resolve;
        }),
    );
    const onClose = vi.fn();
    chatCompletionMock.mockResolvedValue({
      content: JSON.stringify({
        title: "关闭后的创建",
        promptType: "image",
        systemPrompt: "",
        userPrompt: "late created prompt",
        description: "关闭后不回调",
        suggestedFolder: null,
        tags: ["image"],
      }),
    });

    const { rerender } = await renderWithI18n(
      <ToastProvider>
        <ImagePromptReverseModal
          isOpen
          onClose={onClose}
          onCreate={onCreate}
        />
      </ToastProvider>,
      { language: "zh" },
    );

    await selectSavedImage(user);
    await user.click(screen.getByRole("button", { name: "开始反推" }));
    await screen.findByDisplayValue("late created prompt");
    fireEvent.click(screen.getByRole("button", { name: "创建提示词" }));

    await waitFor(() => {
      expect(onCreate).toHaveBeenCalledTimes(1);
    });

    rerender(
      <ToastProvider>
        <ImagePromptReverseModal
          isOpen={false}
          onClose={onClose}
          onCreate={onCreate}
        />
      </ToastProvider>,
    );

    await act(async () => {
      resolveCreate({ id: "created-prompt" });
      await Promise.resolve();
    });

    expect(onClose).not.toHaveBeenCalled();
  });

  it("shows a create failure when storing the generated prompt rejects", async () => {
    const user = userEvent.setup();
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const onCreate = vi.fn().mockRejectedValue(new Error("database unavailable"));
    chatCompletionMock.mockResolvedValue({
      content: JSON.stringify({
        title: "失败创建",
        promptType: "image",
        systemPrompt: "",
        userPrompt: "failed create prompt",
        description: "创建失败",
        suggestedFolder: null,
        tags: ["image"],
      }),
    });

    await renderWithI18n(
      <ToastProvider>
        <ImagePromptReverseModal
          isOpen
          onClose={vi.fn()}
          onCreate={onCreate}
        />
      </ToastProvider>,
      { language: "zh" },
    );

    await selectSavedImage(user);
    await user.click(screen.getByRole("button", { name: "开始反推" }));
    await screen.findByDisplayValue("failed create prompt");
    await user.click(screen.getByRole("button", { name: "创建提示词" }));

    expect(await screen.findByText("提示词创建失败")).toBeInTheDocument();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Image prompt reverse create failed:",
      expect.any(Error),
    );
    expect(screen.getByRole("button", { name: "创建提示词" })).not.toBeDisabled();
    consoleErrorSpy.mockRestore();
  });

  it("shows a vision-model setup error instead of using legacy text config", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockResolvedValue({ id: "created-prompt" });
    useSettingsStore.setState({
      aiProvider: "openai",
      aiApiProtocol: "openai",
      aiApiKey: "legacy-key",
      aiApiUrl: "https://legacy.example.com/v1",
      aiModel: "gpt-4o",
      aiModels: [
        {
          id: "normal-chat",
          type: "chat",
          provider: "openai",
          apiProtocol: "openai",
          apiKey: "normal-key",
          apiUrl: "https://normal.example.com/v1",
          model: "gpt-4o-mini",
        },
      ],
      scenarioModelDefaults: {
        imageReverse: "normal-chat",
      },
      modelRouteDefaults: {
        visionText: "normal-chat",
      },
    } as Partial<ReturnType<typeof useSettingsStore.getState>>);

    await renderWithI18n(
      <ToastProvider>
        <ImagePromptReverseModal
          isOpen
          onClose={vi.fn()}
          onCreate={onCreate}
        />
      </ToastProvider>,
      { language: "zh" },
    );

    await selectSavedImage(user);
    await user.click(screen.getByRole("button", { name: "开始反推" }));

    expect(
      await screen.findByText(
        "请先在设置的 AI 模型工作台中添加支持视觉输入的对话模型，并在视觉模型路由中选择它。",
      ),
    ).toBeInTheDocument();
    expect(chatCompletionMock).not.toHaveBeenCalled();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("shows a parse error when the vision model response is not a prompt draft", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockResolvedValue({ id: "created-prompt" });
    chatCompletionMock.mockResolvedValue({
      content: "I can describe the image, but this is not JSON.",
    });

    await renderWithI18n(
      <ToastProvider>
        <ImagePromptReverseModal
          isOpen
          onClose={vi.fn()}
          onCreate={onCreate}
        />
      </ToastProvider>,
      { language: "zh" },
    );

    await selectSavedImage(user);
    await user.click(screen.getByRole("button", { name: "开始反推" }));

    expect(await screen.findByText("无法解析 AI 响应")).toBeInTheDocument();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("does not show a reverse draft toast after the modal closes before AI completes", async () => {
    const user = userEvent.setup();
    let resolveReverse: (value: { content: string }) => void = () => undefined;
    chatCompletionMock.mockReturnValue(
      new Promise((resolve) => {
        resolveReverse = resolve;
      }),
    );

    const onCreate = vi.fn();
    const onClose = vi.fn();
    const { rerender } = await renderWithI18n(
      <ToastProvider>
        <ImagePromptReverseModal
          isOpen
          onClose={onClose}
          onCreate={onCreate}
        />
      </ToastProvider>,
      { language: "zh" },
    );

    await selectSavedImage(user);
    await user.click(screen.getByRole("button", { name: "开始反推" }));

    await waitFor(() => {
      expect(chatCompletionMock).toHaveBeenCalledTimes(1);
    });

    rerender(
      <ToastProvider>
        <ImagePromptReverseModal
          isOpen={false}
          onClose={onClose}
          onCreate={onCreate}
        />
      </ToastProvider>,
    );

    await act(async () => {
      resolveReverse({
        content: JSON.stringify({
          title: "关闭后的草稿",
          promptType: "image",
          systemPrompt: "",
          userPrompt: "late reverse prompt",
          description: "",
          suggestedFolder: null,
          tags: ["late"],
        }),
      });
      await Promise.resolve();
    });

    expect(screen.queryByText("反推草稿已生成")).not.toBeInTheDocument();

    rerender(
      <ToastProvider>
        <ImagePromptReverseModal
          isOpen
          onClose={onClose}
          onCreate={onCreate}
        />
      </ToastProvider>,
    );

    expect(screen.queryByText("反推草稿")).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue("late reverse prompt")).not.toBeInTheDocument();
  });

  it("does not show reverse failures after the modal closes before AI rejects", async () => {
    const user = userEvent.setup();
    let rejectReverse: (error: Error) => void = () => undefined;
    chatCompletionMock.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectReverse = reject;
      }),
    );
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const onCreate = vi.fn();
    const onClose = vi.fn();
    const { rerender } = await renderWithI18n(
      <ToastProvider>
        <ImagePromptReverseModal
          isOpen
          onClose={onClose}
          onCreate={onCreate}
        />
      </ToastProvider>,
      { language: "zh" },
    );

    await selectSavedImage(user);
    await user.click(screen.getByRole("button", { name: "开始反推" }));

    await waitFor(() => {
      expect(chatCompletionMock).toHaveBeenCalledTimes(1);
    });

    rerender(
      <ToastProvider>
        <ImagePromptReverseModal
          isOpen={false}
          onClose={onClose}
          onCreate={onCreate}
        />
      </ToastProvider>,
    );

    await act(async () => {
      rejectReverse(new Error("late network failure"));
      await Promise.resolve();
    });

    expect(screen.queryByText("图片提示词反推失败")).not.toBeInTheDocument();
    expect(consoleErrorSpy).not.toHaveBeenCalledWith(
      "Image prompt reverse generation failed:",
      expect.any(Error),
    );
    consoleErrorSpy.mockRestore();
  });

  it("shows a reverse failure when the vision model call rejects", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockResolvedValue({ id: "created-prompt" });
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    chatCompletionMock.mockRejectedValue(new Error("network timeout"));

    await renderWithI18n(
      <ToastProvider>
        <ImagePromptReverseModal
          isOpen
          onClose={vi.fn()}
          onCreate={onCreate}
        />
      </ToastProvider>,
      { language: "zh" },
    );

    await selectSavedImage(user);
    await user.click(screen.getByRole("button", { name: "开始反推" }));

    expect(await screen.findByText("图片提示词反推失败")).toBeInTheDocument();
    expect(onCreate).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Image prompt reverse generation failed:",
      expect.any(Error),
    );
    consoleErrorSpy.mockRestore();
  });
});
