/** @vitest-environment jsdom */
import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
} from "@testing-library/react";
import { useState } from "react";
import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  createSkillTestRuntime,
  type SkillTestRuntime,
} from "./helpers/skill-runtime";
import { FolderDB, getDatabase, PromptDB } from "../../src/main/database";
import { registerPromptIPC } from "../../src/main/ipc/prompt.ipc";
import { promptApi } from "../../src/preload/api/prompt";
import { QuickAddModal } from "../../src/renderer/components/prompt/QuickAddModal";
import { ToastProvider } from "../../src/renderer/components/ui/Toast";
import { usePromptStore } from "../../src/renderer/stores/prompt.store";
import { useSettingsStore } from "../../src/renderer/stores/settings.store";
import { renderWithI18n } from "../helpers/i18n";
import { installWindowMocks } from "../helpers/window";

const completion = vi.hoisted(() => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
  return vi.fn();
});
vi.mock("../../src/renderer/services/ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/renderer/services/ai")>()),
  chatCompletion: (...args: unknown[]) => completion(...args),
}));

let runtime: SkillTestRuntime;
function registerDomain() {
  const database = getDatabase();
  registerPromptIPC(new PromptDB(database), new FolderDB(database), database);
}
function Harness() {
  const [open, setOpen] = useState(true);
  return (
    <ToastProvider>
      <button onClick={() => setOpen(true)}>Open quick add</button>
      <QuickAddModal
        isOpen={open}
        onClose={() => setOpen(false)}
        onCreate={usePromptStore.getState().createPrompt}
      />
    </ToastProvider>
  );
}
async function submit(content: string) {
  fireEvent.change(screen.getByRole("textbox", { name: "Paste your Prompt" }), {
    target: { value: content },
  });
  fireEvent.click(screen.getByRole("button", { name: "Create" }));
  await waitFor(() => expect(screen.queryByRole("textbox")).toBeNull());
}

beforeEach(async () => {
  runtime = await createSkillTestRuntime();
  registerDomain();
  installWindowMocks({ api: { prompt: promptApi } });
  usePromptStore.setState({ prompts: [], promptDetailCache: {} });
  useSettingsStore.setState({
    aiModels: [],
    scenarioModelDefaults: {},
    modelRouteDefaults: {},
    aiProvider: "openai",
    aiApiProtocol: "openai",
    aiApiKey: "fixture-key",
    aiApiUrl: "https://example.com/v1",
    aiModel: "fixture-model",
    webdavSyncOnSave: false,
    s3SyncOnSave: false,
  });
  completion.mockReset();
});
afterEach(() => {
  cleanup();
  runtime?.dispose();
  vi.restoreAllMocks();
});
afterAll(() => vi.unstubAllGlobals());

// AI responses and Electron transport are replaced. Modal, store, preload,
// registered IPC, SQLite and canonical publication use production code.
it("persists concurrent quick additions, isolates failure, and retains results after database reopen", async () => {
  let finishFirst!: (value: { content: string }) => void;
  completion
    .mockReturnValueOnce(
      new Promise<{ content: string }>((resolve) => {
        finishFirst = resolve;
      }),
    )
    .mockResolvedValueOnce({
      content: '{"title":"Portrait result","tags":["portrait"]}',
    })
    .mockResolvedValueOnce({ content: "{}" });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  await renderWithI18n(<Harness />, { language: "en", reactStrictMode: true });
  await submit("[主题]\nLandscape content");
  const [first] = await promptApi.getAll();
  expect(first).toMatchObject({
    title: "Landscape content",
    userPrompt: "[主题]\nLandscape content",
  });
  fireEvent.click(screen.getByText("Open quick add"));
  await submit("Portrait content");
  await waitFor(async () =>
    expect(
      (await promptApi.getAll()).find(
        (p) => p.userPrompt === "Portrait content",
      ),
    ).toMatchObject({ title: "Portrait result", tags: ["portrait"] }),
  );
  fireEvent.click(screen.getByText("Open quick add"));
  await submit("Failed analysis content");
  await screen.findByText(
    '"Failed analysis content" was saved, but AI analysis failed. You can edit its title and tags.',
  );
  await act(async () => {
    finishFirst({
      content: '{"title":"Landscape result","tags":["landscape"]}',
    });
  });
  await waitFor(async () =>
    expect(await promptApi.get(first.id)).toMatchObject({
      title: "Landscape result",
      tags: ["landscape"],
    }),
  );
  const saved = await promptApi.getAll();
  expect(saved).toHaveLength(3);
  expect(
    saved.find((p) => p.userPrompt === "Failed analysis content"),
  ).toMatchObject({ title: "Failed analysis content", tags: [] });
  cleanup();
  await runtime.reopen();
  registerDomain();
  expect(await promptApi.getAll()).toEqual(saved);
});
