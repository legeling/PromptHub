import { act, fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FolderModal } from "../../../src/renderer/components/folder/FolderModal";
import { useFolderStore } from "../../../src/renderer/stores/folder.store";
import { usePromptStore } from "../../../src/renderer/stores/prompt.store";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";

vi.mock("../../../src/renderer/components/ui/Toast", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

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

describe("FolderModal", () => {
  beforeEach(() => {
    installWindowMocks();

    useFolderStore.setState({
      folders: [],
      createFolder: vi.fn().mockResolvedValue(undefined),
      updateFolder: vi.fn().mockResolvedValue(undefined),
      deleteFolder: vi.fn().mockResolvedValue(undefined),
    } as Partial<ReturnType<typeof useFolderStore.getState>>);

    usePromptStore.setState({
      prompts: [],
      updatePrompt: vi.fn().mockResolvedValue(undefined),
      deletePrompt: vi.fn().mockResolvedValue(undefined),
    } as Partial<ReturnType<typeof usePromptStore.getState>>);
  });

  it("renders as a portal attached to document.body", async () => {
    await act(async () => {
      await renderWithI18n(
        <div data-testid="sidebar-shell">
          <FolderModal isOpen={true} onClose={vi.fn()} />
        </div>,
        { language: "zh" },
      );
    });

    const title = screen.getByText("新建文件夹");
    const overlay = title.closest(".fixed.inset-0.z-50");
    const sidebarShell = screen.getByTestId("sidebar-shell");

    expect(overlay).not.toBeNull();
    expect(overlay?.parentElement).toBe(document.body);
    expect(sidebarShell).not.toContainElement(overlay);
  });

  it("keeps the pointer backdrop presentational while preserving click close", async () => {
    const onClose = vi.fn();

    await act(async () => {
      await renderWithI18n(<FolderModal isOpen={true} onClose={onClose} />, {
        language: "en",
      });
    });

    const backdrop = screen.getByTestId("folder-modal-backdrop");
    expect(backdrop).toHaveAttribute("role", "presentation");
    expect(backdrop).toHaveAttribute("aria-hidden", "true");

    fireEvent.click(backdrop);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps folder modal controls explicitly typed with decorative icons hidden", async () => {
    const onClose = vi.fn();

    await act(async () => {
      await renderWithI18n(<FolderModal isOpen={true} onClose={onClose} />, {
        language: "en",
      });
    });

    const closeButton = screen.getByRole("button", { name: "Close" });
    const buttons = Array.from(document.body.querySelectorAll("button"));
    const implicitButtonMarkup = buttons
      .filter((button) => !["button", "submit"].includes(button.getAttribute("type") ?? ""))
      .map((button) => button.outerHTML);
    const exposedIconMarkup = buttons
      .flatMap((button) => Array.from(button.querySelectorAll("svg")))
      .filter((icon) => !hasHiddenSvgAncestor(icon))
      .map((icon) => icon.outerHTML);

    expect(closeButton).toHaveAttribute("type", "button");
    expect(implicitButtonMarkup, implicitButtonMarkup.join("\n")).toHaveLength(
      0,
    );
    expect(exposedIconMarkup, exposedIconMarkup.join("\n")).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Icon" }));

    const folderIconButton = screen.getByRole("button", {
      name: "folder icon",
    });
    expect(folderIconButton).toHaveAttribute("type", "button");
    expect(folderIconButton).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(folderIconButton);

    expect(folderIconButton).toHaveAttribute("aria-pressed", "true");
    const exposedIconMarkupAfterIconMode = Array.from(
      document.body.querySelectorAll("button svg"),
    )
      .filter((icon) => !hasHiddenSvgAncestor(icon))
      .map((icon) => icon.outerHTML);
    expect(
      exposedIconMarkupAfterIconMode,
      exposedIconMarkupAfterIconMode.join("\n"),
    ).toHaveLength(0);

    const parentFolderButton = screen.getByRole("button", {
      name: "None (Root)",
    });
    expect(parentFolderButton).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(parentFolderButton);

    expect(parentFolderButton).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(closeButton);

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
