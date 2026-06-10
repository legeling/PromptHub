import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { FormEvent } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { VariableInputModal } from "../../../src/renderer/components/prompt/VariableInputModal";
import { renderWithI18n } from "../../helpers/i18n";

const { showToast } = vi.hoisted(() => ({
  showToast: vi.fn(),
}));

vi.mock("../../../src/renderer/components/ui/Toast", () => ({
  useToast: () => ({ showToast }),
}));

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}

class DeferredFileReader {
  static instances: DeferredFileReader[] = [];

  result: string | null = null;
  onload: null | (() => void) = null;
  onerror: null | (() => void) = null;

  constructor() {
    DeferredFileReader.instances.push(this);
  }

  readAsDataURL(file: File) {
    this.result = `data:${file.type};base64,ZmFrZS1pbWFnZQ==`;
  }

  finish() {
    this.onload?.();
  }
}

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

describe("VariableInputModal", () => {
  beforeEach(() => {
    showToast.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("copies filled user prompt without prepending the system prompt", async () => {
    const onCopy = vi.fn();
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined);

    await renderWithI18n(
      <VariableInputModal
        isOpen
        onClose={vi.fn()}
        promptId="prompt-copy"
        systemPrompt="System {{role}}"
        userPrompt="Write about {{topic}}"
        mode="copy"
        onCopy={onCopy}
      />,
      { language: "en" },
    );

    fireEvent.change(screen.getByPlaceholderText(/topic/u), {
      target: { value: "drag upload" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Copy Result/u }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("Write about drag upload");
      expect(onCopy).toHaveBeenCalledWith("Write about drag upload");
    });
  });

  it("previews and copies default-value variables by variable name", async () => {
    const onCopy = vi.fn();
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined);

    await renderWithI18n(
      <VariableInputModal
        isOpen
        onClose={vi.fn()}
        promptId="prompt-default-copy"
        userPrompt="Translate {{topic:release notes}} into {{language:English}}."
        mode="copy"
        onCopy={onCopy}
      />,
      { language: "en" },
    );

    expect(
      screen.getByText("Translate release notes into English."),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/topic/u), {
      target: { value: "upgrade guide" },
    });

    expect(
      screen.getByText("Translate upgrade guide into English."),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Copy Result/u }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(
        "Translate upgrade guide into English.",
      );
      expect(onCopy).toHaveBeenCalledWith(
        "Translate upgrade guide into English.",
      );
    });
  });

  it("shows image attachment controls when filling variables for AI test", async () => {
    await renderWithI18n(
      <VariableInputModal
        isOpen
        onClose={vi.fn()}
        promptId="prompt-1"
        systemPrompt="You inspect images."
        userPrompt="Describe {{subject}} in this screenshot."
        mode="aiTest"
        onAiTest={vi.fn()}
      />,
      { language: "en" },
    );

    expect(screen.getByText("Test Attachments")).toBeInTheDocument();
    expect(screen.getByText("Add Images")).toBeInTheDocument();
    expect(screen.getByText(/PNG, JPG, WebP, or GIF/u)).toBeInTheDocument();
  });

  it("keeps AI test variable actions non-submit with clear state and decorative icons", async () => {
    vi.stubGlobal("FileReader", DeferredFileReader as unknown as typeof FileReader);
    DeferredFileReader.instances = [];
    const onSubmit = vi.fn((event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
    });

    await renderWithI18n(
      <form onSubmit={onSubmit}>
        <VariableInputModal
          isOpen
          onClose={vi.fn()}
          promptId="prompt-ai-actions"
          systemPrompt="You inspect images."
          userPrompt="Describe {{subject}}"
          mode="aiTest"
          onAiTest={vi.fn()}
        />
      </form>,
      { language: "en" },
    );

    fireEvent.change(screen.getByPlaceholderText(/subject/u), {
      target: { value: "accessibility sample" },
    });

    const textFormat = screen.getByRole("button", { name: "Text" });
    const jsonFormat = screen.getByRole("button", { name: "JSON" });
    const schemaFormat = screen.getByRole("button", { name: "Schema" });

    expect(textFormat).toHaveAttribute("aria-pressed", "true");
    expect(jsonFormat).toHaveAttribute("aria-pressed", "false");
    expect(schemaFormat).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(jsonFormat);
    expect(jsonFormat).toHaveAttribute("aria-pressed", "true");
    expect(textFormat).toHaveAttribute("aria-pressed", "false");

    const input = screen.getByLabelText("Add Images") as HTMLInputElement;
    fireEvent.change(input, {
      target: {
        files: [
          new File(["fake-image"], "semantic.png", { type: "image/png" }),
        ],
      },
    });
    DeferredFileReader.instances[0].finish();

    expect(await screen.findByText("semantic.png")).toBeInTheDocument();

    for (const button of screen.getAllByRole("button")) {
      if (button.tagName === "BUTTON") {
        expect(button).toHaveAttribute("type", "button");
      }
    }

    for (const icon of document.querySelectorAll("button svg")) {
      expect(isHiddenFromAccessibility(icon)).toBe(true);
    }

    fireEvent.click(screen.getByRole("button", { name: "Remove image" }));
    fireEvent.click(screen.getByRole("button", { name: "AI Test" }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("clears the copied-state timer when unmounted after copy", async () => {
    vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    const clearTimeoutSpy = vi.spyOn(window, "clearTimeout");

    const { unmount } = await renderWithI18n(
      <VariableInputModal
        isOpen
        onClose={vi.fn()}
        promptId="prompt-copy-cleanup"
        userPrompt="Write about {{topic}}"
        mode="copy"
        onCopy={vi.fn()}
      />,
      { language: "en" },
    );

    fireEvent.change(screen.getByPlaceholderText(/topic/u), {
      target: { value: "cleanup" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Copy Result/u }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Copied/u })).toBeInTheDocument();
    });

    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalledWith(expect.anything());
  });

  it("waits for clipboard success before showing copied feedback", async () => {
    const onCopy = vi.fn();
    const clipboardWrite = createDeferred<void>();
    vi.spyOn(navigator.clipboard, "writeText").mockReturnValue(
      clipboardWrite.promise,
    );

    await renderWithI18n(
      <VariableInputModal
        isOpen
        onClose={vi.fn()}
        promptId="prompt-copy-async"
        userPrompt="Write about {{topic}}"
        mode="copy"
        onCopy={onCopy}
      />,
      { language: "en" },
    );

    fireEvent.change(screen.getByPlaceholderText(/topic/u), {
      target: { value: "async clipboard" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Copy Result/u }));

    expect(onCopy).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Copy Result/u })).toBeInTheDocument();

    clipboardWrite.resolve();

    await waitFor(() => {
      expect(onCopy).toHaveBeenCalledWith("Write about async clipboard");
      expect(screen.getByRole("button", { name: /Copied/u })).toBeInTheDocument();
    });
  });

  it("does not show copied feedback or invoke callbacks when clipboard write fails", async () => {
    const onCopy = vi.fn();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(
      new Error("clipboard denied"),
    );

    await renderWithI18n(
      <VariableInputModal
        isOpen
        onClose={vi.fn()}
        promptId="prompt-copy-failure"
        userPrompt="Write about {{topic}}"
        mode="copy"
        onCopy={onCopy}
      />,
      { language: "en" },
    );

    fireEvent.change(screen.getByPlaceholderText(/topic/u), {
      target: { value: "failure path" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Copy Result/u }));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        "Write about failure path",
      );
    });

    expect(onCopy).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Copy Result/u })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Copied/u })).not.toBeInTheDocument();
  });

  it("does not show copied feedback when the copy callback fails", async () => {
    const onCopy = vi.fn().mockRejectedValue(new Error("usage update failed"));
    vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);

    await renderWithI18n(
      <VariableInputModal
        isOpen
        onClose={vi.fn()}
        promptId="prompt-copy-callback-failure"
        userPrompt="Write about {{topic}}"
        mode="copy"
        onCopy={onCopy}
      />,
      { language: "en" },
    );

    fireEvent.change(screen.getByPlaceholderText(/topic/u), {
      target: { value: "callback failure" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Copy Result/u }));

    await waitFor(() => {
      expect(onCopy).toHaveBeenCalledWith("Write about callback failure");
    });

    expect(screen.getByRole("button", { name: /Copy Result/u })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Copied/u })).not.toBeInTheDocument();
  });

  it("ignores image attachment reads that finish after the modal closes", async () => {
    vi.stubGlobal("FileReader", DeferredFileReader as unknown as typeof FileReader);
    DeferredFileReader.instances = [];

    const { rerender } = await renderWithI18n(
      <VariableInputModal
        isOpen
        onClose={vi.fn()}
        promptId="prompt-image-close"
        userPrompt="Describe {{subject}}"
        mode="aiTest"
        onAiTest={vi.fn()}
      />,
      { language: "en" },
    );

    const input = screen.getByLabelText("Add Images") as HTMLInputElement;
    const file = new File(["fake-image"], "late.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });

    expect(DeferredFileReader.instances).toHaveLength(1);

    rerender(
      <VariableInputModal
        isOpen={false}
        onClose={vi.fn()}
        promptId="prompt-image-close"
        userPrompt="Describe {{subject}}"
        mode="aiTest"
        onAiTest={vi.fn()}
      />,
    );

    DeferredFileReader.instances[0].finish();

    await waitFor(() => {
      expect(screen.queryByText("late.png")).not.toBeInTheDocument();
    });
  });

  it("rejects unsupported and oversized AI test images before reading them", async () => {
    vi.stubGlobal("FileReader", DeferredFileReader as unknown as typeof FileReader);
    DeferredFileReader.instances = [];

    await renderWithI18n(
      <VariableInputModal
        isOpen
        onClose={vi.fn()}
        promptId="prompt-image-validation"
        userPrompt="Describe {{subject}}"
        mode="aiTest"
        onAiTest={vi.fn()}
      />,
      { language: "en" },
    );

    const input = screen.getByLabelText("Add Images") as HTMLInputElement;
    const oversizedImage = new File(["fake-image"], "huge.png", {
      type: "image/png",
    });
    Object.defineProperty(oversizedImage, "size", {
      value: 10 * 1024 * 1024 + 1,
    });

    fireEvent.change(input, {
      target: {
        files: [
          new File(["not-image"], "notes.txt", { type: "text/plain" }),
          oversizedImage,
        ],
      },
    });

    expect(DeferredFileReader.instances).toHaveLength(0);
    expect(showToast).toHaveBeenCalledWith(
      "notes.txt is not an image file",
      "error",
    );
    expect(showToast).toHaveBeenCalledWith("huge.png exceeds 10.0 MB", "error");
    expect(screen.queryByText("notes.txt")).not.toBeInTheDocument();
    expect(screen.queryByText("huge.png")).not.toBeInTheDocument();
  });

});
