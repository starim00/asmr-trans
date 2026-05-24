import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileAudio,
  FolderOpen,
  Loader2,
  Save,
} from "lucide-react";
import "./styles.css";

const DEFAULT_WHISPER_MODEL: WhisperModelName = "small";
const WHISPER_MODELS: Array<{ value: WhisperModelName; label: string; description: string }> = [
  { value: "tiny", label: "Tiny", description: "\u901f\u5ea6\u6700\u5feb\uff0c\u51c6\u786e\u7387\u6700\u4f4e" },
  { value: "base", label: "Base", description: "\u8f7b\u91cf\u5feb\u901f" },
  { value: "small", label: "Small", description: "\u9ed8\u8ba4\u5e73\u8861" },
  { value: "medium", label: "Medium", description: "\u66f4\u9ad8\u51c6\u786e\u7387" },
  { value: "large-v3", label: "Large v3", description: "\u6700\u9ad8\u51c6\u786e\u7387\uff0c\u8d44\u6e90\u5360\u7528\u9ad8" },
];

const text = {
  appSubtitle: "\u672c\u5730\u684c\u9762\u8f6c\u5199",
  selectAudio: "\u9009\u62e9\u97f3\u9891",
  noAudio: "\u672a\u9009\u62e9\u97f3\u9891",
  supportedFormats: "\u652f\u6301 mp3, wav, m4a, flac, ogg, aac",
  start: "\u5f00\u59cb\u8f6c\u5199",
  compute: "\u8ba1\u7b97\u8bbe\u5907",
  modelChoice: "Whisper \u6a21\u578b",
  auto: "\u81ea\u52a8",
  models: "\u6a21\u578b\u72b6\u6001",
  firstUseDownload: "\u9996\u6b21\u4f7f\u7528\u4e0b\u8f7d",
  downloaded: "\u5df2\u4e0b\u8f7d",
  progress: "\u8fdb\u5ea6",
  waiting: "\u7b49\u5f85\u5f00\u59cb\u4efb\u52a1\u3002",
  result: "\u8f6c\u5199\u7ed3\u679c",
  timedHint: "\u7ed3\u679c\u4f1a\u6309\u65f6\u95f4\u6bb5\u663e\u793a\u3002",
  saveTxt: "\u4fdd\u5b58\u4e3a txt",
  emptyResult: "\u9009\u62e9\u97f3\u9891\u5e76\u5f00\u59cb\u8f6c\u5199\u540e\uff0c\u5206\u6bb5\u6587\u672c\u4f1a\u663e\u793a\u5728\u8fd9\u91cc\u3002",
  source: "\u539f\u6587",
  translation: "\u8bd1\u6587",
  nllb: "NLLB \u65e5\u8bd1\u4e2d",
  modelDirFallback: "\u6a21\u578b\u76ee\u5f55\u5c06\u5728\u5e94\u7528\u542f\u52a8\u540e\u8bfb\u53d6\u3002",
  chooseFirst: "\u8bf7\u5148\u9009\u62e9\u97f3\u9891\u6587\u4ef6\u3002",
  starting: "\u6b63\u5728\u542f\u52a8\u672c\u5730\u8f6c\u5199\u4efb\u52a1...",
  noResultToSave: "\u6ca1\u6709\u53ef\u4fdd\u5b58\u7684\u8f6c\u5199\u7ed3\u679c\u3002",
  saved: "\u5df2\u4fdd\u5b58\uff1a",
  lang: "\u68c0\u6d4b\u8bed\u8a00",
  computeDevice: "\u8ba1\u7b97\u8bbe\u5907",
  unknown: "\u672a\u77e5",
  segments: "\u6bb5",
  loadingHardware: "\u6b63\u5728\u68c0\u6d4b\u786c\u4ef6\u72b6\u6001...",
  whisperGpuAvailable: "Whisper GPU \u53ef\u7528",
  whisperGpuUnavailable: "Whisper GPU \u4e0d\u53ef\u7528",
  cudaDevices: "\u4e2a CUDA \u8bbe\u5907",
  torchGpuAvailable: "PyTorch GPU \u53ef\u7528",
  torchGpuUnavailable: "PyTorch GPU \u4e0d\u53ef\u7528",
  torchMissing: "\u672a\u68c0\u6d4b\u5230 torch",
};

