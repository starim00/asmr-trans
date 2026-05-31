const { app, BrowserWindow, dialog, ipcMain, screen } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { spawn, spawnSync } = require("node:child_process");

const MEDIA_EXTENSIONS = ["mp3", "wav", "m4a", "flac", "ogg", "aac", "mp4", "mkv", "mov", "webm", "avi", "wmv"];
let mainWindow = null;
let activeWorker = null;
let activeWorkerCancelRequested = false;
let activeTtsWorker = null;
let activeTtsWorkerCancelRequested = false;
const activeTranslationWorkers = new Map();
let dependencyInstallPromise = null;
let ttsDependencyInstallPromise = null;
let windowStateSaveTimer = null;

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
  windowState: DEFAULT_WINDOW_STATE,
};

const LEGACY_TTS_VOICE_PROMPT = "\u4e2d\u6587\uff0c\u8f7b\u58f0\uff0c\u6e29\u67d4\uff0c\u81ea\u7136\uff0c\u8d34\u8fd1\u539f\u97f3\u8272";

function getModelsDir() {
  return path.join(app.getPath("userData"), "models");
}

function getSettingsPath() {
  return path.join(app.getPath("userData"), "settings.json");
}

function getHistoryPath() {
  return path.join(app.getPath("userData"), "history.json");
}

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
    windowState: {
      ...DEFAULT_SETTINGS.windowState,
      ...(settings.windowState || {}),
    },
  };
  merged.translationBackend = "ai";
  return merged;
}

function readSettings() {
  const settingsPath = getSettingsPath();
  if (!fs.existsSync(settingsPath)) {
    return mergeSettings();
  }
  try {
    return mergeSettings(JSON.parse(fs.readFileSync(settingsPath, "utf8")));
  } catch (_error) {
    return mergeSettings();
  }
}

function writeSettings(settings) {
  const nextSettings = mergeSettings(settings);
  fs.mkdirSync(path.dirname(getSettingsPath()), { recursive: true });
  fs.writeFileSync(getSettingsPath(), JSON.stringify(nextSettings, null, 2), "utf8");
  return nextSettings;
}

function getValidatedWindowState() {
  const savedState = readSettings().windowState || DEFAULT_WINDOW_STATE;
  const workArea = screen.getPrimaryDisplay().workAreaSize;
  const minWidth = 920;
  const minHeight = 660;
  return {
    width: Math.min(Math.max(Number(savedState.width) || DEFAULT_WINDOW_STATE.width, minWidth), workArea.width),
    height: Math.min(Math.max(Number(savedState.height) || DEFAULT_WINDOW_STATE.height, minHeight), workArea.height),
    isMaximized: Boolean(savedState.isMaximized),
  };
}

function getCurrentWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return DEFAULT_WINDOW_STATE;
  }
  const isMaximized = mainWindow.isMaximized();
  let bounds;
  if (typeof mainWindow.getNormalBounds === "function") {
    bounds = mainWindow.getNormalBounds();
  } else if (!isMaximized) {
    bounds = mainWindow.getBounds();
  } else {
    bounds = readSettings().windowState || DEFAULT_WINDOW_STATE;
  }
  return {
    width: Math.max(Number(bounds.width) || DEFAULT_WINDOW_STATE.width, 920),
    height: Math.max(Number(bounds.height) || DEFAULT_WINDOW_STATE.height, 660),
    isMaximized,
  };
}

function saveWindowStateNow() {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isMinimized()) {
    return;
  }
  const settings = readSettings();
  writeSettings({
    ...settings,
    windowState: getCurrentWindowState(),
  });
}

function scheduleWindowStateSave() {
  if (windowStateSaveTimer) {
    clearTimeout(windowStateSaveTimer);
  }
  windowStateSaveTimer = setTimeout(() => {
    windowStateSaveTimer = null;
    saveWindowStateNow();
  }, 400);
}

