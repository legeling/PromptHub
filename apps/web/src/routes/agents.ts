import { Hono, type Context } from "hono";
import type {
  AgentConfigContext,
  AgentProviderProfileService,
  AgentUserConfigFileService,
} from "@prompthub/core";
import {
  AGENT_SERVICE_DOMAINS,
  type AgentInventoryItem,
  type AgentServiceDomain,
  type CreateAgentProviderProfileRequest,
  type UpdateAgentProviderProfileRequest,
} from "@prompthub/shared/types";
import { getAuthUser } from "../middleware/auth.js";
import { AgentInventoryService } from "../services/agent-inventory.service.js";
import { createDefaultAgentServicesService } from "../services/agent-services.dependencies.js";
import { createDefaultAgentConfigFilesService } from "../services/agent-services.dependencies.js";
import { createDefaultAgentProviderProfilesService } from "../services/agent-services.dependencies.js";
import { createDefaultWebAgentSessionsService } from "../services/agent-services.dependencies.js";
import type { AgentServicesService } from "../services/agent-services.service.js";
import type { WebAgentSessionsService } from "../services/agent-sessions.service.js";
import { SettingsService } from "../services/settings.service.js";
import { error, ErrorCode, success } from "../utils/response.js";

interface AgentInventoryRouteDependencies {
  configFilesService?: Pick<
    AgentUserConfigFileService,
    "list" | "read" | "write"
  >;
  inventoryService: Pick<AgentInventoryService, "list">;
  providerProfilesService?: Pick<
    AgentProviderProfileService,
    "list" | "create" | "update" | "archive" | "duplicate" | "export" | "delete"
  >;
  sessionsService?: Pick<WebAgentSessionsService, "list" | "read" | "state">;
  servicesService?: Pick<AgentServicesService, "get" | "getManifest">;
  settingsService: Pick<SettingsService, "get">;
}

type ResolvedAgentRouteDependencies = Required<
  Omit<
    AgentInventoryRouteDependencies,
    "configFilesService" | "providerProfilesService" | "sessionsService"
  >
>;

const defaultInventoryService = new AgentInventoryService();
let defaultSettingsService: SettingsService | undefined;
let defaultServicesService: AgentServicesService | undefined;
let defaultConfigFilesService: AgentUserConfigFileService | undefined;
let defaultProviderProfilesService: AgentProviderProfileService | undefined;
let defaultSessionsService: WebAgentSessionsService | undefined;

function getDefaultDependencies(): AgentInventoryRouteDependencies {
  defaultSettingsService ??= new SettingsService();
  defaultServicesService ??= createDefaultAgentServicesService();
  return {
    inventoryService: defaultInventoryService,
    servicesService: defaultServicesService,
    settingsService: defaultSettingsService,
  };
}

function getConfigFilesService(
  input: AgentInventoryRouteDependencies | undefined,
): Pick<AgentUserConfigFileService, "list" | "read" | "write"> {
  if (input?.configFilesService) return input.configFilesService;
  defaultConfigFilesService ??= createDefaultAgentConfigFilesService();
  return defaultConfigFilesService;
}

function getProviderProfilesService(
  input: AgentInventoryRouteDependencies | undefined,
): NonNullable<AgentInventoryRouteDependencies["providerProfilesService"]> {
  if (input?.providerProfilesService) return input.providerProfilesService;
  defaultProviderProfilesService ??=
    createDefaultAgentProviderProfilesService();
  return defaultProviderProfilesService;
}

function getSessionsService(
  input: AgentInventoryRouteDependencies | undefined,
): NonNullable<AgentInventoryRouteDependencies["sessionsService"]> {
  if (input?.sessionsService) return input.sessionsService;
  defaultSessionsService ??= createDefaultWebAgentSessionsService();
  return defaultSessionsService;
}

