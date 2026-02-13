import type { RegistrySkill, SkillCategory } from '../types/skill';
import {
  ICON_PDF, ICON_WORD, ICON_EXCEL, ICON_POWERPOINT, ICON_SHEETS,
  ICON_GITHUB, ICON_PLAYWRIGHT, ICON_GITHUB_ACTIONS, ICON_MCP, ICON_HTML5,
  ICON_OPENAI, ICON_JUPYTER, ICON_LINEAR, ICON_NOTION, ICON_SENTRY,
  ICON_VERCEL, ICON_NETLIFY, ICON_CLOUDFLARE, ICON_FIGMA, ICON_CSS,
  ICON_LOCK, ICON_ANTHROPIC, ICON_YOUTUBE, ICON_D3, ICON_REACT, ICON_DOCKER,
  ICON_X, ICON_POSTGRESQL, ICON_FLASK, ICON_ARCHITECTURE, ICON_BOT,
  ICON_RESEARCH, ICON_BARCHART, ICON_FOLDER, ICON_DOCUMENT, ICON_BRUSH,
  ICON_SWATCHES, ICON_NEWSPAPER, ICON_PEN, ICON_GLOBE, ICON_TARGET,
  ICON_IMAGE, ICON_LIGHTBULB, ICON_INFINITY, ICON_RECEIPT, ICON_TERMINAL,
} from './skill-icons';

/**
 * Skill category definitions
 * 技能类别定义
 */
export const SKILL_CATEGORIES: Record<SkillCategory, { label: string; labelEn: string; icon: string }> = {
  general: { label: '通用', labelEn: 'General', icon: 'LayoutGridIcon' },
  office: { label: '办公工具', labelEn: 'Office', icon: 'FileSpreadsheetIcon' },
  dev: { label: '开发工具', labelEn: 'Development', icon: 'CodeIcon' },
  ai: { label: 'AI 生成', labelEn: 'AI Generation', icon: 'SparklesIcon' },
  data: { label: '数据分析', labelEn: 'Data Analysis', icon: 'BarChartIcon' },
  management: { label: '项目管理', labelEn: 'Management', icon: 'KanbanIcon' },
  deploy: { label: '部署', labelEn: 'Deploy', icon: 'RocketIcon' },
  design: { label: '设计', labelEn: 'Design', icon: 'PaletteIcon' },
  security: { label: '安全', labelEn: 'Security', icon: 'ShieldIcon' },
  meta: { label: '元技能', labelEn: 'Meta', icon: 'WandIcon' },
};

/**
 * Built-in skill registry
 * 内置技能注册表
 */
