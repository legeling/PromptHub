import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  distributionPresence,
  distributionCountPresence,
  mergeDistributionObservations,
  observedDistributionPresence,
} from "@prompthub/shared/utils/resource-observation";
import { countResources } from "@prompthub/shared/utils/resource-library";

describe("resource distribution observations", () => {
  it("keeps unchecked observations out of pending counts", () => {
    const states = [undefined, { claude: true }, { claude: false }];
    assert.deepEqual(
      countResources(states, (state) => ({
        id: "resource",
        search: [],
        presence: distributionPresence(state),
      })),
      { all: 3, favorites: 0, distributed: 1, pending: 1, unknown: 1 },
    );
    assert.equal(distributionCountPresence(undefined), "unknown");
    assert.equal(distributionCountPresence(0), "absent");
    assert.equal(distributionCountPresence(2), "distributed");
  });
  it("retains successful observations on error and accepts verified removal", () => {
    const previous = { plugin: { claude: { installed: true, checkedAt: 1 } } };
    const stale = mergeDistributionObservations(previous, {
      plugin: { claude: { checkedAt: 2, error: "unavailable" } },
    });
    assert.deepEqual(stale.plugin.claude, {
      installed: true,
      checkedAt: 2,
      error: "unavailable",
    });
    assert.equal(observedDistributionPresence(stale.plugin), "distributed");
    const removed = mergeDistributionObservations(stale, {
      plugin: { claude: { installed: false, checkedAt: 3 } },
    });
    assert.equal(observedDistributionPresence(removed.plugin), "absent");
    assert.equal(removed.plugin.claude.error, undefined);
    assert.equal(
      observedDistributionPresence({
        claude: { checkedAt: 2, error: "unavailable" },
      }),
      "unknown",
    );
  });
});
