import { contextBridge, ipcRenderer } from "electron";
import { IPC } from "../shared/ipc-channels.js";
import type {
  AppSettings,
  StyleTemplate,
  VideoAnalyzeRequest,
  VideoAnalyzeResult,
  VideoProgressEvent,
} from "../shared/types.js";

const sunbeeVideo = {
  analyzeVideo: (req: VideoAnalyzeRequest): Promise<VideoAnalyzeResult> =>
    ipcRenderer.invoke(IPC.VIDEO_ANALYZE, req),
  onProgress: (cb: (e: VideoProgressEvent) => void) => {
    const listener = (_event: unknown, e: VideoProgressEvent) => cb(e);
    ipcRenderer.on(IPC.VIDEO_PROGRESS, listener);
    return () => ipcRenderer.removeListener(IPC.VIDEO_PROGRESS, listener);
  },
};

const sunbeeSettings = {
  get: (): Promise<AppSettings> => ipcRenderer.invoke(IPC.SETTINGS_GET),
  set: (patch: Partial<AppSettings>): Promise<AppSettings> =>
    ipcRenderer.invoke(IPC.SETTINGS_SET, patch),
};

const sunbeeTemplates = {
  list: (): Promise<StyleTemplate[]> => ipcRenderer.invoke(IPC.TEMPLATES_LIST),
  save: (
    template: Omit<StyleTemplate, "id" | "createdAt">,
  ): Promise<StyleTemplate> => ipcRenderer.invoke(IPC.TEMPLATES_SAVE, template),
  delete: (id: string): Promise<void> =>
    ipcRenderer.invoke(IPC.TEMPLATES_DELETE, id),
};

contextBridge.exposeInMainWorld("sunbeeVideo", sunbeeVideo);
contextBridge.exposeInMainWorld("sunbeeSettings", sunbeeSettings);
contextBridge.exposeInMainWorld("sunbeeTemplates", sunbeeTemplates);
