export type QueueRuleStatus = "queued" | "running" | "done" | "failed" | "canceled";
export type QueueTaskStatusFilter = "all" | QueueRuleStatus;

export type QueueRuleTask = {
  id: string;
  file: {
    name: string;
    path: string;
    extension: string;
  };
  status: QueueRuleStatus;
  error?: string | null;
  result?: unknown;
  progress?: unknown;
  stageTimings?: unknown;
  completedAt?: string;
};

export function filterQueueTasks<T extends QueueRuleTask>({
  tasks,
  query,
  statusFilter,
  descending,
}: {
  tasks: T[];
  query: string;
  statusFilter: QueueTaskStatusFilter;
  descending: boolean;
}) {
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = tasks.filter((task) => {
    if (statusFilter !== "all" && task.status !== statusFilter) {
      return false;
    }
    if (!normalizedQuery) {
      return true;
    }
    return [task.file.name, task.file.path, task.file.extension, task.status, task.error || ""]
      .join("\n")
      .toLowerCase()
      .includes(normalizedQuery);
  });
  return descending ? [...filtered].reverse() : filtered;
}

export function getDoneTasks<T extends QueueRuleTask>(tasks: T[]) {
  return tasks.filter((task) => task.status === "done" && task.result);
}

export function getFailedOrCanceledTasks<T extends QueueRuleTask>(tasks: T[]) {
  return tasks.filter((task) => task.status === "failed" || task.status === "canceled");
}

export function getClearableTasks<T extends QueueRuleTask>(tasks: T[], statuses: QueueRuleStatus[], ttsTaskId: string | null) {
  const statusSet = new Set(statuses);
  return tasks.filter((task) => statusSet.has(task.status) && task.status !== "running" && task.id !== ttsTaskId);
}

export function requeueTaskState<T extends QueueRuleTask>(task: T): T {
  return {
    ...task,
    status: "queued",
    error: null,
    progress: null,
    stageTimings: undefined,
    completedAt: undefined,
  };
}

export function shouldRequeueTask(task: QueueRuleTask) {
  return task.status === "failed" || task.status === "canceled";
}
