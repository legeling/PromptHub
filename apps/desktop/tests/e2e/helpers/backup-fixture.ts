import fs from "node:fs";
import path from "node:path";
import { expect, type Page } from "@playwright/test";
import { setAppSettings } from "./electron";

export const backupImage = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6VAAAAABJRU5ErkJggg==",
  "base64",
);
export const backupVideo = Buffer.from([0, 0, 0, 24, 102, 116, 121, 112]);

function writeFixture(
  root: string,
  files: Record<string, string | Buffer>,
): void {
  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
}

async function seedSkill(page: Page, source: string): Promise<void> {
  const content =
    "---\nname: backup-skill\ndescription: Backup acceptance\n---\nKeep the package\n";
  writeFixture(source, {
    "SKILL.md": content,
    "docs/nested/readme.md": "Nested Skill bytes",
    "assets/blob.bin": Buffer.from([0, 128, 255]),
  });
  const result = await page.evaluate(
    async ({ source, content }) => {
      const installed = await window.api.skill.runPackageOperation({
        operation: "install",
        registrySkill: {
          name: "backup-skill",
          slug: "backup-skill",
          description: "Backup acceptance",
          category: "general",
          author: "Fixture",
          version: "1.0.0",
          tags: [],
          source_id: "backup-fixture",
          source_url: source,
          content,
        },
        content,
        source: { kind: "local-directory", directory: source },
      });
      if (installed.status === "completed")
        await window.api.skill.versionCreate(
          installed.skill.id,
          "Saved package",
        );
      return installed.status;
    },
    { source, content },
  );
  expect(result).toBe("completed");
}

async function seedPlugin(page: Page, source: string): Promise<void> {
  writeFixture(source, {
    ".codex-plugin/plugin.json": JSON.stringify({
      name: "backup-plugin",
      version: "1.0.0",
    }),
    "assets/nested/example.txt": "Nested Plugin bytes",
  });
  await page.evaluate(async (sourcePath) => {
    const imported = await window.api.plugin.importLocalPluginPackage({
      sourcePath,
    });
    await window.api.plugin.versionCreate(imported.plugin.id, "Saved plugin");
  }, source);
}

async function seedRulesAndMcp(page: Page, project: string): Promise<void> {
  fs.mkdirSync(project);
  await page.evaluate(async (rootPath) => {
    const rule = await window.api.rules.addProject({
      id: "backup-project",
      name: "Backup project",
      rootPath,
    });
    await window.api.rules.save(rule.id, "# First rule\n");
    await window.api.rules.save(rule.id, "# Revised rule\n");
    const server = await window.api.mcp.createServer({
      name: "backup-mcp",
      displayName: "Backup MCP",
      transport: "stdio",
      command: "fixture-command",
      args: ["--fixture"],
      enabled: false,
      source: { type: "manual" },
    });
    await window.api.mcp.createVersion(server.id, "Saved MCP");
    await window.api.agent.createProviderProfile({
      profile: {
        platformId: "codex",
        name: "Backup provider",
        providerKind: "openai",
        protocol: "openai",
        endpoint: "https://fixture.invalid/v1",
        config: {},
        source: "manual",
      },
      modelMappings: [
        { routeKey: "primary", modelId: "fixture-model", parameters: {} },
      ],
    });
  }, project);
}

async function seedGeneration(page: Page, promptId: string): Promise<void> {
  await page.evaluate(
    async ({ promptId, base64 }) => {
      const batch = await window.api.generation.create({
        title: "Backup generation",
        sourcePromptId: promptId,
        sourcePromptVersion: 2,
        variableValues: {},
        referenceImages: [],
        prompt: "Fixture generation",
        model: {
          id: "fixture-model",
          provider: "openai",
          model: "fixture-model",
          name: "Fixture",
        },
        targetCount: 1,
        quality: "hd",
        aspectRatio: "1:1",
      });
      await window.api.generation.markSlotRunning(batch.id, 0);
      await window.api.generation.commitOutput({
        batchId: batch.id,
        slotIndex: 0,
        mimeType: "image/png",
        base64,
      });
    },
    { promptId, base64: backupImage.toString("base64") },
  );
}

export async function seedBackupDomains(
  page: Page,
  root: string,
  profile: string,
): Promise<string> {
  await setAppSettings(page, {
    language: "en",
    autoCheckUpdate: false,
    minimizeOnLaunch: false,
    themeMode: "light",
    aiProvider: "openai",
    aiApiProtocol: "openai",
    aiApiUrl: "https://fixture.invalid/v1",
    aiModel: "fixture-model",
  });
  writeFixture(profile, {
    "data/assets/images/backup.png": backupImage,
    "data/assets/videos/backup.mp4": backupVideo,
  });
  const promptId = await page.evaluate(async () => {
    const folder = await window.api.folder.create({ name: "Backup folder" });
    const prompt = await window.api.prompt.create({
      title: "Backup prompt",
      userPrompt: "First revision",
      systemPrompt: "System instructions",
      folderId: folder.id,
      tags: ["backup"],
      images: ["backup.png"],
      videos: ["backup.mp4"],
    });
    await window.api.prompt.update(prompt.id, {
      userPrompt: "Second revision \u6570\u636e \u{1f680}",
    });
    return prompt.id;
  });
  await seedSkill(page, path.join(root, "skill-source"));
  await seedPlugin(page, path.join(root, "plugin-source"));
  await seedRulesAndMcp(page, path.join(root, "project"));
  await seedGeneration(page, promptId);
  return promptId;
}

