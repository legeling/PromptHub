import type {
  ManagedResourceKind,
  ManagedResourceSnapshot,
} from "@prompthub/shared/types/managed-resources";
import type {
  McpLibraryFile,
  McpServerConfig,
} from "@prompthub/shared/types/mcp";
import type { PluginLibraryFile } from "@prompthub/shared/types/plugin";
import {
  managedMcpDraftSchema,
  managedResourceMutationSchema,
} from "@prompthub/shared/utils/managed-resource-schema";
import {
  normalizeMcpServerDraft,
  redactMcpLibraryForTransport,
} from "@prompthub/shared/utils/mcp-config";
import { sha256HexSync } from "@prompthub/shared/utils/mcp-entry-sha256";
import { normalizeStoredMcpDraft } from "@prompthub/shared/utils/mcp-stored-draft";
import { mutateHostedPlugin } from "./plugin-mutations";
import { ManagedResourceError } from "./errors";
export { ManagedResourceError } from "./errors";
export type { ManagedResourceSnapshot } from "@prompthub/shared/types/managed-resources";

export function managedResourceRevision(
  snapshot: ManagedResourceSnapshot,
): string {
  return sha256HexSync(
    JSON.stringify({
      mcpLibrary: snapshot.mcpLibrary,
      pluginLibrary: snapshot.pluginLibrary,
      pluginPackages: snapshot.pluginPackages,
      storeSources: snapshot.storeSources,
      agentAssetFiles: snapshot.agentAssetFiles,
    }),
  );
}

function mcpLibrary(snapshot: ManagedResourceSnapshot): McpLibraryFile {
  return (
    snapshot.mcpLibrary ?? {
      kind: "prompthub-mcp-library",
      version: 1,
      updatedAt: new Date(0).toISOString(),
      servers: [],
      bindings: [],
    }
  );
}

function pluginLibrary(snapshot: ManagedResourceSnapshot): PluginLibraryFile {
  return (
    snapshot.pluginLibrary ?? {
      kind: "prompthub-plugin-library",
      version: 1,
      updatedAt: new Date(0).toISOString(),
      plugins: [],
    }
  );
}

export function readManagedResourceLibrary(
  snapshot: ManagedResourceSnapshot,
  kind: ManagedResourceKind,
): McpLibraryFile | PluginLibraryFile {
  if (kind === "plugins") return structuredClone(pluginLibrary(snapshot));
  // Device bindings are retained by sync but are not server-side targets.
  return {
    ...redactMcpLibraryForTransport(mcpLibrary(snapshot)),
    bindings: [],
  };
}

function parseMcp(value: unknown, current?: McpServerConfig): McpServerConfig {
  const parsed = managedMcpDraftSchema.safeParse(value);
  if (!parsed.success)
    throw new ManagedResourceError(
      422,
      "Invalid MCP definition; use environment references for credentials",
    );
  try {
    const draft = {
      ...current,
      ...parsed.data,
      id: current?.id ?? crypto.randomUUID(),
      createdAt: current?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    };
    return current
      ? normalizeStoredMcpDraft(draft, current)
      : normalizeMcpServerDraft(draft);
  } catch {
    throw new ManagedResourceError(
      422,
      "Invalid MCP definition: command or remote URL is required",
    );
  }
}

export function mutateManagedResourceLibrary(
  snapshot: ManagedResourceSnapshot,
  kind: ManagedResourceKind,
  input: unknown,
): ManagedResourceSnapshot {
  const parsed = managedResourceMutationSchema.safeParse(input);
  if (!parsed.success)
    throw new ManagedResourceError(422, "Invalid resource operation");
  const mutation = parsed.data;
  const next = structuredClone(snapshot);
  if (kind === "plugins") {
    mutateHostedPlugin(next, mutation);
    return next;
  }
  if (
    mutation.action !== "create" &&
    mutation.action !== "update" &&
    mutation.action !== "delete"
  )
    throw new ManagedResourceError(422, "Unsupported MCP operation");
  const library = mcpLibrary(next);
  const current =
    mutation.action === "create"
      ? undefined
      : library.servers.find((item) => item.id === mutation.id);
  if (mutation.action !== "create" && !current)
    throw new ManagedResourceError(404, "MCP server not found");
  const server =
    mutation.action === "delete"
      ? undefined
      : parseMcp(mutation.value, current);
  if (
    server &&
    library.servers.some(
      (item) => item.id !== server.id && item.name === server.name,
    )
  )
    throw new ManagedResourceError(409, "MCP server name already exists");
  next.mcpLibrary = {
    ...library,
    updatedAt: new Date().toISOString(),
    servers: [
      ...library.servers.filter((item) => item.id !== current?.id),
      ...(server ? [server] : []),
    ],
  };
  return next;
}
