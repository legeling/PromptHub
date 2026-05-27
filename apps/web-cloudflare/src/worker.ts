import { Hono } from "hono";
import { cors } from "hono/cors";
import { bootstrapStatus, issueCaptcha, login, logout, me, refresh, register, requireAuth } from "./auth";
import { heartbeat } from "./devices";
import { getMediaBase64, getMediaFile, getMediaSize, listMedia, mediaExists, uploadMediaBase64 } from "./media";
import { ErrorCode, failure, success } from "./response";
import { getManifest, getSyncData, putSyncData } from "./sync";
import type { AuthUser, Env } from "./types";
import {
  getPrompt,
  getSettings,
  getSkill,
  copyPrompt,
  createFolder,
  createPrompt,
  createPromptVersion,
  deleteFolder,
  deletePromptTag,
  deletePrompt,
  deletePromptVersion,
  deletePromptVersionById,
  diffPromptVersions,
  listFolders,
  listPromptTags,
  listPromptVersions,
  listPrompts,
  listRules,
  listSkillVersions,
  listSkills,
  putSettings,
  readRule,
  renderPromptCopy,
  renamePromptTag,
  reorderFolders,
  rollbackPromptVersion,
  updateFolder,
  updatePrompt,
} from "./web-data";

const app = new Hono<{ Bindings: Env; Variables: { authUser: AuthUser } }>();

function notImplemented(message: string) {
  return (c: Parameters<typeof failure>[0]) => failure(c, 501, ErrorCode.NOT_IMPLEMENTED, message);
}

app.use("*", cors({
  origin: "*",
  allowHeaders: ["Authorization", "Content-Type"],
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  maxAge: 86400,
}));

app.get("/health", (c) => success(c, { ok: true, runtime: "cloudflare-workers" }));

app.get("/api/auth/bootstrap", bootstrapStatus);
app.get("/api/auth/captcha", issueCaptcha);
app.post("/api/auth/register", register);
app.post("/api/auth/login", login);
app.post("/api/auth/refresh", refresh);
app.post("/api/auth/logout", logout);
app.get("/api/auth/me", requireAuth, me);

app.use("/api/devices/*", requireAuth);
app.post("/api/devices/heartbeat", heartbeat);

app.use("/api/sync/*", requireAuth);
app.get("/api/sync/manifest", getManifest);
app.get("/api/sync/data", getSyncData);
app.put("/api/sync/data", putSyncData);

app.use("/api/prompts/*", requireAuth);
app.use("/api/prompts", requireAuth);
app.get("/api/prompts/meta/tags", listPromptTags);
app.post("/api/prompts/meta/tags/rename", renamePromptTag);
app.post("/api/prompts/meta/tags/delete", deletePromptTag);
app.get("/api/prompts/:id/versions", listPromptVersions);
app.get("/api/prompts/:id/versions/diff", diffPromptVersions);
app.post("/api/prompts/:id/versions", createPromptVersion);
app.post("/api/prompts/:id/versions/:version/rollback", rollbackPromptVersion);
app.delete("/api/prompts/:id/versions/:versionId", deletePromptVersion);
app.post("/api/prompts/:id/render-copy", renderPromptCopy);
app.post("/api/prompts/:id/copy", copyPrompt);
app.get("/api/prompts/:id", getPrompt);
app.put("/api/prompts/:id", updatePrompt);
app.delete("/api/prompts/:id", deletePrompt);
app.get("/api/prompts", listPrompts);
app.post("/api/prompts", createPrompt);
app.use("/api/prompt-versions/*", requireAuth);
app.delete("/api/prompt-versions/:versionId", deletePromptVersionById);

app.use("/api/folders/*", requireAuth);
app.use("/api/folders", requireAuth);
app.put("/api/folders/reorder", reorderFolders);
app.get("/api/folders", listFolders);
app.post("/api/folders", createFolder);
app.put("/api/folders/:id", updateFolder);
app.delete("/api/folders/:id", deleteFolder);

