import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";

const repository = fileURLToPath(new URL("../../../../", import.meta.url));
const revision = process.argv[2];
if (!revision || !/^[a-f0-9]{7,40}$/i.test(revision))
  throw new Error("Pass the pre-fix commit SHA as the first argument");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "issue-220-red-repro-"));
const timeoutMs = 90_000;
const outputBytes = 262_144;
const vitestEntry = fs.realpathSync(
  path.join(repository, "apps/desktop/node_modules/vitest/vitest.mjs"),
);

function assertRed(
  label: string,
  expectedAssertion: (output: string) => boolean,
): void {
  const result = spawnSync(
    "pnpm",
    [
      "exec",
      "node",
      vitestEntry,
      "run",
      "--config",
      "vitest.config.mts",
      "-t",
      "imports remote native config",
    ],
    { cwd: root, encoding: "utf8", timeout: timeoutMs, maxBuffer: outputBytes },
  );
  if (result.error) throw result.error;
  const output = result.stdout + "\n" + result.stderr;
  if (result.status !== 1 || !expectedAssertion(output))
    throw new Error(
      `${label} did not hit the expected business assertion:\n${output}`,
    );
  console.log(
    JSON.stringify({ label, revision, exitCode: result.status, output }),
  );
}

try {
  console.log(`Isolated source root: ${root}`);
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({
      name: "issue-220-isolated-reproduction",
      private: true,
      type: "module",
    }),
  );
  fs.symlinkSync(
    path.join(repository, "apps/desktop/node_modules"),
    path.join(root, "node_modules"),
    "dir",
  );
  for (const name of ["core", "db", "shared"]) {
    const source = path.join(repository, "packages", name);
    const destination = path.join(root, "packages", name);
    fs.mkdirSync(destination, { recursive: true });
    fs.copyFileSync(
      path.join(source, "package.json"),
      path.join(destination, "package.json"),
    );
    const directories =
      name === "shared" ? ["types", "constants", "utils"] : ["src"];
    for (const directory of directories)
      fs.cpSync(
        path.join(source, directory),
        path.join(destination, directory),
        { recursive: true },
      );
    fs.symlinkSync(
      path.join(source, "node_modules"),
      path.join(destination, "node_modules"),
      "dir",
    );
  }
  fs.mkdirSync(path.join(root, "tests"));
  fs.copyFileSync(
    path.join(
      repository,
      "apps/desktop/tests/unit/main/mcp-antigravity.test.ts",
    ),
    path.join(root, "tests/mcp-antigravity.test.ts"),
  );
  const config = {
    test: {
      environment: "node",
      include: ["tests/mcp-antigravity.test.ts"],
      minWorkers: 1,
      maxWorkers: 1,
      testTimeout: 30_000,
    },
    resolve: {
      alias: {
        "@prompthub/core": path.join(root, "packages/core/src"),
        "@prompthub/shared": path.join(root, "packages/shared"),
        "@prompthub/db": path.join(root, "packages/db/src"),
      },
    },
  };
  fs.writeFileSync(
    path.join(root, "vitest.config.mts"),
    `import {defineConfig} from "vitest/config";\nexport default defineConfig(${JSON.stringify(config)});\n`,
  );
  const importer = path.join(root, "packages/core/src/mcp-import.ts");
  const currentImporter = fs.readFileSync(importer, "utf8");
  fs.writeFileSync(
    importer,
    execFileSync(
      "git",
      ["show", `${revision}:packages/core/src/mcp-import.ts`],
      { cwd: repository, encoding: "utf8", maxBuffer: outputBytes },
    ),
  );
  assertRed(
    "Pre-fix importer loses serverUrl in file/paste intake",
    (output) =>
      output.includes("2 failed") && output.includes("to have a length of 1"),
  );
  fs.writeFileSync(importer, currentImporter);

  const projection = path.join(root, "packages/shared/utils/mcp-config.ts");
  const source = fs.readFileSync(projection, "utf8");
  const start = source.indexOf("function toAntigravityMcpEntry(");
  const end = source.indexOf("export function getMcpTargetEntryObject(", start);
  const segment = source.slice(start, end);
  const returnStart = segment.indexOf("  return stripUndefined({");
  const returnEnd = segment.indexOf("\n}", returnStart);
  if (start < 0 || end < 0 || returnStart < 0 || returnEnd < 0)
    throw new Error(
      "Native projection boundary changed; review reproduction first",
    );
  // Restore the prior projection behavior in the copy only: transport without native options.
  const changed =
    segment.slice(0, returnStart) +
    "  return transport;" +
    segment.slice(returnEnd);
  fs.writeFileSync(
    projection,
    source.slice(0, start) + changed + source.slice(end),
  );
  assertRed(
    "Legacy projection loses authentication/OAuth/tool fields",
    (output) =>
      output.includes("2 failed") &&
      output.includes("authProviderType") &&
      output.includes("disabledTools") &&
      output.includes("to deeply equal"),
  );
} finally {
  fs.rmSync(root, { recursive: true, force: true });
  console.log("Isolated source root removed.");
}
