import path from "path";

import { rewriteRuleWithAi } from "../rules-rewrite";
import { coreRulesWorkspaceService } from "../rules-workspace-default";
import { CliError, EXIT_CODES, type CliContext } from "./types";
import { RULES_HELP } from "./help";
import { emitSuccess, toJson } from "./io";
import {
  ensureNoUnknownOptions,
  optionalPositional,
  parseRulesBundle,
  readTextOption,
  readRequiredTextFile,
  requirePositional,
  takeFlag,
  takeOption,
  writeRequiredTextFile,
} from "./args";
import {
  createRulesBundle,
  formatRuleVersionSnapshot,
  normalizeProjectId,
  resolveRuleRewriteArgs,
  resolveRulesFileOption,
  ruleTableRows,
  ruleVersionTableRows,
} from "./rules-utils";
import { resolveRuleIdentifier } from "./select";

export async function handleRulesCommand(
  args: string[],
  context: CliContext,
): Promise<void> {
  if (args.length === 0 || takeFlag(args, "--help") || takeFlag(args, "-h")) {
    context.io.stdout(RULES_HELP);
    return;
  }

  await coreRulesWorkspaceService.bootstrapRuleWorkspace();
  const action = requirePositional(args, 0, "rules 子命令");

  if (action === "list") {
    ensureNoUnknownOptions(args.slice(1));
    const rules = await coreRulesWorkspaceService.listCachedRuleDescriptors();
    emitSuccess(context, rules, ruleTableRows(rules));
    return;
  }

  if (action === "scan") {
    ensureNoUnknownOptions(args.slice(1));
    const rules = await coreRulesWorkspaceService.scanRuleDescriptors();
    emitSuccess(context, rules, ruleTableRows(rules));
    return;
  }

  if (action === "read") {
    const identifier = optionalPositional(args, 1);
    const ruleId = await resolveRuleIdentifier(context, identifier);
    ensureNoUnknownOptions(args.slice(identifier ? 2 : 1));
    emitSuccess(
      context,
      await coreRulesWorkspaceService.readRuleContent(ruleId),
    );
    return;
  }

  if (action === "versions") {
    const ruleId = await resolveRuleIdentifier(
      context,
      requirePositional(args, 1, "rule id 或 name"),
    );
    ensureNoUnknownOptions(args.slice(2));
    const rule = await coreRulesWorkspaceService.readRuleContent(ruleId);
    emitSuccess(context, rule.versions, ruleVersionTableRows(rule.versions));
    return;
  }

  if (action === "version-read") {
    const ruleId = await resolveRuleIdentifier(
      context,
      requirePositional(args, 1, "rule id 或 name"),
    );
    const versionId = requirePositional(args, 2, "version id");
    ensureNoUnknownOptions(args.slice(3));
    const rule = await coreRulesWorkspaceService.readRuleContent(ruleId);
    const version = rule.versions.find((item) => item.id === versionId);
    if (!version) {
      throw new CliError(
        "NOT_FOUND",
        `Rule 版本不存在: ${ruleId}@${versionId}`,
        EXIT_CODES.NOT_FOUND,
      );
    }
    emitSuccess(context, formatRuleVersionSnapshot(version));
    return;
  }

  if (action === "version-restore") {
    const ruleId = await resolveRuleIdentifier(
      context,
      requirePositional(args, 1, "rule id 或 name"),
    );
    const versionId = requirePositional(args, 2, "version id");
    ensureNoUnknownOptions(args.slice(3));
    const rule = await coreRulesWorkspaceService.readRuleContent(ruleId);
    const version = rule.versions.find((item) => item.id === versionId);
    if (!version) {
      throw new CliError(
        "NOT_FOUND",
        `Rule 版本不存在: ${ruleId}@${versionId}`,
        EXIT_CODES.NOT_FOUND,
      );
    }
    emitSuccess(
      context,
      await coreRulesWorkspaceService.saveRuleContent(ruleId, version.content),
    );
    return;
  }

  if (action === "save") {
    const ruleId = await resolveRuleIdentifier(
      context,
      requirePositional(args, 1, "rule id 或 name"),
    );
    const saveArgs = args.slice(2);
    const content = readTextOption(saveArgs, "--content", "--content-file");
    ensureNoUnknownOptions(saveArgs);

    if (content === undefined) {
      throw new CliError(
        "USAGE_ERROR",
        "rules save 需要 --content 或 --content-file",
        EXIT_CODES.USAGE,
      );
    }

    emitSuccess(
      context,
      await coreRulesWorkspaceService.saveRuleContent(ruleId, content),
    );
    return;
  }

  if (action === "rewrite") {
    const ruleId = await resolveRuleIdentifier(
      context,
      requirePositional(args, 1, "rule id 或 name"),
    );
    const rule = await coreRulesWorkspaceService.readRuleContent(ruleId);
    const rewritePayload = resolveRuleRewriteArgs(
      args.slice(2),
      rule.content,
      rule.name,
      rule.platformName,
    );
    emitSuccess(context, await rewriteRuleWithAi(rewritePayload));
    return;
  }

  if (action === "add-project" || action === "project-init") {
    const addArgs = args.slice(1);
    const rootPath = path.resolve(
      takeOption(addArgs, "--root-path") ?? process.cwd(),
    );
    const name =
      takeOption(addArgs, "--name")?.trim() ||
      path.basename(rootPath) ||
      "Project";
    const id = takeOption(addArgs, "--id");
    ensureNoUnknownOptions(addArgs);

    if (!name || !rootPath.trim()) {
      throw new CliError(
        "USAGE_ERROR",
        "rules project-init 需要有效的项目名称和根目录",
        EXIT_CODES.USAGE,
      );
    }

    emitSuccess(
      context,
      await coreRulesWorkspaceService.createProjectRule({
        ...(id?.trim() && { id: id.trim() }),
        name,
        rootPath,
      }),
    );
    return;
  }

  if (action === "remove-project") {
    const projectId = requirePositional(args, 1, "project id");
    ensureNoUnknownOptions(args.slice(2));
    const normalizedProjectId = normalizeProjectId(projectId);
    await coreRulesWorkspaceService.removeProjectRule(normalizedProjectId);
    emitSuccess(context, {
      removed: true,
      projectId: normalizedProjectId,
    });
    return;
  }

  if (action === "version-delete") {
    const ruleId = await resolveRuleIdentifier(
      context,
      requirePositional(args, 1, "rule id 或 name"),
    );
    const versionId = requirePositional(args, 2, "version id");
    ensureNoUnknownOptions(args.slice(3));
    const versions = await coreRulesWorkspaceService.deleteRuleVersion(
      ruleId,
      versionId,
    );
    emitSuccess(context, versions, ruleVersionTableRows(versions));
    return;
  }

  if (action === "export") {
    const exportArgs = args.slice(1);
    const filePath = resolveRulesFileOption(exportArgs, "export");
    ensureNoUnknownOptions(exportArgs);

    const records = await coreRulesWorkspaceService.exportRuleBackupRecords();
    const bundle = createRulesBundle(records);
    writeRequiredTextFile(filePath, toJson(bundle));
    emitSuccess(context, {
      exported: true,
      filePath: path.resolve(filePath),
      records: records.length,
    });
    return;
  }

  if (action === "import") {
    const importArgs = args.slice(1);
    const filePath = resolveRulesFileOption(importArgs, "import");
    const replace = takeFlag(importArgs, "--replace");
    ensureNoUnknownOptions(importArgs);

    const bundle = parseRulesBundle(readRequiredTextFile(filePath));
    await coreRulesWorkspaceService.importRuleBackupRecords(bundle.records, {
      replace,
    });
    emitSuccess(context, {
      imported: true,
      filePath: path.resolve(filePath),
      records: bundle.records.length,
      replace,
    });
    return;
  }

  throw new CliError(
    "USAGE_ERROR",
    `不支持的 rules 子命令: ${action}`,
    EXIT_CODES.USAGE,
  );
}
