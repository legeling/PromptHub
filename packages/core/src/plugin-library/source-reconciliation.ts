import fs from "fs";

import type {
  PluginMarketPreview,
  PluginSourceUpdateCheck,
} from "@prompthub/shared/types/plugin";

import type { SourcePackageMaterializer } from "./shared";
import { CorePluginError } from "./shared";
import { assertReadableDirectory } from "./distribution";
import {
  computePluginPackageFingerprint,
  normalizePluginSourceImportRequest,
} from "./package-materialization";
import {
  findLocalPluginMarker,
  readLocalPluginManifest,
  validateLocalPluginPackage,
} from "./package-validation";

export function getPluginPackageUpdateSignals(input: {
  installedManifestHash: string;
  installedPackageHash?: string;
  localPackageHash?: string;
  remoteManifestHash: string;
  remotePackageHash?: string;
}): Pick<PluginSourceUpdateCheck, "localModified" | "remoteChanged"> {
  const hasPackageBaseline = Boolean(input.installedPackageHash);
  const canCompareLegacyPackages = Boolean(
    !hasPackageBaseline && input.remotePackageHash && input.localPackageHash,
  );
  const legacyPackagesDiffer = Boolean(
    canCompareLegacyPackages &&
    input.remotePackageHash !== input.localPackageHash,
  );
  const localModified = hasPackageBaseline
    ? Boolean(
        input.localPackageHash &&
        input.localPackageHash !== input.installedPackageHash,
      )
    : legacyPackagesDiffer;
  const remoteChanged = hasPackageBaseline
    ? Boolean(
        input.remotePackageHash
          ? input.remotePackageHash !== input.installedPackageHash
          : input.remoteManifestHash !== input.installedManifestHash,
      )
    : canCompareLegacyPackages
      ? legacyPackagesDiffer
      : input.remoteManifestHash !== input.installedManifestHash;
  return { localModified, remoteChanged };
}

export async function attachMarketSourcePackageHash(
  preview: PluginMarketPreview,
  materializeSourcePackage: SourcePackageMaterializer,
): Promise<PluginMarketPreview> {
  const repository = preview.entry.source.repository;
  const packagePath = preview.entry.source.packagePath;
  if (preview.entry.source.archive) return preview;
  if (!repository || !packagePath) return preview;

  const request = normalizePluginSourceImportRequest({
    branch: preview.entry.source.branch,
    revision: preview.entry.source.revision,
    packagePath,
    url: repository,
  });
  const sourcePackage = await materializeSourcePackage(request);
  try {
    assertReadableDirectory(sourcePackage.sourcePath, "Plugin market package");
    const markerPath = findLocalPluginMarker(sourcePackage.sourcePath);
    if (!markerPath) {
      throw new CorePluginError(
        "MISSING_MANIFEST",
        `没有找到可识别的 Plugin manifest: ${preview.displayName}`,
      );
    }
    const { manifest } = readLocalPluginManifest(markerPath);
    validateLocalPluginPackage(sourcePackage.sourcePath, manifest);
    return {
      ...preview,
      sourcePackageHash: computePluginPackageFingerprint(
        sourcePackage.sourcePath,
      ),
    };
  } finally {
    if (sourcePackage.cleanupPath) {
      fs.rmSync(sourcePackage.cleanupPath, { recursive: true, force: true });
    }
  }
}
