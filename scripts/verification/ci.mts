import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { ciGroups, groupChecks, mergeCiReports } from "./ci-plan.mts";
import { executeChecks } from "./execute.mts";
import { createJsonReport, printSummary } from "./report.mts";

async function writeReport(file: string, report: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(report, null, 2)}\n`);
}

async function run(): Promise<void> {
  const [mode, argument, output] = process.argv.slice(2);
  if (mode === "matrix" && !argument) {
    console.log(JSON.stringify({ group: ciGroups() }));
    return;
  }
  const commit = process.env.GITHUB_SHA;
  const runId = process.env.GITHUB_RUN_ID;
  if (!commit || !runId || !argument || !output)
    throw new Error(
      "Expected group <name> <report> or merge <directory> <report>, with GITHUB_SHA and GITHUB_RUN_ID",
    );
  if (mode === "merge") {
    const files = (await readdir(argument)).filter((file) =>
      file.endsWith(".json"),
    );
    const reports: unknown[] = await Promise.all(
      files.map(async (file) =>
        JSON.parse(await readFile(path.join(argument, file), "utf8")),
      ),
    );
    const report = mergeCiReports(reports, commit, runId);
    await writeReport(output, report);
    console.log(
      `Verified ${report.results.length} release checks across ${ciGroups().length} groups.`,
    );
    return;
  }
  if (mode !== "group")
    throw new Error(`Unknown CI verification mode: ${mode}`);
  await runGroup(argument, output, commit, runId);
}

async function runGroup(
  argument: string,
  output: string,
  commit: string,
  runId: string,
): Promise<void> {
  const checks = groupChecks(argument);
  const controller = new AbortController();
  const interrupt = (): void => controller.abort();
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);
  try {
    const summary = await executeChecks(checks, {
      concurrency: 1,
      signal: controller.signal,
    });
    const report = createJsonReport(
      "release",
      [...new Set(checks.flatMap((check) => check.surfaces))],
      summary,
    );
    await writeReport(output, { ...report, group: argument, commit, runId });
    printSummary(summary);
    process.exitCode = summary.exitCode;
  } finally {
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", interrupt);
  }
}

run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
