import { BellDotIcon } from "lucide-react";

interface CardStatusBadgeProps {
  className?: string;
  label: string;
  testId?: string;
  title?: string;
  tone?: "info" | "danger";
}

export function CardStatusBadge({
  className = "",
  label,
  testId,
  title,
  tone = "info",
}: CardStatusBadgeProps) {
  const toneClassName =
    tone === "danger"
      ? "border-destructive/20 bg-destructive/10 text-destructive shadow-destructive/5"
      : "border-primary/20 bg-primary/10 text-primary shadow-primary/5";

  return (
    <span
      data-testid={testId}
      className={`inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold shadow-sm ${toneClassName} ${className}`}
      title={title ?? label}
    >
      <BellDotIcon
        aria-hidden="true"
        className="h-3 w-3 shrink-0 animate-pulse"
      />
      <span className="truncate">{label}</span>
    </span>
  );
}
