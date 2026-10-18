import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { VERIFICATION_CHECKS } from "../checks.mts";
import { ciGroups, groupChecks, mergeCiReports } from "../ci-plan.mts";
import { createJsonReport } from "../report.mts";

function reports() {
  return ciGroups().map((group) => ({
    ...createJsonReport("release", [], {
      exitCode: 0,
      startedAt: 100,
      endedAt: 200,
      durationMs: 100,
      maxConcurrency: 1,
      results: groupChecks(group).map((check) => ({
        id: check.id,
        label: check.label,
        command: check.command,
        status: "passed",
        exitCode: 0,
        startedAt: 100,
        endedAt: 200,
        durationMs: 100,
      })),
    }),
    group,
    commit: "candidate-sha",
    runId: "42",
  }));
}

test("CI partitions the entire release registry exactly once without changing commands", () => {
  const expected = VERIFICATION_CHECKS.filter((check) =>
    check.profiles.includes("release"),
  );
  const actual = ciGroups().flatMap(groupChecks);
  assert.deepEqual(
    actual.map((check) => check.id).sort(),
    expected.map((check) => check.id).sort(),
  );
  for (const check of actual) {
    assert.deepEqual(
      check.command,
      expected.find((entry) => entry.id === check.id)?.command,
    );
    assert.equal(
      check.timeoutMs,
      expected.find((entry) => entry.id === check.id)?.timeoutMs,
    );
  }
  assert.equal(
    ciGroups().filter((group) => group.startsWith("desktop-unit-")).length,
    8,
  );
  assert.throws(() => groupChecks("typo"), /Unknown/);
});

test("CI keeps artifact dependencies inside their runner and leaves local baseline ordering intact", () => {
  for (const group of ciGroups()) {
    const checks = groupChecks(group);
    for (const check of checks) {
      assert.ok(
        check.dependsOn?.every((id) => checks.some((entry) => entry.id === id)),
      );
    }
  }
  assert.deepEqual(
    VERIFICATION_CHECKS.find((check) => check.id === "desktop-unit-1")
      ?.dependsOn,
    ["desktop-integration"],
  );
  assert.deepEqual(
    groupChecks("desktop-runtime").find(
      (check) => check.id === "desktop-e2e-smoke",
    )?.dependsOn,
    ["desktop-build"],
  );
});

test("complete successful reports merge with the full inventory", () => {
  const merged = mergeCiReports(reports(), "candidate-sha", "42");
  assert.equal(merged.status, "passed");
  assert.equal(
    merged.results.length,
    VERIFICATION_CHECKS.filter((check) => check.profiles.includes("release"))
      .length,
  );
});

test("the real CLI emits the matrix, merges disk reports and fails closed for incomplete evidence", () => {
  const root = mkdtempSync(path.join(tmpdir(), "prompthub-ci-plan-"));
  const cli = new URL("../ci.mts", import.meta.url);
  const invoke = (...args: string[]) =>
    spawnSync(
      process.execPath,
      ["--experimental-strip-types", fileURLToPath(cli), ...args],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          GITHUB_SHA: "candidate-sha",
          GITHUB_RUN_ID: "42",
        },
      },
    );
  try {
    const matrix = invoke("matrix");
    assert.equal(matrix.status, 0, matrix.stderr);
    assert.deepEqual(JSON.parse(matrix.stdout), { group: ciGroups() });
    const directory = path.join(root, "reports");
    mkdirSync(directory);
    for (const report of reports())
      writeFileSync(
        path.join(directory, `${report.group}.json`),
        JSON.stringify(report),
      );
    const output = path.join(root, "combined.json");
    const merged = invoke("merge", directory, output);
    assert.equal(merged.status, 0, merged.stderr);
    assert.equal(JSON.parse(readFileSync(output, "utf8")).status, "passed");
    rmSync(path.join(directory, `${ciGroups()[0]}.json`));
    assert.equal(invoke("merge", directory, output).status, 1);
    writeFileSync(path.join(directory, "bad.json"), "invalid json");
    assert.equal(invoke("merge", directory, output).status, 1);
    assert.equal(invoke("group", "unknown", output).status, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

for (const failure of [
  "failed",
  "timed_out",
  "cancelled",
  "blocked",
  "skipped",
]) {
  test(`merge rejects ${failure} even when the group says passed`, () => {
    const input = reports();
    const malformed = JSON.parse(JSON.stringify(input));
    malformed[0].results[0].status = failure;
    assert.throws(() => mergeCiReports(malformed, "candidate-sha", "42"));
  });
}

test("merge rejects missing, duplicate, foreign, stale and malformed evidence", () => {
  const input = reports();
  assert.throws(() => mergeCiReports(input.slice(1), "candidate-sha", "42"));
  assert.throws(() =>
    mergeCiReports([...input, input[0]], "candidate-sha", "42"),
  );
  assert.throws(() => mergeCiReports(input, "different-sha", "42"));
  assert.throws(() => mergeCiReports(input, "candidate-sha", "43"));
  for (const change of [
    { group: "unknown" },
    { results: [] },
    { status: "failed" },
    { results: [...input[0]!.results, input[0]!.results[0]] },
    { results: [{ ...input[0]!.results[0], id: "invented" }] },
    { results: [{ ...input[0]!.results[0], exitCode: 1 }] },
  ]) {
    assert.throws(() =>
      mergeCiReports(
        [{ ...input[0], ...change }, ...input.slice(1)],
        "candidate-sha",
        "42",
      ),
    );
  }
  assert.throws(() => mergeCiReports([null], "candidate-sha", "42"));
});

test("release waits for verification and builds, while builds start independently", () => {
  const workflow = readFileSync(
    new URL("../../../.github/workflows/release.yml", import.meta.url),
    "utf8",
  ).replaceAll("\r\n", "\n");
  const build = workflow.split("\n  build:\n")[1]?.split("\n  release:\n")[0];
  assert.ok(build);
  assert.doesNotMatch(build, /needs: verify/);
  assert.match(workflow, /release:\s+needs: \[verify, build\]/);
  assert.match(workflow, /verify:\s+needs: \[verify-plan, verify-group\]/);
  assert.match(workflow, /fail-fast: false/);
  assert.match(workflow, /pattern: \*\*-build|pattern: "\*-build"/);
});
