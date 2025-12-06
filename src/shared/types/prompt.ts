/**
 * Prompt 核心类型定义
 */

export interface Prompt {
  id: string;
  title: string;
  description?: string;
  systemPrompt?: string;
  userPrompt: string;
  variables: Variable[];
  tags: string[];
  folderId?: string;
  images?: string[];
  isFavorite: boolean;
  version: number;
  currentVersion: number;
  usageCount: number;
  lastAiResponse?: string;  // 最后一次 AI 测试的响应
  createdAt: string;  // ISO 8601 格式
  updatedAt: string;  // ISO 8601 格式
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
  aiResponse?: string;  // 该版本的 AI 测试响应
  createdAt: string;  // ISO 8601 格式
}

// DTO Types
export interface CreatePromptDTO {
  title: string;
  description?: string;
  systemPrompt?: string;
  userPrompt: string;
  variables?: Variable[];
  tags?: string[];
  folderId?: string;
  images?: string[];
}

export interface UpdatePromptDTO {
  title?: string;
  description?: string;
  systemPrompt?: string;
  userPrompt?: string;
  variables?: Variable[];
  tags?: string[];
  folderId?: string;
  images?: string[];
  isFavorite?: boolean;
  usageCount?: number;
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