function getRouteDependencies(
  input: AgentInventoryRouteDependencies | undefined,
): ResolvedAgentRouteDependencies {
  if (
    input?.inventoryService &&
    input.servicesService &&
    input.settingsService
  ) {
    return {
      inventoryService: input.inventoryService,
      servicesService: input.servicesService,
      settingsService: input.settingsService,
    };
  }
  const defaults = getDefaultDependencies();
  return {
    inventoryService: input?.inventoryService ?? defaults.inventoryService,
    servicesService: input?.servicesService ?? defaults.servicesService!,
    settingsService: input?.settingsService ?? defaults.settingsService,
  };
}

function isServiceDomain(value: string): value is AgentServiceDomain {
  return AGENT_SERVICE_DOMAINS.some((domain) => domain === value);
}

async function resolveAgent(
  dependencies: Pick<
    AgentInventoryRouteDependencies,
    "inventoryService" | "settingsService"
  >,
  actor: ReturnType<typeof getAuthUser>,
  agentId: string,
): Promise<AgentInventoryItem | null> {
  const settings = dependencies.settingsService.get(actor.userId);
  const inventory = await dependencies.inventoryService.list(
    settings,
    actor.role === "admin",
  );
  return inventory.agents.find((agent) => agent.id === agentId) ?? null;
}

function registerInventoryRoute(
  agents: Hono,
  dependenciesInput?: AgentInventoryRouteDependencies,
): void {
  agents.get("/", async (c) => {
    try {
      const { inventoryService, settingsService } =
        dependenciesInput ?? getDefaultDependencies();
      const actor = getAuthUser(c);
      const settings = settingsService.get(actor.userId);
      const inventory = await inventoryService.list(
        settings,
        actor.role === "admin",
      );
      return success(c, inventory);
    } catch {
      return error(c, 500, ErrorCode.INTERNAL_ERROR, "Internal server error");
    }
  });
}

function registerServiceRoutes(
  agents: Hono,
  dependenciesInput?: AgentInventoryRouteDependencies,
): void {
  agents.get("/:agentId/services", async (c) => {
    try {
      const dependencies = getRouteDependencies(dependenciesInput);
      const actor = getAuthUser(c);
      const agent = await resolveAgent(
        dependencies,
        actor,
        c.req.param("agentId"),
      );
      if (!agent) return error(c, 404, ErrorCode.NOT_FOUND, "Agent not found");
      return success(
        c,
        await dependencies.servicesService.getManifest(actor, agent),
      );
    } catch {
      return error(c, 500, ErrorCode.INTERNAL_ERROR, "Internal server error");
    }
  });
  agents.get("/:agentId/services/:domain", async (c) => {
    try {
      const domain = c.req.param("domain");
      if (!isServiceDomain(domain)) {
        return error(c, 404, ErrorCode.NOT_FOUND, "Agent service not found");
      }
      const dependencies = getRouteDependencies(dependenciesInput);
      const actor = getAuthUser(c);
      const agent = await resolveAgent(
        dependencies,
        actor,
        c.req.param("agentId"),
      );
      if (!agent) return error(c, 404, ErrorCode.NOT_FOUND, "Agent not found");
      return success(
        c,
        await dependencies.servicesService.get(actor, agent, domain),
      );
    } catch {
      return error(c, 500, ErrorCode.INTERNAL_ERROR, "Internal server error");
    }
  });
}

function toConfigContext(agent: AgentInventoryItem): AgentConfigContext {
  return {
    agentId: agent.id,
    rootPath: agent.paths.root,
    relativePaths: agent.paths.configFileRelativePaths,
  };
}

function requireAdmin(c: Context): ReturnType<typeof getAuthUser> | Response {
  const actor = getAuthUser(c);
  return actor.role === "admin"
    ? actor
    : error(c, 403, ErrorCode.FORBIDDEN, "Admin access required");
}

async function parseObjectBody(c: Context) {
  const body = await c.req.json().catch(() => null);
  return body && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : null;
}

