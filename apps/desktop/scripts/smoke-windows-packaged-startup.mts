import {
  spawn,
  spawnSync,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sqlite3Wasm from "node-sqlite3-wasm";

import {
  removePackagedStartupRoot,
  waitForPackagedProcessExit,
} from "./packaged-startup-cleanup.mts";

type SeedDatabase = {
  exec: (sql: string) => void;
  all: (sql: string) => Array<Record<string, unknown>>;
  close: () => void;
};

const SeedDatabase = sqlite3Wasm.Database as new (path: string) => SeedDatabase;

const STARTUP_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 250;
const PROCESS_EXIT_GRACE_MS = 5_000;
const MAX_CAPTURED_OUTPUT_CHARS = 64 * 1024;
const MAX_DIAGNOSTIC_FILES = 200;
const MAX_DIAGNOSTIC_LOG_CHARS = 64 * 1024;
const PACKAGED_STARTUP_SMOKE_APP_DATA_ENV =
  "PROMPTHUB_PACKAGED_STARTUP_SMOKE_APP_DATA";
const PACKAGED_STARTUP_SMOKE_AUTO_EXIT_ENV =
  "PROMPTHUB_PACKAGED_STARTUP_SMOKE_AUTO_EXIT";

interface StartupEvent {
  event?: unknown;
  status?: unknown;
  error?: unknown;
}

function seedUpgradeProfile(appDataPath: string): string {
  const userDataPath = path.join(appDataPath, "PromptHub");
  fs.mkdirSync(userDataPath, { recursive: true });
  const database = new SeedDatabase(path.join(userDataPath, "prompthub.db"));
  try {
    database.exec("CREATE TABLE startup_smoke (value TEXT NOT NULL)");
    database.exec("INSERT INTO startup_smoke (value) VALUES ('0.5.9')");
    database.exec(
      "CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
    );
    database.exec(
      "INSERT INTO settings (key, value) VALUES ('startup-smoke-preserved', '0.5.9')",
    );
  } finally {
    database.close();
  }

  const markerPath = path.join(
    userDataPath,
    "backups",
    "safety-points",
    "upgrades",
    ".last-run-version.json",
  );
  fs.mkdirSync(path.dirname(markerPath), { recursive: true });
  fs.writeFileSync(
    markerPath,
    `${JSON.stringify({ version: "0.5.9", updatedAt: new Date().toISOString() }, null, 2)}\n`,
    "utf8",
  );
  return userDataPath;
}

function readStartupEvents(logPath: string): StartupEvent[] {
  try {
    return fs
      .readFileSync(logPath, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as StartupEvent);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

function verifyUpgradeData(userDataPath: string): void {
  const file = path.join(userDataPath, "data", "prompthub.db");
  if (!fs.existsSync(file)) throw new Error("Migrated database is missing");
  if (fs.existsSync(path.join(userDataPath, "prompthub.db"))) {
    throw new Error("Startup recreated a stale root-level database");
  }
  const database = new SeedDatabase(file);
  try {
    const rows = database.all(
      "SELECT value FROM settings WHERE key = 'startup-smoke-preserved'",
    );
    if (rows.length !== 1 || rows[0].value !== "0.5.9") {
      throw new Error("Upgrade did not preserve the original database row");
    }
  } finally {
    database.close();
  }
}

function appendBounded(current: string, chunk: Buffer): string {
  return `${current}${chunk.toString("utf8")}`.slice(
    -MAX_CAPTURED_OUTPUT_CHARS,
  );
}

function collectDiagnosticFiles(rootPath: string): string[] {
  const files: string[] = [];
  const pending = [rootPath];
  while (pending.length > 0 && files.length < MAX_DIAGNOSTIC_FILES) {
    const directoryPath = pending.shift();
    if (!directoryPath) break;
    let entries: fs.Dirent[];
    try {
      entries = fs
        .readdirSync(directoryPath, { withFileTypes: true })
        .sort((left, right) => left.name.localeCompare(right.name));
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (files.length >= MAX_DIAGNOSTIC_FILES) break;
      const entryPath = path.join(directoryPath, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        pending.push(entryPath);
      } else if (entry.isFile()) {
        files.push(entryPath);
      }
    }
  }
  return files;
}

function formatFailureDiagnostics(rootPath: string, output: string): string {
  const files = collectDiagnosticFiles(rootPath);
  const relativeFiles = files.map((filePath) =>
    path.relative(rootPath, filePath),
  );
  const startupLogs = files
    .filter((filePath) => path.basename(filePath) === "startup.log")
    .map((filePath) => {
      let content: string;
      try {
        content = fs
          .readFileSync(filePath, "utf8")
          .slice(-MAX_DIAGNOSTIC_LOG_CHARS);
      } catch (error) {
        content = `<unreadable: ${error instanceof Error ? error.message : String(error)}>`;
      }
      return `--- ${path.relative(rootPath, filePath)} ---\n${content}`;
    });
  return [
    `Isolated root: ${rootPath}`,
    `Files (${relativeFiles.length}${files.length === MAX_DIAGNOSTIC_FILES ? "+" : ""}):`,
    relativeFiles.join("\n") || "<none>",
    "Startup logs:",
    startupLogs.join("\n") || "<none>",
    "Child output:",
    output || "<none>",
  ].join("\n");
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

type ExpectedCanonicalStatus =
  | "waiting-renderer-migration"
  | "already-canonical";
type ExpectedMigrationStatus = "migrated" | "already-complete";

interface LaunchResult {
  events: StartupEvent[];
  nextEventOffset: number;
}

interface LaunchOptions {
  executablePath: string;
  environment: NodeJS.ProcessEnv;
  logPath: string;
  rootPath: string;
  eventOffset: number;
  expectedCanonicalStatus: ExpectedCanonicalStatus;
  expectedMigrationStatus: ExpectedMigrationStatus;
}

function readLaunchEvents(
  logPath: string,
  eventOffset: number,
): StartupEvent[] {
  return readStartupEvents(logPath).slice(eventOffset);
}

function findStartupFailure(events: StartupEvent[]): StartupEvent | undefined {
  return events.find((entry) =>
    [
      "startup:upgrade_backup_failed_to_bootstrap",
      "startup:canonical_storage_authority_failed",
    ].includes(String(entry.event)),
  );
}

function launchIsReady(
  events: StartupEvent[],
  expectedCanonicalStatus: ExpectedCanonicalStatus,
  expectedMigrationStatus: ExpectedMigrationStatus,
): boolean {
  const windowReady = events.some(
    (entry) => entry.event === "startup:window_ready",
  );
  const canonicalReady = events.some(
    (entry) =>
      entry.event === "startup:canonical_storage_authority" &&
      entry.status === expectedCanonicalStatus,
  );
  const migrationReady = events.some(
    (entry) =>
      entry.event === "startup:renderer_persistence_migration" &&
      entry.status === expectedMigrationStatus,
  );
  if (expectedCanonicalStatus === "already-canonical") {
    return canonicalReady && migrationReady && windowReady;
  }
  const upgradeCreated = events.some(
    (entry) =>
      entry.event === "startup:upgrade_backup" &&
      entry.status === "snapshot-created",
  );
  return upgradeCreated && canonicalReady && migrationReady && windowReady;
}

async function waitForPackagedLaunch(
  child: ChildProcessWithoutNullStreams,
  logPath: string,
  eventOffset: number,
  expectedCanonicalStatus: ExpectedCanonicalStatus,
  expectedMigrationStatus: ExpectedMigrationStatus,
  getOutput: () => string,
): Promise<StartupEvent[]> {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const events = readLaunchEvents(logPath, eventOffset);
    const startupFailure = findStartupFailure(events);
    if (startupFailure) {
      throw new Error(
        `Packaged startup reported ${String(startupFailure.event)}: ${String(startupFailure.error ?? "unknown error")}`,
      );
    }
    if (
      launchIsReady(events, expectedCanonicalStatus, expectedMigrationStatus)
    ) {
      return events;
    }
    if (child.exitCode !== null) {
      throw new Error(
        `Packaged app exited before startup completed (code ${child.exitCode}).\n${getOutput()}`,
      );
    }
    await delay(POLL_INTERVAL_MS);
  }
  throw new Error(
    `Timed out waiting for packaged Windows upgrade startup.\n${getOutput()}`,
  );
}

function stopProcessTree(child: ChildProcessWithoutNullStreams): void {
  if (child.exitCode !== null || child.pid === undefined) return;
  spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
    stdio: "ignore",
    windowsHide: true,
  });
}

function spawnPackagedApp(
  executablePath: string,
  environment: NodeJS.ProcessEnv,
): ChildProcessWithoutNullStreams {
  return spawn(executablePath, [], {
    env: environment,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
}

async function launchPackagedApp({
  executablePath,
  environment,
  logPath,
  rootPath,
  eventOffset,
  expectedCanonicalStatus,
  expectedMigrationStatus,
}: LaunchOptions): Promise<LaunchResult> {
  let output = "";
  const child = spawnPackagedApp(executablePath, environment);
  child.stdout.on("data", (chunk: Buffer) => {
    output = appendBounded(output, chunk);
  });
  child.stderr.on("data", (chunk: Buffer) => {
    output = appendBounded(output, chunk);
  });

  try {
    const events = await waitForPackagedLaunch(
      child,
      logPath,
      eventOffset,
      expectedCanonicalStatus,
      expectedMigrationStatus,
      () => output,
    );
    await waitForPackagedProcessExit(child, PROCESS_EXIT_GRACE_MS);
    if (child.exitCode !== 0) {
      throw new Error(
        `Packaged app did not exit cleanly after startup (code ${child.exitCode}).\n${output}`,
      );
    }
    return {
      events,
      nextEventOffset: readStartupEvents(logPath).length,
    };
  } catch (error) {
    console.error(formatFailureDiagnostics(rootPath, output));
    throw error;
  } finally {
    stopProcessTree(child);
    await waitForPackagedProcessExit(child, PROCESS_EXIT_GRACE_MS);
  }
}

async function main(): Promise<void> {
  if (process.platform !== "win32") {
    throw new Error("The packaged Windows startup smoke must run on Windows");
  }
  const executablePath = path.resolve(
    process.argv[2] ?? path.join("dist", "win-unpacked", "PromptHub.exe"),
  );
  if (!fs.existsSync(executablePath)) {
    throw new Error(
      `Packaged PromptHub executable not found: ${executablePath}`,
    );
  }

  const runnerTemp = process.env.RUNNER_TEMP ?? os.tmpdir();
  const root = fs.mkdtempSync(
    path.join(runnerTemp, "prompthub-win-startup-long-profile-"),
  );
  try {
    const appDataPath = path.join(root, "AppData", "Roaming");
    const localAppDataPath = path.join(root, "AppData", "Local");
    const userProfilePath = path.join(root, "User");
    fs.mkdirSync(localAppDataPath, { recursive: true });
    fs.mkdirSync(userProfilePath, { recursive: true });
    const userDataPath = seedUpgradeProfile(appDataPath);
    const logPath = path.join(userDataPath, "logs", "startup.log");
    const environment = {
      ...process.env,
      APPDATA: appDataPath,
      LOCALAPPDATA: localAppDataPath,
      USERPROFILE: userProfilePath,
      HOME: userProfilePath,
      CI: "true",
      [PACKAGED_STARTUP_SMOKE_APP_DATA_ENV]: appDataPath,
      [PACKAGED_STARTUP_SMOKE_AUTO_EXIT_ENV]: "true",
      ELECTRON_ENABLE_LOGGING: "1",
    };
    const initialEventCount = readStartupEvents(logPath).length;
    const firstLaunch = await launchPackagedApp({
      executablePath,
      environment,
      logPath,
      rootPath: root,
      eventOffset: initialEventCount,
      expectedCanonicalStatus: "waiting-renderer-migration",
      expectedMigrationStatus: "migrated",
    });
    verifyUpgradeData(userDataPath);
    const secondLaunch = await launchPackagedApp({
      executablePath,
      environment,
      logPath,
      rootPath: root,
      eventOffset: firstLaunch.nextEventOffset,
      expectedCanonicalStatus: "already-canonical",
      expectedMigrationStatus: "already-complete",
    });
    verifyUpgradeData(userDataPath);
    console.log(
      "Packaged Windows 0.5.9 upgrade startup preserved data across two launches.",
    );
    console.log(
      JSON.stringify(
        { firstLaunch: firstLaunch.events, secondLaunch: secondLaunch.events },
        null,
        2,
      ),
    );
  } finally {
    await removePackagedStartupRoot(root);
  }
}

await main();
