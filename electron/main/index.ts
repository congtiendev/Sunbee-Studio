import { app, BrowserWindow, Menu } from "electron";
import { registerSettingsIpc } from "./ipc/settings.js";
import { registerTemplatesIpc } from "./ipc/templates.js";
import { registerVideoIpc } from "./ipc/video.js";
import {
  registerAppProtocolHandler,
  registerAppProtocolPrivileges,
} from "./protocol.js";
import { initAutoUpdater } from "./updater.js";
import { createMainWindow } from "./windows.js";

registerAppProtocolPrivileges();

void app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  registerAppProtocolHandler();
  registerSettingsIpc();
  registerVideoIpc();
  registerTemplatesIpc();
  const win = createMainWindow();
  initAutoUpdater(win);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
