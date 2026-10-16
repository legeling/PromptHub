import { SkillDB } from "./skill";

/** Current runtime writes only metadata. SkillDB retains the historical import codec. */
export class SkillMetadataDB extends SkillDB {
  protected override persistContent(): null {
    return null;
  }
  protected override persistFiles(): null {
    return null;
  }
}
