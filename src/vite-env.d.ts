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
  translationDownloaded: boolean;
};

type HardwareStatus = {
  torchInstalled: boolean;
  torchVersion?: string | null;
  torchCudaAvailable?: boolean;
  torchCudaVersion?: string | null;
  ctranslate2CudaAvailable?: boolean;
  ctranslate2CudaDeviceCount?: number;
  cudaAvailable: boolean;
  cudaDeviceCount: number;
  cudaDeviceName?: string | null;
  error?: string;
};

type ComputeDevice = "auto" | "cpu" | "cuda";
type WhisperModelName = "tiny" | "base" | "small" | "medium" | "large-v3";

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

type WorkerError = {
  message: string;
  traceback?: string;
};

interface Window {
  asmrTrans?: {
    selectAudio: () => Promise<AudioFile | null>;
    getModelStatus: () => Promise<ModelStatus>;
    getHardwareStatus: () => Promise<HardwareStatus>;
    startTranscription: (payload: {
      audioPath: string;
      whisperModel?: WhisperModelName;
      translationModel?: string;
      computeDevice?: ComputeDevice;
    }) => Promise<{ started: boolean }>;
    saveTxt: (payload: {
      content: string;
      defaultFileName?: string;
    }) => Promise<{ saved: boolean; path?: string }>;
    onProgress: (callback: (progress: TranscriptionProgress) => void) => () => void;
    onDone: (callback: (result: TranscriptionResult) => void) => () => void;
    onError: (callback: (error: WorkerError) => void) => () => void;
  };
}
