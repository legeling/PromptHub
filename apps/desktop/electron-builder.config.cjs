const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { extractReleaseSection } = require("./src/utils/release-notes.ts");
const { version } = require("./package.json");
const releaseNotes = extractReleaseSection(
  readFileSync(resolve(__dirname, "../../CHANGELOG.md"), "utf8"),
  version,
);
if (!releaseNotes) {
  throw new Error(`CHANGELOG.md must contain a release section for ${version}`);
}

const enableMacReleaseSigning =
  process.env.PROMPTHUB_MAC_RELEASE_SIGN === "true";

const macReleaseSigningConfig = enableMacReleaseSigning
  ? {
      hardenedRuntime: true,
      notarize: true,
      entitlements: "resources/entitlements.mac.plist",
      entitlementsInherit: "resources/entitlements.mac.inherit.plist",
    }
  : {
      hardenedRuntime: false,
      identity: null,
    };

module.exports = {
  appId: "com.prompthub.app",
  productName: "PromptHub",
  directories: {
    output: "dist",
    buildResources: "resources",
  },
  extraMetadata: {
    main: "out/main/index.js",
  },
  files: ["out/**/*"],
  extraResources: [
    {
      from: "resources/icon.ico",
      to: "icon.ico",
    },
    {
      from: "resources/icon.iconset",
      to: "icon.iconset",
    },
    {
      from: "resources/tray",
      to: "tray",
    },
    {
      from: "../../docs/imgs/icon.png",
      to: "icon.png",
    },
    {
      from: "../../CHANGELOG.md",
      to: "CHANGELOG.md",
    },
    {
      from: "resources/codex-dream-skin",
      to: "codex-dream-skin",
    },
  ],
  asarUnpack: ["**/*.node", "**/node-sqlite3-wasm/**"],
  asar: true,
  npmRebuild: false,
  nodeGypRebuild: false,
  mac: {
    target: [
      {
        target: "dmg",
        arch: ["x64", "arm64"],
      },
      {
        target: "zip",
        arch: ["x64", "arm64"],
      },
    ],
    artifactName: "${productName}-${version}-${arch}.${ext}",
    icon: "resources/icon.icns",
    category: "public.app-category.productivity",
    gatekeeperAssess: false,
    ...macReleaseSigningConfig,
  },
  win: {
    target: [
      {
        target: "nsis",
        arch: ["x64", "arm64"],
      },
    ],
    artifactName: "${productName}-Setup-${version}-${arch}.${ext}",
    icon: "resources/icon.ico",
  },
  linux: {
    target: [
      {
        target: "AppImage",
        arch: ["x64"],
      },
      {
        target: "deb",
        arch: ["x64"],
      },
    ],
    category: "Utility",
    artifactName: "${productName}-${version}-${arch}.${ext}",
  },
  appImage: {
    artifactName: "${productName}-${version}-x64.${ext}",
  },
  nsis: {
    guid: "16181c11-b075-53d6-87cb-f192f9b74217",
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    differentialPackage: false,
    include: "resources/installer.nsh",
  },
  publish: {
    provider: "github",
    owner: "legeling",
    repo: "PromptHub",
    releaseType: "release",
  },
  releaseInfo: {
    releaseNotes,
  },
};
