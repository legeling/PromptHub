import * as fs from "fs/promises";
import { sanitizeSkillPackageDiagnostic } from "./package-operation";

/** Disposable acquisition data is not part of the publication transaction. */
export async function cleanupSkillAcquisitionDirectory(
  directory: string,
): Promise<void> {
  try {
    await fs.rm(directory, { recursive: true, force: true });
  } catch (error) {
    console.error(
      `Skill acquisition cleanup failed; retained directory: ${directory}`,
      sanitizeSkillPackageDiagnostic(error),
    );
  }
}
