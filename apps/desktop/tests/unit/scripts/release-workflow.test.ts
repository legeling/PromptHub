import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const workflowPath = path.resolve(
  process.cwd(),
  "../..",
  ".github/workflows/release.yml",
);

const workflowSource = readFileSync(workflowPath, "utf8");

function getIfLines(source: string): string[] {
  return source
    .split("\n")
    .map((line, index) => ({ line, lineNumber: index + 1 }))
    .filter(({ line }) => /^\s*if:/.test(line))
    .map(({ line, lineNumber }) => `${lineNumber}: ${line.trim()}`);
}

describe("release workflow secret guards", () => {
  it("does not read secret values from if expressions", () => {
    const unsafeIfLines = getIfLines(workflowSource).filter((line) =>
      /\b(?:env|secrets)\.(CLOUDFLARE_API_TOKEN|CLOUDFLARE_ACCOUNT_ID|HOMEBREW_TAP_TOKEN)\b/.test(
        line,
      ),
    );

    expect(unsafeIfLines).toEqual([]);
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
});
