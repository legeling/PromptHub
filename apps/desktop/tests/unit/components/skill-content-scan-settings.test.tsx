import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  scan: vi.fn(),
  toast: vi.fn(),
}));
vi.mock("react-i18next", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-i18next")>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("../../../src/renderer/services/renderer-persistence", () => ({
  flushRendererPersistence: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../../src/renderer/stores/skill.store", () => ({
  useSkillStore: (selector: (state: unknown) => unknown) =>
    selector({ scanInstalledSkillSafety: mock.scan }),
}));
vi.mock("../../../src/renderer/components/ui/Toast", () => ({
  useToast: () => ({ showToast: mock.toast }),
}));
import { useSettingsStore } from "../../../src/renderer/stores/settings.store";
import { SkillSafetySettingsSection } from "../../../src/renderer/components/settings/SkillSafetySettingsSection";

describe("manual content scan settings UI", () => {
  afterEach(() => {
    Reflect.deleteProperty(window, "__PROMPTHUB_WEB__");
    Reflect.deleteProperty(window, "__PROMPTHUB_WEB_CONTEXT__");
  });
  it("hides scan settings when the backend does not support scanning", () => {
    Reflect.set(window, "__PROMPTHUB_WEB__", true);
    Reflect.set(window, "__PROMPTHUB_WEB_CONTEXT__", {
      mode: "cloudflare",
      capabilities: { skillSafetyScan: false },
    });
    render(<SkillSafetySettingsSection />);
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    useSettingsStore.setState({
      skillSafetyScanEnabled: false,
      skillSafetyScanMethod: "static",
    });
  });
  it("does not expose batch scans until enabled and never scans on enablement", () => {
    const view = render(<SkillSafetySettingsSection />);
    expect(
      screen.queryByRole("button", { name: "settings.contentScanMethod" }),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole("switch", {
        name: "settings.contentScanEnable",
        checked: false,
      }),
    );
    expect(useSettingsStore.getState().skillSafetyScanEnabled).toBe(true);
    expect(screen.queryByText("settings.contentScanDescription")).toBeNull();
    expect(mock.scan).not.toHaveBeenCalled();
    view.rerender(<SkillSafetySettingsSection />);
    fireEvent.click(
      screen.getByRole("button", { name: "settings.contentScanMethod" }),
    );
    expect(
      screen.getByRole("listbox", { name: "settings.contentScanMethod" }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("option", { name: "settings.contentScanAI" }),
    );
    expect(useSettingsStore.getState().skillSafetyScanMethod).toBe("ai");
    expect(
      screen.getByRole("button", { name: "settings.contentScanMethod" }),
    ).toHaveTextContent("settings.contentScanAI");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(mock.scan).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "settings.contentScanMethod" }),
    );
    fireEvent.click(
      screen.getByRole("option", { name: "settings.contentScanStatic" }),
    );
    expect(useSettingsStore.getState().skillSafetyScanMethod).toBe("static");
    fireEvent.click(
      screen.getByRole("switch", {
        name: "settings.contentScanEnable",
        checked: true,
      }),
    );
    expect(useSettingsStore.getState().skillSafetyScanEnabled).toBe(false);
    expect(
      screen.queryByRole("button", { name: "settings.contentScanMethod" }),
    ).toBeNull();
    expect(mock.scan).not.toHaveBeenCalled();
    view.unmount();
    render(<SkillSafetySettingsSection />);
    expect(
      screen.getByRole("switch", {
        name: "settings.contentScanEnable",
        checked: false,
      }),
    ).toBeInTheDocument();
  });
  it.each(["safe", "warn", "high", "error"])(
    "reports an explicit batch result: %s",
    async (result) => {
      useSettingsStore.setState({ skillSafetyScanEnabled: true });
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
