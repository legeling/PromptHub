import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import type {
  CausalSyncGeneration,
  CausalSyncResource,
  SyncResourceContent,
} from "@prompthub/shared/types/causal-sync";
import { parseCausalSyncGeneration, planCausalSync } from "../src/causal-sync";

const hash = (character: string) => character.repeat(64);
const content = (resourceId: string, character = "a"): SyncResourceContent => ({
  resourceType: "prompt",
  resourceId,
  contentHash: hash(character),
  references: [],
});
const live = (
  value: SyncResourceContent,
  revision = 1,
  deviceId = "device-a",
): CausalSyncResource => ({
  ...value,
  state: "live",
  revision,
  commitId: `commit-${revision}`,
  deviceId,
});
function generation(
  resources: CausalSyncResource[],
  revision = 1,
): CausalSyncGeneration {
  return {
    kind: "prompthub-causal-sync",
    schemaVersion: 1,
    syncId: "shared-library",
    revision,
    commitId: `commit-${revision}`,
    parentCommitId: revision === 1 ? null : `commit-${revision - 1}`,
    deviceId: "device-a",
    resources,
  };
}
function plan(
  base: CausalSyncGeneration | null,
  local: SyncResourceContent[],
  remote: CausalSyncGeneration | null,
) {
  return planCausalSync({
    syncId: "shared-library",
    deviceId: "device-b",
    commitId: "next-commit",
    base,
    local,
    remote,
  });
}

