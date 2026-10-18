import { z } from "zod";
import { MCP_REDACTED_VALUE } from "./mcp-config";

const text = z
  .string()
  .max(200_000)
  .refine((value) => !value.includes("\0"));
const short = text.pipe(z.string().max(1000));
const strings = z.array(short).max(1000);
const map = z.record(short, text);
const credential = text.refine(
  (value) =>
    !value ||
    value === MCP_REDACTED_VALUE ||
    /^\$\{[A-Za-z_][A-Za-z0-9_]*(?::-.*?)?\}$/.test(value),
  "Use an environment reference; literal credentials remain on the local device",
);

/** Web stores definitions, never a second server-wide credential vault. */
export const managedMcpDraftSchema = z
  .object({
    name: short.optional(),
    displayName: short.optional(),
    description: text.optional(),
    notes: text.optional(),
    transport: z.enum(["stdio", "streamable-http", "sse"]).optional(),
    command: short.optional(),
    args: strings.optional(),
    cwd: short.optional(),
    env: z.record(short, credential).optional(),
    envRefs: map.optional(),
    url: short.optional(),
    headers: z.record(short, credential).optional(),
    headerRefs: map.optional(),
    oauth: z
      .object({
        clientId: short.optional(),
        clientSecret: credential.optional(),
      })
      .strict()
      .optional(),
    authProviderType: short.optional(),
    disabledTools: strings.optional(),
    enabledTools: strings.optional(),
    bearerTokenEnvVar: short.optional(),
    headersHelper: short.optional(),
    httpHeadersHelper: short.optional(),
    startupTimeoutSec: z.number().finite().nonnegative().optional(),
    toolTimeoutSec: z.number().finite().nonnegative().optional(),
    required: z.boolean().optional(),
    envVars: strings.optional(),
    enabled: z.boolean().optional(),
    isFavorite: z.boolean().optional(),
    tags: strings.optional(),
  })
  .strict();

export const managedPluginMetadataSchema = z
  .object({
    displayName: short.optional(),
    description: text.optional(),
    isFavorite: z.boolean().optional(),
    userTags: strings.optional(),
    userNotes: text.optional(),
  })
  .strict();

export const managedResourceMutationSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("import-files"), value: z.unknown() }).strict(),
  z
    .object({ action: z.literal("import-package"), value: z.unknown() })
    .strict(),
  z
    .object({
      action: z.literal("create-version"),
      id: short,
      note: text.optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("rollback"),
      id: short,
      version: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      action: z.literal("delete-version"),
      id: short,
      versionId: short,
    })
    .strict(),
  z.object({ action: z.literal("create"), value: z.unknown() }).strict(),
  z
    .object({ action: z.literal("update"), id: short, value: z.unknown() })
    .strict(),
  z.object({ action: z.literal("delete"), id: short }).strict(),
]);

export const managedResourceRequestSchema = z
  .object({
    revision: z.string().regex(/^[a-f0-9]{64}$/),
    mutation: managedResourceMutationSchema,
  })
  .strict();

export type ManagedResourceMutation = z.infer<
  typeof managedResourceMutationSchema
>;
