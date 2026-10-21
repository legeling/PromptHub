import fs from "fs";
import os from "os";
import path from "path";
import { PassThrough } from "stream";

import { createCliSkillService, runCli } from "@prompthub/core";

export function makeTempRoot(
  tempDirs: string[],
  options: { seedDatabase?: boolean } = {},
): string {
  // OS temporary roots can be aliases; normal fixtures must not exercise symlink rejection.
  const dir = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-cli-app-")),
  );
  tempDirs.push(dir);

  if (options.seedDatabase !== false) {
    const templatePath = process.env.PROMPTHUB_CLI_TEST_DB_TEMPLATE;
    if (!templatePath || !fs.existsSync(templatePath)) {
      throw new Error("CLI test database template is unavailable");
    }
    const databasePath = path.join(dir, "user-data", "data", "prompthub.db");
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
    fs.copyFileSync(templatePath, databasePath);
  }

  return dir;
}

export function withDataDir(rootDir: string): string[] {
  return ["--data-dir", path.join(rootDir, "user-data")];
}

export async function withTempHome<T>(
  rootDir: string,
  run: (homeDir: string) => Promise<T>,
): Promise<T> {
  const homeDir = path.join(rootDir, "home");
  // os.homedir() uses USERPROFILE on Windows, including in child processes.
  const environment: Record<string, string> = {
    HOME: homeDir,
    USERPROFILE: homeDir,
    APPDATA: path.join(homeDir, "AppData", "Roaming"),
    LOCALAPPDATA: path.join(homeDir, "AppData", "Local"),
    XDG_CONFIG_HOME: path.join(homeDir, ".config"),
  };
  const originals = Object.keys(environment).map((key) => ({
    key,
    value: process.env[key],
  }));
  for (const directory of Object.values(environment)) {
    fs.mkdirSync(directory, { recursive: true });
  }

  try {
    Object.assign(process.env, environment);
    return await run(homeDir);
  } finally {
    for (const { key, value } of originals) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

export async function execCli(
  args: string[],
  skillService?: ReturnType<typeof createCliSkillService>,
  ioOptions?: {
    stdin?: PassThrough;
    isInteractive?: boolean;
  },
) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const exitCode = await runCli(
    args,
    {
      stdout: (message: string) => stdout.push(message),
      stderr: (message: string) => stderr.push(message),
      ...ioOptions,
    },
    undefined,
    undefined,
    skillService,
  );

  const joinedStdout = stdout.join("\n");
  const joinedStderr = stderr.join("\n");
  const parseMaybeJson = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
      return undefined;
    }
    try {
      return JSON.parse(text);
    } catch {
      return undefined;
    }
  };

  return {
    exitCode,
    stdout,
    stderr,
    joinedStdout,
    joinedStderr,
    errorJson: parseMaybeJson(joinedStderr),
    json: parseMaybeJson(joinedStdout),
  };
}
