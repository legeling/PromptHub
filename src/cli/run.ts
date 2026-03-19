import fs from "fs";
import path from "path";

import { closeDatabase, initDatabase } from "../main/database";
import { PromptDB } from "../main/database/prompt";
import { SkillDB } from "../main/database/skill";
import {
  configureRuntimePaths,
  resetRuntimePaths,
} from "../main/runtime-paths";
import { SkillInstaller } from "../main/services/skill-installer";
import type {
  CreatePromptDTO,
  Prompt,
  SearchQuery,
  Skill,
  UpdatePromptDTO,
} from "../shared/types";

type CliWriter = (message: string) => void;
type OutputFormat = "json" | "table";

const EXIT_CODES = {
  OK: 0,
  USAGE: 2,
  NOT_FOUND: 3,
  CONFLICT: 4,
  IO: 5,
  INTERNAL: 10,
} as const;

type ExitCode = (typeof EXIT_CODES)[keyof typeof EXIT_CODES];

export interface CliIO {
  stdout: CliWriter;
  stderr: CliWriter;
}

interface CliContext {
  io: CliIO;
  output: OutputFormat;
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
  "  skill     管理 skills",
  "",
  "全局参数:",
  "  --data-dir <dir>        指定 PromptHub userData 目录",
  "  --app-data-dir <dir>    指定 appData 根目录（读取 data-path.json 时使用）",
  "  --output, -o <format>   输出格式：json | table，默认 json",
  "  --help, -h              显示帮助",
  "",
  "示例:",
  "  prompthub prompt list",
  "  prompthub --output table prompt search design --tags ui,landing",
  '  prompthub prompt create --title "Landing Hero" --user-prompt-file ./prompt.md',
  "  prompthub skill install ~/.claude/skills/my-skill",
  "  prompthub skill delete my-skill --purge-managed-repo",
  "",
  "更多帮助:",
  "  prompthub prompt --help",
  "  prompthub skill --help",
].join("\n");

