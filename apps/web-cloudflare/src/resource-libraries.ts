import { HOSTED_RESOURCE_REQUEST_MAX_BYTES } from "@prompthub/shared/utils/hosted-resource-limits";
import type { Context } from "hono";
import {
  ManagedResourceError,
  managedResourceRevision,
  mutateManagedResourceLibrary,
  readManagedResourceLibrary,
} from "@prompthub/core/managed-resources/library";
import { managedResourceRequestSchema } from "@prompthub/shared/utils/managed-resource-schema";
import { loadSnapshot, saveSnapshot } from "./sync";
import { ErrorCode, failure, readJson, success } from "./response";
import type { AuthUser, Env } from "./types";
import {
  readHostedPlugin,
  exportHostedPluginFiles,
} from "@prompthub/core/managed-resources/plugin-packages";

type AppContext = Context<{ Bindings: Env; Variables: { authUser: AuthUser } }>;
export async function resourceLibrary(c: AppContext): Promise<Response> {
  const kind = c.req.param("kind");
  if (kind !== "mcp" && kind !== "plugins")
    return failure(c, 404, ErrorCode.NOT_FOUND, "Resource library not found");
  const userId = c.get("authUser").userId;
  const snapshot = await loadSnapshot(c.env.DB, userId);
  if (c.req.method === "GET") {
    const plugin = kind === "plugins" ? c.req.query("plugin") : undefined;
    if (
      plugin &&
      !snapshot.pluginLibrary?.plugins.some((item) => item.id === plugin)
    )
      return failure(c, 404, ErrorCode.NOT_FOUND, "Plugin not found");
    return success(c, {
      library: readManagedResourceLibrary(snapshot, kind),
      revision: managedResourceRevision(snapshot),
      ...(plugin ? { resource: readHostedPlugin(snapshot, plugin) } : {}),
      ...(kind === "plugins" && c.req.query("export") === "1"
        ? { files: exportHostedPluginFiles(snapshot) }
        : {}),
    });
  }
  const parsed = managedResourceRequestSchema.safeParse(
    await readJson(c, { maxBytes: HOSTED_RESOURCE_REQUEST_MAX_BYTES }),
  );
  if (!parsed.success)
    return failure(
      c,
      422,
      ErrorCode.VALIDATION_ERROR,
      "Invalid resource operation",
    );
  if (managedResourceRevision(snapshot) !== parsed.data.revision)
    return failure(
      c,
      409,
      ErrorCode.CONFLICT,
      "Resource library changed; reload before saving",
    );
  try {
    Object.assign(
      snapshot,
      mutateManagedResourceLibrary(snapshot, kind, parsed.data.mutation),
    );
    snapshot.exportedAt = new Date().toISOString();
    await saveSnapshot(c.env.DB, userId, snapshot);
    return success(c, {
      library: readManagedResourceLibrary(snapshot, kind),
      revision: managedResourceRevision(snapshot),
    });
  } catch (cause) {
    if (cause instanceof ManagedResourceError)
      return failure(c, cause.status, ErrorCode.BAD_REQUEST, cause.message);
    throw cause;
  }
}
