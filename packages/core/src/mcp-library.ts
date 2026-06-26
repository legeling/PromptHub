import fs from "fs";
import os from "os";
import path from "path";

import {
  BUILTIN_MCP_MARKET_SOURCES,
  BUILTIN_MCP_MARKET_TEMPLATES,
} from "@prompthub/shared/constants/mcp-market";
import {
  isMcpTargetKind,
  type McpEnvImportResult,
  type McpCreateFromSourceRequest,
  type McpCreateFromSourceResult,
  type McpHealthCheckResult,
  type McpHealthIssue,
  type McpHealthStatus,
  type McpApplyResult,
  type McpApplyTarget,
  type McpImportResult,
  type McpLibraryFile,
  type McpMarketTemplate,
  type McpMarketSource,
  type McpRemoveResult,
  type McpRemoveTargetNames,
  type McpServerConfig,
  type McpServerDraft,
  type McpTargetBinding,
  type McpTargetKind,
  type McpTargetScope,
  type McpTargetStatusEntry,
} from "@prompthub/shared/types/mcp";
import {
  buildMcpConfigPreview,
  inferMcpEnvRequirements,
  inferMcpPlaceholderRequirements,
  inferMcpRuntimeDetails,
  installMcpTemplate,
  listMcpServerNamesInJson,
  listMcpServerNamesInToml,
  mergeCodexMcpToml,
  mergeMcpServersJson,
  normalizeMcpServerDraft,
  parseMcpJsonConfigContent,
  parseMcpDotEnv,
  removeCodexMcpTomlServers,
  removeMcpServersFromJson,
  sanitizeMcpServerName,
} from "@prompthub/shared/utils/mcp-config";

import { getConfigDir, getDataDir } from "./runtime-paths";
import { inferMcpSource } from "./mcp-source";

const MCP_LIBRARY_DIR_NAME = "mcp";
const MCP_LIBRARY_FILE_NAME = "library.json";
const LEGACY_MCP_LIBRARY_FILE_NAME = "mcp-library.json";

export class CoreMcpError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "CoreMcpError";
    this.code = code;
  }
}

export interface McpTargetPreset {
  id: string;
  target: McpTargetKind;
  scope: McpTargetScope;
  label: string;
  path: string;
  /**
   * Skill platform id used for brand icon rendering in the renderer.
   * 用于渲染端品牌图标的平台 id（对应 Skills 平台体系）。
   */
  platformId?: string;
}

export function getMcpLibraryFilePath(): string {
  return path.join(getDataDir(), MCP_LIBRARY_DIR_NAME, MCP_LIBRARY_FILE_NAME);
}

export function getLegacyMcpLibraryFilePath(): string {
  return path.join(getConfigDir(), LEGACY_MCP_LIBRARY_FILE_NAME);
}

function readMcpLibraryFile(filePath: string): McpLibraryFile {
  return normalizeLibrary(JSON.parse(fs.readFileSync(filePath, "utf8")));
}

/**
 * Global MCP config targets for every supported agent platform.
 * Workspace/project-level files are handled through the custom-path target
 * because a packaged desktop app has no meaningful working directory.
 * 各支持平台的全局 MCP 配置目标。项目级文件通过自定义路径目标处理，
 * 因为打包后的桌面应用没有有意义的工作目录。
 */
