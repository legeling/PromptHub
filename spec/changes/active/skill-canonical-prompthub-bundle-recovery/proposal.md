# 修复：canonical skill bundle 对 `.prompthub` 用户目录的读取豁免与覆盖重建

## 背景 / 现象

在 Windows 桌面端，多个技能（`agent-prompt-engineering`、`resume-builder`、
`prompt-composer`）导入/更新持续报

```
skill:update  Error: resource bundle contains undeclared directory: .prompthub
```

出错栈稳定落在 `hydrateCanonicalSkillWorkspace -> readSkillResourceBundle ->

readResourceBundle -> inventoryBundle -> inspectInventoryEntry`。

## 根因

`readResourceBundle` 的库存校验把所有目录都要求必须来自
`manifest.payloadFiles`（`declaredDirectories`）。技能 canonical bundle
（`data/skills/<id>/`）磁盘里若残留一个未在清单内声明、且当前收集逻辑不会再
写入的 `.prompthub` 目录（用户态 sidecar，按 CLI `INTERNAL_REPO_DIRS` 本属
内部目录），`inspectInventoryEntry` 即抛 `undeclared directory`。由于
publish/update/restore 每一步都会先读取现有 bundle，这一读失败使整个技能对
象无法通过 update 自动恢复。

同时还确认：`canonical-skill-library.collectPackageFiles` 的
`IGNORED_ROOTS` 缺少 `.prompthub`（此前只忽略 `.git` / `.package-lifecycle`），
因此用带 `.prompthub` 的源码目录重新发布时，会被一起收进 payload/树。

## 修复（本变更）

1. `packages/core/src/canonical-skill-library.ts`：把 `.prompthub` 加入
   `IGNORED_ROOTS`（顶层忽略），使新发布不再把用户态 sidecar 收进 bundle。
2. `packages/core/src/skill-resource-schema.ts` `validatePackagePath`：把顶层
   `.prompthub` 段视为不安全（与 `.git` 一致），对直接依赖旧 bundle 回退收集
   的路径做防护。
3. `packages/core/src/resource-bundle.ts`：给 `readResourceBundle` 增加只读语义
   的可选 `ignoredDirectories`；遇到这些目录时整体跳过该子树（不报
   `undeclared`、不纳入 payload 集合）。清单若仍引用其内文件则照常以
   `missing payload` 失败，安全性不放松。
4. `packages/core/src/skill-resource-schema.ts` `readSkillResourceBundle`：仅技能读
   路径传 `ignoredDirectories: [".prompthub"]`；prompts/rules/mcp/… 等复用的通用
   校验默认不传，行为与之前一致。

## 自愈路径

已污染（含 `.prompthub` 残留的）既有 bundle 改为可被读取；用户下一次对技能
执行 update 会触发整目录替换式重新发布（stage 全新、目标整体替换并把旧目录随
prior 清理），从而清除 `.prompthub` 残留并恢复技能。无需手工清理或一次性迁移。

## 影响面

- 仅涉及技能 canonical bundle 的读/发布与一个纯 optional 选项。
- 其余 domain（prompts/rules/mcp/…）的通用 resource bundle 校验默认不受影响。
- 不改动历史数据布局；旧的合法 bundle 内容仍可读。

## 回滚

当前分支直接 revert 上述四处改动即可；因为 `.prompthub` 不再被写入新 bundle
（第 1、2 条）属行为演进，回滚会让新发布再次把该 sidecar 收进（若源码仍含），
但与历史行为一致。读取忽略为增量只读宽容，不会损坏既有数据。
