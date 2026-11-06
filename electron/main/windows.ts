import { BrowserWindow } from "electron";
import { join } from "node:path";

export function createMainWindow(serverUrl: string) {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: "Sunbee Studio",
    icon: join(import.meta.dirname, "../../build/icon.png"),
  });

  void win.loadURL(process.env.ELECTRON_RENDERER_URL ?? serverUrl);

  return win;
}
