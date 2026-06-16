import { describe, expect, it, vi } from "vitest";
import type { McpMarketSource } from "@prompthub/shared/types/mcp";
import {
  buildMcpRemoteStoreUrl,
  loadMcpRemoteStore,
  parseGlamaMcpCatalog,
  parseOfficialMcpRegistryCatalog,
  parseSmitheryMcpCatalog,
} from "../../../src/renderer/services/mcp-remote-store";

const officialSource: McpMarketSource = {
  id: "modelcontextprotocol",
  label: "Official MCP Registry",
  url: "https://registry.modelcontextprotocol.io",
  trustLevel: "official",
};

const glamaSource: McpMarketSource = {
  id: "glama",
  label: "Glama MCP Directory",
  url: "https://glama.ai/mcp/servers",
  trustLevel: "community",
};

const smitherySource: McpMarketSource = {
  id: "smithery",
  label: "Smithery",
  url: "https://smithery.ai",
  trustLevel: "verified",
};

describe("mcp remote store", () => {
  it("maps official registry packages and remotes into installable templates", () => {
    const result = parseOfficialMcpRegistryCatalog(
      JSON.stringify({
        servers: [
          {
            server: {
              name: "ai.agenttrust/mcp-server",
              title: "AgentTrust",
              description: "Identity and trust for agents.",
              websiteUrl: "https://agenttrust.ai",
              repository: {
                url: "https://github.com/agenttrust/mcp-server",
              },
              packages: [
                {
                  registryType: "npm",
                  identifier: "@agenttrust/mcp-server",
                  version: "1.1.1",
                  transport: { type: "stdio" },
                  environmentVariables: [
                    {
                      name: "AGENTTRUST_API_KEY",
                      description: "API key from AgentTrust",
                      isRequired: true,
                    },
                  ],
                },
              ],
            },
            _meta: {
              "io.modelcontextprotocol.registry/official": {
                status: "active",
                isLatest: true,
              },
            },
          },
          {
            server: {
              name: "ai.agentdm/agentdm",
              title: "AgentDM",
              description: "Agent messaging.",
              remotes: [
                {
                  type: "streamable-http",
                  url: "https://api.agentdm.ai/mcp/v1/grid",
                  headers: [
                    {
                      name: "Authorization",
                      description: "Bearer token",
                      isRequired: false,
                    },
                  ],
                },
              ],
            },
            _meta: {
              "io.modelcontextprotocol.registry/official": {
                status: "active",
                isLatest: true,
              },
            },
          },
        ],
        metadata: {
          nextCursor: "ai.agentdm/agentdm:2.0.0",
          count: 2,
        },
      }),
      officialSource,
    );

    expect(result.nextCursor).toBe("ai.agentdm/agentdm:2.0.0");
    expect(result.totalCount).toBe(2);
    expect(result.templates).toEqual([
      expect.objectContaining({
        id: "modelcontextprotocol:ai-agenttrust-mcp-server",
        name: "ai-agenttrust-mcp-server",
        displayName: "AgentTrust",
        command: "npx",
        args: ["-y", "@agenttrust/mcp-server"],
        env: { AGENTTRUST_API_KEY: "" },
        requiredEnv: [
          expect.objectContaining({
            name: "AGENTTRUST_API_KEY",
            required: true,
          }),
        ],
        repository: "https://github.com/agenttrust/mcp-server",
      }),
      expect.objectContaining({
        id: "modelcontextprotocol:ai-agentdm-agentdm",
        name: "ai-agentdm-agentdm",
        displayName: "AgentDM",
        transport: "streamable-http",
        url: "https://api.agentdm.ai/mcp/v1/grid",
        headers: { Authorization: "" },
      }),
    ]);
  });

  it("extracts Glama embedded server JSON instead of relying on static presets", () => {
    const result = parseGlamaMcpCatalog(
      `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
        props: {
          pageProps: {
            servers: [
              {
                slug: "github",
                name: "GitHub MCP",
                description: "Manage GitHub issues and pull requests.",
                repository: "https://github.com/github/github-mcp-server",
                homepage: "https://glama.ai/mcp/servers/github",
                packageName: "@github/github-mcp-server",
                installCommand: "npx -y @github/github-mcp-server",
                tags: ["github", "code"],
              },
            ],
            totalCount: 36986,
          },
        },
      })}</script></html>`,
      glamaSource,
    );

    expect(result.totalCount).toBe(36986);
    expect(result.templates).toEqual([
      expect.objectContaining({
        id: "glama:github",
        displayName: "GitHub MCP",
        command: "npx",
        args: ["-y", "@github/github-mcp-server"],
        source: expect.objectContaining({ id: "glama" }),
      }),
    ]);
  });

  it("extracts Smithery catalog JSON and hosted server URLs", () => {
    const result = parseSmitheryMcpCatalog(
      `<script>self.__next_f.push([1,${JSON.stringify(
        JSON.stringify({
          servers: [
            {
              qualifiedName: "@upstash/context7-mcp",
              displayName: "Context7",
              description: "Fresh documentation for agents.",
              homepage: "https://smithery.ai/server/@upstash/context7-mcp",
              remoteUrl: "https://server.smithery.ai/@upstash/context7-mcp/mcp",
              tags: ["docs"],
            },
          ],
        }),
      )}])</script>`,
      smitherySource,
    );

    expect(result.templates).toEqual([
      expect.objectContaining({
        id: "smithery:upstash-context7-mcp",
        name: "upstash-context7-mcp",
        displayName: "Context7",
        transport: "streamable-http",
        url: "https://server.smithery.ai/@upstash/context7-mcp/mcp",
      }),
    ]);
  });

  it("builds remote URLs with search and pagination parameters", () => {
    expect(
      buildMcpRemoteStoreUrl(officialSource, { query: "github", cursor: "c1" }),
    ).toBe("https://registry.modelcontextprotocol.io/v0/servers?cursor=c1");
    expect(buildMcpRemoteStoreUrl(glamaSource, { query: "github" })).toBe(
      "https://glama.ai/mcp/servers?q=github",
    );
    expect(buildMcpRemoteStoreUrl(smitherySource, { query: "github" })).toBe(
      "https://smithery.ai/?q=github",
    );
  });

  it("loads and parses the selected remote source through fetchRemoteContent", async () => {
    const fetchRemoteContent = vi.fn().mockResolvedValue(
      JSON.stringify({
        servers: [
          {
            server: {
              name: "ai.adeu/adeu",
              description: "Automated DOCX redlining.",
              packages: [
                {
                  registryType: "pypi",
                  identifier: "adeu",
                  transport: { type: "stdio" },
                },
              ],
            },
            _meta: {
              "io.modelcontextprotocol.registry/official": {
                status: "active",
                isLatest: true,
              },
            },
          },
        ],
        metadata: { count: 1 },
      }),
    );

    const result = await loadMcpRemoteStore({
      source: officialSource,
      query: "adeu",
      fetchRemoteContent,
    });

    expect(fetchRemoteContent).toHaveBeenCalledWith(
      "https://registry.modelcontextprotocol.io/v0/servers",
    );
    expect(result.templates).toEqual([
      expect.objectContaining({
        displayName: "ai.adeu/adeu",
        command: "uvx",
        args: ["adeu"],
      }),
    ]);
  });

  it("continues official registry search across cursor pages until it finds matches", async () => {
    const fetchRemoteContent = vi
      .fn()
      .mockResolvedValueOnce(
        JSON.stringify({
          servers: [
            {
              server: {
                name: "ai.first/page",
                description: "No matching server.",
                packages: [
                  {
                    registryType: "npm",
                    identifier: "@first/page",
                    transport: { type: "stdio" },
                  },
                ],
              },
            },
          ],
          metadata: { nextCursor: "ai.first/page:1.0.0", count: 2 },
        }),
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          servers: [
            {
              server: {
                name: "com.github/mcp",
                title: "GitHub MCP",
                description: "GitHub issue and pull request tools.",
                packages: [
                  {
                    registryType: "npm",
                    identifier: "@github/github-mcp-server",
                    transport: { type: "stdio" },
                  },
                ],
              },
            },
          ],
          metadata: { count: 2 },
        }),
      );

    const result = await loadMcpRemoteStore({
      source: officialSource,
      query: "github",
      fetchRemoteContent,
    });

    expect(fetchRemoteContent).toHaveBeenNthCalledWith(
      1,
      "https://registry.modelcontextprotocol.io/v0/servers",
    );
    expect(fetchRemoteContent).toHaveBeenNthCalledWith(
      2,
      "https://registry.modelcontextprotocol.io/v0/servers?cursor=ai.first%2Fpage%3A1.0.0",
    );
    expect(result.templates).toEqual([
      expect.objectContaining({
        displayName: "GitHub MCP",
        packageName: "@github/github-mcp-server",
      }),
    ]);
  });
});
