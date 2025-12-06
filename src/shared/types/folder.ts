/**
 * 文件夹类型定义
 */

export interface Folder {
  id: string;
  name: string;
  icon?: string; // emoji
  parentId?: string;
  order: number;
  isPrivate?: boolean;
  password?: string;
  createdAt: string;  // ISO 8601 格式
  updatedAt: string;  // ISO 8601 格式
}

export interface CreateFolderDTO {
  name: string;
  icon?: string;
  parentId?: string;
  isPrivate?: boolean;
  password?: string;
}

export interface UpdateFolderDTO {
  name?: string;
  icon?: string;
  parentId?: string;
  order?: number;
  isPrivate?: boolean;
  password?: string;
}
