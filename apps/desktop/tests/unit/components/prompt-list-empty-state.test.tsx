import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PromptListEmptyState } from "../../../src/renderer/components/prompt/PromptListEmptyState";
import { useFolderStore } from "../../../src/renderer/stores/folder.store";
import { usePromptStore } from "../../../src/renderer/stores/prompt.store";
import { renderWithI18n } from "../../helpers/i18n";

describe("PromptListEmptyState", () => {
  beforeEach(() => {
    usePromptStore.setState({
      searchQuery: "",
      filterTags: [],
    } as Partial<ReturnType<typeof usePromptStore.getState>>);
    useFolderStore.setState({
      selectedFolderId: null,
    } as Partial<ReturnType<typeof useFolderStore.getState>>);
  });

  it("explains filtered emptiness and clears all three filter sources", async () => {
    usePromptStore.setState({
      searchQuery: "alpha",
      filterTags: ["demo"],
    } as Partial<ReturnType<typeof usePromptStore.getState>>);
    useFolderStore.setState({
      selectedFolderId: "folder-1",
    } as Partial<ReturnType<typeof useFolderStore.getState>>);

    await renderWithI18n(<PromptListEmptyState />, { language: "en" });

    expect(
      screen.getByText("No prompts match the current filters"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));

    expect(usePromptStore.getState().searchQuery).toBe("");
    expect(usePromptStore.getState().filterTags).toEqual([]);
    expect(useFolderStore.getState().selectedFolderId).toBeNull();
  });

  it("offers creation through the existing shortcut event when the library is empty", async () => {
    const listener = vi.fn();
    window.addEventListener("shortcut:newPrompt", listener);

    await renderWithI18n(<PromptListEmptyState />, { language: "en" });

    expect(
      screen.getByText("No prompts yet — create your first one"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "New Prompt" }));
    expect(listener).toHaveBeenCalledTimes(1);

    window.removeEventListener("shortcut:newPrompt", listener);
  });

  it("treats folder selection alone as an active filter", async () => {
    useFolderStore.setState({
      selectedFolderId: "folder-9",
    } as Partial<ReturnType<typeof useFolderStore.getState>>);

    await renderWithI18n(<PromptListEmptyState />, { language: "en" });

    expect(
      screen.getByRole("button", { name: "Clear filters" }),
    ).toBeInTheDocument();
  });
});
