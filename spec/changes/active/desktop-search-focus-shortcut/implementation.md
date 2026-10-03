# Implementation: desktop-search-focus-shortcut

## 实际落地
- `App.tsx` handleKeyDown：localShortcuts 匹配循环加 `matchedUserShortcut` 标记；未命中时 Ctrl/Cmd+F（无 Shift/Alt）→ preventDefault + dispatch 既有 `shortcut:search`。用户若已把任意动作配到 Ctrl+F，兜底让位。
- `TopBar.tsx`：`handleSearch` 追加 `select()`（聚焦即全选可改词）；prompt 上下文 placeholder 换 `header.searchWithShortcut`（{{key}} 按平台 ⌘F/Ctrl+F）。
- 焦点态：搜索框已有 `focus:ring-2 focus:ring-primary/30`，无需新增。

## 偏差
- TEST-KB-001（Ctrl+F 键位单测）以验证替代记录（见 tasks.md）；TEST-KB-002 通过 top-bar.test.tsx 断言更新覆盖（`/^Search prompts/` 前缀匹配）。
- 事件链复用零新增：`shortcut:search` → TopBar focus 为既有通路。

## 验证
- top-bar 两文件 29/29；全套基线对照零新增回归；i18n 键 × 7 核验通过。
