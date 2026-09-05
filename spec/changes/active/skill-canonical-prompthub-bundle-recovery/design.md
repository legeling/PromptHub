# Design

## 现状

`packages/core/src/resource-bundle.ts`：

- `inspectInventoryEntry`：
  - 目录若不在由 `manifest.payloadFiles` 推导的 `allowedDirectories` 里则抛
    `undeclared directory`（用户报错点）。
  - 对符号链接一律拒绝。

`packages/core/src/canonical-skill-library.ts`：`IGNORED_ROOTS =
{'.git','.package-lifecycle'}`，`collectPackageFiles` 仅在根层跳过这些名字。

`packages/core/src/skill-resource-schema.ts`：`validatePackagePath` 拒绝顶层
`.git`/`.package-lifecycle`（未含 `.prompthub`）；`readSkillResourceBundle`
调用通用 `readResourceBundle`。

`canonical-skill-db` 的 `update`→`publish` 走 `publishCanonicalSkill`→
`publishCanonicalEntries`：整目录替换（旧 target rename 至 prior，全新 stage
rename 至 target，成功后再删 prior）。此机制天然会把目标目录内既有的
`.prompthub` 残留清除。

## 改动设计

| 文件 | 改动 | 动机 |
| --- | --- | --- |
| canonical-skill-library.ts | `IGNORED_ROOTS` 增 `.prompthub` | 源码发布不把该用户态 sidecar 收进 payload |
| skill-resource-schema.ts `validatePackagePath` | 顶层段增 `.prompthub` 为不安全 | 对 using 旧 bundle 的 packageFiles 回退提供防护 |
| resource-bundle.ts | 新增 `ReadResourceBundleOptions.ignoredDirectories?: readonly string[]`；`inspectInventoryEntry`/`inventoryBundle` 透传；命中目录则整体跳过（不 push/不报 undeclared/不计入 found） | 只读层宽容某个明确的 runtime sidecar 目录 |
| skill-resource-schema.ts `readSkillResourceBundle` | 传 `ignoredDirectories`（`.prompthub` + 既有 bundle 顶层残留 `repo`） | 豁免仅限技能域，通用校验保持严格 |

## 关键不变量

- `ignoredDirectories` 只影响 inventory 遍历“目录是否被报为未声明”的判定，且
  被跳过子树内的文件不会进 `found`；若 manifest 引用了这类文件，后续
  `verifyPayloadFile` 仍以 `missing payload` 失败。
写死默认（不传时为空集合），prompts/rules/mcp/… 全部走原有严格路径，测试
`resource-bundle.test.ts`、`resource-bundle-publication.test.ts` 的既有断言
（除 Windows symlink EPERM 环境失败外）不受影响。
