import { afterEach, describe, expect, it, vi } from "vitest";
import * as database from "../../../src/renderer/services/database";

afterEach(() => vi.unstubAllGlobals());

describe("renderer current database contract", () => {
  it("rejects a missing bridge without opening another backend", async () => {
    const open = vi.fn();
    vi.stubGlobal("indexedDB", { open });
    Object.defineProperty(window, "api", { configurable: true, value: {} });
    await expect(database.getAllPrompts()).rejects.toThrow();
    await expect(database.getAllFolders()).rejects.toThrow();
    await expect(database.getPromptVersions("p")).rejects.toThrow();
    await expect(database.listPromptRelations()).rejects.toThrow();
    await expect(database.deleteOutputFormatItem("x")).rejects.toThrow();
    expect(open).not.toHaveBeenCalled();
  });

  it("does not use the full-record endpoint when the summary endpoint is missing", async () => {
    const getAll = vi.fn().mockResolvedValue([]);
    Object.defineProperty(window, "api", {
      configurable: true,
      value: { prompt: { getAll } },
    });
    await expect(database.getAllPromptSummaries()).rejects.toThrow();
    expect(getAll).not.toHaveBeenCalled();
  });

  it("propagates current backend errors without substituting empty results", async () => {
    const getAll = vi.fn().mockRejectedValue(new Error("Database unavailable"));
    Object.defineProperty(window, "api", {
      configurable: true,
      value: { prompt: { getAll } },
    });
    await expect(database.getAllPrompts()).rejects.toThrow(
      "Database unavailable",
    );
  });
});
