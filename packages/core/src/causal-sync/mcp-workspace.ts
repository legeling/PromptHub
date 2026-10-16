import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import type {
  McpStoredVersion,
  McpSecretReferences,
} from "@prompthub/shared/types/mcp-storage";
import {
  mcpRecords,
  mcpStorageContext,
  type McpStorageOptions,
} from "../mcp-storage";
import {
  mcpHistoryPath,
  readMcpHistoricalDocument,
} from "../mcp-history-files";
import {
  validateMcpServer,
  parseMcpVersionDocument,
  computeMcpSemanticDigest,
  MCP_SERVER_RESOURCE_MAX_VERSION,
} from "../mcp-resource-schema";
import type { CanonicalEntryMutation } from "../canonical-entry-publication";
import { syncPayload, syncPayloadRecord } from "./payload";
import type { CausalSyncPayload, CausalSyncWorkspace } from "./workflow";

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("Invalid MCP sync record");
  return value as Record<string, unknown>; // Checked JSON object boundary.
}
function version(value: unknown): number {
  if (
    !Number.isSafeInteger(value) ||
    Number(value) < 1 ||
    Number(value) > MCP_SERVER_RESOURCE_MAX_VERSION
  )
    throw new Error("Invalid MCP sync version");
  return Number(value);
}

function credentialReferences(value: McpSecretReferences): string[] {
  return [value.env, value.headers, value.oauth ?? {}].flatMap((fields) =>
    Object.values(fields),
  );
}
function decode(resource: CausalSyncPayload) {
  if (resource.resourceType !== "mcp" || resource.references.length !== 0)
    throw new Error("Invalid MCP sync resource");
  const value = syncPayloadRecord(resource),
    server = validateMcpServer(value.server, false);
  const currentVersion = version(value.currentVersion),
    maxVersion = version(value.maxVersion);
  if (!Array.isArray(value.versions))
    throw new Error("Missing MCP sync history");
  const versions = value.versions
    .map((entry) => parseMcpVersionDocument(record(entry)))
    .sort((a, b) => a.version - b.version);
  const current = versions.find((entry) => entry.version === currentVersion);
  if (
    new Set(versions.map((entry) => entry.version)).size !== versions.length ||
    versions.some(
      (entry) => entry.server.id !== server.id || entry.version > maxVersion,
    ) ||
    !current ||
    computeMcpSemanticDigest(server, current.secretReferences) !==
      current.semanticDigest
  )
    throw new Error("MCP sync history does not match its current definition");
  const data = { server, currentVersion, maxVersion, versions };
  if (
    resource.resourceId !== server.id ||
    syncPayload("mcp", server.id, data).contentHash !== resource.contentHash
  )
    throw new Error("MCP sync identity mismatch");
  return data;
}

export class McpCausalSyncWorkspace implements CausalSyncWorkspace {
  private readonly records;
  private readonly historyRoot: string;
  constructor(options: McpStorageOptions) {
    this.records = mcpRecords(options);
    this.historyRoot = path.join(mcpStorageContext(options).dataPath, "mcp");
  }
  capture(): CausalSyncPayload[] {
    return this.records.servers().map((row) =>
      syncPayload("mcp", row.server.id, {
        ...row,
        versions: this.records
          .versionPage(row.server.id, 0, row.maxVersion)
          .items.map((meta) =>
            readMcpHistoricalDocument(meta, this.historyRoot),
          )
          .sort((a, b) => a.version - b.version),
      }),
    );
  }

