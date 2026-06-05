export type ReadinessSeverity = "ok" | "warning" | "blocking";

export type ReadinessCheck = {
  key: string;
  label: string;
  message: string;
  severity: ReadinessSeverity;
};

export type ReadinessTask = {
  status: string;
  result?: {
    detectedLanguage: string;
  } | null;
};

export type ReadinessSettings = {
  aiTranslation: {
    apiKey: string;
  };
};

export type ReadinessModelStatus = {
  whisperDownloaded: boolean;
} | null;

export type ReadinessHardwareStatus = {
  ctranslate2CudaAvailable?: boolean;
  ctranslate2CudaSmokeOk?: boolean;
  error?: string;
} | null;

export type ReadinessText = {
  readinessReady: string;
  readinessAiMissing: string;
  readinessGpuUnavailable: string;
  readinessModelDownload: string;
  readinessCpuFallback: string;
  readinessAiMessage: string;
  readinessGpuMessage: string;
  readinessModelMessage: string;
  readinessCpuFallbackMessage: string;
};

export function shouldTranslateWithAi(result: { detectedLanguage: string }) {
  return result.detectedLanguage.toLowerCase().startsWith("ja");
}

export function getTaskNeedsAi(task: ReadinessTask) {
  if (task.result) {
    return shouldTranslateWithAi(task.result);
  }
  return task.status === "queued" || task.status === "running";
}

export function getReadinessChecks({
  tasks,
  settings,
  modelStatus,
  hardwareStatus,
  computeDevice,
  text,
}: {
  tasks: ReadinessTask[];
  settings: ReadinessSettings;
  modelStatus: ReadinessModelStatus;
  hardwareStatus: ReadinessHardwareStatus;
  computeDevice: "auto" | "cpu" | "cuda";
  text: ReadinessText;
}) {
  const checks: ReadinessCheck[] = [];
  const pendingTasks = tasks.filter((task) => task.status === "queued");
  const hasPotentialAiTask = pendingTasks.some(getTaskNeedsAi);

  if (hasPotentialAiTask && !settings.aiTranslation.apiKey.trim()) {
    checks.push({
      key: "ai",
      label: text.readinessAiMissing,
      message: text.readinessAiMessage,
      severity: "blocking",
    });
  }

  const cudaReady = Boolean(hardwareStatus?.ctranslate2CudaSmokeOk ?? hardwareStatus?.ctranslate2CudaAvailable);

  if (computeDevice === "cuda" && hardwareStatus && !cudaReady) {
    checks.push({
      key: "gpu",
      label: text.readinessGpuUnavailable,
      message: hardwareStatus.error || text.readinessGpuMessage,
      severity: "blocking",
    });
  }

  if (modelStatus && !modelStatus.whisperDownloaded) {
    checks.push({
      key: "model",
      label: text.readinessModelDownload,
      message: text.readinessModelMessage,
      severity: "warning",
    });
  }

  if (computeDevice === "auto" && hardwareStatus && !cudaReady) {
    checks.push({
      key: "cpu-fallback",
      label: text.readinessCpuFallback,
      message: hardwareStatus.error || text.readinessCpuFallbackMessage,
      severity: "warning",
    });
  }

  if (!checks.length) {
    checks.push({
      key: "ready",
      label: text.readinessReady,
      message: text.readinessReady,
      severity: "ok",
    });
  }

  return {
    checks,
    blocking: checks.filter((check) => check.severity === "blocking"),
    warnings: checks.filter((check) => check.severity === "warning"),
    summary: checks.find((check) => check.severity === "blocking") || checks.find((check) => check.severity === "warning") || checks[0],
  };
}
