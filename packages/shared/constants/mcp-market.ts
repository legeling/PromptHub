import type { McpMarketSource, McpMarketTemplate } from "../types/mcp";

export const BUILTIN_MCP_MARKET_SOURCES: McpMarketSource[] = [
  {
    id: "modelcontextprotocol",
    label: "Official MCP Registry",
    url: "https://registry.modelcontextprotocol.io",
    description:
      "Official Model Context Protocol registry channel with PromptHub-packaged templates that can be installed into your local MCP library.",
    trustLevel: "official",
  },
  {
    id: "smithery",
    label: "Smithery",
    url: "https://smithery.ai",
    description:
      "Installable MCP templates adapted from Smithery's MCP discovery and installation ecosystem.",
    trustLevel: "verified",
  },
  {
    id: "glama",
    label: "Glama MCP Directory",
    url: "https://glama.ai/mcp/servers",
    description:
      "Community MCP directory channel with PromptHub-packaged templates, descriptions, and install metadata.",
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
      documentationUrl: "https://github.com/upstash/context7",
      repository: "https://github.com/upstash/context7",
    },
    "modelcontextprotocol",
  ),
  enrichTemplate(
    {
      id: "glama-playwright",
      name: "playwright",
      displayName: "Playwright",
      description: "Browser automation for inspecting and testing web apps.",
      transport: "stdio",
      command: "npx",
      args: ["@playwright/mcp@latest", "--headless"],
      tags: ["browser", "test"],
      homepage: "https://github.com/microsoft/playwright-mcp",
      documentationUrl: "https://github.com/microsoft/playwright-mcp",
      repository: "https://github.com/microsoft/playwright-mcp",
    },
    "glama",
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
    documentationUrl:
      "https://github.com/modelcontextprotocol/servers/tree/main/src/github",
    repository: "https://github.com/modelcontextprotocol/servers",
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
    documentationUrl:
      "https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem",
    repository: "https://github.com/modelcontextprotocol/servers",
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
    documentationUrl:
      "https://github.com/modelcontextprotocol/servers/tree/main/src/fetch",
    repository: "https://github.com/modelcontextprotocol/servers",
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
    documentationUrl:
      "https://github.com/modelcontextprotocol/servers/tree/main/src/slack",
    repository: "https://github.com/modelcontextprotocol/servers",
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
    documentationUrl: "https://github.com/amap/amap-maps-mcp-server",
    repository: "https://github.com/amap/amap-maps-mcp-server",
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
    repository: "https://github.com/modelcontextprotocol/servers",
  },
  enrichTemplate(
    {
      id: "smithery-sequential-thinking",
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
      repository: "https://github.com/modelcontextprotocol/servers",
    },
    "smithery",
  ),
  enrichTemplate(
    {
      id: "smithery-context7",
      name: "context7-smithery",
      displayName: "Context7",
      description:
        "Bring fresh framework and library documentation into agent conversations.",
      transport: "stdio",
      command: "npx",
      args: ["-y", "@upstash/context7-mcp"],
      tags: ["docs", "developer"],
      homepage: "https://github.com/upstash/context7",
      documentationUrl: "https://github.com/upstash/context7",
      repository: "https://github.com/upstash/context7",
    },
    "smithery",
  ),
  enrichTemplate(
    {
      id: "smithery-playwright",
      name: "playwright-smithery",
      displayName: "Playwright",
      description:
        "Inspect pages, automate browser actions, and test web flows from an agent.",
      transport: "stdio",
      command: "npx",
      args: ["@playwright/mcp@latest", "--headless"],
      tags: ["browser", "test"],
      homepage: "https://github.com/microsoft/playwright-mcp",
      documentationUrl: "https://github.com/microsoft/playwright-mcp",
      repository: "https://github.com/microsoft/playwright-mcp",
    },
    "smithery",
  ),
  enrichTemplate(
    {
      id: "smithery-firecrawl",
      name: "firecrawl-smithery",
      displayName: "Firecrawl",
      description:
        "Scrape, crawl, and extract web pages with Firecrawl's hosted API.",
      transport: "stdio",
      command: "npx",
      args: ["-y", "firecrawl-mcp"],
      env: {
        FIRECRAWL_API_KEY: "",
      },
      tags: ["scraping", "web"],
      homepage: "https://github.com/mendableai/firecrawl-mcp-server",
      documentationUrl: "https://github.com/mendableai/firecrawl-mcp-server",
      repository: "https://github.com/mendableai/firecrawl-mcp-server",
    },
    "smithery",
  ),
  enrichTemplate(
    {
      id: "smithery-filesystem",
      name: "filesystem-smithery",
      displayName: "Filesystem",
      description:
        "Read and write files from explicitly selected local directories.",
      transport: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem", "<allowed-path>"],
      tags: ["files", "local"],
      homepage:
        "https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem",
      repository: "https://github.com/modelcontextprotocol/servers",
    },
    "smithery",
  ),
  enrichTemplate(
    {
      id: "smithery-github",
      name: "github-smithery",
      displayName: "GitHub",
      description:
        "Search and manage repositories, issues, pull requests, and code.",
      transport: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-github"],
      env: {
        GITHUB_PERSONAL_ACCESS_TOKEN: "",
      },
      tags: ["code", "github"],
      homepage:
        "https://github.com/modelcontextprotocol/servers/tree/main/src/github",
      repository: "https://github.com/modelcontextprotocol/servers",
    },
    "smithery",
  ),
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
    repository: "https://github.com/modelcontextprotocol/servers",
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
    repository: "https://github.com/modelcontextprotocol/servers",
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
    repository: "https://github.com/modelcontextprotocol/servers",
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
    repository: "https://github.com/modelcontextprotocol/servers",
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
    repository: "https://github.com/modelcontextprotocol/servers",
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
    repository: "https://github.com/modelcontextprotocol/servers",
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
    repository: "https://github.com/modelcontextprotocol/servers",
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
    documentationUrl: "https://github.com/mendableai/firecrawl-mcp-server",
    repository: "https://github.com/mendableai/firecrawl-mcp-server",
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
      documentationUrl: "https://github.com/Flux159/mcp-server-kubernetes",
      repository: "https://github.com/Flux159/mcp-server-kubernetes",
    },
    "glama",
  ),
  enrichTemplate(
    {
      id: "smithery-mysql",
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
      documentationUrl: "https://github.com/designcomputer/mysql_mcp_server",
      repository: "https://github.com/designcomputer/mysql_mcp_server",
    },
    "smithery",
  ),
  enrichTemplate(
    {
      id: "smithery-postgres",
      name: "postgres",
      displayName: "PostgreSQL",
      description:
        "Query PostgreSQL databases through a configurable read/write MCP server.",
      transport: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-postgres", "<database-url>"],
      tags: ["database", "sql"],
      homepage:
        "https://github.com/modelcontextprotocol/servers/tree/main/src/postgres",
      repository: "https://github.com/modelcontextprotocol/servers",
    },
    "smithery",
  ),
  enrichTemplate(
    {
      id: "smithery-puppeteer",
      name: "puppeteer",
      displayName: "Puppeteer",
      description:
        "Control Chromium with Puppeteer for page capture, screenshots, and automation.",
      transport: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-puppeteer"],
      tags: ["browser", "automation"],
      homepage:
        "https://github.com/modelcontextprotocol/servers/tree/main/src/puppeteer",
      repository: "https://github.com/modelcontextprotocol/servers",
    },
    "smithery",
  ),
  enrichTemplate(
    {
      id: "glama-context7",
      name: "context7-glama",
      displayName: "Context7",
      description:
        "Search current package documentation for coding assistants.",
      transport: "stdio",
      command: "npx",
      args: ["-y", "@upstash/context7-mcp"],
      tags: ["docs", "developer"],
      homepage: "https://github.com/upstash/context7",
      documentationUrl: "https://github.com/upstash/context7",
      repository: "https://github.com/upstash/context7",
    },
    "glama",
  ),
  enrichTemplate(
    {
      id: "glama-deepwiki",
      name: "deepwiki-glama",
      displayName: "DeepWiki",
      description:
        "Ask questions about public GitHub repositories through a hosted MCP endpoint.",
      transport: "streamable-http",
      url: "https://mcp.deepwiki.com/mcp",
      tags: ["docs", "github"],
      homepage: "https://deepwiki.com",
      documentationUrl: "https://deepwiki.com",
    },
    "glama",
  ),
  enrichTemplate(
    {
      id: "glama-firecrawl",
      name: "firecrawl-glama",
      displayName: "Firecrawl",
      description:
        "Crawl and extract structured web content for research and automation agents.",
      transport: "stdio",
      command: "npx",
      args: ["-y", "firecrawl-mcp"],
      env: {
        FIRECRAWL_API_KEY: "",
      },
      tags: ["scraping", "web"],
      homepage: "https://github.com/mendableai/firecrawl-mcp-server",
      documentationUrl: "https://github.com/mendableai/firecrawl-mcp-server",
      repository: "https://github.com/mendableai/firecrawl-mcp-server",
    },
    "glama",
  ),
  enrichTemplate(
    {
      id: "glama-browserbase",
      name: "browserbase",
      displayName: "Browserbase",
      description:
        "Run cloud browser sessions for web navigation, screenshots, and automation.",
      transport: "stdio",
      command: "npx",
      args: ["-y", "@browserbasehq/mcp-server-browserbase"],
      env: {
        BROWSERBASE_API_KEY: "",
        BROWSERBASE_PROJECT_ID: "",
      },
      tags: ["browser", "cloud"],
      homepage: "https://github.com/browserbase/mcp-server-browserbase",
      documentationUrl: "https://github.com/browserbase/mcp-server-browserbase",
      repository: "https://github.com/browserbase/mcp-server-browserbase",
    },
    "glama",
  ),
  enrichTemplate(
    {
      id: "glama-git",
      name: "git-glama",
      displayName: "Git",
      description:
        "Inspect local Git repositories, history, diffs, and working tree state.",
      transport: "stdio",
      command: "uvx",
      args: ["mcp-server-git", "--repository", "<repo-path>"],
      tags: ["git", "developer"],
      homepage:
        "https://github.com/modelcontextprotocol/servers/tree/main/src/git",
      repository: "https://github.com/modelcontextprotocol/servers",
    },
    "glama",
  ),
  enrichTemplate(
    {
      id: "glama-figma",
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
      documentationUrl: "https://github.com/GLips/Figma-Context-MCP",
      repository: "https://github.com/GLips/Figma-Context-MCP",
    },
    "glama",
  ),
  enrichTemplate(
    {
      id: "glama-amap",
      name: "amap-glama",
      displayName: "AMap",
      description:
        "Use AMap/Gaode maps, location lookup, and routing tools from agents.",
      transport: "stdio",
      command: "npx",
      args: ["-y", "@amap/amap-maps-mcp-server"],
      env: {
        AMAP_MAPS_API_KEY: "",
      },
      tags: ["maps", "china"],
      homepage: "https://github.com/amap/amap-maps-mcp-server",
      documentationUrl: "https://github.com/amap/amap-maps-mcp-server",
      repository: "https://github.com/amap/amap-maps-mcp-server",
    },
    "glama",
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
      documentationUrl: "https://deepwiki.com",
    },
    "smithery",
  ),
];

export const BUILTIN_MCP_MARKET_TEMPLATES: McpMarketTemplate[] =
  RAW_BUILTIN_MCP_MARKET_TEMPLATES.map((template) =>
    template.source ? template : enrichTemplate(template),
  );
