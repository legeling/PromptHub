import { Loader2Icon } from "lucide-react";
import { clsx } from "clsx";

type SpinnerSize = "xs" | "sm" | "md" | "lg";
type SpinnerTone = "primary" | "muted" | "current";

interface SpinnerProps {
  size?: SpinnerSize;
  tone?: SpinnerTone;
  label?: string;
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
}

const SIZE_CLASS: Record<SpinnerSize, string> = {
  xs: "h-3.5 w-3.5",
  sm: "h-4 w-4",
  md: "h-5 w-5",
  lg: "h-8 w-8",
};

const TONE_CLASS: Record<SpinnerTone, string> = {
  primary: "text-primary",
  muted: "text-muted-foreground",
  current: "text-current",
};

/**
 * Consistent loading indicator for renderer UI.
 *
 * Use `label` when the spinner is the only loading affordance in the region.
 * Leave it unset when adjacent text already describes the loading state.
 */
export function Spinner({
  size = "md",
  tone = "primary",
  label,
  className,
  "aria-hidden": ariaHidden,
}: SpinnerProps) {
  const forcedHidden =
    ariaHidden === true || ariaHidden === "true"
      ? true
      : ariaHidden === false || ariaHidden === "false"
        ? false
        : undefined;
  const isDecorative = forcedHidden ?? !label;

  return (
    <Loader2Icon
      aria-hidden={isDecorative ? true : undefined}
      aria-label={isDecorative ? undefined : label}
      role={isDecorative ? undefined : "status"}
      className={clsx(
        "shrink-0 animate-spin motion-reduce:animate-none",
        SIZE_CLASS[size],
        TONE_CLASS[tone],
        className,
      )}
    />
  );
}