function readHistory() {
  const historyPath = getHistoryPath();
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

function writeHistory(history) {
  fs.mkdirSync(path.dirname(getHistoryPath()), { recursive: true });
  fs.writeFileSync(getHistoryPath(), JSON.stringify(history.slice(0, 200), null, 2), "utf8");
  return history;
}

function upsertHistoryTask(task) {
  if (!task || !task.file || !task.result) {
    throw new Error("Invalid history task.");
  }
  const history = readHistory();
  const id = task.id || `${task.file.path}-${Date.now()}`;
  const nextTask = {
    id,
    file: task.file,
    result: task.result,
    addedAt: task.addedAt || task.completedAt || new Date().toISOString(),
    completedAt: task.completedAt || new Date().toISOString(),
  };
  const filtered = history.filter((item) => item.id !== id);
  writeHistory([nextTask, ...filtered]);
  return nextTask;
}

function safeExportFileName(fileName) {
  const baseName = path.basename(String(fileName || "transcription.txt"));
  return baseName.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_") || "transcription.txt";
}

function hasModelFiles(modelPath) {
  return fs.existsSync(modelPath) && fs.readdirSync(modelPath).length > 0;
}

function getWorkerPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "python", "worker.py");
  }
  return path.join(__dirname, "..", "python", "worker.py");
}

function getRequirementsPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "python", "requirements-cuda.txt");
  }
  return path.join(__dirname, "..", "python", "requirements-cuda.txt");
}

function getTtsRequirementsPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "python", "requirements-tts.txt");
  }
  return path.join(__dirname, "..", "python", "requirements-tts.txt");
}

function getPackagedPythonExecutable() {
  if (!app.isPackaged) {
    return null;
  }
  const executable = process.platform === "win32" ? "python.exe" : "python";
  const runtimePath = path.join(process.resourcesPath, "runtime", "python", executable);
  return fs.existsSync(runtimePath) ? runtimePath : null;
}

function getPythonCommand(extraArgs = []) {
  const packagedPython = getPackagedPythonExecutable();
  const executable = process.env.ASMR_TRANS_PYTHON || packagedPython || (process.platform === "win32" ? "py" : "python3");
  const args = process.platform === "win32" && !process.env.ASMR_TRANS_PYTHON && !packagedPython
    ? ["-3", getWorkerPath(), ...extraArgs]
    : [getWorkerPath(), ...extraArgs];
  return { executable, args };
}

function getConfiguredProxyUrl() {
  const network = readSettings().network || {};
  if (!network.proxyEnabled) {
    return "";
  }
  const host = String(network.proxyHost || "").trim();
  const port = String(network.proxyPort || "").trim();
  const type = network.proxyType === "socks5" ? "socks5" : "http";
  if (!host || !port) {
    return "";
  }
  return `${type}://${host}:${port}`;
}

function getWorkerEnv() {
  const env = {
    ...process.env,
    HF_HUB_ENABLE_HF_TRANSFER: process.env.HF_HUB_ENABLE_HF_TRANSFER || "0",
    HF_HUB_DISABLE_SYMLINKS_WARNING: process.env.HF_HUB_DISABLE_SYMLINKS_WARNING || "1",
    HF_HUB_ETAG_TIMEOUT: process.env.HF_HUB_ETAG_TIMEOUT || "30",
    HF_HUB_DOWNLOAD_TIMEOUT: process.env.HF_HUB_DOWNLOAD_TIMEOUT || "120",
    PYTHONIOENCODING: "utf-8",
    PYTHONUTF8: "1",
  };
  const configuredProxy = getConfiguredProxyUrl();
  if (configuredProxy) {
    env.HTTP_PROXY = configuredProxy;
    env.HTTPS_PROXY = configuredProxy;
    env.ALL_PROXY = configuredProxy;
    env.http_proxy = configuredProxy;
    env.https_proxy = configuredProxy;
    env.all_proxy = configuredProxy;
  }
  return env;
}

function sendDependencyProgress(message, percent = 0) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("deps:progress", {
      stage: "dependencies",
      message,
      percent,
    });
  }
}

function checkPythonDependencies(extraArgs = ["--check-deps"]) {
  const { executable, args } = getPythonCommand(extraArgs);
  return spawnSync(executable, args, {
    encoding: "utf8",
    windowsHide: true,
    env: getWorkerEnv(),
  });
}

