import { Hono } from "hono";
import { getWebRuntime } from "@prompthub/shared/utils/web-runtime";
import rootPackage from "../../../package.json";
import { getServerDatabase } from "./database.js";
import { logger } from "./middleware/logger.js";
import { errorHandler } from "./middleware/error-handler.js";
import { auth as authMiddleware } from "./middleware/auth.js";
import { securityHeaders } from "./middleware/security-headers.js";
import authRoutes from "./routes/auth.js";
import promptRoutes from "./routes/prompts.js";
import folderRoutes from "./routes/folders.js";
import skillRoutes from "./routes/skills.js";
import resourceLibraryRoutes from "./routes/resource-libraries.js";
import rulesRoutes from "./routes/rules.js";
import settingsRoutes from "./routes/settings.js";
import agentRoutes from "./routes/agents.js";
import aiRoutes from "./routes/ai.js";
import mediaRoutes from "./routes/media.js";
import syncRoutes from "./routes/sync.js";
import importExportRoutes from "./routes/import-export.js";
import devicesRoutes from "./routes/devices.js";
import backupRoutes from "./routes/backups.js";
import { bootstrapRuleWorkspace } from "./services/rule-workspace.js";

export function createApp(): Hono {
  getServerDatabase();
  bootstrapRuleWorkspace();

  const app = new Hono();

  app.use("*", logger());
  app.use("*", securityHeaders());
  app.onError(errorHandler);

  app.route("/api/auth", authRoutes);

  const protectedApi = new Hono();
  protectedApi.use("*", authMiddleware());
  protectedApi.get("/runtime", (c) =>
    c.json({ data: getWebRuntime("self-hosted") }),
  );
  protectedApi.route("/prompts", promptRoutes);
  protectedApi.route("/folders", folderRoutes);
  protectedApi.route("/skills", skillRoutes);
  protectedApi.route("/resource-libraries", resourceLibraryRoutes);
  protectedApi.route("/rules", rulesRoutes);
  protectedApi.route("/settings", settingsRoutes);
  protectedApi.route("/agents", agentRoutes);
  protectedApi.route("/ai", aiRoutes);
  protectedApi.route("/media", mediaRoutes);
  protectedApi.route("/sync", syncRoutes);
  protectedApi.route("/devices", devicesRoutes);
  protectedApi.route("/backups", backupRoutes);
  protectedApi.route("/", importExportRoutes);

  app.route("/api", protectedApi);

  app.get("/health", (c) =>
    c.json({
      status: "ok",
      version: process.env.APP_VERSION || rootPackage.version,
    }),
  );

  return app;
}
