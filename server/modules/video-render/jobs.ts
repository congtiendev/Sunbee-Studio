import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { RenderManifest, VideoRenderJob } from "../../../shared/types.js";
import { PORT } from "../../env.js";
import { logger } from "../../services/logger.js";
import { saveFile } from "../../services/storage/files.js";
import { grantMedia, type GrantedFile } from "./media-grants.js";
import { insertVideoRender } from "./repo.js";

/** The latest render job per project (finished ones stay until the next render, so the page can read the outcome). */
const jobs = new Map<string, VideoRenderJob>();

export function getRenderJob(projectId: string): VideoRenderJob | null {
  return jobs.get(projectId) ?? null;
}

/** One render at a time: each one runs a headless Chrome + encoder flat out. */
export function isRenderRunning(): boolean {
  return [...jobs.values()].some((job) => job.status === "running");
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Starts rendering in the background and returns the job right away. `files`
 * are the manifest's images/audio, already access-checked; the MP4 is saved
 * under `ownerId` (the project's owner).
 */
export function startRenderJob(input: {
  projectId: string;
  name: string;
  ownerId: string;
  manifest: RenderManifest;
  files: ReadonlyMap<string, GrantedFile>;
}): VideoRenderJob {
  const job: VideoRenderJob = {
    projectId: input.projectId,
    status: "running",
    progress: 0,
    startedAt: new Date().toISOString(),
  };
  jobs.set(input.projectId, job);
  void runRender(job, input);
  return job;
}

async function runRender(
  job: VideoRenderJob,
  { projectId, name, ownerId, manifest, files }: Parameters<typeof startRenderJob>[0],
): Promise<void> {
  const { token, revoke } = grantMedia(files);
  const base = `http://127.0.0.1:${PORT}/api/video-render/media/${token}`;
  const sources = Object.fromEntries([...files.keys()].map((id) => [id, `${base}/${id}`]));
  const startedAt = Date.now();
  let workDir: string | null = null;

  try {
    // Loaded on first render, not at server start: Remotion pulls in webpack and its own native binaries.
    const { renderToFile } = await import("./renderer.js");
    workDir = await mkdtemp(path.join(tmpdir(), "sunbee-render-"));
    const output = path.join(workDir, "video.mp4");
    let loggedStep = -1;
    await renderToFile({ manifest, sources }, output, (progress) => {
      job.progress = progress;
      const step = Math.floor(progress * 10);
      if (step > loggedStep) {
        loggedStep = step;
        logger.info("video render progress", { projectId, percent: step * 10 });
      }
    });
    const buffer = await readFile(output);
    const stored = await saveFile(ownerId, "render", buffer, `${name}.mp4`, "video/mp4");
    const durationMs = Math.round((manifest.totalDurationInFrames / manifest.fps) * 1000);
    job.render = insertVideoRender(ownerId, projectId, stored.id, manifest, durationMs);
    job.progress = 1;
    job.status = "done";
    logger.info("video rendered", { projectId, tookMs: Date.now() - startedAt, bytes: buffer.length });
  } catch (err) {
    job.status = "failed";
    job.error = errorMessage(err);
    logger.error("video render failed", { projectId, error: job.error });
  } finally {
    revoke();
    if (workDir) await rm(workDir, { recursive: true, force: true });
  }
}
