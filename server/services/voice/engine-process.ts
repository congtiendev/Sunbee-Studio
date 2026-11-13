import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dataDir } from "../../env.js";
import { logger } from "../logger.js";

/**
 * Manages the local TTS sidecar: a Python process (FastAPI app under
 * `./python/`) that owns the actual voice-cloning model, started on first
 * use and kept running for the life of the server. The Node side never
 * bundles or installs model weights — it only spawns a venv under
 * `<dataDir>/voice-engine/venv`, running on whatever Python the machine
 * already has (see `requireAuth`-gated routes in `../../modules/voiceover/`
 * for where this is called from).
 */

// Resolved relative to this file, which works under `tsx watch` (dev) since
// nothing is bundled. The production build rolls server/ into one
// dist-server/index.js (server.vite.config.ts) — ship `python/` alongside
// that bundle (same relative path) before relying on this in a packaged app.
export const PYTHON_DIR = fileURLToPath(new URL("./python", import.meta.url));
const VENV_DIR_NAME = "voice-engine-venv";
// Generous: the very first start also creates the venv, pip-installs
// `vieneu` (pulls onnxruntime/transformers), and downloads its model
// weights from Hugging Face — all before the sidecar can report ready.
const STARTUP_TIMEOUT_MS = 30 * 60_000;
const HEALTH_POLL_MS = 500;

export class VoiceEngineError extends Error {}

function venvDir(): string {
  return join(dataDir(), VENV_DIR_NAME);
}

/** Every interpreter name `python -m venv` might produce, most-preferred first. */
function venvCandidates(): string[] {
  // Windows venvs put the interpreter under Scripts\, not bin/.
  if (process.platform === "win32") return [join(venvDir(), "Scripts", "python.exe")];
  const bin = join(venvDir(), "bin");
  return [join(bin, "python"), join(bin, "python3")];
}

/** Shared by every local voice capability (TTS, cloning, separation) — one venv, one requirements.txt. */
export function venvPython(): string {
  return venvCandidates().find((p) => existsSync(p)) ?? venvCandidates()[0]!;
}

function run(command: string, args: string[], label: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "pipe" });
    child.stdout?.resume(); // drain so a chatty install can't block on a full pipe
    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", (err) => reject(new VoiceEngineError(`${label}: ${err.message}`)));
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new VoiceEngineError(`${label} thất bại (mã ${code}).\n${stderr.trim()}`));
    });
  });
}

function findSystemPython(): string {
  // `python3` is the convention on Linux/macOS; Windows installs frequently
  // only register `python`. Resolution (and the "not found" error) happens
  // when we actually try to spawn it below.
  return process.platform === "win32" ? "python" : "python3";
}

export async function ensureVenv(): Promise<void> {
  if (venvCandidates().some((p) => existsSync(p))) return;
  if (existsSync(venvDir())) {
    // A previous attempt was interrupted (e.g. the dev server restarted
    // mid-install) and left a venv with no working interpreter — delete and
    // recreate instead of failing on a half-built venv forever.
    logger.warn("voice engine: removing incomplete venv", { dir: venvDir() });
    rmSync(venvDir(), { recursive: true, force: true });
  }
  logger.info("voice engine: creating venv", { dir: venvDir() });
  try {
    await run(findSystemPython(), ["-m", "venv", venvDir()], "Tạo venv cho engine giọng nói");
  } catch (err) {
    throw new VoiceEngineError(
      `Không tạo được môi trường Python. Cần cài Python 3 (python3 -m venv) trên máy trước khi dùng Giọng nói local. (${(err as Error).message})`,
    );
  }
  if (!venvCandidates().some((p) => existsSync(p))) {
    throw new VoiceEngineError(
      "Tạo venv xong nhưng không thấy python bên trong — có thể thiếu gói python3-venv (Ubuntu/Debian: sudo apt install python3-venv), thử lại sau khi cài.",
    );
  }
  await run(
    venvPython(),
    ["-m", "pip", "install", "-q", "-r", join(PYTHON_DIR, "requirements.txt")],
    "Cài thư viện Python cho engine giọng nói",
  );
}

interface RunningEngine {
  baseUrl: string;
  process: ChildProcess;
}