export const BUILTIN_SKILL_REGISTRY: RegistrySkill[] = [
  // ─── Office Tools / 办公工具 ───
  {
    slug: 'pdf',
    name: 'PDF Skill',
    description: 'Read, extract, create, merge, split, rotate, watermark, encrypt, and OCR PDF files. Triggers on any .pdf mention.',
    category: 'office',
    icon_url: ICON_PDF,
    author: 'Anthropic',
    source_url: 'https://github.com/anthropics/skills/tree/main/skills/pdf',
    content_url: 'https://raw.githubusercontent.com/anthropics/skills/main/skills/pdf/SKILL.md',
    tags: ['pdf', 'document', 'extract', 'ocr'],
    version: '1.0.0',
    content: `---
name: pdf
description: Use this skill whenever the user wants to do anything with PDF files. This includes reading or extracting text/tables from PDFs, combining or merging multiple PDFs into one, splitting PDFs apart, rotating pages, adding watermarks, creating new PDFs, filling PDF forms, encrypting/decrypting PDFs, extracting images, and OCR on scanned PDFs.
---`,
    prerequisites: ['Python 3', 'pypdf / pdfplumber / reportlab'],
    compatibility: ['claude', 'cursor', 'windsurf', 'opencode'],
  },
  {
    slug: 'docx',
    name: 'Word Docs',
    description: 'Create, read, edit, and manipulate Word (.docx) documents with formatting, tracked changes, and TOC.',
    category: 'office',
    icon_url: ICON_WORD,
    author: 'Anthropic',
    source_url: 'https://github.com/anthropics/skills/tree/main/skills/docx',
    content_url: 'https://raw.githubusercontent.com/anthropics/skills/main/skills/docx/SKILL.md',
    tags: ['word', 'docx', 'document', 'office'],
    version: '1.0.0',
    content: `---
name: docx
description: "Use this skill whenever the user wants to create, read, edit, or manipulate Word documents (.docx files). Triggers on any mention of Word doc, .docx, reports, memos, letters, or templates."
---`,
    prerequisites: ['Node.js (docx-js) or Python (python-docx)'],
    compatibility: ['claude', 'cursor', 'windsurf', 'opencode'],
  },
  {
    slug: 'xlsx',
    name: 'Spreadsheet (XLSX)',
    description: 'Create, edit, analyze, and format spreadsheets (.xlsx, .csv, .tsv) with formulas, charts, and data cleaning.',
    category: 'office',
    icon_url: ICON_EXCEL,
    author: 'Anthropic',
    source_url: 'https://github.com/anthropics/skills/tree/main/skills/xlsx',
    content_url: 'https://raw.githubusercontent.com/anthropics/skills/main/skills/xlsx/SKILL.md',
    tags: ['excel', 'csv', 'spreadsheet', 'data'],
    version: '1.0.0',
    content: `---
name: xlsx
description: "Use this skill any time a spreadsheet file is the primary input or output — open, read, edit, fix, or create .xlsx/.csv/.tsv files with formulas, formatting, charting, and data cleaning."
---`,
    prerequisites: ['Python 3', 'openpyxl / pandas'],
    compatibility: ['claude', 'cursor', 'windsurf', 'opencode'],
  },
  {
    slug: 'pptx',
    name: 'PowerPoint (PPTX)',
    description: 'Create, read, edit, and convert PowerPoint presentations. Supports slides, layouts, speaker notes, and design.',
    category: 'office',
    icon_url: ICON_POWERPOINT,
    author: 'Anthropic',
    source_url: 'https://github.com/anthropics/skills/tree/main/skills/pptx',
    content_url: 'https://raw.githubusercontent.com/anthropics/skills/main/skills/pptx/SKILL.md',
    tags: ['powerpoint', 'pptx', 'presentation', 'slides'],
    version: '1.0.0',
    content: `---
name: pptx
description: "Use this skill any time a .pptx file is involved — creating slide decks, pitch decks, reading, parsing, editing, or combining presentations."
---`,
    prerequisites: ['Python 3', 'python-pptx'],
    compatibility: ['claude', 'cursor', 'windsurf', 'opencode'],
  },
  {
    slug: 'spreadsheet-openai',
    name: 'Spreadsheet (Analysis)',
    description: 'Create, edit, analyze, and visualize spreadsheets with Python (openpyxl, pandas). Finance-ready formatting.',
    category: 'office',
    icon_url: ICON_SHEETS,
    author: 'OpenAI',
    source_url: 'https://github.com/openai/skills/tree/main/skills/.curated/spreadsheet',
    content_url: 'https://raw.githubusercontent.com/openai/skills/main/skills/.curated/spreadsheet/SKILL.md',
    tags: ['spreadsheet', 'analysis', 'pandas', 'openpyxl'],
    version: '1.0.0',
    content: `---
name: spreadsheet
description: "Use when tasks involve creating, editing, analyzing, or formatting spreadsheets (.xlsx, .csv, .tsv) using Python (openpyxl, pandas), especially when formulas, references, and formatting need to be preserved."
---`,
    prerequisites: ['Python 3', 'openpyxl', 'pandas'],
    compatibility: ['claude', 'cursor', 'windsurf', 'opencode'],
  },

  // ─── Development Tools / 开发工具 ───
  {
    slug: 'yeet',
    name: 'Yeet (Git PR)',
    description: 'Stage, commit, push, and open a GitHub pull request in one flow using the GitHub CLI (gh).',
    category: 'dev',
    icon_url: ICON_GITHUB,
    author: 'OpenAI',
    source_url: 'https://github.com/openai/skills/tree/main/skills/.curated/yeet',
    content_url: 'https://raw.githubusercontent.com/openai/skills/main/skills/.curated/yeet/SKILL.md',
    tags: ['git', 'commit', 'pr', 'github'],
    version: '1.0.0',
    content: `---
name: yeet
description: "Use only when the user explicitly asks to stage, commit, push, and open a GitHub pull request in one flow using the GitHub CLI (gh)."
---`,
    prerequisites: ['Git CLI', 'GitHub CLI (gh)'],
    compatibility: ['claude', 'cursor', 'windsurf', 'opencode'],
  },
  {
    slug: 'playwright',
    name: 'Playwright CLI',
    description: 'Automate real browsers from the terminal — navigation, form filling, snapshots, screenshots, and data extraction.',
    category: 'dev',
    icon_url: ICON_PLAYWRIGHT,
    author: 'OpenAI',
    source_url: 'https://github.com/openai/skills/tree/main/skills/.curated/playwright',
    content_url: 'https://raw.githubusercontent.com/openai/skills/main/skills/.curated/playwright/SKILL.md',
    tags: ['playwright', 'testing', 'e2e', 'browser', 'automation'],
    version: '1.0.0',
    content: `---
name: playwright
description: "Use when the task requires automating a real browser from the terminal (navigation, form filling, snapshots, screenshots, data extraction, UI-flow debugging) via playwright-cli."
---`,
    prerequisites: ['Node.js', 'npx'],
    compatibility: ['claude', 'cursor', 'windsurf', 'opencode'],
  },
  {
    slug: 'gh-fix-ci',
    name: 'Fix CI Checks',
    description: 'Debug and fix failing GitHub PR checks in GitHub Actions. Inspect logs, summarize failures, and draft fixes.',
    category: 'dev',
    icon_url: ICON_GITHUB_ACTIONS,
    author: 'OpenAI',
    source_url: 'https://github.com/openai/skills/tree/main/skills/.curated/gh-fix-ci',
    content_url: 'https://raw.githubusercontent.com/openai/skills/main/skills/.curated/gh-fix-ci/SKILL.md',
    tags: ['github', 'ci', 'actions', 'debugging'],
    version: '1.0.0',
    content: `---
name: gh-fix-ci
description: "Use when a user asks to debug or fix failing GitHub PR checks that run in GitHub Actions; use gh to inspect checks and logs, summarize failure context, draft a fix plan."
---`,
    prerequisites: ['GitHub CLI (gh)', 'repo + workflow scopes'],
    compatibility: ['claude', 'cursor', 'windsurf', 'opencode'],
  },
  {
    slug: 'gh-address-comments',
    name: 'PR Comment Handler',
    description: 'Address review and issue comments on GitHub PRs. Fetch comments, summarize, and apply fixes.',
    category: 'dev',
    icon_url: ICON_GITHUB,
    author: 'OpenAI',
    source_url: 'https://github.com/openai/skills/tree/main/skills/.curated/gh-address-comments',
    content_url: 'https://raw.githubusercontent.com/openai/skills/main/skills/.curated/gh-address-comments/SKILL.md',
    tags: ['github', 'pr', 'review', 'comments'],
    version: '1.0.0',
    content: `---
name: gh-address-comments
description: Help address review/issue comments on the open GitHub PR for the current branch using gh CLI.
---`,
    prerequisites: ['GitHub CLI (gh)'],
    compatibility: ['claude', 'cursor', 'windsurf', 'opencode'],
  },
  {
    slug: 'mcp-builder',
    name: 'MCP Builder',
    description: 'Build high-quality MCP (Model Context Protocol) servers for LLM integration with external services.',
    category: 'dev',
    icon_url: ICON_MCP,
    author: 'Anthropic',
    source_url: 'https://github.com/anthropics/skills/tree/main/skills/mcp-builder',
    content_url: 'https://raw.githubusercontent.com/anthropics/skills/main/skills/mcp-builder/SKILL.md',
    tags: ['mcp', 'server', 'protocol', 'integration'],
    version: '1.0.0',
    content: `---
name: mcp-builder
description: Guide for creating high-quality MCP (Model Context Protocol) servers that enable LLMs to interact with external services through well-designed tools.
---`,
    prerequisites: ['Python (FastMCP) or Node/TypeScript (MCP SDK)'],
    compatibility: ['claude', 'cursor', 'windsurf', 'opencode'],
  },
  {
    slug: 'develop-web-game',
    name: 'Web Game Dev',
    description: 'Build and iterate on web games (HTML/JS) with a Playwright-based test loop, screenshots, and console review.',
    category: 'dev',
    icon_url: ICON_HTML5,
    author: 'OpenAI',
    source_url: 'https://github.com/openai/skills/tree/main/skills/.curated/develop-web-game',
    content_url: 'https://raw.githubusercontent.com/openai/skills/main/skills/.curated/develop-web-game/SKILL.md',
    tags: ['game', 'html', 'canvas', 'web'],
    version: '1.0.0',
    content: `---
name: develop-web-game
description: "Use when building or iterating on a web game (HTML/JS) and needs a reliable development + testing loop with Playwright-based testing."
---`,
    prerequisites: ['Node.js', 'Playwright'],
    compatibility: ['claude', 'cursor', 'windsurf', 'opencode'],
  },
  {
    slug: 'screenshot',
    name: 'Screenshot Capture',
    description: 'Capture desktop or system screenshots — full screen, specific app/window, or a pixel region.',
    category: 'dev',
    author: 'OpenAI',
    source_url: 'https://github.com/openai/skills/tree/main/skills/.curated/screenshot',
    content_url: 'https://raw.githubusercontent.com/openai/skills/main/skills/.curated/screenshot/SKILL.md',
    tags: ['screenshot', 'capture', 'desktop'],
    version: '1.0.0',
    content: `---
name: screenshot
description: "Use when the user explicitly asks for a desktop or system screenshot (full screen, specific app or window, or a pixel region)."
---`,
    compatibility: ['claude', 'cursor', 'windsurf', 'opencode'],
  },

  // ─── AI Generation / AI 生成 ───
  {
    slug: 'imagegen',
    name: 'Image Gen',
    description: 'Generate and edit images via the OpenAI Image API — product shots, concept art, covers, and batch variants.',
    category: 'ai',
    icon_url: ICON_OPENAI,
    author: 'OpenAI',
    source_url: 'https://github.com/openai/skills/tree/main/skills/.curated/imagegen',
    content_url: 'https://raw.githubusercontent.com/openai/skills/main/skills/.curated/imagegen/SKILL.md',
    tags: ['image', 'generation', 'ai', 'creative'],
    version: '1.0.0',
    content: `---
name: imagegen
description: "Use when the user asks to generate or edit images via the OpenAI Image API (generate, edit/inpaint/mask, background removal, product shots, concept art, covers, or batch variants)."
---`,
    prerequisites: ['Python 3', 'OPENAI_API_KEY'],
    compatibility: ['claude', 'cursor', 'windsurf', 'opencode'],
  },
  {
    slug: 'transcribe',
    name: 'Transcribe',
    description: 'Transcribe audio files to text with optional speaker diarization and known-speaker hints.',
    category: 'ai',
    icon_url: ICON_OPENAI,
    author: 'OpenAI',
    source_url: 'https://github.com/openai/skills/tree/main/skills/.curated/transcribe',
    content_url: 'https://raw.githubusercontent.com/openai/skills/main/skills/.curated/transcribe/SKILL.md',
    tags: ['transcription', 'audio', 'speech-to-text', 'diarization'],
    version: '1.0.0',
    content: `---
name: transcribe
description: "Transcribe audio files to text with optional diarization and known-speaker hints. Use when a user asks to transcribe speech from audio/video, extract text from recordings, or label speakers."
---`,
    prerequisites: ['Python 3', 'OPENAI_API_KEY'],
    compatibility: ['claude', 'cursor', 'windsurf', 'opencode'],
  },

  // ─── Data Analysis / 数据分析 ───
  {
    slug: 'jupyter-notebook',
    name: 'Jupyter Notebook',
    description: 'Create, scaffold, or edit Jupyter notebooks (.ipynb) for experiments, explorations, or tutorials.',
    category: 'data',
    icon_url: ICON_JUPYTER,
    author: 'OpenAI',
    source_url: 'https://github.com/openai/skills/tree/main/skills/.curated/jupyter-notebook',
    content_url: 'https://raw.githubusercontent.com/openai/skills/main/skills/.curated/jupyter-notebook/SKILL.md',
    tags: ['jupyter', 'notebook', 'data', 'experiments'],
    version: '1.0.0',
    content: `---
name: jupyter-notebook
description: "Use when the user asks to create, scaffold, or edit Jupyter notebooks (.ipynb) for experiments, explorations, or tutorials."
---`,
    prerequisites: ['Python 3', 'jupyterlab (optional)'],
    compatibility: ['claude', 'cursor', 'windsurf', 'opencode'],
  },

  // ─── Project Management / 项目管理 ───
  {
    slug: 'linear',
    name: 'Linear',
    description: 'Manage issues, projects & team workflows in Linear. Read, create, or update tickets directly.',
    category: 'management',
    icon_url: ICON_LINEAR,
    author: 'OpenAI',
    source_url: 'https://github.com/openai/skills/tree/main/skills/.curated/linear',
    content_url: 'https://raw.githubusercontent.com/openai/skills/main/skills/.curated/linear/SKILL.md',
    tags: ['linear', 'issues', 'project-management', 'tracking'],
    version: '1.0.0',
    content: `---
name: linear
description: Manage issues, projects & team workflows in Linear. Use when the user wants to read, create or update tickets in Linear.
---`,
    prerequisites: ['Linear MCP server'],
    compatibility: ['claude', 'cursor', 'windsurf', 'opencode'],
  },
  {
    slug: 'notion-knowledge-capture',
    name: 'Notion Knowledge',
    description: 'Capture conversations and research into structured Notion pages using the Notion MCP server.',
    category: 'management',
    icon_url: ICON_NOTION,
    author: 'OpenAI',
    source_url: 'https://github.com/openai/skills/tree/main/skills/.curated/notion-knowledge-capture',
    content_url: 'https://raw.githubusercontent.com/openai/skills/main/skills/.curated/notion-knowledge-capture/SKILL.md',
    tags: ['notion', 'knowledge', 'documentation', 'notes'],
    version: '1.0.0',
    content: `---
name: notion-knowledge-capture
description: Capture conversations into structured Notion pages via the Notion MCP server.
---`,
    prerequisites: ['Notion MCP server'],
    compatibility: ['claude', 'cursor', 'windsurf', 'opencode'],
  },
  {
    slug: 'sentry',
    name: 'Sentry',
    description: 'Read-only Sentry observability — inspect issues, events, summarize production errors via Sentry API.',
    category: 'management',
    icon_url: ICON_SENTRY,
    author: 'OpenAI',
    source_url: 'https://github.com/openai/skills/tree/main/skills/.curated/sentry',
    content_url: 'https://raw.githubusercontent.com/openai/skills/main/skills/.curated/sentry/SKILL.md',
    tags: ['sentry', 'errors', 'monitoring', 'debugging'],
    version: '1.0.0',
    content: `---
name: sentry
description: "Use when the user asks to inspect Sentry issues or events, summarize recent production errors, or pull basic Sentry health data via the Sentry API."
---`,
    prerequisites: ['SENTRY_AUTH_TOKEN'],
    compatibility: ['claude', 'cursor', 'windsurf', 'opencode'],
  },

  // ─── Deploy / 部署 ───
  {
    slug: 'vercel-deploy',
    name: 'Vercel Deploy',
    description: 'Deploy applications and websites to Vercel. Preview and production deploys with the Vercel CLI.',
    category: 'deploy',
    icon_url: ICON_VERCEL,
    author: 'OpenAI',
    source_url: 'https://github.com/openai/skills/tree/main/skills/.curated/vercel-deploy',
    content_url: 'https://raw.githubusercontent.com/openai/skills/main/skills/.curated/vercel-deploy/SKILL.md',
    tags: ['vercel', 'deploy', 'hosting', 'nextjs'],
    version: '1.0.0',
    content: `---
name: vercel-deploy
description: Deploy applications and websites to Vercel. Use when the user requests deployment actions like "deploy my app" or "push this live".
---`,
    prerequisites: ['Vercel CLI'],
    compatibility: ['claude', 'cursor', 'windsurf', 'opencode'],
  },
  {
    slug: 'netlify-deploy',
    name: 'Netlify Deploy',
    description: 'Deploy web projects to Netlify using the Netlify CLI. Supports preview and production deploys.',
    category: 'deploy',
    icon_url: ICON_NETLIFY,
    author: 'OpenAI',
    source_url: 'https://github.com/openai/skills/tree/main/skills/.curated/netlify-deploy',
    content_url: 'https://raw.githubusercontent.com/openai/skills/main/skills/.curated/netlify-deploy/SKILL.md',
    tags: ['netlify', 'deploy', 'hosting', 'static'],
    version: '1.0.0',
    content: `---
name: netlify-deploy
description: Deploy web projects to Netlify using the Netlify CLI (npx netlify). Use when the user asks to deploy, host, publish, or link a site on Netlify.
---`,
    prerequisites: ['Netlify CLI (npx netlify)'],
    compatibility: ['claude', 'cursor', 'windsurf', 'opencode'],
  },
  {
    slug: 'cloudflare-deploy',
    name: 'Cloudflare Deploy',
    description: 'Deploy applications to Cloudflare using Workers, Pages, and related platform services.',
    category: 'deploy',
    icon_url: ICON_CLOUDFLARE,
    author: 'OpenAI',
    source_url: 'https://github.com/openai/skills/tree/main/skills/.curated/cloudflare-deploy',
    content_url: 'https://raw.githubusercontent.com/openai/skills/main/skills/.curated/cloudflare-deploy/SKILL.md',
    tags: ['cloudflare', 'workers', 'pages', 'deploy'],
    version: '1.0.0',
    content: `---
name: cloudflare-deploy
description: Deploy applications and infrastructure to Cloudflare using Workers, Pages, and related platform services.
---`,
    prerequisites: ['Cloudflare account', 'Wrangler CLI'],
    compatibility: ['claude', 'cursor', 'windsurf', 'opencode'],
  },

  // ─── Design / 设计 ───
  {
    slug: 'figma',
    name: 'Figma',
    description: 'Fetch design context, screenshots, variables, and assets from Figma, and translate nodes into production code.',
    category: 'design',
    icon_url: ICON_FIGMA,
    author: 'OpenAI',
    source_url: 'https://github.com/openai/skills/tree/main/skills/.curated/figma',
    content_url: 'https://raw.githubusercontent.com/openai/skills/main/skills/.curated/figma/SKILL.md',
    tags: ['figma', 'design', 'ui', 'design-to-code'],
    version: '1.0.0',
    content: `---
name: figma
description: Use the Figma MCP server to fetch design context, screenshots, variables, and assets from Figma, and to translate Figma nodes into production code.
---`,
    prerequisites: ['Figma MCP server'],
    compatibility: ['claude', 'cursor', 'windsurf', 'opencode'],
  },
  {
    slug: 'frontend-design',
    name: 'Frontend Design',
    description: 'Create distinctive, production-grade frontend interfaces with high design quality. Avoids generic AI aesthetics.',
    category: 'design',
    icon_url: ICON_CSS,
    author: 'Anthropic',
    source_url: 'https://github.com/anthropics/skills/tree/main/skills/frontend-design',
    content_url: 'https://raw.githubusercontent.com/anthropics/skills/main/skills/frontend-design/SKILL.md',
    tags: ['frontend', 'design', 'ui', 'css', 'react'],
    version: '1.0.0',
    content: `---
name: frontend-design
description: Create distinctive, production-grade frontend interfaces with high design quality. Use when building web components, pages, dashboards, or applications.
---`,
    compatibility: ['claude', 'cursor', 'windsurf', 'opencode'],
  },

  // ─── Security / 安全 ───
  {
    slug: 'security-best-practices',
    name: 'Security Review',
    description: 'Language and framework specific security best-practice reviews for Python, JS/TS, and Go.',
    category: 'security',
    icon_url: ICON_LOCK,
    author: 'OpenAI',
    source_url: 'https://github.com/openai/skills/tree/main/skills/.curated/security-best-practices',
    content_url: 'https://raw.githubusercontent.com/openai/skills/main/skills/.curated/security-best-practices/SKILL.md',
    tags: ['security', 'audit', 'vulnerabilities', 'best-practices'],
    version: '1.0.0',
    content: `---
name: security-best-practices
description: "Perform language and framework specific security best-practice reviews. Trigger only when the user explicitly requests security guidance. Supported: Python, JS/TS, Go."
---`,
    compatibility: ['claude', 'cursor', 'windsurf', 'opencode'],
  },

  // ─── Meta Skills / 元技能 ───
  {
    slug: 'skill-creator',
    name: 'Skill Creator',
    description: 'Guide for creating effective skills that extend AI capabilities with specialized knowledge and workflows.',
    category: 'meta',
    icon_url: ICON_ANTHROPIC,
    author: 'Anthropic',
    source_url: 'https://github.com/anthropics/skills/tree/main/skills/skill-creator',
    content_url: 'https://raw.githubusercontent.com/anthropics/skills/main/skills/skill-creator/SKILL.md',
    tags: ['skill', 'create', 'meta', 'workflow'],
    version: '1.0.0',
    content: `---
name: skill-creator
description: Guide for creating effective skills. Use when users want to create a new skill or update an existing skill that extends AI capabilities.
---`,
    compatibility: ['claude', 'cursor', 'windsurf', 'opencode'],
  },

  // ─── New Skills from Community / 社区新技能 ───

  // ─── Office Tools (continued) / 办公工具（续） ───
  {
    slug: 'invoice-organizer',
    name: 'Invoice Organizer',
    description: 'Automatically organize invoices and receipts for tax preparation by reading, extracting, and renaming files consistently.',
    category: 'office',
    icon_url: ICON_RECEIPT,
    author: 'Composio',
    source_url: 'https://github.com/ComposioHQ/awesome-claude-skills/tree/master/invoice-organizer',
    content_url: 'https://raw.githubusercontent.com/ComposioHQ/awesome-claude-skills/master/invoice-organizer/SKILL.md',
    tags: ['invoice', 'receipt', 'tax', 'finance', 'organize'],
    version: '1.0.0',
    content: `---
name: invoice-organizer
description: Automatically organizes invoices and receipts for tax preparation by reading messy files, extracting key information, renaming them consistently, and sorting them into logical folders. Turns hours of manual bookkeeping into minutes of automated organization.
---`,
    compatibility: ['claude', 'cursor', 'windsurf', 'opencode'],
  },

  // ─── Development Tools (continued) / 开发工具（续） ───
  {
    slug: 'artifacts-builder',
    name: 'Web Artifacts Builder',
    description: 'Build elaborate, multi-component HTML artifacts using React, Tailwind CSS, and shadcn/ui for Claude.ai.',
    category: 'dev',
    icon_url: ICON_REACT,
    author: 'Anthropic',
    source_url: 'https://github.com/anthropics/skills/tree/main/skills/web-artifacts-builder',
    content_url: 'https://raw.githubusercontent.com/anthropics/skills/main/skills/web-artifacts-builder/SKILL.md',
    tags: ['react', 'tailwind', 'shadcn', 'artifacts', 'frontend'],
    version: '1.0.0',
    content: `---
name: web-artifacts-builder
description: Suite of tools for creating elaborate, multi-component claude.ai HTML artifacts using modern frontend web technologies (React, Tailwind CSS, shadcn/ui). Use for complex artifacts requiring state management, routing, or shadcn/ui components - not for simple single-file HTML/JSX artifacts.
license: Complete terms in LICENSE.txt
---`,
    prerequisites: ['React', 'Tailwind CSS'],
    compatibility: ['claude', 'cursor', 'windsurf', 'opencode'],
  },
  {
    slug: 'changelog-generator',
    name: 'Changelog Generator',
    description: 'Automatically create user-facing changelogs from git commits by analyzing history and transforming into release notes.',
    category: 'dev',
    icon_url: ICON_GITHUB,
    author: 'Composio',
    source_url: 'https://github.com/ComposioHQ/awesome-claude-skills/tree/master/changelog-generator',
    content_url: 'https://raw.githubusercontent.com/ComposioHQ/awesome-claude-skills/master/changelog-generator/SKILL.md',
    tags: ['changelog', 'git', 'release', 'documentation'],
    version: '1.0.0',
    content: `---
name: changelog-generator
description: Automatically creates user-facing changelogs from git commits by analyzing commit history, categorizing changes, and transforming technical commits into clear, customer-friendly release notes. Turns hours of manual changelog writing into minutes of automated generation.
---`,
    prerequisites: ['Git CLI'],
    compatibility: ['claude', 'cursor', 'windsurf', 'opencode'],
  },
  {
    slug: 'tdd',
    name: 'Test-Driven Development',
    description: 'Apply TDD methodology — write tests first, then implement code to pass them. Ensures quality-first development.',
    category: 'dev',
    icon_url: ICON_FLASK,
    author: 'obra',
    source_url: 'https://github.com/obra/superpowers/tree/main/skills/test-driven-development',
    content_url: 'https://raw.githubusercontent.com/obra/superpowers/main/skills/test-driven-development/SKILL.md',
    tags: ['tdd', 'testing', 'development', 'workflow'],
    version: '1.0.0',
    content: `---
name: test-driven-development
description: Use when implementing any feature or bugfix, before writing implementation code
---`,
    compatibility: ['claude', 'cursor', 'windsurf', 'opencode'],
  },
  {
    slug: 'software-architecture',
    name: 'Software Architecture',
    description: 'Design patterns including Clean Architecture, SOLID principles, DDD, and comprehensive software design best practices.',
    category: 'dev',
    icon_url: ICON_ARCHITECTURE,
    author: 'NeoLab',
    source_url: 'https://github.com/NeoLabHQ/context-engineering-kit/tree/master/plugins/ddd/skills/software-architecture',
    content_url: 'https://raw.githubusercontent.com/NeoLabHQ/context-engineering-kit/master/plugins/ddd/skills/software-architecture/SKILL.md',
    tags: ['architecture', 'solid', 'clean-architecture', 'design-patterns'],
    version: '1.0.0',
    content: `---
description: Guide for quality focused software architecture. This skill should be used when users want to write code, design architecture, analyze code, in any case that relates to software development.
---`,
    compatibility: ['claude', 'cursor', 'windsurf', 'opencode'],
  },
  {
    slug: 'prompt-engineering',
    name: 'Prompt Engineering',
    description: 'Well-known prompt engineering techniques and patterns, including Anthropic best practices and agent persuasion principles.',
    category: 'dev',
    icon_url: ICON_ANTHROPIC,
    author: 'NeoLab',
    source_url: 'https://github.com/NeoLabHQ/context-engineering-kit/tree/master/plugins/customaize-agent/skills/prompt-engineering',
    content_url: 'https://raw.githubusercontent.com/NeoLabHQ/context-engineering-kit/master/plugins/customaize-agent/skills/prompt-engineering/SKILL.md',
    tags: ['prompt', 'engineering', 'ai', 'best-practices'],
    version: '1.0.0',
    content: `---
description: Use this skill when you writing commands, hooks, skills for Agent, or prompts for sub agents or any other LLM interaction, including optimizing prompts, improving LLM outputs, or designing production prompt templates.
---`,
    compatibility: ['claude', 'cursor', 'windsurf', 'opencode'],
  },
  {
    slug: 'webapp-testing',
    name: 'Webapp Testing',
    description: 'Test local web applications using Playwright for verifying frontend functionality, debugging UI, and capturing screenshots.',
    category: 'dev',
    icon_url: ICON_PLAYWRIGHT,
    author: 'Composio',
    source_url: 'https://github.com/ComposioHQ/awesome-claude-skills/tree/master/webapp-testing',
    content_url: 'https://raw.githubusercontent.com/ComposioHQ/awesome-claude-skills/master/webapp-testing/SKILL.md',
    tags: ['testing', 'playwright', 'web', 'ui', 'automation'],
    version: '1.0.0',
    content: `---
name: webapp-testing
description: Toolkit for interacting with and testing local web applications using Playwright. Supports verifying frontend functionality, debugging UI behavior, capturing browser screenshots, and viewing browser logs.
license: Complete terms in LICENSE.txt
---`,
    prerequisites: ['Node.js', 'Playwright'],
    compatibility: ['claude', 'cursor', 'windsurf', 'opencode'],
  },
  {
    slug: 'git-worktrees',
    name: 'Git Worktrees',
    description: 'Create isolated git worktrees with smart directory selection and safety verification for parallel development.',
    category: 'dev',
    icon_url: ICON_GITHUB,
    author: 'obra',
    source_url: 'https://github.com/obra/superpowers/tree/main/skills/using-git-worktrees',
    content_url: 'https://raw.githubusercontent.com/obra/superpowers/main/skills/using-git-worktrees/SKILL.md',
    tags: ['git', 'worktrees', 'branching', 'parallel'],
    version: '1.0.0',
    content: `---
name: using-git-worktrees
description: Use when starting feature work that needs isolation from current workspace or before executing implementation plans - creates isolated git worktrees with smart directory selection and safety verification
---`,
    prerequisites: ['Git CLI'],
    compatibility: ['claude', 'cursor', 'windsurf', 'opencode'],
  },
  {
    slug: 'subagent-driven-dev',
    name: 'Subagent-Driven Dev',
    description: 'Dispatch independent subagents for individual tasks with code review checkpoints for rapid, controlled development.',
    category: 'dev',
    icon_url: ICON_BOT,
    author: 'NeoLab',
    source_url: 'https://github.com/NeoLabHQ/context-engineering-kit/tree/master/plugins/sadd/skills/subagent-driven-development',
    content_url: 'https://raw.githubusercontent.com/NeoLabHQ/context-engineering-kit/master/plugins/sadd/skills/subagent-driven-development/SKILL.md',
    tags: ['subagent', 'parallel', 'development', 'workflow'],
    version: '1.0.0',
    content: `---
description: Use when executing implementation plans with independent tasks in the current session or facing 3+ independent issues that can be investigated without shared state or dependencies - dispatches fresh subagent for each task with code review between tasks, enabling fast iteration with quality gates
---`,
    compatibility: ['claude', 'cursor', 'windsurf', 'opencode'],
  },
  {
    slug: 'docker-compose',
    name: 'Docker Compose',
    description: 'Create and manage Docker Compose configurations for multi-container applications with best practices.',
    category: 'dev',
    icon_url: ICON_DOCKER,
    author: 'Community',
    source_url: 'https://github.com/openai/skills',
    tags: ['docker', 'compose', 'containers', 'devops'],
    version: '1.0.0',
    content: `---
name: docker-compose
description: "Use when the user wants to create, manage, or debug Docker Compose configurations. Set up multi-container applications, configure services, networks, and volumes with best practices."
---`,
    prerequisites: ['Docker', 'Docker Compose'],
    compatibility: ['claude', 'cursor', 'windsurf', 'opencode'],
  },

  // ─── AI Generation (continued) / AI 生成（续） ───
  {
    slug: 'deep-research',
    name: 'Deep Research',
    description: 'Execute autonomous multi-step research for market analysis, competitive landscaping, and literature reviews.',
    category: 'ai',
    icon_url: ICON_RESEARCH,
    author: 'sanjay3290',
    source_url: 'https://github.com/sanjay3290/ai-skills/tree/main/skills/deep-research',
    content_url: 'https://raw.githubusercontent.com/sanjay3290/ai-skills/main/skills/deep-research/SKILL.md',
    tags: ['research', 'analysis', 'market', 'literature'],
    version: '1.0.0',
    content: `---
name: deep-research
description: "Execute autonomous multi-step research using Google Gemini Deep Research Agent. Use for: market analysis, competitive landscaping, literature reviews, technical research, due diligence. Takes 2-10 minutes but produces detailed, cited reports. Costs $2-5 per task."
---`,
    prerequisites: ['Python 3.8+', 'httpx', 'GEMINI_API_KEY'],
    compatibility: ['claude', 'cursor', 'windsurf', 'opencode'],
  },
  {
    slug: 'd3-visualization',
    name: 'D3.js Visualization',
    description: 'Produce D3 charts and interactive data visualizations — bar charts, line graphs, scatter plots, treemaps, and more.',
    category: 'ai',
    icon_url: ICON_D3,
    author: 'chrisvoncsefalvay',
    source_url: 'https://github.com/chrisvoncsefalvay/claude-d3js-skill',
    content_url: 'https://raw.githubusercontent.com/chrisvoncsefalvay/claude-d3js-skill/main/SKILL.md',
    tags: ['d3', 'visualization', 'charts', 'data', 'interactive'],
    version: '1.0.0',
    content: `---
name: d3-viz
description: Creating interactive data visualisations using d3.js. This skill should be used when creating custom charts, graphs, network diagrams, geographic visualisations, or any complex SVG-based data visualisation that requires fine-grained control over visual elements, transitions, or interactions.
---`,
    prerequisites: ['D3.js'],
    compatibility: ['claude', 'cursor', 'windsurf', 'opencode'],
  },

  // ─── Data Analysis (continued) / 数据分析（续） ───
  {
    slug: 'csv-summarizer',
    name: 'CSV Data Summarizer',
    description: 'Automatically analyze CSV files and generate comprehensive insights with visualizations and statistics.',
    category: 'data',
    icon_url: ICON_BARCHART,
    author: 'coffeefuelbump',
    source_url: 'https://github.com/coffeefuelbump/csv-data-summarizer-claude-skill',
    content_url: 'https://raw.githubusercontent.com/coffeefuelbump/csv-data-summarizer-claude-skill/main/SKILL.md',
    tags: ['csv', 'data', 'analysis', 'visualization', 'statistics'],
    version: '1.0.0',
    content: `---
name: csv-data-summarizer
description: Analyzes CSV files, generates summary stats, and plots quick visualizations using Python and pandas.
metadata:
  version: 2.1.0
  dependencies: python>=3.8, pandas>=2.0.0, matplotlib>=3.7.0, seaborn>=0.12.0
---`,
    prerequisites: ['Python 3.8+', 'pandas', 'matplotlib', 'seaborn'],
    compatibility: ['claude', 'cursor', 'windsurf', 'opencode'],
  },
  {
    slug: 'postgres-query',
    name: 'PostgreSQL Query',
    description: 'Execute safe read-only SQL queries against PostgreSQL databases with multi-connection support and security.',
    category: 'data',
    icon_url: ICON_POSTGRESQL,
    author: 'sanjay3290',
    source_url: 'https://github.com/sanjay3290/ai-skills/tree/main/skills/postgres',
    content_url: 'https://raw.githubusercontent.com/sanjay3290/ai-skills/main/skills/postgres/SKILL.md',
    tags: ['postgres', 'sql', 'database', 'query'],
    version: '1.0.0',
    content: `---
name: postgres
description: "Execute read-only SQL queries against multiple PostgreSQL databases. Use when: (1) querying PostgreSQL databases, (2) exploring database schemas/tables, (3) running SELECT queries for data analysis, (4) checking database contents. Supports multiple database connections with descriptions for intelligent auto-selection. Blocks all write operations (INSERT, UPDATE, DELETE, DROP, etc.) for safety."
---`,
    prerequisites: ['Python 3.8+', 'psycopg2-binary'],
    compatibility: ['claude', 'cursor', 'windsurf', 'opencode'],
  },

  // ─── Project Management (continued) / 项目管理（续） ───
  {
    slug: 'file-organizer',
    name: 'File Organizer',
    description: 'Intelligently organize files and folders by understanding context, finding duplicates, and suggesting structure.',
    category: 'management',
    icon_url: ICON_FOLDER,
    author: 'Composio',
    source_url: 'https://github.com/ComposioHQ/awesome-claude-skills/tree/master/file-organizer',
    content_url: 'https://raw.githubusercontent.com/ComposioHQ/awesome-claude-skills/master/file-organizer/SKILL.md',
    tags: ['files', 'organize', 'cleanup', 'duplicates'],
    version: '1.0.0',
    content: `---
name: file-organizer
description: Intelligently organizes your files and folders across your computer by understanding context, finding duplicates, suggesting better structures, and automating cleanup tasks. Reduces cognitive load and keeps your digital workspace tidy without manual effort.
---`,
    compatibility: ['claude', 'cursor', 'windsurf', 'opencode'],
  },
  {
    slug: 'resume-generator',
    name: 'Resume Generator',
    description: 'Analyze job descriptions and generate tailored resumes that highlight relevant experience and skills.',
    category: 'management',
    icon_url: ICON_DOCUMENT,
    author: 'Composio',
    source_url: 'https://github.com/ComposioHQ/awesome-claude-skills/tree/master/tailored-resume-generator',
    content_url: 'https://raw.githubusercontent.com/ComposioHQ/awesome-claude-skills/master/tailored-resume-generator/SKILL.md',
    tags: ['resume', 'cv', 'job', 'career', 'tailored'],
    version: '1.0.0',
    content: `---
name: tailored-resume-generator
description: Analyzes job descriptions and generates tailored resumes that highlight relevant experience, skills, and achievements to maximize interview chances
---`,
    compatibility: ['claude', 'cursor', 'windsurf', 'opencode'],
  },

  // ─── Design (continued) / 设计（续） ───
  {
    slug: 'canvas-design',
    name: 'Canvas Design',
    description: 'Create beautiful visual art in PNG and PDF documents using design philosophy and aesthetic principles.',
    category: 'design',
    icon_url: ICON_BRUSH,
    author: 'Composio',
    source_url: 'https://github.com/ComposioHQ/awesome-claude-skills/tree/master/canvas-design',
    content_url: 'https://raw.githubusercontent.com/ComposioHQ/awesome-claude-skills/master/canvas-design/SKILL.md',
    tags: ['design', 'art', 'canvas', 'visual', 'poster'],
    version: '1.0.0',
    content: `---
name: canvas-design
description: Create beautiful visual art in .png and .pdf documents using design philosophy. You should use this skill when the user asks to create a poster, piece of art, design, or other static piece. Create original visual designs, never copying existing artists' work to avoid copyright violations.
license: Complete terms in LICENSE.txt
---`,
    compatibility: ['claude', 'cursor', 'windsurf', 'opencode'],
  },
  {
    slug: 'theme-factory',
    name: 'Theme Factory',
    description: 'Apply professional font and color themes to artifacts — slides, docs, reports, and HTML pages with 10 pre-set themes.',
    category: 'design',
    icon_url: ICON_SWATCHES,
    author: 'Composio',
    source_url: 'https://github.com/ComposioHQ/awesome-claude-skills/tree/master/theme-factory',
    content_url: 'https://raw.githubusercontent.com/ComposioHQ/awesome-claude-skills/master/theme-factory/SKILL.md',
    tags: ['theme', 'styling', 'fonts', 'colors', 'branding'],
    version: '1.0.0',
    content: `---
name: theme-factory
description: Toolkit for styling artifacts with a theme. These artifacts can be slides, docs, reportings, HTML landing pages, etc. There are 10 pre-set themes with colors/fonts that you can apply to any artifact that has been creating, or can generate a new theme on-the-fly.
license: Complete terms in LICENSE.txt
---`,
    compatibility: ['claude', 'cursor', 'windsurf', 'opencode'],
  },

  // ─── Communication & Writing / 沟通与写作 ───
  {
    slug: 'youtube-transcript',
    name: 'YouTube Transcript',
    description: 'Fetch transcripts from YouTube videos and prepare summaries, notes, or content analysis.',
    category: 'ai',
    icon_url: ICON_YOUTUBE,
    author: 'michalparkola',
    source_url: 'https://github.com/michalparkola/tapestry-skills-for-claude-code/tree/main/youtube-transcript',
    content_url: 'https://raw.githubusercontent.com/michalparkola/tapestry-skills-for-claude-code/main/youtube-transcript/SKILL.md',
    tags: ['youtube', 'transcript', 'video', 'summary'],
    version: '1.0.0',
    content: `---
name: youtube-transcript
description: Download YouTube video transcripts when user provides a YouTube URL or asks to download/get/fetch a transcript from YouTube. Also use when user wants to transcribe or get captions/subtitles from a YouTube video.
allowed-tools: Bash,Read,Write
---`,
    prerequisites: ['yt-dlp'],
    compatibility: ['claude', 'cursor', 'windsurf', 'opencode'],
  },
  {
    slug: 'article-extractor',
    name: 'Article Extractor',
    description: 'Extract clean article content from URLs removing ads, navigation, and clutter for reading or analysis.',
    category: 'ai',
    icon_url: ICON_NEWSPAPER,
    author: 'michalparkola',
    source_url: 'https://github.com/michalparkola/tapestry-skills-for-claude-code/tree/main/article-extractor',
    content_url: 'https://raw.githubusercontent.com/michalparkola/tapestry-skills-for-claude-code/main/article-extractor/SKILL.md',
    tags: ['article', 'web', 'extract', 'content', 'scraping'],
    version: '1.0.0',
    content: `---
name: article-extractor
description: Extract clean article content from URLs (blog posts, articles, tutorials) and save as readable text. Use when user wants to download, extract, or save an article/blog post from a URL without ads, navigation, or clutter.
allowed-tools: Bash,Write
---`,
    compatibility: ['claude', 'cursor', 'windsurf', 'opencode'],
  },
  {
    slug: 'content-research-writer',
    name: 'Content Research Writer',
    description: 'Write high-quality content by conducting research, adding citations, improving hooks, and providing feedback.',
    category: 'ai',
    icon_url: ICON_PEN,
    author: 'Composio',
    source_url: 'https://github.com/ComposioHQ/awesome-claude-skills/tree/master/content-research-writer',
    content_url: 'https://raw.githubusercontent.com/ComposioHQ/awesome-claude-skills/master/content-research-writer/SKILL.md',
    tags: ['content', 'writing', 'research', 'citations', 'editing'],
    version: '1.0.0',
    content: `---
name: content-research-writer
description: Assists in writing high-quality content by conducting research, adding citations, improving hooks, iterating on outlines, and providing real-time feedback on each section. Transforms your writing process from solo effort to collaborative partnership.
---`,
    compatibility: ['claude', 'cursor', 'windsurf', 'opencode'],
  },
  {
    slug: 'twitter-optimizer',
    name: 'Twitter Algorithm Optimizer',
    description: 'Analyze and optimize tweets for maximum reach using Twitter\'s open-source algorithm insights.',
    category: 'ai',
    icon_url: ICON_X,
    author: 'Composio',
    source_url: 'https://github.com/ComposioHQ/awesome-claude-skills/tree/master/twitter-algorithm-optimizer',
    content_url: 'https://raw.githubusercontent.com/ComposioHQ/awesome-claude-skills/master/twitter-algorithm-optimizer/SKILL.md',
    tags: ['twitter', 'social-media', 'optimization', 'engagement'],
    version: '1.0.0',
    content: `---
name: twitter-algorithm-optimizer
description: Analyze and optimize tweets for maximum reach using Twitter's open-source algorithm insights. Rewrite and edit user tweets to improve engagement and visibility based on how the recommendation system ranks content.
license: AGPL-3.0 (referencing Twitter's algorithm source)
---`,
    compatibility: ['claude', 'cursor', 'windsurf', 'opencode'],
  },

  // ─── Business & Marketing / 商业与营销 ───
  {
    slug: 'domain-brainstormer',
    name: 'Domain Name Brainstormer',
    description: 'Generate creative domain name ideas and check availability across .com, .io, .dev, .ai, and more.',
    category: 'management',
    icon_url: ICON_GLOBE,
    author: 'Composio',
    source_url: 'https://github.com/ComposioHQ/awesome-claude-skills/tree/master/domain-name-brainstormer',
    content_url: 'https://raw.githubusercontent.com/ComposioHQ/awesome-claude-skills/master/domain-name-brainstormer/SKILL.md',
    tags: ['domain', 'naming', 'branding', 'startup'],
    version: '1.0.0',
    content: `---
name: domain-name-brainstormer
description: Generates creative domain name ideas for your project and checks availability across multiple TLDs (.com, .io, .dev, .ai, etc.). Saves hours of brainstorming and manual checking.
---`,
    compatibility: ['claude', 'cursor', 'windsurf', 'opencode'],
  },
  {
    slug: 'lead-research',
    name: 'Lead Research Assistant',
    description: 'Identify and qualify high-quality leads by analyzing products and providing actionable outreach strategies.',
    category: 'management',
    icon_url: ICON_TARGET,
    author: 'Composio',
    source_url: 'https://github.com/ComposioHQ/awesome-claude-skills/tree/master/lead-research-assistant',
    content_url: 'https://raw.githubusercontent.com/ComposioHQ/awesome-claude-skills/master/lead-research-assistant/SKILL.md',
    tags: ['leads', 'sales', 'research', 'outreach', 'marketing'],
    version: '1.0.0',
    content: `---
name: lead-research-assistant
description: Identifies high-quality leads for your product or service by analyzing your business, searching for target companies, and providing actionable contact strategies. Perfect for sales, business development, and marketing professionals.
---`,
    compatibility: ['claude', 'cursor', 'windsurf', 'opencode'],
  },

  // ─── Design (additional) / 设计（补充） ───
  {
    slug: 'image-enhancer',
    name: 'Image Enhancer',
    description: 'Improve image quality by enhancing resolution, sharpness, and clarity for presentations, docs, or social media.',
    category: 'design',
    icon_url: ICON_IMAGE,
    author: 'Composio',
    source_url: 'https://github.com/ComposioHQ/awesome-claude-skills/tree/master/image-enhancer',
    content_url: 'https://raw.githubusercontent.com/ComposioHQ/awesome-claude-skills/master/image-enhancer/SKILL.md',
    tags: ['image', 'enhance', 'screenshot', 'quality', 'upscale'],
    version: '1.0.0',
    content: `---
name: image-enhancer
description: Improves the quality of images, especially screenshots, by enhancing resolution, sharpness, and clarity. Perfect for preparing images for presentations, documentation, or social media posts.
---`,
    compatibility: ['claude', 'cursor', 'windsurf', 'opencode'],
  },
  {
    slug: 'brand-guidelines',
    name: 'Brand Guidelines',
    description: 'Apply official brand colors, typography, and styling to artifacts for consistent corporate identity.',
    category: 'design',
    icon_url: ICON_BRUSH,
    author: 'Composio',
    source_url: 'https://github.com/ComposioHQ/awesome-claude-skills/tree/master/brand-guidelines',
    content_url: 'https://raw.githubusercontent.com/ComposioHQ/awesome-claude-skills/master/brand-guidelines/SKILL.md',
    tags: ['brand', 'identity', 'colors', 'typography', 'styling'],
    version: '1.0.0',
    content: `---
name: brand-guidelines
description: Applies Anthropic's official brand colors and typography to any sort of artifact that may benefit from having Anthropic's look-and-feel. Use it when brand colors or style guidelines, visual formatting, or company design standards apply.
license: Complete terms in LICENSE.txt
---`,
    compatibility: ['claude', 'cursor', 'windsurf', 'opencode'],
  },

  // ─── AI (additional) / AI（补充） ───
  {
    slug: 'video-downloader',
    name: 'Video Downloader',
    description: 'Download YouTube videos with customizable quality and format options including audio-only MP3.',
    category: 'ai',
    icon_url: ICON_YOUTUBE,
    author: 'Composio',
    source_url: 'https://github.com/ComposioHQ/awesome-claude-skills/tree/master/video-downloader',
    content_url: 'https://raw.githubusercontent.com/ComposioHQ/awesome-claude-skills/master/video-downloader/SKILL.md',
    tags: ['youtube', 'video', 'download', 'mp3', 'audio'],
    version: '1.0.0',
    content: `---
name: youtube-downloader
description: Download YouTube videos with customizable quality and format options. Use this skill when the user asks to download, save, or grab YouTube videos. Supports various quality settings (best, 1080p, 720p, 480p, 360p), multiple formats (mp4, webm, mkv), and audio-only downloads as MP3.
---`,
    prerequisites: ['yt-dlp', 'Python 3'],
    compatibility: ['claude', 'cursor', 'windsurf', 'opencode'],
  },

  // ─── Meta Skills (continued) / 元技能（续） ───
  {
    slug: 'brainstorming',
    name: 'Brainstorming',
    description: 'Transform rough ideas into fully-formed designs through structured questioning and alternative exploration.',
    category: 'meta',
    icon_url: ICON_LIGHTBULB,
    author: 'obra',
    source_url: 'https://github.com/obra/superpowers/tree/main/skills/brainstorming',
    content_url: 'https://raw.githubusercontent.com/obra/superpowers/main/skills/brainstorming/SKILL.md',
    tags: ['brainstorm', 'ideation', 'design', 'thinking'],
    version: '1.0.0',
    content: `---
name: brainstorming
description: Use when the user has a rough idea and wants to explore it further. Transform rough ideas into fully-formed designs through structured questioning, alternative exploration, and systematic refinement.
---`,
    compatibility: ['claude', 'cursor', 'windsurf', 'opencode'],
  },
  {
    slug: 'kaizen',
    name: 'Kaizen (Continuous Improvement)',
    description: 'Apply continuous improvement methodology with multiple analytical approaches based on Lean and Kaizen philosophy.',
    category: 'meta',
    icon_url: ICON_INFINITY,
    author: 'NeoLab',
    source_url: 'https://github.com/NeoLabHQ/context-engineering-kit/tree/master/plugins/kaizen/skills/kaizen',
    content_url: 'https://raw.githubusercontent.com/NeoLabHQ/context-engineering-kit/master/plugins/kaizen/skills/kaizen/SKILL.md',
    tags: ['kaizen', 'lean', 'improvement', 'methodology', 'process'],
    version: '1.0.0',
    content: `---
description: Use when Code implementation and refactoring, architecturing or designing systems, process and workflow improvements, error handling and validation. Provide tehniquest to avoid over-engineering and apply iterative improvements.
---`,
    compatibility: ['claude', 'cursor', 'windsurf', 'opencode'],
  },
];

/**
 * Get registry version
 * 获取注册表版本
 */
export const SKILL_REGISTRY_VERSION = '1.0.0';
