import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SkillStore } from "../../../src/renderer/components/skill/SkillStore";
import { SkillStoreCustomSources } from "../../../src/renderer/components/skill/SkillStoreCustomSources";
import { SkillStoreSourceEditModal } from "../../../src/renderer/components/skill/SkillStoreSourceEditModal";
import { SkillStoreSourceForm } from "../../../src/renderer/components/skill/SkillStoreSourceForm";
import { useSkillStore } from "../../../src/renderer/stores/skill.store";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";
import type { RegistrySkill } from "@prompthub/shared/types";
import { buildSkillSourceId } from "@prompthub/shared/utils/skill-identity";

const { showToast } = vi.hoisted(() => ({
  showToast: vi.fn(),
}));

vi.mock("../../../src/renderer/components/ui/Toast", () => ({
  useToast: () => ({ showToast }),
}));

function makeRegistrySkill(
  overrides: Partial<RegistrySkill> = {},
): RegistrySkill {
  return {
    slug: "docs-helper",
    name: "Docs Helper",
    description: "Helps with docs",
    category: "general",
    author: "tester",
    source_url: "https://example.com/docs-helper",
    source_id: "docs-helper-source",
    tags: [],
    version: "1.0.0",
    content: "# Docs Helper\n",
    ...overrides,
  };
}

