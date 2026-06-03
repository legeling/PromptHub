export interface SkillUserSidecar {
  schemaVersion: 1;
  notes: string;
  updatedAt: number;
}

const USER_SIDECAR_DIR = ".prompthub";
const USER_SIDECAR_PATH = `${USER_SIDECAR_DIR}/user.json`;

function isSkillUserSidecar(value: unknown): value is SkillUserSidecar {
  return (
    typeof value === "object" &&
    value !== null &&
    "schemaVersion" in value &&
    value.schemaVersion === 1 &&
    "notes" in value &&
    typeof value.notes === "string" &&
    "updatedAt" in value &&
    typeof value.updatedAt === "number" &&
    Number.isFinite(value.updatedAt)
  );
}

export async function readSkillUserSidecar(
  skillId: string,
): Promise<SkillUserSidecar | null> {
  const repoPath = await window.api.skill.getRepoPath(skillId);
  if (!repoPath) {
    return null;
  }

  const entry = await window.api.skill.readLocalFile(skillId, USER_SIDECAR_PATH);
  if (!entry || entry.isDirectory) {
    return null;
  }

  try {
    const parsed = JSON.parse(entry.content) as unknown;
    return isSkillUserSidecar(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function writeSkillUserSidecar(input: {
  skillId: string;
  notes: string;
}): Promise<SkillUserSidecar> {
  const sidecar: SkillUserSidecar = {
    schemaVersion: 1,
    notes: input.notes,
    updatedAt: Date.now(),
  };

  await window.api.skill.createLocalDir(input.skillId, USER_SIDECAR_DIR);
  await window.api.skill.writeLocalFile(
    input.skillId,
    USER_SIDECAR_PATH,
    JSON.stringify(sidecar, null, 2),
    { skipVersionSnapshot: true },
  );

  return sidecar;
}
