const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("asmrTrans", {
  selectAudio: () => ipcRenderer.invoke("audio:select"),
  getModelStatus: () => ipcRenderer.invoke("models:status"),
  getHardwareStatus: () => ipcRenderer.invoke("hardware:status"),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  updateSettings: (settings) => ipcRenderer.invoke("settings:update", settings),
  getHistory: () => ipcRenderer.invoke("history:get"),
  upsertHistory: (task) => ipcRenderer.invoke("history:upsert", task),
  retryDependencies: () => ipcRenderer.invoke("deps:retry"),
  startTranscription: (payload) => ipcRenderer.invoke("transcribe:start", payload),
  cancelTranscription: () => ipcRenderer.invoke("transcribe:cancel"),
  startTranslation: (payload) => ipcRenderer.invoke("translate:start", payload),
  cancelTranslation: (taskId) => ipcRenderer.invoke("translate:cancel", taskId),
  saveTxt: (payload) => ipcRenderer.invoke("export:txt", payload),
  exportBatch: (payload) => ipcRenderer.invoke("export:batch", payload),
  onProgress: (callback) => {
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on("transcribe:progress", listener);
    return () => ipcRenderer.removeListener("transcribe:progress", listener);
  },
  onDone: (callback) => {
    const listener = (_event, result) => callback(result);
    ipcRenderer.on("transcribe:done", listener);
    return () => ipcRenderer.removeListener("transcribe:done", listener);
  },
  onError: (callback) => {
    const listener = (_event, error) => callback(error);
    ipcRenderer.on("transcribe:error", listener);
    return () => ipcRenderer.removeListener("transcribe:error", listener);
  },
  onCanceled: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("transcribe:canceled", listener);
    return () => ipcRenderer.removeListener("transcribe:canceled", listener);
  },
  onTranslateProgress: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("translate:progress", listener);
    return () => ipcRenderer.removeListener("translate:progress", listener);
  },
  onTranslateDone: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("translate:done", listener);
    return () => ipcRenderer.removeListener("translate:done", listener);
  },
  onTranslateError: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("translate:error", listener);
    return () => ipcRenderer.removeListener("translate:error", listener);
  },
  onDependencyProgress: (callback) => {
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on("deps:progress", listener);
    return () => ipcRenderer.removeListener("deps:progress", listener);
  },
});
