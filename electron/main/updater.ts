import { app, dialog, type BrowserWindow } from "electron";
import { autoUpdater } from "electron-updater";

export function initAutoUpdater(win: BrowserWindow) {
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on("update-available", (info) => {
    const response = dialog.showMessageBoxSync(win, {
      type: "info",
      title: "Có phiên bản mới",
      message: `Phiên bản ${info.version} đã sẵn sàng. Cập nhật ngay?`,
      buttons: ["Cập nhật ngay", "Để sau"],
      defaultId: 0,
      cancelId: 1,
    });
    if (response === 0) {
      void autoUpdater.downloadUpdate();
    }
  });

  autoUpdater.on("update-downloaded", () => {
    autoUpdater.quitAndInstall();
  });

  autoUpdater.on("error", (error) => {
    console.error("[updater] check/download failed:", error);
  });

  void autoUpdater.checkForUpdates();
}
