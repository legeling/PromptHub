import { serializeHostedResourceRequest } from "@prompthub/shared/utils/hosted-resource-limits";
import type {
  Skill,
  SkillFileSnapshot,
  SkillLocalFileEntry,
  SkillLocalFileTreeEntry,
} from "@prompthub/shared/types";
import {
  managedSkillFilesRevision,
  parseManagedSkillFiles,
} from "@prompthub/shared/utils/managed-skill-files";
import {
  skillSnapshotByteLength,
  validateSkillSnapshotPath,
} from "@prompthub/shared/utils/skill-file-snapshot";

type Request = <T>(path: string, init?: RequestInit) => Promise<T>;
const endpoint = (id: string): string =>
  `/api/skills/${encodeURIComponent(id)}/files`;

function entry(file: SkillFileSnapshot, revision: string): SkillLocalFileEntry {
  return {
    path: file.relativePath,
    content: file.encoding === "base64" ? "" : file.content,
    isDirectory: false,
    encoding: file.encoding === "base64" ? "placeholder" : "text",
    revision,
  };
}

export interface HostedSkillFileBridge {
  listLocalFiles(id: string): Promise<SkillLocalFileTreeEntry[]>;
  readLocalFile(id: string, path: string): Promise<SkillLocalFileEntry | null>;
  readLocalFiles(id: string): Promise<SkillLocalFileEntry[]>;
  writeLocalFile(id: string, path: string, content: string): Promise<void>;
}

/** Editor drafts retain their original package revision even if another file is opened. */
export function createHostedSkillFiles(
  request: Request,
): HostedSkillFileBridge {
  const drafts = new Map<string, SkillFileSnapshot[]>();
  async function read(id: string): Promise<SkillFileSnapshot[]> {
    return parseManagedSkillFiles(await request(endpoint(id)));
  }
  function remember(
    id: string,
    file: SkillFileSnapshot,
    files: SkillFileSnapshot[],
  ): SkillLocalFileEntry {
    const key = JSON.stringify([id, file.relativePath]);
    if (drafts.size >= 512) drafts.delete(drafts.keys().next().value!);
    drafts.set(key, files);
    return entry(file, managedSkillFilesRevision(files));
  }
  return {
    listLocalFiles: async (id) =>
      (await read(id)).map((file) => ({
        path: file.relativePath,
        isDirectory: false,
        size: skillSnapshotByteLength(file),
      })),
    readLocalFiles: async (id) => {
      const files = await read(id);
      return files.map((file) => remember(id, file, files));
    },
    readLocalFile: async (id, path) => {
      validateSkillSnapshotPath(path);
      const files = await read(id);
      const file = files.find((item) => item.relativePath === path);
      return file ? remember(id, file, files) : null;
    },
    writeLocalFile: async (id, path, content) => {
      validateSkillSnapshotPath(path);
      const key = JSON.stringify([id, path]);
      const previous = drafts.get(key);
      if (!previous)
        throw new Error(
          "Skill package changed during editing; reload and retry",
        );
      const selected = previous.find((file) => file.relativePath === path);
      if (!selected || selected.encoding === "base64")
        throw new Error("Only existing text files can be edited");
      const files = parseManagedSkillFiles(
        previous.map((file) =>
          file === selected
            ? { relativePath: path, content, encoding: "utf8" }
            : file,
        ),
      );
      await request<Skill>(endpoint(id), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: serializeHostedResourceRequest({
          files,
          revision: managedSkillFilesRevision(previous),
        }),
      });
      drafts.set(key, files);
    },
  };
}
