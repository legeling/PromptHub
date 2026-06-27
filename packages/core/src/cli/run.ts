import fs from "fs";
import path from "path";
import type { Readable } from "stream";

import {
  closeDatabase,
  FolderDB,
  getDatabase,
  isDatabaseEmpty,
  initDatabase,
  PromptDB,
  SkillDB,
} from "../database";
import { configureRuntimePaths, resetRuntimePaths } from "../runtime-paths";
import { rewriteRuleWithAi } from "../rules-rewrite";
import { coreRulesWorkspaceService } from "../rules-workspace";
import { coreCliSkillService, type CliSkillService } from "./skill-cli-service";
import { handleAIConfigCommand } from "./ai-config-command";
import {
  CoreMcpError,
  CoreMcpLibraryService,
  getMcpTargetPresets,
} from "../mcp-library";
import type { SkillPlatform } from "@prompthub/shared/constants/platforms";
import {
  MCP_TARGET_KINDS,
  type McpApplyTarget,
  type McpMarketTemplate,
  type McpServerConfig,
  type McpTargetKind,
} from "@prompthub/shared/types/mcp";
import type {
  CreateFolderDTO,
  Folder,
  CreatePromptDTO,
  Prompt,
  PromptVersion,
  RuleRewriteRequest,
  RuleBackupRecord,
  RuleFileDescriptor,
  RuleFileId,
  RuleVersionSnapshot,
  SearchQuery,
  Skill,
  SkillFileSnapshot,
  SkillSafetyReport,
  UpdateFolderDTO,
  UpdatePromptDTO,
  Variable,
} from "@prompthub/shared/types";
import { isRuleFileId } from "@prompthub/shared/types";

type CliWriter = (message: string) => void;
export type OutputFormat = "json" | "table";

const EXIT_CODES = {
  OK: 0,
  USAGE: 2,
  NOT_FOUND: 3,
  CONFLICT: 4,
  IO: 5,
  INTERNAL: 10,
} as const;

const CLI_VERSION = "0.5.9-beta.2";

type ExitCode = (typeof EXIT_CODES)[keyof typeof EXIT_CODES];

type PromptDiffField =
  | "systemPrompt"
  | "systemPromptEn"
  | "userPrompt"
  | "userPromptEn"
  | "variables"
  | "aiResponse";

interface PromptDiffResult {
  from: PromptVersion;
  to: PromptVersion;
  fields: Array<{
    field: PromptDiffField;
    from: string;
    to: string;
  }>;
}

interface CliWorkspaceBundle {
  kind: "prompthub-cli-workspace";
  version: 1;
  exportedAt: string;
  prompts: Prompt[];
  folders: Folder[];
  versions: PromptVersion[];
}

interface CliRulesBundle {
  kind: "prompthub-cli-rules";
  version: 1;
  exportedAt: string;
  records: RuleBackupRecord[];
}

export interface CliIO {
  stdout: CliWriter;
  stderr: CliWriter;
  stdin?: Readable;
  isInteractive?: boolean;
}

export interface CliRuntimeHooks {
  configureRuntimePaths: typeof configureRuntimePaths;
  resetRuntimePaths: typeof resetRuntimePaths;
}

export interface CliDatabaseHooks {
  closeDatabase: typeof closeDatabase;
  initDatabase: typeof initDatabase;
}

interface CliContext {
  io: CliIO;
  output: OutputFormat;
  skills: CliSkillService;
}

interface SkillIdentifierResolution {
  identifier: string;
  skill: Skill;
}

interface SelectionChoice<T> {
  value: T;
  id: string;
  label: string;
  description?: string;
}

class CliError extends Error {
  code: string;

  exitCode: ExitCode;

  details?: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    exitCode: ExitCode,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "CliError";
    this.code = code;
    this.exitCode = exitCode;
    this.details = details;
  }
}

function defaultIO(): CliIO {
  return {
    stdout: (message) => process.stdout.write(`${message}\n`),
    stderr: (message) => process.stderr.write(`${message}\n`),
    stdin: process.stdin,
    isInteractive: Boolean(process.stdin.isTTY),
  };
}

function suppressConsoleNoise(): () => void {
  const originalLog = console.log;
  const originalInfo = console.info;
  const originalWarn = console.warn;

  console.log = () => undefined;
  console.info = () => undefined;
  console.warn = () => undefined;

  return () => {
    console.log = originalLog;
    console.info = originalInfo;
    console.warn = originalWarn;
  };
}

function toJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function cloneArgs(argv: string[]): string[] {
  return [...argv];
}

const ROOT_HELP = [
  "PromptHub CLI",
  "",
  "用于直接读写 PromptHub 本地数据库与技能仓库。默认输出 JSON；如需更易读的输出可加 `--output table`。",
  "",
  "用法:",
  "  prompthub [global options] <resource> <command> [args]",
  "",
  "资源:",
  "  prompt    管理 prompts",
  "  folder    管理 folders",
  "  rules     管理 rules",
  "  workspace 管理工作区导入导出",
  "  skill     管理 skills",
  "  mcp       管理 MCP servers",
  "  ai        管理 AI providers、models 和模型路由",
  "",
  "全局参数:",
  "  --data-dir <dir>        指定 PromptHub userData 目录",
  "  --app-data-dir <dir>    指定 appData 根目录（读取 data-path.json 时使用）",
  "  --output, -o <format>   输出格式：json | table，默认 json",
  "  --version, -v           显示 CLI 版本",
  "  --help, -h              显示帮助",
  "",
  "示例:",
  "  prompthub prompt list",
  "  prompthub --output table prompt search design --tags ui,landing",
  '  prompthub prompt create --title "Landing Hero" --user-prompt-file ./prompt.md',
  "  prompthub rules list",
  "  prompthub skill install ~/.claude/skills/my-skill",
  "  prompthub skill delete my-skill --purge-managed-repo",
  "  prompthub ai provider-add --provider openai --api-key $OPENAI_API_KEY --api-url https://api.openai.com/v1",
  "",
  "更多帮助:",
  "  prompthub prompt --help",
  "  prompthub rules --help",
  "  prompthub skill --help",
  "  prompthub mcp --help",
  "  prompthub ai --help",
].join("\n");

const PROMPT_HELP = [
  "Prompt 命令",
  "",
  "用法:",
  "  prompthub prompt list",
  "  prompthub prompt get <id|title|query>",
  "  prompthub prompt duplicate <id|title|query>",
  "  prompthub prompt versions <id|title|query>",
  "  prompthub prompt create-version <id|title|query> [--note <text>]",
  "  prompthub prompt delete-version <id|title|query> <version-id>",
  "  prompthub prompt diff <id|title|query> --from <n> --to <n>",
  "  prompthub prompt rollback <id|title|query> --version <n>",
  "  prompthub prompt use [id|title|query]",
  "  prompthub prompt copy [id|title|query] [--var name=value]...",
  "  prompthub prompt list-tags",
  "  prompthub prompt rename-tag <old> <new>",
  "  prompthub prompt delete-tag <tag>",
  "  prompthub prompt create --title <title> --user-prompt <text>",
  "  prompthub prompt update <id> [fields...]",
  "  prompthub prompt delete <id>",
  "  prompthub prompt search [keyword] [filters...]",
  "",
  "常用参数:",
  "  --title <text>",
  "  --visibility private|shared",
  "  --description <text>",
  "  --user-prompt <text> | --user-prompt-file <file>",
  "  --user-prompt-en <text> | --user-prompt-en-file <file>",
  "  --system-prompt <text> | --system-prompt-file <file>",
  "  --system-prompt-en <text> | --system-prompt-en-file <file>",
  "  --variables <json> | --variables-file <file>",
  "  --tags a,b",
  "  --images a,b",
  "  --videos a,b",
  "  --folder-id <id>",
  "  --prompt-type text|image|video",
  "  --favorite / --unfavorite",
  "  --pinned / --unpinned",
  "  --scope private|shared|all",
  "  --usage-count <n>",
  "  --last-ai-response <text> | --last-ai-response-file <file>",
  "  --sort-by title|createdAt|updatedAt|usageCount",
  "  --sort-order asc|desc",
  "  --limit <n> --offset <n>",
  "  --version <n>           用于 rollback 指定目标版本",
  "  --from <n> / --to <n>   用于 diff 指定版本区间",
  "  --note <text>           用于 create-version 添加版本备注",
  "",
  "示例:",
  "  prompthub prompt list",
  "  prompthub prompt get 2b8d...",
  "  prompthub prompt duplicate 2b8d...",
  "  prompthub prompt versions 2b8d...",
  '  prompthub prompt create-version 2b8d... --note "Before refactor"',
  "  prompthub prompt delete-version 2b8d... 91f1...",
  "  prompthub prompt diff 2b8d... --from 1 --to 3",
  "  prompthub prompt rollback 2b8d... --version 3",
  "  prompthub prompt use 2b8d...",
  "  prompthub prompt copy 2b8d... --var tone=direct --var audience=devs",
  "  prompthub prompt list-tags",
  "  prompthub prompt rename-tag seo marketing",
  '  prompthub prompt create --title "SEO Blog" --user-prompt-file ./seo.md --tags writing,seo',
  '  prompthub prompt update 2b8d... --favorite --title "SEO Blog v2"',
  "  prompthub --output table prompt search SEO --favorite",
].join("\n");

const SKILL_HELP = [
  "Skill 命令",
  "",
  "用法:",
  "  prompthub skill list",
  "  prompthub skill get <id|name>",
  "  prompthub skill install <github-url|local-dir|SKILL.md|json>",
  "  prompthub skill project-install [id|name|query] [--project <path>] [--target <skills-dir>] [--force]",
  "  prompthub skill install-project [id|name|query] [--project <path>] [--target <skills-dir>] [--force]",
  "  prompthub skill scan [custom-path...]",
  "  prompthub skill versions <id|name>",
  "  prompthub skill create-version <id|name> [--note <text>]",
  "  prompthub skill rollback <id|name> --version <n>",
  "  prompthub skill delete-version <id|name> <version-id>",
  "  prompthub skill export <id|name> --format skillmd|json",
  "  prompthub skill platforms",
  "  prompthub skill platform-status <id|name>",
  "  prompthub skill install-md <id|name> --platform <platform-id>",
  "  prompthub skill uninstall-md <id|name> --platform <platform-id>",
  "  prompthub skill repo-files <id|name>",
  "  prompthub skill repo-read <id|name> --path <relative-path>",
  "  prompthub skill repo-write <id|name> --path <relative-path> --content <text>",
  "  prompthub skill repo-delete <id|name> --path <relative-path>",
  "  prompthub skill repo-mkdir <id|name> --path <relative-path>",
  "  prompthub skill repo-rename <id|name> --from <old> --to <new>",
  "  prompthub skill sync-from-repo <id|name>",
  "  prompthub skill scan-safety <id|name>",
  "  prompthub skill delete <id|name> [options]",
  "  prompthub skill remove <id|name> [options]",
  "",
  "delete/remove 语义:",
  "  默认会删除 PromptHub 中的 skill 记录，并尝试从已支持平台卸载 SKILL.md。",
  "  不会默认删除本地源码目录；若目标 repo 位于 PromptHub 管理目录内，可额外加 --purge-managed-repo。",
  "",
  "删除参数:",
  "  --keep-platform-installs  不从 Claude/Cursor 等平台卸载",
  "  --purge-managed-repo      同时删除 PromptHub 管理目录中的本地 repo",
  "",
  "安装参数:",
  "  --name <text>             本地 SKILL.md/目录缺少 frontmatter name 时手动指定",
  "  --format skillmd|json     用于 export 指定导出格式",
  "  --platform <platform-id>  指定目标平台",
  "  --project <path>          项目根目录；默认当前工作目录",
  "  --target <path>           直接指定项目 skills 目标目录；默认 <project>/.agents/skills",
  "  --mode copy|symlink       项目安装模式；默认 copy",
  "  --force                   项目中已存在同名 Skill 时覆盖刷新",
  "  --path <relative-path>    指定 repo 内相对路径",
  "  --from <old> --to <new>   用于 repo-rename",
  "  --content <text> | --content-file <file>",
  "  --note <text>             用于 create-version 添加版本备注",
  "  --version <n>             用于 rollback 指定目标版本",
  "",
  "示例:",
  "  prompthub skill list",
  "  prompthub skill install https://github.com/foo/bar",
  "  prompthub skill install ~/.claude/skills/writer --name writer",
  "  prompthub skill project-install",
  "  prompthub skill project-install writer --force",
  "  prompthub skill versions writer",
  "  prompthub skill export writer --format skillmd",
  "  prompthub skill platform-status writer",
  "  prompthub skill delete writer --purge-managed-repo",
  "  prompthub skill remove writer --keep-platform-installs",
  "  prompthub --output table skill scan ~/.claude/skills",
].join("\n");

const MCP_HELP = [
  "MCP 命令",
  "",
  "用法:",
  "  prompthub mcp list",
  "  prompthub mcp get <id|name>",
  "  prompthub mcp market",
  "  prompthub mcp sources",
  "  prompthub mcp install [template-id|name|query]",
  "  prompthub mcp import <file>",
  "  prompthub mcp check [id|name]",
  "  prompthub mcp env-import <id|name> --file <.env> [--keys A,B]",
  "  prompthub mcp enable <id|name>",
  "  prompthub mcp disable <id|name>",
  "  prompthub mcp export --target <target> [--servers a,b]",
  "  prompthub mcp apply --preset <preset-id> [--servers id,name,query] [--force]",
  "  prompthub mcp apply --target <target> --path <file> [--servers id,name,query] [--force]",
  "  prompthub mcp remove --preset <preset-id> --servers id,name,query",
  "",
  "说明:",
  "  MCP CLI 读写与桌面端相同的 PromptHub MCP library。",
  "  env-import 只导入当前 MCP 需要的 key，或 --keys 明确指定的 key。",
  "  apply 默认拒绝覆盖目标配置中的外部同名 MCP；确认覆盖时使用 --force。",
].join("\n");

