export interface CliInstallSource {
  location: string;
  releaseTag: string;
}

const RELEASES_URL = "https://api.github.com/repos/legeling/PromptHub/releases";
const DOWNLOAD_ROOT = "https://github.com/legeling/PromptHub/releases/download";

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function findCliAsset(releases: unknown): CliInstallSource | null {
  if (!Array.isArray(releases))
    throw new Error("Invalid CLI release list response");
  for (const release of releases) {
    if (
      !record(release) ||
      release.draft !== false ||
      release.prerelease !== false
    )
      continue;
    const tag = release.tag_name;
    if (
      typeof tag !== "string" ||
      !/^v?\d+\.\d+\.\d+$/.test(tag) ||
      !Array.isArray(release.assets)
    )
      continue;
    for (const asset of release.assets) {
      if (
        !record(asset) ||
        typeof asset.name !== "string" ||
        !/^prompthub-cli-\d+\.\d+\.\d+\.tgz$/.test(asset.name)
      )
        continue;
      const expectedUrl = `${DOWNLOAD_ROOT}/${tag}/${asset.name}`;
      if (asset.browser_download_url !== expectedUrl)
        throw new Error("Invalid CLI release asset URL");
      return { location: expectedUrl, releaseTag: tag };
    }
  }
  return null;
}

// GitHub lists releases newest first. Skip drafts, prereleases and releases
// without a CLI asset; never derive a download URL from the desktop version.
export async function resolveCliInstallSource(
  fetcher: typeof fetch = fetch,
): Promise<CliInstallSource> {
  for (let page = 1; page <= 3; page += 1) {
    const response = await fetcher(
      `${RELEASES_URL}?per_page=100&page=${page}`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "PromptHub",
        },
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!response.ok)
      throw new Error(`CLI release lookup failed: HTTP ${response.status}`);
    const source = findCliAsset(await response.json());
    if (source) return source;
    if (!response.headers.get("link")?.includes('rel="next"')) break;
  }
  throw new Error(
    "No published CLI package was found in the available releases",
  );
}