function getPipInstallAttempts(requirementsPath, extraArgs = []) {
  const commonArgs = ["-m", "pip", "install", "--disable-pip-version-check", "-r", requirementsPath];
  const attempts = [{ label: "Default PyPI", args: commonArgs }];
  const customIndex = (process.env.ASMR_TRANS_PIP_INDEX_URL || "").trim();
  if (customIndex) {
    attempts.unshift({
      label: "Custom Python package index",
      args: [
        "-m",
        "pip",
        "install",
        "--disable-pip-version-check",
        ...extraArgs,
        "--index-url",
        customIndex,
        "-r",
        requirementsPath,
      ],
    });
  }
  attempts.push(
    {
      label: "Aliyun PyPI mirror",
      args: [
        "-m",
        "pip",
        "install",
        "--disable-pip-version-check",
        ...extraArgs,
        "--index-url",
        "https://mirrors.aliyun.com/pypi/simple/",
        "--trusted-host",
        "mirrors.aliyun.com",
        "-r",
        requirementsPath,
      ],
    },
    {
      label: "Tsinghua PyPI mirror",
      args: [
        "-m",
        "pip",
        "install",
        "--disable-pip-version-check",
        ...extraArgs,
        "--index-url",
        "https://pypi.tuna.tsinghua.edu.cn/simple/",
        "--trusted-host",
        "pypi.tuna.tsinghua.edu.cn",
        "-r",
        requirementsPath,
      ],
    },
  );
  if (extraArgs.length) {
    attempts[0] = { label: attempts[0].label, args: ["-m", "pip", "install", "--disable-pip-version-check", ...extraArgs, "-r", requirementsPath] };
  }
  return attempts;
}

function runPipInstallAttempt(packagedPython, attempt, attemptIndex, attemptCount, progress = sendDependencyProgress, noun = "Python dependencies") {
  return new Promise((resolve, reject) => {
    progress(`Installing ${noun} (${attempt.label}, ${attemptIndex + 1}/${attemptCount})...`, 5);
    const installer = spawn(packagedPython, attempt.args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      env: getWorkerEnv(),
    });

    let output = "";
    installer.stdout.setEncoding("utf8");
    installer.stderr.setEncoding("utf8");
    const onData = (chunk) => {
      output += chunk;
      const lastLine = output.split(/\r?\n/).filter(Boolean).pop();
      if (lastLine) {
        progress(`Installing ${noun} (${attempt.label}): ${lastLine.slice(0, 160)}`, 20);
      }
    };
    installer.stdout.on("data", onData);
    installer.stderr.on("data", onData);
    installer.on("error", (error) => {
      error.output = output;
      reject(error);
    });
    installer.on("close", (code) => {
      if (code === 0) {
        resolve(output);
        return;
      }
      const error = new Error(`exit code ${code}`);
      error.output = output;
      reject(error);
    });
  });
}

function ensurePythonDependencies() {
  if (!app.isPackaged) {
    return Promise.resolve();
  }
  if (dependencyInstallPromise) {
    return dependencyInstallPromise;
  }

  dependencyInstallPromise = (async () => {
    sendDependencyProgress("Checking bundled Python dependencies...", 2);
    const checkResult = checkPythonDependencies();
    if (checkResult.status === 0) {
      sendDependencyProgress("Python dependencies are ready.", 100);
      return;
    }

    const packagedPython = getPackagedPythonExecutable();
    if (!packagedPython) {
      throw new Error("Packaged Python runtime was not found.");
    }

    const requirementsPath = getRequirementsPath();
    if (!fs.existsSync(requirementsPath)) {
      throw new Error(`Python requirements file was not found: ${requirementsPath}`);
    }

    const attempts = getPipInstallAttempts(requirementsPath);
    let lastOutput = "";
    for (let index = 0; index < attempts.length; index += 1) {
      try {
        await runPipInstallAttempt(packagedPython, attempts[index], index, attempts.length);
        sendDependencyProgress("Python dependencies installed.", 100);
        return;
      } catch (error) {
        lastOutput = error.output || error.message || "";
        if (index < attempts.length - 1) {
          sendDependencyProgress(`Python dependency source failed, switching to: ${attempts[index + 1].label}`, 12);
        }
      }
    }
    throw new Error(`Python dependency installation failed after trying PyPI and mirrors. ${lastOutput.slice(-1000)}`);
  })().finally(() => {
    dependencyInstallPromise = null;
  });

  return dependencyInstallPromise;
}

