// @vitest-environment jsdom
import { webcrypto } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";
import { usePromptStore } from "../../../../apps/desktop/src/renderer/stores/prompt.store";
import {
  computeHash,
  downloadSyncBackup,
  incrementalUploadSyncBackup,
  autoSyncBackup,
  type RemoteSyncAdapter,
} from "../../../../apps/desktop/src/renderer/services/sync-backup-core";

const mocks = vi.hoisted(() => ({
  export: vi.fn(),
  restore: vi.fn(),
  summaries: vi.fn(),
  detail: vi.fn(),
  prompts: vi.fn(),
  folders: vi.fn(),
  settings: vi.fn(),
}));
vi.mock("../../../../apps/desktop/src/renderer/services/database", () => ({
  getAllPrompts: (...args: unknown[]) => mocks.prompts(...args),
  getAllFolders: (...args: unknown[]) => mocks.folders(...args),
  getAllPromptSummaries: (...args: unknown[]) => mocks.summaries(...args),
  getPromptById: (...args: unknown[]) => mocks.detail(...args),
  listPromptRelations: async () => [],
  listOutputFormatItems: async () => [],
}));
vi.mock(
  "../../../../apps/desktop/src/renderer/services/database-backup",
  () => ({
    exportDatabase: (...args: unknown[]) => mocks.export(...args),
    restoreFromBackup: (...args: unknown[]) => mocks.restore(...args),
  }),
);
vi.mock(
  "../../../../apps/desktop/src/renderer/services/webdav-save-sync",
  () => ({ scheduleAllSaveSync: () => {} }),
);
vi.mock(
  "../../../../apps/desktop/src/renderer/services/settings-snapshot",
  () => ({
    getCanonicalSettingsStateSnapshot: (...args: unknown[]) =>
      mocks.settings(...args),
    restoreAiConfigSnapshot: async () => {},
    restoreSettingsStateSnapshot: async () => {},
    SENSITIVE_SETTINGS_FIELDS: [],
  }),
);

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(globalThis, "crypto", {
    value: webcrypto,
    configurable: true,
  });
  mocks.export.mockResolvedValue({
    version: 1,
    prompts: [],
    folders: [],
    versions: [],
  });
  mocks.restore.mockResolvedValue({ prompts: 0, folders: 0, versions: 0 });
  mocks.prompts.mockResolvedValue([]);
  mocks.folders.mockResolvedValue([]);
  mocks.settings.mockResolvedValue({});
  usePromptStore.setState({
    prompts: [],
    promptDetailCache: {},
    relations: [],
    outputFormatItems: [],
  });
});

function adapterFor(remote: Map<string, string>): RemoteSyncAdapter {
  return {
    paths: {
      legacy: "legacy",
      manifest: "manifest",
      data: "data",
      image: (name) => `images/${name}`,
      video: (name) => `videos/${name}`,
    },
    async uploadText(key, value) {
      remote.set(key, value);
      return { success: true };
    },
    async downloadText(key) {
      return remote.has(key)
        ? { success: true, data: remote.get(key) }
        : { success: false, notFound: true };
    },
  };
}

it("A04: failed manifest publication must preserve the last valid remote backup", async () => {
  const old = JSON.stringify({
    version: "4.0",
    exportedAt: "2026-01-01T00:00:00Z",
    prompts: [],
    folders: [],
    versions: [],
  });
  const manifest = JSON.stringify({
    version: "4.0",
    dataHash: await computeHash(old),
    images: {},
    videos: {},
    updatedAt: "2026-01-01T00:00:00Z",
  });
  const remote = new Map([
    ["data", old],
    ["manifest", manifest],
  ]);
  const adapter = adapterFor(remote);
  const upload = adapter.uploadText;
  adapter.uploadText = async (key, value) =>
    key === "manifest"
      ? { success: false, error: "injected network failure" }
      : upload(key, value);
  expect(
    (await incrementalUploadSyncBackup(adapter, { includeImages: false }))
      .success,
  ).toBe(false);
  const download = await downloadSyncBackup(adapter);
  console.log("A04 download after failed upload", download);
  expect(download.success).toBe(true);
});

it("A05: unchanged inventory should not upload a new data payload on every backup", async () => {
  const remote = new Map<string, string>();
  const adapter = adapterFor(remote);
  vi.useFakeTimers();
  try {
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    await incrementalUploadSyncBackup(adapter, { includeImages: false });
    const old = remote.get("data");
    vi.setSystemTime(new Date("2026-01-01T00:01:00Z"));
    await incrementalUploadSyncBackup(adapter, { includeImages: false });
    expect(remote.get("data")).toBe(old);
  } finally {
    vi.useRealTimers();
  }
});

it("A06: refreshing externally edited Prompt summaries must invalidate stale detail content", async () => {
  mocks.detail.mockResolvedValue({
    id: "p",
    title: "old",
    userPrompt: "old content",
    updatedAt: "2026-01-01",
  });
  await usePromptStore.getState().getPromptDetail("p");
  mocks.detail.mockResolvedValue({
    id: "p",
    title: "new",
    userPrompt: "new content",
    updatedAt: "2026-01-02",
  });
  mocks.summaries.mockResolvedValue([
    { id: "p", title: "new", updatedAt: "2026-01-02" },
  ]);
  await usePromptStore.getState().fetchPrompts();
  expect(usePromptStore.getState().prompts[0].title).toBe("new");
  expect(
    (await usePromptStore.getState().getPromptDetail("p"))?.userPrompt,
  ).toBe("new content");
});

it("A07: a completed local delete must not be classified as a remote restore", async () => {
  const remote = new Map<string, string>();
  const adapter = adapterFor(remote);
  // Local is now empty after a delete; its remaining-row maximum is epoch zero.
  const old = JSON.stringify({
    version: "4.0",
    exportedAt: "2026-01-01T00:00:00Z",
    prompts: [{ id: "deleted-locally", updatedAt: "2026-01-01T00:00:00Z" }],
    folders: [],
    versions: [],
  });
  remote.set("data", old);
  remote.set(
    "manifest",
    JSON.stringify({
      version: "4.0",
      dataHash: await computeHash(old),
      updatedAt: "2026-01-01T00:00:00Z",
      images: {},
      videos: {},
    }),
  );
  await autoSyncBackup(adapter);
  expect(mocks.restore).not.toHaveBeenCalled();
});
