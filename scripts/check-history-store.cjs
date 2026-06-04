const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  HISTORY_LIMIT,
  readHistory,
  upsertHistoryTask,
  deleteHistoryTask,
} = require("../electron/history-store.cjs");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "asmr-trans-history-"));
const historyPath = path.join(tempDir, "history.json");

function task(id, index = 0) {
  return {
    id,
    file: { name: `${id}.wav`, path: `E:\\media\\${id}.wav`, extension: "wav" },
    result: {
      detectedLanguage: "zh",
      duration: 10,
      segments: [{ id: index, start: 0, end: 1, sourceText: `text ${index}` }],
    },
    addedAt: `2026-01-01T00:00:${String(index).padStart(2, "0")}Z`,
    completedAt: `2026-01-01T00:01:${String(index).padStart(2, "0")}Z`,
  };
}

try {
  assert.deepEqual(readHistory(historyPath), []);

  upsertHistoryTask(historyPath, task("a", 1));
  upsertHistoryTask(historyPath, task("b", 2));
  assert.deepEqual(
    readHistory(historyPath).map((item) => item.id),
    ["b", "a"],
  );

  upsertHistoryTask(historyPath, task("a", 3));
  const afterDuplicateUpsert = readHistory(historyPath);
  assert.deepEqual(
    afterDuplicateUpsert.map((item) => item.id),
    ["a", "b"],
  );
  assert.equal(afterDuplicateUpsert[0].result.segments[0].sourceText, "text 3");

  assert.deepEqual(deleteHistoryTask(historyPath, "a"), { deleted: true, id: "a" });
  assert.deepEqual(
    readHistory(historyPath).map((item) => item.id),
    ["b"],
  );
  assert.deepEqual(deleteHistoryTask(historyPath, "missing"), { deleted: false, id: "missing" });
  assert.deepEqual(
    readHistory(historyPath).map((item) => item.id),
    ["b"],
  );

  upsertHistoryTask(historyPath, {
    ...task("legacy-id", 4),
    id: "legacy-history-id",
  });
  assert.deepEqual(deleteHistoryTask(historyPath, {
    id: "queue-id",
    ids: ["queue-id", "missing-id"],
    filePath: "E:\\media\\legacy-id.wav",
    completedAt: "2026-01-01T00:01:04Z",
  }), { deleted: true, id: "queue-id" });
  assert.deepEqual(
    readHistory(historyPath).map((item) => item.id),
    ["b"],
  );

  upsertHistoryTask(historyPath, {
    ...task("legacy-path-id", 5),
    id: "legacy-random-id",
    completedAt: "2026-01-01T00:01:05Z",
  });
  assert.deepEqual(deleteHistoryTask(historyPath, {
    id: "unmatched-ui-id",
    ids: ["unmatched-ui-id"],
    filePath: "E:\\media\\legacy-path-id.wav",
    completedAt: "2026-01-01T00:09:09Z",
    filePathOnly: true,
  }), { deleted: true, id: "unmatched-ui-id" });
  assert.deepEqual(
    readHistory(historyPath).map((item) => item.id),
    ["b"],
  );

  upsertHistoryTask(historyPath, task("same-path-first", 6));
  upsertHistoryTask(historyPath, {
    ...task("same-path-second", 7),
    file: { name: "same-path.wav", path: "E:\\media\\same-path.wav", extension: "wav" },
  });
  upsertHistoryTask(historyPath, {
    ...task("same-path-third", 8),
    file: { name: "same-path.wav", path: "E:\\media\\same-path.wav", extension: "wav" },
  });
  assert.deepEqual(deleteHistoryTask(historyPath, {
    id: "same-path-second",
    ids: ["same-path-second"],
    filePath: "E:\\media\\same-path.wav",
    filePathOnly: true,
  }), { deleted: true, id: "same-path-second" });
  assert.deepEqual(
    readHistory(historyPath).map((item) => item.id),
    ["same-path-third", "same-path-first", "b"],
  );

  for (let index = 0; index < HISTORY_LIMIT + 5; index += 1) {
    upsertHistoryTask(historyPath, task(`limit-${index}`, index));
  }
  assert.equal(readHistory(historyPath).length, HISTORY_LIMIT);

  fs.writeFileSync(historyPath, "{bad json", "utf8");
  assert.deepEqual(readHistory(historyPath), []);

  console.log("history store checks passed");
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
