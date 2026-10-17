import type { SkillPackageReadErrorCode } from "../types/skill-package-read";

const patterns: ReadonlyArray<[SkillPackageReadErrorCode, RegExp]> = [
  ["github-rate-limit", /github.*rate limit|github.*http 429/i],
  ["github-authentication", /github.*(?:http (401|403)|bad credentials)/i],
  [
    "ssh-authentication",
    /permission denied \([^)]*publickey|no supported authentication methods|could not open a connection to your authentication agent/i,
  ],
  [
    "ssh-host-key",
    /host key verification failed|remote host identification has changed/i,
  ],
  [
    "git-ref-not-found",
    /remote branch .* not found|couldn't find remote ref|not a valid object name/i,
  ],
  [
    "repository-access",
    /repository .*not found|http 404|authentication failed|could not read username/i,
  ],
  ["tls-error", /certificate|unable_to_verify|cert_has_expired/i],
  [
    "package-limit",
    /too many (files|filesystem entries)|(?:file|total|directory|path|package).*limit exceeded|content exceeds size limit/i,
  ],
  [
    "proxy-unavailable",
    /(?:failed to connect|econnrefused|connect)[^\n]*(?:127\.0\.0\.1|localhost|::1)|proxy.*(?:refused|failed|unavailable)/i,
  ],
  ["network-timeout", /etimedout|timed out|timeout/i],
  [
    "permission-denied",
    /eacces|eperm|permission denied|http (401|403)|authentication failed/i,
  ],
  ["storage-full", /enospc|no space left|disk full/i],
  ["git-unavailable", /git_executable_unavailable/i],
  [
    "invalid-package",
    /traversal|skill\.md not found|invalid.*(?:package|zip)|duplicate path|one repository root/i,
  ],
  [
    "network-unavailable",
    /econn|enotfound|couldn't connect|failed to fetch|fetch failed|could not resolve host|connection refused|network|http \d{3}|http archive fallback failed/i,
  ],
  ["repository-access", /could not read from remote repository/i],
];

/** Stable messages survive Electron's Error serialization; diagnostics stay in main. */
export function getSkillPackageReadErrorCode(
  error: unknown,
): SkillPackageReadErrorCode {
  const message = error instanceof Error ? error.message : String(error);
  const marker = message.match(
    /(?:^|:\s)SKILL_PACKAGE_READ:([a-z-]+)(?:;|$)/,
  )?.[1];
  if (marker) {
    const known = patterns.find(([code]) => code === marker);
    if (known) return known[0];
  }
  for (const [code, pattern] of patterns) {
    if (message === `SKILL_PACKAGE_READ:${code}` || pattern.test(message))
      return code;
  }
  return "read-failed";
}
