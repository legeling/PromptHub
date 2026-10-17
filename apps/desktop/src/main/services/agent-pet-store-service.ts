import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import type {
  AgentPetStoreItem,
  AgentPetStorePage,
  AgentPetStoreQuery,
  AgentPetSummary,
} from "@prompthub/shared/types";

import type { AgentAppearanceService } from "./agent-appearance-service";

const RAW_ORIGIN = "https://raw.githubusercontent.com";
const RAW_PREFIX = "/legeling/awesome-codex-pet/main/";
const PREVIEW_ORIGIN = "https://codexpet.top";
const PREVIEW_PREFIX = "/assets/previews/";
const CATALOG_URL = `${PREVIEW_ORIGIN}/pets.json`;
const DEFAULT_PAGE_SIZE = 18;
const MAX_PAGE_SIZE = 48;
const CATALOG_BYTES = 2 * 1024 * 1024;
const MANIFEST_BYTES = 64 * 1024;
const PREVIEW_BYTES = 2 * 1024 * 1024;
const SPRITE_BYTES = 20 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 5 * 60 * 1000;
const PREVIEW_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_PREVIEW_CACHE_ENTRIES = 96;
const MAX_PREVIEW_CACHE_BYTES = 192 * 1024 * 1024;
const PREVIEW_CACHE_EXTENSIONS = ["webp", "png"] as const;
const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

interface CatalogRecord {
  id: string;
  name: string;
  localizedNames: Record<string, string>;
  author: string;
  authorHandle: string;
  category: string;
  license: string;
  description: string;
  spriteVersionNumber: 1 | 2;
}

interface StoreManifest {
  id: string;
  spritesheetPath: string;
  value: Record<string, unknown>;
}

function previewCacheExtension(mime: string): "webp" | "png" {
  return mime === "image/png" ? "png" : "webp";
}

function previewDataUrl(bytes: Buffer, mime: string): string {
  return `data:${mime};base64,${bytes.toString("base64")}`;
}

export interface AgentPetStoreServiceOptions {
  dataRoot: string;
  appearanceService: AgentAppearanceService;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

function requireCodex(agentId: string): void {
  if (agentId !== "codex") {
    throw new Error("Pet catalog is only supported for Codex");
  }
}

function normalizedString(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function isSafeId(value: string): boolean {
  return SAFE_ID_PATTERN.test(value) && !value.includes("..");
}

function normalizeCatalogRecord(value: unknown): CatalogRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const id = normalizedString(raw.slug, 128);
  const name = normalizedString(raw.name, 120);
  if (!isSafeId(id) || !name) return null;
  const localizedNames: Record<string, string> = {};
  if (
    raw.localized_names &&
    typeof raw.localized_names === "object" &&
    !Array.isArray(raw.localized_names)
  ) {
    for (const [locale, localizedName] of Object.entries(raw.localized_names)) {
      const normalized = normalizedString(localizedName, 120);
      if (normalized) localizedNames[locale] = normalized;
    }
  }
  return {
    id,
    name,
    localizedNames,
    author: normalizedString(raw.author, 120),
    authorHandle: normalizedString(raw.author_handle, 120),
    category: normalizedString(raw.primary_category, 120),
    license: normalizedString(raw.license, 120),
    description: normalizedString(raw.description, 1_000),
    spriteVersionNumber: raw.spriteVersionNumber === 2 ? 2 : 1,
  };
}

function normalizeManifest(value: unknown, expectedId: string): StoreManifest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Official Pet manifest must be an object");
  }
  const raw = value as Record<string, unknown>;
  const id = normalizedString(raw.id, 128);
  const spritesheetPath = normalizedString(raw.spritesheetPath, 160);
  if (id !== expectedId || !isSafeId(id)) {
    throw new Error("Official Pet manifest id does not match the catalog");
  }
  if (
    !spritesheetPath ||
    spritesheetPath !== path.basename(spritesheetPath) ||
    ![".png", ".webp"].includes(path.extname(spritesheetPath).toLowerCase())
  ) {
    throw new Error("Official Pet spritesheet path is invalid");
  }
  return { id, spritesheetPath, value: raw };
}

function rawOfficialUrl(relativePath: string): string {
  const url = new URL(relativePath, `${RAW_ORIGIN}${RAW_PREFIX}`);
  if (
    url.origin !== RAW_ORIGIN ||
    !url.pathname.startsWith(RAW_PREFIX) ||
    url.search ||
    url.hash
  ) {
    throw new Error("Pet catalog URL is outside the official allowlist");
  }
  return url.toString();
}