function getPipCommandForAttempt(attempt) {
  const packagedPython = getPackagedPythonExecutable();
  if (packagedPython) {
    return { executable: packagedPython, args: attempt.args };
  }
  if (process.env.ASMR_TRANS_PYTHON) {
    return { executable: process.env.ASMR_TRANS_PYTHON, args: attempt.args };
  }
  if (process.platform === "win32") {
    return { executable: "py", args: ["-3", ...attempt.args] };
  }
  return { executable: "python3", args: attempt.args };
}

function runTtsPipInstallAttempt(attempt, attemptIndex, attemptCount, progress) {
  const command = getPipCommandForAttempt(attempt);
  return runPipInstallAttempt(command.executable, { ...attempt, args: command.args }, attemptIndex, attemptCount, progress, "VoxCPM2 dependencies");
}

function installVoxCpmPackageNoDeps(progress) {
  const attempt = {
    label: "VoxCPM2 package",
    args: ["-m", "pip", "install", "--disable-pip-version-check", "--no-deps", "--force-reinstall", "voxcpm==2.0.3"],
  };
  const command = getPipCommandForAttempt(attempt);
  return runPipInstallAttempt(command.executable, { ...attempt, args: command.args }, 0, 1, progress, "VoxCPM2 package");
}

function ensureTtsDependencies(event, taskId = null) {
  if (ttsDependencyInstallPromise) {
    return ttsDependencyInstallPromise;
  }

  const progress = (message, percent = 0) => {
    event.sender.send("deps:progress", {
      stage: "tts-dependencies",
      message,
      percent,
    });
    if (taskId) {
      event.sender.send("tts:progress", {
        taskId,
        progress: { stage: "tts-dependencies", message, percent },
      });
    }
  };

  ttsDependencyInstallPromise = (async () => {
    progress("Checking VoxCPM2 dependencies...", 2);
    const checkResult = checkPythonDependencies(["--check-tts-deps"]);
    if (checkResult.status === 0) {
      progress("VoxCPM2 dependencies are ready.", 100);
      return;
    }

    const requirementsPath = getTtsRequirementsPath();
    if (!fs.existsSync(requirementsPath)) {
      throw new Error(`VoxCPM2 requirements file was not found: ${requirementsPath}`);
    }

    const attempts = getPipInstallAttempts(requirementsPath, [
      "--extra-index-url",
      "https://download.pytorch.org/whl/cu124",
      "--trusted-host",
      "download.pytorch.org",
    ]);
    let lastOutput = "";
    for (let index = 0; index < attempts.length; index += 1) {
      try {
        await runTtsPipInstallAttempt(attempts[index], index, attempts.length, progress);
        progress("Installing VoxCPM2 package without optional TorchCodec dependency...", 88);
        await installVoxCpmPackageNoDeps(progress);
        progress("VoxCPM2 dependencies installed.", 100);
        return;
      } catch (error) {
        lastOutput = error.output || error.message || "";
        if (index < attempts.length - 1) {
          progress(`VoxCPM2 dependency source failed, switching to: ${attempts[index + 1].label}`, 12);
        }
      }
    }
    throw new Error(`VoxCPM2 dependency installation failed after trying PyPI and mirrors. ${lastOutput.slice(-1000)}`);
  })().finally(() => {
    ttsDependencyInstallPromise = null;
  });

  return ttsDependencyInstallPromise;
}

