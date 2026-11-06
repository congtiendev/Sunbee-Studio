import { app } from "electron";
import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";

const PORT = 4317;
let child: ChildProcess | null = null;

export function startServerProcess(): string {
  const entry = join(app.getAppPath(), "dist-server/index.js");
  const env = {
    ...process.env,
    SUNBEE_PORT: String(PORT),
    SUNBEE_DATA_DIR: app.isPackaged
      ? app.getPath("userData")
      : join(app.getAppPath(), "data"),
    SUNBEE_STATIC_DIR: join(app.getAppPath(), "dist"),
  };

  child = app.isPackaged
    ? spawn(process.execPath, [entry], {
        env: { ...env, ELECTRON_RUN_AS_NODE: "1" },
        stdio: "inherit",
      })
    : spawn("node", [entry], { env, stdio: "inherit" });

  child.on("exit", (code) => {
    console.error(`[server] exited: ${code}`);
  });

  return `http://127.0.0.1:${PORT}`;
}

export async function waitForServerReady(
  baseUrl: string,
  timeoutMs = 10000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/api/health`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("Sunbee server did not become ready in time");
}

export function stopServerProcess(): void {
  child?.kill();
  child = null;
}
