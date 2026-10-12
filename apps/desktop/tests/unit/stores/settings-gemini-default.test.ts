import { expect, it, vi } from "vitest";
import {
  DEFAULT_DISABLED_PLATFORM_IDS,
  DEFAULT_SETTINGS,
} from "@prompthub/shared/types";
import { createDefaultSettingsValues } from "../../../src/renderer/stores/settings/settings-defaults";
import { normalizePlatformVisibilitySettings } from "../../../src/renderer/stores/settings/settings-normalizers";

vi.mock("../../../src/renderer/i18n", () => ({ default: { language: "en" } }));

it("uses the shared disabled platforms in desktop defaults and preserves an explicitly enabled Gemini", () => {
  const defaults = createDefaultSettingsValues();
  expect(defaults.disabledPlatformIds).toEqual(DEFAULT_DISABLED_PLATFORM_IDS);
  expect(DEFAULT_SETTINGS.disabledPlatformIds).toEqual(
    DEFAULT_DISABLED_PLATFORM_IDS,
  );
  const enabled = { disabledPlatformIds: [], skillPlatformOrder: [] };
  normalizePlatformVisibilitySettings(enabled);
  expect(enabled.disabledPlatformIds).toEqual([]);
  defaults.disabledPlatformIds.length = 0;
  expect(createDefaultSettingsValues().disabledPlatformIds).toEqual(
    DEFAULT_DISABLED_PLATFORM_IDS,
  );
});
