const assert = require("node:assert/strict");
const { loadTsModule } = require("./load-ts-module.cjs");

const {
  TRANSLATION_RETRY_PROGRESS,
  canRetryTaskTranslation,
  markTaskTranslationRetryRunning,
} = loadTsModule("src/translation-retry-utils.ts");

function task(status, detectedLanguage, segments = [{ start: 0, end: 1, sourceText: "text" }]) {
  return {
    id: "task",
    status,
    error: "translation failed",
    progress: null,
    result: detectedLanguage ? { detectedLanguage, segments } : null,
  };
}

assert.equal(canRetryTaskTranslation(task("failed", "ja")), true);
assert.equal(canRetryTaskTranslation(task("failed", "ja-JP")), true);
assert.equal(canRetryTaskTranslation(task("done", "ja")), false);
assert.equal(canRetryTaskTranslation(task("failed", "zh")), false);
assert.equal(canRetryTaskTranslation(task("failed", "ja", [])), false);
assert.equal(canRetryTaskTranslation(task("failed", null)), false);
assert.equal(canRetryTaskTranslation(null), false);

assert.deepEqual(TRANSLATION_RETRY_PROGRESS, {
  stage: "translate",
  message: "正在 AI 翻译...",
  percent: 55,
});

assert.deepEqual(markTaskTranslationRetryRunning(task("failed", "ja")), {
  id: "task",
  status: "running",
  error: null,
  progress: TRANSLATION_RETRY_PROGRESS,
  result: {
    detectedLanguage: "ja",
    segments: [{ start: 0, end: 1, sourceText: "text" }],
  },
});

console.log("translation retry checks passed");