export function getMcpTargetPresets(
  homeDir = os.homedir(),
  platform: NodeJS.Platform = process.platform,
): McpTargetPreset[] {
  const claudeDesktopPath =
    platform === "darwin"
      ? path.join(
          homeDir,
          "Library",
          "Application Support",
          "Claude",
          "claude_desktop_config.json",
        )
      : platform === "win32"
        ? path.join(
            homeDir,
            "AppData",
            "Roaming",
            "Claude",
            "claude_desktop_config.json",
          )
        : path.join(homeDir, ".config", "Claude", "claude_desktop_config.json");
  const vscodeUserPath =
    platform === "darwin"
      ? path.join(
          homeDir,
          "Library",
          "Application Support",
          "Code",
          "User",
          "mcp.json",
        )
      : platform === "win32"
        ? path.join(homeDir, "AppData", "Roaming", "Code", "User", "mcp.json")
        : path.join(homeDir, ".config", "Code", "User", "mcp.json");

  return [
    {
      id: "claude",
      target: "claude",
      scope: "global",
      label: "Claude Code",
      path: path.join(homeDir, ".claude.json"),
      platformId: "claude",
    },
    {
      id: "codex",
      target: "codex",
      scope: "global",
      label: "Codex CLI",
      path: path.join(homeDir, ".codex", "config.toml"),
      platformId: "codex",
    },
    {
      id: "gemini",
      target: "gemini",
      scope: "global",
      label: "Gemini CLI",
      path: path.join(homeDir, ".gemini", "settings.json"),
      platformId: "gemini",
    },
    {
      id: "opencode",
      target: "opencode",
      scope: "global",
      label: "OpenCode",
      path: path.join(homeDir, ".config", "opencode", "opencode.json"),
      platformId: "opencode",
    },
    {
      id: "kilo",
      target: "kilo",
      scope: "global",
      label: "Kilo Code",
      path: path.join(homeDir, ".config", "kilo", "kilo.jsonc"),
      platformId: "kilo",
    },
    {
      id: "cursor",
      target: "cursor",
      scope: "global",
      label: "Cursor",
      path: path.join(homeDir, ".cursor", "mcp.json"),
      platformId: "cursor",
    },
    {
      id: "claude-desktop",
      target: "claude-desktop",
      scope: "global",
      label: "Claude Desktop",
      path: claudeDesktopPath,
      platformId: "claude",
    },
    {
      id: "vscode",
      target: "vscode",
      scope: "global",
      label: "VS Code",
      path: vscodeUserPath,
      platformId: "copilot",
    },
    {
      id: "windsurf",
      target: "windsurf",
      scope: "global",
      label: "Windsurf",
      path: path.join(homeDir, ".codeium", "windsurf", "mcp_config.json"),
      platformId: "windsurf",
    },
    {
      id: "kiro",
      target: "kiro",
      scope: "global",
      label: "Kiro",
      path: path.join(homeDir, ".kiro", "settings", "mcp.json"),
      platformId: "kiro",
    },
    {
      id: "cline",
      target: "cline",
      scope: "global",
      label: "Cline",
      path: path.join(
        homeDir,
        ".cline",
        "data",
        "settings",
        "cline_mcp_settings.json",
      ),
      platformId: "cline",
    },
  ];
}

function nowIso(): string {
  return new Date().toISOString();
}

function nowMs(): number {
  return Date.now();
}

function defaultLibrary(): McpLibraryFile {
  return {
    kind: "prompthub-mcp-library",
    version: 1,
    updatedAt: nowIso(),
    servers: [],
    bindings: [],
  };
}

function writeJsonFileAtomic(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tempPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  fs.renameSync(tempPath, filePath);
}

function normalizeLibrary(raw: Partial<McpLibraryFile>): McpLibraryFile {
  const now = nowMs();
  return {
    kind: "prompthub-mcp-library",
    version: 1,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : nowIso(),
    servers: Array.isArray(raw.servers)
      ? raw.servers.map((server) =>
          normalizeMcpServerDraft(server as McpServerDraft, now),
        )
      : [],
    bindings: Array.isArray(raw.bindings)
      ? raw.bindings
          .filter((binding): binding is McpTargetBinding =>
            Boolean(
              binding &&
              typeof binding === "object" &&
              typeof binding.id === "string" &&
              isMcpTargetKind(binding.target) &&
              typeof binding.path === "string" &&
              Array.isArray(binding.serverIds),
            ),
          )
          .map((binding) => ({
            ...binding,
            enabled: binding.enabled !== false,
            createdAt: binding.createdAt || now,
            updatedAt: binding.updatedAt || now,
          }))
      : [],
  };
}

function assertUniqueName(
  servers: McpServerConfig[],
  name: string,
  exceptId?: string,
): void {
  const duplicate = servers.find(
    (server) => server.name === name && server.id !== exceptId,
  );
  if (duplicate) {
    throw new CoreMcpError("DUPLICATE_NAME", `MCP 服务名已存在: ${name}`);
  }
}

function selectServers(
  library: McpLibraryFile,
  serverIds: string[],
): McpServerConfig[] {
  const ids = new Set(serverIds);
  const servers = library.servers.filter((server) => ids.has(server.id));
  if (servers.length !== ids.size) {
    throw new CoreMcpError("NOT_FOUND", "部分 MCP 服务不存在");
  }
  return servers;
}

function createBackup(filePath: string): string | undefined {
  if (!fs.existsSync(filePath)) {
    return undefined;
  }
  const backupPath = `${filePath}.prompthub-mcp-backup-${Date.now()}`;
  fs.copyFileSync(filePath, backupPath);
  return backupPath;
}

function writeTextFileAtomic(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tempPath, content, "utf8");
  fs.renameSync(tempPath, filePath);
}

function isTomlTarget(target: McpTargetKind): boolean {
  return target === "codex" || target === "custom-toml";
}

function createBindingId(target: McpApplyTarget): string {
  return `${target.target}:${target.scope}:${target.path}`;
}

