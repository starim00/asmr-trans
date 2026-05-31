import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileAudio,
  FileVideo,
  FolderOpen,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Save,
  Settings,
  SlidersHorizontal,
  Square,
  Trash2,
  Volume2,
  X,
} from "lucide-react";
import "./styles.css";

const DEFAULT_WHISPER_MODEL: WhisperModelName = "small";
const SEGMENT_PAGE_SIZE = 80;
const DEFAULT_AI_SYSTEM_PROMPT =
  "\u4f60\u662f\u4e13\u4e1a\u7684\u65e5\u8bd1\u4e2d\u7ffb\u8bd1\u3002\u8bf7\u628a\u65e5\u8bed ASMR/\u53e3\u8bed\u8f6c\u5199\u7ffb\u8bd1\u6210\u81ea\u7136\u3001\u51c6\u786e\u7684\u7b80\u4f53\u4e2d\u6587\u3002\u5fe0\u5b9e\u4fdd\u7559\u539f\u610f\u3001\u8bed\u6c14\u3001\u79f0\u547c\u548c\u66a7\u6627\u8868\u8fbe\uff1b\u4e0d\u8981\u89e3\u91ca\uff0c\u4e0d\u8981\u603b\u7ed3\uff0c\u4e0d\u8981\u6dfb\u52a0\u539f\u6587\u6ca1\u6709\u7684\u4fe1\u606f\u3002";
const DEFAULT_AI_USER_PROMPT_TEMPLATE =
  "\u8bf7\u7ffb\u8bd1\u4e0b\u9762 JSON \u6570\u7ec4\u4e2d\u7684 items\u3002\u6bcf\u9879\u5305\u542b id\u3001start\u3001end\u3001text\u3001contextBefore\u3001contextAfter\u3002context \u5b57\u6bb5\u53ea\u7528\u4e8e\u7406\u89e3\u4e0a\u4e0b\u6587\uff0c\u53ea\u7ffb\u8bd1 text\u3002\u53ea\u8fd4\u56de JSON \u6570\u7ec4\uff0c\u6570\u7ec4\u6bcf\u9879\u5fc5\u987b\u662f {\"id\": \u6570\u5b57, \"translation\": \"\u4e2d\u6587\u8bd1\u6587\"}\uff0c\u4e0d\u8981\u8fd4\u56de Markdown\u3002";
const LEGACY_TTS_VOICE_PROMPT = "\u4e2d\u6587\uff0c\u8f7b\u58f0\uff0c\u6e29\u67d4\uff0c\u81ea\u7136\uff0c\u8d34\u8fd1\u539f\u97f3\u8272";

const DEEPSEEK_PRESET: AppSettings = {
  whisperModel: DEFAULT_WHISPER_MODEL,
  computeDevice: "auto",
  translationBackend: "ai",
  aiTranslation: {
    baseUrl: "https://api.deepseek.com",
    apiKey: "",
    model: "deepseek-v4-pro",
    temperature: 0.2,
    topP: 0.9,
    topK: "",
    maxTokens: 4096,
    timeoutSeconds: 120,
    retries: 2,
    reasoningEffort: "high",
    thinking: true,
    systemPrompt: DEFAULT_AI_SYSTEM_PROMPT,
    userPromptTemplate: DEFAULT_AI_USER_PROMPT_TEMPLATE,
    contextWindow: 6,
    contextOverlap: 1,
    proxyEnabled: false,
    proxyType: "http",
    proxyHost: "127.0.0.1",
    proxyPort: "7890",
  },
  network: {
    proxyEnabled: false,
    proxyType: "http",
    proxyHost: "127.0.0.1",
    proxyPort: "7890",
  },
  audioEnhancement: {
    enabled: false,
    normalize: true,
    compression: true,
    denoise: false,
    mono: true,
    targetPeak: 0.9,
    noiseGateDb: -48,
  },
  whisperAdvanced: {
    profile: "balanced",
    beamSize: 5,
    vadFilter: true,
    noSpeechThreshold: 0.6,
    conditionOnPreviousText: false,
    initialPrompt: "",
  },
  tts: {
    enabled: false,
    device: "auto",
    voicePrompt: "\u4e2d\u6587\uff0c\u8f7b\u58f0\uff0c\u6e29\u67d4\uff0c\u8bed\u901f\u63a5\u8fd1\u539f\u97f3\u9891\uff0c\u505c\u987f\u81ea\u7136\uff0c\u8d34\u8fd1\u539f\u97f3\u8272",
    cfgValue: 1.6,
    inferenceTimesteps: 20,
    normalize: true,
    denoise: false,
    retryBadcaseRatioThreshold: 4.0,
  },
};

const WHISPER_MODELS: Array<{ value: WhisperModelName; label: string; description: string }> = [
  { value: "tiny", label: "Tiny", description: "\u901f\u5ea6\u6700\u5feb\uff0c\u51c6\u786e\u7387\u6700\u4f4e" },
  { value: "base", label: "Base", description: "\u8f7b\u91cf\u5feb\u901f" },
  { value: "small", label: "Small", description: "\u9ed8\u8ba4\u5e73\u8861" },
  { value: "medium", label: "Medium", description: "\u66f4\u9ad8\u51c6\u786e\u7387" },
  { value: "large-v3", label: "Large v3", description: "\u6700\u9ad8\u51c6\u786e\u7387\uff0c\u8d44\u6e90\u5360\u7528\u9ad8" },
];

const VIDEO_EXTENSIONS = new Set(["mp4", "mkv", "mov", "webm", "avi", "wmv"]);
const SETTINGS_SECTIONS = [
  { key: "recognition", label: "识别" },
  { key: "ai", label: "AI 翻译" },
  { key: "enhancement", label: "音频增强" },
  { key: "tts", label: "语音生成" },
  { key: "models", label: "模型与硬件" },
  { key: "proxy", label: "代理" },
] as const;
type SettingsSection = (typeof SETTINGS_SECTIONS)[number]["key"];

