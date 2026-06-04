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
  voxcpmDownloaded?: boolean;
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

type AudioEnhancementSettings = {
  enabled: boolean;
  normalize: boolean;
  compression: boolean;
  denoise: boolean;
  mono: boolean;
  targetPeak: number;
  noiseGateDb: number;
};

type WhisperAdvancedSettings = {
  profile: "fast" | "balanced" | "accurate" | "asmr";
  beamSize: number;
  vadFilter: boolean;
  noSpeechThreshold: number;
  conditionOnPreviousText: boolean;
  initialPrompt: string;
};

type TtsSettings = {
  enabled: boolean;
  device: ComputeDevice;
  voicePrompt: string;
  cfgValue: number;
  inferenceTimesteps: number;
  normalize: boolean;
  denoise: boolean;
  retryBadcaseRatioThreshold: number;
};

type ExportContentMode = "bilingual" | "translation" | "source";

type ExportSettings = {
  txtMode: ExportContentMode;
  srtMode: ExportContentMode;
};

type AppSettings = {
  whisperModel: WhisperModelName;
  computeDevice: ComputeDevice;
  translationBackend: TranslationBackend;
  aiTranslation: AiTranslationConfig;
  network: NetworkSettings;
  audioEnhancement: AudioEnhancementSettings;
  whisperAdvanced: WhisperAdvancedSettings;
  tts: TtsSettings;
  exportOptions: ExportSettings;
};

type TranscriptionProgress = {
  stage: string;
  message: string;
  percent?: number;
  processedSeconds?: number;
  totalSeconds?: number;
  elapsedSeconds?: number;
  stageElapsedSeconds?: number;
  speedFactor?: number;
  etaSeconds?: number;
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
  historyId?: string;
  addedAt?: string;
  completedAt?: string;
  stageTimings?: Record<string, number>;
};

type HistoryTask = {
  id: string;
  file: AudioFile;
  result: TranscriptionResult;
  addedAt?: string;
  completedAt: string;
};

type HistoryDeleteRequest = {
  id?: string;
  ids?: string[];
  filePath?: string;
  completedAt?: string;
  filePathOnly?: boolean;
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
    getHistory: () => Promise<HistoryTask[]>;
    upsertHistory: (task: HistoryTask) => Promise<{ saved: boolean; id: string }>;
    deleteHistory: (request: string | HistoryDeleteRequest) => Promise<{ deleted: boolean; id: string }>;
    getSmokeTasks?: () => QueueTask[];
    failNextHistoryUpsertForSmoke?: () => boolean;
    retryDependencies: () => Promise<{ ok: boolean }>;
    installTtsDependencies: () => Promise<{ ok: boolean }>;
    cancelTranscription: () => Promise<{ canceled: boolean }>;
    startTranslation: (payload: {
      taskId: string;
      detectedLanguage?: string;
      computeDevice?: string;
      segments: TranscriptionSegment[];
      aiTranslationConfig?: AiTranslationConfig;
    }) => Promise<{ started: boolean }>;
    cancelTranslation: (taskId: string) => Promise<{ canceled: boolean }>;
    startTts: (payload: {
      taskId: string;
      mediaPath: string;
      segments: TranscriptionSegment[];
      tts?: TtsSettings;
      defaultFileName?: string;
      defaultDirectory?: string;
    }) => Promise<{ started: boolean; path?: string }>;
    cancelTts: () => Promise<{ canceled: boolean }>;
    startTranscription: (payload: {
      audioPath: string;
      whisperModel?: WhisperModelName;
      translationModel?: string;
      translationBackend?: TranslationBackend;
      aiTranslationConfig?: AiTranslationConfig;
      audioEnhancement?: AudioEnhancementSettings;
      whisperAdvanced?: WhisperAdvancedSettings;
      computeDevice?: ComputeDevice;
    }) => Promise<{ started: boolean }>;
    saveTxt: (payload: {
      content: string;
      defaultFileName?: string;
      defaultDirectory?: string;
    }) => Promise<{ saved: boolean; path?: string }>;
    exportBatch: (payload: {
      items: Array<{ content: string; fileName: string }>;
    }) => Promise<{ saved: boolean; directory?: string; count?: number }>;
    onProgress: (callback: (progress: TranscriptionProgress) => void) => () => void;
    onDone: (callback: (result: TranscriptionResult) => void) => () => void;
    onError: (callback: (error: WorkerError) => void) => () => void;
    onCanceled: (callback: (payload: { message?: string }) => void) => () => void;
    onTranslateProgress: (callback: (payload: { taskId: string; progress: TranscriptionProgress }) => void) => () => void;
    onTranslateDone: (callback: (payload: { taskId: string; result: TranscriptionResult }) => void) => () => void;
    onTranslateError: (callback: (payload: { taskId: string; error: WorkerError }) => void) => () => void;
    onTtsProgress: (callback: (payload: { taskId: string; progress: TranscriptionProgress }) => void) => () => void;
    onTtsDone: (callback: (payload: { taskId: string; result: { outputPath: string; durationSeconds?: number } }) => void) => () => void;
    onTtsError: (callback: (payload: { taskId: string; error: WorkerError }) => void) => () => void;
    onTtsCanceled: (callback: (payload: { taskId: string; message?: string }) => void) => () => void;
    onDependencyProgress: (callback: (progress: TranscriptionProgress) => void) => () => void;
  };
}