function listExistingTargetServerNames(
  target: McpApplyTarget,
  existingContent: string,
): string[] {
  if (!existingContent.trim()) {
    return [];
  }
  return isTomlTarget(target.target)
    ? listMcpServerNamesInToml(existingContent)
    : listMcpServerNamesInJson(
        parseMcpJsonConfigContent(existingContent),
        target.target,
      );
}

function findExternalTargetConflicts(
  library: McpLibraryFile,
  target: McpApplyTarget,
  servers: McpServerConfig[],
  existingContent: string,
): string[] {
  const existingNames = new Set(
    listExistingTargetServerNames(target, existingContent),
  );
  if (existingNames.size === 0) {
    return [];
  }

  const existingBinding = library.bindings.find(
    (item) => item.id === createBindingId(target),
  );
  const managedIds = new Set(existingBinding?.serverIds ?? []);

  return servers
    .filter((server) => server.enabled)
    .filter((server) => existingNames.has(server.name))
    .filter((server) => !managedIds.has(server.id))
    .map((server) => server.name);
}

function findOverwrittenTargetNames(
  target: McpApplyTarget,
  servers: McpServerConfig[],
  existingContent: string,
): string[] {
  const existingNames = new Set(
    listExistingTargetServerNames(target, existingContent),
  );
  return servers
    .filter((server) => server.enabled && existingNames.has(server.name))
    .map((server) => server.name);
}

function resolveServer(
  library: McpLibraryFile,
  identifier: string,
): McpServerConfig {
  const server = library.servers.find(
    (item) => item.id === identifier || item.name === identifier,
  );
  if (!server) {
    throw new CoreMcpError("NOT_FOUND", `MCP 服务不存在: ${identifier}`);
  }
  return server;
}

function commandExists(
  command: string,
  envPath = process.env.PATH ?? "",
): boolean {
  if (path.isAbsolute(command) || command.includes(path.sep)) {
    return fs.existsSync(command);
  }
  const extensions =
    process.platform === "win32" ? ["", ".exe", ".cmd", ".bat", ".ps1"] : [""];
  return envPath
    .split(path.delimiter)
    .some((dir) =>
      extensions.some((extension) =>
        fs.existsSync(path.join(dir, command + extension)),
      ),
    );
}

function getHealthStatus(issues: McpHealthIssue[]): McpHealthStatus {
  if (issues.some((issue) => issue.severity === "error")) {
    return "error";
  }
  if (issues.length > 0) {
    return "warning";
  }
  return "ok";
}

function validateKnownEnvValue(name: string, value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const validators: Record<string, { pattern: RegExp; example: string }> = {
    AMAP_MAPS_API_KEY: {
      pattern: /^[A-Za-z0-9]{16,64}$/,
      example: "a 16-64 character AMap key",
    },
    BRAVE_API_KEY: {
      pattern: /^BSA[0-9A-Za-z_-]{20,}$/,
      example: "a Brave key starting with BSA",
    },
    FIRECRAWL_API_KEY: {
      pattern: /^fc-[0-9A-Za-z_-]{20,}$/,
      example: "a Firecrawl key starting with fc-",
    },
    GITHUB_PERSONAL_ACCESS_TOKEN: {
      pattern: /^(ghp|github_pat|gho|ghu|ghs|ghr)_[0-9A-Za-z_]{20,}$/,
      example: "a GitHub token such as ghp_... or github_pat_...",
    },
    GOOGLE_MAPS_API_KEY: {
      pattern: /^AIza[0-9A-Za-z_-]{20,}$/,
      example: "a Google Maps key starting with AIza",
    },
    SLACK_BOT_TOKEN: {
      pattern: /^xoxb-[0-9A-Za-z-]{20,}$/,
      example: "a Slack bot token starting with xoxb-",
    },
    SLACK_TEAM_ID: {
      pattern: /^T[A-Z0-9]{8,}$/,
      example: "a Slack workspace/team id such as T01234567",
    },
  };
  const validator = validators[name];
  if (!validator || validator.pattern.test(trimmed)) {
    return null;
  }
  return `${name} 格式看起来不正确，应填写 ${validator.example}`;
}

