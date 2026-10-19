import path from "node:path";
import type {
  PluginMarketSource,
  PluginPackageSource,
} from "@prompthub/shared/types/plugin";
import {
  CODEX_PLUGIN_MANIFEST_FILE,
  CorePluginError,
  normalizeRelativePosixPath,
  safeString,
  type RawRecord,
} from "./shared";

function archiveSource(
  raw: RawRecord,
): NonNullable<PluginPackageSource["archive"]> {
  const url = safeString(raw.url),
    sha256 = safeString(raw.sha256);
  if (!url || !sha256 || !/^[a-f\d]{64}$/i.test(sha256)) {
    throw new CorePluginError(
      "INVALID_SOURCE",
      "Plugin archive requires a URL and SHA-256 digest",
    );
  }
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new CorePluginError(
      "INVALID_SOURCE",
      "Plugin archive requires an uncredentialed HTTPS URL",
    );
  }
  return { url, sha256: sha256.toLowerCase() };
}

function gitRepository(raw: RawRecord): string {
  const value = safeString(raw.source === "github" ? raw.repo : raw.url);
  if (!value)
    throw new CorePluginError(
      "INVALID_SOURCE",
      "Missing Plugin Git repository",
    );
  const repository = /^[\w.-]+\/[\w.-]+$/.test(value)
    ? `https://github.com/${value}`
    : value;
  if (
    !/^(https?:\/\/|ssh:\/\/|git@)/.test(repository) ||
    repository.includes("\0")
  ) {
    throw new CorePluginError(
      "INVALID_SOURCE",
      "Invalid Plugin Git repository",
    );
  }
  return repository;
}

/** One adapter from supported marketplace dialects to the current source contract. */
export function normalizeMarketplaceSource(
  record: RawRecord,
  source: PluginMarketSource,
  label: string,
): PluginPackageSource {
  const raw: RawRecord =
    record.source &&
    typeof record.source === "object" &&
    !Array.isArray(record.source)
      ? (record.source as RawRecord) // JSON object checked at this external boundary.
      : {};
  const common = {
    kind: "market" as const,
    sourceId: source.id,
    label,
    rawJsonUrl: source.rawJsonUrl,
    marketplaceFile: source.marketplaceFile,
  };
  if (raw.type === "archive" || raw.source === "archive") {
    const archive = archiveSource(raw);
    return {
      ...common,
      archive,
      url: archive.url,
      manifestPath: "plugin.json",
    };
  }
  const external = ["url", "github", "git-subdir"].includes(String(raw.source));
  if (raw.source && raw.source !== "local" && !external) {
    throw new CorePluginError(
      "UNSUPPORTED_SOURCE",
      `Unsupported Plugin marketplace source: ${String(raw.source)}`,
    );
  }
  const rawPath =
    typeof record.source === "string" ? record.source : safeString(raw.path);
  const packagePath = rawPath
    ? normalizeRelativePosixPath(rawPath)
    : external
      ? "."
      : undefined;
  const claude =
    typeof record.source === "string" ||
    external ||
    source.marketplaceFile === ".claude-plugin/marketplace.json";
  const revision = safeString(raw.sha);
  if (revision && !/^[a-f\d]{40}$/i.test(revision))
    throw new CorePluginError(
      "INVALID_SOURCE",
      "Invalid Plugin Git commit SHA",
    );
  return {
    ...common,
    repository: external ? gitRepository(raw) : source.repository,
    packagePath,
    branch: safeString(raw.ref),
    revision,
    manifestPath: packagePath
      ? path.posix.join(
          packagePath,
          claude ? ".claude-plugin/plugin.json" : CODEX_PLUGIN_MANIFEST_FILE,
        )
      : undefined,
    url: safeString(raw.url),
  };
}
