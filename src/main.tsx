import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileAudio,
  FolderOpen,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Save,
  Settings,
  SlidersHorizontal,
  Square,
  X,
} from "lucide-react";
import "./styles.css";

const DEFAULT_WHISPER_MODEL: WhisperModelName = "small";
const DEFAULT_AI_SYSTEM_PROMPT =
  "\u4f60\u662f\u4e13\u4e1a\u7684\u65e5\u8bd1\u4e2d\u7ffb\u8bd1\u3002\u8bf7\u628a\u65e5\u8bed ASMR/\u53e3\u8bed\u8f6c\u5199\u7ffb\u8bd1\u6210\u81ea\u7136\u3001\u51c6\u786e\u7684\u7b80\u4f53\u4e2d\u6587\u3002\u5fe0\u5b9e\u4fdd\u7559\u539f\u610f\u3001\u8bed\u6c14\u3001\u79f0\u547c\u548c\u66a7\u6627\u8868\u8fbe\uff1b\u4e0d\u8981\u89e3\u91ca\uff0c\u4e0d\u8981\u603b\u7ed3\uff0c\u4e0d\u8981\u6dfb\u52a0\u539f\u6587\u6ca1\u6709\u7684\u4fe1\u606f\u3002";
const DEFAULT_AI_USER_PROMPT_TEMPLATE =
  "\u8bf7\u7ffb\u8bd1\u4e0b\u9762 JSON \u6570\u7ec4\u4e2d\u7684 items\u3002\u6bcf\u9879\u5305\u542b id\u3001start\u3001end\u3001text\u3001contextBefore\u3001contextAfter\u3002context \u5b57\u6bb5\u53ea\u7528\u4e8e\u7406\u89e3\u4e0a\u4e0b\u6587\uff0c\u53ea\u7ffb\u8bd1 text\u3002\u53ea\u8fd4\u56de JSON \u6570\u7ec4\uff0c\u6570\u7ec4\u6bcf\u9879\u5fc5\u987b\u662f {\"id\": \u6570\u5b57, \"translation\": \"\u4e2d\u6587\u8bd1\u6587\"}\uff0c\u4e0d\u8981\u8fd4\u56de Markdown\u3002";

const DEEPSEEK_PRESET: AppSettings = {
  whisperModel: DEFAULT_WHISPER_MODEL,
  computeDevice: "auto",
  translationBackend: "auto",
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
  },
};

const WHISPER_MODELS: Array<{ value: WhisperModelName; label: string; description: string }> = [
  { value: "tiny", label: "Tiny", description: "\u901f\u5ea6\u6700\u5feb\uff0c\u51c6\u786e\u7387\u6700\u4f4e" },
  { value: "base", label: "Base", description: "\u8f7b\u91cf\u5feb\u901f" },
  { value: "small", label: "Small", description: "\u9ed8\u8ba4\u5e73\u8861" },
  { value: "medium", label: "Medium", description: "\u66f4\u9ad8\u51c6\u786e\u7387" },
  { value: "large-v3", label: "Large v3", description: "\u6700\u9ad8\u51c6\u786e\u7387\uff0c\u8d44\u6e90\u5360\u7528\u9ad8" },
];

