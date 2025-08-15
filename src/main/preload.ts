import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("ipcRenderer", ipcRenderer);

export type IpcRendererHandler = typeof ipcRenderer;
