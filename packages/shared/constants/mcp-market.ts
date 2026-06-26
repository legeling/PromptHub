import type { McpMarketSource, McpMarketTemplate } from "../types/mcp";

export const MCP_OFFICIAL_MARKET_SOURCE_ID = "prompthub-official";
export const MCP_REGISTRY_MARKET_SOURCE_ID = "modelcontextprotocol";

export const BUILTIN_MCP_MARKET_SOURCES: McpMarketSource[] = [
  {
    id: MCP_OFFICIAL_MARKET_SOURCE_ID,
    label: "Official Store",
    url: "https://github.com/legeling/PromptHub",
    description:
      "PromptHub-maintained MCP catalog for official, curated server listings.",
    trustLevel: "official",
  },
  {
    id: MCP_REGISTRY_MARKET_SOURCE_ID,
    label: "MCP Registry",
    url: "https://registry.modelcontextprotocol.io",
    description:
      "Official Model Context Protocol registry with installable community server metadata.",
    trustLevel: "official",
  },
];

export const BUILTIN_MCP_MARKET_TEMPLATES: McpMarketTemplate[] = [];
