import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const websiteRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(websiteRoot, "..");

const rootPackagePath = path.join(repoRoot, "package.json");
const rootChangelogPath = path.join(repoRoot, "CHANGELOG.md");
const generatedReleasePath = path.join(
  websiteRoot,
  "src/generated/release.ts",
);
const websiteChangelogPath = path.join(
  websiteRoot,
  "src/content/docs/changelog.md",
);
const zhIntroPath = path.join(websiteRoot, "src/content/docs/introduction.md");
const enIntroPath = path.join(
  websiteRoot,
  "src/content/docs/en/introduction.md",
);

const rootPackage = JSON.parse(fs.readFileSync(rootPackagePath, "utf8"));
const changelog = fs.readFileSync(rootChangelogPath, "utf8");
const version = rootPackage.version;
const releaseTag = `v${version}`;
const isPrerelease = version.includes("-");

// Stable releases publish a fixed-filename mirror to a CDN bucket so the
// website download buttons can point at version-less URLs that never expire.
// Prerelease tags stay on GitHub Releases — the CDN mirror is stable-only by
// policy (see .github/workflows/release.yml `Sync stable artifacts to R2`).
//
// The CDN mirror only starts accepting uploads once the release CI pipeline
// runs after the bucket bootstrap is in place, so we keep an opt-in flag
// (PROMPTHUB_USE_CDN_MIRROR) that defaults off until v0.5.7 ships. Set it
// to "1" before running this script once the mirror has its first set of
// stable artifacts.
const USE_CDN_MIRROR = process.env.PROMPTHUB_USE_CDN_MIRROR === "1";
const CDN_PUBLIC_BASE = "https://pub-fff1cbc0121241d480624bd3de5a2735.r2.dev";

const githubReleaseDownloadBase = isPrerelease
  ? `https://github.com/legeling/PromptHub/releases/download/${releaseTag}`
  : "https://github.com/legeling/PromptHub/releases/latest/download";

const downloadUrls =
  !isPrerelease && USE_CDN_MIRROR
    ? {
        // Stable + CDN: hit the public mirror directly. The release CI uploads
        // these version-less filenames into the latest/ prefix on every
        // stable tag.
        macArm64: `${CDN_PUBLIC_BASE}/latest/PromptHub-arm64.dmg`,
        macX64: `${CDN_PUBLIC_BASE}/latest/PromptHub-x64.dmg`,
        windowsX64: `${CDN_PUBLIC_BASE}/latest/PromptHub-Setup-x64.exe`,
        windowsArm64: `${CDN_PUBLIC_BASE}/latest/PromptHub-Setup-arm64.exe`,
        linuxAppImage: `${CDN_PUBLIC_BASE}/latest/PromptHub-x64.AppImage`,
        linuxDeb: `${CDN_PUBLIC_BASE}/latest/PromptHub-amd64.deb`,
      }
    : {
        macArm64: `${githubReleaseDownloadBase}/PromptHub-${version}-arm64.dmg`,
        macX64: `${githubReleaseDownloadBase}/PromptHub-${version}-x64.dmg`,
        windowsX64: `${githubReleaseDownloadBase}/PromptHub-Setup-${version}-x64.exe`,
        windowsArm64: `${githubReleaseDownloadBase}/PromptHub-Setup-${version}-arm64.exe`,
        linuxAppImage: `${githubReleaseDownloadBase}/PromptHub-${version}-x64.AppImage`,
        linuxDeb: `${githubReleaseDownloadBase}/PromptHub-${version}-amd64.deb`,
      };

const latestHeaderMatch = changelog.match(
  /^## \[(\d+\.\d+\.\d+(?:-[a-zA-Z0-9.]+)?)\] - (\d{4}-\d{2}-\d{2})/m,
);
const releaseDate = latestHeaderMatch?.[2] ?? "";

const generatedReleaseSource = `export const RELEASE_VERSION = "${version}";
export const RELEASE_TAG = "${releaseTag}";
export const RELEASE_DATE = "${releaseDate}";

export const HERO_VERSION_BADGE = {
  zh: "${releaseTag} 版已发布",
  en: "${releaseTag} Released",
} as const;

export const RELEASE_DOWNLOAD_URLS = {
  macArm64:
    "${downloadUrls.macArm64}",
  macX64:
    "${downloadUrls.macX64}",
  windowsX64:
    "${downloadUrls.windowsX64}",
  windowsArm64:
    "${downloadUrls.windowsArm64}",
  linuxAppImage:
    "${downloadUrls.linuxAppImage}",
  linuxDeb:
    "${downloadUrls.linuxDeb}",
} as const;
`;

fs.mkdirSync(path.dirname(generatedReleasePath), { recursive: true });
fs.writeFileSync(generatedReleasePath, generatedReleaseSource);
fs.writeFileSync(websiteChangelogPath, changelog);

const zhIntro = fs
  .readFileSync(zhIntroPath, "utf8")
  .replace(
    /### 🧩 Skill 技能管理（v\d+\.\d+\.\d+(?:-[A-Za-z0-9.]+)?）/,
    `### 🧩 Skill 技能管理（${releaseTag}）`,
  );
fs.writeFileSync(zhIntroPath, zhIntro);

const enIntro = fs
  .readFileSync(enIntroPath, "utf8")
  .replace(
    /### 🧩 Skill Management \(v\d+\.\d+\.\d+(?:-[A-Za-z0-9.]+)?\)/,
    `### 🧩 Skill Management (${releaseTag})`,
  );
fs.writeFileSync(enIntroPath, enIntro);

console.log(
  `[website] synced release metadata: ${releaseTag}${releaseDate ? ` (${releaseDate})` : ""}`,
);
