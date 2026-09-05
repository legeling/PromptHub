# Tasks — skill-sync-fromrepo-rm-eph-permission

- [x] 定位：Windows 下替换 `cache/skill-workspaces/<id>` 时 `EPERM`，导致
      `syncFromRepo`/`update`（含“添加标签”保存）失败。
- [x] 尝试一：rename-first（旧树 rename 到 `.prior-*`）。**发现 Windows
      回归**：rename 一个含占用文件的目录更易 EPERM，用户实测复现。
- [x] 尝试二（最终）：回退到 **main 原版结构** —— `rmSync` 删旧树 +
      `renameSync` 放新树；给 `rmSync` 加短暂占用重试（50/100/150/200/250ms）。
- [x] 实现：`replaceOwnedWorkspace`/`removeOwnedTreeWithRetry`/`syncWaitMs`/
      `isTransientOwnershipCode`/`removeDeprecatedTree` 落地；移除 rename-first
      相关 helper。
- [x] `packages/core` typecheck 通过；canonical-skill-db 6 passed（1 failure 为
      Windows `fs.symlinkSync` 环境问题，与本改动无关）。
- [x] `out/main` 重建完成（vite build）。
- [ ] 设备验收（仍在）：Windows 上添加标签 / syncFromRepo 不再 EPERM；若仍
      失败且为重试窗口内的持续占用，则考虑“workspace 刷新失败不阻断已存 DB
      标签”的降级方案（需另行确认）。
