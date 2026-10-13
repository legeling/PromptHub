import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const labels = { error: "HIGH", warning: "MEDIUM", note: "LOW", none: "INFO" };
const ranks = { error: 0, warning: 1, note: 2, none: 3 };
export const THREATCRUSH_REPORT_LIMITS = { current: 50, backlog: 20 };
const heading = "## ThreatCrush Security Scan\n\n";
const failedReport = `${heading}**NOT RUN** — the scan did not complete, so this diff was not examined.\nThis is not a clean result. See the job log.\n`;

function location(result) {
  if (result.locations === undefined) return { uri: "", line: 1 };
  if (!Array.isArray(result.locations))
    throw new Error("SARIF locations must be an array");
  const physical = result.locations[0]?.physicalLocation;
  if (!physical) return { uri: "", line: 1 };
  const uri = physical.artifactLocation?.uri ?? "";
  const line = physical.region?.startLine ?? 1;
  if (typeof uri !== "string" || !Number.isInteger(line) || line < 1) {
    throw new Error(
      "SARIF location must have a URI and a positive line number",
    );
  }
  try {
    return { uri: decodeURIComponent(uri), line };
  } catch {
    throw new Error("SARIF location contains invalid URI encoding");
  }
}

function readFindings(sarif) {
  if (
    sarif?.version !== "2.1.0" ||
    !Array.isArray(sarif.runs) ||
    sarif.runs.length !== 1 ||
    !Array.isArray(sarif.runs[0]?.results)
  ) {
    throw new Error(
      "SARIF must be version 2.1.0 with one scan run and a results array",
    );
  }
  const driver = sarif.runs[0].tool?.driver;
  if (driver?.name !== "ThreatCrush" || typeof driver.version !== "string") {
    throw new Error(
      "SARIF must identify the ThreatCrush scanner and its version",
    );
  }
  return sarif.runs[0].results
    .map((result) => {
      const level = result?.level ?? "warning";
      if (
        typeof result?.ruleId !== "string" ||
        typeof result?.message?.text !== "string" ||
        typeof level !== "string" ||
        !Object.hasOwn(labels, level)
      ) {
        throw new Error(
          "SARIF findings must contain a rule ID, text message and valid severity",
        );
      }
      return { ruleId: result.ruleId, level, ...location(result) };
    })
    .sort(
      (left, right) =>
        ranks[left.level] - ranks[right.level] ||
        left.uri.localeCompare(right.uri) ||
        left.line - right.line,
    );
}

function escapeMarkdown(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("|", "&#124;")
    .replaceAll("`", "&#96;")
    .replace(/[\r\n]/g, " ");
}

function table(rows, limit) {
  if (!rows.length) return "";
  const counts = new Map();
  for (const row of rows)
    counts.set(row.level, (counts.get(row.level) ?? 0) + 1);
  const lines = [
    Object.entries(labels)
      .filter(([level]) => counts.has(level))
      .map(([level, label]) => `**${label}**: ${counts.get(level)}`)
      .join(" | "),
    "",
    "| Severity | Rule | Location |",
    "|---|---|---|",
  ];
  for (const row of rows.slice(0, limit)) {
    const where = row.uri
      ? `\`${escapeMarkdown(row.uri)}\`:${row.line}`
      : "_(no location)_";
    lines.push(
      `| ${labels[row.level]} | \`${escapeMarkdown(row.ruleId)}\` | ${where} |`,
    );
  }
  if (rows.length > limit)
    lines.push(
      "",
      `_…and ${rows.length - limit} more; the full set is in the SARIF artifact._`,
    );
  return `${lines.join("\n")}\n`;
}

/** Build the report from the pinned scanner's SARIF and Git's raw -z inventory. */
export function createThreatCrushReport(sarif, changedInventory, scoped) {
  const results = readFindings(sarif);
  if (scoped && changedInventory.length && changedInventory.at(-1) !== 0) {
    throw new Error("Changed-file inventory must be NUL-delimited Git output");
  }
  if (!results.length) return `${heading}No findings.\n`;
  if (!scoped)
    return `${heading}**${results.length}** finding(s)\n\n${table(results, THREATCRUSH_REPORT_LIMITS.current)}`;
  const changed = new Set(
    changedInventory.toString("utf8").split("\0").filter(Boolean),
  );
  const current = [],
    backlog = [],
    unlocated = [];
  for (const row of results) {
    if (!row.uri) unlocated.push(row);
    else if (changed.has(row.uri)) current.push(row);
    else backlog.push(row);
  }
  let report = `${heading}**${current.length}** finding(s) in the ${changed.size} file(s) this pull request changes.\n\n`;
  report += current.length
    ? table(current, THREATCRUSH_REPORT_LIMITS.current)
    : "Nothing in the files this pull request changes.\n";
  if (unlocated.length)
    report += `\n**${unlocated.length}** finding(s) without a file location; not attributed to the pre-existing backlog.\n\n${table(unlocated, THREATCRUSH_REPORT_LIMITS.current)}`;
  if (backlog.length)
    report += `\n<details>\n<summary>${backlog.length} pre-existing finding(s) elsewhere in the repository</summary>\n\nNot introduced by this pull request.\n\n${table(backlog, THREATCRUSH_REPORT_LIMITS.backlog)}\n</details>\n`;
  return report;
}

function writeReport(reportPath, report, valid) {
  fs.writeFileSync(reportPath, report);
  if (process.env.GITHUB_STEP_SUMMARY)
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
  if (process.env.GITHUB_OUTPUT)
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `valid=${valid}\n`);
}

function runCli() {
  const [sarifPath, changedPath, reportPath] = process.argv.slice(2);
  if (!sarifPath || !changedPath || !reportPath)
    throw new Error("Expected SARIF, changed-file inventory and report paths");
  let report = failedReport;
  let valid = false;
  try {
    if (!["clean", "findings"].includes(process.env.SCAN_STATUS))
      throw new Error("Scanner did not complete");
    const scoped = process.env.SCAN_SCOPED === "true";
    report = createThreatCrushReport(
      JSON.parse(fs.readFileSync(sarifPath, "utf8")),
      scoped ? fs.readFileSync(changedPath) : Buffer.alloc(0),
      scoped,
    );
    valid = true;
  } catch (error) {
    // No scanner payload or matched credential material is copied into logs.
    const reason =
      error instanceof SyntaxError
        ? "Invalid SARIF JSON"
        : (error.code ?? error.message);
    console.error(`::error::ThreatCrush report failed: ${reason}`);
  }
  writeReport(reportPath, report, valid);
  process.exitCode = valid ? 0 : 1;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    runCli();
  } catch (error) {
    console.error(
      `::error::ThreatCrush report could not be written: ${error.code ?? error.name}`,
    );
    process.exitCode = 1;
  }
}