describe("SkillStore custom sources", () => {
  beforeEach(() => {
    useSkillStore.setState({
      skills: [],
      selectedSkillId: null,
      isLoading: false,
      error: null,
      viewMode: "gallery",
      searchQuery: "",
      filterType: "all",
      filterTags: [],
      deployedSkillNames: new Set<string>(),
      storeView: "store",
      registrySkills: [],
      isLoadingRegistry: false,
      storeCategory: "all",
      storeSearchQuery: "",
      selectedRegistrySlug: null,
      customStoreSources: [],
      selectedStoreSourceId: "official",
      remoteStoreEntries: {},
      translationCache: {},
    });
  });

  it("renders custom source counts from legacy cache entries without skills arrays", async () => {
    await act(async () => {
      await renderWithI18n(
        <SkillStoreCustomSources
          customStoreSources={[
            {
              id: "team-store",
              name: "Team Store",
              type: "git-repo",
              url: "https://github.com/example/team-store",
              enabled: true,
              order: 0,
              createdAt: Date.now(),
            },
          ]}
          loadStoreSource={vi.fn()}
          loadingSourceId={null}
          onRequestDeleteCustomStoreSource={vi.fn()}
          remoteStoreEntries={{
            "team-store": { loadedAt: Date.now(), error: null },
          }}
          selectStoreSource={vi.fn()}
          selectedCustomSource={null}
          selectedStoreSourceId="new-custom"
          t={((_key: string, fallback: string) => fallback) as never}
          toggleCustomStoreSource={vi.fn()}
        />,
        { language: "en" },
      );
    });

    const sourceCard = screen.getByText("Team Store").closest("div");
    expect(sourceCard).not.toBeNull();
    expect(screen.getByText("0 skills")).toBeInTheDocument();
  });

  it("keeps custom source rows keyboard-selectable and action buttons isolated", async () => {
    const user = userEvent.setup();
    const loadStoreSource = vi.fn().mockResolvedValue(undefined);
    const onRequestDeleteCustomStoreSource = vi.fn();
    const selectStoreSource = vi.fn();
    const toggleCustomStoreSource = vi.fn();

    await act(async () => {
      await renderWithI18n(
        <SkillStoreCustomSources
          customStoreSources={[
            {
              id: "team-store",
              name: "Team Store",
              type: "git-repo",
              url: "https://github.com/example/team-store",
              enabled: true,
              order: 0,
              createdAt: Date.now(),
            },
          ]}
          loadStoreSource={loadStoreSource}
          loadingSourceId={null}
          onRequestDeleteCustomStoreSource={onRequestDeleteCustomStoreSource}
          remoteStoreEntries={{}}
          selectStoreSource={selectStoreSource}
          selectedCustomSource={null}
          selectedStoreSourceId="team-store"
          t={((_key: string, fallback: string) => fallback) as never}
          toggleCustomStoreSource={toggleCustomStoreSource}
        />,
        { language: "en" },
      );
    });

    const sourceButton = screen.getByRole("button", { name: /Team Store/u });
    expect(sourceButton).toHaveAttribute("type", "button");
    expect(sourceButton).toHaveAttribute("aria-pressed", "true");

    sourceButton.focus();
    await user.keyboard("[Enter]");
    await user.click(sourceButton);

    expect(selectStoreSource).toHaveBeenCalledTimes(2);
    expect(selectStoreSource).toHaveBeenNthCalledWith(1, "team-store");
    expect(selectStoreSource).toHaveBeenNthCalledWith(2, "team-store");

    const toggleButton = screen.getByRole("button", { name: "Disable" });
    const refreshButton = screen.getByRole("button", { name: "Refresh" });
    const deleteButton = screen.getByRole("button", { name: "Delete" });

    for (const action of [toggleButton, refreshButton, deleteButton]) {
      expect(action).toHaveAttribute("type", "button");
      expect(action.querySelector("svg")).toHaveAttribute(
        "aria-hidden",
        "true",
      );
    }

    await user.click(refreshButton);
    await user.click(deleteButton);
    await user.click(toggleButton);

    expect(loadStoreSource).toHaveBeenCalledWith("team-store", true);
    expect(onRequestDeleteCustomStoreSource).toHaveBeenCalledWith("team-store");
    expect(toggleCustomStoreSource).toHaveBeenCalledWith("team-store");
    expect(selectStoreSource).toHaveBeenCalledTimes(2);
  });

  it("disables the custom source row refresh action while that source is loading", async () => {
    const user = userEvent.setup();
    const loadStoreSource = vi.fn().mockResolvedValue(undefined);

    await act(async () => {
      await renderWithI18n(
        <SkillStoreCustomSources
          customStoreSources={[
            {
              id: "team-store",
              name: "Team Store",
              type: "git-repo",
              url: "https://github.com/example/team-store",
              enabled: true,
              order: 0,
              createdAt: Date.now(),
            },
          ]}
          loadStoreSource={loadStoreSource}
          loadingSourceId="team-store"
          onRequestDeleteCustomStoreSource={vi.fn()}
          remoteStoreEntries={{}}
          selectStoreSource={vi.fn()}
          selectedCustomSource={null}
          selectedStoreSourceId="official"
          t={((_key: string, fallback: string) => fallback) as never}
          toggleCustomStoreSource={vi.fn()}
        />,
        { language: "en" },
      );
    });

    const refreshButton = screen.getByRole("button", { name: "Refresh" });
    expect(refreshButton).toBeDisabled();

    await user.click(refreshButton);

    expect(loadStoreSource).not.toHaveBeenCalled();
  });

  it("exposes add-source type choices as pressed buttons and keeps add non-submit", async () => {
    const setSourceType = vi.fn();

    await act(async () => {
      await renderWithI18n(
        <SkillStoreSourceForm
          branch=""
          directory=""
          handleAddSource={vi.fn()}
          setBranch={vi.fn()}
          setDirectory={vi.fn()}
          setSourceName={vi.fn()}
          setSourceType={setSourceType}
          setSourceUrl={vi.fn()}
          sourceName=""
          sourceType="git-repo"
          sourceUrl=""
          t={((_key: string, fallback: string) => fallback) as never}
          typeOptions={[
            {
              value: "marketplace-json",
              icon: <svg data-testid="marketplace-json-icon" />,
            },
            {
              value: "git-repo",
              icon: <svg data-testid="git-repo-icon" />,
            },
            {
              value: "local-dir",
              icon: <svg data-testid="local-dir-icon" />,
            },
          ]}
        />,
        { language: "en" },
      );
    });

    const marketplace = screen.getByRole("button", {
      name: /Marketplace JSON/u,
    });
    const git = screen.getByRole("button", { name: /Git Repository/u });
    const local = screen.getByRole("button", { name: /Local Directory/u });

    expect(marketplace).toHaveAttribute("type", "button");
    expect(marketplace).toHaveAttribute("aria-pressed", "false");
    expect(git).toHaveAttribute("type", "button");
    expect(git).toHaveAttribute("aria-pressed", "true");
    expect(local).toHaveAttribute("type", "button");
    expect(local).toHaveAttribute("aria-pressed", "false");
    expect(git.querySelector("[data-testid='git-repo-icon']")?.parentElement)
      .toHaveAttribute("aria-hidden", "true");

    const add = screen.getByRole("button", { name: "Add" });
    expect(add).toHaveAttribute("type", "button");

    fireEvent.click(local);
    expect(setSourceType).toHaveBeenCalledWith("local-dir");
  });

  it("exposes add-source text fields with stable accessible names", async () => {
    await act(async () => {
      await renderWithI18n(
        <SkillStoreSourceForm
          branch=""
          directory=""
          handleAddSource={vi.fn()}
          setBranch={vi.fn()}
          setDirectory={vi.fn()}
          setSourceName={vi.fn()}
          setSourceType={vi.fn()}
          setSourceUrl={vi.fn()}
          sourceName=""
          sourceType="git-repo"
          sourceUrl=""
          t={((_key: string, fallback: string) => fallback) as never}
          typeOptions={[
            { value: "marketplace-json", icon: <svg /> },
            { value: "git-repo", icon: <svg /> },
            { value: "local-dir", icon: <svg /> },
          ]}
        />,
        { language: "en" },
      );
    });

    expect(
      screen.getByRole("textbox", { name: "Store name" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "Store URL / manifest URL" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", {
        name: "Branch (optional, default branch if empty)",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", {
        name: "Directory (optional, e.g. skills/.curated)",
      }),
    ).toBeInTheDocument();
  });

  it("disables add-source until required fields are filled", async () => {
    function AddSourceHarness() {
      const [sourceName, setSourceName] = useState("");
      const [sourceUrl, setSourceUrl] = useState("");

      return (
        <SkillStoreSourceForm
          branch=""
          directory=""
          handleAddSource={vi.fn()}
          setBranch={vi.fn()}
          setDirectory={vi.fn()}
          setSourceName={setSourceName}
          setSourceType={vi.fn()}
          setSourceUrl={setSourceUrl}
          sourceName={sourceName}
          sourceType="marketplace-json"
          sourceUrl={sourceUrl}
          t={((_key: string, fallback: string) => fallback) as never}
          typeOptions={[
            { value: "marketplace-json", icon: <svg /> },
            { value: "git-repo", icon: <svg /> },
            { value: "local-dir", icon: <svg /> },
          ]}
        />
      );
    }

    await act(async () => {
      await renderWithI18n(<AddSourceHarness />, { language: "en" });
    });

    const add = screen.getByRole("button", { name: "Add" });
    expect(add).toBeDisabled();

    fireEvent.change(screen.getByRole("textbox", { name: "Store name" }), {
      target: { value: "Docs Store" },
    });
    expect(add).toBeDisabled();

    fireEvent.change(
      screen.getByRole("textbox", { name: "Store URL / manifest URL" }),
      { target: { value: "https://example.com/store.json" } },
    );

    expect(add).toBeEnabled();
  });

  it("clears add-source branch loading when the repository URL becomes invalid", async () => {
    let resolveBranches: ((value: string[]) => void) | undefined;
    const listRemoteBranches = vi.fn(
      () =>
        new Promise<string[]>((resolve) => {
          resolveBranches = resolve;
        }),
    );
    installWindowMocks({
      api: {
        skill: {
          listRemoteBranches,
        },
      },
    });

    function AddSourceHarness() {
      const [sourceUrl, setSourceUrl] = useState("");

      return (
        <SkillStoreSourceForm
          branch=""
          directory=""
          handleAddSource={vi.fn()}
          setBranch={vi.fn()}
          setDirectory={vi.fn()}
          setSourceName={vi.fn()}
          setSourceType={vi.fn()}
          setSourceUrl={setSourceUrl}
          sourceName=""
          sourceType="git-repo"
          sourceUrl={sourceUrl}
          t={((_key: string, fallback: string) => fallback) as never}
          typeOptions={[
            { value: "marketplace-json", icon: <svg /> },
            { value: "git-repo", icon: <svg /> },
            { value: "local-dir", icon: <svg /> },
          ]}
        />
      );
    }

    await act(async () => {
      await renderWithI18n(<AddSourceHarness />, { language: "en" });
    });

    const urlInput = screen.getByRole("textbox", {
      name: "Store URL / manifest URL",
    });
    fireEvent.change(urlInput, {
      target: { value: "https://github.com/example/store" },
    });

    await waitFor(() => {
      expect(screen.getByText("Loading branches...")).toBeInTheDocument();
    });

    fireEvent.change(urlInput, { target: { value: "not-a-remote-repo" } });

    await waitFor(() => {
      expect(screen.queryByText("Loading branches...")).not.toBeInTheDocument();
    });
    expect(listRemoteBranches).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveBranches?.(["main"]);
    });
  });

  it("exposes edit-source type choices as pressed buttons with decorative icons hidden", async () => {
    await act(async () => {
      await renderWithI18n(
        <SkillStoreSourceEditModal
          isOpen
          onClose={vi.fn()}
          onDelete={vi.fn()}
          onRefresh={vi.fn()}
          onSave={vi.fn()}
          onToggleEnabled={vi.fn()}
          refreshingSourceId="custom-docs"
          source={{
            id: "custom-docs",
            name: "Docs Store",
            type: "git-repo",
            url: "not-a-remote-repo",
            branch: "main",
            enabled: true,
            order: 0,
            createdAt: Date.now(),
          }}
        />,
        { language: "en" },
      );
    });

    const marketplace = screen.getByRole("button", {
      name: /Marketplace JSON/u,
    });
    const git = screen.getByRole("button", { name: /Git Repository/u });
    const local = screen.getByRole("button", { name: /Local Directory/u });

    expect(marketplace).toHaveAttribute("type", "button");
    expect(marketplace).toHaveAttribute("aria-pressed", "false");
    expect(git).toHaveAttribute("type", "button");
    expect(git).toHaveAttribute("aria-pressed", "true");
    expect(local).toHaveAttribute("type", "button");
    expect(local).toHaveAttribute("aria-pressed", "false");
    expect(git.querySelector("svg")?.parentElement).toHaveAttribute(
      "aria-hidden",
      "true",
    );

    const refresh = screen.getByRole("button", { name: "Refresh" });
    expect(refresh).toHaveAttribute("type", "button");
    expect(refresh.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("disables the edit-source refresh action while that source is refreshing", async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn();

    await act(async () => {
      await renderWithI18n(
        <SkillStoreSourceEditModal
          isOpen
          onClose={vi.fn()}
          onDelete={vi.fn()}
          onRefresh={onRefresh}
          onSave={vi.fn()}
          onToggleEnabled={vi.fn()}
          refreshingSourceId="custom-docs"
          source={{
            id: "custom-docs",
            name: "Docs Store",
            type: "marketplace-json",
            url: "https://example.com/store.json",
            enabled: true,
            order: 0,
            createdAt: Date.now(),
          }}
        />,
        { language: "en" },
      );
    });

    const refresh = screen.getByRole("button", { name: "Refresh" });
    expect(refresh).toBeDisabled();

    await user.click(refresh);

    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("exposes edit-source text fields with stable accessible names", async () => {
    await act(async () => {
      await renderWithI18n(
        <SkillStoreSourceEditModal
          isOpen
          onClose={vi.fn()}
          onDelete={vi.fn()}
          onRefresh={vi.fn()}
          onSave={vi.fn()}
          onToggleEnabled={vi.fn()}
          source={{
            id: "custom-docs",
            name: "Docs Store",
            type: "git-repo",
            url: "https://github.com/example/store",
            branch: "main",
            directory: "skills/docs",
            enabled: true,
            order: 0,
            createdAt: Date.now(),
          }}
        />,
        { language: "en" },
      );
    });

    expect(
      screen.getByRole("textbox", { name: "Store name" }),
    ).toHaveValue("Docs Store");
    expect(
      screen.getByRole("textbox", { name: "Store URL / manifest URL" }),
    ).toHaveValue("https://github.com/example/store");
    expect(
      screen.getByRole("textbox", {
        name: "Branch (optional, default branch if empty)",
      }),
    ).toHaveValue("main");
    expect(
      screen.getByRole("textbox", {
        name: "Directory (optional, e.g. skills/.curated)",
      }),
    ).toHaveValue("skills/docs");
  });

  it("disables edit-source save when required fields are blank", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();

    await act(async () => {
      await renderWithI18n(
        <SkillStoreSourceEditModal
          isOpen
          onClose={vi.fn()}
          onDelete={vi.fn()}
          onRefresh={vi.fn()}
          onSave={onSave}
          onToggleEnabled={vi.fn()}
          source={{
            id: "custom-docs",
            name: "Docs Store",
            type: "marketplace-json",
            url: "https://example.com/store.json",
            enabled: true,
            order: 0,
            createdAt: Date.now(),
          }}
        />,
        { language: "en" },
      );
    });

    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeEnabled();

    await user.clear(screen.getByRole("textbox", { name: "Store name" }));
    expect(save).toBeDisabled();

    await user.click(save);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("clears edit-source branch loading when the repository URL becomes invalid", async () => {
    let resolveBranches: ((value: string[]) => void) | undefined;
    const listRemoteBranches = vi.fn(
      () =>
        new Promise<string[]>((resolve) => {
          resolveBranches = resolve;
        }),
    );
    installWindowMocks({
      api: {
        skill: {
          listRemoteBranches,
        },
      },
    });

    await act(async () => {
      await renderWithI18n(
        <SkillStoreSourceEditModal
          isOpen
          onClose={vi.fn()}
          onDelete={vi.fn()}
          onRefresh={vi.fn()}
          onSave={vi.fn()}
          onToggleEnabled={vi.fn()}
          source={{
            id: "custom-docs",
            name: "Docs Store",
            type: "git-repo",
            url: "https://github.com/example/store",
            branch: "main",
            enabled: true,
            order: 0,
            createdAt: Date.now(),
          }}
        />,
        { language: "en" },
      );
    });

    await waitFor(() => {
      expect(screen.getByText("Loading branches...")).toBeInTheDocument();
    });

    fireEvent.change(
      screen.getByRole("textbox", { name: "Store URL / manifest URL" }),
      { target: { value: "not-a-remote-repo" } },
    );

    await waitFor(() => {
      expect(screen.queryByText("Loading branches...")).not.toBeInTheDocument();
    });
    expect(listRemoteBranches).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveBranches?.(["main"]);
    });
  });

  it("edits a custom store source from the header action modal", async () => {
    installWindowMocks({
      api: {
        skill: {
          fetchRemoteContent: vi
            .fn()
            .mockResolvedValue(JSON.stringify({ skills: [] })),
          listRemoteBranches: vi.fn().mockResolvedValue(["main", "release"]),
          scanLocalPreview: vi.fn().mockResolvedValue([]),
          scanSafety: vi.fn().mockResolvedValue({
            level: "safe",
            summary: "safe",
            findings: [],
            recommendedAction: "allow",
            scannedAt: Date.now(),
            checkedFileCount: 1,
            scanMethod: "ai",
          }),
        },
      },
    });

    useSkillStore.setState({
      storeView: "store",
      customStoreSources: [
        {
          id: "custom-docs",
          name: "Docs Store",
          type: "git-repo",
          url: "https://github.com/example/store",
          branch: "main",
          directory: "skills/docs",
          enabled: true,
          order: 0,
          createdAt: Date.now(),
        },
      ],
      selectedStoreSourceId: "custom-docs",
    } as never);

    await act(async () => {
      await renderWithI18n(<SkillStore />, { language: "en" });
    });

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    const input = screen.getByDisplayValue("Docs Store");
    fireEvent.change(input, { target: { value: "Docs Store Renamed" } });
    fireEvent.change(screen.getByDisplayValue("main"), {
      target: { value: "release" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(useSkillStore.getState().customStoreSources[0]?.name).toBe(
        "Docs Store Renamed",
      );
    });

    expect(useSkillStore.getState().customStoreSources[0]?.branch).toBe(
      "release",
    );
    expect(screen.getAllByText("Docs Store Renamed").length).toBeGreaterThan(0);
  }, 60_000);

  it("requires confirmation before deleting a custom store source from the edit modal", async () => {
    const user = userEvent.setup();
    installWindowMocks({
      api: {
        skill: {
          fetchRemoteContent: vi
            .fn()
            .mockResolvedValue(JSON.stringify({ skills: [] })),
          listRemoteBranches: vi.fn().mockResolvedValue(["main"]),
          scanLocalPreview: vi.fn().mockResolvedValue([]),
          scanSafety: vi.fn().mockResolvedValue({
            level: "safe",
            summary: "safe",
            findings: [],
            recommendedAction: "allow",
            scannedAt: Date.now(),
            checkedFileCount: 1,
            scanMethod: "ai",
          }),
        },
      },
    });

    useSkillStore.setState({
      storeView: "store",
      customStoreSources: [
        {
          id: "custom-docs",
          name: "Docs Store",
          type: "git-repo",
          url: "https://github.com/example/store",
          branch: "main",
          enabled: true,
          order: 0,
          createdAt: Date.now(),
        },
      ],
      selectedStoreSourceId: "custom-docs",
    } as never);

    await act(async () => {
      await renderWithI18n(<SkillStore />, { language: "en" });
    });

    await user.click(screen.getByRole("button", { name: "Edit" }));
    const deleteButtons = screen.getAllByRole("button", { name: "Delete" });
    await user.click(deleteButtons[0]);

    expect(useSkillStore.getState().customStoreSources).toHaveLength(1);
    const confirmDialog = screen.getByRole("alertdialog");
    expect(confirmDialog).toBeInTheDocument();

    await user.click(within(confirmDialog).getByRole("button", { name: "Cancel" }));
    expect(useSkillStore.getState().customStoreSources).toHaveLength(1);

    await user.click(screen.getAllByRole("button", { name: "Delete" })[0]);
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Delete",
      }),
    );

    await waitFor(() => {
      expect(useSkillStore.getState().customStoreSources).toHaveLength(0);
    });
    expect(useSkillStore.getState().selectedStoreSourceId).toBe("official");
  }, 60_000);

  it("normalizes GitHub tree URLs before requesting remote branches", async () => {
    const listRemoteBranches = vi.fn().mockResolvedValue(["main", "release"]);

    installWindowMocks({
      api: {
        skill: {
          fetchRemoteContent: vi
            .fn()
            .mockResolvedValue(JSON.stringify({ skills: [] })),
          listRemoteBranches,
          scanLocalPreview: vi.fn().mockResolvedValue([]),
          scanSafety: vi.fn().mockResolvedValue({
            level: "safe",
            summary: "safe",
            findings: [],
            recommendedAction: "allow",
            scannedAt: Date.now(),
            checkedFileCount: 1,
            scanMethod: "ai",
          }),
        },
      },
    });

    useSkillStore.setState({ selectedStoreSourceId: "new-custom" } as never);

    await act(async () => {
      await renderWithI18n(<SkillStore />, { language: "en" });
    });

    fireEvent.click(screen.getByRole("button", { name: /Git Repository/i }));

    fireEvent.change(screen.getByPlaceholderText("Store URL / manifest URL"), {
      target: {
        value: "https://github.com/anthropics/skills/tree/main/skills/.curated",
      },
    });

    await waitFor(() => {
      expect(listRemoteBranches).toHaveBeenCalledWith(
        "https://github.com/anthropics/skills",
      );
    });
  });

  it("keeps main visible in branch suggestions when many branches exist", async () => {
    const listRemoteBranches = vi
      .fn()
      .mockResolvedValue([
        "andibrae/create-top-level-namespace",
        "klazuka/add-3p-notices",
        "klazuka/add-cc-instructions",
        "klazuka/add-cc-marketplace",
        "klazuka/doc-skills",
        "klazuka/export",
        "klazuka/export-20260203",
        "klazuka/frontend-design-skill",
        "klazuka/pptx-cleanup",
        "klazuka/spec",
        "mahesh/add-to-readme",
        "mahesh/clarify-claude-code-install",
        "main",
        "mattpic-ant/blog-small-fix",
      ]);

    installWindowMocks({
      api: {
        skill: {
          fetchRemoteContent: vi
            .fn()
            .mockResolvedValue(JSON.stringify({ skills: [] })),
          listRemoteBranches,
          scanLocalPreview: vi.fn().mockResolvedValue([]),
          scanSafety: vi.fn().mockResolvedValue({
            level: "safe",
            summary: "safe",
            findings: [],
            recommendedAction: "allow",
            scannedAt: Date.now(),
            checkedFileCount: 1,
            scanMethod: "ai",
          }),
        },
      },
    });

    useSkillStore.setState({ selectedStoreSourceId: "new-custom" } as never);

    await act(async () => {
      await renderWithI18n(<SkillStore />, { language: "en" });
    });

    fireEvent.click(screen.getByRole("button", { name: /Git Repository/i }));
    fireEvent.change(screen.getByPlaceholderText("Store URL / manifest URL"), {
      target: { value: "https://github.com/anthropics/skills/tree/main" },
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "main" })).toBeInTheDocument();
    });
  });

  it("hides the selected branch from the suggestion list", async () => {
    const listRemoteBranches = vi.fn().mockResolvedValue(["main", "release"]);

    installWindowMocks({
      api: {
        skill: {
          fetchRemoteContent: vi
            .fn()
            .mockResolvedValue(JSON.stringify({ skills: [] })),
          listRemoteBranches,
          scanLocalPreview: vi.fn().mockResolvedValue([]),
          scanSafety: vi.fn().mockResolvedValue({
            level: "safe",
            summary: "safe",
            findings: [],
            recommendedAction: "allow",
            scannedAt: Date.now(),
            checkedFileCount: 1,
            scanMethod: "ai",
          }),
        },
      },
    });

    useSkillStore.setState({ selectedStoreSourceId: "new-custom" } as never);

    await act(async () => {
      await renderWithI18n(<SkillStore />, { language: "en" });
    });

    fireEvent.click(screen.getByRole("button", { name: /Git Repository/i }));
    fireEvent.change(screen.getByPlaceholderText("Store URL / manifest URL"), {
      target: { value: "https://github.com/anthropics/skills" },
    });

    await waitFor(() => {
      expect(screen.getByText("Suggested branches")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "main" }));

    expect(screen.getByDisplayValue("main")).toBeInTheDocument();
    expect(screen.queryAllByRole("button", { name: "main" })).toHaveLength(0);
  });

  it("renders localized branch helper copy", async () => {
    const listRemoteBranches = vi.fn().mockResolvedValue(["main", "release"]);

    installWindowMocks({
      api: {
        skill: {
          fetchRemoteContent: vi
            .fn()
            .mockResolvedValue(JSON.stringify({ skills: [] })),
          listRemoteBranches,
          scanLocalPreview: vi.fn().mockResolvedValue([]),
          scanSafety: vi.fn().mockResolvedValue({
            level: "safe",
            summary: "safe",
            findings: [],
            recommendedAction: "allow",
            scannedAt: Date.now(),
            checkedFileCount: 1,
            scanMethod: "ai",
          }),
        },
      },
    });

    useSkillStore.setState({ selectedStoreSourceId: "new-custom" } as never);

    await act(async () => {
      await renderWithI18n(<SkillStore />, { language: "zh" });
    });

    fireEvent.click(screen.getByRole("button", { name: /Git 仓库/i }));
    fireEvent.change(screen.getByPlaceholderText("商店地址 / manifest URL"), {
      target: { value: "https://github.com/anthropics/skills" },
    });

    await waitFor(() => {
      expect(screen.getByText("可选分支")).toBeInTheDocument();
    });

    expect(
      screen.getByPlaceholderText("分支（可选，留空则使用默认分支）"),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("目录（可选，例如 skills/.curated）"),
    ).toBeInTheDocument();
  });

  it("does not render duplicate custom store action cards in the main pane", async () => {
    installWindowMocks({
      api: {
        skill: {
          fetchRemoteContent: vi
            .fn()
            .mockResolvedValue(JSON.stringify({ skills: [] })),
          scanLocalPreview: vi.fn().mockResolvedValue([]),
          scanSafety: vi.fn().mockResolvedValue({
            level: "safe",
            summary: "safe",
            findings: [],
            recommendedAction: "allow",
            scannedAt: Date.now(),
            checkedFileCount: 1,
            scanMethod: "ai",
          }),
        },
      },
    });

    useSkillStore.setState({
      storeView: "store",
      customStoreSources: [
        {
          id: "custom-docs",
          name: "Docs Store",
          type: "marketplace-json",
          url: "https://example.com/store.json",
          enabled: true,
          order: 0,
          createdAt: Date.now(),
        },
      ],
      selectedStoreSourceId: "custom-docs",
    } as never);

    await act(async () => {
      await renderWithI18n(<SkillStore />, { language: "en" });
    });

    expect(
      screen.queryByRole("button", { name: "Disable" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Delete" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Enabled")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(
      screen.getByText("No skills in this custom store yet"),
    ).toBeInTheDocument();
    expect(screen.queryByText("No skills found")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Try a different search or category"),
    ).not.toBeInTheDocument();
    expect(screen.queryAllByText("Docs Store")).toHaveLength(1);
    expect(
      screen.queryByPlaceholderText("Search skills..."),
    ).not.toBeInTheDocument();
  });

  it("keeps selected custom store header actions semantic and decorative icons hidden", async () => {
    installWindowMocks({
      api: {
        skill: {
          fetchRemoteContent: vi
            .fn()
            .mockResolvedValue(JSON.stringify({ skills: [] })),
          scanLocalPreview: vi.fn().mockResolvedValue([]),
          scanSafety: vi.fn().mockResolvedValue({
            level: "safe",
            summary: "safe",
            findings: [],
            recommendedAction: "allow",
            scannedAt: Date.now(),
            checkedFileCount: 1,
            scanMethod: "ai",
          }),
        },
      },
    });

    useSkillStore.setState({
      storeView: "store",
      customStoreSources: [
        {
          id: "custom-docs",
          name: "Docs Store",
          type: "marketplace-json",
          url: "https://example.com/store.json",
          enabled: true,
          order: 0,
          createdAt: Date.now(),
        },
      ],
      selectedStoreSourceId: "custom-docs",
    } as never);

    await act(async () => {
      await renderWithI18n(<SkillStore />, { language: "en" });
    });

    for (const name of ["Batch manage store", "Refresh", "Edit"]) {
      const action = screen.getByRole("button", { name });
      expect(action).toHaveAttribute("type", "button");
      expect(action.querySelector("svg")).toHaveAttribute(
        "aria-hidden",
        "true",
      );
    }
  });

  it("exposes custom store category filters as pressed non-submit buttons", async () => {
    installWindowMocks({
      api: {
        skill: {
          fetchRemoteContent: vi
            .fn()
            .mockResolvedValue(JSON.stringify({ skills: [] })),
          scanLocalPreview: vi.fn().mockResolvedValue([]),
          scanSafety: vi.fn().mockResolvedValue({
            level: "safe",
            summary: "safe",
            findings: [],
            recommendedAction: "allow",
            scannedAt: Date.now(),
            checkedFileCount: 1,
            scanMethod: "ai",
          }),
        },
      },
    });

    useSkillStore.setState({
      storeView: "store",
      storeCategory: "all",
      customStoreSources: [
        {
          id: "custom-docs",
          name: "Docs Store",
          type: "marketplace-json",
          url: "https://example.com/store.json",
          enabled: true,
          order: 0,
          createdAt: Date.now(),
        },
      ],
      selectedStoreSourceId: "custom-docs",
    } as never);

    await act(async () => {
      await renderWithI18n(<SkillStore />, { language: "en" });
    });

    const all = screen.getByRole("button", { name: "All" });
    const development = screen.getByRole("button", { name: "Development" });

    expect(all).toHaveAttribute("type", "button");
    expect(all).toHaveAttribute("aria-pressed", "true");
    expect(development).toHaveAttribute("type", "button");
    expect(development).toHaveAttribute("aria-pressed", "false");
    expect(development.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );

    await act(async () => {
      fireEvent.click(development);
    });

    expect(useSkillStore.getState().storeCategory).toBe("dev");
  });

  it("keeps custom store batch action icons decorative", async () => {
    installWindowMocks({
      api: {
        skill: {
          fetchRemoteContent: vi
            .fn()
            .mockResolvedValue(JSON.stringify({ skills: [] })),
          scanLocalPreview: vi.fn().mockResolvedValue([]),
          scanSafety: vi.fn().mockResolvedValue({
            level: "safe",
            summary: "safe",
            findings: [],
            recommendedAction: "allow",
            scannedAt: Date.now(),
            checkedFileCount: 1,
            scanMethod: "ai",
          }),
        },
      },
    });

    useSkillStore.setState({
      storeView: "store",
      customStoreSources: [
        {
          id: "custom-docs",
          name: "Docs Store",
          type: "marketplace-json",
          url: "https://example.com/store.json",
          enabled: true,
          order: 0,
          createdAt: Date.now(),
        },
      ],
      selectedStoreSourceId: "custom-docs",
      remoteStoreEntries: {
        "custom-docs": {
          loadedAt: Date.now(),
          error: null,
          skills: [makeRegistrySkill()],
        },
      },
    } as never);

    await act(async () => {
      await renderWithI18n(<SkillStore />, { language: "en" });
    });

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Batch manage store" }),
      );
    });

    for (const name of [
      "Select visible store skills",
      "Install selected",
      "Update selected",
      "Remove selected from My Skills",
      "Deselect All",
    ]) {
      const action = screen.getByRole("button", { name });
      expect(action).toHaveAttribute("type", "button");
      expect(action.querySelector("svg")).toHaveAttribute(
        "aria-hidden",
        "true",
      );
    }
  });

  it("renders one custom store empty state even when a search query is active", async () => {
    installWindowMocks({
      api: {
        skill: {
          fetchRemoteContent: vi
            .fn()
            .mockResolvedValue(JSON.stringify({ skills: [] })),
          scanLocalPreview: vi.fn().mockResolvedValue([]),
          scanSafety: vi.fn().mockResolvedValue({
            level: "safe",
            summary: "safe",
            findings: [],
            recommendedAction: "allow",
            scannedAt: Date.now(),
            checkedFileCount: 1,
            scanMethod: "ai",
          }),
        },
      },
    });

    useSkillStore.setState({
      storeView: "store",
      selectedStoreSourceId: "empty-custom",
      storeSearchQuery: "missing",
      customStoreSources: [
        {
          id: "empty-custom",
          name: "Empty Custom Store",
          type: "marketplace-json",
          url: "https://example.com/marketplace.json",
          enabled: true,
          order: 0,
          createdAt: Date.now(),
        },
      ],
      remoteStoreEntries: {
        "empty-custom": {
          loadedAt: Date.now(),
          error: null,
          skills: [],
        },
      },
    } as never);

    await act(async () => {
      await renderWithI18n(<SkillStore />, { language: "en" });
    });

    expect(
      screen.getByText("No skills in this custom store yet"),
    ).toBeInTheDocument();
    expect(screen.queryByText("No skills found")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Try a different search or category"),
    ).not.toBeInTheDocument();
  });

  it("refreshes a local directory source from the latest SKILL.md on disk", async () => {
    const scanLocalPreview = vi
      .fn()
      .mockResolvedValueOnce([
        {
          name: "local-writer",
          description: "Local source skill",
          version: "1.0.0",
          author: "Local",
          tags: ["local"],
          instructions: "# Local Writer\n\nOld content\n",
          filePath: "/tmp/local-writer/SKILL.md",
          localPath: "/tmp/local-writer",
          platforms: ["Custom"],
        },
      ])
      .mockResolvedValueOnce([
        {
          name: "local-writer",
          description: "Local source skill",
          version: "1.1.0",
          author: "Local",
          tags: ["local"],
          instructions: "# Local Writer\n\nNew content\n",
          filePath: "/tmp/local-writer/SKILL.md",
          localPath: "/tmp/local-writer",
          platforms: ["Custom"],
        },
      ]);

    installWindowMocks({
      api: {
        skill: {
          fetchRemoteContent: vi
            .fn()
            .mockResolvedValue(JSON.stringify({ skills: [] })),
          scanLocalPreview,
          scanSafety: vi.fn().mockResolvedValue({
            level: "safe",
            summary: "safe",
            findings: [],
            recommendedAction: "allow",
            scannedAt: Date.now(),
            checkedFileCount: 1,
            scanMethod: "ai",
          }),
        },
      },
    });

    useSkillStore.setState({
      storeView: "store",
      customStoreSources: [
        {
          id: "custom-local",
          name: "Local Skills",
          type: "local-dir",
          url: "/tmp/local-writer",
          enabled: true,
          order: 0,
          createdAt: Date.now(),
        },
      ],
      selectedStoreSourceId: "custom-local",
    } as never);

    await act(async () => {
      await renderWithI18n(<SkillStore />, { language: "en" });
    });

    await waitFor(() => {
      expect(
        useSkillStore.getState().remoteStoreEntries["custom-local"]?.skills[0]
          ?.content,
      ).toContain("Old content");
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    });

    await waitFor(() => {
      expect(
        useSkillStore.getState().remoteStoreEntries["custom-local"]?.skills[0]
          ?.content,
      ).toContain("New content");
    });
    expect(
      useSkillStore.getState().remoteStoreEntries["custom-local"]?.skills[0]
        ?.content,
    ).not.toContain("Old content");
    expect(scanLocalPreview).toHaveBeenNthCalledWith(
      1,
      ["/tmp/local-writer"],
      undefined,
    );
    expect(scanLocalPreview).toHaveBeenNthCalledWith(
      2,
      ["/tmp/local-writer"],
      undefined,
    );
  });

  it("keeps branch and directory identity for local-path git-repo sources", async () => {
    const scanLocalPreview = vi.fn().mockResolvedValue([
      {
        name: "writer",
        description: "Local git writer",
        version: "1.0.0",
        author: "Local",
        tags: ["writing"],
        instructions: "# Writer\n",
        filePath: "/Users/demo/repos/skills/packs/writer/SKILL.md",
        localPath: "/Users/demo/repos/skills/packs/writer",
        platforms: ["Custom"],
      },
    ]);

    installWindowMocks({
      api: {
        skill: {
          fetchRemoteContent: vi.fn(),
          scanLocalPreview,
          scanSafety: vi.fn().mockResolvedValue({
            level: "safe",
            summary: "safe",
            findings: [],
            recommendedAction: "allow",
            scannedAt: Date.now(),
            checkedFileCount: 1,
            scanMethod: "ai",
          }),
        },
      },
    });

    useSkillStore.setState({
      storeView: "store",
      customStoreSources: [
        {
          id: "local-git",
          name: "Local Git",
          type: "git-repo",
          url: "/Users/demo/repos/skills",
          branch: "feature/writer",
          directory: "packs",
          enabled: true,
          order: 0,
          createdAt: Date.now(),
        },
      ],
      selectedStoreSourceId: "local-git",
    } as never);

    await act(async () => {
      await renderWithI18n(<SkillStore />, { language: "en" });
    });

    await waitFor(() => {
      expect(
        useSkillStore.getState().remoteStoreEntries["local-git"]?.skills,
      ).toHaveLength(1);
    });

    const skill =
      useSkillStore.getState().remoteStoreEntries["local-git"]?.skills[0];
    expect(scanLocalPreview).toHaveBeenCalledWith(
      ["/Users/demo/repos/skills/packs"],
      undefined,
    );
    expect(skill).toEqual(
      expect.objectContaining({
        source_id: buildSkillSourceId({
          sourceType: "git-repo",
          sourceUrl: "/Users/demo/repos/skills",
          branch: "feature/writer",
          directory: "packs",
          skillPath: "packs/writer/SKILL.md",
        }),
        source_branch: "feature/writer",
        source_directory: "packs",
        canonical_skill_path: "packs/writer/SKILL.md",
      }),
    );
  });

  it("keeps local-path git-repo source identity stable when dirty content changes", async () => {
    const scanLocalPreview = vi
      .fn()
      .mockResolvedValueOnce([
        {
          name: "writer",
          description: "Local git writer",
          version: "1.0.0",
          author: "Local",
          tags: ["writing"],
          instructions: "# Writer\n\nClean content\n",
          filePath: "/Users/demo/repos/skills/packs/writer/SKILL.md",
          localPath: "/Users/demo/repos/skills/packs/writer",
          directory_fingerprint: "fingerprint-clean",
          platforms: ["Custom"],
        },
      ])
      .mockResolvedValueOnce([
        {
          name: "writer",
          description: "Local git writer",
          version: "1.0.0",
          author: "Local",
          tags: ["writing"],
          instructions: "# Writer\n\nDirty content\n",
          filePath: "/Users/demo/repos/skills/packs/writer/SKILL.md",
          localPath: "/Users/demo/repos/skills/packs/writer",
          directory_fingerprint: "fingerprint-dirty",
          platforms: ["Custom"],
        },
      ]);

    installWindowMocks({
      api: {
        skill: {
          fetchRemoteContent: vi.fn(),
          scanLocalPreview,
          scanSafety: vi.fn().mockResolvedValue({
            level: "safe",
            summary: "safe",
            findings: [],
            recommendedAction: "allow",
            scannedAt: Date.now(),
            checkedFileCount: 1,
            scanMethod: "ai",
          }),
        },
      },
    });

    useSkillStore.setState({
      storeView: "store",
      customStoreSources: [
        {
          id: "local-git",
          name: "Local Git",
          type: "git-repo",
          url: "/Users/demo/repos/skills",
          branch: "main",
          directory: "packs",
          enabled: true,
          order: 0,
          createdAt: Date.now(),
        },
      ],
      selectedStoreSourceId: "local-git",
    } as never);

    await act(async () => {
      await renderWithI18n(<SkillStore />, { language: "en" });
    });

    await waitFor(() => {
      expect(
        useSkillStore.getState().remoteStoreEntries["local-git"]?.skills[0]
          ?.directory_fingerprint,
      ).toBe("fingerprint-clean");
    });
    const sourceIdBefore =
      useSkillStore.getState().remoteStoreEntries["local-git"]?.skills[0]
        ?.source_id;

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    });

    await waitFor(() => {
      expect(
        useSkillStore.getState().remoteStoreEntries["local-git"]?.skills[0]
          ?.directory_fingerprint,
      ).toBe("fingerprint-dirty");
    });
    const dirtySkill =
      useSkillStore.getState().remoteStoreEntries["local-git"]?.skills[0];
    expect(dirtySkill).toEqual(
      expect.objectContaining({
        source_id: sourceIdBefore,
        content: "# Writer\n\nDirty content\n",
        directory_fingerprint: "fingerprint-dirty",
      }),
    );
  });
});
