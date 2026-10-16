import fs from "node:fs";
import path from "node:path";
import { DatabaseAdapter } from "@prompthub/db";
import {
  encodeCanonicalResourceDirectory,
  materializeRuleResourceBundle,
} from "@prompthub/core";
import { collectPortableRules } from "./canonical-storage-projector";

export function materializePortableRules(
  databasePath: string,
  targetPath: string,
): void {
  const database = new DatabaseAdapter(databasePath, { readOnly: true });
  try {
    fs.mkdirSync(targetPath, { recursive: true, mode: 0o700 });
    for (const rule of collectPortableRules(database))
      materializeRuleResourceBundle({
        bundlePath: path.join(
          targetPath,
          encodeCanonicalResourceDirectory(rule.id),
        ),
        rule,
      });
  } finally {
    database.close();
  }
}
