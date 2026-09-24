import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach } from "vitest";
import { configureRuntimePaths } from "@prompthub/core/runtime-paths";

const workerRuntimeRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), `prompthub-desktop-vitest-${process.pid}-`),
);

function installIsolatedRuntimeRoot(): void {
  const dataPath = path.join(workerRuntimeRoot, "data");
  fs.mkdirSync(dataPath, { recursive: true });
  const databasePath = path.join(dataPath, "prompthub.db");
  if (!fs.existsSync(databasePath))
    fs.closeSync(fs.openSync(databasePath, "w"));
  configureRuntimePaths({ userDataPath: workerRuntimeRoot });
}

beforeAll(installIsolatedRuntimeRoot);
beforeEach(installIsolatedRuntimeRoot);
afterEach(installIsolatedRuntimeRoot);
afterAll(() => {
  fs.rmSync(workerRuntimeRoot, { recursive: true, force: true });
});