const text = {
  appSubtitle: "\u672c\u5730\u684c\u9762\u6279\u91cf\u8f6c\u5199",
  selectMedia: "\u6dfb\u52a0\u6587\u4ef6",
  startQueue: "\u5f00\u59cb\u961f\u5217",
  pauseQueue: "\u6682\u505c",
  resumeQueue: "\u6062\u590d",
  cancelTask: "\u53d6\u6d88\u4efb\u52a1",
  settings: "\u8bbe\u7f6e",
  queue: "\u4efb\u52a1\u961f\u5217",
  result: "\u8f6c\u5199\u7ed3\u679c",
  emptyQueue: "\u6dfb\u52a0\u97f3\u9891\u6216\u89c6\u9891\u6587\u4ef6\u540e\uff0c\u4efb\u52a1\u4f1a\u5728\u8fd9\u91cc\u6309\u987a\u5e8f\u5904\u7406\u3002",
  emptyResult: "\u9009\u62e9\u5de6\u4fa7\u4efb\u52a1\u540e\u67e5\u770b\u8be6\u7ec6\u5206\u6bb5\u7ed3\u679c\u3002",
  source: "\u539f\u6587",
  translation: "\u8bd1\u6587",
  saveTxt: "\u4fdd\u5b58\u4e3a txt",
  saved: "\u5df2\u4fdd\u5b58\uff1a",
  noResultToSave: "\u5f53\u524d\u4efb\u52a1\u6ca1\u6709\u53ef\u4fdd\u5b58\u7684\u7ed3\u679c\u3002",
  chooseFirst: "\u8bf7\u5148\u6dfb\u52a0\u6587\u4ef6\u3002",
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
  translationBackend: "\u7ffb\u8bd1\u540e\u7aef",
  aiTranslation: "AI \u7ffb\u8bd1",
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
  models: "\u6a21\u578b\u72b6\u6001",
  firstUseDownload: "\u9996\u6b21\u4f7f\u7528\u4e0b\u8f7d",
  downloaded: "\u5df2\u4e0b\u8f7d",
  aiConfigured: "AI \u5df2\u914d\u7f6e",
  aiNotConfigured: "AI \u672a\u914d\u7f6e",
  nllb: "NLLB \u65e5\u8bd1\u4e2d",
  modelDirFallback: "\u6a21\u578b\u76ee\u5f55\u5c06\u5728\u5e94\u7528\u542f\u52a8\u540e\u8bfb\u53d6\u3002",
  loadingHardware: "\u6b63\u5728\u68c0\u6d4b\u786c\u4ef6\u72b6\u6001...",
  whisperGpuAvailable: "Whisper GPU \u53ef\u7528",
  whisperGpuUnavailable: "Whisper GPU \u4e0d\u53ef\u7528",
  cudaDevices: "\u4e2a CUDA \u8bbe\u5907",
  torchGpuAvailable: "PyTorch GPU \u53ef\u7528",
  torchGpuUnavailable: "PyTorch GPU \u4e0d\u53ef\u7528",
  torchMissing: "\u672a\u68c0\u6d4b\u5230 torch",
};

