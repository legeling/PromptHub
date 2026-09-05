# Tasks — prompt-current-version-missing-self-heal

- [x] T-PCV-001（FR-PCV-001）在 `main` 创建修复分支 `fix/prompt-current-version-missing-self-heal`。
- [x] T-PCV-002 建 active change 契约（proposal/spec/storage/spec/design/tasks/implementation）。
- [x] T-PCV-003（FR-PCV-001/002，DES-PCV-001）db 层幂等修复器
      `packages/db/src/prompt-version-consistency.ts`：
      `current_version` 收敛到 `MAX(version)`；无版本行时补 v1 快照并置 1。
- [x] T-PCV-004（FR-PCV-003，DES-PCV-002）startup 接线 `healPromptVersionPointers`
      （SQLite 头探测 + 修复）置于 `prepareSourceDatabase` 之后、`publish` 之前。
- [x] T-PCV-005 单元测试（真实 SQLite）：收敛、补 v1、健康不动、幂等、四种异常（绿）。
- [x] T-PCV-006 desktop `pnpm typecheck`（tsc --noEmit）exit 0；db 包 typecheck exit 0。
- [x] T-PCV-007 eslint（startup + 新测试）exit 0；desktop `pnpm build` exit 0（重新产出 `out/main/index.js`）。
- [ ] T-PCV-008 用户本机用真实坏库确认后可启动后，再提交/推送/开 PR。

## Verification notes

- `pnpm typecheck`（packages/db）exit 0；`pnpm typecheck`（apps/desktop）无 diagnostics。
- `vitest run tests/unit/main/prompt-version-consistency.test.ts`：4 passed。
- `vitest run tests/unit/main/canonical-storage-startup.test.ts tests/unit/main/prompt-version-consistency.test.ts`：15 passed。
- `pnpm build`（desktop）exit 0；eslint（相关文件）exit 0。
