import { useId, type ReactElement } from "react";
import {
  BookOpenIcon,
  BotIcon,
  BoxIcon,
  CommandIcon,
  ServerIcon,
} from "lucide-react";

// Compare fixed light/dark surfaces while inheriting the user's accent color.
const palettes = {
  light:
    "[--background:var(--palette-light-background)] [--card:var(--palette-light-card)] [--muted:var(--palette-light-muted)] [--muted-foreground:var(--palette-light-muted-foreground)]",
  dark: "[--background:var(--palette-dark-background)] [--card:var(--palette-dark-card)] [--muted:var(--palette-dark-muted)] [--muted-foreground:var(--palette-dark-muted-foreground)]",
};

function PreviewNavigation(): ReactElement {
  return (
    <g>
      <rect width="10%" height="100%" className="fill-muted" />
      <rect x="10%" width="23%" height="100%" className="fill-card" />
      {[CommandIcon, BotIcon, BoxIcon, ServerIcon, BookOpenIcon].map(
        (Icon, index) => (
          <Icon
            key={index}
            x="3%"
            y={`${23 + index * 15}%`}
            width="11"
            height="11"
            className="text-muted-foreground"
          />
        ),
      )}
      <rect
        x="12%"
        y="37%"
        width="19%"
        height="12%"
        rx="3"
        className="fill-primary"
      />
      {[26, 41, 56, 71, 86].map((y, index) => (
        <g
          key={y}
          className={
            index === 1 ? "fill-primary-foreground" : "fill-muted-foreground/45"
          }
        >
          <circle cx="15%" cy={`${y + 2}%`} r="2.5" />
          <rect
            x="18%"
            y={`${y}%`}
            width={index === 1 ? "10%" : "8%"}
            height="4"
            rx="2"
          />
        </g>
      ))}
    </g>
  );
}

function PreviewContent(): ReactElement {
  return (
    <g>
      <rect
        x="36%"
        y="23%"
        width="61%"
        height="42%"
        rx="4"
        className="fill-card"
      />
      <rect
        x="36%"
        y="69%"
        width="29%"
        height="25%"
        rx="4"
        className="fill-card"
      />
      <rect
        x="68%"
        y="69%"
        width="29%"
        height="25%"
        rx="4"
        className="fill-card"
      />
      <circle cx="40%" cy="31%" r="3" className="fill-primary" />
      <rect
        x="44%"
        y="29%"
        width="26%"
        height="4"
        rx="2"
        className="fill-muted-foreground/40"
      />
      <rect
        x="85%"
        y="29%"
        width="8%"
        height="4"
        rx="2"
        className="fill-primary/70"
      />
      {[40, 48, 56].map((y, index) => (
        <rect
          key={y}
          x="44%"
          y={`${y}%`}
          width={`${35 - index * 5}%`}
          height="4"
          rx="2"
          className="fill-muted-foreground/20"
        />
      ))}
      {[40, 72].map((x) => (
        <g key={x}>
          <circle cx={`${x}%`} cy="77%" r="3" className="fill-primary/70" />
          <rect
            x={`${x + 4}%`}
            y="75%"
            width="13%"
            height="4"
            rx="2"
            className="fill-muted-foreground/40"
          />
          <rect
            x={`${x}%`}
            y="85%"
            width="18%"
            height="4"
            rx="2"
            className="fill-muted-foreground/20"
          />
        </g>
      ))}
    </g>
  );
}

function PreviewScene({ dark }: { dark: boolean }): ReactElement {
  return (
    <g className={dark ? palettes.dark : palettes.light}>
      <rect width="100%" height="100%" className="fill-background" />
      <PreviewNavigation />
      <PreviewContent />
      <rect width="100%" height="17%" className="fill-card" />
      <rect
        x="13%"
        y="6%"
        width="30%"
        height="5"
        rx="2.5"
        className="fill-muted"
      />
      <circle cx="5%" cy="8%" r="3" className="fill-primary" />
      <rect
        x="85%"
        y="6%"
        width="10%"
        height="5"
        rx="2.5"
        className="fill-primary/60"
      />
    </g>
  );
}

export function ThemePreview({
  mode,
}: {
  mode: "light" | "dark" | "system";
}): ReactElement {
  const clipId = useId();
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      data-theme-preview={mode}
      width="100%"
      className="pointer-events-none block h-[clamp(7rem,12vw,10rem)] w-full overflow-hidden rounded-lg border border-border/30"
    >
      <PreviewScene dark={mode === "dark"} />
      {mode === "system" && (
        <>
          <defs>
            <clipPath id={clipId} clipPathUnits="objectBoundingBox">
              <polygon points="0.58,0 1,0 1,1 0.42,1" />
            </clipPath>
          </defs>
          <g clipPath={`url(#${clipId})`}>
            <PreviewScene dark />
          </g>
        </>
      )}
    </svg>
  );
}
