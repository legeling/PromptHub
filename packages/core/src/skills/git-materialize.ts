import * as fs from "node:fs/promises";
import * as path from "node:path";
import { parseGitRepo } from "@prompthub/shared/utils/git-repo";
import { getSkillPackageReadErrorCode } from "@prompthub/shared/utils/skill-package-read-error";
import {
  sanitizeSkillPackageDiagnostic,
  sanitizeSkillPackageSourceUrl,
} from "./package-operation";
import { extractSkillZipArchive } from "./archive";
import {
  cloneSkillRepository,
  GitExecutableUnavailableError,
} from "./git-transport";
import { SkillPackageTransportError } from "./transport-error";
import { validateSkillGitDirectory } from "./git-source";
import { shouldIgnoreSkillDirectoryEntry } from "@prompthub/shared/utils/skill-identity";
type FetchArchive = (url: string) => Promise<Uint8Array>;

// Only owned disposable checkouts are modified. Unlink rather than dereference
// so direct publication retains the former copy filter without copying bytes.
async function removeCheckoutSymlinks(root: string): Promise<void> {
  const pending = [root];
  while (pending.length) {
    const directory = pending.pop()!;
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (shouldIgnoreSkillDirectoryEntry(path.relative(root, target)))
        continue;
      if (entry.isSymbolicLink()) await fs.unlink(target);
      else if (entry.isDirectory()) pending.push(target);
    }
  }
}
export function buildGitArchiveUrl(
  repo: NonNullable<ReturnType<typeof parseGitRepo>>,
  branch?: string,
): string | null {
  if (repo.protocol !== "https") return null;
  const repositoryUrl = sanitizeSkillPackageSourceUrl(repo.repositoryUrl)
    .replace(/\.git\/?$/iu, "")
    .replace(/\/$/u, "");
  const ref = encodeURIComponent(branch?.trim() || "HEAD");
  if (repo.host === "github.com") {
    return `https://codeload.github.com/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}/zip/${ref}`;
  }
  if (repo.host === "gitlab.com") {
    const archiveName = `${encodeURIComponent(repo.repo)}-${ref}.zip`;
    return `${repositoryUrl}/-/archive/${ref}/${archiveName}`;
  }
  return `${repositoryUrl}/archive/${ref}.zip`;
}

async function resolveArchiveCheckoutRoot(extractDir: string): Promise<string> {
  const entries = await fs.readdir(extractDir, { withFileTypes: true });
  if (entries.length !== 1 || !entries[0]?.isDirectory()) {
    throw new Error("Git archive must contain one repository root directory");
  }
  return path.join(extractDir, entries[0].name);
}

function dualTransportError(gitError: unknown, httpError: unknown) {
  const gitDiagnostic = sanitizeSkillPackageDiagnostic(gitError);
  const httpDiagnostic = sanitizeSkillPackageDiagnostic(httpError);
  const httpCode = getSkillPackageReadErrorCode(httpError);
  const gitCode = getSkillPackageReadErrorCode(gitError);
  const code =
    (httpCode === "network-timeout" || httpCode === "network-unavailable") &&
    gitCode === "proxy-unavailable"
      ? gitCode
      : httpCode;
  return new SkillPackageTransportError(
    "git-http-fallback-failed",
    `SKILL_PACKAGE_READ:${code}; HTTP archive fallback failed: ${httpDiagnostic}; Git transport failed: ${gitDiagnostic}`,
  );
}

export async function materializeRemoteGitRepository(
  repo: NonNullable<ReturnType<typeof parseGitRepo>>,
  branch: string | undefined,
  tempRoot: string,
  fetchArchive: FetchArchive,
  requestedDirectory?: string,
  clone: typeof cloneSkillRepository = cloneSkillRepository,
): Promise<string> {
  if (requestedDirectory !== undefined)
    validateSkillGitDirectory(requestedDirectory);
  const cloneDir = path.join(tempRoot, `${repo.owner}-${repo.repo}`);
  try {
    await clone(repo.cloneUrl, cloneDir, branch, requestedDirectory);
  } catch (gitError) {
    const archiveUrl = buildGitArchiveUrl(repo, branch);
    if (!archiveUrl) {
      if (gitError instanceof GitExecutableUnavailableError) {
        throw new SkillPackageTransportError(
          "git-unavailable",
          gitError.message,
        );
      }
      throw gitError;
    }

    let archiveBytes: Uint8Array;
    try {
      archiveBytes = await fetchArchive(archiveUrl);
    } catch (httpError) {
      throw dualTransportError(gitError, httpError);
    }
    const extractDir = path.join(tempRoot, "http-archive");
    await extractSkillZipArchive(
      archiveBytes,
      extractDir,
      requestedDirectory === undefined
        ? undefined
        : {
            repositoryDirectory:
              requestedDirectory === "." ? "" : requestedDirectory,
          },
    );
    return resolveArchiveCheckoutRoot(extractDir);
  }
  await removeCheckoutSymlinks(cloneDir);
  return cloneDir;
}
