import { SkillDB } from "../database";
import type { Skill } from "@prompthub/shared/types";
import {
  CliError,
  EXIT_CODES,
  type CliContext,
  type CliDatabaseHooks,
} from "./types";
import { SKILL_HELP } from "./help";
import type { CliSkillService } from "./skill";
import { emitSuccess } from "./io";
import {
  skillOutputPayload,
  summarizeSkill,
  summarizeSkillVersion,
} from "./skill-output";
import {
  ensureNoUnknownOptions,
  parseCsv,
  parsePositiveNumberOption,
  readTextOption,
  requirePositional,
  takeFlag,
  takeOption,
} from "./args";
import {
  resolveProjectInstallSkill,
  resolveSkillIdentifier,
  skillPlatformRows,
  skillTableRows,
  skillVersionTableRows,
} from "./select";

export async function uninstallSkillFromPlatforms(
  skillService: CliSkillService,
  skillName: string,
) {
  const platforms = skillService.getSupportedPlatforms();
  const settled = await Promise.allSettled(
    platforms.map((platform) =>
      skillService.uninstallSkillMd(skillName, platform.id),
    ),
  );

  return settled.map((result, index) => ({
    platform: platforms[index].id,
    status: result.status,
    ...(result.status === "rejected"
      ? {
          reason:
            result.reason instanceof Error
              ? result.reason.message
              : String(result.reason),
        }
      : {}),
  }));
}

export async function handleSkillDelete(
  skillDb: SkillDB,
  skill: Skill,
  args: string[],
  context: CliContext,
): Promise<void> {
  const keepPlatformInstalls = takeFlag(args, "--keep-platform-installs");
  const purgeManagedRepo = takeFlag(args, "--purge-managed-repo");
  ensureNoUnknownOptions(args);

  const uninstallResults = keepPlatformInstalls
    ? []
    : await uninstallSkillFromPlatforms(context.skills, skill.name);

  let purgedManagedRepo = false;
  if (
    purgeManagedRepo &&
    skill.local_repo_path &&
    (await context.skills.isManagedRepoPath(skill.local_repo_path))
  ) {
    await context.skills.deleteRepoByPath(skill.local_repo_path);
    purgedManagedRepo = true;
  }

  if (!skillDb.delete(skill.id)) {
    throw new CliError(
      "NOT_FOUND",
      `Skill 不存在: ${skill.id}`,
      EXIT_CODES.NOT_FOUND,
    );
  }

  emitSuccess(context, {
    deleted: true,
    id: skill.id,
    name: skill.name,
    platformInstallsKept: keepPlatformInstalls,
    managedRepoPurged: purgedManagedRepo,
    uninstallResults,
  });
}

