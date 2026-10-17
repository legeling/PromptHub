import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import process from "node:process";
import { resolveWindowsPnpm } from "./windows-pnpm.mts";

import { redactDiagnostic } from "./report.mts";
import type {
  ExecuteOptions,
  ExecutionSummary,
  VerificationCheck,
  VerificationResult,
} from "./types.mts";

const DEFAULT_CONCURRENCY = 2;
const DEFAULT_GRACE_MS = 5_000;
const DEFAULT_OUTPUT_BYTES = 128 * 1_024;

type RunnerOptions = Required<
  Pick<
    ExecuteOptions,
    "quiet" | "verbose" | "terminationGraceMs" | "maxOutputBytes"
  >
>;
type RunningCheck = {
  check: VerificationCheck;
  promise: Promise<{ id: string; result: VerificationResult }>;
};
type ChildClose = {
  code: number | null;
  processSignal: NodeJS.Signals | null;
};

function appendBounded(
  current: Buffer,
  chunk: Buffer,
  maximumBytes: number,
): { value: Buffer; truncated: boolean } {
  const combined = Buffer.concat([current, chunk]);
  if (combined.length <= maximumBytes) {
    return { value: combined, truncated: false };
  }
  return {
    value: combined.subarray(combined.length - maximumBytes),
    truncated: true,
  };
}

function terminateOwnedProcess(
  child: ChildProcess,
  force: boolean,
  includeExitedProcessGroup = false,
): void {
  if (!child.pid) {
    return;
  }

  const signal: NodeJS.Signals = force ? "SIGKILL" : "SIGTERM";
  try {
    if (process.platform === "win32") {
      if (child.exitCode !== null || child.signalCode !== null) return;
      // Killing pnpm alone leaves its workers holding the output pipes open.
      const result = spawnSync(
        "taskkill",
        ["/PID", String(child.pid), "/T", "/F"],
        {
          windowsHide: true,
          stdio: "pipe",
          timeout: 5000,
        },
      );
      if (result.error) throw result.error;
      if (result.status !== 0 && child.exitCode === null) {
        child.kill(signal);
      }
    } else {
      if (
        !includeExitedProcessGroup &&
        (child.exitCode !== null || child.signalCode !== null)
      ) {
        return;
      }
      process.kill(-child.pid, signal);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") {
      throw error;
    }
  }
}

