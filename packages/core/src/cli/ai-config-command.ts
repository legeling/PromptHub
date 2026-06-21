import type { CliIO } from "./run";
import {
  AIConfigError,
  coreAIConfigService,
  type CoreAIConfigFile,
  type CoreAIModelCapabilities,
  type CoreAIModelConfig,
  type CoreAIModelRoute,
  type CoreAIModelType,
} from "../ai-config";
import type { AIProtocol } from "@prompthub/shared/types";

type OutputFormat = "json" | "table";

const EXIT_CODES = {
  OK: 0,
  USAGE: 2,
  NOT_FOUND: 3,
  CONFLICT: 4,
  INTERNAL: 10,
} as const;

const ROUTES: CoreAIModelRoute[] = [
  "mainText",
  "fastText",
  "visionText",
  "imageGeneration",
];

interface SelectionChoice<T> {
  value: T;
  label: string;
  description?: string;
}

export const AI_CONFIG_HELP = [
  "AI 命令",
  "",
  "用法:",
  "  prompthub ai providers",
  "  prompthub ai provider-add --provider <id> --api-key <key> --api-url <url>",
  "  prompthub ai provider-delete <provider-id>",
  "  prompthub ai models",
  "  prompthub ai model-add --provider <provider-id> --model <model>",
  "  prompthub ai model-delete <model-id>",
  "  prompthub ai routes",
  "  prompthub ai route-set <mainText|fastText|visionText|imageGeneration> [model-id|name|query]",
  "  prompthub ai route-clear <mainText|fastText|visionText|imageGeneration>",
  "",
  "常用参数:",
  "  --name <text>",
  "  --protocol openai|gemini|anthropic",
  "  --type chat|image",
  "  --vision",
  "  --image-generation",
  "  --reasoning",
].join("\n");

function toJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function emitJson(io: CliIO, value: unknown): void {
  io.stdout(toJson(value));
}

function emitError(io: CliIO, code: string, message: string): void {
  io.stderr(toJson({ error: { code, message } }));
}

function takeOption(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  if (index === args.length - 1) {
    throw new AIConfigError("USAGE_ERROR", `${name} 需要一个值`);
  }
  const value = args[index + 1];
  args.splice(index, 2);
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

function requirePositional(
  args: string[],
  index: number,
  name: string,
): string {
  const value = args[index]?.trim();
  if (!value) {
    throw new AIConfigError("USAGE_ERROR", `缺少 ${name}`);
  }
  return value;
}

function ensureNoUnknownOptions(args: string[]): void {
  const unknown = args.find((arg) => arg.startsWith("-"));
  if (unknown) {
    throw new AIConfigError("USAGE_ERROR", `未知参数: ${unknown}`);
  }
}

function parseProtocol(value: string | undefined): AIProtocol | undefined {
  if (!value) {
    return undefined;
  }
  if (value === "openai" || value === "gemini" || value === "anthropic") {
    return value;
  }
  throw new AIConfigError("USAGE_ERROR", `不支持的 AI 协议: ${value}`);
}

function parseModelType(
  value: string | undefined,
): CoreAIModelType | undefined {
  if (!value) {
    return undefined;
  }
  if (value === "chat" || value === "image") {
    return value;
  }
  throw new AIConfigError("USAGE_ERROR", `不支持的模型类型: ${value}`);
}

function parseRoute(value: string): CoreAIModelRoute {
  if (ROUTES.includes(value as CoreAIModelRoute)) {
    return value as CoreAIModelRoute;
  }
  throw new AIConfigError("USAGE_ERROR", `不支持的模型路由: ${value}`);
}

function maskSecret(secret: string): string {
  if (!secret) {
    return "";
  }
  if (secret.length <= 8) {
    return "****";
  }
  return `${secret.slice(0, 4)}...${secret.slice(-4)}`;
}

function sanitizeValue<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item)) as T;
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      key === "apiKey" && typeof entry === "string"
        ? maskSecret(entry)
        : sanitizeValue(entry),
    ]),
  ) as T;
}

function tableRows(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) {
    return value.map((item) =>
      item && typeof item === "object"
        ? (item as Record<string, unknown>)
        : { value: item },
    );
  }
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).map((item) =>
      item && typeof item === "object"
        ? (item as Record<string, unknown>)
        : { value: item },
    );
  }
  return [{ value }];
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
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
  const formattedRows = rows.map((row) =>
    columns.map((column) => formatCell(row[column])),
  );
  const widths = columns.map((column, index) =>
    Math.max(column.length, ...formattedRows.map((row) => row[index].length)),
  );
  const renderLine = (cells: string[]) =>
    cells
      .map((cell, index) => cell.padEnd(widths[index], " "))
      .join("  ")
      .trimEnd();

  return [
    renderLine(columns),
    widths.map((width) => "-".repeat(width)).join("  "),
    ...formattedRows.map(renderLine),
  ].join("\n");
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

