import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { UploadIcon } from "lucide-react";
import { readSkillPackageZip } from "@prompthub/core/skills/import-package";
import { HOSTED_RESOURCE_REQUEST_MAX_BYTES } from "@prompthub/shared/utils/hosted-resource-limits";
import { parseSkillMd } from "@prompthub/core/skills/skill-frontmatter";
import { useSkillStore } from "../../stores/skill.store";
import { Button } from "../ui/Button";

export function HostedSkillPackageUpload({
  onComplete,
}: {
  onComplete(): void;
}): JSX.Element {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function upload(file: File): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      if (file.size > HOSTED_RESOURCE_REQUEST_MAX_BYTES)
        throw new Error(t("hostedResources.requestLimit"));
      const files = readSkillPackageZip(
        new Uint8Array(await file.arrayBuffer()),
      );
      const content = files.find(
        (entry) => entry.relativePath === "SKILL.md",
      )!.content;
      const parsed = parseSkillMd(content);
      const name = parsed?.frontmatter.name || file.name.replace(/\.zip$/i, "");
      await window.api.skill.create(
        {
          name,
          description: parsed?.frontmatter.description,
          content,
          protocol_type: "skill",
          is_favorite: false,
          visibility: "private",
        },
        { files },
      );
      await useSkillStore.getState().loadSkills();
      onComplete();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-2 rounded-xl border border-border p-4">
      <Button
        variant="secondary"
        disabled={busy}
        onClick={() => input.current?.click()}
      >
        <UploadIcon className="h-4 w-4" />
        {t("hostedResources.uploadSkillPackage")}
      </Button>
      <p className="text-sm text-muted-foreground">
        {t("hostedResources.uploadSkillPackageHint")}
      </p>
      <p className="text-xs text-muted-foreground">
        {t("hostedResources.requestLimit")}
      </p>
      <input
        ref={input}
        type="file"
        accept=".zip"
        className="hidden"
        aria-label={t("hostedResources.uploadSkillPackage")}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file && !busy) void upload(file);
        }}
      />
      {error && (
        <p role="alert" className="break-words text-sm text-destructive">
          {t("hostedResources.operationFailed")} {error}
        </p>
      )}
    </div>
  );
}
