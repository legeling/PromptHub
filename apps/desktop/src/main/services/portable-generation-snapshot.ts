import fs from "node:fs";
import path from "node:path";
import { DatabaseAdapter } from "@prompthub/db";
import { collectGenerationResources } from "@prompthub/core/generation-storage";
import {
  encodeCanonicalResourceDirectory,
  materializeGenerationResourceBundle,
} from "@prompthub/core";

/** Generate the existing archive format from authoritative SQL and actual image files. */
export function materializePortableGenerations(
  databasePath: string,
  rootPath: string,
  targetPath: string,
): void {
  const database = new DatabaseAdapter(databasePath, { readOnly: true });
  try {
    fs.mkdirSync(path.join(targetPath, "generations"), {
      recursive: true,
      mode: 0o700,
    });
    for (const entry of collectGenerationResources(database, rootPath))
      materializeGenerationResourceBundle({
        ...entry,
        bundlePath: path.join(
          targetPath,
          "generations",
          encodeCanonicalResourceDirectory(entry.manifest.id),
        ),
        objectsRoot: path.join(targetPath, "assets", "objects"),
      });
  } finally {
    database.close();
  }
}