function configErrorResponse(c: Context, cause: unknown): Response {
  const code = cause instanceof Error ? cause.message : "";
  if (code === "AGENT_CONFIG_CONCURRENT_CHANGE") {
    return error(
      c,
      409,
      ErrorCode.CONFLICT,
      "Agent config changed on disk; reload before saving",
    );
  }
  if (code === "AGENT_CONFIG_BACKUP_ENCRYPTION_UNAVAILABLE") {
    return error(
      c,
      503,
      ErrorCode.SERVICE_UNAVAILABLE,
      "Configure AGENT_SECRET_KEY before editing Agent config files",
    );
  }
  if (code.startsWith("AGENT_CONFIG_")) {
    return error(c, 400, ErrorCode.BAD_REQUEST, "Invalid Agent config request");
  }
  return error(c, 500, ErrorCode.INTERNAL_ERROR, "Internal server error");
}

async function resolveAdminConfigContext(
  c: Context,
  dependenciesInput: AgentInventoryRouteDependencies | undefined,
): Promise<AgentConfigContext | Response> {
  const actor = requireAdmin(c);
  if (actor instanceof Response) return actor;
  const dependencies = dependenciesInput ?? getDefaultDependencies();
  const agent = await resolveAgent(
    dependencies,
    actor,
    c.req.param("agentId") ?? "",
  );
  return agent
    ? toConfigContext(agent)
    : error(c, 404, ErrorCode.NOT_FOUND, "Agent not found");
}

function isReadBody(
  body: Record<string, unknown> | null,
): body is { relativePath: string } {
  return !!body && typeof body.relativePath === "string";
}

function isWriteBody(body: Record<string, unknown> | null): body is {
  relativePath: string;
  content: string;
  expectedRevision?: string;
} {
  return (
    !!body &&
    typeof body.relativePath === "string" &&
    typeof body.content === "string" &&
    (body.expectedRevision === undefined ||
      typeof body.expectedRevision === "string")
  );
}

function registerConfigReadRoutes(
  agents: Hono,
  dependenciesInput?: AgentInventoryRouteDependencies,
): void {
  agents.get("/:agentId/config-files", async (c) => {
    try {
      const context = await resolveAdminConfigContext(c, dependenciesInput);
      if (context instanceof Response) return context;
      return success(
        c,
        await getConfigFilesService(dependenciesInput).list(context),
      );
    } catch (cause) {
      return configErrorResponse(c, cause);
    }
  });
  agents.post("/:agentId/config-files/read", async (c) => {
    try {
      const body = await parseObjectBody(c);
      if (!isReadBody(body)) {
        return error(
          c,
          400,
          ErrorCode.BAD_REQUEST,
          "Invalid Agent config request",
        );
      }
      const context = await resolveAdminConfigContext(c, dependenciesInput);
      if (context instanceof Response) return context;
      return success(
        c,
        await getConfigFilesService(dependenciesInput).read(
          context,
          body.relativePath,
        ),
      );
    } catch (cause) {
      return configErrorResponse(c, cause);
    }
  });
}

function registerConfigWriteRoute(
  agents: Hono,
  dependenciesInput?: AgentInventoryRouteDependencies,
): void {
  agents.put("/:agentId/config-files", async (c) => {
    try {
      const body = await parseObjectBody(c);
      if (!isWriteBody(body)) {
        return error(
          c,
          400,
          ErrorCode.BAD_REQUEST,
          "Invalid Agent config request",
        );
      }
      const context = await resolveAdminConfigContext(c, dependenciesInput);
      if (context instanceof Response) return context;
      return success(
        c,
        await getConfigFilesService(dependenciesInput).write(
          context,
          body.relativePath,
          body.content,
          body.expectedRevision,
        ),
      );
    } catch (cause) {
      return configErrorResponse(c, cause);
    }
  });
}

function providerErrorResponse(c: Context, cause: unknown): Response {
  const code = cause instanceof Error ? cause.message : "";
  if (code === "Provider profile changed externally") {
    return error(c, 409, ErrorCode.CONFLICT, code);
  }
  if (
    code === "AGENT_SECRET_STORE_UNAVAILABLE" ||
    code === "AGENT_CONFIG_BACKUP_ENCRYPTION_UNAVAILABLE"
  ) {
    return error(
      c,
      503,
      ErrorCode.SERVICE_UNAVAILABLE,
      "Configure AGENT_SECRET_KEY before storing Provider credentials",
    );
  }
  if (/^AGENT_PROVIDER_[A-Z0-9_]+$/u.test(code)) {
    return error(c, 400, ErrorCode.BAD_REQUEST, code);
  }
  return error(c, 500, ErrorCode.INTERNAL_ERROR, "Internal server error");
}

