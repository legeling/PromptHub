/**
 * Query helper for the "My Skills" tag filter control.
 *
 * The dropdown widgets narrow candidate tags as the user types. The candidate
 * set itself is derived elsewhere (sidebar + My-Skills header share the same
 * user-tag collection via `buildSkillStats(...).uniqueUserTags`), so this
 * module only answers "which candidates match the typed query".
 *
 * “我的 Skill”标签过滤控件的查询收窄工具。候选集合本身由侧栏与头部共用的
 * user-tag 推导（`buildSkillStats(...).uniqueUserTags`）提供，本模块只负责回答
 * “哪些候选项匹配已输入的查询”。
 */

/**
 * Filter the candidate tag list by a user query. Blank/whitespace queries
 * return the full list; otherwise a case-insensitive substring match.
 */
export function filterSkillTagOptions(
  options: string[],
  query: string,
): string[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return options;
  }
  return options.filter((option) => option.toLowerCase().includes(q));
}
