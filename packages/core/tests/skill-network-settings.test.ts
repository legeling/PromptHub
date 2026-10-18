import { afterEach, expect, it, vi } from "vitest";
import {
  skillGitEnvironment,
  resolveSkillProxyUrl,
  skillFetchOptions,
} from "../src/skills/network-settings";
import { shouldAttachGithubAuth } from "../src/skills/remote-fetch";
import { sanitizeSkillPackageDiagnostic } from "../src/skills/package-operation";

afterEach(() => vi.unstubAllEnvs());

it("uses configured proxy and scoped GitHub credentials without mutating the parent environment", () => {
  vi.stubEnv("GIT_CONFIG_COUNT", "1");
  vi.stubEnv("GIT_CONFIG_KEY_0", "core.autocrlf");
  vi.stubEnv("GIT_CONFIG_VALUE_0", "false");
  const settings = {
    githubToken: "fixture-token",
    networkProxy: {
      mode: "manual",
      protocol: "http",
      host: "127.0.0.1",
      port: 8899,
      bypass: "example.org",
    },
  };
  const env = skillGitEnvironment("https://github.com/acme/skills", settings);
  expect(env.GIT_CONFIG_COUNT).toBe("3");
  expect(env.GIT_CONFIG_KEY_0).toBe("core.autocrlf");
  expect(env.GIT_CONFIG_KEY_1).toBe("http.proxy");
  expect(env.GIT_CONFIG_VALUE_1).toBe("http://127.0.0.1:8899");
  expect(env.GIT_CONFIG_KEY_2).toBe("http.https://github.com/.extraHeader");
  expect(env.GIT_CONFIG_VALUE_2).toBe(
    `Authorization: Basic ${Buffer.from("x-access-token:fixture-token").toString("base64")}`,
  );
  expect(process.env.GIT_CONFIG_COUNT).toBe("1");
  expect(
    skillGitEnvironment("git@github.com:acme/skills.git", settings)
      .GIT_CONFIG_COUNT,
  ).toBe("1");
  expect(
    skillGitEnvironment("https://example.org/acme/skills", settings)
      .GIT_CONFIG_VALUE_1,
  ).toBe("");
  expect(skillFetchOptions(settings).githubToken).toBe("fixture-token");
  expect(shouldAttachGithubAuth("api.github.com")).toBe(true);
  expect(shouldAttachGithubAuth("github.com.evil.example")).toBe(false);
  expect(shouldAttachGithubAuth("codeload.github.com")).toBe(false);
  expect(sanitizeSkillPackageDiagnostic(env.GIT_CONFIG_VALUE_2)).toBe(
    "Authorization: Basic [REDACTED]",
  );
});

it("honors direct mode and proxy bypass in system mode", () => {
  vi.stubEnv("https_proxy", "http://127.0.0.1:1234");
  vi.stubEnv("no_proxy", "example.org");
  expect(
    resolveSkillProxyUrl(new URL("https://github.com"), { mode: "direct" }),
  ).toBeUndefined();
  expect(
    resolveSkillProxyUrl(new URL("https://github.com"), { mode: "system" }),
  ).toBe("http://127.0.0.1:1234");
  expect(
    resolveSkillProxyUrl(new URL("https://example.org"), { mode: "system" }),
  ).toBeUndefined();
});
