import { Hono } from "hono";
import { z } from "zod";
import type {
  SkillSafetyReport,
  SkillSafetyScanInput,
} from "@prompthub/shared";
import type { Context } from "hono";
import { getAuthUser } from "../middleware/auth.js";
import { SkillService, SkillServiceError } from "../services/skill.service.js";
import {
  createSkillSchema,
  importSkillPackageSchema,
  updateSkillSchema,
  versionSchema,
} from "@prompthub/shared/utils/managed-skill-schema";
import { error, ErrorCode, success } from "../utils/response.js";
import { parseJsonBody, readRequestTextBody } from "../utils/validation.js";
import {
  parseManagedSkillFiles,
  managedSkillFilesRevision,
} from "@prompthub/shared/utils/managed-skill-files";

const skills = new Hono();
const skillService = new SkillService();
skills.post("/import-package", async (c) => {
  const parsed = await parseJsonBody(c, importSkillPackageSchema);
  if (!parsed.success) return parsed.response;
  try {
    return success(
      c,
      skillService.importPackage(
        getAuthUser(c),
        parsed.data.metadata,
        parsed.data.files,
      ),
      201,
    );
  } catch (cause) {
    return toSkillErrorResponse(c, cause);
  }
});
const packageFilesSchema = z.object({
  revision: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  files: z
    .array(
      z.object({
        relativePath: z.string(),
        content: z.string(),
        encoding: z.enum(["utf8", "base64"]).optional(),
      }),
    )
    .superRefine((files, ctx) => {
      try {
        parseManagedSkillFiles(files);
      } catch (validationError) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            validationError instanceof Error
              ? validationError.message
              : "Invalid Skill package",
        });
      }
    }),
});
const MAX_SKILL_METADATA_DETAIL_LENGTH = 500;
const MAX_SKILL_SAFETY_FINDINGS = 100;
const MAX_SKILL_SAFETY_SUMMARY_LENGTH = 2000;
const MAX_SKILL_SAFETY_FIELD_LENGTH = 200;
const MAX_SKILL_SAFETY_DETAIL_LENGTH = 5000;
const MAX_SKILL_SAFETY_FILE_PATH_LENGTH = 500;
const MAX_SKILL_SAFETY_SCAN_CONTENT_LENGTH = 200000;
const MAX_SKILL_SAFETY_SCAN_PATH_LENGTH = 1000;
const MAX_SKILL_SAFETY_SCAN_AUDITS = 50;
const MAX_SKILL_SAFETY_SCAN_AI_CONFIG_LENGTH = 1000;

const safetyFindingSchema = z.object({
  code: z.string().trim().min(1).max(MAX_SKILL_SAFETY_FIELD_LENGTH),
  severity: z.enum(["info", "warn", "high"]),
  title: z.string().trim().min(1).max(MAX_SKILL_SAFETY_FIELD_LENGTH),
  detail: z.string().max(MAX_SKILL_SAFETY_DETAIL_LENGTH),
  filePath: z.string().max(MAX_SKILL_SAFETY_FILE_PATH_LENGTH).optional(),
  evidence: z.string().max(MAX_SKILL_SAFETY_DETAIL_LENGTH).optional(),
});

const safetyReportSchema = z.object({
  level: z.enum(["safe", "warn", "high-risk", "blocked"]),
  summary: z.string().max(MAX_SKILL_SAFETY_SUMMARY_LENGTH),
  findings: z
    .array(safetyFindingSchema)
    .max(
      MAX_SKILL_SAFETY_FINDINGS,
      `findings must contain at most ${MAX_SKILL_SAFETY_FINDINGS} entries`,
    ),
  recommendedAction: z.enum(["allow", "review", "block"]),
  scannedAt: z.number().int().nonnegative(),
  checkedFileCount: z.number().int().nonnegative(),
  scanMethod: z.literal("ai"),
  score: z.number().min(0).max(100).optional(),
});

const safetyScanInputSchema = z.object({
  enabled: z.boolean().optional(),
  method: z.enum(["static", "ai"]).optional(),
  name: z.string().trim().min(1).max(120).optional(),
  content: z.string().max(MAX_SKILL_SAFETY_SCAN_CONTENT_LENGTH).optional(),
  sourceUrl: z
    .string()
    .url()
    .max(MAX_SKILL_SAFETY_SCAN_AI_CONFIG_LENGTH)
    .optional(),
  contentUrl: z
    .string()
    .url()
    .max(MAX_SKILL_SAFETY_SCAN_AI_CONFIG_LENGTH)
    .optional(),
  localRepoPath: z.string().max(MAX_SKILL_SAFETY_SCAN_PATH_LENGTH).optional(),
  securityAudits: z
    .array(z.string().trim().min(1).max(MAX_SKILL_METADATA_DETAIL_LENGTH))
    .max(
      MAX_SKILL_SAFETY_SCAN_AUDITS,
      `securityAudits must contain at most ${MAX_SKILL_SAFETY_SCAN_AUDITS} entries`,
    )
    .optional(),
  aiConfig: z
    .object({
      provider: z.string().trim().min(1).max(MAX_SKILL_SAFETY_FIELD_LENGTH),
      apiProtocol: z.enum(["openai", "gemini", "anthropic"]),
      apiKey: z.string().min(1).max(MAX_SKILL_SAFETY_SCAN_AI_CONFIG_LENGTH),
      apiUrl: z.string().url().max(MAX_SKILL_SAFETY_SCAN_AI_CONFIG_LENGTH),
      model: z.string().trim().min(1).max(MAX_SKILL_SAFETY_FIELD_LENGTH),
    })
    .optional(),
});

