import { describe, expect, it, vi } from "vitest";
import { createWindowApiMock, installWindowMocks } from "../../helpers/window";

describe("window mock fixture contract", () => {
  it("preserves sibling API methods when overriding one nested callback", async () => {
    const read = vi.fn().mockResolvedValue({ language: "ja" });
    const api = createWindowApiMock({ settings: { get: read } });

    expect(await api.settings.get()).toEqual({ language: "ja" });
    expect(api.settings.get).toBe(read);
    expect(vi.isMockFunction(api.settings.set)).toBe(true);
    expect(vi.isMockFunction(api.prompt.getAll)).toBe(true);
    expect(vi.isMockFunction(api.generation.commitOutput)).toBe(true);
  });

  it("does not share mock calls or overrides between independently installed fixtures", () => {
    const first = installWindowMocks();
    first.api.prompt.delete("fixture-prompt");
    const second = installWindowMocks();

    expect(first.api.prompt.delete).toHaveBeenCalledWith("fixture-prompt");
    expect(second.api.prompt.delete).not.toHaveBeenCalled();
    expect(window.api).toBe(second.api);
    expect(first.api).not.toBe(second.api);
  });

  it("provides Promise results for settings reads and writes", async () => {
    const { api } = installWindowMocks();

    await expect(api.settings.get()).resolves.toEqual({});
    await expect(api.settings.set({ language: "ja" })).resolves.toBeUndefined();
  });
});
