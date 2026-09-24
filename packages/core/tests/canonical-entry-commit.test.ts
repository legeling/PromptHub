import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  publishCanonicalEntries,
  recoverCanonicalEntryPublication,
  recoverCanonicalEntryPublications,
} from "../src/canonical-entry-publication";

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-entry-commit-"));
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(root, { recursive: true, force: true });
});

function publication() {
  const targets = ["first", "second"].map((name) => path.join(root, name));
  targets.forEach((target) => fs.writeFileSync(target, "old"));
  return {
    targets,
    options: {
      rootPath: root,
      operationKey: "commit-test",
      entries: targets.map((targetPath) => ({
        targetPath,
        prepare: (stage: string) => fs.writeFileSync(stage, "new"),
      })),
    },
  };
}

it("keeps the complete new generation when prior cleanup fails and resumes cleanup", () => {
  const { targets, options } = publication();
  const remove = fs.rmSync.bind(fs);
  let failed = false;
  vi.spyOn(fs, "rmSync").mockImplementation((target, opts) => {
    if (!failed && String(target).includes(".second.prior-")) {
      failed = true;
      throw new Error("cleanup failed");
    }
    return remove(target, opts);
  });
  expect(publishCanonicalEntries(options)).toMatchObject({
    status: "committed",
    cleanupPending: true,
  });
  expect(targets.map((target) => fs.readFileSync(target, "utf8"))).toEqual([
    "new",
    "new",
  ]);
  expect(recoverCanonicalEntryPublication(root, "commit-test")).toBe(
    "committed",
  );
  expect(recoverCanonicalEntryPublication(root, "commit-test")).toBe("none");
});

it("does not undo committed data when the post-commit projection fails", () => {
  const { targets, options } = publication();
  expect(() =>
    publishCanonicalEntries({
      ...options,
      afterCommit() {
        throw new Error("projection failed");
      },
    }),
  ).toThrow(/committed/i);
  expect(targets.map((target) => fs.readFileSync(target, "utf8"))).toEqual([
    "new",
    "new",
  ]);
  expect(recoverCanonicalEntryPublication(root, "commit-test")).toBe(
    "committed",
  );
});

it("preserves committed recovery evidence when the new target is tampered", () => {
  const { targets, options } = publication();
  expect(() =>
    publishCanonicalEntries({
      ...options,
      afterCommit() {
        throw new Error("projection failed");
      },
    }),
  ).toThrow();
  fs.writeFileSync(targets[0], "tampered");
  expect(() => recoverCanonicalEntryPublication(root, "commit-test")).toThrow(
    /integrity|digest/i,
  );
  expect(fs.readdirSync(root).some((name) => name.includes(".prior-"))).toBe(
    true,
  );
});

it("keeps the old generation when the pre-commit callback fails", () => {
  const { targets, options } = publication();
  expect(() =>
    publishCanonicalEntries({
      ...options,
      commit() {
        throw new Error("pre-commit failed");
      },
    }),
  ).toThrow("pre-commit failed");
  expect(targets.map((target) => fs.readFileSync(target, "utf8"))).toEqual([
    "old",
    "old",
  ]);
});

it("leaves an uncertain commit for recovery instead of guessing rollback", () => {
  const { targets, options } = publication();
  const rename = fs.renameSync.bind(fs);
  const spy = vi.spyOn(fs, "renameSync").mockImplementation((from, to) => {
    if (
      String(to).endsWith("commit-test-publication.json") &&
      JSON.parse(fs.readFileSync(from, "utf8")).state === "committed"
    )
      throw new Error("commit rename failed");
    return rename(from, to);
  });
  expect(() => publishCanonicalEntries(options)).toThrow(/outcome is unknown/);
  expect(targets.map((target) => fs.readFileSync(target, "utf8"))).toEqual([
    "new",
    "new",
  ]);
  spy.mockRestore();
  expect(recoverCanonicalEntryPublication(root, "commit-test")).toBe(
    "rolled-back",
  );
  expect(targets.map((target) => fs.readFileSync(target, "utf8"))).toEqual([
    "old",
    "old",
  ]);
});