  private prepareVersions(
    value: ReturnType<typeof decode>,
    entries: CanonicalEntryMutation[],
  ): McpStoredVersion[] {
    return value.versions.map((document) => {
      const content = `${JSON.stringify(document, null, 2)}\n`;
      const contentSha256 = createHash("sha256").update(content).digest("hex");
      const contentPath = `${value.server.id}/versions/${String(document.version).padStart(6, "0")}-${contentSha256}.json`;
      const targetPath = mcpHistoryPath(contentPath, this.historyRoot);
      if (fs.existsSync(targetPath)) {
        if (
          !fs.lstatSync(targetPath).isFile() ||
          fs.readFileSync(targetPath, "utf8") !== content
        )
          throw new Error("MCP sync immutable history collision");
      } else
        entries.push({
          targetPath,
          prepare(stage) {
            fs.writeFileSync(stage, content, { flag: "wx", mode: 0o600 });
          },
        });
      return {
        serverId: value.server.id,
        version: document.version,
        createdAt: document.createdAt,
        note: document.note,
        restoredFromVersion: document.restoredFromVersion,
        semanticDigest: document.semanticDigest,
        secretReferences: document.secretReferences,
        contentPath,
        contentSha256,
      };
    });
  }

  prepareApplication(
    resources: CausalSyncPayload[],
  ): ReturnType<CausalSyncWorkspace["prepareApplication"]> {
    const incoming = resources.map(decode),
      ids = new Set(incoming.map((value) => value.server.id));
    if (
      ids.size !== incoming.length ||
      new Set(incoming.map((value) => value.server.name)).size !==
        incoming.length
    )
      throw new Error("Duplicate MCP sync identity or name");
    const current = new Map(
      this.capture().map((resource) => [
        resource.resourceId,
        resource.contentHash,
      ]),
    );
    const entries: CanonicalEntryMutation[] = [];
    const changed = incoming
      .filter(
        (value, index) =>
          current.get(value.server.id) !== resources[index].contentHash,
      )
      .map((value) => {
        const previous = this.records.server(value.server.id);
        if (previous && previous.server.createdAt !== value.server.createdAt)
          throw new Error("MCP sync creation identity conflict");
        const versions = this.prepareVersions(value, entries);
        const retained = new Set(versions.map((meta) => meta.contentPath));
        if (previous)
          for (const meta of this.records.versionPage(
            previous.server.id,
            0,
            previous.maxVersion,
          ).items) {
            if (!retained.has(meta.contentPath))
              entries.push({
                targetPath: mcpHistoryPath(meta.contentPath, this.historyRoot),
                delete: true,
              });
          }
        return {
          ...value,
          metadata: versions,
          previousMaxVersion: previous?.maxVersion ?? 0,
        };
      });
    const deleted = this.records
      .servers()
      .filter((row) => !ids.has(row.server.id));
    for (const row of deleted)
      for (const meta of this.records.versionPage(
        row.server.id,
        0,
        row.maxVersion,
      ).items)
        entries.push({
          targetPath: mcpHistoryPath(meta.contentPath, this.historyRoot),
          delete: true,
        });
    this.validateReferences(changed);
    return {
      entries,
      apply: () => {
        for (const row of deleted) this.records.deleteServer(row.server.id);
        this.records.putServers(changed);
        for (const value of changed) this.apply(value);
        this.records.pruneSecrets();
      },
    };
  }

  private validateReferences(incoming: Array<ReturnType<typeof decode>>): void {
    const owners = new Map<string, string>();
    for (const value of incoming)
      for (const document of value.versions)
        for (const ref of credentialReferences(document.secretReferences)) {
          const existing = this.records.secret(ref);
          if (
            (existing && existing.serverId !== value.server.id) ||
            (owners.has(ref) && owners.get(ref) !== value.server.id)
          )
            throw new Error("MCP sync credential reference ownership conflict");
          owners.set(ref, value.server.id);
        }
  }

  private apply(
    value: ReturnType<typeof decode> & {
      metadata: McpStoredVersion[];
      previousMaxVersion: number;
    },
  ): void {
    if (value.previousMaxVersion > 0)
      for (const meta of this.records.versionPage(
        value.server.id,
        0,
        value.previousMaxVersion,
      ).items)
        this.records.deleteVersion(value.server.id, meta.version);
    for (const meta of value.metadata) {
      for (const ref of credentialReferences(meta.secretReferences))
        if (!this.records.secret(ref))
          this.records.putUnavailableSecret(ref, value.server.id);
      this.records.putVersion(meta);
    }
  }
}
