/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { Prompt } from "@prompthub/shared/types";
import type { ReactNode } from "react";
import {
  createSkillTestRuntime,
  type SkillTestRuntime,
} from "./helpers/skill-runtime";
import { FolderDB, getDatabase, PromptDB } from "../../src/main/database";
import { registerPromptIPC } from "../../src/main/ipc/prompt.ipc";
import { registerFolderIPC } from "../../src/main/ipc/folder.ipc";
import { registerSettingsIPC } from "../../src/main/ipc/settings.ipc";
import { promptApi } from "../../src/preload/api/prompt";
import { folderApi } from "../../src/preload/api/folder";
import { settingsApi } from "../../src/preload/api/settings";
import { versionApi } from "../../src/preload/api/version";
import App from "../../src/renderer/App";
import { ToastProvider } from "../../src/renderer/components/ui/Toast";
import { usePromptStore } from "../../src/renderer/stores/prompt.store";
import { useSettingsStore } from "../../src/renderer/stores/settings.store";
import { useFolderStore } from "../../src/renderer/stores/folder.store";
import { renderWithI18n } from "../helpers/i18n";
import { installWindowMocks } from "../helpers/window";

// Startup migrations and the unrelated workspace shell are outside this
// clipboard scenario. App parsing, EditPromptModal, store and persistence stay real.
vi.mock("../../src/renderer/services/migrations/indexeddb", () => ({
  migrateLegacyIndexedDbToMainProcess: async () => undefined,
}));
vi.mock(
  "../../src/renderer/services/renderer-persistence",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("../../src/renderer/services/renderer-persistence")
      >();
    return { ...actual, migrateRendererPersistence: async () => undefined };
  },
);
vi.mock("../../src/renderer/components/app/AppWorkspaceShell", () => ({
  AppWorkspaceShell: ({ overlayContent }: { overlayContent?: ReactNode }) => (
    <div data-testid="workspace-ready">{overlayContent}</div>
  ),
}));

vi.hoisted(() => {
  function storage(): Storage {
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
  vi.stubGlobal("localStorage", storage());
  vi.stubGlobal("sessionStorage", storage());
});

let runtime: SkillTestRuntime | undefined;
let originalApi: PropertyDescriptor | undefined;
let originalElectron: PropertyDescriptor | undefined;
let originalClipboard: PropertyDescriptor | undefined;
let originalMatchMedia: PropertyDescriptor | undefined;
const originalPrompts = usePromptStore.getState();
const originalSettings = useSettingsStore.getState();
const originalFolders = useFolderStore.getState();

function registerDomain(): void {
  const db = getDatabase();
  const prompts = new PromptDB(db);
  const folders = new FolderDB(db);
  registerPromptIPC(prompts, folders, db);
  registerFolderIPC(folders, prompts);
  registerSettingsIPC(db);
}

async function reopen(): Promise<void> {
  if (!runtime)
    throw new Error("Import acceptance runtime was not initialized");
  await runtime.reopen();
  registerDomain();
}

beforeEach(async () => {
  originalApi = Object.getOwnPropertyDescriptor(window, "api");
  originalElectron = Object.getOwnPropertyDescriptor(window, "electron");
  originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  originalMatchMedia = Object.getOwnPropertyDescriptor(window, "matchMedia");
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string): MediaQueryList => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(() => true),
    }),
  });
  runtime = await createSkillTestRuntime();
  registerDomain();
  installWindowMocks();
  window.api = {
    ...window.api,
    prompt: promptApi,
    folder: folderApi,
    settings: settingsApi,
  };
  useSettingsStore.setState({
    clipboardImportEnabled: true,
    autoCheckUpdate: false,
    webdavSyncOnSave: false,
    s3SyncOnSave: false,
    webdavSyncOnStartup: false,
    s3SyncOnStartup: false,
    selfHostedSyncOnStartup: false,
  });
  usePromptStore.setState({
    prompts: [],
    selectedIds: [],
    promptDetailCache: {},
  });
});

afterEach(() => {
  cleanup();
  usePromptStore.setState(originalPrompts, true);
  useSettingsStore.setState(originalSettings, true);
  useFolderStore.setState(originalFolders, true);
  if (originalApi) Object.defineProperty(window, "api", originalApi);
  else Reflect.deleteProperty(window, "api");
  if (originalElectron)
    Object.defineProperty(window, "electron", originalElectron);
  else Reflect.deleteProperty(window, "electron");
  if (originalClipboard)
    Object.defineProperty(navigator, "clipboard", originalClipboard);
  else Reflect.deleteProperty(navigator, "clipboard");
  if (originalMatchMedia)
    Object.defineProperty(window, "matchMedia", originalMatchMedia);
  else Reflect.deleteProperty(window, "matchMedia");
  runtime?.dispose();
  runtime = undefined;
  localStorage.clear();
  sessionStorage.clear();
  vi.restoreAllMocks();
});
afterAll(() => vi.unstubAllGlobals());

