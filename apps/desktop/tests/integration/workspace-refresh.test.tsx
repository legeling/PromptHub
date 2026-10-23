/** @vitest-environment jsdom */
import {
  createSkillTestRuntime,
  skillApi,
  type SkillTestRuntime,
} from "./helpers/skill-runtime";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { FolderDB, getDatabase, PromptDB } from "../../src/main/database";
import { registerPromptIPC } from "../../src/main/ipc/prompt.ipc";
import { registerFolderIPC } from "../../src/main/ipc/folder.ipc";
import { registerRulesIPC } from "../../src/main/ipc/rules.ipc";
import { promptApi } from "../../src/preload/api/prompt";
import { folderApi } from "../../src/preload/api/folder";
import { rulesApi } from "../../src/preload/api/rules";
import { usePromptStore } from "../../src/renderer/stores/prompt.store";
import { useFolderStore } from "../../src/renderer/stores/folder.store";
import { useSkillStore } from "../../src/renderer/stores/skill.store";
import { useRulesStore } from "../../src/renderer/stores/rules.store";
import { useSettingsStore } from "../../src/renderer/stores/settings.store";
import { refreshWorkspace } from "../../src/renderer/services/workspace-refresh";
import {
  buildPromptStats,
  filterVisiblePrompts,
} from "../../src/renderer/services/prompt-filter";
import { usePromptDetailInlineEditor } from "../../src/renderer/components/layout/usePromptDetailInlineEditor";
import { usePromptDetail } from "../../src/renderer/hooks/usePromptDetail";
import { WorkspaceRefreshButton } from "../../src/renderer/components/layout/WorkspaceRefreshButton";
import { ConfirmationHost } from "../../src/renderer/components/ui/ConfirmationHost";
import { SkillFileEditor } from "../../src/renderer/components/skill/SkillFileEditor";
import { renderWithI18n } from "../helpers/i18n";
import { DESKTOP_TEST_TIMEOUT_MS } from "../helpers/test-config";

// Only Electron transport (skill-runtime), editor widget, notification and outbound
// sync are replaced. CLI, preload, registered IPC, stores and disk storage are real.
const showToast = vi.hoisted(() => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    },
  };
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage,
  });
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: storage,
  });
  return vi.fn();
});
vi.mock("../../src/renderer/components/ui/Toast", () => ({
  useToast: () => ({ showToast }),
}));
vi.mock("../../src/renderer/services/webdav-save-sync", () => ({
  scheduleAllSaveSync: vi.fn(),
}));
vi.mock("../../src/renderer/components/skill/SkillCodeEditor", () => ({
  getSkillCodeEditorLanguageName: () => "plaintext",
  SkillCodeEditor: ({
    value,
    editable,
    onChange,
  }: {
    value: string;
    editable: boolean;
    onChange: (value: string) => void;
  }) => (
    <textarea
      aria-label={editable ? "Code editor" : "Code viewer"}
      value={value}
      readOnly={!editable}
      onChange={(event) => onChange(event.currentTarget.value)}
    />
  ),
}));
let runtime: SkillTestRuntime;
const exec = promisify(execFile);
const cliRoot = path.resolve(process.cwd(), "../cli");
async function cli(...args: string[]): Promise<void> {
  const home = path.join(runtime.root, "home");
  await exec(
    process.execPath,
    ["--import", "tsx", "src/index.ts", "--data-dir", runtime.profile, ...args],
    {
      cwd: cliRoot,
      timeout: DESKTOP_TEST_TIMEOUT_MS,
      maxBuffer: 1024 * 1024,
      env: {
        ...process.env,
        HOME: home,
        USERPROFILE: home,
        APPDATA: home,
        LOCALAPPDATA: home,
        XDG_CONFIG_HOME: home,
      },
    },
  );
}
beforeEach(async () => {
  runtime = await createSkillTestRuntime();
  const db = getDatabase();
  registerPromptIPC(new PromptDB(db), new FolderDB(db), db);
  registerFolderIPC(new FolderDB(db));
  registerRulesIPC();
  Object.defineProperty(window, "api", {
    configurable: true,
    value: {
      prompt: promptApi,
      folder: folderApi,
      skill: skillApi,
      rules: rulesApi,
    },
  });
  usePromptStore.setState({
    prompts: [],
    promptDetailCache: {},
    selectedId: null,
    selectedIds: [],
    searchQuery: "",
    filterTags: [],
  });
  useFolderStore.setState({
    folders: [],
    selectedFolderId: null,
    expandedIds: new Set(),
    unlockedFolderIds: new Set(),
  });
  useSkillStore.setState({
    skills: [],
    selectedSkillId: null,
    projectScanState: {},
    agentScanState: {},
  });
  useRulesStore.setState({
    availableFiles: [],
    files: [],
    selectedRuleId: null,
    currentFile: null,
    draftContent: "",
    isSaving: false,
    isRewriting: false,
  });
  useSettingsStore.setState({ skillProjects: [], disabledPlatformIds: [] });
  showToast.mockClear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  runtime?.dispose();
});

