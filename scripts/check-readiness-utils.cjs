const assert = require("node:assert/strict");
const { loadTsModule } = require("./load-ts-module.cjs");

const { getReadinessChecks, getTaskNeedsAi, shouldTranslateWithAi } = loadTsModule("src/readiness-utils.ts");

const text = {
  readinessReady: "就绪",
  readinessAiMissing: "需要配置 AI",
  readinessGpuUnavailable: "GPU 不可用",
  readinessModelDownload: "首次运行会下载模型",
  readinessCpuFallback: "自动改用 CPU",
  readinessAiMessage: "AI API Key 为空。",
  readinessGpuMessage: "CUDA 不可用。",
  readinessModelMessage: "模型会按需下载。",
  readinessCpuFallbackMessage: "Auto 会回落 CPU。",
};

function settings(apiKey = "") {
  return { aiTranslation: { apiKey } };
}

function checks(overrides = {}) {
  return getReadinessChecks({
    tasks: [],
    settings: settings(),
    modelStatus: { whisperDownloaded: true },
    hardwareStatus: { ctranslate2CudaAvailable: true },
    computeDevice: "auto",
    text,
    ...overrides,
  });
}

assert.equal(shouldTranslateWithAi({ detectedLanguage: "ja" }), true);
assert.equal(shouldTranslateWithAi({ detectedLanguage: "ja-JP" }), true);
assert.equal(shouldTranslateWithAi({ detectedLanguage: "zh" }), false);

assert.equal(getTaskNeedsAi({ status: "queued", result: null }), true);
assert.equal(getTaskNeedsAi({ status: "done", result: null }), false);
assert.equal(getTaskNeedsAi({ status: "queued", result: { detectedLanguage: "zh" } }), false);
assert.equal(getTaskNeedsAi({ status: "failed", result: { detectedLanguage: "ja" } }), true);

assert.deepEqual(
  checks({
    tasks: [{ status: "queued", result: null }],
    settings: settings(""),
  }).blocking.map((check) => check.key),
  ["ai"],
);

assert.deepEqual(
  checks({
    tasks: [{ status: "queued", result: { detectedLanguage: "zh" } }],
    settings: settings(""),
  }).blocking,
  [],
);

assert.deepEqual(
  checks({
    tasks: [{ status: "done", result: { detectedLanguage: "ja" } }],
    settings: settings(""),
  }).blocking,
  [],
);

assert.deepEqual(
  checks({
    computeDevice: "cuda",
    hardwareStatus: { ctranslate2CudaAvailable: false, error: "missing cublas" },
  }).blocking.map((check) => [check.key, check.message]),
  [["gpu", "missing cublas"]],
);

assert.deepEqual(
  checks({
    computeDevice: "auto",
    hardwareStatus: { ctranslate2CudaAvailable: false },
  }).warnings.map((check) => check.key),
  ["cpu-fallback"],
);

assert.deepEqual(
  checks({
    modelStatus: { whisperDownloaded: false },
  }).warnings.map((check) => check.key),
  ["model"],
);

const mixed = checks({
  tasks: [{ status: "queued", result: null }],
  settings: settings(""),
  modelStatus: { whisperDownloaded: false },
  computeDevice: "auto",
  hardwareStatus: { ctranslate2CudaAvailable: false },
});
assert.equal(mixed.summary.key, "ai");
assert.deepEqual(
  mixed.checks.map((check) => check.key),
  ["ai", "model", "cpu-fallback"],
);

assert.equal(checks({ settings: settings("sk-test") }).summary.key, "ready");

console.log("readiness checks passed");