const PROMPT_HELP = [
  "Prompt 命令",
  "",
  "用法:",
  "  prompthub prompt list",
  "  prompthub prompt get <id>",
  "  prompthub prompt create --title <title> --user-prompt <text>",
  "  prompthub prompt update <id> [fields...]",
  "  prompthub prompt delete <id>",
  "  prompthub prompt search [keyword] [filters...]",
  "",
  "常用参数:",
  "  --title <text>",
  "  --description <text>",
  "  --user-prompt <text> | --user-prompt-file <file>",
  "  --system-prompt <text> | --system-prompt-file <file>",
  "  --tags a,b",
  "  --folder-id <id>",
  "  --prompt-type text|image|video",
  "  --favorite / --unfavorite",
  "  --pinned / --unpinned",
  "  --sort-by title|createdAt|updatedAt|usageCount",
  "  --sort-order asc|desc",
  "  --limit <n> --offset <n>",
  "",
  "示例:",
  "  prompthub prompt list",
  "  prompthub prompt get 2b8d...",
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
  "  prompthub skill scan [custom-path...]",
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
  "",
  "示例:",
  "  prompthub skill list",
  "  prompthub skill install https://github.com/foo/bar",
  "  prompthub skill install ~/.claude/skills/writer --name writer",
  "  prompthub skill delete writer --purge-managed-repo",
  "  prompthub skill remove writer --keep-platform-installs",
  "  prompthub --output table skill scan ~/.claude/skills",
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

function takeOption(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  if (index === args.length - 1 || args[index + 1].startsWith("--")) {
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

function resolvePromptCreateArgs(args: string[]): CreatePromptDTO {
  const title = takeOption(args, "--title");
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
  const systemPrompt = readTextOption(
    args,
    "--system-prompt",
    "--system-prompt-file",
  );
  const userPrompt = readTextOption(
    args,
    "--user-prompt",
    "--user-prompt-file",
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
    title: title.trim(),
    description,
    promptType,
    folderId,
    source,
    notes,
    tags,
    systemPrompt,
    userPrompt,
  };
}

function resolvePromptUpdateArgs(args: string[]): UpdatePromptDTO {
  const title = takeOption(args, "--title");
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
  const systemPrompt = readTextOption(
    args,
    "--system-prompt",
    "--system-prompt-file",
  );
  const userPrompt = readTextOption(
    args,
    "--user-prompt",
    "--user-prompt-file",
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
    ...(title !== undefined && { title }),
    ...(description !== undefined && { description }),
    ...(promptType !== undefined && { promptType }),
    ...(folderId !== undefined && { folderId }),
    ...(source !== undefined && { source }),
    ...(notes !== undefined && { notes }),
    ...(tags !== undefined && { tags }),
    ...(systemPrompt !== undefined && { systemPrompt }),
    ...(userPrompt !== undefined && { userPrompt }),
    ...(favorite !== undefined && { isFavorite: favorite }),
    ...(pinned !== undefined && { isPinned: pinned }),
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

function skillTableRows(skills: Skill[]): Array<Record<string, unknown>> {
  return skills.map((skill) => ({
    id: skill.id,
    name: skill.name,
    protocol: skill.protocol_type,
    author: skill.author,
    version: skill.version,
    favorite: skill.is_favorite,
    managedRepo: skill.local_repo_path
      ? SkillInstaller.isManagedRepoPath(skill.local_repo_path)
      : false,
    updatedAt: skill.updated_at,
  }));
}

async function handlePromptCommand(
  args: string[],
  context: CliContext,
): Promise<void> {
  if (args.length === 0 || takeFlag(args, "--help") || takeFlag(args, "-h")) {
    context.io.stdout(PROMPT_HELP);
    return;
  }

  const action = requirePositional(args, 0, "prompt 子命令");
  const db = initDatabase();
  const promptDb = new PromptDB(db);

  if (action === "list") {
    const prompts = promptDb.getAll();
    emitSuccess(context, prompts, promptTableRows(prompts));
    return;
  }

  if (action === "get") {
    const id = requirePositional(args, 1, "prompt id");
    const prompt = promptDb.getById(id);
    if (!prompt) {
      throw new CliError(
        "NOT_FOUND",
        `Prompt 不存在: ${id}`,
        EXIT_CODES.NOT_FOUND,
      );
    }
    emitSuccess(context, prompt);
    return;
  }

  if (action === "create") {
    const created = promptDb.create(resolvePromptCreateArgs(args.slice(1)));
    emitSuccess(context, created);
    return;
  }

  if (action === "update") {
    const id = requirePositional(args, 1, "prompt id");
    const updated = promptDb.update(id, resolvePromptUpdateArgs(args.slice(2)));
    if (!updated) {
      throw new CliError(
        "NOT_FOUND",
        `Prompt 不存在: ${id}`,
        EXIT_CODES.NOT_FOUND,
      );
    }
    emitSuccess(context, updated);
    return;
  }

  if (action === "delete") {
    const id = requirePositional(args, 1, "prompt id");
    if (!promptDb.delete(id)) {
      throw new CliError(
        "NOT_FOUND",
        `Prompt 不存在: ${id}`,
        EXIT_CODES.NOT_FOUND,
      );
    }
    emitSuccess(context, { deleted: true, id });
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

async function uninstallSkillFromPlatforms(skillName: string) {
  const platforms = SkillInstaller.getSupportedPlatforms();
  const settled = await Promise.allSettled(
    platforms.map((platform) =>
      SkillInstaller.uninstallSkillMd(skillName, platform.id),
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
    : await uninstallSkillFromPlatforms(skill.name);

  let purgedManagedRepo = false;
  if (
    purgeManagedRepo &&
    skill.local_repo_path &&
    SkillInstaller.isManagedRepoPath(skill.local_repo_path)
  ) {
    await SkillInstaller.deleteRepoByPath(skill.local_repo_path);
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

async function handleSkillCommand(
  args: string[],
  context: CliContext,
): Promise<void> {
  if (args.length === 0 || takeFlag(args, "--help") || takeFlag(args, "-h")) {
    context.io.stdout(SKILL_HELP);
    return;
  }

  const action = requirePositional(args, 0, "skill 子命令");
  const db = initDatabase();
  const skillDb = new SkillDB(db);

  if (action === "list") {
    const skills = skillDb.getAll();
    emitSuccess(context, skills, skillTableRows(skills));
    return;
  }

  if (action === "get") {
    const identifier = requirePositional(args, 1, "skill id 或 name");
    const skill = resolveSkill(skillDb, identifier);
    if (!skill) {
      throw new CliError(
        "NOT_FOUND",
        `Skill 不存在: ${identifier}`,
        EXIT_CODES.NOT_FOUND,
      );
    }
    emitSuccess(context, skill);
    return;
  }

  if (action === "install") {
    const source = requirePositional(args, 1, "skill source");
    const installArgs = args.slice(2);
    const name = takeOption(installArgs, "--name");
    ensureNoUnknownOptions(installArgs);
    const skillId = await SkillInstaller.installFromSource(source, skillDb, {
      name,
    });
    emitSuccess(context, skillDb.getById(skillId));
    return;
  }

  if (action === "delete" || action === "remove") {
    const identifier = requirePositional(args, 1, "skill id 或 name");
    const skill = resolveSkill(skillDb, identifier);
    if (!skill) {
      throw new CliError(
        "NOT_FOUND",
        `Skill 不存在: ${identifier}`,
        EXIT_CODES.NOT_FOUND,
      );
    }
    await handleSkillDelete(skillDb, skill, args.slice(2), context);
    return;
  }

  if (action === "scan") {
    const scanned = await SkillInstaller.scanLocalPreview(args.slice(1));
    emitSuccess(
      context,
      scanned,
      scanned.map((skill) => ({
        name: skill.name,
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

function configureCliRuntime(args: string[]): {
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

  configureRuntimePaths({
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
): Promise<number> {
  const restoreConsole = suppressConsoleNoise();

  try {
    const configured = configureCliRuntime(argv);
    const context: CliContext = { io, output: configured.output };
    const args = configured.args;

    if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
      io.stdout(ROOT_HELP);
      return EXIT_CODES.OK;
    }

    const resource = requirePositional(args, 0, "资源类型");
    const commandArgs = args.slice(1);

    if (resource === "prompt") {
      await handlePromptCommand(commandArgs, context);
      return EXIT_CODES.OK;
    }
    if (resource === "skill") {
      await handleSkillCommand(commandArgs, context);
      return EXIT_CODES.OK;
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
        : new CliError(
            "INTERNAL_ERROR",
            error instanceof Error ? error.message : String(error),
            EXIT_CODES.INTERNAL,
          );
    emitError({ io, output: "json" }, cliError);
    return cliError.exitCode;
  } finally {
    restoreConsole();
    closeDatabase();
    resetRuntimePaths();
  }
}
