import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [sourceRoot, profile, label, action, resultPath] = process.argv.slice(2);
assert.ok(path.isAbsolute(sourceRoot) && path.isAbsolute(profile));
const load = (relative) => import(pathToFileURL(path.join(sourceRoot, relative)).href);
const paths = await load('packages/core/src/runtime-paths.ts');
paths.configureRuntimePaths({ userDataPath: profile, appDataPath: path.join(profile, 'app-data') });
assert.equal(paths.getUserDataPath(), profile);
const core = await load('packages/core/src/database.ts');
const { createCliSkillService } = await load('packages/core/src/cli/skill-cli-service.ts');
const { createRulesWorkspaceService } = await load('packages/core/src/rules-workspace.ts');
const { CoreAIConfigService } = await load('packages/core/src/ai-config.ts');
const { CorePluginLibraryService } = await load('packages/core/src/plugin-library.ts');
const { CoreMcpLibraryService } = await load('packages/core/src/mcp-library.ts');
const dbPackage = await load('packages/db/src/index.ts');
const skillService = createCliSkillService();
const settings = new CoreAIConfigService();
const plugins = new CorePluginLibraryService();
const mcp = new CoreMcpLibraryService();
const ruleId = 'project:historical-source';
const firstText = 'Historical first prompt — 中文 🦌\n{{topic}}';
const nextText = 'Historical updated prompt — 中文 🦌\n{{topic}}';
const notes = 'Non-secret notes: quote " and newline\nretained';
const response = 'Synthetic AI response — no provider was called';
const skillText = '---\nname: historical-skill\ndescription: Synthetic source fixture\nversion: 1.0.0\n---\n\n# Historical Skill\nKeep package files.\n';
let database;

function rules() {
  return createRulesWorkspaceService({
    getRulesDir: paths.getRulesDir,
    createRuleDb: () => new core.RuleDB(database),
    getPlatformGlobalRulePath: () => null,
    getPlatformRootDir: (platform) => path.join(profile, 'agent-homes', platform.id),
  });
}

function seedPrompts() {
  const folder = new core.FolderDB(database).create({ name: 'Historical folder', icon: 'Folder' });
  const prompts = new core.PromptDB(database);
  const first = prompts.create({ title: 'Historical primary', userPrompt: firstText, folderId: folder.id, notes, tags: ['fixture'], variables: [] });
  const target = prompts.create({ title: 'Historical output', userPrompt: 'Return JSON with a title.' });
  prompts.update(first.id, { userPrompt: nextText, lastAiResponse: response });
  prompts.createVersion(first.id, 'Historical content revision');
  new core.PromptRelationDB(database).create({ sourcePromptId: first.id, targetPromptId: target.id, kind: 'related_to', note: 'Historical relation' });
  new core.PromptOutputFormatDB(database).create({ sourcePromptId: first.id, targetPromptId: target.id });
}

