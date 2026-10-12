import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { findLatestStableRelease } from "../website/scripts/release-metadata.mjs";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const expectedVersion = readJson("package.json").version;
const productReadmes = [
  "README.md",
  "docs/README.en.md",
  "docs/README.zh-TW.md",
  "docs/README.ja.md",
  "docs/README.de.md",
  "docs/README.es.md",
  "docs/README.fr.md",
];

function readJson(relativePath) {
  return JSON.parse(
    fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8"),
  );
}

function readText(relativePath) {
  return fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8");
}

test("keeps main on the 0.6.0 release line after contribution merges", () => {
  assert.match(expectedVersion, /^0\.6\.0(?:-[0-9A-Za-z.-]+)?$/);
});

test("keeps every shipped distribution on the release candidate version", () => {
  for (const relativePath of [
    "package.json",
    "apps/desktop/package.json",
    "apps/cli/package.json",
    "apps/web/package.json",
    "apps/web-cloudflare/package.json",
    "apps/mobile/package.json",
  ]) {
    assert.equal(readJson(relativePath).version, expectedVersion, relativePath);
  }
  assert.equal(readJson("apps/mobile/app.json").expo.version, expectedVersion);
});

test("keeps the standalone CLI runtime version aligned", () => {
  const source = fs.readFileSync(
    path.join(repositoryRoot, "packages/core/src/cli/types.ts"),
    "utf8",
  );
  assert.match(
    source,
    new RegExp(
      `export const CLI_VERSION = ["']${expectedVersion.replaceAll(".", String.raw`\.`)}["']`,
    ),
  );
});

test("separates development identity from published downloads in every README", () => {
  const stableRelease = findLatestStableRelease(
    readText("CHANGELOG.md"),
    readText("spec/releases/README.md"),
  );
  const developmentBadge = `development-v${expectedVersion.replaceAll("-", "--")}`;
  const stableBadge = `release-v${stableRelease.version}_stable`;

  for (const relativePath of productReadmes) {
    const source = readText(relativePath);
    const changelogPath = relativePath.startsWith("docs/")
      ? "../CHANGELOG.md#unreleased"
      : "./CHANGELOG.md#unreleased";
    assert.ok(source.includes(developmentBadge), relativePath);
    assert.ok(source.includes(stableBadge), relativePath);
    assert.ok(source.includes(changelogPath), relativePath);
    assert.ok(source.includes(`\`${expectedVersion}\``), relativePath);
    assert.ok(source.includes("releases/latest/download/"), relativePath);
    assert.doesNotMatch(source, /releases\/tag\/v0\.6\.[1-9]/, relativePath);
    assert.doesNotMatch(source, /^(?:<{7}|={7}|>{7})/m, relativePath);
  }
});

test("publishes main-only changes as unreleased and synchronizes website history", () => {
  const changelog = readText("CHANGELOG.md");
  const unreleased = changelog.match(
    /^## \[Unreleased\]\r?\n([\s\S]*?)(?=^## \[)/m,
  );
  assert.ok(unreleased, "The changelog must separate unreleased main changes");
  assert.ok(unreleased[1].includes("0.6.0"));
  assert.ok(unreleased[1].includes("###"));
  assert.equal(readText("website/src/content/docs/changelog.md"), changelog);

  const stableRelease = findLatestStableRelease(
    changelog,
    readText("spec/releases/README.md"),
  );
  assert.ok(
    readText("website/src/generated/release.ts").includes(
      `export const RELEASE_VERSION = "${stableRelease.version}";`,
    ),
    "Website downloads must still use the explicit published stable record",
  );
});