function previewOfficialUrl(petId: string, thumbnail = false): string {
  if (!isSafeId(petId)) throw new Error("Invalid official Pet id");
  const asset = thumbnail ? "thumbnail.webp" : "webp/idle.webp";
  return `${PREVIEW_ORIGIN}${PREVIEW_PREFIX}${encodeURIComponent(petId)}/${asset}`;
}

function isAllowlistedOfficialUrl(value: string): boolean {
  const url = new URL(value);
  if (url.search || url.hash) return false;
  if (url.origin === RAW_ORIGIN) return url.pathname.startsWith(RAW_PREFIX);
  if (url.origin === PREVIEW_ORIGIN) {
    return url.href === CATALOG_URL || url.pathname.startsWith(PREVIEW_PREFIX);
  }
  return false;
}

async function readBoundedBody(
  response: Response,
  maxBytes: number,
): Promise<Buffer> {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new Error("Official Pet response exceeds the size limit");
  }
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      total += result.value.byteLength;
      if (total > maxBytes) {
        throw new Error("Official Pet response exceeds the size limit");
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total);
}

export class AgentPetStoreService {
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private cache: { expiresAt: number; items: CatalogRecord[] } | null = null;
  private previewCacheReady: Promise<void> | null = null;
  private readonly previewCacheFiles = new Set<string>();
  private readonly previewRequests = new Map<string, Promise<string>>();

  constructor(private readonly options: AgentPetStoreServiceOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? Date.now;
  }

