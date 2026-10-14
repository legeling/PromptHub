import { describe, expect, it } from "vitest";
import type {
  PluginLibraryEntry,
  PluginTargetCompatibility,
} from "@prompthub/shared/types/plugin";

import { getPluginTargetMatrixForEntry } from "../../../src/renderer/components/plugin/plugin-detail-utils";

const targets: PluginTargetCompatibility[] = [
  {
    id: "codex",
    displayName: "Codex",
    enabled: true,
    status: "native",
  },
  {
    id: "claude-code",
    displayName: "Claude Code",
    enabled: true,
    status: "adapter",
  },
  {
    id: "cursor",
    displayName: "Cursor",
    enabled: false,
    status: "adapter",
  },
];

const plugin = {
  nativeTargetIds: ["codex", "claude-code", "cursor"],
} as PluginLibraryEntry;

describe("Plugin native target overlay", () => {
  it("requires an Antigravity native manifest before enabling distribution", () => {
    const nativeTarget: PluginTargetCompatibility = {
      id: "antigravity",
      displayName: "Antigravity",
      status: "native",
      enabled: true,
      requiresNativeManifest: true,
    };
    expect(
      getPluginTargetMatrixForEntry([nativeTarget], plugin)[0],
    ).toMatchObject({
      enabled: false,
      unsupportedReason: "native-manifest-required",
    });
    expect(
      getPluginTargetMatrixForEntry([nativeTarget], {
        ...plugin,
        nativeTargetIds: ["antigravity"],
      })[0],
    ).toEqual(nativeTarget);
  });
  it("marks valid package-native targets without enabling unsupported targets", () => {
    expect(getPluginTargetMatrixForEntry(targets, plugin)).toEqual([
      targets[0],
      expect.objectContaining({
        id: "claude-code",
        enabled: true,
        status: "native",
      }),
      targets[2],
    ]);
    expect(targets[1].status).toBe("adapter");
  });

  it("disables only the target whose native manifest is invalid", () => {
    const matrix = getPluginTargetMatrixForEntry(targets, {
      ...plugin,
      invalidNativeTargetIds: ["claude-code"],
    });

    expect(matrix[0]).toEqual(targets[0]);
    expect(matrix[1]).toEqual(
      expect.objectContaining({
        id: "claude-code",
        enabled: false,
        unsupportedReason: "invalid-native-manifest",
      }),
    );
  });
});
