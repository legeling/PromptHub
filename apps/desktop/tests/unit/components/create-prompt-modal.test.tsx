import { StrictMode, type FormEvent } from "react";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CreatePromptModal } from "../../../src/renderer/components/prompt/CreatePromptModal";
import { ToastProvider } from "../../../src/renderer/components/ui/Toast";
import { useFolderStore } from "../../../src/renderer/stores/folder.store";
import { usePromptStore } from "../../../src/renderer/stores/prompt.store";
import { useSettingsStore } from "../../../src/renderer/stores/settings.store";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";

function resetStores() {
  installWindowMocks();
  useFolderStore.setState({
    folders: [],
    selectedFolderId: null,
    expandedIds: new Set(),
    unlockedFolderIds: new Set(),
  } as Partial<ReturnType<typeof useFolderStore.getState>>);
  usePromptStore.setState({
    prompts: [],
    selectedId: null,
    selectedIds: [],
  } as Partial<ReturnType<typeof usePromptStore.getState>>);
  useSettingsStore.setState({
    promptTagCatalog: [],
    sourceHistory: [],
  } as Partial<ReturnType<typeof useSettingsStore.getState>>);
}

async function renderCreatePromptModal() {
  resetStores();

  await renderWithI18n(
    <ToastProvider>
      <CreatePromptModal isOpen onClose={vi.fn()} onCreate={vi.fn()} />
    </ToastProvider>,
    { language: "en" },
  );
}

async function renderCreatePromptModalInForm(onSubmit: (event: FormEvent<HTMLFormElement>) => void) {
  resetStores();

  await renderWithI18n(
    <ToastProvider>
      <form onSubmit={onSubmit}>
        <CreatePromptModal isOpen onClose={vi.fn()} onCreate={vi.fn()} />
      </form>
    </ToastProvider>,
    { language: "en" },
  );
}

function expectButtonIconsHidden(button: HTMLElement) {
  for (const icon of button.querySelectorAll("svg")) {
    expect(
      icon.getAttribute("aria-hidden") === "true" ||
        Boolean(icon.closest("[aria-hidden='true']")),
    ).toBe(true);
  }
}

describe("CreatePromptModal", () => {
  it("previews a selected reference image and includes it when creating in StrictMode", async () => {
    resetStores();
    window.electron.selectImage = vi.fn().mockResolvedValue(["/tmp/reference.png"]);
    window.electron.saveImage = vi.fn().mockResolvedValue(["managed-reference.png"]);
    const onCreate = vi.fn();
    await renderWithI18n(
      <StrictMode>
        <ToastProvider>
          <CreatePromptModal isOpen onClose={vi.fn()} onCreate={onCreate} />
        </ToastProvider>
      </StrictMode>,
      { language: "en" },
    );
    fireEvent.change(screen.getByRole("textbox", { name: /Title/ }), {
      target: { value: "Reference image prompt" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: /User Prompt/ }), {
      target: { value: "Use this reference image." },
    });
    fireEvent.click(screen.getByRole("button", { name: /More Settings/ }));
    fireEvent.click(screen.getByRole("button", { name: "Upload/Paste/URL" }));
    await waitFor(() => expect(screen.getByAltText("preview-0")).toHaveAttribute(
      "src", "local-image://managed-reference.png",
    ));
    fireEvent.click(screen.getByRole("button", { name: "Preview reference image 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(screen.getByRole("button", { name: "Reset zoom" })).toHaveTextContent("125%");
    fireEvent.keyDown(screen.getByRole("button", { name: "Zoom in" }), { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Preview" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "New Prompt" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({
      title: "Reference image prompt",
      userPrompt: "Use this reference image.",
      images: ["managed-reference.png"],
    }));
  });

  it("creates a system-only prompt and visibly rejects whitespace-only content (#225)", async () => {
    resetStores();
    const onCreate = vi.fn();
    await renderWithI18n(
      <ToastProvider>
        <CreatePromptModal isOpen onClose={vi.fn()} onCreate={onCreate} />
      </ToastProvider>,
      { language: "en" },
    );
    fireEvent.change(screen.getByRole("textbox", { name: /Title/ }), {
      target: { value: "System policy" },
    });
    const create = screen.getByRole("button", { name: "Create" });
    expect(create).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /More Settings/ }));
    const system = screen.getByRole("textbox", { name: "System Prompt (Optional)" });
    fireEvent.change(system, { target: { value: " \n\t " } });
    expect(create).toBeDisabled();
    fireEvent.change(system, { target: { value: "Return JSON only." } });
    expect(create).toBeEnabled();
    fireEvent.click(create);
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({
      title: "System policy", systemPrompt: "Return JSON only.", userPrompt: "",
    }));
  });

  it("exposes core prompt fields and type selection state", async () => {
    await renderCreatePromptModal();

    expect(screen.getByRole("textbox", { name: /Title/ }))
      .toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /User Prompt/ }))
      .toBeInTheDocument();

    const textType = screen.getByRole("button", { name: "Text" });
    const imageType = screen.getByRole("button", { name: "Image" });

    expect(textType).toHaveAttribute("aria-pressed", "true");
    expect(imageType).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(imageType);

    expect(textType).toHaveAttribute("aria-pressed", "false");
    expect(imageType).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps prompt creation actions non-submit with decorative icons hidden", async () => {
    const onSubmit = vi.fn((event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
    });

    await renderCreatePromptModalInForm(onSubmit);

    fireEvent.click(screen.getByRole("button", { name: /More Settings/ }));
    fireEvent.click(screen.getByRole("button", { name: "Add by URL" }));

    for (const button of screen.getAllByRole("button")) {
      expect(button).toHaveAttribute("type", "button");
      expectButtonIconsHidden(button);
    }

    fireEvent.click(screen.getByRole("button", { name: "Image" }));

    expect(onSubmit).not.toHaveBeenCalled();
  });
});