async function requireAdminAgent(
  c: Context,
  dependenciesInput: AgentInventoryRouteDependencies | undefined,
): Promise<AgentInventoryItem | Response> {
  const actor = requireAdmin(c);
  if (actor instanceof Response) return actor;
  const dependencies = dependenciesInput ?? getDefaultDependencies();
  const agent = await resolveAgent(
    dependencies,
    actor,
    c.req.param("agentId") ?? "",
  );
  return agent ?? error(c, 404, ErrorCode.NOT_FOUND, "Agent not found");
}

async function requireOwnedProviderProfile(
  c: Context,
  service: NonNullable<
    AgentInventoryRouteDependencies["providerProfilesService"]
  >,
  agentId: string,
): Promise<Response | null> {
  const profiles = await service.list({
    platformId: agentId,
    includeArchived: true,
  });
  return profiles.some((profile) => profile.id === c.req.param("profileId"))
    ? null
    : error(c, 404, ErrorCode.NOT_FOUND, "Provider profile not found");
}

async function runOwnedProviderAction<T>(
  c: Context,
  dependenciesInput: AgentInventoryRouteDependencies | undefined,
  action: (
    service: NonNullable<
      AgentInventoryRouteDependencies["providerProfilesService"]
    >,
  ) => Promise<T> | T,
): Promise<Response> {
  try {
    const agent = await requireAdminAgent(c, dependenciesInput);
    if (agent instanceof Response) return agent;
    const service = getProviderProfilesService(dependenciesInput);
    const missing = await requireOwnedProviderProfile(c, service, agent.id);
    if (missing) return missing;
    return success(c, await action(service));
  } catch (cause) {
    return providerErrorResponse(c, cause);
  }
}

function registerProviderCollectionRoutes(
  agents: Hono,
  dependenciesInput?: AgentInventoryRouteDependencies,
): void {
  agents.get("/:agentId/provider-profiles", async (c) => {
    try {
      const agent = await requireAdminAgent(c, dependenciesInput);
      if (agent instanceof Response) return agent;
      const service = getProviderProfilesService(dependenciesInput);
      return success(c, await service.list({ platformId: agent.id }));
    } catch (cause) {
      return providerErrorResponse(c, cause);
    }
  });
  agents.post("/:agentId/provider-profiles", async (c) => {
    try {
      const agent = await requireAdminAgent(c, dependenciesInput);
      if (agent instanceof Response) return agent;
      const body = await parseObjectBody(c);
      const profile = body?.profile;
      if (!isProviderCreateBody(profile, agent.id)) {
        return error(
          c,
          400,
          ErrorCode.BAD_REQUEST,
          "Invalid Provider profile request",
        );
      }
      const service = getProviderProfilesService(dependenciesInput);
      return success(
        c,
        await service.create(
          body as unknown as CreateAgentProviderProfileRequest,
        ),
      );
    } catch (cause) {
      return providerErrorResponse(c, cause);
    }
  });
}

function isProviderCreateBody(value: unknown, agentId: string): boolean {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>).platformId === agentId
  );
}

function invalidProviderRequest(c: Context): Response {
  return error(
    c,
    400,
    ErrorCode.BAD_REQUEST,
    "Invalid Provider profile request",
  );
}

