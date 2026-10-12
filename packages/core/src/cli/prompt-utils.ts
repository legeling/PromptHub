import { PromptDB } from "../database";
import type {
  CreatePromptDTO,
  Prompt,
  PromptVersion,
  SearchQuery,
  UpdatePromptDTO,
  Variable,
} from "@prompthub/shared/types";
import { CliError, EXIT_CODES, type CliContext } from "./types";
import {
  ensureNoUnknownOptions,
  parseCsv,
  parseNumberOption,
  parseOptionalStringArrayValue,
  parseOptionalStringValue,
  parsePositiveNumberOption,
  parsePromptScopeOption,
  parsePromptVisibilityOption,
  parseVariableType,
  parseVariablesOption,
  readJsonOption,
  readTextOption,
  takeFlag,
  takeOption,
  type PromptDiffField,
  type PromptDiffResult,
} from "./args";

export function resolvePromptCreateArgs(args: string[]): CreatePromptDTO {
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
  const parentId = takeOption(args, "--parent-id");
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
    ...(parentId !== undefined && { parentId: parentId || null }),
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

export function resolvePromptUpdateArgs(args: string[]): UpdatePromptDTO {
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
  const parentId = takeOption(args, "--parent-id");
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
    ...(parentId !== undefined && { parentId: parentId || null }),
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

export function resolvePromptSearchArgs(args: string[]): SearchQuery {
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

export function promptTableRows(
  prompts: Prompt[],
): Array<Record<string, unknown>> {
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

export function promptVersionTableRows(
  versions: PromptVersion[],
): Array<Record<string, unknown>> {
  return versions.map((version) => ({
    id: version.id,
    version: version.version,
    note: version.note,
    createdAt: version.createdAt,
  }));
}

export function promptTagTableRows(
  tags: string[],
): Array<Record<string, unknown>> {
  return tags.map((tag) => ({ tag }));
}

export function promptDiffTableRows(
  diff: PromptDiffResult,
): Array<Record<string, unknown>> {
  return diff.fields.map((field) => ({
    field: field.field,
    from: field.from,
    to: field.to,
  }));
}

export function pushPromptDiff(
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

export function diffPromptVersions(
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

export function resolvePromptVersionDiffArgs(args: string[]): {
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

export function duplicatePrompt(promptDb: PromptDB, id: string): Prompt {
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

export function renderPromptCopy(
  prompt: Prompt,
  variables: Record<string, string>,
): string {
  let content = prompt.userPrompt;
  for (const [key, value] of Object.entries(variables)) {
    content = content.replaceAll(`{{${key}}}`, () => value);
  }
  return content;
}

export function requirePrompt(promptDb: PromptDB, id: string): Prompt {
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