function createWindow() {
  const windowState = getValidatedWindowState();
  mainWindow = new BrowserWindow({
    width: windowState.width,
    height: windowState.height,
    minWidth: 920,
    minHeight: 660,
    title: "ASMR Trans",
    backgroundColor: "#f4f1e8",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  if (windowState.isMaximized) {
    mainWindow.maximize();
  }

  mainWindow.on("resize", scheduleWindowStateSave);
  mainWindow.on("maximize", saveWindowStateNow);
  mainWindow.on("unmaximize", saveWindowStateNow);
  mainWindow.on("close", saveWindowStateNow);

  const devServer = process.env.VITE_DEV_SERVER_URL;
  if (devServer) {
    mainWindow.loadURL(devServer);
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  mainWindow.webContents.once("did-finish-load", () => {
    ensurePythonDependencies().catch((error) => {
      sendDependencyProgress(`Python 濠电偞鎸荤喊宥囨崲閸℃瑧鐭夐柛鈩冪憿閸嬫捇鎮烽柇锔叫銈冨劚閿曘儱顕ラ崟顒佺秶妞ゆ劑鍎涢弴銏＄叆?{error.message}`, 0);
    });
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  if (activeWorker) {
    activeWorker.kill();
  }
  for (const worker of activeTranslationWorkers.values()) {
    worker.kill();
  }
  activeTranslationWorkers.clear();
});

ipcMain.handle("audio:select", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Select media files",
    properties: ["openFile", "multiSelections"],
    filters: [{ name: "Audio/Video", extensions: MEDIA_EXTENSIONS }],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return [];
  }

  return result.filePaths.map((mediaPath) => {
    const ext = path.extname(mediaPath).slice(1).toLowerCase();
    if (!MEDIA_EXTENSIONS.includes(ext)) {
      throw new Error(`Unsupported media format: .${ext}`);
    }
    const stat = fs.statSync(mediaPath);
    return {
      path: mediaPath,
      name: path.basename(mediaPath),
      size: stat.size,
      extension: ext,
    };
  });
});

ipcMain.handle("models:status", async () => {
  const modelsDir = getModelsDir();
  return {
    modelsDir,
    whisperDownloaded: hasModelFiles(path.join(modelsDir, "whisper")),
    voxcpmDownloaded: hasModelFiles(path.join(modelsDir, "voxcpm")),
  };
});

ipcMain.handle("hardware:status", async () => {
  const { executable, args } = getPythonCommand(["--hardware"]);
  const result = spawnSync(executable, args, {
    encoding: "utf8",
    windowsHide: true,
    env: getWorkerEnv(),
  });

  if (result.error) {
    return {
      cudaAvailable: false,
      cudaDeviceCount: 0,
      cudaDeviceName: null,
      error: result.error.message,
    };
  }

  try {
    return JSON.parse(result.stdout.trim());
  } catch (_error) {
    return {
      cudaAvailable: false,
      cudaDeviceCount: 0,
      cudaDeviceName: null,
      error: result.stderr.trim() || "Unable to read hardware status.",
    };
  }
});

ipcMain.handle("settings:get", async () => {
  return readSettings();
});

ipcMain.handle("settings:update", async (_event, settings) => {
  return writeSettings(settings || {});
});

ipcMain.handle("history:get", async () => {
  return readHistory();
});

ipcMain.handle("history:upsert", async (_event, task) => {
  const saved = upsertHistoryTask(task);
  return { saved: true, id: saved.id };
});

ipcMain.handle("deps:retry", async () => {
  await ensurePythonDependencies();
  return { ok: true };
});

ipcMain.handle("tts:install-deps", async (event) => {
  ttsDependencyInstallPromise = null;
  await ensureTtsDependencies(event);
  return { ok: true };
});

ipcMain.handle("transcribe:start", async (event, payload) => {
  if (!payload || !payload.audioPath) {
    throw new Error("Select an audio file first.");
  }

  const ext = path.extname(payload.audioPath).slice(1).toLowerCase();
  if (!MEDIA_EXTENSIONS.includes(ext)) {
    throw new Error(`Unsupported media format: .${ext}`);
  }

  if (activeWorker) {
    throw new Error("A transcription task is already running.");
  }
  if (activeTtsWorker) {
    throw new Error("A speech generation task is running. Wait for it to finish before starting transcription.");
  }

  await ensurePythonDependencies();

  const modelsDir = getModelsDir();
  fs.mkdirSync(modelsDir, { recursive: true });
  const savedSettings = readSettings();
  const payloadAiConfig = payload.aiTranslationConfig || {};
  const aiTranslationConfig = {
    ...savedSettings.aiTranslation,
    ...payloadAiConfig,
  };

  const { executable, args } = getPythonCommand();
  const request = {
    audioPath: payload.audioPath,
    whisperModel: payload.whisperModel || savedSettings.whisperModel || "small",
    translationModel: "ai-chat-completions",
    translationBackend: "ai",
    aiTranslationConfig,
    audioEnhancement: {
      ...savedSettings.audioEnhancement,
      ...(payload.audioEnhancement || {}),
    },
    whisperAdvanced: {
      ...savedSettings.whisperAdvanced,
      ...(payload.whisperAdvanced || {}),
    },
    computeDevice: payload.computeDevice || savedSettings.computeDevice || "auto",
    outputLanguage: "zh",
    modelsDir,
    translateAfterTranscribe: false,
  };

  activeWorker = spawn(executable, args, {
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
    env: getWorkerEnv(),
  });
  activeWorkerCancelRequested = false;
  const worker = activeWorker;
  const releaseWorker = () => {
    if (activeWorker === worker) {
      activeWorker = null;
      activeWorkerCancelRequested = false;
    }
  };

  let stderr = "";
  worker.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  worker.stdout.setEncoding("utf8");
  let buffer = "";
  let workerReportedError = false;
  worker.stdout.on("data", (chunk) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const message = JSON.parse(line);
        if (message.type === "progress") {
          event.sender.send("transcribe:progress", message.payload);
        } else if (message.type === "done") {
          workerReportedError = false;
          releaseWorker();
          event.sender.send("transcribe:done", message.payload);
        } else if (message.type === "error") {
          workerReportedError = true;
          releaseWorker();
          event.sender.send("transcribe:error", message.payload);
        }
      } catch (_error) {
        event.sender.send("transcribe:error", {
          message: `Unable to parse Python output: ${line}`,
        });
      }
    }
  });

  worker.on("error", (error) => {
    workerReportedError = true;
    event.sender.send("transcribe:error", {
      message: `Unable to start Python worker: ${error.message}`,
    });
    releaseWorker();
  });

  worker.on("close", (code) => {
    if (activeWorker === worker && activeWorkerCancelRequested) {
      event.sender.send("transcribe:canceled", { message: "\u4efb\u52a1\u5df2\u53d6\u6d88\u3002" });
    } else if (activeWorker === worker && code !== 0 && !workerReportedError) {
      event.sender.send("transcribe:error", {
        message: stderr.trim() || `Python worker exited with code ${code}`,
      });
    }
    releaseWorker();
  });

  worker.stdin.write(Buffer.from(JSON.stringify(request), "utf8"));
  worker.stdin.end();

  return { started: true };
});