function createHealthResult(server: McpServerConfig): McpHealthCheckResult {
  const issues: McpHealthIssue[] = [];
  if (server.transport === "stdio") {
    if (!server.command) {
      issues.push({
        code: "MISSING_COMMAND",
        severity: "error",
        field: "command",
        message: "stdio MCP 服务缺少 command",
      });
    } else if (!commandExists(server.command)) {
      issues.push({
        code: "COMMAND_NOT_FOUND",
        severity: "error",
        field: "command",
        message: `找不到命令: ${server.command}`,
      });
    }
    if (server.cwd && !fs.existsSync(server.cwd)) {
      issues.push({
        code: "MISSING_CWD",
        severity: "warning",
        field: "cwd",
        message: `工作目录不存在: ${server.cwd}`,
      });
    }
  } else {
    try {
      if (!server.url) {
        throw new Error("missing url");
      }
      new URL(server.url);
    } catch {
      issues.push({
        code: "INVALID_URL",
        severity: "error",
        field: "url",
        message: "远程 MCP 服务 URL 无效",
      });
    }
  }

  for (const requirement of inferMcpEnvRequirements(server)) {
    const value = server.env?.[requirement.name];
    if (requirement.required && (!value || /^<[^>]+>$/.test(value.trim()))) {
      issues.push({
        code: "MISSING_ENV",
        severity: "error",
        field: requirement.name,
        message: `缺少环境变量: ${requirement.name}`,
      });
      continue;
    }
    if (value) {
      const invalidMessage = validateKnownEnvValue(requirement.name, value);
      if (invalidMessage) {
        issues.push({
          code: "INVALID_ENV_VALUE",
          severity: "warning",
          field: requirement.name,
          message: invalidMessage,
        });
      }
    }
  }

  for (const placeholder of inferMcpPlaceholderRequirements(server)) {
    issues.push({
      code: "PLACEHOLDER_VALUE",
      severity: "error",
      field: placeholder.source,
      message: `仍有占位值需要替换: ${placeholder.value}`,
    });
  }

  return {
    serverId: server.id,
    serverName: server.name,
    status: getHealthStatus(issues),
    checkedAt: nowIso(),
    runtime: inferMcpRuntimeDetails(server),
    issues,
  };
}

function importServerEntry(
  name: string,
  entry: unknown,
  now: number,
): McpServerConfig | null {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return null;
  }
  const record = entry as Record<string, unknown>;
  const commandParts = Array.isArray(record.command)
    ? record.command.filter((item): item is string => typeof item === "string")
    : [];
  const command =
    typeof record.command === "string" ? record.command : commandParts[0];
  const url = typeof record.url === "string" ? record.url : undefined;
  if (!command && !url) {
    return null;
  }
  const args =
    commandParts.length > 0
      ? commandParts.slice(1)
      : Array.isArray(record.args)
        ? record.args.filter((item): item is string => typeof item === "string")
        : undefined;
  const envRecord = record.env ?? record.environment;
  const headersRecord = record.headers ?? record.http_headers;

  return normalizeMcpServerDraft(
    {
      name: sanitizeMcpServerName(name),
      displayName: name,
      description:
        typeof record.description === "string" ? record.description : undefined,
      transport: command
        ? "stdio"
        : record.type === "sse"
          ? "sse"
          : "streamable-http",
      command,
      args,
      cwd: typeof record.cwd === "string" ? record.cwd : undefined,
      env:
        envRecord && typeof envRecord === "object" && !Array.isArray(envRecord)
          ? (envRecord as Record<string, string>)
          : undefined,
      url,
      headers:
        headersRecord &&
        typeof headersRecord === "object" &&
        !Array.isArray(headersRecord)
          ? (headersRecord as Record<string, string>)
          : undefined,
      source: { type: "import" },
    },
    now,
  );
}

function parseTomlString(value: string): string | undefined {
  try {
    const parsed = JSON.parse(value.trim()) as unknown;
    return typeof parsed === "string" ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function parseTomlStringArray(value: string): string[] | undefined {
  try {
    const parsed = JSON.parse(value.trim()) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : undefined;
  } catch {
    return undefined;
  }
}

function parseTomlInlineTable(
  value: string,
): Record<string, string> | undefined {
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
    return undefined;
  }
  const entries = trimmed
    .slice(1, -1)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const separatorIndex = entry.indexOf("=");
      if (separatorIndex === -1) {
        return null;
      }
      const key = entry.slice(0, separatorIndex).trim().replace(/^"|"$/g, "");
      const parsedValue = parseTomlString(entry.slice(separatorIndex + 1));
      return key && parsedValue !== undefined ? [key, parsedValue] : null;
    })
    .filter((entry): entry is [string, string] => Boolean(entry));

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function parseCodexTomlServers(
  content: string,
  now: number,
): McpServerConfig[] {
  const servers: McpServerConfig[] = [];
  let currentName: string | null = null;
  let current: Record<string, unknown> = {};

  const flush = () => {
    if (!currentName) {
      return;
    }
    const server = importServerEntry(currentName, current, now);
    if (server) {
      servers.push(server);
    }
    currentName = null;
    current = {};
  };

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const sectionMatch = line.match(/^\[mcp_servers\.("?)([^"\]]+)\1\]$/);
    if (sectionMatch) {
      flush();
      currentName = sectionMatch[2];
      continue;
    }
    if (!currentName) {
      continue;
    }
    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    if (key === "args") {
      current.args = parseTomlStringArray(value);
    } else if (key === "env" || key === "http_headers") {
      current[key === "env" ? "env" : "headers"] = parseTomlInlineTable(value);
    } else if (key === "command" || key === "cwd" || key === "url") {
      current[key] = parseTomlString(value);
    }
  }
  flush();
  return servers;
}

