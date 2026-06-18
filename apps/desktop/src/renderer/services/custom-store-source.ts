import type {
  McpMarketSource,
  PluginMarketSource,
  SkillStoreSource,
} from "@prompthub/shared/types";
import { parseGitRepo } from "@prompthub/shared/utils/git-repo";
import {
  normalizeGitStoreSourceInput,
  validateStoreSourceInput,
  type CustomStoreSourceType,
} from "./skill-store-source";

export type { CustomStoreSourceType };

export type CustomStoreSource = Pick<
  SkillStoreSource,
  | "id"
  | "name"
  | "type"
  | "url"
  | "branch"
  | "directory"
  | "enabled"
  | "order"
  | "createdAt"
>;

export interface CustomStoreSourceInput {
  branch?: string;
  directory?: string;
  id?: string;
  name: string;
  type: CustomStoreSourceType;
  url: string;
}

export interface CustomStoreSourceState<TSource extends CustomStoreSource> {
  customStoreSources: TSource[];
  selectedStoreSourceId: string;
}

export function createCustomStoreSourceId(prefix = "custom"): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeCustomStoreSourceInput(
  input: CustomStoreSourceInput,
): CustomStoreSourceInput | null {
  const trimmedName = input.name.trim();
  if (!trimmedName) {
    return null;
  }

  const normalizedGitSource =
    input.type === "git-repo"
      ? normalizeGitStoreSourceInput(
          input.url.trim(),
          input.branch,
          input.directory,
        )
      : null;
  const trimmedUrl = validateStoreSourceInput(input.url.trim(), input.type);

  return {
    ...input,
    name: trimmedName,
    url: normalizedGitSource?.url ?? trimmedUrl,
    branch: normalizedGitSource?.branch,
    directory: normalizedGitSource?.directory,
  };
}

export function addCustomStoreSource<TSource extends CustomStoreSource>(
  sources: TSource[],
  input: CustomStoreSourceInput,
  options: {
    idPrefix?: string;
    mapSource?: (source: CustomStoreSource) => TSource;
  } = {},
): { source: TSource; sources: TSource[] } | null {
  const normalized = normalizeCustomStoreSourceInput(input);
  if (!normalized) {
    return null;
  }

  const baseSource: CustomStoreSource = {
    id: normalized.id ?? createCustomStoreSourceId(options.idPrefix),
    name: normalized.name,
    type: normalized.type,
    url: normalized.url,
    branch: normalized.branch,
    directory: normalized.directory,
    enabled: true,
    order: sources.length,
    createdAt: Date.now(),
  };
  const source = options.mapSource
    ? options.mapSource(baseSource)
    : (baseSource as TSource);

  return {
    source,
    sources: [source, ...sources],
  };
}

export function updateCustomStoreSource<TSource extends CustomStoreSource>(
  sources: TSource[],
  input: CustomStoreSourceInput & { id: string },
  options: {
    mapSource?: (source: CustomStoreSource, previous: TSource) => TSource;
  } = {},
): TSource[] {
  const normalized = normalizeCustomStoreSourceInput(input);
  if (!normalized) {
    return sources;
  }

  return sources.map((source) => {
    if (source.id !== normalized.id) {
      return source;
    }
    const nextSource: CustomStoreSource = {
      ...source,
      name: normalized.name,
      type: normalized.type,
      url: normalized.url,
      branch: normalized.branch,
      directory: normalized.directory,
    };
    return options.mapSource
      ? options.mapSource(nextSource, source)
      : (nextSource as TSource);
  });
}

export function removeCustomStoreSource<TState extends CustomStoreSourceState<TSource>, TSource extends CustomStoreSource>(
  state: TState,
  sourceId: string,
  fallbackSourceId: string,
): Pick<TState, "customStoreSources" | "selectedStoreSourceId"> {
  return {
    customStoreSources: state.customStoreSources.filter(
      (source) => source.id !== sourceId,
    ),
    selectedStoreSourceId:
      state.selectedStoreSourceId === sourceId
        ? fallbackSourceId
        : state.selectedStoreSourceId,
  };
}

