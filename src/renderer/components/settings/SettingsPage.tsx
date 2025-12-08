import { useState, useEffect } from 'react';
import {
  SettingsIcon,
  PaletteIcon,
  DatabaseIcon,
  InfoIcon,
  GlobeIcon,
  BellIcon,
  ArrowLeftIcon,
  CheckIcon,
  FolderIcon,
  CloudIcon,
  SunIcon,
  MoonIcon,
  MonitorIcon,
  UploadIcon,
  DownloadIcon,
  RefreshCwIcon,
  BrainIcon,
  KeyIcon,
  PlayIcon,
  Loader2Icon,
  ZapIcon,
  PlusIcon,
  TrashIcon,
  StarIcon,
  EditIcon,
  GithubIcon,
  MailIcon,
  HeartIcon,
  ExternalLinkIcon,
  SparklesIcon,
  SearchIcon,
  XIcon,
  ChevronDownIcon,
  ChevronRightIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { downloadBackup, restoreFromFile, clearDatabase } from '../../services/database';
import { testConnection, uploadToWebDAV, downloadFromWebDAV } from '../../services/webdav';
import { testAIConnection, testImageGeneration, fetchAvailableModels, getBaseUrl, getApiEndpointPreview, getImageApiEndpointPreview, AITestResult, ImageTestResult, ModelInfo } from '../../services/ai';
import { useSettingsStore, MORANDI_THEMES, FONT_SIZES, ThemeMode } from '../../stores/settings.store';
import { useToast } from '../ui/Toast';
import { Select, SelectOption } from '../ui/Select';
import { UpdateDialog } from '../UpdateDialog';
import { getCategoryIcon } from '../ui/ModelIcons';

interface SettingsPageProps {
  onBack: () => void;
}

// 设置菜单项 - 使用 key 而非硬编码文本
const SETTINGS_MENU = [
  { id: 'general', labelKey: 'settings.general', icon: SettingsIcon },
  { id: 'appearance', labelKey: 'settings.appearance', icon: PaletteIcon },
  { id: 'data', labelKey: 'settings.data', icon: DatabaseIcon },
  { id: 'ai', labelKey: 'settings.ai', icon: BrainIcon },
  { id: 'language', labelKey: 'settings.language', icon: GlobeIcon },
  { id: 'notifications', labelKey: 'settings.notifications', icon: BellIcon },
  { id: 'security', labelKey: 'settings.security', icon: KeyIcon },
  { id: 'about', labelKey: 'settings.about', icon: InfoIcon },
];

// AI 模型提供商 - 支持动态模型输入
const AI_PROVIDERS = [
  // 海外
  { id: 'openai', name: 'OpenAI', defaultUrl: 'https://api.openai.com/v1', defaultModels: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo', 'o1-preview', 'o1-mini'] },
  { id: 'anthropic', name: 'Anthropic (Claude)', defaultUrl: 'https://api.anthropic.com/v1', defaultModels: ['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229', 'claude-3-haiku-20240307'] },
  { id: 'google', name: 'Google (Gemini)', defaultUrl: 'https://generativelanguage.googleapis.com/v1beta', defaultModels: ['gemini-2.0-flash-exp', 'gemini-1.5-pro', 'gemini-1.5-flash'] },
  { id: 'xai', name: 'xAI (Grok)', defaultUrl: 'https://api.x.ai/v1', defaultModels: ['grok-beta', 'grok-2-1212'] },
  { id: 'mistral', name: 'Mistral AI', defaultUrl: 'https://api.mistral.ai/v1', defaultModels: ['mistral-large-latest', 'mistral-medium-latest', 'mistral-small-latest'] },
  // 国内
  { id: 'deepseek', name: 'DeepSeek (深度求索)', defaultUrl: 'https://api.deepseek.com/v1', defaultModels: ['deepseek-chat', 'deepseek-coder', 'deepseek-reasoner'] },
  { id: 'moonshot', name: 'Moonshot (Kimi)', defaultUrl: 'https://api.moonshot.cn/v1', defaultModels: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'] },
  { id: 'zhipu', name: '智谱 AI (GLM)', defaultUrl: 'https://open.bigmodel.cn/api/paas/v4', defaultModels: ['glm-4-plus', 'glm-4', 'glm-4-flash', 'glm-4v'] },
  { id: 'qwen', name: '通义千问 (阿里)', defaultUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', defaultModels: ['qwen-max', 'qwen-plus', 'qwen-turbo', 'qwen-long'] },
  { id: 'ernie', name: '文心一言 (百度)', defaultUrl: 'https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop', defaultModels: ['ernie-4.0-8k', 'ernie-3.5-8k', 'ernie-speed-8k'] },
  { id: 'spark', name: '讯飞星火', defaultUrl: 'https://spark-api-open.xf-yun.com/v1', defaultModels: ['generalv3.5', 'generalv3', 'generalv2'] },
  { id: 'doubao', name: '豆包 (字节)', defaultUrl: 'https://ark.cn-beijing.volces.com/api/v3', defaultModels: ['doubao-pro-32k', 'doubao-lite-32k'] },
  { id: 'baichuan', name: '百川智能', defaultUrl: 'https://api.baichuan-ai.com/v1', defaultModels: ['Baichuan4', 'Baichuan3-Turbo', 'Baichuan2-Turbo'] },
  { id: 'minimax', name: 'MiniMax', defaultUrl: 'https://api.minimax.chat/v1', defaultModels: ['abab6.5s-chat', 'abab6-chat', 'abab5.5-chat'] },
  { id: 'stepfun', name: '阶跃星辰', defaultUrl: 'https://api.stepfun.com/v1', defaultModels: ['step-1-200k', 'step-1-32k', 'step-1v-32k'] },
  { id: 'yi', name: '零一万物 (Yi)', defaultUrl: 'https://api.lingyiwanwu.com/v1', defaultModels: ['yi-large', 'yi-medium', 'yi-spark'] },
  { id: 'azure', name: 'Azure OpenAI', defaultUrl: '', defaultModels: ['gpt-4o', 'gpt-4', 'gpt-35-turbo'] },
  { id: 'ollama', name: 'Ollama (本地)', defaultUrl: 'http://localhost:11434/v1', defaultModels: ['llama3', 'mistral', 'codellama', 'qwen2'] },
  { id: 'custom', name: '自定义 (OpenAI 兼容)', defaultUrl: '', defaultModels: [] },
];

type ImageSize = '256x256' | '512x512' | '1024x1024' | '1024x1792' | '1792x1024';
type ImageQuality = 'standard' | 'hd';
type ImageStyle = 'vivid' | 'natural';

export function SettingsPage({ onBack }: SettingsPageProps) {
  const [activeSection, setActiveSection] = useState('general');
  const { t } = useTranslation();
  const { showToast } = useToast();
  
  // 使用 settings store
  const settings = useSettingsStore();
  
  // AI 测试状态
  const [aiTesting, setAiTesting] = useState(false);
  const [aiTestResult, setAiTestResult] = useState<AITestResult | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [compareConfig, setCompareConfig] = useState({ provider: '', apiKey: '', apiUrl: '', model: '' });
  const [compareTesting, setCompareTesting] = useState(false);
  const [compareResult, setCompareResult] = useState<AITestResult | null>(null);

  // 图像测试状态
  const [imageTesting, setImageTesting] = useState(false);
  const [imageTestResult, setImageTestResult] = useState<ImageTestResult | null>(null);
  const [imagePrompt, setImagePrompt] = useState('A cute cat sitting on a windowsill');
  const [imageSize, setImageSize] = useState<ImageSize>('1024x1024');
  const [imageQuality, setImageQuality] = useState<ImageQuality>('standard');
  const [imageStyle, setImageStyle] = useState<ImageStyle>('vivid');

  // 多模型配置状态
  const [showAddChatModel, setShowAddChatModel] = useState(false);
  const [showAddImageModel, setShowAddImageModel] = useState(false);
  const [editingModelId, setEditingModelId] = useState<string | null>(null);
  
  // 更新对话框状态
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);
  const [appVersion, setAppVersion] = useState<string>('');
  const [editingModelType, setEditingModelType] = useState<'chat' | 'image'>('chat');
  const [newModel, setNewModel] = useState({
    name: '',
    provider: 'openai',
    apiKey: '',
    apiUrl: '',
    model: '',
  });
  const [testingModelId, setTestingModelId] = useState<string | null>(null);

  // 获取模型列表状态（对话模型）
  const [fetchingModels, setFetchingModels] = useState(false);
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [modelSearchQuery, setModelSearchQuery] = useState('');
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  
  // 获取模型列表状态（生图模型）
  const [fetchingImageModels, setFetchingImageModels] = useState(false);
  const [availableImageModels, setAvailableImageModels] = useState<ModelInfo[]>([]);
  const [showImageModelPicker, setShowImageModelPicker] = useState(false);
  const [imageModelSearchQuery, setImageModelSearchQuery] = useState('');
  const [collapsedImageCategories, setCollapsedImageCategories] = useState<Set<string>>(new Set());
  
  // 生图测试结果弹窗
  const [imageTestModalResult, setImageTestModalResult] = useState<ImageTestResult | null>(null);

  // 分离对话模型和生图模型
  const chatModels = settings.aiModels.filter(m => m.type === 'chat' || !m.type);
  const imageModels = settings.aiModels.filter(m => m.type === 'image');

  // 获取应用版本号
  useEffect(() => {
    window.electron?.updater?.getVersion().then((v) => setAppVersion(v || ''));
  }, []);

  // 安全 / 主密码
  const [securityStatus, setSecurityStatus] = useState<{ configured: boolean; unlocked: boolean }>({ configured: false, unlocked: false });
  const [newMasterPwd, setNewMasterPwd] = useState('');
  const [newMasterPwdConfirm, setNewMasterPwdConfirm] = useState('');
  const [unlockPwd, setUnlockPwd] = useState('');
  const [secLoading, setSecLoading] = useState(false);
  const [showChangePwd, setShowChangePwd] = useState(false);
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [newPwdConfirm, setNewPwdConfirm] = useState('');
  
  // 清除数据确认弹窗
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearPwd, setClearPwd] = useState('');
  const [clearLoading, setClearLoading] = useState(false);

  // 测试单个对话模型
  const handleTestModel = async (model: typeof settings.aiModels[0]) => {
    setTestingModelId(model.id);
    setAiTestResult(null);
    
    const result = await testAIConnection({
      provider: model.provider,
      apiKey: model.apiKey,
      apiUrl: model.apiUrl,
      model: model.model,
    });
    
    setAiTestResult(result);
    setTestingModelId(null);
    
    if (result.success) {
      showToast(`连接成功 (${result.latency}ms)`, 'success');
    } else {
      showToast(result.error || '连接失败', 'error');
    }
  };

  const refreshSecurityStatus = async () => {
    try {
      const status = await window.api.security.status();
      setSecurityStatus(status);
    } catch (e: any) {
      showToast(e?.message || '获取安全状态失败', 'error');
    }
  };

  const handleSetMasterPassword = async () => {
    if (!newMasterPwd || newMasterPwd.length < 4) {
      showToast('主密码长度至少 4 位', 'error');
      return;
    }
    if (newMasterPwd !== newMasterPwdConfirm) {
      showToast('两次输入不一致', 'error');
      return;
    }
    setSecLoading(true);
    try {
      await window.api.security.setMasterPassword(newMasterPwd);
      await refreshSecurityStatus();
      setNewMasterPwd('');
      setNewMasterPwdConfirm('');
      showToast('主密码已设置并解锁', 'success');
    } catch (e: any) {
      showToast(e?.message || '设置主密码失败', 'error');
    } finally {
      setSecLoading(false);
    }
  };

  const handleUnlock = async () => {
    if (!unlockPwd) {
      showToast('请输入主密码', 'error');
      return;
    }
    setSecLoading(true);
    try {
      const result = await window.api.security.unlock(unlockPwd);
      if (result.success) {
        await refreshSecurityStatus();
        setUnlockPwd('');
        showToast('解锁成功', 'success');
      } else {
        showToast('密码错误', 'error');
      }
    } catch (e: any) {
      showToast(e?.message || '解锁失败', 'error');
    } finally {
      setSecLoading(false);
    }
  };

  const handleLock = async () => {
    setSecLoading(true);
    try {
      await window.api.security.lock();
      await refreshSecurityStatus();
      showToast('已锁定', 'success');
    } catch (e: any) {
      showToast(e?.message || '锁定失败', 'error');
    } finally {
      setSecLoading(false);
    }
  };

  const handleChangeMasterPassword = async () => {
    if (!oldPwd) {
      showToast('请输入当前主密码', 'error');
      return;
    }
    if (!newPwd || newPwd.length < 4) {
      showToast('新密码长度至少 4 位', 'error');
      return;
    }
    if (newPwd !== newPwdConfirm) {
      showToast('两次输入不一致', 'error');
      return;
    }
    setSecLoading(true);
    try {
      // 先验证旧密码
      const unlockResult = await window.api.security.unlock(oldPwd);
      if (!unlockResult.success) {
        showToast('当前主密码错误', 'error');
        setSecLoading(false);
        return;
      }
      // 重设主密码
      await window.api.security.setMasterPassword(newPwd);
      await refreshSecurityStatus();
      setOldPwd('');
      setNewPwd('');
      setNewPwdConfirm('');
      setShowChangePwd(false);
      showToast('主密码已修改并重新解锁', 'success');
    } catch (e: any) {
      showToast(e?.message || '修改失败', 'error');
    } finally {
      setSecLoading(false);
    }
  };

  // 测试单个生图模型
  const handleTestImageModel = async (model: typeof settings.aiModels[0]) => {
    setTestingModelId(model.id);
    
    const result = await testImageGeneration({
      provider: model.provider,
      apiKey: model.apiKey,
      apiUrl: model.apiUrl,
      model: model.model,
    }, 'A cute cat sitting on a windowsill');
    
    setTestingModelId(null);
    
    // 显示结果弹窗
    setImageTestModalResult(result);
  };

  // 获取可用模型列表（对话模型）
  const handleFetchModels = async () => {
    if (!newModel.apiKey || !newModel.apiUrl) {
      showToast(t('settings.fillApiFirst'), 'error');
      return;
    }
    
    setFetchingModels(true);
    setAvailableModels([]);
    setModelSearchQuery('');
    
    const result = await fetchAvailableModels(newModel.apiUrl, newModel.apiKey);
    
    setFetchingModels(false);
    
    if (result.success && result.models.length > 0) {
      setAvailableModels(result.models);
      setShowModelPicker(true);
      showToast(t('settings.modelsLoaded', { count: result.models.length }), 'success');
    } else {
      showToast(result.error || t('settings.noModelsFound'), 'error');
    }
  };
  
  // 获取可用模型列表（生图模型）
  const handleFetchImageModels = async () => {
    if (!newModel.apiKey || !newModel.apiUrl) {
      showToast(t('settings.fillApiFirst'), 'error');
      return;
    }
    
    setFetchingImageModels(true);
    setAvailableImageModels([]);
    
    const result = await fetchAvailableModels(newModel.apiUrl, newModel.apiKey);
    
    setFetchingImageModels(false);
    
    if (result.success && result.models.length > 0) {
      setAvailableImageModels(result.models);
      setShowImageModelPicker(true);
      showToast(t('settings.modelsLoaded', { count: result.models.length }), 'success');
    } else {
      showToast(result.error || t('settings.noModelsFound'), 'error');
    }
  };

  // 添加选中的模型（对话模型）
  const handleAddModel = (modelId: string) => {
    if (!newModel.apiKey || !newModel.apiUrl) {
      showToast(t('settings.fillApiFirst'), 'error');
      return;
    }
    
    // 添加模型到列表
    settings.addAiModel({
      name: modelId,
      provider: newModel.provider,
      apiKey: newModel.apiKey,
      apiUrl: newModel.apiUrl,
      model: modelId,
      type: 'chat',
    });
    showToast(t('settings.modelAdded'), 'success');
  };
  
  // 添加选中的模型（生图模型）
  const handleAddImageModel = (modelId: string) => {
    if (!newModel.apiKey || !newModel.apiUrl) {
      showToast(t('settings.fillApiFirst'), 'error');
      return;
    }
    
    // 添加模型到列表
    settings.addAiModel({
      name: modelId,
      provider: newModel.provider,
      apiKey: newModel.apiKey,
      apiUrl: newModel.apiUrl,
      model: modelId,
      type: 'image',
    });
    showToast(t('settings.modelAdded'), 'success');
  };

  // 过滤模型列表（对话模型）
  const filteredModels = availableModels.filter((m) => 
    m.id.toLowerCase().includes(modelSearchQuery.toLowerCase()) ||
    m.owned_by?.toLowerCase().includes(modelSearchQuery.toLowerCase())
  );
  
  // 过滤模型列表（生图模型）
  const filteredImageModels = availableImageModels.filter((m) => 
    m.id.toLowerCase().includes(imageModelSearchQuery.toLowerCase()) ||
    m.owned_by?.toLowerCase().includes(imageModelSearchQuery.toLowerCase())
  );

  // 模型分类配置：优先按 owned_by / id 关键字匹配到具体供应商
  const MODEL_CATEGORY_CONFIG: { category: string; idKeywords?: string[]; ownerKeywords?: string[] }[] = [
    { category: 'GPT', idKeywords: ['gpt', 'o1-', 'o3-'], ownerKeywords: ['openai'] },
    { category: 'Claude', idKeywords: ['claude'], ownerKeywords: ['anthropic'] },
    { category: 'Gemini', idKeywords: ['gemini'], ownerKeywords: ['google', 'vertexai'] },
    { category: 'DeepSeek', idKeywords: ['deepseek'], ownerKeywords: ['deepseek'] },
    { category: 'Qwen', idKeywords: ['qwen', 'qwq'], ownerKeywords: ['qwen', 'aliyun', 'dashscope'] },
    { category: 'Doubao', idKeywords: ['doubao'], ownerKeywords: ['doubao', 'volcengine'] },
    { category: 'GLM', idKeywords: ['glm'], ownerKeywords: ['zhipu'] },
    { category: 'Moonshot', idKeywords: ['moonshot', 'kimi'], ownerKeywords: ['moonshot'] },
    { category: 'Llama', idKeywords: ['llama'], ownerKeywords: ['meta', 'llama'] },
    { category: 'Mistral', idKeywords: ['mistral', 'mixtral'], ownerKeywords: ['mistral'] },
    { category: 'Yi', idKeywords: ['yi-'], ownerKeywords: ['01-ai', 'zeroone', 'zero-one'] },
    { category: 'ERNIE', idKeywords: ['ernie'], ownerKeywords: ['baidu', 'wenxin'] },
    { category: 'Spark', idKeywords: ['spark'], ownerKeywords: ['xunfei', 'iflytek'] },
    { category: 'Baichuan', idKeywords: ['baichuan'], ownerKeywords: ['baichuan'] },
  ];

  // 模型分类函数：配置优先，失败再按通用规则降级
  const getModelCategory = (model: ModelInfo): string => {
    const id = model.id.toLowerCase();
    const owner = model.owned_by?.toLowerCase() || '';

    // 1. 先按 owned_by 匹配供应商
    for (const item of MODEL_CATEGORY_CONFIG) {
      if (item.ownerKeywords && item.ownerKeywords.some((k) => owner.includes(k))) {
        return item.category;
      }
    }

    // 2. 再按 id 关键字匹配供应商
    for (const item of MODEL_CATEGORY_CONFIG) {
      if (item.idKeywords && item.idKeywords.some((k) => id.includes(k))) {
        return item.category;
      }
    }

    // 3. 按模型类型降级分类
    if (id.includes('embedding') || id.includes('text-embedding')) return 'Embedding';
    if (id.includes('whisper') || id.includes('tts')) return 'Audio';
    if (id.includes('dall-e') || id.includes('stable-diffusion')) return 'Image';

    return 'Other';
  };

  // 按分类组织模型
  const categorizedModels = filteredModels.reduce((acc, model) => {
    const category = getModelCategory(model);
    if (!acc[category]) acc[category] = [];
    acc[category].push(model);
    return acc;
  }, {} as Record<string, ModelInfo[]>);

  // 分类排序（常用的在前）
  const categoryOrder = ['GPT', 'Claude', 'Gemini', 'DeepSeek', 'Qwen', 'Doubao', 'GLM', 'Moonshot', 'Llama', 'Mistral', 'Yi', 'ERNIE', 'Spark', 'Baichuan', 'Embedding', 'Audio', 'Image', 'Other'];
  const sortedCategories = Object.keys(categorizedModels).sort((a, b) => {
    const indexA = categoryOrder.indexOf(a);
    const indexB = categoryOrder.indexOf(b);
    return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
  });

  // 切换分类折叠状态（对话模型）
  const toggleCategory = (category: string) => {
    setCollapsedCategories(prev => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };
  
  // 切换分类折叠状态（生图模型）
  const toggleImageCategory = (category: string) => {
    setCollapsedImageCategories(prev => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };
  
  // 按分类组织生图模型
  const categorizedImageModels = filteredImageModels.reduce((acc, model) => {
    const category = getModelCategory(model);
    if (!acc[category]) acc[category] = [];
    acc[category].push(model);
    return acc;
  }, {} as Record<string, ModelInfo[]>);
  
  // 生图模型分类排序
  const sortedImageCategories = Object.keys(categorizedImageModels).sort((a, b) => {
    const indexA = categoryOrder.indexOf(a);
    const indexB = categoryOrder.indexOf(b);
    return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
  });

  // 计算预览 URL
  const previewBaseUrl = getBaseUrl(newModel.apiUrl);
  const previewEndpoint = getApiEndpointPreview(newModel.apiUrl);
  const previewImageEndpoint = getImageApiEndpointPreview(newModel.apiUrl);

  // 按供应商（API URL）分组已添加的模型
  const groupedChatModels = chatModels.reduce((acc, model) => {
    const key = model.apiUrl || 'unknown';
    if (!acc[key]) {
      acc[key] = {
        provider: AI_PROVIDERS.find(p => p.id === model.provider)?.name || model.provider,
        models: []
      };
    }
    acc[key].models.push(model);
    return acc;
  }, {} as Record<string, { provider: string; models: typeof chatModels }>);

  // 按供应商分组生图模型
  const groupedImageModels = imageModels.reduce((acc, model) => {
    const key = model.apiUrl || 'unknown';
    if (!acc[key]) {
      acc[key] = {
        provider: AI_PROVIDERS.find(p => p.id === model.provider)?.name || model.provider,
        models: []
      };
    }
    acc[key].models.push(model);
    return acc;
  }, {} as Record<string, { provider: string; models: typeof imageModels }>);

  // 供应商折叠状态
  const [collapsedProviders, setCollapsedProviders] = useState<Set<string>>(new Set());
  
  const toggleProviderCollapse = (apiUrl: string) => {
    setCollapsedProviders(prev => {
      const next = new Set(prev);
      if (next.has(apiUrl)) {
        next.delete(apiUrl);
      } else {
        next.add(apiUrl);
      }
      return next;
    });
  };

  // AI 测试函数
  const handleTestAI = async () => {
    if (!settings.aiApiKey || !settings.aiApiUrl || !settings.aiModel) {
      showToast(t('toast.configApiKey'), 'error');
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
      showToast(`${t('toast.connectionSuccess')} (${result.latency}ms)`, 'success');
    } else {
      showToast(result.error || t('toast.connectionFailed'), 'error');
    }
  };

  // 对比测试函数
  const handleCompareTest = async () => {
    if (!settings.aiApiKey || !compareConfig.apiKey) {
      showToast(t('toast.configApiKey'), 'error');
      return;
    }
    
    setAiTesting(true);
    setCompareTesting(true);
    setAiTestResult(null);
    setCompareResult(null);
    
    // 并行测试两个模型
    const [result1, result2] = await Promise.all([
      testAIConnection({
        provider: settings.aiProvider,
        apiKey: settings.aiApiKey,
        apiUrl: settings.aiApiUrl,
        model: settings.aiModel,
      }),
      testAIConnection({
        provider: compareConfig.provider || 'custom',
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
      showToast(t('toast.configApiKey'), 'error');
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
      imagePrompt
    );

    setImageTestResult(result);
    setImageTesting(false);

    if (result.success) {
      showToast(`${t('toast.connectionSuccess')} (${result.latency}ms)`, 'success');
    } else {
      showToast(result.error || t('toast.connectionFailed'), 'error');
    }
  };

  // 初始化安全状态
  useEffect(() => {
    refreshSecurityStatus();
  }, []);

  const handleExportData = async () => {
    try {
      await downloadBackup();
      showToast(t('toast.exportSuccess'), 'success');
    } catch (error) {
      console.error('Export failed:', error);
      showToast(t('toast.exportFailed'), 'error');
    }
  };

  const handleImportData = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        try {
          await restoreFromFile(file);
          showToast(t('toast.importSuccess'), 'success');
          setTimeout(() => window.location.reload(), 1000);
        } catch (error) {
          console.error('Import failed:', error);
          showToast(t('toast.importFailed'), 'error');
        }
      }
    };
    input.click();
  };

  const handleClearData = async () => {
    // 如果已设置主密码，需要先验证
    if (securityStatus.configured) {
      setShowClearConfirm(true);
      return;
    }
    // 未设置主密码时，提示需要先设置
    showToast(t('settings.clearNeedPassword') || '清除数据属于高危操作，请先在安全设置中设置主密码', 'error');
  };
  
  const handleConfirmClear = async () => {
    if (!clearPwd) {
      showToast(t('settings.enterPassword') || '请输入主密码', 'error');
      return;
    }
    
    setClearLoading(true);
    try {
      // 验证密码
      const result = await window.api.security.unlock(clearPwd);
      if (!result.success) {
        showToast(t('settings.wrongPassword') || '密码错误', 'error');
        setClearLoading(false);
        return;
      }
      
      // 密码正确，执行清除
      await clearDatabase();
      showToast(t('toast.clearSuccess'), 'success');
      setShowClearConfirm(false);
      setClearPwd('');
      setTimeout(() => window.location.reload(), 1000);
    } catch (error) {
      console.error('Clear failed:', error);
      showToast(t('toast.clearFailed'), 'error');
    } finally {
      setClearLoading(false);
    }
  };

  const renderContent = () => {
    switch (activeSection) {
      case 'general':
        return (
          <div className="space-y-6">
            <SettingSection title={t('settings.startup')}>
              <SettingItem
                label={t('settings.launchAtStartup')}
                description={t('settings.launchAtStartupDesc')}
              >
                <ToggleSwitch 
                  checked={settings.launchAtStartup}
                  onChange={(checked) => {
                    settings.setLaunchAtStartup(checked);
                    window.electron?.setAutoLaunch?.(checked);
                  }}
                />
              </SettingItem>
              <SettingItem
                label={t('settings.minimizeOnLaunch')}
                description={t('settings.minimizeOnLaunchDesc')}
              >
                <ToggleSwitch 
                  checked={settings.minimizeOnLaunch}
                  onChange={settings.setMinimizeOnLaunch}
                />
              </SettingItem>
            </SettingSection>

            <SettingSection title={t('settings.editor')}>
              <SettingItem
                label={t('settings.autoSave')}
                description={t('settings.autoSaveDesc')}
              >
                <ToggleSwitch 
                  checked={settings.autoSave}
                  onChange={settings.setAutoSave}
                />
              </SettingItem>
              <SettingItem
                label={t('settings.showLineNumbers')}
                description={t('settings.showLineNumbersDesc')}
              >
                <ToggleSwitch 
                  checked={settings.showLineNumbers}
                  onChange={settings.setShowLineNumbers}
                />
              </SettingItem>
            </SettingSection>
          </div>
        );

      case 'appearance':
        const themeModes: { id: ThemeMode; labelKey: string; icon: React.ReactNode }[] = [
          { id: 'light', labelKey: 'settings.light', icon: <SunIcon className="w-5 h-5" /> },
          { id: 'dark', labelKey: 'settings.dark', icon: <MoonIcon className="w-5 h-5" /> },
          { id: 'system', labelKey: 'settings.system', icon: <MonitorIcon className="w-5 h-5" /> },
        ];
        return (
          <div className="space-y-6">
            <SettingSection title={t('settings.themeMode')}>
              <div className="grid grid-cols-3 gap-3 p-4">
                {themeModes.map((mode) => (
                  <button
                    key={mode.id}
                    onClick={() => settings.setThemeMode(mode.id)}
                    className={`flex flex-col items-center gap-2 py-4 px-4 rounded-lg text-sm font-medium transition-colors ${
                      settings.themeMode === mode.id
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted/50 text-foreground hover:bg-muted'
                    }`}
                  >
                    {mode.icon}
                    <span>{t(mode.labelKey)}</span>
                  </button>
                ))}
              </div>
            </SettingSection>

            <SettingSection title={t('settings.themeColor')}>
              <div className="p-4">
                <div className="grid grid-cols-6 gap-4">
                  {MORANDI_THEMES.map((theme) => {
                    const colorNameKey = `settings.color${theme.id.charAt(0).toUpperCase() + theme.id.slice(1).replace(/-([a-z])/g, (_, c) => c.toUpperCase())}`;
                    return (
                      <button
                        key={theme.id}
                        onClick={() => settings.setThemeColor(theme.id)}
                        className="group flex flex-col items-center gap-2"
                        title={t(colorNameKey)}
                      >
                        <div 
                          className={`w-10 h-10 rounded-lg transition-all ${
                            settings.themeColor === theme.id 
                              ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' 
                              : 'hover:opacity-80'
                          }`}
                          style={{ backgroundColor: `hsl(${theme.hue}, ${theme.saturation}%, 55%)` }}
                        >
                          {settings.themeColor === theme.id && (
                            <CheckIcon className="w-4 h-4 text-white m-auto mt-3" />
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">{t(colorNameKey)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </SettingSection>

            <SettingSection title={t('settings.fontSize')}>
              <div className="grid grid-cols-3 gap-3 p-4">
                {FONT_SIZES.map((size) => {
                  const sizeNameKey = `settings.font${size.id.charAt(0).toUpperCase() + size.id.slice(1)}`;
                  return (
                    <button
                      key={size.id}
                      onClick={() => settings.setFontSize(size.id)}
                      className={`py-3 px-4 rounded-lg text-sm font-medium transition-colors ${
                        settings.fontSize === size.id
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted/50 text-foreground hover:bg-muted'
                      }`}
                    >
                      {t(sizeNameKey)}
                      <span className="block text-xs opacity-70 mt-0.5">{size.value}px</span>
                    </button>
                  );
                })}
              </div>
            </SettingSection>
          </div>
        );

      case 'security':
        return (
          <div className="space-y-4">
            <SettingSection title={t('settings.security', '安全与主密码')}>
              <div className="p-4 space-y-3 bg-muted/30 rounded-xl border border-border/60">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <KeyIcon className="w-4 h-4" />
                  <span>
                    {t('settings.securityStatus', '状态')}：
                    {securityStatus.configured
                      ? t('settings.masterSet', '已设置主密码')
                      : t('settings.masterNotSet', '未设置主密码')}
                  </span>
                </div>

                {!securityStatus.configured && (
                  <div className="space-y-3 pt-2 border-t border-border/60">
                    <div className="text-sm font-medium">
                      {t('settings.setMaster', '设置主密码（至少 4 位）')}
                    </div>
                    <input
                      type="password"
                      value={newMasterPwd}
                      onChange={(e) => setNewMasterPwd(e.target.value)}
                      placeholder={t('settings.masterPlaceholder', '输入主密码')}
                      className="w-full h-10 px-3 rounded-lg bg-muted border-0 text-sm placeholder:text-muted-foreground/60"
                    />
                    <input
                      type="password"
                      value={newMasterPwdConfirm}
                      onChange={(e) => setNewMasterPwdConfirm(e.target.value)}
                      placeholder={t('settings.masterConfirmPlaceholder', '确认主密码')}
                      className="w-full h-10 px-3 rounded-lg bg-muted border-0 text-sm placeholder:text-muted-foreground/60"
                    />
                    <button
                      onClick={handleSetMasterPassword}
                      className="h-10 px-4 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
                      disabled={secLoading}
                    >
                      {secLoading ? t('common.loading', '处理中...') : t('settings.setMasterBtn', '设置主密码')}
                    </button>
                  </div>
                )}

                {securityStatus.configured && (
                  <div className="space-y-3 pt-2 border-t border-border/60">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium">{t('settings.changePwd', '修改主密码')}</div>
                      <button
                        onClick={() => setShowChangePwd(!showChangePwd)}
                        className="text-xs text-primary hover:underline"
                      >
                        {showChangePwd ? t('common.cancel', '取消') : t('settings.changePwdBtn', '修改密码')}
                      </button>
                    </div>
                    {showChangePwd && (
                      <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                        <input
                          type="password"
                          value={oldPwd}
                          onChange={(e) => setOldPwd(e.target.value)}
                          placeholder={t('settings.oldPwdPlaceholder', '输入当前主密码')}
                          className="w-full h-10 px-3 rounded-lg bg-muted border-0 text-sm placeholder:text-muted-foreground/60"
                        />
                        <input
                          type="password"
                          value={newPwd}
                          onChange={(e) => setNewPwd(e.target.value)}
                          placeholder={t('settings.newPwdPlaceholder', '输入新主密码（至少 4 位）')}
                          className="w-full h-10 px-3 rounded-lg bg-muted border-0 text-sm placeholder:text-muted-foreground/60"
                        />
                        <input
                          type="password"
                          value={newPwdConfirm}
                          onChange={(e) => setNewPwdConfirm(e.target.value)}
                          placeholder={t('settings.newPwdConfirmPlaceholder', '确认新主密码')}
                          className="w-full h-10 px-3 rounded-lg bg-muted border-0 text-sm placeholder:text-muted-foreground/60"
                        />
                        <button
                          onClick={handleChangeMasterPassword}
                          className="h-10 px-4 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
                          disabled={secLoading}
                        >
                          {secLoading ? t('common.loading', '处理中...') : t('settings.confirmChange', '确认修改')}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <p className="text-xs text-muted-foreground leading-relaxed">
                  {t(
                    'settings.securityDesc',
                    '主密码用于解锁私密内容。密码不落盘，未解锁时私密数据不可见。请务必记住主密码。',
                  )}
                </p>
              </div>
            </SettingSection>
          </div>
        );

      case 'data':
        return (
          <div className="space-y-6">
            <SettingSection title={t('settings.dataPath')}>
              <div className="p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <FolderIcon className="w-5 h-5 text-muted-foreground" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{t('settings.dataPath')}</p>
                    <button
                      onClick={() => window.electron?.openPath?.(settings.dataPath)}
                      className="text-xs text-primary font-mono mt-0.5 hover:underline flex items-center gap-1 cursor-pointer"
                      title={t('settings.openFolder')}
                    >
                      {settings.dataPath}
                      <ExternalLinkIcon className="w-3 h-3" />
                    </button>
                  </div>
                  <button
                    onClick={async () => {
                      const result = await window.electron?.selectFolder?.();
                      if (result) {
                        settings.setDataPath(result);
                        showToast(t('toast.dataPathChanged'), 'success');
                      }
                    }}
                    className="h-8 px-3 rounded-lg bg-muted text-sm hover:bg-muted/80 transition-colors"
                  >
                    {t('settings.change')}
                  </button>
                </div>
              </div>
            </SettingSection>

            <SettingSection title={t('settings.webdav')}>
              <div className="p-4 space-y-4">
                <div className="flex items-center gap-3">
                  <CloudIcon className="w-5 h-5 text-muted-foreground" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{t('settings.webdavEnabled')}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t('settings.webdavEnabledDesc')}
                    </p>
                  </div>
                  <ToggleSwitch 
                    checked={settings.webdavEnabled}
                    onChange={settings.setWebdavEnabled}
                  />
                </div>
                {settings.webdavEnabled && (
                  <div className="space-y-3 pt-2 border-t border-border">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">{t('settings.webdavUrl')}</label>
                      <input
                        type="text"
                        placeholder="https://dav.example.com/path"
                        value={settings.webdavUrl}
                        onChange={(e) => settings.setWebdavUrl(e.target.value)}
                        className="w-full h-9 px-3 rounded-lg bg-muted border-0 text-sm placeholder:text-muted-foreground/50"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">{t('settings.webdavUsername')}</label>
                      <input
                        type="text"
                        placeholder={t('settings.webdavUsername')}
                        value={settings.webdavUsername}
                        onChange={(e) => settings.setWebdavUsername(e.target.value)}
                        className="w-full h-9 px-3 rounded-lg bg-muted border-0 text-sm placeholder:text-muted-foreground/50"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">{t('settings.webdavPassword')}</label>
                      <input
                        type="password"
                        placeholder={t('settings.webdavPassword')}
                        value={settings.webdavPassword}
                        onChange={(e) => settings.setWebdavPassword(e.target.value)}
                        className="w-full h-9 px-3 rounded-lg bg-muted border-0 text-sm placeholder:text-muted-foreground/50"
                      />
                    </div>
                    <div className="flex flex-wrap gap-2 pt-2">
                      <button
                        onClick={async () => {
                          if (!settings.webdavUrl || !settings.webdavUsername || !settings.webdavPassword) {
                            return;
                          }
                          const result = await testConnection({
                            url: settings.webdavUrl,
                            username: settings.webdavUsername,
                            password: settings.webdavPassword,
                          });
                          showToast(result.success ? t('toast.connectionSuccess') : t('toast.connectionFailed'), result.success ? 'success' : 'error');
                        }}
                        className="h-8 px-4 rounded-lg bg-muted text-sm hover:bg-muted/80 transition-colors flex items-center gap-2"
                      >
                        <RefreshCwIcon className="w-4 h-4" />
                        {t('settings.testConnection')}
                      </button>
                      <button
                        onClick={async () => {
                          if (!settings.webdavUrl || !settings.webdavUsername || !settings.webdavPassword) {
                            return;
                          }
                          const result = await uploadToWebDAV({
                            url: settings.webdavUrl,
                            username: settings.webdavUsername,
                            password: settings.webdavPassword,
                          });
                          showToast(result.success ? t('toast.uploadSuccess') : t('toast.uploadFailed'), result.success ? 'success' : 'error');
                        }}
                        className="h-8 px-4 rounded-lg bg-primary text-white text-sm hover:bg-primary/90 transition-colors flex items-center gap-2"
                      >
                        <UploadIcon className="w-4 h-4" />
                        {t('settings.upload')}
                      </button>
                      <button
                        onClick={async () => {
                          if (!settings.webdavUrl || !settings.webdavUsername || !settings.webdavPassword) {
                            return;
                          }
                          const result = await downloadFromWebDAV({
                            url: settings.webdavUrl,
                            username: settings.webdavUsername,
                            password: settings.webdavPassword,
                          });
                          if (result.success) {
                            showToast(t('toast.downloadSuccess'), 'success');
                            setTimeout(() => window.location.reload(), 1000);
                          } else {
                            showToast(t('toast.downloadFailed'), 'error');
                          }
                        }}
                        className="h-8 px-4 rounded-lg bg-muted text-sm hover:bg-muted/80 transition-colors flex items-center gap-2"
                      >
                        <DownloadIcon className="w-4 h-4" />
                        {t('settings.download')}
                      </button>
                    </div>
                    
                    {/* 自动运行（定时同步） */}
                    <div className="flex items-center justify-between pt-3 border-t border-border">
                      <div className="flex-1 mr-4">
                        <p className="text-sm font-medium">{t('settings.webdavAutoRun', '自动运行')}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {t('settings.webdavAutoRunDesc')}
                        </p>
                      </div>
                      <div className="min-w-[140px]">
                        <Select
                          value={String(settings.webdavAutoSyncInterval)}
                          onChange={(val) => settings.setWebdavAutoSyncInterval(Number(val))}
                          options={[
                            { value: '0', label: t('common.off', '关闭') },
                            { value: '5', label: t('settings.every5min', '每 5 分钟') },
                            { value: '15', label: t('settings.every15min', '每 15 分钟') },
                            { value: '30', label: t('settings.every30min', '每 30 分钟') },
                            { value: '60', label: t('settings.every60min', '每 60 分钟') },
                          ]}
                        />
                      </div>
                    </div>
                    
                    {/* 启动后自动运行一次 */}
                    <div className="flex items-center justify-between pt-3 border-t border-border">
                      <div className="flex-1 mr-4">
                        <p className="text-sm font-medium">{t('settings.webdavSyncOnStartup', '启动后自动运行一次')}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {t('settings.webdavSyncOnStartupDesc')}
                        </p>
                      </div>
                      <div className="min-w-[180px]">
                        <Select
                          value={String(settings.webdavSyncOnStartup ? settings.webdavSyncOnStartupDelay : -1)}
                          onChange={(val) => {
                            const num = Number(val);
                            if (num === -1) {
                              settings.setWebdavSyncOnStartup(false);
                            } else {
                              settings.setWebdavSyncOnStartup(true);
                              settings.setWebdavSyncOnStartupDelay(num);
                            }
                          }}
                          options={[
                            { value: '-1', label: t('common.off', '关闭') },
                            { value: '0', label: t('settings.startupImmediate', '启动后立即运行') },
                            { value: '5', label: t('settings.startupDelay5s', '启动后第 5 秒运行一次') },
                            { value: '10', label: t('settings.startupDelay10s', '启动后第 10 秒运行一次') },
                            { value: '30', label: t('settings.startupDelay30s', '启动后第 30 秒运行一次') },
                          ]}
                        />
                      </div>
                    </div>
                    
                    {/* 保存时同步（实验性质） */}
                    <div className="flex items-center justify-between pt-3 border-t border-border">
                      <div className="flex-1 mr-4">
                        <p className="text-sm font-medium">{t('settings.webdavSyncOnSave', '保存时同步（实验性质）')}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {t('settings.webdavSyncOnSaveDesc')}
                        </p>
                      </div>
                      <ToggleSwitch 
                        checked={settings.webdavSyncOnSave}
                        onChange={settings.setWebdavSyncOnSave}
                      />
                    </div>
                  </div>
                )}
              </div>
            </SettingSection>

            <SettingSection title={t('settings.backup')}>
              <SettingItem
                label={t('settings.export')}
                description={t('settings.exportDesc')}
              >
                <button
                  onClick={handleExportData}
                  className="h-9 px-4 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
                >
                  {t('settings.export')}
                </button>
              </SettingItem>
              <SettingItem
                label={t('settings.import')}
                description={t('settings.importDesc')}
              >
                <button
                  onClick={handleImportData}
                  className="h-9 px-4 rounded-lg bg-muted text-foreground text-sm font-medium hover:bg-muted/80 transition-colors"
                >
                  {t('settings.import')}
                </button>
              </SettingItem>
              <SettingItem
                label={t('settings.clear')}
                description={t('settings.clearDesc')}
              >
                <button
                  onClick={handleClearData}
                  className="h-9 px-4 rounded-lg bg-destructive text-white text-sm font-medium hover:bg-destructive/90 transition-colors"
                >
                  {t('settings.clear')}
                </button>
              </SettingItem>
            </SettingSection>

            <SettingSection title={t('settings.dbInfo')}>
              <div className="p-4 text-sm text-muted-foreground space-y-1">
                <p>• IndexedDB</p>
                <p>• PromptHubDB</p>
              </div>
            </SettingSection>
          </div>
        );

      case 'ai':
        return (
          <div className="space-y-6">
            {/* 对话模型列表 - 按供应商分组 */}
            <SettingSection title={t('settings.chatModels')}>
              <div className="p-4 space-y-3">
                {Object.keys(groupedChatModels).length > 0 && (
                  <div className="space-y-2">
                    {Object.entries(groupedChatModels).map(([apiUrl, group]) => {
                      const isCollapsed = collapsedProviders.has(apiUrl);
                      const hasDefault = group.models.some(m => m.isDefault);
                      
                      return (
                        <div key={apiUrl} className="border border-border rounded-lg overflow-hidden">
                          {/* 供应商标题 */}
                          <button
                            onClick={() => toggleProviderCollapse(apiUrl)}
                            className={`w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors ${
                              hasDefault ? 'bg-primary/5' : 'bg-muted/30'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              {isCollapsed ? (
                                <ChevronRightIcon className="w-4 h-4 text-muted-foreground" />
                              ) : (
                                <ChevronDownIcon className="w-4 h-4 text-muted-foreground" />
                              )}
                              <span className="font-medium text-sm">{group.provider}</span>
                              <span className="text-xs text-muted-foreground px-1.5 py-0.5 bg-muted rounded">
                                {group.models.length}
                              </span>
                              {hasDefault && (
                                <StarIcon className="w-3.5 h-3.5 text-primary fill-primary" />
                              )}
                            </div>
                            <span className="text-xs text-muted-foreground truncate max-w-[200px]" title={apiUrl}>
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
                                    model.isDefault ? 'bg-primary/5' : ''
                                  }`}
                                >
                                  <div className="flex items-center gap-2">
                                    {model.isDefault && (
                                      <StarIcon className="w-3.5 h-3.5 text-primary fill-primary" />
                                    )}
                                    <div>
                                      <div className="font-medium text-sm">{model.name || model.model}</div>
                                      {model.name && (
                                        <div className="text-xs text-muted-foreground">{model.model}</div>
                                      )}
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
                                        onClick={() => settings.setDefaultAiModel(model.id)}
                                        className="p-1.5 rounded hover:bg-muted transition-colors"
                                        title="设为默认"
                                      >
                                        <StarIcon className="w-4 h-4 text-muted-foreground" />
                                      </button>
                                    )}
                                    <button
                                      onClick={() => {
                                        setEditingModelId(model.id);
                                        setEditingModelType('chat');
                                        setNewModel({
                                          name: model.name || '',
                                          provider: model.provider,
                                          apiKey: model.apiKey,
                                          apiUrl: model.apiUrl,
                                          model: model.model,
                                        });
                                        setShowAddChatModel(true);
                                      }}
                                      className="p-1.5 rounded hover:bg-muted transition-colors"
                                      title="编辑"
                                    >
                                      <EditIcon className="w-4 h-4 text-muted-foreground" />
                                    </button>
                                    <button
                                      onClick={() => {
                                        if (confirm('确定要删除这个模型配置吗？')) {
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
                        {editingModelId && editingModelType === 'chat' ? t('settings.editChatModel') : t('settings.addChatModel')}
                      </span>
                      <button
                        onClick={() => {
                          setShowAddChatModel(false);
                          setEditingModelId(null);
                          setNewModel({ name: '', provider: 'openai', apiKey: '', apiUrl: '', model: '' });
                        }}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        {t('common.cancel')}
                      </button>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">{t('settings.customNameOptional')}</label>
                      <input
                        type="text"
                        placeholder={t('settings.customNamePlaceholder')}
                        value={newModel.name}
                        onChange={(e) => setNewModel({ ...newModel, name: e.target.value })}
                        className="w-full h-9 px-3 rounded-lg bg-muted border-0 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">{t('settings.providerName')}</label>
                      <Select
                        value={newModel.provider}
                        onChange={(value) => {
                          const provider = AI_PROVIDERS.find(p => p.id === value);
                          setNewModel({
                            ...newModel,
                            provider: value,
                            apiUrl: provider?.defaultUrl || '',
                            model: provider?.defaultModels[0] || '',
                          });
                        }}
                        options={AI_PROVIDERS.map((p) => ({ value: p.id, label: p.name }))}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">{t('settings.apiKey')}</label>
                      <input
                        type="password"
                        placeholder={t('settings.apiKeyPlaceholder')}
                        value={newModel.apiKey}
                        onChange={(e) => setNewModel({ ...newModel, apiKey: e.target.value })}
                        className="w-full h-9 px-3 rounded-lg bg-muted border-0 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">{t('settings.apiUrl')}</label>
                      <input
                        type="text"
                        placeholder={t('settings.apiUrlPlaceholder')}
                        value={newModel.apiUrl}
                        onChange={(e) => setNewModel({ ...newModel, apiUrl: e.target.value })}
                        className="w-full h-9 px-3 rounded-lg bg-muted border-0 text-sm"
                      />
                      {newModel.apiUrl && (
                        <p className="text-xs text-muted-foreground mt-1.5">
                          <span className="text-muted-foreground/70">{t('settings.endpointPreview')}：</span>
                          <span className="font-mono text-primary">{previewEndpoint}</span>
                        </p>
                      )}
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs text-muted-foreground">{t('settings.modelName')}</label>
                        <button
                          type="button"
                          onClick={handleFetchModels}
                          disabled={fetchingModels || !newModel.apiKey || !newModel.apiUrl}
                          className="text-xs text-primary hover:underline disabled:opacity-50 disabled:no-underline flex items-center gap-1"
                        >
                          {fetchingModels ? (
                            <Loader2Icon className="w-3 h-3 animate-spin" />
                          ) : (
                            <RefreshCwIcon className="w-3 h-3" />
                          )}
                          {t('settings.fetchModels')}
                        </button>
                      </div>
                      <input
                        type="text"
                        placeholder={t('settings.modelNamePlaceholder')}
                        value={newModel.model}
                        onChange={(e) => setNewModel({ ...newModel, model: e.target.value })}
                        className="w-full h-9 px-3 rounded-lg bg-muted border-0 text-sm"
                      />
                    </div>
                    <button
                      onClick={() => {
                        if (!newModel.apiKey || !newModel.apiUrl || !newModel.model) {
                          showToast(t('settings.fillComplete'), 'error');
                          return;
                        }
                        if (editingModelId && editingModelType === 'chat') {
                          settings.updateAiModel(editingModelId, { ...newModel, type: 'chat' });
                          showToast(t('settings.modelUpdated'), 'success');
                        } else {
                          settings.addAiModel({ ...newModel, type: 'chat' });
                          showToast(t('settings.modelAdded'), 'success');
                        }
                        setShowAddChatModel(false);
                        setEditingModelId(null);
                        setNewModel({ name: '', provider: 'openai', apiKey: '', apiUrl: '', model: '' });
                      }}
                      className="w-full h-9 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
                    >
                      {editingModelId && editingModelType === 'chat' ? t('settings.saveChanges') : t('settings.addModel')}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowAddChatModel(true)}
                    className="w-full h-10 rounded-lg border-2 border-dashed border-muted-foreground/30 text-muted-foreground text-sm font-medium hover:border-primary hover:text-primary transition-colors flex items-center justify-center gap-2"
                  >
                    <PlusIcon className="w-4 h-4" />
                    {t('settings.addChatModel')}
                  </button>
                )}

                {chatModels.length === 0 && !showAddChatModel && (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    {t('settings.noModelsHint')}
                  </p>
                )}
              </div>
            </SettingSection>

            {/* 生图模型列表 - 按供应商分组 */}
            <SettingSection title={t('settings.imageModels')}>
              <div className="p-4 space-y-3">
                {Object.keys(groupedImageModels).length > 0 && (
                  <div className="space-y-2">
                    {Object.entries(groupedImageModels).map(([apiUrl, group]) => {
                      const isCollapsed = collapsedProviders.has(`image-${apiUrl}`);
                      
                      return (
                        <div key={apiUrl} className="border border-border rounded-lg overflow-hidden">
                          {/* 供应商标题 */}
                          <button
                            onClick={() => toggleProviderCollapse(`image-${apiUrl}`)}
                            className="w-full flex items-center justify-between p-3 bg-muted/30 hover:bg-muted/50 transition-colors"
                          >
                            <div className="flex items-center gap-2">
                              {isCollapsed ? (
                                <ChevronRightIcon className="w-4 h-4 text-muted-foreground" />
                              ) : (
                                <ChevronDownIcon className="w-4 h-4 text-muted-foreground" />
                              )}
                              <span className="font-medium text-sm">{group.provider}</span>
                              <span className="text-xs text-muted-foreground px-1.5 py-0.5 bg-muted rounded">
                                {group.models.length}
                              </span>
                            </div>
                            <span className="text-xs text-muted-foreground truncate max-w-[200px]" title={apiUrl}>
                              {(() => { try { return new URL(apiUrl).host; } catch { return apiUrl; } })()}
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
                                  <div className="flex items-center gap-2">
                                    {model.isDefault && (
                                      <StarIcon className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                                    )}
                                    <div>
                                      <div className="font-medium text-sm">{model.name || model.model}</div>
                                      {model.name && (
                                        <div className="text-xs text-muted-foreground">{model.model}</div>
                                      )}
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
                                        onClick={() => settings.setDefaultAiModel(model.id)}
                                        className="p-1.5 rounded hover:bg-muted transition-colors"
                                        title="设为默认"
                                      >
                                        <StarIcon className="w-4 h-4 text-muted-foreground" />
                                      </button>
                                    )}
                                    <button
                                      onClick={() => {
                                        setEditingModelId(model.id);
                                        setEditingModelType('image');
                                        setNewModel({
                                          name: model.name || '',
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
                                        if (confirm('确定要删除这个模型配置吗？')) {
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
                        {editingModelId && editingModelType === 'image' ? t('settings.editImageModel') : t('settings.addImageModel')}
                      </span>
                      <button
                        onClick={() => {
                          setShowAddImageModel(false);
                          setEditingModelId(null);
                          setNewModel({ name: '', provider: 'openai', apiKey: '', apiUrl: '', model: '' });
                        }}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        {t('common.cancel')}
                      </button>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">{t('settings.customNameOptional')}</label>
                      <input
                        type="text"
                        placeholder={t('settings.customNamePlaceholder')}
                        value={newModel.name}
                        onChange={(e) => setNewModel({ ...newModel, name: e.target.value })}
                        className="w-full h-9 px-3 rounded-lg bg-muted border-0 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">{t('settings.providerName')}</label>
                      <Select
                        value={newModel.provider}
                        onChange={(value) => {
                          const provider = AI_PROVIDERS.find(p => p.id === value);
                          setNewModel({
                            ...newModel,
                            provider: value,
                            apiUrl: provider?.defaultUrl || '',
                            model: value === 'openai' ? 'dall-e-3' : '',
                          });
                        }}
                        options={AI_PROVIDERS.filter(p => ['openai', 'azure', 'custom'].includes(p.id)).map((p) => ({ value: p.id, label: p.name }))}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">{t('settings.apiKey')}</label>
                      <input
                        type="password"
                        placeholder={t('settings.apiKeyPlaceholder')}
                        value={newModel.apiKey}
                        onChange={(e) => setNewModel({ ...newModel, apiKey: e.target.value })}
                        className="w-full h-9 px-3 rounded-lg bg-muted border-0 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">{t('settings.apiUrl')}</label>
                      <input
                        type="text"
                        placeholder={t('settings.apiUrlPlaceholder')}
                        value={newModel.apiUrl}
                        onChange={(e) => setNewModel({ ...newModel, apiUrl: e.target.value })}
                        className="w-full h-9 px-3 rounded-lg bg-muted border-0 text-sm"
                      />
                      {newModel.apiUrl && (
                        <p className="text-xs text-muted-foreground mt-1.5">
                          <span className="text-muted-foreground/70">{t('settings.endpointPreview')}：</span>
                          <span className="font-mono text-primary">{previewImageEndpoint}</span>
                        </p>
                      )}
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs text-muted-foreground">{t('settings.modelName')}</label>
                        <button
                          type="button"
                          onClick={handleFetchImageModels}
                          disabled={fetchingImageModels || !newModel.apiKey || !newModel.apiUrl}
                          className="text-xs text-primary hover:underline disabled:opacity-50 disabled:no-underline flex items-center gap-1"
                        >
                          {fetchingImageModels ? (
                            <Loader2Icon className="w-3 h-3 animate-spin" />
                          ) : (
                            <RefreshCwIcon className="w-3 h-3" />
                          )}
                          {t('settings.fetchModels')}
                        </button>
                      </div>
                      <input
                        type="text"
                        placeholder="e.g., dall-e-3, stable-diffusion"
                        value={newModel.model}
                        onChange={(e) => setNewModel({ ...newModel, model: e.target.value })}
                        className="w-full h-9 px-3 rounded-lg bg-muted border-0 text-sm"
                      />
                    </div>
                    <button
                      onClick={() => {
                        if (!newModel.apiKey || !newModel.apiUrl || !newModel.model) {
                          showToast(t('settings.fillComplete'), 'error');
                          return;
                        }
                        if (editingModelId && editingModelType === 'image') {
                          settings.updateAiModel(editingModelId, { ...newModel, type: 'image' });
                          showToast(t('settings.modelUpdated'), 'success');
                        } else {
                          settings.addAiModel({ ...newModel, type: 'image' });
                          showToast(t('settings.modelAdded'), 'success');
                        }
                        setShowAddImageModel(false);
                        setEditingModelId(null);
                        setShowImageModelPicker(false);
                        setNewModel({ name: '', provider: 'openai', apiKey: '', apiUrl: '', model: '' });
                      }}
                      className="w-full h-9 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
                    >
                      {editingModelId && editingModelType === 'image' ? t('settings.saveChanges') : t('settings.addModel')}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowAddImageModel(true)}
                    className="w-full h-10 rounded-lg border-2 border-dashed border-muted-foreground/30 text-muted-foreground text-sm font-medium hover:border-primary hover:text-primary transition-colors flex items-center justify-center gap-2"
                  >
                    <PlusIcon className="w-4 h-4" />
                    {t('settings.addImageModel')}
                  </button>
                )}

                {imageModels.length === 0 && !showAddImageModel && (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    {t('settings.noModelsHint')}
                  </p>
                )}
              </div>
            </SettingSection>

            <SettingSection title={t('settings.description')}>
              <div className="p-4 text-sm text-muted-foreground space-y-2">
                <p>• {t('settings.aiConfigDesc1')}</p>
                <p>• {t('settings.aiConfigDesc2')}</p>
                <p>• {t('settings.aiConfigDesc3')}</p>
                <p>• {t('settings.aiConfigDesc4')}</p>
              </div>
            </SettingSection>
          </div>
        );

      case 'language':
        const languageOptions: SelectOption[] = [
          { value: 'zh', label: '简体中文' },
          { value: 'en', label: 'English' },
        ];
        return (
          <div className="space-y-6">
            <SettingSection title={t('settings.language')}>
              <SettingItem
                label={t('settings.language')}
                description={t('settings.selectLanguage')}
              >
                <Select
                  value={settings.language}
                  onChange={(value) => settings.setLanguage(value as 'zh' | 'en')}
                  options={languageOptions}
                  className="w-32"
                />
              </SettingItem>
            </SettingSection>
          </div>
        );

      case 'notifications':
        return (
          <div className="space-y-6">
            <SettingSection title={t('settings.notifications')}>
              <SettingItem
                label={t('settings.enableNotifications')}
                description={t('settings.enableNotificationsDesc')}
              >
                <ToggleSwitch 
                  checked={settings.enableNotifications}
                  onChange={settings.setEnableNotifications}
                />
              </SettingItem>
              <SettingItem
                label={t('settings.copyNotification')}
                description={t('settings.copyNotificationDesc')}
              >
                <ToggleSwitch 
                  checked={settings.showCopyNotification}
                  onChange={settings.setShowCopyNotification}
                />
              </SettingItem>
              <SettingItem
                label={t('settings.saveNotification')}
                description={t('settings.saveNotificationDesc')}
              >
                <ToggleSwitch 
                  checked={settings.showSaveNotification}
                  onChange={settings.setShowSaveNotification}
                />
              </SettingItem>
            </SettingSection>
          </div>
        );

      case 'about':
        return (
          <div className="space-y-6">
            {/* 应用信息卡片 */}
            <div className="text-center py-6">
              <div className="w-16 h-16 mx-auto mb-3 rounded-2xl overflow-hidden shadow-lg">
                <img src="/icon.png" alt="PromptHub" className="w-full h-full object-cover" />
              </div>
              <h2 className="text-lg font-semibold">PromptHub</h2>
              <p className="text-sm text-muted-foreground mt-1">{t('settings.version')} {appVersion || '...'}</p>
            </div>

            <SettingSection title={t('settings.projectInfo')}>
              <div className="px-4 py-3 text-sm text-muted-foreground space-y-1">
                <p>• {t('settings.projectInfoDesc1')}</p>
                <p>• {t('settings.projectInfoDesc2')}</p>
                <p>• {t('settings.projectInfoDesc3')}</p>
              </div>
            </SettingSection>

            <SettingSection title={t('settings.checkUpdate')}>
              <SettingItem label={t('settings.autoCheckUpdate')} description={t('settings.autoCheckUpdateDesc')}>
                <ToggleSwitch 
                  checked={settings.autoCheckUpdate}
                  onChange={settings.setAutoCheckUpdate}
                />
              </SettingItem>
              <SettingItem label={t('settings.checkUpdate')} description={`${t('settings.version')}: ${appVersion || '...'}`}>
                <button
                  onClick={() => setShowUpdateDialog(true)}
                  className="h-8 px-4 rounded-lg bg-primary text-white text-sm hover:bg-primary/90 transition-colors"
                >
                  {t('settings.checkUpdate')}
                </button>
              </SettingItem>
            </SettingSection>

            <SettingSection title={t('settings.openSource')}>
              <SettingItem label="GitHub" description={t('settings.viewOnGithub')}>
                <a 
                  href="https://github.com/legeling/PromptHub" 
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary text-sm hover:underline"
                >
                  GitHub
                </a>
              </SettingItem>
            </SettingSection>

            <SettingSection title={t('settings.author')}>
              <div className="px-4 py-3 space-y-3">
                <a 
                  href="https://github.com/legeling" 
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors group"
                >
                  <div className="w-8 h-8 rounded-full bg-foreground/10 flex items-center justify-center">
                    <GithubIcon className="w-4 h-4 text-foreground" />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium">@legeling</div>
                    <div className="text-xs text-muted-foreground">GitHub</div>
                  </div>
                  <ExternalLinkIcon className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </a>
                <a 
                  href="mailto:legeling567@gmail.com"
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors group"
                >
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <MailIcon className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium">legeling567@gmail.com</div>
                    <div className="text-xs text-muted-foreground">Email</div>
                  </div>
                </a>
              </div>
            </SettingSection>

            <div className="px-4 py-4 text-sm text-muted-foreground text-center">
              <div>AGPL-3.0 License © 2025 PromptHub</div>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* 设置侧边栏 */}
      <div className="w-56 bg-card border-r border-border flex flex-col">
        {/* 返回按钮 */}
        <div className="p-3 border-b border-border">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeftIcon className="w-4 h-4" />
            <span>{t('common.back')}</span>
          </button>
        </div>

        {/* 菜单列表 */}
        <nav className="flex-1 overflow-y-auto p-2">
          {SETTINGS_MENU.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveSection(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                activeSection === item.id
                  ? 'bg-primary text-white'
                  : 'text-foreground/80 hover:bg-muted'
              }`}
            >
              <item.icon className="w-4 h-4" />
              <span>{t(item.labelKey)}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* 设置内容区 - 自适应宽度 */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-xl font-semibold mb-6">
            {t(SETTINGS_MENU.find((m) => m.id === activeSection)?.labelKey || '')}
          </h1>
          {renderContent()}
        </div>
      </div>

      {/* 更新对话框 */}
      <UpdateDialog
        isOpen={showUpdateDialog}
        onClose={() => setShowUpdateDialog(false)}
      />

      {/* 清除数据确认弹窗 */}
      {showClearConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background rounded-2xl w-[400px] p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center">
                <TrashIcon className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-red-500">{t('settings.dangerOperation') || '危险操作'}</h3>
                <p className="text-sm text-muted-foreground">{t('settings.clearDesc')}</p>
              </div>
            </div>
            
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">{t('settings.enterMasterPassword') || '请输入主密码确认'}</label>
              <input
                type="password"
                value={clearPwd}
                onChange={(e) => setClearPwd(e.target.value)}
                placeholder={t('settings.masterPasswordPlaceholder') || '输入主密码'}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                onKeyDown={(e) => e.key === 'Enter' && handleConfirmClear()}
              />
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowClearConfirm(false);
                  setClearPwd('');
                }}
                className="flex-1 px-4 py-2 rounded-lg bg-muted hover:bg-muted/80 transition-colors"
                disabled={clearLoading}
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleConfirmClear}
                disabled={clearLoading || !clearPwd}
                className="flex-1 px-4 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                {clearLoading ? <Loader2Icon className="w-4 h-4 animate-spin mx-auto" /> : t('settings.confirmClear') || '确认清除'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 模型选择弹窗 */}
      {showModelPicker && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background rounded-2xl w-[600px] max-h-[80vh] flex flex-col shadow-2xl">
            {/* 弹窗头部 */}
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="text-lg font-semibold">{t('settings.selectModels')}</h3>
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
                  placeholder={t('settings.searchModels')}
                  value={modelSearchQuery}
                  onChange={(e) => setModelSearchQuery(e.target.value)}
                  className="w-full h-10 pl-10 pr-4 rounded-lg bg-muted border-0 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {t('settings.totalModels', { count: availableModels.length })}
                {modelSearchQuery && ` • ${t('settings.filteredModels', { count: filteredModels.length })}`}
              </p>
            </div>
            
            {/* 模型列表 - 按分类折叠显示 */}
            <div className="flex-1 overflow-y-auto p-2">
              {filteredModels.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {t('settings.noModelsMatch')}
                </div>
              ) : (
                <div className="space-y-2">
                  {sortedCategories.map((category) => {
                    const models = categorizedModels[category];
                    const isCollapsed = collapsedCategories.has(category);
                    const addedCount = models.filter(m => 
                      settings.aiModels.some(am => am.model === m.id && am.apiUrl === newModel.apiUrl)
                    ).length;
                    
                    return (
                      <div key={category} className="border border-border rounded-lg overflow-hidden">
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
                            <span className="flex-shrink-0">{getCategoryIcon(category, 18)}</span>
                            <span className="font-medium text-sm">{category}</span>
                            <span className="text-xs text-muted-foreground px-1.5 py-0.5 bg-muted rounded">
                              {models.length}
                            </span>
                            {addedCount > 0 && (
                              <span className="text-xs text-primary px-1.5 py-0.5 bg-primary/10 rounded">
                                {t('settings.addedCount', { count: addedCount })}
                              </span>
                            )}
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              models.forEach(m => {
                                const isAdded = settings.aiModels.some(
                                  am => am.model === m.id && am.apiUrl === newModel.apiUrl
                                );
                                if (!isAdded) handleAddModel(m.id);
                              });
                            }}
                            className="text-xs text-primary hover:underline px-2 py-1"
                          >
                            {t('settings.addAll')}
                          </button>
                        </button>
                        
                        {/* 模型列表 */}
                        {!isCollapsed && (
                          <div className="divide-y divide-border">
                            {models.map((model) => {
                              const isAdded = settings.aiModels.some(
                                m => m.model === model.id && m.apiUrl === newModel.apiUrl
                              );
                              return (
                                <div
                                  key={model.id}
                                  className={`flex items-center justify-between px-4 py-2.5 hover:bg-muted/30 transition-colors ${
                                    isAdded ? 'bg-primary/5' : ''
                                  }`}
                                >
                                  <div className="flex-1 min-w-0">
                                    <div className="font-medium text-sm truncate">{model.id}</div>
                                    {model.owned_by && (
                                      <div className="text-xs text-muted-foreground">{model.owned_by}</div>
                                    )}
                                  </div>
                                  <button
                                    onClick={() => handleAddModel(model.id)}
                                    disabled={isAdded}
                                    className={`ml-3 p-1.5 rounded-lg transition-colors ${
                                      isAdded 
                                        ? 'bg-primary/20 text-primary cursor-default' 
                                        : 'hover:bg-primary/10 text-muted-foreground hover:text-primary'
                                    }`}
                                    title={isAdded ? t('settings.modelAlreadyAdded') : t('settings.addModel')}
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
                {t('common.done')}
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
              <h3 className="text-lg font-semibold">{t('settings.selectImageModels', '选择生图模型')}</h3>
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
                  placeholder={t('settings.searchModels')}
                  value={imageModelSearchQuery}
                  onChange={(e) => setImageModelSearchQuery(e.target.value)}
                  className="w-full h-10 pl-10 pr-4 rounded-lg bg-muted border-0 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {t('settings.totalModels', { count: availableImageModels.length })}
                {imageModelSearchQuery && ` • ${t('settings.filteredModels', { count: filteredImageModels.length })}`}
              </p>
            </div>
            
            {/* 模型列表 - 按分类折叠显示 */}
            <div className="flex-1 overflow-y-auto p-2">
              {filteredImageModels.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {t('settings.noModelsMatch')}
                </div>
              ) : (
                <div className="space-y-2">
                  {sortedImageCategories.map((category) => {
                    const models = categorizedImageModels[category];
                    const isCollapsed = collapsedImageCategories.has(category);
                    const addedCount = models.filter(m => 
                      settings.aiModels.some(am => am.model === m.id && am.apiUrl === newModel.apiUrl && am.type === 'image')
                    ).length;
                    
                    return (
                      <div key={category} className="border border-border rounded-lg overflow-hidden">
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
                            <span className="flex-shrink-0">{getCategoryIcon(category, 18)}</span>
                            <span className="font-medium text-sm">{category}</span>
                            <span className="text-xs text-muted-foreground px-1.5 py-0.5 bg-muted rounded">
                              {models.length}
                            </span>
                            {addedCount > 0 && (
                              <span className="text-xs text-primary px-1.5 py-0.5 bg-primary/10 rounded">
                                {t('settings.addedCount', { count: addedCount })}
                              </span>
                            )}
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              models.forEach(m => {
                                const isAdded = settings.aiModels.some(
                                  am => am.model === m.id && am.apiUrl === newModel.apiUrl && am.type === 'image'
                                );
                                if (!isAdded) handleAddImageModel(m.id);
                              });
                            }}
                            className="text-xs text-primary hover:underline px-2 py-1"
                          >
                            {t('settings.addAll')}
                          </button>
                        </button>
                        
                        {/* 模型列表 */}
                        {!isCollapsed && (
                          <div className="divide-y divide-border">
                            {models.map((model) => {
                              const isAdded = settings.aiModels.some(
                                m => m.model === model.id && m.apiUrl === newModel.apiUrl && m.type === 'image'
                              );
                              return (
                                <div
                                  key={model.id}
                                  className={`flex items-center justify-between px-4 py-2.5 hover:bg-muted/30 transition-colors ${
                                    isAdded ? 'bg-primary/5' : ''
                                  }`}
                                >
                                  <div className="flex-1 min-w-0">
                                    <div className="font-medium text-sm truncate">{model.id}</div>
                                    {model.owned_by && (
                                      <div className="text-xs text-muted-foreground">{model.owned_by}</div>
                                    )}
                                  </div>
                                  <button
                                    onClick={() => handleAddImageModel(model.id)}
                                    disabled={isAdded}
                                    className={`ml-3 p-1.5 rounded-lg transition-colors ${
                                      isAdded 
                                        ? 'bg-primary/20 text-primary cursor-default' 
                                        : 'hover:bg-primary/10 text-muted-foreground hover:text-primary'
                                    }`}
                                    title={isAdded ? t('settings.modelAlreadyAdded') : t('settings.addModel')}
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
                {t('common.done')}
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
                {imageTestModalResult.success ? t('settings.imageTestSuccess', '生图测试成功') : t('settings.imageTestFailed', '生图测试失败')}
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
                      <span className="text-muted-foreground">{t('settings.model', '模型')}</span>
                      <span className="font-medium">{imageTestModalResult.model}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t('settings.latency', '耗时')}</span>
                      <span className="font-medium">{imageTestModalResult.latency}ms</span>
                    </div>
                    {imageTestModalResult.revisedPrompt && (
                      <div>
                        <span className="text-muted-foreground block mb-1">{t('settings.revisedPrompt', '修正后的提示词')}</span>
                        <p className="text-xs bg-muted p-2 rounded">{imageTestModalResult.revisedPrompt}</p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/30">
                    <p className="text-sm text-destructive">{imageTestModalResult.error}</p>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t('settings.model', '模型')}</span>
                      <span className="font-medium">{imageTestModalResult.model}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t('settings.latency', '耗时')}</span>
                      <span className="font-medium">{imageTestModalResult.latency}ms</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            {/* 底部按钮 */}
            <div className="p-4 border-t border-border">
              <button
                onClick={() => setImageTestModalResult(null)}
                className="w-full h-10 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                {t('common.close', '关闭')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// 设置区块组件 - 扁平化设计
function SettingSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="relative">
      <h3 className="text-sm font-medium text-muted-foreground mb-2">{title}</h3>
      <div className="bg-card rounded-lg border border-border">
        {children}
      </div>
    </div>
  );
}

// 设置项组件
function SettingItem({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-border last:border-0">
      <div>
        <div className="text-sm font-medium">{label}</div>
        {description && (
          <div className="text-xs text-muted-foreground mt-0.5">{description}</div>
        )}
      </div>
      {children}
    </div>
  );
}

// 开关组件
interface ToggleSwitchProps {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  defaultChecked?: boolean;
}

function ToggleSwitch({ checked, onChange, defaultChecked = false }: ToggleSwitchProps) {
  const [internalChecked, setInternalChecked] = useState(defaultChecked);
  const isControlled = checked !== undefined;
  const isChecked = isControlled ? checked : internalChecked;

  const handleClick = () => {
    const newValue = !isChecked;
    if (!isControlled) {
      setInternalChecked(newValue);
    }
    onChange?.(newValue);
  };

  return (
    <button
      onClick={handleClick}
      className={`relative w-12 h-7 rounded-full transition-all duration-200 flex-shrink-0 border-2 ${
        isChecked 
          ? 'bg-primary border-primary' 
          : 'bg-muted border-border dark:bg-primary/20 dark:border-primary/40'
      }`}
    >
      <span
        className={`absolute top-0.5 w-5 h-5 rounded-full transition-all duration-200 ${
          isChecked ? 'bg-white' : 'bg-muted-foreground/50 dark:bg-primary/60'
        }`}
        style={{ left: isChecked ? '22px' : '2px' }}
      />
    </button>
  );
}

