import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { withPlatformTargetRollback } from "../src/skills/platform-recovery";
import {
  readActivationState,
  writeActivationState,
} from "../src/skills/platform-activation";
import {
  inspectPlatformContent,
  fingerprintPlatformPackage,
} from "../src/skills/platform-content";

it("preserves the original package when activation publication fails and recovers on retry", async () => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "prompthub-platform-recovery-"),
  );
  const target = path.join(root, "target");
  const source = path.join(root, "source");
  const activation = path.join(root, "activation.json");
  try {
    await fs.mkdir(target);
    await fs.mkdir(source);
    await fs.writeFile(path.join(target, "SKILL.md"), "original");
    await fs.writeFile(path.join(source, "SKILL.md"), "updated");
    const baseline = {
      skillId: "one",
      skillName: "demo",
      sourcePath: source,
      installedFingerprint: await fingerprintPlatformPackage(target),
    };
    await writeActivationState(activation, { demo: baseline });
    expect(await inspectPlatformContent(target, source, baseline)).toBe(
      "needs-sync",
    );
    await expect(
      withPlatformTargetRollback(target, async () => {
        await fs.cp(source, target, { recursive: true });
        throw new Error("Activation write failed");
      }),
    ).rejects.toThrow("Activation write failed");
    expect(await fs.readFile(path.join(target, "SKILL.md"), "utf8")).toBe(
      "original",
    );
    expect(await readActivationState(activation)).toEqual({ demo: baseline });
    await withPlatformTargetRollback(target, async () => {
      await fs.cp(source, target, { recursive: true });
      await writeActivationState(activation, {
        demo: {
          ...baseline,
          installedFingerprint: await fingerprintPlatformPackage(target),
        },
      });
    });
    expect(
      await inspectPlatformContent(
        target,
        source,
        (await readActivationState(activation)).demo,
      ),
    ).toBe("synced");
    expect(
      (await fs.readdir(root)).filter((name) => name.includes("backup")),
    ).toEqual([]);
    await fs.writeFile(activation, "{broken");
    await expect(readActivationState(activation)).rejects.toThrow();
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
