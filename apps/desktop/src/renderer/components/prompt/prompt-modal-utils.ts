import type {
  CreatePromptDTO,
  Prompt,
  PromptType,
  UpdatePromptDTO,
} from "@prompthub/shared/types";

export interface PromptFormData {
  title: string;
  description: string;
  promptType: PromptType;
  systemPrompt: string;
  systemPromptEn: string;
  userPrompt: string;
  userPromptEn: string;
  tags: string[];
  folderId?: string;
  images: string[];
  videos: string[];
  source: string;
  notes: string;
}

export interface PromptBilingualFields {
  systemPrompt: string;
  systemPromptEn: string;
  userPrompt: string;
  userPromptEn: string;
}

export interface ParsedPromptVariable {
  fullMatch: string;
  name: string;
  defaultValue?: string;
}

interface BuildPromptPayloadOptions {
  preserveEmptyOptionalFields?: boolean;
}

function optionalPromptText(
  value: string,
  preserveEmptyOptionalFields: boolean,
): string | undefined {
  const trimmed = value.trim();
  if (trimmed) return trimmed;
  return preserveEmptyOptionalFields ? "" : undefined;
}

const PROMPT_VARIABLE_REGEX = /\{\{\s*([^}:]+?)\s*(?::\s*([^}]*?))?\s*\}\}/g;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function buildPromptVariablePlaceholderRegex(name: string): RegExp {
  return new RegExp(
    `\\{\\{\\s*${escapeRegExp(name)}\\s*(?::[^}]*)?\\s*\\}\\}`,
    "g",
  );
}

export function parsePromptVariables(text: string): ParsedPromptVariable[] {
  const variables: ParsedPromptVariable[] = [];
  const seen = new Set<string>();

  for (const match of text.matchAll(PROMPT_VARIABLE_REGEX)) {
    const name = match[1].trim();
    if (!name || seen.has(name)) {
      continue;
    }

    seen.add(name);
    variables.push({
      fullMatch: match[0],
      name,
      defaultValue: match[2]?.trim(),
    });
  }

  return variables;
}

export function replacePromptVariables(
  text: string,
  values: Record<string, string>,
): string {
  return text.replace(
    PROMPT_VARIABLE_REGEX,
    (_match, rawName: string, rawDefaultValue?: string) => {
      const name = rawName.trim();
      const defaultValue = rawDefaultValue?.trim() || "";
      const value = values[name] || defaultValue;
      return value || `{{${name}}}`;
    },
  );
}

export function createPromptFormData(
  source?: Partial<Prompt> | Partial<CreatePromptDTO> | null,
  defaults?: Partial<PromptFormData>,
): PromptFormData {
  return {
    title: source?.title || defaults?.title || "",
    description: source?.description || defaults?.description || "",
    promptType:
      source?.promptType || defaults?.promptType || ("text" as PromptType),
    systemPrompt: source?.systemPrompt || defaults?.systemPrompt || "",
    systemPromptEn: source?.systemPromptEn || defaults?.systemPromptEn || "",
    userPrompt: source?.userPrompt || defaults?.userPrompt || "",
    userPromptEn: source?.userPromptEn || defaults?.userPromptEn || "",
    tags: source?.tags ? [...source.tags] : [...(defaults?.tags || [])],
    folderId: source?.folderId ?? defaults?.folderId,
    images: source?.images ? [...source.images] : [...(defaults?.images || [])],
    videos: source?.videos ? [...source.videos] : [...(defaults?.videos || [])],
    source: source?.source || defaults?.source || "",
    notes: source?.notes || defaults?.notes || "",
  };
}

