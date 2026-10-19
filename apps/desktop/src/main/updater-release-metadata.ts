import type { UpdateInfo } from "electron-updater";
import { compareVersions, parseVersion } from "../utils/version";
import { extractReleaseSection } from "../utils/release-notes";

export interface GithubReleaseMetadata {
  tagName: string;
  body?: string;
}

export function selectPreviewRelease(
  body: string,
): GithubReleaseMetadata | null {
  const releases: unknown = JSON.parse(body);
  if (!Array.isArray(releases)) {
    throw new Error("Release metadata must be an array");
  }
  let selected: GithubReleaseMetadata | null = null;
  for (const release of releases) {
    if (
      !release ||
      typeof release !== "object" ||
      release.draft !== false ||
      typeof release.prerelease !== "boolean" ||
      typeof release.tag_name !== "string" ||
      !parseVersion(release.tag_name)
    )
      continue;
    if (selected && compareVersions(release.tag_name, selected.tagName) <= 0)
      continue;
    selected = {
      tagName: release.tag_name,
      body:
        typeof release.body === "string"
          ? release.body.trim() || undefined
          : undefined,
    };
  }
  return selected;
}

export function resolveUpdateNotes(
  notes: UpdateInfo["releaseNotes"],
  version: string,
): string {
  const content =
    typeof notes === "string"
      ? notes.trim()
      : notes
          ?.find((entry) => compareVersions(entry.version, version) === 0)
          ?.note?.trim() || "";
  // A changelog is versioned evidence. Missing target notes must not be replaced
  // with an older beta or an unreleased draft section.
  return /^## \[[^\]\r\n]+\]/m.test(content)
    ? extractReleaseSection(content, version)
    : content;
}
