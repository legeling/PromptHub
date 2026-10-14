import path from "node:path";

import {
  CoreMcpLibraryService,
  initializeMcpStorage,
  getSecretsDir,
} from "@prompthub/core";
import type { DatabaseAdapter } from "@prompthub/db";
import { safeStorage } from "electron";

import { createLegacyMcpResourceSecretReader } from "./mcp-resource-secret-store";

export function createDesktopMcpLibraryService(): CoreMcpLibraryService {
  return new CoreMcpLibraryService();
}

export function initializeDesktopMcpStorage(
  database: DatabaseAdapter.Database,
): void {
  initializeMcpStorage({
    database,
    legacySecretReader: createLegacyMcpResourceSecretReader({
      filePath: path.join(getSecretsDir(), "mcp-resource-secrets.json"),
      encryption: safeStorage,
    }),
  });
}
