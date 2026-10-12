import {
  createSkillTestRuntime,
  fileInventory,
  type SkillTestRuntime,
} from "./helpers/skill-runtime";
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AgentAppearanceService } from "../../src/main/services/agent-appearance-service";
import { CodexDreamSkinEngine } from "../../src/main/services/codex-dream-skin-engine";
import { getDataDir } from "../../src/main/runtime-paths";
import { agentApi } from "../../src/preload/api/agent";

const electronTransport =
  await vi.importMock<typeof import("electron")>("electron");
const selections: string[] = [];
// Native picker replacement selects fixtures; no desktop window is opened.
vi.doMock("electron", () => ({
  ...electronTransport,
  app: { isPackaged: false },
  dialog: {
    showOpenDialog: async () => ({
      canceled: false,
      filePaths: [selections.shift()],
    }),
  },
}));
const { registerAgentAppearanceIPC } =
  await import("../../src/main/ipc/agent-appearance.ipc");
let runtime: SkillTestRuntime;
let failNativeCommand = false;
let nativeCommands: string[][] = [];
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
function register(): void {
  registerAgentAppearanceIPC({
    createService: () =>
      new AgentAppearanceService({
        dataRoot: getDataDir(),
        codexRoot: runtime.platformRoot("codex"),
        engine: new CodexDreamSkinEngine({
          runtimeRoot: path.join(runtime.root, "engine"),
          stateRoot: path.join(runtime.root, "engine-state"),
          platform: "darwin",
          runCommand: async (_executable, args) => {
            nativeCommands.push(args);
            if (failNativeCommand)
              throw new Error("Injected native command failure");
            return { stdout: "", stderr: "" };
          },
        }),
      }),
  });
}
function fixture(kind: "theme" | "pet"): string {
  const root = path.join(runtime.root, kind);
  fs.mkdirSync(root);
  const manifest =
    kind === "theme"
      ? {
          schemaVersion: 1,
          id: "midnight",
          name: "Midnight",
          image: "background.png",
          appearance: "dark",
        }
      : {
          id: "nova",
          displayName: "Nova",
          description: "Fixture pet",
          spriteVersionNumber: 2,
          spritesheetPath: "spritesheet.png",
        };
  fs.writeFileSync(
    path.join(root, kind === "theme" ? "theme.json" : "pet.json"),
    JSON.stringify(manifest),
  );
  fs.writeFileSync(
    path.join(root, kind === "theme" ? "background.png" : "spritesheet.png"),
    png,
  );
  return root;
}
beforeEach(async () => {
  runtime = await createSkillTestRuntime();
  const bundled = path.join(runtime.root, "engine/themes/dream-portal");
  fs.mkdirSync(bundled, { recursive: true });
  fs.writeFileSync(
    path.join(bundled, "theme.json"),
    JSON.stringify({
      schemaVersion: 1,
      id: "dream-portal",
      name: "Bundled fixture",
      image: "background.png",
    }),
  );
  fs.writeFileSync(path.join(bundled, "background.png"), png);
  selections.length = 0;
  nativeCommands = [];
  failNativeCommand = false;
  register();
});
afterEach(() => runtime?.dispose());
it("imports, previews, exports, applies and restores a validated theme with persisted state and complete files", async () => {
  const source = fixture("theme");
  const before = fileInventory(source);
  selections.push(source);
  const theme = await agentApi.importAppearanceTheme("codex");
  if (!theme) throw new Error("No imported theme");
  expect(theme).toMatchObject({ id: "midnight", name: "Midnight" });
  expect(fileInventory(theme.directoryPath)).toEqual(before);
  expect(await agentApi.getAppearanceThemePreview("codex", theme.id)).toBe(
    `data:image/png;base64,${png.toString("base64")}`,
  );
  selections.push(path.join(runtime.root, "exports"));
  const exported = await agentApi.exportAppearanceTheme("codex", theme.id);
  if (!exported) throw new Error("No exported theme");
  expect(fileInventory(exported)).toEqual(before);
  await agentApi.applyAppearanceTheme({
    agentId: "codex",
    themeId: theme.id,
    restartExisting: true,
  });
  expect(fileInventory(path.join(runtime.root, "engine-state/theme"))).toEqual(
    before,
  );
  expect(nativeCommands[0]).toContain("--restart-existing");
  await runtime.reopen();
  register();
  expect(await agentApi.getAppearance("codex")).toMatchObject({
    activeThemeId: "midnight",
    themes: expect.arrayContaining([
      expect.objectContaining({ id: "midnight" }),
    ]),
  });
  failNativeCommand = true;
  await expect(agentApi.restoreAppearanceTheme("codex")).rejects.toThrow();
  expect((await agentApi.getAppearance("codex")).activeThemeId).toBe(
    "midnight",
  );
  failNativeCommand = false;
  await agentApi.restoreAppearanceTheme("codex");
  await agentApi.deleteAppearanceTheme("codex", theme.id);
  await runtime.reopen();
  register();
  expect(await agentApi.getAppearance("codex")).toMatchObject({
    activeThemeId: null,
    themes: [expect.objectContaining({ id: "dream-portal" })],
  });
  expect(fileInventory(source)).toEqual(before);
});
it("imports and edits a pet, exports its bytes and rejects duplicate or symlink inputs without changing installed files", async () => {
  const source = fixture("pet");
  const before = fileInventory(source);
  selections.push(source);
  const pet = await agentApi.importAgentPet("codex");
  if (!pet) throw new Error("No imported pet");
  expect(fileInventory(pet.directoryPath)).toEqual(before);
  expect(await agentApi.getAgentPetPreview("codex", pet.id)).toBe(
    `data:image/png;base64,${png.toString("base64")}`,
  );
  await agentApi.updateAppearancePet({
    agentId: "codex",
    petId: pet.id,
    name: "Renamed Nova",
    description: "Edited fixture",
  });
  const installed = fileInventory(pet.directoryPath);
  selections.push(path.join(runtime.root, "pet-exports"));
  const exported = await agentApi.exportAgentPet("codex", pet.id);
  if (!exported) throw new Error("No exported pet");
  expect(fileInventory(exported)).toEqual(installed);
  selections.push(source);
  await expect(agentApi.importAgentPet("codex")).rejects.toThrow(
    "already installed",
  );
  const link = path.join(runtime.root, "linked-pet");
  fs.symlinkSync(source, link);
  selections.push(link);
  await expect(agentApi.importAgentPet("codex")).rejects.toThrow("symlink");
  expect(fileInventory(pet.directoryPath)).toEqual(installed);
  await runtime.reopen();
  register();
  expect((await agentApi.getAppearance("codex")).pets).toEqual([
    expect.objectContaining({
      id: pet.id,
      name: "Renamed Nova",
      description: "Edited fixture",
    }),
  ]);
  await agentApi.deleteAgentPet("codex", pet.id);
  await runtime.reopen();
  register();
  expect((await agentApi.getAppearance("codex")).pets).toEqual([]);
  expect(fileInventory(source)).toEqual(before);
});
it("rejects a malformed theme using the real package parser and leaves the installed library unchanged", async () => {
  const source = fixture("theme");
  selections.push(source);
  await agentApi.importAppearanceTheme("codex");
  const before = fileInventory(path.join(getDataDir(), "agent-appearance"));
  fs.writeFileSync(
    path.join(source, "theme.json"),
    JSON.stringify({
      schemaVersion: 1,
      id: "broken",
      name: "Broken",
      image: "../background.png",
    }),
  );
  const input = fileInventory(source);
  selections.push(source);
  await expect(agentApi.importAppearanceTheme("codex")).rejects.toThrow(
    "inside its theme directory",
  );
  expect(fileInventory(path.join(getDataDir(), "agent-appearance"))).toEqual(
    before,
  );
  await runtime.reopen();
  register();
  expect(
    (await agentApi.getAppearance("codex")).themes
      .map((item) => item.id)
      .sort(),
  ).toEqual(["dream-portal", "midnight"]);
  expect(fileInventory(source)).toEqual(input);
});
