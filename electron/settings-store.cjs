const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_WINDOW_STATE = {
  width: 1120,
  height: 780,
  isMaximized: false,
};

const DEFAULT_AI_SYSTEM_PROMPT =
  "\u4f60\u662f\u4e13\u4e1a\u7684\u65e5\u8bd1\u4e2d\u7ffb\u8bd1\u3002\u8bf7\u628a\u65e5\u8bed ASMR/\u53e3\u8bed\u8f6c\u5199\u7ffb\u8bd1\u6210\u81ea\u7136\u3001\u51c6\u786e\u7684\u7b80\u4f53\u4e2d\u6587\u3002\u5fe0\u5b9e\u4fdd\u7559\u539f\u610f\u3001\u8bed\u6c14\u3001\u79f0\u547c\u548c\u66a7\u6627\u8868\u8fbe\uff1b\u4e0d\u8981\u89e3\u91ca\uff0c\u4e0d\u8981\u603b\u7ed3\uff0c\u4e0d\u8981\u6dfb\u52a0\u539f\u6587\u6ca1\u6709\u7684\u4fe1\u606f\u3002";
const DEFAULT_AI_USER_PROMPT_TEMPLATE =
  "\u8bf7\u7ffb\u8bd1\u4e0b\u9762 JSON \u6570\u7ec4\u4e2d\u7684 items\u3002\u6bcf\u9879\u5305\u542b id\u3001start\u3001end\u3001text\u3001contextBefore\u3001contextAfter\u3002context \u5b57\u6bb5\u53ea\u7528\u4e8e\u7406\u89e3\u4e0a\u4e0b\u6587\uff0c\u53ea\u7ffb\u8bd1 text\u3002\u53ea\u8fd4\u56de JSON \u6570\u7ec4\uff0c\u6570\u7ec4\u6bcf\u9879\u5fc5\u987b\u662f {\"id\": \u6570\u5b57, \"translation\": \"\u4e2d\u6587\u8bd1\u6587\"}\uff0c\u4e0d\u8981\u8fd4\u56de Markdown\u3002";

const DEFAULT_SETTINGS = {
  whisperModel: "small",
  computeDevice: "auto",
  translationBackend: "ai",
  aiTranslation: {
    baseUrl: "https://api.deepseek.com",
    apiKey: "",
    model: "deepseek-v4-pro",
    temperature: 0.2,
    topP: 0.9,
    topK: "",
    maxTokens: 4096,
    timeoutSeconds: 120,
    retries: 2,
    reasoningEffort: "high",
    thinking: true,
    systemPrompt: DEFAULT_AI_SYSTEM_PROMPT,
    userPromptTemplate: DEFAULT_AI_USER_PROMPT_TEMPLATE,
    contextWindow: 6,
    contextOverlap: 1,
    proxyEnabled: false,
    proxyType: "http",
    proxyHost: "127.0.0.1",
    proxyPort: "7890",
  },
  network: {
    proxyEnabled: false,
    proxyType: "http",
    proxyHost: "127.0.0.1",
    proxyPort: "7890",
  },
  audioEnhancement: {
    enabled: false,
    normalize: true,
    compression: true,
    denoise: false,
    mono: true,
    targetPeak: 0.9,
    noiseGateDb: -48,
  },
  whisperAdvanced: {
    profile: "balanced",
    beamSize: 5,
    vadFilter: true,
    noSpeechThreshold: 0.6,
    conditionOnPreviousText: false,
    initialPrompt: "",
  },
  tts: {
    enabled: false,
    device: "auto",
    voicePrompt: "\u4e2d\u6587\uff0c\u8f7b\u58f0\uff0c\u6e29\u67d4\uff0c\u8bed\u901f\u63a5\u8fd1\u539f\u97f3\u9891\uff0c\u505c\u987f\u81ea\u7136\uff0c\u8d34\u8fd1\u539f\u97f3\u8272",
    cfgValue: 1.6,
    inferenceTimesteps: 20,
    normalize: true,
    denoise: false,
    retryBadcaseRatioThreshold: 4.0,
  },
  exportOptions: {
    txtMode: "bilingual",
    srtMode: "bilingual",
  },
  windowState: DEFAULT_WINDOW_STATE,
};

const LEGACY_TTS_VOICE_PROMPT = "\u4e2d\u6587\uff0c\u8f7b\u58f0\uff0c\u6e29\u67d4\uff0c\u81ea\u7136\uff0c\u8d34\u8fd1\u539f\u97f3\u8272";

function mergeSettings(settings = {}) {
  const ttsSettings = {
    ...DEFAULT_SETTINGS.tts,
    ...(settings.tts || {}),
  };
  if (
    settings.tts &&
    settings.tts.voicePrompt === LEGACY_TTS_VOICE_PROMPT &&
    Number(settings.tts.cfgValue) === 2 &&
    Number(settings.tts.inferenceTimesteps) === 10
  ) {
    ttsSettings.voicePrompt = DEFAULT_SETTINGS.tts.voicePrompt;
    ttsSettings.cfgValue = DEFAULT_SETTINGS.tts.cfgValue;
    ttsSettings.inferenceTimesteps = DEFAULT_SETTINGS.tts.inferenceTimesteps;
    ttsSettings.retryBadcaseRatioThreshold = DEFAULT_SETTINGS.tts.retryBadcaseRatioThreshold;
    ttsSettings.denoise = DEFAULT_SETTINGS.tts.denoise;
  }
  const merged = {
    ...DEFAULT_SETTINGS,
    ...settings,
    aiTranslation: {
      ...DEFAULT_SETTINGS.aiTranslation,
      ...(settings.aiTranslation || {}),
    },
    network: {
      ...DEFAULT_SETTINGS.network,
      ...(settings.network || {}),
    },
    audioEnhancement: {
      ...DEFAULT_SETTINGS.audioEnhancement,
      ...(settings.audioEnhancement || {}),
    },
    whisperAdvanced: {
      ...DEFAULT_SETTINGS.whisperAdvanced,
      ...(settings.whisperAdvanced || {}),
    },
    tts: ttsSettings,
    exportOptions: {
      ...DEFAULT_SETTINGS.exportOptions,
      ...(settings.exportOptions || {}),
    },
    windowState: {
      ...DEFAULT_SETTINGS.windowState,
      ...(settings.windowState || {}),
    },
  };
  merged.translationBackend = "ai";
  return merged;
}

function readSettings(settingsPath) {
  if (!fs.existsSync(settingsPath)) {
    return mergeSettings();
  }
  try {
    return mergeSettings(JSON.parse(fs.readFileSync(settingsPath, "utf8")));
  } catch (_error) {
    return mergeSettings();
  }
}

function writeSettings(settingsPath, settings) {
  const nextSettings = mergeSettings(settings);
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(nextSettings, null, 2), "utf8");
  return nextSettings;
}

module.exports = {
  DEFAULT_SETTINGS,
  DEFAULT_WINDOW_STATE,
  LEGACY_TTS_VOICE_PROMPT,
  mergeSettings,
  readSettings,
  writeSettings,
};
