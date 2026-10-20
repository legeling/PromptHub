import type { spawn } from "node:child_process";
import { spawnNativeCommand, stopNativeCommand } from "../native-process";
import fs from "node:fs";
import path from "node:path";
import {
  AGENT_CLI_MUTATION_OUTPUT_BYTES,
  AGENT_CLI_MUTATION_TIMEOUT_MS,
} from "../agent-native-command-policy";
import { CodexPluginError } from "./error";

export interface CodexConfigWriteOptions {
  command: string;
  root: string;
  environment: NodeJS.ProcessEnv;
  pluginId: string;
  enabled: boolean;
  originalConfig: string;
  launch?: typeof spawn;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function configRequest(
  options: CodexConfigWriteOptions,
  version: string,
  filePath: string,
): Record<string, unknown> {
  return {
    id: 3,
    method: "config/value/write",
    params: {
      keyPath: `plugins.${JSON.stringify(options.pluginId)}.enabled`,
      value: options.enabled,
      mergeStrategy: "replace",
      filePath,
      expectedVersion: version,
    },
  };
}

/** One native configuration edit; never opens a thread or starts model/tool execution. */
export function writeCodexPluginEnabled(
  options: CodexConfigWriteOptions,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = (options.launch ?? spawnNativeCommand)(
      options.command,
      ["app-server", "--listen", "stdio://"],
      {
        env: options.environment,
        cwd: options.root,
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      },
    );
    let buffer = "";
    let outputBytes = 0;
    let completed = false;
    let failure: CodexPluginError | null = null;
    const stop = (error?: CodexPluginError) => {
      failure ??= error ?? null;
      child.stdin?.end();
      stopNativeCommand(child);
    };
    const timer = setTimeout(
      () => stop(new CodexPluginError("operation-failed")),
      AGENT_CLI_MUTATION_TIMEOUT_MS,
    );
    const send = (message: Record<string, unknown>) =>
      child.stdin?.write(`${JSON.stringify(message)}\n`);
    const receive = (message: unknown) => {
      if (!isRecord(message)) return;
      if (message.id === 1) {
        if (message.error)
          return stop(new CodexPluginError("runtime-incompatible"));
        send({ method: "initialized", params: {} });
        send({ id: 2, method: "config/read", params: { includeLayers: true } });
      } else if (message.id === 2) {
        const filePath = fs.realpathSync(
          path.join(options.root, "config.toml"),
        );
        const layers = isRecord(message.result)
          ? message.result.layers
          : undefined;
        const layer: unknown = Array.isArray(layers)
          ? layers.find(
              (value: unknown) =>
                isRecord(value) &&
                isRecord(value.name) &&
                value.name.type === "user" &&
                value.name.file === filePath,
            )
          : undefined;
        if (!isRecord(layer) || typeof layer.version !== "string")
          return stop(new CodexPluginError("runtime-incompatible"));
        if (fs.readFileSync(filePath, "utf8") !== options.originalConfig)
          return stop(new CodexPluginError("config-conflict"));
        send(configRequest(options, layer.version, filePath));
      } else if (message.id === 3) {
        if (!isRecord(message.result) || message.result.status !== "ok")
          return stop(new CodexPluginError("config-conflict"));
        completed = true;
        stop();
      }
    };
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      outputBytes += Buffer.byteLength(chunk);
      if (outputBytes > AGENT_CLI_MUTATION_OUTPUT_BYTES)
        return stop(new CodexPluginError("operation-failed"));
      buffer += chunk;
      let newline: number;
      while ((newline = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        if (!line.trim()) continue;
        try {
          receive(JSON.parse(line));
        } catch {
          stop(new CodexPluginError("runtime-incompatible"));
        }
      }
    });
    child.stderr?.on("data", () => {
      /* Drain native diagnostics without exposing account/configuration data. */
    });
    child.stdin?.on("error", () =>
      stop(new CodexPluginError("operation-failed")),
    );
    child.on("error", () => {
      failure = new CodexPluginError("operation-failed");
    });
    child.on("close", () => {
      clearTimeout(timer);
      if (failure || !completed)
        reject(failure ?? new CodexPluginError("operation-failed"));
      else resolve();
    });
    send({
      id: 1,
      method: "initialize",
      params: {
        clientInfo: { name: "prompthub-plugins", version: "1.0.0" },
        capabilities: {},
      },
    });
  });
}
