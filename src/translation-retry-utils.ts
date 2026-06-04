export type TranslationRetryTask = {
  status: string;
  error?: string | null;
  progress?: unknown;
  result?: {
    detectedLanguage: string;
    segments?: unknown[];
  } | null;
};

export const TRANSLATION_RETRY_PROGRESS = {
  stage: "translate",
  message: "\u6b63\u5728 AI \u7ffb\u8bd1...",
  percent: 55,
};

export type TranslationRetryCandidate<T extends TranslationRetryTask = TranslationRetryTask> = T & {
  status: "failed";
  result: {
    detectedLanguage: string;
    segments: unknown[];
  };
};

export function canRetryTaskTranslation<T extends TranslationRetryTask>(
  task: T | null | undefined,
): task is TranslationRetryCandidate<T> {
  return Boolean(
    task?.status === "failed" &&
      task.result &&
      task.result.detectedLanguage.toLowerCase().startsWith("ja") &&
      Array.isArray(task.result.segments) &&
      task.result.segments.length,
  );
}

export function markTaskTranslationRetryRunning<T extends TranslationRetryTask>(task: T): T {
  return {
    ...task,
    status: "running",
    error: null,
    progress: TRANSLATION_RETRY_PROGRESS,
  };
}
