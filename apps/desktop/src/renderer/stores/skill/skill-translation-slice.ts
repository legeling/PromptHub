import { computeSkillContentFingerprint } from "../../services/skill-store-update";
import { AI_REQUEST_TIMEOUT_MS } from "@prompthub/shared/constants/ai";
import { resolveScenarioAIConfig } from "../../services/ai-defaults";
import {
  getSkillTranslationCacheState,
  loadSkillTranslationAI,
  pruneSkillTranslationCache,
  type SkillTranslationCacheEntry,
} from "../../services/skill-translation-cache";
import { useSettingsStore } from "../settings.store";
import type {
  SkillStoreGet,
  SkillStoreSet,
  SkillTranslationSlice,
} from "./skill-store-types";

const IMMERSIVE_TRANSLATION_PROMPT = `You are a professional translator working on complete SKILL.md documents.

Return a valid SKILL.md document in __TARGET_LANGUAGE__.

Rules:
1. The input may begin with YAML frontmatter between --- delimiters. Preserve the delimiters, key order, and valid YAML syntax.
2. In frontmatter, do NOT insert <t>...</t> lines. Keep YAML keys unchanged. Translate only human-readable text values such as description when appropriate. Leave identifiers, slug-like names, versions, URLs, file paths, and code-like values unchanged.
3. After the frontmatter, translate the markdown body in immersive mode: for each heading, paragraph, or list block, output the original block first, then output the translated block wrapped in <t>...</t>.
4. Do NOT translate fenced code blocks, inline code, command names, file paths, URLs, or YAML keys.
5. Preserve markdown structure. Output only the final SKILL.md document with no commentary.

Example input:
---
name: write
description: Help users write better.
---

## Overview
This skill helps you write tests.

Example output:
---
name: write
description: 帮助用户更好地写作。
---

## Overview
<t>## 概述</t>
This skill helps you write tests.
<t>此技能帮助你编写测试。</t>`;

const STANDARD_TRANSLATION_PROMPT = `You are a professional translator working on complete SKILL.md documents.

Return a valid translated SKILL.md document in __TARGET_LANGUAGE__.

Rules:
1. Preserve YAML frontmatter delimiters, key order, and valid YAML syntax.
2. Keep YAML keys unchanged. Translate human-readable text values such as description when appropriate, but leave identifiers, slug-like names, versions, URLs, file paths, and code-like values unchanged.
3. Translate the markdown body fully while preserving markdown structure.
4. Do NOT translate fenced code blocks, inline code, command names, file paths, URLs, or YAML keys.
5. Output only the translated SKILL.md document with no commentary.`;

function buildTranslationSystemPrompt(
  targetLang: string,
  translationMode: string,
): string {
  const prompt =
    translationMode === "immersive"
      ? IMMERSIVE_TRANSLATION_PROMPT
      : STANDARD_TRANSLATION_PROMPT;
  return prompt.replace("__TARGET_LANGUAGE__", targetLang);
}

function getTranslationConfig() {
  const settings = useSettingsStore.getState();
  const config = resolveScenarioAIConfig({
    aiModels: settings.aiModels,
    scenarioModelDefaults: settings.scenarioModelDefaults,
    scenario: "translation",
    type: "chat",
    aiProvider: settings.aiProvider,
    aiApiProtocol: settings.aiApiProtocol,
    aiApiKey: settings.aiApiKey,
    aiApiUrl: settings.aiApiUrl,
    aiModel: settings.aiModel,
  });
  if (!config?.apiKey || !config.apiUrl || !config.model) {
    throw new Error("AI_NOT_CONFIGURED");
  }
  return { config, translationMode: settings.translationMode || "immersive" };
}

function getCachedTranslation(
  get: SkillStoreGet,
  cacheKey: string,
  sourceFingerprint: string,
  forceRefresh: boolean | undefined,
): string | null {
  if (forceRefresh) return null;
  return getSkillTranslationCacheState(
    get().translationCache,
    cacheKey,
    sourceFingerprint,
  ).value;
}

function saveTranslation(
  set: SkillStoreSet,
  cacheKey: string,
  sourceFingerprint: string,
  value: string,
): void {
  set((state) => {
    const translationCache = pruneSkillTranslationCache({
      ...state.translationCache,
      [cacheKey]: { value, timestamp: Date.now(), sourceFingerprint },
    });
    return { translationCache };
  });
}

async function requestTranslation(
  content: string,
  targetLang: string,
): Promise<string | null> {
  const { config, translationMode } = getTranslationConfig();
  const { chatCompletion } = await loadSkillTranslationAI();
  const result = await chatCompletion(
    config,
    [
      {
        role: "system",
        content: buildTranslationSystemPrompt(targetLang, translationMode),
      },
      { role: "user", content },
    ],
    {
      temperature: 0.3,
      maxTokens: 8192,
      timeoutMs: AI_REQUEST_TIMEOUT_MS,
    },
  );
  return result.content;
}

function createTranslationAction(set: SkillStoreSet, get: SkillStoreGet) {
  return {
    translateContent: async (content, cacheKey, targetLang, options) => {
      const sourceFingerprint =
        options?.sourceFingerprint ?? computeSkillContentFingerprint(content);
      const cached = getCachedTranslation(
        get,
        cacheKey,
        sourceFingerprint,
        options?.forceRefresh,
      );
      if (cached) return cached;
      try {
        const translated = await requestTranslation(content, targetLang);
        if (translated)
          saveTranslation(set, cacheKey, sourceFingerprint, translated);
        return translated;
      } catch (error) {
        console.error("Translation failed:", error);
        throw error;
      }
    },
  } satisfies Pick<SkillTranslationSlice, "translateContent">;
}

function createTranslationCacheActions(set: SkillStoreSet, get: SkillStoreGet) {
  return {
    getTranslationState: (cacheKey, sourceFingerprint) =>
      getSkillTranslationCacheState(
        get().translationCache,
        cacheKey,
        sourceFingerprint,
      ),
    getTranslation: (cacheKey) =>
      getSkillTranslationCacheState(get().translationCache, cacheKey).value,
    clearTranslation: (cacheKey) => {
      set((state) => {
        if (!state.translationCache[cacheKey]) return state;
        const translationCache = { ...state.translationCache };
        delete translationCache[cacheKey];
        return { translationCache };
      });
    },
  } satisfies Pick<
    SkillTranslationSlice,
    "getTranslationState" | "getTranslation" | "clearTranslation"
  >;
}

export function createSkillTranslationSlice(
  set: SkillStoreSet,
  get: SkillStoreGet,
): SkillTranslationSlice {
  return {
    translationCache: {} as Record<string, SkillTranslationCacheEntry>,
    ...createTranslationAction(set, get),
    ...createTranslationCacheActions(set, get),
  };
}
