import { PROMPTHUB_CLOUD_API_URL } from "@prompthub/shared/constants/cloud";
import type {
  CloudStoreListing,
  CloudStorePackageResponse,
  RegistrySkill,
} from "@prompthub/shared/types";
import { isPromptHubCloudEnabled } from "../runtime";

export const PROMPTHUB_CLOUD_STORE_ID = "prompthub-cloud";
export const PROMPTHUB_CLOUD_STORE_URL = PROMPTHUB_CLOUD_API_URL;

export function normalizeSkillStoreSourceIdForRuntime(
  sourceId: string,
): string {
  return sourceId === PROMPTHUB_CLOUD_STORE_ID && !isPromptHubCloudEnabled()
    ? "official"
    : sourceId;
}

export function isCloudRegistrySkill(
  skill: Pick<RegistrySkill, "source_id">,
): boolean {
  return skill.source_id?.startsWith("cloud:") === true;
}

export function getCloudListingId(
  skill: Pick<RegistrySkill, "source_id">,
): string | null {
  if (!isCloudRegistrySkill(skill)) return null;
  const listingId = skill.source_id.slice("cloud:".length).trim();
  return listingId || null;
}

export function mapCloudListingToRegistrySkill(
  listing: CloudStoreListing,
): RegistrySkill | null {
  if (listing.sourceType !== "skill") return null;
  return {
    slug: listing.slug,
    name: listing.title,
    install_name: listing.slug,
    source_id: `cloud:${listing.id}`,
    source_label: "PromptHub Cloud",
    canonical_skill_path: "SKILL.md",
    description: listing.summary || listing.title,
    category: "general",
    icon_url: listing.coverImageUrl,
    author: "PromptHub Cloud",
    source_url: `cloud://store/listings/${listing.slug}`,
    store_url: `cloud://store/listings/${listing.slug}`,
    tags: listing.tags ?? [],
    version: listing.updatedAt || listing.publishedAt || "published",
    content: "",
  };
}

export async function getCloudStorePackage(
  skill: Pick<RegistrySkill, "source_id">,
  currentFingerprint?: string,
): Promise<CloudStorePackageResponse> {
  const listingId = getCloudListingId(skill);
  if (!listingId) throw new Error("CLOUD_STORE_SKILL_ID_INVALID");
  return window.api.cloud.store.getPackage(listingId, currentFingerprint);
}

export function getCloudSkillMarkdown(
  packageResponse: CloudStorePackageResponse,
): string {
  const skillFile = packageResponse.package.files.find(
    (file) => file.path.toLowerCase() === "skill.md",
  );
  if (!skillFile?.content.trim())
    throw new Error("CLOUD_STORE_SKILL_MD_MISSING");
  return skillFile.content;
}
