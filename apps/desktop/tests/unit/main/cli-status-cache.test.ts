import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CliStatus } from "@prompthub/shared/types";
import { CliStatusCache } from "../../../src/main/services/cli-status-cache";

const status: CliStatus = {
  installed: true,
  command: "prompthub",
  version: "0.5.9",
  packageManager: "pnpm",
  packageManagerVersion: "9.15.0",
  releaseTag: "",
  installSource: "",
  installCommand: null,
  manualInstallCommands: { pnpm: "", npm: "" },
};
describe("CLI observation cache", () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-cli-status-"));
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("persists successful observations across reopening and refreshes explicitly", async () => {
    const file = path.join(root, "cli-status.json");
    const probe = vi.fn().mockResolvedValue(status);
    const first = new CliStatusCache(file, probe, () => 1000);
    expect(await first.get()).toMatchObject({
      installed: true,
      checkedAt: 1000,
      fromCache: false,
    });
    const reopened = new CliStatusCache(file, probe, () => 2000);
    expect(await reopened.get()).toMatchObject({
      version: "0.5.9",
      checkedAt: 1000,
      fromCache: true,
    });
    expect(probe).toHaveBeenCalledTimes(1);
    probe.mockResolvedValueOnce({ ...status, installed: false, version: null });
    expect(await reopened.get(true)).toMatchObject({
      installed: false,
      checkedAt: 2000,
      fromCache: false,
    });
    expect(
      await new CliStatusCache(file, probe, () => 3000).get(),
    ).toMatchObject({ installed: false });
    expect(probe).toHaveBeenCalledTimes(2);
  });

  it("expires after a day and invalidates for installation or environment changes", async () => {
    const file = path.join(root, "cli-status.json");
    const probe = vi.fn().mockResolvedValue(status);
    await new CliStatusCache(file, probe, () => 1000).get();
    const cache = new CliStatusCache(
      file,
      probe,
      () => 1000 + 24 * 60 * 60 * 1000,
    );
    expect((await cache.get()).fromCache).toBe(false);
    cache.invalidate();
    expect(fs.existsSync(file)).toBe(false);
    await cache.get();
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    fs.writeFileSync(
      file,
      JSON.stringify({ ...data, environment: "another-machine" }),
    );
    expect((await cache.get()).fromCache).toBe(false);
    expect(probe).toHaveBeenCalledTimes(4);
  });

  it("coalesces requests and keeps the last success after failed refresh", async () => {
    const file = path.join(root, "cli-status.json");
    const probe = vi.fn().mockResolvedValue(status);
    const cache = new CliStatusCache(file, probe, () => 1000);
    await Promise.all([cache.get(), cache.get(true)]);
    expect(probe).toHaveBeenCalledTimes(1);
    probe.mockRejectedValueOnce(new Error("probe unavailable"));
    await expect(cache.get(true)).rejects.toThrow("probe unavailable");
    expect(
      (await new CliStatusCache(file, probe, () => 2000).get()).version,
    ).toBe("0.5.9");
    probe.mockResolvedValueOnce({ ...status, error: "release unavailable" });
    expect((await cache.get(true)).error).toBe("release unavailable");
    expect((await cache.get()).error).toBeUndefined();
  });

  it("recovers corrupt snapshots and reports write failures without losing live results", async () => {
    const warning = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const file = path.join(root, "cli-status.json");
    const probe = vi.fn().mockResolvedValue(status);
    fs.writeFileSync(file, "broken json");
    const cache = new CliStatusCache(file, probe, () => 1000);
    expect((await cache.get()).installed).toBe(true);
    vi.spyOn(fs, "renameSync").mockImplementationOnce(() => {
      throw new Error("write failed");
    });
    expect((await cache.get(true)).installed).toBe(true);
    expect(fs.readdirSync(root)).toEqual(["cli-status.json"]);
    expect(warning).toHaveBeenCalled();
  });
});
