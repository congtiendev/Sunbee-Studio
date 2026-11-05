import { ipcMain } from "electron";
import { IPC } from "../../shared/ipc-channels.js";
import type { AppSettings } from "../../shared/types.js";
import { getSettings, setSettings } from "../settings-store.js";

export function registerSettingsIpc() {
  ipcMain.handle(IPC.SETTINGS_GET, () => getSettings());
  ipcMain.handle(IPC.SETTINGS_SET, (_event, patch: Partial<AppSettings>) =>
    setSettings(patch),
  );
}
