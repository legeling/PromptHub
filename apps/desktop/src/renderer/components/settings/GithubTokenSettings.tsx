import { useState } from "react";
import { ExternalLinkIcon, EyeIcon, EyeOffIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useSettingsStore } from "../../stores/settings.store";
import { SettingSection } from "./shared";

export function GithubTokenSettings() {
  const { t } = useTranslation();
  const githubToken = useSettingsStore((state) => state.githubToken);
  const setGithubToken = useSettingsStore((state) => state.setGithubToken);
  const [visible, setVisible] = useState(false);

  return (
    <SettingSection
      title={t("settings.githubTokenTitle", "GitHub Access Token")}
    >
      <div className="space-y-3 p-4">
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t("settings.githubTokenDesc")}
        </p>
        <div className="flex items-center gap-2">
          <input
            type={visible ? "text" : "password"}
            autoComplete="off"
            spellCheck={false}
            value={githubToken}
            onChange={(event) => setGithubToken(event.target.value)}
            placeholder={t(
              "settings.githubTokenPlaceholder",
              "ghp_… or github_pat_…",
            )}
            className="h-9 flex-1 rounded-lg border-0 bg-muted px-3 font-mono text-sm placeholder:text-muted-foreground/50"
            aria-label={t("settings.githubTokenTitle", "GitHub Access Token")}
          />
          <button
            type="button"
            onClick={() => setVisible((current) => !current)}
            className="h-9 rounded-lg border border-border px-3 text-sm text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
            aria-label={
              visible
                ? t("settings.githubTokenHide", "Hide token")
                : t("settings.githubTokenShow", "Show token")
            }
            title={
              visible
                ? t("settings.githubTokenHide", "Hide token")
                : t("settings.githubTokenShow", "Show token")
            }
          >
            {visible ? (
              <EyeOffIcon aria-hidden="true" className="h-4 w-4" />
            ) : (
              <EyeIcon aria-hidden="true" className="h-4 w-4" />
            )}
          </button>
          {githubToken ? (
            <button
              type="button"
              onClick={() => setGithubToken("")}
              className="h-9 rounded-lg border border-border px-3 text-sm text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
            >
              {t("common.clear", "Clear")}
            </button>
          ) : null}
        </div>
        <a
          href="https://github.com/settings/tokens"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          <ExternalLinkIcon className="h-3 w-3" />
          {t("settings.githubTokenLearnMore", "Create a personal access token")}
        </a>
      </div>
    </SettingSection>
  );
}
