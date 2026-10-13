import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  createThreatCrushReport,
  THREATCRUSH_REPORT_LIMITS,
} from "./threatcrush-report.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(root, "scripts/threatcrush-report.mjs");
const processTimeoutMs = 10_000;
const maxOutputBytes = 256 * 1024;
const finding = (uri, level = "error") => ({
  ruleId: "test-rule",
  message: { text: "Fixture finding" },
  level,
  locations: [
    {
      physicalLocation: { artifactLocation: { uri }, region: { startLine: 7 } },
    },
  ],
});
const sarif = (results) => ({
  version: "2.1.0",
  runs: [
    { tool: { driver: { name: "ThreatCrush", version: "fixture" } }, results },
  ],
});
const changed = (...names) =>
  Buffer.from(names.length ? `${names.join("\0")}\0` : "");

test("reports findings in changed files and folds unchanged files", () => {
  const report = createThreatCrushReport(
    sarif([finding("src/new.ts"), finding("src/old.ts")]),
    changed("src/new.ts"),
    true,
  );
  assert.match(report, /\*\*1\*\* finding\(s\) in the 1 file\(s\)/);
  assert.match(report, /1 pre-existing finding/);
  assert.match(report, /`src\/new.ts`:7/);
});

for (const name of [
  "src/a b.ts",
  "src/\u4e2d\u6587.ts",
  "src/a\nb.ts",
  "src/percent%name.ts",
]) {
  test(`preserves the changed-file identity for ${JSON.stringify(name)}`, () => {
    const report = createThreatCrushReport(
      sarif([finding(encodeURI(name))]),
      changed(name),
      true,
    );
    assert.match(report, /\*\*1\*\* finding\(s\) in the 1 file\(s\)/);
    assert.doesNotMatch(report, /pre-existing|Nothing in the files/);
  });
}

test("consumes real Git NUL-delimited filenames without whitespace splitting", () => {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), "prompthub-threatcrush-git-"),
  );
  const names = ["a b.ts", "\u4e2d\u6587.ts", "a\nb.ts"];
  const git = (args) => {
    const result = spawnSync("git", args, {
      cwd: dir,
      timeout: processTimeoutMs,
      maxBuffer: maxOutputBytes,
    });
    assert.equal(result.status, 0, result.stderr.toString());
    return result.stdout;
  };
  try {
    git(["init", "--quiet"]);
    for (const name of names)
      fs.writeFileSync(path.join(dir, name), "fixture\n");
    git(["add", "--", ...names]);
    const inventory = git(["diff", "--cached", "--name-only", "-z"]);
    const report = createThreatCrushReport(
      sarif(names.map((name) => finding(encodeURI(name)))),
      inventory,
      true,
    );
    assert.match(report, /\*\*3\*\* finding\(s\) in the 3 file\(s\)/);
    assert.doesNotMatch(report, /pre-existing/);
  } finally {
    fs.rmSync(dir, { recursive: true });
  }
});

test("reports without a merge scope instead of attributing findings to a PR", () => {
  const report = createThreatCrushReport(
    sarif([finding("src/a.ts")]),
    changed(),
    false,
  );
  assert.match(report, /\*\*1\*\* finding\(s\)/);
  assert.doesNotMatch(report, /this pull request changes|pre-existing/);
});

test("does not call a finding without a location pre-existing", () => {
  const report = createThreatCrushReport(
    sarif([
      {
        ruleId: "no-location",
        message: { text: "Fixture finding" },
        level: "warning",
      },
    ]),
    changed("src/a.ts"),
    true,
  );
  assert.match(report, /without a file location/);
  assert.match(report, /no location/);
  assert.doesNotMatch(report, /<details>|<summary>/);
});

