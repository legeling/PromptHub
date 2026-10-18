import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { detectCiSurfaces } from "./detect-ci-surfaces.mjs";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

test("maps direct app changes to their owning surface", () => {
  assert.deepEqual(detectCiSurfaces(["apps/cli/src/run.ts"]), {
    shared: false,
    desktop: false,
    cli: true,
    mobile: false,
  });
});

test("fans shared and core changes out to their consumers", () => {
  assert.deepEqual(detectCiSurfaces(["packages/shared/types/agent.ts"]), {
    shared: true,
    desktop: true,
    cli: true,
    mobile: true,
  });
  assert.deepEqual(detectCiSurfaces(["packages/core/src/database.ts"]), {
    shared: true,
    desktop: true,
    cli: true,
    mobile: false,
  });
});

test("fans root build changes out but leaves documentation to governance", () => {
  assert.deepEqual(detectCiSurfaces(["pnpm-lock.yaml"]), {
    shared: true,
    desktop: true,
    cli: true,
    mobile: true,
  });
  assert.deepEqual(detectCiSurfaces(["docs/README.md"]), {
    shared: false,
    desktop: false,
    cli: false,
    mobile: false,
  });
});

test("fails safe for unknown paths and uses the shared graph for web consumers", () => {
  assert.deepEqual(detectCiSurfaces(["future/product/file.ts"]), {
    shared: true,
    desktop: true,
    cli: true,
    mobile: true,
  });
  assert.deepEqual(detectCiSurfaces(["apps/web/src/index.ts"]), {
    shared: false,
    desktop: false,
    cli: false,
    mobile: false,
  });
});

test("quality workflow preserves unconditional governance and surface gates", () => {
  const workflow = fs.readFileSync(
    path.join(rootDir, ".github/workflows/quality.yml"),
    "utf8",
  );

  assert.match(workflow, /scripts\/detect-ci-surfaces\.mjs/);
  assert.match(workflow, /governance:/);
  assert.match(workflow, /--profile quick --surface governance/);
  assert.match(workflow, /shared-verify:/);
  assert.match(workflow, /--surface shared --surface database --surface core/);
  assert.match(workflow, /cli-verify:/);
  assert.match(workflow, /--profile release --surface cli/);
  assert.match(workflow, /mobile-verify:/);
  assert.match(workflow, /--profile quick --surface mobile/);
  assert.match(workflow, /desktop-verify:/);
  assert.match(workflow, /--profile release --surface desktop/);
});

test("Cloudflare Worker workflow has an independent bounded gate", () => {
  const workflow = fs.readFileSync(
    path.join(rootDir, ".github/workflows/web-cloudflare.yml"),
    "utf8",
  );

  assert.match(workflow, /apps\/web-cloudflare\/\*\*/);
  assert.doesNotMatch(workflow, /docker/);
  assert.match(
    workflow,
    /--profile quick --surface web-cloudflare --exclude-layer governance/,
  );
});

test("quality gates provision the same history and credentials as release checks", () => {
  const workflow = fs.readFileSync(
    path.join(rootDir, ".github/workflows/quality.yml"),
    "utf8",
  );
  const shared = workflow
    .split("  shared-verify:")[1]
    .split("  cli-verify:")[0];
  const desktop = workflow.split("  desktop-verify:")[1];
  assert.match(shared, /fetch-depth: 0/);
  assert.match(shared, /dbus-run-session --/);
  assert.match(shared, /gnome-keyring-daemon --unlock --components=secrets/);
  assert.match(desktop, /fetch-depth: 0/);
  assert.match(
    desktop,
    /apt-get install --no-install-recommends -y gnome-keyring/,
  );
  assert.match(desktop, /dbus-run-session --/);
  assert.match(desktop, /gnome-keyring-daemon --unlock --components=secrets/);
});

test("draft version tags cannot publish the self-hosted image", () => {
  const workflow = fs.readFileSync(
    path.join(rootDir, ".github/workflows/web-self-hosted.yml"),
    "utf8",
  );
  assert.doesNotMatch(workflow, /^  push:/m);
  assert.match(workflow, /^  release:\r?\n    types: \[published\]/m);
  assert.match(workflow, /^  pull_request:/m);
  assert.match(workflow, /^  workflow_dispatch:/m);
});

test("release verification provisions historical sources and Linux credential storage", () => {
  const workflow = fs.readFileSync(
    path.join(rootDir, ".github/workflows/release.yml"),
    "utf8",
  );
  const verification = workflow.split("  build:")[0];
  assert.match(verification, /fetch-depth: 0/);
  assert.match(
    verification,
    /apt-get install --no-install-recommends -y gnome-keyring/,
  );
  assert.match(verification, /dbus-run-session --/);
  assert.match(
    verification,
    /gnome-keyring-daemon --unlock --components=secrets/,
  );
  assert.match(verification, /xvfb-run -a node scripts\/verification\/ci\.mts group/);
  assert.match(verification, /PROMPTHUB_E2E_HEADED: "1"/);
  assert.doesNotMatch(
    verification,
    /PROMPTHUB_CLI_TEST_MAX_MS|--exclude-layer/,
  );
});
