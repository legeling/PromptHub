# Design — EPERM-safe canonical skill workspace replacement (final)

Status: implemented. The earlier rename-first design was rejected after a
Windows regression and reverted to the main-branch structure.

## Current (main-branch) behavior

`hydrateCanonicalSkillWorkspace`（packages/core/src/canonical-skill-library.ts）：
- `fs.rmSync(workspacePath, { recursive: true, force: true })`
- 再 mkdir + 逐个 `COPYFILE_EXCL` + 写 `.canonical-bundle-hash` + `rename` 进。

即先删旧树再建新树；删除若被 Windows 占用（EPERM on a contained file）即整体
失败，并把错误带进 `skill:syncFromRepo`/`restore`。

## 比选（已做）

1. **rename-first（已否决）**：先把旧 `workspacePath` rename 到 `.prior`，再把
   stage rename 成目标。**Windows 实测回归**：把一个含被占用文件的目录整体
   `rename` 走比直接删除更容易抛 `EPERM: rename`，导致“添加标签保存”失败。
2. **main 原版结构 + 短暂占用重试（选定）**：保留 `rmSync` 删旧树 +
   `renameSync` 放新树（与 main 基线一致，`out/main` 已验证可工作），仅给旧树
   `rmSync` 加 50/100/150/200/250ms 的 transient（EPERM/EBUSY）重试，覆盖
   Defender/索引器这类短时扫描。持续占用仍抛，交给调用方恢复。

## Owner / 不改点

- 仅 core `canonical-skill-library` workspace 替换时序；不触碰
  `resource-bundle` 只读完整性校验。
- `packages/shared`/IPC 对外契约不变（sync 结果类型不变）。

## 验证草案 / 已做

- `packages/core` `tsc --noEmit` 通过；canonical-skill-db 6 passed（1 failure 为
  Windows `fs.symlinkSync` 环境问题）。
- 设备验收：Windows 上多次添加标签 / `syncFromRepo` 不再 EPERM。若仍失败且为
  持续占用，转“workspace 刷新失败不阻断已存 DB 标签”的降级方案（另行确认）。
