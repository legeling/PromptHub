# Implementation

分支：`feat/my-skills-tag-search`（用户指定在本分支修复；该修复与 tag-search
功能无关，属本分支既有功能缺陷的收敛修复）。

## 实际改动

与 design.md 一致，最终落地 4 个源文件 + 1 个测试文件：

- packages/core/src/canonical-skill-library.ts
- packages/core/src/skill-resource-schema.ts
- packages/core/src/resource-bundle.ts
- packages/core/tests/canonical-skill-db.test.ts

## 验证

命令（working dir: packages/core）：

```
./node_modules/.bin/vitest run tests/canonical-skill-db.test.ts -t "prompthub"
```

结果：`2 passed`（excludes-from-source、clears-on-republish）。

扩展后（覆盖 `repo` 残留）实测本机设备的技能 canonical bundle 顶层残留一个
`repo` 目录导致读失败（`.prompthub` 修复本身不覆盖 `repo`）。已将
`SKILL_BUNDLE_IGNORED_DIRECTORIES = ['.prompthub', 'repo']`
纳入 read 豁免，并用 `it.each(['.prompthub','repo'])` 证明残留目录可读、且
一次 `skill:update`（整目录替换发布）即被清除。

```
./node_modules/.bin/vitest run tests/canonical-skill-db.test.ts -t "clears an undeclared|excludes the user"
```

结果：`3 passed`（excludes-from-source + `.prompthub`、`repo` 两条 clears-on-republish）。

补充：

- `tests/resource-bundle.test.ts`、`tests/resource-bundle-publication.test.ts`、
  canonical-skill-db 中个别用例在 Windows 上因 `fs.symlinkSync` 权限报
  `EPERM`，属于宿主环境（symlink 无特权）既有问题，与本改动无关；非 symlink
  断言均通过，确认通用默认（空 ignoredDirectories）行为未改变。

## 已知限制 / 后续

- 读取豁免对象名固定为技能域 `.prompthub`；若今后需要把某运行期 sidecar 目录
  纳入其它 domain，将沿同参数扩展，不影响通用严格默认。
- 已污染 bundle 的自愈依赖用户下一次对该技能 update（整目录替换发布）；不执行
  自动后台扫描。
