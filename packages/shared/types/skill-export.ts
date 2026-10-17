export type SkillExportFileFormat = "skillmd" | "zip";

export type SkillExportSaveResult =
  | { status: "saved"; fileName: string }
  | { status: "canceled" }
  | { status: "failed" };