const text = {
  appSubtitle: "\u672c\u5730\u684c\u9762\u6279\u91cf\u8f6c\u5199",
  selectMedia: "\u6dfb\u52a0\u6587\u4ef6",
  startQueue: "\u5f00\u59cb\u961f\u5217",
  pauseQueue: "\u6682\u505c",
  resumeQueue: "\u6062\u590d",
  cancelTask: "\u53d6\u6d88\u4efb\u52a1",
  removeTask: "\u79fb\u9664\u4efb\u52a1",
  settings: "\u8bbe\u7f6e",
  queue: "\u4efb\u52a1\u961f\u5217",
  result: "\u8f6c\u5199\u7ed3\u679c",
  emptyQueue: "\u6dfb\u52a0\u97f3\u9891\u6216\u89c6\u9891\u6587\u4ef6\u540e\uff0c\u4efb\u52a1\u4f1a\u5728\u8fd9\u91cc\u6309\u987a\u5e8f\u5904\u7406\u3002",
  emptyResult: "\u9009\u62e9\u5de6\u4fa7\u4efb\u52a1\u540e\u67e5\u770b\u8be6\u7ec6\u5206\u6bb5\u7ed3\u679c\u3002",
  source: "\u539f\u6587",
  translation: "\u8bd1\u6587",
  saveTxt: "\u4fdd\u5b58\u4e3a txt",
  saveSrt: "\u4fdd\u5b58\u4e3a srt",
  generateChineseVoice: "\u751f\u6210\u4e2d\u6587\u8bed\u97f3",
  cancelChineseVoice: "\u53d6\u6d88\u8bed\u97f3\u751f\u6210",
  tts: "VoxCPM2 \u4e2d\u6587\u8bed\u97f3",
  enableTts: "\u542f\u7528\u5b9e\u9a8c\u6027\u4e2d\u6587\u8bed\u97f3\u751f\u6210",
  ttsHint: "\u5bf9\u5df2\u7f16\u8f91\u7684\u4e2d\u6587\u8bd1\u6587\u751f\u6210 WAV\uff1b\u9996\u6b21\u4f7f\u7528\u4f1a\u6309\u9700\u5b89\u88c5 VoxCPM2 \u4f9d\u8d56\u5e76\u4e0b\u8f7d\u6a21\u578b\u3002",
  ttsDevice: "\u8bed\u97f3\u751f\u6210\u8bbe\u5907",
  voicePrompt: "\u58f0\u97f3\u98ce\u683c\u63d0\u793a",
  cfgValue: "CFG Value",
  inferenceTimesteps: "\u751f\u6210\u6b65\u6570",
  normalizeTtsText: "\u542f\u7528\u6587\u672c\u89c4\u8303\u5316",
  denoiseTtsReference: "\u53c2\u8003\u97f3\u9891\u964d\u566a",
  retryBadcaseRatioThreshold: "\u5f02\u5e38\u65f6\u957f\u91cd\u8bd5\u9608\u503c",
  ttsNotEnabled: "\u8bf7\u5148\u5728\u8bbe\u7f6e\u4e2d\u542f\u7528 VoxCPM2 \u4e2d\u6587\u8bed\u97f3\u3002",
  noChineseTranslation: "\u5f53\u524d\u4efb\u52a1\u6ca1\u6709\u53ef\u751f\u6210\u7684\u4e2d\u6587\u8bd1\u6587\u3002",
  ttsRunning: "\u6b63\u5728\u751f\u6210\u4e2d\u6587\u8bed\u97f3...",
  ttsCanceled: "\u4e2d\u6587\u8bed\u97f3\u751f\u6210\u5df2\u53d6\u6d88\u3002",
  showingSegments: "\u5df2\u663e\u793a\u5206\u6bb5",
  loadMoreSegments: "\u52a0\u8f7d\u66f4\u591a\u5206\u6bb5",
  exportAllTxt: "\u6279\u91cf\u5bfc\u51fa txt",
  exportAllSrt: "\u6279\u91cf\u5bfc\u51fa srt",
  saved: "\u5df2\u4fdd\u5b58\uff1a",
  batchSaved: "\u6279\u91cf\u5bfc\u51fa\u5b8c\u6210\uff1a",
  noResultToSave: "\u5f53\u524d\u4efb\u52a1\u6ca1\u6709\u53ef\u4fdd\u5b58\u7684\u7ed3\u679c\u3002",
  noBatchResult: "\u6ca1\u6709\u5df2\u5b8c\u6210\u7684\u4efb\u52a1\u53ef\u4ee5\u6279\u91cf\u5bfc\u51fa\u3002",
  chooseFirst: "\u8bf7\u5148\u6dfb\u52a0\u6587\u4ef6\u3002",
  historyLoaded: "\u5386\u53f2\u8bb0\u5f55",
  sortOldestFirst: "\u6700\u65e9\u6dfb\u52a0\u4f18\u5148",
  sortNewestFirst: "\u6700\u65b0\u6dfb\u52a0\u4f18\u5148",
  realtimeSpeed: "\u5b9e\u65f6\u901f\u5ea6",
  eta: "\u9884\u8ba1\u5269\u4f59",
  elapsed: "\u5df2\u7528\u65f6",
  stageTiming: "\u9636\u6bb5\u8017\u65f6",
  queued: "\u7b49\u5f85\u4e2d",
  running: "\u5904\u7406\u4e2d",
  done: "\u5df2\u5b8c\u6210",
  failed: "\u5931\u8d25",
  canceled: "\u5df2\u53d6\u6d88",
  lang: "\u68c0\u6d4b\u8bed\u8a00",
  computeDevice: "\u8ba1\u7b97\u8bbe\u5907",
  unknown: "\u672a\u77e5",
  segments: "\u6bb5",
  modelChoice: "Whisper \u6a21\u578b",
  compute: "\u8ba1\u7b97\u8bbe\u5907",
  auto: "\u81ea\u52a8",
  audioEnhancement: "\u97f3\u9891\u589e\u5f3a",
  enableAudioEnhancement: "\u542f\u7528\u8f6c\u5199\u524d\u97f3\u9891\u589e\u5f3a",
  normalizeAudio: "\u97f3\u91cf\u6807\u51c6\u5316",
  compressAudio: "\u52a8\u6001\u538b\u7f29",
  denoiseAudio: "\u8f7b\u91cf\u964d\u566a\u95e8\u9650",
  monoAudio: "\u6df7\u5408\u4e3a\u5355\u58f0\u9053",
  targetPeak: "\u76ee\u6807\u5cf0\u503c",
  noiseGateDb: "\u964d\u566a\u95e8\u9650 dB",
  audioEnhancementHint: "\u9ed8\u8ba4\u5173\u95ed\uff0c\u9002\u5408\u4f4e\u97f3\u91cf ASMR\u3001\u8f7b\u58f0\u6216\u80cc\u666f\u97f3\u6548\u8f83\u591a\u7684\u6587\u4ef6\u3002",
  whisperAdvanced: "Whisper \u9ad8\u7ea7\u53c2\u6570",
  recognitionPresets: "\u8bc6\u522b\u9884\u8bbe",
  presetGeneral: "\u901a\u7528\u9ed8\u8ba4",
  presetAsmr: "\u4f4e\u8bed ASMR",
  presetNoisy: "\u80cc\u666f\u97f3\u6548\u591a",
  presetFast: "\u957f\u97f3\u9891\u5feb\u901f",
  presetAccurate: "\u9ad8\u51c6\u786e\u7387",
  recognitionProfile: "\u8bc6\u522b\u6a21\u5f0f",
  profileFast: "\u5feb\u901f",
  profileBalanced: "\u5e73\u8861",
  profileAccurate: "\u7cbe\u51c6",
  profileAsmr: "ASMR",
  beamSize: "Beam Size",
  vadFilter: "\u542f\u7528 VAD \u9759\u97f3\u8fc7\u6ee4",
  noSpeechThreshold: "\u9759\u97f3\u9608\u503c",
  conditionOnPreviousText: "\u4f7f\u7528\u4e0a\u4e0b\u6587\u7eed\u5199",
  initialPrompt: "\u521d\u59cb\u63d0\u793a\u8bcd",
  initialPromptPlaceholder: "\u53ef\u9009\uff0c\u4f8b\u5982\uff1a\u8fd9\u662f\u65e5\u8bed ASMR \u8033\u8bed\u548c\u53e3\u8bed\u5185\u5bb9\u3002",
  whisperAdvancedHint: "ASMR \u63d0\u793a\u8bcd\u9ed8\u8ba4\u4e0d\u542f\u7528\uff1b\u53ea\u6709\u586b\u5199\u540e\u624d\u4f1a\u4f20\u7ed9 Whisper\u3002",
  aiTranslation: "AI \u7ffb\u8bd1",
  aiOnlyHint: "\u65e5\u8bed\u7ffb\u8bd1\u4ec5\u4f7f\u7528 AI \u63a5\u53e3\uff1b\u672a\u914d\u7f6e API Key \u65f6\u65e5\u8bed\u4efb\u52a1\u4f1a\u5931\u8d25\u5e76\u63d0\u793a\u914d\u7f6e\u3002",
  deepseekPreset: "DeepSeek V4 Pro \u9884\u8bbe",
  saveSettings: "\u4fdd\u5b58\u914d\u7f6e",
  settingsSaved: "\u914d\u7f6e\u5df2\u4fdd\u5b58",
  baseUrl: "Base URL",
  apiKey: "API Key",
  model: "\u6a21\u578b",
  temperature: "Temperature",
  topP: "Top P",
  topK: "Top K",
  omitIfEmpty: "\u7559\u7a7a\u5219\u4e0d\u53d1\u9001",
  maxTokens: "Max Tokens",
  timeoutSeconds: "\u8d85\u65f6\u79d2\u6570",
  retries: "\u91cd\u8bd5\u6b21\u6570",
  reasoningEffort: "Reasoning Effort",
  thinking: "\u542f\u7528 thinking",
  systemPrompt: "System Prompt",
  userPrompt: "User Prompt",
  contextWindow: "\u4e0a\u4e0b\u6587\u7a97\u53e3",
  contextOverlap: "\u4e0a\u4e0b\u6587\u91cd\u53e0",
  network: "\u4f9d\u8d56\u4e0e\u6a21\u578b\u4e0b\u8f7d\u4ee3\u7406",
  aiProxy: "AI \u7ffb\u8bd1\u4ee3\u7406",
  proxyEnabled: "\u542f\u7528\u4ee3\u7406",
  proxyType: "\u4ee3\u7406\u7c7b\u578b",
  proxyHost: "\u4ee3\u7406\u5730\u5740",
  proxyPort: "\u7aef\u53e3",
  proxyHint: "\u8fd9\u4e2a\u4ee3\u7406\u53ea\u7528\u4e8e Python \u4f9d\u8d56\u4e0b\u8f7d\u548c Whisper \u6a21\u578b\u4e0b\u8f7d\u3002",
  aiProxyHint: "AI \u7ffb\u8bd1\u9ed8\u8ba4\u4e0d\u8d70\u4ee3\u7406\uff1b\u4ec5\u5728\u9700\u8981\u8bbf\u95ee\u7279\u5b9a API \u65f6\u5355\u72ec\u5f00\u542f\u3002",
  retryDependencies: "\u91cd\u8bd5\u4f9d\u8d56\u5b89\u88c5",
  retryingDependencies: "\u6b63\u5728\u91cd\u8bd5\u4f9d\u8d56\u5b89\u88c5...",
  installTtsDependencies: "\u5b89\u88c5/\u4fee\u590d VoxCPM2 \u4f9d\u8d56",
  installingTtsDependencies: "\u6b63\u5728\u5b89\u88c5/\u4fee\u590d VoxCPM2 \u4f9d\u8d56...",
  unsavedSettings: "有未保存的配置",
  runtimeSettingsSaved: "模型和设备会立即保存",
  saveSettingsHint: "保存 AI、代理、音频增强和语音生成配置",
  segmentRemaining: "剩余",
  segmentIndex: "第",
  segmentUnit: "段",
  bilingualSegment: "双语",
  sourceOnlySegment: "单语",
  models: "\u6a21\u578b\u72b6\u6001",
  firstUseDownload: "\u9996\u6b21\u4f7f\u7528\u4e0b\u8f7d",
  downloaded: "\u5df2\u4e0b\u8f7d",
  aiConfigured: "AI \u5df2\u914d\u7f6e",
  aiNotConfigured: "AI \u672a\u914d\u7f6e",
  modelDirFallback: "\u6a21\u578b\u76ee\u5f55\u5c06\u5728\u5e94\u7528\u542f\u52a8\u540e\u8bfb\u53d6\u3002",
  loadingHardware: "\u6b63\u5728\u68c0\u6d4b\u786c\u4ef6\u72b6\u6001...",
  whisperGpuAvailable: "Whisper GPU \u53ef\u7528",
  whisperGpuUnavailable: "Whisper GPU \u4e0d\u53ef\u7528",
  cudaDevices: "\u4e2a CUDA \u8bbe\u5907",
};

const missingDesktopApi = {
  selectAudio: async (): Promise<AudioFile[]> => {
    throw new Error("\u8bf7\u5728 Electron \u684c\u9762\u5ba2\u6237\u7aef\u4e2d\u9009\u62e9\u6587\u4ef6\u3002");
  },
  getModelStatus: async (): Promise<ModelStatus> => ({
    modelsDir: "Electron \u684c\u9762\u5ba2\u6237\u7aef\u542f\u52a8\u540e\u663e\u793a\u6a21\u578b\u76ee\u5f55",
    whisperDownloaded: false,
  }),
  getHardwareStatus: async (): Promise<HardwareStatus> => ({
    ctranslate2CudaAvailable: false,
    cudaAvailable: false,
    cudaDeviceCount: 0,
    cudaDeviceName: null,
  }),
  getSettings: async (): Promise<AppSettings> => DEEPSEEK_PRESET,
  updateSettings: async (settings: AppSettings): Promise<AppSettings> => settings,
  getHistory: async (): Promise<HistoryTask[]> => [],
  upsertHistory: async (task: HistoryTask) => ({ saved: Boolean(task), id: task.id }),
  retryDependencies: async () => ({ ok: false }),
  installTtsDependencies: async () => ({ ok: false }),
  cancelTranscription: async () => ({ canceled: false }),
  startTranslation: async () => {
    throw new Error("\u8bf7\u5728 Electron \u684c\u9762\u5ba2\u6237\u7aef\u4e2d\u542f\u52a8\u7ffb\u8bd1\u3002");
  },
  cancelTranslation: async () => ({ canceled: false }),
  startTts: async () => {
    throw new Error("\u8bf7\u5728 Electron \u684c\u9762\u5ba2\u6237\u7aef\u4e2d\u751f\u6210\u4e2d\u6587\u8bed\u97f3\u3002");
  },
  cancelTts: async () => ({ canceled: false }),
  startTranscription: async () => {
    throw new Error("\u8bf7\u5728 Electron \u684c\u9762\u5ba2\u6237\u7aef\u4e2d\u542f\u52a8\u8f6c\u5199\u3002");
  },
  saveTxt: async () => {
    throw new Error("\u8bf7\u5728 Electron \u684c\u9762\u5ba2\u6237\u7aef\u4e2d\u4fdd\u5b58\u6587\u4ef6\u3002");
  },
  exportBatch: async () => {
    throw new Error("\u8bf7\u5728 Electron \u684c\u9762\u5ba2\u6237\u7aef\u4e2d\u5bfc\u51fa\u6587\u4ef6\u3002");
  },
  onProgress: () => () => undefined,
  onDone: () => () => undefined,
  onError: () => () => undefined,
  onCanceled: () => () => undefined,
  onTranslateProgress: () => () => undefined,
  onTranslateDone: () => () => undefined,
  onTranslateError: () => () => undefined,
  onTtsProgress: () => () => undefined,
  onTtsDone: () => () => undefined,
  onTtsError: () => () => undefined,
  onTtsCanceled: () => () => undefined,
  onDependencyProgress: () => () => undefined,
};

