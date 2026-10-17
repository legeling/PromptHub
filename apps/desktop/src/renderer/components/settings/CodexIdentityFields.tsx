import { useTranslation } from "react-i18next";
import type {
  AgentIdentityChoice,
  AgentIdentityPreference,
} from "@prompthub/shared/types";
import { CheckIcon } from "lucide-react";

import { PlatformIcon } from "../ui/PlatformIcon";

const IDENTITY_CHOICES: AgentIdentityChoice[] = ["codex", "chatgpt"];

function choiceLabel(choice: AgentIdentityChoice): string {
  return choice === "chatgpt" ? "ChatGPT" : "Codex";
}

interface CodexIdentityFieldsProps {
  value: AgentIdentityPreference;
  onChange: (value: AgentIdentityPreference) => void;
}

export function CodexIdentityFields({
  value,
  onChange,
}: CodexIdentityFieldsProps) {
  const { t } = useTranslation();

  return (
    <div className="grid gap-3 rounded-lg border border-border/70 bg-background/70 p-3">
      <div>
        <div className="text-xs font-medium text-foreground">
          {t("settings.codexIdentity", "Codex identity")}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <div className="mb-1.5 text-xs font-medium text-muted-foreground">
            {t("settings.codexIdentityName", "Product name")}
          </div>
          <div
            role="group"
            aria-label={t("settings.codexIdentityName", "Product name")}
            className="grid grid-cols-2 rounded-md border border-border bg-muted/25 p-1"
          >
            {IDENTITY_CHOICES.map((choice) => {
              const label = choiceLabel(choice);
              const selected = value.name === choice;
              return (
                <button
                  key={choice}
                  type="button"
                  aria-label={t(
                    `settings.codexIdentityUse${label}Name`,
                    `Use ${label} name`,
                  )}
                  aria-pressed={selected}
                  onClick={() => onChange({ ...value, name: choice })}
                  className={`relative flex h-12 items-center justify-center rounded-md border px-8 text-sm font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/40 ${
                    selected
                      ? "border-primary bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                      : "border-transparent text-muted-foreground hover:bg-background/80 hover:text-foreground"
                  }`}
                >
                  {label}
                  {selected && (
                    <CheckIcon
                      aria-hidden="true"
                      className="absolute right-3 h-4 w-4"
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="mb-1.5 text-xs font-medium text-muted-foreground">
            {t("settings.codexIdentityIcon", "Product icon")}
          </div>
          <div
            role="group"
            aria-label={t("settings.codexIdentityIcon", "Product icon")}
            className="grid grid-cols-2 rounded-md border border-border bg-muted/25 p-1"
          >
            {IDENTITY_CHOICES.map((choice) => {
              const label = choiceLabel(choice);
              const selected = value.icon === choice;
              return (
                <button
                  key={choice}
                  type="button"
                  aria-label={t(
                    `settings.codexIdentityUse${label}Icon`,
                    `Use ${label} icon`,
                  )}
                  aria-pressed={selected}
                  onClick={() => onChange({ ...value, icon: choice })}
                  className={`relative flex h-12 items-center justify-center gap-2 rounded-md border px-8 text-sm font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/40 ${
                    selected
                      ? "border-primary bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                      : "border-transparent text-muted-foreground hover:bg-background/80 hover:text-foreground"
                  }`}
                >
                  <PlatformIcon platformId={choice} size={26} />
                  <span>{label}</span>
                  {selected && (
                    <CheckIcon
                      aria-hidden="true"
                      className="absolute right-3 h-4 w-4"
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
