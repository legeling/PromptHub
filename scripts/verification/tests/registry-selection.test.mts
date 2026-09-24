import assert from "node:assert/strict";
import test from "node:test";

import { VERIFICATION_CHECKS } from "../checks.mts";
import {
  ALL_PRODUCT_SURFACES,
  selectAffectedSurfaces,
} from "../surface-graph.mjs";
import { selectChecks, validateRegistry } from "../select.mts";
import type { VerificationCheck } from "../types.mts";

function check(
  id: string,
  overrides: Partial<VerificationCheck> = {},
): VerificationCheck {
  return {
    id,
    label: id,
    surfaces: ["shared"],
    layers: ["unit"],
    profiles: ["quick", "release"],
    command: { executable: "node", args: ["-e", `console.log("${id}")`] },
    timeoutMs: 1_000,
    ...overrides,
  };
}

test("the maintained registry is valid and includes previously omitted gates", () => {
  assert.doesNotThrow(() =>
    validateRegistry(VERIFICATION_CHECKS, { requireCompleteInventory: true }),
  );

  const ids = new Set(VERIFICATION_CHECKS.map((item) => item.id));
  for (const required of [
    "governance-spec",
    "shared-test",
    "core-test",
    "core-performance",
    "desktop-unit-1",
    "desktop-unit-2",
    "desktop-unit-3",
    "desktop-unit-4",
    "desktop-unit-5",
    "desktop-unit-6",
    "desktop-unit-7",
    "desktop-unit-8",
    "desktop-integration",
    "desktop-test-typecheck",
    "mobile-test",
    "web-smoke",
    "web-cloudflare-build",
    "cli-package",
    "desktop-package",
  ]) {
    assert.equal(ids.has(required), true, `missing ${required}`);
  }
});

test("core storage performance remains an isolated release gate", () => {
  const performanceCheck = VERIFICATION_CHECKS.find(
    (item) => item.id === "core-performance",
  );

  assert.ok(performanceCheck);
  assert.deepEqual(performanceCheck.profiles, ["release", "package"]);
  assert.deepEqual(performanceCheck.dependsOn, ["core-test"]);
  assert.equal(performanceCheck.resourceGroup, "test-heavy");
  assert.deepEqual(performanceCheck.command.args, [
    "--filter",
    "@prompthub/core",
    "test:performance",
  ]);
});

test("desktop unit coverage uses bounded serial shards", () => {
  const shards = VERIFICATION_CHECKS.filter((item) =>
    item.id.startsWith("desktop-unit-"),
  );

  assert.deepEqual(
    shards.map((item) => item.id),
    [
      "desktop-unit-1",
      "desktop-unit-2",
      "desktop-unit-3",
      "desktop-unit-4",
      "desktop-unit-5",
      "desktop-unit-6",
      "desktop-unit-7",
      "desktop-unit-8",
    ],
  );
  for (const [index, shard] of shards.entries()) {
    assert.equal(shard.resourceGroup, "test-heavy");
    assert.equal(shard.command.args.includes(`${index + 1}/8`), true);
    assert.equal(shard.command.args.at(-1), "2");
  }
});

test("every desktop profile selects real integration and test typechecking", () => {
  for (const profile of ["changed", "quick", "release", "package"] as const) {
    const selected = selectChecks(VERIFICATION_CHECKS, {
      profile,
      surfaces: new Set(["desktop"]),
    });
    const integration = selected.filter(
      (item) => item.id === "desktop-integration",
    );
    assert.equal(integration.length, 1, profile);
    assert.equal(
      selected.filter((item) => item.id === "desktop-test-typecheck").length,
      1,
      profile,
    );
    assert.deepEqual(integration[0].command.args, [
      "--filter",
      "@prompthub/desktop",
      "test:integration",
    ]);
    assert.equal(integration[0].resourceGroup, "test-heavy");
    assert.equal(
      selected.filter((item) => item.id.startsWith("desktop-integration-"))
        .length,
      0,
      "retired shards must not duplicate or hide the functional baseline",
    );
    for (const unit of selected.filter((item) =>
      item.id.startsWith("desktop-unit-"),
    )) {
      assert.ok(unit.dependsOn?.includes("desktop-integration"));
    }
    assert.equal(
      selected.some((item) => item.id === "desktop-e2e-smoke"),
      profile === "release" || profile === "package",
    );
  }
});

