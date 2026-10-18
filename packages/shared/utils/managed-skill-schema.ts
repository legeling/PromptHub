import { z } from "zod";
import { isHttpUrl, isSafeSkillIconUrl } from "./skill-url-validation";
import { parseManagedSkillFiles } from "./managed-skill-files";

const MAX_SKILL_METADATA_TAGS = 100;
const MAX_SKILL_METADATA_TAG_LENGTH = 100;
const MAX_SKILL_METADATA_DETAILS = 50;
const MAX_SKILL_METADATA_DETAIL_LENGTH = 500;

const skillMetadataTagSchema = z
  .string()
  .trim()
  .min(1, "skill metadata tag must not be empty")
  .max(
    MAX_SKILL_METADATA_TAG_LENGTH,
    `skill metadata tag must be at most ${MAX_SKILL_METADATA_TAG_LENGTH} characters`,
  );

const skillMetadataDetailSchema = z
  .string()
  .trim()
  .min(1, "skill metadata entry must not be empty")
  .max(
    MAX_SKILL_METADATA_DETAIL_LENGTH,
    `skill metadata entry must be at most ${MAX_SKILL_METADATA_DETAIL_LENGTH} characters`,
  );

const skillMetadataTagsSchema = z
  .array(skillMetadataTagSchema)
  .max(
    MAX_SKILL_METADATA_TAGS,
    `skill metadata tags must contain at most ${MAX_SKILL_METADATA_TAGS} entries`,
  );

const skillMetadataDetailsSchema = z
  .array(skillMetadataDetailSchema)
  .max(
    MAX_SKILL_METADATA_DETAILS,
    `skill metadata details must contain at most ${MAX_SKILL_METADATA_DETAILS} entries`,
  );

const skillHttpUrlSchema = z
  .string()
  .url()
  .refine(isHttpUrl, "must use HTTP(S)");
const skillIconUrlSchema = z
  .string()
  .url()
  .refine(isSafeSkillIconUrl, "must use HTTP(S) or a base64 image data URL");

const skillFieldsSchema = z.object({
  name: z.string().trim().min(1, "name is required").max(120),
  description: z.string().max(10000).optional(),
  instructions: z.string().max(200000).optional(),
  content: z.string().max(200000).optional(),
  mcp_config: z.string().max(50000).optional(),
  protocol_type: z.enum(["skill", "mcp", "claude-code"]).default("skill"),
  version: z.string().max(50).optional(),
  author: z.string().max(120).optional(),
  source_url: skillHttpUrlSchema.optional(),
  local_repo_path: z.string().max(1000).optional(),
  tags: skillMetadataTagsSchema.optional(),
  original_tags: skillMetadataTagsSchema.optional(),
  is_favorite: z.boolean().default(false),
  icon_url: skillIconUrlSchema.optional(),
  icon_emoji: z.string().max(32).optional(),
  icon_background: z.string().max(50).optional(),
  category: z
    .enum([
      "general",
      "office",
      "dev",
      "ai",
      "data",
      "management",
      "deploy",
      "design",
      "security",
      "meta",
    ])
    .optional(),
  is_builtin: z.boolean().optional(),
  registry_slug: z.string().max(200).optional(),
  content_url: skillHttpUrlSchema.optional(),
  prerequisites: skillMetadataDetailsSchema.optional(),
  compatibility: skillMetadataDetailsSchema.optional(),
  visibility: z.enum(["private", "shared"]).optional(),
});

function rejectNullBytes(
  data: Record<string, unknown>,
  ctx: z.RefinementCtx,
): void {
  for (const [key, value] of Object.entries(data)) {
    const values = Array.isArray(value) ? value : [value];
    if (
      values.some((item) => typeof item === "string" && item.includes("\0"))
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message: "Skill fields must not contain null bytes",
      });
    }
  }
}

export const createSkillSchema = skillFieldsSchema.superRefine(rejectNullBytes);

export const importSkillPackageSchema = z
  .object({
    metadata: createSkillSchema,
    files: z.unknown().transform((input, ctx) => {
      try {
        return parseManagedSkillFiles(input);
      } catch (error) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            error instanceof Error ? error.message : "Invalid Skill package",
        });
        return z.NEVER;
      }
    }),
  })
  .strict();

export const updateSkillSchema = skillFieldsSchema
  .partial()
  .extend({
    currentVersion: z
      .undefined({
        invalid_type_error:
          "Version counters are managed by /api/skills/:id/versions",
      })
      .optional(),
    versionTrackingEnabled: z.boolean().optional(),
    safetyReport: z
      .undefined({
        invalid_type_error:
          "Use /api/skills/:id/safety-report to save safety reports",
      })
      .optional(),
  })
  .superRefine(rejectNullBytes);

export const versionSchema = z
  .object({
    note: z.string().max(500).optional(),
  })
  .superRefine(rejectNullBytes);
