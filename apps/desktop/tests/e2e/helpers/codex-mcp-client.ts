import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import fs from "node:fs";
import path from "node:path";

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Expected a Codex protocol object");
  }
  return Object.fromEntries(Object.entries(value));
}

interface PendingCall {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** Real, isolated Codex App Server; no model turn or user credentials involved. */
export class CodexMcpClient {
  private readonly process: ChildProcessWithoutNullStreams;
  private readonly pending = new Map<number, PendingCall>();
  private sequence = 0;
  private threadId = "";

  constructor(
    executable: string,
    home: string,
    cwd: string,
    private readonly logPath: string,
  ) {
    const env: NodeJS.ProcessEnv = {};
    for (const key of [
      "PATH",
      "SystemRoot",
      "WINDIR",
      "COMSPEC",
      "PATHEXT",
      "TEMP",
      "TMP",
    ]) {
      if (process.env[key] !== undefined) env[key] = process.env[key];
    }
    Object.assign(env, {
      HOME: home,
      USERPROFILE: home,
      CODEX_HOME: path.join(home, ".codex"),
      APPDATA: path.join(home, "AppData/Roaming"),
      LOCALAPPDATA: path.join(home, "AppData/Local"),
    });
    this.process = spawn(executable, ["app-server", "--listen", "stdio://"], {
      env,
      cwd,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.process.stderr.on("data", (chunk: Buffer) =>
      fs.appendFileSync(logPath, chunk),
    );
    const lines = createInterface({ input: this.process.stdout });
    lines.on("line", (line) => this.receive(line));
    this.process.on("error", (error) => this.failPending(error));
    this.process.on("exit", (code) => {
      lines.close();
      this.failPending(new Error(`Codex App Server exited (${code})`));
    });
  }

  private failPending(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  private receive(line: string): void {
    let message: Record<string, unknown>;
    try {
      message = record(JSON.parse(line));
    } catch (error) {
      this.failPending(
        new Error(`Invalid Codex protocol response: ${String(error)}`),
      );
      return;
    }
    if (typeof message.id !== "number") {
      if (
        typeof message.method === "string" &&
        message.method.includes("mcp")
      ) {
        fs.appendFileSync(this.logPath, line + "\n");
      }
      return;
    }
    const pending = this.pending.get(message.id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(message.id);
    if (message.error) pending.reject(new Error(JSON.stringify(message.error)));
    else pending.resolve(message.result);
  }

  private request(method: string, params: unknown): Promise<unknown> {
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Codex request timed out: ${method}`));
      }, 120_000);
      this.pending.set(id, { resolve, reject, timer });
      this.process.stdin.write(JSON.stringify({ id, method, params }) + "\n");
    });
  }

  async initialize(cwd: string): Promise<void> {
    await this.request("initialize", {
      clientInfo: { name: "prompthub_mcp_verification", version: "1.0.0" },
      capabilities: { experimentalApi: true },
    });
    this.process.stdin.write(JSON.stringify({ method: "initialized" }) + "\n");
    const result = record(
      await this.request("thread/start", {
        cwd,
        ephemeral: true,
        approvalPolicy: "never",
        sandbox: "read-only",
      }),
    );
    const thread = record(result.thread);
    if (typeof thread.id !== "string")
      throw new Error("Codex returned no thread ID");
    this.threadId = thread.id;
  }

  async inventory(): Promise<Array<{ name: string; tools: string[] }>> {
    const result = record(await this.request("mcpServerStatus/list", {}));
    if (!Array.isArray(result.data))
      throw new Error("Codex returned no MCP inventory");
    return result.data.map((entry: unknown) => {
      const server = record(entry);
      if (typeof server.name !== "string")
        throw new Error("Codex returned an unnamed MCP");
      return { name: server.name, tools: Object.keys(record(server.tools)) };
    });
  }

  async callTool(
    server: string,
    tool: string,
    args: unknown,
  ): Promise<{ isError: boolean; text: string }> {
    const result = record(
      await this.request("mcpServer/tool/call", {
        threadId: this.threadId,
        server,
        tool,
        arguments: args,
      }),
    );
    if (!Array.isArray(result.content))
      throw new Error("Codex returned no MCP tool content");
    return {
      isError: result.isError === true,
      text: result.content
        .map((entry: unknown) => {
          const content = record(entry);
          return typeof content.text === "string" ? content.text : "";
        })
        .join("\n"),
    };
  }

  async close(): Promise<void> {
    if (this.process.exitCode !== null) return;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => this.process.kill(), 5_000);
      this.process.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
      this.process.stdin.end();
    });
  }
}
