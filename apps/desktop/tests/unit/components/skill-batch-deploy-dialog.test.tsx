import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SkillBatchDeployDialog } from "../../../src/renderer/components/skill/SkillBatchDeployDialog";
import { createSkillFixture } from "../../fixtures/skills";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";

const useSettingsStoreMock = vi.fn();
const showToastMock = vi.fn();

vi.mock("../../../src/renderer/stores/settings.store", () => ({
  useSettingsStore: (selector: (state: Record<string, unknown>) => unknown) =>
    useSettingsStoreMock(selector),
}));

vi.mock("../../../src/renderer/components/ui/Toast", () => ({
  useToast: () => ({ showToast: showToastMock }),
}));

function createSettingsState(
  overrides: Partial<{
    skillInstallMethod: "copy" | "symlink";
    disabledPlatformIds: string[];
  }> = {},
) {
  return {
    skillInstallMethod: "copy" as const,
    disabledPlatformIds: [],
    ...overrides,
  };
}

function bindSettingsState(state: ReturnType<typeof createSettingsState>) {
  useSettingsStoreMock.mockImplementation(
    (selector: (value: typeof state) => unknown) => selector(state),
  );
}

function getSubmitButton() {
  return screen.getAllByRole("button", { name: "Batch Deploy" }).at(-1)!;
}

describe("SkillBatchDeployDialog install mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bindSettingsState(createSettingsState());
    installWindowMocks({
      api: {
        skill: {
          export: vi.fn().mockResolvedValue("# demo"),
          getSupportedPlatforms: vi.fn().mockResolvedValue([
            {
              id: "claude",
              name: "Claude Code",
              icon: "Terminal",
              rootDir: {
                darwin: "~/.claude",
                win32: "~/.claude",
                linux: "~/.claude",
              },
              skillsRelativePath: "skills",
            },
          ]),
          detectPlatforms: vi.fn().mockResolvedValue(["claude"]),
          installMd: vi.fn().mockResolvedValue(undefined),
          installMdSymlink: vi.fn().mockResolvedValue({
            requestedMode: "symlink",
            effectiveMode: "symlink",
          }),
          uninstallMd: vi.fn().mockResolvedValue(undefined),
        },
      },
    });
  });

  it("uses the symlink install API when the user selects symlink", async () => {
    await renderWithI18n(
      <SkillBatchDeployDialog
        skills={[createSkillFixture({ id: "skill-1", name: "Writer" })]}
        onClose={vi.fn()}
      />,
      { language: "en" },
    );

    await waitFor(() => {
      expect(screen.getByText("Claude Code")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Symlink/ }));
    fireEvent.click(getSubmitButton());

    await waitFor(() => {
      expect(window.api.skill.installMdSymlink).toHaveBeenCalledWith(
        "skill-1",
        "# demo",
        "claude",
      );
    });
    expect(window.api.skill.installMd).not.toHaveBeenCalled();
  });

  it("uses the copy install API when the user selects copy from a symlink default", async () => {
    bindSettingsState(createSettingsState({ skillInstallMethod: "symlink" }));

    await renderWithI18n(
      <SkillBatchDeployDialog
        skills={[createSkillFixture({ id: "skill-1", name: "Writer" })]}
        onClose={vi.fn()}
      />,
      { language: "en" },
    );

    await waitFor(() => {
      expect(screen.getByText("Claude Code")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Copy/ }));
    fireEvent.click(getSubmitButton());

    await waitFor(() => {
      expect(window.api.skill.installMd).toHaveBeenCalledWith(
        "skill-1",
        "# demo",
        "claude",
      );
    });
    expect(window.api.skill.installMdSymlink).not.toHaveBeenCalled();
  });
});
