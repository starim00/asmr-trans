const fs = require("node:fs");
const path = require("node:path");

const HISTORY_LIMIT = 200;

function readHistory(historyPath) {
  if (!fs.existsSync(historyPath)) {
    return [];
  }
  try {
    const value = JSON.parse(fs.readFileSync(historyPath, "utf8"));
    return Array.isArray(value) ? value : [];
  } catch (_error) {
    return [];
  }
}

function writeHistory(historyPath, history) {
  fs.mkdirSync(path.dirname(historyPath), { recursive: true });
  fs.writeFileSync(historyPath, JSON.stringify(history.slice(0, HISTORY_LIMIT), null, 2), "utf8");
  return history;
}

function upsertHistoryTask(historyPath, task) {
  if (!task || !task.file || !task.result) {
    throw new Error("Invalid history task.");
  }
  const history = readHistory(historyPath);
  const id = task.id || `${task.file.path}-${Date.now()}`;
  const nextTask = {
    id,
    file: task.file,
    result: task.result,
    addedAt: task.addedAt || task.completedAt || new Date().toISOString(),
    completedAt: task.completedAt || new Date().toISOString(),
  };
  const filtered = history.filter((item) => item.id !== id);
  writeHistory(historyPath, [nextTask, ...filtered]);
  return nextTask;
}

function getDeleteRequest(target) {
  if (typeof target === "string") {
    return { id: target, ids: [target] };
  }
  if (!target || typeof target !== "object") {
    return null;
  }
  const ids = [
    target.id,
    ...(Array.isArray(target.ids) ? target.ids : []),
  ].filter((id) => typeof id === "string" && id.trim());
  return {
    id: ids[0],
    ids: [...new Set(ids)],
    filePath: typeof target.filePath === "string" ? target.filePath : "",
    completedAt: typeof target.completedAt === "string" ? target.completedAt : "",
    filePathOnly: Boolean(target.filePathOnly),
  };
}

function deleteHistoryTask(historyPath, target) {
  const request = getDeleteRequest(target);
  if (!request || (!request.ids.length && !request.filePath)) {
    throw new Error("Invalid history id.");
  }
  const history = readHistory(historyPath);
  const ids = new Set(request.ids);
  let nextHistory = history.filter((item) => {
    if (ids.has(item.id)) {
      return false;
    }
    return !(request.filePath && request.completedAt && item.file?.path === request.filePath && item.completedAt === request.completedAt);
  });
  if (nextHistory.length === history.length && request.filePathOnly && request.filePath) {
    nextHistory = history.filter((item) => item.file?.path !== request.filePath);
  }
  writeHistory(historyPath, nextHistory);
  return { deleted: nextHistory.length !== history.length, id: request.id || "" };
}

module.exports = {
  HISTORY_LIMIT,
  readHistory,
  writeHistory,
  upsertHistoryTask,
  deleteHistoryTask,
};
