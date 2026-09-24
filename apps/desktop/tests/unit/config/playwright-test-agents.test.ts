import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parse as parseToml } from "smol-toml";
import { describe, expect, it } from "vitest";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(testDirectory, "../../../../../");
const agentDirectory = path.join(repositoryRoot, ".codex", "agents");
const mcpArgs = [
  "--dir",
  "apps/desktop",
  "exec",
  "playwright",
  "run-test-mcp-server",
  "--config",
  "playwright.config.ts",
];

const agents = [
  {
    file: "playwright_test_planner.toml",
    name: "playwright_test_planner",
    sandbox: "read-only",
    tools: ["planner_setup_page", "planner_save_plan", "browser_snapshot"],
  },
  {
    file: "playwright_test_generator.toml",
    name: "playwright_test_generator",
    sandbox: "read-only",
    tools: ["generator_setup_page", "generator_write_test", "browser_snapshot"],
  },
  {
    file: "playwright_test_healer.toml",
    name: "playwright_test_healer",
    sandbox: "workspace-write",
    tools: ["test_run", "test_debug", "browser_snapshot"],
  },
] as const;

describe("repository Playwright Test Agents", () => {
  it("contains exactly the three reviewed Codex agent definitions", () => {
    expect(fs.readdirSync(agentDirectory).sort()).toEqual(
      agents.map((agent) => agent.file).sort(),
    );
  });

  it.each(agents)("validates $name", (expectedAgent) => {
    const filePath = path.join(agentDirectory, expectedAgent.file);
    const config = parseToml(fs.readFileSync(filePath, "utf8"));

    expect(config).toMatchObject({
      name: expectedAgent.name,
      sandbox_mode: expectedAgent.sandbox,
      developer_instructions: expect.stringContaining(
        "spec/rules/testing-standards.md",
      ),
      mcp_servers: {
        "playwright-test": {
          command: "pnpm",
          args: mcpArgs,
          enabled_tools: expect.arrayContaining([...expectedAgent.tools]),
        },
      },
    });
  });
});
