import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { DownloadIcon, UploadIcon } from "lucide-react";
import { parseHostedPluginBackup } from "@prompthub/shared/utils/hosted-plugin-schema";
import { HOSTED_RESOURCE_REQUEST_MAX_BYTES } from "@prompthub/shared/utils/hosted-resource-limits";
import { Button } from "../ui/Button";

export function HostedPluginBackup({
  busy,
  run,
}: {
  busy: boolean;
  run(operation: () => Promise<void>): Promise<boolean>;
}): JSX.Element {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  async function exportBackup(): Promise<void> {
    const files = await window.api.plugin.exportDataFiles();
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(files)], { type: "application/json" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "prompthub-plugins.json";
    anchor.click();
    // Allow the browser to consume the object URL before releasing it.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function importBackup(file: File): Promise<void> {
    if (file.size > HOSTED_RESOURCE_REQUEST_MAX_BYTES)
      throw new Error(t("hostedResources.requestLimit"));
    const content: unknown = JSON.parse(await file.text());
    await window.api.plugin.restoreDataFiles(parseHostedPluginBackup(content));
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          <UploadIcon className="h-4 w-4" />
          {t("hostedResources.importPlugins")}
        </Button>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => void run(exportBackup)}
        >
          <DownloadIcon className="h-4 w-4" />
          {t("hostedResources.exportPlugins")}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {t("hostedResources.pluginBackupHint")}
      </p>
      <input
        ref={input}
        type="file"
        accept=".json,application/json"
        className="hidden"
        aria-label={t("hostedResources.importPlugins")}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file && !busy) void run(() => importBackup(file));
        }}
      />
    </div>
  );
}
