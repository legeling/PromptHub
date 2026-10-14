import { spawn, type ChildProcess } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import net from "net";
import { issueSolvedPromptHubCaptcha } from "../../../src/renderer/services/self-hosted-auth";
import { getElectronLaunchEnvironment } from "./electron-launch-options";

export interface SelfHostedTestServer {
  baseUrl: string;
  username: string;
  password: string;
  stop: () => Promise<void>;
}

interface LoginEnvelope {
  data: {
    accessToken: string;
  };
}

async function getFreePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Failed to resolve free port"));
        return;
      }

      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
    server.on("error", reject);
  });
}

async function waitForHealth(
  baseUrl: string,
  timeoutMs = 20000,
): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/health`, { cache: "no-store" });
      if (response.ok) {
        const payload = (await response.json()) as { status?: string };
        if (payload.status === "ok") {
          return;
        }
      }
    } catch {
      // retry until timeout
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Timed out waiting for self-hosted web health at ${baseUrl}`);
}

function getPnpmCommand(): string {
  return process.platform === "win32" ? "pnpm.cmd" : "pnpm";
}

async function bootstrapUser(
  baseUrl: string,
  username: string,
  password: string,
): Promise<void> {
  const captcha = await issueSolvedPromptHubCaptcha(baseUrl);
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ username, password, ...captcha }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Failed to bootstrap self-hosted user: ${response.status} ${text}`,
    );
  }
}

export async function loginSelfHosted(
  baseUrl: string,
  username: string,
  password: string,
): Promise<string> {
  const captcha = await issueSolvedPromptHubCaptcha(baseUrl);
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ username, password, ...captcha }),
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Failed to log into self-hosted web: ${response.status} ${text}`,
    );
  }

  const payload = (await response.json()) as LoginEnvelope;
  return payload.data.accessToken;
}

export async function startSelfHostedTestServer(): Promise<SelfHostedTestServer> {
  const port = await getFreePort();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-web-e2e-"));
  const webAppDir = path.resolve(process.cwd(), "../web");
  const username = "owner";
  const password = "secretpass123";
  const jwtSecret = "prompthub-self-hosted-e2e-secret-123456";
  const command = getPnpmCommand();

  const child = spawn(command, ["exec", "tsx", "src/index.ts"], {
    cwd: webAppDir,
    detached: process.platform !== "win32",
    env: {
      ...getElectronLaunchEnvironment(dataDir),
      PORT: String(port),
      HOST: "127.0.0.1",
      DATA_ROOT: dataDir,
      JWT_SECRET: jwtSecret,
      ALLOW_REGISTRATION: "false",
      LOG_LEVEL: "error",
    },
    stdio: "pipe",
  });

  let stderr = "";
  const diagnosticOutputBytes = 32_768;
  child.stdout?.resume();
  child.stderr?.on("data", (chunk) => {
    stderr = (stderr + String(chunk)).slice(-diagnosticOutputBytes);
  });

  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    await waitForHealth(baseUrl);
    await bootstrapUser(baseUrl, username, password);
  } catch (error) {
    await stopChildProcess(child);
    fs.rmSync(dataDir, { recursive: true, force: true });
    throw new Error(
      `Failed to start self-hosted test server: ${
        error instanceof Error ? error.message : String(error)
      }${stderr ? `\n${stderr}` : ""}`,
    );
  }

  return {
    baseUrl,
    username,
    password,
    stop: async () => {
      await stopChildProcess(child);
      fs.rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

async function stopChildProcess(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  await new Promise<void>((resolve) => {
    const stop = (signal: NodeJS.Signals): void => {
      if (process.platform !== "win32" && child.pid !== undefined) {
        process.kill(-child.pid, signal);
      } else {
        child.kill(signal);
      }
    };
    const timer = setTimeout(() => {
      stop("SIGKILL");
    }, 5000);

    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });

    stop("SIGTERM");
  });
}
