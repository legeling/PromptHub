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

## Review correction (2026-09-05)

FR-REVIEW-001 / DES-REVIEW-001 / TEST-REVIEW-001 / T-REVIEW-001: Preserve renumbered legacy snapshots as selectable history by appending a real snapshot of the current prompt after their new maximum. Preserve IDs/content/timestamps of all existing rows and positive version numbers. Only a repair with non-positive history adds this snapshot; a repeated pass is a no-op. Match tag mutations by parsed JSON array elements, including JSON escapes, rather than raw LIKE patterns. Both operations remain transactional. No schema or public contract changes; rollback by restoring the pre-upgrade database copy. Scan cost remains linear in tag text/history size (LIKE already required a full scan); no new JSON1 dependency. Verification uses real SQLite, history visibility projection, rollback failure injection, escaped/unicode tags and repeated repair.

Supersedes conflicting earlier repair/tag-inference behavior. Authorized by the
maintainer after the three reproducible review findings. Implemented and verified;
see Review verification below in implementation.md.

## Maintainer follow-up after merge (2026-09-05)

This section supersedes conflicting pre-merge behavior and status above. PRs #213
and #214 are merged; the follow-up is implemented locally, not yet committed or
released. Remaining release acceptance is recorded below.

Preserve invalid version snapshots by assigning unused positive numbers without changing IDs, bodies, notes or timestamps. Database write errors must roll back tag mutations. Web must return actual actor-scoped reference counts and preserve referenced tags.

Traceability: FR-FOLLOWUP-001 -> DES-FOLLOWUP-001 -> TEST-FOLLOWUP-001 -> T-FOLLOWUP-001.
Verification: focused regressions passed; see the final verification boundary in implementation.md.