function hasExactSearchMatch(
  values: Array<string | undefined>,
  query: string,
): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  return values.some(
    (value) => value?.trim().toLowerCase() === normalizedQuery,
  );
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

function readLineFromInput(
  input: NonNullable<CliIO["stdin"]>,
): Promise<string> {
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

async function selectFromTerminal<T>(
  io: CliIO,
  title: string,
  choices: SelectionChoice<T>[],
  invalidLabel: string,
): Promise<T> {
  if (choices.length === 0) {
    throw new AIConfigError("NOT_FOUND", "没有可选择的 AI model");
  }
  if (!io.isInteractive || !io.stdin) {
    throw new AIConfigError(
      "USAGE_ERROR",
      "缺少 model id/name；在交互式终端中可省略并选择，非交互调用请传入模型 id 或查询词",
    );
  }

  io.stderr(title);
  choices.forEach((choice, index) => {
    const description = choice.description ? ` - ${choice.description}` : "";
    io.stderr(`  ${index + 1}. ${choice.label}${description}`);
  });
  io.stderr("输入编号：");

  const answer = (await readLineFromInput(io.stdin)).trim();
  const selectedIndex = Number.parseInt(answer, 10);
  if (
    !Number.isInteger(selectedIndex) ||
    selectedIndex < 1 ||
    selectedIndex > choices.length
  ) {
    throw new AIConfigError(
      "USAGE_ERROR",
      `无效的 ${invalidLabel}: ${answer || "(empty)"}`,
    );
  }

  return choices[selectedIndex - 1].value;
}

function isModelCompatibleWithRoute(
  route: CoreAIModelRoute,
  model: CoreAIModelConfig,
): boolean {
  if (route === "imageGeneration") {
    return (
      model.type === "image" || model.capabilities?.imageGeneration === true
    );
  }
  if (model.type !== "chat" || model.capabilities?.chat === false) {
    return false;
  }
  return route !== "visionText" || model.capabilities?.vision === true;
}

function modelChoice(
  model: CoreAIModelConfig,
): SelectionChoice<CoreAIModelConfig> {
  return {
    value: model,
    label: model.name || model.model,
    description: `${model.provider} / ${model.id}`,
  };
}

async function resolveRouteModelId(
  io: CliIO,
  route: CoreAIModelRoute,
  identifier: string | undefined,
): Promise<string> {
  const models = coreAIConfigService.read().models;
  if (!identifier?.trim()) {
    const compatible = models.filter((model) =>
      isModelCompatibleWithRoute(route, model),
    );
    const selected = await selectFromTerminal(
      io,
      `选择 ${route} 路由模型：`,
      compatible.map(modelChoice),
      "AI model 编号",
    );
    return selected.id;
  }

  const exact = models.find((model) =>
    hasExactSearchMatch([model.id, model.name, model.model], identifier),
  );
  if (exact) {
    return exact.id;
  }

  const compatibleMatches = findRankedMatches(
    models.filter((model) => isModelCompatibleWithRoute(route, model)),
    identifier,
    (model) => [model.id, model.name, model.model, model.provider],
    (model) => model.name || model.model,
  );
  if (compatibleMatches.length === 0) {
    throw new AIConfigError(
      "NOT_FOUND",
      `没有匹配 ${route} 路由的兼容 AI model: ${identifier}`,
    );
  }
  if (compatibleMatches.length === 1) {
    return compatibleMatches[0].id;
  }

  if (io.isInteractive) {
    const selected = await selectFromTerminal(
      io,
      `选择 ${route} 路由模型（匹配 "${identifier.trim()}"）：`,
      compatibleMatches.map(modelChoice),
      "AI model 编号",
    );
    return selected.id;
  }

  throw new AIConfigError(
    "CONFLICT",
    `AI model 查询匹配多个兼容结果: ${identifier}; candidates=${compatibleMatches
      .map((model) => `${model.id}:${model.name || model.model}`)
      .join(", ")}`,
  );
}

function emitSuccess(io: CliIO, output: OutputFormat, value: unknown): void {
  const sanitized = sanitizeValue(value);
  if (output === "table") {
    io.stdout(renderTable(tableRows(sanitized)));
    return;
  }
  emitJson(io, sanitized);
}

function modelCapabilities(
  args: string[],
  type: CoreAIModelType,
): CoreAIModelCapabilities {
  return {
    chat: type === "chat",
    vision: takeFlag(args, "--vision"),
    imageGeneration: takeFlag(args, "--image-generation") || type === "image",
    reasoning: takeFlag(args, "--reasoning"),
  };
}

function successConfigPayload(
  config: CoreAIConfigFile,
): Record<string, unknown> {
  return {
    providers: config.providers,
    models: config.models,
    modelRouteDefaults: config.modelRouteDefaults,
    updatedAt: config.updatedAt,
  };
}

export async function handleAIConfigCommand(
  inputArgs: string[],
  io: CliIO,
  output: OutputFormat,
): Promise<number> {
  const args = [...inputArgs];

  try {
    if (args.length === 0 || takeFlag(args, "--help") || takeFlag(args, "-h")) {
      io.stdout(AI_CONFIG_HELP);
      return EXIT_CODES.OK;
    }

    const action = requirePositional(args, 0, "ai 子命令");

    if (action === "providers") {
      ensureNoUnknownOptions(args.slice(1));
      emitSuccess(io, output, coreAIConfigService.read().providers);
      return EXIT_CODES.OK;
    }

    if (action === "provider-add") {
      const providerArgs = args.slice(1);
      const provider = takeOption(providerArgs, "--provider");
      const name = takeOption(providerArgs, "--name");
      const apiProtocol = parseProtocol(takeOption(providerArgs, "--protocol"));
      const apiKey = takeOption(providerArgs, "--api-key");
      const apiUrl = takeOption(providerArgs, "--api-url");
      ensureNoUnknownOptions(providerArgs);
      emitSuccess(
        io,
        output,
        coreAIConfigService.addProvider({
          provider: provider ?? "",
          name,
          apiProtocol,
          apiKey: apiKey ?? "",
          apiUrl: apiUrl ?? "",
        }),
      );
      return EXIT_CODES.OK;
    }

    if (action === "provider-delete") {
      const providerId = requirePositional(args, 1, "provider id");
      ensureNoUnknownOptions(args.slice(2));
      emitSuccess(
        io,
        output,
        successConfigPayload(coreAIConfigService.deleteProvider(providerId)),
      );
      return EXIT_CODES.OK;
    }

    if (action === "models") {
      ensureNoUnknownOptions(args.slice(1));
      emitSuccess(io, output, coreAIConfigService.read().models);
      return EXIT_CODES.OK;
    }

    if (action === "model-add") {
      const modelArgs = args.slice(1);
      const provider = takeOption(modelArgs, "--provider");
      const model = takeOption(modelArgs, "--model");
      const name = takeOption(modelArgs, "--name");
      const type = parseModelType(takeOption(modelArgs, "--type")) ?? "chat";
      const apiProtocol = parseProtocol(takeOption(modelArgs, "--protocol"));
      const apiKey = takeOption(modelArgs, "--api-key");
      const apiUrl = takeOption(modelArgs, "--api-url");
      const capabilities = modelCapabilities(modelArgs, type);
      ensureNoUnknownOptions(modelArgs);
      emitSuccess(
        io,
        output,
        coreAIConfigService.addModel({
          provider: provider ?? "",
          model: model ?? "",
          name,
          type,
          capabilities,
          apiProtocol,
          apiKey,
          apiUrl,
        }),
      );
      return EXIT_CODES.OK;
    }

    if (action === "model-delete") {
      const modelId = requirePositional(args, 1, "model id");
      ensureNoUnknownOptions(args.slice(2));
      emitSuccess(
        io,
        output,
        successConfigPayload(coreAIConfigService.deleteModel(modelId)),
      );
      return EXIT_CODES.OK;
    }

    if (action === "routes") {
      ensureNoUnknownOptions(args.slice(1));
      emitSuccess(io, output, coreAIConfigService.routeSummary());
      return EXIT_CODES.OK;
    }

    if (action === "route-set") {
      const route = parseRoute(requirePositional(args, 1, "route"));
      const identifier =
        args[2]?.trim() && !args[2].startsWith("-") ? args[2] : undefined;
      const modelId = await resolveRouteModelId(io, route, identifier);
      ensureNoUnknownOptions(args.slice(identifier ? 3 : 2));
      emitSuccess(
        io,
        output,
        successConfigPayload(coreAIConfigService.setRoute(route, modelId)),
      );
      return EXIT_CODES.OK;
    }

    if (action === "route-clear") {
      const route = parseRoute(requirePositional(args, 1, "route"));
      ensureNoUnknownOptions(args.slice(2));
      emitSuccess(
        io,
        output,
        successConfigPayload(coreAIConfigService.clearRoute(route)),
      );
      return EXIT_CODES.OK;
    }

    throw new AIConfigError("USAGE_ERROR", `不支持的 ai 子命令: ${action}`);
  } catch (error) {
    const configError =
      error instanceof AIConfigError
        ? error
        : new AIConfigError(
            "INTERNAL_ERROR",
            error instanceof Error ? error.message : String(error),
          );
    emitError(io, configError.code, configError.message);
    if (configError.code === "NOT_FOUND") {
      return EXIT_CODES.NOT_FOUND;
    }
    if (
      configError.code === "ROUTE_CAPABILITY_MISMATCH" ||
      configError.code === "CONFLICT"
    ) {
      return EXIT_CODES.CONFLICT;
    }
    if (configError.code === "USAGE_ERROR") {
      return EXIT_CODES.USAGE;
    }
    return EXIT_CODES.INTERNAL;
  }
}
