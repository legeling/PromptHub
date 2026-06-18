import type { TFunction } from "i18next";
import type {
  McpMarketSource,
  McpMarketTemplate,
} from "@prompthub/shared/types/mcp";
import { MCP_OFFICIAL_MARKET_SOURCE_ID } from "@prompthub/shared/constants/mcp-market";

export const OFFICIAL_MCP_SOURCE_ID = MCP_OFFICIAL_MARKET_SOURCE_ID;

export function getMcpMarketSourceLabel(
  source: Pick<McpMarketSource, "id" | "label"> | undefined | null,
  t: TFunction,
): string {
  if (source?.id === OFFICIAL_MCP_SOURCE_ID) {
    return t("mcp.officialMcpStore", "Official Store");
  }
  return source?.label ?? t("mcp.mcpStore", "MCP Store");
}

export function getMcpMarketSourceDescription(
  source: Pick<McpMarketSource, "id" | "description"> | undefined | null,
  t: TFunction,
): string {
  if (source?.id === OFFICIAL_MCP_SOURCE_ID) {
    return t(
      "mcp.officialMcpStoreDesc",
      "PromptHub-maintained MCP catalog with curated installable servers. The desktop app currently ships this catalog locally, and it will later sync with the official PromptHub MCP website.",
    );
  }
  return (
    source?.description ??
    t(
      "mcp.mcpStoreSubtitle",
      "Install ready-to-use MCP templates from the selected channel.",
    )
  );
}

export function getMcpTemplateSourceLabel(
  template: Pick<McpMarketTemplate, "source">,
  fallbackSource: McpMarketSource | undefined | null,
  t: TFunction,
): string {
  if (template.source) {
    return getMcpMarketSourceLabel(template.source, t);
  }
  return getMcpMarketSourceLabel(fallbackSource, t);
}
