import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { IMAGE_SHOT_KINDS } from "../../../shared/render.js";
import type { RenderManifest, RenderProject, RenderScene, VideoRenderJob } from "../../../shared/types.js";
import { PORT } from "../../env.js";
import { taskContextFor } from "../../services/ai/task.js";
import { logger } from "../../services/logger.js";
import { findResearchSource } from "../../services/research/registry.js";
import type { Caller } from "../../services/skills/skills.js";
import { getFileForUser, saveFile } from "../../services/storage/files.js";
import { createLibraryAsset } from "../assets/repo.js";
import { buildManifest } from "./build.js";
import { grantMedia, type GrantedFile } from "./media-grants.js";
import { planScenes } from "./plan.js";
import { getRenderProject, insertVideoRender, renderProjectOwner, updateRenderProject } from "./repo.js";

/** The latest job per project (finished ones stay until the next one, so the page can read the outcome). */
const jobs = new Map<string, VideoRenderJob>();
const aborts = new Map<string, AbortController>();

/** Claude's web image search (registered by the assets module) — the only picture source the automatic flow uses. */
const IMAGE_SOURCE = "claude-image-search";
const IMAGE_SEARCH_CONCURRENCY = 3;
/** Candidates tried per scene before giving up on it (hotlinked images often refuse or 404). */
const CANDIDATES_PER_SCENE = 6;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);

class CancelledError extends Error {}

export function getRenderJob(projectId: string): VideoRenderJob | null {
  return jobs.get(projectId) ?? null;
}

/** One job at a time: a render runs a headless Chrome + encoder flat out, and image search fans out AI calls. */
export function isRenderRunning(): boolean {
  return [...jobs.values()].some((job) => job.status === "running");
}

/** Stops the project's running job at its next step (mid-render included). */
export function cancelRenderJob(projectId: string): boolean {
  const controller = aborts.get(projectId);
  if (!controller || jobs.get(projectId)?.status !== "running") return false;
  controller.abort();
  return true;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function loadProject(caller: Caller, projectId: string): RenderProject {
  const project = getRenderProject(caller.id, caller.role === "admin", projectId);
  if (!project) throw new Error("Không tìm thấy bản dựng.");
  return project;
}

function startJob(
  projectId: string,
  kind: VideoRenderJob["kind"],
  stage: VideoRenderJob["stage"],
  run: (job: VideoRenderJob, signal: AbortSignal) => Promise<void>,
): VideoRenderJob {
  const job: VideoRenderJob = { projectId, kind, stage, status: "running", progress: 0, startedAt: new Date().toISOString() };
  const controller = new AbortController();
  jobs.set(projectId, job);
  aborts.set(projectId, controller);
  const startedAt = Date.now();
  void run(job, controller.signal)
    .then(() => {
      job.status = "done";
      logger.info("video render job done", { projectId, kind, tookMs: Date.now() - startedAt });
    })
    .catch((err: unknown) => {
      if (controller.signal.aborted || err instanceof CancelledError) {
        job.status = "cancelled";
        return;
      }
      job.status = "failed";
      job.error = errorMessage(err);
      logger.error("video render job failed", { projectId, kind, stage: job.stage, error: job.error });
    })
    .finally(() => aborts.delete(projectId));
  return job;
}

/** Starts rendering the saved project to an MP4 in the background; returns the job right away. */
export function startRenderJob(caller: Caller, projectId: string): VideoRenderJob {
  return startJob(projectId, "render", "rendering", (job, signal) => renderStage(job, caller, loadProject(caller, projectId), signal));
}

/**
 * The hands-off flow: storyboard the script with the video-shotcraft skill
 * (only when the project has no scenes yet — hand-made scenes are kept), find
 * a picture on the web for every scene that needs one and has none, then
 * render. Scenes whose picture can't be found render as text.
 */
export function startAutoJob(caller: Caller, projectId: string): VideoRenderJob {
  const project = loadProject(caller, projectId);
  return startJob(projectId, "auto", project.scenes.length === 0 ? "directing" : "images", async (job, signal) => {
    let current = project;
    if (current.scenes.length === 0) {
      job.stage = "directing";
      const scenes = await planScenes(caller.id, current);
      signal.throwIfAborted();
      updateRenderProject(projectId, { scenes });
      current = loadProject(caller, projectId);
    }

    job.stage = "images";
    job.progress = 0;
    await findMissingImages(job, caller, current, signal);

    job.stage = "rendering";
    job.progress = 0;
    await renderStage(job, caller, loadProject(caller, projectId), signal);
  });
}

function needsImage(scene: RenderScene): boolean {
  return !scene.imageFileId && IMAGE_SHOT_KINDS.includes(scene.shotKind);
}

async function findMissingImages(job: VideoRenderJob, caller: Caller, project: RenderProject, signal: AbortSignal) {
  const source = findResearchSource(IMAGE_SOURCE);
  if (!source) throw new Error("Thiếu nguồn tìm ảnh Claude trên web.");
  const targets = project.scenes.map((scene, index) => ({ scene, index })).filter(({ scene }) => needsImage(scene));
  job.imagesTotal = targets.length;
  job.imagesDone = 0;
  job.imagesFailed = 0;
  const ai = taskContextFor(caller.id);
  const isAdmin = caller.role === "admin";

  let next = 0;
  const worker = async () => {
    while (next < targets.length) {
      if (signal.aborted) throw new CancelledError();
      const { scene, index } = targets[next++]!;
      const query = scene.imageHint.trim() || scene.text;
      let fileId: string | null = null;
      try {
        const { candidates } = await source.search(
          { query, mediaType: "image" },
          { userId: caller.id, isAdmin, ai, description: query, sceneContext: scene.text, frameRatio: project.frameRatio },
        );
        for (const candidate of candidates.slice(0, CANDIDATES_PER_SCENE)) {
          if (signal.aborted) throw new CancelledError();
          fileId = await keepImage(caller, project, candidate.url, candidate.title || query, query, candidate.pageUrl);
          if (fileId) break;
        }
      } catch (err) {
        if (err instanceof CancelledError) throw err;
        logger.warn("video render image search failed", { projectId: project.id, scene: index, error: errorMessage(err) });
      }
      if (fileId) setSceneImage(caller, project.id, index, scene.text, fileId);
      else job.imagesFailed! += 1;
      job.imagesDone! += 1;
      job.progress = job.imagesDone! / Math.max(1, job.imagesTotal!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(IMAGE_SEARCH_CONCURRENCY, targets.length) }, worker));
}

/** Downloads one found image into the caller's library; null when it isn't a usable image. */
async function keepImage(
  caller: Caller,
  project: RenderProject,
  url: string,
  title: string,
  query: string,
  pageUrl: string | undefined,
): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000), redirect: "follow" });
    if (!res.ok) return null;
    const mime = (res.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
    if (!IMAGE_MIMES.has(mime)) return null;
    const declared = Number(res.headers.get("content-length"));
    if (declared > MAX_IMAGE_BYTES) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) return null;
    const name = title.slice(0, 120);
    const stored = await saveFile(caller.id, "asset", buffer, name, mime);
    createLibraryAsset(caller.id, {
      fileId: stored.id,
      mediaType: "image",
      name,
      tags: ["video-render", project.name],
      description: [query, pageUrl && `Nguồn: ${pageUrl}`].filter(Boolean).join("\n"),
    });
    return stored.id;
  } catch {
    return null;
  }
}

