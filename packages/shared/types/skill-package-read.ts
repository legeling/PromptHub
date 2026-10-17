export type SkillPackageReadErrorCode =
  | "github-rate-limit"
  | "github-authentication"
  | "repository-access"
  | "ssh-authentication"
  | "ssh-host-key"
  | "git-ref-not-found"
  | "tls-error"
  | "package-limit"
  | "proxy-unavailable"
  | "network-timeout"
  | "network-unavailable"
  | "permission-denied"
  | "storage-full"
  | "invalid-package"
  | "git-unavailable"
  | "read-failed";

export type SkillPackageReadResponse<T> =
  | { ok: true; value: T }
  | { ok: false; errorCode: SkillPackageReadErrorCode };
