/** @vitest-environment node */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { PromptDB } from "@prompthub/db";
import { initDatabase as initCoreDatabase } from "@prompthub/core/database";
import { PromptWorkspaceRecoveryRequired } from "@prompthub/core/migrations/prompt-workspace-v2";
import { writeRuntimeLayoutState } from "@prompthub/core/runtime-paths";
import { closeDatabase, initDatabase } from "../../../src/main/database";
import {
  configureRuntimePaths,
  resetRuntimePaths,
} from "../../../src/main/runtime-paths";
import { writeRestoreMarker } from "../../../src/main/services/prompt-workspace-restore-marker";

let root: string;
function source(): string {
  const file = path.join(root, "data", "prompts", "historical.md");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    '---\nid: "historical"\ntitle: "Historical"\ncreatedAt: "2026-01-01T00:00:00.000Z"\nupdatedAt: "2026-01-01T00:00:00.000Z"\n---\n<!-- PROMPTHUB:SYSTEM -->\n\n<!-- PROMPTHUB:USER -->\nPreserved body\n',
  );
  return file;
}
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "ph-workspace-startup-"));
  writeRuntimeLayoutState(root);
  configureRuntimePaths({ userDataPath: root });
});
afterEach(() => {
  closeDatabase();
  resetRuntimePaths();
  fs.rmSync(root, { recursive: true, force: true });
});

it.each([
  { name: "Core", start: initCoreDatabase },
  { name: "Desktop", start: initDatabase },
])(
  "converts before $name opens writable clients, then preserves edits and deletion over startup",
  ({ start }) => {
    const file = source();
    let database = start();
    let prompts = new PromptDB(database);
    expect(prompts.getById("historical")?.userPrompt).toBe("Preserved body");
    expect(fs.existsSync(file)).toBe(false);
    prompts.update("historical", { userPrompt: "SQL edited" });
    closeDatabase();
    database = start();
    prompts = new PromptDB(database);
    expect(prompts.getById("historical")?.userPrompt).toBe("SQL edited");
    expect(prompts.getVersions("historical")).toHaveLength(2);
    prompts.delete("historical");
    closeDatabase();
    expect(new PromptDB(start()).getAll()).toEqual([]);
    expect(fs.existsSync(file)).toBe(false);
  },
);

it("honors an empty restored database and prevents an old writer reopening a writable client", () => {
  source();
  writeRestoreMarker(root);
  expect(new PromptDB(initDatabase()).getAll()).toEqual([]);
  closeDatabase();
  const file = source();
  expect(() => initDatabase()).toThrow(PromptWorkspaceRecoveryRequired);
  expect(fs.existsSync(file)).toBe(true);
});
