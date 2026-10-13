import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { closeDatabase, initDatabase, SkillDB } from "@prompthub/db";
import { parsePromptHubBackupFile } from "../../../src/renderer/services/database-backup-format";
import { normalizeSkill } from "../../../src/renderer/services/skill-normalize";
import { SkillSafetyReportModal } from "../../../src/renderer/components/skill/SkillSafetyReportModal";
import { createTestI18n, renderWithI18n } from "../../helpers/i18n";

const roots: string[] = [];

afterEach(() => {
  closeDatabase();
  roots
    .splice(0)
    .forEach((root) => fs.rmSync(root, { recursive: true, force: true }));
});

function reopenedSkill(method: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "skill-provenance-ui-"));
  roots.push(root);
  const backup = {
    version: 1,
    exportedAt: new Date(0).toISOString(),
    prompts: [],
    folders: [],
    versions: [],
    skills: [
      {
        id: "provenance",
        name: "provenance",
        protocol_type: "skill",
        is_favorite: false,
        created_at: 1,
        updated_at: 1,
        safetyReport: {
          level: "safe",
          summary: "Imported report",
          findings: [],
          recommendedAction: "allow",
          scannedAt: 1,
          checkedFileCount: 2,
          scanMethod: method,
        },
      },
    ],
  };
  const imported = parsePromptHubBackupFile(
    JSON.stringify({ kind: "prompthub-backup", payload: backup }),
  ).backup.skills?.[0];
  if (!imported) throw new Error("Missing imported Skill fixture");
  const dbPath = path.join(root, "prompthub.db");
  new SkillDB(initDatabase(dbPath)).insertSkillDirect(imported);
  closeDatabase();
  const reopened = new SkillDB(initDatabase(dbPath)).getById(imported.id);
  if (!reopened) throw new Error("Missing reopened Skill fixture");
  return normalizeSkill(reopened);
}

describe("Skill scan provenance from backup to displayed report", () => {
  it.each(["ai", "preflight", "static"])(
    "preserves %s through import, SQLite reopen, normalization and rendering",
    async (method) => {
      const skill = reopenedSkill(method);
      const expected = method === "static" ? "preflight" : method;
      expect(skill.safetyReport?.scanMethod).toBe(expected);
      const key =
        expected === "ai"
          ? "skill.safetyScanMethodAI"
          : "skill.safetyScanMethodPreflight";
      const descriptionKey =
        expected === "ai"
          ? "skill.safetyScanMethodAIDesc"
          : "skill.safetyScanMethodPreflightDesc";
      const { i18n } = await renderWithI18n(
        <SkillSafetyReportModal
          isOpen
          isScanning={false}
          report={skill.safetyReport ?? null}
          onClose={vi.fn()}
          onRescan={vi.fn()}
        />,
      );
      expect(i18n.t(key)).not.toBe(key);
      expect(i18n.t(descriptionKey)).not.toBe(descriptionKey);
      expect(
        screen.getByText(`${i18n.t("skill.safetyScanMethod")}: ${i18n.t(key)}`),
      ).toBeVisible();
      expect(screen.getByText(i18n.t(descriptionKey))).toBeVisible();
      if (expected === "preflight") {
      expect(screen.queryByText(i18n.t("skill.safetyDimensionTitle"))).not.toBeInTheDocument();
      expect(screen.queryByText(i18n.t("skill.safetyDimContentDesc"))).not.toBeInTheDocument();
        expect(
          screen.queryByText(i18n.t("skill.safetyScanMethodAIDesc")),
        ).not.toBeInTheDocument();
    } else {
      expect(screen.getByText(i18n.t("skill.safetyDimensionTitle"))).toBeVisible();
      }
    },
  );

  it.each(["en", "zh", "zh-TW", "ja", "fr", "de", "es"])(
    "defines distinct current method labels and descriptions in %s",
    async (locale) => {
      const i18n = await createTestI18n(locale);
      for (const suffix of ["Preflight", "PreflightDesc"]) {
        const key = `skill.safetyScanMethod${suffix}`;
        expect(i18n.getResource(locale, "translation", key)).toBeTypeOf(
          "string",
        );
        expect(i18n.t(key)).not.toBe(
          i18n.t(
            suffix === "Preflight"
              ? "skill.safetyScanMethodAI"
              : "skill.safetyScanMethodAIDesc",
          ),
        );
      }
    },
  );
});
