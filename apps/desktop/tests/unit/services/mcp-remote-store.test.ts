import { describe, expect, it, vi } from "vitest";
import type { McpMarketSource } from "@prompthub/shared/types/mcp";
import {
  buildMcpRemoteStoreUrl,
  loadMcpRemoteStore,
  parseOfficialMcpRegistryCatalog,
  parseSmitheryMcpCatalog,
} from "../../../src/renderer/services/mcp-remote-store";

const registrySource: McpMarketSource = {
  id: "modelcontextprotocol",
  label: "MCP Registry",
  url: "https://registry.modelcontextprotocol.io",
  trustLevel: "official",
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
      registrySource,
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
      buildMcpRemoteStoreUrl(registrySource, { query: "github", cursor: "c1" }),
    ).toBe(
      "https://registry.modelcontextprotocol.io/v0/servers?cursor=c1&search=github",
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
      source: registrySource,
      query: "adeu",
      fetchRemoteContent,
    });

    expect(fetchRemoteContent).toHaveBeenCalledWith(
      "https://registry.modelcontextprotocol.io/v0/servers?search=adeu",
    );
    expect(result.templates).toEqual([
      expect.objectContaining({
        displayName: "ai.adeu/adeu",
        command: "uvx",
        args: ["adeu"],
      }),
    ]);
  });

  it("loads an official registry continuation page with the provided cursor", async () => {
    const fetchRemoteContent = vi.fn().mockResolvedValue(
      JSON.stringify({
        servers: [
          {
            server: {
              name: "com.upstash/context7",
              title: "Context7",
              description: "Fresh documentation for coding agents.",
              packages: [
                {
                  registryType: "npm",
                  identifier: "@upstash/context7-mcp",
                  transport: { type: "stdio" },
                },
              ],
            },
          },
        ],
        metadata: { nextCursor: "com.upstash/context7:2.0.0", count: 30 },
      }),
    );

    const result = await loadMcpRemoteStore({
      source: registrySource,
      cursor: "com.github/example:1.0.0",
      fetchRemoteContent,
    });

    expect(fetchRemoteContent).toHaveBeenCalledWith(
      "https://registry.modelcontextprotocol.io/v0/servers?cursor=com.github%2Fexample%3A1.0.0",
    );
    expect(result.nextCursor).toBe("com.upstash/context7:2.0.0");
    expect(result.totalCount).toBe(30);
    expect(result.totalCountIsLowerBound).toBe(true);
    expect(result.templates).toEqual([
      expect.objectContaining({
        displayName: "Context7",
        command: "npx",
        args: ["-y", "@upstash/context7-mcp"],
      }),
    ]);
  });

  it("uses the official registry search endpoint for queries", async () => {
    const fetchRemoteContent = vi.fn().mockResolvedValueOnce(
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
        metadata: { nextCursor: "com.github/mcp:1.0.0", count: 30 },
      }),
    );

    const result = await loadMcpRemoteStore({
      source: registrySource,
      query: "github",
      fetchRemoteContent,
    });

    expect(fetchRemoteContent).toHaveBeenNthCalledWith(
      1,
      "https://registry.modelcontextprotocol.io/v0/servers?search=github",
    );
    expect(fetchRemoteContent).toHaveBeenCalledTimes(1);
    expect(result.nextCursor).toBe("com.github/mcp:1.0.0");
    expect(result.totalCount).toBe(30);
    expect(result.totalCountIsLowerBound).toBe(true);
    expect(result.templates).toEqual([
      expect.objectContaining({
        displayName: "GitHub MCP",
        packageName: "@github/github-mcp-server",
      }),
    ]);
  });

  it("does not locally filter official registry search responses after using the remote search endpoint", async () => {
    const fetchRemoteContent = vi.fn().mockResolvedValueOnce(
      JSON.stringify({
        servers: [
          {
            server: {
              name: "com.example/octokit-bridge",
              title: "Octokit Bridge",
              description: "Repository automation tools.",
              packages: [
                {
                  registryType: "npm",
                  identifier: "@example/octokit-bridge",
                  transport: { type: "stdio" },
                },
              ],
            },
          },
        ],
        metadata: { count: 1 },
      }),
    );

    const result = await loadMcpRemoteStore({
      source: registrySource,
      query: "github",
      fetchRemoteContent,
    });

    expect(fetchRemoteContent).toHaveBeenCalledWith(
      "https://registry.modelcontextprotocol.io/v0/servers?search=github",
    );
    expect(result.templates).toEqual([
      expect.objectContaining({
        displayName: "Octokit Bridge",
        packageName: "@example/octokit-bridge",
      }),
    ]);
  });
});
