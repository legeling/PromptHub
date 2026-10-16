import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";
import {
  closeDatabase,
  configureRuntimePaths,
  initDatabase,
  resetRuntimePaths,
} from "@prompthub/core";

it("rejects initialization after paths reset and permits an explicit isolated profile", () => {
  expect(vi.isMockFunction(initDatabase)).toBe(true);
  resetRuntimePaths();
  expect(() => initDatabase()).toThrow(
    "CLI tests require an isolated data directory",
  );
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cli-isolation-"));
  try {
    configureRuntimePaths({ userDataPath: root });
    const database = initDatabase();
    expect(database.get("PRAGMA quick_check")).toEqual({ quick_check: "ok" });
    closeDatabase();
    resetRuntimePaths();
    expect(() => initDatabase()).toThrow(
      "CLI tests require an isolated data directory",
    );
  } finally {
    closeDatabase();
    resetRuntimePaths();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
