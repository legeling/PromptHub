import type { PromptType } from "@prompthub/shared/types";
import type { AIConfig } from "../../services/ai";
import {
  resolveScenarioAIConfig,
} from "../../services/ai-defaults";
import type {
  AIModelConfig,
  ModelRouteDefaults,
  ScenarioModelDefaults,
} from "../../stores/settings.store";

interface ResolveQuickAddAnalysisConfigOptions {
  aiModels: AIModelConfig[];
  scenarioModelDefaults: ScenarioModelDefaults;
  modelRouteDefaults?: ModelRouteDefaults;
  aiProvider: string;
  aiApiProtocol: AIConfig["apiProtocol"];
  aiApiKey: string;
  aiApiUrl: string;
  aiModel: string;
}

export function resolveQuickAddAnalysisConfig({
  aiModels,
  scenarioModelDefaults,
  modelRouteDefaults,
  aiProvider,
  aiApiProtocol,
  aiApiKey,
  aiApiUrl,
  aiModel,
}: ResolveQuickAddAnalysisConfigOptions): AIConfig | null {
  return resolveScenarioAIConfig({
    aiModels,
    scenarioModelDefaults,
    modelRouteDefaults,
    scenario: "quickAdd",
    type: "chat",
    aiProvider,
    aiApiProtocol,
    aiApiKey,
    aiApiUrl,
    aiModel,
  });
}

export function getQuickAddFallbackTitle(
  promptText: string,
  emptyFallback = "New Prompt",
): string {
  const firstLine = promptText
    .trim()
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);

  return firstLine?.slice(0, 30) || emptyFallback;
}

export type QuickAddMode = "analyze" | "generate";

export interface QuickAddAnalysisResult {
  title?: string;
  systemPrompt?: string;
  description?: string;
  suggestedFolder?: string | null;
  tags: string[];
}

export interface QuickAddGeneratedDraft {
  title: string;
  promptType: PromptType;
  systemPrompt?: string;
  userPrompt: string;
  description?: string;
  suggestedFolder?: string | null;
  tags: string[];
}

interface QuickAddPromptContext {
  folderNames: string;
  tagsString: string;
}

function extractJsonObject(
  responseContent: string,
): Record<string, unknown> | null {
  const jsonMatch = responseContent.match(/\{[\s\S]*\}/);

  if (!jsonMatch) {
    return null;
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }

    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function asOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function asOptionalFolderName(value: unknown): string | null | undefined {
  if (value === null) {
    return null;
  }

  return asOptionalString(value);
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function asPromptType(value: unknown): PromptType | undefined {
  if (value !== "text" && value !== "image" && value !== "video") {
    return undefined;
  }

  return value;
}

export function buildQuickAddAnalysisPrompt(
  promptText: string,
  context: QuickAddPromptContext,
): string {
  return `你是一名资深 PromptHub 内容整理专家。请分析用户提供的 Prompt，把它整理成可保存、可检索、可复用的结构化元数据，并只返回 JSON。

用户 Prompt:
"""
${promptText}
"""

可用的文件夹列表：
${context.folderNames || "暂无文件夹"}

已知存在的标签（请优先从这些标签中提取或匹配）：
${context.tagsString}

请只返回以下 JSON 结构，不要输出 Markdown、解释或代码块：
{
  "title": "具体、可识别的标题，不超过20字，不要使用“新 Prompt”等泛名",
  "systemPrompt": "如果原文包含角色设定/系统约束，提取并整理；如果没有明确系统提示词，返回空字符串",
  "description": "一句话说明用途，不超过50字",
  "suggestedFolder": "根据内容推荐最适合的文件夹名称，如果没有合适的则返回 null",
  "tags": ["2-5 个标签，优先使用已存在标签，必要时只新增高信号标签"]
}

质量要求：
- 保留原 Prompt 的任务目标、变量占位符、格式约束、代码块和输出结构。
- 不要把用户 Prompt 改写成另一个任务。
- title / description / tags 要便于用户之后搜索和筛选。
- systemPrompt 只能承载角色、行为原则、长期约束；不要把具体用户任务塞进去。`;
}

export function buildQuickAddGeneratePrompt(
  userRequest: string,
  context: QuickAddPromptContext,
  preferredPromptType: PromptType,
): string {
  const preferredTypeLabel =
    { text: "text（文本）", image: "image（绘图）", video: "video（视频）" }[preferredPromptType];

  return `你是一名资深 Prompt 设计师。请根据用户需求，生成一份可以直接保存、测试和复用的 PromptHub 草稿，并只返回 JSON。

用户需求：
"""
${userRequest}
"""

当前偏好 Prompt 类型：
${preferredTypeLabel}

可用的文件夹列表：
${context.folderNames || "暂无文件夹"}

已知存在的标签（请优先复用这些标签）：
${context.tagsString}

请只返回以下 JSON 结构，不要输出 Markdown、解释或代码块：
{
  "title": "具体、可识别的标题，不超过20字，不要使用“通用助手”等泛名",
  "promptType": "text、image 或 video",
  "systemPrompt": "系统提示词；仅写角色、边界、质量标准和长期行为约束；如果不需要，返回空字符串",
  "userPrompt": "最终给模型使用的 Prompt 正文，必须完整、结构化、可直接执行",
  "description": "一句话描述用途，不超过50字",
  "suggestedFolder": "推荐的文件夹名称，如果没有合适的则返回 null",
  "tags": ["2-5 个标签，优先使用已存在标签"]
}

生成要求：
- 必须输出可以直接保存和测试的 Prompt，不要只输出大纲。
- 如果用户需求更像绘图 / 生图任务，返回 promptType=image；视频生成任务返回 video 并描述动作和镜头变化；文本任务返回 text。
- text Prompt 应包含清晰的角色/任务/输入/步骤/输出格式/质量标准。
- image Prompt 的 userPrompt 应覆盖主体、场景、构图、镜头/视角、光线、色彩、材质、风格、质量词和必要的 avoid/negative 约束。
- 保留用户要求的变量占位符，例如 {{topic}}、{{audience}}。
- 不要编造用户未要求的工具、品牌、人物身份、版权实体或不可验证背景。
- 如果用户没有明确指定类型，优先参考当前偏好 Prompt 类型：${preferredTypeLabel}。`;
}

export function parseQuickAddAnalysisResult(
  responseContent: string,
): QuickAddAnalysisResult | null {
  const parsed = extractJsonObject(responseContent);

  if (!parsed) {
    return null;
  }

  return {
    title: asOptionalString(parsed.title),
    systemPrompt: asOptionalString(parsed.systemPrompt),
    description: asOptionalString(parsed.description),
    suggestedFolder: asOptionalFolderName(parsed.suggestedFolder),
    tags: asStringArray(parsed.tags),
  };
}

export function parseQuickAddGeneratedDraft(
  responseContent: string,
  fallbackPromptType: PromptType,
  emptyTitleFallback: string,
): QuickAddGeneratedDraft | null {
  const parsed = extractJsonObject(responseContent);

  if (!parsed) {
    return null;
  }

  const userPrompt = asOptionalString(parsed.userPrompt);

  if (!userPrompt) {
    return null;
  }

  return {
    title:
      asOptionalString(parsed.title) ||
      getQuickAddFallbackTitle(userPrompt, emptyTitleFallback),
    promptType: asPromptType(parsed.promptType) || fallbackPromptType,
    systemPrompt: asOptionalString(parsed.systemPrompt),
    userPrompt,
    description: asOptionalString(parsed.description),
    suggestedFolder: asOptionalFolderName(parsed.suggestedFolder),
    tags: asStringArray(parsed.tags),
  };
}
