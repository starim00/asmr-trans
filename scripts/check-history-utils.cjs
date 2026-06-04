const assert = require("node:assert/strict");
const { loadTsModule } = require("./load-ts-module.cjs");

const {
  buildHistoryTask,
  getHistoryDeleteId,
  getHistoryDeleteIds,
  getHistoryDeleteRequest,
  historyQueueTaskId,
  shouldDeleteUpsertResponse,
  taskIdentity,
} = loadTsModule("src/history-utils.ts");

const file = {
  name: "sample.wav",
  path: "E:\\media\\sample.wav",
  extension: "wav",
  size: 123,
};
const result = {
  detectedLanguage: "ja",
  segments: [{ start: 0, end: 1, sourceText: "text" }],
};

assert.equal(taskIdentity({ id: "queue-1" }), "queue-1");
assert.equal(taskIdentity({ id: "history-history-a", historyId: "history-a" }), "history-a");
assert.equal(historyQueueTaskId("history-a"), "history-history-a");

assert.equal(buildHistoryTask({ id: "queued", file, result: null }), null);
assert.deepEqual(
  buildHistoryTask(
    {
      id: "queued",
      file,
      result,
      addedAt: "2026-01-01T00:00:00.000Z",
    },
    "2026-01-01T00:01:00.000Z",
  ),
  {
    id: "E:\\media\\sample.wav-2026-01-01T00:01:00.000Z",
    file,
    result,
    addedAt: "2026-01-01T00:00:00.000Z",
    completedAt: "2026-01-01T00:01:00.000Z",
  },
);
assert.deepEqual(
  buildHistoryTask({
    id: "history-history-a",
    historyId: "history-a",
    file,
    result,
    addedAt: "2026-01-01T00:00:00.000Z",
    completedAt: "2026-01-01T00:02:00.000Z",
  }),
  {
    id: "history-a",
    file,
    result,
    addedAt: "2026-01-01T00:00:00.000Z",
    completedAt: "2026-01-01T00:02:00.000Z",
  },
);

assert.equal(getHistoryDeleteId({ id: "queued", file, result: null }), null);
assert.deepEqual(getHistoryDeleteIds({ id: "queued", file, result: null }), []);
assert.equal(
  getHistoryDeleteId({
    id: "done",
    file,
    result,
    completedAt: "2026-01-01T00:03:00.000Z",
  }),
  "E:\\media\\sample.wav-2026-01-01T00:03:00.000Z",
);
assert.deepEqual(
  getHistoryDeleteRequest({
    id: "done",
    file,
    result,
    completedAt: "2026-01-01T00:03:00.000Z",
  }),
  {
    id: "E:\\media\\sample.wav-2026-01-01T00:03:00.000Z",
    ids: ["E:\\media\\sample.wav-2026-01-01T00:03:00.000Z", "done"],
    filePath: "E:\\media\\sample.wav",
    completedAt: "2026-01-01T00:03:00.000Z",
    filePathOnly: true,
  },
);
assert.equal(
  getHistoryDeleteId({
    id: "history-history-a",
    historyId: "history-a",
    file,
    result,
    completedAt: "2026-01-01T00:03:00.000Z",
  }),
  "history-a",
);
assert.deepEqual(
  getHistoryDeleteIds({
    id: "history-history-a",
    historyId: "history-a",
    file,
    result,
    completedAt: "2026-01-01T00:03:00.000Z",
  }),
  ["history-a", "E:\\media\\sample.wav-2026-01-01T00:03:00.000Z", "history-history-a"],
);

assert.equal(shouldDeleteUpsertResponse("a", new Set(["a"]), true), true);
assert.equal(shouldDeleteUpsertResponse("a", new Set(), false), true);
assert.equal(shouldDeleteUpsertResponse("a", new Set(["b"]), true), false);
assert.equal(shouldDeleteUpsertResponse("a", new Set(), true, "E:\\media\\sample.wav", new Set(["E:\\media\\sample.wav"])), true);
assert.equal(shouldDeleteUpsertResponse("a", new Set(), true, "E:\\media\\sample.wav", new Set(["E:\\media\\other.wav"])), false);

console.log("history UI checks passed");