async function focusWithClipboard(text: string): Promise<void> {
  let clipboardRead: () => void = () => undefined;
  const readCompleted = new Promise<void>((resolve) => {
    clipboardRead = resolve;
  });
  const readText = vi.fn(async () => {
    clipboardRead();
    return text;
  });
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { readText },
  });
  await renderWithI18n(
    <ToastProvider>
      <App />
    </ToastProvider>,
    { settleAsyncEffects: true },
  );
  await screen.findByTestId("workspace-ready");
  await act(async () => {
    fireEvent.focus(window);
    await readCompleted;
  });
  expect(readText).toHaveBeenCalledTimes(1);
}

describe("P26 App clipboard import through real prompt persistence", () => {
  it.each(["text", "image"] as const)(
    "imports %s content via the real store and preserves fields and initial history after reopen",
    async (promptType) => {
      const fields = {
        title: "Imported Ω 🚀",
        description: "Markdown and Unicode",
        promptType,
        userPrompt: "# Plan\nHello {{name}}\n'quoted' <b>literal</b>",
        systemPrompt: "Be precise",
        userPromptEn: "English user body",
        systemPromptEn: "English system body",
        tags: ["imported", "Ω"],
        source: "isolated-import",
      };
      await focusWithClipboard(
        JSON.stringify({ name: fields.title, ...fields }),
      );
      expect(await screen.findByDisplayValue(fields.title)).toBeInTheDocument();
      fireEvent.click(await screen.findByRole("button", { name: "Create" }));
      await waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
      );
      const stored: Prompt[] = await promptApi.getAll();
      expect(stored).toHaveLength(1);
      expect(stored[0]).toMatchObject(fields);
      expect(usePromptStore.getState().prompts).toEqual([
        expect.objectContaining({
          id: stored[0].id,
          title: fields.title,
          promptType,
        }),
      ]);
      cleanup();
      await reopen();
      expect(await promptApi.get(stored[0].id)).toEqual(stored[0]);
      expect(await versionApi.getAll(stored[0].id)).toEqual([
        expect.objectContaining({
          userPrompt: fields.userPrompt,
          systemPrompt: fields.systemPrompt,
        }),
      ]);
    },
  );

  it.each([
    '{"title":"Malformed", "userPrompt":',
    JSON.stringify({ description: "Not a prompt", tags: ["only-metadata"] }),
  ])(
    "ignores invalid clipboard JSON without opening a form or changing stored data: %s",
    async (text) => {
      const survivor: Prompt = await promptApi.create({
        title: "Existing",
        userPrompt: "Keep complete body",
      });
      const history = await versionApi.getAll(survivor.id);
      await focusWithClipboard(text);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      cleanup();
      await reopen();
      expect(await promptApi.getAll()).toEqual([survivor]);
      expect(await versionApi.getAll(survivor.id)).toEqual(history);
    },
  );

  it("rejects an invalid imported body without closing or changing an existing record and permits a valid later import", async () => {
    const survivor: Prompt = await promptApi.create({
      title: "Existing",
      userPrompt: "Keep complete body",
    });
    const history = await versionApi.getAll(survivor.id);
    await usePromptStore.getState().fetchPrompts();
    const summaries = usePromptStore.getState().prompts;
    const error = vi.spyOn(console, "error");
    await focusWithClipboard(
      JSON.stringify({ title: "Invalid", userPrompt: "before\0after" }),
    );
    await screen.findByDisplayValue("Invalid");
    fireEvent.click(await screen.findByRole("button", { name: "Create" }));
    await waitFor(() =>
      expect(error).toHaveBeenCalledWith(
        "Failed to save prompt:",
        expect.objectContaining({
          message: expect.stringMatching(/null bytes/),
        }),
      ),
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create" })).toBeEnabled();
    expect(usePromptStore.getState().prompts).toEqual(summaries);
    cleanup();
    await reopen();
    expect(await promptApi.getAll()).toEqual([survivor]);
    expect(await versionApi.getAll(survivor.id)).toEqual(history);
    expect(
      getDatabase()
        .prepare("SELECT COUNT(*) AS count FROM prompt_versions")
        .get(),
    ).toEqual({ count: 1 });
    await focusWithClipboard(
      JSON.stringify({ title: "Corrected", userPrompt: "before after" }),
    );
    await screen.findByDisplayValue("Corrected");
    fireEvent.click(await screen.findByRole("button", { name: "Create" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    cleanup();
    await reopen();
    const stored: Prompt[] = await promptApi.getAll();
    expect(stored).toHaveLength(2);
    expect(stored.find((item) => item.id === survivor.id)).toEqual(survivor);
    expect(stored.find((item) => item.id !== survivor.id)).toMatchObject({
      title: "Corrected",
      userPrompt: "before after",
    });
    expect(await versionApi.getAll(survivor.id)).toEqual(history);
  });
});
