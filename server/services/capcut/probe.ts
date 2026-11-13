import { spawn } from "node:child_process";

export interface ProbedMedia {
  width?: number;
  height?: number;
  durationMs?: number;
}

/** Pixel size and length of a media file via ffprobe (same binary the script step uses). */
export function probeMedia(path: string): Promise<ProbedMedia> {
  return new Promise((resolve, reject) => {
    const child = spawn("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "stream=width,height,codec_type:format=duration",
      "-of",
      "json",
      path,
    ]);
    let out = "";
    let err = "";
    child.stdout.on("data", (chunk: Buffer) => (out += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (err += chunk.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`ffprobe failed on ${path}: ${err.trim() || `exit ${code}`}`));
        return;
      }
      const data = JSON.parse(out) as {
        streams?: { width?: number; height?: number; codec_type?: string }[];
        format?: { duration?: string };
      };
      const video = data.streams?.find((stream) => stream.codec_type === "video" && stream.width);
      const seconds = Number(data.format?.duration);
      resolve({
        width: video?.width,
        height: video?.height,
        durationMs: Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 1000) : undefined,
      });
    });
  });
}
