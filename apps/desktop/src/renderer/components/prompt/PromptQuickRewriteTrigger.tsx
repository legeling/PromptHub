import { SparklesIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

interface PromptQuickRewriteTriggerProps {
  onClick: () => void;
  className?: string;
}

export function PromptQuickRewriteTrigger({
  onClick,
  className = "",
}: PromptQuickRewriteTriggerProps) {
  const { t } = useTranslation();

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t("prompt.quickRewriteOpen")}
      title={t("prompt.quickRewriteOpen")}
      className={className}
    >
      <SparklesIcon className="w-4 h-4" />
    </button>
  );
}
