import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { validateChangeTraceability } from "./validate-change-traceability.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const generator = path.join(root, "scripts/generate-spec-change-index.mjs");
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-spec-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, "spec/changes/active"), { recursive: true });
  return dir;
}
function write(dir, name, content) {
  const target = path.join(dir, name);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}
function run(dir, ...args) {
  return spawnSync(process.execPath, [generator, "--root", dir, ...args], {
    encoding: "utf8",
    timeout: 10_000,
    maxBuffer: 1024 * 1024,
  });
}

test("index accepts a single plan and legacy implementation without imposing artifacts", (t) => {
  const dir = fixture(t);
  for (const [name, file, text] of [
    ["single", "plan.md", "## Status\n\nblocked\n"],
    ["tasks", "tasks.md", "## Status\n\nreview-pending\n"],
    ["legacy", "implementation.md", "## Status\n\nrelease-pending\n"],
    ["no-status", "spec.md", "# Accepted behavior\n"],
    ["fallback", "implementation.md", "## Status\n\nactive\n"],
    ["unknown", "plan.md", "## Status\n\nawaiting input\n"],
    ["negated", "plan.md", "## Status\n\nnot completed\n"],
    ["unimplemented", "tasks.md", "## Status\n\nunimplemented\n"],
  ])
    write(dir, `spec/changes/active/${name}/${file}`, text);
  write(
    dir,
    "spec/changes/active/single/implementation.md",
    "## Status\n\nshipped\n",
  );
  write(dir, "spec/changes/active/fallback/tasks.md", "# Checklist\n");
  assert.equal(run(dir).status, 0);
  const index = fs.readFileSync(
    path.join(dir, "spec/changes/index.md"),
    "utf8",
  );
  for (const [name, status] of [
    ["single", "blocked"],
    ["tasks", "review-pending"],
    ["legacy", "release-pending"],
    ["no-status", "active"],
    ["fallback", "active"],
    ["unknown", "active"],
    ["negated", "active"],
    ["unimplemented", "active"],
  ]) {
    assert.ok(index.includes(`| \`${name}\` | ${status} |`));
  }
  assert.equal(run(dir, "--check").status, 0);
  write(dir, "spec/changes/active/single/plan.md", "## Status\n\ncompleted\n");
  assert.equal(run(dir, "--check").status, 1);
  assert.equal(run(dir).status, 0);
  const updated = fs.readFileSync(
    path.join(dir, "spec/changes/index.md"),
    "utf8",
  );
  assert.ok(!updated.split("## Recorded complete")[0].includes("| `single` |"));
  assert.match(updated, /\| `single` \| completed \|/);
});

test("empty inventory and archived evidence remain readable", (t) => {
  const dir = fixture(t);
  assert.equal(run(dir).status, 0);
  assert.match(
    fs.readFileSync(path.join(dir, "spec/changes/index.md"), "utf8"),
    /\| Active \| 0 \|/,
  );
  write(
    dir,
    "spec/changes/archive/2026/09/2026-09-09-done/notes.md",
    "# Evidence",
  );
  write(dir, "spec/changes/legacy/old/notes.md", "# History");
  assert.equal(run(dir).status, 0);
  const text = fs.readFileSync(path.join(dir, "spec/changes/index.md"), "utf8");
  assert.match(text, /\| Archived \| 1 \|/);
  assert.match(text, /\| Legacy \| 1 \|/);
});

test("unstructured topic needs no IDs while existing traceability still detects orphan references", (t) => {
  const dir = fixture(t);
  const change = path.join(dir, "spec/changes/active/topic");
  write(
    change,
    "spec.md",
    "# Behavior\nAcceptance: the saved value survives reopen.\n",
  );
  assert.deepEqual(validateChangeTraceability(change), {
    errors: [],
    hasTraceability: false,
  });
  write(
    change,
    "specs/domain/spec.md",
    "## `FR-DOC-001`\n| FR-DOC-001 | DES-DOC-001 | TEST-DOC-001 | T-DOC-001 |\n",
  );
  assert.ok(
    validateChangeTraceability(change).errors.includes(
      "TEST-DOC-001 does not exist in the change",
    ),
  );
  write(change, "plan.md", "DES-DOC-001\nTEST-DOC-001\nT-DOC-001\n");
  assert.deepEqual(validateChangeTraceability(change), {
    errors: [],
    hasTraceability: true,
  });
});

test("project topology and entry links resolve without embedded Skill test scripts", () => {
  const topology = fs.readFileSync(
    path.join(root, "spec-init.topology.yml"),
    "utf8",
  );
  for (const match of topology.matchAll(/^\s+[\w.]+: (spec\/[^\n]+)$/gm)) {
    assert.ok(
      fs.existsSync(path.join(root, match[1])),
      `missing route: ${match[1]}`,
    );
  }
  for (const name of [
    "spec/README.md",
    "spec/rules/README.md",
    "spec/changes/README.md",
    "spec/changes/_templates/README.md",
    "spec/workflow/04-verification/README.md",
  ]) {
    const content = fs.readFileSync(path.join(root, name), "utf8");
    for (const match of content.matchAll(/\]\(([^)]+)\)/g)) {
      if (/^(https?:|#)/.test(match[1])) continue;
      assert.ok(
        fs.existsSync(
          path.resolve(root, path.dirname(name), match[1].split("#")[0]),
        ),
        `${name}: ${match[1]}`,
      );
    }
  }
  const scripts = JSON.parse(
    fs.readFileSync(path.join(root, "package.json"), "utf8"),
  ).scripts;
  assert.ok(!scripts["spec:test"].includes(".agents/skills/"));
});

test("default traceability checks only explicitly opted-in work", (t) => {
  const dir = fixture(t);
  write(
    dir,
    "spec/changes/active/topic/specs/domain/spec.md",
    "## `FR-DOC-001`\n",
  );
  const check = () =>
    spawnSync(
      process.execPath,
      [path.join(root, "scripts/validate-change-traceability.mjs")],
      { cwd: dir, encoding: "utf8", timeout: 10_000 },
    );
  assert.equal(check().status, 0);
  write(
    dir,
    "spec/changes/active/topic/plan.md",
    "<!-- traceability: enforced -->\n",
  );
  const result = check();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /FR-DOC-001 has no traceability row/);
});
