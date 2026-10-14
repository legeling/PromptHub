import type { CSSProperties, HTMLAttributes } from "react";
import type { TFunction } from "i18next";
import { AUTO_GALLERY_GRID_STYLE } from "../ui/gallery-layout";
import type { McpTargetPreset } from "@prompthub/core";
import type {
  McpServerConfig,
  McpCreateFromTargetRequest,
  McpTargetStatusEntry,
} from "@prompthub/shared/types/mcp";

export const ALL_MCP_SOURCE_FILTER = "all";
export const MCP_GALLERY_COLUMNS = ["auto", "2", "3", "4", "5", "6"] as const;
export const MCP_LIST_PAGE_SIZE_OPTIONS = [12, 24, 48] as const;
export const DEFAULT_MCP_LIST_PAGE_SIZE = 12;

const MCP_VIEW_TRANSITION_CLASS =
  "h-full min-h-0 animate-in fade-in slide-in-from-right-3 duration-smooth";
const MCP_GALLERY_MANUAL_MIN_WIDTH_PX = 240;

export type McpLibraryFilter = "all" | "favorites" | "distributed" | "pending";
export type McpGalleryColumnMode = (typeof MCP_GALLERY_COLUMNS)[number];

export interface PendingAgentRemoval {
  preset: McpTargetPreset;
  serverName: string;
}

interface McpViewTransitionProps extends HTMLAttributes<HTMLDivElement> {
  viewKey: string;
}

export function McpViewTransition({
  viewKey,
  className = "",
  children,
  ...props
}: McpViewTransitionProps) {
  return (
    <div
      key={viewKey}
      data-testid="mcp-view-transition"
      data-mcp-view={viewKey}
      className={`${MCP_VIEW_TRANSITION_CLASS} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function getMcpGalleryGridStyle(
  columns: McpGalleryColumnMode,
): CSSProperties {
  if (columns === "auto") {
    return AUTO_GALLERY_GRID_STYLE;
  }
  const columnCount = Number(columns);
  const totalGapRem = columnCount - 1;
  return {
    gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, max(${MCP_GALLERY_MANUAL_MIN_WIDTH_PX}px, calc((100% - ${totalGapRem}rem) / ${columnCount}))), 1fr))`,
  };
}

export function hasFileItems(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer) return false;
  if (
    Array.from(dataTransfer.items ?? []).some((item) => item.kind === "file")
  ) {
    return true;
  }
  return (
    Array.from(dataTransfer.types ?? []).includes("Files") ||
    (dataTransfer.files?.length ?? 0) > 0
  );
}

export function getMcpSourceLabel(
  server: McpServerConfig,
  t: TFunction,
): string {
  if (server.source.type === "market") {
    return server.source.label || t("mcp.sourceMarket", "MCP Store");
  }
  if (server.source.type === "import") {
    return server.source.label || t("mcp.sourceImport", "Imported");
  }
  return server.source.label || t("mcp.sourceManual", "Manual");
}

export function getMcpSourceKey(server: McpServerConfig, t: TFunction): string {
  return `${server.source.type}:${server.source.id || getMcpSourceLabel(server, t)}`;
}

export function matchesMcpSearch(
  server: McpServerConfig,
  query: string,
): boolean {
  if (!query) return true;
  return [
    server.name,
    server.displayName,
    server.description ?? "",
    server.transport,
    server.command ?? "",
    server.cwd ?? "",
    server.url ?? "",
    server.source.label ?? "",
    server.source.id ?? "",
    server.source.url ?? "",
    ...(server.args ?? []),
    ...(server.tags ?? []),
    ...Object.keys(server.env ?? {}),
    ...Object.values(server.env ?? {}),
    ...Object.keys(server.headers ?? {}),
    ...Object.values(server.headers ?? {}),
  ]
    .join(" ")
    .toLowerCase()
    .includes(query);
}

export function findAgentMcpServer(
  targetStatus: McpTargetStatusEntry[],
  presetId: string,
  serverName: string,
): McpServerConfig | null {
  return (
    targetStatus
      .find((entry) => entry.presetId === presetId)
      ?.servers?.find((server) => server.name === serverName) ?? null
  );
}

export function buildAgentMcpImportRequest(
  server: McpServerConfig,
  preset: McpTargetPreset,
): McpCreateFromTargetRequest {
  return {
    kind: "target",
    preset,
    serverName: server.name,
  };
}
