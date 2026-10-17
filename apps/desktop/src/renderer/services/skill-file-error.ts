import type { TFunction } from "i18next";

type FileAction = "save" | "create" | "createFolder" | "rename" | "delete";

/** IPC diagnostics stay in logs; only recognized conditions select user copy. */
export function getSkillFileErrorFeedback(
  error: unknown,
  action: FileAction,
  t: TFunction,
): { message: string; type: "warning" | "error" } {
  const message = error instanceof Error ? error.message : String(error);
  if (
    message.includes("Skill package changed during editing; reload and retry")
  ) {
    return { message: t("skill.fileErrors.conflict"), type: "warning" };
  }
  if (message.includes("Skill package requires a UTF-8 SKILL.md entrypoint")) {
    return {
      message: t("skill.fileErrors.entrypointRequired"),
      type: "warning",
    };
  }
  return { message: t(`skill.fileErrors.${action}`), type: "error" };
}
