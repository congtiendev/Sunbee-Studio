import { ipcMain } from "electron";
import { IPC } from "../../shared/ipc-channels.js";
import type {
  VideoAnalyzeRequest,
  VideoAnalyzeResult,
} from "../../shared/types.js";

export function registerVideoIpc() {
  ipcMain.handle(
    IPC.VIDEO_ANALYZE,
    (_event, _req: VideoAnalyzeRequest): Promise<VideoAnalyzeResult> => {
      throw new Error("video pipeline not implemented yet");
    },
  );
}
