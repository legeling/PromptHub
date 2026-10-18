import { serializeHostedResourceRequest } from "@prompthub/shared/utils/hosted-resource-limits";
import type {
  McpLibraryFile,
  McpServerConfig,
  McpServerDraft,
} from "@prompthub/shared/types/mcp";
import type {
  PluginLibraryFile,
  PluginMetadataUpdate,
} from "@prompthub/shared/types/plugin";
import type {
  ManagedResourceKind,
  ManagedResourceLibraryResponse,
} from "@prompthub/shared/types/managed-resources";
import {
  managedMcpDraftSchema,
  type ManagedResourceMutation,
} from "@prompthub/shared/utils/managed-resource-schema";
import {
  createHostedPluginBridge,
  type HostedPluginBridge,
} from "./plugin-library";

type Request = <T>(path: string, init?: RequestInit) => Promise<T>;

export function createResourceLibraryBridge(request: Request): {
  mcp: {
    getLibrary(): Promise<McpLibraryFile>;
    createServer(draft: McpServerDraft): Promise<McpServerConfig>;
    updateServer(id: string, draft: McpServerDraft): Promise<McpServerConfig>;
    deleteServer(id: string): Promise<McpLibraryFile>;
  };
  plugin: HostedPluginBridge & {
    getLibrary(): Promise<PluginLibraryFile>;
    updatePluginMetadata(
      id: string,
      value: PluginMetadataUpdate,
    ): Promise<PluginLibraryFile>;
    deletePlugin(id: string): Promise<PluginLibraryFile>;
  };
} {
  const revisions = new Map<ManagedResourceKind, string>();
  async function read<T>(kind: ManagedResourceKind): Promise<T> {
    const value = await request<ManagedResourceLibraryResponse<T>>(
      `/api/resource-libraries/${kind}`,
    );
    revisions.set(kind, value.revision);
    return value.library;
  }
  async function mutate<T>(
    kind: ManagedResourceKind,
    mutation: ManagedResourceMutation,
  ): Promise<T> {
    const revision = revisions.get(kind);
    if (!revision) throw new Error("Load the resource library before saving");
    const value = await request<ManagedResourceLibraryResponse<T>>(
      `/api/resource-libraries/${kind}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: serializeHostedResourceRequest({ revision, mutation }),
      },
    );
    revisions.set(kind, value.revision);
    return value.library;
  }
  async function saveMcp(
    id: string | undefined,
    draft: McpServerDraft,
  ): Promise<McpServerConfig> {
    // UI drafts also contain read-only source, identity and timestamp fields.
    const value = managedMcpDraftSchema.strip().parse(draft);
    const library = await mutate<McpLibraryFile>(
      "mcp",
      id ? { action: "update", id, value } : { action: "create", value },
    );
    const server = id
      ? library.servers.find((item) => item.id === id)
      : library.servers.at(-1);
    if (!server) throw new Error("Saved MCP definition was not returned");
    return server;
  }
  return {
    mcp: {
      getLibrary: () => read("mcp"),
      createServer: (draft) => saveMcp(undefined, draft),
      updateServer: saveMcp,
      deleteServer: (id) => mutate("mcp", { action: "delete", id }),
    },
    plugin: {
      ...createHostedPluginBridge(request, (mutation) =>
        mutate("plugins", mutation),
      ),
      getLibrary: () => read("plugins"),
      updatePluginMetadata: (id, value) =>
        mutate("plugins", { action: "update", id, value }),
      deletePlugin: (id) => mutate("plugins", { action: "delete", id }),
    },
  };
}