test("does not include matched snippets and escapes Markdown in filenames", () => {
  const input = finding("src/`a|<b>.ts");
  input.locations[0].physicalLocation.region.snippet = {
    text: "private-fixture-value",
  };
  const report = createThreatCrushReport(sarif([input]), changed(), false);
  assert.doesNotMatch(report, /private-fixture-value|<b>|`a\|/);
  assert.match(report, /&#124;|&#96;/);
});

test("keeps the most severe findings ahead of truncated informational rows", () => {
  const overflowRowCount = THREATCRUSH_REPORT_LIMITS.current + 1;
  const rows = Array.from({ length: overflowRowCount }, (_, i) =>
    finding(`src/low-${i}.ts`, "note"),
  );
  rows.push(finding("src/high.ts"));
  const report = createThreatCrushReport(sarif(rows), changed(), false);
  assert.match(report, /`src\/high.ts`:7/);
  assert.match(report, /more; the full set is in the SARIF artifact/);
});

for (const invalid of [
  {},
  sarif(null),
  { version: "2.1.0", runs: [] },
  sarif([finding("src/invalid.ts", "unknown")]),
]) {
  test(`rejects an invalid scan result: ${JSON.stringify(invalid)}`, () => {
    assert.throws(
      () => createThreatCrushReport(invalid, changed(), false),
      /SARIF/,
    );
  });
}

function runReport(input, status = "clean", scoped = "true") {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), "prompthub-threatcrush-cli-"),
  );
  const files = [
    "scan.sarif",
    "changed.bin",
    "report.md",
    "summary.md",
    "output.txt",
  ].map((name) => path.join(dir, name));
  try {
    if (input !== undefined)
      fs.writeFileSync(
        files[0],
        typeof input === "string" ? input : JSON.stringify(input),
      );
    fs.writeFileSync(files[1], changed("src/a b.ts"));
    const result = spawnSync(process.execPath, [script, ...files.slice(0, 3)], {
      cwd: root,
      timeout: processTimeoutMs,
      maxBuffer: maxOutputBytes,
      encoding: "utf8",
      env: {
        ...process.env,
        SCAN_STATUS: status,
        SCAN_SCOPED: scoped,
        GITHUB_STEP_SUMMARY: files[3],
        GITHUB_OUTPUT: files[4],
      },
    });
    assert.equal(result.error, undefined);
    return {
      status: result.status,
      stderr: result.stderr,
      report: fs.readFileSync(files[2], "utf8"),
      summary: fs.readFileSync(files[3], "utf8"),
      output: fs.readFileSync(files[4], "utf8"),
    };
  } finally {
    fs.rmSync(dir, { recursive: true });
  }
}

test("the actual report CLI preserves report-only findings and publishes valid output", () => {
  const result = runReport(sarif([finding("src/a%20b.ts")]));
  assert.equal(result.status, 0);
  assert.match(result.output, /valid=true/);
  assert.equal(result.summary, result.report);
  assert.match(result.report, /\*\*1\*\* finding\(s\) in the 1 file\(s\)/);
});

test("the actual report CLI publishes a valid no-findings scan", () => {
  const result = runReport(sarif([]));
  assert.equal(result.status, 0);
  assert.match(result.report, /No findings/);
  assert.match(result.output, /valid=true/);
});

test("rejects invalid Git inventory and malformed SARIF location encoding", () => {
  assert.throws(
    () => createThreatCrushReport(sarif([]), Buffer.from("not-nul\n"), true),
    /NUL-delimited/,
  );
  assert.throws(
    () =>
      createThreatCrushReport(sarif([finding("src/%ZZ.ts")]), changed(), false),
    /URI encoding/,
  );
});

for (const input of [undefined, "not JSON", {}, sarif(null)]) {
  test(`the actual report CLI fails instead of approving invalid SARIF: ${JSON.stringify(input)}`, () => {
    const result = runReport(input);
    assert.equal(result.status, 1);
    assert.match(result.report, /\*\*NOT RUN\*\*/);
    assert.match(result.output, /valid=false/);
    assert.equal(result.summary, result.report);
  });
}

test("a skipped or failed scanner cannot produce a clean report from stale SARIF", () => {
  for (const status of ["", "error"]) {
    const result = runReport(sarif([]), status);
    assert.equal(result.status, 1);
    assert.match(result.report, /\*\*NOT RUN\*\*/);
    assert.match(result.output, /valid=false/);
  }
});

test("the workflow uses the report validity gate and the project toolchain", () => {
  const workflow = fs.readFileSync(
    path.join(root, ".github/workflows/threatcrush-scan.yml"),
    "utf8",
  );
  assert.match(workflow, /git diff --name-only -z/);
  assert.match(workflow, /scripts\/threatcrush-report\.mjs/);
  assert.match(workflow, /steps\.report\.outputs\.valid == 'true'/);
  assert.match(workflow, /pnpm .*add --ignore-scripts/);
  assert.doesNotMatch(
    workflow,
    /\bnpm (pack|install)\b|\bpython3\b|^\s+pull_request_target:/m,
  );
  const entry = JSON.parse(
    fs.readFileSync(path.join(root, "package.json"), "utf8"),
  );
  assert.match(
    entry.scripts["test:ci-config"],
    /scripts\/threatcrush-report\.test\.mjs/,
  );
});