function registerProviderMutationRoutes(
  agents: Hono,
  dependenciesInput?: AgentInventoryRouteDependencies,
): void {
  agents.put("/:agentId/provider-profiles/:profileId", async (c) => {
    const body = await parseObjectBody(c);
    if (!body || body.id !== c.req.param("profileId")) {
      return invalidProviderRequest(c);
    }
    return runOwnedProviderAction(c, dependenciesInput, (service) =>
      service.update(body as unknown as UpdateAgentProviderProfileRequest),
    );
  });
  agents.post("/:agentId/provider-profiles/:profileId/archive", async (c) => {
    const body = await parseObjectBody(c);
    if (!body || typeof body.expectedUpdatedAt !== "number") {
      return invalidProviderRequest(c);
    }
    return runOwnedProviderAction(c, dependenciesInput, (service) =>
      service.archive(
        c.req.param("profileId") ?? "",
        body.expectedUpdatedAt as number,
      ),
    );
  });
  agents.post("/:agentId/provider-profiles/:profileId/duplicate", async (c) => {
    const body = await parseObjectBody(c);
    if (!body || typeof body.name !== "string") {
      return invalidProviderRequest(c);
    }
    return runOwnedProviderAction(c, dependenciesInput, (service) =>
      service.duplicate(c.req.param("profileId") ?? "", body.name as string),
    );
  });
}

function registerProviderReadDeleteRoutes(
  agents: Hono,
  dependenciesInput?: AgentInventoryRouteDependencies,
): void {
  agents.get("/:agentId/provider-profiles/:profileId/export", (c) =>
    runOwnedProviderAction(c, dependenciesInput, (service) =>
      service.export(c.req.param("profileId") ?? ""),
    ),
  );
  agents.delete("/:agentId/provider-profiles/:profileId", (c) =>
    runOwnedProviderAction(c, dependenciesInput, async (service) => {
      await service.delete(c.req.param("profileId") ?? "");
      return true;
    }),
  );
}

function sessionErrorResponse(c: Context, cause: unknown): Response {
  const code = cause instanceof Error ? cause.message : "";
  if (code === "AGENT_SESSION_NOT_FOUND") {
    return error(c, 404, ErrorCode.NOT_FOUND, "Agent session not found");
  }
  if (code.startsWith("AGENT_SESSION_")) {
    return error(
      c,
      400,
      ErrorCode.BAD_REQUEST,
      "Invalid Agent session request",
    );
  }
  return error(c, 500, ErrorCode.INTERNAL_ERROR, "Internal server error");
}

function parsePageValue(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  return Number(value);
}

function registerSessionRoutes(
  agents: Hono,
  dependenciesInput?: AgentInventoryRouteDependencies,
): void {
  agents.get("/:agentId/sessions", async (c) => {
    try {
      const agent = await requireAdminAgent(c, dependenciesInput);
      if (agent instanceof Response) return agent;
      const limit = parsePageValue(c.req.query("limit"), 50);
      const offset = parsePageValue(c.req.query("offset"), 0);
      return success(
        c,
        getSessionsService(dependenciesInput).list(
          agent.id,
          limit,
          offset,
          c.req.query("search") || undefined,
        ),
      );
    } catch (cause) {
      return sessionErrorResponse(c, cause);
    }
  });
  agents.get("/:agentId/sessions/state", async (c) => {
    try {
      const agent = await requireAdminAgent(c, dependenciesInput);
      if (agent instanceof Response) return agent;
      return success(c, getSessionsService(dependenciesInput).state(agent.id));
    } catch (cause) {
      return sessionErrorResponse(c, cause);
    }
  });
  agents.get("/:agentId/sessions/:sessionId", async (c) => {
    try {
      const agent = await requireAdminAgent(c, dependenciesInput);
      if (agent instanceof Response) return agent;
      return success(
        c,
        getSessionsService(dependenciesInput).read(
          agent.id,
          c.req.param("sessionId") ?? "",
        ),
      );
    } catch (cause) {
      return sessionErrorResponse(c, cause);
    }
  });
}

export function createAgentRoutes(
  dependenciesInput?: AgentInventoryRouteDependencies,
): Hono {
  const agents = new Hono();
  registerInventoryRoute(agents, dependenciesInput);
  registerServiceRoutes(agents, dependenciesInput);
  registerConfigReadRoutes(agents, dependenciesInput);
  registerConfigWriteRoute(agents, dependenciesInput);
  registerProviderCollectionRoutes(agents, dependenciesInput);
  registerProviderMutationRoutes(agents, dependenciesInput);
  registerProviderReadDeleteRoutes(agents, dependenciesInput);
  registerSessionRoutes(agents, dependenciesInput);
  return agents;
}

export default createAgentRoutes();