function parseJsonImportServers(
  content: string,
  now: number,
): McpServerConfig[] {
  const raw = parseMcpJsonConfigContent(content) as Record<string, unknown>;
  const source =
    raw.mcpServers && typeof raw.mcpServers === "object"
      ? raw.mcpServers
      : raw.servers && typeof raw.servers === "object"
        ? raw.servers
        : raw.mcp && typeof raw.mcp === "object"
          ? raw.mcp
          : {};
  return Object.entries(source)
    .map(([name, entry]) => importServerEntry(name, entry, now))
    .filter((server): server is McpServerConfig => Boolean(server));
}

function readImportServersFromContent(
  content: string,
  now: number,
  format?: "json" | "toml",
): McpServerConfig[] {
  const trimmed = content.trim();
  if (!trimmed) {
    return [];
  }
  if (format === "toml") {
    return parseCodexTomlServers(trimmed, now);
  }
  if (format === "json") {
    return parseJsonImportServers(trimmed, now);
  }
  try {
    return parseJsonImportServers(trimmed, now);
  } catch {
    const servers = parseCodexTomlServers(trimmed, now);
    if (servers.length > 0) {
      return servers;
    }
    throw new Error("Invalid MCP config content");
  }
}

function readImportServers(filePath: string, now: number): McpServerConfig[] {
  const content = fs.readFileSync(filePath, "utf8");
  const format =
    path.extname(filePath).toLowerCase() === ".toml" ? "toml" : "json";
  return readImportServersFromContent(content, now, format);
}

function mergeImportedServers(
  library: McpLibraryFile,
  sourceServers: McpServerConfig[],
): McpImportResult & { library: McpLibraryFile } {
  const imported: McpServerConfig[] = [];
  const skipped: string[] = [];
  const existingNames = new Set(library.servers.map((server) => server.name));

  for (const server of sourceServers) {
    if (existingNames.has(server.name)) {
      skipped.push(server.name);
      continue;
    }
    imported.push(server);
    existingNames.add(server.name);
  }

  return {
    imported,
    skipped,
    library:
      imported.length > 0
        ? { ...library, servers: [...imported, ...library.servers] }
        : library,
  };
}

function readTargetServers(
  filePath: string,
  target: McpTargetKind,
  now: number,
): McpServerConfig[] {
  const content = fs.readFileSync(filePath, "utf8");
  if (isTomlTarget(target)) {
    return parseCodexTomlServers(content, now);
  }
  const raw = parseMcpJsonConfigContent(content) as Record<string, unknown>;
  const key =
    target === "vscode"
      ? "servers"
      : target === "opencode" || target === "kilo"
        ? "mcp"
        : "mcpServers";
  const source = raw[key];
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return [];
  }
  return Object.entries(source)
    .map(([name, entry]) => importServerEntry(name, entry, now))
    .filter((server): server is McpServerConfig => Boolean(server))
    .map((server) => ({
      ...server,
      source: { type: "import", id: target, label: filePath },
    }));
}

export class CoreMcpLibraryService {
  read(): McpLibraryFile {
    const primaryPath = getMcpLibraryFilePath();
    try {
      if (fs.existsSync(primaryPath)) {
        return readMcpLibraryFile(primaryPath);
      }

      const legacyPath = getLegacyMcpLibraryFilePath();
      if (!fs.existsSync(legacyPath)) {
        return defaultLibrary();
      }

      const migrated = readMcpLibraryFile(legacyPath);
      writeJsonFileAtomic(primaryPath, migrated);
      return migrated;
    } catch (error) {
      throw new CoreMcpError(
        "INVALID_LIBRARY",
        error instanceof Error ? error.message : "MCP 配置库无法解析",
      );
    }
  }

  write(library: McpLibraryFile): McpLibraryFile {
    const next = normalizeLibrary({
      ...library,
      updatedAt: nowIso(),
    });
    writeJsonFileAtomic(getMcpLibraryFilePath(), next);
    return next;
  }

  getMarketTemplates(): McpMarketTemplate[] {
    return BUILTIN_MCP_MARKET_TEMPLATES;
  }

  getMarketSources(): McpMarketSource[] {
    return BUILTIN_MCP_MARKET_SOURCES;
  }

  checkServer(identifier: string): McpHealthCheckResult {
    return createHealthResult(resolveServer(this.read(), identifier));
  }

  checkAllServers(): McpHealthCheckResult[] {
    return this.read().servers.map((server) => createHealthResult(server));
  }

