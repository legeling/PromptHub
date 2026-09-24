# Tasks

- [x] canonical-skill-library.ts：`IGNORED_ROOTS` 增 `.prompthub`。
- [x] skill-resource-schema.ts `validatePackagePath`：顶层 `.prompthub` 判不安全。
- [x] resource-bundle.ts：`ReadResourceBundleOptions.ignoredDirectories` 实现并透传
      inventory 两函数。
- [x] skill-resource-schema.ts `readSkillResourceBundle` 传
      `ignoredDirectories: ['.prompthub']`。
- [x] 回归测试 `packages/core/tests/canonical-skill-db.test.ts`：
      - `.prompthub` 源码目录不出现在 bundle payload / 不存在于 `data/skills`。
      - 向既有 bundle 注入未声明 `.prompthub` 后可正常读取，update 后残留被清除。
- [x] 聚焦验证资源 bundle 通用校验默认不受影响。

## Maintainer follow-up after merge (2026-09-05)

This section supersedes conflicting pre-merge behavior and status above. PRs #213
and #214 are merged; the follow-up is implemented locally, not yet committed or
released. Remaining release acceptance is recorded below.

Reject undeclared bundle directories instead of skipping their subtree or deleting them on republish. Existing files remain available for explicit recovery; clean source packages still exclude .prompthub before publication.

Traceability: FR-FOLLOWUP-001 -> DES-FOLLOWUP-001 -> TEST-FOLLOWUP-001 -> T-FOLLOWUP-001.
Verification: focused regressions passed; see the final verification boundary in implementation.md.
