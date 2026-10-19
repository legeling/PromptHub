import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import {
  createSkillTestRuntime,
  type SkillTestRuntime,
} from "./helpers/skill-runtime";
import { closeDatabase } from "../../src/main/database";
import {
  bootstrapRuleWorkspace,
  readRuleContent,
  saveRuleContent,
  scanRuleDescriptors,
} from "../../src/main/services/rules-workspace";

// The runtime substitutes Electron transport and HOME, not storage or startup.
let runtime: SkillTestRuntime | undefined;

beforeEach(async () => {
  runtime = await createSkillTestRuntime();
});

afterEach(() => {
  runtime?.dispose();
  runtime = undefined;
});

it("preserves external Claude edits through close, startup, scan and read (#209)", async () => {
  if (!runtime) throw new Error("Rules test runtime was not initialized");
  const target = path.join(runtime.platformRoot("claude"), "CLAUDE.md");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, "# Initial external\n");
  await bootstrapRuleWorkspace();
  await scanRuleDescriptors();
  await saveRuleContent("claude-global", "# Managed saved\n");
  expect(fs.readFileSync(target, "utf8")).toBe("# Managed saved\n");

  closeDatabase();
  fs.writeFileSync(target, "# Edited with external editor\n");
  await runtime.reopen();
  await bootstrapRuleWorkspace();
  await scanRuleDescriptors();
  const rule = await readRuleContent("claude-global");
  expect(rule).toMatchObject({
    content: "# Managed saved\n",
    targetContent: "# Edited with external editor\n",
    syncStatus: "out-of-sync",
  });
  expect(fs.readFileSync(target, "utf8")).toBe("# Edited with external editor\n");

  await runtime.reopen();
  await bootstrapRuleWorkspace();
  await scanRuleDescriptors();
  expect(fs.readFileSync(target, "utf8")).toBe("# Edited with external editor\n");
});
