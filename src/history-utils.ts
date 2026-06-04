export type HistoryLikeFile = {
  path: string;
  name: string;
  extension: string;
};

export type HistoryLikeTask<TResult = unknown, TFile extends HistoryLikeFile = HistoryLikeFile> = {
  id: string;
  historyId?: string;
  file: TFile;
  result?: TResult | null;
  addedAt?: string;
  completedAt?: string;
};

export type PersistedHistoryTask<TResult, TFile extends HistoryLikeFile> = {
  id: string;
  file: TFile;
  result: TResult;
  addedAt?: string;
  completedAt: string;
};

export type HistoryDeleteRequest = {
  id?: string;
  ids?: string[];
  filePath?: string;
  completedAt?: string;
  filePathOnly?: boolean;
};

export function taskIdentity(task: Pick<HistoryLikeTask, "id" | "historyId">) {
  return task.historyId || task.id;
}

export function historyQueueTaskId(historyId: string) {
  return `history-${historyId}`;
}

export function buildHistoryTask<TResult, TFile extends HistoryLikeFile = HistoryLikeFile>(
  task: HistoryLikeTask<TResult, TFile>,
  fallbackCompletedAt: string | number = Date.now(),
): PersistedHistoryTask<TResult, TFile> | null {
  if (!task.result) return null;
  const completedAt = task.completedAt || new Date(fallbackCompletedAt).toISOString();
  return {
    id: task.historyId || `${task.file.path}-${completedAt}`,
    file: task.file,
    result: task.result,
    addedAt: task.addedAt,
    completedAt,
  };
}

export function getHistoryDeleteIds(task: HistoryLikeTask) {
  if (!task.historyId && !task.result) {
    return [];
  }
  const ids = [
    task.historyId,
    task.result && task.completedAt ? `${task.file.path}-${task.completedAt}` : null,
    task.id,
    task.id.startsWith("history-") ? task.id.slice("history-".length) : null,
  ].filter((id): id is string => Boolean(id));
  return [...new Set(ids)];
}

export function getHistoryDeleteRequest(task: HistoryLikeTask): HistoryDeleteRequest | null {
  const ids = getHistoryDeleteIds(task);
  if (!ids.length && !task.file.path) {
    return null;
  }
  return {
    id: ids[0],
    ids,
    filePath: task.file.path,
    completedAt: task.completedAt,
    filePathOnly: true,
  };
}

export function getHistoryDeleteId(task: HistoryLikeTask) {
  return getHistoryDeleteRequest(task)?.id || null;
}

export function shouldDeleteUpsertResponse(
  responseId: string,
  removedHistoryIds: Set<string>,
  taskStillExists: boolean,
  responseFilePath?: string,
  removedHistoryFilePaths?: Set<string>,
) {
  return (
    removedHistoryIds.has(responseId) ||
    Boolean(responseFilePath && removedHistoryFilePaths?.has(responseFilePath)) ||
    !taskStillExists
  );
}
