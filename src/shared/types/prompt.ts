/**
 * Core Prompt type definitions
 * Prompt 核心类型定义
 */

export interface Prompt {
  id: string;
  title: string;
  description?: string;
  systemPrompt?: string;
  systemPromptEn?: string;  // English System Prompt / 英文版 System Prompt
  userPrompt: string;
  userPromptEn?: string;    // English User Prompt / 英文版 User Prompt
  variables: Variable[];
  tags: string[];
  folderId?: string;
  images?: string[];
  videos?: string[];         // Video file names for preview / 视频预览文件名
  isFavorite: boolean;
  isPinned: boolean;        // Pinned / 置顶
  version: number;
  currentVersion: number;
  usageCount: number;
  source?: string;          // 来源 / Source URL or reference
  notes?: string;           // 备注 / Personal notes about the prompt
  lastAiResponse?: string;  // Last AI test response / 最后一次 AI 测试的响应
  createdAt: string;  // ISO 8601 format / ISO 8601 格式
  updatedAt: string;  // ISO 8601 format / ISO 8601 格式
}

export interface Variable {
  name: string;
  type: VariableType;
  label?: string;
  defaultValue?: string;
  options?: string[]; // for select type
  required: boolean;
}

export type VariableType = 'text' | 'textarea' | 'number' | 'select';

export interface PromptVersion {
  id: string;
  promptId: string;
  version: number;
  systemPrompt?: string;
  userPrompt: string;
  variables: Variable[];
  note?: string;
  aiResponse?: string;  // AI test response for this version / 该版本的 AI 测试响应
  createdAt: string;  // ISO 8601 format / ISO 8601 格式
}

// DTO Types
export interface CreatePromptDTO {
  title: string;
  description?: string;
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
  title?: string;
  description?: string;
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
  keyword?: string;
  tags?: string[];
  folderId?: string;
  isFavorite?: boolean;
  sortBy?: 'title' | 'createdAt' | 'updatedAt' | 'usageCount';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}
