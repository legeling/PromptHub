import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  scan: vi.fn(),
  toast: vi.fn(),
  state: {
    skillSafetyScanEnabled: false,
    skillSafetyScanMethod: "static",
    setSkillSafetyScanEnabled: vi.fn(),
    setSkillSafetyScanMethod: vi.fn(),
  },
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("../../../src/renderer/stores/settings.store", () => ({
  useSettingsStore: (selector: (state: unknown) => unknown) =>
    selector(mock.state),
}));
vi.mock("../../../src/renderer/stores/skill.store", () => ({
  useSkillStore: (selector: (state: unknown) => unknown) =>
    selector({ scanInstalledSkillSafety: mock.scan }),
}));
vi.mock("../../../src/renderer/components/ui/Toast", () => ({
  useToast: () => ({ showToast: mock.toast }),
}));
import { SkillSafetySettingsSection } from "../../../src/renderer/components/settings/SkillSafetySettingsSection";

describe("manual content scan settings UI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.state.skillSafetyScanEnabled = false;
    mock.state.skillSafetyScanMethod = "static";
  });
  it("does not expose batch scans until enabled and never scans on enablement", () => {
    const view = render(<SkillSafetySettingsSection />);
    expect(screen.queryByRole("combobox")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: /settings.contentScanEnable/ }),
    );
    expect(mock.state.setSkillSafetyScanEnabled).toHaveBeenCalledWith(true);
    expect(mock.scan).not.toHaveBeenCalled();
    mock.state.skillSafetyScanEnabled = true;
    view.rerender(<SkillSafetySettingsSection />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "ai" } });
    expect(mock.state.setSkillSafetyScanMethod).toHaveBeenCalledWith("ai");
    expect(mock.scan).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "static" },
    });
    expect(mock.state.setSkillSafetyScanMethod).toHaveBeenCalledWith("static");
  });
  it.each(["safe", "warn", "high", "error"])(
    "reports an explicit batch result: %s",
    async (result) => {
      mock.state.skillSafetyScanEnabled = true;
      if (result === "error")
        mock.scan.mockRejectedValueOnce(new Error("offline"));
      else
        mock.scan.mockResolvedValueOnce({
          total: 1,
          blocked: 0,
          highRisk: result === "high" ? 1 : 0,
          warn: result === "warn" ? 1 : 0,
        });
      render(<SkillSafetySettingsSection />);
      fireEvent.click(
        screen.getByRole("button", { name: "skill.runSafetyAssessment" }),
      );
      await waitFor(() => expect(mock.toast).toHaveBeenCalled());
      expect(mock.scan).toHaveBeenCalledTimes(1);
    },
  );
});
