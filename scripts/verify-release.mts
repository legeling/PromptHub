import { spawn } from "node:child_process";
import process from "node:process";

type Profile = "quick" | "release";

type Check = {
  id: string;
  label: string;
  args: string[];
  profile: Profile;
};

const checks: Check[] = [
  {
    id: "shared-typecheck",
    label: "Shared package typecheck",
    args: ["--filter", "@prompthub/shared", "typecheck"],
    profile: "quick",
  },
  {
    id: "db-typecheck",
    label: "Database package typecheck",
    args: ["--filter", "@prompthub/db", "typecheck"],
    profile: "quick",
  },
  {
    id: "core-typecheck",
    label: "Core package typecheck",
    args: ["--filter", "@prompthub/core", "typecheck"],
    profile: "quick",
  },
  {
    id: "cli-lint",
    label: "CLI lint",
    args: ["--filter", "@prompthub/cli", "lint"],
    profile: "quick",
  },
  {
    id: "cli-typecheck",
    label: "CLI typecheck",
    args: ["--filter", "@prompthub/cli", "typecheck"],
    profile: "quick",
  },
  {
    id: "cli-test",
    label: "CLI tests",
    args: ["--filter", "@prompthub/cli", "test"],
    profile: "quick",
  },
  {
    id: "cli-build",
    label: "CLI build",
    args: ["--filter", "@prompthub/cli", "build"],
    profile: "quick",
  },
  {
    id: "desktop-lint",
    label: "Desktop lint",
    args: ["--filter", "@prompthub/desktop", "lint"],
    profile: "quick",
  },
  {
    id: "desktop-typecheck",
    label: "Desktop typecheck",
    args: ["--filter", "@prompthub/desktop", "typecheck"],
    profile: "quick",
  },
  {
    id: "desktop-unit",
    label: "Desktop unit tests",
    args: ["--filter", "@prompthub/desktop", "test:unit"],
    profile: "quick",
  },
  {
    id: "desktop-build",
    label: "Desktop build",
    args: ["--filter", "@prompthub/desktop", "build"],
    profile: "quick",
  },
  {
    id: "desktop-integration",
    label: "Desktop integration tests",
    args: ["--filter", "@prompthub/desktop", "test:integration"],
    profile: "release",
  },
  {
    id: "desktop-performance",
    label: "Desktop performance budget",
    args: ["--filter", "@prompthub/desktop", "test:perf"],
    profile: "release",
  },
  {
    id: "desktop-bundle-budget",
    label: "Desktop bundle budget",
    args: ["--filter", "@prompthub/desktop", "bundle:budget"],
    profile: "release",
  },
  {
    id: "desktop-e2e-smoke",
    label: "Desktop E2E smoke",
    args: ["--filter", "@prompthub/desktop", "test:e2e:smoke"],
    profile: "release",
  },
  {
    id: "web-lint",
    label: "Web lint",
    args: ["--filter", "@prompthub/web", "lint"],
    profile: "quick",
  },
  {
    id: "web-typecheck",
    label: "Web typecheck",
    args: ["--filter", "@prompthub/web", "typecheck"],
    profile: "quick",
  },
  {
    id: "web-test",
    label: "Web tests",
    args: ["--filter", "@prompthub/web", "test"],
    profile: "quick",
  },
  {
    id: "web-build",
    label: "Web build",
    args: ["--filter", "@prompthub/web", "build"],
    profile: "quick",
  },
  {
    id: "web-cloudflare-lint",
    label: "Cloudflare worker lint",
    args: ["--filter", "@prompthub/web-cloudflare", "lint"],
    profile: "quick",
  },
  {
    id: "web-cloudflare-typecheck",
    label: "Cloudflare worker typecheck",
    args: ["--filter", "@prompthub/web-cloudflare", "typecheck"],
    profile: "quick",
  },
  {
    id: "web-cloudflare-test",
    label: "Cloudflare worker tests",
    args: ["--filter", "@prompthub/web-cloudflare", "test"],
    profile: "quick",
  },
];

function getProfile(): Profile {
  const profileArg = process.argv.find((arg) => arg.startsWith("--profile="));
  const profileFlagIndex = process.argv.indexOf("--profile");

  if (process.argv.includes("--quick")) {
    return "quick";
  }

  if (profileFlagIndex !== -1) {
    const profile = process.argv[profileFlagIndex + 1];

    if (profile === "quick" || profile === "release") {
      return profile;
    }

    throw new Error(`Unsupported profile: ${profile}`);
  }

  if (!profileArg) {
    return "release";
  }

  const profile = profileArg.split("=")[1];

  if (profile === "quick" || profile === "release") {
    return profile;
  }

  throw new Error(`Unsupported profile: ${profile}`);
}

function assertUniqueChecks(checksToValidate: Check[]): void {
  const seenIds = new Set<string>();
  const seenCommands = new Set<string>();

  for (const check of checksToValidate) {
    const command = `pnpm ${check.args.join(" ")}`;

    if (seenIds.has(check.id)) {
      throw new Error(`Duplicate release harness check id: ${check.id}`);
    }

    if (seenCommands.has(command)) {
      throw new Error(`Duplicate release harness command: ${command}`);
    }

    seenIds.add(check.id);
    seenCommands.add(command);
  }
}

function formatDuration(startedAt: number): string {
  return `${((Date.now() - startedAt) / 1000).toFixed(1)}s`;
}

function shouldRun(check: Check, profile: Profile): boolean {
  return profile === "release" || check.profile === "quick";
}

function runCheck(check: Check, index: number, total: number): Promise<void> {
  const startedAt = Date.now();
  const command = `pnpm ${check.args.join(" ")}`;

  console.log(`\n[${index}/${total}] ${check.label}`);
  console.log(`$ ${command}`);

  return new Promise((resolve, reject) => {
    const child = spawn("pnpm", check.args, {
      stdio: "inherit",
      shell: process.platform === "win32",
    });

    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code === 0) {
        console.log(`[ok] ${check.id} (${formatDuration(startedAt)})`);
        resolve();
        return;
      }

      const reason = signal ? `signal ${signal}` : `exit code ${code}`;
      reject(new Error(`${check.id} failed with ${reason}`));
    });
  });
}

async function main(): Promise<void> {
  const profile = getProfile();
  const selectedChecks = checks.filter((check) => shouldRun(check, profile));

  assertUniqueChecks(checks);

  if (process.argv.includes("--list")) {
    for (const check of selectedChecks) {
      console.log(`${check.id}: pnpm ${check.args.join(" ")}`);
    }
    return;
  }

  const startedAt = Date.now();
  console.log(`PromptHub release harness profile: ${profile}`);

  for (const [index, check] of selectedChecks.entries()) {
    await runCheck(check, index + 1, selectedChecks.length);
  }

  console.log(`\nRelease harness passed in ${formatDuration(startedAt)}.`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\nRelease harness failed: ${message}`);
  process.exitCode = 1;
});
