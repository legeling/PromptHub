import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import {
  isolatedClaudeEnvironment,
  NATIVE_REPLY,
} from "./claude-native-gateway";

const execute = promisify(execFile);
const INTERACTIVE_TIMEOUT_SECONDS = 45;
const INTERACTIVE_OUTPUT_BYTES = 1024 * 1024;
const PROCESS_EXIT_GRACE_MS = 5000;

export async function runInteractiveClaude(
  home: string,
  config: string,
): Promise<{
  exitCode: number;
  completed: boolean;
  prompts: string[];
  output: string;
}> {
  // Reuse uv's installed interpreter; this opt-in POSIX fixture never downloads one.
  const { stdout: python } = await execute(
    "uv",
    ["python", "find", "--no-python-downloads"],
    {
      timeout: PROCESS_EXIT_GRACE_MS,
    },
  );
  const cwd = path.join(home, "project");
  await fs.mkdir(cwd, { recursive: true });
  const fixture = path.resolve(
    __dirname,
    "../../fixtures/claude-interactive-pty.py",
  );
  const { stdout } = await execute(
    "uv",
    [
      "run",
      "--offline",
      "--no-project",
      "--no-python-downloads",
      "--python",
      python.trim(),
      "python",
      fixture,
      String(INTERACTIVE_TIMEOUT_SECONDS),
      NATIVE_REPLY,
      String(INTERACTIVE_OUTPUT_BYTES),
      "claude",
      "--ax-screen-reader",
      "--tools",
      "",
      "--strict-mcp-config",
      "--mcp-config",
      '{"mcpServers":{}}',
      "--setting-sources",
      "user",
      "--settings",
      '{"disableAllHooks":true}',
      "Return a short greeting.",
    ],
    {
      cwd,
      env: {
        ...isolatedClaudeEnvironment(home, config),
        TERM: "xterm-256color",
      },
      timeout: INTERACTIVE_TIMEOUT_SECONDS * 1000 + PROCESS_EXIT_GRACE_MS,
      maxBuffer: INTERACTIVE_OUTPUT_BYTES * 2,
    },
  ).catch((error: unknown) => {
    if (error instanceof Error && "stdout" in error)
      throw new Error(
        `Interactive fixture failed: ${String(error.stdout)}${"stderr" in error ? String(error.stderr) : ""}`,
      );
    throw error;
  });
  return JSON.parse(stdout);
}