let starting: Promise<RunningEngine> | null = null;
let running: RunningEngine | null = null;
// Tracks the spawned child even before it's confirmed healthy/`running` —
// otherwise a shutdown (or a dev-server restart) mid-startup (venv/pip
// install, first model download) has no handle to kill it and orphans it.
let currentChild: ChildProcess | null = null;

/** Waits past "process is up" to "model is actually loaded" (`ready` in the /health body) — see app.py's startup warm-up. */
function waitForHealth(baseUrl: string, deadline: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const tick = () => {
      fetch(`${baseUrl}/health`)
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
        .then((raw) => {
          const body = raw as { ready?: boolean; error?: string | null };
          if (body.ready) resolve();
          // A terminal load failure (e.g. `vieneu` not installed) never
          // becomes ready — fail now instead of polling for the full 30
          // minutes just to report the same thing later.
          else if (body.error) reject(new VoiceEngineError(body.error));
          else if (Date.now() > deadline) reject(new VoiceEngineError("Engine giọng nói nạp model quá lâu."));
          else setTimeout(tick, HEALTH_POLL_MS);
        })
        .catch(() => {
          if (Date.now() > deadline) {
            reject(new VoiceEngineError("Engine giọng nói không khởi động được kịp thời."));
          } else {
            setTimeout(tick, HEALTH_POLL_MS);
          }
        });
    };
    tick();
  });
}

async function startEngine(): Promise<RunningEngine> {
  await ensureVenv();
  const port = 0; // let the OS assign a free port; the app prints it on startup
  const modelCacheDir = join(dataDir(), "voice-engine-cache");
  const child = spawn(venvPython(), ["app.py", "--port", String(port)], {
    cwd: PYTHON_DIR,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      // Keeps model weights (VieNeu-TTS, Demucs) under the app's own data
      // dir instead of the OS user's home directory.
      TORCH_HOME: modelCacheDir,
      HF_HOME: modelCacheDir,
      // HF Hub's default cache stores real weights as content-addressed
      // blobs and symlinks them into a model's snapshot dir — a model's own
      // file and its "external data" sibling can end up as symlinks to two
      // different blob subdirectories, which onnxruntime's external-data
      // path check (over-eagerly) rejects as "escapes model directory".
      // Downloading real copies instead of symlinks sidesteps that.
      HF_HUB_DISABLE_SYMLINKS: "1",
    },
  });
  currentChild = child;

  const portPromise = new Promise<number>((resolve, reject) => {
    let buffered = "";
    const onData = (chunk: Buffer) => {
      buffered += chunk.toString();
      const match = /PORT=(\d+)/.exec(buffered);
      if (match) {
        child.stdout?.off("data", onData);
        resolve(Number(match[1]));
      }
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", (chunk: Buffer) => logger.warn("voice engine stderr", { line: chunk.toString().trim() }));
    child.on("error", (err) => reject(new VoiceEngineError(`Không chạy được engine giọng nói: ${err.message}`)));
    child.on("exit", (code) => {
      if (code !== 0 && code !== null) reject(new VoiceEngineError(`Engine giọng nói dừng sớm (mã ${code}).`));
    });
  });

  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  const boundPort = await portPromise;
  const baseUrl = `http://127.0.0.1:${boundPort}`;
  try {
    await waitForHealth(baseUrl, deadline);
  } catch (err) {
    // Never ready (e.g. `vieneu` missing) — don't leak the process; the
    // next call starts a fresh one.
    child.kill();
    currentChild = null;
    throw err;
  }

  child.on("exit", () => {
    if (running?.process === child) running = null;
    if (currentChild === child) currentChild = null;
  });

  return { baseUrl, process: child };
}

/** Starts the sidecar on first call; later calls reuse the running instance. */
export async function getVoiceEngineBaseUrl(): Promise<string> {
  if (running) return running.baseUrl;
  const promise: Promise<RunningEngine> =
    starting ?? (starting = startEngine().finally(() => (starting = null)));
  const engine = await promise;
  running = engine;
  return engine.baseUrl;
}

export function stopVoiceEngine(): void {
  // Covers both a fully-started engine and one still mid-startup (venv
  // creation, pip install, first model download) — either way, don't leave
  // a python process running after the server that owns it stops.
  currentChild?.kill();
  currentChild = null;
  running = null;
}
