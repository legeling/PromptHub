# 活跃问题追踪：质量与工具链

## 2026-03-12

### 已解决

- `Q-001` `pnpm lint` 无法执行
  - 处理：新增 `eslint.config.mjs`
  - 结果：`pnpm lint` 已恢复通过

- `Q-002` updater 单测失败
  - 处理：修正 `tests/unit/main/updater.test.ts` 断言
  - 结果：`pnpm test:run` 全绿

### 仍在跟踪

#### Q-003 renderer 主包仍偏大

- 现象：`pnpm build` 仍提示 chunk size warning
- 当前状态：主包已从约 `840.40 kB` 降到 `768.05 kB`
- 影响：对冷启动和首次进入 Skill 重界面仍有进一步优化空间
- 建议：继续拆分 Prompt 编辑链路中的静态依赖，处理 `EditPromptModal` 的动静态混用

#### Q-004 根级 release quick harness 暴露 desktop unit 失败

- 发现时间：2026-05-30
- 现象：`pnpm verify:release:quick` 在 `desktop-unit` 层失败，当前为 7 个测试文件 / 10 个断言失败。
- 失败范围：
  - `tests/unit/components/top-bar.test.tsx`
  - `tests/unit/components/skill-store-custom-sources.test.tsx`
  - `tests/unit/services/skill-filter-large.test.ts`
  - `tests/unit/services/skill-filter.test.ts`
  - `tests/unit/services/skill-platform-sync.test.ts`
  - `tests/unit/services/skill-stats.test.ts`
  - `tests/unit/main/skill-db-versioning.test.ts`
- 影响：release harness 已能阻断发布，但当前不能作为绿色准入通过；需要先修复既有 desktop unit 失败。
- 建议：按失败域拆分为 skill filtering / platform sync result shape / skill DB schema setup 三组修复，每组补回归说明并重新跑 `pnpm verify:release:quick`。