const desktopApi = window.asmrTrans ?? missingDesktopApi;

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatTimestamp(seconds: number) {
  const safeSeconds = Math.max(seconds, 0);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const wholeSeconds = Math.floor(safeSeconds % 60);
  const milliseconds = Math.floor((safeSeconds - Math.floor(safeSeconds)) * 1000);
  return `${hours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}:${wholeSeconds.toString().padStart(2, "0")}.${milliseconds
    .toString()
    .padStart(3, "0")}`;
}

function formatDuration(seconds: number | null | undefined) {
  if (!Number.isFinite(seconds || 0) || !seconds || seconds < 0) {
    return "--";
  }
  const totalSeconds = Math.round(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const rest = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${rest.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${rest.toString().padStart(2, "0")}`;
}

function formatSrtTimestamp(seconds: number) {
  return formatTimestamp(seconds).replace(".", ",");
}

function buildTxt(result: TranscriptionResult | null | undefined) {
  if (!result) return "";
  return result.segments
    .map((segment) => {
      const timeRange = `[${formatTimestamp(segment.start)} - ${formatTimestamp(segment.end)}]`;
      if (segment.translatedText !== null && segment.translatedText !== undefined) {
        return `${timeRange}\n${text.source}\uff1a${segment.sourceText}\n${text.translation}\uff1a${segment.translatedText}`;
      }
      return `${timeRange}\n${segment.sourceText}`;
    })
    .join("\n\n");
}

function buildSrt(result: TranscriptionResult | null | undefined) {
  if (!result) return "";
  return result.segments
    .map((segment, index) => {
      const subtitleText = segment.translatedText !== null && segment.translatedText !== undefined
        ? `${segment.sourceText}\n${segment.translatedText}`
        : segment.sourceText;
      return `${index + 1}\n${formatSrtTimestamp(segment.start)} --> ${formatSrtTimestamp(segment.end)}\n${subtitleText}`;
    })
    .join("\n\n");
}

function exportBaseName(task: QueueTask) {
  return task.file.name.replace(/\.[^.]+$/, "") || "transcription";
}

function hardwareSummary(status: HardwareStatus | null) {
  if (!status) return text.loadingHardware;
  const whisperGpu = status.ctranslate2CudaAvailable
    ? `${text.whisperGpuAvailable} (${status.ctranslate2CudaDeviceCount || 1} ${text.cudaDevices})`
    : text.whisperGpuUnavailable;
  return whisperGpu;
}

function mergeSettings(settings?: Partial<AppSettings> | null): AppSettings {
  const ttsSettings = {
    ...DEEPSEEK_PRESET.tts,
    ...(settings?.tts || {}),
  };
  if (
    settings?.tts &&
    settings.tts.voicePrompt === LEGACY_TTS_VOICE_PROMPT &&
    Number(settings.tts.cfgValue) === 2 &&
    Number(settings.tts.inferenceTimesteps) === 10
  ) {
    ttsSettings.voicePrompt = DEEPSEEK_PRESET.tts.voicePrompt;
    ttsSettings.cfgValue = DEEPSEEK_PRESET.tts.cfgValue;
    ttsSettings.inferenceTimesteps = DEEPSEEK_PRESET.tts.inferenceTimesteps;
    ttsSettings.retryBadcaseRatioThreshold = DEEPSEEK_PRESET.tts.retryBadcaseRatioThreshold;
    ttsSettings.denoise = DEEPSEEK_PRESET.tts.denoise;
  }
  const merged = {
    ...DEEPSEEK_PRESET,
    ...(settings || {}),
    aiTranslation: {
      ...DEEPSEEK_PRESET.aiTranslation,
      ...(settings?.aiTranslation || {}),
    },
    network: {
      ...DEEPSEEK_PRESET.network,
      ...(settings?.network || {}),
    },
    audioEnhancement: {
      ...DEEPSEEK_PRESET.audioEnhancement,
      ...(settings?.audioEnhancement || {}),
    },
    whisperAdvanced: {
      ...DEEPSEEK_PRESET.whisperAdvanced,
      ...(settings?.whisperAdvanced || {}),
    },
    tts: ttsSettings,
  };
  merged.translationBackend = "ai";
  return merged;
}

function parseNumericInput(value: string, fallback: number) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function statusLabel(status: QueueTaskStatus) {
  return text[status];
}

function mergeStageTiming(current: Record<string, number> | undefined, progress: TranscriptionProgress) {
  if (!progress.stage || typeof progress.stageElapsedSeconds !== "number") {
    return current;
  }
  return {
    ...(current || {}),
    [progress.stage]: progress.stageElapsedSeconds,
  };
}

function shouldTranslateWithAi(result: TranscriptionResult) {
  return result.detectedLanguage.toLowerCase().startsWith("ja");
}

function hasChineseTranslation(result: TranscriptionResult | null | undefined) {
  return Boolean(result?.segments.some((segment) => typeof segment.translatedText === "string" && segment.translatedText.trim()));
}

function resizeTextarea(textarea: HTMLTextAreaElement) {
  textarea.style.height = "auto";
  textarea.style.height = `${Math.max(textarea.scrollHeight, 44)}px`;
}

function taskAddedTime(task: QueueTask | HistoryTask) {
  return new Date(task.addedAt || task.completedAt || 0).getTime() || 0;
}

function taskIdentity(task: QueueTask) {
  return task.historyId || task.id;
}

function MediaIcon({ extension }: { extension: string }) {
  return VIDEO_EXTENSIONS.has(extension.toLowerCase()) ? <FileVideo size={20} /> : <FileAudio size={20} />;
}

function createTask(file: AudioFile): QueueTask {
  return {
    id: `${file.path}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    file,
    status: "queued",
    addedAt: new Date().toISOString(),
    progress: null,
    result: null,
    error: null,
  };
}

function createHistoryQueueTask(task: HistoryTask): QueueTask {
  return {
    id: `history-${task.id}`,
    historyId: task.id,
    file: task.file,
    status: "done",
    progress: { stage: "done", message: text.historyLoaded, percent: 100 },
    result: task.result,
    error: null,
    addedAt: task.addedAt || task.completedAt,
    completedAt: task.completedAt,
  };
}

function buildHistoryTask(task: QueueTask): HistoryTask | null {
  if (!task.result) return null;
  return {
    id: task.historyId || `${task.file.path}-${task.completedAt || Date.now()}`,
    file: task.file,
    result: task.result,
    addedAt: task.addedAt,
    completedAt: task.completedAt || new Date().toISOString(),
  };
}

type RecognitionPreset = {
  key: string;
  label: string;
  audioEnhancement: AudioEnhancementSettings;
  whisperAdvanced: Omit<WhisperAdvancedSettings, "initialPrompt">;
};

const RECOGNITION_PRESETS: RecognitionPreset[] = [
  {
    key: "general",
    label: text.presetGeneral,
    audioEnhancement: {
      enabled: false,
      normalize: true,
      compression: true,
      denoise: false,
      mono: true,
      targetPeak: 0.9,
      noiseGateDb: -48,
    },
    whisperAdvanced: {
      profile: "balanced",
      beamSize: 5,
      vadFilter: true,
      noSpeechThreshold: 0.6,
      conditionOnPreviousText: false,
    },
  },
  {
    key: "asmr",
    label: text.presetAsmr,
    audioEnhancement: {
      enabled: true,
      normalize: true,
      compression: true,
      denoise: false,
      mono: true,
      targetPeak: 0.9,
      noiseGateDb: -50,
    },
    whisperAdvanced: {
      profile: "asmr",
      beamSize: 8,
      vadFilter: false,
      noSpeechThreshold: 0.45,
      conditionOnPreviousText: true,
    },
  },
  {
    key: "noisy",
    label: text.presetNoisy,
    audioEnhancement: {
      enabled: true,
      normalize: true,
      compression: true,
      denoise: true,
      mono: true,
      targetPeak: 0.88,
      noiseGateDb: -50,
    },
    whisperAdvanced: {
      profile: "asmr",
      beamSize: 8,
      vadFilter: false,
      noSpeechThreshold: 0.48,
      conditionOnPreviousText: true,
    },
  },
  {
    key: "fast",
    label: text.presetFast,
    audioEnhancement: {
      enabled: true,
      normalize: true,
      compression: false,
      denoise: false,
      mono: true,
      targetPeak: 0.9,
      noiseGateDb: -48,
    },
    whisperAdvanced: {
      profile: "fast",
      beamSize: 3,
      vadFilter: true,
      noSpeechThreshold: 0.6,
      conditionOnPreviousText: false,
    },
  },
  {
    key: "accurate",
    label: text.presetAccurate,
    audioEnhancement: {
      enabled: true,
      normalize: true,
      compression: true,
      denoise: false,
      mono: true,
      targetPeak: 0.9,
      noiseGateDb: -50,
    },
    whisperAdvanced: {
      profile: "accurate",
      beamSize: 10,
      vadFilter: true,
      noSpeechThreshold: 0.5,
      conditionOnPreviousText: true,
    },
  },
];

function waitForQueueResume(pausedRef: React.MutableRefObject<boolean>) {
  if (!pausedRef.current) {
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    const timer = window.setInterval(() => {
      if (!pausedRef.current) {
        window.clearInterval(timer);
        resolve();
      }
    }, 200);
  });
}