ipcMain.handle("transcribe:cancel", async (event) => {
  if (!activeWorker) {
    return { canceled: false };
  }
  activeWorkerCancelRequested = true;
  const worker = activeWorker;
  try {
    worker.kill();
  } catch (_error) {
    event.sender.send("transcribe:canceled", { message: "\u4efb\u52a1\u5df2\u53d6\u6d88\u3002" });
    activeWorker = null;
    activeWorkerCancelRequested = false;
  }
  return { canceled: true };
});

ipcMain.handle("translate:start", async (event, payload) => {
  if (!payload || !payload.taskId || !Array.isArray(payload.segments)) {
    throw new Error("Invalid translation task.");
  }
  if (activeTranslationWorkers.has(payload.taskId)) {
    throw new Error("Translation task is already running.");
  }

  await ensurePythonDependencies();

  const savedSettings = readSettings();
  const aiTranslationConfig = {
    ...savedSettings.aiTranslation,
    ...(payload.aiTranslationConfig || {}),
  };
  const { executable, args } = getPythonCommand();
  const request = {
    mode: "translate",
    taskId: payload.taskId,
    detectedLanguage: payload.detectedLanguage || "ja",
    computeDevice: payload.computeDevice,
    segments: payload.segments,
    aiTranslationConfig,
  };

  const worker = spawn(executable, args, {
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
    env: getWorkerEnv(),
  });
  activeTranslationWorkers.set(payload.taskId, worker);

  const releaseWorker = () => {
    if (activeTranslationWorkers.get(payload.taskId) === worker) {
      activeTranslationWorkers.delete(payload.taskId);
    }
  };

  let stderr = "";
  worker.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  worker.stdout.setEncoding("utf8");
  let buffer = "";
  let workerReportedError = false;
  worker.stdout.on("data", (chunk) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const message = JSON.parse(line);
        if (message.type === "progress") {
          event.sender.send("translate:progress", { taskId: payload.taskId, progress: message.payload });
        } else if (message.type === "done") {
          workerReportedError = false;
          releaseWorker();
          event.sender.send("translate:done", { taskId: payload.taskId, result: message.payload });
        } else if (message.type === "error") {
          workerReportedError = true;
          releaseWorker();
          event.sender.send("translate:error", { taskId: payload.taskId, error: message.payload });
        }
      } catch (_error) {
        event.sender.send("translate:error", {
          taskId: payload.taskId,
          error: { message: `Unable to parse Python output: ${line}` },
        });
      }
    }
  });

  worker.on("error", (error) => {
    workerReportedError = true;
    event.sender.send("translate:error", {
      taskId: payload.taskId,
      error: { message: `Unable to start Python translation worker: ${error.message}` },
    });
    releaseWorker();
  });

  worker.on("close", (code) => {
    if (activeTranslationWorkers.get(payload.taskId) === worker && code !== 0 && !workerReportedError) {
      event.sender.send("translate:error", {
        taskId: payload.taskId,
        error: { message: stderr.trim() || `Python translation worker exited with code ${code}` },
      });
    }
    releaseWorker();
  });

  worker.stdin.write(Buffer.from(JSON.stringify(request), "utf8"));
  worker.stdin.end();

  return { started: true };
});