const FOLDER_HELP = [
  "Folder 命令",
  "",
  "用法:",
  "  prompthub folder list",
  "  prompthub folder get <id>",
  "  prompthub folder create --name <name>",
  "  prompthub folder update <id> [fields...]",
  "  prompthub folder delete <id>",
  "  prompthub folder reorder --ids <id1,id2,...>",
  "",
  "常用参数:",
  "  --name <text>",
  "  --icon <emoji>",
  "  --parent-id <id>",
  "  --order <n>",
  "  --private / --public",
  "  --ids a,b,c",
  "",
  "示例:",
  "  prompthub folder list",
  "  prompthub folder create --name Writing --icon ✍️",
  "  prompthub folder update 2b8d... --name Research --parent-id root-folder",
  "  prompthub folder reorder --ids folder-a,folder-b,folder-c",
].join("\n");

const WORKSPACE_HELP = [
  "Workspace 命令",
  "",
  "用法:",
  "  prompthub workspace export --file <path>",
  "  prompthub workspace import --file <path> [--force-clear]",
  "",
  "说明:",
  "  当前仅覆盖 prompts、folders、versions 三类核心数据。",
  "  import 默认要求目标数据库为空；使用 --force-clear 才会先清空现有核心数据。",
  "",
  "参数:",
  "  --file <path>",
  "  --force-clear",
  "",
  "示例:",
  "  prompthub workspace export --file ./prompthub-workspace.json",
  "  prompthub workspace import --file ./prompthub-workspace.json --force-clear",
].join("\n");

const RULES_HELP = [
  "Rules 命令",
  "",
  "用法:",
  "  prompthub rules list",
  "  prompthub rules scan",
  "  prompthub rules read [rule-id|name|query]",
  "  prompthub rules versions <rule-id|name|query>",
  "  prompthub rules version-read <rule-id|name|query> <version-id>",
  "  prompthub rules version-restore <rule-id|name|query> <version-id>",
  "  prompthub rules save <rule-id|name|query> --content <text>",
  "  prompthub rules rewrite <rule-id|name|query> --instruction <text> --api-key <key> --api-url <url> --model <model>",
  "  prompthub rules project-init [--name <name>] [--root-path <path>] [--id <id>]",
  "  prompthub rules add-project [--name <name>] [--root-path <path>] [--id <id>]",
  "  prompthub rules remove-project <project-id>",
  "  prompthub rules version-delete <rule-id> <version-id>",
  "  prompthub rules export --file <path>",
  "  prompthub rules import --file <path> [--replace]",
  "",
  "常用参数:",
  "  --content <text> | --content-file <file>",
  "  --instruction <text> | --instruction-file <file>",
  "  --api-key <text>",
  "  --api-url <url>",
  "  --model <text>",
  "  --provider <text>",
  "  --api-protocol openai|gemini|anthropic",
  "  --name <text>",
  "  --root-path <path>",
  "  --id <text>",
  "  --file <path>",
  "  --replace",
  "",
  "示例:",
  "  prompthub rules list",
  "  prompthub rules scan",
  "  prompthub rules versions claude-global",
  "  prompthub rules version-read claude-global abc123",
  "  prompthub rules version-restore claude-global abc123",
  '  prompthub rules save claude-global --content "# Team Claude rules"',
  '  prompthub rules rewrite claude-global --instruction "Tighten the tone" --api-key "$OPENAI_API_KEY" --api-url https://api.openai.com/v1 --model gpt-4o-mini',
  '  prompthub rules add-project --name "Docs Site" --root-path ./docs-site',
  "  prompthub rules remove-project docs-site",
  "  prompthub rules export --file ./prompthub-rules.json",
].join("\n");

function formatCell(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  if (typeof value === "boolean") {
    return value ? "yes" : "no";
  }
  return String(value);
}

function renderTable(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) {
    return "(empty)";
  }

  const columns = Array.from(
    rows.reduce((set, row) => {
      Object.keys(row).forEach((key) => set.add(key));
      return set;
    }, new Set<string>()),
  );

  // Pre-compute all formatted cells once (avoids double formatCell calls)
  const formattedCells = rows.map((row) =>
    columns.map((column) => formatCell(row[column])),
  );

  const widths = columns.map((column, colIndex) => {
    let max = column.length;
    for (const rowCells of formattedCells) {
      const len = rowCells[colIndex].length;
      if (len > max) max = len;
    }
    return max;
  });

  const renderLine = (cells: string[]) =>
    cells
      .map((cell, index) => cell.padEnd(widths[index], " "))
      .join("  ")
      .trimEnd();

  const header = renderLine(columns);
  const separator = widths.map((width) => "-".repeat(width)).join("  ");
  const body = formattedCells.map((rowCells) => renderLine(rowCells));

  return [header, separator, ...body].join("\n");
}

function emitSuccess(
  context: CliContext,
  payload: unknown,
  tableRows?: Array<Record<string, unknown>>,
): void {
  if (context.output === "table") {
    if (tableRows) {
      context.io.stdout(renderTable(tableRows));
      return;
    }
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      context.io.stdout(
        renderTable(
          Object.entries(payload as Record<string, unknown>).map(
            ([key, value]) => ({
              field: key,
              value,
            }),
          ),
        ),
      );
      return;
    }
  }

  context.io.stdout(toJson(payload));
}

function emitError(context: CliContext, error: CliError): void {
  if (context.output === "json") {
    context.io.stderr(
      toJson({
        error: {
          code: error.code,
          message: error.message,
          exitCode: error.exitCode,
          details: error.details,
        },
      }),
    );
    return;
  }

  const detailText = error.details ? ` details=${toJson(error.details)}` : "";
  context.io.stderr(
    `[${error.code}] exit=${error.exitCode} ${error.message}${detailText}`,
  );
}

function mapCoreMcpError(error: CoreMcpError): CliError {
  const exitCode =
    error.code === "TARGET_CONFLICT"
      ? EXIT_CODES.CONFLICT
      : error.code === "NOT_FOUND"
        ? EXIT_CODES.NOT_FOUND
        : EXIT_CODES.USAGE;
  return new CliError(error.code, error.message, exitCode);
}

function takeOption(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  const nextValue = args[index + 1];
  const looksLikeOption =
    nextValue?.startsWith("--") &&
    !nextValue.includes("\n") &&
    !nextValue.includes("\r");
  if (index === args.length - 1 || looksLikeOption) {
    throw new CliError("USAGE_ERROR", `${name} 需要一个值`, EXIT_CODES.USAGE);
  }
  const [value] = args.splice(index, 2).slice(1);
  return value;
}

function takeFlag(args: string[], name: string): boolean {
  const index = args.indexOf(name);
  if (index === -1) {
    return false;
  }
  args.splice(index, 1);
  return true;
}

function ensureNoUnknownOptions(args: string[]): void {
  const unknownOptions = args.filter((arg) => arg.startsWith("--"));
  if (unknownOptions.length > 0) {
    throw new CliError(
      "USAGE_ERROR",
      `未知参数: ${unknownOptions.join(", ")}`,
      EXIT_CODES.USAGE,
    );
  }
}

function requirePositional(
  args: string[],
  index: number,
  label: string,
): string {
  const value = args[index];
  if (!value) {
    throw new CliError("USAGE_ERROR", `缺少参数: ${label}`, EXIT_CODES.USAGE);
  }
  return value;
}

function optionalPositional(args: string[], index: number): string | undefined {
  const value = args[index]?.trim();
  return value && !value.startsWith("-") ? value : undefined;
}

function parseCsv(value?: string): string[] | undefined {
  if (!value) {
    return undefined;
  }
  const items = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length > 0 ? items : undefined;
}

function parseRepeatedOption(args: string[], name: string): string[] {
  const values: string[] = [];
  while (true) {
    const value = takeOption(args, name);
    if (value === undefined) {
      break;
    }
    values.push(value);
  }
  return values;
}

function parseNumberOption(
  value: string | undefined,
  label: string,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new CliError(
      "USAGE_ERROR",
      `${label} 必须是非负整数`,
      EXIT_CODES.USAGE,
    );
  }
  return parsed;
}

function parsePositiveNumberOption(
  value: string | undefined,
  label: string,
): number | undefined {
  const parsed = parseNumberOption(value, label);
  if (parsed !== undefined && parsed < 1) {
    throw new CliError(
      "USAGE_ERROR",
      `${label} 必须是正整数`,
      EXIT_CODES.USAGE,
    );
  }
  return parsed;
}

function parsePromptVisibilityOption(
  value: string | undefined,
  label: string,
): "private" | "shared" | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value !== "private" && value !== "shared") {
    throw new CliError(
      "USAGE_ERROR",
      `${label} 必须是 private|shared`,
      EXIT_CODES.USAGE,
    );
  }
  return value;
}

function parsePromptScopeOption(
  value: string | undefined,
): SearchQuery["scope"] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value !== "private" && value !== "shared" && value !== "all") {
    throw new CliError(
      "USAGE_ERROR",
      "--scope 必须是 private|shared|all",
      EXIT_CODES.USAGE,
    );
  }
  return value;
}

function parsePromptVariablesMap(args: string[]): Record<string, string> {
  const entries = parseRepeatedOption(args, "--var");
  const result: Record<string, string> = {};

  for (const entry of entries) {
    const separatorIndex = entry.indexOf("=");
    if (separatorIndex <= 0) {
      throw new CliError(
        "USAGE_ERROR",
        "--var 需要 name=value 格式",
        EXIT_CODES.USAGE,
      );
    }

    const name = entry.slice(0, separatorIndex).trim();
    const value = entry.slice(separatorIndex + 1);
    if (!name) {
      throw new CliError(
        "USAGE_ERROR",
        "--var 需要非空变量名",
        EXIT_CODES.USAGE,
      );
    }

    result[name] = value;
  }

  return result;
}

function readTextOption(
  args: string[],
  optionName: string,
  fileOptionName: string,
): string | undefined {
  const directValue = takeOption(args, optionName);
  const fileValue = takeOption(args, fileOptionName);

  if (directValue !== undefined && fileValue !== undefined) {
    throw new CliError(
      "USAGE_ERROR",
      `${optionName} 和 ${fileOptionName} 不能同时使用`,
      EXIT_CODES.USAGE,
    );
  }

  if (fileValue !== undefined) {
    try {
      return fs.readFileSync(path.resolve(fileValue), "utf8");
    } catch (error) {
      throw new CliError(
        "IO_ERROR",
        `读取文件失败: ${fileValue}`,
        EXIT_CODES.IO,
        { cause: error instanceof Error ? error.message : String(error) },
      );
    }
  }

  return directValue;
}

function readJsonOption(
  args: string[],
  optionName: string,
  fileOptionName: string,
): unknown {
  const raw = readTextOption(args, optionName, fileOptionName);
  if (raw === undefined) {
    return undefined;
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new CliError(
      "USAGE_ERROR",
      `${optionName} / ${fileOptionName} 需要合法 JSON`,
      EXIT_CODES.USAGE,
      { cause: error instanceof Error ? error.message : String(error) },
    );
  }
}

function readRequiredTextFile(filePath: string): string {
  try {
    return fs.readFileSync(path.resolve(filePath), "utf8");
  } catch (error) {
    throw new CliError("IO_ERROR", `读取文件失败: ${filePath}`, EXIT_CODES.IO, {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}

function writeRequiredTextFile(filePath: string, content: string): void {
  try {
    const resolved = path.resolve(filePath);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, content, "utf8");
  } catch (error) {
    throw new CliError("IO_ERROR", `写入文件失败: ${filePath}`, EXIT_CODES.IO, {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}

function parseWorkspaceBundle(text: string): CliWorkspaceBundle {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new CliError(
      "USAGE_ERROR",
      "workspace import 需要合法 JSON 文件",
      EXIT_CODES.USAGE,
      { cause: error instanceof Error ? error.message : String(error) },
    );
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new CliError(
      "USAGE_ERROR",
      "workspace import 文件格式不正确",
      EXIT_CODES.USAGE,
    );
  }

  const record = parsed as Record<string, unknown>;
  if (
    record.kind !== "prompthub-cli-workspace" ||
    record.version !== 1 ||
    !Array.isArray(record.prompts) ||
    !Array.isArray(record.folders) ||
    !Array.isArray(record.versions)
  ) {
    throw new CliError(
      "USAGE_ERROR",
      "workspace import 文件格式不受支持",
      EXIT_CODES.USAGE,
    );
  }

  return record as unknown as CliWorkspaceBundle;
}

function parseRulesBundle(text: string): CliRulesBundle {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new CliError(
      "USAGE_ERROR",
      "rules import 需要合法 JSON 文件",
      EXIT_CODES.USAGE,
      { cause: error instanceof Error ? error.message : String(error) },
    );
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new CliError(
      "USAGE_ERROR",
      "rules import 文件格式不正确",
      EXIT_CODES.USAGE,
    );
  }

  const record = parsed as Record<string, unknown>;
  if (
    record.kind !== "prompthub-cli-rules" ||
    record.version !== 1 ||
    !Array.isArray(record.records)
  ) {
    throw new CliError(
      "USAGE_ERROR",
      "rules import 文件格式不受支持",
      EXIT_CODES.USAGE,
    );
  }

  return record as unknown as CliRulesBundle;
}

function parseVariableType(value: unknown, label: string): Variable["type"] {
  if (
    value === "text" ||
    value === "textarea" ||
    value === "number" ||
    value === "select"
  ) {
    return value;
  }

  throw new CliError(
    "USAGE_ERROR",
    `${label}.type 必须是 text|textarea|number|select`,
    EXIT_CODES.USAGE,
  );
}

function parseOptionalStringValue(
  value: unknown,
  label: string,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new CliError(
      "USAGE_ERROR",
      `${label} 必须是字符串`,
      EXIT_CODES.USAGE,
    );
  }
  return value;
}

function parseOptionalStringArrayValue(
  value: unknown,
  label: string,
): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new CliError(
      "USAGE_ERROR",
      `${label} 必须是字符串数组`,
      EXIT_CODES.USAGE,
    );
  }
  return value;
}

