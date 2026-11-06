import { app, BrowserWindow, Menu } from "electron";
import {
  startServerProcess,
  stopServerProcess,
  waitForServerReady,
} from "./server-process.js";
import { initAutoUpdater } from "./updater.js";
import { createMainWindow } from "./windows.js";

void app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);

  const serverUrl = startServerProcess();
  await waitForServerReady(serverUrl);

  const win = createMainWindow(serverUrl);
  initAutoUpdater(win);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow(serverUrl);
  });
});

app.on("before-quit", stopServerProcess);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
