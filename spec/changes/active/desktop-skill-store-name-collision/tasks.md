# Tasks

- [x] 梳理 `RegistrySkill` / `Skill` 的身份字段，定义 `source_id` 与内容指纹字段。
- [x] 移除 `github-skill-store.ts` 与 `store-remote-sync.ts` 中基于 `slug/name` 的粗粒度去重。
- [x] 重写 `SkillStore.tsx` 的安装态计算，改为按来源实例判断。
- [x] 重写 `SkillStoreDetail.tsx` 的已安装实例查找逻辑。
- [x] 设计并实现数据库迁移：从 `LOWER(name)` 唯一约束迁移到来源实例唯一约束。
- [x] 补充同名跨 source / 跨 branch / 同内容镜像 的测试。
- [x] 设计并实现平台侧同名 skill 的唯一安装目录策略，避免按 `skill.name` 覆盖。
- [x] 设计并实现统一的 variant badge 解析层，供 store 与 My Skills 复用。
- [x] 在 `SkillStoreCard` / `SkillStoreDetail` 中展示来源标签与状态 badge。
- [x] 在 `SkillGalleryCard` / `SkillListView` 中展示导入后来源标签与变体 badge。
- [x] 补充组件测试覆盖 official/dev/community/local 等 badge 展示。
