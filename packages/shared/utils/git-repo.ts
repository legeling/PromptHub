export interface ParsedGitRepo {
  host: string;
  /** Complete namespace, including nested GitLab groups. */
  owner: string;
  repo: string;
  repositoryUrl: string;
  cloneUrl: string;
  protocol: "http" | "https" | "ssh";
}

export interface ParsedGitHubTreeLocation {
  branch: string;
  directory?: string;
}

function parseRepositoryPath(
  value: string,
): { owner: string; repo: string } | null {
  const parts = value
    .replace(/\/$/, "")
    .replace(/\.git$/, "")
    .split("/");
  if (
    parts.length < 2 ||
    parts.some(
      (part) =>
        !/^[A-Za-z0-9_.-]+$/.test(part) || part === "." || part === "..",
    )
  )
    return null;
  return { owner: parts.slice(0, -1).join("/"), repo: parts[parts.length - 1] };
}

export function parseGitRepo(url: string): ParsedGitRepo | null {
  const trimmed = url.trim();
  if (!trimmed || /[\u0000-\u0020\u007f\\]/u.test(trimmed)) {
    return null;
  }

  const sshMatch = trimmed.match(/^git@([A-Za-z0-9_.-]+):(.+)$/);
  if (sshMatch) {
    const repository = parseRepositoryPath(sshMatch[2]);
    if (!repository) return null;
    return {
      host: sshMatch[1].toLowerCase(),
      ...repository,
      repositoryUrl: `https://${sshMatch[1]}/${repository.owner}/${repository.repo}`,
      cloneUrl: trimmed,
      protocol: "ssh",
    };
  }

  return parseHttpRepository(trimmed);
}

function parseHttpRepository(value: string): ParsedGitRepo | null {
  const match = value.match(/^(https?):\/\/([^/?#]+)\/([^?#]+)$/);
  if (!match) return null;
  const protocol = match[1];
  if (protocol !== "http" && protocol !== "https") return null;
  try {
    new URL(value);
  } catch {
    return null;
  }
  // Preserve existing GitHub/Gitea tree links; group paths otherwise retain all segments.
  const repositoryPath = match[3].replace(
    /^([^/]+\/[^/]+)\/tree\/[^/]+(?:\/.*)?$/,
    "$1",
  );
  const repository = parseRepositoryPath(repositoryPath);
  if (!repository) return null;
  if (isGitHubHost(match[2]) && repository.owner.includes("/")) return null;
  const repositoryUrl = `${protocol}://${match[2]}/${repository.owner}/${repository.repo}`;
  return {
    host: match[2].toLowerCase(),
    ...repository,
    repositoryUrl,
    cloneUrl: repositoryUrl,
    protocol,
  };
}

export function isGitHubHost(host: string): boolean {
  return host.toLowerCase() === "github.com";
}

export function parseGitHubTreeLocation(
  url: string,
): ParsedGitHubTreeLocation | null {
  try {
    const parsed = new URL(url.trim());
    if (!isGitHubHost(parsed.hostname)) {
      return null;
    }

    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length < 4 || parts[2] !== "tree") {
      return null;
    }

    const branch = parts[3]?.trim();
    if (!branch) {
      return null;
    }

    const directory = parts.slice(4).join("/").trim() || undefined;
    return { branch, directory };
  } catch {
    return null;
  }
}