const fetchRemoteSchema = z.object({
  url: z
    .string()
    .url()
    .refine(
      (value) => new URL(value).protocol === "https:",
      "Remote skill URL must use HTTPS",
    ),
  importToLibrary: z.boolean().optional(),
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().max(10000).optional(),
  visibility: z.enum(["private", "shared"]).optional(),
});

const deleteAllSchema = z.object({
  confirm: z.boolean(),
});

const listQuerySchema = z.object({
  scope: z.enum(["private", "shared", "all"]).optional(),
});

async function parseOptionalJsonBody(
  c: Context,
): Promise<
  { success: true; data: unknown } | { success: false; response: Response }
> {
  const textResult = await readRequestTextBody(c);
  if (!textResult.success) {
    return { success: false, response: textResult.response };
  }

  const text = textResult.text;
  if (!text.trim()) {
    return { success: true, data: {} };
  }

  try {
    return { success: true, data: JSON.parse(text) };
  } catch {
    return {
      success: false,
      response: error(
        c,
        400,
        ErrorCode.BAD_REQUEST,
        "Invalid JSON request body",
      ),
    };
  }
}

skills.post("/", async (c) => {
  const parsed = await parseJsonBody(c, createSkillSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  try {
    return success(c, skillService.create(getAuthUser(c), parsed.data), 201);
  } catch (routeError) {
    return toSkillErrorResponse(c, routeError);
  }
});

skills.get("/", async (c) => {
  const parsed = listQuerySchema.safeParse(c.req.query());
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => issue.message)
      .join("; ");
    return error(c, 422, ErrorCode.VALIDATION_ERROR, message);
  }

  try {
    return success(c, skillService.list(getAuthUser(c), parsed.data.scope));
  } catch (routeError) {
    return toSkillErrorResponse(c, routeError);
  }
});

skills.get("/search", async (c) => {
  const parsed = listQuerySchema.safeParse(c.req.query());
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => issue.message)
      .join("; ");
    return error(c, 422, ErrorCode.VALIDATION_ERROR, message);
  }

  try {
    return success(
      c,
      skillService.list(getAuthUser(c), parsed.data.scope ?? "shared"),
    );
  } catch (routeError) {
    return toSkillErrorResponse(c, routeError);
  }
});

skills.get("/:id", async (c) => {
  try {
    return success(c, skillService.getById(getAuthUser(c), c.req.param("id")));
  } catch (routeError) {
    return toSkillErrorResponse(c, routeError);
  }
});

skills.get("/:id/files", (c) => {
  try {
    return success(
      c,
      skillService.readPackageFiles(getAuthUser(c), c.req.param("id")),
    );
  } catch (routeError) {
    return toSkillErrorResponse(c, routeError);
  }
});

skills.put("/:id/files", async (c) => {
  const parsed = await parseJsonBody(c, packageFilesSchema);
  if (!parsed.success) return parsed.response;
  try {
    if (
      parsed.data.revision &&
      parsed.data.revision !==
        managedSkillFilesRevision(
          skillService.readPackageFiles(getAuthUser(c), c.req.param("id")),
        )
    ) {
      return error(
        c,
        409,
        ErrorCode.CONFLICT,
        "Skill package changed during editing; reload and retry",
      );
    }
    return success(
      c,
      skillService.replacePackageFiles(
        getAuthUser(c),
        c.req.param("id"),
        parsed.data.files,
      ),
    );
  } catch (routeError) {
    return toSkillErrorResponse(c, routeError);
  }
});

skills.put("/:id", async (c) => {
  const parsed = await parseJsonBody(c, updateSkillSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  try {
    return success(
      c,
      skillService.update(getAuthUser(c), c.req.param("id"), parsed.data),
    );
  } catch (routeError) {
    return toSkillErrorResponse(c, routeError);
  }
});

skills.delete("/:id", async (c) => {
  try {
    skillService.delete(getAuthUser(c), c.req.param("id"));
    return success(c, { ok: true });
  } catch (routeError) {
    return toSkillErrorResponse(c, routeError);
  }
});

skills.delete("/", async (c) => {
  const parsed = deleteAllSchema.safeParse({
    confirm: c.req.query("confirm") === "true",
  });
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => issue.message)
      .join("; ");
    return error(c, 422, ErrorCode.VALIDATION_ERROR, message);
  }

  try {
    skillService.deleteAll(getAuthUser(c), parsed.data.confirm);
    return success(c, { ok: true });
  } catch (routeError) {
    return toSkillErrorResponse(c, routeError);
  }
});

