import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";

const repository = fileURLToPath(new URL("../../../../", import.meta.url));
const revision = process.argv[2];
if (!revision || !/^[a-f0-9]{7,40}$/i.test(revision))
  throw new Error("Pass the pre-fix commit SHA as the first argument");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "issues-237-238-red-"));
const desktop = path.join(root, "apps/desktop");
const timeoutMs = 120_000;
const outputBytes = 2 * 1024 * 1024;
const vitestEntry = fs.realpathSync(
  path.join(repository, "apps/desktop/node_modules/vitest/vitest.mjs"),
);

function copy(relativePath: string): void {
  const destination = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(path.join(repository, relativePath), destination, {
    recursive: true,
  });
}

function prepareCopy(): void {
  for (const file of [
    "package.json",
    "apps/desktop/package.json",
    "apps/desktop/tsconfig.json",
    "apps/desktop/vitest.config.ts",
    "apps/desktop/vitest.workspace.ts",
  ])
    copy(file);
  for (const directory of [
    "apps/desktop/src",
    "apps/desktop/tests",
    "packages/core/src",
    "packages/core/tests/helpers",
    "packages/db/src",
    "packages/shared/types",
    "packages/shared/constants",
    "packages/shared/utils",
  ])
    copy(directory);
  for (const name of ["core", "db", "shared"])
    copy(`packages/${name}/package.json`);
  for (const directory of [
    "",
    "apps/desktop",
    "packages/core",
    "packages/db",
    "packages/shared",
  ])
    fs.symlinkSync(
      path.join(repository, directory, "node_modules"),
      path.join(root, directory, "node_modules"),
      "dir",
    );
  // Restore only the four owning implementations, never the working checkout.
  for (const file of [
    "src/main/ipc/plugin.ipc.ts",
    "src/renderer/components/plugin/usePluginManagerBindings.ts",
    "src/renderer/components/skill/SkillStore.tsx",
    "src/renderer/components/skill/store-remote-sync.ts",
  ])
    fs.writeFileSync(
      path.join(desktop, file),
      execFileSync("git", ["show", `${revision}:apps/desktop/${file}`], {
        cwd: repository,
        maxBuffer: outputBytes,
      }),
    );
}

interface TestResult {
  numFailedTests: number;
  testResults: Array<{
    assertionResults: Array<{
      fullName: string;
      status: string;
      failureMessages: string[];
    }>;
  }>;
}

function assertRed(
  project: string,
  files: string[],
  expectedFailures: number,
): void {
  const reportPath = path.join(root, `${project}.json`);
  const result = spawnSync(
    "pnpm",
    [
      "exec",
      "node",
      vitestEntry,
      "run",
      "--project",
      project,
      "--minWorkers=1",
      "--maxWorkers=1",
      "--reporter=json",
      `--outputFile=${reportPath}`,
      "-t",
      "\\(#23[78]\\)",
      ...files,
    ],
    {
      cwd: desktop,
      encoding: "utf8",
      timeout: timeoutMs,
      maxBuffer: outputBytes,
      env: { ...process.env, DEBUG_PRINT_LIMIT: "500", NO_COLOR: "1" },
    },
  );
  if (result.error) throw result.error;
  if (!fs.existsSync(reportPath))
    throw new Error(result.stdout + result.stderr);
  const report: TestResult = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  const failed = report.testResults
    .flatMap((suite) => suite.assertionResults)
    .filter((test) => test.status === "failed");
  if (
    result.status !== 1 ||
    report.numFailedTests !== expectedFailures ||
    failed.some(
      (test) =>
        !test.failureMessages.some((message) =>
          /AssertionError|expect\(element\)/.test(message),
        ),
    )
  )
    throw new Error(
      `Expected business assertion failures: ${JSON.stringify(report)}`,
    );
  console.log(
    JSON.stringify({
      project,
      revision,
      exitCode: result.status,
      failed: failed.map((test) => ({
        name: test.fullName,
        assertion: test.failureMessages[0].slice(0, 350),
      })),
    }),
  );
}

try {
  prepareCopy();
  assertRed(
    "unit",
    [
      "tests/unit/components/plugin-manager-distribution.test.tsx",
      "tests/unit/components/skill-store-remote-skills-sh.test.tsx",
      "tests/unit/main/plugin-antigravity.test.ts",
    ],
    5,
  );
  assertRed(
    "integration",
    ["tests/integration/antigravity-plugin-entrypoints.test.ts"],
    1,
  );
} finally {
  fs.rmSync(root, { recursive: true, force: true });
  console.log("Isolated source copy and reports removed.");
}
