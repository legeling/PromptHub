import { closeDatabase, initDatabase } from "../database";
import type { Database } from "@prompthub/db";
import { getRuntimeStorageContext } from "@prompthub/core";
import {
  ensureCanonicalStorageAuthorityOnStartup,
  type EnsureCanonicalStorageAuthorityOnStartupOptions,
} from "./canonical-storage-startup";

/** Finish the startup deferred for renderer data, before acknowledging migration. */
export async function resumeCanonicalStorageAfterRendererMigration(
  options: EnsureCanonicalStorageAuthorityOnStartupOptions & {
    registerDatabase: (database: Database) => void | Promise<void>;
  },
): Promise<void> {
  if (getRuntimeStorageContext().localAuthority === "canonical-files") return;
  const { registerDatabase, ...startupOptions } = options;
  // Publication replaces the catalog: no IPC group may keep the old connection.
  closeDatabase();
  try {
    const result =
      await ensureCanonicalStorageAuthorityOnStartup(startupOptions);
    if (result.status !== "published" && result.status !== "already-canonical")
      throw new Error(
        `Renderer storage startup did not complete: ${result.status}`,
      );
  } finally {
    await registerDatabase(initDatabase());
  }
}
