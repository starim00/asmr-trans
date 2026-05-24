const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { spawn, spawnSync } = require("node:child_process");

const AUDIO_EXTENSIONS = ["mp3", "wav", "m4a", "flac", "ogg", "aac"];
let mainWindow = null;
let activeWorker = null;

function getModelsDir() {
  return path.join(app.getPath("userData"), "models");
}

function hasModelFiles(modelPath) {
  return fs.existsSync(modelPath) && fs.readdirSync(modelPath).length > 0;
}

function getWorkerPath() {
  return path.join(__dirname, "..", "python", "worker.py");
}

function getPythonCommand(extraArgs = []) {
  const executable = process.env.ASMR_TRANS_PYTHON || (process.platform === "win32" ? "py" : "python3");
  const args = process.platform === "win32" && !process.env.ASMR_TRANS_PYTHON
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
    title: "Select audio file",
    properties: ["openFile"],
    filters: [{ name: "Audio", extensions: AUDIO_EXTENSIONS }],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const audioPath = result.filePaths[0];
  const ext = path.extname(audioPath).slice(1).toLowerCase();
  if (!AUDIO_EXTENSIONS.includes(ext)) {
    throw new Error(`Unsupported audio format: .${ext}`);
  }

  const stat = fs.statSync(audioPath);
  return {
    path: audioPath,
    name: path.basename(audioPath),
    size: stat.size,
    extension: ext,
  };
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

ipcMain.handle("transcribe:start", async (event, payload) => {
  if (!payload || !payload.audioPath) {
    throw new Error("Select an audio file first.");
  }

  const ext = path.extname(payload.audioPath).slice(1).toLowerCase();
  if (!AUDIO_EXTENSIONS.includes(ext)) {
    throw new Error(`Unsupported audio format: .${ext}`);
  }

  if (activeWorker) {
    throw new Error("A transcription task is already running.");
  }

  const modelsDir = getModelsDir();
  fs.mkdirSync(modelsDir, { recursive: true });

  const { executable, args } = getPythonCommand();
  const request = {
    audioPath: payload.audioPath,
    whisperModel: payload.whisperModel || "small",
    translationModel: payload.translationModel || "nllb-200-distilled-600M",
    computeDevice: payload.computeDevice || "auto",
    outputLanguage: "zh",
    modelsDir,
  };

  activeWorker = spawn(executable, args, {
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
    env: getWorkerEnv(),
  });

  let stderr = "";
  activeWorker.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  activeWorker.stdout.setEncoding("utf8");
  let buffer = "";
  let workerReportedError = false;
  activeWorker.stdout.on("data", (chunk) => {
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
          event.sender.send("transcribe:done", message.payload);
        } else if (message.type === "error") {
          workerReportedError = true;
          event.sender.send("transcribe:error", message.payload);
        }
      } catch (_error) {
        event.sender.send("transcribe:error", {
          message: `Unable to parse Python output: ${line}`,
        });
      }
    }
  });

  activeWorker.on("error", (error) => {
    workerReportedError = true;
    event.sender.send("transcribe:error", {
      message: `Unable to start Python worker: ${error.message}`,
    });
    activeWorker = null;
  });

  activeWorker.on("close", (code) => {
    if (code !== 0 && !workerReportedError) {
      event.sender.send("transcribe:error", {
        message: stderr.trim() || `Python worker exited with code ${code}`,
      });
    }
    activeWorker = null;
  });

  activeWorker.stdin.write(Buffer.from(JSON.stringify(request), "utf8"));
  activeWorker.stdin.end();

  return { started: true };
});

ipcMain.handle("export:txt", async (_event, payload) => {
  if (!payload || typeof payload.content !== "string" || !payload.content.trim()) {
    throw new Error("There is no transcription result to save.");
  }

  const result = await dialog.showSaveDialog(mainWindow, {
    title: "Save transcription result",
    defaultPath: payload.defaultFileName || "transcription.txt",
    filters: [{ name: "Text", extensions: ["txt"] }],
  });

  if (result.canceled || !result.filePath) {
    return { saved: false };
  }

  fs.writeFileSync(result.filePath, payload.content, "utf8");
  return { saved: true, path: result.filePath };
});