// Read public consumers, not export helpers: missing restored domains must fail.
async function readDomainState() {
  const skills = await window.api.skill.getAll();
  const plugins = (await window.api.plugin.getLibrary()).plugins;
  const rules = await window.api.rules.list();
  const batches = await window.api.generation.list();
  const settings = (await window.api.settings.rendererPersistence.get())
    .settings;
  return {
    prompts: (await window.api.prompt.getAll()).map(
      ({
        id,
        title,
        userPrompt,
        systemPrompt,
        tags,
        folderId,
        images,
        videos,
      }) => ({
        id,
        title,
        userPrompt,
        systemPrompt,
        tags,
        folderId,
        images,
        videos,
      }),
    ),
    folders: (await window.api.folder.getAll()).map(({ id, name }) => ({
      id,
      name,
    })),
    skills: await Promise.all(
      skills.map(async (skill) => ({
        id: skill.id,
        name: skill.name,
        history: (await window.api.skill.versionGetAll(skill.id)).map(
          ({ version, content, filesSnapshot, note }) => ({
            version,
            content,
            filesSnapshot,
            note,
          }),
        ),
      })),
    ),
    plugins: await Promise.all(
      plugins.map(async (plugin) => ({
        id: plugin.id,
        name: plugin.name,
        history: (await window.api.plugin.versionGetAll(plugin.id)).map(
          ({ version, note, packageSnapshot }) => ({
            version,
            note,
            packageSnapshot,
          }),
        ),
      })),
    ),
    rules: await Promise.all(
      rules
        .filter((rule) => rule.id === "project:backup-project")
        .map(async (rule) => {
          const full = await window.api.rules.read(rule.id);
          return {
            id: full.id,
            content: full.content,
            history: full.versions.map((version) => version.content),
          };
        }),
    ),
    mcp: await Promise.all(
      (await window.api.mcp.getLibrary()).servers.map(
        async ({ id, name, command, args }) => ({
          id,
          name,
          command,
          args,
          history: (await window.api.mcp.listVersions(id)).items.map(
            ({ version, note, semanticDigest }) => ({
              version,
              note,
              semanticDigest,
            }),
          ),
        }),
      ),
    ),
    providers: (
      await window.api.agent.listProviderProfiles({ includeArchived: true })
    ).map(({ id, name, endpoint, modelMappings }) => ({
      id,
      name,
      endpoint,
      modelMappings,
    })),
    generations: await Promise.all(
      batches.map(async (batch) => ({
        batch,
        outputs: await Promise.all(
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
      })),
    ),
    settings: {
      aiModel: settings.aiModel,
      aiApiUrl: settings.aiApiUrl,
      themeMode: settings.themeMode,
    },
  };
}

export async function readBackupDomains(
  page: Page,
): Promise<Awaited<ReturnType<typeof readDomainState>>> {
  return page.evaluate(readDomainState);
}

export async function expectBackupFiles(
  page: Page,
  profile: string,
): Promise<void> {
  expect(
    fs.readFileSync(path.join(profile, "data/assets/images/backup.png")),
  ).toEqual(backupImage);
  expect(
    fs.readFileSync(path.join(profile, "data/assets/videos/backup.mp4")),
  ).toEqual(backupVideo);
  const paths = await page.evaluate(async () => ({
    skills: (await window.api.skill.getAll()).map(
      (skill) => skill.local_repo_path,
    ),
    plugins: (await window.api.plugin.getLibrary()).plugins.map(
      (plugin) => plugin.localPackagePath,
    ),
  }));
  expect(paths.skills).toHaveLength(1);
  expect(paths.plugins).toHaveLength(1);
  for (const directory of paths.skills) {
    if (!directory) throw new Error("Restored Skill has no package directory");
    expect(directory.startsWith(profile + path.sep)).toBe(true);
    expect(
      fs.readFileSync(path.join(directory, "docs/nested/readme.md"), "utf8"),
    ).toBe("Nested Skill bytes");
    expect(fs.readFileSync(path.join(directory, "assets/blob.bin"))).toEqual(
      Buffer.from([0, 128, 255]),
    );
  }
  for (const directory of paths.plugins) {
    expect(directory.startsWith(profile + path.sep)).toBe(true);
    expect(
      fs.readFileSync(
        path.join(directory, "assets/nested/example.txt"),
        "utf8",
      ),
    ).toBe("Nested Plugin bytes");
  }
}
