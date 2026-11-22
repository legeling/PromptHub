/** @vitest-environment jsdom */
import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
} from "@testing-library/react";
import { useState } from "react";
import type { Prompt } from "@prompthub/shared/types";
import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  createSkillTestRuntime,
  type SkillTestRuntime,
} from "./helpers/skill-runtime";
import { FolderDB, getDatabase, PromptDB } from "../../src/main/database";
import { registerPromptIPC } from "../../src/main/ipc/prompt.ipc";
import { promptApi } from "../../src/preload/api/prompt";
import { QuickAddModal } from "../../src/renderer/components/prompt/QuickAddModal";
import { PromptDetailModal } from "../../src/renderer/components/prompt/PromptDetailModal";
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
  const [detailPrompt, setDetailPrompt] = useState<Prompt | null>(null);
  const openPrompt = async (body: string) => {
    const saved = (await promptApi.getAll()).find(
      (prompt) => prompt.userPrompt === body,
    );
    if (!saved) return;
    setDetailPrompt(await usePromptStore.getState().getPromptDetail(saved.id));
  };
  return (
    <ToastProvider>
      <button onClick={() => setOpen(true)}>Open quick add</button>
      <button onClick={() => void openPrompt("Other body")}>
        Open other Prompt
      </button>
      <button onClick={() => void openPrompt("Failed analysis content")}>
        Open failed Prompt
      </button>
      <QuickAddModal
        isOpen={open}
        onClose={() => setOpen(false)}
        onCreate={usePromptStore.getState().createPrompt}
      />
      <PromptDetailModal
        isOpen={detailPrompt !== null}
        onClose={() => setDetailPrompt(null)}
        prompt={detailPrompt}
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
    .mockResolvedValueOnce({ content: "{}" })
    .mockResolvedValueOnce({ content: "{}" })
    .mockResolvedValueOnce({
      content: '{"title":"Recovered title","tags":["recovered"]}',
    });
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
    "Prompt saved. The model returned no usable result. Generate again.",
  );
  const failedPrompt = (await promptApi.getAll()).find(
    (prompt) => prompt.userPrompt === "Failed analysis content",
  );
  expect(failedPrompt).toMatchObject({
    title: "Failed analysis content",
    tags: [],
  });
  if (!failedPrompt) throw new Error("Failed Prompt was not persisted");
  await waitFor(async () =>
    expect(
      (await promptApi.getAll()).some(
        (prompt) => prompt.userPrompt === "Failed analysis content",
      ),
    ).toBe(true),
  );
  fireEvent.click(screen.getByText("Open failed Prompt"));
  expect(
    await screen.findByRole("button", { name: "Reanalyze title and tags" }),
  ).not.toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: "Reanalyze title and tags" }),
  );
  await screen.findByText(
    "The model returned no usable result. Generate again.",
  );
  expect(await promptApi.get(failedPrompt.id)).toMatchObject({
    title: "Failed analysis content",
    userPrompt: "Failed analysis content",
    tags: [],
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Reanalyze title and tags" }),
  );
  await waitFor(async () =>
    expect(await promptApi.get(failedPrompt.id)).toMatchObject({
      id: failedPrompt.id,
      title: "Recovered title",
      userPrompt: "Failed analysis content",
      tags: ["recovered"],
    }),
  );
  await screen.findByText("Recovered title");
  await screen.findByText("recovered");
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
  ).toMatchObject({ title: "Recovered title", tags: ["recovered"] });
  cleanup();
  await runtime.reopen();
  registerDomain();
  expect(await promptApi.getAll()).toEqual(saved);
});

const originalBody = "Failed analysis content";
const conflict =
  "This Prompt has changed or was removed. The earlier AI result was not saved.";
const result = (title: string, tag: string) => ({
  content: JSON.stringify({ title, tags: [tag] }),
});

async function openDetail() {
  fireEvent.click(screen.getByText("Open failed Prompt"));
  return screen.findByRole("button", { name: "Reanalyze title and tags" });
}

async function reopenAndRead() {
  cleanup();
  await runtime.reopen();
  registerDomain();
  return promptApi.getAll() as Promise<Prompt[]>;
}

function rejectFirstAnalysisWrite() {
  getDatabase()
    .exec(`CREATE TEMP TRIGGER reject_analysis BEFORE UPDATE OF title ON prompts
    WHEN NEW.title = 'Result A' BEGIN SELECT RAISE(ABORT, 'test write failure'); END`);
}