ipcMain.handle("translate:cancel", async (_event, taskId) => {
  const worker = activeTranslationWorkers.get(taskId);
  if (!worker) {
    return { canceled: false };
  }
  activeTranslationWorkers.delete(taskId);
  try {
    worker.kill();
  } catch (_error) {
    // Nothing else to do.
  }
  return { canceled: true };
});

ipcMain.handle("tts:start", async (event, payload) => {
  if (!payload || !payload.taskId || !payload.mediaPath || !Array.isArray(payload.segments)) {
    throw new Error("Invalid TTS task.");
  }
  if (activeWorker) {
    throw new Error("A transcription task is running. Wait for it to finish before generating speech.");
  }
  if (activeTtsWorker) {
    throw new Error("A speech generation task is already running.");
  }

  const translatedSegments = payload.segments.filter((segment) => typeof segment.translatedText === "string" && segment.translatedText.trim());
  if (!translatedSegments.length) {
    throw new Error("There is no edited Chinese translation to synthesize.");
  }

  await ensureTtsDependencies(event, payload.taskId);

  const defaultFileName = safeExportFileName(payload.defaultFileName || "chinese-voice.wav");
  const result = await dialog.showSaveDialog(mainWindow, {
    title: "Save Chinese voice WAV",
    defaultPath: path.join(payload.defaultDirectory || app.getPath("documents"), defaultFileName),
    filters: [{ name: "WAV Audio", extensions: ["wav"] }],
  });
  if (result.canceled || !result.filePath) {
    return { started: false };
  }

  const modelsDir = getModelsDir();
  fs.mkdirSync(modelsDir, { recursive: true });
  const savedSettings = readSettings();
  const tts = {
    ...savedSettings.tts,
    ...(payload.tts || {}),
  };
  const { executable, args } = getPythonCommand();
  const request = {
    mode: "tts",
    taskId: payload.taskId,
    mediaPath: payload.mediaPath,
    outputPath: result.filePath,
    segments: payload.segments,
    tts,
    modelsDir,
  };

  activeTtsWorker = spawn(executable, args, {
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
    env: getWorkerEnv(),
  });
  activeTtsWorkerCancelRequested = false;
  const worker = activeTtsWorker;
  const releaseWorker = () => {
    if (activeTtsWorker === worker) {
      activeTtsWorker = null;
      activeTtsWorkerCancelRequested = false;
    }
  };

  let stderr = "";
  worker.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  worker.stdout.setEncoding("utf8");
  let buffer = "";
  let workerReportedError = false;
  worker.stdout.on("data", (chunk) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const message = JSON.parse(line);
        if (message.type === "progress") {
          event.sender.send("tts:progress", { taskId: payload.taskId, progress: message.payload });
        } else if (message.type === "done") {
          workerReportedError = false;
          releaseWorker();
          event.sender.send("tts:done", { taskId: payload.taskId, result: message.payload });
        } else if (message.type === "error") {
          workerReportedError = true;
          releaseWorker();
          event.sender.send("tts:error", { taskId: payload.taskId, error: message.payload });
        }
      } catch (_error) {
        event.sender.send("tts:error", {
          taskId: payload.taskId,
          error: { message: `Unable to parse Python TTS output: ${line}` },
        });
      }
    }
  });

  worker.on("error", (error) => {
    workerReportedError = true;
    event.sender.send("tts:error", {
      taskId: payload.taskId,
      error: { message: `Unable to start Python TTS worker: ${error.message}` },
    });
    releaseWorker();
  });

  worker.on("close", (code) => {
    if (activeTtsWorker === worker && activeTtsWorkerCancelRequested) {
      event.sender.send("tts:canceled", { taskId: payload.taskId, message: "\u4e2d\u6587\u8bed\u97f3\u751f\u6210\u5df2\u53d6\u6d88\u3002" });
    } else if (activeTtsWorker === worker && code !== 0 && !workerReportedError) {
      event.sender.send("tts:error", {
        taskId: payload.taskId,
        error: { message: stderr.trim() || `Python TTS worker exited with code ${code}` },
      });
    }
    releaseWorker();
  });

  worker.stdin.write(Buffer.from(JSON.stringify(request), "utf8"));
  worker.stdin.end();

  return { started: true, path: result.filePath };
});

