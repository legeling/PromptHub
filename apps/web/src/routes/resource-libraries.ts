import { Hono } from "hono";
import { managedResourceRequestSchema } from "@prompthub/shared/utils/managed-resource-schema";
import {
  ManagedResourceError,
  managedResourceRevision,
  mutateManagedResourceLibrary,
  readManagedResourceLibrary,
} from "@prompthub/core/managed-resources/library";
import { getAuthUser } from "../middleware/auth.js";
import {
  readAgentAssetsSnapshot,
  writeAgentAssetsSnapshot,
} from "../services/agent-assets-sync.js";
import { parseJsonBody } from "../utils/validation.js";
import { error, ErrorCode, success } from "../utils/response.js";
import {
  readHostedPlugin,
  exportHostedPluginFiles,
} from "@prompthub/core/managed-resources/plugin-packages";

const routes = new Hono();
routes.get("/:kind", (c) => {
  const kind = c.req.param("kind");
  if (kind !== "mcp" && kind !== "plugins")
    return error(c, 404, ErrorCode.NOT_FOUND, "Resource library not found");
  const snapshot = readAgentAssetsSnapshot(getAuthUser(c).userId);
  const plugin = kind === "plugins" ? c.req.query("plugin") : undefined;
  if (
    plugin &&
    !snapshot.pluginLibrary?.plugins.some((item) => item.id === plugin)
  )
    return error(c, 404, ErrorCode.NOT_FOUND, "Plugin not found");
  return success(c, {
    library: readManagedResourceLibrary(snapshot, kind),
    revision: managedResourceRevision(snapshot),
    ...(plugin ? { resource: readHostedPlugin(snapshot, plugin) } : {}),
    ...(kind === "plugins" && c.req.query("export") === "1"
      ? { files: exportHostedPluginFiles(snapshot) }
      : {}),
  });
});
routes.post("/:kind", async (c) => {
  const kind = c.req.param("kind");
  if (kind !== "mcp" && kind !== "plugins")
    return error(c, 404, ErrorCode.NOT_FOUND, "Resource library not found");
  const parsed = await parseJsonBody(c, managedResourceRequestSchema);
  if (!parsed.success) return parsed.response;
  const userId = getAuthUser(c).userId;
  const snapshot = readAgentAssetsSnapshot(userId);
  if (managedResourceRevision(snapshot) !== parsed.data.revision)
    return error(
      c,
      409,
      ErrorCode.CONFLICT,
      "Resource library changed; reload before saving",
    );
  try {
    const next = mutateManagedResourceLibrary(
      snapshot,
      kind,
      parsed.data.mutation,
    );
    writeAgentAssetsSnapshot(userId, next);
    return success(c, {
      library: readManagedResourceLibrary(next, kind),
      revision: managedResourceRevision(next),
    });
  } catch (cause) {
    if (cause instanceof ManagedResourceError)
      return error(c, cause.status, ErrorCode.BAD_REQUEST, cause.message);
    throw cause;
  }
});
export default routes;
