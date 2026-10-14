import fs from "node:fs/promises";
import path from "node:path";

import type { AgentResumeCommand } from "@prompthub/shared/types";

interface AgentTerminalLauncherOptions {
  platform: NodeJS.Platform;
  tempRoot: string;
  openPath(filePath: string): Promise<string>;
  scheduleCleanup?(operation: () => Promise<void>, delayMs: number): void;
}

export interface AgentTerminalLauncher {
  launch(command: AgentResumeCommand): Promise<void>;
}

const MAX_ARGUMENTS = 200;
const MAX_ARGUMENT_LENGTH = 2 * 1024 * 1024;
const LAUNCH_ARTIFACT_TTL_MS = 15 * 60 * 1_000;

export function createAgentTerminalLauncher(
  options: AgentTerminalLauncherOptions,
): AgentTerminalLauncher {
  return {
    async launch(command) {
      if (options.platform !== "darwin") {
        throw new Error("AGENT_CONVERSATION_TERMINAL_UNSUPPORTED");
      }
      validateCommand(command);
      await fs.mkdir(options.tempRoot, { recursive: true, mode: 0o700 });
      const launchRoot = await fs.mkdtemp(
        path.join(options.tempRoot, "conversation-"),
      );
      try {
        await stageArguments(launchRoot, command.args);
        const scriptPath = path.join(launchRoot, "launch.command");
        await fs.writeFile(scriptPath, buildScript(launchRoot, command), {
          encoding: "utf8",
          mode: 0o700,
        });
        await fs.chmod(scriptPath, 0o700);
        const error = await options.openPath(scriptPath);
        if (error) throw new Error("AGENT_CONVERSATION_TERMINAL_OPEN_FAILED");
        scheduleCleanup(options, launchRoot);
      } catch (error) {
        await fs.rm(launchRoot, { recursive: true, force: true });
        throw error;
      }
    },
  };
}

function scheduleCleanup(
  options: AgentTerminalLauncherOptions,
  launchRoot: string,
): void {
  const cleanup = () => fs.rm(launchRoot, { recursive: true, force: true });
  if (options.scheduleCleanup) {
    options.scheduleCleanup(cleanup, LAUNCH_ARTIFACT_TTL_MS);
    return;
  }
  const timer = setTimeout(() => void cleanup(), LAUNCH_ARTIFACT_TTL_MS);
  timer.unref();
}

function validateCommand(command: AgentResumeCommand): void {
  if (
    !path.isAbsolute(command.executable) ||
    command.executable.includes("\0")
  ) {
    throw new Error("AGENT_CONVERSATION_EXECUTABLE_INVALID");
  }
  if (
    command.cwd !== undefined &&
    (!path.isAbsolute(command.cwd) || command.cwd.includes("\0"))
  ) {
    throw new Error("AGENT_CONVERSATION_CWD_INVALID");
  }
  validateEnvironment(command.environment);
  if (!Array.isArray(command.args) || command.args.length > MAX_ARGUMENTS) {
    throw new Error("AGENT_CONVERSATION_ARGUMENT_INVALID");
  }
  if (
    command.args.some(
      (argument) =>
        typeof argument !== "string" ||
        argument.includes("\0") ||
        argument.length > MAX_ARGUMENT_LENGTH,
    )
  ) {
    throw new Error("AGENT_CONVERSATION_ARGUMENT_INVALID");
  }
}

function validateEnvironment(
  environment: AgentResumeCommand["environment"],
): void {
  if (environment === undefined) return;
  if (
    !environment ||
    typeof environment !== "object" ||
    Array.isArray(environment)
  ) {
    throw new Error("AGENT_CONVERSATION_ENVIRONMENT_INVALID");
  }
  if (
    Object.entries(environment).some(
      ([key, directory]) =>
        !["CLAUDE_CONFIG_DIR", "KIMI_CODE_HOME", "QWEN_RUNTIME_DIR", "CODEX_HOME", "GROK_HOME", "PI_CODING_AGENT_DIR"].includes(key) ||
        (directory !== null &&
          (typeof directory !== "string" ||
            !path.isAbsolute(directory) ||
            directory.includes("\0"))),
    )
  ) {
    throw new Error("AGENT_CONVERSATION_ENVIRONMENT_INVALID");
  }
}

async function stageArguments(root: string, args: string[]): Promise<void> {
  await Promise.all(
    args.map((argument, index) =>
      fs.writeFile(path.join(root, `arg-${index}`), argument, {
        encoding: "utf8",
        mode: 0o600,
      }),
    ),
  );
}

function buildScript(root: string, command: AgentResumeCommand): string {
  const declarations = command.args.map(
    (_, index) =>
      `ARG_${index}=$(cat -- "$PROMPTHUB_LAUNCH_ROOT/arg-${index}")`,
  );
  const argumentsList = command.args.map((_, index) => `"$ARG_${index}"`);
  const cwd = command.cwd || path.dirname(command.executable);
  return [
    "#!/bin/sh",
    "set -u",
    `PROMPTHUB_LAUNCH_ROOT=${shellQuote(root)}`,
    'cleanup() { rm -rf -- "$PROMPTHUB_LAUNCH_ROOT"; }',
    "trap cleanup EXIT HUP INT TERM",
    `cd -- ${shellQuote(cwd)}`,
    ...Object.entries(command.environment ?? {}).map(([key, value]) =>
      value === null ? `unset ${key}` : `export ${key}=${shellQuote(value)}`,
    ),
    ...declarations,
    `${shellQuote(command.executable)} ${argumentsList.join(" ")}`.trim(),
    "status=$?",
    "cleanup",
    "trap - EXIT",
    'exit "$status"',
    "",
  ].join("\n");
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}
