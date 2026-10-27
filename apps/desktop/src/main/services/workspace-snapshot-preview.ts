import path from "node:path";
import { DatabaseAdapter } from "@prompthub/db";
import type { PortableSnapshotResult } from "@prompthub/core/portable-snapshot";

/** These counts describe the existing UI; they do not select exported/restored data. */
export function workspaceSnapshotPreview(snapshot: PortableSnapshotResult): {
  kind: "prompthub-workspace-snapshot-preview";
  exportedAt: string;
  counts: Record<string, number>;
} {
  const db = new DatabaseAdapter(
    path.join(snapshot.path, "data/prompthub.db"),
    { readOnly: true },
  );
  try {
    const tables = {
      prompts: "prompts",
      folders: "folders",
      versions: "prompt_versions",
      promptRelations: "prompt_relations",
      outputFormatItems: "prompt_output_format_items",
      rules: "rules",
      skills: "skills",
      skillVersions: "skill_versions",
      mcpServers: "mcp_servers",
      plugins: "plugins",
    };
    const present = new Set(
      (
        db.all("SELECT name FROM sqlite_master WHERE type='table'") as Array<{
          name: string;
        }>
      ).map((row) => row.name),
    );
    const counts: Record<string, number> = {};
    for (const [key, table] of Object.entries(tables)) {
      if (!present.has(table)) {
        counts[key] = 0;
        continue;
      }
      const row = db.get(`SELECT COUNT(*) AS count FROM "${table}"`) as {
        count: number;
      }; // Owned static table identifiers.
      counts[key] = row.count;
    }
    // Platform discovery materializes empty default rows; these are not saved Rules.
    // This affects the UI summary only: the database image still contains every row.
    if (present.has("rules")) {
      const row = db.get(
        "SELECT COUNT(*) AS count FROM rules WHERE scope = 'project' OR platform_id LIKE 'custom:%' OR current_version > 0 OR content_hash <> ''",
      ) as { count: number };
      counts.rules = row.count;
    }
    for (const [key, prefix] of Object.entries({
      skillFiles: "data/skills/",
      pluginFiles: "data/plugins/",
      images: "data/assets/images/",
      videos: "data/assets/videos/",
    }))
      counts[key] = snapshot.manifest.entries.filter((entry) =>
        entry.path.startsWith(prefix),
      ).length;
    return {
      kind: "prompthub-workspace-snapshot-preview",
      exportedAt: snapshot.manifest.createdAt,
      counts,
    };
  } finally {
    db.close();
  }
}
