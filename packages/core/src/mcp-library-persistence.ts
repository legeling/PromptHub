import fs from "fs";

import { isMcpTargetKind } from "@prompthub/shared/types/mcp";
import type {
  McpLibraryFile,
  McpServerDraft,
  McpTargetBinding,
  McpTargetEntryDigest,
} from "@prompthub/shared/types/mcp";
import { normalizeMcpServerDraft } from "@prompthub/shared/utils/mcp-config";

import {
  readCanonicalMcpLibrary,
  type CanonicalMcpLibraryOptions,
} from "./canonical-mcp-library";

export const MAX_RECOVERY_MCP_LIBRARY_BYTES = 16 * 1024 * 1024;

function normalizeEntryDigests(
  value: unknown,
): Record<string, McpTargetEntryDigest> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const entries = Object.entries(value as Record<string, unknown>).flatMap(
    ([serverId, rawDigest]) => {
      if (
        !rawDigest ||
        typeof rawDigest !== "object" ||
        Array.isArray(rawDigest)
      ) {
        return [];
      }
      const record = rawDigest as Record<string, unknown>;
      if (
        record.algorithm !== "mcp-target-entry-sha256-v1" ||
        typeof record.digest !== "string" ||
        typeof record.serverName !== "string"
      ) {
        return [];
      }
      return [
        [
          serverId,
          {
            algorithm: "mcp-target-entry-sha256-v1" as const,
            digest: record.digest,
            serverName: record.serverName,
            recordedAt:
              typeof record.recordedAt === "number"
                ? record.recordedAt
                : Date.now(),
          },
        ] as const,
      ];
    },
  );
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

export function normalizeMcpLibrary(
  raw: Partial<McpLibraryFile>,
): McpLibraryFile {
  const now = Date.now();
  return {
    kind: "prompthub-mcp-library",
    version: 1,
    updatedAt:
      typeof raw.updatedAt === "string"
        ? raw.updatedAt
        : new Date().toISOString(),
    servers: Array.isArray(raw.servers)
      ? raw.servers.map((server) =>
          normalizeMcpServerDraft(server as McpServerDraft, now),
        )
      : [],
    bindings: Array.isArray(raw.bindings)
      ? raw.bindings
          .filter((binding): binding is McpTargetBinding =>
            Boolean(
              binding &&
              typeof binding === "object" &&
              typeof binding.id === "string" &&
              isMcpTargetKind(binding.target) &&
              typeof binding.path === "string" &&
              Array.isArray(binding.serverIds),
            ),
          )
          .map((binding) => ({
            ...binding,
            enabled: binding.enabled !== false,
            entryDigests: normalizeEntryDigests(binding.entryDigests),
            createdAt: binding.createdAt || now,
            updatedAt: binding.updatedAt || now,
          }))
      : [],
  };
}

export function readMcpLibraryFile(filePath: string): McpLibraryFile {
  return normalizeMcpLibrary(JSON.parse(fs.readFileSync(filePath, "utf8")));
}

export function readMcpLibraryRecoverySource(options: {
  canonicalOptions?: CanonicalMcpLibraryOptions;
  supersededPath: string;
}): McpLibraryFile {
  const canonical = normalizeMcpLibrary(
    readCanonicalMcpLibrary(options.canonicalOptions),
  );
  if (canonical.servers.length > 0 || canonical.bindings.length > 0) {
    return canonical;
  }
  if (!fs.existsSync(options.supersededPath)) return canonical;
  const stats = fs.lstatSync(options.supersededPath);
  if (
    !stats.isFile() ||
    stats.isSymbolicLink() ||
    stats.size > MAX_RECOVERY_MCP_LIBRARY_BYTES
  ) {
    throw new Error("Superseded MCP library path is unsafe");
  }
  return readMcpLibraryFile(options.supersededPath);
}