describe("resource-level causal synchronization", () => {
  it("creates a first generation and establishes an unchanged common base", () => {
    const first = plan(null, [content("one")], null);
    expect(first.status).toBe("publish");
    if (first.status !== "publish") throw new Error("Missing generation");
    expect(first.generation).toEqual({
      kind: "prompthub-causal-sync",
      schemaVersion: 1,
      syncId: "shared-library",
      revision: 1,
      commitId: "next-commit",
      parentCommitId: null,
      deviceId: "device-b",
      resources: [
        {
          ...content("one"),
          state: "live",
          revision: 1,
          commitId: "next-commit",
          deviceId: "device-b",
        },
      ],
    });
    expect(plan(first.generation, [content("one")], first.generation)).toEqual({
      status: "unchanged",
      generation: first.generation,
    });
  });

  it("merges changes to separate resources and preserves remote provenance", () => {
    const base = generation([live(content("one")), live(content("two"))]);
    const remote = generation(
      [live(content("one")), live(content("two", "c"), 2)],
      2,
    );
    const before = JSON.stringify({ base, remote });
    const result = plan(base, [content("one", "b"), content("two")], remote);
    expect(result.status).toBe("publish");
    if (result.status !== "publish") throw new Error("Missing merge");
    expect(result.generation.revision).toBe(3);
    expect(result.generation.parentCommitId).toBe("commit-2");
    expect(result.generation.resources).toEqual([
      {
        ...content("one", "b"),
        state: "live",
        revision: 3,
        commitId: "next-commit",
        deviceId: "device-b",
      },
      live(content("two", "c"), 2),
    ]);
    expect(JSON.stringify({ base, remote })).toBe(before);
  });

  it("propagates a remote deletion to an unchanged offline device", () => {
    const base = generation([live(content("one"))]);
    const deleted: CausalSyncResource = {
      resourceType: "prompt",
      resourceId: "one",
      state: "deleted",
      previousContentHash: hash("a"),
      revision: 2,
      commitId: "commit-2",
      deviceId: "device-a",
    };
    const remote = generation([deleted], 2);
    expect(plan(base, [content("one")], remote)).toEqual({
      status: "apply",
      generation: remote,
    });
    expect(plan(remote, [], remote)).toEqual({
      status: "unchanged",
      generation: remote,
    });
  });

  it("publishes a local deletion with identity and retains previous tombstones", () => {
    const oldDeletion: CausalSyncResource = {
      resourceType: "prompt",
      resourceId: "retired",
      state: "deleted",
      previousContentHash: hash("e"),
      revision: 1,
      commitId: "commit-1",
      deviceId: "device-a",
    };
    const base = generation([live(content("one"), 2), oldDeletion], 2);
    const result = plan(base, [], base);
    expect(result.status).toBe("publish");
    if (result.status !== "publish") throw new Error("Missing deletion");
    expect(result.generation.resources).toEqual([
      {
        resourceType: "prompt",
        resourceId: "one",
        state: "deleted",
        previousContentHash: hash("a"),
        revision: 3,
        commitId: "next-commit",
        deviceId: "device-b",
      },
      oldDeletion,
    ]);
  });

  it.each(["modify", "delete"])(
    "preserves both sides of a concurrent %s conflict",
    (action) => {
      const base = generation([live(content("one")), live(content("two"))]);
      const local = [content("one", "b"), content("two", "d")];
      const remoteOne: CausalSyncResource =
        action === "modify"
          ? live(content("one", "c"), 2)
          : {
              resourceType: "prompt",
              resourceId: "one",
              state: "deleted",
              previousContentHash: hash("a"),
              revision: 2,
              commitId: "commit-2",
              deviceId: "device-a",
            };
      const remote = generation([remoteOne, live(content("two"))], 2);
      const before = JSON.stringify({ base, local, remote });
      const result = plan(base, local, remote);
      expect(result).toEqual({
        status: "conflict",
        conflicts: [
          {
            reason: "concurrent-change",
            resourceType: "prompt",
            resourceId: "one",
            base: base.resources[0],
            local: local[0],
            remote: remoteOne,
          },
        ],
      });
      expect("generation" in result).toBe(false);
      expect(JSON.stringify({ base, local, remote })).toBe(before);
    },
  );

  it("coalesces identical edits and concurrent deletions without publishing", () => {
    const base = generation([live(content("one"))]);
    const edited = generation([live(content("one", "b"), 2)], 2);
    expect(plan(base, [content("one", "b")], edited).status).toBe("unchanged");
    const deleted = generation(
      [
        {
          resourceType: "prompt",
          resourceId: "one",
          state: "deleted",
          previousContentHash: hash("a"),
          revision: 2,
          commitId: "commit-2",
          deviceId: "device-a",
        },
      ],
      2,
    );
    expect(plan(base, [], deleted).status).toBe("unchanged");
  });

  it("merges independent additions but detects different creations with the same identity", () => {
    const base = generation([]);
    const remote = generation([live(content("remote"), 2)], 2);
    const merged = plan(base, [content("local")], remote);
    expect(merged.status).toBe("publish");
    if (merged.status !== "publish") throw new Error("Missing additions");
    expect(
      merged.generation.resources.map((entry) => entry.resourceId),
    ).toEqual(["local", "remote"]);
    expect(plan(base, [content("remote", "b")], remote).status).toBe(
      "conflict",
    );
  });

  it("requires an explicit baseline for unrelated nonempty libraries", () => {
    const remote = generation([live(content("remote"))]);
    expect(plan(null, [content("local")], remote)).toEqual({
      status: "baseline-required",
      reason: "unrelated-local-data",
    });
    expect(plan(null, [], remote)).toEqual({
      status: "apply",
      generation: remote,
    });
    expect(plan(null, [content("remote")], remote)).toEqual({
      status: "unchanged",
      generation: remote,
    });
  });

  it("does not recreate an identity created and deleted remotely after the common base", () => {
    const base = generation([]);
    const remote = generation(
      [
        {
          resourceType: "prompt",
          resourceId: "one",
          state: "deleted",
          previousContentHash: hash("a"),
          revision: 3,
          commitId: "commit-3",
          deviceId: "device-a",
        },
      ],
      3,
    );
    expect(plan(base, [content("one", "b")], remote)).toMatchObject({
      status: "conflict",
      conflicts: [{ resourceId: "one", reason: "concurrent-change" }],
    });
  });

  it("never republishes a stale device after a tombstone is discarded or the namespace changes", () => {
    const base = generation([live(content("one"))]);
    expect(plan(base, [content("one")], generation([], 2))).toEqual({
      status: "baseline-required",
      reason: "remote-history-missing",
    });
    expect(
      plan(base, [content("one")], { ...base, syncId: "reset-library" }),
    ).toEqual({ status: "baseline-required", reason: "sync-identity-changed" });
    expect(plan(base, [content("one")], null)).toEqual({
      status: "baseline-required",
      reason: "remote-missing",
    });
  });

  it("rejects rolled-back and forked revisions before proposing mutations", () => {
    const base = generation([live(content("one"), 2)], 2);
    expect(
      plan(base, [content("one", "b")], generation([live(content("one"))])),
    ).toEqual({
      status: "baseline-required",
      reason: "remote-revision-diverged",
    });
    expect(
      plan(base, [], {
        ...base,
        commitId: "fork",
        resources: [{ ...base.resources[0], commitId: "fork" }],
      }),
    ).toEqual({
      status: "baseline-required",
      reason: "remote-revision-diverged",
    });
    const unversionedChange = generation([live(content("one", "c"), 2)], 3);
    expect(plan(base, [content("one")], unversionedChange)).toEqual({
      status: "baseline-required",
      reason: "remote-revision-diverged",
    });
  });

  it("protects both changes when their merged references would dangle", () => {
    const folder: SyncResourceContent = {
      ...content("folder"),
      resourceType: "folder",
    };
    const base = generation([live(folder), live(content("one"))]);
    const remotePrompt = {
      ...content("one", "b"),
      references: [{ resourceType: "folder", resourceId: "folder" }],
    };
    const remote = generation([live(folder), live(remotePrompt, 2)], 2);
    const result = plan(base, [content("one")], remote);
    expect(result).toMatchObject({
      status: "conflict",
      conflicts: [
        {
          reason: "missing-reference",
          resourceType: "prompt",
          resourceId: "one",
          reference: { resourceType: "folder", resourceId: "folder" },
        },
      ],
    });
    expect("generation" in result).toBe(false);
  });

  it("treats a whole Skill package digest as one resource", () => {
    const skill = { ...content("writer"), resourceType: "skill" };
    const base = generation([live(skill)]);
    const remote = generation(
      [live({ ...skill, contentHash: hash("c") }, 2)],
      2,
    );
    expect(
      plan(base, [{ ...skill, contentHash: hash("b") }], remote),
    ).toMatchObject({
      status: "conflict",
      conflicts: [{ resourceType: "skill", resourceId: "writer" }],
    });
  });

  it("keeps resource namespaces distinct and never mutates caller-owned arrays", () => {
    const folder = { ...content("same"), resourceType: "folder" };
    const local = [content("same"), folder];
    Object.freeze(local);
    local.forEach((entry) => {
      Object.freeze(entry.references);
      Object.freeze(entry);
    });
    const result = plan(null, local, null);
    expect(result.status).toBe("publish");
    if (result.status !== "publish") throw new Error("Missing result");
    expect(result.generation.resources).toHaveLength(2);
    expect(local[0].resourceType).toBe("prompt");
  });

  it("permits an intentional recreation after the deletion was in the device baseline", () => {
    const base = generation([
      {
        resourceType: "prompt",
        resourceId: "one",
        state: "deleted",
        previousContentHash: hash("a"),
        revision: 1,
        commitId: "commit-1",
        deviceId: "device-a",
      },
    ]);
    const result = plan(base, [content("one", "b")], base);
    expect(result.status).toBe("publish");
    if (result.status !== "publish") throw new Error("Missing recreation");
    expect(result.generation.resources[0]).toMatchObject({
      state: "live",
      revision: 2,
      contentHash: hash("b"),
    });
  });

  it("handles 10,000 resources and declared references in a single comparison", () => {
    const count = 10_000;
    const local = Array.from({ length: count }, (_, index) => ({
      ...content(`item-${index}`),
      references:
        index === 0
          ? []
          : [{ resourceType: "prompt", resourceId: `item-${index - 1}` }],
    }));
    const base = generation(local.map((entry) => live(entry)));
    const remote = generation(base.resources, 2);
    local[count - 1] = { ...local[count - 1], contentHash: hash("b") };
    const started = performance.now();
    const result = plan(base, local, remote);
    const elapsedMs = performance.now() - started;
    expect(result.status).toBe("publish");
    if (result.status !== "publish") throw new Error("Missing large merge");
    expect(result.generation.resources).toHaveLength(count);
    expect(
      result.generation.resources.filter((entry) => entry.revision === 3),
    ).toHaveLength(1);
    console.info(
      `Causal sync comparison: ${count} resources, ${count - 1} references, ${elapsedMs.toFixed(1)} ms`,
    );
  });
});