function parseVariablesOption(args: string[]): Variable[] | undefined {
  const value = readJsonOption(args, "--variables", "--variables-file");
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new CliError(
      "USAGE_ERROR",
      "--variables / --variables-file 必须是 JSON 数组",
      EXIT_CODES.USAGE,
    );
  }

  return value.map((item, index) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      throw new CliError(
        "USAGE_ERROR",
        `variables[${index}] 必须是对象`,
        EXIT_CODES.USAGE,
      );
    }

    const record = item as Record<string, unknown>;
    const name = parseOptionalStringValue(
      record.name,
      `variables[${index}].name`,
    );
    if (!name?.trim()) {
      throw new CliError(
        "USAGE_ERROR",
        `variables[${index}].name 不能为空`,
        EXIT_CODES.USAGE,
      );
    }
    if (typeof record.required !== "boolean") {
      throw new CliError(
        "USAGE_ERROR",
        `variables[${index}].required 必须是布尔值`,
        EXIT_CODES.USAGE,
      );
    }

    return {
      name,
      type: parseVariableType(record.type, `variables[${index}]`),
      label: parseOptionalStringValue(
        record.label,
        `variables[${index}].label`,
      ),
      defaultValue: parseOptionalStringValue(
        record.defaultValue,
        `variables[${index}].defaultValue`,
      ),
      options: parseOptionalStringArrayValue(
        record.options,
        `variables[${index}].options`,
      ),
      required: record.required,
    };
  });
}

function resolvePromptCreateArgs(args: string[]): CreatePromptDTO {
  const title = takeOption(args, "--title");
  const visibility = parsePromptVisibilityOption(
    takeOption(args, "--visibility"),
    "--visibility",
  );
  const description = takeOption(args, "--description");
  const promptType = takeOption(args, "--prompt-type") as
    | "text"
    | "image"
    | "video"
    | undefined;
  const folderId = takeOption(args, "--folder-id");
  const source = takeOption(args, "--source");
  const notes = takeOption(args, "--notes");
  const tags = parseCsv(takeOption(args, "--tags"));
  const images = parseCsv(takeOption(args, "--images"));
  const videos = parseCsv(takeOption(args, "--videos"));
  const variables = parseVariablesOption(args);
  const systemPrompt = readTextOption(
    args,
    "--system-prompt",
    "--system-prompt-file",
  );
  const systemPromptEn = readTextOption(
    args,
    "--system-prompt-en",
    "--system-prompt-en-file",
  );
  const userPrompt = readTextOption(
    args,
    "--user-prompt",
    "--user-prompt-file",
  );
  const userPromptEn = readTextOption(
    args,
    "--user-prompt-en",
    "--user-prompt-en-file",
  );

  ensureNoUnknownOptions(args);

  if (!title?.trim()) {
    throw new CliError(
      "USAGE_ERROR",
      "prompt create 需要 --title",
      EXIT_CODES.USAGE,
    );
  }
  if (!userPrompt?.trim()) {
    throw new CliError(
      "USAGE_ERROR",
      "prompt create 需要 --user-prompt 或 --user-prompt-file",
      EXIT_CODES.USAGE,
    );
  }

  return {
    visibility,
    title: title.trim(),
    description,
    promptType,
    folderId,
    source,
    notes,
    tags,
    images,
    videos,
    variables,
    systemPrompt,
    systemPromptEn,
    userPrompt,
    userPromptEn,
  };
}

function resolvePromptUpdateArgs(args: string[]): UpdatePromptDTO {
  const title = takeOption(args, "--title");
  const visibility = parsePromptVisibilityOption(
    takeOption(args, "--visibility"),
    "--visibility",
  );
  const description = takeOption(args, "--description");
  const promptType = takeOption(args, "--prompt-type") as
    | "text"
    | "image"
    | "video"
    | undefined;
  const folderId = takeOption(args, "--folder-id");
  const source = takeOption(args, "--source");
  const notes = takeOption(args, "--notes");
  const tags = parseCsv(takeOption(args, "--tags"));
  const images = parseCsv(takeOption(args, "--images"));
  const videos = parseCsv(takeOption(args, "--videos"));
  const variables = parseVariablesOption(args);
  const systemPrompt = readTextOption(
    args,
    "--system-prompt",
    "--system-prompt-file",
  );
  const systemPromptEn = readTextOption(
    args,
    "--system-prompt-en",
    "--system-prompt-en-file",
  );
  const userPrompt = readTextOption(
    args,
    "--user-prompt",
    "--user-prompt-file",
  );
  const userPromptEn = readTextOption(
    args,
    "--user-prompt-en",
    "--user-prompt-en-file",
  );
  const usageCount = parseNumberOption(
    takeOption(args, "--usage-count"),
    "--usage-count",
  );
  const lastAiResponse = readTextOption(
    args,
    "--last-ai-response",
    "--last-ai-response-file",
  );
  const favorite = takeFlag(args, "--favorite")
    ? true
    : takeFlag(args, "--unfavorite")
      ? false
      : undefined;
  const pinned = takeFlag(args, "--pinned")
    ? true
    : takeFlag(args, "--unpinned")
      ? false
      : undefined;

  ensureNoUnknownOptions(args);

  const data: UpdatePromptDTO = {
    ...(visibility !== undefined && { visibility }),
    ...(title !== undefined && { title }),
    ...(description !== undefined && { description }),
    ...(promptType !== undefined && { promptType }),
    ...(folderId !== undefined && { folderId }),
    ...(source !== undefined && { source }),
    ...(notes !== undefined && { notes }),
    ...(tags !== undefined && { tags }),
    ...(images !== undefined && { images }),
    ...(videos !== undefined && { videos }),
    ...(variables !== undefined && { variables }),
    ...(systemPrompt !== undefined && { systemPrompt }),
    ...(systemPromptEn !== undefined && { systemPromptEn }),
    ...(userPrompt !== undefined && { userPrompt }),
    ...(userPromptEn !== undefined && { userPromptEn }),
    ...(favorite !== undefined && { isFavorite: favorite }),
    ...(pinned !== undefined && { isPinned: pinned }),
    ...(usageCount !== undefined && { usageCount }),
    ...(lastAiResponse !== undefined && { lastAiResponse }),
  };

  if (Object.keys(data).length === 0) {
    throw new CliError(
      "USAGE_ERROR",
      "prompt update 至少需要一个更新字段",
      EXIT_CODES.USAGE,
    );
  }

  return data;
}

function resolvePromptSearchArgs(args: string[]): SearchQuery {
  const keyword =
    args[0] && !args[0].startsWith("--") ? args.shift() : undefined;
  const scope = parsePromptScopeOption(takeOption(args, "--scope"));
  const folderId = takeOption(args, "--folder-id");
  const tags = parseCsv(takeOption(args, "--tags"));
  const sortBy = takeOption(args, "--sort-by") as SearchQuery["sortBy"];
  const sortOrder = takeOption(
    args,
    "--sort-order",
  ) as SearchQuery["sortOrder"];
  const limit = parseNumberOption(takeOption(args, "--limit"), "--limit");
  const offset = parseNumberOption(takeOption(args, "--offset"), "--offset");
  const isFavorite = takeFlag(args, "--favorite")
    ? true
    : takeFlag(args, "--unfavorite")
      ? false
      : undefined;

  ensureNoUnknownOptions(args);

  return {
    scope,
    keyword,
    folderId,
    tags,
    sortBy,
    sortOrder,
    limit,
    offset,
    isFavorite,
  };
}

function resolveSkill(skillDb: SkillDB, identifier: string) {
  return skillDb.getById(identifier) ?? skillDb.getByName(identifier);
}

function parseFolderIdsOption(args: string[]): string[] {
  const ids = parseCsv(takeOption(args, "--ids"));
  ensureNoUnknownOptions(args);

  if (!ids || ids.length === 0) {
    throw new CliError(
      "USAGE_ERROR",
      "folder reorder 需要 --ids",
      EXIT_CODES.USAGE,
    );
  }

  return ids;
}

function resolveFolderCreateArgs(args: string[]): CreateFolderDTO {
  const name = takeOption(args, "--name");
  const icon = takeOption(args, "--icon");
  const parentId = takeOption(args, "--parent-id");
  const isPrivate = takeFlag(args, "--private")
    ? true
    : takeFlag(args, "--public")
      ? false
      : undefined;
  ensureNoUnknownOptions(args);

  if (!name?.trim()) {
    throw new CliError(
      "USAGE_ERROR",
      "folder create 需要 --name",
      EXIT_CODES.USAGE,
    );
  }

  return {
    name: name.trim(),
    icon,
    parentId,
    isPrivate,
  };
}

function resolveFolderUpdateArgs(args: string[]): UpdateFolderDTO {
  const name = takeOption(args, "--name");
  const icon = takeOption(args, "--icon");
  const parentId = takeOption(args, "--parent-id");
  const order = parseNumberOption(takeOption(args, "--order"), "--order");
  const isPrivate = takeFlag(args, "--private")
    ? true
    : takeFlag(args, "--public")
      ? false
      : undefined;
  ensureNoUnknownOptions(args);

  const data: UpdateFolderDTO = {
    ...(name !== undefined && { name }),
    ...(icon !== undefined && { icon }),
    ...(parentId !== undefined && { parentId }),
    ...(order !== undefined && { order }),
    ...(isPrivate !== undefined && { isPrivate }),
  };

  if (Object.keys(data).length === 0) {
    throw new CliError(
      "USAGE_ERROR",
      "folder update 至少需要一个更新字段",
      EXIT_CODES.USAGE,
    );
  }

  return data;
}

function resolveWorkspaceFileOption(
  args: string[],
  commandName: "export" | "import",
): string {
  const filePath = takeOption(args, "--file");
  if (!filePath?.trim()) {
    throw new CliError(
      "USAGE_ERROR",
      `workspace ${commandName} 需要 --file`,
      EXIT_CODES.USAGE,
    );
  }
  return filePath;
}

function resolveRulesFileOption(
  args: string[],
  commandName: "export" | "import",
): string {
  const filePath = takeOption(args, "--file");
  if (!filePath?.trim()) {
    throw new CliError(
      "USAGE_ERROR",
      `rules ${commandName} 需要 --file`,
      EXIT_CODES.USAGE,
    );
  }

  return filePath;
}

function normalizeProjectId(input: string): string {
  return input.startsWith("project:") ? input.slice("project:".length) : input;
}

function createWorkspaceBundle(
  promptDb: PromptDB,
  folderDb: FolderDB,
): CliWorkspaceBundle {
  const prompts = promptDb.getAll();
  const versions = prompts.flatMap((prompt) => promptDb.getVersions(prompt.id));

  return {
    kind: "prompthub-cli-workspace",
    version: 1,
    exportedAt: new Date().toISOString(),
    prompts,
    folders: folderDb.getAll(),
    versions,
  };
}

function createRulesBundle(records: RuleBackupRecord[]): CliRulesBundle {
  return {
    kind: "prompthub-cli-rules",
    version: 1,
    exportedAt: new Date().toISOString(),
    records,
  };
}

function formatRuleVersionSnapshot(
  version: RuleVersionSnapshot,
): Record<string, unknown> {
  return {
    id: version.id,
    savedAt: version.savedAt,
    source: version.source,
    content: version.content,
  };
}

function resolveSkillIdentifier(
  skillDb: SkillDB,
  identifier: string,
): SkillIdentifierResolution {
  const skill = resolveSkill(skillDb, identifier);
  if (!skill) {
    throw new CliError(
      "NOT_FOUND",
      `Skill 不存在: ${identifier}`,
      EXIT_CODES.NOT_FOUND,
    );
  }

  return { identifier, skill };
}

function resolveRuleRewriteArgs(
  args: string[],
  currentContent: string,
  fileName: string,
  platformName: string,
): RuleRewriteRequest {
  const instruction = readTextOption(
    args,
    "--instruction",
    "--instruction-file",
  );
  const apiKey = takeOption(args, "--api-key");
  const apiUrl = takeOption(args, "--api-url");
  const model = takeOption(args, "--model");
  const provider = takeOption(args, "--provider") ?? "openai";
  const apiProtocol = takeOption(args, "--api-protocol");
  ensureNoUnknownOptions(args);

  if (!instruction?.trim()) {
    throw new CliError(
      "USAGE_ERROR",
      "rules rewrite 需要 --instruction 或 --instruction-file",
      EXIT_CODES.USAGE,
    );
  }

  if (!apiKey?.trim() || !apiUrl?.trim() || !model?.trim()) {
    throw new CliError(
      "USAGE_ERROR",
      "rules rewrite 需要 --api-key、--api-url 和 --model",
      EXIT_CODES.USAGE,
    );
  }

  if (
    apiProtocol !== undefined &&
    apiProtocol !== "openai" &&
    apiProtocol !== "gemini" &&
    apiProtocol !== "anthropic"
  ) {
    throw new CliError(
      "USAGE_ERROR",
      "--api-protocol 必须是 openai|gemini|anthropic",
      EXIT_CODES.USAGE,
    );
  }

  return {
    instruction: instruction.trim(),
    currentContent,
    fileName,
    platformName,
    aiConfig: {
      apiKey: apiKey.trim(),
      apiUrl: apiUrl.trim(),
      model: model.trim(),
      provider: provider.trim() || "openai",
      apiProtocol:
        apiProtocol === "gemini"
          ? "gemini"
          : apiProtocol === "anthropic"
            ? "anthropic"
            : "openai",
    },
  };
}

