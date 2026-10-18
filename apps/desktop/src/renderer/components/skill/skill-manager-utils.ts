import { RESOURCE_GALLERY_COLUMNS } from "@prompthub/shared/constants/resource-library";
import type { SkillPlatformInstallStatusMap } from "@prompthub/shared/types";
import { AUTO_GALLERY_GRID_STYLE } from "../ui/gallery-layout";
import type {
  SkillGalleryColumnMode,
  SkillStoreView,
} from "../../stores/skill.store";

const SKILL_GALLERY_MANUAL_MIN_WIDTH_PX = 240;

export const SKILL_GALLERY_COLUMNS: SkillGalleryColumnMode[] = [
  ...RESOURCE_GALLERY_COLUMNS,
];
export const LOCAL_SKILL_SCAN_TIMEOUT_MS = 30_000;
export const ALL_SKILL_SOURCE_FILTER = "all";

export interface DeleteDistributionSummary {
  hasDistribution: boolean;
  hasCopy: boolean;
  hasSymlink: boolean;
}

export const EMPTY_DELETE_DISTRIBUTION_SUMMARY: DeleteDistributionSummary = {
  hasDistribution: false,
  hasCopy: false,
  hasSymlink: false,
};

/**
 * Keep a persisted Desktop-only view from overriding the browser library
 * fallback through an unrelated, stale skill selection.
 */
export function shouldRenderSelectedSkillDetail(
  selectedSkillId: string | null,
  isSelectionMode: boolean,
  storeView: SkillStoreView,
  webSkillLibraryMode: boolean,
): boolean {
  if (!selectedSkillId || isSelectionMode) return false;
  return !webSkillLibraryMode || storeView === "my-skills";
}

export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  createTimeoutError: () => Error,
): Promise<T> {
  let timeoutId: number | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(
      () => reject(createTimeoutError()),
      timeoutMs,
    );
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
  });
}

export function getSkillGalleryGridStyle(
  columns: SkillGalleryColumnMode,
): React.CSSProperties {
  if (columns === "auto") {
    return AUTO_GALLERY_GRID_STYLE;
  }

  const columnCount = Number(columns);
  const totalGapRem = columnCount - 1;
  return {
    gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, max(${SKILL_GALLERY_MANUAL_MIN_WIDTH_PX}px, calc((100% - ${totalGapRem}rem) / ${columnCount}))), 1fr))`,
  };
}

export { resourcePageNumbers as getVisiblePageNumbers } from "@prompthub/shared/utils/resource-library";

export function normalizeDroppedSkillPath(filePath: string): string {
  const normalizedPath = filePath.replace(/\\/g, "/").trim();
  if (!normalizedPath) return "";

  const lowerPath = normalizedPath.toLowerCase();
  if (lowerPath.endsWith("/skill.md")) {
    const slashIndex = normalizedPath.lastIndexOf("/");
    return slashIndex > 0
      ? normalizedPath.slice(0, slashIndex)
      : normalizedPath;
  }
  return lowerPath.endsWith(".md") ? "" : normalizedPath;
}

export function hasFileItems(dataTransfer: DataTransfer): boolean {
  return Array.from(dataTransfer.items).some((item) => item.kind === "file");
}

export function summarizeInstallDetails(
  details: SkillPlatformInstallStatusMap,
): DeleteDistributionSummary {
  const installed = Object.values(details).filter((status) => status.installed);
  return {
    hasDistribution: installed.length > 0,
    hasCopy: installed.some((status) => status.mode === "copy" || !status.mode),
    hasSymlink: installed.some((status) => status.mode === "symlink"),
  };
}

export function normalizePlatformStatusMap(
  value: unknown,
): Record<string, boolean> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, boolean] => typeof entry[1] === "boolean",
    ),
  );
}

export function mergeDeleteDistributionSummaries(
  summaries: DeleteDistributionSummary[],
): DeleteDistributionSummary {
  return summaries.reduce(
    (merged, summary) => ({
      hasDistribution: merged.hasDistribution || summary.hasDistribution,
      hasCopy: merged.hasCopy || summary.hasCopy,
      hasSymlink: merged.hasSymlink || summary.hasSymlink,
    }),
    EMPTY_DELETE_DISTRIBUTION_SUMMARY,
  );
}
