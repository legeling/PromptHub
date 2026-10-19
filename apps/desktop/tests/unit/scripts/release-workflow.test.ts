import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const workflowPath = path.resolve(
  process.cwd(),
  "../..",
  ".github/workflows/release.yml",
);

const workflowSource = readFileSync(workflowPath, "utf8").replaceAll(
  "\r\n",
  "\n",
);
const packagedStartupSmokePath = path.resolve(
  process.cwd(),
  "scripts/smoke-windows-packaged-startup.mts",
);
const packagedStartupSmokeSource = readFileSync(
  packagedStartupSmokePath,
  "utf8",
);
const desktopMainSource = readFileSync(
  path.resolve(process.cwd(), "src/main/index.ts"),
  "utf8",
);

function getIfLines(source: string): string[] {
  return source
    .split("\n")
    .map((line, index) => ({ line, lineNumber: index + 1 }))
    .filter(({ line }) => /^\s*if:/.test(line))
    .map(({ line, lineNumber }) => `${lineNumber}: ${line.trim()}`);
}

describe("release workflow secret guards", () => {
  it("publishes curated version notes without appending generated commit summaries", () => {
    expect(workflowSource).toContain("releaseInfo.releaseNotes");
    expect(workflowSource).toContain("--notes-file release_notes.md");
    expect(workflowSource).not.toContain("--generate-notes");
  });

  it("requires the full release gate before publishing parallel platform builds", () => {
    expect(workflowSource).toContain("  verify:\n");
    expect(workflowSource).toContain("scripts/verification/ci.mts group");
    expect(workflowSource).toContain("scripts/verification/ci.mts merge");
    expect(workflowSource).toContain(
      "  release:\n    needs: [verify, build]\n",
    );
    expect(workflowSource).not.toContain("  build:\n    needs: verify\n");
  });

  it("does not read secret values from if expressions", () => {
    const unsafeIfLines = getIfLines(workflowSource).filter((line) =>
      /\b(?:env|secrets)\.(CLOUDFLARE_API_TOKEN|CLOUDFLARE_ACCOUNT_ID|HOMEBREW_TAP_TOKEN)\b/.test(
        line,
      ),
    );

    expect(unsafeIfLines).toEqual([]);
  });

  it("blocks Windows release artifacts on a packaged x64 two-launch upgrade smoke", () => {
    expect(workflowSource).toContain(
      "Run packaged Windows x64 two-launch upgrade startup smoke",
    );
    expect(workflowSource).toContain(
      "node --experimental-strip-types scripts/smoke-windows-packaged-startup.mts",
    );
    expect(workflowSource).toContain(
      "matrix.platform == 'win' && matrix.arch == 'x64'",
    );
    expect(packagedStartupSmokeSource).toContain(
      'expectedCanonicalStatus: "waiting-renderer-migration"',
    );
    expect(packagedStartupSmokeSource).toContain(
      'expectedCanonicalStatus: "already-canonical"',
    );
    expect(packagedStartupSmokeSource).toContain(
      'expectedMigrationStatus: "migrated"',
    );
    expect(packagedStartupSmokeSource).toContain(
      'expectedMigrationStatus: "already-complete"',
    );
    expect(
      packagedStartupSmokeSource.match(/await launchPackagedApp\(/g) ?? [],
    ).toHaveLength(2);
  });

  it("loads the packaged startup smoke with Node strip-types", () => {
    const result = spawnSync(
      process.execPath,
      [
        "--experimental-strip-types",
        packagedStartupSmokePath,
        path.join(
          tmpdir(),
          `prompthub-missing-${randomUUID()}`,
          "PromptHub.exe",
        ),
      ],
      { encoding: "utf8" },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      process.platform === "win32"
        ? "Packaged PromptHub executable not found:"
        : "The packaged Windows startup smoke must run on Windows",
    );
    expect(result.stderr).not.toContain("ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX");
  });

  it("routes the packaged smoke through an isolated Electron AppData root", () => {
    const environmentKey = "PROMPTHUB_PACKAGED_STARTUP_SMOKE_APP_DATA";

    expect(packagedStartupSmokeSource).toContain(environmentKey);
    expect(desktopMainSource).toContain("resolvePackagedStartupSmokeSetup");
    expect(desktopMainSource).toContain('app.setPath("appData"');
  });

  it("retries only known transient Apple packaging failures", () => {
    expect(workflowSource).toContain("MAC_PACKAGE_RETRY_LIMIT=3");
    expect(workflowSource).toContain("The timestamp service is not available");
    expect(workflowSource).toContain("Could not find base64 encoded ticket");
    expect(workflowSource).toContain(
      "Failed to staple your application with code: 65",
    );
    expect(workflowSource).toContain("MAC_PACKAGE_RETRY_DELAY_SECONDS=60");
    expect(workflowSource).toContain(
      'if [ "$package_attempt" -ge "$MAC_PACKAGE_RETRY_LIMIT" ] || [ -z "$retry_reason" ]; then',
    );
    expect(workflowSource).toContain('exit "$package_status"');
  });

  it("gates optional publishers through non-secret readiness outputs", () => {
    expect(workflowSource).toContain("id: publish_secrets");
    expect(workflowSource).toContain(
      "homebrew_ready=${HOMEBREW_TAP_TOKEN:+true}",
    );
    expect(workflowSource).toContain(
      'r2_ready=$([ -n "${CLOUDFLARE_API_TOKEN:-}" ] && [ -n "${CLOUDFLARE_ACCOUNT_ID:-}" ] && echo true || echo false)',
    );

    const ifLines = getIfLines(workflowSource).join("\n");
    expect(ifLines).toContain("steps.publish_secrets.outputs.homebrew_ready");
    expect(ifLines).toContain("steps.publish_secrets.outputs.r2_ready");
  });

  it("replaces an existing same-tag release in place while preserving draft state", () => {
    expect(workflowSource).toContain(
      'if gh release view "${GITHUB_REF_NAME}" >/dev/null 2>&1; then',
    );
    expect(workflowSource).toContain(
      'IS_DRAFT=$(gh release view "${GITHUB_REF_NAME}" --json isDraft -q .isDraft)',
    );
    expect(workflowSource).toContain("--draft=${IS_DRAFT}");
    expect(workflowSource).toContain('gh release upload "${GITHUB_REF_NAME}"');
    expect(workflowSource).toContain("--clobber");
    expect(workflowSource).toContain("--draft=true");
    expect(workflowSource).not.toContain(
      "gh release edit ${GITHUB_REF_NAME} --draft=false",
    );
  });
});
