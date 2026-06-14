import fs from "fs";
import path from "path";

import type {
  McpCreateSourceKind,
  McpDetectedSourceKind,
  McpServerDraft,
} from "@prompthub/shared/types/mcp";
import { sanitizeMcpServerName } from "@prompthub/shared/utils/mcp-config";
import { parseGitRepo, isGitHubHost } from "@prompthub/shared/utils/git-repo";

export interface McpSourceInference {
  detectedKind: McpDetectedSourceKind;
  drafts: McpServerDraft[];
  warnings: string[];
}

interface PackageJson {
  name?: string;
  description?: string;
  bin?: string | Record<string, string>;
  scripts?: Record<string, string>;
}

function parseJsonFile<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

function parseCommandLine(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;

  for (const char of input.trim()) {
    if ((char === '"' || char === "'") && !quote) {
      quote = char;
      continue;
    }
    if (char === quote) {
      quote = null;
      continue;
    }
    if (/\s/.test(char) && !quote) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }

  if (current) {
    tokens.push(current);
  }
  return tokens;
}

function displayNameFromSlug(value: string): string {
  return value
    .replace(/^@/, "")
    .replace(/[\/_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function inferNameFromCommand(command: string, args: string[]): string {
  const packageArg = args.find(
    (arg) =>
      !arg.startsWith("-") &&
      !arg.startsWith("${") &&
      !arg.includes("=") &&
      arg !== "run" &&
      arg !== "python",
  );
  return sanitizeMcpServerName(packageArg || path.basename(command));
}

function inferCommand(input: string): McpSourceInference {
  const [command, ...args] = parseCommandLine(input);
  if (!command) {
    throw new Error("MCP source command is empty");
  }
  const name = inferNameFromCommand(command, args);
  return {
    detectedKind: "command",
    drafts: [
      {
        name,
        displayName: displayNameFromSlug(name),
        transport: "stdio",
        command,
        args,
        source: {
          type: "manual",
          label: "Command line",
        },
        tags: ["custom"],
      },
    ],
    warnings: [],
  };
}

function firstPackageBin(pkg: PackageJson): string | undefined {
  if (typeof pkg.bin === "string") {
    return pkg.bin;
  }
  if (pkg.bin && typeof pkg.bin === "object") {
    return Object.values(pkg.bin).find((value) => typeof value === "string");
  }
  return undefined;
}

function inferNodeProject(dirPath: string, pkg: PackageJson): McpSourceInference {
  const packageName = pkg.name || path.basename(dirPath);
  const scriptName = pkg.scripts?.mcp
    ? "mcp"
    : pkg.scripts?.start
      ? "start"
      : undefined;
  const binPath = firstPackageBin(pkg);
  const warnings: string[] = [];
  let command = "npm";
  let args = scriptName ? ["run", scriptName] : ["start"];

  if (!scriptName && binPath) {
    command = "node";
    args = [binPath];
  } else if (!scriptName) {
    warnings.push(
      "No mcp/start script or bin entry was found; edit the generated command before distributing.",
    );
  }

  return {
    detectedKind: "local-project",
    drafts: [
      {
        name: sanitizeMcpServerName(packageName),
        displayName: displayNameFromSlug(packageName),
        description: pkg.description,
        transport: "stdio",
        command,
        args,
        cwd: dirPath,
        source: {
          type: "import",
          id: dirPath,
          label: "Local Node project",
        },
        tags: ["local", "node"],
      },
    ],
    warnings,
  };
}

function parsePyProjectValue(content: string, key: string): string | undefined {
  const match = content.match(new RegExp(`^${key}\\s*=\\s*["']([^"']+)["']`, "m"));
  return match?.[1];
}

function parseFirstPythonScript(content: string): string | undefined {
  const lines = content.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === "[project.scripts]");
  if (start === -1) {
    return undefined;
  }
  for (const line of lines.slice(start + 1)) {
    const trimmed = line.trim();
    if (trimmed.startsWith("[")) {
      return undefined;
    }
    const match = trimmed.match(/^([A-Za-z0-9_.-]+)\s*=/);
    if (match) {
      return match[1];
    }
  }
  return undefined;
}

function inferPythonProject(dirPath: string): McpSourceInference {
  const pyprojectPath = path.join(dirPath, "pyproject.toml");
  const content = fs.readFileSync(pyprojectPath, "utf8");
  const name = parsePyProjectValue(content, "name") || path.basename(dirPath);
  const scriptName = parseFirstPythonScript(content);
  const hasServerPy = fs.existsSync(path.join(dirPath, "server.py"));
  const warnings: string[] = [];
  const args = scriptName
    ? ["run", scriptName]
    : hasServerPy
      ? ["run", "python", "server.py"]
      : ["run", "python", "-m", sanitizeMcpServerName(name)];

  if (!scriptName && !hasServerPy) {
    warnings.push(
      "No project script or server.py was found; edit the generated Python command before distributing.",
    );
  }

  return {
    detectedKind: "local-project",
    drafts: [
      {
        name: sanitizeMcpServerName(name),
        displayName: displayNameFromSlug(name),
        description: parsePyProjectValue(content, "description"),
        transport: "stdio",
        command: "uv",
        args,
        cwd: dirPath,
        source: {
          type: "import",
          id: dirPath,
          label: "Local Python project",
        },
        tags: ["local", "python"],
      },
    ],
    warnings,
  };
}

function inferLocalProject(input: string): McpSourceInference {
  const dirPath = path.resolve(input);
  const packagePath = path.join(dirPath, "package.json");
  if (fs.existsSync(packagePath)) {
    const pkg = parseJsonFile<PackageJson>(packagePath);
    if (pkg) {
      return inferNodeProject(dirPath, pkg);
    }
  }

  if (fs.existsSync(path.join(dirPath, "pyproject.toml"))) {
    return inferPythonProject(dirPath);
  }

  if (fs.existsSync(path.join(dirPath, "Dockerfile"))) {
    const name = sanitizeMcpServerName(path.basename(dirPath));
    return {
      detectedKind: "local-project",
      drafts: [
        {
          name,
          displayName: displayNameFromSlug(name),
          transport: "stdio",
          command: "docker",
          args: ["run", "--rm", "-i", name],
          cwd: dirPath,
          source: {
            type: "import",
            id: dirPath,
            label: "Local Docker project",
          },
          tags: ["local", "docker"],
        },
      ],
      warnings: [
        "Docker projects require a built image. Build the image or edit the generated command before distributing.",
      ],
    };
  }

  throw new Error("No package.json, pyproject.toml, or Dockerfile found");
}

function inferUrl(input: string): McpSourceInference {
  const parsedRepo = parseGitRepo(input);
  if (parsedRepo && isGitHubHost(parsedRepo.host)) {
    const repoSlug = `${parsedRepo.owner}/${parsedRepo.repo}`;
    return {
      detectedKind: "github",
      drafts: [
        {
          name: sanitizeMcpServerName(parsedRepo.repo),
          displayName: displayNameFromSlug(parsedRepo.repo),
          description: `Custom MCP server from ${repoSlug}`,
          transport: "stdio",
          command: "npx",
          args: ["-y", `github:${repoSlug}`],
          source: {
            type: "import",
            id: parsedRepo.repositoryUrl,
            label: "GitHub repository",
            url: parsedRepo.repositoryUrl,
          },
          tags: ["github", "custom"],
        },
      ],
      warnings: [
        "GitHub imports generate an npx-compatible command. Edit the command if the repository uses Python, Docker, or custom startup steps.",
      ],
    };
  }

  const url = new URL(input);
  return {
    detectedKind: "remote-url",
    drafts: [
      {
        name: sanitizeMcpServerName(url.hostname.replace(/^www\./, "")),
        displayName: displayNameFromSlug(url.hostname.replace(/^www\./, "")),
        transport: "streamable-http",
        url: url.toString(),
        source: {
          type: "import",
          id: url.toString(),
          label: "Remote MCP URL",
          url: url.toString(),
        },
        tags: ["remote"],
      },
    ],
    warnings: [],
  };
}

export function isMcpConfigFilePath(filePath: string): boolean {
  return [".json", ".toml"].includes(path.extname(filePath).toLowerCase());
}

export function inferMcpSource(
  input: string,
  kind: McpCreateSourceKind = "auto",
): McpSourceInference {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("MCP source is empty");
  }

  if (kind === "command") {
    return inferCommand(trimmed);
  }

  if (kind === "url") {
    return inferUrl(trimmed);
  }

  if (kind === "path" || kind === "auto") {
    const resolved = path.resolve(trimmed);
    if (fs.existsSync(resolved)) {
      const stat = fs.statSync(resolved);
      if (stat.isFile() && isMcpConfigFilePath(resolved)) {
        return {
          detectedKind: "config-file",
          drafts: [],
          warnings: [],
        };
      }
      if (stat.isDirectory()) {
        return inferLocalProject(resolved);
      }
    }
    if (kind === "path") {
      throw new Error(`MCP source path does not exist: ${trimmed}`);
    }
  }

  if (/^https?:\/\//i.test(trimmed) || /^git@[^:]+:/i.test(trimmed)) {
    return inferUrl(trimmed);
  }

  return inferCommand(trimmed);
}
