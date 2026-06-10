import path from "path";

const LOCAL_MEDIA_EXTENSIONS: Record<"local-image" | "local-video", ReadonlySet<string>> = {
  "local-image": new Set([".jpg", ".jpeg", ".png", ".gif", ".webp"]),
  "local-video": new Set([".mp4", ".webm", ".mov", ".avi", ".mkv"]),
};

const UNSAFE_SEGMENT_PATTERN = /[\x00-\x1F\x7F:]/;

function isSafeLocalMediaSegment(segment: string): boolean {
  return segment !== "." && segment !== ".." && !UNSAFE_SEGMENT_PATTERN.test(segment);
}

export function resolveLocalMediaProtocolPath(
  requestUrl: string,
  scheme: "local-image" | "local-video",
  baseDir: string,
): string | null {
  const prefix = `${scheme}://`;
  if (!requestUrl.startsWith(prefix)) {
    return null;
  }

  try {
    const rawPath = decodeURIComponent(requestUrl.slice(prefix.length));
    if (rawPath.startsWith("/") || rawPath.startsWith("\\")) {
      return null;
    }

    const segments = rawPath.split(/[\\/]+/).filter(Boolean);
    if (
      segments.length === 0 ||
      segments.some((segment) => !isSafeLocalMediaSegment(segment))
    ) {
      return null;
    }

    const extension = path.extname(segments.at(-1) ?? "").toLowerCase();
    if (!LOCAL_MEDIA_EXTENSIONS[scheme].has(extension)) {
      return null;
    }

    const resolvedBase = path.resolve(baseDir);
    const mediaPath = path.resolve(resolvedBase, ...segments);
    const relative = path.relative(resolvedBase, mediaPath);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      return null;
    }

    return mediaPath;
  } catch {
    return null;
  }
}
