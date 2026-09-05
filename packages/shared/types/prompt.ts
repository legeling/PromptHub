/**
 * Core Prompt type definitions
 * Prompt 核心类型定义
 */

// Prompt 类型：文本对话 / 图片生成 / 视频生成
export type PromptType = "text" | "image" | "video";
export type ResourceVisibility = 'private' | 'shared';
export type PromptRelationKind =
  | "grouped_under"
  | "related_to"
  | "variant_of"
  | "depends_on"
  | "next_step";
export type PromptGraphRelationKind = Exclude<
  PromptRelationKind,
  "grouped_under"
>;

export interface Prompt {
  id: string;
  ownerUserId?: string | null;
  visibility?: ResourceVisibility;
  title: string;
  description?: string | null;
  promptType?: PromptType; // Prompt 类型，默认 text
  systemPrompt?: string | null;
  systemPromptEn?: string | null; // English System Prompt / 英文版 System Prompt
  userPrompt: string;
  userPromptEn?: string | null; // English User Prompt / 英文版 User Prompt
  variables: Variable[];
  tags: string[];
  folderId?: string | null;
  parentId?: string | null;
  order?: number;
  images?: string[];
  videos?: string[]; // Video file names for preview / 视频预览文件名
  isFavorite: boolean;
  isPinned: boolean; // Pinned / 置顶
  version: number;
  currentVersion: number;
  usageCount: number;
  source?: string | null; // 来源 / Source URL or reference
  notes?: string | null; // 备注 / Personal notes about the prompt
  lastAiResponse?: string | null; // Last AI test response / 最后一次 AI 测试的响应
  createdAt: string; // ISO 8601 format / ISO 8601 格式
  updatedAt: string; // ISO 8601 format / ISO 8601 格式
}

/**
 * Lightweight list projection of a Prompt.
 *
 * Contains only the fields needed by list / search / kanban / gallery views.
 * Deliberately EXCLUDES large text fields (userPrompt, systemPrompt, notes,
 * lastAiResponse, variables) so the list main path does not serialize them
 * across IPC / HTTP. Full content is loaded on demand via prompt:get.
 *
 * 列表投影：只含列表/搜索/看板/画廊需要的字段，刻意排除大文本字段，
 * 完整内容通过 prompt:get 按需加载。
 */
export interface PromptSummary {
  id: string;
  ownerUserId?: string | null;
  visibility?: ResourceVisibility;
  title: string;
  description?: string | null;
  promptType?: PromptType;
  tags: string[];
  folderId?: string | null;
  parentId?: string | null;
  order?: number;
  images?: string[];
  videos?: string[];
  isFavorite: boolean;
  isPinned: boolean;
  usageCount: number;
  source?: string | null;
  version: number;
  currentVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface Variable {
  name: string;
  type: VariableType;
  label?: string;
  defaultValue?: string;
  options?: string[]; // for select type
  required: boolean;
}

export type VariableType = "text" | "textarea" | "number" | "select";

export interface PromptVersion {
  id: string;
  promptId: string;
  version: number;
  systemPrompt?: string | null;
  systemPromptEn?: string | null;
  userPrompt: string;
  userPromptEn?: string | null;
  variables: Variable[];
  note?: string | null;
  aiResponse?: string | null; // AI test response for this version / 该版本的 AI 测试响应
  createdAt: string; // ISO 8601 format / ISO 8601 格式
}

export interface PromptRelation {
  id: string;
  sourcePromptId: string;
  targetPromptId: string;
  kind: PromptGraphRelationKind;
  note?: string | null;
  createdAt: string;
  updatedAt: string;
}

// DTO Types
export interface CreatePromptDTO {
  visibility?: ResourceVisibility;
  title: string;
  description?: string;
  promptType?: PromptType;
  systemPrompt?: string;
  systemPromptEn?: string;
  userPrompt: string;
  userPromptEn?: string;
  variables?: Variable[];
  tags?: string[];
  folderId?: string | null;
  parentId?: string | null;
  order?: number;
  images?: string[];
  videos?: string[];
  source?: string;
  notes?: string;
}

export interface UpdatePromptDTO {
  visibility?: ResourceVisibility;
  title?: string;
  description?: string;
  promptType?: PromptType;
  systemPrompt?: string;
  systemPromptEn?: string;
  userPrompt?: string;
  userPromptEn?: string;
  variables?: Variable[];
  tags?: string[];
  folderId?: string | null;
  parentId?: string | null;
  order?: number;
  images?: string[];
  videos?: string[];
  isFavorite?: boolean;
  isPinned?: boolean;
  usageCount?: number;
  source?: string;
  notes?: string;
  lastAiResponse?: string;
}

export interface CreatePromptRelationDTO {
  sourcePromptId: string;
  targetPromptId: string;
  kind: PromptGraphRelationKind;
  note?: string | null;
}

export interface UpdatePromptRelationDTO {
  kind?: PromptGraphRelationKind;
  note?: string | null;
}

export interface PromptRelationQuery {
  promptId?: string;
  kind?: PromptGraphRelationKind;
  direction?: "outgoing" | "incoming" | "both";
}

export interface OutputFormatItem {
  id: string;
  sourcePromptId: string;
  targetPromptId: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateOutputFormatItemDTO {
  sourcePromptId: string;
  targetPromptId: string | null;
  sortOrder?: number;
}

export interface UpdateOutputFormatItemDTO {
  sortOrder?: number;
}

export interface OutputFormatItemQuery {
  sourcePromptId?: string;
}

export interface SearchQuery {
  scope?: 'private' | 'shared' | 'all';
  keyword?: string;
  tags?: string[];
  folderId?: string;
  isFavorite?: boolean;
  sortBy?: "title" | "createdAt" | "updatedAt" | "usageCount";
  sortOrder?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

/**
 * Result of deleting a prompt tag.
 *
 * `deleted: true` when the tag is no longer referenced by any prompt.
 * `referenced` reports how many prompts still reference the tag when deletion
 * was refused (e.g. desktop/web enforce a "tag still in use" guard). Kept a
 * single shared type so desktop IPC and self-hosted web return the same shape.
 * 删除标签的统一返回：deleted 表示已删除，referenced 给出仍引用条数（拒绝时）。
 */
export interface PromptTagDeleteResult {
  deleted: boolean;
  referenced: number;
}
