/**
 * Core Prompt type definitions
 * Prompt 核心类型定义
 */

// Prompt 类型：文本对话 / 图片生成 / 视频生成
export type PromptType = "text" | "image" | "video";
export type ResourceVisibility = 'private' | 'shared';

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
  folderId?: string;
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
  folderId?: string;
  images?: string[];
  videos?: string[];
  isFavorite?: boolean;
  isPinned?: boolean;
  usageCount?: number;
  source?: string;
  notes?: string;
  lastAiResponse?: string;
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
