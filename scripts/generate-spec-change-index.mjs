import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_ROOT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function parseArguments(args) {
  const options = { check: false, rootDir: DEFAULT_ROOT_DIR };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--check") {
      options.check = true;
      continue;
    }
    if (argument === "--root") {
      const rootValue = args[index + 1];
      if (!rootValue || rootValue.startsWith("--")) {
        throw new Error("--root requires a directory path");
      }
      options.rootDir = path.resolve(rootValue);
      index += 1;
      continue;
    }
    throw new Error(`unknown argument: ${argument}`);
  }
  return options;
}

const options = parseArguments(process.argv.slice(2));
const ROOT_DIR = options.rootDir;
const CHANGES_DIR = path.join(ROOT_DIR, "spec", "changes");
const OUTPUT_PATH = path.join(CHANGES_DIR, "index.md");
const TERMINAL_STATUSES = new Set(["completed", "shipped", "superseded"]);
const PRODUCTS = [
  "Shared",
  "Desktop",
  "CLI",
  "Web",
  "Cloudflare",
  "Mobile",
  "Delivery",
];

function listDirectories(directoryPath) {
  if (!fs.existsSync(directoryPath)) return [];
  return fs
    .readdirSync(directoryPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

function toRepoPath(absolutePath) {
  return path.relative(ROOT_DIR, absolutePath).split(path.sep).join("/");
}

function readRecordField(changePath, field) {
  for (const name of ["plan.md", "tasks.md", "implementation.md"]) {
    const file = path.join(changePath, name);
    if (!fs.existsSync(file)) continue;
    const value = fs
      .readFileSync(file, "utf8")
      .match(new RegExp(`^## ${field}\\s*\\n+\\s*([^\\n]+)`, "im"))?.[1];
    if (value) return value.trim();
  }
}

function readActiveStatus(changePath) {
  const statusLine = readRecordField(changePath, "Status");
  if (!statusLine) return "active";
  if (
    /\b(?:not|never)\s+(?:implemented|completed|shipped)\b/i.test(statusLine) ||
    /\bunimplemented\b/i.test(statusLine)
  ) {
    return "active";
  }
  const knownStatus = statusLine.match(
    /\b(blocked|superseded|needs-convergence|review-pending|release-pending|in progress|implemented|completed|shipped|active)\b/i,
  );
  return knownStatus?.[1].toLowerCase() || "active";
}

function collectChanges(state) {
  const directory = path.join(CHANGES_DIR, state);
  return listDirectories(directory).map((name) => {
    const changePath = path.join(directory, name);
    const status = readActiveStatus(changePath);
    if (TERMINAL_STATUSES.has(status) !== (state === "completed")) {
      throw new Error(
        `${toRepoPath(changePath)}: ${status} does not belong in ${state}; move the record and update references`,
      );
    }
    const product = readRecordField(changePath, "Product");
    if (product && !PRODUCTS.includes(product)) {
      throw new Error(
        `Unknown product ${product} in ${toRepoPath(changePath)}`,
      );
    }
    return {
      name,
      path: toRepoPath(changePath),
      status,
      product: product || "Unclassified",
    };
  });
}

function collectArchivedChanges() {
  const archiveDir = path.join(CHANGES_DIR, "archive");
  const records = [];
  for (const year of listDirectories(archiveDir)) {
    const yearPath = path.join(archiveDir, year);
    for (const month of listDirectories(yearPath)) {
      const monthPath = path.join(yearPath, month);
      for (const name of listDirectories(monthPath)) {
        records.push({ name, path: toRepoPath(path.join(monthPath, name)) });
      }
    }
  }
  return records.sort((left, right) => left.path.localeCompare(right.path));
}

function collectLegacyChanges() {
  const legacyDir = path.join(CHANGES_DIR, "legacy");
  return listDirectories(legacyDir).map((name) => ({
    name,
    path: toRepoPath(path.join(legacyDir, name)),
  }));
}

function renderRows(records, status) {
  return records
    .map(
      (record) =>
        `| \`${record.name}\` | ${record.status || status} | [${record.path}/](${path.posix.relative("spec/changes", record.path)}/) |`,
    )
    .join("\n");
}

function renderActiveGroups(records) {
  return [...PRODUCTS, "Unclassified"]
    .map((product) => {
      const group = records.filter((record) => record.product === product);
      if (!group.length) {
        return product === "Unclassified"
          ? ""
          : `### ${product}\n\nNo independent active change. Cross-product work is listed under Shared.`;
      }
      return `### ${product}\n\n| Change | Recorded status | Path |\n| --- | --- | --- |\n${renderRows(group, "active")}`;
    })
    .filter(Boolean)
    .join("\n\n");
}

function renderIndex() {
  const active = collectChanges("active");
  const complete = collectChanges("completed");
  const archived = collectArchivedChanges();
  const legacy = collectLegacyChanges();
  return `# PromptHub Change Inventory

Generated by \`node scripts/generate-spec-change-index.mjs\`. Do not edit this
file manually. Run the generator after adding, moving, or archiving a change.

## Summary

| State | Count |
| --- | ---: |
| Active | ${active.length} |
| Completed | ${complete.length} |
| Archived | ${archived.length} |
| Legacy | ${legacy.length} |

## Active

${renderActiveGroups(active)}

## Completed

Completed implementation records live in completed/ and are historical evidence.
Their product requirements belong in the current topic linked from each record.
Completion is scoped; it does not itself establish publication.

| Change | Recorded status | Path |
| --- | --- | --- |
${renderRows(complete, "completed")}

## Archived

<details>
<summary>Historical changes (${archived.length}); expand only for traceability</summary>

| Change | Recorded status | Path |
| --- | --- | --- |
${renderRows(archived, "archived")}

</details>

## Legacy

| Change | Recorded status | Path |
| --- | --- | --- |
${renderRows(legacy, "legacy")}
`;
}

const expected = renderIndex();
if (options.check) {
  const actual = fs.existsSync(OUTPUT_PATH)
    ? fs.readFileSync(OUTPUT_PATH, "utf8")
    : "";
  if (actual !== expected) {
    console.error("spec/changes/index.md is stale; run pnpm spec:index");
    process.exit(1);
  }
} else {
  fs.writeFileSync(OUTPUT_PATH, expected, "utf8");
  console.log(`Wrote ${toRepoPath(OUTPUT_PATH)}`);
}
