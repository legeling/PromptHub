# Implementation: desktop-startup-folder-restore

## 实际落地
- settings store：`startupFolderMode`（default/last/pinned，默认 default）、`pinnedStartFolderId`、`lastActiveFolderId`（types/defaults/general-actions/normalsizer/persistence merge+migrate 共用 `normalizeStartupFolderSettings`）。
- `folder.store.selectFolder` 成功激活非空文件夹后调用 `recordLastActiveFolder(id)`；选择"全部"（null）不覆盖记忆。
- 新 hook `renderer/hooks/useStartupFolderRestore.ts`：folders 首次非空后按模式恢复一次；目标缺失静默回落；`ref` 防重入，经 `selectFolder` 同一 action 路径。
- `App.tsx` 单行挂载 hook。
- 设置页 GeneralSettings"启动"区：模式三选一 Select + pinned 时目标文件夹 Select；i18n 新键 8 × 7 locale。

## 设计偏差（范围修正，需知悉）
- FR-STARTUP-002 原文含"侧栏文件夹右键菜单项"。实测仓库侧栏文件夹项无 context menu 先例（操作走 hover 按钮组），新增右键容器属于引入新交互框架，超出本期"增量、不动交互结构"边界；以设置页 pinned 下拉作为等效入口，覆盖 #74 全部诉求。右键直达可作后续迭代。
- `design.md` 记 pinned 模式不改写 last：实现简化为无条件记录 last（语义一致且模式切换无需补救写入）。

## 兼容与回滚
- 默认 mode=default：启动路径与 0.6.1 逐位一致（restore hook 空转）。
- 纯 localStorage 本地偏好：不进 DB/备份/同步 payload、IPC 零改动。同版本坏值由 merge normalizer 清洗（对齐既有 hydration 规范）。

## 验证
- `settings-startup-folder.test.ts`（normalizer 3 组 + setters 4 组，12 用例含 5 文件合计）；`use-startup-folder-restore.test.ts`（default/last/pinned/缺失/单次共 5 用例）全绿。
- 全套 desktop 回归与基线文件集合一致，零新增失败。

## v0.6.3 追加：FR-STARTUP-005 恢复可见反馈
- `useStartupFolderRestore(notify?)` 改依赖注入（App 传 `showToast`），恢复成功 info toast（含文件夹名插值）、目标缺失 warning toast；default 模式零提示不打扰。
- 设置页 pinned 目标下拉：失效 id 显示"（已不存在）"项而非静默消失，用户可直接重选。
- i18n 新键 3（startupFolderRestored/Missing/TargetMissing）× 7 locale。
- hook 测试新增 3 用例（成功通知含名/失效警告/default 静默），8/8 全绿。
