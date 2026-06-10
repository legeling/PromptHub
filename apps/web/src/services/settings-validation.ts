import { z } from 'zod';
import { syncSettingsPatchSchema, syncSettingsSchema } from './sync-settings-validation.js';

const MAX_PROMPT_TAG_CATALOG_ITEMS = 200;
const MAX_PROMPT_TAG_LENGTH = 100;
const MAX_CUSTOM_AGENTS = 32;
const MAX_CUSTOM_AGENT_FIELD_LENGTH = 120;
const MAX_CUSTOM_AGENT_PATH_LENGTH = 1024;
const MAX_CUSTOM_AGENT_CONFIG_PATHS = 16;
const MAX_CUSTOM_AGENT_RELATIVE_PATH_LENGTH = 512;
const MAX_SKILL_PROJECTS = 32;
const MAX_SKILL_PROJECT_FIELD_LENGTH = 120;
const MAX_SKILL_PROJECT_PATH_LENGTH = 1024;
const MAX_SKILL_PROJECT_PATHS = 32;
const MAX_PLATFORM_SETTING_ENTRIES = 64;
const MAX_PLATFORM_ID_LENGTH = 120;
const MAX_BACKGROUND_IMAGE_FILE_NAME_LENGTH = 255;
const MAX_BACKGROUND_IMAGE_BLUR = 50;
const MAX_MANUAL_BACKUP_TIMESTAMP_LENGTH = 64;
const MAX_MANUAL_BACKUP_VERSION_LENGTH = 120;

function isSafeBackgroundImageFileName(value: string): boolean {
  if (/[\\/]/u.test(value) || value.includes('..')) {
    return false;
  }

  if (/[\u0000-\u001F\u007F]/u.test(value)) {
    return false;
  }

  return value !== '.' && value !== '..';
}

const boundedTrimmedStringSchema = (fieldName: string, maxLength: number) =>
  z
    .string()
    .trim()
    .min(1, `${fieldName} must not be empty`)
    .max(maxLength, `${fieldName} must be at most ${maxLength} characters`)
    .refine(
      (value) => !/[\u0000-\u001F\u007F]/u.test(value),
      `${fieldName} must not contain control characters`,
    );

export const backgroundImageFileNameSchema = boundedTrimmedStringSchema(
  'backgroundImageFileName',
  MAX_BACKGROUND_IMAGE_FILE_NAME_LENGTH,
).refine(isSafeBackgroundImageFileName, 'backgroundImageFileName must be a safe file name');

export const lastManualBackupAtSchema = z
  .string()
  .max(
    MAX_MANUAL_BACKUP_TIMESTAMP_LENGTH,
    `lastManualBackupAt must be at most ${MAX_MANUAL_BACKUP_TIMESTAMP_LENGTH} characters`,
  )
  .datetime({ offset: true });

export const lastManualBackupVersionSchema = boundedTrimmedStringSchema(
  'lastManualBackupVersion',
  MAX_MANUAL_BACKUP_VERSION_LENGTH,
);

const promptTagSchema = boundedTrimmedStringSchema('prompt tag', MAX_PROMPT_TAG_LENGTH);

const platformIdSchema = boundedTrimmedStringSchema('platform id', MAX_PLATFORM_ID_LENGTH);

const platformPathSchema = boundedTrimmedStringSchema('platform path', MAX_CUSTOM_AGENT_PATH_LENGTH);

const agentAssetRelativePathSchema = boundedTrimmedStringSchema(
  'agent asset relative path',
  MAX_CUSTOM_AGENT_RELATIVE_PATH_LENGTH,
);

function validatePlatformRecordKeys(value: Record<string, unknown>, ctx: z.RefinementCtx): void {
  const entries = Object.entries(value);
  if (entries.length > MAX_PLATFORM_SETTING_ENTRIES) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `platform settings must contain at most ${MAX_PLATFORM_SETTING_ENTRIES} entries`,
    });
  }

  for (const [key] of entries) {
    if (key !== key.trim() || !platformIdSchema.safeParse(key).success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message: 'platform id must be a non-empty trimmed string within the supported length',
      });
    }
  }
}

const platformPathRecordSchema = z.record(platformPathSchema).superRefine(validatePlatformRecordKeys);

const platformIdArraySchema = z
  .array(platformIdSchema)
  .max(
    MAX_PLATFORM_SETTING_ENTRIES,
    `platform id list must contain at most ${MAX_PLATFORM_SETTING_ENTRIES} entries`,
  );

const agentAssetConfigSchema = z.object({
  rootPath: platformPathSchema.optional(),
  skillsRelativePath: agentAssetRelativePathSchema.optional(),
  rulesRelativePath: agentAssetRelativePathSchema.optional(),
  agentsRelativePath: agentAssetRelativePathSchema.optional(),
  commandsRelativePath: agentAssetRelativePathSchema.optional(),
  configRelativePaths: z
    .array(agentAssetRelativePathSchema)
    .max(
      MAX_CUSTOM_AGENT_CONFIG_PATHS,
      `agent asset configRelativePaths must contain at most ${MAX_CUSTOM_AGENT_CONFIG_PATHS} paths`,
    )
    .optional(),
});

const agentAssetConfigRecordSchema = z.record(agentAssetConfigSchema).superRefine(validatePlatformRecordKeys);

const customAgentRelativePathSchema = boundedTrimmedStringSchema(
  'custom agent relative path',
  MAX_CUSTOM_AGENT_RELATIVE_PATH_LENGTH,
);

