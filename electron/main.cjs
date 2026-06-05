const { app, BrowserWindow, dialog, ipcMain, screen } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { spawn, spawnSync } = require("node:child_process");
const {
  readHistory: readHistoryFile,
  upsertHistoryTask: upsertHistoryFileTask,
  deleteHistoryTask: deleteHistoryFileTask,
} = require("./history-store.cjs");
const {
  DEFAULT_WINDOW_STATE,
  readSettings: readSettingsFile,
  writeSettings: writeSettingsFile,
} = require("./settings-store.cjs");
const {
  getExportableItems,
  getUniqueExportFileName,
  safeExportFileName,
} = require("./export-store.cjs");

if (process.env.ASMR_TRANS_USER_DATA_DIR) {
  app.setPath("userData", process.env.ASMR_TRANS_USER_DATA_DIR);
}

const MEDIA_EXTENSIONS = ["mp3", "wav", "m4a", "flac", "ogg", "aac", "mp4", "mkv", "mov", "webm", "avi", "wmv"];
let mainWindow = null;
let activeWorker = null;
let activeWorkerCancelRequested = false;
let activeTtsWorker = null;
let activeTtsWorkerCancelRequested = false;
const activeTranslationWorkers = new Map();
let dependencyInstallPromise = null;
let ttsDependencyInstallPromise = null;
let cudaDependencyInstallPromise = null;
let windowStateSaveTimer = null;
let failNextHistoryUpsertForSmoke = false;
let smokeTranscriptionRunning = false;
const smokeTranscriptionStartsByPath = new Map();
const CUDA_RUNTIME_PACKAGES = [
  "nvidia-cuda-runtime-cu12",
  "nvidia-cublas-cu12",
  "nvidia-cudnn-cu12",
];

function getModelsDir() {
  return path.join(app.getPath("userData"), "models");
}

function getSettingsPath() {
  return path.join(app.getPath("userData"), "settings.json");
}

function getHistoryPath() {
  return path.join(app.getPath("userData"), "history.json");
}

function getSmokeExportDir() {
  return path.join(app.getPath("userData"), "smoke-exports");
}

