export interface BackupObjectReference {
  path: string;
  hash: string;
  size: number;
  uploadedAt: string;
}

export interface BackupManifest {
  version: string;
  createdAt: string;
  updatedAt: string;
  dataHash?: string;
  data?: BackupObjectReference;
  semanticHash?: string;
  images: {
    [fileName: string]: {
      hash: string;
      size: number;
      uploadedAt: string;
      path?: string;
    };
  };
  videos: {
    [fileName: string]: {
      hash: string;
      size: number;
      uploadedAt: string;
      path?: string;
    };
  };
  encrypted?: boolean;
}

export interface ManifestPaths {
  data: string;
  image(fileName: string): string;
  video(fileName: string): string;
}

export const LEGACY_MANIFEST_VERSION = "4.0";
export const CURRENT_MANIFEST_VERSION = "5.0";

const HASH_PATTERN = /^[0-9a-f]{64}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function assertSafeAssetName(fileName: string): void {
  if (
    !fileName ||
    fileName === "." ||
    fileName === ".." ||
    /[\\/\?#\u0000-\u001f\u007f]/.test(fileName) ||
    fileName.length > 255
  ) {
    throw new Error(`Unsafe media file name: ${fileName}`);
  }
}

function assertSafeBasePath(basePath: string): void {
  if (
    !basePath ||
    /[\\?#\u0000-\u001f\u007f]/.test(basePath) ||
    basePath.split("/").some((segment) => segment === "..")
  ) {
    throw new Error(`Unsafe remote path: ${basePath}`);
  }
}

export function deriveImmutableObjectPath(
  basePath: string,
  hash: string,
): string {
  assertSafeBasePath(basePath);
  if (!HASH_PATTERN.test(hash)) {
    throw new Error(`Invalid content hash: ${hash}`);
  }

  const slashIndex = basePath.lastIndexOf("/");
  const directory = slashIndex >= 0 ? basePath.slice(0, slashIndex + 1) : "";
  const baseName = basePath.slice(slashIndex + 1);
  assertSafeAssetName(baseName);
  return `${directory}${baseName}.${hash}`;
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    const primitive = JSON.stringify(value);
    return primitive === undefined ? "null" : primitive;
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  }

  const entries = Object.entries(value)
    .filter(([, entry]) => entry !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
  return `{${entries
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`)
    .join(",")}}`;
}

export async function computeFullHash(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest("SHA-256", dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function computeSemanticHash(value: unknown): Promise<string> {
  const semanticData = isRecord(value) ? { ...value } : value;
  if (isRecord(semanticData)) {
    delete semanticData.exportedAt;
  }
  return computeFullHash(stableSerialize(semanticData));
}

export function parseManifestText(rawData: string): BackupManifest {
  let cleanData = rawData;

  if (cleanData.charCodeAt(0) === 0xfeff) {
    cleanData = cleanData.slice(1);
  }

  const firstBrace = cleanData.indexOf("{");
  const lastBrace = cleanData.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1) {
    cleanData = cleanData.substring(firstBrace, lastBrace + 1);
  }

  cleanData = cleanData.trim();
  if (cleanData.startsWith("<")) {
    throw new Error(
      "Server returned HTML instead of JSON, please check remote sync server status / 服务器返回了 HTML 而非 JSON，请检查远程同步服务状态",
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleanData);
  } catch {
    const preview = rawData.substring(0, 50);
    throw new Error(
      `Invalid manifest file format / manifest 文件格式错误 (${preview}...)`,
    );
  }

  if (!isRecord(parsed) || typeof parsed.version !== "string") {
    throw new Error("Invalid manifest shape / manifest 结构错误");
  }

  if (
    parsed.version !== LEGACY_MANIFEST_VERSION &&
    parsed.version !== CURRENT_MANIFEST_VERSION
  ) {
    throw new Error(`Unsupported manifest version: ${parsed.version}`);
  }

  if (
    typeof parsed.createdAt !== "string" ||
    typeof parsed.updatedAt !== "string" ||
    !isRecord(parsed.images) ||
    !isRecord(parsed.videos)
  ) {
    throw new Error("Invalid manifest shape / manifest 结构错误");
  }

  if (parsed.version === LEGACY_MANIFEST_VERSION) {
    if (typeof parsed.dataHash !== "string") {
      throw new Error("Invalid legacy manifest data hash");
    }
  } else {
    if (
      !isRecord(parsed.data) ||
      typeof parsed.data.path !== "string" ||
      typeof parsed.data.hash !== "string" ||
      typeof parsed.data.size !== "number" ||
      !Number.isSafeInteger(parsed.data.size) ||
      parsed.data.size < 0 ||
      typeof parsed.data.uploadedAt !== "string" ||
      !HASH_PATTERN.test(parsed.data.hash)
    ) {
      throw new Error("Invalid manifest data object / manifest 数据对象错误");
    }

    if (parsed.encrypted === true && parsed.semanticHash !== undefined) {
      throw new Error("Encrypted manifest must not expose semantic hash");
    }
    if (
      parsed.encrypted !== true &&
      (typeof parsed.semanticHash !== "string" ||
        !HASH_PATTERN.test(parsed.semanticHash))
    ) {
      throw new Error("Invalid manifest semantic hash");
    }
  }

  validateManifestMediaEntries(parsed.images, parsed.version);
  validateManifestMediaEntries(parsed.videos, parsed.version);
  return parsed as unknown as BackupManifest;
}

function validateManifestMediaEntries(
  entries: Record<string, unknown>,
  version: string,
): void {
  for (const [fileName, value] of Object.entries(entries)) {
    assertSafeAssetName(fileName);
    if (!isRecord(value) || typeof value.hash !== "string") {
      throw new Error(`Invalid manifest media entry: ${fileName}`);
    }

    if (
      typeof value.size !== "number" &&
      typeof value.size !== "string"
    ) {
      throw new Error(`Invalid manifest media size: ${fileName}`);
    }

    if (version === CURRENT_MANIFEST_VERSION) {
      if (
        typeof value.path !== "string" ||
        typeof value.uploadedAt !== "string" ||
        !HASH_PATTERN.test(value.hash) ||
        !Number.isSafeInteger(Number(value.size)) ||
        Number(value.size) < 0
      ) {
        throw new Error(`Invalid manifest media object: ${fileName}`);
      }
    }
  }
}

export function validateManifestReferences(
  paths: ManifestPaths,
  manifest: BackupManifest,
): void {
  if (manifest.version === LEGACY_MANIFEST_VERSION) {
    assertSafeBasePath(paths.data);
    for (const fileName of Object.keys(manifest.images)) {
      assertSafeAssetName(fileName);
      assertSafeBasePath(paths.image(fileName));
    }
    for (const fileName of Object.keys(manifest.videos)) {
      assertSafeAssetName(fileName);
      assertSafeBasePath(paths.video(fileName));
    }
    return;
  }

  if (!manifest.data) {
    throw new Error("Invalid manifest data object / manifest 数据对象错误");
  }
  if (
    manifest.data.path !==
    deriveImmutableObjectPath(paths.data, manifest.data.hash)
  ) {
    throw new Error(`Unsafe remote path: ${manifest.data.path}`);
  }

  for (const [fileName, entry] of Object.entries(manifest.images)) {
    assertSafeAssetName(fileName);
    const expectedPath = deriveImmutableObjectPath(
      paths.image(fileName),
      entry.hash,
    );
    if (entry.path !== expectedPath) {
      throw new Error(`Unsafe remote path: ${entry.path || ""}`);
    }
  }
  for (const [fileName, entry] of Object.entries(manifest.videos)) {
    assertSafeAssetName(fileName);
    const expectedPath = deriveImmutableObjectPath(
      paths.video(fileName),
      entry.hash,
    );
    if (entry.path !== expectedPath) {
      throw new Error(`Unsafe remote path: ${entry.path || ""}`);
    }
  }
}

export interface LocalMediaObject {
  content: string;
  hash: string;
  size: number;
}

export type LocalMediaObjects = Record<string, LocalMediaObject>;

export function mediaEntriesMatch(
  local: LocalMediaObjects,
  remote: BackupManifest["images"],
  legacy = false,
): boolean {
  const localNames = Object.keys(local);
  const remoteNames = Object.keys(remote || {});
  return (
    localNames.length === remoteNames.length &&
    localNames.every((fileName) => {
      const entry = remote[fileName];
      return (
        entry !== undefined &&
        entry.hash ===
          (legacy ? local[fileName].hash.substring(0, 16) : local[fileName].hash) &&
        Number(entry.size) === local[fileName].size
      );
    })
  );
}
