import { z } from "zod";
import type { AgentAssetFileSnapshot } from "../types/sync";
const digest = z.string().regex(/^[a-f0-9]{64}$/);

export const hostedPluginManifestSchema = z
  .object({
    kind: z.literal("prompthub-resource-bundle"),
    manifestVersion: z.literal(1),
    resourceType: z.literal("plugin"),
    resourceId: z.string().min(1),
    schemaVersion: z.literal(1),
    revision: z.number().int().positive(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    contentHash: digest,
    objectHashes: z.array(digest).max(0),
    payloadFiles: z
      .array(
        z.object({
          path: z.string().min(1),
          size: z.number().int().nonnegative(),
          sha256: digest,
          role: z.enum(["current", "package", "version", "version-package"]),
        }),
      )
      .max(10_000),
  })
  .passthrough();

export const hostedPluginFilesSchema = z
  .array(
    z
      .object({
        relativePath: z.string().min(1),
        contentBase64: z.string(),
        size: z.number().int().nonnegative(),
      })
      .strict(),
  )
  .max(10_000);

export function parseHostedPluginBackup(
  input: unknown,
): AgentAssetFileSnapshot[] {
  // Zod validates required fields at runtime; keep the result stable for consumers
  // whose legacy tsconfig disables strictNullChecks (Zod otherwise infers optionals).
  return hostedPluginFilesSchema.parse(input) as AgentAssetFileSnapshot[];
}
