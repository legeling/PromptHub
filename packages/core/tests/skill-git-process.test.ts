import * as childProcess from "node:child_process";
import { PassThrough } from "node:stream";
import { once } from "node:events";
import {
  setTimeout as realSetTimeout,
  clearTimeout as realClearTimeout,
} from "node:timers";
import { afterEach, expect, it, vi } from "vitest";
import { cloneSkillRepository } from "../src/skills/git-transport";

vi.mock("node:child_process", async (original) => ({
  ...(await original<typeof import("node:child_process")>()),
  spawn: vi.fn(),
}));

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.mocked(childProcess.spawn).mockReset();
});

function fakeChild(): childProcess.ChildProcess {
  const child = new childProcess.ChildProcess();
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  vi.spyOn(child, "kill").mockReturnValue(true);
  return child;
}

it.skipIf(process.platform === "win32")(
  "terminates descendants holding stdio before timeout settles",
  async () => {
    const actual =
      await vi.importActual<typeof import("node:child_process")>(
        "node:child_process",
      );
    let child: childProcess.ChildProcess | undefined;
    vi.mocked(childProcess.spawn).mockImplementation(
      (_command, _args, options) => {
        child = actual.spawn(
          process.execPath,
          [
            "-e",
            `
      const { spawn } = require('node:child_process');
      const nested = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'inherit' });
      nested.once('spawn', () => process.stdout.write('ready'));
      setInterval(() => {}, 1000);
    `,
          ],
          options,
        );
        return child;
      },
    );
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const result = cloneSkillRepository(
      "https://example.com/team/skills",
      "/unused",
    );
    const assertion = expect(result).rejects.toThrow(/timed out/);
    await vi.advanceTimersByTimeAsync(0);
    if (!child?.stdout || !child.pid) throw new Error("Fixture did not launch");
    const ownedPid = child.pid;
    let rescueUsed = false;
    const rescue = realSetTimeout(() => {
      rescueUsed = true;
      try {
        process.kill(-ownedPid, "SIGKILL");
      } catch (error) {
        if (
          !(error instanceof Error && "code" in error && error.code === "ESRCH")
        )
          throw error;
      }
    }, 5_000);
    try {
      await once(child.stdout, "data");
      await vi.runOnlyPendingTimersAsync();
      await assertion;
      expect(rescueUsed).toBe(false);
      expect(vi.mocked(childProcess.spawn).mock.calls[0]?.[2]?.detached).toBe(
        true,
      );
    } finally {
      realClearTimeout(rescue);
      try {
        process.kill(-ownedPid, "SIGKILL");
      } catch (error) {
        if (
          !(error instanceof Error && "code" in error && error.code === "ESRCH")
        )
          throw error;
      }
    }
  },
);

it("waits for exit on timeout before allowing staging cleanup", async () => {
  vi.useFakeTimers();
  const child = fakeChild();
  vi.mocked(childProcess.spawn).mockReturnValue(child);
  let completed = false;
  const result = cloneSkillRepository(
    "https://example.com/team/skills",
    "/fixture/repo",
  ).finally(() => {
    completed = true;
  });
  const assertion = expect(result).rejects.toThrow(/timed out/);
  await vi.advanceTimersByTimeAsync(0);
  await vi.runOnlyPendingTimersAsync();
  expect(child.kill).toHaveBeenCalledWith("SIGKILL");
  expect(completed).toBe(false);
  child.emit("close", null);
  await assertion;
  expect(completed).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

it("passes the same environment and remaining budget to sparse checkout and reports its failure", async () => {
  vi.useFakeTimers();
  const clone = fakeChild();
  const sparse = fakeChild();
  const spawn = vi
    .mocked(childProcess.spawn)
    .mockReturnValueOnce(clone)
    .mockReturnValueOnce(sparse);
  const timer = vi.spyOn(globalThis, "setTimeout");
  const environment = { ...process.env, GIT_TERMINAL_PROMPT: "0" };
  const result = cloneSkillRepository(
    "https://example.com/team/skills",
    "/fixture/repo",
    undefined,
    "skills/writer",
    undefined,
    environment,
  );
  const assertion = expect(result).rejects.toThrow(
    /Git sparse-checkout failed.*denied/,
  );
  await vi.advanceTimersByTimeAsync(0);
  const initialBudget = Number(timer.mock.calls[0]?.[1]);
  expect(initialBudget).toBeGreaterThan(0);
  const elapsed = initialBudget / 2;
  await vi.advanceTimersByTimeAsync(elapsed);
  clone.emit("close", 0);
  await vi.advanceTimersByTimeAsync(0);
  expect(timer.mock.calls[1]?.[1]).toBe(initialBudget - elapsed);
  expect(spawn.mock.calls.map((call) => call[2]?.env)).toEqual([
    environment,
    environment,
  ]);
  sparse.stderr?.emit("data", "denied");
  sparse.emit("close", 1);
  await assertion;
  expect(spawn).toHaveBeenCalledTimes(2);
  expect(vi.getTimerCount()).toBe(0);
});
