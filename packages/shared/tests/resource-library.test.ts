import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  countResources,
  filterResources,
  paginateResources,
} from "@prompthub/shared/utils/resource-library";

for (const kind of ["skill", "mcp", "plugin"])
  describe(`${kind} common library contract`, () => {
    const items = [
      {
        id: `${kind}-one`,
        favorite: true,
        tags: [" review "],
        search: ["First item"],
        presence: "distributed" as const,
      },
      {
        id: `${kind}-two`,
        favorite: false,
        tags: [],
        search: ["Second item"],
        presence: "absent" as const,
      },
      {
        id: `${kind}-three`,
        favorite: false,
        tags: [],
        search: ["Third item"],
        presence: "unknown" as const,
      },
    ];
    const adapter = (item: (typeof items)[number]) => item;
    it("shares filtering/counting without classifying unknown targets as pending", () => {
      assert.deepEqual(countResources(items, adapter), {
        all: 3,
        favorites: 1,
        distributed: 1,
        pending: 1,
        unknown: 1,
      });
      assert.deepEqual(
        filterResources(items, adapter, {
          filter: "favorites",
          query: " FIRST ",
          tags: ["review"],
        }),
        [items[0]],
      );
      assert.deepEqual(filterResources(items, adapter, { filter: "pending" }), [
        items[1],
      ]);
    });
    it("clamps deleted pages and shows the same final page window", () => {
      assert.deepEqual(paginateResources(items, 99, 2), {
        currentPage: 2,
        totalPages: 2,
        items: [items[2]],
        pageNumbers: [1, 2],
      });
      assert.deepEqual(
        paginateResources(
          Array.from({ length: 100 }, (_, i) => i),
          10,
          10,
        ).pageNumbers,
        [6, 7, 8, 9, 10],
      );
      assert.deepEqual(paginateResources([], -1, 0), {
        currentPage: 1,
        totalPages: 1,
        items: [],
        pageNumbers: [1],
      });
    });
  });
