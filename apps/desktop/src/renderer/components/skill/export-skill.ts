import type {
  SkillExportFileFormat,
  SkillExportSaveResult,
} from "@prompthub/shared/types/skill-export";
import { isWebRuntime } from "../../runtime";
import { downloadSkillExport, downloadSkillZipExport } from "./detail-utils";

export async function exportSkillFile(
  skill: { id: string; name: string },
  format: SkillExportFileFormat,
): Promise<SkillExportSaveResult | { status: "download-started" }> {
  if (!isWebRuntime()) return window.api.skill.saveExport(skill.id, format);
  // Browsers expose download initiation, but not completion or cancellation.
  if (format === "zip") {
    downloadSkillZipExport(await window.api.skill.exportZip(skill.id));
  } else {
    downloadSkillExport(
      await window.api.skill.export(skill.id, format),
      skill.name,
      format,
    );
  }
  return { status: "download-started" };
}