function clearWorkspaceCoreData(db: ReturnType<typeof getDatabase>): void {
  const transaction = db.transaction(() => {
    db.prepare("DELETE FROM prompt_versions").run();
    db.prepare("DELETE FROM prompts").run();
    db.prepare("DELETE FROM folders").run();
  });
  transaction();
}

function promptTableRows(prompts: Prompt[]): Array<Record<string, unknown>> {
  return prompts.map((prompt) => ({
    id: prompt.id,
    title: prompt.title,
    type: prompt.promptType || "text",
    favorite: prompt.isFavorite,
    pinned: prompt.isPinned,
    tags: prompt.tags,
    updatedAt: prompt.updatedAt,
  }));
}

function folderTableRows(folders: Folder[]): Array<Record<string, unknown>> {
  return folders.map((folder) => ({
    id: folder.id,
    name: folder.name,
    icon: folder.icon,
    parentId: folder.parentId,
    order: folder.order,
    private: folder.isPrivate ?? false,
    updatedAt: folder.updatedAt,
  }));
}

function promptVersionTableRows(
  versions: PromptVersion[],
): Array<Record<string, unknown>> {
  return versions.map((version) => ({
    id: version.id,
    version: version.version,
    note: version.note,
    createdAt: version.createdAt,
  }));
}

function promptTagTableRows(tags: string[]): Array<Record<string, unknown>> {
  return tags.map((tag) => ({ tag }));
}

function ruleTableRows(
  rules: RuleFileDescriptor[],
): Array<Record<string, unknown>> {
  return rules.map((rule) => ({
    id: rule.id,
    platform: rule.platformId,
    name: rule.name,
    group: rule.group,
    syncStatus: rule.syncStatus,
    exists: rule.exists,
    projectRootPath: rule.projectRootPath ?? "",
    path: rule.path,
  }));
}

function ruleVersionTableRows(
  versions: RuleVersionSnapshot[],
): Array<Record<string, unknown>> {
  return versions.map((version) => ({
    id: version.id,
    source: version.source,
    savedAt: version.savedAt,
    preview: version.content.split("\n")[0] ?? "",
  }));
}

function promptDiffTableRows(
  diff: PromptDiffResult,
): Array<Record<string, unknown>> {
  return diff.fields.map((field) => ({
    field: field.field,
    from: field.from,
    to: field.to,
  }));
}

function pushPromptDiff(
  fields: PromptDiffResult["fields"],
  field: PromptDiffField,
  from: string | null | undefined,
  to: string | null | undefined,
): void {
  const fromValue = from ?? "";
  const toValue = to ?? "";
  if (fromValue !== toValue) {
    fields.push({ field, from: fromValue, to: toValue });
  }
}

function diffPromptVersions(
  from: PromptVersion,
  to: PromptVersion,
): PromptDiffResult {
  const fields: PromptDiffResult["fields"] = [];
  pushPromptDiff(fields, "systemPrompt", from.systemPrompt, to.systemPrompt);
  pushPromptDiff(
    fields,
    "systemPromptEn",
    from.systemPromptEn,
    to.systemPromptEn,
  );
  pushPromptDiff(fields, "userPrompt", from.userPrompt, to.userPrompt);
  pushPromptDiff(fields, "userPromptEn", from.userPromptEn, to.userPromptEn);
  pushPromptDiff(
    fields,
    "variables",
    JSON.stringify(from.variables),
    JSON.stringify(to.variables),
  );
  pushPromptDiff(fields, "aiResponse", from.aiResponse, to.aiResponse);
  return { from, to, fields };
}

function resolvePromptVersionDiffArgs(args: string[]): {
  from: number;
  to: number;
} {
  const from = parsePositiveNumberOption(takeOption(args, "--from"), "--from");
  const to = parsePositiveNumberOption(takeOption(args, "--to"), "--to");
  ensureNoUnknownOptions(args);

  if (from === undefined || to === undefined) {
    throw new CliError(
      "USAGE_ERROR",
      "prompt diff 需要 --from 和 --to",
      EXIT_CODES.USAGE,
    );
  }

  return { from, to };
}

function duplicatePrompt(promptDb: PromptDB, id: string): Prompt {
  const existing = requirePrompt(promptDb, id);
  return promptDb.create({
    visibility: existing.visibility,
    title: `${existing.title} (Duplicate)`,
    description: existing.description ?? undefined,
    promptType: existing.promptType,
    systemPrompt: existing.systemPrompt ?? undefined,
    systemPromptEn: existing.systemPromptEn ?? undefined,
    userPrompt: existing.userPrompt,
    userPromptEn: existing.userPromptEn ?? undefined,
    variables: existing.variables,
    tags: existing.tags,
    folderId: existing.folderId ?? undefined,
    images: existing.images,
    videos: existing.videos,
    source: existing.source ?? undefined,
    notes: existing.notes ?? undefined,
  });
}

function renderPromptCopy(
  prompt: Prompt,
  variables: Record<string, string>,
): string {
  let content = prompt.userPrompt;
  for (const [key, value] of Object.entries(variables)) {
    content = content.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
  }
  return content;
}

function requirePrompt(promptDb: PromptDB, id: string): Prompt {
  const prompt = promptDb.getById(id);
  if (!prompt) {
    throw new CliError(
      "NOT_FOUND",
      `Prompt 不存在: ${id}`,
      EXIT_CODES.NOT_FOUND,
    );
  }

  return prompt;
}

async function skillTableRows(
  skillService: CliSkillService,
  skills: Skill[],
): Promise<Array<Record<string, unknown>>> {
  return Promise.all(
    skills.map(async (skill) => ({
      id: skill.id,
      name: skill.name,
      protocol: skill.protocol_type,
      author: skill.author,
      version: skill.version,
      favorite: skill.is_favorite,
      managedRepo: skill.local_repo_path
        ? await skillService.isManagedRepoPath(skill.local_repo_path)
        : false,
      updatedAt: skill.updated_at,
    })),
  );
}

function skillVersionTableRows(
  versions: import("@prompthub/shared/types").SkillVersion[],
): Array<Record<string, unknown>> {
  return versions.map((version) => ({
    id: version.id,
    version: version.version,
    note: version.note,
    createdAt: version.createdAt,
  }));
}

function skillPlatformRows(
  platforms: SkillPlatform[],
  detected?: string[],
): Array<Record<string, unknown>> {
  const detectedSet = new Set(detected ?? []);
  return platforms.map((platform) => ({
    id: platform.id,
    name: platform.name,
    installed: detectedSet.has(platform.id),
  }));
}

function sortSkillChoices(skills: Skill[]): Skill[] {
  return [...skills].sort((a, b) => {
    if (a.is_favorite !== b.is_favorite) {
      return a.is_favorite ? -1 : 1;
    }
    if (a.updated_at !== b.updated_at) {
      return b.updated_at - a.updated_at;
    }
    return a.name.localeCompare(b.name);
  });
}

function rankSearchValues(
  values: Array<string | undefined>,
  query: string,
): number | null {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return null;
  }

  let best: number | null = null;
  for (const value of values) {
    const normalizedValue = value?.trim().toLowerCase();
    if (!normalizedValue) {
      continue;
    }
    const rank =
      normalizedValue === normalizedQuery
        ? 0
        : normalizedValue.startsWith(normalizedQuery)
          ? 1
          : normalizedValue.includes(normalizedQuery)
            ? 2
            : null;
    if (rank !== null && (best === null || rank < best)) {
      best = rank;
    }
  }

  return best;
}

function findRankedMatches<T>(
  items: T[],
  query: string,
  values: (item: T) => Array<string | undefined>,
  label: (item: T) => string,
): T[] {
  return items
    .map((item) => ({ item, rank: rankSearchValues(values(item), query) }))
    .filter((entry): entry is { item: T; rank: number } => entry.rank !== null)
    .sort(
      (a, b) => a.rank - b.rank || label(a.item).localeCompare(label(b.item)),
    )
    .map((entry) => entry.item);
}

function hasExactSearchMatch(
  values: Array<string | undefined>,
  query: string,
): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  return values.some(
    (value) => value?.trim().toLowerCase() === normalizedQuery,
  );
}

function findSkillMatches(skills: Skill[], query: string): Skill[] {
  return findRankedMatches(
    skills,
    query,
    (skill) => [skill.id, skill.name, skill.description ?? undefined],
    (skill) => skill.name,
  );
}

function readLineFromInput(input: Readable): Promise<string> {
  input.setEncoding("utf8");
  return new Promise((resolve, reject) => {
    let buffer = "";

    const cleanup = () => {
      input.off("data", onData);
      input.off("end", onEnd);
      input.off("error", onError);
    };
    const finish = (value: string) => {
      cleanup();
      resolve(value);
    };
    const onData = (chunk: string | Buffer) => {
      buffer += chunk.toString();
      const lineEnd = buffer.search(/\r?\n/);
      if (lineEnd !== -1) {
        finish(buffer.slice(0, lineEnd));
      }
    };
    const onEnd = () => finish(buffer);
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };

    input.on("data", onData);
    input.once("end", onEnd);
    input.once("error", onError);
    input.resume();
  });
}

async function selectSkillFromTerminal(
  context: CliContext,
  skills: Skill[],
  query?: string,
): Promise<Skill> {
  const choices = sortSkillChoices(skills);
  const title = query?.trim()
    ? `选择要安装到项目的 Skill（匹配 "${query.trim()}"）：`
    : "选择要安装到项目的 Skill：";
  return selectFromTerminal(context, title, choices.map(skillChoice), {
    emptyMessage: "没有可安装的 My Skills",
    missingMessage:
      "缺少 skill id/name；在交互式终端中可省略并选择，非交互调用请传入 skill 名称或查询词",
    invalidLabel: "Skill 编号",
  });
}

function skillChoice(skill: Skill): SelectionChoice<Skill> {
  return {
    value: skill,
    id: skill.id,
    label: skill.name,
    description: skill.description ?? undefined,
  };
}

async function selectFromTerminal<T>(
  context: CliContext,
  title: string,
  choices: SelectionChoice<T>[],
  options: {
    emptyMessage: string;
    missingMessage: string;
    invalidLabel: string;
  },
): Promise<T> {
  if (choices.length === 0) {
    throw new CliError("NOT_FOUND", options.emptyMessage, EXIT_CODES.NOT_FOUND);
  }

  if (!context.io.isInteractive || !context.io.stdin) {
    throw new CliError("USAGE_ERROR", options.missingMessage, EXIT_CODES.USAGE);
  }

  context.io.stderr(title);
  choices.forEach((choice, index) => {
    const description = choice.description ? ` - ${choice.description}` : "";
    context.io.stderr(`  ${index + 1}. ${choice.label}${description}`);
  });
  context.io.stderr("输入编号：");

  const answer = (await readLineFromInput(context.io.stdin)).trim();
  const selectedIndex = Number.parseInt(answer, 10);
  if (
    !Number.isInteger(selectedIndex) ||
    selectedIndex < 1 ||
    selectedIndex > choices.length
  ) {
    throw new CliError(
      "USAGE_ERROR",
      `无效的 ${options.invalidLabel}: ${answer || "(empty)"}`,
      EXIT_CODES.USAGE,
    );
  }

  return choices[selectedIndex - 1].value;
}

async function resolveProjectInstallSkill(
  context: CliContext,
  skillDb: SkillDB,
  identifier?: string,
): Promise<Skill> {
  const skills = skillDb.getAll();
  if (!identifier?.trim()) {
    return selectSkillFromTerminal(context, skills);
  }

  const matches = findSkillMatches(skills, identifier);
  if (matches.length === 0) {
    throw new CliError(
      "NOT_FOUND",
      `Skill 不存在或没有匹配项: ${identifier}`,
      EXIT_CODES.NOT_FOUND,
    );
  }
  if (matches.length === 1) {
    return matches[0];
  }

  const exactMatches = matches.filter(
    (skill) =>
      skill.id.toLowerCase() === identifier.toLowerCase() ||
      skill.name.toLowerCase() === identifier.toLowerCase(),
  );
  if (exactMatches.length === 1) {
    return exactMatches[0];
  }

  if (context.io.isInteractive) {
    return selectSkillFromTerminal(context, matches, identifier);
  }

  throw new CliError(
    "CONFLICT",
    `Skill 查询匹配多个结果: ${identifier}`,
    EXIT_CODES.CONFLICT,
    {
      candidates: matches.map((skill) => ({ id: skill.id, name: skill.name })),
    },
  );
}

function promptChoice(prompt: Prompt): SelectionChoice<Prompt> {
  const description = prompt.description || prompt.tags.join(", ") || undefined;
  return {
    value: prompt,
    id: prompt.id,
    label: prompt.title,
    description,
  };
}

function promptSearchValues(prompt: Prompt): Array<string | undefined> {
  return [
    prompt.id,
    prompt.title,
    prompt.description ?? undefined,
    ...prompt.tags,
  ];
}

function sortPromptChoices(prompts: Prompt[]): Prompt[] {
  return [...prompts].sort((a, b) => {
    if (a.isPinned !== b.isPinned) {
      return a.isPinned ? -1 : 1;
    }
    if (a.isFavorite !== b.isFavorite) {
      return a.isFavorite ? -1 : 1;
    }
    if (a.updatedAt !== b.updatedAt) {
      return b.updatedAt.localeCompare(a.updatedAt);
    }
    return a.title.localeCompare(b.title);
  });
}