async function seedSkillAndRules() {
  const source = path.join(profile, 'fixture-inputs', 'skill');
  fs.mkdirSync(path.join(source, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(source, 'SKILL.md'), skillText);
  fs.writeFileSync(path.join(source, 'docs', 'guide.md'), 'Historical guide bytes\n');
  fs.writeFileSync(path.join(source, 'docs', 'pixel.bin'), Buffer.from([0, 255, 16, 128]));
  const skillDb = new core.SkillDB(database);
  const id = await skillService.installFromSource(source, skillDb);
  await skillService.createVersion(skillDb, id, 'Historical original package');
  await skillService.writeLocalFile(skillDb, id, 'docs/guide.md', 'Updated historical guide bytes\n');
  await skillService.createVersion(skillDb, id, 'Historical package revision');
  const project = path.join(profile, 'fixture-inputs', 'rule-project');
  fs.mkdirSync(project, { recursive: true });
  fs.writeFileSync(path.join(project, 'AGENTS.md'), 'Historical original rules\n');
  await rules().createProjectRule({ id: 'historical-source', name: 'Historical rules', rootPath: project });
  await rules().saveRuleContent(ruleId, 'Historical updated rules — 中文\n');
}

function seedSettings() {
  settings.write({
    kind: 'prompthub-ai-config', version: 1, updatedAt: '2026-01-01T00:00:00.000Z',
    providers: [{ id: 'fixture-provider', provider: 'openai', apiProtocol: 'openai', apiKey: '', apiUrl: 'https://fixture.invalid/v1' }],
    models: [{ id: 'fixture-model', providerId: 'fixture-provider', provider: 'openai', apiProtocol: 'openai', apiKey: '', apiUrl: 'https://fixture.invalid/v1', type: 'chat', model: 'synthetic-model' }],
    modelRouteDefaults: { mainText: 'fixture-model' },
  });
}

function seedBetaDomains() {
  if (label === 'v0.5.9') return;
  const profiles = new dbPackage.AgentProviderProfileDB(database);
  for (const name of label === 'beta.2' ? ['Historical provider', 'Historical provider'] : ['Historical provider', 'Historical alternate']) {
    profiles.createProfile({ platformId: 'codex', name, providerKind: 'openai-compatible', protocol: 'responses', endpoint: 'https://fixture.invalid/v1', config: { model: 'synthetic-model' }, source: 'manual' });
  }
  const source = path.join(profile, 'fixture-inputs', 'plugin');
  fs.mkdirSync(path.join(source, '.codex-plugin'), { recursive: true });
  fs.mkdirSync(path.join(source, 'skills', 'writer'), { recursive: true });
  fs.mkdirSync(path.join(source, 'commands'), { recursive: true });
  fs.writeFileSync(path.join(source, '.codex-plugin', 'plugin.json'), JSON.stringify({ name: 'historical-plugin', version: '1.0.0', description: 'Synthetic historical package' }));
  fs.writeFileSync(path.join(source, 'skills', 'writer', 'SKILL.md'), skillText);
  fs.writeFileSync(path.join(source, 'skills', 'writer', 'pixel.bin'), Buffer.from([0, 255, 16, 128]));
  fs.writeFileSync(path.join(source, 'commands', 'review.md'), 'Synthetic historical review command\n');
  const installed = plugins.importLocalPluginPackage({ sourcePath: source, sourceTargetId: 'codex', sourceTargetName: 'Synthetic Codex' });
  plugins.createPluginVersion(installed.plugin.id, 'Historical package version');
  const server = mcp.createServer({ name: 'historical-mcp', transport: 'stdio', command: 'fixture-command', args: ['--synthetic'], env: { FIXTURE_LABEL: 'non-secret' } });
  mcp.updateServer(server.id, { ...server, description: 'Updated historical MCP config' });
}

function observeBetaDomains() {
  if (label === 'v0.5.9') return {};
  const profiles = new dbPackage.AgentProviderProfileDB(database).listProfiles().sort((left, right) => left.id.localeCompare(right.id));
  assert.equal(profiles.length, 2);
  if (label === 'beta.2') assert.equal(profiles[0].name, profiles[1].name);
  const library = plugins.read();
  assert.equal(library.plugins.length, 1);
  const versions = plugins.getPluginVersions(library.plugins[0].id);
  assert.ok(versions.length >= 1);
  assert.deepEqual(fs.readFileSync(path.join(library.plugins[0].localPackagePath, 'skills/writer/pixel.bin')), Buffer.from([0, 255, 16, 128]));
  const config = mcp.read();
  assert.equal(config.servers[0].description, 'Updated historical MCP config');
  return { profiles, pluginLibrary: library, pluginVersions: versions, mcp: config };
}

async function observe() {
  const prompts = new core.PromptDB(database);
  const entries = prompts.getAll().sort((left, right) => left.title.localeCompare(right.title));
  const primary = entries.find((item) => item.title === 'Historical primary');
  assert.equal(primary.userPrompt, nextText);
  assert.equal(primary.notes, notes);
  assert.equal(primary.lastAiResponse, response);
  const promptVersions = prompts.getVersions(primary.id);
  assert.ok(promptVersions.length >= 2);
  const skillDb = new core.SkillDB(database);
  const skill = skillDb.getAll()[0];
  assert.deepEqual(fs.readFileSync(path.join(skill.local_repo_path, 'docs/pixel.bin')), Buffer.from([0, 255, 16, 128]));
  const files = await skillService.listLocalFiles(skillDb, skill.id);
  assert.ok(skillDb.getVersions(skill.id).length >= 2);
  assert.ok(files.some((file) => file.path === 'docs/pixel.bin'));
  const guide = await skillService.readLocalFile(skillDb, skill.id, 'docs/guide.md');
  assert.equal(guide.content, 'Updated historical guide bytes\n');
  const rule = await rules().readRuleContent(ruleId);
  assert.equal(rule.content, 'Historical updated rules — 中文\n');
  assert.ok(rule.versions.length >= 2);
  assert.equal(settings.read().providers[0].apiKey, '');
  return {
    prompts: entries, promptVersions, folders: new core.FolderDB(database).getAll(),
    relations: new core.PromptRelationDB(database).list(), formats: new core.PromptOutputFormatDB(database).list(),
    skill, skillVersions: skillDb.getVersions(skill.id), skillFiles: files,
    rule: { id: rule.id, content: rule.content, versions: rule.versions }, settings: settings.read(),
    ...observeBetaDomains(),
  };
}

try {
  database = core.initDatabase();
  assert.ok(paths.getDatabasePath().startsWith(profile + path.sep));
  if (action === 'seed') {
    seedPrompts();
    await seedSkillAndRules();
    seedSettings();
    seedBetaDomains();
  } else assert.equal(action, 'reopen');
  const result = await observe();
  fs.writeFileSync(resultPath, JSON.stringify({ label, action, databasePath: paths.getDatabasePath(), result }, null, 2));
} finally {
  core.closeDatabase();
  paths.resetRuntimePaths();
}
