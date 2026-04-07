import { performance } from "node:perf_hooks";

import type { Folder, Prompt, Skill } from "../src/shared/types/index.ts";
import {
  buildPromptStats,
  filterVisiblePrompts,
  sortVisiblePrompts,
} from "../src/renderer/services/prompt-filter.ts";
import { filterVisibleSkills } from "../src/renderer/services/skill-filter.ts";
import { buildSkillStats } from "../src/renderer/services/skill-stats.ts";

type BenchmarkResult = {
  avgMs: number;
  iterations: number;
  maxMs: number;
  minMs: number;
  operation: string;
};

type BudgetCheck = {
  actual: number;
  budget: number;
  name: string;
  passed: boolean;
  unit: string;
};

function createPrompt(index: number): Prompt {
  const iso = new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString();

  return {
    id: `prompt-${index}`,
    title: `Prompt ${String(index).padStart(4, "0")}`,
    description:
      index % 13 === 0 ? "Batch deploy workflow" : `Description ${index}`,
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
    description:
      index % 17 === 0 ? "Skill batch deploy helper" : `Skill ${index}`,
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

function benchmark(
  name: string,
  fn: () => void,
  iterations: number,
): BenchmarkResult {
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

function createBudgetCheck(
  name: string,
  actual: number,
  budget: number,
  unit = "ms",
): BudgetCheck {
  return {
    actual: Number(actual.toFixed(3)),
    budget,
    name,
    passed: actual <= budget,
    unit,
  };
}

const promptCount = readNumericArg("prompts", 5000);
const skillCount = readNumericArg("skills", 2000);
const iterations = readNumericArg("iterations", 20);

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
  skills
    .slice(0, Math.max(1, Math.floor(skillCount * 0.6)))
    .map((skill) => skill.name),
);

const promptStatsResult = benchmark("buildPromptStats", () => {
  buildPromptStats(prompts);
}, iterations);

const filterPromptsResult = benchmark("filterVisiblePrompts", () => {
  filterVisiblePrompts({
    prompts,
    selectedFolderId: "folder-b",
    folders,
    unlockedFolderIds: new Set<string>(),
    searchQuery: "batch deploy",
    filterTags: ["tag-1"],
    promptTypeFilter: "text",
  });
}, iterations);

const sortPromptsResult = benchmark("sortVisiblePrompts", () => {
  sortVisiblePrompts(prompts, "updatedAt", "desc");
}, iterations);

const skillStatsResult = benchmark("buildSkillStats", () => {
  buildSkillStats(skills, deployedSkillNames);
}, iterations);

const filterSkillsResult = benchmark("filterVisibleSkills", () => {
  filterVisibleSkills({
    deployedSkillNames,
    filterTags: ["user-1"],
    filterType: "pending",
    searchQuery: "batch deploy",
    skills,
    storeView: "my-skills",
  });
}, iterations);

const memory = process.memoryUsage();
const heapUsedMb = memory.heapUsed / 1024 / 1024;
const rssMb = memory.rss / 1024 / 1024;

const checks = [
  createBudgetCheck("buildPromptStats avg", promptStatsResult.avgMs, 8),
  createBudgetCheck("filterVisiblePrompts avg", filterPromptsResult.avgMs, 8),
  createBudgetCheck("sortVisiblePrompts avg", sortPromptsResult.avgMs, 16),
  createBudgetCheck("buildSkillStats avg", skillStatsResult.avgMs, 6),
  createBudgetCheck("filterVisibleSkills avg", filterSkillsResult.avgMs, 6),
  createBudgetCheck("heapUsed", heapUsedMb, 256, "MB"),
  createBudgetCheck("rss", rssMb, 512, "MB"),
];

console.log(
  `PromptHub large dataset budgets (prompts=${promptCount}, skills=${skillCount}, iterations=${iterations})`,
);
console.table([
  promptStatsResult,
  filterPromptsResult,
  sortPromptsResult,
  skillStatsResult,
  filterSkillsResult,
]);
console.table(checks);

const failedChecks = checks.filter((check) => !check.passed);

if (failedChecks.length > 0) {
  console.error("Large dataset performance budget failed:");
  for (const check of failedChecks) {
    console.error(
      `- ${check.name}: ${check.actual}${check.unit} > ${check.budget}${check.unit}`,
    );
  }
  process.exitCode = 1;
} else {
  console.log("All large dataset performance budgets passed.");
}
