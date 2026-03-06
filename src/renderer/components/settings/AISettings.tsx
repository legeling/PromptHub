/**
 * AISettings — AI model management tab
 * Handles: chat model config, image model config, model testing, model picker
 * AI 模型管理标签页：对话模型配置、生图模型配置、模型测试、模型选择器
 */

import { useState, useMemo, useCallback } from "react";
import {
  CheckIcon,
  RefreshCwIcon,
  PlayIcon,
  Loader2Icon,
  PlusIcon,
  TrashIcon,
  StarIcon,
  EditIcon,
  SearchIcon,
  XIcon,
  ChevronDownIcon,
  ChevronRightIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  testAIConnection,
  testImageGeneration,
  fetchAvailableModels,
  getBaseUrl,
  getApiEndpointPreview,
  getImageApiEndpointPreview,
  AITestResult,
  ImageTestResult,
  ModelInfo,
  StreamCallbacks,
} from "../../services/ai";
import { useSettingsStore } from "../../stores/settings.store";
import { useToast } from "../ui/Toast";
import { Select } from "../ui/Select";
import { getCategoryIcon } from "../ui/ModelIcons";
import { SettingSection, SettingItem, PasswordInput } from "./shared";

// AI model providers - support dynamic model input
// AI 模型提供商 - 支持动态模型输入
const AI_PROVIDERS = [
  // International / 国际
  {
    id: "openai",
    name: "OpenAI",
    defaultUrl: "https://api.openai.com",
    group: "International / 国际",
  },
  {
    id: "google",
    name: "Google",
    defaultUrl: "https://generativelanguage.googleapis.com",
    group: "International / 国际",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    defaultUrl: "https://api.anthropic.com",
    group: "International / 国际",
  },
  {
    id: "xai",
    name: "xAI",
    defaultUrl: "https://api.x.ai",
    group: "International / 国际",
  },
  {
    id: "mistral",
    name: "Mistral AI",
    defaultUrl: "https://api.mistral.ai",
    group: "International / 国际",
  },

  // Domestic / 国内
  {
    id: "deepseek",
    name: "DeepSeek",
    defaultUrl: "https://api.deepseek.com",
    group: "Domestic / 国内",
  },
  {
    id: "moonshot",
    name: "Moonshot",
    defaultUrl: "https://api.moonshot.cn",
    group: "Domestic / 国内",
  },
  {
    id: "zhipu",
    name: "智谱 AI",
    defaultUrl: "https://open.bigmodel.cn/api/paas",
    group: "Domestic / 国内",
  },
  {
    id: "qwen",
    name: "通义千问",
    defaultUrl: "https://dashscope.aliyuncs.com/compatible-mode",
    group: "Domestic / 国内",
  },
  {
    id: "ernie",
    name: "文心一言",
    defaultUrl: "https://qianfan.baidubce.com/v2",
    group: "Domestic / 国内",
  },
  {
    id: "spark",
    name: "讯飞星火",
    defaultUrl: "https://spark-api-open.xf-yun.com",
    group: "Domestic / 国内",
  },
  {
    id: "doubao",
    name: "豆包",
    defaultUrl: "https://ark.cn-beijing.volces.com/api",
    group: "Domestic / 国内",
  },
  {
    id: "baichuan",
    name: "百川智能",
    defaultUrl: "https://api.baichuan-ai.com",
    group: "Domestic / 国内",
  },
  {
    id: "minimax",
    name: "MiniMax",
    defaultUrl: "https://api.minimax.chat",
    group: "Domestic / 国内",
  },
  {
    id: "stepfun",
    name: "阶跃星辰",
    defaultUrl: "https://api.stepfun.com",
    group: "Domestic / 国内",
  },
  {
    id: "yi",
    name: "零一万物 (Yi)",
    defaultUrl: "https://api.lingyiwanwu.com",
    group: "Domestic / 国内",
  },

  // Other / 其他
  { id: "azure", name: "Azure OpenAI", defaultUrl: "", group: "Other / 其他" },
  {
    id: "ollama",
    name: "Ollama (本地)",
    defaultUrl: "http://localhost:11434",
    group: "Other / 其他",
  },
  {
    id: "custom",
    name: "自定义 (OpenAI 兼容)",
    defaultUrl: "",
    group: "Other / 其他",
  },
];

const AI_IMAGE_PROVIDERS = [
  // International / 国际
  {
    id: "openai",
    name: "OpenAI",
    defaultUrl: "https://api.openai.com",
    group: "International / 国际",
  },
  {
    id: "google",
    name: "Google",
    defaultUrl: "https://generativelanguage.googleapis.com",
    group: "International / 国际",
  },
  {
    id: "flux",
    name: "FLUX",
    defaultUrl: "https://api.bfl.ai",
    group: "International / 国际",
  },
  {
    id: "ideogram",
    name: "Ideogram",
    defaultUrl: "https://api.ideogram.ai",
    group: "International / 国际",
  },
  {
    id: "recraft",
    name: "Recraft",
    defaultUrl: "https://external.api.recraft.ai",
    group: "International / 国际",
  },
  {
    id: "stability",
    name: "Stability AI",
    defaultUrl: "https://api.stability.ai",
    group: "International / 国际",
  },
  {
    id: "replicate",
    name: "Replicate",
    defaultUrl: "https://api.replicate.com",
    group: "International / 国际",
  },
  {
    id: "xai",
    name: "xAI",
    defaultUrl: "https://api.x.ai",
    group: "International / 国际",
  },

  // Other / 其他
  { id: "azure", name: "Azure OpenAI", defaultUrl: "", group: "Other / 其他" },
  {
    id: "custom",
    name: "自定义 (OpenAI 兼容)",
    defaultUrl: "",
    group: "Other / 其他",
  },
];

type ImageSize =
  | "256x256"
  | "512x512"
  | "1024x1024"
  | "1024x1792"
  | "1792x1024";
type ImageQuality = "standard" | "hd";
type ImageStyle = "vivid" | "natural";

// Model categorization config: prefer matching specific providers by owned_by/id keywords
// 模型分类配置：优先按 owned_by / id 关键字匹配到具体供应商
// Moved outside component to avoid re-creation on every render
// 移到组件外部，避免每次渲染重新创建
const MODEL_CATEGORY_CONFIG: {
  category: string;
  idKeywords?: string[];
  ownerKeywords?: string[];
}[] = [
  {
    category: "GPT",
    idKeywords: ["gpt", "o1-", "o3-"],
    ownerKeywords: ["openai"],
  },
  {
    category: "Claude",
    idKeywords: ["claude"],
    ownerKeywords: ["anthropic"],
  },
  {
    category: "Gemini",
    idKeywords: ["gemini"],
    ownerKeywords: ["google", "vertexai"],
  },
  {
    category: "DeepSeek",
    idKeywords: ["deepseek"],
    ownerKeywords: ["deepseek"],
  },
  {
    category: "Qwen",
    idKeywords: ["qwen", "qwq"],
    ownerKeywords: ["qwen", "aliyun", "dashscope"],
  },
  {
    category: "Doubao",
    idKeywords: ["doubao"],
    ownerKeywords: ["doubao", "volcengine"],
  },
  { category: "GLM", idKeywords: ["glm", "zhipu"], ownerKeywords: ["zhipu"] },
  {
    category: "Moonshot",
    idKeywords: ["moonshot", "kimi"],
    ownerKeywords: ["moonshot"],
  },
  {
    category: "Llama",
    idKeywords: ["llama"],
    ownerKeywords: ["meta", "llama"],
  },
  {
    category: "Mistral",
    idKeywords: ["mistral", "mixtral"],
    ownerKeywords: ["mistral"],
  },
  {
    category: "Yi",
    idKeywords: ["yi-"],
    ownerKeywords: ["01-ai", "zeroone", "zero-one"],
  },
  {
    category: "ERNIE",
    idKeywords: ["ernie", "wenxin"],
    ownerKeywords: ["baidu", "wenxin"],
  },
  {
    category: "Spark",
    idKeywords: ["spark", "xunfei"],
    ownerKeywords: ["xunfei", "iflytek"],
  },
  {
    category: "Baichuan",
    idKeywords: ["baichuan"],
    ownerKeywords: ["baichuan"],
  },
  {
    category: "Hunyuan",
    idKeywords: ["hunyuan"],
    ownerKeywords: ["tencent"],
  },
  {
    category: "Minimax",
    idKeywords: ["minimax", "abab"],
    ownerKeywords: ["minimax"],
  },
  {
    category: "Stepfun",
    idKeywords: ["step-", "stepfun"],
    ownerKeywords: ["stepfun"],
  },
];

// Category ordering (common first)
// 分类排序（常用的在前）
// Moved outside component to avoid re-creation on every render
// 移到组件外部，避免每次渲染重新创建
const CATEGORY_ORDER = [
  "GPT",
  "Claude",
  "Gemini",
  "DeepSeek",
  "Qwen",
  "Doubao",
  "GLM",
  "Moonshot",
  "Llama",
  "Mistral",
  "Yi",
  "ERNIE",
  "Spark",
  "Baichuan",
  "Embedding",
  "Audio",
  "Image",
  "Other",
];

