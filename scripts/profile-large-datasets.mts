import { performance } from "node:perf_hooks";

import type { Folder, Prompt, Skill } from "../src/shared/types/index.ts";
import {
  buildPromptStats,
  filterVisiblePrompts,
  sortVisiblePrompts,
} from "../src/renderer/services/prompt-filter.ts";
import { buildSkillStats } from "../src/renderer/services/skill-stats.ts";
import { filterVisibleSkills } from "../src/renderer/services/skill-filter.ts";

function createPrompt(index: number): Prompt {
  const iso = new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString();

  return {
    id: `prompt-${index}`,
    title: `Prompt ${String(index).padStart(4, "0")}`,
    description: index % 13 === 0 ? "Batch deploy workflow" : `Description ${index}`,
    promptType: index % 5 === 0 ? "image" : "text",
    systemPrompt: `System ${index}`,
    systemPromptEn: `System EN ${index}`,
    userPrompt: `User ${index} with batch import and sync`,
    userPromptEn: `User EN ${index} with batch import and sync`,
    variables: [],
    tags: [`tag-${index % 12}`, `group-${index % 6}`],
    folderId: index % 2 === 0 ? "folder-a" : "folder-b",
    isFavorite: index % 9 === 0,
    isPinned: index % 97 === 0,
    version: 1,
    currentVersion: 1,
    usageCount: index,
    createdAt: iso,
    updatedAt: iso,
  };
}

function createSkill(index: number): Skill {
  return {
    id: `skill-${index}`,
    name: `skill-${String(index).padStart(4, "0")}`,
    description: index % 17 === 0 ? "Skill batch deploy helper" : `Skill ${index}`,
    instructions: `# Skill ${index}`,
    content: `# Skill ${index}`,
    protocol_type: "skill",
    author: "Local",
    local_repo_path: `/tmp/skill-${index}`,
    tags: [`base-${index % 14}`, `user-${index % 7}`],
    original_tags: [`base-${index % 14}`],
    is_favorite: index % 8 === 0,
    registry_slug: index % 4 === 0 ? `registry-${index}` : undefined,
    currentVersion: 0,
    created_at: index,
    updated_at: index,
  };
}

function benchmark(name: string, fn: () => void, iterations = 40) {
  const samples: number[] = [];

  for (let i = 0; i < iterations; i += 1) {
    const startedAt = performance.now();
    fn();
    samples.push(performance.now() - startedAt);
  }

  const total = samples.reduce((sum, value) => sum + value, 0);
  const average = total / samples.length;
  const max = Math.max(...samples);
  const min = Math.min(...samples);

  return {
    operation: name,
    iterations,
    avgMs: Number(average.toFixed(3)),
    minMs: Number(min.toFixed(3)),
    maxMs: Number(max.toFixed(3)),
  };
}

function readNumericArg(name: string, fallback: number) {
  const raw = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  if (!raw) return fallback;

  const value = Number.parseInt(raw.slice(name.length + 3), 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const promptCount = readNumericArg("prompts", 1000);
const skillCount = readNumericArg("skills", 1000);
const iterations = readNumericArg("iterations", 40);

const prompts = Array.from({ length: promptCount }, (_, index) =>
  createPrompt(index),
);
const skills = Array.from({ length: skillCount }, (_, index) =>
  createSkill(index),
);
const folders: Folder[] = [
  {
    id: "folder-a",
    name: "Folder A",
    order: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "folder-b",
    name: "Folder B",
    order: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];
const deployedSkillNames = new Set(
  skills.slice(0, Math.max(1, Math.floor(skillCount * 0.6))).map((skill) => skill.name),
);

const results = [
  benchmark(`buildPromptStats(${promptCount})`, () => {
    buildPromptStats(prompts);
  }, iterations),
  benchmark(`filterVisiblePrompts(${promptCount})`, () => {
    filterVisiblePrompts({
      prompts,
      selectedFolderId: "folder-b",
      folders,
      unlockedFolderIds: new Set<string>(),
      searchQuery: "batch deploy",
      filterTags: ["tag-1"],
      promptTypeFilter: "text",
    });
  }, iterations),
  benchmark(`sortVisiblePrompts(${promptCount})`, () => {
    sortVisiblePrompts(prompts, "updatedAt", "desc");
  }, iterations),
  benchmark(`buildSkillStats(${skillCount})`, () => {
    buildSkillStats(skills, deployedSkillNames);
  }, iterations),
  benchmark(`filterVisibleSkills(${skillCount})`, () => {
    filterVisibleSkills({
      deployedSkillNames,
      filterTags: ["user-1"],
      filterType: "pending",
      searchQuery: "batch deploy",
      skills,
      storeView: "my-skills",
    });
  }, iterations),
];

console.log(
  `PromptHub large dataset baseline (prompts=${promptCount}, skills=${skillCount}, iterations=${iterations})`,
);
console.table(results);

const memory = process.memoryUsage();
console.log(
  `heapUsed=${(memory.heapUsed / 1024 / 1024).toFixed(1)}MB rss=${(
    memory.rss /
    1024 /
    1024
  ).toFixed(1)}MB`,
);