app.use("/api/skills/*", requireAuth);
app.use("/api/skills", requireAuth);
app.post("/api/skills/safety-scan", notImplemented("Skill safety scan is local-client only in the Cloudflare worker"));
app.post("/api/skills/fetch-remote", notImplemented("Remote skill import is not implemented in the Cloudflare worker"));
app.put("/api/skills/:id/safety-report", notImplemented("Skill safety reports are local-client only in the Cloudflare worker"));
app.get("/api/skills/:id/versions", listSkillVersions);
app.post("/api/skills/:id/versions", notImplemented("Skill version writes are local-client only in the Cloudflare worker"));
app.post("/api/skills/:id/versions/:version/rollback", notImplemented("Skill version rollback is local-client only in the Cloudflare worker"));
app.delete("/api/skills/:id/versions/:versionId", notImplemented("Skill version deletion is local-client only in the Cloudflare worker"));
app.post("/api/skills/:id/export", notImplemented("Skill export is local-client only in the Cloudflare worker"));
app.get("/api/skills/:id", getSkill);
app.post("/api/skills", notImplemented("Skill creation is local-client only in the Cloudflare worker"));
app.put("/api/skills/:id", notImplemented("Skill updates are local-client only in the Cloudflare worker"));
app.delete("/api/skills/:id", notImplemented("Skill deletion is local-client only in the Cloudflare worker"));
app.get("/api/skills", listSkills);
app.delete("/api/skills", notImplemented("Bulk skill deletion is local-client only in the Cloudflare worker"));

app.use("/api/rules/*", requireAuth);
app.use("/api/rules", requireAuth);
app.post("/api/rules/scan", notImplemented("Rule scanning is local-client only in the Cloudflare worker"));
app.post("/api/rules/rewrite", notImplemented("Rule rewrite is local-client only in the Cloudflare worker"));
app.post("/api/rules/projects", notImplemented("Rule project registration is local-client only in the Cloudflare worker"));
app.delete("/api/rules/projects/:id", notImplemented("Rule project removal is local-client only in the Cloudflare worker"));
app.post("/api/rules/import-records", notImplemented("Rule import writes are local-client only in the Cloudflare worker"));
app.delete("/api/rules/:id/versions/:versionId", notImplemented("Rule version deletion is local-client only in the Cloudflare worker"));
app.put("/api/rules/:id", notImplemented("Rule file writes are local-client only in the Cloudflare worker"));
app.get("/api/rules/:id", readRule);
app.get("/api/rules", listRules);

app.use("/api/settings", requireAuth);
app.get("/api/settings", getSettings);
app.put("/api/settings", putSettings);

app.use("/api/media/*", requireAuth);
app.get("/api/media/images", (c) => listMedia(c, "images"));
app.get("/api/media/videos", (c) => listMedia(c, "videos"));
app.get("/api/media/images/:filename/base64", (c) => getMediaBase64(c, "images"));
app.get("/api/media/videos/:filename/base64", (c) => getMediaBase64(c, "videos"));
app.get("/api/media/images/:filename/exists", (c) => mediaExists(c, "images"));
app.get("/api/media/videos/:filename/exists", (c) => mediaExists(c, "videos"));
app.get("/api/media/images/:filename/size", (c) => getMediaSize(c, "images"));
app.get("/api/media/videos/:filename/size", (c) => getMediaSize(c, "videos"));
app.get("/api/media/images/:filename", (c) => getMediaFile(c, "images"));
app.get("/api/media/videos/:filename", (c) => getMediaFile(c, "videos"));
app.post("/api/media/images/base64", (c) => uploadMediaBase64(c, "images"));
app.post("/api/media/videos/base64", (c) => uploadMediaBase64(c, "videos"));
app.post("/api/media/images", (c) => failure(c, 400, ErrorCode.BAD_REQUEST, "Use /api/media/images/base64"));
app.post("/api/media/videos", (c) => failure(c, 400, ErrorCode.BAD_REQUEST, "Use /api/media/videos/base64"));

app.notFound(async (c) => {
  if (new URL(c.req.url).pathname.startsWith("/api/")) {
    return failure(c, 404, ErrorCode.NOT_FOUND, "API route not implemented in the Cloudflare worker");
  }
  if (c.env.ASSETS) {
    return c.env.ASSETS.fetch(c.req.raw);
  }
  return failure(c, 404, ErrorCode.NOT_FOUND, "Not found");
});

app.onError((error, c) => {
  console.error(error);
  return failure(c, 500, ErrorCode.INTERNAL_ERROR, error instanceof Error ? error.message : "Internal server error");
});

export default app;
