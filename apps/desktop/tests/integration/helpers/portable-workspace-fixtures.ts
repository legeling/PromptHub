import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { expect } from "vitest";
import { CoreMcpLibraryService, readResourceBundle } from "@prompthub/core";

export function inventory(directory: string): Record<string, string> {
  const files: Record<string, string> = {};
  function visit(current: string): void {
    if (!fs.existsSync(current)) return;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const file = path.join(current, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile())
        files[path.relative(directory, file)] = createHash("sha256")
          .update(fs.readFileSync(file))
          .digest("hex");
      else throw new Error(`Unexpected non-regular fixture file: ${file}`);
    }
  }
  visit(directory);
  return files;
}

export function writeFiles(
  directory: string,
  files: Record<string, string | Buffer>,
): void {
  for (const [name, bytes] of Object.entries(files)) {
    const file = path.join(directory, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, bytes);
  }
}

export async function seedSkill(root: string): Promise<void> {
  const source = path.join(root, "skill-source");
  const content =
    "---\nname: portable-skill\ndescription: Portable fixture\n---\nInstructions\n";
  writeFiles(source, {
    "SKILL.md": content,
    "docs/nested/readme.md": "Complete package",
    "assets/blob.bin": Buffer.from([0, 128, 255]),
  });
  const installed = await window.api.skill.runPackageOperation({
    operation: "install",
    registrySkill: {
      name: "portable-skill",
      slug: "portable-skill",
      description: "Portable fixture",
      category: "general",
      author: "Test",
      version: "1.0.0",
      tags: [],
      source_id: "portable-fixture",
      source_url: source,
      content,
    },
    content,
    source: { kind: "local-directory", directory: source },
  });
  expect(installed.status, JSON.stringify(installed)).toBe("completed");
  if (installed.status !== "completed")
    throw new Error(JSON.stringify(installed));
  await window.api.skill.versionCreate(installed.skill.id, "Package history");
}

export function seedMcp(id: string, profile: string): string {
  const bundlePath = path.join(profile, "data", "mcp", id);
  const server = {
    id,
    name: id,
    displayName: id,
    transport: "stdio" as const,
    command: "fixture-command",
    args: [],
    enabled: true,
    env: { TOKEN: "synthetic-fixture-secret" },
    source: { type: "manual" as const },
    createdAt: 1,
    updatedAt: 2,
  };
  const service = new CoreMcpLibraryService();
  service.createServer({ ...server, args: ["first-version"] });
  service.updateServer(id, server);
  return bundlePath;
}

export async function seedProviderAndGeneration(
  name: string,
  imageBytes: Buffer,
): Promise<void> {
  const prompts = await window.api.prompt.getAll();
  const source = prompts.find((prompt) => prompt.currentVersion === 2);
  if (!source) throw new Error("Generation fixture requires a revised Prompt");
  await window.api.agent.createProviderProfile({
    profile: {
      platformId: "codex",
      name,
      providerKind: "openai",
      protocol: "openai",
      endpoint: "https://fixture.invalid/v1",
      config: { fixture: name },
      source: "manual",
    },
    modelMappings: [
      {
        routeKey: "primary",
        modelId: "fixture-image",
        parameters: { reasoningEffort: "high" },
      },
    ],
  });
  const batch = await window.api.generation.create({
    title: name,
    sourcePromptId: source.id,
    sourcePromptVersion: source.currentVersion,
    variableValues: { subject: name },
    referenceImages: [
      { source: "prompt", fileName: "pixel.png", promptId: source.id },
    ],
    prompt: `Fixture output ${name}`,
    model: {
      id: "fixture-image",
      provider: "openai",
      model: "fixture-image",
      name: "Fixture image",
    },
    targetCount: 1,
    quality: "hd",
    aspectRatio: "1:1",
  });
  await window.api.generation.markSlotRunning(batch.id, 0);
  const completed = await window.api.generation.commitOutput({
    batchId: batch.id,
    slotIndex: 0,
    mimeType: "image/png",
    base64: imageBytes.toString("base64"),
    revisedPrompt: name,
  });
  const output = completed.slots[0].output;
  if (!output) throw new Error("Generation fixture output is missing");
  await window.api.generation.setFavorite({
    batchId: batch.id,
    outputId: output.id,
    favorite: true,
  });
}

export async function providerGenerationSnapshot(profile: string): Promise<{
  providers: Awaited<
    ReturnType<Window["api"]["agent"]["listProviderProfiles"]>
  >;
  batches: Awaited<ReturnType<Window["api"]["generation"]["list"]>>;
  outputs: Awaited<
    ReturnType<Window["api"]["generation"]["readOutputReference"]>
  >[];
  files: Record<string, string>;
  bundleManifests: Record<
    string,
    ReturnType<typeof readResourceBundle>["manifest"]
  >;
}> {
  const batches = await window.api.generation.list();
  const generationRoot = path.join(profile, "data", "generations");
  const files = inventory(generationRoot);
  return {
    providers: await window.api.agent.listProviderProfiles({
      includeArchived: true,
    }),
    batches,
    outputs: await Promise.all(
      batches.flatMap((batch) =>
        batch.slots.flatMap((slot) =>
          slot.output
            ? [
                window.api.generation.readOutputReference({
                  batchId: batch.id,
                  outputId: slot.output.id,
                }),
              ]
            : [],
        ),
      ),
    ),
    files,
    bundleManifests: Object.fromEntries(
      Object.keys(files)
        .filter((file) => file.endsWith("/manifest.json"))
        .map((file) => [
          file,
          readResourceBundle(path.dirname(path.join(generationRoot, file)))
            .manifest,
        ]),
    ),
  };
}
