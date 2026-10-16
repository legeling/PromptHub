/**
 * @vitest-environment node
 */
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { writeRuntimeLayoutState } from "@prompthub/core/runtime-paths";

import {
  configureRuntimePaths,
  getDataDir,
  getDatabasePath,
  getGeneratedImagesDir,
  getImagesDir,
  getPromptsWorkspaceDir,
  getRuntimeStorageContext,
  resetRuntimePaths,
  getWorkspaceDir,
} from "../../../src/main/runtime-paths";

function makeTmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe("runtime-paths database selection", () => {
  let tmpBase: string;

  beforeEach(() => {
    tmpBase = makeTmpDir("runtime-paths-");
  });

  afterEach(() => {
    resetRuntimePaths();
    fs.rmSync(tmpBase, { recursive: true, force: true });
  });

  it("keeps explicit Prompt workspace exports in cache for every data layout", () => {
    configureRuntimePaths({ userDataPath: tmpBase });
    expect(getWorkspaceDir()).toBe(
      path.join(tmpBase, "cache", "prompt-workspace"),
    );
    expect(getPromptsWorkspaceDir()).toBe(
      path.join(getWorkspaceDir(), "prompts"),
    );
  });

  it("rejects a partial migration that left both database layouts active", () => {
    const userDataPath = path.join(tmpBase, "PromptHub");
    fs.mkdirSync(path.join(userDataPath, "data"), { recursive: true });
    fs.writeFileSync(
      path.join(userDataPath, "prompthub.db"),
      "root-db",
      "utf8",
    );
    fs.writeFileSync(
      path.join(userDataPath, "data", "prompthub.db"),
      "data-db",
      "utf8",
    );
    fs.writeFileSync(
      path.join(userDataPath, ".data-layout-v0.5.5.json"),
      JSON.stringify({
        version: "0.5.5",
        movedEntries: ["skills", "images", "prompthub.db"],
        failedEntries: ["prompthub.db"],
      }),
      "utf8",
    );

    configureRuntimePaths({ userDataPath });

    expect(() => getDatabasePath()).toThrow("mixed PromptHub storage layout");
  });

  it("uses unified data db after db migration marker is complete", () => {
    const userDataPath = path.join(tmpBase, "PromptHub");
    fs.mkdirSync(path.join(userDataPath, "data"), { recursive: true });
    fs.writeFileSync(
      path.join(userDataPath, "prompthub.db"),
      "root-db",
      "utf8",
    );
    fs.writeFileSync(
      path.join(userDataPath, "data", "prompthub.db"),
      "data-db",
      "utf8",
    );
    fs.writeFileSync(
      path.join(userDataPath, ".data-layout-v0.5.5.json"),
      JSON.stringify({
        version: "0.5.5",
        movedEntries: ["skills", "images", "prompthub.db"],
        dbLayoutVersion: "0.5.7",
      }),
      "utf8",
    );

    configureRuntimePaths({ userDataPath });

    expect(getDatabasePath()).toBe(
      path.join(userDataPath, "data", "prompthub.db"),
    );
  });

  it("rejects a completed database marker when a legacy domain still failed", () => {
    const userDataPath = path.join(tmpBase, "PromptHub");
    fs.mkdirSync(path.join(userDataPath, "data"), { recursive: true });
    fs.writeFileSync(
      path.join(userDataPath, "data", "prompthub.db"),
      "data-db",
      "utf8",
    );
    fs.mkdirSync(path.join(userDataPath, "skills"), { recursive: true });
    fs.writeFileSync(path.join(userDataPath, "skills", "legacy.md"), "legacy");
    fs.writeFileSync(
      path.join(userDataPath, ".data-layout-v0.5.5.json"),
      JSON.stringify({
        version: "0.5.5",
        movedEntries: ["prompthub.db"],
        failedEntries: ["skills"],
        dbLayoutVersion: "0.5.7",
      }),
      "utf8",
    );

    configureRuntimePaths({ userDataPath });

    expect(() => getRuntimeStorageContext()).toThrow(
      "mixed PromptHub storage layout",
    );
  });

  it("uses unified data db for new users when no legacy root db exists", () => {
    const userDataPath = path.join(tmpBase, "PromptHub");
    fs.mkdirSync(path.join(userDataPath, "data"), { recursive: true });
    fs.writeFileSync(
      path.join(userDataPath, "data", "prompthub.db"),
      "data-db",
      "utf8",
    );

    configureRuntimePaths({ userDataPath });

    expect(getDatabasePath()).toBe(
      path.join(userDataPath, "data", "prompthub.db"),
    );
  });

  it("uses legacy root db for old users when unified db does not exist yet", () => {
    const userDataPath = path.join(tmpBase, "PromptHub");
    fs.mkdirSync(userDataPath, { recursive: true });
    fs.writeFileSync(
      path.join(userDataPath, "prompthub.db"),
      "root-db",
      "utf8",
    );

    configureRuntimePaths({ userDataPath });

    expect(getDatabasePath()).toBe(path.join(userDataPath, "prompthub.db"));
  });

  it("does not let the obsolete generation subdirectory hide legacy Prompt images", () => {
    const userDataPath = path.join(tmpBase, "PromptHub");
    const legacyImagesDir = path.join(userDataPath, "images");
    fs.mkdirSync(
      path.join(userDataPath, "data", "assets", "images", "generated"),
      { recursive: true },
    );
    fs.mkdirSync(legacyImagesDir, { recursive: true });
    fs.writeFileSync(path.join(legacyImagesDir, "prompt.png"), "prompt");

    configureRuntimePaths({ userDataPath });

    expect(getImagesDir()).toBe(legacyImagesDir);
    expect(getGeneratedImagesDir()).toBe(
      path.join(userDataPath, "data", "generations", "assets"),
    );
  });

  it("keeps unified Prompt media authoritative when it contains real images", () => {
    const userDataPath = path.join(tmpBase, "PromptHub");
    const unifiedImagesDir = path.join(
      userDataPath,
      "data",
      "assets",
      "images",
    );
    fs.mkdirSync(unifiedImagesDir, { recursive: true });
    fs.mkdirSync(path.join(userDataPath, "images"), { recursive: true });
    fs.writeFileSync(path.join(unifiedImagesDir, "prompt.png"), "prompt");

    configureRuntimePaths({ userDataPath });

    expect(getImagesDir()).toBe(unifiedImagesDir);
  });

  it("rejects mixed canonical and legacy domain paths", () => {
    const userDataPath = path.join(tmpBase, "PromptHub");
    fs.mkdirSync(path.join(userDataPath, "data"), { recursive: true });
    fs.writeFileSync(
      path.join(userDataPath, "data", "prompthub.db"),
      "data-db",
      "utf8",
    );
    fs.mkdirSync(path.join(userDataPath, "skills"), { recursive: true });
    fs.mkdirSync(path.join(userDataPath, "workspace", "prompts"), {
      recursive: true,
    });
    fs.mkdirSync(path.join(userDataPath, "images"), { recursive: true });
    fs.mkdirSync(path.join(userDataPath, "videos"), { recursive: true });
    fs.writeFileSync(path.join(userDataPath, "skills", "legacy.md"), "legacy");
    fs.writeFileSync(
      path.join(userDataPath, "workspace", "prompts", "legacy.md"),
      "legacy",
    );

    configureRuntimePaths({ userDataPath });

    expect(() => getRuntimeStorageContext()).toThrow(
      "mixed PromptHub storage layout",
    );
  });

  it("keeps the resolved layout immutable when files appear later", () => {
    const userDataPath = path.join(tmpBase, "PromptHub");
    fs.mkdirSync(userDataPath, { recursive: true });
    fs.writeFileSync(
      path.join(userDataPath, "prompthub.db"),
      "legacy-db",
      "utf8",
    );
    configureRuntimePaths({ userDataPath });

    const firstContext = getRuntimeStorageContext();
    expect(firstContext.layoutEpoch).toBe(0);
    expect(getDatabasePath()).toBe(path.join(userDataPath, "prompthub.db"));

    fs.mkdirSync(getDataDir(), { recursive: true });
    fs.writeFileSync(
      path.join(getDataDir(), "prompthub.db"),
      "canonical-db",
      "utf8",
    );

    expect(getRuntimeStorageContext()).toBe(firstContext);
    expect(getDatabasePath()).toBe(path.join(userDataPath, "prompthub.db"));
  });

  it("rejects layout markers created by a newer client", () => {
    const userDataPath = path.join(tmpBase, "PromptHub");
    const dataDir = path.join(userDataPath, "data");
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(
      path.join(dataDir, ".layout-state.json"),
      JSON.stringify({
        formatVersion: 1,
        layoutEpoch: 2,
        state: "complete",
        rootIdentity: "future-root",
        verifiedAt: new Date().toISOString(),
      }),
      "utf8",
    );
    configureRuntimePaths({ userDataPath });

    expect(() => getRuntimeStorageContext()).toThrow(
      "newer storage layout epoch",
    );
  });

  it("rejects a layout marker copied from a different root", () => {
    const sourceRoot = path.join(tmpBase, "source");
    const userDataPath = path.join(tmpBase, "PromptHub");
    writeRuntimeLayoutState(sourceRoot);
    fs.mkdirSync(path.join(userDataPath, "data"), { recursive: true });
    fs.copyFileSync(
      path.join(sourceRoot, "data", ".layout-state.json"),
      path.join(userDataPath, "data", ".layout-state.json"),
    );
    configureRuntimePaths({ userDataPath });

    expect(() => getRuntimeStorageContext()).toThrow(
      "storage layout root identity mismatch",
    );
  });

  it.skipIf(process.platform === "win32")(
    "rejects symlinked layout markers",
    () => {
      const userDataPath = path.join(tmpBase, "PromptHub");
      const outsideRoot = path.join(tmpBase, "outside");
      writeRuntimeLayoutState(outsideRoot);
      fs.mkdirSync(path.join(userDataPath, "data"), { recursive: true });
      fs.symlinkSync(
        path.join(outsideRoot, "data", ".layout-state.json"),
        path.join(userDataPath, "data", ".layout-state.json"),
      );
      configureRuntimePaths({ userDataPath });

      expect(() => getRuntimeStorageContext()).toThrow(
        "symbolic link in PromptHub storage path",
      );
    },
  );
});