async function resolvePromptIdentifier(
  context: CliContext,
  promptDb: PromptDB,
  identifier: string | undefined,
): Promise<Prompt> {
  const prompts = promptDb.getAll();
  if (!identifier?.trim()) {
    return selectFromTerminal(
      context,
      "选择 Prompt：",
      sortPromptChoices(prompts).map(promptChoice),
      {
        emptyMessage: "没有可选择的 Prompt",
        missingMessage:
          "缺少 prompt id/title；在交互式终端中可省略并选择，非交互调用请传入 prompt id、标题或查询词",
        invalidLabel: "Prompt 编号",
      },
    );
  }

  const matches = findRankedMatches(
    prompts,
    identifier,
    promptSearchValues,
    (prompt) => prompt.title,
  );
  if (matches.length === 0) {
    throw new CliError(
      "NOT_FOUND",
      `Prompt 不存在或没有匹配项: ${identifier}`,
      EXIT_CODES.NOT_FOUND,
    );
  }

  const exactMatches = matches.filter((prompt) =>
    hasExactSearchMatch([prompt.id, prompt.title], identifier),
  );
  if (matches.length === 1 || exactMatches.length === 1) {
    return exactMatches[0] ?? matches[0];
  }

  if (context.io.isInteractive) {
    return selectFromTerminal(
      context,
      `选择 Prompt（匹配 "${identifier.trim()}"）：`,
      matches.map(promptChoice),
      {
        emptyMessage: "没有可选择的 Prompt",
        missingMessage: "缺少 prompt id/title",
        invalidLabel: "Prompt 编号",
      },
    );
  }

  throw new CliError(
    "CONFLICT",
    `Prompt 查询匹配多个结果: ${identifier}`,
    EXIT_CODES.CONFLICT,
    {
      candidates: matches.map((prompt) => ({
        id: prompt.id,
        title: prompt.title,
      })),
    },
  );
}

function ruleChoice(
  rule: RuleFileDescriptor,
): SelectionChoice<RuleFileDescriptor> {
  return {
    value: rule,
    id: rule.id,
    label: `${rule.platformName} / ${rule.name}`,
    description: rule.projectRootPath ?? rule.path,
  };
}

function ruleSearchValues(rule: RuleFileDescriptor): Array<string | undefined> {
  return [
    rule.id,
    rule.name,
    rule.platformName,
    rule.description,
    rule.projectRootPath ?? undefined,
    rule.projectRootPath ? path.basename(rule.projectRootPath) : undefined,
  ];
}

async function resolveRuleIdentifier(
  context: CliContext,
  identifier: string | undefined,
): Promise<RuleFileId> {
  const rules = await coreRulesWorkspaceService.listCachedRuleDescriptors();
  if (!identifier?.trim()) {
    return (
      await selectFromTerminal(context, "选择 Rule：", rules.map(ruleChoice), {
        emptyMessage: "没有可选择的 Rule",
        missingMessage:
          "缺少 rule id/name；在交互式终端中可省略并选择，非交互调用请传入 rule id 或查询词",
        invalidLabel: "Rule 编号",
      })
    ).id;
  }

  if (isRuleFileId(identifier)) {
    return identifier;
  }

  const matches = findRankedMatches(
    rules,
    identifier,
    ruleSearchValues,
    (rule) => rule.name,
  );
  if (matches.length === 0) {
    throw new CliError(
      "NOT_FOUND",
      `Rule 不存在或没有匹配项: ${identifier}`,
      EXIT_CODES.NOT_FOUND,
    );
  }

  const exactMatches = matches.filter((rule) =>
    hasExactSearchMatch([rule.id, rule.name, rule.platformName], identifier),
  );
  if (matches.length === 1 || exactMatches.length === 1) {
    return (exactMatches[0] ?? matches[0]).id;
  }

  if (context.io.isInteractive) {
    return (
      await selectFromTerminal(
        context,
        `选择 Rule（匹配 "${identifier.trim()}"）：`,
        matches.map(ruleChoice),
        {
          emptyMessage: "没有可选择的 Rule",
          missingMessage: "缺少 rule id/name",
          invalidLabel: "Rule 编号",
        },
      )
    ).id;
  }

  throw new CliError(
    "CONFLICT",
    `Rule 查询匹配多个结果: ${identifier}`,
    EXIT_CODES.CONFLICT,
    {
      candidates: matches.map((rule) => ({
        id: rule.id,
        name: rule.name,
        platformName: rule.platformName,
      })),
    },
  );
}

function mcpTemplateChoice(
  template: McpMarketTemplate,
): SelectionChoice<McpMarketTemplate> {
  return {
    value: template,
    id: template.id,
    label: template.displayName || template.name,
    description: template.description,
  };
}

function resolveMcpTemplate(
  context: CliContext,
  service: CoreMcpLibraryService,
  identifier: string | undefined,
): Promise<McpMarketTemplate> {
  const templates = service.getMarketTemplates();
  if (!identifier?.trim()) {
    return selectFromTerminal(
      context,
      "选择要安装的 MCP 模板：",
      templates.map(mcpTemplateChoice),
      {
        emptyMessage: "没有可安装的 MCP 模板",
        missingMessage:
          "缺少 MCP template id/name；在交互式终端中可省略并选择，非交互调用请传入模板 id 或查询词",
        invalidLabel: "MCP 模板编号",
      },
    );
  }

  const matches = findRankedMatches(
    templates,
    identifier,
    (template) => [
      template.id,
      template.name,
      template.displayName,
      template.description,
      template.packageName,
      ...template.tags,
    ],
    (template) => template.displayName || template.name,
  );
  if (matches.length === 0) {
    throw new CliError(
      "NOT_FOUND",
      `MCP 模板不存在或没有匹配项: ${identifier}`,
      EXIT_CODES.NOT_FOUND,
    );
  }

  const exactMatches = matches.filter((template) =>
    hasExactSearchMatch(
      [template.id, template.name, template.displayName],
      identifier,
    ),
  );
  if (matches.length === 1 || exactMatches.length === 1) {
    return Promise.resolve(exactMatches[0] ?? matches[0]);
  }

  if (context.io.isInteractive) {
    return selectFromTerminal(
      context,
      `选择 MCP 模板（匹配 "${identifier.trim()}"）：`,
      matches.map(mcpTemplateChoice),
      {
        emptyMessage: "没有可安装的 MCP 模板",
        missingMessage: "缺少 MCP template id/name",
        invalidLabel: "MCP 模板编号",
      },
    );
  }

  throw new CliError(
    "CONFLICT",
    `MCP 模板查询匹配多个结果: ${identifier}`,
    EXIT_CODES.CONFLICT,
    {
      candidates: matches.map((template) => ({
        id: template.id,
        name: template.name,
        displayName: template.displayName,
      })),
    },
  );
}

function mcpServerTableRows(
  servers: ReturnType<CoreMcpLibraryService["read"]>["servers"],
): Array<Record<string, unknown>> {
  return servers.map((server) => ({
    id: server.id,
    name: server.name,
    displayName: server.displayName,
    transport: server.transport,
    command: server.command ?? server.url ?? "",
    enabled: server.enabled,
    source: server.source.type,
  }));
}

function mcpTemplateTableRows(
  templates: ReturnType<CoreMcpLibraryService["getMarketTemplates"]>,
): Array<Record<string, unknown>> {
  return templates.map((template) => ({
    id: template.id,
    name: template.name,
    runtime: template.runtime ?? template.command ?? template.transport,
    package: template.packageName ?? "",
    source: template.source?.label ?? "",
  }));
}

function parseMcpTargetKind(value: string | undefined): McpTargetKind {
  if (!value || !(MCP_TARGET_KINDS as readonly string[]).includes(value)) {
    throw new CliError(
      "USAGE_ERROR",
      `--target 必须是: ${MCP_TARGET_KINDS.join("|")}`,
      EXIT_CODES.USAGE,
    );
  }
  return value as McpTargetKind;
}

function mcpServerChoice(
  server: McpServerConfig,
): SelectionChoice<McpServerConfig> {
  return {
    value: server,
    id: server.id,
    label: server.displayName || server.name,
    description: server.description,
  };
}

async function resolveMcpServerIds(
  context: CliContext,
  service: CoreMcpLibraryService,
  identifiers?: string[],
): Promise<string[]> {
  const servers = service.read().servers;
  if (!identifiers?.length) {
    return servers
      .filter((server) => server.enabled)
      .map((server) => server.id);
  }

  const resolved: string[] = [];
  for (const identifier of identifiers) {
    const matches = findRankedMatches(
      servers,
      identifier,
      (server) => [
        server.id,
        server.name,
        server.displayName,
        server.description,
      ],
      (server) => server.displayName || server.name,
    );
    if (matches.length === 0) {
      throw new CliError(
        "NOT_FOUND",
        `MCP 服务不存在: ${identifier}`,
        EXIT_CODES.NOT_FOUND,
      );
    }
    const exactMatches = matches.filter((server) =>
      hasExactSearchMatch(
        [server.id, server.name, server.displayName],
        identifier,
      ),
    );
    if (matches.length === 1 || exactMatches.length === 1) {
      resolved.push((exactMatches[0] ?? matches[0]).id);
      continue;
    }
    if (context.io.isInteractive) {
      const selected = await selectFromTerminal(
        context,
        `选择 MCP 服务（匹配 "${identifier.trim()}"）：`,
        matches.map(mcpServerChoice),
        {
          emptyMessage: "没有可选择的 MCP 服务",
          missingMessage: "缺少 MCP 服务 id/name",
          invalidLabel: "MCP 服务编号",
        },
      );
      resolved.push(selected.id);
      continue;
    }
    throw new CliError(
      "CONFLICT",
      `MCP 服务查询匹配多个结果: ${identifier}`,
      EXIT_CODES.CONFLICT,
      {
        candidates: matches.map((server) => ({
          id: server.id,
          name: server.name,
        })),
      },
    );
  }

  return Array.from(new Set(resolved));
}

function resolveMcpApplyTarget(
  args: string[],
): Omit<McpApplyTarget, "serverIds"> {
  const presetId = takeOption(args, "--preset");
  const targetOption = takeOption(args, "--target");
  const customPath = takeOption(args, "--path");

  if (presetId) {
    const preset = getMcpTargetPresets().find((item) => item.id === presetId);
    if (!preset) {
      throw new CliError(
        "NOT_FOUND",
        `MCP 目标平台不存在: ${presetId}`,
        EXIT_CODES.NOT_FOUND,
      );
    }
    return {
      target: preset.target,
      scope: preset.scope,
      path: preset.path,
    };
  }

  const target = parseMcpTargetKind(targetOption);
  if (!customPath?.trim()) {
    throw new CliError(
      "USAGE_ERROR",
      "mcp apply/remove 需要 --preset 或 --target + --path",
      EXIT_CODES.USAGE,
    );
  }
  return {
    target,
    scope: "custom",
    path: path.resolve(customPath),
  };
}