it("rejects overlapping targets before preparing either resource", () => {
  fs.mkdirSync(path.join(root, "parent"));
  const prepare = vi.fn();
  expect(() =>
    publishCanonicalEntries({
      rootPath: root,
      operationKey: "overlap",
      entries: [
        { targetPath: path.join(root, "parent"), prepare },
        { targetPath: path.join(root, "parent", "child"), prepare },
      ],
    }),
  ).toThrow(/overlap/);
  expect(prepare).not.toHaveBeenCalled();
});

it("does not recover another live process publication", () => {
  const { options } = publication();
  expect(() =>
    publishCanonicalEntries({
      ...options,
      afterCommit() {
        throw new Error("pending");
      },
    }),
  ).toThrow();
  const journalPath = path.join(
    root,
    "data",
    "operations",
    "journals",
    "commit-test-publication.json",
  );
  const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
  journal.ownerPid = process.ppid;
  fs.writeFileSync(journalPath, JSON.stringify(journal));
  expect(() => recoverCanonicalEntryPublication(root, "commit-test")).toThrow(
    /live owner/,
  );
});

it("discovers committed journals before resource graph validation", () => {
  const { options } = publication();
  expect(() =>
    publishCanonicalEntries({
      ...options,
      afterCommit() {
        throw new Error("pending");
      },
    }),
  ).toThrow();
  expect(recoverCanonicalEntryPublications(root)).toEqual([
    { operationKey: "commit-test", status: "committed" },
  ]);
  expect(recoverCanonicalEntryPublications(root)).toEqual([]);
});

it("recovers a real process exit after the durable commit without reverting files", () => {
  const modulePath = path.resolve("src/canonical-entry-publication.ts");
  const target = path.join(root, "asset");
  fs.writeFileSync(target, "old");
  const script = `import fs from 'node:fs'; import { publishCanonicalEntries } from ${JSON.stringify(pathToFileURL(modulePath).href)}; publishCanonicalEntries({ rootPath: ${JSON.stringify(root)}, operationKey:'crash-test', entries:[{targetPath:${JSON.stringify(target)},prepare(p){fs.writeFileSync(p,'new')}}],afterCommit(){process.exit(73)}});`;
  const child = spawnSync(
    process.execPath,
    ["--experimental-strip-types", "--input-type=module", "-e", script],
    { timeout: 10000, encoding: "utf8" },
  );
  expect(child.status, child.stderr).toBe(73);
  expect(recoverCanonicalEntryPublication(root, "crash-test")).toBe(
    "committed",
  );
  expect(fs.readFileSync(target, "utf8")).toBe("new");
});

it("rolls back an actual process exit between two entry renames", () => {
  const modulePath = path.resolve("src/canonical-entry-publication.ts");
  const { targets } = publication();
  const script = `import fs from 'node:fs'; import { publishCanonicalEntries } from ${JSON.stringify(pathToFileURL(modulePath).href)}; let moved=0; publishCanonicalEntries({rootPath:${JSON.stringify(root)},operationKey:'partial-exit',entries:${JSON.stringify(targets)}.map(targetPath=>({targetPath,prepare(p){fs.writeFileSync(p,'new')}})),injectFailure(){if(moved++===1)process.exit(74)}});`;
  const child = spawnSync(
    process.execPath,
    ["--experimental-strip-types", "--input-type=module", "-e", script],
    { timeout: 10000, encoding: "utf8" },
  );
  expect(child.status, child.stderr).toBe(74);
  expect(recoverCanonicalEntryPublication(root, "partial-exit")).toBe(
    "rolled-back",
  );
  expect(targets.map((target) => fs.readFileSync(target, "utf8"))).toEqual([
    "old",
    "old",
  ]);
});

it("cleans a staged entry after a process exits during preparation", () => {
  const modulePath = path.resolve("src/canonical-entry-publication.ts");
  const target = path.join(root, "asset");
  fs.writeFileSync(target, "old");
  const script = `import fs from 'node:fs'; import { publishCanonicalEntries } from ${JSON.stringify(pathToFileURL(modulePath).href)}; publishCanonicalEntries({rootPath:${JSON.stringify(root)},operationKey:'prepare-exit',entries:[{targetPath:${JSON.stringify(target)},prepare(p){fs.writeFileSync(p,'new');process.exit(75)}}]});`;
  const child = spawnSync(
    process.execPath,
    ["--experimental-strip-types", "--input-type=module", "-e", script],
    { timeout: 10000, encoding: "utf8" },
  );
  expect(child.status, child.stderr).toBe(75);
  expect(recoverCanonicalEntryPublication(root, "prepare-exit")).toBe(
    "rolled-back",
  );
  expect(fs.readFileSync(target, "utf8")).toBe("old");
  expect(fs.readdirSync(root).some((name) => name.includes(".stage-"))).toBe(
    false,
  );
});

