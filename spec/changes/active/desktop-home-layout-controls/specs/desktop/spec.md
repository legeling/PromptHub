# Delta Spec

## Added

- 桌面端首页应固定使用新版双栏侧边栏壳层。
- 桌面端首页应允许用户控制 `Prompts`、`Skills`、`Rules` 三个模块的显示顺序与启用状态。
- 桌面端首页已启用模块的顺序调整应通过直接拖拽完成。
- 桌面端首页至少保留一个可见模块，不能把首页工作区配置为空。
- 桌面端首页模块偏好在同版本 localStorage hydrate 时也必须过滤未知模块、去重并保留至少一个可见模块，不能只依赖 zustand `migrate`。
- Sidebar 标签区高度偏好在同版本 localStorage hydrate 时必须过滤非有限、非数字或小于默认最小高度的值，避免标签区不可见或布局被坏持久化状态破坏。

## Modified

- 本地 Skill Source 的 Electron e2e 回归应以“已导入态 + 实际落库”作为导入成功判据，而不是仅依赖瞬时 toast 文案。

## Removed

-

## Scenarios

- 用户禁用当前模块后，首页自动跳转到首个仍可见的模块。
- 用户拖拽已启用模块后，桌面首页左侧 rail 与 panel fallback 都按照新的顺序生效。