function getSmokeSelectedMediaPath() {
  const mediaPath = path.join(app.getPath("userData"), "smoke-selected.wav");
  if (!fs.existsSync(mediaPath)) {
    const sampleRate = 16000;
    const samples = Math.floor(sampleRate * 1);
    const dataSize = samples * 2;
    const buffer = Buffer.alloc(44 + dataSize);
    buffer.write("RIFF", 0);
    buffer.writeUInt32LE(36 + dataSize, 4);
    buffer.write("WAVE", 8);
    buffer.write("fmt ", 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(1, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * 2, 28);
    buffer.writeUInt16LE(2, 32);
    buffer.writeUInt16LE(16, 34);
    buffer.write("data", 36);
    buffer.writeUInt32LE(dataSize, 40);
    for (let index = 0; index < samples; index += 1) {
      const t = index / sampleRate;
      const envelope = Math.min(index / 800, (samples - index) / 800, 1);
      const value = Math.round(Math.sin(2 * Math.PI * 440 * t) * 2000 * Math.max(envelope, 0));
      buffer.writeInt16LE(value, 44 + index * 2);
    }
    fs.mkdirSync(path.dirname(mediaPath), { recursive: true });
    fs.writeFileSync(mediaPath, buffer);
  }
  return mediaPath;
}

function readSettings() {
  return readSettingsFile(getSettingsPath());
}

function writeSettings(settings) {
  return writeSettingsFile(getSettingsPath(), settings);
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
  return readHistoryFile(getHistoryPath());
}

function upsertHistoryTask(task) {
  return upsertHistoryFileTask(getHistoryPath(), task);
}

function deleteHistoryTask(id) {
  return deleteHistoryFileTask(getHistoryPath(), id);
}

function getSmokeUiHistoryTask() {
  return {
    id: "smoke-ui-history",
    file: { name: "smoke-ui-history.wav", path: "E:\\smoke\\smoke-ui-history.wav", extension: "wav", size: 1234 },
    result: {
      detectedLanguage: "zh",
      segments: [{ start: 0, end: 1, sourceText: "smoke ui history" }],
    },
    addedAt: new Date(0).toISOString(),
    completedAt: new Date(1000).toISOString(),
  };
}

function getSmokeUiEditTask() {
  return {
    id: "smoke-ui-edit-history",
    file: { name: "smoke-ui-edit.wav", path: "E:\\smoke\\smoke-ui-edit.wav", extension: "wav", size: 1234 },
    result: {
      detectedLanguage: "zh",
      segments: [{ start: 0, end: 1, sourceText: "smoke edit original" }],
    },
    addedAt: new Date(2000).toISOString(),
    completedAt: new Date(3000).toISOString(),
  };
}

function getSmokeRendererTasks() {
  if (
    process.env.ASMR_TRANS_SMOKE_TEST !== "1" ||
    process.env.ASMR_TRANS_SMOKE_PHASE === "restart"
  ) {
    return [];
  }
  return [
    {
      id: "smoke-requeue-failed",
      file: { name: "smoke-requeue-failed.wav", path: "E:\\smoke\\smoke-requeue-failed.wav", extension: "wav", size: 1234 },
      status: "failed",
      progress: null,
      result: null,
      error: "smoke failed task",
      addedAt: new Date(4000).toISOString(),
    },
    {
      id: "smoke-translation-retry",
      file: { name: "smoke-translation-retry.wav", path: "E:\\smoke\\smoke-translation-retry.wav", extension: "wav", size: 1234 },
      status: "failed",
      progress: null,
      result: {
        detectedLanguage: "ja",
        segments: [{ start: 0, end: 1, sourceText: "テスト" }],
      },
      error: "smoke translation failed",
      addedAt: new Date(5000).toISOString(),
    },
  ];
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
    return path.join(process.resourcesPath, "python", "requirements.txt");
  }
  return path.join(__dirname, "..", "python", "requirements.txt");
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

function getPythonRuntimeCommand(extraArgs = []) {
  const packagedPython = getPackagedPythonExecutable();
  const executable = process.env.ASMR_TRANS_PYTHON || packagedPython || (process.platform === "win32" ? "py" : "python3");
  const args = process.platform === "win32" && !process.env.ASMR_TRANS_PYTHON && !packagedPython ? ["-3", ...extraArgs] : extraArgs;
  return { executable, args };
}

function getPythonCommand(extraArgs = []) {
  return getPythonRuntimeCommand([getWorkerPath(), ...extraArgs]);
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

function getCudaWheelDllDirectories(env = process.env) {
  const script = [
    "import importlib.util, json, site, sys",
    "from pathlib import Path",
    "roots = []",
    "for name in ('nvidia.cublas', 'nvidia.cudnn', 'nvidia.cuda_runtime'):",
    "    spec = importlib.util.find_spec(name)",
    "    if spec and spec.submodule_search_locations:",
    "        roots.extend(str(Path(item)) for item in spec.submodule_search_locations)",
    "for getter in (getattr(site, 'getsitepackages', lambda: []),):",
    "    try:",
    "        roots.extend(str(Path(item) / 'nvidia') for item in getter())",
    "    except Exception:",
    "        pass",
    "try:",
    "    roots.append(str(Path(site.getusersitepackages()) / 'nvidia'))",
    "except Exception:",
    "    pass",
    "dirs = []",
    "for root in roots:",
    "    path = Path(root)",
    "    if not path.exists():",
    "        continue",
    "    for candidate in [path, path / 'bin', path / 'lib']:",
    "        if candidate.exists() and any(candidate.glob('*.dll')):",
    "            dirs.append(str(candidate))",
    "    for candidate in list(path.rglob('bin')) + list(path.rglob('lib')):",
    "        if candidate.exists() and any(candidate.glob('*.dll')):",
    "            dirs.append(str(candidate))",
    "print(json.dumps(sorted(set(dirs))))",
  ].join("\n");
  const command = getPythonRuntimeCommand(["-c", script]);
  const result = spawnSync(command.executable, command.args, {
    encoding: "utf8",
    windowsHide: true,
    env,
  });
  if (result.status !== 0 || result.error) {
    return [];
  }
  try {
    return JSON.parse(result.stdout.trim()).filter((item) => typeof item === "string" && item);
  } catch (_error) {
    return [];
  }
}

function appendPathEntries(env, entries) {
  const validEntries = [...new Set((entries || []).filter((entry) => entry && fs.existsSync(entry)))];
  if (!validEntries.length) {
    return env;
  }
  const currentPath = env.PATH || env.Path || "";
  const nextPath = `${currentPath}${currentPath ? path.delimiter : ""}${validEntries.join(path.delimiter)}`;
  return {
    ...env,
    PATH: nextPath,
    Path: nextPath,
  };
}

function getWorkerEnv(options = {}) {
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
  if (options.includeCudaWheelPaths !== false) {
    const cudaDllDirectories = getCudaWheelDllDirectories(env);
    return appendPathEntries(env, cudaDllDirectories);
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

function getPipPackageInstallAttempts(packages, extraArgs = []) {
  const commonArgs = ["-m", "pip", "install", "--disable-pip-version-check", ...extraArgs, ...packages];
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
        ...packages,
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
        ...packages,
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
        ...packages,
      ],
    },
  );
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

function runGenericPipInstallAttempt(attempt, attemptIndex, attemptCount, progress, noun) {
  const command = getPipCommandForAttempt(attempt);
  return runPipInstallAttempt(command.executable, { ...attempt, args: command.args }, attemptIndex, attemptCount, progress, noun);
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
  return runGenericPipInstallAttempt(attempt, attemptIndex, attemptCount, progress, "VoxCPM2 dependencies");
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

function ensureCudaDependencies(event) {
  if (cudaDependencyInstallPromise) {
    return cudaDependencyInstallPromise;
  }

  const progress = (message, percent = 0) => {
    event.sender.send("deps:progress", {
      stage: "cuda-dependencies",
      message,
      percent,
    });
  };

  cudaDependencyInstallPromise = (async () => {
    progress("Checking CUDA runtime dependencies...", 2);
    const attempts = getPipPackageInstallAttempts(CUDA_RUNTIME_PACKAGES, [
      "--extra-index-url",
      "https://pypi.nvidia.com",
      "--trusted-host",
      "pypi.nvidia.com",
    ]);
    let lastOutput = "";
    let installed = false;
    for (let index = 0; index < attempts.length; index += 1) {
      try {
        await runGenericPipInstallAttempt(attempts[index], index, attempts.length, progress, "CUDA runtime dependencies");
        installed = true;
        break;
      } catch (error) {
        lastOutput = error.output || error.message || "";
        if (index < attempts.length - 1) {
          progress(`CUDA dependency source failed, switching to: ${attempts[index + 1].label}`, 12);
        }
      }
    }
    if (!installed) {
      throw new Error(`CUDA dependency installation failed after trying PyPI and mirrors. ${lastOutput.slice(-1000)}`);
    }
    progress("CUDA runtime dependencies installed.", 88);
    const status = getHardwareStatusWithCudaPriority();
    if (!status.ctranslate2CudaSmokeOk) {
      throw new Error(status.error || "CUDA dependencies installed, but CTranslate2 CUDA smoke check still failed.");
    }
    progress("CUDA runtime is ready.", 100);
    return status;
  })().finally(() => {
    cudaDependencyInstallPromise = null;
  });

  return cudaDependencyInstallPromise;
}

function createWindow() {
  const isSmokeTest = process.env.ASMR_TRANS_SMOKE_TEST === "1";
  const smokePhase = process.env.ASMR_TRANS_SMOKE_PHASE || "full";
  const windowState = getValidatedWindowState();
  mainWindow = new BrowserWindow({
    width: windowState.width,
    height: windowState.height,
    minWidth: 920,
    minHeight: 660,
    title: "ASMR Trans",
    show: !isSmokeTest,
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

  if (isSmokeTest && smokePhase !== "restart") {
    const smokeSettings = readSettings();
    writeSettings({
      ...smokeSettings,
      aiTranslation: {
        ...(smokeSettings.aiTranslation || {}),
        apiKey: "smoke-api-key",
      },
    });
    upsertHistoryTask(getSmokeUiHistoryTask());
    upsertHistoryTask(getSmokeUiEditTask());
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
    if (isSmokeTest) {
      runSmokeTest().catch((error) => {
        console.error(error);
        app.exit(1);
      });
      return;
    }
    ensurePythonDependencies().catch((error) => {
      sendDependencyProgress(`Python 依赖安装失败：${error.message}`, 0);
    });
  });
}

function waitForSmokeCondition(predicate, label, timeoutMs = 5000) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      try {
        if (predicate()) {
          resolve();
          return;
        }
      } catch (error) {
        reject(error);
        return;
      }
      if (Date.now() - startedAt > timeoutMs) {
        reject(new Error(`Smoke test failed: timed out waiting for ${label}.`));
        return;
      }
      setTimeout(check, 50);
    };
    check();
  });
}

