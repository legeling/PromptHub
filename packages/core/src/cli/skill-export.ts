import fs from "node:fs/promises";
import path from "node:path";
import type { SkillDB } from "../database";
import { createSkillZip } from "../skills/export";
import { ensureNoUnknownOptions, requirePositional, takeOption } from "./args";
import { resolveSkillIdentifier } from "./select";
import { emitSuccess } from "./io";
import { CliError, EXIT_CODES, type CliContext } from "./types";

export async function handleSkillExport(
  args: string[],
  db: SkillDB,
  context: CliContext,
): Promise<void> {
  const identifier = requirePositional(args, 1, "Skill ID or name");
  const options = args.slice(2);
  const format = takeOption(options, "--format");
  const file = takeOption(options, "--file");
  ensureNoUnknownOptions(options);
  if (
    !["skillmd", "json", "zip"].includes(format ?? "") ||
    (format === "zip" && !file)
  )
    throw new CliError(
      "USAGE_ERROR",
      "skill export requires --format skillmd|json|zip; ZIP also requires --file",
      EXIT_CODES.USAGE,
    );
  const { skill } = resolveSkillIdentifier(db, identifier);
  let content: string | Uint8Array;
  if (format === "zip") {
    const files = await context.skills.readCurrentFilesSnapshot(db, skill.id);
    if (!files) throw new Error("Skill package is missing");
    content = createSkillZip(files);
  } else
    content =
      format === "skillmd"
        ? context.skills.exportAsSkillMd(skill)
        : context.skills.exportAsJson(skill);
  if (!file && typeof content === "string") {
    context.io.stdout(content);
    return;
  }
  const destination = path.resolve(file!);
  // An existing export is never silently overwritten.
  await fs.writeFile(destination, content, { flag: "wx" });
  emitSuccess(context, { exported: true, path: destination, format });
}
