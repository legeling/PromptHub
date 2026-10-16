import { ConfirmationHost } from "../../src/renderer/components/ui/ConfirmationHost";
/** @vitest-environment jsdom */
import {
  act,
  cleanup,
  fireEvent,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { createInstance } from "i18next";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { Folder, Prompt, PromptSummary } from "@prompthub/shared/types";
import { promptToSummary } from "@prompthub/shared/utils/prompt-summary";
import {
  createSkillTestRuntime,
  type SkillTestRuntime,
} from "./helpers/skill-runtime";
import { FolderDB, getDatabase, PromptDB } from "../../src/main/database";
import { registerPromptIPC } from "../../src/main/ipc/prompt.ipc";
import { registerFolderIPC } from "../../src/main/ipc/folder.ipc";
import { promptApi } from "../../src/preload/api/prompt";
import { folderApi } from "../../src/preload/api/folder";
import {
  deletePrompt,
  updatePrompt,
} from "../../src/renderer/services/database";
import { usePromptBatchActions } from "../../src/renderer/components/layout/usePromptWorkspaceTreeActions";
import { useDuplicatePromptAction } from "../../src/renderer/components/layout/usePromptWorkspaceMutationActions";
import { usePromptShareAction } from "../../src/renderer/components/layout/usePromptWorkspaceDetailActions";
import { QuickTagModal } from "../../src/renderer/components/prompt/QuickTagModal";
import { usePromptStore } from "../../src/renderer/stores/prompt.store";
import { renderWithI18n } from "../helpers/i18n";

const showToast = vi.hoisted(() => {
  // Node's global storage is not the browser storage required by Zustand.
  function isolatedStorage(): Storage {
    const values = new Map<string, string>();
    return {
      get length() {
        return values.size;
      },
      clear: () => values.clear(),
      getItem: (key) => values.get(key) ?? null,
      key: (index) => [...values.keys()][index] ?? null,
      removeItem: (key) => {
        values.delete(key);
      },
      setItem: (key, value) => {
        values.set(key, value);
      },
    };
  }
  vi.stubGlobal("localStorage", isolatedStorage());
  vi.stubGlobal("sessionStorage", isolatedStorage());
  return vi.fn();
});
vi.mock("../../src/renderer/components/ui/Toast", () => ({
  useToast: () => ({ showToast }),
}));

let runtime: SkillTestRuntime | undefined;
let originalApi: PropertyDescriptor | undefined;
let originalClipboard: PropertyDescriptor | undefined;
let i18n: ReturnType<typeof createInstance>;
const originalPromptState = usePromptStore.getState();

afterAll(() => vi.unstubAllGlobals());

function registerDomain(): void {
  const database = getDatabase();
  const prompts = new PromptDB(database);
  const folders = new FolderDB(database);
  registerPromptIPC(prompts, folders, database);
  registerFolderIPC(folders);
}

beforeEach(async () => {
  originalApi = Object.getOwnPropertyDescriptor(window, "api");
  originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  runtime = await createSkillTestRuntime();
  registerDomain();
  Object.defineProperty(window, "api", {
    configurable: true,
    value: { prompt: promptApi },
  });
  i18n = createInstance();
  await i18n.init({
    lng: "en",
    resources: { en: { translation: { common: { delete: "Delete" } } } },
    initImmediate: false,
  });
  showToast.mockClear();
});

afterEach(() => {
  cleanup();
  runtime?.dispose();
  runtime = undefined;
  if (originalApi) Object.defineProperty(window, "api", originalApi);
  else Reflect.deleteProperty(window, "api");
  if (originalClipboard)
    Object.defineProperty(navigator, "clipboard", originalClipboard);
  else Reflect.deleteProperty(navigator, "clipboard");
  usePromptStore.setState(originalPromptState, true);
  sessionStorage.clear();
  vi.restoreAllMocks();
});

function batchActions(prompts: PromptSummary[]) {
  return renderHook(() =>
    usePromptBatchActions({
      prompts,
      t: i18n.t,
      showToast,
      deletePrompt,
      toggleFavorite: async (id) => {
        await updatePrompt(id, { isFavorite: true });
      },
      updatePrompt: async (id, data) => {
        await updatePrompt(id, data);
      },
    }),
  );
}

async function reopen(): Promise<void> {
  if (!runtime) throw new Error("Prompt acceptance runtime is not initialized");
  await runtime.reopen();
  registerDomain();
}

describe("Prompt batch action with real persistence", () => {
  it("does not report success or remove records when a confirmed deletion fails", async () => {
    const prompt = await promptApi.create({ title: "Keep on failure", userPrompt: "Retained" });
    const { result } = renderHook(() => usePromptBatchActions({
      prompts: [promptToSummary(prompt)],
      deletePrompt: async () => { throw new Error("Injected deletion failure"); },
      updatePrompt: async () => {},
      toggleFavorite: async () => {},
      showToast,
      t: i18n.t,
    }));
    await renderWithI18n(<ConfirmationHost />);
    let deletion: Promise<void>;
    act(() => { deletion = result.current.handleBatchDelete([prompt.id]); });
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await act(async () => deletion!);
    await reopen();
    expect(await promptApi.get(prompt.id)).toMatchObject({ title: "Keep on failure", userPrompt: "Retained" });
    expect(showToast).toHaveBeenCalledWith("prompt.deleteFailed", "error");
    expect(showToast).not.toHaveBeenCalledWith("toast.batchDeleted", "success");
  });

  it("PA-03: moving selected prompts to root clears their folder after reopening", async () => {
    const folder: Folder = await folderApi.create({ name: "Container" });
    const prompt: Prompt = await promptApi.create({
      title: "Move me",
      userPrompt: "keep",
      folderId: folder.id,
    });
    await updatePrompt(prompt.id, { title: "Renamed" });
    expect(await promptApi.get(prompt.id)).toMatchObject({
      folderId: folder.id,
    });
    const { result } = batchActions([promptToSummary(prompt)]);
    // This is the actual root target emitted by PromptBatchActionBar.
    await act(async () =>
      result.current.handleBatchMove([prompt.id], undefined),
    );
    expect
      .soft(await promptApi.get(prompt.id))
      .toMatchObject({ folderId: null, userPrompt: "keep" });
    await reopen();
    expect(await promptApi.get(prompt.id)).toMatchObject({
      folderId: null,
      userPrompt: "keep",
    });
  });

  it("persists batch favorites, concrete folder moves and deletion of multiple prompts", async () => {
    const folder: Folder = await folderApi.create({ name: "Batch target" });
    const first: Prompt = await promptApi.create({
      title: "First",
      userPrompt: "alpha",
    });
    const second: Prompt = await promptApi.create({
      title: "Second",
      userPrompt: "beta",
    });
    const ids = [first.id, second.id];
    const { result } = batchActions([first, second].map(promptToSummary));
    await act(async () => result.current.handleBatchFavorite(ids, true));
    await act(async () => result.current.handleBatchMove(ids, folder.id));
    await reopen();
    expect(await promptApi.getAll()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: first.id,
          userPrompt: "alpha",
          folderId: folder.id,
          isFavorite: true,
        }),
        expect.objectContaining({
          id: second.id,
          userPrompt: "beta",
          folderId: folder.id,
          isFavorite: true,
        }),
      ]),
    );
    await renderWithI18n(<ConfirmationHost />);
    const nativeConfirm = vi.spyOn(window, "confirm");
    let deletion: Promise<void>;
    act(() => { deletion = result.current.handleBatchDelete(ids); });
    expect(await promptApi.getAll()).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await deletion!;
    expect(await promptApi.getAll()).toHaveLength(2);
    act(() => { deletion = result.current.handleBatchDelete(ids); });
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await act(async () => deletion!);
    expect(nativeConfirm).not.toHaveBeenCalled();
    await reopen();
    expect(await promptApi.getAll()).toEqual([]);
  });

  it("hydrates a summary before duplicating and serializes the full Prompt for sharing", async () => {
    const original: Prompt = await promptApi.create({
      title: "Share",
      userPrompt: "Hello {{name}}",
      systemPrompt: "Be {{tone}}",
      userPromptEn: "English body",
      tags: ["shared"],
      notes: "retain note",
    });
    const selected = vi.fn();
    const duplicate = renderHook(() =>
      useDuplicatePromptAction({
        createPrompt: promptApi.create,
        getPromptDetail: promptApi.get,
        selectPrompt: selected,
        showToast,
        t: i18n.t,
      }),
    );
    await act(async () => duplicate.result.current(promptToSummary(original)));
    await reopen();
    const all: Prompt[] = await promptApi.getAll();
    expect(all).toHaveLength(2);
    const copied = all.find((item) => item.id !== original.id);
    expect(copied).toMatchObject({
      title: "Share (Duplicate)",
      userPrompt: original.userPrompt,
      systemPrompt: original.systemPrompt,
      userPromptEn: "English body",
      tags: ["shared"],
      notes: "retain note",
    });
    expect(selected).toHaveBeenCalledWith(copied?.id);
    let clipboardText = "";
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          clipboardText = value;
        },
      },
    });
    const shared = vi.fn();
    const share = renderHook(() =>
      usePromptShareAction({ showToast, t: i18n.t, triggerShared: shared }),
    );
    await act(async () => share.result.current(original));
    expect(JSON.parse(clipboardText)).toEqual({
      name: "Share",
      description: null,
      userPrompt: "Hello {{name}}",
      systemPrompt: "Be {{tone}}",
      userPromptEn: "English body",
      systemPromptEn: null,
      tags: ["shared"],
      variables: ["tone", "name"],
      source: "prompthub",
      version: "1.0",
    });
    expect(shared).toHaveBeenCalledOnce();
    expect(await promptApi.get(original.id)).toEqual(original);
  });

  it("persists successful batch tags and reports a missing selected prompt as partial failure", async () => {
    const first: Prompt = await promptApi.create({
      title: "First",
      userPrompt: "first body",
      tags: ["base"],
    });
    const second: Prompt = await promptApi.create({
      title: "Second",
      userPrompt: "second body",
      tags: ["base"],
    });
    const missing: PromptSummary = {
      ...promptToSummary(second),
      id: "missing-prompt",
    };
    // Bind the real renderer persistence service; unrelated store/sync work is outside this component test.
    usePromptStore.setState({
      updatePrompt: async (id, data) => {
        await updatePrompt(id, data);
      },
    });
    await renderWithI18n(
      <QuickTagModal
        isOpen
        onClose={() => undefined}
        prompts={[promptToSummary(first), missing, promptToSummary(second)]}
      />,
    );
    const input = screen.getByPlaceholderText(
      "Enter a tag name, press Enter to add",
    );
    await act(async () => {
      fireEvent.change(input, { target: { value: "added" } });
    });
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
    });
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith(
        "1 of 3 prompts failed to update",
        "error",
      ),
    );
    expect(showToast).toHaveBeenCalledWith("Tag added to 2 prompts", "warning");
    await act(async () => {
      fireEvent.click(screen.getByLabelText("base remove"));
    });
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith(
        "Tag removed from 2 prompts",
        "warning",
      ),
    );
    await reopen();
    expect(await promptApi.get(first.id)).toMatchObject({
      tags: ["added"],
      userPrompt: "first body",
    });
    expect(await promptApi.get(second.id)).toMatchObject({
      tags: ["added"],
      userPrompt: "second body",
    });
    expect(await promptApi.get(missing.id)).toBeNull();
  });
});