test("Cloudflare dry-run disables nonessential Wrangler telemetry", () => {
  const build = VERIFICATION_CHECKS.find(
    (item) => item.id === "web-cloudflare-build",
  );

  assert.deepEqual(build?.command.environment, {
    CI: "true",
    WRANGLER_SEND_METRICS: "false",
  });
});

test("self-hosted Web tests receive a deterministic release-only JWT secret", () => {
  const webTest = VERIFICATION_CHECKS.find((item) => item.id === "web-test");

  assert.deepEqual(webTest?.command.environment, {
    JWT_SECRET: "test-secret-for-web-release-verification-1234567890",
  });
});

test("complete registry validation rejects a missing required risk layer", () => {
  assert.throws(
    () =>
      validateRegistry(
        VERIFICATION_CHECKS.filter((item) => item.id !== "mobile-test"),
        { requireCompleteInventory: true },
      ),
    /mobile.*unit/i,
  );
});

test("registry validation rejects duplicate commands, unknown dependencies, and cycles", () => {
  assert.throws(
    () =>
      validateRegistry([
        check("a"),
        check("b", {
          command: {
            executable: "node",
            args: ["-e", 'console.log("a")'],
          },
        }),
      ]),
    /Duplicate verification command/,
  );
  assert.throws(
    () => validateRegistry([check("a", { dependsOn: ["missing"] })]),
    /Unknown verification dependency/,
  );
  assert.throws(
    () =>
      validateRegistry([
        check("a", {
          command: { executable: "node", args: ["-e", "1"] },
          dependsOn: ["b"],
        }),
        check("b", {
          command: { executable: "node", args: ["-e", "2"] },
          dependsOn: ["a"],
        }),
      ]),
    /cycle/i,
  );
  assert.throws(
    () => validateRegistry([check("a", { timeoutMs: 0 })]),
    /metadata/i,
  );
  assert.throws(
    () =>
      validateRegistry([
        check("a", {
          profiles: ["future" as never],
        }),
      ]),
    /profile/i,
  );
  assert.throws(
    () =>
      validateRegistry([
        check("a", {
          resourceGroup: "../shared",
        }),
      ]),
    /resource group/i,
  );
});

test("surface selection stays bounded for a large changed inventory", () => {
  const paths = Array.from(
    { length: 10_000 },
    (_, index) => `apps/desktop/src/generated-${index}.ts`,
  );
  const startedAt = performance.now();
  const selection = selectAffectedSurfaces(paths);
  const durationMs = performance.now() - startedAt;

  assert.equal(selection.fallbackToAll, false);
  assert.deepEqual([...selection.surfaces], ["desktop"]);
  assert.ok(durationMs < 1_000, `selection took ${durationMs.toFixed(1)}ms`);
});

test("shared changes fan out to every product surface", () => {
  const selection = selectAffectedSurfaces(["packages/shared/types/skill.ts"]);
  assert.equal(selection.fallbackToAll, false);
  assert.deepEqual(
    [...selection.surfaces].sort(),
    [...ALL_PRODUCT_SURFACES].sort(),
  );
});

test("unknown and malformed paths fail safe to every surface", () => {
  for (const changedPath of [
    "future/product/file.ts",
    "../outside.ts",
    "bad\0path",
  ]) {
    const selection = selectAffectedSurfaces([changedPath]);
    assert.equal(selection.fallbackToAll, true);
    assert.deepEqual(
      [...selection.surfaces].sort(),
      [...ALL_PRODUCT_SURFACES].sort(),
    );
  }
});

test("quick omits build and E2E while release includes dependency closure", () => {
  const checks = [
    check("unit", { profiles: ["changed", "quick", "release"] }),
    check("build", {
      layers: ["build"],
      profiles: ["release"],
      command: { executable: "node", args: ["-e", "build"] },
    }),
    check("e2e", {
      layers: ["e2e"],
      profiles: ["release"],
      dependsOn: ["build"],
      command: { executable: "node", args: ["-e", "e2e"] },
    }),
  ];

  assert.deepEqual(
    selectChecks(checks, { profile: "quick" }).map((item) => item.id),
    ["unit"],
  );
  assert.deepEqual(
    selectChecks(checks, { profile: "release" }).map((item) => item.id),
    ["unit", "build", "e2e"],
  );
  assert.deepEqual(
    selectChecks(checks, {
      profile: "release",
      excludeLayers: new Set(["e2e"]),
    }).map((item) => item.id),
    ["unit", "build"],
  );
});
