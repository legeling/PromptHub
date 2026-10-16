import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(process.cwd(), "../..");
const workflowSource = readFileSync(
  path.join(repositoryRoot, ".github/workflows/web-self-hosted.yml"),
  "utf8",
);
const rootPackage = JSON.parse(
  readFileSync(path.join(repositoryRoot, "package.json"), "utf8"),
) as { version: string };
const webPackage = JSON.parse(
  readFileSync(path.join(repositoryRoot, "apps/web/package.json"), "utf8"),
) as { version: string };

describe("self-hosted Web release workflow", () => {
  it("publishes versioned Web images after release publication without moving stable latest for prereleases", () => {
    expect(workflowSource).toContain('- "packages/core/**"');
    expect(workflowSource).toMatch(/^  release:\n    types: \[published\]/m);
    expect(workflowSource).not.toMatch(/^  push:/m);
    expect(workflowSource).toContain("type=semver,pattern={{version}}");
    expect(workflowSource).toContain("type=semver,pattern=v{{version}}");
    expect(workflowSource).toContain(
      "type=raw,value=latest,enable=${{ startsWith(github.ref, 'refs/tags/v') && !contains(github.ref_name, '-') }}",
    );
    expect(workflowSource).not.toContain(
      "type=raw,value=latest,enable=${{ startsWith(github.ref, 'refs/tags/v') }}",
    );
  });

  it("uses the root release version for Web builds and health responses", () => {
    const dockerfile = readFileSync(
      path.join(repositoryRoot, "apps/web/Dockerfile"),
      "utf8",
    );
    const appSource = readFileSync(
      path.join(repositoryRoot, "apps/web/src/app.ts"),
      "utf8",
    );

    expect(webPackage.version).toBe(rootPackage.version);
    expect(dockerfile).toContain("require('./package.json').version");
    expect(dockerfile).toContain(
      "COPY packages/core/package.json packages/core/package.json",
    );
    expect(dockerfile).toContain("COPY packages/core packages/core");
    expect(dockerfile).toContain(
      "COPY --from=builder /app/packages/core/src packages/core/src",
    );
    expect(appSource).toContain(
      "process.env.APP_VERSION || rootPackage.version",
    );
  });
});
