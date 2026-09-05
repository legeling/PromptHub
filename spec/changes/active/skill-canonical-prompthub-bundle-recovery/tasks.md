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