  createServer(draft: McpServerDraft): McpServerConfig {
    const library = this.read();
    const server = normalizeMcpServerDraft(draft);
    assertUniqueName(library.servers, server.name);
    this.write({
      ...library,
      servers: [server, ...library.servers],
    });
    return server;
  }

  updateServer(id: string, draft: McpServerDraft): McpServerConfig {
    const library = this.read();
    const current = library.servers.find((server) => server.id === id);
    if (!current) {
      throw new CoreMcpError("NOT_FOUND", `MCP 服务不存在: ${id}`);
    }
    const nextServer = normalizeMcpServerDraft({
      ...current,
      ...draft,
      id,
      createdAt: current.createdAt,
      updatedAt: nowMs(),
    });
    assertUniqueName(library.servers, nextServer.name, id);
    this.write({
      ...library,
      servers: library.servers.map((server) =>
        server.id === id ? nextServer : server,
      ),
    });
    return nextServer;
  }

  setServerEnabled(identifier: string, enabled: boolean): McpServerConfig {
    const library = this.read();
    const current = resolveServer(library, identifier);
    const nextServer = normalizeMcpServerDraft({
      ...current,
      enabled,
      id: current.id,
      createdAt: current.createdAt,
      updatedAt: nowMs(),
    });
    this.write({
      ...library,
      servers: library.servers.map((server) =>
        server.id === current.id ? nextServer : server,
      ),
    });
    return nextServer;
  }

  deleteServer(id: string): McpLibraryFile {
    const library = this.read();
    const servers = library.servers.filter((server) => server.id !== id);
    if (servers.length === library.servers.length) {
      throw new CoreMcpError("NOT_FOUND", `MCP 服务不存在: ${id}`);
    }
    return this.write({
      ...library,
      servers,
      bindings: library.bindings
        .map((binding) => ({
          ...binding,
          serverIds: binding.serverIds.filter((serverId) => serverId !== id),
        }))
        .filter((binding) => binding.serverIds.length > 0),
    });
  }

  installTemplate(templateId: string): McpServerConfig {
    const template = BUILTIN_MCP_MARKET_TEMPLATES.find(
      (item) => item.id === templateId,
    );
    if (!template) {
      throw new CoreMcpError("NOT_FOUND", `MCP 模板不存在: ${templateId}`);
    }
    const library = this.read();
    const server = installMcpTemplate(template);
    assertUniqueName(library.servers, server.name);
    this.write({
      ...library,
      servers: [server, ...library.servers],
    });
    return server;
  }

  installMarketTemplate(template: McpMarketTemplate): McpServerConfig {
    const library = this.read();
    const server = installMcpTemplate(template);
    assertUniqueName(library.servers, server.name);
    this.write({
      ...library,
      servers: [server, ...library.servers],
    });
    return server;
  }

  preview(target: McpTargetKind, serverIds: string[]): string {
    const library = this.read();
    return buildMcpConfigPreview(target, selectServers(library, serverIds));
  }

  apply(target: McpApplyTarget): McpApplyResult {
    const library = this.read();
    const servers = selectServers(library, target.serverIds).filter(
      (server) => server.enabled,
    );
    if (servers.length === 0) {
      throw new CoreMcpError(
        "NO_ENABLED_SERVERS",
        "没有已启用的 MCP 服务可分发",
      );
    }
    const existingContent = fs.existsSync(target.path)
      ? fs.readFileSync(target.path, "utf8")
      : "";
    const externalConflicts = findExternalTargetConflicts(
      library,
      target,
      servers,
      existingContent,
    );
    if (externalConflicts.length > 0 && !target.force) {
      throw new CoreMcpError(
        "TARGET_CONFLICT",
        `目标配置已存在同名 MCP 服务: ${externalConflicts.join(
          ", ",
        )}。确认覆盖后请使用 force。`,
      );
    }
    const overwrittenServerNames = findOverwrittenTargetNames(
      target,
      servers,
      existingContent,
    );
    const tomlBaseContent =
      isTomlTarget(target.target) && target.force
        ? removeCodexMcpTomlServers(existingContent, externalConflicts)
        : existingContent;
    const content = isTomlTarget(target.target)
      ? mergeCodexMcpToml(tomlBaseContent, servers)
      : `${JSON.stringify(
          mergeMcpServersJson(
            parseMcpJsonConfigContent(existingContent),
            target.target,
            servers,
          ),
          null,
          2,
        )}\n`;

    const backupPath = createBackup(target.path);
    writeTextFileAtomic(target.path, content);

    const now = nowMs();
    const bindingId = createBindingId(target);
    const existingBinding = library.bindings.find(
      (item) => item.id === bindingId,
    );
    const binding: McpTargetBinding = {
      id: bindingId,
      target: target.target,
      scope: target.scope,
      path: target.path,
      // Merge with previously applied servers so re-applying one server does
      // not erase the distributed status of others on the same target.
      // 与之前已应用的 server 合并，避免重复应用单个 server 时
      // 丢失同一目标上其他 server 的分发状态。
      serverIds: Array.from(
        new Set([
          ...(existingBinding?.serverIds ?? []),
          ...servers.map((server) => server.id),
        ]),
      ),
      enabled: true,
      lastAppliedAt: now,
      createdAt: existingBinding?.createdAt ?? now,
      updatedAt: now,
    };
    this.write({
      ...library,
      bindings: [
        binding,
        ...library.bindings.filter((item) => item.id !== binding.id),
      ],
    });

    return {
      path: target.path,
      backupPath,
      target: target.target,
      appliedServerNames: servers.map((server) => server.name),
      overwrittenServerNames,
      content,
    };
  }