describe("causal generation input validation", () => {
  it("round-trips a complete generation and rejects duplicate resource identities", () => {
    const value = generation([live(content("one"))]);
    expect(
      parseCausalSyncGeneration(JSON.parse(JSON.stringify(value))),
    ).toEqual(value);
    expect(() =>
      parseCausalSyncGeneration({
        ...value,
        resources: [value.resources[0], value.resources[0]],
      }),
    ).toThrow(/duplicate/i);
    expect(() => plan(null, [content("one"), content("one")], null)).toThrow(
      /duplicate/i,
    );
  });

  it.each([
    { schemaVersion: 2 },
    { revision: 0 },
    { revision: Number.MAX_SAFE_INTEGER + 1 },
    { resources: null },
    { resources: {} },
    { commitId: "" },
    { deviceId: "bad\0id" },
    { parentCommitId: "commit-1" },
    { unknown: true },
  ])("rejects invalid headers %j", (override) => {
    expect(() =>
      parseCausalSyncGeneration({ ...generation([]), ...override }),
    ).toThrow();
  });

  it.each([
    { contentHash: "invalid" },
    { revision: 2 },
    { commitId: "other-commit" },
    { state: "unknown" },
    { references: null },
    { resourceId: "" },
    { references: [{ resourceType: "prompt" }] },
    {
      references: [
        { resourceType: "prompt", resourceId: "one" },
        { resourceType: "prompt", resourceId: "one" },
      ],
    },
  ])("rejects malformed resources %j", (override) => {
    expect(() =>
      parseCausalSyncGeneration({
        ...generation([]),
        resources: [{ ...live(content("one")), ...override }],
      }),
    ).toThrow();
  });

  it("rejects tombstones with live payload and exhausted or reused commit identities", () => {
    expect(() =>
      parseCausalSyncGeneration({
        ...generation([]),
        resources: [
          {
            ...live(content("one")),
            state: "deleted",
            previousContentHash: hash("a"),
          },
        ],
      }),
    ).toThrow();
    const exhausted = generation([], Number.MAX_SAFE_INTEGER);
    expect(() => plan(exhausted, [content("one")], exhausted)).toThrow(
      /revision/i,
    );
    const base = { ...generation([]), commitId: "next-commit" };
    expect(() => plan(base, [content("one")], base)).toThrow(/commit/i);
  });

  it("rejects mixed historical commits and reuse of an earlier resource commit", () => {
    const mixed = generation(
      [
        live(content("one")),
        { ...live(content("two")), commitId: "another-commit" },
      ],
      3,
    );
    expect(() => parseCausalSyncGeneration(mixed)).toThrow(/commit/i);
    const base = generation(
      [{ ...live(content("one")), commitId: "next-commit" }],
      3,
    );
    expect(() => plan(base, [content("one", "b")], base)).toThrow(/commit/i);
  });
});
