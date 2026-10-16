import {
  createSkillTestRuntime,
  fileInventory,
  type SkillTestRuntime,
} from "./helpers/skill-runtime";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RuleFileDescriptor } from "@prompthub/shared/types";
import { RuleDB, getDatabase } from "../../src/main/database";
import { registerRulesIPC } from "../../src/main/ipc/rules.ipc";
import { rulesApi } from "../../src/preload/api/rules";

let runtime: SkillTestRuntime;
beforeEach(async () => {
  runtime = await createSkillTestRuntime();
  registerRulesIPC();
});
afterEach(() => {
  vi.restoreAllMocks();
  runtime?.dispose();
});

async function reopen(): Promise<void> {
  await runtime.reopen();
  registerRulesIPC();
}

async function project(id: string): Promise<RuleFileDescriptor> {
  const rootPath = path.join(runtime.root, id);
  fs.mkdirSync(rootPath);
  fs.writeFileSync(path.join(rootPath, "keep.txt"), "External user file\n");
  const rule = await rulesApi.addProject({ id, name: id, rootPath });
  await rulesApi.save(rule.id, `# Managed ${id}\n`);
  return rule;
}

describe("#193 missing project Rules through real preload/IPC and storage", () => {
  it("persists deletion on rescan/reopen and cleans only confirmed missing records", async () => {
    const missing = await project("removed-target");
    const unselected = await project("unselected-target");
    const present = await project("present-target");
    const before = await rulesApi.read(missing.id);
    fs.unlinkSync(missing.targetPath);
    fs.unlinkSync(unselected.targetPath);
    const scanned = await rulesApi.scan();
    expect(scanned.find((rule) => rule.id === missing.id)).toMatchObject({
      exists: false,
      syncStatus: "target-missing",
      targetPath: missing.targetPath,
    });
    expect(new RuleDB(getDatabase()).getById(missing.id)?.syncStatus).toBe(
      "target-missing",
    );
    expect((await rulesApi.read(missing.id)).content).toBe(before.content);
    expect((await rulesApi.read(missing.id)).versions).toEqual(before.versions);
    await reopen();
    expect(
      (await rulesApi.list()).find((rule) => rule.id === missing.id),
    ).toMatchObject({ exists: false, syncStatus: "target-missing" });
    const presentBefore = fileInventory(path.dirname(present.targetPath));
    const cleaned = await rulesApi.removeMissingProjects([
      missing.id,
      missing.id,
      present.id,
      "codex-agents",
      "project:../outside",
    ]);
    expect(cleaned).toEqual({
      removed: [missing.id],
      skipped: [present.id, "codex-agents", "project:../outside"],
      failed: [],
    });
    expect(new RuleDB(getDatabase()).getById(missing.id)).toBeNull();
    expect(new RuleDB(getDatabase()).getVersions(missing.id)).toEqual([]);
    expect(fileInventory(path.dirname(missing.targetPath))).toEqual({
      "keep.txt": Buffer.from("External user file\n").toString("base64"),
    });
    expect(fileInventory(path.dirname(present.targetPath))).toEqual(
      presentBefore,
    );
    expect((await rulesApi.read(unselected.id)).content).toBe(
      "# Managed unselected-target\n",
    );
    await reopen();
    expect((await rulesApi.list()).some((rule) => rule.id === missing.id)).toBe(
      false,
    );
    expect((await rulesApi.read(unselected.id)).syncStatus).toBe(
      "target-missing",
    );
    expect(await rulesApi.removeMissingProjects([missing.id])).toEqual({
      removed: [],
      skipped: [missing.id],
      failed: [],
    });
  });

  it("rechecks absence before cleanup and preserves a reappearing external file", async () => {
    const rule = await project("reappearing-target");
    fs.unlinkSync(rule.targetPath);
    await rulesApi.scan();
    fs.writeFileSync(rule.targetPath, "# External replacement\n");
    expect(await rulesApi.removeMissingProjects([rule.id])).toEqual({
      removed: [],
      skipped: [rule.id],
      failed: [],
    });
    expect(fs.readFileSync(rule.targetPath, "utf8")).toBe(
      "# External replacement\n",
    );
    await reopen();
    expect((await rulesApi.read(rule.id)).content).toBe(
      "# Managed reappearing-target\n",
    );
    expect(
      (await rulesApi.scan()).find((item) => item.id === rule.id)?.syncStatus,
    ).toBe("out-of-sync");
  });

  it("returns per-record deletion failures without losing data and permits retry", async () => {
    const first = await project("failed-cleanup");
    const second = await project("successful-cleanup");
    fs.unlinkSync(first.targetPath);
    fs.unlinkSync(second.targetPath);
    await rulesApi.scan();
    const deleteRecord = RuleDB.prototype.delete;
    const fault = vi
      .spyOn(RuleDB.prototype, "delete")
      .mockImplementation(function (id) {
        if (id === first.id)
          throw new Error("Injected record deletion failure");
        return deleteRecord.call(this, id);
      });
    expect(await rulesApi.removeMissingProjects([first.id, second.id])).toEqual(
      { removed: [second.id], skipped: [], failed: [first.id] },
    );
    fault.mockRestore();
    await reopen();
    expect((await rulesApi.read(first.id)).content).toBe(
      "# Managed failed-cleanup\n",
    );
    expect(new RuleDB(getDatabase()).getById(second.id)).toBeNull();
    expect(await rulesApi.removeMissingProjects([first.id])).toEqual({
      removed: [first.id],
      skipped: [],
      failed: [],
    });
  });

  it("checks each target once and writes only a changed record in a stable project list", async () => {
    const projectCount = 128;
    const rules: RuleFileDescriptor[] = [];
    for (let index = 0; index < projectCount; index += 1)
      rules.push(await project(`scale-${index}`));
    await rulesApi.scan();
    const targets = new Set(rules.map((rule) => rule.targetPath));
    const metadata = new Set(
      rules.map((rule) =>
        path.join(path.dirname(rule.managedPath || ""), "_rule.json"),
      ),
    );
    const access = vi.spyOn(fs, "existsSync");
    const rename = vi.spyOn(fsp, "rename");
    const upsert = vi.spyOn(RuleDB.prototype, "upsert");
    const versions = vi.spyOn(RuleDB.prototype, "replaceVersions");
    const before = new RuleDB(getDatabase())
      .getAll()
      .filter((rule) => targets.has(rule.targetPath));
    await rulesApi.scan();
    const targetChecks = access.mock.calls.filter(([target]) =>
      targets.has(String(target)),
    );
    expect(targetChecks).toHaveLength(projectCount);
    expect(new Set(targetChecks.map(([target]) => String(target))).size).toBe(
      projectCount,
    );
    expect(
      rename.mock.calls.filter(([, destination]) =>
        metadata.has(String(destination)),
      ),
    ).toEqual([]);
    expect(
      upsert.mock.calls.filter(([rule]) => rule.scope === "project"),
    ).toEqual([]);
    expect(
      versions.mock.calls.filter(([id]) => id.startsWith("project:")),
    ).toEqual([]);
    expect(
      new RuleDB(getDatabase())
        .getAll()
        .filter((rule) => targets.has(rule.targetPath)),
    ).toEqual(before);
    access.mockClear();
    rename.mockClear();
    upsert.mockClear();
    versions.mockClear();
    const removed = rules[0];
    fs.unlinkSync(removed.targetPath);
    const changed = await rulesApi.scan();
    expect(changed.find((rule) => rule.id === removed.id)).toMatchObject({
      exists: false,
      syncStatus: "target-missing",
    });
    expect(
      access.mock.calls.filter(([target]) => targets.has(String(target))),
    ).toHaveLength(projectCount);
    expect(
      rename.mock.calls.filter(([, destination]) =>
        metadata.has(String(destination)),
      ),
    ).toHaveLength(0);
    expect(
      upsert.mock.calls
        .filter(([rule]) => rule.scope === "project")
        .map(([rule]) => rule.id),
    ).toEqual([removed.id]);
    expect(
      versions.mock.calls
        .filter(([id]) => id.startsWith("project:"))
        .map(([id]) => id),
    ).toEqual([]);
  }, 60_000);
});
