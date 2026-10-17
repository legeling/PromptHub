import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { executeChecks } from "../execute.mts";
import { createJsonReport } from "../report.mts";
import type { VerificationCheck } from "../types.mts";

function nodeCheck(
  id: string,
  source: string,
  overrides: Partial<VerificationCheck> = {},
): VerificationCheck {
  return {
    id,
    label: id,
    surfaces: ["shared"],
    layers: ["unit"],
    profiles: ["quick"],
    command: { executable: process.execPath, args: ["-e", source] },
    timeoutMs: 2_000,
    ...overrides,
  };
}

test("executor respects dependencies, concurrency, and serial resource groups", async () => {
  const checks = [
    nodeCheck("serial-a", "setTimeout(() => {}, 80)", {
      resourceGroup: "sqlite-global",
    }),
    nodeCheck("serial-b", "setTimeout(() => {}, 80)", {
      resourceGroup: "sqlite-global",
    }),
    nodeCheck("parallel", "setTimeout(() => {}, 80)"),
    nodeCheck("dependent", "", { dependsOn: ["serial-a"] }),
  ];

  const summary = await executeChecks(checks, {
    concurrency: 2,
    quiet: true,
    terminationGraceMs: 50,
  });

  assert.equal(summary.exitCode, 0);
  assert.equal(summary.maxConcurrency, 2);
  const result = new Map(summary.results.map((item) => [item.id, item]));
  assert.ok(
    result.get("serial-b")!.startedAt >= result.get("serial-a")!.endedAt,
  );
  assert.ok(
    result.get("dependent")!.startedAt >= result.get("serial-a")!.endedAt,
  );
});

test("executor blocks dependants after failure", async () => {
  const summary = await executeChecks(
    [
      nodeCheck("failed", "process.exit(7)"),
      nodeCheck("blocked", "", { dependsOn: ["failed"] }),
    ],
    { concurrency: 2, quiet: true, terminationGraceMs: 50 },
  );

  assert.equal(summary.exitCode, 1);
  assert.equal(
    summary.results.find((item) => item.id === "failed")?.status,
    "failed",
  );
  assert.equal(
    summary.results.find((item) => item.id === "blocked")?.status,
    "blocked",
  );
});

test("executor applies bounded command environment overrides", async () => {
  const summary = await executeChecks(
    [
      nodeCheck(
        "environment",
        'process.exit(process.env.PROMPTHUB_GATE_VALUE === "expected" ? 0 : 7)',
        {
          command: {
            executable: process.execPath,
            args: [
              "-e",
              'process.exit(process.env.PROMPTHUB_GATE_VALUE === "expected" ? 0 : 7)',
            ],
            environment: { PROMPTHUB_GATE_VALUE: "expected" },
          },
        },
      ),
    ],
    { concurrency: 1, quiet: true },
  );

  assert.equal(summary.exitCode, 0);
});

test("timeout terminates the task-owned process group", async () => {
  const root = mkdtempSync(
    path.join(os.tmpdir(), "prompthub-harness-timeout-"),
  );
  const marker = path.join(root, "orphan.txt");
  const childSource = `setTimeout(() => require("node:fs").writeFileSync(${JSON.stringify(
    marker,
  )}, "orphan"), 2000)`;
  const parentSource = [
    `require("node:child_process").spawn(process.execPath, ["-e", ${JSON.stringify(
      childSource,
    )}], { stdio: "ignore" });`,
    "setInterval(() => {}, 1000);",
  ].join("");

  try {
    const summary = await executeChecks(
      [
        nodeCheck("timeout", parentSource, {
          timeoutMs: 50,
        }),
      ],
      { concurrency: 1, quiet: true, terminationGraceMs: 25 },
    );
    assert.equal(summary.results[0]?.status, "timed_out");
    // Allow Windows taskkill to enumerate the tree before the orphan deadline.
    await new Promise((resolve) => setTimeout(resolve, 2200));
    assert.equal(existsSync(marker), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("timeout closes inherited worker pipes without waiting for the worker", async () => {
  const childSource = 'console.log("worker-ready"); setTimeout(() => {}, 4000)';
  const parentSource = [
    `require("node:child_process").spawn(process.execPath, ["-e", ${JSON.stringify(childSource)}], { stdio: "inherit" });`,
    "setInterval(() => {}, 1000);",
  ].join("");
  const summary = await executeChecks(
    [nodeCheck("worker-pipes", parentSource, { timeoutMs: 1000 })],
    { concurrency: 1, quiet: true, terminationGraceMs: 25 },
  );
  const result = summary.results[0];
  assert.equal(result?.status, "timed_out");
  assert.match(result.outputTail ?? "", /worker-ready/);
  assert.ok(result.durationMs < 3000, "Worker pipes must not retain the check");
});

test("failed parents cannot leave task-owned workers running", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "prompthub-harness-failed-"));
  const marker = path.join(root, "orphan.txt");
  const childSource = `setTimeout(() => require("node:fs").writeFileSync(${JSON.stringify(
    marker,
  )}, "orphan"), 250)`;
  const parentSource = [
    `require("node:child_process").spawn(process.execPath, ["-e", ${JSON.stringify(
      childSource,
    )}], { stdio: "ignore" });`,
    "process.exit(7);",
  ].join("");

  try {
    const summary = await executeChecks(
      [nodeCheck("failed-parent", parentSource)],
      { concurrency: 1, quiet: true, terminationGraceMs: 25 },
    );
    assert.equal(summary.results[0]?.status, "failed");
    await new Promise((resolve) => setTimeout(resolve, 350));
    assert.equal(existsSync(marker), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("interruption cancels running and pending checks without scheduling more", async () => {
  const controller = new AbortController();
  const execution = executeChecks(
    [
      nodeCheck("running", "setInterval(() => {}, 1000)"),
      nodeCheck("pending", ""),
    ],
    {
      concurrency: 1,
      quiet: true,
      signal: controller.signal,
      terminationGraceMs: 25,
    },
  );
  setTimeout(() => controller.abort(), 40);

  const summary = await execution;
  assert.equal(summary.exitCode, 1);
  assert.equal(summary.results[0]?.status, "cancelled");
  assert.equal(summary.results[1]?.status, "cancelled");
});

test("JSON report is deterministic, bounded, and redacts secrets", async () => {
  const summary = await executeChecks(
    [
      nodeCheck(
        "secret",
        'process.stderr.write("TOKEN=super-secret-value\\n" + "x".repeat(5000)); process.exit(1)',
      ),
    ],
    {
      concurrency: 1,
      quiet: true,
      maxOutputBytes: 1_024,
      terminationGraceMs: 25,
    },
  );
  if (summary.results[0]) {
    summary.results[0].command.environment = {
      API_KEY: "environment-secret-value",
      CI: "true",
    };
  }
  const report = createJsonReport("quick", ["shared"], summary);
  const serialized = JSON.stringify(report);

  assert.equal(serialized.includes("super-secret-value"), false);
  assert.equal(serialized.includes("environment-secret-value"), false);
  assert.equal(report.results[0]?.command.environment?.API_KEY, "[REDACTED]");
  assert.equal(report.results[0]?.command.environment?.CI, "true");
  assert.ok(serialized.length < 4_000);
});
