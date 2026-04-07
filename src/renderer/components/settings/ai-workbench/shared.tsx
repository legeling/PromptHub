import { BrainIcon } from "lucide-react";

import { Select } from "../../ui/Select";

export function StatusCard({
  title,
  value,
  detail,
  tone,
  icon: Icon,
}: {
  title: string;
  value: string;
  detail: string;
  tone: "ready" | "warning";
  icon: typeof BrainIcon;
}) {
  const isReady = tone === "ready";

  return (
    <div className="relative flex flex-col justify-between rounded-xl border border-border/60 bg-card p-3.5 shadow-sm transition-shadow hover:shadow-md">
      <div
        className={`absolute right-3 top-3 h-1.5 w-1.5 rounded-full ${
          isReady
            ? "bg-emerald-500 ring-[3px] ring-emerald-500/20"
            : "bg-amber-500 ring-[3px] ring-amber-500/20"
        }`}
      />
      <div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Icon className="h-4 w-4" />
          <span className="text-xs font-medium">{title}</span>
        </div>
        <div className="mt-1.5 text-xl font-semibold tracking-tight text-foreground">
          {value}
        </div>
      </div>
      <div
        className="mt-3 text-[11px] text-muted-foreground line-clamp-1"
        title={detail}
      >
        {detail}
      </div>
    </div>
  );
}

export function ScenarioRow({
  label,
  desc,
  fallbackLabel,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  desc: string;
  fallbackLabel: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 p-4 transition-colors hover:bg-muted/30 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{desc}</div>
      </div>
      <div className="w-full md:w-[280px]">
        <Select
          value={value}
          onChange={onChange}
          disabled={disabled}
          options={[{ value: "", label: fallbackLabel }, ...options]}
        />
      </div>
    </div>
  );
}
