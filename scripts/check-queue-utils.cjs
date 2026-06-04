const assert = require("node:assert/strict");
const { loadTsModule } = require("./load-ts-module.cjs");

const {
  filterQueueTasks,
  getClearableTasks,
  getDoneTasks,
  getFailedOrCanceledTasks,
  requeueTaskState,
  shouldRequeueTask,
} = loadTsModule("src/queue-utils.ts");

function task(id, status, patch = {}) {
  return {
    id,
    status,
    file: {
      name: `${id}.wav`,
      path: `E:\\media\\${id}.wav`,
      extension: "wav",
    },
    error: null,
    result: null,
    progress: { stage: "old" },
    stageTimings: { transcribe: 1 },
    completedAt: "2026-01-01T00:00:00Z",
    ...patch,
  };
}

const tasks = [
  task("a", "queued"),
  task("b", "running", { file: { name: "voice.mp4", path: "E:\\video\\voice.mp4", extension: "mp4" } }),
  task("c", "done", { result: { segments: [] } }),
  task("d", "failed", { error: "CUDA missing" }),
  task("e", "canceled"),
];

assert.deepEqual(
  filterQueueTasks({ tasks, query: "", statusFilter: "all", descending: false }).map((item) => item.id),
  ["a", "b", "c", "d", "e"],
);
assert.deepEqual(
  filterQueueTasks({ tasks, query: "", statusFilter: "all", descending: true }).map((item) => item.id),
  ["e", "d", "c", "b", "a"],
);
assert.deepEqual(
  filterQueueTasks({ tasks, query: "video", statusFilter: "all", descending: false }).map((item) => item.id),
  ["b"],
);
assert.deepEqual(
  filterQueueTasks({ tasks, query: "cuda", statusFilter: "failed", descending: false }).map((item) => item.id),
  ["d"],
);
assert.deepEqual(
  filterQueueTasks({ tasks, query: "cuda", statusFilter: "queued", descending: false }),
  [],
);

assert.deepEqual(getDoneTasks(tasks).map((item) => item.id), ["c"]);
assert.deepEqual(getFailedOrCanceledTasks(tasks).map((item) => item.id), ["d", "e"]);
assert.deepEqual(getClearableTasks(tasks, ["done", "failed", "canceled"], "e").map((item) => item.id), ["c", "d"]);
assert.deepEqual(getClearableTasks(tasks, ["running"], null), []);

assert.equal(shouldRequeueTask(task("x", "failed")), true);
assert.equal(shouldRequeueTask(task("x", "canceled")), true);
assert.equal(shouldRequeueTask(task("x", "done")), false);

assert.deepEqual(requeueTaskState(task("x", "failed", { error: "bad" })), {
  id: "x",
  status: "queued",
  file: {
    name: "x.wav",
    path: "E:\\media\\x.wav",
    extension: "wav",
  },
  error: null,
  result: null,
  progress: null,
  stageTimings: undefined,
  completedAt: undefined,
});

console.log("queue utility checks passed");
