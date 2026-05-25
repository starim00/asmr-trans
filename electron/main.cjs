const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { spawn, spawnSync } = require("node:child_process");

const MEDIA_EXTENSIONS = ["mp3", "wav", "m4a", "flac", "ogg", "aac", "mp4", "mkv", "mov", "webm", "avi", "wmv"];
let mainWindow = null;
let activeWorker = null;
let activeWorkerCancelRequested = false;
let dependencyInstallPromise = null;

const DEFAULT_AI_SYSTEM_PROMPT =
  "你是专业的日译中翻译。请把日语 ASMR/口语转写翻译成自然、准确的简体中文。忠实保留原意、语气、称呼和暧昧表达；不要解释，不要总结，不要添加原文没有的信息。";
const DEFAULT_AI_USER_PROMPT_TEMPLATE =
  "请翻译下面 JSON 数组中的 items。每项包含 id、start、end、text、contextBefore、contextAfter。context 字段只用于理解上下文，只翻译 text。只返回 JSON 数组，数组每项必须是 {\"id\": 数字, \"translation\": \"中文译文\"}，不要返回 Markdown。";

const DEFAULT_SETTINGS = {
  whisperModel: "small",
  computeDevice: "auto",
  translationBackend: "auto",
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
  },
};

function getModelsDir() {
  return path.join(app.getPath("userData"), "models");
}

function getSettingsPath() {
  return path.join(app.getPath("userData"), "settings.json");
}

function mergeSettings(settings = {}) {
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    aiTranslation: {
      ...DEFAULT_SETTINGS.aiTranslation,
      ...(settings.aiTranslation || {}),
    },
  };
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

function getWorkerEnv() {
  const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || "http://127.0.0.1:7890";
  return {
    ...process.env,
    HTTP_PROXY: process.env.HTTP_PROXY || proxy,
    HTTPS_PROXY: process.env.HTTPS_PROXY || proxy,
    HF_HUB_ENABLE_HF_TRANSFER: process.env.HF_HUB_ENABLE_HF_TRANSFER || "0",
    HF_HUB_DISABLE_SYMLINKS_WARNING: process.env.HF_HUB_DISABLE_SYMLINKS_WARNING || "1",
    HF_HUB_ETAG_TIMEOUT: process.env.HF_HUB_ETAG_TIMEOUT || "30",
    HF_HUB_DOWNLOAD_TIMEOUT: process.env.HF_HUB_DOWNLOAD_TIMEOUT || "120",
    PYTHONIOENCODING: "utf-8",
    PYTHONUTF8: "1",
  };
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

function checkPythonDependencies() {
  const { executable, args } = getPythonCommand(["--check-deps"]);
  return spawnSync(executable, args, {
    encoding: "utf8",
    windowsHide: true,
    env: getWorkerEnv(),
  });
}

function ensurePythonDependencies() {
  if (!app.isPackaged) {
    return Promise.resolve();
  }
  if (dependencyInstallPromise) {
    return dependencyInstallPromise;
  }

  dependencyInstallPromise = new Promise((resolve, reject) => {
    sendDependencyProgress("正在检查内置 Python 依赖...", 2);
    const checkResult = checkPythonDependencies();
    if (checkResult.status === 0) {
      sendDependencyProgress("Python 依赖已就绪。", 100);
      resolve();
      return;
    }

    const packagedPython = getPackagedPythonExecutable();
    if (!packagedPython) {
      reject(new Error("安装版未找到内置 Python 运行时。"));
      return;
    }

    const requirementsPath = getRequirementsPath();
    if (!fs.existsSync(requirementsPath)) {
      reject(new Error(`未找到 Python 依赖文件：${requirementsPath}`));
      return;
    }

    sendDependencyProgress("首次启动正在安装 Python 依赖，可能需要较长时间...", 5);
    const installer = spawn(
      packagedPython,
      ["-m", "pip", "install", "-r", requirementsPath],
      {
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
        env: getWorkerEnv(),
      },
    );

    let output = "";
    installer.stdout.setEncoding("utf8");
    installer.stderr.setEncoding("utf8");
    const onData = (chunk) => {
      output += chunk;
      const lastLine = output.split(/\r?\n/).filter(Boolean).pop();
      if (lastLine) {
        sendDependencyProgress(`正在安装 Python 依赖：${lastLine.slice(0, 160)}`, 20);
      }
    };
    installer.stdout.on("data", onData);
    installer.stderr.on("data", onData);
    installer.on("error", (error) => reject(error));
    installer.on("close", (code) => {
      if (code === 0) {
        sendDependencyProgress("Python 依赖安装完成。", 100);
        resolve();
        return;
      }
      reject(new Error(`Python 依赖安装失败，退出码 ${code}。${output.slice(-1000)}`));
    });
  }).finally(() => {
    dependencyInstallPromise = null;
  });

  return dependencyInstallPromise;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1120,
    height: 780,
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

  const devServer = process.env.VITE_DEV_SERVER_URL;
  if (devServer) {
    mainWindow.loadURL(devServer);
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  mainWindow.webContents.once("did-finish-load", () => {
    ensurePythonDependencies().catch((error) => {
      sendDependencyProgress(`Python 依赖安装失败：${error.message}`, 0);
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
    translationDownloaded: hasModelFiles(path.join(modelsDir, "nllb")),
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
      torchInstalled: false,
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
      torchInstalled: false,
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
    translationModel: payload.translationModel || "nllb-200-distilled-600M",
    translationBackend: payload.translationBackend || savedSettings.translationBackend || "auto",
    aiTranslationConfig,
    computeDevice: payload.computeDevice || savedSettings.computeDevice || "auto",
    outputLanguage: "zh",
    modelsDir,
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
      event.sender.send("transcribe:canceled", { message: "任务已取消。" });
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

ipcMain.handle("export:txt", async (_event, payload) => {
  if (!payload || typeof payload.content !== "string" || !payload.content.trim()) {
    throw new Error("There is no transcription result to save.");
  }

  const result = await dialog.showSaveDialog(mainWindow, {
    title: "Save transcription result",
    defaultPath:
      payload.defaultDirectory && payload.defaultFileName
        ? path.join(payload.defaultDirectory, payload.defaultFileName)
        : payload.defaultFileName || "transcription.txt",
    filters: [{ name: "Text", extensions: ["txt"] }],
  });

  if (result.canceled || !result.filePath) {
    return { saved: false };
  }

  fs.writeFileSync(result.filePath, payload.content, "utf8");
  return { saved: true, path: result.filePath };
});
