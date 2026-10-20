import { spawn as spawnSystem, type ChildProcess } from "node:child_process";
import spawn from "cross-spawn";
import type { NativeCommandRunOptions } from "./native-command";

// cross-spawn owns Windows shim quoting; callers always supply an argument array.
export const spawnNativeCommand = spawn;

export function stopNativeCommand(child: ChildProcess): void {
  if (process.platform !== "win32" || !child.pid) {
    child.kill("SIGKILL");
    return;
  }
  // Killing cmd.exe alone leaves its npm/Node descendants running.
  const terminator = spawnSystem(
    "taskkill.exe",
    ["/pid", String(child.pid), "/t", "/f"],
    {
      windowsHide: true,
      stdio: "ignore",
    },
  );
  terminator.on("error", () => child.kill("SIGKILL"));
}

export function runNativeCommand(
  command: string,
  args: string[],
  options: NativeCommandRunOptions,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawnNativeCommand(command, args, {
      env: options.env ?? process.env,
      cwd: options.cwd,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const output = { stdout: "", stderr: "" };
    let failure: Error | null = null;
    const stop = (error: Error) => {
      if (failure) return;
      failure = error;
      stopNativeCommand(child);
    };
    const abort = () =>
      stop(
        Object.assign(new Error("Native command aborted"), {
          name: "AbortError",
          code: "ABORT_ERR",
        }),
      );
    const timer = setTimeout(
      () =>
        stop(
          Object.assign(new Error("Native command timed out"), {
            code: "ETIMEDOUT",
          }),
        ),
      options.timeout,
    );
    for (const stream of ["stdout", "stderr"] as const) {
      let bytes = 0;
      child[stream]?.setEncoding("utf8");
      child[stream]?.on("data", (chunk: string) => {
        bytes += Buffer.byteLength(chunk);
        if (bytes > options.maxBuffer)
          return stop(
            Object.assign(
              new Error("Native command output exceeded maxBuffer"),
              { code: "ERR_CHILD_PROCESS_STDIO_MAXBUFFER" },
            ),
          );
        output[stream] += chunk;
      });
    }
    child.stdin?.on("error", stop);
    child.on("error", (error) => {
      failure ??= error;
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
      if (failure) reject(failure);
      else if (code !== 0)
        reject(
          Object.assign(new Error("Native command failed"), { code, signal }),
        );
      else resolve(output);
    });
    child.stdin?.end();
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) abort();
  });
}
