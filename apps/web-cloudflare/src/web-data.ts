import type { Context } from "hono";
import type { CreateFolderDTO, Folder, Settings, UpdateFolderDTO } from "@prompthub/shared/types";
import type { CreatePromptDTO, Prompt, PromptVersion, SearchQuery, UpdatePromptDTO } from "@prompthub/shared/types/prompt";
import type { SyncSnapshot } from "@prompthub/shared/types/sync";
import { ErrorCode, failure, paginated, readJson, success } from "./response";
import { loadSnapshot, saveSnapshot } from "./sync";
import type { AuthUser, Env } from "./types";

type AppContext = Context<{ Bindings: Env; Variables: { authUser: AuthUser } }>;
type ResourceMeta = {
  ownerUserId?: string | null;
  visibility?: "private" | "shared";
};
type PromptDiffResult = {
  from: PromptVersion;
  to: PromptVersion;
  fields: Array<{
    field: "systemPrompt" | "systemPromptEn" | "userPrompt" | "userPromptEn" | "variables" | "aiResponse";
    from: string;
    to: string;
  }>;
};

function getUser(c: AppContext): AuthUser {
  return c.get("authUser");
}

async function getUserSnapshot(c: AppContext) {
  return loadSnapshot(c.env.DB, getUser(c).userId);
}

function notFound(c: AppContext, label: string): Response {
  return failure(c, 404, ErrorCode.NOT_FOUND, `${label} not found`);
}

function nowIso(): string {
  return new Date().toISOString();
}

function resourceVisibility(resource: ResourceMeta): "private" | "shared" {
  return resource.visibility === "shared" ? "shared" : "private";
}

function isOwnedByActor(resource: ResourceMeta, user: AuthUser): boolean {
  return !resource.ownerUserId || resource.ownerUserId === user.userId;
}

function canReadResource(resource: ResourceMeta, user: AuthUser): boolean {
  return resourceVisibility(resource) === "shared" || isOwnedByActor(resource, user);
}

function canWriteResource(resource: ResourceMeta, user: AuthUser): boolean {
  if (resourceVisibility(resource) === "shared") {
    return user.role === "admin";
  }
  return isOwnedByActor(resource, user);
}

function assertCanCreateVisibility(c: AppContext, visibility: "private" | "shared"): Response | null {
  if (visibility === "shared" && getUser(c).role !== "admin") {
    return failure(c, 403, ErrorCode.FORBIDDEN, "Only admin can create shared resources");
  }
  return null;
}

function assertCanWriteResource(c: AppContext, resource: ResourceMeta, label: string): Response | null {
  if (!canReadResource(resource, getUser(c))) {
    return notFound(c, label);
  }
  if (!canWriteResource(resource, getUser(c))) {
    return failure(c, 403, ErrorCode.FORBIDDEN, `Only admin can modify shared ${label.toLowerCase()}s`);
  }
  return null;
}

function setSnapshotVersions(snapshot: SyncSnapshot, versions: PromptVersion[]): void {
  snapshot.promptVersions = versions;
  snapshot.versions = versions;
}

function getSnapshotVersions(snapshot: SyncSnapshot): PromptVersion[] {
  return snapshot.promptVersions || snapshot.versions || [];
}

function makePromptVersion(prompt: Prompt, version: number, note?: string | null): PromptVersion {
  return {
    id: crypto.randomUUID(),
    promptId: prompt.id,
    version,
    systemPrompt: prompt.systemPrompt,
    systemPromptEn: prompt.systemPromptEn,
    userPrompt: prompt.userPrompt,
    userPromptEn: prompt.userPromptEn,
    variables: prompt.variables || [],
    note: note ?? null,
    aiResponse: prompt.lastAiResponse ?? null,
    createdAt: nowIso(),
  };
}

function appendPromptVersion(snapshot: SyncSnapshot, prompt: Prompt, note?: string | null): PromptVersion {
  const versionNumber = (prompt.currentVersion || prompt.version || 0) + 1;
  const version = makePromptVersion(prompt, versionNumber, note);
  setSnapshotVersions(snapshot, [...getSnapshotVersions(snapshot), version]);
  prompt.currentVersion = versionNumber;
  prompt.version = versionNumber;
  return version;
}

function promptHasContentPatch(patch: UpdatePromptDTO): boolean {
  return (
    patch.systemPrompt !== undefined ||
    patch.systemPromptEn !== undefined ||
    patch.userPrompt !== undefined ||
    patch.userPromptEn !== undefined ||
    patch.variables !== undefined
  );
}

function stringDiffValue(value: string | null | undefined): string {
  return value ?? "";
}

