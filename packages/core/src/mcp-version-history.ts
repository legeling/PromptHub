import path from "node:path";
import type {
  McpServerConfig,
  McpVersionComparison,
  McpVersionDetail,
  McpVersionListOptions,
  McpVersionPage,
  McpVersionSummary,
} from "@prompthub/shared/types/mcp";
import { MCP_VERSION_PAGE_SIZE } from "@prompthub/shared/types/mcp";
import { redactMcpServerConfig } from "@prompthub/shared/utils/mcp-config";
import {
  readCanonicalMcpLibrary,
  writeCanonicalMcpLibrary,
  type CanonicalMcpLibraryOptions,
} from "./canonical-mcp-library";
import {
  hydrateMcpServerVersionSecretsSync,
  getMcpVersionedDefinition,
  readMcpServerResourceBundle,
  type McpServerResourceVersionInput,
  type McpServerVersionResourceDocument,
} from "./mcp-resource-schema";
import { getDataDir } from "./runtime-paths";

function positiveVersion(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1)
    throw new Error("MCP version must be a positive integer");
  return value;
}
function summary(
  document: McpServerVersionResourceDocument,
  currentVersion: number,
): McpVersionSummary {
  return {
    version: document.version,
    isCurrent: document.version === currentVersion,
    createdAt: document.createdAt,
    note: document.note,
    restoredFromVersion: document.restoredFromVersion,
    semanticDigest: document.semanticDigest,
  };
}
function stable(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item).sort(([a], [b]) => a.localeCompare(b)),
        )
      : item,
  );
}