  /**
   * Remove selected servers from an agent target config file, with backup.
   * Unrelated config content is preserved. The matching binding is updated
   * and dropped when it becomes empty.
   * 从目标配置文件中移除选定的 MCP 服务（带备份），保留无关配置；
   * 同步更新 binding，为空时删除。
   */
  removeFromTarget(target: McpApplyTarget): McpRemoveResult {
    const library = this.read();
    const servers = selectServers(library, target.serverIds);
    if (!fs.existsSync(target.path)) {
      throw new CoreMcpError(
        "TARGET_NOT_FOUND",
        `目标配置文件不存在: ${target.path}`,
      );
    }
    const existingContent = fs.readFileSync(target.path, "utf8");
    const serverNames = servers.map((server) => server.name);
    const content = isTomlTarget(target.target)
      ? removeCodexMcpTomlServers(existingContent, serverNames)
      : `${JSON.stringify(
          removeMcpServersFromJson(
            parseMcpJsonConfigContent(existingContent),
            target.target,
            serverNames,
          ),
          null,
          2,
        )}\n`;

    const backupPath = createBackup(target.path);
    writeTextFileAtomic(target.path, content);

    const now = nowMs();
    const bindingId = createBindingId(target);
    const removedIds = new Set(target.serverIds);
    this.write({
      ...library,
      bindings: library.bindings
        .map((binding) =>
          binding.id === bindingId
            ? {
                ...binding,
                serverIds: binding.serverIds.filter(
                  (serverId) => !removedIds.has(serverId),
                ),
                updatedAt: now,
              }
            : binding,
        )
        .filter((binding) => binding.serverIds.length > 0),
    });

    return {
      path: target.path,
      backupPath,
      target: target.target,
      removedServerNames: serverNames,
      content,
    };
  }

  /**
   * Remove named MCP server entries from an agent target config file. This is
   * used for external Agent MCP entries that do not exist in PromptHub's local
   * library and therefore cannot be addressed by server id.
   */
  removeNamesFromTarget(target: McpRemoveTargetNames): McpRemoveResult {
    if (target.serverNames.length === 0) {
      throw new CoreMcpError("NO_SERVER_NAMES", "没有可移除的 MCP 服务名称");
    }
    if (!fs.existsSync(target.path)) {
      throw new CoreMcpError(
        "TARGET_NOT_FOUND",
        `目标配置文件不存在: ${target.path}`,
      );
    }

    const library = this.read();
    const existingContent = fs.readFileSync(target.path, "utf8");
    const content = isTomlTarget(target.target)
      ? removeCodexMcpTomlServers(existingContent, target.serverNames)
      : `${JSON.stringify(
          removeMcpServersFromJson(
            parseMcpJsonConfigContent(existingContent),
            target.target,
            target.serverNames,
          ),
          null,
          2,
        )}\n`;

    const backupPath = createBackup(target.path);
    writeTextFileAtomic(target.path, content);

    const removedNames = new Set(target.serverNames);
    const removedLibraryIds = new Set(
      library.servers
        .filter((server) => removedNames.has(server.name))
        .map((server) => server.id),
    );
    const now = nowMs();
    const bindingId = createBindingId({ ...target, serverIds: [] });
    this.write({
      ...library,
      bindings: library.bindings
        .map((binding) =>
          binding.id === bindingId
            ? {
                ...binding,
                serverIds: binding.serverIds.filter(
                  (serverId) => !removedLibraryIds.has(serverId),
                ),
                updatedAt: now,
              }
            : binding,
        )
        .filter((binding) => binding.serverIds.length > 0),
    });

    return {
      path: target.path,
      backupPath,
      target: target.target,
      removedServerNames: target.serverNames,
      content,
    };
  }