export async function handleSkillCommand(
  args: string[],
  context: CliContext,
  databaseHooks: CliDatabaseHooks,
): Promise<void> {
  if (args.length === 0 || takeFlag(args, "--help") || takeFlag(args, "-h")) {
    context.io.stdout(SKILL_HELP);
    return;
  }

  const requestedAction = requirePositional(args, 0, "skill 子命令");
  const action =
    requestedAction === "import"
      ? "install"
      : requestedAction === "distribute"
        ? "install-md"
        : requestedAction === "undistribute"
          ? "uninstall-md"
          : requestedAction;
  const db = databaseHooks.initDatabase();
  const skillDb = new SkillDB(db);

  if (action === "list") {
    const skills = skillDb.getAll();
    emitSuccess(
      context,
      context.detail === "full"
        ? skills
        : skills.map((skill) => summarizeSkill(skill)),
      await skillTableRows(context.skills, skills),
    );
    return;
  }

  if (action === "get") {
    const identifier = requirePositional(args, 1, "skill id 或 name");
    const { skill } = resolveSkillIdentifier(skillDb, identifier);
    emitSuccess(context, await skillOutputPayload(context, skillDb, skill));
    return;
  }

  if (action === "install") {
    const source = requirePositional(args, 1, "skill source");
    const installArgs = args.slice(2);
    const name = takeOption(installArgs, "--name");
    ensureNoUnknownOptions(installArgs);
    const skillId = await context.skills.installFromSource(source, skillDb, {
      name,
    });
    emitSuccess(
      context,
      await skillOutputPayload(context, skillDb, skillDb.getById(skillId)),
    );
    return;
  }

  if (action === "project-install" || action === "install-project") {
    const installArgs = args.slice(1);
    const identifier =
      installArgs[0] && !installArgs[0].startsWith("-")
        ? installArgs.shift()
        : undefined;
    const projectRoot = takeOption(installArgs, "--project");
    const targetRootDir = takeOption(installArgs, "--target");
    const mode = takeOption(installArgs, "--mode") ?? "copy";
    const force = takeFlag(installArgs, "--force");
    ensureNoUnknownOptions(installArgs);

    if (mode !== "copy" && mode !== "symlink") {
      throw new CliError(
        "USAGE_ERROR",
        "skill project-install 的 --mode 必须是 copy 或 symlink",
        EXIT_CODES.USAGE,
      );
    }

    const skill = await resolveProjectInstallSkill(
      context,
      skillDb,
      identifier,
    );
    const result = await context.skills.installSkillToProject(
      skillDb,
      skill.id,
      {
        projectRoot: projectRoot?.trim() || undefined,
        targetRootDir: targetRootDir?.trim() || undefined,
        mode,
        ifExists: force ? "overwrite" : "skip",
      },
    );
    emitSuccess(context, {
      ...result,
      forced: force,
    });
    return;
  }

  if (action === "versions") {
    const identifier = requirePositional(args, 1, "skill id 或 name");
    ensureNoUnknownOptions(args.slice(2));
    const { skill } = resolveSkillIdentifier(skillDb, identifier);
    const versions = skillDb.getVersions(skill.id);
    emitSuccess(
      context,
      context.detail === "full"
        ? versions
        : versions.map((version) =>
            summarizeSkillVersion(version, skill.directory_fingerprint),
          ),
      skillVersionTableRows(versions),
    );
    return;
  }

  if (action === "create-version") {
    const identifier = requirePositional(args, 1, "skill id 或 name");
    const versionArgs = args.slice(2);
    const note = takeOption(versionArgs, "--note");
    ensureNoUnknownOptions(versionArgs);
    const { skill } = resolveSkillIdentifier(skillDb, identifier);
    const version = await context.skills.createVersion(skillDb, skill.id, note);
    emitSuccess(
      context,
      context.detail === "full"
        ? version
        : summarizeSkillVersion(version, skill.directory_fingerprint),
    );
    return;
  }

  if (action === "rollback") {
    const identifier = requirePositional(args, 1, "skill id 或 name");
    const rollbackArgs = args.slice(2);
    const version = parsePositiveNumberOption(
      takeOption(rollbackArgs, "--version"),
      "--version",
    );
    ensureNoUnknownOptions(rollbackArgs);
    if (version === undefined) {
      throw new CliError(
        "USAGE_ERROR",
        "skill rollback 需要有效的 --version",
        EXIT_CODES.USAGE,
      );
    }
    const { skill } = resolveSkillIdentifier(skillDb, identifier);
    const updated = await context.skills.rollbackVersion(
      skillDb,
      skill.id,
      version,
    );
    if (!updated) {
      throw new CliError(
        "NOT_FOUND",
        `Skill 版本不存在: ${identifier}@v${version}`,
        EXIT_CODES.NOT_FOUND,
      );
    }
    emitSuccess(context, await skillOutputPayload(context, skillDb, updated));
    return;
  }

  if (action === "delete-version") {
    const identifier = requirePositional(args, 1, "skill id 或 name");
    const versionId = requirePositional(args, 2, "version id");
    ensureNoUnknownOptions(args.slice(3));
    const { skill } = resolveSkillIdentifier(skillDb, identifier);
    const deleted = await context.skills.deleteVersion(
      skillDb,
      skill.id,
      versionId,
    );
    if (!deleted) {
      throw new CliError(
        "NOT_FOUND",
        `Skill 版本不存在: ${identifier}@${versionId}`,
        EXIT_CODES.NOT_FOUND,
      );
    }
    emitSuccess(context, { deleted: true, skillId: skill.id, versionId });
    return;
  }

  if (action === "export") {
    const identifier = requirePositional(args, 1, "skill id 或 name");
    const exportArgs = args.slice(2);
    const format = takeOption(exportArgs, "--format");
    ensureNoUnknownOptions(exportArgs);
    if (format !== "skillmd" && format !== "json") {
      throw new CliError(
        "USAGE_ERROR",
        "skill export 需要 --format skillmd|json",
        EXIT_CODES.USAGE,
      );
    }
    const { skill } = resolveSkillIdentifier(skillDb, identifier);
    context.io.stdout(
      format === "skillmd"
        ? context.skills.exportAsSkillMd(skill)
        : context.skills.exportAsJson(skill),
    );
    return;
  }

  if (action === "platforms") {
    ensureNoUnknownOptions(args.slice(1));
    const platforms = context.skills.getSupportedPlatforms();
    const detected = await context.skills.detectInstalledPlatforms();
    emitSuccess(
      context,
      platforms.map((platform) => ({
        id: platform.id,
        name: platform.name,
        installed: detected.includes(platform.id),
      })),
      skillPlatformRows(platforms, detected),
    );
    return;
  }

  if (action === "platform-status") {
    const identifier = requirePositional(args, 1, "skill id 或 name");
    ensureNoUnknownOptions(args.slice(2));
    const { skill } = resolveSkillIdentifier(skillDb, identifier);
    emitSuccess(
      context,
      await context.skills.getSkillMdInstallStatus(skill.name, skill.id),
    );
    return;
  }

  if (action === "install-md") {
    const identifier = requirePositional(args, 1, "skill id 或 name");
    const installArgs = args.slice(2);
    const platformId = takeOption(installArgs, "--platform");
    ensureNoUnknownOptions(installArgs);
    if (!platformId?.trim()) {
      throw new CliError(
        "USAGE_ERROR",
        "skill install-md 需要 --platform",
        EXIT_CODES.USAGE,
      );
    }
    const { skill } = resolveSkillIdentifier(skillDb, identifier);
    await context.skills.installSkillMd(
      skillDb,
      skill.name,
      skill.instructions || skill.content || "",
      platformId.trim(),
      skill.id,
    );
    emitSuccess(context, {
      installed: true,
      skillId: skill.id,
      platformId: platformId.trim(),
    });
    return;
  }

  if (action === "uninstall-md") {
    const identifier = requirePositional(args, 1, "skill id 或 name");
    const uninstallArgs = args.slice(2);
    const platformId = takeOption(uninstallArgs, "--platform");
    ensureNoUnknownOptions(uninstallArgs);
    if (!platformId?.trim()) {
      throw new CliError(
        "USAGE_ERROR",
        "skill uninstall-md 需要 --platform",
        EXIT_CODES.USAGE,
      );
    }
    const { skill } = resolveSkillIdentifier(skillDb, identifier);
    await context.skills.uninstallSkillMd(
      skill.name,
      platformId.trim(),
      skill.id,
    );
    emitSuccess(context, {
      uninstalled: true,
      skillId: skill.id,
      platformId: platformId.trim(),
    });
    return;
  }

  if (action === "repo-files") {
    const identifier = requirePositional(args, 1, "skill id 或 name");
    ensureNoUnknownOptions(args.slice(2));
    const { skill } = resolveSkillIdentifier(skillDb, identifier);
    const files = await context.skills.listLocalFiles(skillDb, skill.id);
    emitSuccess(context, files);
    return;
  }

  if (action === "repo-read") {
    const identifier = requirePositional(args, 1, "skill id 或 name");
    const readArgs = args.slice(2);
    const relativePath = takeOption(readArgs, "--path");
    ensureNoUnknownOptions(readArgs);
    if (!relativePath?.trim()) {
      throw new CliError(
        "USAGE_ERROR",
        "skill repo-read 需要 --path",
        EXIT_CODES.USAGE,
      );
    }
    const { skill } = resolveSkillIdentifier(skillDb, identifier);
    emitSuccess(
      context,
      await context.skills.readLocalFile(
        skillDb,
        skill.id,
        relativePath.trim(),
      ),
    );
    return;
  }

  if (action === "repo-write") {
    const identifier = requirePositional(args, 1, "skill id 或 name");
    const writeArgs = args.slice(2);
    const relativePath = takeOption(writeArgs, "--path");
    const content = readTextOption(writeArgs, "--content", "--content-file");
    ensureNoUnknownOptions(writeArgs);
    if (!relativePath?.trim() || content === undefined) {
      throw new CliError(
        "USAGE_ERROR",
        "skill repo-write 需要 --path 和 --content/--content-file",
        EXIT_CODES.USAGE,
      );
    }
    const { skill } = resolveSkillIdentifier(skillDb, identifier);
    await context.skills.writeLocalFile(
      skillDb,
      skill.id,
      relativePath.trim(),
      content,
    );
    emitSuccess(context, {
      written: true,
      skillId: skill.id,
      path: relativePath.trim(),
    });
    return;
  }

  if (action === "repo-delete") {
    const identifier = requirePositional(args, 1, "skill id 或 name");
    const deleteArgs = args.slice(2);
    const relativePath = takeOption(deleteArgs, "--path");
    ensureNoUnknownOptions(deleteArgs);
    if (!relativePath?.trim()) {
      throw new CliError(
        "USAGE_ERROR",
        "skill repo-delete 需要 --path",
        EXIT_CODES.USAGE,
      );
    }
    const { skill } = resolveSkillIdentifier(skillDb, identifier);
    await context.skills.deleteLocalFile(
      skillDb,
      skill.id,
      relativePath.trim(),
    );
    emitSuccess(context, {
      deleted: true,
      skillId: skill.id,
      path: relativePath.trim(),
    });
    return;
  }

  if (action === "repo-mkdir") {
    const identifier = requirePositional(args, 1, "skill id 或 name");
    const mkdirArgs = args.slice(2);
    const relativePath = takeOption(mkdirArgs, "--path");
    ensureNoUnknownOptions(mkdirArgs);
    if (!relativePath?.trim()) {
      throw new CliError(
        "USAGE_ERROR",
        "skill repo-mkdir 需要 --path",
        EXIT_CODES.USAGE,
      );
    }
    const { skill } = resolveSkillIdentifier(skillDb, identifier);
    await context.skills.createLocalDir(skillDb, skill.id, relativePath.trim());
    emitSuccess(context, {
      created: true,
      skillId: skill.id,
      path: relativePath.trim(),
    });
    return;
  }

  if (action === "repo-rename") {
    const identifier = requirePositional(args, 1, "skill id 或 name");
    const renameArgs = args.slice(2);
    const oldPath = takeOption(renameArgs, "--from");
    const newPath = takeOption(renameArgs, "--to");
    ensureNoUnknownOptions(renameArgs);
    if (!oldPath?.trim() || !newPath?.trim()) {
      throw new CliError(
        "USAGE_ERROR",
        "skill repo-rename 需要 --from 和 --to",
        EXIT_CODES.USAGE,
      );
    }
    const { skill } = resolveSkillIdentifier(skillDb, identifier);
    await context.skills.renameLocalPath(
      skillDb,
      skill.id,
      oldPath.trim(),
      newPath.trim(),
    );
    emitSuccess(context, {
      renamed: true,
      skillId: skill.id,
      from: oldPath.trim(),
      to: newPath.trim(),
    });
    return;
  }

  if (action === "sync-from-repo") {
    const identifier = requirePositional(args, 1, "skill id 或 name");
    ensureNoUnknownOptions(args.slice(2));
    const { skill } = resolveSkillIdentifier(skillDb, identifier);
    emitSuccess(
      context,
      await skillOutputPayload(
        context,
        skillDb,
        await context.skills.syncFromRepo(skillDb, skill.id),
      ),
    );
    return;
  }

  if (action === "scan-safety") {
    const identifier = requirePositional(args, 1, "skill id 或 name");
    ensureNoUnknownOptions(args.slice(2));
    const { skill } = resolveSkillIdentifier(skillDb, identifier);
    const report = await context.skills.scanSafety({
      enabled: true,
      method: "static",
      name: skill.name,
      content: skill.instructions || skill.content,
      sourceUrl: skill.source_url,
      localRepoPath: skill.local_repo_path,
    });
    emitSuccess(context, report);
    return;
  }

  if (action === "update") {
    const identifier = requirePositional(args, 1, "skill id 或 name");
    const updateArgs = args.slice(2);
    const description = takeOption(updateArgs, "--description");
    const version = takeOption(updateArgs, "--version");
    const author = takeOption(updateArgs, "--author");
    const tags = parseCsv(takeOption(updateArgs, "--tags"));
    const sourceLabel = takeOption(updateArgs, "--source-label");
    const favorite = takeFlag(updateArgs, "--favorite")
      ? true
      : takeFlag(updateArgs, "--unfavorite")
        ? false
        : undefined;
    ensureNoUnknownOptions(updateArgs);
    const { skill } = resolveSkillIdentifier(skillDb, identifier);
    const updated = await context.skills.updateMetadata(skillDb, skill.id, {
      ...(description !== undefined && { description }),
      ...(version !== undefined && { version }),
      ...(author !== undefined && { author }),
      ...(tags !== undefined && { tags }),
      ...(sourceLabel !== undefined && { source_label: sourceLabel }),
      ...(favorite !== undefined && { is_favorite: favorite }),
    });
    if (!updated) {
      throw new CliError(
        "NOT_FOUND",
        `Skill 不存在: ${identifier}`,
        EXIT_CODES.NOT_FOUND,
      );
    }
    emitSuccess(context, await skillOutputPayload(context, skillDb, updated));
    return;
  }

  if (action === "check-update") {
    const identifier = requirePositional(args, 1, "skill id 或 name");
    const checkArgs = args.slice(2);
    const fetchRemote = takeFlag(checkArgs, "--fetch-remote");
    ensureNoUnknownOptions(checkArgs);
    const { skill } = resolveSkillIdentifier(skillDb, identifier);
    emitSuccess(
      context,
      await context.skills.checkSourceUpdate(skillDb, skill.id, {
        fetchRemote,
      }),
    );
    return;
  }

  if (action === "delete" || action === "remove") {
    const identifier = requirePositional(args, 1, "skill id 或 name");
    const { skill } = resolveSkillIdentifier(skillDb, identifier);
    await handleSkillDelete(skillDb, skill, args.slice(2), context);
    return;
  }

  if (action === "scan") {
    const scanned = await context.skills.scanLocalPreview(
      args.slice(1),
      skillDb,
    );
    emitSuccess(
      context,
      scanned,
      scanned.map((skill) => ({
        name: skill.name,
        safety: skill.safetyReport?.level ?? "unknown",
        findings: Array.isArray(skill.safetyReport?.findings)
          ? skill.safetyReport.findings.length
          : 0,
        author: skill.author,
        version: skill.version,
        platforms: skill.platforms,
        localPath: skill.localPath,
      })),
    );
    return;
  }

  throw new CliError(
    "USAGE_ERROR",
    `不支持的 skill 子命令: ${requestedAction}`,
    EXIT_CODES.USAGE,
  );
}
