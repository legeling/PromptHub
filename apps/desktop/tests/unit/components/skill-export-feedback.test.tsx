import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SkillFullDetailPage } from "../../../src/renderer/components/skill/SkillFullDetailPage";
import { SkillDetailView } from "../../../src/renderer/components/skill/SkillDetailView";
import { ToastProvider } from "../../../src/renderer/components/ui/Toast";
import { useSkillStore } from "../../../src/renderer/stores/skill.store";
import { useSettingsStore } from "../../../src/renderer/stores/settings.store";
import { createSkillFixture } from "../../fixtures/skills";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";
import type { SkillExportSaveResult } from "@prompthub/shared/types/skill-export";

const initialSkills = useSkillStore.getState();
const initialSettings = useSettingsStore.getState();
const skill = createSkillFixture({ id: "export-feedback", name: "writer" });

beforeEach(() => {
  useSkillStore.setState({
    ...initialSkills,
    skills: [skill],
    selectedSkillId: skill.id,
  });
  useSettingsStore.setState({ ...initialSettings, skillProjects: [] });
});
afterEach(() => {
  cleanup();
  useSkillStore.setState(initialSkills, true);
  useSettingsStore.setState(initialSettings, true);
  vi.restoreAllMocks();
});

describe.each([
  { name: "full detail", Detail: SkillFullDetailPage },
  { name: "side detail", Detail: SkillDetailView },
])("Skill export feedback: $name", ({ Detail }) => {
  it.each(["SKILL.md", "ZIP"])(
    "waits for %s saving before showing the shared success toast",
    async (label) => {
      let finish: ((result: SkillExportSaveResult) => void) | undefined;
      const saveExport = vi.fn(
        () =>
          new Promise<SkillExportSaveResult>((resolve) => {
            finish = resolve;
          }),
      );
      installWindowMocks({ api: { skill: { saveExport } } });
      await renderWithI18n(
        <ToastProvider>
          <Detail />
        </ToastProvider>,
        { language: "en", settleAsyncEffects: true },
      );
      if (Detail === SkillDetailView)
        fireEvent.click(screen.getByRole("button", { name: "Source" }));
      await act(async () => {
        fireEvent.click(
          screen.getByRole("button", {
            name: new RegExp(label.replace(".", "\\.")),
          }),
        );
      });
      expect(screen.queryByText(/Exported/)).not.toBeInTheDocument();
      await act(async () => {
        if (!finish) throw new Error("Save request was not started");
        finish({
          status: "saved",
          fileName: label === "ZIP" ? "writer.zip" : "writer-SKILL.md",
        });
      });
      expect(
        screen.getByText(
          label === "ZIP" ? "Exported writer.zip" : "Exported writer-SKILL.md",
        ),
      ).toBeInTheDocument();
    },
  );

  it.each(["canceled", "failed"] as const)(
    "does not report success when saving is %s",
    async (status) => {
      installWindowMocks({
        api: { skill: { saveExport: vi.fn().mockResolvedValue({ status }) } },
      });
      await renderWithI18n(
        <ToastProvider>
          <Detail />
        </ToastProvider>,
        { language: "en", settleAsyncEffects: true },
      );
      if (Detail === SkillDetailView)
        fireEvent.click(screen.getByRole("button", { name: "Source" }));
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /ZIP/ }));
      });
      expect(screen.queryByText(/Exported/)).not.toBeInTheDocument();
      if (status === "failed")
        expect(
          screen.getByText("Could not export the Skill. Please try again."),
        ).toBeInTheDocument();
      else
        expect(
          screen.queryByText("Could not export the Skill. Please try again."),
        ).not.toBeInTheDocument();
    },
  );
});
