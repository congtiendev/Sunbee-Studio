import { BrowserWindow } from "electron";
import { join } from "node:path";

export function createMainWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: "Sunbee Editor",
    icon: join(import.meta.dirname, "../../build/icon.png"),
    webPreferences: {
      preload: join(import.meta.dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void win.loadURL("app://local/");
  }

  return win;
}
