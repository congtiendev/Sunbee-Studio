import { ipcMain } from "electron";
import { IPC } from "../../shared/ipc-channels.js";
import type { StyleTemplate } from "../../shared/types.js";

export function registerTemplatesIpc() {
  ipcMain.handle(IPC.TEMPLATES_LIST, (): Promise<StyleTemplate[]> => {
    throw new Error("template store not implemented yet");
  });
  ipcMain.handle(
    IPC.TEMPLATES_SAVE,
    (_event, _template: Omit<StyleTemplate, "id" | "createdAt">): Promise<StyleTemplate> => {
      throw new Error("template store not implemented yet");
    },
  );
  ipcMain.handle(IPC.TEMPLATES_DELETE, (_event, _id: string): Promise<void> => {
    throw new Error("template store not implemented yet");
  });
}
