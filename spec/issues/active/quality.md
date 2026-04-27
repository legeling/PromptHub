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
