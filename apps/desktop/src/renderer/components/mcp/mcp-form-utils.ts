import type {
  McpServerConfig,
  McpServerDraft,
  McpTargetStatusEntry,
  McpTransport,
} from "@prompthub/shared/types/mcp";
import type { McpTargetPreset } from "@prompthub/core";

export interface McpFormState {
  name: string;
  displayName: string;
  description: string;
  transport: McpTransport;
  command: string;
  args: string;
  cwd: string;
  env: string;
  url: string;
  headers: string;
  tags: string;
  enabled: boolean;
}

export const emptyMcpForm: McpFormState = {
  name: "",
  displayName: "",
  description: "",
  transport: "stdio",
  command: "",
  args: "",
  cwd: "",
  env: "",
  url: "",
  headers: "",
  tags: "",
  enabled: true,
};

function recordToLines(record?: Record<string, string>): string {
  return Object.entries(record ?? {})
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}

function linesToRecord(value: string): Record<string, string> {
  return Object.fromEntries(
    value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const index = line.indexOf("=");
        return index === -1
          ? [line, ""]
          : [line.slice(0, index), line.slice(index + 1)];
      }),
  );
}

export function serverToForm(server: McpServerConfig | null): McpFormState {
  if (!server) {
    return emptyMcpForm;
  }
  return {
    name: server.name,
    displayName: server.displayName,
    description: server.description ?? "",
    transport: server.transport,
    command: server.command ?? "",
    args: (server.args ?? []).join("\n"),
    cwd: server.cwd ?? "",
    env: recordToLines(server.env),
    url: server.url ?? "",
    headers: recordToLines(server.headers),
    tags: (server.tags ?? []).join(", "),
    enabled: server.enabled,
  };
}

export function formToDraft(form: McpFormState): McpServerDraft {
  return {
    name: form.name,
    displayName: form.displayName,
    description: form.description,
    transport: form.transport,
    command: form.command,
    args: form.args.split(/\r?\n/).filter(Boolean),
    cwd: form.cwd,
    env: linesToRecord(form.env),
    url: form.url,
    headers: linesToRecord(form.headers),
    tags: form.tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
    enabled: form.enabled,
  };
}

export function textInputClass(): string {
  return "h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20";
}

export function textAreaClass(): string {
  return "min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20";
}

/**
 * Distribution status helpers. The actual target config files are the source
 * of truth: a server counts as distributed to a preset when its name exists
 * in that preset's parsed config.
 * 分发状态辅助函数。以目标配置文件实际内容为准：当 preset 配置中存在该
 * server 名称时才视为已分发。
 */
export function isServerOnPreset(
  status: McpTargetStatusEntry[],
  presetId: string,
  serverName: string,
): boolean {
  const entry = status.find((item) => item.presetId === presetId);
  return Boolean(entry?.serverNames.includes(serverName));
}

export function getDistributedPresets(
  status: McpTargetStatusEntry[],
  presets: McpTargetPreset[],
  serverName: string,
): McpTargetPreset[] {
  return presets.filter((preset) =>
    isServerOnPreset(status, preset.id, serverName),
  );
}
