import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PromptEditor } from "../../../src/renderer/components/prompt/PromptEditor";
import { renderWithI18n } from "../../helpers/i18n";

const showToast = vi.fn();

vi.mock("../../../src/renderer/components/ui/Toast", () => ({
  useToast: () => ({ showToast }),
}));

const prompt = {
  id: "prompt-1",
  title: "Weekly planner",
  description: "Old description",
  promptType: "text" as const,
  systemPrompt: "You are a helpful planner.",
  userPrompt: "Plan my {{timeframe}}.",
  variables: [],
  tags: ["planning"],
  images: ["cover.png"],
  isFavorite: false,
  isPinned: false,
  version: 1,
  currentVersion: 1,
  usageCount: 0,
  createdAt: "2026-05-29T00:00:00.000Z",
  updatedAt: "2026-05-29T00:00:00.000Z",
};

function hasHiddenSvgAncestor(element: Element): boolean {
  let current: Element | null = element;

  while (current) {
    if (current.getAttribute("aria-hidden") === "true") {
      return true;
    }
    current = current.parentElement;
  }

  return false;
}

describe("PromptEditor", () => {
  beforeEach(() => {
    showToast.mockClear();
    window.electron.downloadImage = vi.fn().mockResolvedValue("remote.png");
    window.electron.saveImageBuffer = vi.fn().mockResolvedValue("pasted.png");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("gives reference image remove buttons accessible names", async () => {
    await renderWithI18n(
      <PromptEditor prompt={prompt} onSave={vi.fn()} onCancel={vi.fn()} />,
      { language: "en" },
    );

    expect(
      screen.getByRole("button", { name: "Remove reference image 1" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove tag planning" }),
    ).toBeInTheDocument();
  });

  it("exposes form labels and edit preview state to assistive technology", async () => {
    await renderWithI18n(
      <PromptEditor prompt={prompt} onSave={vi.fn()} onCancel={vi.fn()} />,
      { language: "en" },
    );

    expect(screen.getByLabelText("Add tag...")).toBeInTheDocument();
    expect(screen.getByLabelText("User Prompt")).toHaveValue(
      "Plan my {{timeframe}}.",
    );
    expect(screen.getByRole("button", { name: "Edit" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Preview" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    fireEvent.click(screen.getByRole("button", { name: "Add by URL" }));

    expect(screen.getByLabelText("Enter image URL")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    expect(screen.getByRole("button", { name: "Edit" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "Preview" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    const exposedIconMarkup = Array.from(
      document.body.querySelectorAll("button svg"),
    )
      .filter((icon) => !hasHiddenSvgAncestor(icon))
      .map((icon) => icon.outerHTML);
    expect(exposedIconMarkup, exposedIconMarkup.join("\n")).toHaveLength(0);
  });

  it("preserves intentionally cleared optional fields when saving", async () => {
    const onSave = vi.fn();
    await renderWithI18n(
      <PromptEditor prompt={prompt} onSave={onSave} onCancel={vi.fn()} />,
      { language: "en" },
    );

    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "" },
    });
    fireEvent.change(screen.getByLabelText("System Prompt (Optional)"), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        description: "",
        systemPrompt: "",
      }),
    );
  });

  it("supports default values in prompt variables when previewing", async () => {
    await renderWithI18n(
      <PromptEditor
        prompt={{
          ...prompt,
          systemPrompt: "",
          userPrompt: "Plan my {{timeframe:next week}} in {{language}}.",
        }}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
      { language: "en" },
    );

    expect(screen.getByLabelText("timeframe")).toHaveValue("");
    expect(screen.getByLabelText("language")).toHaveValue("");
    expect(
      screen.getByText("Plan my next week in {{language}}."),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("timeframe"), {
      target: { value: "tomorrow" },
    });
    fireEvent.change(screen.getByLabelText("language"), {
      target: { value: "English" },
    });

    expect(
      screen.getByText("Plan my tomorrow in English."),
    ).toBeInTheDocument();
  });

  it("does not append URL downloads or show completion feedback after unmount", async () => {
    let resolveDownload: (fileName: string) => void = () => undefined;
    window.electron.downloadImage = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveDownload = resolve;
        }),
    );
    const clearTimeoutSpy = vi.spyOn(window, "clearTimeout");
    const { unmount } = await renderWithI18n(
      <PromptEditor prompt={prompt} onSave={vi.fn()} onCancel={vi.fn()} />,
      { language: "en" },
    );

    fireEvent.click(screen.getByRole("button", { name: "Add by URL" }));
    fireEvent.change(screen.getByPlaceholderText("Enter image URL"), {
      target: { value: "https://example.com/remote.png" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => {
      expect(window.electron.downloadImage).toHaveBeenCalledWith(
        "https://example.com/remote.png",
      );
    });

    unmount();

    await act(async () => {
      resolveDownload("remote.png");
      await Promise.resolve();
    });

    expect(showToast).not.toHaveBeenCalledWith(expect.any(String), "success");
    expect(clearTimeoutSpy).toHaveBeenCalled();
  });

  it("does not append pasted images after unmount", async () => {
    let resolveArrayBuffer: (buffer: ArrayBuffer) => void = () => undefined;
    window.electron.saveImageBuffer = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolve("pasted.png");
        }),
    );
    const { unmount } = await renderWithI18n(
      <PromptEditor prompt={prompt} onSave={vi.fn()} onCancel={vi.fn()} />,
      { language: "en" },
    );
    const image = {
      arrayBuffer: vi.fn(
        () =>
          new Promise<ArrayBuffer>((resolve) => {
            resolveArrayBuffer = resolve;
          }),
      ),
    } as unknown as File;
    const event = new Event("paste") as ClipboardEvent;
    Object.defineProperty(event, "clipboardData", {
      value: {
        items: [
          {
            type: "image/png",
            getAsFile: () => image,
          },
        ],
      },
    });

    act(() => {
      window.dispatchEvent(event);
    });

    await waitFor(() => {
      expect(image.arrayBuffer).toHaveBeenCalled();
    });

    unmount();

    await act(async () => {
      resolveArrayBuffer(new ArrayBuffer(4));
      await Promise.resolve();
    });

    expect(window.electron.saveImageBuffer).not.toHaveBeenCalled();
  });
});