const customAgentConfigSchema = z.object({
  id: boundedTrimmedStringSchema('custom agent id', MAX_CUSTOM_AGENT_FIELD_LENGTH),
  name: boundedTrimmedStringSchema('custom agent name', MAX_CUSTOM_AGENT_FIELD_LENGTH),
  rootPath: boundedTrimmedStringSchema('custom agent rootPath', MAX_CUSTOM_AGENT_PATH_LENGTH),
  enabled: z.boolean().optional(),
  skillsRelativePath: customAgentRelativePathSchema.optional(),
  rulesRelativePath: customAgentRelativePathSchema.optional(),
  agentsRelativePath: customAgentRelativePathSchema.optional(),
  commandsRelativePath: customAgentRelativePathSchema.optional(),
  configRelativePaths: z
    .array(customAgentRelativePathSchema)
    .max(
      MAX_CUSTOM_AGENT_CONFIG_PATHS,
      `custom agent configRelativePaths must contain at most ${MAX_CUSTOM_AGENT_CONFIG_PATHS} paths`,
    )
    .optional(),
});

const skillProjectPathSchema = boundedTrimmedStringSchema('skill project path', MAX_SKILL_PROJECT_PATH_LENGTH);

const skillProjectSchema = z.object({
  id: boundedTrimmedStringSchema('skill project id', MAX_SKILL_PROJECT_FIELD_LENGTH),
  name: boundedTrimmedStringSchema('skill project name', MAX_SKILL_PROJECT_FIELD_LENGTH),
  rootPath: skillProjectPathSchema,
  scanPaths: z
    .array(skillProjectPathSchema)
    .max(MAX_SKILL_PROJECT_PATHS, `skill project scanPaths must contain at most ${MAX_SKILL_PROJECT_PATHS} paths`),
  deployTargets: z
    .array(skillProjectPathSchema)
    .max(MAX_SKILL_PROJECT_PATHS, `skill project deployTargets must contain at most ${MAX_SKILL_PROJECT_PATHS} paths`)
    .optional(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  lastScannedAt: z.number().int().nonnegative().optional(),
});

const promptTagCatalogSchema = z
  .array(promptTagSchema)
  .max(
    MAX_PROMPT_TAG_CATALOG_ITEMS,
    `promptTagCatalog must contain at most ${MAX_PROMPT_TAG_CATALOG_ITEMS} tags`,
  );

const deviceSettingsSchema = z.object({
  syncCadence: z.enum(['manual', '15m', '1h', '1d']).optional(),
  storeAutoSync: z.boolean().optional(),
  storeSyncCadence: z.enum(['manual', '1h', '1d']).optional(),
});

export const settingsPreferenceSchema = z.object({
  tagFilterMode: z.enum(['single', 'multi']).optional(),
  promptTagCatalog: promptTagCatalogSchema.optional(),
  defaultFolderId: z.string().trim().min(1).nullable().optional(),
  backgroundImageFileName: backgroundImageFileNameSchema.optional(),
  backgroundImageOpacity: z.number().min(0).max(1).optional(),
  backgroundImageBlur: z
    .number()
    .min(0)
    .max(MAX_BACKGROUND_IMAGE_BLUR, `backgroundImageBlur must be at most ${MAX_BACKGROUND_IMAGE_BLUR}`)
    .optional(),
  builtinAgentOverrides: agentAssetConfigRecordSchema.optional(),
  customPlatformRootPaths: platformPathRecordSchema.optional(),
  customAgents: z
    .array(customAgentConfigSchema)
    .max(MAX_CUSTOM_AGENTS, `customAgents must contain at most ${MAX_CUSTOM_AGENTS} agents`)
    .optional(),
  customAgentRootPaths: z
    .array(platformPathSchema)
    .max(
      MAX_PLATFORM_SETTING_ENTRIES,
      `customAgentRootPaths must contain at most ${MAX_PLATFORM_SETTING_ENTRIES} paths`,
    )
    .optional(),
  disabledPlatformIds: platformIdArraySchema.optional(),
  customSkillPlatformPaths: platformPathRecordSchema.optional(),
  skillPlatformOrder: platformIdArraySchema.optional(),
  skillProjects: z
    .array(skillProjectSchema)
    .max(MAX_SKILL_PROJECTS, `skillProjects must contain at most ${MAX_SKILL_PROJECTS} projects`)
    .optional(),
  lastManualBackupAt: lastManualBackupAtSchema.optional(),
  lastManualBackupVersion: lastManualBackupVersionSchema.optional(),
  updateChannel: z.enum(['stable', 'preview']).optional(),
  launchAtStartup: z.boolean().optional(),
  minimizeOnLaunch: z.boolean().optional(),
  sync: syncSettingsSchema.optional(),
  device: deviceSettingsSchema.optional(),
});

const settingsPreferencePatchSchema = settingsPreferenceSchema.extend({
  sync: syncSettingsPatchSchema.optional(),
});

export const updateSettingsSchema = z
  .object({
    theme: z.enum(['light', 'dark', 'system']).optional(),
    language: z.enum(['en', 'zh', 'zh-TW', 'ja', 'fr', 'de', 'es']).optional(),
    autoSave: z.boolean().optional(),
  })
  .merge(settingsPreferencePatchSchema)
  .strict();

const importedSettingsPreferenceSchema = settingsPreferenceSchema.extend({
  defaultFolderId: z.string().trim().min(1).optional(),
});

export const importedSettingsSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']),
  language: z.enum(['en', 'zh', 'zh-TW', 'ja', 'fr', 'de', 'es']),
  autoSave: z.boolean(),
  ...importedSettingsPreferenceSchema.shape,
  security: z.object({
    masterPasswordConfigured: z.boolean(),
    unlocked: z.boolean(),
  }).optional(),
});
