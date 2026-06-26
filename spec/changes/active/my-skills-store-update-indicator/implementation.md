# Implementation

## Shipped

- 新增 `apps/desktop/src/renderer/components/skill/store-remote-sync.ts`，把远端商店目录加载、缓存和自动同步逻辑抽成共享 hook。
- `SkillStore` 改为复用共享 hook，并继续保持只预加载当前选中远端源的行为，避免无关远端源在首次打开时被全部拉取。
- `SkillManager` 在“我的 Skills”视图接入共享 hook，基于 `remoteStoreEntries` 为商店安装 Skill 计算 `skillsWithStoreUpdates`。
- 更新提示仅对带 `registry_slug` 的 Skill 生效；本地导入/手工创建 Skill 不显示提示。
- `SkillListView` 和 `SkillGalleryCard` 增加轻量 `Update available` 呼吸灯提示，保持列表与画廊视图一致。
- 更新版本判定统一为优先使用 `installed_version`，缺失时回退到 `version`，与现有商店更新语义对齐。
- 修复了实现过程引入的 `SkillManager` hook 顺序回归，并补强相关测试 mock。
- 收紧 `skill-installer` 的默认平台扫描测试，使其默认目录覆盖到临时目录，避免全量测试时扫描真实家目录导致偶发超时。
- 回归修复：商店更新提示不再用裸字符串比较版本号，`0.5.9-beta1` 与 `0.5.9-beta.1` 这类 prerelease 写法会被视为同一版本。
- 回归修复：完整目录同步或 package/git repo 更新后，PromptHub 会同时刷新 `installed_content_hash` 与 `installed_version`，避免用户已更新到最新版本后刷新仍显示“更新”。
- 回归修复：若历史数据已经处于“内容是最新但 baseline hash/version 仍旧”的状态，执行更新检查或更新动作时会自动刷新 baseline，避免坏状态持续存在。
- UI 对齐：`Update available` 不再覆盖卡片左上角图标；My Skills 画廊、列表和 Skill Store 卡片统一使用右侧蓝色 `CardStatusBadge`，避免与图标/内容重叠。

## Verification

- `pnpm --filter @prompthub/desktop test -- --run tests/unit/components/skill-i18n-smoke.test.tsx`
- `pnpm --filter @prompthub/desktop test -- --run tests/unit/components/skill-store-remote.test.tsx`
- `pnpm --filter @prompthub/desktop test -- --run tests/integration/components/skill-manager-large-dataset.integration.test.tsx`
- `pnpm --filter @prompthub/desktop lint`
- `pnpm --filter @prompthub/desktop typecheck`
- `pnpm --filter @prompthub/desktop build`
- `pnpm --filter @prompthub/desktop test -- --run`
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/services/skill-store-update.test.ts`
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/stores/skill.store.test.ts`
- `pnpm --filter @prompthub/desktop exec tsc --noEmit`
- `pnpm --filter @prompthub/desktop exec vitest run --config vitest.config.ts tests/unit/components/skill-view-tags.test.tsx -t "shows readable source badges in gallery cards"`
- `pnpm --filter @prompthub/desktop exec vitest run --config vitest.config.ts tests/unit/components/skill-store-card.test.tsx -t "renders the blue update badge"`