function spawnCheck(check: VerificationCheck): ChildProcess {
  const windowsPnpm =
    process.platform === "win32" && check.command.executable === "pnpm";
  const executable = windowsPnpm ? process.execPath : check.command.executable;
  const args = windowsPnpm
    ? [resolveWindowsPnpm(process.env), ...check.command.args]
    : check.command.args;
  return spawn(executable, args, {
    cwd: check.command.cwd,
    env: { ...process.env, ...check.command.environment },
    detached: process.platform !== "win32",
    shell: false,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function printResult(result: VerificationResult, options: RunnerOptions): void {
  if (options.quiet) {
    return;
  }
  console.log(
    `[${result.status === "passed" ? "ok" : result.status}] ${result.id} (${(
      result.durationMs / 1_000
    ).toFixed(1)}s)`,
  );
  if (options.verbose && result.outputTail) {
    process.stdout.write(
      `\n[${result.id} output]\n${redactDiagnostic(result.outputTail) ?? ""}\n`,
    );
  }
  if (result.status !== "passed" && result.outputTail && !options.verbose) {
    process.stderr.write(
      `\n[${result.id} output]\n${redactDiagnostic(result.outputTail) ?? ""}\n`,
    );
  }
}

class ChildCheckRun {
  private readonly check: VerificationCheck;
  private readonly options: RunnerOptions;
  private readonly signal?: AbortSignal;
  private readonly child: ChildProcess;
  private readonly startedAt = Date.now();
  private output = Buffer.alloc(0);
  private outputTruncated = false;
  private timedOut = false;
  private cancelled = false;
  private terminationStarted = false;
  private spawnError?: Error;
  private forceTimer?: NodeJS.Timeout;
  private timeout?: NodeJS.Timeout;

  constructor(
    check: VerificationCheck,
    options: RunnerOptions,
    signal?: AbortSignal,
  ) {
    this.check = check;
    this.options = options;
    this.signal = signal;
    this.child = spawnCheck(check);
    this.captureOutput();
  }

  private captureOutput(): void {
    const capture = (chunk: Buffer): void => {
      const bounded = appendBounded(
        this.output,
        chunk,
        this.options.maxOutputBytes,
      );
      this.output = bounded.value;
      this.outputTruncated ||= bounded.truncated;
    };
    this.child.stdout?.on("data", capture);
    this.child.stderr?.on("data", capture);
  }

  private terminate(force = false): void {
    if (this.terminationStarted && !force) {
      return;
    }
    this.terminationStarted = true;
    try {
      terminateOwnedProcess(this.child, force);
      if (!force) {
        this.forceTimer = setTimeout(
          () => this.terminate(true),
          this.options.terminationGraceMs,
        );
        this.forceTimer.unref();
      }
    } catch (error) {
      this.spawnError ??=
        error instanceof Error ? error : new Error(String(error));
    }
  }

  private waitForClose(): Promise<ChildClose> {
    return new Promise((resolve) => {
      this.child.once("error", (error) => {
        this.spawnError = error;
      });
      this.child.once("close", (code, processSignal) => {
        resolve({ code, processSignal });
      });
    });
  }

  private startLifecycle(): () => void {
    this.timeout = setTimeout(() => {
      this.timedOut = true;
      this.terminate();
    }, this.check.timeoutMs);
    this.timeout.unref();
    this.signal?.addEventListener("abort", this.abort, { once: true });
    return () => {
      if (this.timeout) clearTimeout(this.timeout);
      if (this.forceTimer) clearTimeout(this.forceTimer);
      this.signal?.removeEventListener("abort", this.abort);
    };
  }

  private readonly abort = (): void => {
    this.cancelled = true;
    this.terminate();
  };

  async run(): Promise<VerificationResult> {
    const cleanup = this.startLifecycle();
    const close = await this.waitForClose();
    if (close.code !== 0 || close.processSignal || this.spawnError) {
      terminateOwnedProcess(this.child, true, true);
    }
    cleanup();
    const endedAt = Date.now();
    const status = this.timedOut
      ? "timed_out"
      : this.cancelled
        ? "cancelled"
        : close.code === 0 && !this.spawnError
          ? "passed"
          : "failed";
    return {
      id: this.check.id,
      label: this.check.label,
      command: this.check.command,
      status,
      startedAt: this.startedAt,
      endedAt,
      durationMs: endedAt - this.startedAt,
      exitCode: close.code,
      signal: close.processSignal,
      outputTail: this.output.toString("utf8"),
      outputTruncated: this.outputTruncated,
      error: this.spawnError?.message,
    };
  }
}

async function runCheck(
  check: VerificationCheck,
  options: RunnerOptions,
  signal?: AbortSignal,
): Promise<VerificationResult> {
  if (!options.quiet) {
    console.log(`[run] ${check.id}: ${check.label}`);
  }
  const result = await new ChildCheckRun(check, options, signal).run();
  printResult(result, options);
  return result;
}

function normalizedOptions(rawOptions: ExecuteOptions): {
  concurrency: number;
  runner: RunnerOptions;
} {
  const concurrency = rawOptions.concurrency ?? DEFAULT_CONCURRENCY;
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 16) {
    throw new Error("Verification concurrency must be an integer from 1 to 16");
  }
  const runner = {
    quiet: rawOptions.quiet ?? false,
    verbose: rawOptions.verbose ?? false,
    terminationGraceMs: rawOptions.terminationGraceMs ?? DEFAULT_GRACE_MS,
    maxOutputBytes: rawOptions.maxOutputBytes ?? DEFAULT_OUTPUT_BYTES,
  };
  if (runner.terminationGraceMs < 0 || runner.maxOutputBytes < 256) {
    throw new Error("Invalid verification executor limits");
  }
  return { concurrency, runner };
}

class CheckScheduler {
  readonly startedAt = Date.now();
  readonly results = new Map<string, VerificationResult>();
  readonly pending: Map<string, VerificationCheck>;
  readonly running = new Map<string, RunningCheck>();
  readonly activeGroups = new Set<string>();
  maximumConcurrency = 0;
  private readonly concurrency: number;
  private readonly options: RunnerOptions;
  private readonly signal?: AbortSignal;

  constructor(
    checks: VerificationCheck[],
    concurrency: number,
    options: RunnerOptions,
    signal?: AbortSignal,
  ) {
    this.concurrency = concurrency;
    this.options = options;
    this.signal = signal;
    this.pending = new Map(checks.map((check) => [check.id, check]));
  }

  blockFailedDependants(): void {
    for (const [id, check] of this.pending) {
      const blockedBy = (check.dependsOn ?? []).filter((dependency) => {
        const result = this.results.get(dependency);
        return result && result.status !== "passed";
      });
      if (blockedBy.length > 0) {
        this.results.set(id, this.instantResult(check, "blocked", blockedBy));
        this.pending.delete(id);
      }
    }
  }

  scheduleReady(): void {
    while (this.running.size < this.concurrency && !this.signal?.aborted) {
      const ready = [...this.pending.entries()].find(([, check]) =>
        this.isReady(check),
      );
      if (!ready) return;
      const [id, check] = ready;
      this.pending.delete(id);
      if (check.resourceGroup) this.activeGroups.add(check.resourceGroup);
      const promise = runCheck(check, this.options, this.signal).then(
        (result) => ({ id, result }),
      );
      this.running.set(id, { check, promise });
      this.maximumConcurrency = Math.max(
        this.maximumConcurrency,
        this.running.size,
      );
    }
  }

  private isReady(check: VerificationCheck): boolean {
    const dependenciesPassed = (check.dependsOn ?? []).every(
      (dependency) => this.results.get(dependency)?.status === "passed",
    );
    const resourceReady =
      !check.resourceGroup || !this.activeGroups.has(check.resourceGroup);
    return dependenciesPassed && resourceReady;
  }

  cancelPending(): void {
    for (const [id, check] of this.pending) {
      this.results.set(id, this.instantResult(check, "cancelled"));
    }
    this.pending.clear();
  }

  private instantResult(
    check: VerificationCheck,
    status: "blocked" | "cancelled",
    blockedBy?: string[],
  ): VerificationResult {
    const now = Date.now();
    return {
      id: check.id,
      label: check.label,
      command: check.command,
      status,
      blockedBy,
      startedAt: now,
      endedAt: now,
      durationMs: 0,
    };
  }

  async completeNext(): Promise<void> {
    const completed = await Promise.race(
      [...this.running.values()].map((entry) => entry.promise),
    );
    const running = this.running.get(completed.id);
    this.running.delete(completed.id);
    if (running?.check.resourceGroup) {
      this.activeGroups.delete(running.check.resourceGroup);
    }
    this.results.set(completed.id, completed.result);
  }
}

export async function executeChecks(
  checks: VerificationCheck[],
  rawOptions: ExecuteOptions = {},
): Promise<ExecutionSummary> {
  const { concurrency, runner } = normalizedOptions(rawOptions);
  const scheduler = new CheckScheduler(
    checks,
    concurrency,
    runner,
    rawOptions.signal,
  );

  while (scheduler.pending.size > 0 || scheduler.running.size > 0) {
    scheduler.blockFailedDependants();
    scheduler.scheduleReady();
    if (scheduler.running.size === 0) {
      if (scheduler.pending.size === 0) {
        break;
      }
      if (rawOptions.signal?.aborted) {
        scheduler.cancelPending();
        break;
      }
      throw new Error("Verification executor reached an unschedulable graph");
    }
    await scheduler.completeNext();
  }

  const endedAt = Date.now();
  const results = checks
    .map((check) => scheduler.results.get(check.id))
    .filter((result): result is VerificationResult => Boolean(result));
  return {
    exitCode: results.some((result) => result.status !== "passed") ? 1 : 0,
    startedAt: scheduler.startedAt,
    endedAt,
    durationMs: endedAt - scheduler.startedAt,
    maxConcurrency: scheduler.maximumConcurrency,
    results,
  };
}
