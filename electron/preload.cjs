const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("asmrTrans", {
  selectAudio: () => ipcRenderer.invoke("audio:select"),
  getModelStatus: () => ipcRenderer.invoke("models:status"),
  getHardwareStatus: () => ipcRenderer.invoke("hardware:status"),
  startTranscription: (payload) => ipcRenderer.invoke("transcribe:start", payload),
  saveTxt: (payload) => ipcRenderer.invoke("export:txt", payload),
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
});