function App() {
  const [tasks, setTasks] = useState<QueueTask[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [modelStatus, setModelStatus] = useState<ModelStatus | null>(null);
  const [hardwareStatus, setHardwareStatus] = useState<HardwareStatus | null>(null);
  const [computeDevice, setComputeDevice] = useState<ComputeDevice>("auto");
  const [whisperModel, setWhisperModel] = useState<WhisperModelName>(DEFAULT_WHISPER_MODEL);
  const [settings, setSettings] = useState<AppSettings>(DEEPSEEK_PRESET);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [isQueueRunning, setIsQueueRunning] = useState(false);
  const [isQueuePaused, setIsQueuePaused] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isTaskOrderDescending, setIsTaskOrderDescending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedPath, setSavedPath] = useState<string | null>(null);
  const [globalProgress, setGlobalProgress] = useState<TranscriptionProgress | null>(null);
  const [ttsTaskId, setTtsTaskId] = useState<string | null>(null);
  const [visibleSegmentCount, setVisibleSegmentCount] = useState(SEGMENT_PAGE_SIZE);

  const currentTaskIdRef = useRef<string | null>(null);
  const taskResolverRef = useRef<((ok: boolean) => void) | null>(null);
  const queuePausedRef = useRef(false);
  const historyLoadedRef = useRef(false);
  const translationTaskIdsRef = useRef<Set<string>>(new Set());
  const tasksRef = useRef<QueueTask[]>([]);
  const settingsRef = useRef(settings);
  const whisperModelRef = useRef(whisperModel);
  const computeDeviceRef = useRef(computeDevice);
  const ttsTaskIdRef = useRef<string | null>(null);
  const resultScrollRef = useRef<HTMLDivElement | null>(null);

  const selectedTask = useMemo(
    () => tasks.find((task) => task.id === selectedTaskId) || null,
    [selectedTaskId, tasks],
  );
  const txtContent = useMemo(() => buildTxt(selectedTask?.result), [selectedTask]);
  const srtContent = useMemo(() => buildSrt(selectedTask?.result), [selectedTask]);
  const selectedTaskHasChinese = useMemo(() => hasChineseTranslation(selectedTask?.result), [selectedTask]);
  const selectedSegments = selectedTask?.result?.segments || [];
  const visibleSegments = useMemo(
    () => selectedSegments.slice(0, visibleSegmentCount),
    [selectedSegments, visibleSegmentCount],
  );
  const hasMoreSegments = visibleSegments.length < selectedSegments.length;
  const doneTasks = useMemo(() => tasks.filter((task) => task.status === "done" && task.result), [tasks]);
  const visibleTasks = useMemo(
    () => (isTaskOrderDescending ? [...tasks].reverse() : tasks),
    [isTaskOrderDescending, tasks],
  );

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);
  useEffect(() => {
    whisperModelRef.current = whisperModel;
  }, [whisperModel]);
  useEffect(() => {
    computeDeviceRef.current = computeDevice;
  }, [computeDevice]);
  useEffect(() => {
    ttsTaskIdRef.current = ttsTaskId;
  }, [ttsTaskId]);
  useEffect(() => {
    queuePausedRef.current = isQueuePaused;
  }, [isQueuePaused]);
  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  useEffect(() => {
    if (resultScrollRef.current) {
      resultScrollRef.current.scrollTop = 0;
    }
    setVisibleSegmentCount(SEGMENT_PAGE_SIZE);
  }, [selectedTaskId]);

  useEffect(() => {
    window.requestAnimationFrame(() => {
      document.querySelectorAll<HTMLTextAreaElement>(".segmentField textarea").forEach(resizeTextarea);
    });
  }, [selectedTask?.id, visibleSegments.length]);

  useEffect(() => {
    desktopApi.getModelStatus().then(setModelStatus).catch((err) => setError(err instanceof Error ? err.message : String(err)));
    desktopApi.getHardwareStatus().then(setHardwareStatus).catch(() => undefined);
    desktopApi
      .getHistory()
      .then((history) => {
        if (historyLoadedRef.current) return;
        historyLoadedRef.current = true;
        const historyTasks = [...history]
          .sort((left, right) => taskAddedTime(left) - taskAddedTime(right))
          .map(createHistoryQueueTask);
        if (!historyTasks.length) return;
        setTasks((current) => {
          const knownIds = new Set(current.map(taskIdentity));
          const uniqueHistoryTasks = historyTasks.filter((task) => !knownIds.has(taskIdentity(task)));
          return [...current, ...uniqueHistoryTasks];
        });
      })
      .catch(() => undefined);
    desktopApi
      .getSettings()
      .then((nextSettings) => {
        const merged = mergeSettings(nextSettings);
        setSettings(merged);
        setWhisperModel(merged.whisperModel);
        setComputeDevice(merged.computeDevice);
        setSettingsDirty(false);
      })
      .catch(() => undefined);

    const offProgress = desktopApi.onProgress((nextProgress) => {
      const taskId = currentTaskIdRef.current;
      if (!taskId) return;
      setTasks((current) =>
        current.map((task) =>
          task.id === taskId
            ? {
                ...task,
                progress: nextProgress,
                stageTimings: mergeStageTiming(task.stageTimings, nextProgress),
                status: "running",
              }
            : task,
        ),
      );
    });
    const offDone = desktopApi.onDone((nextResult) => {
      const taskId = currentTaskIdRef.current;
      if (!taskId) return;
      if (shouldTranslateWithAi(nextResult)) {
        setTasks((current) =>
          current.map((task) =>
            task.id === taskId
              ? {
                  ...task,
                  status: "running",
                  result: nextResult,
                  progress: { ...task.progress, stage: "translate", message: "\u6b63\u5728 AI \u7ffb\u8bd1...", percent: 55 },
                }
              : task,
          ),
        );
        void startTaskTranslation(taskId, nextResult);
      } else {
        completeTaskWithResult(taskId, nextResult);
      }
      desktopApi.getModelStatus().then(setModelStatus).catch(() => undefined);
      desktopApi.getHardwareStatus().then(setHardwareStatus).catch(() => undefined);
      taskResolverRef.current?.(true);
      taskResolverRef.current = null;
    });
    const offError = desktopApi.onError((workerError) => {
      const taskId = currentTaskIdRef.current;
      if (!taskId) return;
      setTasks((current) =>
        current.map((task) =>
          task.id === taskId ? { ...task, status: "failed", error: workerError.message, progress: null } : task,
        ),
      );
      taskResolverRef.current?.(false);
      taskResolverRef.current = null;
    });
    const offCanceled = desktopApi.onCanceled((payload) => {
      const taskId = currentTaskIdRef.current;
      if (!taskId) return;
      setTasks((current) =>
        current.map((task) =>
          task.id === taskId
            ? { ...task, status: "canceled", error: payload.message || text.canceled, progress: null }
            : task,
        ),
      );
      taskResolverRef.current?.(false);
      taskResolverRef.current = null;
    });
    const offTranslateProgress = desktopApi.onTranslateProgress(({ taskId, progress }) => {
      setTasks((current) =>
        current.map((task) =>
          task.id === taskId
            ? {
                ...task,
                status: "running",
                progress,
                stageTimings: mergeStageTiming(task.stageTimings, progress),
              }
            : task,
        ),
      );
    });
    const offTranslateDone = desktopApi.onTranslateDone(({ taskId, result }) => {
      translationTaskIdsRef.current.delete(taskId);
      completeTaskWithResult(taskId, result);
    });
    const offTranslateError = desktopApi.onTranslateError(({ taskId, error: translateError }) => {
      translationTaskIdsRef.current.delete(taskId);
      setTasks((current) =>
        current.map((task) =>
          task.id === taskId ? { ...task, status: "failed", error: translateError.message, progress: null } : task,
        ),
      );
    });
    const offTtsProgress = desktopApi.onTtsProgress(({ taskId, progress }) => {
      setTtsTaskId(taskId);
      setGlobalProgress(progress);
      setTasks((current) =>
        current.map((task) =>
          task.id === taskId
            ? {
                ...task,
                progress,
                stageTimings: mergeStageTiming(task.stageTimings, progress),
              }
            : task,
        ),
      );
    });
    const offTtsDone = desktopApi.onTtsDone(({ taskId, result }) => {
      setTtsTaskId(null);
      setSavedPath(result.outputPath);
      setGlobalProgress({ stage: "done", message: text.done, percent: 100 });
      setTasks((current) =>
        current.map((task) =>
          task.id === taskId
            ? {
                ...task,
                progress: { stage: "done", message: text.done, percent: 100 },
              }
            : task,
        ),
      );
      desktopApi.getModelStatus().then(setModelStatus).catch(() => undefined);
    });
    const offTtsError = desktopApi.onTtsError(({ taskId, error: ttsError }) => {
      setTtsTaskId(null);
      setError(ttsError.message);
      setGlobalProgress({ stage: "tts", message: ttsError.message, percent: 0 });
      setTasks((current) =>
        current.map((task) =>
          task.id === taskId ? { ...task, error: ttsError.message, progress: null } : task,
        ),
      );
    });
    const offTtsCanceled = desktopApi.onTtsCanceled(({ taskId, message }) => {
      setTtsTaskId(null);
      setGlobalProgress({ stage: "tts", message: message || text.ttsCanceled, percent: 0 });
      setTasks((current) =>
        current.map((task) => (task.id === taskId ? { ...task, progress: null, error: message || text.ttsCanceled } : task)),
      );
    });
    const offDependencyProgress = desktopApi.onDependencyProgress((nextProgress) => {
      const taskId = currentTaskIdRef.current;
      if (!taskId) {
        setGlobalProgress(nextProgress);
        return;
      }
      setTasks((current) =>
        current.map((task) =>
          task.id === taskId
            ? { ...task, progress: nextProgress, stageTimings: mergeStageTiming(task.stageTimings, nextProgress) }
            : task,
        ),
      );
    });

    return () => {
      offProgress();
      offDone();
      offError();
      offCanceled();
      offTranslateProgress();
      offTranslateDone();
      offTranslateError();
      offTtsProgress();
      offTtsDone();
      offTtsError();
      offTtsCanceled();
      offDependencyProgress();
    };
  }, []);

  async function selectMedia() {
    setError(null);
    setSavedPath(null);
    setGlobalProgress(null);
    try {
      const selected = await desktopApi.selectAudio();
      if (!selected.length) return;
      const nextTasks = selected.map(createTask);
      setTasks((current) => [...current, ...nextTasks]);
      setSelectedTaskId((current) => current || nextTasks[0].id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function completeTaskWithResult(taskId: string, result: TranscriptionResult) {
    const completedAt = new Date().toISOString();
    setTasks((current) =>
      current.map((task) =>
        task.id === taskId
          ? {
              ...task,
              status: "done",
              result,
              completedAt,
              progress: { ...task.progress, stage: "done", message: text.done, percent: 100 },
            }
          : task,
      ),
    );
    const completedTask = tasksRef.current.find((task) => task.id === taskId);
    if (!completedTask) {
      return;
    }
        const historyTask: HistoryTask = {
          id: completedTask.historyId || `${completedTask.file.path}-${completedAt}`,
          file: completedTask.file,
          result,
          addedAt: completedTask.addedAt || completedAt,
          completedAt,
        };
    desktopApi
      .upsertHistory(historyTask)
      .then((response) => {
        setTasks((current) =>
          current.map((task) => (task.id === taskId ? { ...task, historyId: response.id, completedAt } : task)),
        );
      })
      .catch(() => undefined);
  }

  async function startTaskTranslation(taskId: string, result: TranscriptionResult) {
    if (translationTaskIdsRef.current.has(taskId)) {
      return;
    }
    translationTaskIdsRef.current.add(taskId);
    try {
      await desktopApi.startTranslation({
        taskId,
        detectedLanguage: result.detectedLanguage,
        computeDevice: result.computeDevice,
        segments: result.segments,
        aiTranslationConfig: settingsRef.current.aiTranslation,
      });
    } catch (err) {
      translationTaskIdsRef.current.delete(taskId);
      const message = err instanceof Error ? err.message : String(err);
      setTasks((current) =>
        current.map((task) => (task.id === taskId ? { ...task, status: "failed", error: message, progress: null } : task)),
      );
    }
  }

  async function runTask(task: QueueTask) {
    currentTaskIdRef.current = task.id;
    setSelectedTaskId(task.id);
    setTasks((current) =>
      current.map((item) =>
        item.id === task.id
          ? { ...item, status: "running", error: null, progress: { stage: "start", message: text.running, percent: 0 } }
          : item,
      ),
    );

    const waitForResult = new Promise<boolean>((resolve) => {
      taskResolverRef.current = resolve;
    });

    try {
      await desktopApi.startTranscription({
        audioPath: task.file.path,
        whisperModel: whisperModelRef.current,
        translationModel: "ai-chat-completions",
        translationBackend: "ai",
        aiTranslationConfig: settingsRef.current.aiTranslation,
        audioEnhancement: settingsRef.current.audioEnhancement,
        whisperAdvanced: settingsRef.current.whisperAdvanced,
        computeDevice: computeDeviceRef.current,
      });
      await waitForResult;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setTasks((current) =>
        current.map((item) => (item.id === task.id ? { ...item, status: "failed", error: message, progress: null } : item)),
      );
      taskResolverRef.current = null;
    } finally {
      currentTaskIdRef.current = null;
    }
  }

  async function startQueue() {
    if (ttsTaskIdRef.current) {
      setError(text.ttsRunning);
      return;
    }
    if (!tasks.some((task) => task.status === "queued")) {
      setError(text.chooseFirst);
      return;
    }
    setError(null);
    setSavedPath(null);
    setIsQueueRunning(true);
    setIsQueuePaused(false);
    try {
      const queuedTasks = tasks.filter((task) => task.status === "queued");
      for (const task of queuedTasks) {
        await waitForQueueResume(queuePausedRef);
        const latestTask = tasksRef.current.find((item) => item.id === task.id);
        if (!latestTask || latestTask.status === "canceled") {
          continue;
        }
        await runTask(task);
      }
    } finally {
      setIsQueueRunning(false);
      setIsQueuePaused(false);
    }
  }

  function pauseQueue() {
    if (isQueueRunning) {
      setIsQueuePaused(true);
    }
  }

  function resumeQueue() {
    setIsQueuePaused(false);
    if (!isQueueRunning && tasks.some((task) => task.status === "queued")) {
      void startQueue();
    }
  }

  async function cancelTask(taskId: string | null) {
    if (!taskId) return;
    const target = tasks.find((task) => task.id === taskId);
    if (!target || target.status === "done" || target.status === "failed" || target.status === "canceled") {
      return;
    }
    if (target.status === "running") {
      if (currentTaskIdRef.current === taskId) {
        await desktopApi.cancelTranscription();
        return;
      }
      await desktopApi.cancelTranslation(taskId);
      translationTaskIdsRef.current.delete(taskId);
      setTasks((current) =>
        current.map((task) =>
          task.id === taskId ? { ...task, status: "canceled", error: text.canceled, progress: null } : task,
        ),
      );
      return;
    }
    setTasks((current) =>
      current.map((task) =>
        task.id === taskId ? { ...task, status: "canceled", error: text.canceled, progress: null } : task,
      ),
    );
  }

  function removeTask(taskId: string) {
    const target = tasksRef.current.find((task) => task.id === taskId);
    if (!target || target.status === "running" || taskId === ttsTaskIdRef.current) {
      return;
    }
    const nextTasks = tasksRef.current.filter((task) => task.id !== taskId);
    setTasks(nextTasks);
    if (selectedTaskId === taskId) {
      setSelectedTaskId(nextTasks[0]?.id || null);
    }
  }

  function updateSegmentText(taskId: string, segmentIndex: number, field: "sourceText" | "translatedText", value: string) {
    let updatedTask: QueueTask | null = null;
    setTasks((current) =>
      current.map((task) => {
        if (task.id !== taskId || !task.result) {
          return task;
        }
        const nextSegments = task.result.segments.map((segment, index) =>
          index === segmentIndex ? { ...segment, [field]: value } : segment,
        );
        updatedTask = {
          ...task,
          result: {
            ...task.result,
            segments: nextSegments,
          },
        };
        return updatedTask;
      }),
    );

    window.setTimeout(() => {
      const task = updatedTask;
      if (!task) return;
      const historyTask = buildHistoryTask(task);
      if (!historyTask) return;
      desktopApi.upsertHistory(historyTask).catch(() => undefined);
    }, 0);
  }

  function handleSegmentTextChange(
    event: React.ChangeEvent<HTMLTextAreaElement>,
    taskId: string,
    segmentIndex: number,
    field: "sourceText" | "translatedText",
  ) {
    resizeTextarea(event.currentTarget);
    updateSegmentText(taskId, segmentIndex, field, event.currentTarget.value);
  }

  function updateAiTranslation(patch: Partial<AiTranslationConfig>) {
    setSettings((current) => ({
      ...current,
      aiTranslation: {
        ...current.aiTranslation,
        ...patch,
      },
    }));
    setSettingsSaved(false);
    setSettingsDirty(true);
  }

  function updateNetwork(patch: Partial<NetworkSettings>) {
    setSettings((current) => ({
      ...current,
      network: {
        ...current.network,
        ...patch,
      },
    }));
    setSettingsSaved(false);
    setSettingsDirty(true);
  }

  function updateAudioEnhancement(patch: Partial<AudioEnhancementSettings>) {
    setSettings((current) => ({
      ...current,
      audioEnhancement: {
        ...current.audioEnhancement,
        ...patch,
      },
    }));
    setSettingsSaved(false);
    setSettingsDirty(true);
  }

  function updateWhisperAdvanced(patch: Partial<WhisperAdvancedSettings>) {
    setSettings((current) => ({
      ...current,
      whisperAdvanced: {
        ...current.whisperAdvanced,
        ...patch,
      },
    }));
    setSettingsSaved(false);
    setSettingsDirty(true);
  }

  function updateTts(patch: Partial<TtsSettings>) {
    setSettings((current) => ({
      ...current,
      tts: {
        ...current.tts,
        ...patch,
      },
    }));
    setSettingsSaved(false);
    setSettingsDirty(true);
  }

  async function retryDependencies() {
    setError(null);
    setGlobalProgress({ stage: "dependencies", message: text.retryingDependencies, percent: 1 });
    try {
      await desktopApi.updateSettings(mergeSettings({ ...settings, whisperModel, computeDevice }));
      await desktopApi.retryDependencies();
      setGlobalProgress({ stage: "dependencies", message: "\u0050ython \u4f9d\u8d56\u5df2\u5c31\u7eea\u3002", percent: 100 });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setGlobalProgress({ stage: "dependencies", message, percent: 0 });
      setError(message);
    }
  }

  async function installTtsDependencies() {
    setError(null);
    setGlobalProgress({ stage: "tts-dependencies", message: text.installingTtsDependencies, percent: 1 });
    try {
      await desktopApi.updateSettings(mergeSettings({ ...settings, whisperModel, computeDevice }));
      await desktopApi.installTtsDependencies();
      setGlobalProgress({ stage: "tts-dependencies", message: "VoxCPM2 \u4f9d\u8d56\u5df2\u5c31\u7eea\u3002", percent: 100 });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setGlobalProgress({ stage: "tts-dependencies", message, percent: 0 });
      setError(message);
    }
  }

  async function persistRuntimeSettings(patch: Partial<AppSettings>) {
    const nextSettings = mergeSettings({
      ...settings,
      whisperModel,
      computeDevice,
      ...patch,
    });
    setSettings(nextSettings);
    setSettingsSaved(false);
    try {
      const saved = await desktopApi.updateSettings(nextSettings);
      setSettings(mergeSettings(saved));
      setSettingsDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function saveSettings() {
    const saved = await desktopApi.updateSettings(mergeSettings({ ...settings, whisperModel, computeDevice }));
    setSettings(mergeSettings(saved));
    setSettingsSaved(true);
    setSettingsDirty(false);
  }

  function applyDeepSeekPreset() {
    setSettings((current) => ({
      whisperModel,
      computeDevice,
      translationBackend: "ai",
      aiTranslation: {
        ...DEEPSEEK_PRESET.aiTranslation,
        apiKey: current.aiTranslation.apiKey,
        proxyEnabled: current.aiTranslation.proxyEnabled,
        proxyType: current.aiTranslation.proxyType,
        proxyHost: current.aiTranslation.proxyHost,
        proxyPort: current.aiTranslation.proxyPort,
      },
      network: current.network,
      audioEnhancement: current.audioEnhancement,
      whisperAdvanced: current.whisperAdvanced,
      tts: current.tts,
    }));
    setSettingsSaved(false);
    setSettingsDirty(true);
  }

  async function saveSelectedTxt() {
    if (!txtContent || !selectedTask) {
      setError(text.noResultToSave);
      return;
    }
    const baseName = exportBaseName(selectedTask);
    const response = await desktopApi.saveTxt({
      content: txtContent,
      defaultFileName: `${baseName}.txt`,
      defaultDirectory: selectedTask.file.path.replace(/[\\/][^\\/]*$/, ""),
    });
    if (response.saved && response.path) {
      setSavedPath(response.path);
    }
  }

  async function saveSelectedSrt() {
    if (!srtContent || !selectedTask) {
      setError(text.noResultToSave);
      return;
    }
    const baseName = exportBaseName(selectedTask);
    const response = await desktopApi.saveTxt({
      content: srtContent,
      defaultFileName: `${baseName}.srt`,
      defaultDirectory: selectedTask.file.path.replace(/[\\/][^\\/]*$/, ""),
    });
    if (response.saved && response.path) {
      setSavedPath(response.path);
    }
  }

  async function generateSelectedChineseVoice() {
    if (!selectedTask || !selectedTask.result) {
      setError(text.noResultToSave);
      return;
    }
    if (!settings.tts.enabled) {
      setError(text.ttsNotEnabled);
      return;
    }
    if (!hasChineseTranslation(selectedTask.result)) {
      setError(text.noChineseTranslation);
      return;
    }
    setError(null);
    setSavedPath(null);
    setTtsTaskId(selectedTask.id);
    setTasks((current) =>
      current.map((task) =>
        task.id === selectedTask.id
          ? { ...task, error: null, progress: { stage: "tts", message: text.ttsRunning, percent: 1 } }
          : task,
      ),
    );
    try {
      await desktopApi.updateSettings(mergeSettings({ ...settings, whisperModel, computeDevice }));
      const baseName = exportBaseName(selectedTask);
      const response = await desktopApi.startTts({
        taskId: selectedTask.id,
        mediaPath: selectedTask.file.path,
        segments: selectedTask.result.segments,
        tts: settings.tts,
        defaultFileName: `${baseName}.zh.wav`,
        defaultDirectory: selectedTask.file.path.replace(/[\\/][^\\/]*$/, ""),
      });
      if (!response.started) {
        setTtsTaskId(null);
        setTasks((current) => current.map((task) => (task.id === selectedTask.id ? { ...task, progress: null } : task)));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setTtsTaskId(null);
      setError(message);
      setGlobalProgress({ stage: "tts", message, percent: 0 });
      setTasks((current) =>
        current.map((task) => (task.id === selectedTask.id ? { ...task, error: message, progress: null } : task)),
      );
    }
  }

  async function cancelChineseVoice() {
    await desktopApi.cancelTts();
    const taskId = ttsTaskIdRef.current;
    if (taskId) {
      setTtsTaskId(null);
      setTasks((current) => current.map((task) => (task.id === taskId ? { ...task, progress: null } : task)));
    }
  }

  async function exportAll(format: "txt" | "srt") {
    const items = doneTasks
      .map((task) => {
        const content = format === "txt" ? buildTxt(task.result) : buildSrt(task.result);
        return {
          content,
          fileName: `${exportBaseName(task)}.${format}`,
        };
      })
      .filter((item) => item.content.trim());

    if (!items.length) {
      setError(text.noBatchResult);
      return;
    }

    try {
      const response = await desktopApi.exportBatch({ items });
      if (response.saved && response.directory) {
        setSavedPath(`${response.directory} (${text.batchSaved}${response.count || items.length})`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const queueSummary = `${whisperModel} / ${computeDevice.toUpperCase()} / AI / ${
    settings.aiTranslation.apiKey ? text.aiConfigured : text.aiNotConfigured
  }`;

  return (
    <main className="shell">
      <section className="topbar appToolbar">
        <div className="brandBlock">
          <p className="eyebrow">{text.appSubtitle}</p>
          <h1>ASMR Trans</h1>
          <p className="toolbarSummary">{queueSummary}</p>
        </div>
        <div className="commandArea">
          <div className="toolbarActions primaryActions">
            <button className="secondaryButton" onClick={selectMedia} disabled={isQueueRunning}>
              <FolderOpen size={18} />
              {text.selectMedia}
            </button>
            <button className="primaryButton toolbarPrimary" onClick={startQueue} disabled={isQueueRunning}>
              {isQueueRunning ? <Loader2 className="spin" size={18} /> : <Play size={18} />}
              {text.startQueue}
            </button>
            <button className="secondaryButton" onClick={isQueuePaused ? resumeQueue : pauseQueue} disabled={!isQueueRunning}>
              {isQueuePaused ? <RotateCcw size={18} /> : <Pause size={18} />}
              {isQueuePaused ? text.resumeQueue : text.pauseQueue}
            </button>
            <button
              className="secondaryButton dangerButton"
              onClick={() => void cancelTask(selectedTask?.id || null)}
              disabled={!selectedTask || !["queued", "running"].includes(selectedTask.status)}
            >
              <Square size={16} />
              {text.cancelTask}
            </button>
          </div>
          <div className="toolbarActions secondaryActions">
            <button className="secondaryButton" onClick={() => void exportAll("txt")} disabled={!doneTasks.length}>
              <Save size={18} />
              {text.exportAllTxt}
            </button>
            <button className="secondaryButton" onClick={() => void exportAll("srt")} disabled={!doneTasks.length}>
              <Download size={18} />
              {text.exportAllSrt}
            </button>
            <button className="secondaryButton iconButton" onClick={() => setIsSettingsOpen(true)} disabled={isQueueRunning}>
              <Settings size={18} />
              {text.settings}
            </button>
          </div>
          {globalProgress && (
            <div className="globalProgress">
              <div className="progressTrack">
                <div className="progressFill" style={{ width: `${globalProgress.percent ?? 0}%` }} />
              </div>
              <span>{globalProgress.message}</span>
            </div>
          )}
        </div>
      </section>

      <section className="workspace queueWorkspace">
        <section className="taskPanel">
          <div className="panelHeader">
            <h2>{text.queue}</h2>
            <div className="panelHeaderActions">
              <button className="smallToggleButton" onClick={() => setIsTaskOrderDescending((current) => !current)}>
                {isTaskOrderDescending ? text.sortNewestFirst : text.sortOldestFirst}
              </button>
              <span>{tasks.length}</span>
            </div>
          </div>
          <div className="taskList">
            {!tasks.length && <div className="emptyState compactEmpty">{text.emptyQueue}</div>}
            {visibleTasks.map((task) => (
              <div
                key={task.id}
                className={`taskItem ${selectedTask?.id === task.id ? "selected" : ""}`}
                onClick={() => setSelectedTaskId(task.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedTaskId(task.id);
                  }
                }}
              >
                <MediaIcon extension={task.file.extension} />
                <div className="taskMeta">
                  <strong>{task.file.name}</strong>
                  <span>
                    {task.file.extension.toUpperCase()} - {formatBytes(task.file.size)}
                  </span>
                  {task.completedAt && <span>{`${text.historyLoaded} - ${new Date(task.completedAt).toLocaleString()}`}</span>}
                  {task.error && <em>{task.error}</em>}
                </div>
                <div className={`taskStatus ${task.status}`}>
                  {task.status === "running" && <Loader2 className="spin" size={14} />}
                  {statusLabel(task.status)}
                  {typeof task.progress?.percent === "number" ? ` ${task.progress.percent}%` : ""}
                </div>
                <button
                  className="taskRemoveButton"
                  title={text.removeTask}
                  aria-label={text.removeTask}
                  onClick={(event) => {
                    event.stopPropagation();
                    removeTask(task.id);
                  }}
                  disabled={task.status === "running" || task.id === ttsTaskId}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="resultPanel">
          <div className="resultHeader">
            <div>
              <h2>{selectedTask?.file.name || text.result}</h2>
              <p>
                {selectedTask?.result
                  ? `${text.lang}\uff1a${selectedTask.result.detectedLanguage} - ${text.computeDevice}\uff1a${
                      selectedTask.result.computeDevice || text.unknown
                    } - ${selectedTask.result.segments.length} ${text.segments}`
                  : selectedTask?.progress?.message || text.emptyResult}
              </p>
              {selectedTask?.result && selectedTask.progress?.message && (
                <p className="progressMessage">{selectedTask.progress.message}</p>
              )}
              {selectedTask && <ProgressMetrics task={selectedTask} />}
            </div>
            <div className="exportActions">
              <button className="secondaryButton" onClick={saveSelectedTxt} disabled={selectedTask?.status !== "done" || !selectedTask?.result}>
                <Save size={18} />
                {text.saveTxt}
              </button>
              <button className="secondaryButton" onClick={saveSelectedSrt} disabled={selectedTask?.status !== "done" || !selectedTask?.result}>
                <Download size={18} />
                {text.saveSrt}
              </button>
              {ttsTaskId === selectedTask?.id ? (
                <button className="secondaryButton dangerButton" onClick={() => void cancelChineseVoice()}>
                  <Square size={18} />
                  {text.cancelChineseVoice}
                </button>
              ) : (
                <button
                  className="secondaryButton"
                  onClick={() => void generateSelectedChineseVoice()}
                  disabled={
                    selectedTask?.status !== "done" ||
                    !selectedTask?.result ||
                    !selectedTaskHasChinese ||
                    !settings.tts.enabled ||
                    Boolean(ttsTaskId)
                  }
                >
                  <Volume2 size={18} />
                  {text.generateChineseVoice}
                </button>
              )}
            </div>
          </div>

          <div className="segments" ref={resultScrollRef}>
            {!selectedTask?.result && <div className="emptyState">{selectedTask?.error || text.emptyResult}</div>}
            {selectedTask?.result && selectedSegments.length > visibleSegments.length && (
              <div className="segmentWindowNotice">
                {text.showingSegments}: {visibleSegments.length} / {selectedSegments.length}
              </div>
            )}
            {selectedTask && visibleSegments.map((segment, index) => {
              const isBilingual = segment.translatedText !== null && segment.translatedText !== undefined;
              return (
                <article className={`segment ${isBilingual ? "bilingualSegment" : "sourceOnlySegment"}`} key={`${segment.start}-${segment.end}-${index}`}>
                  <div className="segmentMeta">
                    <time>
                      {formatTimestamp(segment.start)} - {formatTimestamp(segment.end)}
                    </time>
                    <span>{`${text.segmentIndex} ${index + 1} ${text.segmentUnit}`}</span>
                    <span>{isBilingual ? text.bilingualSegment : text.sourceOnlySegment}</span>
                  </div>
                  <div className="segmentContent">
                    {isBilingual ? (
                      <>
                        <label className="segmentField">
                          <span>{text.source}</span>
                          <textarea
                            value={segment.sourceText}
                            onChange={(event) => handleSegmentTextChange(event, selectedTask.id, index, "sourceText")}
                            rows={1}
                          />
                        </label>
                        <label className="segmentField">
                          <span>{text.translation}</span>
                          <textarea
                            value={segment.translatedText ?? ""}
                            onChange={(event) => handleSegmentTextChange(event, selectedTask.id, index, "translatedText")}
                            rows={1}
                          />
                        </label>
                      </>
                    ) : (
                      <label className="segmentField">
                        <span>{text.source}</span>
                        <textarea
                          value={segment.sourceText}
                          onChange={(event) => handleSegmentTextChange(event, selectedTask.id, index, "sourceText")}
                          rows={1}
                        />
                      </label>
                    )}
                  </div>
                </article>
              );
            })}
            {selectedTask?.result && hasMoreSegments && (
              <button
                className="secondaryButton loadMoreButton"
                onClick={() => setVisibleSegmentCount((current) => current + SEGMENT_PAGE_SIZE)}
              >
                {text.loadMoreSegments} ({visibleSegments.length} / {selectedSegments.length}，{text.segmentRemaining} {selectedSegments.length - visibleSegments.length})
              </button>
            )}
          </div>
        </section>
      </section>

      {error && (
        <div className="floatingAlert alert">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}
      {savedPath && (
        <div className="floatingAlert success">
          <CheckCircle2 size={18} />
          <span>
            {text.saved}
            {savedPath}
          </span>
        </div>
      )}

      <SettingsDrawer
        open={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        isRunning={isQueueRunning || Boolean(ttsTaskId)}
        modelStatus={modelStatus}
        hardwareStatus={hardwareStatus}
        whisperModel={whisperModel}
        setWhisperModel={(next) => {
          setWhisperModel(next);
          void persistRuntimeSettings({ whisperModel: next });
        }}
        computeDevice={computeDevice}
        setComputeDevice={(next) => {
          setComputeDevice(next);
          void persistRuntimeSettings({ computeDevice: next });
        }}
        settings={settings}
        updateAiTranslation={updateAiTranslation}
        updateNetwork={updateNetwork}
        updateAudioEnhancement={updateAudioEnhancement}
        updateWhisperAdvanced={updateWhisperAdvanced}
        updateTts={updateTts}
        applyDeepSeekPreset={applyDeepSeekPreset}
        saveSettings={saveSettings}
        retryDependencies={retryDependencies}
        installTtsDependencies={installTtsDependencies}
        settingsSaved={settingsSaved}
        settingsDirty={settingsDirty}
      />
    </main>
  );
}

function SettingsDrawer({
  open,
  onClose,
  isRunning,
  modelStatus,
  hardwareStatus,
  whisperModel,
  setWhisperModel,
  computeDevice,
  setComputeDevice,
  settings,
  updateAiTranslation,
  updateNetwork,
  updateAudioEnhancement,
  updateWhisperAdvanced,
  updateTts,
  applyDeepSeekPreset,
  saveSettings,
  retryDependencies,
  installTtsDependencies,
  settingsSaved,
  settingsDirty,
}: {
  open: boolean;
  onClose: () => void;
  isRunning: boolean;
  modelStatus: ModelStatus | null;
  hardwareStatus: HardwareStatus | null;
  whisperModel: WhisperModelName;
  setWhisperModel: (model: WhisperModelName) => void;
  computeDevice: ComputeDevice;
  setComputeDevice: (device: ComputeDevice) => void;
  settings: AppSettings;
  updateAiTranslation: (patch: Partial<AiTranslationConfig>) => void;
  updateNetwork: (patch: Partial<NetworkSettings>) => void;
  updateAudioEnhancement: (patch: Partial<AudioEnhancementSettings>) => void;
  updateWhisperAdvanced: (patch: Partial<WhisperAdvancedSettings>) => void;
  updateTts: (patch: Partial<TtsSettings>) => void;
  applyDeepSeekPreset: () => void;
  saveSettings: () => void;
  retryDependencies: () => void;
  installTtsDependencies: () => void;
  settingsSaved: boolean;
  settingsDirty: boolean;
}) {
  const [activeSection, setActiveSection] = useState<SettingsSection>("recognition");
  const activeSectionLabel = SETTINGS_SECTIONS.find((section) => section.key === activeSection)?.label || text.settings;

  function applyRecognitionPreset(preset: RecognitionPreset) {
    updateAudioEnhancement(preset.audioEnhancement);
    updateWhisperAdvanced({
      ...preset.whisperAdvanced,
      initialPrompt: settings.whisperAdvanced.initialPrompt,
    });
  }

  return (
    <aside className={`settingsDrawer ${open ? "open" : ""}`} aria-hidden={!open}>
      <div className="drawerHeader">
        <div>
          <p className="eyebrow">{text.settings}</p>
          <h2>{activeSectionLabel}</h2>
        </div>
        <button className="secondaryButton iconOnly" onClick={onClose} aria-label="关闭设置">
          <X size={18} />
        </button>
      </div>

      <div className="drawerTabs" role="tablist" aria-label={text.settings}>
        {SETTINGS_SECTIONS.map((section) => (
          <button
            key={section.key}
            className={activeSection === section.key ? "active" : ""}
            onClick={() => setActiveSection(section.key)}
            role="tab"
            aria-selected={activeSection === section.key}
          >
            {section.label}
          </button>
        ))}
      </div>

      <div className="drawerBody">
        {activeSection === "recognition" && (
          <>
            <div className="statusBlock">
              <div className="blockTitleRow">
                <h3>{text.recognitionPresets}</h3>
                <SlidersHorizontal size={16} />
              </div>
              <div className="presetGrid">
                {RECOGNITION_PRESETS.map((preset) => (
                  <button
                    key={preset.key}
                    className="secondaryButton presetButton"
                    onClick={() => applyRecognitionPreset(preset)}
                    disabled={isRunning}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <p className="hint">{text.whisperAdvancedHint}</p>
            </div>

            <div className="statusBlock">
              <div className="blockTitleRow">
                <h3>{text.whisperAdvanced}</h3>
                <SlidersHorizontal size={16} />
              </div>
              <p className="hint">{text.whisperAdvancedHint}</p>
              <label className="field">
                <span>{text.recognitionProfile}</span>
                <select
                  className="modelSelect"
                  value={settings.whisperAdvanced.profile}
                  onChange={(event) => {
                    const profile = event.target.value as WhisperAdvancedSettings["profile"];
                    const presets: Record<WhisperAdvancedSettings["profile"], Partial<WhisperAdvancedSettings>> = {
                      fast: { profile, beamSize: 3, vadFilter: true, noSpeechThreshold: 0.6, conditionOnPreviousText: false },
                      balanced: { profile, beamSize: 5, vadFilter: true, noSpeechThreshold: 0.6, conditionOnPreviousText: false },
                      accurate: { profile, beamSize: 8, vadFilter: true, noSpeechThreshold: 0.55, conditionOnPreviousText: true },
                      asmr: { profile, beamSize: 8, vadFilter: false, noSpeechThreshold: 0.45, conditionOnPreviousText: true },
                    };
                    updateWhisperAdvanced(presets[profile]);
                  }}
                  disabled={isRunning}
                >
                  <option value="fast">{text.profileFast}</option>
                  <option value="balanced">{text.profileBalanced}</option>
                  <option value="accurate">{text.profileAccurate}</option>
                  <option value="asmr">{text.profileAsmr}</option>
                </select>
              </label>
              <div className="fieldGrid">
                <NumberField
                  label={text.beamSize}
                  value={settings.whisperAdvanced.beamSize}
                  disabled={isRunning}
                  onChange={(beamSize) => updateWhisperAdvanced({ beamSize, profile: settings.whisperAdvanced.profile })}
                />
                <NumberField
                  label={text.noSpeechThreshold}
                  value={settings.whisperAdvanced.noSpeechThreshold}
                  disabled={isRunning}
                  step="0.05"
                  onChange={(noSpeechThreshold) => updateWhisperAdvanced({ noSpeechThreshold })}
                />
                <label className="toggleField">
                  <input
                    type="checkbox"
                    checked={settings.whisperAdvanced.vadFilter}
                    onChange={(event) => updateWhisperAdvanced({ vadFilter: event.target.checked })}
                    disabled={isRunning}
                  />
                  <span>{text.vadFilter}</span>
                </label>
                <label className="toggleField">
                  <input
                    type="checkbox"
                    checked={settings.whisperAdvanced.conditionOnPreviousText}
                    onChange={(event) => updateWhisperAdvanced({ conditionOnPreviousText: event.target.checked })}
                    disabled={isRunning}
                  />
                  <span>{text.conditionOnPreviousText}</span>
                </label>
              </div>
              <label className="field">
                <span>{text.initialPrompt}</span>
                <textarea
                  value={settings.whisperAdvanced.initialPrompt}
                  onChange={(event) => updateWhisperAdvanced({ initialPrompt: event.target.value })}
                  disabled={isRunning}
                  placeholder={text.initialPromptPlaceholder}
                  rows={3}
                />
              </label>
            </div>
          </>
        )}

        {activeSection === "ai" && (
          <div className="statusBlock">
            <div className="blockTitleRow">
              <h3>{text.aiTranslation}</h3>
              <SlidersHorizontal size={16} />
            </div>
            <p className="hint">{text.aiOnlyHint}</p>
            <button className="secondaryButton compactButton" onClick={applyDeepSeekPreset} disabled={isRunning}>
              {text.deepseekPreset}
            </button>
            <div className="fieldGrid">
              <TextField label={text.baseUrl} value={settings.aiTranslation.baseUrl} disabled={isRunning} onChange={(baseUrl) => updateAiTranslation({ baseUrl })} />
              <TextField label={text.apiKey} value={settings.aiTranslation.apiKey} disabled={isRunning} type="password" placeholder="sk-..." onChange={(apiKey) => updateAiTranslation({ apiKey })} />
              <TextField label={text.model} value={settings.aiTranslation.model} disabled={isRunning} onChange={(model) => updateAiTranslation({ model })} />
              <NumberField label={text.temperature} value={settings.aiTranslation.temperature} disabled={isRunning} step="0.1" onChange={(temperature) => updateAiTranslation({ temperature })} />
              <NumberField label={text.topP} value={settings.aiTranslation.topP} disabled={isRunning} step="0.1" onChange={(topP) => updateAiTranslation({ topP })} />
              <TextField label={text.topK} value={String(settings.aiTranslation.topK ?? "")} disabled={isRunning} placeholder={text.omitIfEmpty} onChange={(topK) => updateAiTranslation({ topK })} />
              <NumberField label={text.maxTokens} value={settings.aiTranslation.maxTokens} disabled={isRunning} onChange={(maxTokens) => updateAiTranslation({ maxTokens })} />
              <NumberField label={text.timeoutSeconds} value={settings.aiTranslation.timeoutSeconds} disabled={isRunning} onChange={(timeoutSeconds) => updateAiTranslation({ timeoutSeconds })} />
              <NumberField label={text.retries} value={settings.aiTranslation.retries} disabled={isRunning} onChange={(retries) => updateAiTranslation({ retries })} />
              <NumberField label={text.contextWindow} value={settings.aiTranslation.contextWindow} disabled={isRunning} onChange={(contextWindow) => updateAiTranslation({ contextWindow })} />
              <NumberField label={text.contextOverlap} value={settings.aiTranslation.contextOverlap} disabled={isRunning} onChange={(contextOverlap) => updateAiTranslation({ contextOverlap })} />
              <TextField label={text.reasoningEffort} value={settings.aiTranslation.reasoningEffort || ""} disabled={isRunning} onChange={(reasoningEffort) => updateAiTranslation({ reasoningEffort })} />
            </div>
            <label className="toggleField">
              <input
                type="checkbox"
                checked={settings.aiTranslation.thinking}
                onChange={(event) => updateAiTranslation({ thinking: event.target.checked })}
                disabled={isRunning}
              />
              <span>{text.thinking}</span>
            </label>
            <label className="field">
              <span>{text.systemPrompt}</span>
              <textarea
                value={settings.aiTranslation.systemPrompt}
                onChange={(event) => updateAiTranslation({ systemPrompt: event.target.value })}
                disabled={isRunning}
                rows={4}
              />
            </label>
            <label className="field">
              <span>{text.userPrompt}</span>
              <textarea
                value={settings.aiTranslation.userPromptTemplate}
                onChange={(event) => updateAiTranslation({ userPromptTemplate: event.target.value })}
                disabled={isRunning}
                rows={4}
              />
            </label>
          </div>
        )}

        {activeSection === "enhancement" && (
          <div className="statusBlock">
            <div className="blockTitleRow">
              <h3>{text.audioEnhancement}</h3>
              <SlidersHorizontal size={16} />
            </div>
            <p className="hint">{text.audioEnhancementHint}</p>
            <label className="toggleField">
              <input
                type="checkbox"
                checked={settings.audioEnhancement.enabled}
                onChange={(event) => updateAudioEnhancement({ enabled: event.target.checked })}
                disabled={isRunning}
              />
              <span>{text.enableAudioEnhancement}</span>
            </label>
            <div className="fieldGrid">
              <label className="toggleField">
                <input
                  type="checkbox"
                  checked={settings.audioEnhancement.normalize}
                  onChange={(event) => updateAudioEnhancement({ normalize: event.target.checked })}
                  disabled={isRunning || !settings.audioEnhancement.enabled}
                />
                <span>{text.normalizeAudio}</span>
              </label>
              <label className="toggleField">
                <input
                  type="checkbox"
                  checked={settings.audioEnhancement.compression}
                  onChange={(event) => updateAudioEnhancement({ compression: event.target.checked })}
                  disabled={isRunning || !settings.audioEnhancement.enabled}
                />
                <span>{text.compressAudio}</span>
              </label>
              <label className="toggleField">
                <input
                  type="checkbox"
                  checked={settings.audioEnhancement.denoise}
                  onChange={(event) => updateAudioEnhancement({ denoise: event.target.checked })}
                  disabled={isRunning || !settings.audioEnhancement.enabled}
                />
                <span>{text.denoiseAudio}</span>
              </label>
              <label className="toggleField">
                <input
                  type="checkbox"
                  checked={settings.audioEnhancement.mono}
                  onChange={(event) => updateAudioEnhancement({ mono: event.target.checked })}
                  disabled={isRunning || !settings.audioEnhancement.enabled}
                />
                <span>{text.monoAudio}</span>
              </label>
              <NumberField
                label={text.targetPeak}
                value={settings.audioEnhancement.targetPeak}
                disabled={isRunning || !settings.audioEnhancement.enabled}
                step="0.05"
                onChange={(targetPeak) => updateAudioEnhancement({ targetPeak })}
              />
              <NumberField
                label={text.noiseGateDb}
                value={settings.audioEnhancement.noiseGateDb}
                disabled={isRunning || !settings.audioEnhancement.enabled || !settings.audioEnhancement.denoise}
                onChange={(noiseGateDb) => updateAudioEnhancement({ noiseGateDb })}
              />
            </div>
          </div>
        )}

        {activeSection === "tts" && (
          <div className="statusBlock">
            <div className="blockTitleRow">
              <h3>{text.tts}</h3>
              <Volume2 size={16} />
            </div>
            <p className="hint">{text.ttsHint}</p>
            <label className="toggleField">
              <input
                type="checkbox"
                checked={settings.tts.enabled}
                onChange={(event) => updateTts({ enabled: event.target.checked })}
                disabled={isRunning}
              />
              <span>{text.enableTts}</span>
            </label>
            <div className="field">
              <span>{text.ttsDevice}</span>
              <div className="segmented">
                {(["auto", "cpu", "cuda"] as ComputeDevice[]).map((device) => (
                  <button
                    key={device}
                    className={settings.tts.device === device ? "active" : ""}
                    onClick={() => updateTts({ device })}
                    disabled={isRunning || !settings.tts.enabled}
                  >
                    {device === "auto" ? text.auto : device.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <label className="field">
              <span>{text.voicePrompt}</span>
              <textarea
                value={settings.tts.voicePrompt}
                onChange={(event) => updateTts({ voicePrompt: event.target.value })}
                disabled={isRunning || !settings.tts.enabled}
                rows={2}
              />
            </label>
            <div className="fieldGrid">
              <NumberField
                label={text.cfgValue}
                value={settings.tts.cfgValue}
                disabled={isRunning || !settings.tts.enabled}
                step="0.1"
                onChange={(cfgValue) => updateTts({ cfgValue })}
              />
              <NumberField
                label={text.inferenceTimesteps}
                value={settings.tts.inferenceTimesteps}
                disabled={isRunning || !settings.tts.enabled}
                onChange={(inferenceTimesteps) => updateTts({ inferenceTimesteps })}
              />
              <NumberField
                label={text.retryBadcaseRatioThreshold}
                value={settings.tts.retryBadcaseRatioThreshold}
                disabled={isRunning || !settings.tts.enabled}
                step="0.5"
                onChange={(retryBadcaseRatioThreshold) => updateTts({ retryBadcaseRatioThreshold })}
              />
              <label className="toggleField wideToggle">
                <input
                  type="checkbox"
                  checked={settings.tts.normalize}
                  onChange={(event) => updateTts({ normalize: event.target.checked })}
                  disabled={isRunning || !settings.tts.enabled}
                />
                <span>{text.normalizeTtsText}</span>
              </label>
              <label className="toggleField wideToggle">
                <input
                  type="checkbox"
                  checked={settings.tts.denoise}
                  onChange={(event) => updateTts({ denoise: event.target.checked })}
                  disabled={isRunning || !settings.tts.enabled}
                />
                <span>{text.denoiseTtsReference}</span>
              </label>
            </div>
            <button className="secondaryButton compactButton" onClick={installTtsDependencies} disabled={isRunning}>
              <RotateCcw size={16} />
              {text.installTtsDependencies}
            </button>
          </div>
        )}

        {activeSection === "models" && (
          <>
            <div className="statusBlock">
              <h3>{text.modelChoice}</h3>
              <select
                className="modelSelect"
                value={whisperModel}
                onChange={(event) => setWhisperModel(event.target.value as WhisperModelName)}
                disabled={isRunning}
              >
                {WHISPER_MODELS.map((model) => (
                  <option key={model.value} value={model.value}>
                    {model.label} - {model.description}
                  </option>
                ))}
              </select>
              <p className="hint">{text.runtimeSettingsSaved}</p>
            </div>

            <div className="statusBlock">
              <h3>{text.compute}</h3>
              <div className="segmented">
                {(["auto", "cpu", "cuda"] as ComputeDevice[]).map((device) => (
                  <button
                    key={device}
                    className={computeDevice === device ? "active" : ""}
                    onClick={() => setComputeDevice(device)}
                    disabled={isRunning}
                  >
                    {device === "auto" ? text.auto : device.toUpperCase()}
                  </button>
                ))}
              </div>
              <p className="hint multiline">{hardwareSummary(hardwareStatus)}</p>
            </div>

            <div className="statusBlock">
              <h3>{text.models}</h3>
              <StatusRow label={`Whisper ${whisperModel}`} ready={Boolean(modelStatus?.whisperDownloaded)} />
              <StatusRow label="VoxCPM2" ready={Boolean(modelStatus?.voxcpmDownloaded)} />
              <StatusRow
                label={settings.aiTranslation.model || "AI"}
                ready={Boolean(settings.aiTranslation.apiKey)}
                readyText={text.aiConfigured}
                notReadyText={text.aiNotConfigured}
              />
              <p className="hint">{modelStatus?.modelsDir || text.modelDirFallback}</p>
            </div>
          </>
        )}

        {activeSection === "proxy" && (
          <>
            <div className="statusBlock">
              <div className="blockTitleRow">
                <h3>{text.network}</h3>
                <SlidersHorizontal size={16} />
              </div>
              <label className="toggleField">
                <input
                  type="checkbox"
                  checked={settings.network.proxyEnabled}
                  onChange={(event) => updateNetwork({ proxyEnabled: event.target.checked })}
                  disabled={isRunning}
                />
                <span>{text.proxyEnabled}</span>
              </label>
              <div className="fieldGrid">
                <label className="field">
                  <span>{text.proxyType}</span>
                  <select
                    className="modelSelect"
                    value={settings.network.proxyType}
                    onChange={(event) => updateNetwork({ proxyType: event.target.value as ProxyType })}
                    disabled={isRunning || !settings.network.proxyEnabled}
                  >
                    <option value="http">HTTP</option>
                    <option value="socks5">SOCKS5</option>
                  </select>
                </label>
                <TextField
                  label={text.proxyHost}
                  value={settings.network.proxyHost}
                  disabled={isRunning || !settings.network.proxyEnabled}
                  placeholder="127.0.0.1"
                  onChange={(proxyHost) => updateNetwork({ proxyHost })}
                />
                <TextField
                  label={text.proxyPort}
                  value={settings.network.proxyPort}
                  disabled={isRunning || !settings.network.proxyEnabled}
                  placeholder="7890"
                  onChange={(proxyPort) => updateNetwork({ proxyPort })}
                />
              </div>
              <p className="hint">{text.proxyHint}</p>
              <button className="secondaryButton compactButton" onClick={retryDependencies} disabled={isRunning}>
                <RotateCcw size={16} />
                {text.retryDependencies}
              </button>
            </div>

            <div className="statusBlock">
              <div className="blockTitleRow">
                <h3>{text.aiProxy}</h3>
                <SlidersHorizontal size={16} />
              </div>
              <label className="toggleField">
                <input
                  type="checkbox"
                  checked={settings.aiTranslation.proxyEnabled}
                  onChange={(event) => updateAiTranslation({ proxyEnabled: event.target.checked })}
                  disabled={isRunning}
                />
                <span>{text.proxyEnabled}</span>
              </label>
              <div className="fieldGrid">
                <label className="field">
                  <span>{text.proxyType}</span>
                  <select
                    className="modelSelect"
                    value={settings.aiTranslation.proxyType}
                    onChange={(event) => updateAiTranslation({ proxyType: event.target.value as ProxyType })}
                    disabled={isRunning || !settings.aiTranslation.proxyEnabled}
                  >
                    <option value="http">HTTP</option>
                    <option value="socks5">SOCKS5</option>
                  </select>
                </label>
                <TextField
                  label={text.proxyHost}
                  value={settings.aiTranslation.proxyHost}
                  disabled={isRunning || !settings.aiTranslation.proxyEnabled}
                  placeholder="127.0.0.1"
                  onChange={(proxyHost) => updateAiTranslation({ proxyHost })}
                />
                <TextField
                  label={text.proxyPort}
                  value={settings.aiTranslation.proxyPort}
                  disabled={isRunning || !settings.aiTranslation.proxyEnabled}
                  placeholder="7890"
                  onChange={(proxyPort) => updateAiTranslation({ proxyPort })}
                />
              </div>
              <p className="hint">{text.aiProxyHint}</p>
            </div>
          </>
        )}
      </div>

      <div className="drawerFooter">
        <div>
          <strong>{settingsDirty ? text.unsavedSettings : settingsSaved ? text.settingsSaved : text.saveSettingsHint}</strong>
          <span>{activeSection === "models" ? text.runtimeSettingsSaved : text.saveSettingsHint}</span>
        </div>
        <button className="primaryButton drawerSaveButton" onClick={saveSettings} disabled={isRunning || !settingsDirty}>
          {text.saveSettings}
        </button>
      </div>
    </aside>
  );
}

function TextField({
  label,
  value,
  onChange,
  disabled,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input value={value} type={type} onChange={(event) => onChange(event.target.value)} disabled={disabled} placeholder={placeholder} />
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
  disabled,
  step,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  step?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(event) => onChange(parseNumericInput(event.target.value, value))}
        disabled={disabled}
      />
    </label>
  );
}

function StatusRow({
  label,
  ready,
  readyText = text.downloaded,
  notReadyText = text.firstUseDownload,
}: {
  label: string;
  ready: boolean;
  readyText?: string;
  notReadyText?: string;
}) {
  return (
    <div className="statusRow">
      {ready ? <CheckCircle2 size={18} /> : <Download size={18} />}
      <span>{label}</span>
      <strong>{ready ? readyText : notReadyText}</strong>
    </div>
  );
}

function ProgressMetrics({ task }: { task: QueueTask }) {
  const progress = task.progress;
  const timings = Object.entries(task.stageTimings || {}).filter(([, seconds]) => seconds > 0);
  if (!progress && !timings.length) {
    return null;
  }

  return (
    <div className="progressMetrics">
      {typeof progress?.speedFactor === "number" && (
        <span>
          {text.realtimeSpeed}: {progress.speedFactor.toFixed(2)}x
        </span>
      )}
      {typeof progress?.etaSeconds === "number" && (
        <span>
          {text.eta}: {formatDuration(progress.etaSeconds)}
        </span>
      )}
      {typeof progress?.elapsedSeconds === "number" && (
        <span>
          {text.elapsed}: {formatDuration(progress.elapsedSeconds)}
        </span>
      )}
      {timings.length > 0 && (
        <span>
          {text.stageTiming}:{" "}
          {timings
            .map(([stage, seconds]) => `${stage} ${formatDuration(seconds)}`)
            .join(" / ")}
        </span>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
