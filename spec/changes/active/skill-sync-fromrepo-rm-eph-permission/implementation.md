# Implementation — canonical skill workspace replacement (EPERM-safe, main-branch structure)

Branch: feat/my-skills-tag-search（同一 commit 内含本 change 的存档与源码实现）
Status: implemented, verified (typecheck + core tests); Windows transient-file
acceptance runs on-device.

## 现象 / 根因

`skill:syncFromRepo`（及 create/update 触发的 hydrate）会在替换
`cache/skill-workspaces/<skillId>` 时，对旧 `workspacePath` 做替换。Windows 下
当旧树内容被占用（短时句柄/杀软/索引器、或目录本身被限制）时，替换会抛
`EPERM`，导致 `skill:update` / `syncFromRepo` 整体失败（也就表现为“添加标签
保存后报错”）。

两次尝试：

1. 最初（`610da86b`）改成 **rename-first**：先把旧 `workspacePath` rename 到
   `.prior-*`，再把新树 rename 回原位。**该方案在 Windows 上造成回归**：把一个
   含被占用文件的目录整体 `rename` 走，比直接删除更容易抛 `EPERM: rename`（用户
   在 2cf2af5e 技能上实测复现）。
2. 最终回退到 **main 原版结构**（`rm -rf` 旧树 → `rename` 新树进原位），并给
   旧树删除加短暂占用重试。这是原仓库已验证可工作的结构，避免 rename-first
   引入的回归。

## 最终改动

`packages/core/src/canonical-skill-library.ts`：

- `isTransientOwnershipCode`：识别 EPERM/EBUSY。
- `syncWaitMs`：用 `Atomics.wait`（与 `database-migration-intent.ts` 同款）做
  短暂同步背退，供短时占用重试。
- `removeDeprecatedTree`：仅对废弃/stage 树做 best-effort 删除（短暂占用失败
  不抛），供残留 stage 清理。
- `removeOwnedTreeWithRetry`：删除旧 `workspacePath`（`rmSync` + 短暂占用
  重试 50/100/150/200/250ms）；若持续失败仍抛（让调用方恢复/重试）。
- `replaceOwnedWorkspace`：**main 原版结构** —— 若目标已存在则
  `removeOwnedTreeWithRetry(workspacePath)`，再 `renameSync(stagedPath,
  workspacePath)`。**不再把旧目录 rename 走**，避免 Windows 上 rename 被占用
  目录的 EPERM 回归。
- `hydrateCanonicalSkillWorkspace`：stage 用时间戳后缀、保证父目录存在、finally
  tolerant 清理 stage。

关键不变量：替换逻辑与 main 基线一致（不 rename 旧树），仅对旧树删除加了短暂
占用重试；持续占用仍会以可诊断错误上抛，交给调用方恢复。

## 验证

- `packages/core` `tsc --noEmit` → 通过（无输出）。
- `canonical-skill-db.test.ts` → 6 passed / 1 failed（“restores pending row…”
  为 Windows 宿主 `fs.symlinkSync` EPERM，环境既有问题，与本次改动无关）。

## 已知未决 / 设备验收

- 若该技能在 Windows 上仍出现替换失败，且 `removeOwnedTreeWithRetry` 重试窗口
  内无法释放，说明是**持续占用**（并非短时扫描）。此时请确认是否有编辑器/
  其它进程长期打开 `cache/skill-workspaces/<id>` 下的文件；若确为持续占用，
  下一步考虑“workspace 刷新失败不阻断已保存到 DB 的标签”的降级方案（涉及 DB
  事务边界，需另行确认）。
- 剩余断言（`rmSync` 删除重试、`renameSync` 新树就位）随既有回归纳入。
