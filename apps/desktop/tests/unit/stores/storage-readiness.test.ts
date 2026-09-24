import { afterEach, expect, it, vi } from "vitest";
import { installWindowMocks } from "../../helpers/window";
import { usePromptStore } from "../../../src/renderer/stores/prompt.store";
import { useFolderStore } from "../../../src/renderer/stores/folder.store";

vi.mock("../../../src/renderer/services/webdav-save-sync", () => ({
  scheduleAllSaveSync: vi.fn(),
}));
afterEach(() => vi.restoreAllMocks());

it("loads current data and propagates read failures without replacing loaded state", async () => {
  installWindowMocks({
    api: {
      prompt: {
        getAllMeta: vi.fn().mockResolvedValue([]),
        listRelations: vi.fn().mockResolvedValue([]),
        listOutputFormat: vi.fn().mockResolvedValue([]),
      },
      folder: { getAll: vi.fn().mockResolvedValue([]) },
    },
  });
  await usePromptStore.getState().fetchPrompts();
  await useFolderStore.getState().fetchFolders();
  const prompts = usePromptStore.getState().prompts;
  const folders = useFolderStore.getState().folders;
  const failure = new Error("Storage unavailable");
  vi.mocked(window.api.prompt.getAllMeta).mockRejectedValue(failure);
  vi.mocked(window.api.folder.getAll).mockRejectedValue(failure);
  vi.spyOn(console, "error").mockImplementation(() => {});
  await expect(usePromptStore.getState().fetchPrompts()).rejects.toBe(failure);
  await expect(useFolderStore.getState().fetchFolders()).rejects.toBe(failure);
  expect(usePromptStore.getState().prompts).toBe(prompts);
  expect(useFolderStore.getState().folders).toBe(folders);
  expect(usePromptStore.getState().isLoading).toBe(false);
});
