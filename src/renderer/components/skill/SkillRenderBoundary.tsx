import React, { type ReactNode } from "react";
import { AlertTriangleIcon, RefreshCwIcon } from "lucide-react";

interface SkillRenderBoundaryProps {
  children: ReactNode;
  resetKey?: string | number | null;
  compact?: boolean;
  title: string;
  description: string;
  primaryActionLabel?: string;
  onPrimaryAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
}

interface SkillRenderBoundaryState {
  hasError: boolean;
}

export class SkillRenderBoundary extends React.Component<
  SkillRenderBoundaryProps,
  SkillRenderBoundaryState
> {
  state: SkillRenderBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError(): SkillRenderBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error("Skill render failed:", error);
  }

  componentDidUpdate(prevProps: SkillRenderBoundaryProps) {
    if (
      this.state.hasError &&
      prevProps.resetKey !== this.props.resetKey
    ) {
      this.setState({ hasError: false });
    }
  }

  private resetBoundary = (callback?: () => void) => {
    this.setState({ hasError: false }, () => {
      callback?.();
    });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const compact = this.props.compact ?? false;

    return (
      <div
        className={`flex flex-col items-center justify-center rounded-2xl border border-border bg-card/80 text-center ${
          compact ? "min-h-[220px] px-6 py-10" : "h-full min-h-[360px] px-8 py-12"
        }`}
      >
        <div className="mb-4 rounded-full bg-red-500/10 p-3 text-red-500">
          <AlertTriangleIcon className={compact ? "h-5 w-5" : "h-6 w-6"} />
        </div>
        <div className="text-base font-semibold text-foreground">
          {this.props.title}
        </div>
        <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
          {this.props.description}
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          {this.props.primaryActionLabel ? (
            <button
              type="button"
              onClick={() => this.resetBoundary(this.props.onPrimaryAction)}
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              {this.props.primaryActionLabel}
            </button>
          ) : null}
          {this.props.secondaryActionLabel ? (
            <button
              type="button"
              onClick={() => this.resetBoundary(this.props.onSecondaryAction)}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90"
            >
              <RefreshCwIcon className="h-4 w-4" />
              {this.props.secondaryActionLabel}
            </button>
          ) : null}
        </div>
      </div>
    );
  }
}
