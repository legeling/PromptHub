export const MIN_RESOURCE_ZOOM = 0.25;
export const MAX_RESOURCE_ZOOM = 4;
export const RESOURCE_ZOOM_STEP = 0.25;

export interface FileEntry {
  path: string;
  content: string;
  isDirectory: boolean;
  mimeType?: string;
  encoding?: "text" | "data-url" | "placeholder";
  previewKind?: "image" | "audio" | "video" | "pdf";
}

export interface FileTreeEntry {
  path: string;
  isDirectory: boolean;
  size?: number;
}

export interface TreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children: TreeNode[];
  depth: number;
}

export interface ContextMenuState {
  x: number;
  y: number;
  path: string | null;
  isDirectory: boolean;
}

export function clampResourceZoom(value: number): number {
  return Math.min(
    MAX_RESOURCE_ZOOM,
    Math.max(MIN_RESOURCE_ZOOM, Number(value.toFixed(2))),
  );
}

export function isMarkdownFile(path: string): boolean {
  const ext = path.split(".").pop()?.toLowerCase() || "";
  return ["md", "mdx"].includes(ext);
}

export function normalizeSkillRelativePath(path: string): string {
  return path
    .replace(/\\/g, "/")
    .replace(/^\.\/+/, "")
    .replace(/\/+/g, "/");
}

export function isHiddenSkillRepoEntry(path: string): boolean {
  return normalizeSkillRelativePath(path)
    .split("/")
    .some((segment) => segment === ".git" || segment === ".prompthub");
}

export function normalizeFileTreeEntry(entry: FileTreeEntry): FileTreeEntry {
  return {
    ...entry,
    path: normalizeSkillRelativePath(entry.path),
  };
}

export function buildTree(files: FileTreeEntry[]): TreeNode[] {
  const root: TreeNode[] = [];

  const sorted = files.map(normalizeFileTreeEntry).sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.path.localeCompare(b.path);
  });

  for (const file of sorted) {
    const parts = file.path.split("/");
    let currentLevel = root;

    for (let i = 0; i < parts.length; i++) {
      const partName = parts[i];
      const partPath = parts.slice(0, i + 1).join("/");
      const isLast = i === parts.length - 1;

      let existing = currentLevel.find((node) => node.name === partName);

      if (!existing) {
        existing = {
          name: partName,
          path: partPath,
          isDirectory: isLast ? file.isDirectory : true,
          children: [],
          depth: i,
        };
        currentLevel.push(existing);
      }

      if (!isLast) {
        currentLevel = existing.children;
      }
    }
  }

  return root;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function isEditableFile(file: FileEntry | null): boolean {
  if (!file || file.isDirectory) {
    return false;
  }
  return file.encoding !== "data-url" && file.content !== "[binary file]";
}
