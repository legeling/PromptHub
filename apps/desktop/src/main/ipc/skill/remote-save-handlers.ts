import { ipcMain } from "electron";
import { IPC_CHANNELS } from "@prompthub/shared/constants";
import type {
  RemoteSkillPackageSaveResult,
  SkillPackageOperationRequest,
  SkillPackageOperationResult,
  SkillSafetyScanInput,
} from "@prompthub/shared/types";
import { sanitizeSkillPackageSourceUrl } from "@prompthub/core/skills/package-operation";
import type { SkillIPCContext } from "./shared";

type RemoteSource = Extract<
  SkillPackageOperationRequest["source"],
  { kind: "remote-git" | "remote-zip" }
>;

/** Adapt existing save IPCs at one boundary; the package lifecycle owns all writes. */
export function registerSkillRemoteSaveHandlers(
  { db }: SkillIPCContext,
  run: (
    request: SkillPackageOperationRequest,
  ) => Promise<SkillPackageOperationResult>,
): void {
  async function saveRemotePackage(
    skillId: string,
    source: RemoteSource,
  ): Promise<RemoteSkillPackageSaveResult> {
    const skill = db.getById(skillId);
    if (!skill) throw new Error(`Skill not found: ${skillId}`);
    if (source.kind === "remote-git") {
      source = {
        ...source,
        branch: source.branch ?? skill.source_branch,
        directory: source.directory ?? skill.source_directory,
      };
    }
    const result = await run({
      operation: "update",
      skillId,
      source,
      content: "",
      markAsBuiltin: false,
      registrySkill: {
        ...skill,
        slug: skill.registry_slug || skill.name,
        name: skill.logical_name || skill.name,
        description: skill.description || "",
        author: skill.author || "",
        category: skill.category || "general",
        version: skill.version || "",
        content: "",
        tags: skill.original_tags || [],
        source_url: sanitizeSkillPackageSourceUrl(
          source.kind === "remote-git" ? source.repoUrl : source.zipUrl,
        ),
        source_branch: source.kind === "remote-git" ? source.branch : undefined,
        source_directory:
          source.kind === "remote-git" ? source.directory : undefined,
        canonical_skill_path: undefined,
      },
    });
    if (result.status !== "completed") {
      throw new Error(
        "failure" in result
          ? result.failure.summary
          : `Remote package save did not complete: ${result.status}`,
      );
    }
    if (!result.skill.local_repo_path)
      throw new Error("Published Skill has no package path");
    return { status: "saved", repoPath: result.skill.local_repo_path };
  }

  ipcMain.handle(
    IPC_CHANNELS.SKILL_SAVE_REMOTE_GIT_TO_REPO,
    async (
      _,
      skillId: string,
      options?: {
        repoUrl?: string;
        branch?: string;
        directory?: string;
        safetyScan?: {
          mode?: "enabled" | "disabled";
          aiConfig?: SkillSafetyScanInput["aiConfig"];
        };
        approvedPackageFingerprint?: string;
      },
    ) => {
      if (typeof skillId !== "string" || skillId.trim().length === 0) {
        throw new Error(
          "skill:saveRemoteGitToRepo requires a non-empty skillId",
        );
      }
      if (
        !options ||
        typeof options.repoUrl !== "string" ||
        options.repoUrl.trim().length === 0
      ) {
        throw new Error(
          "skill:saveRemoteGitToRepo requires a non-empty repoUrl",
        );
      }
      return saveRemotePackage(skillId, {
        kind: "remote-git",
        repoUrl: options.repoUrl,
        branch: options.branch,
        directory: options.directory,
      });
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SKILL_SAVE_REMOTE_ZIP_TO_REPO,
    async (
      _,
      skillId: string,
      options?: {
        zipUrl?: string;
        safetyScan?: {
          mode?: "enabled" | "disabled";
          aiConfig?: SkillSafetyScanInput["aiConfig"];
        };
        approvedPackageFingerprint?: string;
      },
    ) => {
      if (typeof skillId !== "string" || skillId.trim().length === 0) {
        throw new Error(
          "skill:saveRemoteZipToRepo requires a non-empty skillId",
        );
      }
      if (
        !options ||
        typeof options.zipUrl !== "string" ||
        options.zipUrl.trim().length === 0
      ) {
        throw new Error(
          "skill:saveRemoteZipToRepo requires a non-empty zipUrl",
        );
      }
      return saveRemotePackage(skillId, {
        kind: "remote-zip",
        zipUrl: options.zipUrl,
      });
    },
  );
}
