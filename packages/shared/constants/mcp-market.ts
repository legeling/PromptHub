import type { McpMarketSource, McpMarketTemplate } from "../types/mcp";

export const BUILTIN_MCP_MARKET_SOURCES: McpMarketSource[] = [
  {
    id: "modelcontextprotocol",
    label: "Official MCP Registry",
    url: "https://registry.modelcontextprotocol.io",
    description:
      "PromptHub-packaged templates from the official Model Context Protocol server ecosystem.",
    trustLevel: "official",
  },
  {
    id: "prompthub-curated",
    label: "PromptHub Curated MCP",
    url: "https://github.com/modelcontextprotocol/servers",
    description: "PromptHub-curated MCP templates for common agent workflows.",
    trustLevel: "verified",
  },
  {
    id: "prompthub-community",
    label: "PromptHub Community MCP",
    url: "https://github.com/punkpeye/awesome-mcp-servers",
    description:
      "PromptHub-packaged community MCP templates that can be installed directly.",
    trustLevel: "community",
  },
];

const SOURCE_BY_ID = Object.fromEntries(
  BUILTIN_MCP_MARKET_SOURCES.map((source) => [source.id, source]),
) as Record<string, McpMarketSource>;

function enrichTemplate(
  template: McpMarketTemplate,
  sourceId: keyof typeof SOURCE_BY_ID = "modelcontextprotocol",
): McpMarketTemplate {
  const source = SOURCE_BY_ID[sourceId] ?? SOURCE_BY_ID.modelcontextprotocol;
  const packageName =
    template.packageName ??
    template.args?.find(
      (arg) =>
        !arg.startsWith("-") &&
        !arg.startsWith("<") &&
        (arg.startsWith("@") || /^[a-z0-9][a-z0-9._-]+/i.test(arg)),
    );
  return {
    ...template,
    runtime:
      template.runtime ??
      (template.transport === "stdio" ? template.command : template.transport),
    packageName,
    repository: template.repository ?? template.homepage,
    documentationUrl: template.documentationUrl ?? template.homepage,
    source: {
      id: source.id,
      label: source.label,
      url: source.url,
      trustLevel: source.trustLevel,
    },
  };
}

