const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  DEFAULT_SETTINGS,
  LEGACY_TTS_VOICE_PROMPT,
  mergeSettings,
  readSettings,
  writeSettings,
} = require("../electron/settings-store.cjs");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "asmr-trans-settings-"));
const settingsPath = path.join(tempDir, "settings.json");

try {
  const defaults = mergeSettings();
  assert.equal(defaults.translationBackend, "ai");
  assert.deepEqual(defaults.exportOptions, { txtMode: "bilingual", srtMode: "bilingual" });
  assert.equal(defaults.whisperModel, "small");

  const mergedOldSettings = mergeSettings({
    whisperModel: "medium",
    translationBackend: "legacy-local",
    aiTranslation: { apiKey: "sk-test" },
    exportOptions: { txtMode: "translation" },
    windowState: { width: 900 },
  });
  assert.equal(mergedOldSettings.whisperModel, "medium");
  assert.equal(mergedOldSettings.translationBackend, "ai");
  assert.equal(mergedOldSettings.aiTranslation.apiKey, "sk-test");
  assert.equal(mergedOldSettings.aiTranslation.baseUrl, DEFAULT_SETTINGS.aiTranslation.baseUrl);
  assert.deepEqual(mergedOldSettings.exportOptions, { txtMode: "translation", srtMode: "bilingual" });
  assert.deepEqual(mergedOldSettings.windowState, { width: 900, height: 780, isMaximized: false });

  const migratedTts = mergeSettings({
    tts: {
      voicePrompt: LEGACY_TTS_VOICE_PROMPT,
      cfgValue: 2,
      inferenceTimesteps: 10,
      retryBadcaseRatioThreshold: 9,
      denoise: true,
    },
  }).tts;
  assert.equal(migratedTts.voicePrompt, DEFAULT_SETTINGS.tts.voicePrompt);
  assert.equal(migratedTts.cfgValue, DEFAULT_SETTINGS.tts.cfgValue);
  assert.equal(migratedTts.inferenceTimesteps, DEFAULT_SETTINGS.tts.inferenceTimesteps);
  assert.equal(migratedTts.retryBadcaseRatioThreshold, DEFAULT_SETTINGS.tts.retryBadcaseRatioThreshold);
  assert.equal(migratedTts.denoise, DEFAULT_SETTINGS.tts.denoise);

  assert.deepEqual(readSettings(settingsPath).exportOptions, { txtMode: "bilingual", srtMode: "bilingual" });
  const written = writeSettings(settingsPath, {
    exportOptions: { txtMode: "source", srtMode: "translation" },
    network: { proxyEnabled: true },
  });
  assert.deepEqual(written.exportOptions, { txtMode: "source", srtMode: "translation" });
  assert.equal(written.network.proxyEnabled, true);
  assert.equal(readSettings(settingsPath).exportOptions.srtMode, "translation");

  fs.writeFileSync(settingsPath, "{bad json", "utf8");
  assert.deepEqual(readSettings(settingsPath).exportOptions, { txtMode: "bilingual", srtMode: "bilingual" });

  console.log("settings store checks passed");
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
