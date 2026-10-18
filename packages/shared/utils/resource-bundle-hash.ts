import { sha256HexSync } from "./mcp-entry-sha256";

interface BundleHashInput {
  resourceType: string;
  resourceId: string;
  schemaVersion: number;
  revision: number;
  objectHashes: string[];
  payloadFiles: Array<{
    path: string;
    size: number;
    sha256: string;
    role?: string;
  }>;
}

export function calculateResourceBundleContentHash(
  manifest: BundleHashInput,
): string {
  return sha256HexSync(
    JSON.stringify({
      algorithm: "prompthub-resource-content-sha256-v1",
      resourceType: manifest.resourceType,
      resourceId: manifest.resourceId,
      schemaVersion: manifest.schemaVersion,
      revision: manifest.revision,
      objectHashes: [...manifest.objectHashes].sort(),
      payloadFiles: [...manifest.payloadFiles]
        .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
        .map(({ path, size, sha256, role }) => ({
          path,
          size,
          sha256,
          ...(role === undefined ? {} : { role }),
        })),
    }),
  );
}