const RAW_BUILTIN_MCP_MARKET_TEMPLATES: McpMarketTemplate[] = [
  enrichTemplate(
    {
      id: "context7",
      name: "context7",
      displayName: "Context7",
      description:
        "Fetch up-to-date library documentation inside agent sessions.",
      transport: "stdio",
      command: "npx",
      args: ["-y", "@upstash/context7-mcp"],
      tags: ["docs", "developer"],
      homepage: "https://github.com/upstash/context7",
    },
    "prompthub-curated",
  ),
  enrichTemplate(
    {
      id: "playwright",
      name: "playwright",
      displayName: "Playwright",
      description: "Browser automation for inspecting and testing web apps.",
      transport: "stdio",
      command: "npx",
      args: ["@playwright/mcp@latest", "--headless"],
      tags: ["browser", "test"],
      homepage: "https://github.com/microsoft/playwright-mcp",
    },
    "prompthub-curated",
  ),
  {
    id: "github",
    name: "github",
    displayName: "GitHub",
    description:
      "Access GitHub repositories, issues, pull requests, and code search.",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-github"],
    env: {
      GITHUB_PERSONAL_ACCESS_TOKEN: "",
    },
    tags: ["code", "github"],
    homepage: "https://github.com/modelcontextprotocol/servers",
  },
  {
    id: "filesystem",
    name: "filesystem",
    displayName: "Filesystem",
    description: "Read and write files from selected local directories.",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", "<allowed-path>"],
    tags: ["files", "local"],
    homepage: "https://github.com/modelcontextprotocol/servers",
  },
  {
    id: "fetch",
    name: "fetch",
    displayName: "Fetch",
    description: "Fetch and convert web content for agent workflows.",
    transport: "stdio",
    command: "uvx",
    args: ["mcp-server-fetch"],
    tags: ["web", "research"],
    homepage: "https://github.com/modelcontextprotocol/servers",
  },
  {
    id: "slack",
    name: "slack",
    displayName: "Slack",
    description: "Connect agents to Slack workspace channels and messages.",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-slack"],
    env: {
      SLACK_BOT_TOKEN: "",
      SLACK_TEAM_ID: "",
    },
    tags: ["communication", "team"],
    homepage: "https://github.com/modelcontextprotocol/servers",
  },
  {
    id: "amap",
    name: "amap",
    displayName: "AMap",
    description: "Map, location, and route tools for AMap/Gaode services.",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@amap/amap-maps-mcp-server"],
    env: {
      AMAP_MAPS_API_KEY: "",
    },
    tags: ["maps", "china"],
    homepage: "https://github.com/amap/amap-maps-mcp-server",
  },
  {
    id: "memory",
    name: "memory",
    displayName: "Knowledge Graph Memory",
    description:
      "Persistent knowledge-graph memory so agents can remember entities and relations across sessions.",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-memory"],
    tags: ["memory", "knowledge"],
    homepage:
      "https://github.com/modelcontextprotocol/servers/blob/main/src/memory",
  },
  {
    id: "sequential-thinking",
    name: "sequential-thinking",
    displayName: "Sequential Thinking",
    description:
      "Structured step-by-step reasoning tool for breaking down complex problems.",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-sequential-thinking"],
    tags: ["reasoning", "planning"],
    homepage:
      "https://github.com/modelcontextprotocol/servers/blob/main/src/sequentialthinking",
  },
  {
    id: "brave-search",
    name: "brave-search",
    displayName: "Brave Search",
    description: "Web and local search via the Brave Search API.",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-brave-search"],
    env: {
      BRAVE_API_KEY: "",
    },
    tags: ["search", "web"],
    homepage:
      "https://github.com/modelcontextprotocol/servers/blob/main/src/brave-search",
  },
  {
    id: "google-maps",
    name: "google-maps",
    displayName: "Google Maps",
    description: "Geocoding, place search, and directions via Google Maps.",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-google-maps"],
    env: {
      GOOGLE_MAPS_API_KEY: "",
    },
    tags: ["maps", "location"],
    homepage:
      "https://github.com/modelcontextprotocol/servers/blob/main/src/google-maps",
  },
  {
    id: "git",
    name: "git",
    displayName: "Git",
    description: "Read, search, and inspect local Git repositories.",
    transport: "stdio",
    command: "uvx",
    args: ["mcp-server-git", "--repository", "<repo-path>"],
    tags: ["git", "developer"],
    homepage:
      "https://github.com/modelcontextprotocol/servers/blob/main/src/git",
  },
  {
    id: "time",
    name: "time",
    displayName: "Time",
    description: "Time and timezone conversion utilities for agents.",
    transport: "stdio",
    command: "uvx",
    args: ["mcp-server-time"],
    tags: ["time", "utility"],
    homepage:
      "https://github.com/modelcontextprotocol/servers/tree/main/src/time",
  },
  {
    id: "everything",
    name: "everything",
    displayName: "Everything",
    description:
      "Reference test server exercising every MCP feature: tools, prompts, and resources.",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-everything"],
    tags: ["test", "reference"],
    homepage:
      "https://github.com/modelcontextprotocol/servers/tree/main/src/everything",
  },
  {
    id: "sentry",
    name: "sentry",
    displayName: "Sentry",
    description: "Inspect Sentry issues and error reports from agent sessions.",
    transport: "stdio",
    command: "uvx",
    args: ["mcp-server-sentry", "--auth-token", "<sentry-token>"],
    tags: ["monitoring", "errors"],
    homepage:
      "https://github.com/modelcontextprotocol/servers/blob/main/src/sentry",
  },
  {
    id: "firecrawl",
    name: "firecrawl",
    displayName: "Firecrawl",
    description:
      "Advanced web scraping with JavaScript rendering and smart rate limiting.",
    transport: "stdio",
    command: "npx",
    args: ["-y", "firecrawl-mcp"],
    env: {
      FIRECRAWL_API_KEY: "",
    },
    tags: ["scraping", "web"],
    homepage: "https://github.com/mendableai/firecrawl-mcp-server",
  },
  enrichTemplate(
    {
      id: "kubernetes",
      name: "kubernetes",
      displayName: "Kubernetes",
      description:
        "Manage Kubernetes clusters, pods, deployments, and services.",
      transport: "stdio",
      command: "npx",
      args: ["-y", "mcp-server-kubernetes"],
      tags: ["devops", "kubernetes"],
      homepage: "https://github.com/Flux159/mcp-server-kubernetes",
    },
    "prompthub-community",
  ),
  enrichTemplate(
    {
      id: "mysql",
      name: "mysql",
      displayName: "MySQL",
      description: "Query MySQL databases with secure, configurable access.",
      transport: "stdio",
      command: "uvx",
      args: ["mysql_mcp_server"],
      env: {
        MYSQL_HOST: "",
        MYSQL_PORT: "3306",
        MYSQL_USER: "",
        MYSQL_PASSWORD: "",
        MYSQL_DATABASE: "",
      },
      tags: ["database", "sql"],
      homepage: "https://github.com/designcomputer/mysql_mcp_server",
    },
    "prompthub-community",
  ),
  enrichTemplate(
    {
      id: "figma",
      name: "figma",
      displayName: "Figma",
      description: "Read Figma file layout and design data for design-to-code.",
      transport: "stdio",
      command: "npx",
      args: [
        "-y",
        "figma-developer-mcp",
        "--figma-api-key=<figma-api-key>",
        "--stdio",
      ],
      tags: ["design", "frontend"],
      homepage: "https://github.com/GLips/Figma-Context-MCP",
    },
    "prompthub-community",
  ),
  enrichTemplate(
    {
      id: "deepwiki",
      name: "deepwiki",
      displayName: "DeepWiki",
      description:
        "Ask questions about public GitHub repositories via the hosted DeepWiki service.",
      transport: "streamable-http",
      url: "https://mcp.deepwiki.com/mcp",
      tags: ["docs", "github"],
      homepage: "https://deepwiki.com",
    },
    "prompthub-curated",
  ),
];

export const BUILTIN_MCP_MARKET_TEMPLATES: McpMarketTemplate[] =
  RAW_BUILTIN_MCP_MARKET_TEMPLATES.map((template) =>
    template.source ? template : enrichTemplate(template),
  );