export function buildPromptPayload(
  form: PromptFormData,
  options: BuildPromptPayloadOptions = {},
): CreatePromptDTO | UpdatePromptDTO {
  const preserveEmptyOptionalFields = options.preserveEmptyOptionalFields === true;

  return {
    title: form.title.trim(),
    description: optionalPromptText(
      form.description,
      preserveEmptyOptionalFields,
    ),
    promptType: form.promptType,
    systemPrompt: optionalPromptText(
      form.systemPrompt,
      preserveEmptyOptionalFields,
    ),
    systemPromptEn: optionalPromptText(
      form.systemPromptEn,
      preserveEmptyOptionalFields,
    ),
    userPrompt: form.userPrompt.trim(),
    userPromptEn: optionalPromptText(
      form.userPromptEn,
      preserveEmptyOptionalFields,
    ),
    tags: [...form.tags],
    images: [...form.images],
    videos: [...form.videos],
    folderId: form.folderId || undefined,
    source: optionalPromptText(form.source, preserveEmptyOptionalFields),
    notes: optionalPromptText(form.notes, preserveEmptyOptionalFields),
  };
}

export function hasPromptFormChanges(
  form: PromptFormData,
  baseline?: Partial<Prompt> | Partial<CreatePromptDTO> | null,
): boolean {
  const initial = createPromptFormData(baseline);

  return (
    form.title !== initial.title ||
    form.description !== initial.description ||
    form.promptType !== initial.promptType ||
    form.systemPrompt !== initial.systemPrompt ||
    form.systemPromptEn !== initial.systemPromptEn ||
    form.userPrompt !== initial.userPrompt ||
    form.userPromptEn !== initial.userPromptEn ||
    JSON.stringify(form.tags) !== JSON.stringify(initial.tags) ||
    JSON.stringify(form.images) !== JSON.stringify(initial.images) ||
    JSON.stringify(form.videos) !== JSON.stringify(initial.videos) ||
    (form.folderId || undefined) !== (initial.folderId || undefined) ||
    form.source !== initial.source ||
    form.notes !== initial.notes
  );
}

export function getExistingPromptTags(prompts: Prompt[]): string[] {
  return [...new Set(prompts.flatMap((prompt) => prompt.tags))].sort((a, b) =>
    a.localeCompare(b),
  );
}

export function mergePromptTagCatalog(
  prompts: Prompt[],
  promptTagCatalog: string[],
): string[] {
  return Array.from(
    new Set([
      ...getExistingPromptTags(prompts),
      ...promptTagCatalog.map((tag) => tag.trim()).filter(Boolean),
    ]),
  ).sort((a, b) => a.localeCompare(b));
}

export function promoteMainEnglishToEnglishVersion(
  fields: PromptBilingualFields,
): PromptBilingualFields {
  const hasEnglishVersion = !!(fields.systemPromptEn || fields.userPromptEn);
  const combinedMain = [fields.systemPrompt, fields.userPrompt]
    .filter(Boolean)
    .join(" ");

  if (hasEnglishVersion || !isPureEnglish(combinedMain)) {
    return fields;
  }

  return {
    systemPrompt: "",
    userPrompt: "",
    systemPromptEn: fields.systemPrompt,
    userPromptEn: fields.userPrompt,
  };
}

export function isPureEnglish(text: string): boolean {
  if (!text || text.trim().length < 10) return false;

  const cleaned = text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`]*`/g, "")
    .replace(/\{\{[^}]*\}\}/g, "")
    .replace(/https?:\/\/\S+/g, "");

  const cjkPattern =
    /[\u4e00-\u9fff\u3400-\u4dbf\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/;
  if (cjkPattern.test(cleaned)) return false;

  const latinOnly = cleaned.replace(/[^a-zA-Z]/g, "");
  return latinOnly.length >= 10;
}

export function getLanguageName(langCode: string): string {
  const lang = langCode.toLowerCase();
  if (lang.startsWith("zh")) return "Chinese";
  if (lang.startsWith("ja")) return "Japanese";
  if (lang.startsWith("de")) return "German";
  if (lang.startsWith("fr")) return "French";
  if (lang.startsWith("es")) return "Spanish";
  if (lang.startsWith("ko")) return "Korean";
  if (lang.startsWith("pt")) return "Portuguese";
  if (lang.startsWith("ru")) return "Russian";
  if (lang.startsWith("it")) return "Italian";
  return "the target language";
}
