import { Select, type SelectOption } from "../ui/Select";

const OUTLINED_TRIGGER_CLASS =
  "flex h-10 w-full items-center justify-between gap-2 rounded-md border " +
  "border-input bg-background px-3 text-left text-sm text-foreground " +
  "shadow-sm outline-none transition-colors hover:border-primary/40 " +
  "focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed " +
  "disabled:bg-muted/40 disabled:text-muted-foreground disabled:shadow-none";

interface AgentProviderFormSelectProps {
  label: string;
  value: string;
  options: SelectOption[];
  disabled?: boolean;
  onChange: (value: string) => void;
}

export function AgentProviderFormSelect({
  label,
  value,
  options,
  disabled = false,
  onChange,
}: AgentProviderFormSelectProps) {
  return (
    <label className="block w-full space-y-1.5">
      <span className="block text-sm font-medium text-foreground">{label}</span>
      <Select
        value={value}
        onChange={onChange}
        options={options}
        ariaLabel={label}
        disabled={disabled}
        triggerClassName={OUTLINED_TRIGGER_CLASS}
        presentation="form"
      />
    </label>
  );
}

export function providerKindOptions(
  platformId: string,
  platformNativeLabel: string,
): SelectOption[] {
  const labels: Record<string, string> = {
    kimi: "Kimi",
    openai: "OpenAI",
    openai_responses: "OpenAI Responses",
    anthropic: "Anthropic",
    "google-genai": "Google Generative AI",
    vertexai: "Vertex AI",
    "openai-compatible": "OpenAI Compatible",
    "openai-responses": "OpenAI Responses",
    grok: "Grok",
    gemini: "Google Generative AI",
    "vertex-ai": "Vertex AI",
    "qwen-oauth": "Qwen OAuth",
    "platform-native": platformNativeLabel,
  };
  const values =
    platformId === "kimi"
      ? [
          "kimi",
          "openai",
          "openai_responses",
          "anthropic",
          "google-genai",
          "vertexai",
        ]
      : platformId === "grok"
        ? ["openai-compatible", "openai-responses", "anthropic", "grok"]
        : platformId === "qwen"
          ? ["openai", "anthropic", "gemini", "vertex-ai", "qwen-oauth"]
          : ["openai-compatible", "openai", "platform-native"];

  return values.map((value) => ({ value, label: labels[value] }));
}

interface ProtocolLabels {
  platformNative: string;
  anthropicMessages: string;
  googleGenerativeAi: string;
}

export function protocolOptions(
  platformId: string,
  labels: ProtocolLabels,
): SelectOption[] {
  const options: SelectOption[] = [
    { value: "platform-native", label: labels.platformNative },
  ];
  if (platformId === "antigravity-cli") return options;

  if (platformId === "claude") {
    return [
      ...options,
      { value: "anthropic-messages", label: labels.anthropicMessages },
    ];
  }
  if (platformId === "gemini") {
    return [
      ...options,
      { value: "google-generative-ai", label: labels.googleGenerativeAi },
    ];
  }

  if (platformId !== "codex")
    options.push({ value: "openai-chat", label: "OpenAI Chat" });
  if (platformId !== "qwen") {
    options.push({ value: "openai-responses", label: "OpenAI Responses" });
  }
  if (platformId === "kimi" || platformId === "grok" || platformId === "qwen") {
    options.push({
      value: "anthropic-messages",
      label: labels.anthropicMessages,
    });
  }
  if (platformId === "kimi" || platformId === "qwen") {
    options.push({
      value: "google-generative-ai",
      label: labels.googleGenerativeAi,
    });
  }
  return options;
}

export function primaryModelExample(platformId: string): string {
  const examples: Record<string, string> = {
    codex: "gpt-5.6-sol",
    claude: "claude-sonnet-4-6",
    gemini: "gemini-3.6-flash",
    kimi: "kimi-k2.5",
    grok: "grok-4.5",
    qwen: "qwen3.5-plus",
    opencode: "openai/gpt-5.6",
  };
  return examples[platformId] ?? "model-id";
}
