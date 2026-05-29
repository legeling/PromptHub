# Implementation

## Status

- Implemented in desktop main/renderer/store layers.

## What Landed

- `SkillStoreSource` 增加了可选 `branch` / `directory` 字段。
- 新增 Git 商店 source 归一化逻辑：旧的 GitHub `/tree/<branch>/<path>` URL 会在读取/保存时被收口为仓库根 URL + 结构化 branch / directory。
- `loadGitHubSkillRepo()` 现在支持显式 `branch` / `directory`，并按 `branch -> tree URL branch -> default_branch -> main` 的顺序解析目标分支。
- 内置 `openai-codex` source 已改为结构化 branch/directory 配置，而不是把语义塞在 URL 中。
- 添加/编辑自定义 Skill 商店 source 的 UI 已增加 branch / directory 输入。
- 为 `git-repo` source 新增远程分支探测能力：桌面端通过 IPC 调用主进程 `git ls-remote --heads -- <url>` 获取候选分支，并同时支持 HTTPS 与 `git@<host>:owner/repo.git` SSH 仓库。
- `SkillStoreSourceForm` 与 `SkillStoreSourceEditModal` 现在会对 GitHub/SSH 仓库展示远程分支建议列表，同时保留手动输入 branch 的兜底路径；失败时给出降级提示而不是阻断保存。
- 自定义 source 列表与 source header hint 会展示当前 branch / directory。
- 修复了 GitHub `.../tree/<branch>/<path>` 网页地址在分支探测链路中的兼容性问题：renderer 侧会先归一化为仓库根地址再请求 IPC，main 侧的 `gitListRemoteBranches()` / `gitClone()` 也会再次兜底归一化，避免 `git ls-remote` / `git clone` 直接命中网页 URL 而返回 code 128。
- 调整了分支建议排序：当远程分支较多时，会优先显示当前输入分支、`main`、`master`，避免默认分支因字母序排位靠后而被前 12 条截断。
- 优化了分支建议 UI：当前已选 branch 不再同时出现在输入框和候选列表中，候选区新增了本地化标题，避免出现“看起来像重复 main”的混乱状态。
- 补齐了 `skill` 命名空间下的 branch/directory 相关多语言文案，修复此前因为键放错命名空间而回退到英文 placeholder / hint 的问题。
- 顺手修复了备份导入中的一个 folder 恢复问题：当备份文件里的文件夹数组不是父级在前、子级在后时，原来的恢复逻辑会直接按数组顺序调用 `folder:insertDirect`，导致 `parent_id` 外键约束失败。现在会在恢复前按父子依赖排序，保证父文件夹优先恢复。
- 继续加固了备份导入可靠性：文件导入的宽容清洗逻辑现在会主动移除坏的 folder `parentId` 引用和 prompt `folderId` 引用，避免历史备份中的残缺引用在恢复阶段再次触发外键失败。
- 优化了导入失败文案：导入 controller 不再直接把底层 `SQLite3Error` / IPC 英文异常原样暴露给用户，而是转换成更可理解的中文错误提示，优先说明“备份格式不支持 / 备份为空 / 结构损坏 / 引用关系损坏 / 部分附件恢复失败”等场景。

## Verification

- Passed: `pnpm --filter @prompthub/desktop exec vitest run tests/unit/services/skill-store-source.test.ts`
- Passed: `pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/skill-store-remote.test.tsx`
- Passed: `pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/skill-store-custom-sources.test.tsx`
- Passed: `pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/skill-store-custom-sources.test.tsx`
- Passed: `pnpm --filter @prompthub/desktop exec vitest run tests/unit/stores/skill.store.test.ts`
- Passed: `pnpm --filter @prompthub/desktop exec vitest run tests/unit/main/skill-installer-utils.test.ts tests/unit/components/skill-store-custom-sources.test.tsx tests/unit/components/skill-store-remote.test.tsx tests/unit/services/skill-store-source.test.ts tests/unit/stores/skill.store.test.ts`
- Passed: `pnpm --filter @prompthub/desktop exec vitest run tests/unit/main/skill-installer-utils.test.ts tests/unit/components/skill-store-custom-sources.test.tsx`
- Passed: `pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/skill-store-custom-sources.test.tsx`
- Passed: `pnpm --filter @prompthub/desktop exec eslint src/renderer/components/skill/SkillStore.tsx src/renderer/components/skill/SkillStoreSourceForm.tsx src/renderer/components/skill/SkillStoreSourceEditModal.tsx src/renderer/components/skill/SkillStoreCustomSources.tsx src/renderer/components/skill/store-remote-sync.ts src/renderer/services/github-skill-store.ts src/renderer/services/skill-store-source.ts src/renderer/stores/skill.store.ts tests/unit/services/skill-store-source.test.ts tests/unit/components/skill-store-remote.test.tsx tests/unit/components/skill-store-custom-sources.test.tsx`
- Passed: `pnpm --filter @prompthub/desktop exec eslint src/main/services/skill-installer-utils.ts src/main/services/skill-installer.ts src/main/ipc/skill/platform-handlers.ts src/preload/api/skill.ts src/renderer/components/skill/SkillStore.tsx src/renderer/components/skill/SkillStoreSourceForm.tsx src/renderer/components/skill/SkillStoreSourceEditModal.tsx src/renderer/components/skill/SkillStoreCustomSources.tsx src/renderer/components/skill/store-remote-sync.ts src/renderer/services/github-skill-store.ts src/renderer/services/skill-store-source.ts src/renderer/stores/skill.store.ts tests/unit/main/skill-installer-utils.test.ts tests/unit/components/skill-store-custom-sources.test.tsx tests/unit/components/skill-store-remote.test.tsx tests/unit/services/skill-store-source.test.ts tests/unit/stores/skill.store.test.ts`
- `pnpm --filter @prompthub/desktop typecheck` still fails, but failures are pre-existing and unrelated to this change (current errors are in `settings/SkillSettings.tsx`, `settings.store.ts`, `SkillProjectsView.tsx`, and `rule-platform-order.ts`).

## Notes

- 远程分支选择目前采用“建议列表 + 文本输入”轻量交互，没有引入新的复杂 Select/Combobox 组件；这样可以兼容探测失败、私有仓库权限不足和非统一 provider 的场景。
- `gitListRemoteBranches()` 与 `gitClone()` 统一改为通过 `child_process.spawn` 命名空间调用，避免测试环境下 mock 失效并触发真实 git 子进程。
