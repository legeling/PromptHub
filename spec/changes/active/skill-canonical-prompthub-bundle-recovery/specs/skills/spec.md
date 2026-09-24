domain: skills

## 行为

源码发布时排除 `.prompthub` 用户态 sidecar，不将它收进 canonical payload。
已发布 bundle 仍须完整满足 manifest 的 inventory：所有 domain 都拒绝未声明
文件或目录，不为 `.prompthub` 或 `repo` 提供整棵子树的读取豁免。

### `FR-FOLLOWUP-001`

遇到已发布 bundle 中的未声明目录必须明确失败，并保留该目录及文件；不得以
自动修复为由静默丢弃未知数据。已损坏历史 bundle 需经独立恢复流程处理。
manifest 正常声明的 `repo/*` 仍按普通 payload 校验。符号链接限制保持不变。

## 验收条件

AC1：带 `.prompthub/*` 的源码发布后，bundle inventory 不包含 sidecar。

AC2：向已发布 bundle 注入未声明的 `.prompthub` 或 `repo` 目录，读取和更新
均报 `undeclared directory`，其内容仍保留。不得绕过校验再发布。

| Requirement | Design | Verification | Task |
| --- | --- | --- | --- |
| FR-FOLLOWUP-001 | DES-FOLLOWUP-001 | TEST-FOLLOWUP-001 | T-FOLLOWUP-001 |
