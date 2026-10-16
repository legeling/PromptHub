/**
 * @vitest-environment node
 */
import fs from "fs";
import crypto from "node:crypto";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { unzipSync } from "fflate";
import {
  AgentProviderProfileDB,
  DatabaseAdapter,
  GenerationDB,
  SCHEMA,
} from "@prompthub/db";

import { PluginStorage } from "@prompthub/core/plugin-storage";
import { emptyPluginInventory } from "@prompthub/core/plugin-library/shared";
import { createPortableSnapshotZip } from "../../../src/main/services/portable-snapshot-archive";

describe("portable snapshot archive", () => {
  const roots: string[] = [];

  afterEach(() => {
    vi.restoreAllMocks();
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("exports SQL-owned Plugin packages and histories in a selected archive", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ph-plugin-export-"));
    roots.push(root);
    const databasePath = path.join(root, "plugins.sqlite");
    const database = new DatabaseAdapter(databasePath);
    const incoming = path.join(root, "incoming");
    fs.mkdirSync(incoming);
    fs.writeFileSync(path.join(incoming, "payload.bin"), Buffer.from([0,255,12]));
    try {
      database.exec(SCHEMA);
      new PluginStorage(database, root).write([{
        id: "plugin-fixture", name: "fixture", displayName: "Fixture",
        source: { kind: "local", url: incoming }, localPackagePath: incoming,
        classification: "bundle", trustLevel: "custom", inventory: emptyPluginInventory(),
        installedAt: 1, updatedAt: 1,
      }], []);
    } finally { database.close(); }
    const destination = path.join(root, "plugin.zip");
    await createPortableSnapshotZip({ destinationPath: destination, sourcePaths: {
      rootPath: root, cachePath: path.join(root,"cache"),
      promptsPath: "", versionsPath: "", skillsPath: "", rulesPath: "",
      pluginsPath: "", pluginDatabasePath: databasePath, imagesPath: "", videosPath: "",
    }, scope: { prompts: false, versions: false, images: false, skills: false,
      plugins: true, config: false } });
    const files = unzipSync(fs.readFileSync(destination));
    expect(Buffer.from(files["data/plugins/plugin-fixture/files/payload.bin"])).toEqual(Buffer.from([0,255,12]));
    expect(Object.keys(files)).toContain("data/plugins/plugin-fixture/plugin.json");
    expect(fs.readdirSync(path.join(root,"cache","portable-snapshots"))).toEqual([]);
  });

  it("streams only selected scopes and cleans task-owned staging", async () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "prompthub-portable-zip-"),
    );
    roots.push(root);
    const prompts = path.join(root, "data", "prompts");
    const skills = path.join(root, "data", "skills");
    const cache = path.join(root, "cache");
    fs.mkdirSync(prompts, { recursive: true });
    fs.mkdirSync(skills, { recursive: true });
    fs.writeFileSync(path.join(prompts, "prompt.json"), "prompt");
    fs.writeFileSync(path.join(skills, "SKILL.md"), "skill");
    const destination = path.join(root, "export.zip");

    const result = await createPortableSnapshotZip({
      destinationPath: destination,
      sourcePaths: {
        rootPath: root,
        cachePath: cache,
        promptsPath: prompts,
        versionsPath: path.join(root, "missing-versions"),
        skillsPath: skills,
        rulesPath: path.join(root, "missing-rules"),
        pluginsPath: path.join(root, "missing-plugins"),
        imagesPath: path.join(root, "missing-images"),
        videosPath: path.join(root, "missing-videos"),
      },
      scope: {
        prompts: true,
        versions: false,
        images: false,
        skills: false,
        config: false,
        settingsJson: '{"theme":"dark"}',
      },
    });

    const files = unzipSync(fs.readFileSync(destination));
    expect(Object.keys(files).sort()).toEqual([
      "config/app.json",
      "data/prompts/prompt.json",
      "portable-manifest.json",
    ]);
    expect(Buffer.from(files["data/prompts/prompt.json"]).toString()).toBe(
      "prompt",
    );
    expect(result.consistencyId).toMatch(/^[a-f0-9]{64}$/);
    expect(fs.existsSync(path.join(cache, "portable-snapshots"))).toBe(true);
    expect(fs.readdirSync(path.join(cache, "portable-snapshots"))).toEqual([]);
  });

  it("includes MCP, Agent, generation, and content-addressed object domains", async () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "prompthub-portable-domains-"),
    );
    roots.push(root);
    const cache = path.join(root, "cache");
    const mcpPath = path.join(root, "data", "mcp");
    const agentProviderDatabasePath = path.join(root, "data", "prompthub.db");
    const generationsPath = path.join(root, "data", "generations");
    const objectsPath = path.join(root, "data", "assets", "objects");
    for (const directory of [mcpPath, generationsPath, objectsPath]) {
      fs.mkdirSync(directory, { recursive: true });
    }
    fs.writeFileSync(path.join(mcpPath, "server.json"), "mcp");
    const database = new DatabaseAdapter(agentProviderDatabasePath);
    database.exec(SCHEMA);
    const repository = new AgentProviderProfileDB(database);
    const profile = repository.createProfileWithMappings(
      {
        name: "SQL provider",
        platformId: "codex",
        providerKind: "openai",
        protocol: "openai-responses",
        config: {},
        source: "manual",
        secretRef: "agent-provider:device-reference",
      },
      [{ routeKey: "primary", modelId: "fixture", parameters: {} }],
    );
    const mappings = repository.listModelMappings(profile.id);
    const bytes = Buffer.from([0, 255, 128]);
    const imageHash = crypto.createHash("sha256").update(bytes).digest("hex");
    const at = "2026-10-15T00:00:00.000Z";
    new GenerationDB(database).upsert({
      kind: "prompthub-generation-batch",
      version: 1,
      id: "batch",
      title: "Image",
      status: "succeeded",
      resolvedPrompt: "A sea",
      model: { id: "m1", provider: "openai", model: "image" },
      parameters: {},
      targetCount: 1,
      slots: [
        {
          index: 0,
          status: "succeeded",
          output: {
            id: "output",
            slotIndex: 0,
            fileName: "image.png",
            mimeType: "image/png",
            byteSize: bytes.length,
            sha256: imageHash,
            createdAt: at,
            favorite: true,
          },
        },
      ],
      counts: {
        total: 1,
        pending: 0,
        running: 0,
        succeeded: 1,
        failed: 0,
        cancelled: 0,
        interrupted: 0,
      },
      createdAt: at,
      updatedAt: at,
      completedAt: at,
    });
    const imageDirectory = path.join(generationsPath, "assets", "batch");
    fs.mkdirSync(imageDirectory, { recursive: true });
    fs.writeFileSync(path.join(imageDirectory, "image.png"), bytes);
    database.close();
    const originalDatabase = fs.readFileSync(agentProviderDatabasePath);
    fs.writeFileSync(path.join(generationsPath, "batch.json"), "generation");
    fs.writeFileSync(path.join(objectsPath, "object.bin"), "object");
    const destination = path.join(root, "domains.zip");

    await createPortableSnapshotZip({
      destinationPath: destination,
      sourcePaths: {
        rootPath: root,
        cachePath: cache,
        promptsPath: path.join(root, "missing-prompts"),
        versionsPath: path.join(root, "missing-versions"),
        skillsPath: path.join(root, "missing-skills"),
        rulesPath: path.join(root, "missing-rules"),
        pluginsPath: path.join(root, "missing-plugins"),
        mcpPath,
        agentProviderDatabasePath,
        generationDatabasePath: agentProviderDatabasePath,
        imagesPath: path.join(root, "missing-images"),
        videosPath: path.join(root, "missing-videos"),
      },
      scope: {
        prompts: false,
        versions: false,
        images: false,
        skills: false,
        mcp: true,
        agents: true,
        generations: true,
        config: false,
      },
    });

    const entries = unzipSync(fs.readFileSync(destination));
    const files = Object.keys(entries).sort();
    expect(files).toEqual([
      `data/agents/${profile.id}/agent.json`,
      `data/agents/${profile.id}/manifest.json`,
      `data/assets/objects/sha256/${imageHash.slice(0, 2)}/${imageHash}`,
      "data/generations/batch/batch.json",
      "data/generations/batch/manifest.json",
      "data/mcp/server.json",
      "portable-manifest.json",
    ]);
    expect(
      Buffer.from(
        entries[
          `data/assets/objects/sha256/${imageHash.slice(0, 2)}/${imageHash}`
        ],
      ),
    ).toEqual(bytes);
    const document = JSON.parse(
      Buffer.from(entries[`data/agents/${profile.id}/agent.json`]).toString(),
    );
    expect(document).toMatchObject({
      profile: { id: profile.id, name: profile.name },
      modelMappings: mappings,
      requiresSecret: true,
    });
    expect(document.profile.secretRef).toBeUndefined();
    expect(fs.readFileSync(agentProviderDatabasePath)).toEqual(
      originalDatabase,
    );
    expect(fs.existsSync(path.join(root, "data", "agents"))).toBe(false);
    expect(fs.readdirSync(path.join(cache, "portable-snapshots"))).toEqual([]);
  });

  it("embeds the verified canonical checkpoint without local catalog or device state", async () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "prompthub-portable-canonical-"),
    );
    roots.push(root);
    const checkpointPath = path.join(root, "cache", "canonical-checkpoint");
    fs.mkdirSync(path.join(checkpointPath, "canonical", "prompts"), {
      recursive: true,
    });
    fs.mkdirSync(path.join(checkpointPath, "catalog"), { recursive: true });
    fs.mkdirSync(path.join(checkpointPath, "device"), { recursive: true });
    fs.writeFileSync(
      path.join(checkpointPath, "canonical", "prompts", "resource.json"),
      "canonical-prompt",
    );
    fs.writeFileSync(
      path.join(checkpointPath, "catalog", "prompthub.db"),
      "derived",
    );
    fs.writeFileSync(
      path.join(checkpointPath, "device", "mcp-bindings.json"),
      "local",
    );
    fs.writeFileSync(
      path.join(checkpointPath, "checkpoint.json"),
      JSON.stringify({
        kind: "prompthub-canonical-storage-checkpoint",
        version: 1,
      }),
    );
    const destination = path.join(root, "canonical.zip");

    await createPortableSnapshotZip({
      destinationPath: destination,
      sourcePaths: {
        rootPath: root,
        cachePath: path.join(root, "cache"),
        canonicalCheckpointPath: checkpointPath,
        promptsPath: path.join(root, "missing-prompts"),
        versionsPath: path.join(root, "missing-versions"),
        skillsPath: path.join(root, "missing-skills"),
        rulesPath: path.join(root, "missing-rules"),
        pluginsPath: path.join(root, "missing-plugins"),
        imagesPath: path.join(root, "missing-images"),
        videosPath: path.join(root, "missing-videos"),
      },
      scope: {
        prompts: true,
        versions: true,
        images: true,
        videos: true,
        skills: true,
        rules: true,
        mcp: true,
        plugins: true,
        agents: true,
        generations: true,
        config: false,
      },
    });

    const files = Object.keys(unzipSync(fs.readFileSync(destination))).sort();
    expect(files).toContain("canonical/prompts/resource.json");
    expect(files).toContain("canonical-checkpoint.json");
    expect(files).not.toContain("catalog/prompthub.db");
    expect(files).not.toContain("device/mcp-bindings.json");
  });

  it("refuses to attach a full canonical checkpoint to a selective export", async () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "prompthub-portable-canonical-scope-"),
    );
    roots.push(root);
    const checkpointPath = path.join(root, "cache", "canonical-checkpoint");
    fs.mkdirSync(path.join(checkpointPath, "canonical"), { recursive: true });
    fs.writeFileSync(path.join(checkpointPath, "checkpoint.json"), "{}");
    const destination = path.join(root, "selective.zip");

    await expect(
      createPortableSnapshotZip({
        destinationPath: destination,
        sourcePaths: {
          rootPath: root,
          cachePath: path.join(root, "cache"),
          canonicalCheckpointPath: checkpointPath,
          promptsPath: path.join(root, "missing-prompts"),
          versionsPath: path.join(root, "missing-versions"),
          skillsPath: path.join(root, "missing-skills"),
          rulesPath: path.join(root, "missing-rules"),
          pluginsPath: path.join(root, "missing-plugins"),
          imagesPath: path.join(root, "missing-images"),
          videosPath: path.join(root, "missing-videos"),
        },
        scope: {
          prompts: true,
          versions: false,
          images: false,
          skills: false,
          config: false,
        },
      }),
    ).rejects.toThrow("complete durable export");
    expect(fs.existsSync(destination)).toBe(false);
  });
});
