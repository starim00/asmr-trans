/// <reference types="vite/client" />

type AudioFile = {
  path: string;
  name: string;
  size: number;
  extension: string;
};

type ModelStatus = {
  modelsDir: string;
  whisperDownloaded: boolean;
};

type HardwareStatus = {
  ctranslate2CudaAvailable?: boolean;
  ctranslate2CudaDeviceCount?: number;
  cudaAvailable: boolean;
  cudaDeviceCount: number;
  cudaDeviceName?: string | null;
  error?: string;
};

type ComputeDevice = "auto" | "cpu" | "cuda";
type WhisperModelName = "tiny" | "base" | "small" | "medium" | "large-v3";
type TranslationBackend = "ai";

type AiTranslationConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  topP: number;
  topK?: number | string;
  maxTokens: number;
  timeoutSeconds: number;
  retries: number;
  reasoningEffort?: string;
  thinking: boolean;
  systemPrompt: string;
  userPromptTemplate: string;
  contextWindow: number;
  contextOverlap: number;
  proxyEnabled: boolean;
  proxyType: ProxyType;
  proxyHost: string;
  proxyPort: string;
};

type ProxyType = "http" | "socks5";

type NetworkSettings = {
  proxyEnabled: boolean;
  proxyType: ProxyType;
  proxyHost: string;
  proxyPort: string;
};

type AppSettings = {
  whisperModel: WhisperModelName;
  computeDevice: ComputeDevice;
  translationBackend: TranslationBackend;
  aiTranslation: AiTranslationConfig;
  network: NetworkSettings;
};

type TranscriptionProgress = {
  stage: string;
  message: string;
  percent?: number;
};

type TranscriptionSegment = {
  start: number;
  end: number;
  sourceText: string;
  translatedText?: string | null;
};

type TranscriptionResult = {
  detectedLanguage: string;
  computeDevice?: string;
  segments: TranscriptionSegment[];
};

type QueueTaskStatus = "queued" | "running" | "done" | "failed" | "canceled";

type QueueTask = {
  id: string;
  file: AudioFile;
  status: QueueTaskStatus;
  progress?: TranscriptionProgress | null;
  result?: TranscriptionResult | null;
  error?: string | null;
};

type WorkerError = {
  message: string;
  traceback?: string;
};

interface Window {
  asmrTrans?: {
    selectAudio: () => Promise<AudioFile[]>;
    getModelStatus: () => Promise<ModelStatus>;
    getHardwareStatus: () => Promise<HardwareStatus>;
    getSettings: () => Promise<AppSettings>;
    updateSettings: (settings: AppSettings) => Promise<AppSettings>;
    retryDependencies: () => Promise<{ ok: boolean }>;
    cancelTranscription: () => Promise<{ canceled: boolean }>;
    startTranscription: (payload: {
      audioPath: string;
      whisperModel?: WhisperModelName;
      translationModel?: string;
      translationBackend?: TranslationBackend;
      aiTranslationConfig?: AiTranslationConfig;
      computeDevice?: ComputeDevice;
    }) => Promise<{ started: boolean }>;
    saveTxt: (payload: {
      content: string;
      defaultFileName?: string;
      defaultDirectory?: string;
    }) => Promise<{ saved: boolean; path?: string }>;
    onProgress: (callback: (progress: TranscriptionProgress) => void) => () => void;
    onDone: (callback: (result: TranscriptionResult) => void) => () => void;
    onError: (callback: (error: WorkerError) => void) => () => void;
    onCanceled: (callback: (payload: { message?: string }) => void) => () => void;
    onDependencyProgress: (callback: (progress: TranscriptionProgress) => void) => () => void;
  };
}
