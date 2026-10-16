import type {
  PluginLibraryEntry,
  PluginVersion,
} from "@prompthub/shared/types/plugin";
import type Database from "./adapter";

export const PLUGIN_SCHEMA_VERSION = 9;
export const PLUGIN_SCHEMA = `
CREATE TABLE IF NOT EXISTS plugins (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  installed_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  metadata_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS plugin_versions (
  id TEXT PRIMARY KEY NOT NULL,
  plugin_id TEXT NOT NULL REFERENCES plugins(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK(version > 0),
  created_at TEXT NOT NULL,
  note TEXT,
  metadata_json TEXT NOT NULL,
  has_package_snapshot INTEGER NOT NULL CHECK(has_package_snapshot IN (0,1)),
  UNIQUE(plugin_id, version)
);
`;

export interface StoredPluginVersion {
  version: Omit<PluginVersion, "packageSnapshot">;
  hasPackageSnapshot: boolean;
}
interface PluginRow {
  id: string;
  name: string;
  installed_at: number;
  updated_at: number;
  metadata_json: string;
}
interface VersionRow {
  id: string;
  plugin_id: string;
  version: number;
  created_at: string;
  note: string | null;
  metadata_json: string;
  has_package_snapshot: number;
}

function metadata(value: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error("Invalid Plugin metadata JSON");
  return parsed as Record<string, unknown>; // JSON shape is validated before reconstruction by the domain owner.
}

export class PluginDB {
  constructor(private readonly db: Database.Database) {}

  list(): PluginLibraryEntry[] {
    const rows = this.db.all(
      "SELECT * FROM plugins ORDER BY id",
    ) as PluginRow[]; // Fixed owned table columns.
    return rows.map(
      (row) =>
        ({
          ...metadata(row.metadata_json),
          id: row.id,
          name: row.name,
          installedAt: row.installed_at,
          updatedAt: row.updated_at,
        }) as PluginLibraryEntry,
    ); // Core validates the reconstructed sparse metadata.
  }

  versions(): StoredPluginVersion[] {
    const rows = this.db.all(
      "SELECT * FROM plugin_versions ORDER BY plugin_id, version",
    ) as VersionRow[]; // Fixed owned table columns.
    return rows.map((row) => ({
      version: {
        id: row.id,
        pluginId: row.plugin_id,
        version: row.version,
        createdAt: row.created_at,
        ...(row.note === null ? {} : { note: row.note }),
        plugin: metadata(row.metadata_json) as unknown as PluginLibraryEntry,
      },
      hasPackageSnapshot: row.has_package_snapshot === 1,
    }));
  }

  replace(
    plugins: PluginLibraryEntry[],
    versions: StoredPluginVersion[],
  ): void {
    this.db.transaction(() => {
      const accepted = new Set(plugins.map((plugin) => plugin.id));
      for (const plugin of this.list())
        if (!accepted.has(plugin.id))
          this.db.run("DELETE FROM plugins WHERE id = ?", plugin.id);
      for (const plugin of plugins) {
        const { id, name, installedAt, updatedAt, ...rest } = plugin;
        this.db.run(
          `INSERT INTO plugins (id,name,installed_at,updated_at,metadata_json) VALUES (?,?,?,?,?)
          ON CONFLICT(id) DO UPDATE SET name=excluded.name, installed_at=excluded.installed_at,
          updated_at=excluded.updated_at, metadata_json=excluded.metadata_json`,
          id,
          name,
          installedAt,
          updatedAt,
          JSON.stringify(rest),
        );
      }
      this.db.run("DELETE FROM plugin_versions");
      for (const { version, hasPackageSnapshot } of versions)
        this.db.run(
          `INSERT INTO plugin_versions (id,plugin_id,version,created_at,note,metadata_json,has_package_snapshot)
          VALUES (?,?,?,?,?,?,?)`,
          version.id,
          version.pluginId,
          version.version,
          version.createdAt,
          version.note ?? null,
          JSON.stringify(version.plugin),
          hasPackageSnapshot ? 1 : 0,
        );
    })();
  }
}