function PromptEditor(): JSX.Element {
  const id = usePromptStore((state) => state.selectedId);
  const { prompt } = usePromptDetail(id);
  const editor = usePromptDetailInlineEditor(prompt ?? undefined, false);
  return (
    <>
      <WorkspaceRefreshButton domain="prompt" />
      <ConfirmationHost />
      <button onClick={() => editor.openDetailInlineEdit()}>
        Edit selected
      </button>
      <input
        aria-label="Draft title"
        value={editor.detailInlineDraft.title}
        onChange={(event) =>
          editor.setDetailInlineDraft({
            ...editor.detailInlineDraft,
            title: event.target.value,
          })
        }
      />
      <p>{prompt?.userPrompt}</p>
    </>
  );
}

describe("#198 workspace refresh through real storage", () => {
  it("reflects CLI create, update, delete, detail, tags, favorites and filters without reopening the desktop reader", async () => {
    const db = getDatabase();
    await refreshWorkspace("prompt");
    await cli(
      "prompt",
      "create",
      "--title",
      "External",
      "--user-prompt",
      "Initial body",
      "--tags",
      "first",
    );
    expect(usePromptStore.getState().prompts).toHaveLength(0);
    await refreshWorkspace("prompt");
    const id = usePromptStore.getState().prompts[0].id;
    usePromptStore.getState().selectPrompt(id);
    await usePromptStore.getState().getPromptDetail(id);
    await cli(
      "prompt",
      "update",
      id,
      "--title",
      "Updated external",
      "--user-prompt",
      "Changed body",
      "--tags",
      "second",
      "--favorite",
    );
    usePromptStore.setState({ searchQuery: "Updated", filterTags: ["second"] });
    useFolderStore.setState({ selectedFolderId: "favorites" });
    expect(await refreshWorkspace("prompt")).toBe("updated");
    expect(getDatabase()).toBe(db);
    const state = usePromptStore.getState();
    expect(state.selectedId).toBe(id);
    expect(state.promptDetailCache[id].userPrompt).toBe("Changed body");
    expect(buildPromptStats(state.prompts)).toMatchObject({
      totalCount: 1,
      favoriteCount: 1,
      uniqueTags: ["second"],
    });
    expect(
      filterVisiblePrompts({ ...state, ...useFolderStore.getState() }).map(
        (item) => item.id,
      ),
    ).toEqual([id]);
    expect(useFolderStore.getState().selectedFolderId).toBe("favorites");
    await cli("prompt", "delete", id);
    expect(await refreshWorkspace("prompt")).toBe("removed");
    expect(usePromptStore.getState()).toMatchObject({
      prompts: [],
      selectedId: null,
      searchQuery: "Updated",
      filterTags: ["second"],
      promptDetailCache: {},
    });
  });

  it("keeps the full Prompt projection on a folder-read failure and then recovers", async () => {
    const original = await promptApi.create({
      title: "Before",
      userPrompt: "Before body",
    });
    await refreshWorkspace("prompt");
    await promptApi.update(original.id, { title: "After" });
    const failure = vi
      .spyOn(folderApi, "getAll")
      .mockRejectedValueOnce(new Error("Injected folder read failure"));
    await expect(refreshWorkspace("prompt")).rejects.toThrow("Injected folder");
    expect(usePromptStore.getState().prompts[0].title).toBe("Before");
    failure.mockRestore();
    await refreshWorkspace("prompt");
    expect(usePromptStore.getState().prompts[0].title).toBe("After");
  });

  it("keeps a real inline draft on cancel and only discards after confirmation, including external deletion", async () => {
    const saved = await promptApi.create({
      title: "Saved title",
      userPrompt: "Saved body",
    });
    await refreshWorkspace("prompt");
    usePromptStore.getState().selectPrompt(saved.id);
    await renderWithI18n(<PromptEditor />);
    await screen.findByText("Saved body");
    fireEvent.click(screen.getByText("Edit selected"));
    fireEvent.change(screen.getByLabelText("Draft title"), {
      target: { value: "Unsaved title" },
    });
    await promptApi.delete(saved.id);
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(screen.getByLabelText("Draft title")).toHaveValue("Unsaved title");
    expect(usePromptStore.getState().selectedId).toBe(saved.id);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Refresh" })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Discard and refresh" }),
    );
    await waitFor(() =>
      expect(usePromptStore.getState().selectedId).toBeNull(),
    );
    expect(showToast).toHaveBeenLastCalledWith(
      "Workspace refreshed. The selected item no longer exists.",
      "info",
    );
  });

  it("refreshes real Skill files and protects unsaved file text", async () => {
    const skill = await skillApi.create({
      name: "refresh-files",
      instructions: "# Original\n",
      protocol_type: "skill",
      is_favorite: false,
    });
    await refreshWorkspace("skill");
    useSkillStore.getState().selectSkill(skill.id);
    await renderWithI18n(
      <>
        <WorkspaceRefreshButton domain="skill" />
        <ConfirmationHost />
        <SkillFileEditor
          skillId={skill.id}
          isOpen
          mode="inline"
          initialFilePath="note.txt"
        />
      </>,
    );
    await act(async () => {
      await skillApi.writeLocalFile(skill.id, "note.txt", "External text");
      await refreshWorkspace("skill");
    });
    // Re-select after external creation through the real file tree.
    fireEvent.click(await screen.findByText("note.txt"));
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Code viewer" })).toHaveValue(
        "External text",
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: /^Edit$/ }));
    fireEvent.change(screen.getByRole("textbox", { name: "Code editor" }), {
      target: { value: "Unsaved file text" },
    });
    await act(async () => {
      expect(await refreshWorkspace("skill")).toBe("protected");
    });
    expect(screen.getByRole("textbox", { name: "Code editor" })).toHaveValue(
      "Unsaved file text",
    );
    expect((await skillApi.readLocalFile(skill.id, "note.txt"))?.content).toBe(
      "External text",
    );
  });

  it("clears a deleted Skill selection and its open file content", async () => {
    const skill = await skillApi.create({
      name: "removed-files",
      instructions: "# Removed content\n",
      protocol_type: "skill",
      is_favorite: false,
    });
    await refreshWorkspace("skill");
    useSkillStore.getState().selectSkill(skill.id);
    await renderWithI18n(
      <SkillFileEditor skillId={skill.id} isOpen mode="inline" />,
    );
    await waitFor(() =>
      expect(
        screen.getByRole("textbox", { name: "Code viewer" }),
      ).toHaveTextContent("Removed content"),
    );
    await skillApi.delete(skill.id);
    await act(async () => {
      expect(await refreshWorkspace("skill")).toBe("removed");
    });
    expect(useSkillStore.getState().selectedSkillId).toBeNull();
    expect(
      screen.queryByRole("textbox", { name: "Code viewer" }),
    ).not.toBeInTheDocument();
  });

  it("shows external Rules divergence without overwriting target bytes and protects the managed draft", async () => {
    const target = path.join(runtime.platformRoot("claude"), "CLAUDE.md");
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, "Original rule\n");
    await refreshWorkspace("rules");
    await useRulesStore.getState().selectRule("claude-global");
    fs.writeFileSync(target, "External target change\n");
    await refreshWorkspace("rules");
    expect(useRulesStore.getState().currentFile).toMatchObject({
      content: "Original rule\n",
      targetContent: "External target change\n",
      syncStatus: "out-of-sync",
    });
    expect(useRulesStore.getState().conflictDialogRuleId).toBe("claude-global");
    useRulesStore.getState().setDraftContent("Unsaved rule");
    expect(await refreshWorkspace("rules")).toBe("protected");
    expect(useRulesStore.getState().draftContent).toBe("Unsaved rule");
    expect(fs.readFileSync(target, "utf8")).toBe("External target change\n");
  });
  it("protects edits begun during a slow read and leaves the previous detail visible", async () => {
    const saved = await promptApi.create({
      title: "Before",
      userPrompt: "Before body",
    });
    await refreshWorkspace("prompt");
    usePromptStore.getState().selectPrompt(saved.id);
    await renderWithI18n(<PromptEditor />);
    await screen.findByText("Before body");
    await promptApi.update(saved.id, { userPrompt: "External body" });
    let release!: () => void;
    const wait = new Promise<void>((done) => {
      release = done;
    });
    const read = folderApi.getAll;
    vi.spyOn(folderApi, "getAll").mockImplementationOnce(async () => {
      await wait;
      return read();
    });
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    fireEvent.click(screen.getByText("Edit selected"));
    fireEvent.change(screen.getByLabelText("Draft title"), {
      target: { value: "Typed while reading" },
    });
    await act(async () => {
      release();
    });
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith(
        "Your draft or save is protected. Finish editing and refresh again.",
        "info",
      ),
    );
    expect(screen.getByLabelText("Draft title")).toHaveValue(
      "Typed while reading",
    );
    expect(screen.getByText("Before body")).toBeInTheDocument();
    expect(
      usePromptStore.getState().promptDetailCache[saved.id].userPrompt,
    ).toBe("Before body");
  });

  it("does not publish an older Prompt candidate over a local save", async () => {
    const saved = await promptApi.create({
      title: "Before",
      userPrompt: "Before body",
    });
    await refreshWorkspace("prompt");
    const candidate = await usePromptStore.getState().prepareWorkspaceRefresh();
    await usePromptStore
      .getState()
      .updatePrompt(saved.id, { title: "Local save" });
    expect(candidate.isCurrent()).toBe(false);
    expect(usePromptStore.getState().prompts[0].title).toBe("Local save");
    expect((await promptApi.get(saved.id)).title).toBe("Local save");
  });

  it("retains the live database and refuses a CLI open with an unknown lease", async () => {
    const saved = await promptApi.create({
      title: "Preserved",
      userPrompt: "Safe content",
    });
    const unknown = path.join(
      runtime.profile,
      "data",
      "prompthub.db.clients",
      "unknown-owner",
    );
    fs.mkdirSync(unknown);
    try {
      await expect(cli("prompt", "list")).rejects.toThrow(/clients.*closed/);
      expect((await promptApi.get(saved.id)).userPrompt).toBe("Safe content");
      expect(fs.statSync(unknown).isDirectory()).toBe(true);
    } finally {
      fs.rmSync(unknown, { recursive: true, force: true });
    }
  });
});
