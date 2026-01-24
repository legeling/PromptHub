export const languages = {
  zh: '简体中文',
  en: 'English',
};

export const defaultLang = 'zh';

export const ui = {
  zh: {
    nav: {
      features: '特性',
      docs: '文档',
      changelog: '更新日志',
      download: '下载',
      github: 'GitHub 源码',
      star: 'Star',
      backers: '支持者',
    },
    hero: {
      version: 'v0.3.9 版已发布',
      titleStart: '专业的 Prompt IDE',
      titleEnd: '让提示词井然有序。',
      desc: '提示词管理｜版本控制｜多模型测试 —— 属于开发者与创作者的私有 Prompt 实验室。',
      download: '下载客户端',
      github: '开源协议',
      imgAlt: 'PromptHub 精美界面预览',
    },
    seo: {
      title: 'PromptHub - 开源本地优先的 AI 提示词管理工具',
      description: 'PromptHub 是一款开源、本地优先的 AI Prompt 管理工具。支持多版本管理、同屏模型对比、变量模板、全文搜索及 WebDAV 同步。保护隐私，让你的提示词工程更专业。',
      keywords: 'PromptHub, Prompt管理, 提示词工程, AI提示词, 开源, 本地优先, 提示词备份, 版本控制, 大模型工具',
      author: 'PromptHub Team',
    },
    features: {
      titleStart: '为',
      titleHighlight: '提示词工程师',
      titleEnd: '而生',
      subtitle: '告别散落在聊天记录里的 Prompt。升级到专业的 Prompt IDE，体验丝滑的生产力。',
      items: [
        {
          title: "极致私有：离线是最好的加密",
          desc: "你的 Prompt 永远不该作为别人的训练语料。全量数据本地加密存储，无需联网也可随时调用。",
        },
        {
          title: "同屏对比：一眼识破模型优劣",
          desc: "支持同时调用国内外主流大语言模型进行竞技测试，通过平行对比快速锁定最佳 Prompt。",
        },
        {
          title: "版本追踪：每一秒的灵感都可追溯",
          desc: "像管理代码一样管理 Prompt。支持细粒度版本变更记录，随时对比 Diff，一键回滚历史最佳状态。",
        },
        {
          title: "灵活变量：让 Prompt 像函数一样复用",
          desc: "内置 {{variable}} 语法解析器。一次编写多处复用，动态表单让复杂的交互输入变得轻松自如。",
        },
        {
          title: "瞬时搜索：海量提示词秒级定位",
          desc: "基于 SQLite FTS5 全文搜索。不论是按标题、标签还是内容，都能在毫秒间找到你需要的那个灵感。",
        },
        {
          title: "多格式导出：无缝衔接业务流程",
          desc: "支持一键导出为 JSON, YAML 或 CSV。让 Prompt 轻松集成到你的代码库、工作流或 API 调用中。",
        },
      ]
    },
    workflow: {
      title: '从灵感到落地的闭环工作流',
      items: [
        {
          step: "01",
          title: "灵感捕捉",
          desc: "在专业的编辑器中编写 Prompt，利用变量语法快速构建动态模板。"
        },
        {
          step: "02",
          title: "多维对标",
          desc: "一键发起多模型横向对比，在同一环境下量化不同模型的回复质量。"
        },
        {
          step: "03",
          title: "精进迭代",
          desc: "查看版本演进，对比每一次修改的优劣，沉淀出最稳健的 Prompt 资产。"
        }
      ]
    },
    values: {
      title: '为什么选择本地优先？',
      badge: '核心理念',
      desc: '在云端服务主导的时代，我们选择了一条不同的路——让你的数据完全属于你自己。',
      offlineLabel: '100% 离线可用',
      encryptLabel: 'AES-256 加密',
      items: [
        {
          title: "绝对隐私",
          desc: "敏感的业务逻辑和提示词不该托管在云端，本地存储从物理上杜绝泄露。"
        },
        {
          title: "零延迟体验",
          desc: "本地数据库毫秒级响应，无需等待网络同步，离线亦可流畅工作。"
        },
        {
          title: "无厂商锁定",
          desc: "数据格式透明，随时可以导出或同步至自己的私有云，真正拥有数据所有权。"
        }
      ]
    },
    download: {
      title: '即刻开启你的本地 Prompt 实验室',
      subtitle: '跨平台支持 macOS、Windows 及 Linux。隐私第一，永远开源且免费。',
      mac: {
        title: 'macOS',
        desc: '支持 10.15 及以上版本',
        btn: 'Apple Silicon (M1/M2/M3)',
        subBtn: 'Intel 芯片版本',
      },
      win: {
        title: 'Windows',
        desc: '支持 Windows 10/11',
        btn: '下载 x64 安装包',
        subBtn: '下载 ARM64 (Surface 等)',
      },
      linux: {
        title: 'Linux',
        desc: '支持主流发行版',
        btn: '下载 AppImage',
        subBtn: '下载 .deb 安装包',
      },
    },
    faq: {
      title: '常见问题',
      items: [
        {
          q: 'PromptHub 是完全免费的吗？',
          a: '是的，PromptHub 是一款完全开源且免费的软件。我们遵循 AGPL-3.0 协议，你可以在 GitHub 上查看所有源代码。'
        },
        {
          q: '数据存储在哪里？',
          a: '所有数据（包括提示词、配置、历史记录）都存储在你本地的 SQLite 数据库中。除非你手动开启 WebDAV 同步，否则数据绝不会离开你的设备。'
        },
        {
          q: '支持哪些 AI 模型？',
          a: '我们目前支持所有主流大语言模型、各类闭源及开源模型，以及通过第三方中转站提供的各类兼容接口。'
        },
        {
          q: '如何参与贡献？',
          a: '你可以通过 GitHub 提交 Issue 或 Pull Request。无论是 BUG 修复、功能建议还是文档翻译，我们都非常欢迎。'
        }
      ]
    },
    community: {
      title: '加入社区',
      github: 'GitHub 仓库',
      issues: '报告问题',
      releases: '版本历史',
      desc: 'PromptHub 是由社区驱动的开源项目。加入我们，一起打造更好、更隐私的 AI 工具。'
    },
    backers: {
      badge: '致谢捐赠者',
      title: '感谢支持者',
      subtitle: '感谢支持 PromptHub 开发的贡献者，你的认可支持我们继续前行。',
      becomeTitle: '成为支持者',
      becomeDesc: '支持开源，获得致谢',
      list: [
        { name: '*🌊', amount: '￥100.00', date: '2026-01-08', message: '支持优秀的软件！' },
        { name: '*昊', amount: '￥20.00', date: '2025-12-29', message: '感谢您的软件！能力有限，小小支持' }
      ]
    },
    footer: {
      rights: 'PromptHub. Open source under AGPL-3.0.',
      issues: '反馈问题',
    }
  },
  en: {
    nav: {
      features: 'Features',
      docs: 'Docs',
      changelog: 'Changelog',
      download: 'Download',
      github: 'View on GitHub',
      star: 'Star',
      backers: 'Backers',
    },
    hero: {
      version: 'v0.3.9 Released',
      titleStart: 'The Pro-Grade Workspace',
      titleEnd: 'For Your AI Prompts.',
      desc: 'Prompt Management | Version Control | Multi-Model Arena — A private laboratory for developers and creators.',
      download: 'Download Free',
      github: 'Source Code',
      imgAlt: 'PromptHub Interface Preview',
    },
    seo: {
      title: 'PromptHub - Open Source Local-First AI Prompt Manager',
      description: 'PromptHub is an open-source, local-first AI Prompt management tool. Features include version control, side-by-side model testing, variable templates, and WebDAV sync. Privacy-focused workspace for prompt engineers.',
      keywords: 'PromptHub, Prompt Management, Prompt Engineering, AI Prompts, Open Source, Local-first, Version Control, GPT, Claude, Gemini, LLM Testing',
    },
    features: {
      titleStart: 'Designed for',
      titleHighlight: 'Prompt Engineers',
      titleEnd: '',
      subtitle: 'Stop managing prompts in spreadsheets and chat history. Upgrade to a professional IDE.',
      items: [
        {
          title: "Local-First Privacy",
          desc: "Your prompts never leave your device. Encrypted storage with full ownership.",
        },
        {
          title: "Multi-Model Arena",
          desc: "Test one prompt against multiple mainstream LLMs and specialized models simultaneously.",
        },
        {
          title: "Version Time Machine",
          desc: "Every edit is saved. Diff, rollback, and branch your prompt iterations like code.",
        },
        {
          title: "Variable Templates",
          desc: "Use {{variable}} syntax to create dynamic, reusable prompt templates.",
        },
        {
          title: "Instant Search",
          desc: "Powered by SQLite FTS5. Find any prompt by title, tag, or content in milliseconds, no matter the scale.",
        },
        {
          title: "Multi-Format Export",
          desc: "Export to JSON, YAML, or CSV. Seamlessly integrate your prompts into your codebase or production APIs.",
        },
      ]
    },
    workflow: {
      title: 'Full Lifecycle Workflow',
      items: [
        {
          step: "01",
          title: "Capture Inspiration",
          desc: "Write prompts in a pro editor with variable support to build dynamic templates."
        },
        {
          step: "02",
          title: "Model Arena",
          desc: "Run side-by-side tests across multiple LLMs to quantify quality in one place."
        },
        {
          step: "03",
          title: "Iterate & Ship",
          desc: "Track every version, compare diffs, and deploy your best prompts with confidence."
        }
      ]
    },
    values: {
      title: 'Why Local-First?',
      badge: 'Core Philosophy',
      desc: 'In an era dominated by cloud services, we chose a different path — your data belongs entirely to you.',
      offlineLabel: '100% Offline',
      encryptLabel: 'AES-256 Encryption',
      items: [
        {
          title: "Absolute Privacy",
          desc: "Your business logic and sensitive prompts should stay off the cloud. Physics-level security."
        },
        {
          title: "Zero Latency",
          desc: "Millisecond database response. No waiting for sync, work fluently even offline."
        },
        {
          title: "No Vendor Lock-in",
          desc: "Transparent data formats. Export or sync to your own private cloud whenever you want."
        }
      ]
    },
    download: {
      title: 'Start Your Journey',
      subtitle: 'Available for macOS, Windows, and Linux. Free and Open Source.',
      mac: {
        title: 'macOS',
        desc: 'macOS 10.15+',
        btn: 'Apple Silicon',
        subBtn: 'Download Intel Version',
      },
      win: {
        title: 'Windows',
        desc: 'Windows 10/11',
        btn: 'Download x64 Installer',
        subBtn: 'Download ARM64 Version',
      },
      linux: {
        title: 'Linux',
        desc: 'Mainstream Distros',
        btn: 'AppImage',
        subBtn: 'Download .deb',
      },
    },
    faq: {
      title: 'Common Questions',
      items: [
        {
          q: 'Is PromptHub completely free?',
          a: 'Yes, PromptHub is 100% open-source and free to use. Licensed under AGPL-3.0.'
        },
        {
          q: 'Where is my data stored?',
          a: 'All data is stored in a local SQLite database on your machine. Your prompts stay private by default.'
        },
        {
          q: 'Which AI models are supported?',
          a: 'We support all mainstream LLMs, various open-source models, and custom providers via API proxies.'
        },
        {
          q: 'How can I contribute?',
          a: 'Feel free to open issues or pull requests on our GitHub repository. We love community contributions!'
        }
      ]
    },
    community: {
      title: 'Community',
      github: 'GitHub Repo',
      issues: 'Issues',
      releases: 'Changelog',
      desc: 'PromptHub is built by the community. Join us in shaping the future of privacy-focused AI tools.'
    },
    backers: {
      badge: 'Special Thanks',
      title: 'Backers Arena',
      subtitle: 'Heartfelt thanks to those who support the development of PromptHub.',
      becomeTitle: 'Become a Backer',
      becomeDesc: 'Support Open Source',
      list: [
        { name: '*🌊', amount: '￥100.00', date: '2026-01-08', message: 'Support excellent software!' },
        { name: '*昊', amount: '￥20.00', date: '2025-12-29', message: 'Thanks for your software! Limited capacity, small support.' }
      ]
    },
    footer: {
      rights: 'PromptHub. Open source under AGPL-3.0.',
      issues: 'Issues',
    }
  },
} as const;