ipcMain.handle("tts:cancel", async (_event) => {
  if (!activeTtsWorker) {
    return { canceled: false };
  }
  activeTtsWorkerCancelRequested = true;
  try {
    activeTtsWorker.kill();
  } catch (_error) {
    activeTtsWorker = null;
    activeTtsWorkerCancelRequested = false;
  }
  return { canceled: true };
});

ipcMain.handle("export:txt", async (_event, payload) => {
  if (!payload || typeof payload.content !== "string" || !payload.content.trim()) {
    throw new Error("There is no transcription result to save.");
  }

  const extension = (path.extname(payload.defaultFileName || "").slice(1).toLowerCase() || "txt").replace(/[^a-z0-9]/g, "");
  const safeExtension = extension || "txt";
  const filterName = safeExtension.toUpperCase();
  const result = await dialog.showSaveDialog(mainWindow, {
    title: "Save transcription result",
    defaultPath:
      payload.defaultDirectory && payload.defaultFileName
        ? path.join(payload.defaultDirectory, payload.defaultFileName)
        : payload.defaultFileName || "transcription.txt",
    filters: [{ name: filterName, extensions: [safeExtension] }],
  });

  if (result.canceled || !result.filePath) {
    return { saved: false };
  }

  fs.writeFileSync(result.filePath, payload.content, "utf8");
  return { saved: true, path: result.filePath };
});

ipcMain.handle("export:batch", async (_event, payload) => {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const exportableItems = items.filter((item) => typeof item.content === "string" && item.content.trim());
  if (!exportableItems.length) {
    throw new Error("There is no completed transcription result to export.");
  }

  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Select export directory",
    properties: ["openDirectory", "createDirectory"],
  });

  if (result.canceled || !result.filePaths[0]) {
    return { saved: false };
  }

  const directory = result.filePaths[0];
  fs.mkdirSync(directory, { recursive: true });
  const usedNames = new Set();
  for (const item of exportableItems) {
    const parsed = path.parse(safeExportFileName(item.fileName));
    const extension = parsed.ext || ".txt";
    let candidate = `${parsed.name || "transcription"}${extension}`;
    let index = 2;
    while (usedNames.has(candidate.toLowerCase()) || fs.existsSync(path.join(directory, candidate))) {
      candidate = `${parsed.name || "transcription"}-${index}${extension}`;
      index += 1;
    }
    usedNames.add(candidate.toLowerCase());
    fs.writeFileSync(path.join(directory, candidate), item.content, "utf8");
  }

  return { saved: true, directory, count: exportableItems.length };
});
