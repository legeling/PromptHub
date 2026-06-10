/**
 * @vitest-environment node
 */
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  configureRuntimePaths,
  getDatabasePath,
  resetRuntimePaths,
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

  it("uses unified data db when partial migration left a legacy root residual", () => {
    const userDataPath = path.join(tmpBase, "PromptHub");
    fs.mkdirSync(path.join(userDataPath, "data"), { recursive: true });
    fs.writeFileSync(path.join(userDataPath, "prompthub.db"), "root-db", "utf8");
    fs.writeFileSync(path.join(userDataPath, "data", "prompthub.db"), "data-db", "utf8");
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

    expect(getDatabasePath()).toBe(path.join(userDataPath, "data", "prompthub.db"));
  });

  it("uses unified data db after db migration marker is complete", () => {
    const userDataPath = path.join(tmpBase, "PromptHub");
    fs.mkdirSync(path.join(userDataPath, "data"), { recursive: true });
    fs.writeFileSync(path.join(userDataPath, "prompthub.db"), "root-db", "utf8");
    fs.writeFileSync(path.join(userDataPath, "data", "prompthub.db"), "data-db", "utf8");
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

    expect(getDatabasePath()).toBe(path.join(userDataPath, "data", "prompthub.db"));
  });

  it("uses unified data db for new users when no legacy root db exists", () => {
    const userDataPath = path.join(tmpBase, "PromptHub");
    fs.mkdirSync(path.join(userDataPath, "data"), { recursive: true });
    fs.writeFileSync(path.join(userDataPath, "data", "prompthub.db"), "data-db", "utf8");

    configureRuntimePaths({ userDataPath });

    expect(getDatabasePath()).toBe(path.join(userDataPath, "data", "prompthub.db"));
  });

  it("uses legacy root db for old users when unified db does not exist yet", () => {
    const userDataPath = path.join(tmpBase, "PromptHub");
    fs.mkdirSync(userDataPath, { recursive: true });
    fs.writeFileSync(path.join(userDataPath, "prompthub.db"), "root-db", "utf8");

    configureRuntimePaths({ userDataPath });

    expect(getDatabasePath()).toBe(path.join(userDataPath, "prompthub.db"));
  });
});
