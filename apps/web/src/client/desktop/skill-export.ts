import type { Skill, SkillFileSnapshot } from "@prompthub/shared/types";

export function createWebSkillExports(get: <T>(path: string) => Promise<T>): {
  export: (id: string, format: "skillmd" | "json") => Promise<string>;
  exportZip: (id: string) => Promise<{ fileName: string; base64: string }>;
} {
  return {
    export: async (id, format) => {
      if (format !== "skillmd" && format !== "json")
        throw new Error("Invalid Skill export format");
      const { exportAsSkillMd, exportAsJson } =
        await import("@prompthub/core/skills/export");
      const skill = await get<Skill>(`/api/skills/${encodeURIComponent(id)}`);
      return format === "skillmd"
        ? exportAsSkillMd(skill)
        : exportAsJson(skill);
    },
    exportZip: async (id) => {
      const { createSkillZip, skillExportFileName } =
        await import("@prompthub/core/skills/export");
      const url = `/api/skills/${encodeURIComponent(id)}`;
      const [skill, files] = await Promise.all([
        get<Skill>(url),
        get<SkillFileSnapshot[]>(`${url}/files`),
      ]);
      const bytes = createSkillZip(files);
      const chunks: string[] = [];
      for (let offset = 0; offset < bytes.length; offset += 0x8000) {
        chunks.push(
          String.fromCharCode(...bytes.subarray(offset, offset + 0x8000)),
        );
      }
      return {
        fileName: skillExportFileName(skill.name, "zip"),
        base64: btoa(chunks.join("")),
      };
    },
  };
}
