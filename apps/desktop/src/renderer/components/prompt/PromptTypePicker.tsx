import type { PromptType } from "@prompthub/shared/types";
import { ImageIcon, MessageSquareTextIcon, VideoIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

const options = [
  { type: "text", label: "prompt.typeText", Icon: MessageSquareTextIcon },
  { type: "image", label: "prompt.typeImage", Icon: ImageIcon },
  { type: "video", label: "prompt.videoLabel", Icon: VideoIcon },
] as const;

export function PromptTypePicker({ value, onChange }: {
  value: PromptType;
  onChange: (type: PromptType) => void;
}): JSX.Element {
  const { t } = useTranslation();
  return (
    <div role="group" aria-label={t("prompt.type")} className="flex flex-wrap gap-2">
      {options.map(({ type, label, Icon }) => (
        <button
          key={type}
          type="button"
          aria-pressed={value === type}
          onClick={() => onChange(type)}
          className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${value === type
            ? "border-primary/30 bg-primary/10 text-primary"
            : "border-border bg-muted/20 text-muted-foreground hover:bg-muted/40"}`}
        >
          <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
          {t(label)}
        </button>
      ))}
    </div>
  );
}