async function failFirstSave(entry: "detail" | "quick") {
  rejectFirstAnalysisWrite();
  completion.mockResolvedValueOnce(result("Result A", "first"));
  if (entry === "detail") {
    await usePromptStore
      .getState()
      .createPrompt({ title: "Original", userPrompt: originalBody });
  }
  await renderWithI18n(<Harness />, { language: "en" });
  if (entry === "detail") {
    fireEvent.click(await openDetail());
  } else {
    await submit(originalBody);
  }
  const retry = await screen.findByRole("button", { name: "Retry save" });
  getDatabase().exec("DROP TRIGGER reject_analysis");
  const [record] = await promptApi.getAll();
  return { retry, record: record as Prompt };
}

it.each(["detail", "quick"] as const)(
  "rejects an old %s retry after B is saved, including after switching records",
  async (entry) => {
    const { retry, record } = await failFirstSave(entry);
    completion.mockResolvedValueOnce(result("Result B", "second"));
    fireEvent.click(await openDetail());
    await screen.findByText("Result B");
    expect(await promptApi.get(record.id)).toMatchObject({
      title: "Result B",
      tags: ["second"],
    });
    const other = await promptApi.create({
      title: "Other",
      userPrompt: "Other body",
    });
    fireEvent.click(screen.getByText("Open other Prompt"));
    await screen.findByText("Other");
    fireEvent.click(retry);
    await screen.findByText(conflict);
    expect(screen.queryByText("Other")).not.toBeNull();
    const records = await reopenAndRead();
    expect(records).toHaveLength(2);
    expect(records.find((p) => p.id === record.id)).toMatchObject({
      title: "Result B",
      tags: ["second"],
      userPrompt: originalBody,
    });
    expect(records.find((p) => p.id === other.id)).toEqual(other);
    expect(completion).toHaveBeenCalledTimes(2);
  },
);

it.each([
  ["detail", "title"],
  ["detail", "tags"],
  ["quick", "title"],
  ["quick", "tags"],
] as const)(
  "preserves a manual edit after %s when only %s changed",
  async (entry, field) => {
    const { retry, record } = await failFirstSave(entry);
    const edit =
      field === "title" ? { title: "Edited by hand" } : { tags: ["manual"] };
    // Simulate an edit from another window, with the first renderer still stale.
    await promptApi.update(record.id, edit);
    fireEvent.click(retry);
    await screen.findByText(conflict);
    const [saved] = await reopenAndRead();
    expect(saved).toMatchObject({
      id: record.id,
      title: record.title,
      tags: record.tags,
      userPrompt: originalBody,
      ...edit,
    });
    expect(completion).toHaveBeenCalledTimes(1);
  },
);

it.each(["detail", "quick"] as const)(
  "retries an unchanged %s write without another model call",
  async (entry) => {
    const writes = vi.spyOn(window.api.prompt, "update");
    const { retry, record } = await failFirstSave(entry);
    fireEvent.click(retry);
    await waitFor(async () =>
      expect(await promptApi.get(record.id)).toMatchObject({
        title: "Result A",
      }),
    );
    expect(writes).toHaveBeenCalledTimes(2);
    expect(writes.mock.calls[1]).toEqual(writes.mock.calls[0]);
    expect(await reopenAndRead()).toMatchObject([
      {
        id: record.id,
        title: "Result A",
        tags: ["first"],
        userPrompt: originalBody,
      },
    ]);
    expect(completion).toHaveBeenCalledTimes(1);
  },
);

it("protects a detail result when an earlier quick-add answer arrives late", async () => {
  let finish!: (response: { content: string }) => void;
  completion
    .mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    )
    .mockResolvedValueOnce(result("Result B", "second"));
  await renderWithI18n(<Harness />, { language: "en" });
  await submit(originalBody);
  fireEvent.click(await openDetail());
  await screen.findByText("Result B");
  await act(async () => finish(result("Result A", "first")));
  await screen.findByText(conflict);
  expect(await reopenAndRead()).toMatchObject([
    { title: "Result B", tags: ["second"], userPrompt: originalBody },
  ]);
  expect(completion).toHaveBeenCalledTimes(2);
});