  /**
   * Inspect every target preset config file and report which MCP server
   * names are currently present. The actual files are the source of truth
   * for distribution status, not the recorded bindings.
   * 扫描所有目标平台配置文件，报告其中实际存在的 MCP 服务名。
   * 分发状态以真实文件为准，而非记录的 binding。
   */
  getTargetStatus(
    presets: McpTargetPreset[] = getMcpTargetPresets(),
  ): McpTargetStatusEntry[] {
    return presets.map((preset) => {
      if (!fs.existsSync(preset.path)) {
        return {
          presetId: preset.id,
          path: preset.path,
          exists: false,
          serverNames: [],
        };
      }
      try {
        const servers = readTargetServers(preset.path, preset.target, nowMs());
        const serverNames = servers.map((server) => server.name);
        return {
          presetId: preset.id,
          path: preset.path,
          exists: true,
          serverNames,
          servers: servers.map((server) => ({
            ...server,
            source: { type: "import", id: preset.id, label: preset.label },
          })),
        };
      } catch {
        // Unparseable target config is reported as present but unknown so
        // the UI never claims a server is distributed based on bad data.
        // 配置无法解析时报告为存在但内容未知，避免 UI 基于坏数据误报。
        return {
          presetId: preset.id,
          path: preset.path,
          exists: true,
          serverNames: [],
        };
      }
    });
  }

  importFromFile(filePath: string): McpImportResult {
    const library = this.read();
    const now = nowMs();
    const sourceServers = readImportServers(filePath, now);
    const result = mergeImportedServers(library, sourceServers);
    if (result.imported.length > 0) {
      this.write(result.library);
    }

    return { imported: result.imported, skipped: result.skipped };
  }

  createFromSource(
    request: McpCreateFromSourceRequest,
  ): McpCreateFromSourceResult {
    if (request.kind === "config") {
      const library = this.read();
      const now = nowMs();
      const sourceServers = readImportServersFromContent(request.input, now);
      const result = mergeImportedServers(library, sourceServers);
      if (result.imported.length > 0) {
        this.write(result.library);
      }

      return {
        imported: result.imported,
        skipped: result.skipped,
        detectedKind: "config-content",
        warnings: [],
      };
    }

    const inference = inferMcpSource(request.input, request.kind);
    if (inference.detectedKind === "config-file") {
      const result = this.importFromFile(path.resolve(request.input));
      return {
        ...result,
        detectedKind: inference.detectedKind,
        warnings: inference.warnings,
      };
    }

    const library = this.read();
    const now = nowMs();
    const existingNames = new Set(library.servers.map((server) => server.name));
    const imported: McpServerConfig[] = [];
    const skipped: string[] = [];

    for (const draft of inference.drafts) {
      const server = normalizeMcpServerDraft(draft, now);
      if (existingNames.has(server.name)) {
        skipped.push(server.name);
        continue;
      }
      imported.push(server);
      existingNames.add(server.name);
    }

    if (imported.length > 0) {
      this.write({
        ...library,
        servers: [...imported, ...library.servers],
      });
    }

    return {
      imported,
      skipped,
      detectedKind: inference.detectedKind,
      warnings: inference.warnings,
    };
  }

  importEnvForServer(
    identifier: string,
    envFilePath: string,
    selectedKeys?: string[],
  ): McpEnvImportResult {
    const library = this.read();
    const server = resolveServer(library, identifier);
    const parsedEnv = parseMcpDotEnv(fs.readFileSync(envFilePath, "utf8"));
    const requiredKeys = inferMcpEnvRequirements(server).map(
      (item) => item.name,
    );
    const allowedKeys = new Set(
      selectedKeys?.length ? selectedKeys : requiredKeys,
    );
    const importedEntries = Object.entries(parsedEnv).filter(([key]) =>
      allowedKeys.has(key),
    );
    const importedKeys = importedEntries.map(([key]) => key);
    const skippedKeys = Array.from(allowedKeys).filter(
      (key) => !Object.prototype.hasOwnProperty.call(parsedEnv, key),
    );
    const nextServer = normalizeMcpServerDraft({
      ...server,
      env: {
        ...(server.env ?? {}),
        ...Object.fromEntries(importedEntries),
      },
      updatedAt: nowMs(),
    });

    this.write({
      ...library,
      servers: library.servers.map((item) =>
        item.id === server.id ? nextServer : item,
      ),
    });

    const missingKeys = inferMcpEnvRequirements(nextServer)
      .filter((item) => {
        const value = nextServer.env?.[item.name];
        return item.required && (!value || /^<[^>]+>$/.test(value.trim()));
      })
      .map((item) => item.name);

    return {
      server: nextServer,
      importedKeys,
      skippedKeys,
      missingKeys,
    };
  }
}
