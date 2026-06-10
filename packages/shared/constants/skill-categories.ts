import type { SkillCategory } from "../types/skill";

/**
 * Skill category definitions.
 * 技能类别定义。
 */
export const SKILL_CATEGORIES: Record<
  SkillCategory,
  { label: string; labelEn: string; icon: string }
> = {
  general: { label: "通用", labelEn: "General", icon: "LayoutGridIcon" },
  office: { label: "办公工具", labelEn: "Office", icon: "FileSpreadsheetIcon" },
  dev: { label: "开发工具", labelEn: "Development", icon: "CodeIcon" },
  ai: { label: "AI 生成", labelEn: "AI Generation", icon: "SparklesIcon" },
  data: { label: "数据分析", labelEn: "Data Analysis", icon: "BarChartIcon" },
  management: { label: "项目管理", labelEn: "Management", icon: "KanbanIcon" },
  deploy: { label: "部署", labelEn: "Deploy", icon: "RocketIcon" },
  design: { label: "设计", labelEn: "Design", icon: "PaletteIcon" },
  security: { label: "安全", labelEn: "Security", icon: "ShieldIcon" },
  meta: { label: "元技能", labelEn: "Meta", icon: "WandIcon" },
};