// Image model category ordering (Gemini -> nanobananai 🍌)
// 生图模型分类排序（Gemini -> nanobananai 🍌）
const IMAGE_CATEGORY_ORDER = CATEGORY_ORDER.map((c) =>
  c === "Gemini" ? "nanobananai 🍌" : c,
);

export function AISettings() {
  const { t } = useTranslation();
  const { showToast } = useToast();

  // Use settings store
  // 使用 settings store
  const settings = useSettingsStore();

  // AI test state
  // AI 测试状态
  const [aiTesting, setAiTesting] = useState(false);
  const [aiTestResult, setAiTestResult] = useState<AITestResult | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [compareConfig, setCompareConfig] = useState({
    provider: "",
    apiKey: "",
    apiUrl: "",
    model: "",
  });
  const [compareTesting, setCompareTesting] = useState(false);
  const [compareResult, setCompareResult] = useState<AITestResult | null>(null);

  // Image test state
  // 图像测试状态
  const [imageTesting, setImageTesting] = useState(false);
  const [imageTestResult, setImageTestResult] =
    useState<ImageTestResult | null>(null);
  const [imagePrompt, setImagePrompt] = useState(
    "A cute cat sitting on a windowsill",
  );
  const [imageSize, setImageSize] = useState<ImageSize>("1024x1024");
  const [imageQuality, setImageQuality] = useState<ImageQuality>("standard");
  const [imageStyle, setImageStyle] = useState<ImageStyle>("vivid");

  // Multi-model configuration state
  // 多模型配置状态
  const [showAddChatModel, setShowAddChatModel] = useState(false);
  const [showAddImageModel, setShowAddImageModel] = useState(false);
  const [editingModelId, setEditingModelId] = useState<string | null>(null);

  // Update dialog state
  // 更新对话框状态
  const [editingModelType, setEditingModelType] = useState<"chat" | "image">(
    "chat",
  );
  const [newModel, setNewModel] = useState({
    name: "",
    provider: "openai",
    apiKey: "",
    apiUrl: "",
    model: "",
  });
  // Chat model parameters state
  // 对话模型参数配置状态
  const [chatParams, setChatParams] = useState({
    temperature: 0.7,
    maxTokens: 2048,
    topP: 1.0,
    topK: undefined as number | undefined,
    frequencyPenalty: 0,
    presencePenalty: 0,
    stream: false,
    enableThinking: false,
    customParams: {} as Record<string, string | number | boolean>,
  });
  // Image model parameters state
  // 图像模型参数配置状态
  const [imageParams, setImageParams] = useState({
    size: "1024x1024",
    quality: "standard" as "standard" | "hd",
    style: "vivid" as "vivid" | "natural",
    n: 1,
  });
  // Show advanced parameters
  // 是否显示高级参数
  const [showAdvancedParams, setShowAdvancedParams] = useState(false);
  const [testingModelId, setTestingModelId] = useState<string | null>(null);

  // Model list fetching state (chat models)
  // 获取模型列表状态（对话模型）
  const [fetchingModels, setFetchingModels] = useState(false);
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [modelSearchQuery, setModelSearchQuery] = useState("");
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(
    new Set(),
  );

  // Model list fetching state (image models)
  // 获取模型列表状态（生图模型）
  const [fetchingImageModels, setFetchingImageModels] = useState(false);
  const [availableImageModels, setAvailableImageModels] = useState<ModelInfo[]>(
    [],
  );
  const [showImageModelPicker, setShowImageModelPicker] = useState(false);
  const [imageModelSearchQuery, setImageModelSearchQuery] = useState("");
  const [collapsedImageCategories, setCollapsedImageCategories] = useState<
    Set<string>
  >(new Set());

  // Image test result modal
  // 生图测试结果弹窗
  const [imageTestModalResult, setImageTestModalResult] =
    useState<ImageTestResult | null>(null);

  // Streaming output state
  // 流式输出状态
  const [streamingContent, setStreamingContent] = useState("");
  const [streamingThinking, setStreamingThinking] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);

  // Provider collapse state
  // 供应商折叠状态
  const [collapsedProviders, setCollapsedProviders] = useState<Set<string>>(
    new Set(),
  );

  // Separate chat models and image models (memoized)
  // 分离对话模型和生图模型（已缓存）
  const chatModels = useMemo(
    () => settings.aiModels.filter((m) => m.type === "chat" || !m.type),
    [settings.aiModels],
  );
  const imageModels = useMemo(
    () => settings.aiModels.filter((m) => m.type === "image"),
    [settings.aiModels],
  );

  // Filter model list (chat models, memoized)
  // 过滤模型列表（对话模型，已缓存）
  const filteredModels = useMemo(
    () =>
      availableModels.filter(
        (m) =>
          m.id.toLowerCase().includes(modelSearchQuery.toLowerCase()) ||
          m.owned_by?.toLowerCase().includes(modelSearchQuery.toLowerCase()),
      ),
    [availableModels, modelSearchQuery],
  );

  // Filter model list (image models, memoized)
  // 过滤模型列表（生图模型，已缓存）
  const filteredImageModels = useMemo(
    () =>
      availableImageModels.filter(
        (m) =>
          m.id.toLowerCase().includes(imageModelSearchQuery.toLowerCase()) ||
          m.owned_by
            ?.toLowerCase()
            .includes(imageModelSearchQuery.toLowerCase()),
      ),
    [availableImageModels, imageModelSearchQuery],
  );

  // Model categorization: prefer config; fallback to general heuristics
  // 模型分类函数：配置优先，失败再按通用规则降级
  const getModelCategory = (model: any): string => {
    // If it's an AIConfig (configured model), use model.model as the ID
    // If it's a ModelInfo (available model), use model.id as the ID
    const id = (model.model || model.id || "").toLowerCase();
    const owner = model.owned_by?.toLowerCase() || "";

    // 1) Match provider by owned_by
    // 1. 先按 owned_by 匹配供应商
    for (const item of MODEL_CATEGORY_CONFIG) {
      if (
        item.ownerKeywords &&
        item.ownerKeywords.some((k) => owner.includes(k))
      ) {
        return item.category;
      }
    }

    // 2) Match provider by id keywords
    // 2. 再按 id 关键字匹配供应商
    for (const item of MODEL_CATEGORY_CONFIG) {
      if (item.idKeywords && item.idKeywords.some((k) => id.includes(k))) {
        return item.category;
      }
    }

    // 3) Fallback by model type
    // 3. 按模型类型降级分类
    if (id.includes("embedding") || id.includes("text-embedding"))
      return "Embedding";
    if (id.includes("whisper") || id.includes("tts")) return "Audio";
    if (id.includes("dall-e") || id.includes("stable-diffusion"))
      return "Image";

    return "Other";
  };

  // Group models by category
  // 按分类组织模型
  // Group models by category + sort categories (memoized)
  // 按分类组织模型 + 排序分类（已缓存）
  const { categorizedModels, sortedCategories } = useMemo(() => {
    const categorized = filteredModels.reduce(
      (acc, model) => {
        const category = getModelCategory(model);
        if (!acc[category]) acc[category] = [];
        acc[category].push(model);
        return acc;
      },
      {} as Record<string, ModelInfo[]>,
    );

    const sorted = Object.keys(categorized).sort((a, b) => {
      const indexA = CATEGORY_ORDER.indexOf(a);
      const indexB = CATEGORY_ORDER.indexOf(b);
      return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
    });

    return { categorizedModels: categorized, sortedCategories: sorted };
  }, [filteredModels]);

  // Toggle category collapse state (chat models, memoized callback)
  // 切换分类折叠状态（对话模型，已缓存回调）
  const toggleCategory = useCallback((category: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  }, []);

  // Toggle category collapse state (image models, memoized callback)
  // 切换分类折叠状态（生图模型，已缓存回调）
  const toggleImageCategory = useCallback((category: string) => {
    setCollapsedImageCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  }, []);

  const toggleProviderCollapse = useCallback((apiUrl: string) => {
    setCollapsedProviders((prev) => {
      const next = new Set(prev);
      if (next.has(apiUrl)) {
        next.delete(apiUrl);
      } else {
        next.add(apiUrl);
      }
      return next;
    });
  }, []);

  // Group image models by category + sort categories (memoized)
  // 按分类组织生图模型 + 排序分类（已缓存）
  const { categorizedImageModels, sortedImageCategories } = useMemo(() => {
    const categorized = filteredImageModels.reduce(
      (acc, model) => {
        let category = getModelCategory(model);
        // Rename Gemini to nanobananai 🍌 for image models to avoid confusion with text models
        // 在生图模型中，将 Gemini 改名为 nanobananai 🍌，避免与文本模型混淆
        if (category === "Gemini") {
          category = "nanobananai 🍌";
        }
        if (!acc[category]) acc[category] = [];
        acc[category].push(model);
        return acc;
      },
      {} as Record<string, ModelInfo[]>,
    );

    const sorted = Object.keys(categorized).sort((a, b) => {
      const indexA = IMAGE_CATEGORY_ORDER.indexOf(a);
      const indexB = IMAGE_CATEGORY_ORDER.indexOf(b);
      return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
    });

    return {
      categorizedImageModels: categorized,
      sortedImageCategories: sorted,
    };
  }, [filteredImageModels]);

  // Compute preview URLs
  // 计算预览 URL
  const previewBaseUrl = getBaseUrl(newModel.apiUrl);
  const previewEndpoint = getApiEndpointPreview(newModel.apiUrl);
  const previewImageEndpoint = getImageApiEndpointPreview(newModel.apiUrl);

  // Group added models by provider (API URL, memoized)
  // 按供应商（API URL）分组已添加的模型（已缓存）
  const groupedChatModels = useMemo(
    () =>
      chatModels.reduce(
        (acc, model) => {
          const key = model.apiUrl || "unknown";
          if (!acc[key]) {
            const providerInfo = AI_PROVIDERS.find(
              (p) => p.id === model.provider,
            );
            acc[key] = {
              provider: providerInfo?.name || model.provider,
              providerId: model.provider,
              models: [],
            };
          }
          acc[key].models.push(model);
          return acc;
        },
        {} as Record<
          string,
          { provider: string; providerId: string; models: typeof chatModels }
        >,
      ),
    [chatModels],
  );

  // Group image models by provider (memoized)
  // 按供应商分组生图模型（已缓存）
  const groupedImageModels = useMemo(
    () =>
      imageModels.reduce(
        (acc, model) => {
          const key = model.apiUrl || "unknown";
          if (!acc[key]) {
            const providerInfo = AI_IMAGE_PROVIDERS.find(
              (p) => p.id === model.provider,
            );
            acc[key] = {
              provider: providerInfo?.name || model.provider,
              providerId: model.provider,
              models: [],
            };
          }
          acc[key].models.push(model);
          return acc;
        },
        {} as Record<
          string,
          { provider: string; providerId: string; models: typeof imageModels }
        >,
      ),
    [imageModels],
  );

  // Test single chat model (supports streaming and parameter config)
  // 测试单个对话模型（支持流式输出和参数配置）
  const handleTestModel = async (model: (typeof settings.aiModels)[0]) => {
    setTestingModelId(model.id);
    setAiTestResult(null);
    setStreamingContent("");
    setStreamingThinking("");

    const useStream = model.chatParams?.stream ?? false;

    if (useStream) {
      setIsStreaming(true);
    }

    const result = await testAIConnection(
      {
        provider: model.provider,
        apiKey: model.apiKey,
        apiUrl: model.apiUrl,
        model: model.model,
        chatParams: model.chatParams,
      },
      undefined,
      useStream
        ? {
            onContent: (chunk) => setStreamingContent((prev) => prev + chunk),
            onThinking: (chunk) => setStreamingThinking((prev) => prev + chunk),
          }
        : undefined,
    );

    setIsStreaming(false);
    setAiTestResult(result);
    setTestingModelId(null);

    if (result.success) {
      const thinkingInfo = result.thinkingContent ? " (含思考过程)" : "";
      showToast(`连接成功 (${result.latency}ms)${thinkingInfo}`, "success");
    } else {
      showToast(result.error || "连接失败", "error");
    }
  };

  // Test a single image model
  // 测试单个生图模型
  const handleTestImageModel = async (model: (typeof settings.aiModels)[0]) => {
    setTestingModelId(model.id);

    const result = await testImageGeneration(
      {
        provider: model.provider,
        apiKey: model.apiKey,
        apiUrl: model.apiUrl,
        model: model.model,
      },
      "A cute cat sitting on a windowsill",
    );

    setTestingModelId(null);

    // Show result modal
    // 显示结果弹窗
    setImageTestModalResult(result);
  };

  // Fetch available model list (chat models)
  // 获取可用模型列表（对话模型）
  const handleFetchModels = async () => {
    if (!newModel.apiKey || !newModel.apiUrl) {
      showToast(t("settings.fillApiFirst"), "error");
      return;
    }

    setFetchingModels(true);
    setAvailableModels([]);
    setModelSearchQuery("");

    const result = await fetchAvailableModels(newModel.apiUrl, newModel.apiKey);

    setFetchingModels(false);

    if (result.success && result.models.length > 0) {
      setAvailableModels(result.models);
      setShowModelPicker(true);
      showToast(
        t("settings.modelsLoaded", { count: result.models.length }),
        "success",
      );
    } else {
      showToast(result.error || t("settings.noModelsFound"), "error");
    }
  };

  // Fetch available model list (image models)
  // 获取可用模型列表（生图模型）
  const handleFetchImageModels = async () => {
    if (!newModel.apiKey || !newModel.apiUrl) {
      showToast(t("settings.fillApiFirst"), "error");
      return;
    }

    setFetchingImageModels(true);
    setAvailableImageModels([]);

    const result = await fetchAvailableModels(newModel.apiUrl, newModel.apiKey);

    setFetchingImageModels(false);

    if (result.success && result.models.length > 0) {
      setAvailableImageModels(result.models);
      setShowImageModelPicker(true);
      showToast(
        t("settings.modelsLoaded", { count: result.models.length }),
        "success",
      );
    } else {
      showToast(result.error || t("settings.noModelsFound"), "error");
    }
  };

  // Add selected model (chat models)
  // 添加选中的模型（对话模型）
  const handleAddModel = (modelId: string) => {
    if (!newModel.apiKey || !newModel.apiUrl) {
      showToast(t("settings.fillApiFirst"), "error");
      return;
    }

    // Add model to list
    // 添加模型到列表
    settings.addAiModel({
      name: modelId,
      provider: newModel.provider,
      apiKey: newModel.apiKey,
      apiUrl: newModel.apiUrl,
      model: modelId,
      type: "chat",
    });
    showToast(t("settings.modelAdded"), "success");
  };

  // Add selected model (image models)
  // 添加选中的模型（生图模型）
  const handleAddImageModel = (modelId: string) => {
    if (!newModel.apiKey || !newModel.apiUrl) {
      showToast(t("settings.fillApiFirst"), "error");
      return;
    }

    // Add model to list
    // 添加模型到列表
    settings.addAiModel({
      name: modelId,
      provider: newModel.provider,
      apiKey: newModel.apiKey,
      apiUrl: newModel.apiUrl,
      model: modelId,
      type: "image",
    });
    showToast(t("settings.modelAdded"), "success");
  };

  // AI test helper
  // AI 测试函数
  const handleTestAI = async () => {
    if (!settings.aiApiKey || !settings.aiApiUrl || !settings.aiModel) {
      showToast(t("toast.configApiKey"), "error");
      return;
    }

    setAiTesting(true);
    setAiTestResult(null);

    const result = await testAIConnection({
      provider: settings.aiProvider,
      apiKey: settings.aiApiKey,
      apiUrl: settings.aiApiUrl,
      model: settings.aiModel,
    });

    setAiTestResult(result);
    setAiTesting(false);

    if (result.success) {
      showToast(
        `${t("toast.connectionSuccess")} (${result.latency}ms)`,
        "success",
      );
    } else {
      showToast(result.error || t("toast.connectionFailed"), "error");
    }
  };

  // Compare test helper
  // 对比测试函数
  const handleCompareTest = async () => {
    if (!settings.aiApiKey || !compareConfig.apiKey) {
      showToast(t("toast.configApiKey"), "error");
      return;
    }

    setAiTesting(true);
    setCompareTesting(true);
    setAiTestResult(null);
    setCompareResult(null);

    // Test both models in parallel
    // 并行测试两个模型
    const [result1, result2] = await Promise.all([
      testAIConnection({
        provider: settings.aiProvider,
        apiKey: settings.aiApiKey,
        apiUrl: settings.aiApiUrl,
        model: settings.aiModel,
      }),
      testAIConnection({
        provider: compareConfig.provider || "custom",
        apiKey: compareConfig.apiKey,
        apiUrl: compareConfig.apiUrl,
        model: compareConfig.model,
      }),
    ]);

    setAiTestResult(result1);
    setCompareResult(result2);
    setAiTesting(false);
    setCompareTesting(false);
  };

  const handleTestImage = async () => {
    if (!settings.aiApiKey || !settings.aiApiUrl || !settings.aiModel) {
      showToast(t("toast.configApiKey"), "error");
      return;
    }

    setImageTesting(true);
    setImageTestResult(null);

    const result = await testImageGeneration(
      {
        provider: settings.aiProvider,
        apiKey: settings.aiApiKey,
        apiUrl: settings.aiApiUrl,
        model: settings.aiModel,
      },
      imagePrompt,
    );

    setImageTestResult(result);
    setImageTesting(false);

    if (result.success) {
      showToast(
        `${t("toast.connectionSuccess")} (${result.latency}ms)`,
        "success",
      );
    } else {
      showToast(result.error || t("toast.connectionFailed"), "error");
    }
  };

  return (
    <>
      <div className="space-y-6">
        {/* 对话模型列表 - 按供应商分组 */}
        <SettingSection title={t("settings.chatModels")}>
          <div className="p-4 space-y-3">
            {Object.keys(groupedChatModels).length > 0 && (
              <div className="space-y-2">
                {Object.entries(groupedChatModels).map(([apiUrl, group]) => {
                  const isCollapsed = collapsedProviders.has(apiUrl);
                  const hasDefault = group.models.some((m) => m.isDefault);

                  return (
                    <div
                      key={apiUrl}
                      className="border border-border rounded-lg overflow-hidden"
                    >
                      {/* 供应商标题 */}
                      <button
                        onClick={() => toggleProviderCollapse(apiUrl)}
                        className={`w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors ${
                          hasDefault ? "bg-primary/5" : "bg-muted/30"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {isCollapsed ? (
                            <ChevronRightIcon className="w-4 h-4 text-muted-foreground" />
                          ) : (
                            <ChevronDownIcon className="w-4 h-4 text-muted-foreground" />
                          )}
                          <span className="flex-shrink-0">
                            {getCategoryIcon(
                              group.providerId === "custom" ||
                                group.providerId === "azure" ||
                                group.providerId === "ollama"
                                ? group.models.length > 0
                                  ? getModelCategory(group.models[0])
                                  : "Other"
                                : group.providerId === "openai"
                                  ? "GPT"
                                  : group.providerId === "google"
                                    ? "Gemini"
                                    : group.providerId === "anthropic"
                                      ? "Claude"
                                      : group.providerId === "deepseek"
                                        ? "DeepSeek"
                                        : group.providerId === "moonshot"
                                          ? "Moonshot"
                                          : group.providerId === "zhipu"
                                            ? "GLM"
                                            : group.providerId === "qwen"
                                              ? "Qwen"
                                              : group.providerId === "doubao"
                                                ? "Doubao"
                                                : group.providerId === "mistral"
                                                  ? "Mistral"
                                                  : group.providerId ===
                                                      "baichuan"
                                                    ? "Baichuan"
                                                    : group.providerId === "yi"
                                                      ? "Yi"
                                                      : group.providerId ===
                                                          "ernie"
                                                        ? "ERNIE"
                                                        : group.providerId ===
                                                            "spark"
                                                          ? "Spark"
                                                          : group.provider,
                              18,
                            )}
                          </span>
                          <span className="font-medium text-sm">
                            {group.provider}
                          </span>
                          <span className="text-xs text-muted-foreground px-1.5 py-0.5 bg-muted rounded">
                            {group.models.length}
                          </span>
                          {hasDefault && (
                            <StarIcon className="w-3.5 h-3.5 text-primary fill-primary" />
                          )}
                        </div>
                        <span
                          className="text-xs text-muted-foreground truncate max-w-[200px]"
                          title={apiUrl}
                        >
                          {new URL(apiUrl).host}
                        </span>
                      </button>

                      {/* 模型列表 */}
                      {!isCollapsed && (
                        <div className="divide-y divide-border">
                          {group.models.map((model) => (
                            <div
                              key={model.id}
                              className={`flex items-center justify-between px-4 py-2.5 hover:bg-muted/30 transition-colors ${
                                model.isDefault ? "bg-primary/5" : ""
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <div className="flex-shrink-0">
                                  {getCategoryIcon(getModelCategory(model), 20)}
                                </div>
                                <div className="flex items-center gap-2">
                                  {model.isDefault && (
                                    <StarIcon className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                                  )}
                                  <div>
                                    <div className="font-medium text-sm">
                                      {model.name || model.model}
                                    </div>
                                    {model.name && (
                                      <div className="text-xs text-muted-foreground">
                                        {model.model}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => handleTestModel(model)}
                                  disabled={testingModelId === model.id}
                                  className="p-1.5 rounded hover:bg-muted transition-colors disabled:opacity-50"
                                  title="测试连接"
                                >
                                  {testingModelId === model.id ? (
                                    <Loader2Icon className="w-4 h-4 animate-spin text-muted-foreground" />
                                  ) : (
                                    <PlayIcon className="w-4 h-4 text-muted-foreground" />
                                  )}
                                </button>
                                {!model.isDefault && (
                                  <button
                                    onClick={() =>
                                      settings.setDefaultAiModel(model.id)
                                    }
                                    className="p-1.5 rounded hover:bg-muted transition-colors"
                                    title="设为默认"
                                  >
                                    <StarIcon className="w-4 h-4 text-muted-foreground" />
                                  </button>
                                )}
                                <button
                                  onClick={() => {
                                    setEditingModelId(model.id);
                                    setEditingModelType("chat");
                                    setNewModel({
                                      name: model.name || "",
                                      provider: model.provider,
                                      apiKey: model.apiKey,
                                      apiUrl: model.apiUrl,
                                      model: model.model,
                                    });
                                    // Load saved parameters
                                    // 加载已保存的参数
                                    if (model.chatParams) {
                                      setChatParams({
                                        temperature:
                                          model.chatParams.temperature ?? 0.7,
                                        maxTokens:
                                          model.chatParams.maxTokens ?? 2048,
                                        topP: model.chatParams.topP ?? 1.0,
                                        topK: model.chatParams.topK,
                                        frequencyPenalty:
                                          model.chatParams.frequencyPenalty ??
                                          0,
                                        presencePenalty:
                                          model.chatParams.presencePenalty ?? 0,
                                        stream:
                                          model.chatParams.stream ?? false,
                                        enableThinking:
                                          model.chatParams.enableThinking ??
                                          false,
                                        customParams:
                                          model.chatParams.customParams ?? {},
                                      });
                                    } else {
                                      setChatParams({
                                        temperature: 0.7,
                                        maxTokens: 2048,
                                        topP: 1.0,
                                        topK: undefined,
                                        frequencyPenalty: 0,
                                        presencePenalty: 0,
                                        stream: false,
                                        enableThinking: false,
                                        customParams: {},
                                      });
                                    }
                                    setShowAddChatModel(true);
                                  }}
                                  className="p-1.5 rounded hover:bg-muted transition-colors"
                                  title="编辑"
                                >
                                  <EditIcon className="w-4 h-4 text-muted-foreground" />
                                </button>
                                <button
                                  onClick={() => {
                                    if (confirm("确定要删除这个模型配置吗？")) {
                                      settings.deleteAiModel(model.id);
                                    }
                                  }}
                                  className="p-1.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                                  title="删除"
                                >
                                  <TrashIcon className="w-4 h-4 text-red-500" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* 添加对话模型表单 */}
            {showAddChatModel ? (
              <div className="space-y-3 p-4 rounded-lg bg-muted/30 border border-border">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">
                    {editingModelId && editingModelType === "chat"
                      ? t("settings.editChatModel")
                      : t("settings.addChatModel")}
                  </span>
                  <button
                    onClick={() => {
                      setShowAddChatModel(false);
                      setEditingModelId(null);
                      setNewModel({
                        name: "",
                        provider: "openai",
                        apiKey: "",
                        apiUrl: "",
                        model: "",
                      });
                    }}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    {t("common.cancel")}
                  </button>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    {t("settings.customNameOptional")}
                  </label>
                  <input
                    type="text"
                    placeholder={t("settings.customNamePlaceholder")}
                    value={newModel.name}
                    onChange={(e) =>
                      setNewModel({ ...newModel, name: e.target.value })
                    }
                    className="w-full h-9 px-3 rounded-lg bg-muted border-0 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    {t("settings.providerName")}
                  </label>
                  <Select
                    value={newModel.provider}
                    onChange={(value) => {
                      const provider = AI_PROVIDERS.find((p) => p.id === value);
                      setNewModel({
                        ...newModel,
                        provider: value,
                        apiUrl: provider?.defaultUrl || "",
                      });
                    }}
                    options={AI_PROVIDERS.map((p) => ({
                      value: p.id,
                      label: p.name,
                      group: p.group,
                    }))}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    {t("settings.apiKey")}
                  </label>
                  <PasswordInput
                    placeholder={t("settings.apiKeyPlaceholder")}
                    value={newModel.apiKey}
                    onChange={(v) => setNewModel({ ...newModel, apiKey: v })}
                    className="h-9"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 flex items-center justify-between">
                    <span>{t("settings.apiUrl")}</span>
                    <span className="text-[10px] opacity-60 font-normal">
                      {t("settings.apiUrlHint")}
                    </span>
                  </label>
                  <input
                    type="text"
                    placeholder={t("settings.apiUrlPlaceholder")}
                    value={newModel.apiUrl}
                    onChange={(e) =>
                      setNewModel({ ...newModel, apiUrl: e.target.value })
                    }
                    className="w-full h-9 px-3 rounded-lg bg-muted border-0 text-sm focus:ring-1 focus:ring-primary/30 transition-shadow"
                  />
                  {newModel.apiUrl && (
                    <p className="text-xs text-muted-foreground mt-1.5 flex items-center justify-between">
                      <span className="flex-1 min-w-0">
                        <span className="text-muted-foreground/70">
                          {t("settings.endpointPreview")}：
                        </span>
                        <span className="font-mono text-primary break-all">
                          {previewEndpoint}
                        </span>
                      </span>
                      {newModel.apiUrl.endsWith("#") && (
                        <span className="ml-2 flex-shrink-0 text-[10px] bg-amber-500/10 text-amber-500 px-1.5 py-0.5 rounded border border-amber-500/20 animate-in fade-in zoom-in-95">
                          {t("settings.autoFillDisabled")}
                        </span>
                      )}
                    </p>
                  )}
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs text-muted-foreground">
                      {t("settings.modelName")}
                    </label>
                    <button
                      type="button"
                      onClick={handleFetchModels}
                      disabled={
                        fetchingModels || !newModel.apiKey || !newModel.apiUrl
                      }
                      className="text-xs text-primary hover:underline disabled:opacity-50 disabled:no-underline flex items-center gap-1"
                    >
                      {fetchingModels ? (
                        <Loader2Icon className="w-3 h-3 animate-spin" />
                      ) : (
                        <RefreshCwIcon className="w-3 h-3" />
                      )}
                      {t("settings.fetchModels")}
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder={t("settings.modelNamePlaceholder")}
                    value={newModel.model}
                    onChange={(e) =>
                      setNewModel({ ...newModel, model: e.target.value })
                    }
                    className="w-full h-9 px-3 rounded-lg bg-muted border-0 text-sm"
                  />
                </div>

                {/* 高级参数配置 / Advanced Parameters */}
                <div className="border border-border rounded-lg overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setShowAdvancedParams(!showAdvancedParams)}
                    className="w-full flex items-center justify-between p-3 bg-muted/30 hover:bg-muted/50 transition-colors"
                  >
                    <span className="text-sm font-medium">
                      {t("settings.advancedParams")}
                    </span>
                    {showAdvancedParams ? (
                      <ChevronDownIcon className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <ChevronRightIcon className="w-4 h-4 text-muted-foreground" />
                    )}
                  </button>

                  {showAdvancedParams && (
                    <div className="p-3 space-y-4 border-t border-border">
                      {/* 流式输出开关 / Stream Output Toggle */}
                      <div className="flex items-center justify-between">
                        <div>
                          <label className="text-sm font-medium">
                            {t("settings.streamOutput")}
                          </label>
                          <p className="text-xs text-muted-foreground">
                            {t("settings.streamOutputDesc")}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setChatParams({
                              ...chatParams,
                              stream: !chatParams.stream,
                            })
                          }
                          className={`relative w-11 h-6 rounded-full transition-colors ${chatParams.stream ? "bg-primary" : "bg-muted"}`}
                        >
                          <span
                            className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${chatParams.stream ? "translate-x-5" : ""}`}
                          />
                        </button>
                      </div>

                      {/* 思考模式开关 / Thinking Mode Toggle */}
                      <div className="flex items-center justify-between">
                        <div>
                          <label className="text-sm font-medium">
                            {t("settings.enableThinking")}
                          </label>
                          <p className="text-xs text-muted-foreground">
                            {t("settings.enableThinkingDesc")}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setChatParams({
                              ...chatParams,
                              enableThinking: !chatParams.enableThinking,
                            })
                          }
                          className={`relative w-11 h-6 rounded-full transition-colors ${chatParams.enableThinking ? "bg-primary" : "bg-muted"}`}
                        >
                          <span
                            className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${chatParams.enableThinking ? "translate-x-5" : ""}`}
                          />
                        </button>
                      </div>

                      {/* 温度滑动条 / Temperature Slider */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-sm font-medium">
                            {t("settings.temperature")}
                          </label>
                          <span className="text-xs text-muted-foreground font-mono">
                            {chatParams.temperature.toFixed(1)}
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="2"
                          step="0.1"
                          value={chatParams.temperature}
                          onChange={(e) =>
                            setChatParams({
                              ...chatParams,
                              temperature: parseFloat(e.target.value),
                            })
                          }
                          className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          {t("settings.temperatureDesc")}
                        </p>
                      </div>

                      {/* 最大 Token / Max Tokens */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-sm font-medium">
                            {t("settings.maxTokens")}
                          </label>
                          <span className="text-xs text-muted-foreground font-mono">
                            {chatParams.maxTokens}
                          </span>
                        </div>
                        <input
                          type="range"
                          min="256"
                          max="32768"
                          step="256"
                          value={chatParams.maxTokens}
                          onChange={(e) =>
                            setChatParams({
                              ...chatParams,
                              maxTokens: parseInt(e.target.value),
                            })
                          }
                          className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          {t("settings.maxTokensDesc")}
                        </p>
                      </div>

                      {/* Top P 滑动条 / Top P Slider */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-sm font-medium">
                            {t("settings.topP")}
                          </label>
                          <span className="text-xs text-muted-foreground font-mono">
                            {chatParams.topP.toFixed(2)}
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          value={chatParams.topP}
                          onChange={(e) =>
                            setChatParams({
                              ...chatParams,
                              topP: parseFloat(e.target.value),
                            })
                          }
                          className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          {t("settings.topPDesc")}
                        </p>
                      </div>

                      {/* 频率惩罚 / Frequency Penalty */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-sm font-medium">
                            {t("settings.frequencyPenalty")}
                          </label>
                          <span className="text-xs text-muted-foreground font-mono">
                            {chatParams.frequencyPenalty.toFixed(1)}
                          </span>
                        </div>
                        <input
                          type="range"
                          min="-2"
                          max="2"
                          step="0.1"
                          value={chatParams.frequencyPenalty}
                          onChange={(e) =>
                            setChatParams({
                              ...chatParams,
                              frequencyPenalty: parseFloat(e.target.value),
                            })
                          }
                          className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          {t("settings.frequencyPenaltyDesc")}
                        </p>
                      </div>

                      {/* 存在惩罚 / Presence Penalty */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-sm font-medium">
                            {t("settings.presencePenalty")}
                          </label>
                          <span className="text-xs text-muted-foreground font-mono">
                            {chatParams.presencePenalty.toFixed(1)}
                          </span>
                        </div>
                        <input
                          type="range"
                          min="-2"
                          max="2"
                          step="0.1"
                          value={chatParams.presencePenalty}
                          onChange={(e) =>
                            setChatParams({
                              ...chatParams,
                              presencePenalty: parseFloat(e.target.value),
                            })
                          }
                          className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          {t("settings.presencePenaltyDesc")}
                        </p>
                      </div>

                      {/* Custom Parameters / 自定义参数 */}
                      <div className="border-t border-border pt-4 mt-4">
                        <div className="flex items-center justify-between mb-3">
                          <label className="text-sm font-medium">
                            {t("settings.customParams", "自定义参数")}
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              const newKey = `param_${Date.now()}`;
                              setChatParams({
                                ...chatParams,
                                customParams: {
                                  ...chatParams.customParams,
                                  [newKey]: "",
                                },
                              });
                            }}
                            className="text-xs text-primary hover:underline"
                          >
                            + {t("settings.addCustomParam", "添加参数")}
                          </button>
                        </div>
                        <p className="text-xs text-muted-foreground mb-3">
                          {t(
                            "settings.customParamsDesc",
                            "添加自定义请求参数，如 max_completion_tokens 等",
                          )}
                        </p>
                        <div className="space-y-2">
                          {Object.entries(chatParams.customParams).map(
                            ([key, value]) => (
                              <div
                                key={key}
                                className="flex items-center gap-2"
                              >
                                <input
                                  type="text"
                                  placeholder={t(
                                    "settings.paramName",
                                    "参数名",
                                  )}
                                  defaultValue={
                                    key.startsWith("param_") ? "" : key
                                  }
                                  onBlur={(e) => {
                                    const newKey = e.target.value.trim();
                                    if (newKey && newKey !== key) {
                                      // Rename key / 重命名键
                                      const { [key]: oldValue, ...rest } =
                                        chatParams.customParams;
                                      setChatParams({
                                        ...chatParams,
                                        customParams: {
                                          ...rest,
                                          [newKey]: oldValue,
                                        },
                                      });
                                    }
                                  }}
                                  className="flex-1 h-8 px-3 rounded-lg bg-muted/50 border-0 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                                />
                                <input
                                  type="text"
                                  placeholder={t(
                                    "settings.paramValue",
                                    "参数值",
                                  )}
                                  value={String(value)}
                                  onChange={(e) => {
                                    // Auto-detect value type / 自动检测值类型
                                    let parsedValue: string | number | boolean =
                                      e.target.value;
                                    if (e.target.value === "true")
                                      parsedValue = true;
                                    else if (e.target.value === "false")
                                      parsedValue = false;
                                    else if (
                                      !isNaN(Number(e.target.value)) &&
                                      e.target.value !== ""
                                    ) {
                                      parsedValue = Number(e.target.value);
                                    }
                                    setChatParams({
                                      ...chatParams,
                                      customParams: {
                                        ...chatParams.customParams,
                                        [key]: parsedValue,
                                      },
                                    });
                                  }}
                                  className="flex-1 h-8 px-3 rounded-lg bg-muted/50 border-0 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    const { [key]: _, ...rest } =
                                      chatParams.customParams;
                                    setChatParams({
                                      ...chatParams,
                                      customParams: rest,
                                    });
                                  }}
                                  className="p-1.5 rounded hover:bg-destructive/10 text-destructive transition-colors"
                                  title={t("common.delete")}
                                >
                                  <TrashIcon className="w-4 h-4" />
                                </button>
                              </div>
                            ),
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => {
                    if (
                      !newModel.apiKey ||
                      !newModel.apiUrl ||
                      !newModel.model
                    ) {
                      showToast(t("settings.fillComplete"), "error");
                      return;
                    }
                    // Build model config with parameters
                    // 构建包含参数的模型配置
                    const modelConfig = {
                      ...newModel,
                      type: "chat" as const,
                      chatParams: {
                        temperature: chatParams.temperature,
                        maxTokens: chatParams.maxTokens,
                        topP: chatParams.topP,
                        frequencyPenalty: chatParams.frequencyPenalty,
                        presencePenalty: chatParams.presencePenalty,
                        stream: chatParams.stream,
                        enableThinking: chatParams.enableThinking,
                        customParams: chatParams.customParams,
                      },
                    };
                    if (editingModelId && editingModelType === "chat") {
                      settings.updateAiModel(editingModelId, modelConfig);
                      showToast(t("settings.modelUpdated"), "success");
                    } else {
                      settings.addAiModel(modelConfig);
                      showToast(t("settings.modelAdded"), "success");
                    }
                    setShowAddChatModel(false);
                    setEditingModelId(null);
                    setNewModel({
                      name: "",
                      provider: "openai",
                      apiKey: "",
                      apiUrl: "",
                      model: "",
                    });
                    setChatParams({
                      temperature: 0.7,
                      maxTokens: 2048,
                      topP: 1.0,
                      topK: undefined,
                      frequencyPenalty: 0,
                      presencePenalty: 0,
                      stream: false,
                      enableThinking: false,
                      customParams: {},
                    });
                    setShowAdvancedParams(false);
                  }}
                  className="w-full h-9 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
                >
                  {editingModelId && editingModelType === "chat"
                    ? t("settings.saveChanges")
                    : t("settings.addModel")}
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowAddChatModel(true)}
                className="w-full h-10 rounded-lg border-2 border-dashed border-muted-foreground/30 text-muted-foreground text-sm font-medium hover:border-primary hover:text-primary transition-colors flex items-center justify-center gap-2"
              >
                <PlusIcon className="w-4 h-4" />
                {t("settings.addChatModel")}
              </button>
            )}

            {chatModels.length === 0 && !showAddChatModel && (
              <p className="text-xs text-muted-foreground text-center py-2">
                {t("settings.noModelsHint")}
              </p>
            )}
          </div>
        </SettingSection>

        {/* 生图模型列表 - 按供应商分组 */}
        <SettingSection title={t("settings.imageModels")}>
          <div className="p-4 space-y-3">
            {Object.keys(groupedImageModels).length > 0 && (
              <div className="space-y-2">
                {Object.entries(groupedImageModels).map(([apiUrl, group]) => {
                  const isCollapsed = collapsedProviders.has(`image-${apiUrl}`);

                  return (
                    <div
                      key={apiUrl}
                      className="border border-border rounded-lg overflow-hidden"
                    >
                      {/* 供应商标题 */}
                      <button
                        onClick={() =>
                          toggleProviderCollapse(`image-${apiUrl}`)
                        }
                        className="w-full flex items-center justify-between p-3 bg-muted/30 hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          {isCollapsed ? (
                            <ChevronRightIcon className="w-4 h-4 text-muted-foreground" />
                          ) : (
                            <ChevronDownIcon className="w-4 h-4 text-muted-foreground" />
                          )}
                          <span className="flex-shrink-0">
                            {getCategoryIcon(
                              group.providerId === "custom" ||
                                group.providerId === "azure" ||
                                group.providerId === "ollama"
                                ? group.models.length > 0
                                  ? getModelCategory(group.models[0])
                                  : "Other"
                                : group.providerId === "openai"
                                  ? "GPT"
                                  : group.providerId === "google"
                                    ? "nanobananai 🍌"
                                    : group.providerId === "anthropic"
                                      ? "Claude"
                                      : group.providerId === "deepseek"
                                        ? "DeepSeek"
                                        : group.providerId === "moonshot"
                                          ? "Moonshot"
                                          : group.providerId === "zhipu"
                                            ? "GLM"
                                            : group.providerId === "qwen"
                                              ? "Qwen"
                                              : group.providerId === "doubao"
                                                ? "Doubao"
                                                : group.providerId === "mistral"
                                                  ? "Mistral"
                                                  : group.providerId ===
                                                      "baichuan"
                                                    ? "Baichuan"
                                                    : group.providerId === "yi"
                                                      ? "Yi"
                                                      : group.providerId ===
                                                          "ernie"
                                                        ? "ERNIE"
                                                        : group.providerId ===
                                                            "spark"
                                                          ? "Spark"
                                                          : group.provider,
                              18,
                            )}
                          </span>
                          <span className="font-medium text-sm">
                            {group.provider}
                          </span>
                          <span className="text-xs text-muted-foreground px-1.5 py-0.5 bg-muted rounded">
                            {group.models.length}
                          </span>
                        </div>
                        <span
                          className="text-xs text-muted-foreground truncate max-w-[200px]"
                          title={apiUrl}
                        >
                          {(() => {
                            try {
                              return new URL(apiUrl).host;
                            } catch {
                              return apiUrl;
                            }
                          })()}
                        </span>
                      </button>

                      {/* 模型列表 */}
                      {!isCollapsed && (
                        <div className="divide-y divide-border">
                          {group.models.map((model) => (
                            <div
                              key={model.id}
                              className="flex items-center justify-between px-4 py-2.5 hover:bg-muted/30 transition-colors"
                            >
                              <div className="flex items-center gap-3">
                                <div className="flex-shrink-0">
                                  {getCategoryIcon(
                                    model.type === "image" &&
                                      getModelCategory(model) === "Gemini"
                                      ? "nanobananai 🍌"
                                      : getModelCategory(model),
                                    20,
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  {model.isDefault && (
                                    <StarIcon className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                                  )}
                                  <div>
                                    <div className="font-medium text-sm">
                                      {model.name || model.model}
                                    </div>
                                    {model.name && (
                                      <div className="text-xs text-muted-foreground">
                                        {model.model}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => handleTestImageModel(model)}
                                  disabled={testingModelId === model.id}
                                  className="p-1.5 rounded hover:bg-muted transition-colors disabled:opacity-50"
                                  title="测试生图"
                                >
                                  {testingModelId === model.id ? (
                                    <Loader2Icon className="w-4 h-4 text-primary animate-spin" />
                                  ) : (
                                    <PlayIcon className="w-4 h-4 text-muted-foreground" />
                                  )}
                                </button>
                                {!model.isDefault && (
                                  <button
                                    onClick={() =>
                                      settings.setDefaultAiModel(model.id)
                                    }
                                    className="p-1.5 rounded hover:bg-muted transition-colors"
                                    title="设为默认"
                                  >
                                    <StarIcon className="w-4 h-4 text-muted-foreground" />
                                  </button>
                                )}
                                <button
                                  onClick={() => {
                                    setEditingModelId(model.id);
                                    setEditingModelType("image");
                                    setNewModel({
                                      name: model.name || "",
                                      provider: model.provider,
                                      apiKey: model.apiKey,
                                      apiUrl: model.apiUrl,
                                      model: model.model,
                                    });
                                    setShowAddImageModel(true);
                                  }}
                                  className="p-1.5 rounded hover:bg-muted transition-colors"
                                  title="编辑"
                                >
                                  <EditIcon className="w-4 h-4 text-muted-foreground" />
                                </button>
                                <button
                                  onClick={() => {
                                    if (confirm("确定要删除这个模型配置吗？")) {
                                      settings.deleteAiModel(model.id);
                                    }
                                  }}
                                  className="p-1.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                                  title="删除"
                                >
                                  <TrashIcon className="w-4 h-4 text-red-500" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* 添加生图模型表单 */}
            {showAddImageModel ? (
              <div className="space-y-3 p-4 rounded-lg bg-muted/30 border border-border">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">
                    {editingModelId && editingModelType === "image"
                      ? t("settings.editImageModel")
                      : t("settings.addImageModel")}
                  </span>
                  <button
                    onClick={() => {
                      setShowAddImageModel(false);
                      setEditingModelId(null);
                      setNewModel({
                        name: "",
                        provider: "openai",
                        apiKey: "",
                        apiUrl: "",
                        model: "",
                      });
                    }}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    {t("common.cancel")}
                  </button>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    {t("settings.customNameOptional")}
                  </label>
                  <input
                    type="text"
                    placeholder={t("settings.customNamePlaceholder")}
                    value={newModel.name}
                    onChange={(e) =>
                      setNewModel({ ...newModel, name: e.target.value })
                    }
                    className="w-full h-9 px-3 rounded-lg bg-muted border-0 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    {t("settings.providerName")}
                  </label>
                  <Select
                    value={newModel.provider}
                    onChange={(value) => {
                      const provider = AI_IMAGE_PROVIDERS.find(
                        (p) => p.id === value,
                      );
                      setNewModel({
                        ...newModel,
                        provider: value,
                        apiUrl: provider?.defaultUrl || "",
                      });
                    }}
                    options={AI_IMAGE_PROVIDERS.map((p) => ({
                      value: p.id,
                      label: p.name,
                      group: p.group,
                    }))}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    {t("settings.apiKey")}
                  </label>
                  <PasswordInput
                    placeholder={t("settings.apiKeyPlaceholder")}
                    value={newModel.apiKey}
                    onChange={(v) => setNewModel({ ...newModel, apiKey: v })}
                    className="h-9"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 flex items-center justify-between">
                    <span>{t("settings.apiUrl")}</span>
                    <span className="text-[10px] opacity-60 font-normal">
                      {t("settings.apiUrlHint")}
                    </span>
                  </label>
                  <input
                    type="text"
                    placeholder={t("settings.apiUrlPlaceholder")}
                    value={newModel.apiUrl}
                    onChange={(e) =>
                      setNewModel({ ...newModel, apiUrl: e.target.value })
                    }
                    className="w-full h-9 px-3 rounded-lg bg-muted border-0 text-sm focus:ring-1 focus:ring-primary/30 transition-shadow"
                  />
                  {newModel.apiUrl && (
                    <p className="text-xs text-muted-foreground mt-1.5 flex items-center justify-between">
                      <span className="flex-1 min-w-0">
                        <span className="text-muted-foreground/70">
                          {t("settings.endpointPreview")}：
                        </span>
                        <span className="font-mono text-primary break-all">
                          {previewImageEndpoint}
                        </span>
                      </span>
                      {newModel.apiUrl.endsWith("#") && (
                        <span className="ml-2 flex-shrink-0 text-[10px] bg-amber-500/10 text-amber-500 px-1.5 py-0.5 rounded border border-amber-500/20 animate-in fade-in zoom-in-95">
                          {t("settings.autoFillDisabled")}
                        </span>
                      )}
                    </p>
                  )}
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs text-muted-foreground">
                      {t("settings.modelName")}
                    </label>
                    <button
                      type="button"
                      onClick={handleFetchImageModels}
                      disabled={
                        fetchingImageModels ||
                        !newModel.apiKey ||
                        !newModel.apiUrl
                      }
                      className="text-xs text-primary hover:underline disabled:opacity-50 disabled:no-underline flex items-center gap-1"
                    >
                      {fetchingImageModels ? (
                        <Loader2Icon className="w-3 h-3 animate-spin" />
                      ) : (
                        <RefreshCwIcon className="w-3 h-3" />
                      )}
                      {t("settings.fetchModels")}
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="e.g., dall-e-3, gemini-2.5-flash-preview-05-20, stable-image-core"
                    value={newModel.model}
                    onChange={(e) =>
                      setNewModel({ ...newModel, model: e.target.value })
                    }
                    className="w-full h-9 px-3 rounded-lg bg-muted border-0 text-sm"
                  />
                </div>
                <button
                  onClick={() => {
                    if (
                      !newModel.apiKey ||
                      !newModel.apiUrl ||
                      !newModel.model
                    ) {
                      showToast(t("settings.fillComplete"), "error");
                      return;
                    }
                    if (editingModelId && editingModelType === "image") {
                      settings.updateAiModel(editingModelId, {
                        ...newModel,
                        type: "image",
                      });
                      showToast(t("settings.modelUpdated"), "success");
                    } else {
                      settings.addAiModel({ ...newModel, type: "image" });
                      showToast(t("settings.modelAdded"), "success");
                    }
                    setShowAddImageModel(false);
                    setEditingModelId(null);
                    setShowImageModelPicker(false);
                    setNewModel({
                      name: "",
                      provider: "openai",
                      apiKey: "",
                      apiUrl: "",
                      model: "",
                    });
                  }}
                  className="w-full h-9 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
                >
                  {editingModelId && editingModelType === "image"
                    ? t("settings.saveChanges")
                    : t("settings.addModel")}
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowAddImageModel(true)}
                className="w-full h-10 rounded-lg border-2 border-dashed border-muted-foreground/30 text-muted-foreground text-sm font-medium hover:border-primary hover:text-primary transition-colors flex items-center justify-center gap-2"
              >
                <PlusIcon className="w-4 h-4" />
                {t("settings.addImageModel")}
              </button>
            )}

            {imageModels.length === 0 && !showAddImageModel && (
              <p className="text-xs text-muted-foreground text-center py-2">
                {t("settings.noModelsHint")}
              </p>
            )}
          </div>
        </SettingSection>

        <SettingSection
          title={t("settings.translationMode", "Translation Mode")}
        >
          <div className="p-4 space-y-3">
            <p className="text-xs text-muted-foreground">
              {t(
                "settings.translationModeDesc",
                "Choose how AI translates skill content",
              )}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => settings.setTranslationMode("immersive")}
                className={`flex-1 p-3 rounded-xl border-2 transition-all text-left ${
                  settings.translationMode === "immersive"
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/30"
                }`}
              >
                <div className="text-sm font-semibold">
                  {t("settings.translationImmersive", "Immersive")}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {t(
                    "settings.translationImmersiveDesc",
                    "Original and translated text shown side by side, paragraph by paragraph",
                  )}
                </p>
              </button>
              <button
                onClick={() => settings.setTranslationMode("full")}
                className={`flex-1 p-3 rounded-xl border-2 transition-all text-left ${
                  settings.translationMode === "full"
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/30"
                }`}
              >
                <div className="text-sm font-semibold">
                  {t("settings.translationFull", "Full Translation")}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {t(
                    "settings.translationFullDesc",
                    "Replace original text with fully translated content",
                  )}
                </p>
              </button>
            </div>
          </div>
        </SettingSection>

        <SettingSection title={t("settings.description")}>
          <div className="p-4 text-sm text-muted-foreground space-y-2">
            <p>• {t("settings.aiConfigDesc1")}</p>
            <p>• {t("settings.aiConfigDesc2")}</p>
            <p>• {t("settings.aiConfigDesc3")}</p>
            <p>• {t("settings.aiConfigDesc4")}</p>
          </div>
        </SettingSection>
      </div>

      {/* 模型选择弹窗 */}
      {showModelPicker && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background rounded-2xl w-[600px] max-h-[80vh] flex flex-col shadow-2xl">
            {/* 弹窗头部 */}
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="text-lg font-semibold">
                {t("settings.selectModels")}
              </h3>
              <button
                onClick={() => setShowModelPicker(false)}
                className="p-2 rounded-lg hover:bg-muted transition-colors"
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            {/* 搜索框 */}
            <div className="p-4 border-b border-border">
              <div className="relative">
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder={t("settings.searchModels")}
                  value={modelSearchQuery}
                  onChange={(e) => setModelSearchQuery(e.target.value)}
                  className="w-full h-10 pl-10 pr-4 rounded-lg bg-muted border-0 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {t("settings.totalModels", { count: availableModels.length })}
                {modelSearchQuery &&
                  ` • ${t("settings.filteredModels", { count: filteredModels.length })}`}
              </p>
            </div>

            {/* 模型列表 - 按分类折叠显示 */}
            <div className="flex-1 overflow-y-auto p-2">
              {filteredModels.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {t("settings.noModelsMatch")}
                </div>
              ) : (
                <div className="space-y-2">
                  {sortedCategories.map((category) => {
                    const models = categorizedModels[category];
                    const isCollapsed = collapsedCategories.has(category);
                    const addedCount = models.filter((m) =>
                      settings.aiModels.some(
                        (am) =>
                          am.model === m.id && am.apiUrl === newModel.apiUrl,
                      ),
                    ).length;

                    return (
                      <div
                        key={category}
                        className="border border-border rounded-lg overflow-hidden"
                      >
                        {/* 分类标题 */}
                        <button
                          onClick={() => toggleCategory(category)}
                          className="w-full flex items-center justify-between p-3 bg-muted/30 hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            {isCollapsed ? (
                              <ChevronRightIcon className="w-4 h-4 text-muted-foreground" />
                            ) : (
                              <ChevronDownIcon className="w-4 h-4 text-muted-foreground" />
                            )}
                            <span className="flex-shrink-0">
                              {getCategoryIcon(category, 18)}
                            </span>
                            <span className="font-medium text-sm">
                              {category}
                            </span>
                            <span className="text-xs text-muted-foreground px-1.5 py-0.5 bg-muted rounded">
                              {models.length}
                            </span>
                            {addedCount > 0 && (
                              <span className="text-xs text-primary px-1.5 py-0.5 bg-primary/10 rounded">
                                {t("settings.addedCount", {
                                  count: addedCount,
                                })}
                              </span>
                            )}
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              models.forEach((m) => {
                                const isAdded = settings.aiModels.some(
                                  (am) =>
                                    am.model === m.id &&
                                    am.apiUrl === newModel.apiUrl,
                                );
                                if (!isAdded) handleAddModel(m.id);
                              });
                            }}
                            className="text-xs text-primary hover:underline px-2 py-1"
                          >
                            {t("settings.addAll")}
                          </button>
                        </button>

                        {/* 模型列表 */}
                        {!isCollapsed && (
                          <div className="divide-y divide-border">
                            {models.map((model) => {
                              const isAdded = settings.aiModels.some(
                                (m) =>
                                  m.model === model.id &&
                                  m.apiUrl === newModel.apiUrl,
                              );
                              return (
                                <div
                                  key={model.id}
                                  className={`flex items-center justify-between px-4 py-2.5 hover:bg-muted/30 transition-colors ${
                                    isAdded ? "bg-primary/5" : ""
                                  }`}
                                >
                                  <div className="flex items-center gap-3 flex-1 min-w-0">
                                    <div className="flex-shrink-0">
                                      {getCategoryIcon(category, 18)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="font-medium text-sm truncate">
                                        {model.id}
                                      </div>
                                      {model.owned_by && (
                                        <div className="text-xs text-muted-foreground">
                                          {model.owned_by}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                  <button
                                    onClick={() => handleAddModel(model.id)}
                                    disabled={isAdded}
                                    className={`ml-3 p-1.5 rounded-lg transition-colors ${
                                      isAdded
                                        ? "bg-primary/20 text-primary cursor-default"
                                        : "hover:bg-primary/10 text-muted-foreground hover:text-primary"
                                    }`}
                                    title={
                                      isAdded
                                        ? t("settings.modelAlreadyAdded")
                                        : t("settings.addModel")
                                    }
                                  >
                                    {isAdded ? (
                                      <CheckIcon className="w-4 h-4" />
                                    ) : (
                                      <PlusIcon className="w-4 h-4" />
                                    )}
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 底部按钮 */}
            <div className="p-4 border-t border-border">
              <button
                onClick={() => setShowModelPicker(false)}
                className="w-full h-10 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                {t("common.done")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 生图模型选择弹窗 */}
      {showImageModelPicker && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background rounded-2xl w-[600px] max-h-[80vh] flex flex-col shadow-2xl">
            {/* 弹窗头部 */}
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="text-lg font-semibold">
                {t("settings.selectImageModels", "选择生图模型")}
              </h3>
              <button
                onClick={() => setShowImageModelPicker(false)}
                className="p-2 rounded-lg hover:bg-muted transition-colors"
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            {/* 搜索框 */}
            <div className="p-4 border-b border-border">
              <div className="relative">
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder={t("settings.searchModels")}
                  value={imageModelSearchQuery}
                  onChange={(e) => setImageModelSearchQuery(e.target.value)}
                  className="w-full h-10 pl-10 pr-4 rounded-lg bg-muted border-0 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {t("settings.totalModels", {
                  count: availableImageModels.length,
                })}
                {imageModelSearchQuery &&
                  ` • ${t("settings.filteredModels", { count: filteredImageModels.length })}`}
              </p>
            </div>

            {/* 模型列表 - 按分类折叠显示 */}
            <div className="flex-1 overflow-y-auto p-2">
              {filteredImageModels.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {t("settings.noModelsMatch")}
                </div>
              ) : (
                <div className="space-y-2">
                  {sortedImageCategories.map((category) => {
                    const models = categorizedImageModels[category];
                    const isCollapsed = collapsedImageCategories.has(category);
                    const addedCount = models.filter((m) =>
                      settings.aiModels.some(
                        (am) =>
                          am.model === m.id &&
                          am.apiUrl === newModel.apiUrl &&
                          am.type === "image",
                      ),
                    ).length;

                    return (
                      <div
                        key={category}
                        className="border border-border rounded-lg overflow-hidden"
                      >
                        {/* 分类标题 */}
                        <button
                          onClick={() => toggleImageCategory(category)}
                          className="w-full flex items-center justify-between p-3 bg-muted/30 hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            {isCollapsed ? (
                              <ChevronRightIcon className="w-4 h-4 text-muted-foreground" />
                            ) : (
                              <ChevronDownIcon className="w-4 h-4 text-muted-foreground" />
                            )}
                            <span className="flex-shrink-0">
                              {getCategoryIcon(category, 18)}
                            </span>
                            <span className="font-medium text-sm">
                              {category}
                            </span>
                            <span className="text-xs text-muted-foreground px-1.5 py-0.5 bg-muted rounded">
                              {models.length}
                            </span>
                            {addedCount > 0 && (
                              <span className="text-xs text-primary px-1.5 py-0.5 bg-primary/10 rounded">
                                {t("settings.addedCount", {
                                  count: addedCount,
                                })}
                              </span>
                            )}
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              models.forEach((m) => {
                                const isAdded = settings.aiModels.some(
                                  (am) =>
                                    am.model === m.id &&
                                    am.apiUrl === newModel.apiUrl &&
                                    am.type === "image",
                                );
                                if (!isAdded) handleAddImageModel(m.id);
                              });
                            }}
                            className="text-xs text-primary hover:underline px-2 py-1"
                          >
                            {t("settings.addAll")}
                          </button>
                        </button>

                        {/* 模型列表 */}
                        {!isCollapsed && (
                          <div className="divide-y divide-border">
                            {models.map((model) => {
                              const isAdded = settings.aiModels.some(
                                (m) =>
                                  m.model === model.id &&
                                  m.apiUrl === newModel.apiUrl &&
                                  m.type === "image",
                              );
                              return (
                                <div
                                  key={model.id}
                                  className={`flex items-center justify-between px-4 py-2.5 hover:bg-muted/30 transition-colors ${
                                    isAdded ? "bg-primary/5" : ""
                                  }`}
                                >
                                  <div className="flex items-center gap-3 flex-1 min-w-0">
                                    <div className="flex-shrink-0">
                                      {getCategoryIcon(category, 18)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="font-medium text-sm truncate">
                                        {model.id}
                                      </div>
                                      {model.owned_by && (
                                        <div className="text-xs text-muted-foreground">
                                          {model.owned_by}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                  <button
                                    onClick={() =>
                                      handleAddImageModel(model.id)
                                    }
                                    disabled={isAdded}
                                    className={`ml-3 p-1.5 rounded-lg transition-colors ${
                                      isAdded
                                        ? "bg-primary/20 text-primary cursor-default"
                                        : "hover:bg-primary/10 text-muted-foreground hover:text-primary"
                                    }`}
                                    title={
                                      isAdded
                                        ? t("settings.modelAlreadyAdded")
                                        : t("settings.addModel")
                                    }
                                  >
                                    {isAdded ? (
                                      <CheckIcon className="w-4 h-4" />
                                    ) : (
                                      <PlusIcon className="w-4 h-4" />
                                    )}
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 底部按钮 */}
            <div className="p-4 border-t border-border">
              <button
                onClick={() => setShowImageModelPicker(false)}
                className="w-full h-10 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                {t("common.done")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 生图测试结果弹窗 */}
      {imageTestModalResult && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background rounded-2xl w-[500px] max-h-[80vh] flex flex-col shadow-2xl overflow-hidden">
            {/* 弹窗头部 */}
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="text-lg font-semibold">
                {imageTestModalResult.success
                  ? t("settings.imageTestSuccess", "生图测试成功")
                  : t("settings.imageTestFailed", "生图测试失败")}
              </h3>
              <button
                onClick={() => setImageTestModalResult(null)}
                className="p-2 rounded-lg hover:bg-muted transition-colors"
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            {/* 弹窗内容 */}
            <div className="flex-1 overflow-y-auto p-4">
              {imageTestModalResult.success ? (
                <div className="space-y-4">
                  {/* 生成的图片 */}
                  {imageTestModalResult.imageUrl && (
                    <div className="rounded-lg overflow-hidden border border-border">
                      <img
                        src={imageTestModalResult.imageUrl}
                        alt="Generated"
                        className="w-full h-auto"
                      />
                    </div>
                  )}
                  {imageTestModalResult.imageBase64 && (
                    <div className="rounded-lg overflow-hidden border border-border">
                      <img
                        src={`data:image/png;base64,${imageTestModalResult.imageBase64}`}
                        alt="Generated"
                        className="w-full h-auto"
                      />
                    </div>
                  )}

                  {/* 信息 */}
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        {t("settings.model", "模型")}
                      </span>
                      <span className="font-medium">
                        {imageTestModalResult.model}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        {t("settings.latency", "耗时")}
                      </span>
                      <span className="font-medium">
                        {imageTestModalResult.latency}ms
                      </span>
                    </div>
                    {imageTestModalResult.revisedPrompt && (
                      <div>
                        <span className="text-muted-foreground block mb-1">
                          {t("settings.revisedPrompt", "修正后的提示词")}
                        </span>
                        <p className="text-xs bg-muted p-2 rounded">
                          {imageTestModalResult.revisedPrompt}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/30">
                    <p className="text-sm text-destructive">
                      {imageTestModalResult.error}
                    </p>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        {t("settings.model", "模型")}
                      </span>
                      <span className="font-medium">
                        {imageTestModalResult.model}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        {t("settings.latency", "耗时")}
                      </span>
                      <span className="font-medium">
                        {imageTestModalResult.latency}ms
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom actions */}
            {/* 底部按钮 */}
            <div className="p-4 border-t border-border">
              <button
                onClick={() => setImageTestModalResult(null)}
                className="w-full h-10 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                {t("common.close", "关闭")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