/** Sets a found picture on a scene — re-read so concurrent finds don't overwrite each other; skipped if the scene changed meanwhile. */
function setSceneImage(caller: Caller, projectId: string, index: number, text: string, fileId: string) {
  const project = loadProject(caller, projectId);
  const scene = project.scenes[index];
  if (!scene || scene.text !== text) return;
  const scenes = project.scenes.map((s, i) => (i === index ? { ...s, imageFileId: fileId } : s));
  updateRenderProject(projectId, { scenes });
}

async function renderStage(job: VideoRenderJob, caller: Caller, project: RenderProject, signal: AbortSignal) {
  if (project.scenes.length === 0) throw new Error("Chưa có cảnh nào để xuất.");
  const manifest = buildManifest(project);
  const ownerId = renderProjectOwner(project.id) ?? caller.id;
  const files = collectFiles(caller, manifest);
  const { token, revoke } = grantMedia(files);
  const base = `http://127.0.0.1:${PORT}/api/video-render/media/${token}`;
  const sources = Object.fromEntries([...files.keys()].map((id) => [id, `${base}/${id}`]));
  let workDir: string | null = null;
  try {
    // Loaded on first render, not at server start: Remotion pulls in webpack and its own native binaries.
    const { renderToFile } = await import("./renderer.js");
    workDir = await mkdtemp(path.join(tmpdir(), "sunbee-render-"));
    const output = path.join(workDir, "video.mp4");
    let loggedStep = -1;
    await renderToFile(
      { manifest, sources },
      output,
      (progress) => {
        job.progress = progress;
        const step = Math.floor(progress * 10);
        if (step > loggedStep) {
          loggedStep = step;
          logger.info("video render progress", { projectId: project.id, percent: step * 10 });
        }
      },
      signal,
    );
    const buffer = await readFile(output);
    const stored = await saveFile(ownerId, "render", buffer, `${project.name}.mp4`, "video/mp4");
    const durationMs = Math.round((manifest.totalDurationInFrames / manifest.fps) * 1000);
    job.render = insertVideoRender(ownerId, project.id, stored.id, manifest, durationMs);
    job.progress = 1;
  } finally {
    revoke();
    if (workDir) await rm(workDir, { recursive: true, force: true });
  }
}

function manifestFileIds(manifest: RenderManifest): Set<string> {
  return new Set([
    ...manifest.clips.flatMap((clip) => (clip.imageFileId ? [clip.imageFileId] : [])),
    ...manifest.audio.map((cue) => cue.fileId),
  ]);
}

/** Only files the caller may read go into the render; a missing one leaves its clip text-only / its cue silent. */
function collectFiles(caller: Caller, manifest: RenderManifest): Map<string, GrantedFile> {
  const files = new Map<string, GrantedFile>();
  for (const fileId of manifestFileIds(manifest)) {
    const file = getFileForUser(caller.id, caller.role === "admin", fileId);
    if (file) files.set(fileId, { absolutePath: file.absolutePath, mime: file.mime });
  }
  return files;
}