async function runSmokeTest() {
  if (process.env.ASMR_TRANS_SMOKE_PHASE === "restart") {
    await runSmokeRestartTest();
    return;
  }

  const settings = readSettings();
  writeSettings({
    ...settings,
    exportOptions: { txtMode: "source", srtMode: "translation" },
  });
  const savedSettings = readSettings();
  if (savedSettings.exportOptions.txtMode !== "source" || savedSettings.exportOptions.srtMode !== "translation") {
    throw new Error("Smoke test failed: settings exportOptions did not persist.");
  }

  const historyTask = {
    id: "smoke-history",
    file: { name: "smoke.wav", path: "E:\\smoke\\smoke.wav", extension: "wav" },
    result: {
      detectedLanguage: "zh",
      segments: [{ start: 0, end: 1, sourceText: "smoke" }],
    },
    addedAt: new Date(0).toISOString(),
    completedAt: new Date(1000).toISOString(),
  };
  upsertHistoryTask(historyTask);
  if (!readHistory().some((item) => item.id === historyTask.id)) {
    throw new Error("Smoke test failed: history upsert did not persist.");
  }
  deleteHistoryTask(historyTask.id);
  if (readHistory().some((item) => item.id === historyTask.id)) {
    throw new Error("Smoke test failed: history delete did not persist.");
  }

  const preloadReady = await mainWindow.webContents.executeJavaScript(
    "Boolean(window.asmrTrans && window.asmrTrans.getSettings && window.asmrTrans.getHistory && window.asmrTrans.deleteHistory && window.asmrTrans.installCudaDependencies)",
  );
  if (!preloadReady) {
    throw new Error("Smoke test failed: preload API is not available.");
  }

  const uiHistoryTask = getSmokeUiHistoryTask();
  const uiHistoryVisible = await mainWindow.webContents.executeJavaScript(`
    new Promise((resolve) => {
      const deadline = Date.now() + 5000;
      const tick = () => {
        const item = Array.from(document.querySelectorAll(".taskItem")).find((node) =>
          node.textContent && node.textContent.includes("smoke-ui-history.wav")
        );
        if (item) {
          resolve(true);
          return;
        }
        if (Date.now() > deadline) {
          resolve(false);
          return;
        }
        setTimeout(tick, 50);
      };
      tick();
    })
  `);
  if (!uiHistoryVisible) {
    throw new Error("Smoke test failed: seeded history task did not hydrate into the UI.");
  }

  const uiDeleteClicked = await mainWindow.webContents.executeJavaScript(`
    (() => {
      const item = Array.from(document.querySelectorAll(".taskItem")).find((node) =>
        node.textContent && node.textContent.includes("smoke-ui-history.wav")
      );
      const button = item ? item.querySelector(".taskRemoveButton") : null;
      if (!button) {
        return false;
      }
      button.click();
      return true;
    })()
  `);
  if (!uiDeleteClicked) {
    throw new Error("Smoke test failed: could not click the UI history delete button.");
  }
  await waitForSmokeCondition(
    () => !readHistory().some((item) => item.id === uiHistoryTask.id),
    "UI history delete persistence",
  );

  const uiHistoryRemoved = await mainWindow.webContents.executeJavaScript(`
    new Promise((resolve) => {
      const deadline = Date.now() + 5000;
      const tick = () => {
        const item = Array.from(document.querySelectorAll(".taskItem")).find((node) =>
          node.textContent && node.textContent.includes("smoke-ui-history.wav")
        );
        if (!item) {
          resolve(true);
          return;
        }
        if (Date.now() > deadline) {
          resolve(false);
          return;
        }
        setTimeout(tick, 50);
      };
      tick();
    })
  `);
  if (!uiHistoryRemoved) {
    throw new Error("Smoke test failed: UI history task remained visible after delete.");
  }

  const uiEditTask = getSmokeUiEditTask();
  const editedSourceText = "smoke edit saved";
  const uiEditApplied = await mainWindow.webContents.executeJavaScript(`
    new Promise((resolve) => {
      const deadline = Date.now() + 5000;
      const setTextareaValue = (textarea, value) => {
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
        setter.call(textarea, value);
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
      };
      const tick = () => {
        const item = Array.from(document.querySelectorAll(".taskItem")).find((node) =>
          node.textContent && node.textContent.includes("smoke-ui-edit.wav")
        );
        if (item) {
          item.click();
          const textarea = document.querySelector(".segmentField textarea");
          if (textarea) {
            setTextareaValue(textarea, ${JSON.stringify(editedSourceText)});
            resolve(true);
            return;
          }
        }
        if (Date.now() > deadline) {
          resolve(false);
          return;
        }
        setTimeout(tick, 50);
      };
      tick();
    })
  `);
  if (!uiEditApplied) {
    throw new Error("Smoke test failed: could not edit the hydrated history task in the UI.");
  }
  await waitForSmokeCondition(
    () =>
      readHistory().some(
        (item) => item.id === uiEditTask.id && item.result?.segments?.[0]?.sourceText === editedSourceText,
      ),
    "UI edit auto-save persistence",
  );
  const editSaveFeedbackVisible = await mainWindow.webContents.executeJavaScript(`
    new Promise((resolve) => {
      const deadline = Date.now() + 5000;
      const tick = () => {
        const saved = document.querySelector(".editSaveStatus.saved");
        if (saved && saved.textContent && saved.textContent.includes("已自动保存")) {
          resolve(true);
          return;
        }
        if (Date.now() > deadline) {
          resolve(false);
          return;
        }
        setTimeout(tick, 50);
      };
      tick();
    })
  `);
  if (!editSaveFeedbackVisible) {
    throw new Error("Smoke test failed: UI edit save feedback did not appear.");
  }

  const failedSourceText = "smoke edit failure";
  const editFailureFeedbackVisible = await mainWindow.webContents.executeJavaScript(`
    new Promise((resolve) => {
      const api = window.asmrTrans;
      if (!api || !api.failNextHistoryUpsertForSmoke || !api.failNextHistoryUpsertForSmoke()) {
        resolve(false);
        return;
      }
      const deadline = Date.now() + 5000;
      const setTextareaValue = (textarea, value) => {
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
        setter.call(textarea, value);
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
      };
      const tick = () => {
        const textarea = document.querySelector(".segmentField textarea");
        if (textarea) {
          setTextareaValue(textarea, "smoke edit failure");
          waitForFailure();
          return;
        }
        if (Date.now() > deadline) {
          resolve(false);
          return;
        }
        setTimeout(tick, 50);
      };
      const waitForFailure = () => {
        const failed = document.querySelector(".editSaveStatus.failed");
        if (failed && failed.textContent && failed.textContent.includes("保存失败")) {
          resolve(true);
          return;
        }
        if (Date.now() > deadline) {
          resolve(false);
          return;
        }
        setTimeout(waitForFailure, 50);
      };
      tick();
    })
  `);
  if (!editFailureFeedbackVisible) {
    throw new Error("Smoke test failed: UI edit save failure feedback did not appear.");
  }

  const requeueApplied = await mainWindow.webContents.executeJavaScript(`
    new Promise((resolve) => {
      const deadline = Date.now() + 5000;
      const dumpTasks = () => Array.from(document.querySelectorAll(".taskItem")).map((node) => node.textContent || "");
      const tick = () => {
        const item = Array.from(document.querySelectorAll(".taskItem")).find((node) =>
          node.textContent && node.textContent.includes("smoke-requeue-failed.wav")
        );
        const button = item ? item.querySelector(".taskInlineActions button") : null;
        if (button) {
          button.click();
          resolve({ ok: true, tasks: dumpTasks() });
          return;
        }
        if (Date.now() > deadline) {
          resolve({ ok: false, tasks: dumpTasks() });
          return;
        }
        setTimeout(tick, 50);
      };
      tick();
    })
  `);
  if (!requeueApplied.ok) {
    throw new Error(`Smoke test failed: could not click the requeue button. Tasks: ${JSON.stringify(requeueApplied.tasks)}`);
  }
  const requeueStateVisible = await mainWindow.webContents.executeJavaScript(`
    new Promise((resolve) => {
      const deadline = Date.now() + 5000;
      const tick = () => {
        const item = Array.from(document.querySelectorAll(".taskItem")).find((node) =>
          node.textContent && node.textContent.includes("smoke-requeue-failed.wav")
        );
        if (item && item.querySelector(".taskStatus.queued")) {
          resolve(true);
          return;
        }
        if (Date.now() > deadline) {
          resolve(false);
          return;
        }
        setTimeout(tick, 50);
      };
      tick();
    })
  `);
  if (!requeueStateVisible) {
    throw new Error("Smoke test failed: requeued task did not return to queued state.");
  }

  const retryTranslationApplied = await mainWindow.webContents.executeJavaScript(`
    new Promise((resolve) => {
      const deadline = Date.now() + 5000;
      const tick = () => {
        const item = Array.from(document.querySelectorAll(".taskItem")).find((node) =>
          node.textContent && node.textContent.includes("smoke-translation-retry.wav")
        );
        const buttons = item ? Array.from(item.querySelectorAll(".taskInlineActions button")) : [];
        const button = buttons[1] || null;
        if (button) {
          button.click();
          resolve(true);
          return;
        }
        if (Date.now() > deadline) {
          resolve(false);
          return;
        }
        setTimeout(tick, 50);
      };
      tick();
    })
  `);
  if (!retryTranslationApplied) {
    throw new Error("Smoke test failed: could not click the translation retry button.");
  }
  const retryTranslationStateVisible = await mainWindow.webContents.executeJavaScript(`
    new Promise((resolve) => {
      const deadline = Date.now() + 5000;
      const tick = () => {
        const item = Array.from(document.querySelectorAll(".taskItem")).find((node) =>
          node.textContent && node.textContent.includes("smoke-translation-retry.wav")
        );
        const status = item ? item.querySelector(".taskStatus.running") : null;
        if (status && status.textContent && status.textContent.includes("55%")) {
          resolve(true);
          return;
        }
        if (Date.now() > deadline) {
          resolve(false);
          return;
        }
        setTimeout(tick, 50);
      };
      tick();
    })
  `);
  if (!retryTranslationStateVisible) {
    throw new Error("Smoke test failed: translation retry did not enter translate running state.");
  }

  const queueControlResult = await mainWindow.webContents.executeJavaScript(`
    new Promise((resolve) => {
      const deadline = Date.now() + 10000;
      const findButton = (label) => Array.from(document.querySelectorAll("button")).find((node) =>
        node.textContent && node.textContent.includes(label)
      );
      const findTask = () => Array.from(document.querySelectorAll(".taskItem")).find((node) =>
        node.textContent && node.textContent.includes("smoke-requeue-failed.wav")
      );
      const waitFor = (check, label, next) => {
        const tick = () => {
          if (check()) {
            next();
            return;
          }
          if (Date.now() > deadline) {
            resolve({ ok: false, label, tasks: Array.from(document.querySelectorAll(".taskItem")).map((node) => node.textContent || "") });
            return;
          }
          setTimeout(tick, 50);
        };
        tick();
      };

      const start = findButton("开始队列");
      if (!start || start.disabled) {
        resolve({ ok: false, label: "start unavailable" });
        return;
      }
      start.click();
      waitFor(() => {
        const item = findTask();
        return item && item.querySelector(".taskStatus.running");
      }, "running after start", () => {
        const pause = findButton("暂停");
        if (!pause || pause.disabled) {
          resolve({ ok: false, label: "pause unavailable" });
          return;
        }
        pause.click();
        waitFor(() => {
          const resume = findButton("恢复");
          return resume && !resume.disabled;
        }, "resume visible", () => {
          const resume = findButton("恢复");
          resume.click();
          waitFor(() => {
            const pauseAgain = findButton("暂停");
            return pauseAgain && !pauseAgain.disabled;
          }, "pause restored", () => {
            const cancel = findButton("取消任务");
            if (!cancel || cancel.disabled) {
              resolve({ ok: false, label: "cancel unavailable" });
              return;
            }
            cancel.click();
            waitFor(() => {
              const item = findTask();
              return item && item.querySelector(".taskStatus.canceled");
            }, "canceled after cancel", () => {
              const item = findTask();
              const requeue = item ? item.querySelector(".taskInlineActions button") : null;
              if (!requeue) {
                resolve({ ok: false, label: "requeue unavailable after cancel" });
                return;
              }
              requeue.click();
              waitFor(() => {
                const nextItem = findTask();
                return nextItem && nextItem.querySelector(".taskStatus.queued");
              }, "queued after requeue", () => {
                const secondStart = findButton("开始队列");
                if (!secondStart || secondStart.disabled) {
                  resolve({ ok: false, label: "second start unavailable" });
                  return;
                }
                secondStart.click();
                waitFor(() => {
                  const doneItem = findTask();
                  return doneItem && doneItem.querySelector(".taskStatus.done");
                }, "done after restart", () => resolve({ ok: true }));
              });
            });
          });
        });
      });
    })
  `);
  if (!queueControlResult.ok) {
    throw new Error(`Smoke test failed: queue control flow failed at ${queueControlResult.label}. ${JSON.stringify(queueControlResult)}`);
  }

  const addFileResult = await mainWindow.webContents.executeJavaScript(`
    new Promise((resolve) => {
      const add = Array.from(document.querySelectorAll("button")).find((node) =>
        node.textContent && node.textContent.includes("添加文件")
      );
      if (!add || add.disabled) {
        resolve(false);
        return;
      }
      add.click();
      const deadline = Date.now() + 5000;
      const tick = () => {
        const item = Array.from(document.querySelectorAll(".taskItem")).find((node) =>
          node.textContent && node.textContent.includes("smoke-selected.wav")
        );
        if (item) {
          resolve(true);
          return;
        }
        if (Date.now() > deadline) {
          resolve(false);
          return;
        }
        setTimeout(tick, 50);
      };
      tick();
    })
  `);
  if (!addFileResult) {
    throw new Error("Smoke test failed: add file flow did not add the selected media task.");
  }

  const editTaskReselectedForExport = await mainWindow.webContents.executeJavaScript(`
    (() => {
      const item = Array.from(document.querySelectorAll(".taskItem")).find((node) =>
        node.textContent && node.textContent.includes("smoke-ui-edit.wav")
      );
      if (!item) {
        return false;
      }
      item.click();
      return true;
    })()
  `);
  if (!editTaskReselectedForExport) {
    throw new Error("Smoke test failed: could not reselect edited task before export.");
  }

  const exportClicksApplied = await mainWindow.webContents.executeJavaScript(`
    (() => {
      const clickButton = (label) => {
        const button = Array.from(document.querySelectorAll(".exportActions button")).find((node) =>
          node.textContent && node.textContent.includes(label)
        );
        if (!button || button.disabled) {
          return false;
        }
        button.click();
        return true;
      };
      return [
        clickButton("保存为 txt"),
        clickButton("保存为 srt"),
        clickButton("批量导出 txt"),
        clickButton("批量导出 srt"),
      ];
    })()
  `);
  if (!Array.isArray(exportClicksApplied) || exportClicksApplied.some((clicked) => !clicked)) {
    throw new Error(`Smoke test failed: export buttons were not all clickable. ${JSON.stringify(exportClicksApplied)}`);
  }
  await waitForSmokeCondition(() => {
    const directory = getSmokeExportDir();
    if (!fs.existsSync(directory)) {
      return false;
    }
    const files = fs.readdirSync(directory);
    return (
      files.includes("smoke-ui-edit.txt") &&
      files.includes("smoke-ui-edit.srt") &&
      files.some((file) => /^smoke-ui-edit-\d+\.txt$/.test(file)) &&
      files.some((file) => /^smoke-ui-edit-\d+\.srt$/.test(file))
    );
  }, "UI export files");

  const smokeExportDir = getSmokeExportDir();
  const exportedFiles = fs.readdirSync(smokeExportDir);
  const singleTxt = fs.readFileSync(path.join(smokeExportDir, "smoke-ui-edit.txt"), "utf8");
  const singleSrt = fs.readFileSync(path.join(smokeExportDir, "smoke-ui-edit.srt"), "utf8");
  const batchTxtName = exportedFiles.find((file) => /^smoke-ui-edit-\d+\.txt$/.test(file));
  const batchSrtName = exportedFiles.find((file) => /^smoke-ui-edit-\d+\.srt$/.test(file));
  const batchTxt = fs.readFileSync(path.join(smokeExportDir, batchTxtName), "utf8");
  const batchSrt = fs.readFileSync(path.join(smokeExportDir, batchSrtName), "utf8");
  if (
    !singleTxt.includes(failedSourceText) ||
    !singleSrt.includes(failedSourceText) ||
    !batchTxt.includes(failedSourceText) ||
    !batchSrt.includes(failedSourceText)
  ) {
    throw new Error("Smoke test failed: exported TXT/SRT files did not contain the current edited segment text.");
  }

  console.log("electron smoke checks passed");
  app.exit(0);
}