skills.post("/:id/export", async (c) => {
  try {
    const skill = skillService.getById(getAuthUser(c), c.req.param("id"));
    return success(c, {
      name: skill.name,
      content: skill.content ?? skill.instructions ?? "",
    });
  } catch (routeError) {
    return toSkillErrorResponse(c, routeError);
  }
});

skills.post("/import", async (c) => {
  const parsed = await parseJsonBody(c, createSkillSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  try {
    return success(c, skillService.create(getAuthUser(c), parsed.data), 201);
  } catch (routeError) {
    return toSkillErrorResponse(c, routeError);
  }
});

skills.post("/:id/safety-scan", async (c) => {
  const body = await parseOptionalJsonBody(c);
  if (!body.success) {
    return body.response;
  }

  const parsed = safetyScanInputSchema.partial().safeParse(body.data);
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => {
        const path = issue.path.join(".");
        return path ? `${path}: ${issue.message}` : issue.message;
      })
      .join("; ");
    return error(c, 422, ErrorCode.VALIDATION_ERROR, message);
  }

  try {
    const report = await skillService.scanSafety(
      getAuthUser(c),
      c.req.param("id"),
      parsed.data as Partial<SkillSafetyScanInput>,
    );
    return success(c, report);
  } catch (routeError) {
    return toSkillErrorResponse(c, routeError);
  }
});

skills.post("/safety-scan", async (c) => {
  const parsed = await parseJsonBody(c, safetyScanInputSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  try {
    const report = await skillService.scanSafetyInput(
      parsed.data as SkillSafetyScanInput,
    );
    return success(c, report);
  } catch (routeError) {
    return toSkillErrorResponse(c, routeError);
  }
});

skills.put("/:id/safety-report", async (c) => {
  const parsed = await parseJsonBody(c, safetyReportSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  try {
    const updated = skillService.saveSafetyReport(
      getAuthUser(c),
      c.req.param("id"),
      parsed.data as SkillSafetyReport,
    );
    return success(c, updated);
  } catch (routeError) {
    return toSkillErrorResponse(c, routeError);
  }
});

skills.post("/fetch-remote", async (c) => {
  const parsed = await parseJsonBody(c, fetchRemoteSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  try {
    const result = await skillService.fetchRemote(getAuthUser(c), parsed.data);
    return success(c, result, result.importedSkill ? 201 : 200);
  } catch (routeError) {
    return toSkillErrorResponse(c, routeError);
  }
});

skills.get("/:id/versions", async (c) => {
  try {
    return success(
      c,
      skillService.getVersions(getAuthUser(c), c.req.param("id")),
    );
  } catch (routeError) {
    return toSkillErrorResponse(c, routeError);
  }
});

skills.post("/:id/versions", async (c) => {
  const parsed = await parseJsonBody(c, versionSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  try {
    return success(
      c,
      skillService.createVersion(
        getAuthUser(c),
        c.req.param("id"),
        parsed.data.note,
      ),
      201,
    );
  } catch (routeError) {
    return toSkillErrorResponse(c, routeError);
  }
});

skills.post("/:id/versions/:versionId/rollback", async (c) => {
  const version = Number(c.req.param("versionId"));
  if (!Number.isInteger(version) || version <= 0) {
    return error(
      c,
      422,
      ErrorCode.VALIDATION_ERROR,
      "versionId must be a positive integer",
    );
  }

  try {
    return success(
      c,
      skillService.rollback(getAuthUser(c), c.req.param("id"), version),
    );
  } catch (routeError) {
    return toSkillErrorResponse(c, routeError);
  }
});

skills.delete("/:id/versions/:versionId", async (c) => {
  try {
    skillService.deleteVersion(
      getAuthUser(c),
      c.req.param("id"),
      c.req.param("versionId"),
    );
    return success(c, { ok: true });
  } catch (routeError) {
    return toSkillErrorResponse(c, routeError);
  }
});

function toSkillErrorResponse(c: Context, routeError: unknown): Response {
  if (routeError instanceof SkillServiceError) {
    return error(c, routeError.status, routeError.code, routeError.message);
  }

  if (routeError instanceof Error) {
    if (routeError.message === "AI_NOT_CONFIGURED") {
      return error(c, 422, ErrorCode.VALIDATION_ERROR, "AI_NOT_CONFIGURED");
    }
    if (routeError.message === "SAFETY_SCAN_DISABLED") {
      return error(c, 422, ErrorCode.VALIDATION_ERROR, "SAFETY_SCAN_DISABLED");
    }
  }

  return error(c, 500, ErrorCode.INTERNAL_ERROR, "Internal server error");
}

export default skills;
