domain: skills

## 行为

- 技能源码目录中的 `.prompthub`（用户态 sidecar，如 `.prompthub/user.json`）
  不再被收进 canonical skill bundle 的 payload 树。已发布的 canonical bundle
  外部出现/残留的 `.prompthub` 或顶层 `repo`（历史 ingest 遗留的 clone/内容
  层）目录不构成读取错误——读取时整棵跳过其子树。
- 其它 domain（prompts、rules、mcp、plugins、agents、generations）的资源
  bundle 校验行为不变：未声明目录/文件仍被拒绝。此豁免仅对 skill read 路径生效。

## 边界场景

- 当 skill read 遇到非 `.prompthub`/`repo` 的未声明目录时，仍抛出
  `undeclared directory`。
- 若技能 bundle 的 manifest 声明了位于被忽略目录内（如 `repo/`）的文件而目录被
  整体跳过，校验会以 `missing payload` 失败（不静默放宽）。
- 被忽略名称对应的条目若是符号链接，依旧以「非普通文件/目录」拒绝，不因忽略放宽。
- 源码收集层只在发布时忽略 `.prompthub`；`repo` 仅作为既有 bundle 的读取豁免
  存在，新发布的 bundle 若实际把 `repo/*` 声明进 manifest，则不属于未声明残留。

## 验收条件

AC1：真实或容器化的技能源码若带 `.prompthub/*`，发布后 bundle 内不含
`.prompthub` 相关条目（`packageFiles` 不含、`data/skills/<id>/.prompthub` 不存在）。

AC2：向已存在的技能 bundle 目录注入一个未声明的 `.prompthub` 目录后，
`readSkillResourceBundle`/`skillDb.update` 均可继续工作；执行一次 update 后该
残留目录被清除且 bundle 可读。
