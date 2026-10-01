import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BackupGuidanceCard } from "../../../src/renderer/components/settings/data-settings/BackupGuidanceCard";
import { useSettingsStore } from "../../../src/renderer/stores/settings.store";
import { normalizeStartupFolderSettings } from "../../../src/renderer/stores/settings/settings-normalizers";
import { renderWithI18n } from "../../helpers/i18n";

describe("BackupGuidanceCard", () => {
  beforeEach(() => {
    useSettingsStore.setState({
      backupGuideCollapsed: false,
    } as Partial<ReturnType<typeof useSettingsStore.getState>>);
  });

  it("renders the three self-help steps expanded by default", async () => {
    await renderWithI18n(<BackupGuidanceCard />, { language: "en" });

    const toggle = screen.getByRole("button", {
      name: /Backup, move to a new device, or roll back/,
    });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByText(/Full Backup/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Drag the backup \.zip/i)).toBeInTheDocument();
  });

  it("persists the collapsed preference in settings", async () => {
    await renderWithI18n(<BackupGuidanceCard />, { language: "en" });

    const toggle = screen.getByRole("button", {
      name: /Backup, move to a new device, or roll back/,
    });
    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(useSettingsStore.getState().backupGuideCollapsed).toBe(true);

    fireEvent.click(toggle);
    expect(useSettingsStore.getState().backupGuideCollapsed).toBe(false);
  });

  it("normalizes malformed persisted values to expanded", () => {
    const state: Record<string, unknown> = { backupGuideCollapsed: "yes" };
    normalizeStartupFolderSettings(state);
    expect(state.backupGuideCollapsed).toBe(false);

    const missing: Record<string, unknown> = {};
    normalizeStartupFolderSettings(missing);
    expect(missing.backupGuideCollapsed).toBe(false);

    const collapsed: Record<string, unknown> = { backupGuideCollapsed: true };
    normalizeStartupFolderSettings(collapsed);
    expect(collapsed.backupGuideCollapsed).toBe(true);
  });
});
