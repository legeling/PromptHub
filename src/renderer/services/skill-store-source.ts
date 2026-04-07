import type { SkillStoreSource } from "../../shared/types";

export type CustomStoreSourceType = Extract<
  SkillStoreSource["type"],
  "marketplace-json" | "git-repo" | "local-dir"
>;

function normalizeWindowsPath(path: string) {
  if (/^\/[A-Za-z]:[\\/]/.test(path)) {
    return path.slice(1);
  }
  return path;
}

export function normalizeLocalSourcePath(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("INVALID_STORE_SOURCE_URL");
  }

  if (/^file:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      return normalizeWindowsPath(decodeURIComponent(parsed.pathname));
    } catch {
      throw new Error("INVALID_STORE_SOURCE_URL");
    }
  }

  return trimmed;
}

export function isLikelyLocalSource(input: string): boolean {
  const value = input.trim();
  return (
    /^file:\/\//i.test(value) ||
    value.startsWith("/") ||
    value.startsWith("~/") ||
    value.startsWith("./") ||
    value.startsWith("../") ||
    value.startsWith(".\\") ||
    value.startsWith("..\\") ||
    /^[A-Za-z]:[\\/]/.test(value) ||
    value.startsWith("\\\\")
  );
}

export function isSupportedGitRepoSource(input: string): boolean {
  const value = input.trim();
  if (!value) return false;
  if (isLikelyLocalSource(value)) return true;

  const normalized = value
    .replace(/^git@github\.com:/i, "https://github.com/")
    .replace(/\.git$/i, "");
  return /^https?:\/\/github\.com\/[^/]+\/[^/]+/i.test(normalized);
}

export function validateStoreSourceInput(
  input: string,
  type: CustomStoreSourceType,
): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("INVALID_STORE_SOURCE_URL");
  }

  if (type === "local-dir") {
    return normalizeLocalSourcePath(trimmed);
  }

  if (type === "git-repo") {
    if (!isSupportedGitRepoSource(trimmed)) {
      throw new Error("INVALID_GIT_REPO_SOURCE");
    }
    if (isLikelyLocalSource(trimmed)) {
      return normalizeLocalSourcePath(trimmed);
    }

    return trimmed
      .replace(/^git@github\.com:/i, "https://github.com/")
      .replace(/\.git$/i, "");
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(trimmed);
  } catch {
    throw new Error("INVALID_STORE_SOURCE_URL");
  }

  if (parsedUrl.protocol !== "https:") {
    throw new Error("STORE_SOURCE_HTTPS_REQUIRED");
  }

  return parsedUrl.toString();
}