export function toggleCustomStoreSource<TSource extends CustomStoreSource>(
  sources: TSource[],
  sourceId: string,
): TSource[] {
  return sources.map((source) =>
    source.id === sourceId ? { ...source, enabled: !source.enabled } : source,
  );
}

export function mergeEnabledCustomSources<TSource extends { id: string }, TCustom extends TSource & CustomStoreSource>(
  builtinSources: TSource[],
  customSources: TCustom[],
): TSource[] {
  const builtinIds = new Set(builtinSources.map((source) => source.id));
  return [
    ...builtinSources,
    ...customSources.filter(
      (source) => source.enabled && !builtinIds.has(source.id),
    ),
  ];
}

export function toSkillStoreSource(source: CustomStoreSource): SkillStoreSource {
  return {
    ...source,
    type: source.type,
  };
}

export function toMcpMarketSource(source: CustomStoreSource): McpMarketSource | null {
  if (!source.enabled || source.type === "local-dir") {
    return null;
  }

  return {
    id: source.id,
    label: source.name,
    url: source.url,
    description: source.directory
      ? `${source.url} | dir: ${source.directory}`
      : source.url,
    trustLevel: "community",
  };
}

function parseGitHubRawMarketplaceUrl(rawJsonUrl: string): {
  marketplaceFile: string;
  repository: string;
} | null {
  try {
    const parsed = new URL(rawJsonUrl);
    if (parsed.hostname.toLowerCase() !== "raw.githubusercontent.com") {
      return null;
    }
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length < 4) {
      return null;
    }
    const [owner, repo, , ...marketplaceParts] = parts;
    return {
      marketplaceFile: marketplaceParts.join("/"),
      repository: `https://github.com/${owner}/${repo}`,
    };
  } catch {
    return null;
  }
}

function toGitHubRawMarketplaceUrl(source: CustomStoreSource): {
  marketplaceFile: string;
  rawJsonUrl: string;
  repository: string;
} | null {
  const parsed = parseGitRepo(source.url);
  if (!parsed || parsed.host !== "github.com") {
    return null;
  }
  const branch = source.branch || "main";
  const marketplaceFile =
    source.directory?.replace(/^\/+|\/+$/g, "") ||
    ".agents/plugins/marketplace.json";
  return {
    marketplaceFile,
    rawJsonUrl: `https://raw.githubusercontent.com/${parsed.owner}/${parsed.repo}/${branch}/${marketplaceFile}`,
    repository: parsed.repositoryUrl,
  };
}

export function toPluginMarketSource(
  source: CustomStoreSource,
): PluginMarketSource | null {
  if (!source.enabled || source.type === "local-dir") {
    return null;
  }

  const gitSource =
    source.type === "git-repo" ? toGitHubRawMarketplaceUrl(source) : null;
  const rawSource =
    source.type === "marketplace-json"
      ? parseGitHubRawMarketplaceUrl(source.url)
      : null;
  const rawJsonUrl = gitSource?.rawJsonUrl ?? source.url;
  const repository =
    gitSource?.repository ?? rawSource?.repository ?? source.url;
  const marketplaceFile =
    gitSource?.marketplaceFile ??
    rawSource?.marketplaceFile ??
    ".agents/plugins/marketplace.json";

  return {
    id: source.id,
    displayName: source.name,
    repository,
    marketplaceFile,
    rawJsonUrl,
    trustLevel: "custom",
    description: source.url,
  };
}

export function toPluginMarketSources(
  sources: CustomStoreSource[],
): PluginMarketSource[] {
  return sources.flatMap((source) => {
    const mapped = toPluginMarketSource(source);
    return mapped ? [mapped] : [];
  });
}