function pushPromptDiff(
  fields: PromptDiffResult["fields"],
  field: PromptDiffResult["fields"][number]["field"],
  from: string | null | undefined,
  to: string | null | undefined,
): void {
  const fromValue = stringDiffValue(from);
  const toValue = stringDiffValue(to);
  if (fromValue !== toValue) {
    fields.push({ field, from: fromValue, to: toValue });
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parsePromptQuery(c: AppContext): SearchQuery & { limit?: number; offset?: number } {
  const tags = c.req.query("tags");
  const isFavorite = c.req.query("isFavorite");
  const limit = Number(c.req.query("limit"));
  const offset = Number(c.req.query("offset"));
  return {
    scope: (c.req.query("scope") as SearchQuery["scope"] | undefined) || "private",
    keyword: c.req.query("keyword") || undefined,
    tags: tags ? tags.split(",").map((tag) => tag.trim()).filter(Boolean) : undefined,
    folderId: c.req.query("folderId") || undefined,
    isFavorite: isFavorite === undefined ? undefined : isFavorite === "true",
    sortBy: c.req.query("sortBy") as SearchQuery["sortBy"] | undefined,
    sortOrder: c.req.query("sortOrder") as SearchQuery["sortOrder"] | undefined,
    limit: Number.isFinite(limit) && limit > 0 ? Math.min(limit, 200) : undefined,
    offset: Number.isFinite(offset) && offset >= 0 ? offset : undefined,
  };
}

function filterPrompts(prompts: Prompt[], query: SearchQuery & { limit?: number; offset?: number }): Prompt[] {
  const keyword = query.keyword?.trim().toLowerCase();
  let result = prompts.filter((prompt) => {
    if (query.scope === "private" && prompt.visibility === "shared") return false;
    if (query.scope === "shared" && prompt.visibility !== "shared") return false;
    if (query.folderId && prompt.folderId !== query.folderId) return false;
    if (query.isFavorite !== undefined && prompt.isFavorite !== query.isFavorite) return false;
    if (query.tags?.length && !query.tags.every((tag) => (prompt.tags || []).includes(tag))) return false;
    if (keyword) {
      const haystack = [
        prompt.title,
        prompt.description,
        prompt.systemPrompt,
        prompt.userPrompt,
        prompt.source,
        prompt.notes,
        ...(prompt.tags || []),
      ].filter(Boolean).join("\n").toLowerCase();
      if (!haystack.includes(keyword)) return false;
    }
    return true;
  });

  const sortBy = query.sortBy || "updatedAt";
  const direction = query.sortOrder === "asc" ? 1 : -1;
  result = result.sort((left, right) => {
    if (sortBy === "title") {
      return left.title.localeCompare(right.title) * direction;
    }
    if (sortBy === "usageCount") {
      return ((left.usageCount || 0) - (right.usageCount || 0)) * direction;
    }
    const leftTime = new Date(sortBy === "createdAt" ? left.createdAt : left.updatedAt).getTime();
    const rightTime = new Date(sortBy === "createdAt" ? right.createdAt : right.updatedAt).getTime();
    return (leftTime - rightTime) * direction;
  });

  const start = query.offset ?? 0;
  const end = query.limit ? start + query.limit : undefined;
  return result.slice(start, end);
}

export async function listPrompts(c: AppContext): Promise<Response> {
  const snapshot = await getUserSnapshot(c);
  const query = parsePromptQuery(c);
  const data = filterPrompts(snapshot.prompts, query);
  return paginated(c, data, {
    total: data.length,
    limit: query.limit ?? data.length,
    offset: query.offset ?? 0,
  });
}

export async function getPrompt(c: AppContext): Promise<Response> {
  const snapshot = await getUserSnapshot(c);
  const prompt = snapshot.prompts.find((item) => item.id === c.req.param("id"));
  return prompt && canReadResource(prompt, getUser(c)) ? success(c, prompt) : notFound(c, "Prompt");
}

export async function createPrompt(c: AppContext): Promise<Response> {
  const user = getUser(c);
  const body = await readJson<CreatePromptDTO>(c);
  if (typeof body.title !== "string" || !body.title.trim() || typeof body.userPrompt !== "string") {
    return failure(c, 400, ErrorCode.BAD_REQUEST, "title and userPrompt are required");
  }
  const visibility = body.visibility || "private";
  const visibilityError = assertCanCreateVisibility(c, visibility);
  if (visibilityError) return visibilityError;

  const snapshot = await loadSnapshot(c.env.DB, user.userId);
  const timestamp = nowIso();
  const prompt: Prompt = {
    id: crypto.randomUUID(),
    ownerUserId: user.userId,
    visibility,
    title: body.title.trim(),
    description: body.description ?? null,
    promptType: body.promptType || "text",
    systemPrompt: body.systemPrompt ?? null,
    systemPromptEn: body.systemPromptEn ?? null,
    userPrompt: body.userPrompt,
    userPromptEn: body.userPromptEn ?? null,
    variables: body.variables || [],
    tags: body.tags || [],
    folderId: body.folderId ?? null,
    images: body.images || [],
    videos: body.videos || [],
    isFavorite: false,
    isPinned: false,
    version: 1,
    currentVersion: 1,
    usageCount: 0,
    source: body.source ?? null,
    notes: body.notes ?? null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  snapshot.prompts = [prompt, ...snapshot.prompts];
  setSnapshotVersions(snapshot, [...getSnapshotVersions(snapshot), makePromptVersion(prompt, 1, "Initial version")]);
  snapshot.exportedAt = timestamp;
  await saveSnapshot(c.env.DB, user.userId, snapshot);
  return success(c, prompt, 201);
}

export async function insertPromptDirect(c: AppContext): Promise<Response> {
  const user = getUser(c);
  const body = await readJson<Prompt>(c);
  if (
    typeof body.id !== "string" ||
    !body.id.trim() ||
    typeof body.title !== "string" ||
    !body.title.trim() ||
    typeof body.userPrompt !== "string"
  ) {
    return failure(c, 400, ErrorCode.BAD_REQUEST, "id, title, and userPrompt are required");
  }

  const visibility = resourceVisibility(body);
  const visibilityError = assertCanCreateVisibility(c, visibility);
  if (visibilityError) return visibilityError;

  const snapshot = await loadSnapshot(c.env.DB, user.userId);
  const prompt: Prompt = {
    ...body,
    ownerUserId: user.userId,
    visibility,
    description: body.description ?? null,
    promptType: body.promptType || "text",
    systemPrompt: body.systemPrompt ?? null,
    systemPromptEn: body.systemPromptEn ?? null,
    userPromptEn: body.userPromptEn ?? null,
    variables: body.variables || [],
    tags: body.tags || [],
    folderId: body.folderId ?? null,
    images: body.images || [],
    videos: body.videos || [],
    isFavorite: body.isFavorite === true,
    isPinned: body.isPinned === true,
    version: body.version || body.currentVersion || 1,
    currentVersion: body.currentVersion || body.version || 1,
    usageCount: body.usageCount || 0,
    source: body.source ?? null,
    notes: body.notes ?? null,
    lastAiResponse: body.lastAiResponse ?? null,
    createdAt: body.createdAt || nowIso(),
    updatedAt: body.updatedAt || nowIso(),
  };

  snapshot.prompts = [
    prompt,
    ...snapshot.prompts.filter((item) => item.id !== prompt.id),
  ];
  snapshot.exportedAt = prompt.updatedAt;
  await saveSnapshot(c.env.DB, user.userId, snapshot);
  return success(c, prompt, 201);
}

export async function updatePrompt(c: AppContext): Promise<Response> {
  const user = getUser(c);
  const promptId = c.req.param("id");
  const patch = await readJson<UpdatePromptDTO>(c);
  const snapshot = await loadSnapshot(c.env.DB, user.userId);
  const index = snapshot.prompts.findIndex((item) => item.id === promptId);
  if (index < 0) {
    return notFound(c, "Prompt");
  }

  const current = snapshot.prompts[index];
  const writeError = assertCanWriteResource(c, current, "Prompt");
  if (writeError) return writeError;
  if (patch.visibility !== undefined && patch.visibility !== current.visibility && getUser(c).role !== "admin") {
    return failure(c, 403, ErrorCode.FORBIDDEN, "Only admin can change shared visibility");
  }
  const updated: Prompt = {
    ...current,
    ...patch,
    description: patch.description === undefined ? current.description : patch.description,
    systemPrompt: patch.systemPrompt === undefined ? current.systemPrompt : patch.systemPrompt,
    systemPromptEn: patch.systemPromptEn === undefined ? current.systemPromptEn : patch.systemPromptEn,
    userPromptEn: patch.userPromptEn === undefined ? current.userPromptEn : patch.userPromptEn,
    source: patch.source === undefined ? current.source : patch.source,
    notes: patch.notes === undefined ? current.notes : patch.notes,
    lastAiResponse: patch.lastAiResponse === undefined ? current.lastAiResponse : patch.lastAiResponse,
    folderId: patch.folderId === undefined ? current.folderId : patch.folderId,
    variables: patch.variables === undefined ? current.variables : patch.variables,
    tags: patch.tags === undefined ? current.tags : patch.tags,
    images: patch.images === undefined ? current.images : patch.images,
    videos: patch.videos === undefined ? current.videos : patch.videos,
    updatedAt: nowIso(),
  };
  if (promptHasContentPatch(patch)) {
    appendPromptVersion(snapshot, updated);
  }
  snapshot.prompts[index] = updated;
  snapshot.exportedAt = updated.updatedAt;
  await saveSnapshot(c.env.DB, user.userId, snapshot);
  return success(c, updated);
}

export async function deletePrompt(c: AppContext): Promise<Response> {
  const user = getUser(c);
  const promptId = c.req.param("id");
  const snapshot = await loadSnapshot(c.env.DB, user.userId);
  const current = snapshot.prompts.find((item) => item.id === promptId);
  if (!current) {
    return notFound(c, "Prompt");
  }
  const writeError = assertCanWriteResource(c, current, "Prompt");
  if (writeError) return writeError;
  snapshot.prompts = snapshot.prompts.filter((item) => item.id !== promptId);
  setSnapshotVersions(snapshot, getSnapshotVersions(snapshot).filter((item) => item.promptId !== promptId));
  snapshot.exportedAt = nowIso();
  await saveSnapshot(c.env.DB, user.userId, snapshot);
  return success(c, { ok: true });
}

export async function copyPrompt(c: AppContext): Promise<Response> {
  const user = getUser(c);
  const promptId = c.req.param("id");
  const snapshot = await loadSnapshot(c.env.DB, user.userId);
  const source = snapshot.prompts.find((item) => item.id === promptId);
  if (!source) {
    return notFound(c, "Prompt");
  }
  if (!canReadResource(source, user)) {
    return notFound(c, "Prompt");
  }

  const timestamp = nowIso();
  const copy: Prompt = {
    ...source,
    id: crypto.randomUUID(),
    ownerUserId: user.userId,
    visibility: "private",
    title: `${source.title} (Copy)`,
    isFavorite: false,
    isPinned: false,
    usageCount: 0,
    version: 1,
    currentVersion: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  snapshot.prompts = [copy, ...snapshot.prompts];
  setSnapshotVersions(snapshot, [...getSnapshotVersions(snapshot), makePromptVersion(copy, 1, "Initial version")]);
  snapshot.exportedAt = timestamp;
  await saveSnapshot(c.env.DB, user.userId, snapshot);
  return success(c, copy, 201);
}

export async function renderPromptCopy(c: AppContext): Promise<Response> {
  const user = getUser(c);
  const promptId = c.req.param("id");
  const body = await readJson<{ variables?: Record<string, string> }>(c);
  const snapshot = await loadSnapshot(c.env.DB, user.userId);
  const promptIndex = snapshot.prompts.findIndex((item) => item.id === promptId);
  const prompt = snapshot.prompts[promptIndex];
  if (!prompt || !canReadResource(prompt, user)) {
    return notFound(c, "Prompt");
  }

  let content = prompt.userPrompt;
  for (const [key, value] of Object.entries(body.variables || {})) {
    content = content.replace(new RegExp(`\\{\\{${escapeRegExp(key)}\\}\\}`, "g"), value);
  }

  snapshot.prompts[promptIndex] = {
    ...prompt,
    usageCount: (prompt.usageCount || 0) + 1,
  };
  snapshot.exportedAt = nowIso();
  await saveSnapshot(c.env.DB, user.userId, snapshot);
  return success(c, content);
}

export async function listPromptVersions(c: AppContext): Promise<Response> {
  const snapshot = await getUserSnapshot(c);
  const promptId = c.req.param("id");
  const prompt = snapshot.prompts.find((item) => item.id === promptId);
  if (!prompt || !canReadResource(prompt, getUser(c))) {
    return notFound(c, "Prompt");
  }
  const versions = getSnapshotVersions(snapshot)
    .filter((item) => item.promptId === promptId)
    .sort((left, right) => right.version - left.version);
  return success(c, versions);
}

export async function diffPromptVersions(c: AppContext): Promise<Response> {
  const snapshot = await getUserSnapshot(c);
  const promptId = c.req.param("id");
  const fromVersion = Number(c.req.query("from"));
  const toVersion = Number(c.req.query("to"));
  if (!Number.isInteger(fromVersion) || fromVersion <= 0 || !Number.isInteger(toVersion) || toVersion <= 0) {
    return failure(c, 422, ErrorCode.VALIDATION_ERROR, "from and to must be positive integers");
  }

  const prompt = snapshot.prompts.find((item) => item.id === promptId);
  if (!prompt || !canReadResource(prompt, getUser(c))) {
    return notFound(c, "Prompt");
  }

  const versions = getSnapshotVersions(snapshot).filter((item) => item.promptId === promptId);
  const from = versions.find((item) => item.version === fromVersion);
  const to = versions.find((item) => item.version === toVersion);
  if (!from || !to) {
    return notFound(c, "Prompt version");
  }

  const fields: PromptDiffResult["fields"] = [];
  pushPromptDiff(fields, "systemPrompt", from.systemPrompt, to.systemPrompt);
  pushPromptDiff(fields, "systemPromptEn", from.systemPromptEn, to.systemPromptEn);
  pushPromptDiff(fields, "userPrompt", from.userPrompt, to.userPrompt);
  pushPromptDiff(fields, "userPromptEn", from.userPromptEn, to.userPromptEn);
  pushPromptDiff(fields, "variables", JSON.stringify(from.variables || []), JSON.stringify(to.variables || []));
  pushPromptDiff(fields, "aiResponse", from.aiResponse, to.aiResponse);

  return success(c, { from, to, fields });
}

export async function createPromptVersion(c: AppContext): Promise<Response> {
  const user = getUser(c);
  const promptId = c.req.param("id");
  const body = await readJson<{ note?: string }>(c);
  const snapshot = await loadSnapshot(c.env.DB, user.userId);
  const promptIndex = snapshot.prompts.findIndex((item) => item.id === promptId);
  const prompt = snapshot.prompts[promptIndex];
  if (!prompt) {
    return notFound(c, "Prompt");
  }
  const writeError = assertCanWriteResource(c, prompt, "Prompt");
  if (writeError) return writeError;

  const version = appendPromptVersion(snapshot, prompt, body.note);
  snapshot.prompts[promptIndex] = { ...prompt };
  snapshot.exportedAt = version.createdAt;
  await saveSnapshot(c.env.DB, user.userId, snapshot);
  return success(c, version, 201);
}

export async function insertPromptVersionDirect(c: AppContext): Promise<Response> {
  const user = getUser(c);
  const body = await readJson<PromptVersion>(c);
  if (
    typeof body.id !== "string" ||
    !body.id.trim() ||
    typeof body.promptId !== "string" ||
    !body.promptId.trim() ||
    typeof body.userPrompt !== "string" ||
    !Number.isFinite(body.version)
  ) {
    return failure(c, 400, ErrorCode.BAD_REQUEST, "id, promptId, version, and userPrompt are required");
  }

  const snapshot = await loadSnapshot(c.env.DB, user.userId);
  const prompt = snapshot.prompts.find((item) => item.id === body.promptId);
  if (!prompt) {
    return notFound(c, "Prompt");
  }
  const writeError = assertCanWriteResource(c, prompt, "Prompt");
  if (writeError) return writeError;

  const version: PromptVersion = {
    ...body,
    variables: body.variables || [],
    systemPrompt: body.systemPrompt ?? null,
    systemPromptEn: body.systemPromptEn ?? null,
    userPromptEn: body.userPromptEn ?? null,
    note: body.note ?? null,
    aiResponse: body.aiResponse ?? null,
    createdAt: body.createdAt || nowIso(),
  };
  setSnapshotVersions(snapshot, [
    ...getSnapshotVersions(snapshot).filter((item) => item.id !== version.id),
    version,
  ]);
  snapshot.exportedAt = version.createdAt;
  await saveSnapshot(c.env.DB, user.userId, snapshot);
  return success(c, version, 201);
}

export async function rollbackPromptVersion(c: AppContext): Promise<Response> {
  const user = getUser(c);
  const promptId = c.req.param("id");
  const versionNumber = Number(c.req.param("version"));
  if (!Number.isInteger(versionNumber) || versionNumber <= 0) {
    return failure(c, 422, ErrorCode.VALIDATION_ERROR, "version must be a positive integer");
  }

  const snapshot = await loadSnapshot(c.env.DB, user.userId);
  const promptIndex = snapshot.prompts.findIndex((item) => item.id === promptId);
  if (promptIndex < 0) {
    return notFound(c, "Prompt");
  }
  const current = snapshot.prompts[promptIndex];
  const writeError = assertCanWriteResource(c, current, "Prompt");
  if (writeError) return writeError;

  const version = getSnapshotVersions(snapshot).find(
    (item) => item.promptId === promptId && item.version === versionNumber,
  );
  if (!version) {
    return notFound(c, "Prompt version");
  }

  const updated: Prompt = {
    ...current,
    systemPrompt: version.systemPrompt,
    systemPromptEn: version.systemPromptEn,
    userPrompt: version.userPrompt,
    userPromptEn: version.userPromptEn,
    variables: version.variables,
    lastAiResponse: version.aiResponse,
    updatedAt: nowIso(),
  };
  appendPromptVersion(snapshot, updated);
  snapshot.prompts[promptIndex] = updated;
  snapshot.exportedAt = updated.updatedAt;
  await saveSnapshot(c.env.DB, user.userId, snapshot);
  return success(c, updated);
}

export async function deletePromptVersion(c: AppContext): Promise<Response> {
  const user = getUser(c);
  const promptId = c.req.param("id");
  const versionId = c.req.param("versionId");
  const snapshot = await loadSnapshot(c.env.DB, user.userId);
  const prompt = snapshot.prompts.find((item) => item.id === promptId);
  if (!prompt) {
    return notFound(c, "Prompt");
  }
  const writeError = assertCanWriteResource(c, prompt, "Prompt");
  if (writeError) return writeError;
  const versions = getSnapshotVersions(snapshot);
  const before = versions.length;
  setSnapshotVersions(snapshot, versions.filter((item) => !(item.promptId === promptId && item.id === versionId)));
  if (getSnapshotVersions(snapshot).length === before) {
    return notFound(c, "Prompt version");
  }
  snapshot.exportedAt = nowIso();
  await saveSnapshot(c.env.DB, user.userId, snapshot);
  return success(c, { ok: true });
}

export async function deletePromptVersionById(c: AppContext): Promise<Response> {
  const user = getUser(c);
  const versionId = c.req.param("versionId");
  const snapshot = await loadSnapshot(c.env.DB, user.userId);
  const version = getSnapshotVersions(snapshot).find((item) => item.id === versionId);
  if (!version) {
    return notFound(c, "Prompt version");
  }
  const prompt = snapshot.prompts.find((item) => item.id === version.promptId);
  if (!prompt) {
    return notFound(c, "Prompt");
  }
  const writeError = assertCanWriteResource(c, prompt, "Prompt");
  if (writeError) return writeError;
  setSnapshotVersions(snapshot, getSnapshotVersions(snapshot).filter((item) => item.id !== versionId));
  snapshot.exportedAt = nowIso();
  await saveSnapshot(c.env.DB, user.userId, snapshot);
  return success(c, { ok: true });
}

export async function syncPromptWorkspace(c: AppContext): Promise<Response> {
  getUser(c);
  return success(c, { ok: true });
}

export async function listPromptTags(c: AppContext): Promise<Response> {
  const snapshot = await getUserSnapshot(c);
  const tags = new Set<string>();
  for (const prompt of snapshot.prompts) {
    for (const tag of prompt.tags || []) {
      if (tag) {
        tags.add(tag);
      }
    }
  }
  return success(c, Array.from(tags).sort((a, b) => a.localeCompare(b)));
}

export async function renamePromptTag(c: AppContext): Promise<Response> {
  const user = getUser(c);
  const body = await readJson<{ oldTag?: string; newTag?: string }>(c);
  const oldTag = body.oldTag?.trim();
  const newTag = body.newTag?.trim();
  if (!oldTag || !newTag) {
    return failure(c, 400, ErrorCode.BAD_REQUEST, "oldTag and newTag are required");
  }

  const snapshot = await loadSnapshot(c.env.DB, user.userId);
  snapshot.prompts = snapshot.prompts.map((prompt) => ({
    ...prompt,
    tags: (prompt.tags || []).map((tag) => tag === oldTag ? newTag : tag),
    updatedAt: (prompt.tags || []).includes(oldTag) ? nowIso() : prompt.updatedAt,
  }));
  snapshot.exportedAt = nowIso();
  await saveSnapshot(c.env.DB, user.userId, snapshot);
  return success(c, { ok: true });
}

export async function deletePromptTag(c: AppContext): Promise<Response> {
  const user = getUser(c);
  const body = await readJson<{ tag?: string }>(c);
  const target = body.tag?.trim();
  if (!target) {
    return failure(c, 400, ErrorCode.BAD_REQUEST, "tag is required");
  }

  const snapshot = await loadSnapshot(c.env.DB, user.userId);
  snapshot.prompts = snapshot.prompts.map((prompt) => ({
    ...prompt,
    tags: (prompt.tags || []).filter((tag) => tag !== target),
    updatedAt: (prompt.tags || []).includes(target) ? nowIso() : prompt.updatedAt,
  }));
  snapshot.exportedAt = nowIso();
  await saveSnapshot(c.env.DB, user.userId, snapshot);
  return success(c, { ok: true });
}

function visibleFolders(folders: Folder[], user: AuthUser, scope: "private" | "shared" | "all"): Folder[] {
  return folders
    .filter((folder) => {
      const visibility = resourceVisibility(folder);
      if (scope === "private") return visibility === "private" && isOwnedByActor(folder, user);
      if (scope === "shared") return visibility === "shared";
      return visibility === "shared" || isOwnedByActor(folder, user);
    })
    .sort((left, right) => (left.order || 0) - (right.order || 0));
}

function collectFolderDescendants(folders: Folder[], folderId: string): Set<string> {
  const ids = new Set<string>();
  const walk = (parentId: string) => {
    for (const folder of folders) {
      if (folder.parentId === parentId && !ids.has(folder.id)) {
        ids.add(folder.id);
        walk(folder.id);
      }
    }
  };
  walk(folderId);
  return ids;
}

function assertParentFolderAllowed(c: AppContext, folders: Folder[], parentId: string | undefined, visibility: "private" | "shared"): Response | null {
  if (!parentId) return null;
  const parent = folders.find((folder) => folder.id === parentId);
  if (!parent || !canReadResource(parent, getUser(c))) {
    return notFound(c, "Parent folder");
  }
  if (resourceVisibility(parent) !== visibility) {
    return failure(c, 422, ErrorCode.VALIDATION_ERROR, "Parent folder visibility must match child visibility");
  }
  if (visibility === "private" && !isOwnedByActor(parent, getUser(c))) {
    return failure(c, 422, ErrorCode.VALIDATION_ERROR, "Private folders must stay under the same owner");
  }
  return null;
}

export async function listFolders(c: AppContext): Promise<Response> {
  const snapshot = await getUserSnapshot(c);
  const scope = (c.req.query("scope") as "private" | "shared" | "all" | undefined) || "private";
  if (!["private", "shared", "all"].includes(scope)) {
    return failure(c, 422, ErrorCode.VALIDATION_ERROR, "scope must be private, shared, or all");
  }
  return success(c, visibleFolders(snapshot.folders, getUser(c), scope));
}

export async function createFolder(c: AppContext): Promise<Response> {
  const user = getUser(c);
  const body = await readJson<CreateFolderDTO>(c);
  if (typeof body.name !== "string" || !body.name.trim()) {
    return failure(c, 400, ErrorCode.BAD_REQUEST, "name is required");
  }

  const visibility = body.visibility || "private";
  const visibilityError = assertCanCreateVisibility(c, visibility);
  if (visibilityError) return visibilityError;

  const snapshot = await loadSnapshot(c.env.DB, user.userId);
  const parentError = assertParentFolderAllowed(c, snapshot.folders, body.parentId, visibility);
  if (parentError) return parentError;

  const timestamp = nowIso();
  const siblings = snapshot.folders.filter((folder) => (folder.parentId || undefined) === (body.parentId || undefined));
  const folder: Folder = {
    id: crypto.randomUUID(),
    ownerUserId: user.userId,
    visibility,
    name: body.name.trim(),
    icon: body.icon || undefined,
    parentId: body.parentId || undefined,
    order: Math.max(-1, ...siblings.map((item) => item.order || 0)) + 1,
    isPrivate: body.visibility ? body.visibility === "private" : body.isPrivate ?? false,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  snapshot.folders = [...snapshot.folders, folder];
  snapshot.exportedAt = timestamp;
  await saveSnapshot(c.env.DB, user.userId, snapshot);
  return success(c, folder, 201);
}

export async function insertFolderDirect(c: AppContext): Promise<Response> {
  const user = getUser(c);
  const body = await readJson<Folder>(c);
  if (
    typeof body.id !== "string" ||
    !body.id.trim() ||
    typeof body.name !== "string" ||
    !body.name.trim()
  ) {
    return failure(c, 400, ErrorCode.BAD_REQUEST, "id and name are required");
  }

  const visibility = resourceVisibility(body);
  const visibilityError = assertCanCreateVisibility(c, visibility);
  if (visibilityError) return visibilityError;

  const snapshot = await loadSnapshot(c.env.DB, user.userId);
  const parentError = assertParentFolderAllowed(
    c,
    snapshot.folders.filter((item) => item.id !== body.id),
    body.parentId || undefined,
    visibility,
  );
  if (parentError) return parentError;

  const folder: Folder = {
    ...body,
    ownerUserId: user.userId,
    visibility,
    name: body.name.trim(),
    icon: body.icon || undefined,
    parentId: body.parentId || undefined,
    order: body.order || 0,
    isPrivate: visibility === "private",
    createdAt: body.createdAt || nowIso(),
    updatedAt: body.updatedAt || nowIso(),
  };

  snapshot.folders = [
    ...snapshot.folders.filter((item) => item.id !== folder.id),
    folder,
  ];
  snapshot.exportedAt = folder.updatedAt;
  await saveSnapshot(c.env.DB, user.userId, snapshot);
  return success(c, folder, 201);
}

export async function updateFolder(c: AppContext): Promise<Response> {
  const user = getUser(c);
  const folderId = c.req.param("id");
  if (!folderId) {
    return failure(c, 400, ErrorCode.BAD_REQUEST, "folder id is required");
  }
  const patch = await readJson<UpdateFolderDTO>(c);
  if (patch.name !== undefined && !patch.name.trim()) {
    return failure(c, 400, ErrorCode.BAD_REQUEST, "name is required");
  }
  const snapshot = await loadSnapshot(c.env.DB, user.userId);
  const index = snapshot.folders.findIndex((item) => item.id === folderId);
  if (index < 0) {
    return notFound(c, "Folder");
  }

  const current = snapshot.folders[index];
  const writeError = assertCanWriteResource(c, current, "Folder");
  if (writeError) return writeError;
  const nextVisibility = patch.visibility || resourceVisibility(current);
  if (nextVisibility !== resourceVisibility(current) && user.role !== "admin") {
    return failure(c, 403, ErrorCode.FORBIDDEN, "Only admin can change shared visibility");
  }
  const parentId = (patch.parentId === undefined ? current.parentId : patch.parentId) ?? undefined;
  const parentError = assertParentFolderAllowed(c, snapshot.folders.filter((item) => item.id !== folderId), parentId, nextVisibility);
  if (parentError) return parentError;
  if (parentId && collectFolderDescendants(snapshot.folders, folderId).has(parentId)) {
    return failure(c, 422, ErrorCode.VALIDATION_ERROR, "Folder cannot be moved under its descendant");
  }

  const updated: Folder = {
    ...current,
    ...patch,
    name: patch.name === undefined ? current.name : patch.name.trim(),
    icon: patch.icon === undefined ? current.icon : patch.icon,
    parentId,
    visibility: nextVisibility,
    isPrivate: patch.visibility ? patch.visibility === "private" : patch.isPrivate ?? current.isPrivate,
    updatedAt: nowIso(),
  };
  snapshot.folders[index] = updated;
  snapshot.exportedAt = updated.updatedAt;
  await saveSnapshot(c.env.DB, user.userId, snapshot);
  return success(c, updated);
}

export async function deleteFolder(c: AppContext): Promise<Response> {
  const user = getUser(c);
  const folderId = c.req.param("id");
  if (!folderId) {
    return failure(c, 400, ErrorCode.BAD_REQUEST, "folder id is required");
  }
  const snapshot = await loadSnapshot(c.env.DB, user.userId);
  const folder = snapshot.folders.find((item) => item.id === folderId);
  if (!folder) {
    return notFound(c, "Folder");
  }
  const writeError = assertCanWriteResource(c, folder, "Folder");
  if (writeError) return writeError;

  const deletedIds = collectFolderDescendants(snapshot.folders, folderId);
  deletedIds.add(folderId);
  const timestamp = nowIso();
  snapshot.folders = snapshot.folders.filter((item) => !deletedIds.has(item.id));
  snapshot.prompts = snapshot.prompts.map((prompt) => (
    prompt.folderId && deletedIds.has(prompt.folderId)
      ? { ...prompt, folderId: null, updatedAt: timestamp }
      : prompt
  ));
  snapshot.exportedAt = timestamp;
  await saveSnapshot(c.env.DB, user.userId, snapshot);
  return success(c, { ok: true });
}

export async function reorderFolders(c: AppContext): Promise<Response> {
  const user = getUser(c);
  const body = await readJson<{ ids?: string[] }>(c);
  const ids = Array.isArray(body.ids) ? body.ids.filter((id) => typeof id === "string" && id.trim()) : [];
  const snapshot = await loadSnapshot(c.env.DB, user.userId);
  const foldersById = new Map(snapshot.folders.map((folder) => [folder.id, folder]));
  const selected = ids.map((id) => foldersById.get(id)).filter((folder): folder is Folder => !!folder);
  if (selected.length > 0) {
    const firstVisibility = resourceVisibility(selected[0]);
    const firstOwner = selected[0].ownerUserId || user.userId;
    for (const folder of selected) {
      if (resourceVisibility(folder) !== firstVisibility) {
        return failure(c, 422, ErrorCode.VALIDATION_ERROR, "Cannot reorder mixed visibility folders");
      }
      if (firstVisibility === "private" && (folder.ownerUserId || user.userId) !== firstOwner) {
        return failure(c, 422, ErrorCode.VALIDATION_ERROR, "Cannot reorder folders from different owners");
      }
    }
  }

  for (const id of ids) {
    const folder = foldersById.get(id);
    if (!folder) {
      return notFound(c, "Folder");
    }
    const writeError = assertCanWriteResource(c, folder, "Folder");
    if (writeError) return writeError;
  }

  const timestamp = nowIso();
  const orderById = new Map(ids.map((id, index) => [id, index]));
  snapshot.folders = snapshot.folders.map((folder) => (
    orderById.has(folder.id)
      ? { ...folder, order: orderById.get(folder.id)!, updatedAt: timestamp }
      : folder
  ));
  snapshot.exportedAt = timestamp;
  await saveSnapshot(c.env.DB, user.userId, snapshot);
  return success(c, { ok: true });
}

export async function listSkills(c: AppContext): Promise<Response> {
  const snapshot = await getUserSnapshot(c);
  return success(c, snapshot.skills);
}

export async function getSkill(c: AppContext): Promise<Response> {
  const snapshot = await getUserSnapshot(c);
  const skill = snapshot.skills.find((item) => item.id === c.req.param("id"));
  return skill ? success(c, skill) : notFound(c, "Skill");
}

export async function listSkillVersions(c: AppContext): Promise<Response> {
  const snapshot = await getUserSnapshot(c);
  const skillId = c.req.param("id");
  const versions = (snapshot.skillVersions || []).filter((item) => item.skillId === skillId);
  return success(c, versions);
}

export async function listRules(c: AppContext): Promise<Response> {
  const snapshot = await getUserSnapshot(c);
  return success(c, (snapshot.rules || []).map((rule) => ({
    id: rule.id,
    platformId: rule.platformId,
    platformName: rule.platformName,
    platformIcon: rule.platformIcon,
    platformDescription: rule.platformDescription,
    name: rule.name,
    description: rule.description,
    path: rule.path,
    exists: true,
    group: rule.projectRootPath ? "workspace" : "assistant",
    managedPath: rule.managedPath,
    targetPath: rule.targetPath,
    projectRootPath: rule.projectRootPath,
    syncStatus: rule.syncStatus,
  })));
}

export async function readRule(c: AppContext): Promise<Response> {
  const snapshot = await getUserSnapshot(c);
  const rule = (snapshot.rules || []).find((item) => item.id === c.req.param("id"));
  if (!rule) {
    return notFound(c, "Rule");
  }
  return success(c, {
    ...rule,
    exists: true,
    group: rule.projectRootPath ? "workspace" : "assistant",
  });
}

export async function getSettings(c: AppContext): Promise<Response> {
  const snapshot = await getUserSnapshot(c);
  return success(c, snapshot.settings || {});
}

export async function putSettings(c: AppContext): Promise<Response> {
  const user = getUser(c);
  const patch = await readJson<Record<string, unknown>>(c);
  const snapshot = await loadSnapshot(c.env.DB, user.userId);
  const current: Settings = snapshot.settings && typeof snapshot.settings === "object"
    ? snapshot.settings
    : { theme: "system", language: "zh", autoSave: true };
  snapshot.settings = {
    ...current,
    ...patch,
  };
  snapshot.settingsUpdatedAt = new Date().toISOString();
  snapshot.exportedAt = snapshot.settingsUpdatedAt;
  await saveSnapshot(c.env.DB, user.userId, snapshot);
  return success(c, true);
}
