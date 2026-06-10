import type { FormEvent } from "react";
import { fireEvent, screen } from "@testing-library/react";
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