it("preserves unexpected prior data during preparation recovery", () => {
  const { targets, options } = publication();
  let prior = "";
  expect(() =>
    publishCanonicalEntries({
      ...options,
      entries: [
        {
          targetPath: targets[0],
          prepare(stage) {
            fs.writeFileSync(stage, "new");
            prior = stage.replace(".stage-", ".prior-");
            fs.writeFileSync(prior, "unproven prior");
            throw new Error("prepare failed");
          },
        },
      ],
    }),
  ).toThrow(/unexpected prior/);
  expect(fs.readFileSync(targets[0], "utf8")).toBe("old");
  expect(fs.readFileSync(prior, "utf8")).toBe("unproven prior");
});

it.each(["", "../escape", "UPPERCASE", "x".repeat(65)])(
  "rejects unsafe operation key %s",
  (operationKey) => {
    expect(() =>
      publishCanonicalEntries({ rootPath: root, operationKey, entries: [] }),
    ).toThrow(/operation key/);
  },
);

it("validates actions, duplicates and traversal before touching live data", () => {
  const targetPath = path.join(root, "asset");
  fs.writeFileSync(targetPath, "old");
  const prepare = (stage: string) => fs.writeFileSync(stage, "new");
  expect(() =>
    publishCanonicalEntries({
      rootPath: root,
      operationKey: "bad",
      entries: [{ targetPath }],
    }),
  ).toThrow(/requires/);
  expect(() =>
    publishCanonicalEntries({
      rootPath: root,
      operationKey: "bad",
      entries: [{ targetPath, delete: true, prepare }],
    }),
  ).toThrow(/cannot/);
  expect(() =>
    publishCanonicalEntries({
      rootPath: root,
      operationKey: "bad",
      entries: [
        { targetPath, prepare },
        { targetPath, prepare },
      ],
    }),
  ).toThrow(/duplicate/);
  expect(() =>
    publishCanonicalEntries({
      rootPath: root,
      operationKey: "bad",
      entries: [{ targetPath: path.dirname(root), prepare }],
    }),
  ).toThrow(/escapes/);
  expect(fs.readFileSync(targetPath, "utf8")).toBe("old");
  expect(
    publishCanonicalEntries({
      rootPath: root,
      operationKey: "empty",
      entries: [],
    }),
  ).toEqual({ status: "unchanged", cleanupPending: false });
});

it("rejects symlink publication stages and journal ancestors", () => {
  const targetPath = path.join(root, "asset");
  fs.writeFileSync(targetPath, "old");
  expect(() =>
    publishCanonicalEntries({
      rootPath: root,
      operationKey: "bad",
      entries: [
        {
          targetPath,
          prepare(stage) {
            fs.symlinkSync(targetPath, stage);
          },
        },
      ],
    }),
  ).toThrow(/unsafe/);
  fs.mkdirSync(path.join(root, "data"), { recursive: true });
  expect(
    fs.readdirSync(path.join(root, "data", "operations", "journals")),
  ).toEqual([]);
  fs.rmSync(path.join(root, "data", "operations"), {
    recursive: true,
    force: true,
  });
  fs.symlinkSync(root, path.join(root, "data", "operations"));
  expect(() => recoverCanonicalEntryPublications(root)).toThrow(/unsafe/);
  expect(fs.readFileSync(targetPath, "utf8")).toBe("old");
});

it("preserves a malformed or future journal for diagnosis", () => {
  const directory = path.join(root, "data", "operations", "journals");
  fs.mkdirSync(directory, { recursive: true });
  const journal = path.join(directory, "bad-publication.json");
  for (const body of [
    "{",
    JSON.stringify({ version: 999 }),
    JSON.stringify({ kind: "unknown" }),
  ]) {
    fs.writeFileSync(journal, body);
    expect(() => recoverCanonicalEntryPublication(root, "bad")).toThrow(
      /invalid/,
    );
    expect(fs.readFileSync(journal, "utf8")).toBe(body);
  }
});