async function handlePromptCommand(
  args: string[],
  context: CliContext,
  databaseHooks: CliDatabaseHooks,
): Promise<void> {
  if (args.length === 0 || takeFlag(args, "--help") || takeFlag(args, "-h")) {
    context.io.stdout(PROMPT_HELP);
    return;
  }

  const action = requirePositional(args, 0, "prompt 子命令");
  const db = databaseHooks.initDatabase();
  const promptDb = new PromptDB(db);

  if (action === "list") {
    const prompts = promptDb.getAll();
    emitSuccess(context, prompts, promptTableRows(prompts));
    return;
  }

  if (action === "get") {
    const prompt = await resolvePromptIdentifier(
      context,
      promptDb,
      optionalPositional(args, 1),
    );
    ensureNoUnknownOptions(args.slice(optionalPositional(args, 1) ? 2 : 1));
    emitSuccess(context, prompt);
    return;
  }

  if (action === "duplicate") {
    const prompt = await resolvePromptIdentifier(
      context,
      promptDb,
      requirePositional(args, 1, "prompt id 或 title"),
    );
    ensureNoUnknownOptions(args.slice(2));
    emitSuccess(context, duplicatePrompt(promptDb, prompt.id));
    return;
  }

  if (action === "versions") {
    const prompt = await resolvePromptIdentifier(
      context,
      promptDb,
      requirePositional(args, 1, "prompt id 或 title"),
    );
    ensureNoUnknownOptions(args.slice(2));
    const versions = promptDb.getVersions(prompt.id);
    emitSuccess(context, versions, promptVersionTableRows(versions));
    return;
  }

  if (action === "create-version") {
    const prompt = await resolvePromptIdentifier(
      context,
      promptDb,
      requirePositional(args, 1, "prompt id 或 title"),
    );
    const versionArgs = args.slice(2);
    const note = takeOption(versionArgs, "--note");
    ensureNoUnknownOptions(versionArgs);
    const createdVersion = promptDb.createVersion(prompt.id, note);
    if (!createdVersion) {
      throw new CliError(
        "NOT_FOUND",
        `Prompt 不存在: ${prompt.id}`,
        EXIT_CODES.NOT_FOUND,
      );
    }
    emitSuccess(context, createdVersion);
    return;
  }

  if (action === "delete-version") {
    const prompt = await resolvePromptIdentifier(
      context,
      promptDb,
      requirePositional(args, 1, "prompt id 或 title"),
    );
    const versionId = requirePositional(args, 2, "version id");
    ensureNoUnknownOptions(args.slice(3));
    if (!promptDb.deleteVersion(versionId)) {
      throw new CliError(
        "NOT_FOUND",
        `Prompt 版本不存在: ${versionId}`,
        EXIT_CODES.NOT_FOUND,
      );
    }
    emitSuccess(context, { deleted: true, promptId: prompt.id, versionId });
    return;
  }

  if (action === "diff") {
    const prompt = await resolvePromptIdentifier(
      context,
      promptDb,
      requirePositional(args, 1, "prompt id 或 title"),
    );
    const diffArgs = resolvePromptVersionDiffArgs(args.slice(2));
    const versions = promptDb.getVersions(prompt.id);
    const fromVersion = versions.find((item) => item.version === diffArgs.from);
    const toVersion = versions.find((item) => item.version === diffArgs.to);
    if (!fromVersion || !toVersion) {
      throw new CliError(
        "NOT_FOUND",
        `Prompt 版本不存在: ${prompt.id}@v${!fromVersion ? diffArgs.from : diffArgs.to}`,
        EXIT_CODES.NOT_FOUND,
      );
    }
    const diff = diffPromptVersions(fromVersion, toVersion);
    emitSuccess(context, diff, promptDiffTableRows(diff));
    return;
  }

  if (action === "rollback") {
    const prompt = await resolvePromptIdentifier(
      context,
      promptDb,
      requirePositional(args, 1, "prompt id 或 title"),
    );
    const rollbackArgs = args.slice(2);
    const version = parseNumberOption(
      takeOption(rollbackArgs, "--version"),
      "--version",
    );
    ensureNoUnknownOptions(rollbackArgs);

    if (version === undefined || version === 0) {
      throw new CliError(
        "USAGE_ERROR",
        "prompt rollback 需要有效的 --version",
        EXIT_CODES.USAGE,
      );
    }

    const rolledBack = promptDb.rollback(prompt.id, version);
    if (!rolledBack) {
      throw new CliError(
        "NOT_FOUND",
        `Prompt 版本不存在: ${prompt.id}@v${version}`,
        EXIT_CODES.NOT_FOUND,
      );
    }

    emitSuccess(context, rolledBack);
    return;
  }

  if (action === "use") {
    const identifier = optionalPositional(args, 1);
    const prompt = await resolvePromptIdentifier(context, promptDb, identifier);
    ensureNoUnknownOptions(args.slice(identifier ? 2 : 1));
    promptDb.incrementUsage(prompt.id);
    emitSuccess(context, requirePrompt(promptDb, prompt.id));
    return;
  }

  if (action === "copy") {
    const identifier = optionalPositional(args, 1);
    const copyArgs = args.slice(identifier ? 2 : 1);
    const variables = parsePromptVariablesMap(copyArgs);
    ensureNoUnknownOptions(copyArgs);

    const prompt = await resolvePromptIdentifier(context, promptDb, identifier);
    const content = renderPromptCopy(prompt, variables);
    promptDb.incrementUsage(prompt.id);
    emitSuccess(context, {
      promptId: prompt.id,
      content,
      usageCount: requirePrompt(promptDb, prompt.id).usageCount,
      variables,
    });
    return;
  }

  if (action === "list-tags") {
    ensureNoUnknownOptions(args.slice(1));
    const tags = promptDb.getAllTags();
    emitSuccess(context, tags, promptTagTableRows(tags));
    return;
  }

  if (action === "rename-tag") {
    const oldTag = requirePositional(args, 1, "old tag");
    const newTag = requirePositional(args, 2, "new tag");
    ensureNoUnknownOptions(args.slice(3));
    promptDb.renameTag(oldTag, newTag);
    emitSuccess(context, { renamed: true, oldTag, newTag });
    return;
  }

  if (action === "delete-tag") {
    const tag = requirePositional(args, 1, "tag");
    ensureNoUnknownOptions(args.slice(2));
    promptDb.deleteTag(tag);
    emitSuccess(context, { deleted: true, tag });
    return;
  }

  if (action === "create") {
    const created = promptDb.create(resolvePromptCreateArgs(args.slice(1)));
    emitSuccess(context, created);
    return;
  }

  if (action === "update") {
    const identifier = optionalPositional(args, 1);
    const prompt = await resolvePromptIdentifier(context, promptDb, identifier);
    const updated = promptDb.update(
      prompt.id,
      resolvePromptUpdateArgs(args.slice(identifier ? 2 : 1)),
    );
    if (!updated) {
      throw new CliError(
        "NOT_FOUND",
        `Prompt 不存在: ${prompt.id}`,
        EXIT_CODES.NOT_FOUND,
      );
    }
    emitSuccess(context, updated);
    return;
  }

  if (action === "delete") {
    const identifier = optionalPositional(args, 1);
    const prompt = await resolvePromptIdentifier(context, promptDb, identifier);
    ensureNoUnknownOptions(args.slice(identifier ? 2 : 1));
    if (!promptDb.delete(prompt.id)) {
      throw new CliError(
        "NOT_FOUND",
        `Prompt 不存在: ${prompt.id}`,
        EXIT_CODES.NOT_FOUND,
      );
    }
    emitSuccess(context, { deleted: true, id: prompt.id });
    return;
  }

  if (action === "search") {
    const prompts = promptDb.search(resolvePromptSearchArgs(args.slice(1)));
    emitSuccess(context, prompts, promptTableRows(prompts));
    return;
  }

  throw new CliError(
    "USAGE_ERROR",
    `不支持的 prompt 子命令: ${action}`,
    EXIT_CODES.USAGE,
  );
}

async function uninstallSkillFromPlatforms(
  skillService: CliSkillService,
  skillName: string,
) {
  const platforms = skillService.getSupportedPlatforms();
  const settled = await Promise.allSettled(
    platforms.map((platform) =>
      skillService.uninstallSkillMd(skillName, platform.id),
    ),
  );

  return settled.map((result, index) => ({
    platform: platforms[index].id,
    status: result.status,
    ...(result.status === "rejected"
      ? {
          reason:
            result.reason instanceof Error
              ? result.reason.message
              : String(result.reason),
        }
      : {}),
  }));
}

async function handleSkillDelete(
  skillDb: SkillDB,
  skill: Skill,
  args: string[],
  context: CliContext,
): Promise<void> {
  const keepPlatformInstalls = takeFlag(args, "--keep-platform-installs");
  const purgeManagedRepo = takeFlag(args, "--purge-managed-repo");
  ensureNoUnknownOptions(args);

  const uninstallResults = keepPlatformInstalls
    ? []
    : await uninstallSkillFromPlatforms(context.skills, skill.name);

  let purgedManagedRepo = false;
  if (
    purgeManagedRepo &&
    skill.local_repo_path &&
    (await context.skills.isManagedRepoPath(skill.local_repo_path))
  ) {
    await context.skills.deleteRepoByPath(skill.local_repo_path);
    purgedManagedRepo = true;
  }

  if (!skillDb.delete(skill.id)) {
    throw new CliError(
      "NOT_FOUND",
      `Skill 不存在: ${skill.id}`,
      EXIT_CODES.NOT_FOUND,
    );
  }

  emitSuccess(context, {
    deleted: true,
    id: skill.id,
    name: skill.name,
    platformInstallsKept: keepPlatformInstalls,
    managedRepoPurged: purgedManagedRepo,
    uninstallResults,
  });
}

async function handleFolderCommand(
  args: string[],
  context: CliContext,
  databaseHooks: CliDatabaseHooks,
): Promise<void> {
  if (args.length === 0 || takeFlag(args, "--help") || takeFlag(args, "-h")) {
    context.io.stdout(FOLDER_HELP);
    return;
  }

  const action = requirePositional(args, 0, "folder 子命令");
  const db = databaseHooks.initDatabase();
  const folderDb = new FolderDB(db);

  if (action === "list") {
    const folders = folderDb.getAll();
    emitSuccess(context, folders, folderTableRows(folders));
    return;
  }

  if (action === "get") {
    const id = requirePositional(args, 1, "folder id");
    const folder = folderDb.getById(id);
    if (!folder) {
      throw new CliError(
        "NOT_FOUND",
        `Folder 不存在: ${id}`,
        EXIT_CODES.NOT_FOUND,
      );
    }
    emitSuccess(context, folder);
    return;
  }

  if (action === "create") {
    emitSuccess(
      context,
      folderDb.create(resolveFolderCreateArgs(args.slice(1))),
    );
    return;
  }

  if (action === "update") {
    const id = requirePositional(args, 1, "folder id");
    const updated = folderDb.update(id, resolveFolderUpdateArgs(args.slice(2)));
    if (!updated) {
      throw new CliError(
        "NOT_FOUND",
        `Folder 不存在: ${id}`,
        EXIT_CODES.NOT_FOUND,
      );
    }
    emitSuccess(context, updated);
    return;
  }

  if (action === "delete") {
    const id = requirePositional(args, 1, "folder id");
    if (!folderDb.delete(id)) {
      throw new CliError(
        "NOT_FOUND",
        `Folder 不存在: ${id}`,
        EXIT_CODES.NOT_FOUND,
      );
    }
    emitSuccess(context, { deleted: true, id });
    return;
  }

  if (action === "reorder") {
    const ids = parseFolderIdsOption(args.slice(1));
    folderDb.reorder(ids);
    emitSuccess(context, { reordered: true, ids });
    return;
  }

  throw new CliError(
    "USAGE_ERROR",
    `不支持的 folder 子命令: ${action}`,
    EXIT_CODES.USAGE,
  );
}

async function handleWorkspaceCommand(
  args: string[],
  context: CliContext,
  databaseHooks: CliDatabaseHooks,
): Promise<void> {
  if (args.length === 0 || takeFlag(args, "--help") || takeFlag(args, "-h")) {
    context.io.stdout(WORKSPACE_HELP);
    return;
  }

  const action = requirePositional(args, 0, "workspace 子命令");
  const db = databaseHooks.initDatabase();
  const promptDb = new PromptDB(db);
  const folderDb = new FolderDB(db);

  if (action === "export") {
    const exportArgs = args.slice(1);
    const filePath = resolveWorkspaceFileOption(exportArgs, "export");
    ensureNoUnknownOptions(exportArgs);

    const bundle = createWorkspaceBundle(promptDb, folderDb);
    writeRequiredTextFile(filePath, toJson(bundle));
    emitSuccess(context, {
      exported: true,
      filePath: path.resolve(filePath),
      prompts: bundle.prompts.length,
      folders: bundle.folders.length,
      versions: bundle.versions.length,
    });
    return;
  }

  if (action === "import") {
    const importArgs = args.slice(1);
    const filePath = resolveWorkspaceFileOption(importArgs, "import");
    const forceClear = takeFlag(importArgs, "--force-clear");
    ensureNoUnknownOptions(importArgs);

    const bundle = parseWorkspaceBundle(readRequiredTextFile(filePath));
    const hasData = !isDatabaseEmpty(db);
    if (hasData && !forceClear) {
      throw new CliError(
        "CONFLICT",
        "目标数据库非空；如需覆盖请传入 --force-clear",
        EXIT_CODES.CONFLICT,
      );
    }

    if (forceClear) {
      clearWorkspaceCoreData(db);
    }

    for (const folder of bundle.folders) {
      folderDb.insertFolderDirect(folder);
    }
    for (const prompt of bundle.prompts) {
      promptDb.insertPromptDirect(prompt);
    }
    for (const version of bundle.versions) {
      promptDb.insertVersionDirect(version);
    }

    emitSuccess(context, {
      imported: true,
      filePath: path.resolve(filePath),
      prompts: bundle.prompts.length,
      folders: bundle.folders.length,
      versions: bundle.versions.length,
      forceCleared: forceClear,
    });
    return;
  }

  throw new CliError(
    "USAGE_ERROR",
    `不支持的 workspace 子命令: ${action}`,
    EXIT_CODES.USAGE,
  );
}

