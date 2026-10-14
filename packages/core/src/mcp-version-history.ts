import fs from "node:fs";
import path from "node:path";
import { assertStorageMaintenanceAvailable } from "./storage-maintenance-intent";
import type {
  McpVersionComparison,
  McpVersionDetail,
  McpVersionListOptions,
  McpVersionPage,
  McpVersionSummary,
} from "@prompthub/shared/types/mcp";
import { MCP_VERSION_PAGE_SIZE } from "@prompthub/shared/types/mcp";
import type {
  McpStoredServer,
  McpStoredVersion,
} from "@prompthub/shared/types/mcp-storage";
import {
  getMcpVersionedDefinition,
  hydrateMcpServerVersionSecretsSync,
} from "./mcp-resource-schema";
import {
  appendMcpVersion,
  commitMcpHistory,
  hydrateMcpStoredServer,
  mcpHistoryPath,
  mcpRecords,
  mcpSecretReader,
  mcpStorageContext,
  readMcpHistoricalDocument,
  type McpStorageOptions,
} from "./mcp-storage";

function positiveVersion(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1)
    throw new Error("MCP version must be a positive integer");
  return value;
}
function summary(
  meta: McpStoredVersion,
  currentVersion: number,
): McpVersionSummary {
  return {
    version: meta.version,
    isCurrent: meta.version === currentVersion,
    createdAt: meta.createdAt,
    note: meta.note,
    restoredFromVersion: meta.restoredFromVersion,
    semanticDigest: meta.semanticDigest,
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
function validNote(note: string | undefined): void {
  if (note !== undefined && (typeof note !== "string" || note.includes("\0")))
    throw new Error("MCP version note is invalid");
}
export class McpVersionHistoryService {
  constructor(private readonly options: McpStorageOptions = {}) {}
  private historyRoot(): string {
    return path.join(mcpStorageContext(this.options).dataPath, "mcp");
  }
  private resolve(identifier: string): McpStoredServer {
    const row = mcpRecords(this.options).server(identifier);
    if (!row) throw new Error("MCP server was not found");
    return row;
  }
  private metadata(row: McpStoredServer, version: number): McpStoredVersion {
    const meta = mcpRecords(this.options).version(
      row.server.id,
      positiveVersion(version),
    );
    if (!meta) throw new Error("MCP version was not found");
    return meta;
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
    const row = this.resolve(identifier),
      page = mcpRecords(this.options).versionPage(row.server.id, offset, limit);
    return {
      currentVersion: row.currentVersion,
      total: page.total,
      offset,
      limit,
      items: page.items.map((meta) => summary(meta, row.currentVersion)),
    };
  }
  get(identifier: string, version: number): McpVersionDetail {
    const row = this.resolve(identifier),
      meta = this.metadata(row, version);
    return {
      ...summary(meta, row.currentVersion),
      server: hydrateMcpServerVersionSecretsSync(
        readMcpHistoricalDocument(meta, this.historyRoot()),
        mcpSecretReader(this.options, true),
      ),
    };
  }
  compare(
    identifier: string,
    fromVersion: number,
    toVersion: number,
  ): McpVersionComparison {
    const row = this.resolve(identifier);
    const first = readMcpHistoricalDocument(
        this.metadata(row, fromVersion),
        this.historyRoot(),
      ),
      last = readMcpHistoricalDocument(
        this.metadata(row, toVersion),
        this.historyRoot(),
      );
    const before = getMcpVersionedDefinition(
      hydrateMcpServerVersionSecretsSync(first, mcpSecretReader(this.options)),
    );
    const after = getMcpVersionedDefinition(
      hydrateMcpServerVersionSecretsSync(last, mcpSecretReader(this.options)),
    );
    const maskedBefore = getMcpVersionedDefinition(
      hydrateMcpServerVersionSecretsSync(
        first,
        mcpSecretReader(this.options, true),
      ),
    );
    const maskedAfter = getMcpVersionedDefinition(
      hydrateMcpServerVersionSecretsSync(
        last,
        mcpSecretReader(this.options, true),
      ),
    );
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
  private append(
    identifier: string,
    sourceVersion?: number,
    note?: string,
  ): McpVersionDetail {
    validNote(note);
    const records = mcpRecords(this.options);
    const next = commitMcpHistory(records, this.options, (mutations) => {
      const row = this.resolve(identifier);
      let server = hydrateMcpStoredServer(row, this.options, true);
      if (sourceVersion !== undefined) {
        const restored = hydrateMcpServerVersionSecretsSync(
          readMcpHistoricalDocument(
            this.metadata(row, sourceVersion),
            this.historyRoot(),
          ),
          mcpSecretReader(this.options),
        );
        server = {
          ...restored,
          isFavorite: server.isFavorite,
          tags: server.tags,
          notes: server.notes,
          createdAt: server.createdAt,
        };
      }
      server.updatedAt = Date.now();
      const version = appendMcpVersion(
        records,
        server,
        this.options,
        mutations,
        { force: true, note, restoredFromVersion: sourceVersion },
      );
      return { id: server.id, version };
    });
    return this.get(next.id, next.version);
  }
  create(identifier: string, note?: string): McpVersionDetail {
    return this.append(identifier, undefined, note);
  }
  restore(identifier: string, version: number): McpVersionDetail {
    return this.append(identifier, positiveVersion(version));
  }
  updateNote(
    identifier: string,
    version: number,
    note: string,
  ): McpVersionDetail {
    assertStorageMaintenanceAvailable(mcpStorageContext(this.options).activeRoot);
    validNote(note);
    const records = mcpRecords(this.options);
    records.transaction(() => {
      const row = this.resolve(identifier);
      this.metadata(row, version);
      records.updateVersionNote(row.server.id, version, note);
    });
    return this.get(identifier, version);
  }
  delete(identifier: string, version: number): void {
    assertStorageMaintenanceAvailable(mcpStorageContext(this.options).activeRoot);
    const records = mcpRecords(this.options);
    const meta = records.transaction(() => {
      const row = this.resolve(identifier),
        selected = this.metadata(row, version);
      if (row.currentVersion === version)
        throw new Error("Cannot delete the current MCP version");
      records.deleteVersion(row.server.id, version);
      records.pruneSecrets();
      return selected;
    });
    try {
      fs.unlinkSync(mcpHistoryPath(meta.contentPath, this.historyRoot()));
    } catch (error) {
      console.warn(
        "MCP historical metadata deletion committed; file cleanup requires startup reconciliation",
        error,
      );
    }
  }
}
