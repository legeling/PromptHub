# Spec — Prompt `current_version` startup self-heal

## Requirements

### `FR-PCVMISS-001`
A source PromptHub SQLite database whose prompt `current_version` does not match
its stored version chain MUST be accepted at canonical authority publication:
PromptHub MAY converge each prompt pointer to its latest stored version, and for
a prompt with content but no version row MAY add a single snapshot of version 1
taken from the current prompt fields, before projecting validated canonical files.

### `FR-PCVMISS-002`
The repair MUST be idempotent, MUST NOT modify prompt content or unrelated
metadata, and MUST NOT fabricate a version number larger than what already exists
in `prompt_versions`.

### `FR-PCVMISS-003`
The startup wiring MUST run only for a recognized real SQLite image at the source
database (a non-SQLite file must be left untouched) so recovery flows and mock
startup fixtures keep their existing behavior.

## Acceptance scenarios

- 库内某 prompt `current_version` = 3、却只有 v1/v2 两行 → 修复后成为 v2；
  cache 残行保持数量不变，无损失。
- 某 prompt 有内容却无任何版本行 → 修复后写入一条基于该 prompt 当前各字段的
  v1 版本行并设 `current_version` = 1。
- 健康 prompt（版本链完整且指针 == max）→ 完全不改动。
- 重复运行修复 → 第二次为 no-op（幂等）。
- 非 SQLite 源文件 → 接线函数直接跳过，不尝试打开、不发生异常。

## Traceability

| Requirement | Design | Verification | Task |
| ----------- | ------ | ------------ | ---- |
| FR-PCVMISS-001 | DES-PCV-001 | TEST-PCV-001..003 | T-PCV-001..003 |
| FR-PCVMISS-002 | DES-PCV-001 | TEST-PCV-004 | T-PCV-003 |
| FR-PCVMISS-003 | DES-PCV-002 | TEST-PCV-005 | T-PCV-004 |
