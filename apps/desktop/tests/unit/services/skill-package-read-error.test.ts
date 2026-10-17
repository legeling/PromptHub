import { describe, expect, it } from "vitest";
import i18next from "i18next";
import { getSkillPackageReadErrorCode } from "@prompthub/shared/utils/skill-package-read-error";
import { formatSkillPackageOperationError } from "../../../src/renderer/services/skill-package-operation";
import zh from "../../../src/renderer/i18n/locales/zh.json";

describe("Skill package download error feedback", () => {
  it.each([
    [
      "Error invoking remote method 'skill:getRemoteGitPackageSnapshot': Error: Skill package contains too many files",
      "package-limit",
    ],
    [
      "Git clone failed: Failed to connect to 127.0.0.1 port 7892; HTTP archive fallback failed: connect ETIMEDOUT 20.205.243.166:443",
      "proxy-unavailable",
    ],
    ["connect ETIMEDOUT", "network-timeout"],
    ["Remote content exceeds size limit", "package-limit"],
    ["HTTP 404 fetching remote content", "repository-access"],
    ["GitHub HTTP 401 fetching remote content", "github-authentication"],
    ["GitHub HTTP 403 fetching remote content", "github-authentication"],
    ["GitHub API rate limit reached", "github-rate-limit"],
    ["Permission denied (publickey).", "ssh-authentication"],
    ["Host key verification failed.", "ssh-host-key"],
    ["Remote branch missing not found in upstream origin", "git-ref-not-found"],
    [
      "SSL certificate problem: unable to get local issuer certificate",
      "tls-error",
    ],
    [
      "SKILL_PACKAGE_READ:github-authentication; Git failed: connect ETIMEDOUT",
      "github-authentication",
    ],
    ["EACCES /private/user/token", "permission-denied"],
    ["ENOSPC", "storage-full"],
    ["Path traversal detected", "invalid-package"],
    ["ENOTFOUND", "network-unavailable"],
    [
      "ssh: Could not resolve hostname github.com; fatal: Could not read from remote repository",
      "network-unavailable",
    ],
    ["GIT_EXECUTABLE_UNAVAILABLE", "git-unavailable"],
    [
      "Error invoking remote method 'skill:scanRemoteGithub': Error: SKILL_PACKAGE_READ:ssh-authentication; bounded diagnostic",
      "ssh-authentication",
    ],
    ["unexpected internal failure at /private/profile", "read-failed"],
  ])(
    "classifies and localizes %s without exposing internal details",
    async (message, code) => {
      const i18n = i18next.createInstance();
      await i18n.init({ lng: "zh", resources: { zh: { translation: zh } } });
      expect(getSkillPackageReadErrorCode(new Error(message))).toBe(code);
      const displayed = formatSkillPackageOperationError(
        new Error(message),
        i18n.t,
      );
      expect(displayed).toBe(i18n.t(`skill.packageReadError.${code}`));
      expect(displayed).not.toMatch(
        /remote method|127\.0\.0\.1|private|ETIMEDOUT/,
      );
      expect(
        formatSkillPackageOperationError(
          new Error(`SKILL_PACKAGE_READ:${code}`),
          i18n.t,
        ),
      ).toBe(displayed);
    },
  );
});
