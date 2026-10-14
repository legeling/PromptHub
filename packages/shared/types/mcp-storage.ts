import type { McpServerConfig } from "./mcp";

export interface McpSecretReferences {
  env: Record<string, string>;
  headers: Record<string, string>;
  oauth?: Record<string, string>;
}
export interface McpStoredServer {
  server: McpServerConfig;
  currentVersion: number;
  maxVersion: number;
}
export interface McpStoredVersion {
  serverId: string;
  version: number;
  createdAt: string;
  note?: string;
  restoredFromVersion?: number;
  semanticDigest: string;
  contentSha256: string;
  /** Relative to the MCP data directory, never an absolute path. */
  contentPath: string;
  secretReferences: McpSecretReferences;
}
export interface McpEncryptedSecret {
  ref: string;
  serverId: string;
  keyId: string;
  iv: string;
  ciphertext: string;
  authTag: string;
}
export type McpStoredSecret =
  | (McpEncryptedSecret & { availability: "available" })
  | { ref: string; serverId: string; availability: "unavailable" };
export interface McpStorageState {
  formatVersion: 1;
  deviceId: string;
  keyId: string;
  adoptedAt: string;
}
export const MCP_STORAGE_TABLES = [
  "mcp_storage_state",
  "mcp_servers",
  "mcp_versions",
  "mcp_bindings",
  "mcp_binding_servers",
  "mcp_secrets",
  "mcp_version_secrets",
] as const;