export class McpVersionHistoryService {
  constructor(private readonly options: CanonicalMcpLibraryOptions = {}) {}
  private resolve(identifier: string): McpServerConfig {
    const server = readCanonicalMcpLibrary({
      ...this.options,
      secretReadMode: "redacted",
      includeHistory: false,
    }).servers.find((s) => s.id === identifier || s.name === identifier);
    if (!server) throw new Error("MCP server was not found");
    return server;
  }
  private resource(identifier: string, versions?: readonly number[]) {
    const server = this.resolve(identifier);
    return readMcpServerResourceBundle(
      path.join(getDataDir(), "mcp", server.id),
      versions,
    );
  }
  list(
    identifier: string,
    options: McpVersionListOptions = {},
  ): McpVersionPage {
    const offset = options.offset ?? 0,
      limit = options.limit ?? MCP_VERSION_PAGE_SIZE;
    if (
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      !Number.isSafeInteger(limit) ||
      limit < 1
    )
      throw new Error("MCP version pagination is invalid");
    const index = this.resource(identifier, []);
    const numbers = index.bundleManifest.payloadFiles
      .filter((p) => p.role === "version")
      .map((p) => Number(p.path.match(/^versions\/(\d+)\.json$/)?.[1]))
      .sort((a, b) => b - a);
    if (numbers.some((n) => !Number.isSafeInteger(n) || n < 1))
      throw new Error("MCP version index is invalid");
    const selected = numbers.slice(offset, offset + limit);
    const resource = this.resource(identifier, selected);
    return {
      currentVersion: index.currentVersion,
      total: numbers.length,
      offset,
      limit,
      items: selected.map((n) =>
        summary(
          resource.versions.find((v) => v.version === n)!,
          index.currentVersion,
        ),
      ),
    };
  }
  get(identifier: string, version: number): McpVersionDetail {
    const resource = this.resource(identifier, [positiveVersion(version)]);
    const document = resource.versions.find((v) => v.version === version);
    if (!document) throw new Error("MCP version was not found");
    const hydrated = hydrateMcpServerVersionSecretsSync(
      document,
      () => "[REDACTED]",
    );
    return {
      ...summary(document, resource.currentVersion),
      server: redactMcpServerConfig(hydrated),
    };
  }
  compare(
    identifier: string,
    fromVersion: number,
    toVersion: number,
  ): McpVersionComparison {
    const resource = this.resource(identifier, [
      positiveVersion(fromVersion),
      positiveVersion(toVersion),
    ]);
    const read = (version: number) => {
      const document = resource.versions.find((v) => v.version === version);
      if (!document) throw new Error("MCP version was not found");
      return hydrateMcpServerVersionSecretsSync(
        document,
        (ref) => this.options.secretStore?.read(ref) ?? null,
      );
    };
    const first = read(fromVersion),
      last = read(toVersion);
    const before = getMcpVersionedDefinition(first),
      after = getMcpVersionedDefinition(last);
    const maskedBefore = getMcpVersionedDefinition(
        redactMcpServerConfig(first),
      ),
      maskedAfter = getMcpVersionedDefinition(redactMcpServerConfig(last));
    return {
      fromVersion,
      toVersion,
      changes: [...new Set([...Object.keys(before), ...Object.keys(after)])]
        .sort()
        .filter((field) => stable(before[field]) !== stable(after[field]))
        .map((field) => ({
          field,
          before: maskedBefore[field],
          after: maskedAfter[field],
        })),
    };
  }
  private mutate(
    identifier: string,
    action: "create" | "restore" | "note" | "delete",
    version?: number,
    note?: string,
  ): McpVersionDetail | undefined {
    if (note !== undefined && (typeof note !== "string" || note.includes("\0")))
      throw new Error("MCP version note is invalid");
    if (version !== undefined) positiveVersion(version);
    const current = this.resolve(identifier),
      resource = this.resource(current.id);
    const selected =
      version === undefined
        ? undefined
        : resource.versions.find((v) => v.version === version);
    if (version !== undefined && !selected)
      throw new Error("MCP version was not found");
    if (action === "delete" && version === resource.currentVersion)
      throw new Error("Cannot delete the current MCP version");
    const readSecret = (ref: string) =>
      this.options.secretStore?.read(ref) ?? null;
    let versions: McpServerResourceVersionInput[] = resource.versions.map(
      (v) => ({
        version: v.version,
        server: hydrateMcpServerVersionSecretsSync(v, readSecret),
        createdAt: v.createdAt,
        note: v.note,
        restoredFromVersion: v.restoredFromVersion,
      }),
    );
    const library = readCanonicalMcpLibrary(this.options);
    let server = library.servers.find((s) => s.id === current.id)!;
    let currentVersion = resource.currentVersion;
    if (action === "delete")
      versions = versions.filter((v) => v.version !== version);
    if (action === "note")
      versions = versions.map((v) =>
        v.version === version ? { ...v, note } : v,
      );
    if (action === "create" || action === "restore") {
      currentVersion++;
      if (selected)
        server = {
          ...hydrateMcpServerVersionSecretsSync(selected, readSecret),
          isFavorite: server.isFavorite,
          tags: server.tags,
          notes: server.notes,
          createdAt: server.createdAt,
          updatedAt: Date.now(),
        };
      versions.push({
        version: currentVersion,
        server,
        createdAt: new Date().toISOString(),
        note,
        ...(selected && { restoredFromVersion: selected.version }),
      });
    }
    if (
      library.servers.some((s) => s.id !== server.id && s.name === server.name)
    )
      throw new Error("MCP server name already exists");
    library.servers = library.servers.map((s) =>
      s.id === server.id ? server : s,
    );
    writeCanonicalMcpLibrary(
      library,
      this.options,
      new Map([[server.id, { currentVersion, versions }]]),
    );
    if (action !== "delete")
      return this.get(server.id, action === "note" ? version! : currentVersion);
  }
  create(identifier: string, note?: string): McpVersionDetail {
    return this.mutate(identifier, "create", undefined, note)!;
  }
  restore(identifier: string, version: number): McpVersionDetail {
    return this.mutate(identifier, "restore", version)!;
  }
  updateNote(
    identifier: string,
    version: number,
    note: string,
  ): McpVersionDetail {
    return this.mutate(identifier, "note", version, note)!;
  }
  delete(identifier: string, version: number): void {
    this.mutate(identifier, "delete", version);
  }
}