async function runSmokeRestartTest() {
  const settings = readSettings();
  if (settings.exportOptions?.txtMode !== "source" || settings.exportOptions?.srtMode !== "translation") {
    throw new Error("Smoke restart failed: persisted export settings were not restored.");
  }
  if (!settings.aiTranslation?.apiKey) {
    throw new Error("Smoke restart failed: persisted AI key was not restored.");
  }

  const history = readHistory();
  if (history.some((item) => item.id === getSmokeUiHistoryTask().id)) {
    throw new Error("Smoke restart failed: deleted history task was restored.");
  }
  if (!history.some((item) => item.id === getSmokeUiEditTask().id && item.result?.segments?.[0]?.sourceText === "smoke edit saved")) {
    throw new Error("Smoke restart failed: edited history task was not persisted.");
  }

  const restartUiState = await mainWindow.webContents.executeJavaScript(`
    new Promise((resolve) => {
      const deadline = Date.now() + 5000;
      const tick = () => {
        const tasks = Array.from(document.querySelectorAll(".taskItem")).map((node) => node.textContent || "");
        const deletedVisible = tasks.some((text) => text.includes("smoke-ui-history.wav"));
        const editedVisible = tasks.some((text) => text.includes("smoke-ui-edit.wav"));
        if (!deletedVisible && editedVisible) {
          resolve({ ok: true, tasks });
          return;
        }
        if (Date.now() > deadline) {
          resolve({ ok: false, tasks });
          return;
        }
        setTimeout(tick, 50);
      };
      tick();
    })
  `);
  if (!restartUiState.ok) {
    throw new Error(`Smoke restart failed: history hydration state was wrong. Tasks: ${JSON.stringify(restartUiState.tasks)}`);
  }

  const settingsSummaryReady = await mainWindow.webContents.executeJavaScript(`
    new Promise((resolve) => {
      const openButton = Array.from(document.querySelectorAll("button")).find((node) =>
        node.textContent && node.textContent.includes("设置")
      );
      if (!openButton || openButton.disabled) {
        resolve({ ok: false, reason: "settings button unavailable" });
        return;
      }
      openButton.click();
      const deadline = Date.now() + 5000;
      const tick = () => {
        const summary = document.querySelector(".settingsSummaryBlock");
        const text = summary ? summary.textContent || "" : "";
        if (text.includes("TXT: 仅原文") && text.includes("SRT: 仅译文") && text.includes("已配置")) {
          resolve({ ok: true, text });
          return;
        }
        if (Date.now() > deadline) {
          resolve({ ok: false, text });
          return;
        }
        setTimeout(tick, 50);
      };
      tick();
    })
  `);
  if (!settingsSummaryReady.ok) {
    throw new Error(`Smoke restart failed: settings summary did not reflect persisted settings. ${JSON.stringify(settingsSummaryReady)}`);
  }

  console.log("electron smoke restart checks passed");
  app.exit(0);
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

ipcMain.on("smoke:tasks", (event) => {
  event.returnValue = getSmokeRendererTasks();
});

ipcMain.on("smoke:fail-next-history-upsert", (event) => {
  if (process.env.ASMR_TRANS_SMOKE_TEST === "1") {
    failNextHistoryUpsertForSmoke = true;
    event.returnValue = true;
    return;
  }
  event.returnValue = false;
});

ipcMain.handle("audio:select", async () => {
  if (process.env.ASMR_TRANS_SMOKE_TEST === "1") {
    const mediaPath = getSmokeSelectedMediaPath();
    const stat = fs.statSync(mediaPath);
    return [{
      path: mediaPath,
      name: path.basename(mediaPath),
      size: stat.size,
      extension: "wav",
    }];
  }

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

function runHardwareStatus(env, source) {
  const { executable, args } = getPythonCommand(["--hardware"]);
  const result = spawnSync(executable, args, {
    encoding: "utf8",
    windowsHide: true,
    env: {
      ...env,
      ASMR_TRANS_CUDA_RUNTIME_SOURCE: source,
    },
  });

  if (result.error) {
    return {
      ctranslate2CudaAvailable: false,
      ctranslate2CudaDeviceCount: 0,
      ctranslate2CudaSmokeOk: false,
      cudaAvailable: false,
      cudaDeviceCount: 0,
      cudaDeviceName: null,
      cudaRuntime: { source: "failed", dllDirectories: [] },
      error: result.error.message,
    };
  }

  try {
    return JSON.parse(result.stdout.trim());
  } catch (_error) {
    return {
      ctranslate2CudaAvailable: false,
      ctranslate2CudaDeviceCount: 0,
      ctranslate2CudaSmokeOk: false,
      cudaAvailable: false,
      cudaDeviceCount: 0,
      cudaDeviceName: null,
      cudaRuntime: { source: "failed", dllDirectories: [] },
      error: result.stderr.trim() || "Unable to read hardware status.",
    };
  }
}

function getHardwareStatusWithCudaPriority() {
  const systemEnv = getWorkerEnv({ includeCudaWheelPaths: false });
  const systemStatus = runHardwareStatus(systemEnv, "system");
  if (systemStatus.ctranslate2CudaSmokeOk) {
    return systemStatus;
  }

  const cudaDllDirectories = getCudaWheelDllDirectories(systemEnv);
  if (!cudaDllDirectories.length) {
    return {
      ...systemStatus,
      ctranslate2CudaAvailable: false,
      ctranslate2CudaSmokeOk: false,
      cudaAvailable: false,
      cudaRuntime: {
        ...(systemStatus.cudaRuntime || {}),
        source: systemStatus.cudaDeviceCount > 0 ? "missing" : "failed",
        dllDirectories: [],
      },
      error: systemStatus.error || (systemStatus.cudaDeviceCount > 0 ? "CUDA runtime DLLs are missing." : "No CUDA GPU was detected."),
    };
  }

  const wheelStatus = runHardwareStatus(appendPathEntries(systemEnv, cudaDllDirectories), "python-wheel");
  if (wheelStatus.ctranslate2CudaSmokeOk) {
    return wheelStatus;
  }

  return {
    ...wheelStatus,
    cudaRuntime: {
      ...(wheelStatus.cudaRuntime || {}),
      source: wheelStatus.cudaDeviceCount > 0 ? "failed" : "missing",
      dllDirectories: cudaDllDirectories,
    },
    error: wheelStatus.error || systemStatus.error || "CUDA runtime was detected, but CTranslate2 CUDA smoke check failed.",
    diagnostics: {
      system: systemStatus,
      pythonWheel: wheelStatus,
    },
  };
}

ipcMain.handle("hardware:status", async () => {
  return getHardwareStatusWithCudaPriority();
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
  if (failNextHistoryUpsertForSmoke) {
    failNextHistoryUpsertForSmoke = false;
    throw new Error("Smoke injected history upsert failure.");
  }
  const saved = upsertHistoryTask(task);
  return { saved: true, id: saved.id };
});

ipcMain.handle("history:delete", async (_event, id) => {
  return deleteHistoryTask(id);
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

ipcMain.handle("cuda:install-deps", async (event) => {
  cudaDependencyInstallPromise = null;
  const status = await ensureCudaDependencies(event);
  return { ok: true, status };
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

  if (process.env.ASMR_TRANS_SMOKE_TEST === "1") {
    const startCount = (smokeTranscriptionStartsByPath.get(payload.audioPath) || 0) + 1;
    smokeTranscriptionStartsByPath.set(payload.audioPath, startCount);
    smokeTranscriptionRunning = true;
    event.sender.send("transcribe:progress", {
      stage: "transcribe",
      message: "Smoke transcription running.",
      percent: 20,
      elapsedSeconds: 0,
      stageElapsedSeconds: 0,
    });
    if (startCount >= 2) {
      setTimeout(() => {
        if (!smokeTranscriptionRunning) {
          return;
        }
        smokeTranscriptionRunning = false;
        event.sender.send("transcribe:done", {
          detectedLanguage: "zh",
          computeDevice: "cpu",
          segments: [{ start: 0, end: 1, sourceText: "smoke transcription done", translatedText: null }],
        });
      }, 100);
    }
    return { started: true };
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
  if (process.env.ASMR_TRANS_SMOKE_TEST === "1" && smokeTranscriptionRunning) {
    smokeTranscriptionRunning = false;
    event.sender.send("transcribe:canceled", { message: "\u4efb\u52a1\u5df2\u53d6\u6d88\u3002" });
    return { canceled: true };
  }
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
  if (process.env.ASMR_TRANS_SMOKE_TEST === "1") {
    return { started: true };
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

  if (process.env.ASMR_TRANS_SMOKE_TEST === "1") {
    const directory = getSmokeExportDir();
    fs.mkdirSync(directory, { recursive: true });
    const filePath = path.join(directory, safeExportFileName(payload.defaultFileName || "transcription.txt"));
    fs.writeFileSync(filePath, payload.content, "utf8");
    return { saved: true, path: filePath };
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
  const exportableItems = getExportableItems(payload?.items);
  if (!exportableItems.length) {
    throw new Error("There is no completed transcription result to export.");
  }

  if (process.env.ASMR_TRANS_SMOKE_TEST === "1") {
    const directory = getSmokeExportDir();
    fs.mkdirSync(directory, { recursive: true });
    const usedNames = new Set();
    for (const item of exportableItems) {
      const candidate = getUniqueExportFileName(directory, item.fileName, usedNames);
      fs.writeFileSync(path.join(directory, candidate), item.content, "utf8");
    }
    return { saved: true, directory, count: exportableItems.length };
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
    const candidate = getUniqueExportFileName(directory, item.fileName, usedNames);
    fs.writeFileSync(path.join(directory, candidate), item.content, "utf8");
  }

  return { saved: true, directory, count: exportableItems.length };
});