async function handleRulesCommand(
  args: string[],
  context: CliContext,
): Promise<void> {
  if (args.length === 0 || takeFlag(args, "--help") || takeFlag(args, "-h")) {
    context.io.stdout(RULES_HELP);
    return;
  }

  const action = requirePositional(args, 0, "rules 子命令");

  if (action === "list") {
    ensureNoUnknownOptions(args.slice(1));
    const rules = await coreRulesWorkspaceService.listCachedRuleDescriptors();
    emitSuccess(context, rules, ruleTableRows(rules));
    return;
  }

  if (action === "scan") {
    ensureNoUnknownOptions(args.slice(1));
    const rules = await coreRulesWorkspaceService.scanRuleDescriptors();
    emitSuccess(context, rules, ruleTableRows(rules));
    return;
  }

  if (action === "read") {
    const identifier = optionalPositional(args, 1);
    const ruleId = await resolveRuleIdentifier(context, identifier);
    ensureNoUnknownOptions(args.slice(identifier ? 2 : 1));
    emitSuccess(
      context,
      await coreRulesWorkspaceService.readRuleContent(ruleId),
    );
    return;
  }

  if (action === "versions") {
    const ruleId = await resolveRuleIdentifier(
      context,
      requirePositional(args, 1, "rule id 或 name"),
    );
    ensureNoUnknownOptions(args.slice(2));
    const rule = await coreRulesWorkspaceService.readRuleContent(ruleId);
    emitSuccess(context, rule.versions, ruleVersionTableRows(rule.versions));
    return;
  }

  if (action === "version-read") {
    const ruleId = await resolveRuleIdentifier(
      context,
      requirePositional(args, 1, "rule id 或 name"),
    );
    const versionId = requirePositional(args, 2, "version id");
    ensureNoUnknownOptions(args.slice(3));
    const rule = await coreRulesWorkspaceService.readRuleContent(ruleId);
    const version = rule.versions.find((item) => item.id === versionId);
    if (!version) {
      throw new CliError(
        "NOT_FOUND",
        `Rule 版本不存在: ${ruleId}@${versionId}`,
        EXIT_CODES.NOT_FOUND,
      );
    }
    emitSuccess(context, formatRuleVersionSnapshot(version));
    return;
  }

  if (action === "version-restore") {
    const ruleId = await resolveRuleIdentifier(
      context,
      requirePositional(args, 1, "rule id 或 name"),
    );
    const versionId = requirePositional(args, 2, "version id");
    ensureNoUnknownOptions(args.slice(3));
    const rule = await coreRulesWorkspaceService.readRuleContent(ruleId);
    const version = rule.versions.find((item) => item.id === versionId);
    if (!version) {
      throw new CliError(
        "NOT_FOUND",
        `Rule 版本不存在: ${ruleId}@${versionId}`,
        EXIT_CODES.NOT_FOUND,
      );
    }
    emitSuccess(
      context,
      await coreRulesWorkspaceService.saveRuleContent(ruleId, version.content),
    );
    return;
  }

  if (action === "save") {
    const ruleId = await resolveRuleIdentifier(
      context,
      requirePositional(args, 1, "rule id 或 name"),
    );
    const saveArgs = args.slice(2);
    const content = readTextOption(saveArgs, "--content", "--content-file");
    ensureNoUnknownOptions(saveArgs);

    if (content === undefined) {
      throw new CliError(
        "USAGE_ERROR",
        "rules save 需要 --content 或 --content-file",
        EXIT_CODES.USAGE,
      );
    }

    emitSuccess(
      context,
      await coreRulesWorkspaceService.saveRuleContent(ruleId, content),
    );
    return;
  }

  if (action === "rewrite") {
    const ruleId = await resolveRuleIdentifier(
      context,
      requirePositional(args, 1, "rule id 或 name"),
    );
    const rule = await coreRulesWorkspaceService.readRuleContent(ruleId);
    const rewritePayload = resolveRuleRewriteArgs(
      args.slice(2),
      rule.content,
      rule.name,
      rule.platformName,
    );
    emitSuccess(context, await rewriteRuleWithAi(rewritePayload));
    return;
  }

  if (action === "add-project" || action === "project-init") {
    const addArgs = args.slice(1);
    const rootPath = path.resolve(
      takeOption(addArgs, "--root-path") ?? process.cwd(),
    );
    const name =
      takeOption(addArgs, "--name")?.trim() ||
      path.basename(rootPath) ||
      "Project";
    const id = takeOption(addArgs, "--id");
    ensureNoUnknownOptions(addArgs);

    if (!name || !rootPath.trim()) {
      throw new CliError(
        "USAGE_ERROR",
        "rules project-init 需要有效的项目名称和根目录",
        EXIT_CODES.USAGE,
      );
    }

    emitSuccess(
      context,
      await coreRulesWorkspaceService.createProjectRule({
        ...(id?.trim() && { id: id.trim() }),
        name,
        rootPath,
      }),
    );
    return;
  }

  if (action === "remove-project") {
    const projectId = requirePositional(args, 1, "project id");
    ensureNoUnknownOptions(args.slice(2));
    const normalizedProjectId = normalizeProjectId(projectId);
    await coreRulesWorkspaceService.removeProjectRule(normalizedProjectId);
    emitSuccess(context, {
      removed: true,
      projectId: normalizedProjectId,
    });
    return;
  }

  if (action === "version-delete") {
    const ruleId = await resolveRuleIdentifier(
      context,
      requirePositional(args, 1, "rule id 或 name"),
    );
    const versionId = requirePositional(args, 2, "version id");
    ensureNoUnknownOptions(args.slice(3));
    const versions = await coreRulesWorkspaceService.deleteRuleVersion(
      ruleId,
      versionId,
    );
    emitSuccess(context, versions, ruleVersionTableRows(versions));
    return;
  }

  if (action === "export") {
    const exportArgs = args.slice(1);
    const filePath = resolveRulesFileOption(exportArgs, "export");
    ensureNoUnknownOptions(exportArgs);

    const records = await coreRulesWorkspaceService.exportRuleBackupRecords();
    const bundle = createRulesBundle(records);
    writeRequiredTextFile(filePath, toJson(bundle));
    emitSuccess(context, {
      exported: true,
      filePath: path.resolve(filePath),
      records: records.length,
    });
    return;
  }

  if (action === "import") {
    const importArgs = args.slice(1);
    const filePath = resolveRulesFileOption(importArgs, "import");
    const replace = takeFlag(importArgs, "--replace");
    ensureNoUnknownOptions(importArgs);

    const bundle = parseRulesBundle(readRequiredTextFile(filePath));
    await coreRulesWorkspaceService.importRuleBackupRecords(bundle.records, {
      replace,
    });
    emitSuccess(context, {
      imported: true,
      filePath: path.resolve(filePath),
      records: bundle.records.length,
      replace,
    });
    return;
  }

  throw new CliError(
    "USAGE_ERROR",
    `不支持的 rules 子命令: ${action}`,
    EXIT_CODES.USAGE,
  );
}

async function handleSkillCommand(
  args: string[],
  context: CliContext,
  databaseHooks: CliDatabaseHooks,
): Promise<void> {
  if (args.length === 0 || takeFlag(args, "--help") || takeFlag(args, "-h")) {
    context.io.stdout(SKILL_HELP);
    return;
  }

  const action = requirePositional(args, 0, "skill 子命令");
  const db = databaseHooks.initDatabase();
  const skillDb = new SkillDB(db);

  if (action === "list") {
    const skills = skillDb.getAll();
    emitSuccess(context, skills, await skillTableRows(context.skills, skills));
    return;
  }

  if (action === "get") {
    const identifier = requirePositional(args, 1, "skill id 或 name");
    const { skill } = resolveSkillIdentifier(skillDb, identifier);
    emitSuccess(context, skill);
    return;
  }

  if (action === "install") {
    const source = requirePositional(args, 1, "skill source");
    const installArgs = args.slice(2);
    const name = takeOption(installArgs, "--name");
    ensureNoUnknownOptions(installArgs);
    const skillId = await context.skills.installFromSource(source, skillDb, {
      name,
    });
    emitSuccess(context, skillDb.getById(skillId));
    return;
  }

  if (action === "project-install" || action === "install-project") {
    const installArgs = args.slice(1);
    const identifier =
      installArgs[0] && !installArgs[0].startsWith("-")
        ? installArgs.shift()
        : undefined;
    const projectRoot = takeOption(installArgs, "--project");
    const targetRootDir = takeOption(installArgs, "--target");
    const mode = takeOption(installArgs, "--mode") ?? "copy";
    const force = takeFlag(installArgs, "--force");
    ensureNoUnknownOptions(installArgs);

    if (mode !== "copy" && mode !== "symlink") {
      throw new CliError(
        "USAGE_ERROR",
        "skill project-install 的 --mode 必须是 copy 或 symlink",
        EXIT_CODES.USAGE,
      );
    }

    const skill = await resolveProjectInstallSkill(
      context,
      skillDb,
      identifier,
    );
    const result = await context.skills.installSkillToProject(
      skillDb,
      skill.id,
      {
        projectRoot: projectRoot?.trim() || undefined,
        targetRootDir: targetRootDir?.trim() || undefined,
        mode,
        ifExists: force ? "overwrite" : "skip",
      },
    );
    emitSuccess(context, {
      ...result,
      forced: force,
    });
    return;
  }

  if (action === "versions") {
    const identifier = requirePositional(args, 1, "skill id 或 name");
    ensureNoUnknownOptions(args.slice(2));
    const { skill } = resolveSkillIdentifier(skillDb, identifier);
    const versions = skillDb.getVersions(skill.id);
    emitSuccess(context, versions, skillVersionTableRows(versions));
    return;
  }

  if (action === "create-version") {
    const identifier = requirePositional(args, 1, "skill id 或 name");
    const versionArgs = args.slice(2);
    const note = takeOption(versionArgs, "--note");
    ensureNoUnknownOptions(versionArgs);
    const { skill } = resolveSkillIdentifier(skillDb, identifier);
    const version = await context.skills.createVersion(skillDb, skill.id, note);
    emitSuccess(context, version);
    return;
  }

  if (action === "rollback") {
    const identifier = requirePositional(args, 1, "skill id 或 name");
    const rollbackArgs = args.slice(2);
    const version = parsePositiveNumberOption(
      takeOption(rollbackArgs, "--version"),
      "--version",
    );
    ensureNoUnknownOptions(rollbackArgs);
    if (version === undefined) {
      throw new CliError(
        "USAGE_ERROR",
        "skill rollback 需要有效的 --version",
        EXIT_CODES.USAGE,
      );
    }
    const { skill } = resolveSkillIdentifier(skillDb, identifier);
    const updated = await context.skills.rollbackVersion(
      skillDb,
      skill.id,
      version,
    );
    if (!updated) {
      throw new CliError(
        "NOT_FOUND",
        `Skill 版本不存在: ${identifier}@v${version}`,
        EXIT_CODES.NOT_FOUND,
      );
    }
    emitSuccess(context, updated);
    return;
  }

  if (action === "delete-version") {
    const identifier = requirePositional(args, 1, "skill id 或 name");
    const versionId = requirePositional(args, 2, "version id");
    ensureNoUnknownOptions(args.slice(3));
    const { skill } = resolveSkillIdentifier(skillDb, identifier);
    const deleted = await context.skills.deleteVersion(
      skillDb,
      skill.id,
      versionId,
    );
    if (!deleted) {
      throw new CliError(
        "NOT_FOUND",
        `Skill 版本不存在: ${identifier}@${versionId}`,
        EXIT_CODES.NOT_FOUND,
      );
    }
    emitSuccess(context, { deleted: true, skillId: skill.id, versionId });
    return;
  }

  if (action === "export") {
    const identifier = requirePositional(args, 1, "skill id 或 name");
    const exportArgs = args.slice(2);
    const format = takeOption(exportArgs, "--format");
    ensureNoUnknownOptions(exportArgs);
    if (format !== "skillmd" && format !== "json") {
      throw new CliError(
        "USAGE_ERROR",
        "skill export 需要 --format skillmd|json",
        EXIT_CODES.USAGE,
      );
    }
    const { skill } = resolveSkillIdentifier(skillDb, identifier);
    context.io.stdout(
      format === "skillmd"
        ? context.skills.exportAsSkillMd(skill)
        : context.skills.exportAsJson(skill),
    );
    return;
  }

  if (action === "platforms") {
    ensureNoUnknownOptions(args.slice(1));
    const platforms = context.skills.getSupportedPlatforms();
    const detected = await context.skills.detectInstalledPlatforms();
    emitSuccess(
      context,
      platforms.map((platform) => ({
        id: platform.id,
        name: platform.name,
        installed: detected.includes(platform.id),
      })),
      skillPlatformRows(platforms, detected),
    );
    return;
  }

  if (action === "platform-status") {
    const identifier = requirePositional(args, 1, "skill id 或 name");
    ensureNoUnknownOptions(args.slice(2));
    const { skill } = resolveSkillIdentifier(skillDb, identifier);
    emitSuccess(
      context,
      await context.skills.getSkillMdInstallStatus(skill.name),
    );
    return;
  }

  if (action === "install-md") {
    const identifier = requirePositional(args, 1, "skill id 或 name");
    const installArgs = args.slice(2);
    const platformId = takeOption(installArgs, "--platform");
    ensureNoUnknownOptions(installArgs);
    if (!platformId?.trim()) {
      throw new CliError(
        "USAGE_ERROR",
        "skill install-md 需要 --platform",
        EXIT_CODES.USAGE,
      );
    }
    const { skill } = resolveSkillIdentifier(skillDb, identifier);
    await context.skills.installSkillMd(
      skillDb,
      skill.name,
      skill.instructions || skill.content || "",
      platformId.trim(),
    );
    emitSuccess(context, {
      installed: true,
      skillId: skill.id,
      platformId: platformId.trim(),
    });
    return;
  }

  if (action === "uninstall-md") {
    const identifier = requirePositional(args, 1, "skill id 或 name");
    const uninstallArgs = args.slice(2);
    const platformId = takeOption(uninstallArgs, "--platform");
    ensureNoUnknownOptions(uninstallArgs);
    if (!platformId?.trim()) {
      throw new CliError(
        "USAGE_ERROR",
        "skill uninstall-md 需要 --platform",
        EXIT_CODES.USAGE,
      );
    }
    const { skill } = resolveSkillIdentifier(skillDb, identifier);
    await context.skills.uninstallSkillMd(skill.name, platformId.trim());
    emitSuccess(context, {
      uninstalled: true,
      skillId: skill.id,
      platformId: platformId.trim(),
    });
    return;
  }

  if (action === "repo-files") {
    const identifier = requirePositional(args, 1, "skill id 或 name");
    ensureNoUnknownOptions(args.slice(2));
    const { skill } = resolveSkillIdentifier(skillDb, identifier);
    const files = await context.skills.listLocalFiles(skillDb, skill.id);
    emitSuccess(context, files);
    return;
  }

  if (action === "repo-read") {
    const identifier = requirePositional(args, 1, "skill id 或 name");
    const readArgs = args.slice(2);
    const relativePath = takeOption(readArgs, "--path");
    ensureNoUnknownOptions(readArgs);
    if (!relativePath?.trim()) {
      throw new CliError(
        "USAGE_ERROR",
        "skill repo-read 需要 --path",
        EXIT_CODES.USAGE,
      );
    }
    const { skill } = resolveSkillIdentifier(skillDb, identifier);
    emitSuccess(
      context,
      await context.skills.readLocalFile(
        skillDb,
        skill.id,
        relativePath.trim(),
      ),
    );
    return;
  }

  if (action === "repo-write") {
    const identifier = requirePositional(args, 1, "skill id 或 name");
    const writeArgs = args.slice(2);
    const relativePath = takeOption(writeArgs, "--path");
    const content = readTextOption(writeArgs, "--content", "--content-file");
    ensureNoUnknownOptions(writeArgs);
    if (!relativePath?.trim() || content === undefined) {
      throw new CliError(
        "USAGE_ERROR",
        "skill repo-write 需要 --path 和 --content/--content-file",
        EXIT_CODES.USAGE,
      );
    }
    const { skill } = resolveSkillIdentifier(skillDb, identifier);
    await context.skills.writeLocalFile(
      skillDb,
      skill.id,
      relativePath.trim(),
      content,
    );
    emitSuccess(context, {
      written: true,
      skillId: skill.id,
      path: relativePath.trim(),
    });
    return;
  }

  if (action === "repo-delete") {
    const identifier = requirePositional(args, 1, "skill id 或 name");
    const deleteArgs = args.slice(2);
    const relativePath = takeOption(deleteArgs, "--path");
    ensureNoUnknownOptions(deleteArgs);
    if (!relativePath?.trim()) {
      throw new CliError(
        "USAGE_ERROR",
        "skill repo-delete 需要 --path",
        EXIT_CODES.USAGE,
      );
    }
    const { skill } = resolveSkillIdentifier(skillDb, identifier);
    await context.skills.deleteLocalFile(
      skillDb,
      skill.id,
      relativePath.trim(),
    );
    emitSuccess(context, {
      deleted: true,
      skillId: skill.id,
      path: relativePath.trim(),
    });
    return;
  }

  if (action === "repo-mkdir") {
    const identifier = requirePositional(args, 1, "skill id 或 name");
    const mkdirArgs = args.slice(2);
    const relativePath = takeOption(mkdirArgs, "--path");
    ensureNoUnknownOptions(mkdirArgs);
    if (!relativePath?.trim()) {
      throw new CliError(
        "USAGE_ERROR",
        "skill repo-mkdir 需要 --path",
        EXIT_CODES.USAGE,
      );
    }
    const { skill } = resolveSkillIdentifier(skillDb, identifier);
    await context.skills.createLocalDir(skillDb, skill.id, relativePath.trim());
    emitSuccess(context, {
      created: true,
      skillId: skill.id,
      path: relativePath.trim(),
    });
    return;
  }

  if (action === "repo-rename") {
    const identifier = requirePositional(args, 1, "skill id 或 name");
    const renameArgs = args.slice(2);
    const oldPath = takeOption(renameArgs, "--from");
    const newPath = takeOption(renameArgs, "--to");
    ensureNoUnknownOptions(renameArgs);
    if (!oldPath?.trim() || !newPath?.trim()) {
      throw new CliError(
        "USAGE_ERROR",
        "skill repo-rename 需要 --from 和 --to",
        EXIT_CODES.USAGE,
      );
    }
    const { skill } = resolveSkillIdentifier(skillDb, identifier);
    await context.skills.renameLocalPath(
      skillDb,
      skill.id,
      oldPath.trim(),
      newPath.trim(),
    );
    emitSuccess(context, {
      renamed: true,
      skillId: skill.id,
      from: oldPath.trim(),
      to: newPath.trim(),
    });
    return;
  }

  if (action === "sync-from-repo") {
    const identifier = requirePositional(args, 1, "skill id 或 name");
    ensureNoUnknownOptions(args.slice(2));
    const { skill } = resolveSkillIdentifier(skillDb, identifier);
    emitSuccess(context, await context.skills.syncFromRepo(skillDb, skill.id));
    return;
  }

  if (action === "scan-safety") {
    const identifier = requirePositional(args, 1, "skill id 或 name");
    ensureNoUnknownOptions(args.slice(2));
    const { skill } = resolveSkillIdentifier(skillDb, identifier);
    const report = await context.skills.scanSafety({
      name: skill.name,
      content: skill.instructions || skill.content,
      sourceUrl: skill.source_url,
      localRepoPath: skill.local_repo_path,
    });
    emitSuccess(context, report);
    return;
  }

  if (action === "delete" || action === "remove") {
    const identifier = requirePositional(args, 1, "skill id 或 name");
    const { skill } = resolveSkillIdentifier(skillDb, identifier);
    await handleSkillDelete(skillDb, skill, args.slice(2), context);
    return;
  }

  if (action === "scan") {
    const scanned = await context.skills.scanLocalPreview(
      args.slice(1),
      skillDb,
    );
    emitSuccess(
      context,
      scanned,
      scanned.map((skill) => ({
        name: skill.name,
        safety: skill.safetyReport?.level ?? "unknown",
        findings: Array.isArray(skill.safetyReport?.findings)
          ? skill.safetyReport.findings.length
          : 0,
        author: skill.author,
        version: skill.version,
        platforms: skill.platforms,
        localPath: skill.localPath,
      })),
    );
    return;
  }

  throw new CliError(
    "USAGE_ERROR",
    `不支持的 skill 子命令: ${action}`,
    EXIT_CODES.USAGE,
  );
}

