import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { useSkillStoreRemoteSync } from "../../../src/renderer/components/skill/store-remote-sync";
import { useSkillStore } from "../../../src/renderer/stores/skill.store";
import { installWindowMocks } from "../../helpers/window";
import {
  createDeferred,
  makeSkillsShDetail,
} from "./skill-store-remote.test-fixtures";

const searchResult = JSON.stringify({
  skills: [{ source: "demo/skills", skillId: "skill-40" }],
});

beforeEach(() => {
  useSkillStore.setState({
    remoteStoreEntries: {},
    customStoreSources: [],
    storeCategory: "all",
  });
});

function setup(fetchRemoteContent: (url: string) => Promise<string>) {
  installWindowMocks({
    api: {
      settings: {
        get: vi.fn().mockResolvedValue({ device: { storeAutoSync: false } }),
      },
      skill: { fetchRemoteContent },
    },
  });
  return renderHook(
    ({ query }) =>
      useSkillStoreRemoteSync({
        eagerRemoteSources: "selected",
        selectedStoreSourceId: "community",
        storeSearchQuery: query,
      }),
    { initialProps: { query: "broken" } },
  );
}

it("surfaces malformed search responses once and permits a new query (#238)", async () => {
  const fetchRemoteContent = vi.fn(async (url: string) => {
    if (new URL(url).searchParams.get("q") === "broken") return "{}";
    if (new URL(url).pathname === "/api/search") return searchResult;
    return makeSkillsShDetail("skill-40");
  });
  const { result, rerender } = setup(fetchRemoteContent);
  await act(() => result.current.loadStoreSource("community"));
  expect(useSkillStore.getState().remoteStoreEntries.community).toMatchObject({
    query: "all:broken",
    skills: [],
    error: "Invalid skills.sh search response",
  });
  await act(() => result.current.loadStoreSource("community"));
  expect(fetchRemoteContent).toHaveBeenCalledTimes(1);
  rerender({ query: "lancedb" });
  await act(() => result.current.loadStoreSource("community"));
  expect(useSkillStore.getState().remoteStoreEntries.community).toMatchObject({
    query: "all:lancedb",
    error: null,
    matchedCount: 1,
    nextCursor: null,
  });
});

it.each(["success", "failure"])(
  "ignores an older search %s after a newer result (#238)",
  async (outcome) => {
    const pending = createDeferred<string>();
    const fetchRemoteContent = vi.fn(async (url: string) => {
      if (new URL(url).searchParams.get("q") === "broken")
        return pending.promise;
      if (new URL(url).pathname === "/api/search") return searchResult;
      return makeSkillsShDetail("skill-40");
    });
    const { result, rerender } = setup(fetchRemoteContent);
    let earlier: Promise<void>;
    act(() => {
      earlier = result.current.loadStoreSource("community");
    });
    rerender({ query: "current" });
    await act(() => result.current.loadStoreSource("community"));
    await act(async () => {
      if (outcome === "success") pending.resolve('{"skills":[]}');
      else pending.reject(new Error("Old request failed"));
      await earlier;
    });
    expect(useSkillStore.getState().remoteStoreEntries.community).toMatchObject(
      {
        query: "all:current",
        error: null,
        matchedCount: 1,
        skills: [expect.objectContaining({ install_name: "skill-40" })],
      },
    );
  },
);