  async list(query: AgentPetStoreQuery): Promise<AgentPetStorePage> {
    requireCodex(query.agentId);
    const [catalog, overview] = await Promise.all([
      this.getCatalog(query.refresh === true),
      this.options.appearanceService.getOverview(),
    ]);
    const installed = new Set(overview.pets.map((pet) => pet.id));
    const search = query.search?.trim().toLocaleLowerCase() ?? "";
    const filtered = search
      ? catalog.filter((item) => this.matches(item, search, query.locale))
      : catalog;
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, Math.trunc(query.pageSize ?? DEFAULT_PAGE_SIZE)),
    );
    const page = Math.max(1, Math.trunc(query.page ?? 1));
    const start = (page - 1) * pageSize;
    const items = filtered
      .slice(start, start + pageSize)
      .map((item) => this.toStoreItem(item, query.locale, installed));
    return {
      items,
      total: filtered.length,
      page,
      pageSize,
      hasMore: start + items.length < filtered.length,
    };
  }

  async install(agentId: string, petId: string): Promise<AgentPetSummary> {
    requireCodex(agentId);
    const item = await this.requireCatalogItem(petId);
    const manifest = await this.getManifest(item);
    const spriteBytes = await this.fetchBytes(
      rawOfficialUrl(`pets/${item.id}/${manifest.spritesheetPath}`),
      SPRITE_BYTES,
    );
    const stagingRoot = path.join(this.options.dataRoot, "agent-pet-store");
    await fs.mkdir(stagingRoot, { recursive: true, mode: 0o700 });
    const staging = await fs.mkdtemp(path.join(stagingRoot, `${item.id}-`));
    try {
      await Promise.all([
        fs.writeFile(
          path.join(staging, "pet.json"),
          `${JSON.stringify(manifest.value, null, 2)}\n`,
          { mode: 0o600 },
        ),
        fs.writeFile(
          path.join(staging, manifest.spritesheetPath),
          spriteBytes,
          { mode: 0o600 },
        ),
      ]);
      return await this.options.appearanceService.importPet(staging);
    } finally {
      await fs.rm(staging, { recursive: true, force: true });
    }
  }

  async getPreview(agentId: string, petId: string): Promise<string> {
    requireCodex(agentId);
    const item = await this.requireCatalogItem(petId);
    const activeRequest = this.previewRequests.get(item.id);
    if (activeRequest) return activeRequest;
    const request = this.loadPreview(item).finally(() => {
      this.previewRequests.delete(item.id);
    });
    this.previewRequests.set(item.id, request);
    return request;
  }

  private async loadPreview(item: CatalogRecord): Promise<string> {
    const cached = await this.readPreviewCache(item.id).catch(() => null);
    if (cached) return cached;
    try {
      const bytes = await this.fetchBytes(
        previewOfficialUrl(item.id),
        PREVIEW_BYTES,
      );
      await this.writePreviewCache(item.id, bytes, "image/webp").catch(
        () => undefined,
      );
      return previewDataUrl(bytes, "image/webp");
    } catch {
      return await this.getThumbnailPreview(item);
    }
  }

  private async getThumbnailPreview(item: CatalogRecord): Promise<string> {
    const bytes = await this.fetchBytes(
      previewOfficialUrl(item.id, true),
      PREVIEW_BYTES,
    );
    await this.writePreviewCache(item.id, bytes, "image/webp").catch(
      () => undefined,
    );
    return previewDataUrl(bytes, "image/webp");
  }

  private get previewCacheDirectory(): string {
    return path.join(
      this.options.dataRoot,
      "agent-pet-store",
      "cache",
      "previews",
    );
  }

  private async ensurePreviewCache(): Promise<void> {
    this.previewCacheReady ??= this.initializePreviewCache();
    return this.previewCacheReady;
  }

  private async initializePreviewCache(): Promise<void> {
    await fs.mkdir(this.previewCacheDirectory, {
      recursive: true,
      mode: 0o700,
    });
    const entries = await fs.readdir(this.previewCacheDirectory, {
      withFileTypes: true,
    });
    for (const entry of entries) {
      if (entry.isFile() && this.isPreviewCacheFilename(entry.name)) {
        this.previewCacheFiles.add(entry.name);
      } else if (entry.isFile() && entry.name.endsWith(".tmp")) {
        await fs.rm(path.join(this.previewCacheDirectory, entry.name), {
          force: true,
        });
      }
    }
    await this.prunePreviewCache();
  }

  private isPreviewCacheFilename(filename: string): boolean {
    const suffix = path.extname(filename);
    const extension = suffix.slice(1).toLowerCase();
    const id = path.basename(filename, suffix);
    return (
      PREVIEW_CACHE_EXTENSIONS.includes(extension as "webp" | "png") &&
      isSafeId(id)
    );
  }

  private async readPreviewCache(petId: string): Promise<string | null> {
    await this.ensurePreviewCache();
    for (const extension of PREVIEW_CACHE_EXTENSIONS) {
      const filename = `${petId}.${extension}`;
      if (!this.previewCacheFiles.has(filename)) continue;
      const cachePath = path.join(this.previewCacheDirectory, filename);
      const stat = await fs.stat(cachePath).catch(() => null);
      if (!stat?.isFile() || this.now() - stat.mtimeMs > PREVIEW_CACHE_TTL_MS) {
        await this.removePreviewCacheFile(filename);
        continue;
      }
      const bytes = await fs.readFile(cachePath);
      const accessedAt = new Date(this.now());
      await fs.utimes(cachePath, accessedAt, accessedAt);
      return previewDataUrl(bytes, `image/${extension}`);
    }
    return null;
  }

  private async writePreviewCache(
    petId: string,
    bytes: Buffer,
    mime: string,
  ): Promise<void> {
    if (!bytes.length || bytes.length > SPRITE_BYTES) return;
    await this.ensurePreviewCache();
    const extension = previewCacheExtension(mime);
    const filename = `${petId}.${extension}`;
    const target = path.join(this.previewCacheDirectory, filename);
    const temporary = path.join(
      this.previewCacheDirectory,
      `${petId}-${randomUUID()}.tmp`,
    );
    try {
      await fs.writeFile(temporary, bytes, { mode: 0o600 });
      await fs.rename(temporary, target);
      const modifiedAt = new Date(this.now());
      await fs.utimes(target, modifiedAt, modifiedAt);
      this.previewCacheFiles.add(filename);
      await this.removeAlternativePreview(petId, extension);
      await this.prunePreviewCache();
    } finally {
      await fs.rm(temporary, { force: true });
    }
  }

  private async removeAlternativePreview(
    petId: string,
    retainedExtension: "webp" | "png",
  ): Promise<void> {
    for (const extension of PREVIEW_CACHE_EXTENSIONS) {
      if (extension !== retainedExtension) {
        await this.removePreviewCacheFile(`${petId}.${extension}`);
      }
    }
  }

  private async removePreviewCacheFile(filename: string): Promise<void> {
    this.previewCacheFiles.delete(filename);
    await fs.rm(path.join(this.previewCacheDirectory, filename), {
      force: true,
    });
  }

  private async prunePreviewCache(): Promise<void> {
    const inventory = await this.previewCacheInventory();
    let totalBytes = inventory.reduce((total, item) => total + item.size, 0);
    let retainedCount = inventory.length;
    for (const item of inventory) {
      const withinEntryLimit = retainedCount <= MAX_PREVIEW_CACHE_ENTRIES;
      if (withinEntryLimit && totalBytes <= MAX_PREVIEW_CACHE_BYTES) break;
      await this.removePreviewCacheFile(item.filename);
      retainedCount -= 1;
      totalBytes -= item.size;
    }
  }

  private async previewCacheInventory(): Promise<
    Array<{ filename: string; modifiedAt: number; size: number }>
  > {
    const inventory = await Promise.all(
      [...this.previewCacheFiles].map(async (filename) => {
        const cachePath = path.join(this.previewCacheDirectory, filename);
        const stat = await fs.stat(cachePath).catch(() => null);
        if (
          !stat?.isFile() ||
          this.now() - stat.mtimeMs > PREVIEW_CACHE_TTL_MS
        ) {
          await this.removePreviewCacheFile(filename);
          return null;
        }
        return { filename, modifiedAt: stat.mtimeMs, size: stat.size };
      }),
    );
    return inventory
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((left, right) => left.modifiedAt - right.modifiedAt);
  }

  private async getManifest(item: CatalogRecord): Promise<StoreManifest> {
    const bytes = await this.fetchBytes(
      rawOfficialUrl(`pets/${item.id}/pet.json`),
      MANIFEST_BYTES,
    );
    return normalizeManifest(
      JSON.parse(bytes.toString("utf8")) as unknown,
      item.id,
    );
  }

  private async requireCatalogItem(petId: string): Promise<CatalogRecord> {
    if (!isSafeId(petId)) throw new Error("Invalid official Pet id");
    const item = (await this.getCatalog()).find((entry) => entry.id === petId);
    if (!item) throw new Error("Unknown official Pet");
    return item;
  }

  private async getCatalog(refresh = false): Promise<CatalogRecord[]> {
    if (!refresh && this.cache && this.cache.expiresAt > this.now()) {
      return this.cache.items;
    }
    const bytes = await this.fetchBytes(CATALOG_URL, CATALOG_BYTES);
    const value = JSON.parse(bytes.toString("utf8")) as unknown;
    if (!Array.isArray(value))
      throw new Error("Official Pet catalog is invalid");
    const items = value
      .map(normalizeCatalogRecord)
      .filter((item): item is CatalogRecord => item !== null);
    this.cache = { expiresAt: this.now() + CACHE_TTL_MS, items };
    return items;
  }

  private async fetchBytes(url: string, maxBytes: number): Promise<Buffer> {
    if (!isAllowlistedOfficialUrl(url)) {
      throw new Error("Pet catalog URL is outside the official allowlist");
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await this.fetchImpl(url, {
        signal: controller.signal,
        redirect: "error",
      });
      if (response.redirected || (response.url && response.url !== url)) {
        throw new Error("Official Pet response redirect is not allowed");
      }
      if (!response.ok) {
        throw new Error(`Official Pet request failed (${response.status})`);
      }
      return await readBoundedBody(response, maxBytes);
    } catch (cause) {
      if (controller.signal.aborted) {
        throw new Error(
          `PET_STORE_REQUEST_TIMEOUT: Official Pet request timed out after ${REQUEST_TIMEOUT_MS}ms (${url})`,
          { cause },
        );
      }
      throw cause;
    } finally {
      clearTimeout(timeout);
    }
  }

  private matches(
    item: CatalogRecord,
    search: string,
    locale?: string,
  ): boolean {
    const localized = this.localizedName(item, locale);
    return [item.name, localized, item.author, item.category, item.description]
      .join(" ")
      .toLocaleLowerCase()
      .includes(search);
  }

  private localizedName(item: CatalogRecord, locale?: string): string | null {
    if (!locale) return null;
    return (
      item.localizedNames[locale] ??
      item.localizedNames[locale.split("-")[0]] ??
      null
    );
  }

  private toStoreItem(
    item: CatalogRecord,
    locale: string | undefined,
    installed: Set<string>,
  ): AgentPetStoreItem {
    return {
      id: item.id,
      name: item.name,
      localizedName: this.localizedName(item, locale),
      author: item.author,
      authorHandle: item.authorHandle,
      category: item.category,
      license: item.license,
      description: item.description,
      spriteVersionNumber: item.spriteVersionNumber,
      installed: installed.has(item.id),
    };
  }
}
