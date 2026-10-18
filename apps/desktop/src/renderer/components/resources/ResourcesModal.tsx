import { Modal } from "../ui";
import { ExternalLinkIcon, BookOpenIcon, CodeIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

interface ResourcesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const RESOURCES = [
  {
    categoryKey: "promptGuides",
    icon: BookOpenIcon,
    items: [
      {
        name: "OpenAI Prompting",
        url: "https://platform.openai.com/docs/guides/prompting",
        descKey: "openaiGuideDesc",
      },
      {
        name: "OpenAI Prompt Engineering",
        url: "https://platform.openai.com/docs/guides/prompt-engineering/strategies-to-improve-reliability",
        descKey: "openaiPromptEngineeringDesc",
      },
      {
        name: "Anthropic Prompt Engineering",
        url: "https://docs.anthropic.com/en/docs/prompt-engineering",
        descKey: "anthropicGuideDesc",
      },
      {
        name: "Learn Prompting",
        url: "https://learnprompting.org/",
        descKey: "learnPromptingDesc",
      },
    ],
  },
  {
    categoryKey: "agentSkills",
    icon: CodeIcon,
    items: [
      {
        name: "Claude Code Docs",
        url: "https://docs.anthropic.com/en/docs/claude-code/overview",
        descKey: "claudeCodeOverviewDesc",
      },
      {
        name: "OpenAI Practical Guide to Building Agents",
        url: "https://openai.com/business/guides-and-resources/a-practical-guide-to-building-ai-agents/",
        descKey: "openaiAgentsGuideDesc",
      },
      {
        name: "Anthropic Tool Use Best Practices",
        url: "https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/implement-tool-use",
        descKey: "anthropicToolUseDesc",
      },
      {
        name: "MCP Quickstart",
        url: "https://modelcontextprotocol.io/quickstart",
        descKey: "mcpQuickstartDesc",
      },
    ],
  },
];

export function ResourcesModal({ isOpen, onClose }: ResourcesModalProps) {
  const { t } = useTranslation();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t("resources.title")}
      size="lg"
    >
      <div className="space-y-6">
        {RESOURCES.map((category) => (
          <div key={category.categoryKey} className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <category.icon className="w-4 h-4 text-primary" />
              {t(`resources.${category.categoryKey}`)}
            </h3>
            <div className="grid gap-2">
              {category.items.map((item) => (
                <a
                  key={item.name}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between p-4 rounded-xl bg-muted/50 hover:bg-accent transition-colors group"
                >
                  <div>
                    <h4 className="font-medium text-foreground group-hover:text-primary transition-colors">
                      {item.name}
                    </h4>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t(`resources.${item.descKey}`)}
                    </p>
                  </div>
                  <ExternalLinkIcon className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