const missingDesktopApi = {
  selectAudio: async (): Promise<AudioFile[]> => {
    throw new Error("\u8bf7\u5728 Electron \u684c\u9762\u5ba2\u6237\u7aef\u4e2d\u9009\u62e9\u6587\u4ef6\u3002");
  },
  getModelStatus: async (): Promise<ModelStatus> => ({
    modelsDir: "Electron \u684c\u9762\u5ba2\u6237\u7aef\u542f\u52a8\u540e\u663e\u793a\u6a21\u578b\u76ee\u5f55",
    whisperDownloaded: false,
    translationDownloaded: false,
  }),
  getHardwareStatus: async (): Promise<HardwareStatus> => ({
    torchInstalled: false,
    torchCudaAvailable: false,
    ctranslate2CudaAvailable: false,
    cudaAvailable: false,
    cudaDeviceCount: 0,
    cudaDeviceName: null,
  }),
  getSettings: async (): Promise<AppSettings> => DEEPSEEK_PRESET,
  updateSettings: async (settings: AppSettings): Promise<AppSettings> => settings,
  cancelTranscription: async () => ({ canceled: false }),
  startTranscription: async () => {
    throw new Error("\u8bf7\u5728 Electron \u684c\u9762\u5ba2\u6237\u7aef\u4e2d\u542f\u52a8\u8f6c\u5199\u3002");
  },
  saveTxt: async () => {
    throw new Error("\u8bf7\u5728 Electron \u684c\u9762\u5ba2\u6237\u7aef\u4e2d\u4fdd\u5b58\u6587\u4ef6\u3002");
  },
  onProgress: () => () => undefined,
  onDone: () => () => undefined,
  onError: () => () => undefined,
  onCanceled: () => () => undefined,
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

function buildTxt(result: TranscriptionResult | null | undefined) {
  if (!result) return "";
  return result.segments
    .map((segment) => {
      const timeRange = `[${formatTimestamp(segment.start)} - ${formatTimestamp(segment.end)}]`;
      if (segment.translatedText) {
        return `${timeRange}\n${text.source}\uff1a${segment.sourceText}\n${text.translation}\uff1a${segment.translatedText}`;
      }
      return `${timeRange}\n${segment.sourceText}`;
    })
    .join("\n\n");
}

function hardwareSummary(status: HardwareStatus | null) {
  if (!status) return text.loadingHardware;
  const whisperGpu = status.ctranslate2CudaAvailable
    ? `${text.whisperGpuAvailable} (${status.ctranslate2CudaDeviceCount || 1} ${text.cudaDevices})`
    : text.whisperGpuUnavailable;
  const torchGpu = status.torchCudaAvailable
    ? `${text.torchGpuAvailable} (${status.cudaDeviceName || "CUDA"})`
    : `${text.torchGpuUnavailable}\uff0c\u5f53\u524d ${status.torchVersion || text.torchMissing}`;
  return `${whisperGpu}\n${torchGpu}`;
}

function mergeSettings(settings?: Partial<AppSettings> | null): AppSettings {
  return {
    ...DEEPSEEK_PRESET,
    ...(settings || {}),
    aiTranslation: {
      ...DEEPSEEK_PRESET.aiTranslation,
      ...(settings?.aiTranslation || {}),
    },
  };
}

function parseNumericInput(value: string, fallback: number) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function statusLabel(status: QueueTaskStatus) {
  return text[status];
}

function createTask(file: AudioFile): QueueTask {
  return {
    id: `${file.path}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    file,
    status: "queued",
    progress: null,
    result: null,
    error: null,
  };
}

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
  const [isQueueRunning, setIsQueueRunning] = useState(false);
  const [isQueuePaused, setIsQueuePaused] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedPath, setSavedPath] = useState<string | null>(null);
  const [globalProgress, setGlobalProgress] = useState<TranscriptionProgress | null>(null);

  const currentTaskIdRef = useRef<string | null>(null);
  const taskResolverRef = useRef<((ok: boolean) => void) | null>(null);
  const queuePausedRef = useRef(false);
  const tasksRef = useRef<QueueTask[]>([]);
  const settingsRef = useRef(settings);
  const whisperModelRef = useRef(whisperModel);
  const computeDeviceRef = useRef(computeDevice);

  const selectedTask = useMemo(
    () => tasks.find((task) => task.id === selectedTaskId) || tasks[0] || null,
    [selectedTaskId, tasks],
  );
  const txtContent = useMemo(() => buildTxt(selectedTask?.result), [selectedTask]);

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
    queuePausedRef.current = isQueuePaused;
  }, [isQueuePaused]);
  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  useEffect(() => {
    desktopApi.getModelStatus().then(setModelStatus).catch((err) => setError(err instanceof Error ? err.message : String(err)));
    desktopApi.getHardwareStatus().then(setHardwareStatus).catch(() => undefined);
    desktopApi
      .getSettings()
      .then((nextSettings) => {
        const merged = mergeSettings(nextSettings);
        setSettings(merged);
        setWhisperModel(merged.whisperModel);
        setComputeDevice(merged.computeDevice);
      })
      .catch(() => undefined);

    const offProgress = desktopApi.onProgress((nextProgress) => {
      const taskId = currentTaskIdRef.current;
      if (!taskId) return;
      setTasks((current) =>
        current.map((task) => (task.id === taskId ? { ...task, progress: nextProgress, status: "running" } : task)),
      );
    });
    const offDone = desktopApi.onDone((nextResult) => {
      const taskId = currentTaskIdRef.current;
      if (!taskId) return;
      setTasks((current) =>
        current.map((task) =>
          task.id === taskId
            ? { ...task, status: "done", result: nextResult, progress: { stage: "done", message: text.done, percent: 100 } }
            : task,
        ),
      );
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
    const offDependencyProgress = desktopApi.onDependencyProgress((nextProgress) => {
      const taskId = currentTaskIdRef.current;
      if (!taskId) {
        setGlobalProgress(nextProgress);
        return;
      }
      setTasks((current) => current.map((task) => (task.id === taskId ? { ...task, progress: nextProgress } : task)));
    });

    return () => {
      offProgress();
      offDone();
      offError();
      offCanceled();
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
        translationModel:
          settingsRef.current.translationBackend === "ai" ? "ai-chat-completions" : "nllb-200-distilled-600M",
        translationBackend: settingsRef.current.translationBackend,
        aiTranslationConfig: settingsRef.current.aiTranslation,
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
        if (latestTask?.status === "canceled") {
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
      await desktopApi.cancelTranscription();
      return;
    }
    setTasks((current) =>
      current.map((task) =>
        task.id === taskId ? { ...task, status: "canceled", error: text.canceled, progress: null } : task,
      ),
    );
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
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function saveSettings() {
    const saved = await desktopApi.updateSettings(mergeSettings({ ...settings, whisperModel, computeDevice }));
    setSettings(mergeSettings(saved));
    setSettingsSaved(true);
  }

  function applyDeepSeekPreset() {
    setSettings((current) => ({
      whisperModel,
      computeDevice,
      translationBackend: "auto",
      aiTranslation: {
        ...DEEPSEEK_PRESET.aiTranslation,
        apiKey: current.aiTranslation.apiKey,
      },
    }));
    setSettingsSaved(false);
  }

  async function saveSelectedTxt() {
    if (!txtContent || !selectedTask) {
      setError(text.noResultToSave);
      return;
    }
    const baseName = selectedTask.file.name.replace(/\.[^.]+$/, "") || "transcription";
    const response = await desktopApi.saveTxt({
      content: txtContent,
      defaultFileName: `${baseName}.txt`,
    });
    if (response.saved && response.path) {
      setSavedPath(response.path);
    }
  }

  const queueSummary = `${whisperModel} / ${computeDevice.toUpperCase()} / ${settings.translationBackend.toUpperCase()} / ${
    settings.aiTranslation.apiKey ? text.aiConfigured : text.aiNotConfigured
  }`;

  return (
    <main className="shell">
      <section className="topbar appToolbar">
        <div>
          <p className="eyebrow">{text.appSubtitle}</p>
          <h1>ASMR Trans</h1>
          <p className="toolbarSummary">{queueSummary}</p>
          {globalProgress && (
            <div className="globalProgress">
              <div className="progressTrack">
                <div className="progressFill" style={{ width: `${globalProgress.percent ?? 0}%` }} />
              </div>
              <span>{globalProgress.message}</span>
            </div>
          )}
        </div>
        <div className="toolbarActions">
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
          <button className="secondaryButton iconButton" onClick={() => setIsSettingsOpen(true)} disabled={isQueueRunning}>
            <Settings size={18} />
            {text.settings}
          </button>
        </div>
      </section>

      <section className="workspace queueWorkspace">
        <section className="taskPanel">
          <div className="panelHeader">
            <h2>{text.queue}</h2>
            <span>{tasks.length}</span>
          </div>
          <div className="taskList">
            {!tasks.length && <div className="emptyState compactEmpty">{text.emptyQueue}</div>}
            {tasks.map((task) => (
              <button
                key={task.id}
                className={`taskItem ${selectedTask?.id === task.id ? "selected" : ""}`}
                onClick={() => setSelectedTaskId(task.id)}
              >
                <FileAudio size={20} />
                <div className="taskMeta">
                  <strong>{task.file.name}</strong>
                  <span>
                    {task.file.extension.toUpperCase()} - {formatBytes(task.file.size)}
                  </span>
                  {task.error && <em>{task.error}</em>}
                </div>
                <div className={`taskStatus ${task.status}`}>
                  {task.status === "running" && <Loader2 className="spin" size={14} />}
                  {statusLabel(task.status)}
                  {typeof task.progress?.percent === "number" ? ` ${task.progress.percent}%` : ""}
                </div>
              </button>
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
            </div>
            <button className="secondaryButton" onClick={saveSelectedTxt} disabled={!selectedTask?.result || isQueueRunning}>
              <Save size={18} />
              {text.saveTxt}
            </button>
          </div>

          <div className="segments">
            {!selectedTask?.result && <div className="emptyState">{selectedTask?.error || text.emptyResult}</div>}
            {selectedTask?.result?.segments.map((segment, index) => (
              <article className="segment" key={`${segment.start}-${segment.end}-${index}`}>
                <time>
                  {formatTimestamp(segment.start)} - {formatTimestamp(segment.end)}
                </time>
                {segment.translatedText ? (
                  <>
                    <p>
                      <span>{text.source}</span>
                      {segment.sourceText}
                    </p>
                    <p>
                      <span>{text.translation}</span>
                      {segment.translatedText}
                    </p>
                  </>
                ) : (
                  <p>{segment.sourceText}</p>
                )}
              </article>
            ))}
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
        isRunning={isQueueRunning}
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
        setSettings={(next) => {
          setSettings(next);
          setSettingsSaved(false);
        }}
        updateAiTranslation={updateAiTranslation}
        applyDeepSeekPreset={applyDeepSeekPreset}
        saveSettings={saveSettings}
        settingsSaved={settingsSaved}
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
  setSettings,
  updateAiTranslation,
  applyDeepSeekPreset,
  saveSettings,
  settingsSaved,
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
  setSettings: (settings: AppSettings) => void;
  updateAiTranslation: (patch: Partial<AiTranslationConfig>) => void;
  applyDeepSeekPreset: () => void;
  saveSettings: () => void;
  settingsSaved: boolean;
}) {
  return (
    <aside className={`settingsDrawer ${open ? "open" : ""}`} aria-hidden={!open}>
      <div className="drawerHeader">
        <div>
          <p className="eyebrow">{text.settings}</p>
          <h2>{text.aiTranslation}</h2>
        </div>
        <button className="secondaryButton iconOnly" onClick={onClose}>
          <X size={18} />
        </button>
      </div>

      <div className="drawerBody">
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
          <div className="blockTitleRow">
            <h3>{text.aiTranslation}</h3>
            <SlidersHorizontal size={16} />
          </div>
          <label className="field">
            <span>{text.translationBackend}</span>
            <select
              className="modelSelect"
              value={settings.translationBackend}
              onChange={(event) => setSettings({ ...settings, translationBackend: event.target.value as TranslationBackend })}
              disabled={isRunning}
            >
              <option value="auto">{text.auto}</option>
              <option value="ai">AI</option>
              <option value="nllb">NLLB</option>
            </select>
          </label>
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
          <button className="primaryButton" onClick={saveSettings} disabled={isRunning}>
            {text.saveSettings}
          </button>
          {settingsSaved && <p className="hint">{text.settingsSaved}</p>}
        </div>

        <div className="statusBlock">
          <h3>{text.models}</h3>
          <StatusRow label={`Whisper ${whisperModel}`} ready={Boolean(modelStatus?.whisperDownloaded)} />
          <StatusRow label={text.nllb} ready={Boolean(modelStatus?.translationDownloaded)} />
          <StatusRow
            label={settings.aiTranslation.model || "AI"}
            ready={Boolean(settings.aiTranslation.apiKey)}
            readyText={text.aiConfigured}
            notReadyText={text.aiNotConfigured}
          />
          <p className="hint">{modelStatus?.modelsDir || text.modelDirFallback}</p>
        </div>
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

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