const missingDesktopApi = {
  selectAudio: async () => {
    throw new Error("\u8bf7\u5728 Electron \u684c\u9762\u5ba2\u6237\u7aef\u4e2d\u9009\u62e9\u97f3\u9891\u3002");
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
  startTranscription: async () => {
    throw new Error("\u8bf7\u5728 Electron \u684c\u9762\u5ba2\u6237\u7aef\u4e2d\u542f\u52a8\u8f6c\u5199\u3002");
  },
  saveTxt: async () => {
    throw new Error("\u8bf7\u5728 Electron \u684c\u9762\u5ba2\u6237\u7aef\u4e2d\u4fdd\u5b58\u6587\u4ef6\u3002");
  },
  onProgress: () => () => undefined,
  onDone: () => () => undefined,
  onError: () => () => undefined,
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

function buildTxt(result: TranscriptionResult | null) {
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

function App() {
  const [audio, setAudio] = useState<AudioFile | null>(null);
  const [modelStatus, setModelStatus] = useState<ModelStatus | null>(null);
  const [hardwareStatus, setHardwareStatus] = useState<HardwareStatus | null>(null);
  const [computeDevice, setComputeDevice] = useState<ComputeDevice>("auto");
  const [whisperModel, setWhisperModel] = useState<WhisperModelName>(DEFAULT_WHISPER_MODEL);
  const [progress, setProgress] = useState<TranscriptionProgress | null>(null);
  const [result, setResult] = useState<TranscriptionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [savedPath, setSavedPath] = useState<string | null>(null);

  const txtContent = useMemo(() => buildTxt(result), [result]);

  useEffect(() => {
    desktopApi.getModelStatus().then(setModelStatus).catch((err) => {
      setError(err instanceof Error ? err.message : String(err));
    });
    desktopApi.getHardwareStatus().then(setHardwareStatus).catch(() => undefined);

    const offProgress = desktopApi.onProgress((nextProgress) => {
      setProgress(nextProgress);
    });
    const offDone = desktopApi.onDone((nextResult) => {
      setResult(nextResult);
      setIsRunning(false);
      setSavedPath(null);
      desktopApi.getModelStatus().then(setModelStatus).catch(() => undefined);
      desktopApi.getHardwareStatus().then(setHardwareStatus).catch(() => undefined);
    });
    const offError = desktopApi.onError((workerError) => {
      setError(workerError.message);
      setIsRunning(false);
    });

    return () => {
      offProgress();
      offDone();
      offError();
    };
  }, []);

  async function selectAudio() {
    setError(null);
    setSavedPath(null);
    const selected = await desktopApi.selectAudio();
    if (selected) {
      setAudio(selected);
      setResult(null);
      setProgress(null);
    }
  }

  async function startTranscription() {
    if (!audio) {
      setError(text.chooseFirst);
      return;
    }
    setError(null);
    setSavedPath(null);
    setResult(null);
    setIsRunning(true);
    setProgress({ stage: "start", message: text.starting, percent: 0 });

    try {
      await desktopApi.startTranscription({
        audioPath: audio.path,
        whisperModel,
        translationModel: "nllb-200-distilled-600M",
        computeDevice,
      });
    } catch (err) {
      setIsRunning(false);
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function saveTxt() {
    if (!txtContent) {
      setError(text.noResultToSave);
      return;
    }
    const baseName = audio?.name.replace(/\.[^.]+$/, "") || "transcription";
    const response = await desktopApi.saveTxt({
      content: txtContent,
      defaultFileName: `${baseName}.txt`,
    });
    if (response.saved && response.path) {
      setSavedPath(response.path);
    }
  }

  return (
    <main className="shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">{text.appSubtitle}</p>
          <h1>ASMR Trans</h1>
        </div>
        <button className="secondaryButton" onClick={selectAudio} disabled={isRunning}>
          <FolderOpen size={18} />
          {text.selectAudio}
        </button>
      </section>

      <section className="workspace">
        <aside className="sidePanel">
          <div className="uploadPanel">
            <FileAudio size={36} />
            <div>
              <h2>{audio ? audio.name : text.noAudio}</h2>
              <p>{audio ? `${audio.extension.toUpperCase()} - ${formatBytes(audio.size)}` : text.supportedFormats}</p>
            </div>
            <button className="primaryButton" onClick={startTranscription} disabled={!audio || isRunning}>
              {isRunning ? <Loader2 className="spin" size={18} /> : <Download size={18} />}
              {text.start}
            </button>
          </div>

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
            <h3>{text.models}</h3>
            <StatusRow label={`Whisper ${whisperModel}`} ready={Boolean(modelStatus?.whisperDownloaded)} />
            <StatusRow label={text.nllb} ready={Boolean(modelStatus?.translationDownloaded)} />
            <p className="hint">{modelStatus?.modelsDir || text.modelDirFallback}</p>
          </div>

          <div className="statusBlock">
            <h3>{text.progress}</h3>
            <div className="progressTrack">
              <div className="progressFill" style={{ width: `${progress?.percent ?? 0}%` }} />
            </div>
            <p className="progressMessage">{progress?.message || text.waiting}</p>
          </div>

          {error && (
            <div className="alert">
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}
          {savedPath && (
            <div className="success">
              <CheckCircle2 size={18} />
              <span>
                {text.saved}
                {savedPath}
              </span>
            </div>
          )}
        </aside>

        <section className="resultPanel">
          <div className="resultHeader">
            <div>
              <h2>{text.result}</h2>
              <p>
                {result
                  ? `${text.lang}\uff1a${result.detectedLanguage} - ${text.computeDevice}\uff1a${result.computeDevice || text.unknown} - ${result.segments.length} ${text.segments}`
                  : text.timedHint}
              </p>
            </div>
            <button className="secondaryButton" onClick={saveTxt} disabled={!result || isRunning}>
              <Save size={18} />
              {text.saveTxt}
            </button>
          </div>

          <div className="segments">
            {!result && <div className="emptyState">{text.emptyResult}</div>}
            {result?.segments.map((segment, index) => (
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
    </main>
  );
}

function StatusRow({ label, ready }: { label: string; ready: boolean }) {
  return (
    <div className="statusRow">
      {ready ? <CheckCircle2 size={18} /> : <Download size={18} />}
      <span>{label}</span>
      <strong>{ready ? text.downloaded : text.firstUseDownload}</strong>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