async function handleMcpCommand(
  args: string[],
  context: CliContext,
): Promise<void> {
  if (args.length === 0 || takeFlag(args, "--help") || takeFlag(args, "-h")) {
    context.io.stdout(MCP_HELP);
    return;
  }

  const service = new CoreMcpLibraryService();
  const action = requirePositional(args, 0, "mcp 子命令");

  if (action === "list") {
    ensureNoUnknownOptions(args.slice(1));
    const library = service.read();
    emitSuccess(context, library.servers, mcpServerTableRows(library.servers));
    return;
  }

  if (action === "get") {
    const identifier = requirePositional(args, 1, "mcp id 或 name");
    ensureNoUnknownOptions(args.slice(2));
    const server = service
      .read()
      .servers.find(
        (item) => item.id === identifier || item.name === identifier,
      );
    if (!server) {
      throw new CliError(
        "NOT_FOUND",
        `MCP 服务不存在: ${identifier}`,
        EXIT_CODES.NOT_FOUND,
      );
    }
    emitSuccess(context, server);
    return;
  }

  if (action === "market") {
    ensureNoUnknownOptions(args.slice(1));
    const templates = service.getMarketTemplates();
    emitSuccess(context, templates, mcpTemplateTableRows(templates));
    return;
  }

  if (action === "sources") {
    ensureNoUnknownOptions(args.slice(1));
    const sources = service.getMarketSources();
    emitSuccess(
      context,
      sources,
      sources.map((source) => ({
        id: source.id,
        label: source.label,
        trustLevel: source.trustLevel,
        url: source.url,
      })),
    );
    return;
  }

  if (action === "install") {
    const identifier = optionalPositional(args, 1);
    ensureNoUnknownOptions(args.slice(identifier ? 2 : 1));
    const template = await resolveMcpTemplate(context, service, identifier);
    emitSuccess(context, service.installMarketTemplate(template));
    return;
  }

  if (action === "enable" || action === "disable") {
    const identifier = requirePositional(args, 1, "mcp id 或 name");
    ensureNoUnknownOptions(args.slice(2));
    emitSuccess(
      context,
      service.setServerEnabled(identifier, action === "enable"),
    );
    return;
  }

  if (action === "import") {
    const filePath = requirePositional(args, 1, "mcp config file");
    ensureNoUnknownOptions(args.slice(2));
    emitSuccess(context, service.importFromFile(path.resolve(filePath)));
    return;
  }

  if (action === "export") {
    const exportArgs = args.slice(1);
    const target = parseMcpTargetKind(takeOption(exportArgs, "--target"));
    const serverIds = await resolveMcpServerIds(
      context,
      service,
      parseCsv(takeOption(exportArgs, "--servers")),
    );
    ensureNoUnknownOptions(exportArgs);
    context.io.stdout(service.preview(target, serverIds));
    return;
  }

  if (action === "apply" || action === "remove") {
    const targetArgs = args.slice(1);
    const serverIdentifiers = parseCsv(takeOption(targetArgs, "--servers"));
    const force = action === "apply" ? takeFlag(targetArgs, "--force") : false;
    if (action === "remove" && !serverIdentifiers?.length) {
      throw new CliError(
        "USAGE_ERROR",
        "mcp remove 需要 --servers 明确指定要移除的服务",
        EXIT_CODES.USAGE,
      );
    }
    const serverIds = await resolveMcpServerIds(
      context,
      service,
      serverIdentifiers,
    );
    const target = resolveMcpApplyTarget(targetArgs);
    ensureNoUnknownOptions(targetArgs);
    if (serverIds.length === 0) {
      throw new CliError(
        "USAGE_ERROR",
        "没有可处理的 MCP 服务；请启用服务或用 --servers 指定",
        EXIT_CODES.USAGE,
      );
    }
    emitSuccess(
      context,
      action === "apply"
        ? service.apply({ ...target, serverIds, force })
        : service.removeFromTarget({ ...target, serverIds }),
    );
    return;
  }

  if (action === "check") {
    const identifier = args[1];
    ensureNoUnknownOptions(args.slice(identifier ? 2 : 1));
    const result = identifier
      ? service.checkServer(identifier)
      : service.checkAllServers();
    emitSuccess(
      context,
      result,
      Array.isArray(result)
        ? result.map((item) => ({
            server: item.serverName,
            status: item.status,
            issues: item.issues.length,
          }))
        : undefined,
    );
    return;
  }

  if (action === "env-import") {
    const identifier = requirePositional(args, 1, "mcp id 或 name");
    const importArgs = args.slice(2);
    const filePath = takeOption(importArgs, "--file");
    const selectedKeys = parseCsv(takeOption(importArgs, "--keys"));
    ensureNoUnknownOptions(importArgs);
    if (!filePath?.trim()) {
      throw new CliError(
        "USAGE_ERROR",
        "mcp env-import 需要 --file",
        EXIT_CODES.USAGE,
      );
    }
    emitSuccess(
      context,
      service.importEnvForServer(
        identifier,
        path.resolve(filePath),
        selectedKeys,
      ),
    );
    return;
  }

  throw new CliError(
    "USAGE_ERROR",
    `不支持的 mcp 子命令: ${action}`,
    EXIT_CODES.USAGE,
  );
}

function configureCliRuntime(
  args: string[],
  runtimeHooks: CliRuntimeHooks,
): {
  args: string[];
  output: OutputFormat;
} {
  const nextArgs = cloneArgs(args);
  const dataDir = takeOption(nextArgs, "--data-dir");
  const appDataDir = takeOption(nextArgs, "--app-data-dir");
  const outputOption =
    takeOption(nextArgs, "--output") ?? takeOption(nextArgs, "-o") ?? "json";

  if (outputOption !== "json" && outputOption !== "table") {
    throw new CliError(
      "USAGE_ERROR",
      `不支持的输出格式: ${outputOption}`,
      EXIT_CODES.USAGE,
    );
  }

  runtimeHooks.configureRuntimePaths({
    ...(dataDir && { userDataPath: path.resolve(dataDir) }),
    ...(appDataDir && { appDataPath: path.resolve(appDataDir) }),
    exePath: process.execPath,
    isPackaged: false,
    platform: process.platform,
  });

  return { args: nextArgs, output: outputOption };
}

export async function runCli(
  argv: string[],
  io: CliIO = defaultIO(),
  runtimeHooks: CliRuntimeHooks = {
    configureRuntimePaths,
    resetRuntimePaths,
  },
  databaseHooks: CliDatabaseHooks = {
    closeDatabase,
    initDatabase,
  },
  skillService: CliSkillService = coreCliSkillService,
): Promise<number> {
  const restoreConsole = suppressConsoleNoise();

  try {
    const configured = configureCliRuntime(argv, runtimeHooks);
    const context: CliContext = {
      io,
      output: configured.output,
      skills: skillService,
    };
    const args = configured.args;

    if (args[0] === "--version" || args[0] === "-v") {
      io.stdout(CLI_VERSION);
      return EXIT_CODES.OK;
    }

    if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
      io.stdout(ROOT_HELP);
      return EXIT_CODES.OK;
    }

    const resource = requirePositional(args, 0, "资源类型");
    const commandArgs = args.slice(1);

    if (resource === "prompt") {
      await handlePromptCommand(commandArgs, context, databaseHooks);
      return EXIT_CODES.OK;
    }
    if (resource === "folder") {
      await handleFolderCommand(commandArgs, context, databaseHooks);
      return EXIT_CODES.OK;
    }
    if (resource === "rules") {
      await handleRulesCommand(commandArgs, context);
      return EXIT_CODES.OK;
    }
    if (resource === "workspace") {
      await handleWorkspaceCommand(commandArgs, context, databaseHooks);
      return EXIT_CODES.OK;
    }
    if (resource === "skill") {
      await handleSkillCommand(commandArgs, context, databaseHooks);
      return EXIT_CODES.OK;
    }
    if (resource === "mcp") {
      await handleMcpCommand(commandArgs, context);
      return EXIT_CODES.OK;
    }
    if (resource === "ai") {
      return await handleAIConfigCommand(commandArgs, io, configured.output);
    }

    throw new CliError(
      "USAGE_ERROR",
      `不支持的资源类型: ${resource}`,
      EXIT_CODES.USAGE,
    );
  } catch (error) {
    const cliError =
      error instanceof CliError
        ? error
        : error instanceof CoreMcpError
          ? mapCoreMcpError(error)
          : new CliError(
              "INTERNAL_ERROR",
              error instanceof Error ? error.message : String(error),
              EXIT_CODES.INTERNAL,
            );
    emitError({ io, output: "json", skills: skillService }, cliError);
    return cliError.exitCode;
  } finally {
    restoreConsole();
    databaseHooks.closeDatabase();
    runtimeHooks.resetRuntimePaths();
  }
}
