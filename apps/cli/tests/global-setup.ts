import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { CLI_TEST_ENTRY_ENV } from "./helpers/cli-process";

import {
  closeDatabase,
  configureRuntimePaths,
  initDatabase,
  resetRuntimePaths,
} from "@prompthub/core";

const DEFAULT_SUITE_BUDGET_MS = 75_000;

async function buildProcessEntry(): Promise<string> {
  const output = fileURLToPath(new URL("../out/", import.meta.url));
  fs.mkdirSync(output, { recursive: true });
  const directory = fs.mkdtempSync(path.join(output, "cli-test-"));
  try {
    await build({
      configFile: fileURLToPath(new URL("../vite.config.ts", import.meta.url)),
      logLevel: "error",
      build: { outDir: directory, emptyOutDir: false },
    });
    return path.join(directory, "prompthub.cjs");
  } catch (error) {
    fs.rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}

function initializeTemplate(userDataPath: string): void {
  configureRuntimePaths({ userDataPath });
  try {
    initDatabase();
  } finally {
    closeDatabase();
    resetRuntimePaths();
  }
}

function checkSuiteBudget(startedAt: number): void {
  const configuredBudget = Number(
    process.env.PROMPTHUB_CLI_TEST_MAX_MS ?? DEFAULT_SUITE_BUDGET_MS,
  );
  const budgetMs =
    Number.isFinite(configuredBudget) && configuredBudget > 0
      ? configuredBudget
      : DEFAULT_SUITE_BUDGET_MS;
  const elapsedMs = performance.now() - startedAt;
  if (elapsedMs > budgetMs) {
    throw new Error(
      `CLI test runtime ${Math.round(elapsedMs)}ms exceeded ${budgetMs}ms budget`,
    );
  }
}

export default async function setup(): Promise<() => void> {
  const startedAt = performance.now();
  const originalTemplatePath = process.env.PROMPTHUB_CLI_TEST_DB_TEMPLATE;
  const originalEntry = process.env[CLI_TEST_ENTRY_ENV];
  const templateRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "prompthub-cli-db-template-"),
  );
  const userDataPath = path.join(templateRoot, "user-data");
  const databasePath = path.join(userDataPath, "data", "prompthub.db");

  let entry: string;
  try {
    initializeTemplate(userDataPath);
    entry = await buildProcessEntry();
  } catch (error) {
    fs.rmSync(templateRoot, { recursive: true, force: true });
    throw error;
  }

  process.env.PROMPTHUB_CLI_TEST_DB_TEMPLATE = databasePath;
  process.env[CLI_TEST_ENTRY_ENV] = entry;

  return function teardown() {
    if (originalTemplatePath === undefined) {
      delete process.env.PROMPTHUB_CLI_TEST_DB_TEMPLATE;
    } else {
      process.env.PROMPTHUB_CLI_TEST_DB_TEMPLATE = originalTemplatePath;
    }
    if (originalEntry === undefined) delete process.env[CLI_TEST_ENTRY_ENV];
    else process.env[CLI_TEST_ENTRY_ENV] = originalEntry;
    fs.rmSync(templateRoot, { recursive: true, force: true });
    fs.rmSync(path.dirname(entry), { recursive: true, force: true });
    checkSuiteBudget(startedAt);
  };
}
