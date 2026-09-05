domain: skills
related active change: skill-canonical-prompthub-bundle-recovery（已提交入口修复）

## 行为

`skill:syncFromRepo` 及一切触发 `hydrateCanonicalSkillWorkspace` 的入口，在
替换（删除并重建）`cache/skill-workspaces/<skillId>` 时必须稳健：若旧工作区
在 Windows 上被短时占用（文件句柄未释放/索引器/编辑器/杀软），恢复操作不能
以 EPERM 使同步整体失败。

## 场景/验收草案（待实现确认）

- 正常替换不受影响；数据一致性（新树先备好、完成后一次换入、失败保留旧树）保持。
- Windows 占用触发 EPERM 时：不丢失 canonical 内容/bundle；同步以可诊断的
  结果收敛，而不是让 DB/local_repo_path 指向不存在工作区。
- 旧树不会因新建失败而提前清空；失败可重试或优雅降级。
