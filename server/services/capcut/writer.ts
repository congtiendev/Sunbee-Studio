import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { validateTimeline, type Timeline } from "../../../shared/timeline.js";
import { buildDraftContent, imageKey, type DraftAudio, type DraftImage } from "./draft-content.js";
import { prepareImage } from "./media.js";
import { defaultCapcutDraftsRoot, draftFolderName } from "./paths.js";
import { probeMedia } from "./probe.js";
import { draftMetaInfo, emptyDraftInfo, legacyTemplateTmp, sideFiles } from "./template.js";

export interface CapcutWriteOptions {
  /** CapCut's draft store (default: detected, or `SUNBEE_CAPCUT_DRAFTS`). */
  draftsRoot?: string;
  /** Folder (= project) name; default `sunbee_<name>_<time>`. Must not exist yet. */
  folderName?: string;
  /** Default "nunito" (the Người Que channel standard). */
  subtitleFont?: "nunito" | "default";
}

export interface CapcutWriteResult {
  folderName: string;
  folderPath: string;
  draftId: string;
  durationMs: number;
  tracks: { video: number; audio: number; text: number };
}

/**
 * Writes `timeline` as a new CapCut project, the way the Người Que pipeline
 * does (VectCutAPI's "capcut_legacy" layout): the template's files, the
 * timeline in `draft_info.json`, and every media file copied into the
 * project's own `assets/` so it never depends on Sunbee's data folder.
 *
 * Safety: it only ever CREATES a folder — never overwrites or deletes a
 * project (one CapCut has open holds a `.locked` file; touching it corrupts
 * the work in progress). Everything is written to a hidden temp folder first
 * and renamed into place at the end, so CapCut never sees a half-written
 * draft. CapCut lists the new project after it is quit and reopened.
 *
 * Only images and audio are supported for now (video clips are rejected).
 */
export async function writeCapcutDraft(
  timeline: Timeline,
  options: CapcutWriteOptions = {},
): Promise<CapcutWriteResult> {
  const errors = validateTimeline(timeline);
  if (errors.length) throw new Error(`Invalid timeline:\n- ${errors.join("\n- ")}`);
  const media = new Map(timeline.media.map((item) => [item.id, item]));
  const videoClip = timeline.visual.find((clip) => media.get(clip.mediaId)?.kind === "video");
  if (videoClip) throw new Error(`Video clips aren't supported in CapCut drafts yet (${videoClip.id})`);

  const draftsRoot = options.draftsRoot ?? defaultCapcutDraftsRoot();
  if (!draftsRoot || !existsSync(draftsRoot)) {
    throw new Error("CapCut's draft folder wasn't found — is CapCut desktop installed and opened once?");
  }
  const folderName = options.folderName ?? draftFolderName(timeline.name);
  const folderPath = join(draftsRoot, folderName);
  if (existsSync(folderPath)) throw new Error(`A CapCut project named ${folderName} already exists`);

  const temp = join(draftsRoot, `.sunbee-tmp-${randomUUID()}`);
  try {
    // ---- images: each media+fit once, prepared to the canvas ratio (several ffmpeg runs at a time) ----
    const images = new Map<string, DraftImage>();
    const jobs = new Map<string, { clip: (typeof timeline.visual)[number]; name: string }>();
    for (const clip of timeline.visual) {
      const key = imageKey(clip);
      if (!jobs.has(key)) jobs.set(key, { clip, name: `${jobs.size + 1}_${clip.fit}.png` });
    }
    await mkdir(join(temp, "assets", "image"), { recursive: true });
    await inParallel([...jobs.entries()], IMAGE_JOBS, async ([key, { clip, name }]) => {
      const source = media.get(clip.mediaId)!;
      const size =
        source.width && source.height ? { width: source.width, height: source.height } : await probeMedia(source.path);
      if (!size.width || !size.height) throw new Error(`Can't read the size of ${source.path}`);
      const prepared = await prepareImage(
        { path: source.path, width: size.width, height: size.height },
        clip.fit,
        timeline.canvas,
        join(temp, "assets", "image", name),
      );
      images.set(key, { path: join(folderPath, "assets", "image", name), sourcePath: source.path, ...prepared });
    });

    // ---- audio: copied as-is ----
    const audios = new Map<string, DraftAudio>();
    for (const clip of timeline.audio) {
      if (audios.has(clip.mediaId)) continue;
      const source = media.get(clip.mediaId)!;
      const name = `${audios.size + 1}${extname(source.path) || ".mp3"}`;
      await copyFile(source.path, await ensureDir(join(temp, "assets", "audio", name)));
      const durationMs = source.durationMs ?? (await probeMedia(source.path)).durationMs;
      if (!durationMs) throw new Error(`Can't read the length of ${source.path}`);
      audios.set(clip.mediaId, { path: join(folderPath, "assets", "audio", name), sourcePath: source.path, durationMs });
    }

    // ---- draft files ----
    const draftId = randomUUID().toUpperCase();
    const content = buildDraftContent({
      timeline,
      draftId,
      images,
      audios,
      subtitleFont: options.subtitleFont ?? "nunito",
    });
    const draftInfo = JSON.stringify(content, null, 4);
    const now = Date.now();
    const files: Record<string, string> = {
      "draft_info.json": draftInfo,
      // The template's own copies of an empty draft, kept as VectCutAPI leaves them.
      "draft_info.json.bak": JSON.stringify(emptyDraftInfo(), null, 4),
      "template-2.tmp": JSON.stringify(emptyDraftInfo()),
      "template.tmp": JSON.stringify(legacyTemplateTmp()),
      "draft_meta_info.json": JSON.stringify(
        draftMetaInfo({
          draftId: randomUUID().toUpperCase(),
          folderName,
          draftsRoot,
          folderPath,
          createdUs: now * 1000,
          durationUs: content.duration as number,
          timelineSize: Buffer.byteLength(draftInfo),
        }),
      ),
      ...sideFiles(Math.floor(now / 1000)),
    };
    for (const [relative, text] of Object.entries(files)) {
      await writeFile(await ensureDir(join(temp, relative)), text, "utf8");
    }

    await rename(temp, folderPath);
    const tracks = content.tracks as { type: "video" | "audio" | "text" }[];
    return {
      folderName,
      folderPath,
      draftId,
      durationMs: Math.round((content.duration as number) / 1000),
      tracks: {
        video: tracks.filter((t) => t.type === "video").length,
        audio: tracks.filter((t) => t.type === "audio").length,
        text: tracks.filter((t) => t.type === "text").length,
      },
    };
  } catch (error) {
    await rm(temp, { recursive: true, force: true });
    throw error;
  }
}

/** ffmpeg runs at once when preparing images (each is one process, mostly I/O-bound). */
const IMAGE_JOBS = 6;

/** Runs `work` over `items`, at most `limit` at a time; the first failure rejects. */
async function inParallel<T>(items: T[], limit: number, work: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await work(items[next++]!);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

async function ensureDir(filePath: string): Promise<string> {
  await mkdir(dirname(filePath), { recursive: true });
  return filePath;
}
