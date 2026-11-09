import { spawn } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractFramesFromVideoFile } from "./extract-frames.js";
import { formatIntoParagraphs } from "./format-paragraphs.js";

const PLAYER_CLIENTS = [undefined, "android", "ios"] as const;
const MAX_VIDEO_DOWNLOAD_BYTES = 150 * 1024 * 1024;

function runYtDlp(args: string[]): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn("yt-dlp", args);
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => resolve({ code: code ?? 1, stderr }));
    child.on("error", () =>
      resolve({ code: 1, stderr: "yt-dlp not found on this machine" }),
    );
  });
}

// Auto-generated VTT/SRT cue text is HTML-escaped (e.g. "&gt;&gt;" for ">>"),
// so entities need decoding before any further text cleanup runs.
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

// Handles both .srt (post --convert-subs) and raw .vtt — if yt-dlp exits
// non-zero partway through a multi-language run, the subtitle(s) already
// downloaded before the failure may still be sitting there as .vtt only.
function subtitleToText(content: string): string {
  const lines = content
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return false;
      if (/^\d+$/.test(trimmed)) return false;
      if (trimmed.includes("-->")) return false;
      if (trimmed === "WEBVTT") return false;
      if (/^(Kind|Language):/.test(trimmed)) return false;
      return true;
    })
    // Strip inline word-level timing tags (e.g. "<00:00:00.240><c>word</c>")
    // that YouTube's raw auto-generated VTT embeds inside cue text.
    .map((line) => line.replace(/<[^>]*>/g, ""))
    // Decode HTML entities, then drop caption-only artifacts (sound/music
    // annotations like "[khịt mũi]", speaker-change markers like ">>") that
    // aren't actually spoken content.
    .map((line) =>
      decodeHtmlEntities(line)
        .replace(/\[[^\]]*\]/g, "")
        .replace(/>>+/g, "")
        .trim(),
    )
    .filter((line) => line.length > 0);

  // Raw auto-generated VTT uses roll-up cues, so consecutive lines often
  // repeat most of the previous line's words (progressive reveal). Drop a
  // line that's fully contained in the previous one to cut that duplication.
  const deduped: string[] = [];
  for (const line of lines) {
    const prev = deduped[deduped.length - 1];
    if (prev && prev.includes(line.trim())) continue;
    if (prev && line.trim().includes(prev)) {
      deduped[deduped.length - 1] = line.trim();
      continue;
    }
    deduped.push(line.trim());
  }

  return deduped.join(" ").replace(/\s+/g, " ").trim();
}

/** Captions as paragraphs, or null with yt-dlp's last error when the video has none. */
export async function fetchCaptions(
  url: string,
): Promise<{ text: string | null; error: string }> {
  const dir = await mkdtemp(join(tmpdir(), "sunbee-transcript-"));
  let lastError = "";
  try {
    for (const client of PLAYER_CLIENTS) {
      const args = [
        "--skip-download",
        "--write-sub",
        "--write-auto-sub",
        "--sub-lang",
        "vi,vi-orig,en",
        "--convert-subs",
        "srt",
        "-o",
        join(dir, "%(id)s.%(ext)s"),
      ];
      if (client)
        args.push("--extractor-args", `youtube:player_client=${client}`);
      args.push(url);

      const { stderr } = await runYtDlp(args);
      lastError = stderr;

      // Even when yt-dlp exits non-zero (e.g. one of several requested
      // languages hit a transient rate limit), earlier languages in the same
      // run may already be sitting on disk — use them instead of discarding
      // the whole attempt and retrying with a different player client.
      const files = await readdir(dir);
      const subFile =
        files.find((f) => f.endsWith(".srt")) ??
        files.find((f) => f.endsWith(".vtt"));
      if (subFile) {
        const content = await readFile(join(dir, subFile), "utf-8");
        const text = subtitleToText(content);
        if (text) return { text: formatIntoParagraphs(text), error: "" };
      }
    }
    return { text: null, error: lastError.slice(-300) };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export function noCaptionsError(detail: string, hint: string): Error {
  return new Error(
    `Không lấy được phụ đề từ video này (có thể video không có phụ đề, hoặc yt-dlp bị chặn tạm thời). ${hint} Chi tiết lỗi: ${detail}`,
  );
}

/** Captions only (no AI); throws when the video has none. Used by the MCP tool. */
export async function fetchTranscriptFromVideoUrl(
  url: string,
): Promise<string> {
  const { text, error } = await fetchCaptions(url);
  if (!text)
    throw noCaptionsError(
      error,
      "Hãy thử dán kịch bản trực tiếp thay vì dùng link.",
    );
  return text;
}

/**
 * Lower and lower renditions to try: the whole video matters more than its
 * resolution (frames are scaled to 640px anyway), so a long video that's too
 * big at 480p is fetched at 360p / 240p rather than not at all.
 */
const DOWNLOAD_FORMATS = [
  "best[height<=480]/best",
  "best[height<=360]/worst[height>=240]/worst",
  "worst",
];

/**
 * Downloads the whole video (a reduced-resolution copy, capped in size) into
 * `dir`. Best-effort: null on any failure (unsupported site, too big...).
 */
export async function downloadVideo(
  url: string,
  dir: string,
): Promise<string | null> {
  for (const format of DOWNLOAD_FORMATS) {
    try {
      const { code } = await runYtDlp([
        "-f",
        format,
        "--max-filesize",
        String(MAX_VIDEO_DOWNLOAD_BYTES),
        "--no-playlist",
        "-o",
        join(dir, "video.%(ext)s"),
        url,
      ]);
      const videoFile = (await readdir(dir)).find(
        (f) =>
          f.startsWith("video.") &&
          !f.endsWith(".part") &&
          !f.endsWith(".ytdl"),
      );
      if (code === 0 && videoFile) return join(dir, videoFile);
    } catch {
      // Try the next, smaller rendition.
    }
  }
  return null;
}

// Best-effort: downloads a capped, reduced-resolution copy of the video just
// to sample frames from. Never throws — any failure (unsupported site, size
// cap hit, ffmpeg missing, etc.) just means no frames, not a broken fetch.
export async function downloadVideoForFrames(url: string): Promise<string[]> {
  const dir = await mkdtemp(join(tmpdir(), "sunbee-video-"));
  try {
    const videoPath = await downloadVideo(url, dir);
    return videoPath ? await extractFramesFromVideoFile(videoPath) : [];
  } catch {
    return [];
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
