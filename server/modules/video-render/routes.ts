import { Router, type Request, type Response } from "express";
import multer from "multer";
import { isFrameRatio } from "../../../shared/frame-ratio.js";
import type { RenderProject, RenderProjectUpdate, RenderSourceOptions } from "../../../shared/types.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { hasProviderKey, taskContextFor } from "../../services/ai/task.js";
import { deleteFile } from "../../services/storage/files.js";
import { cancelRenderJob, getRenderJob, isRenderRunning, startAutoJob, startRenderJob } from "./jobs.js";
import { grantedFile } from "./media-grants.js";
import { MAX_UPLOAD_BYTES } from "../script/sources/upload.js";
import {
  createRenderProject,
  deleteRenderProject,
  getRenderProject,
  listRenderProjects,
  listVideoRenders,
  SOURCE_MODES,
  updateRenderProject,
} from "./repo.js";
import {
  RENDER_SCRIPT_SOURCES,
  scriptFromSource,
  scriptFromUpload,
  type RenderScriptSource,
} from "./script-sources.js";
import { planScenes } from "./plan.js";

const router = Router();

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES } });

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const isAdmin = (req: Request) => req.user!.role === "admin";

/** The `:id` project if the caller may work on it; otherwise answers 404 and returns null. */
function projectOr404(req: Request, res: Response): RenderProject | null {
  const project = getRenderProject(req.user!.id, isAdmin(req), req.params.id as string);
  if (!project) res.status(404).json({ error: "Không tìm thấy bản dựng." });
  return project;
}

function sanitizeSourceOptions(input: Record<string, unknown>): RenderSourceOptions {
  const text = (value: unknown) => (typeof value === "string" ? value : undefined);
  return {
    url: text(input.url),
    linkUseAi: typeof input.linkUseAi === "boolean" ? input.linkUseAi : undefined,
    documentIds: Array.isArray(input.documentIds)
      ? input.documentIds.filter((id): id is string => typeof id === "string")
      : undefined,
    brief: text(input.brief),
    templateVersionId: text(input.templateVersionId),
    topic: text(input.topic),
    styleTemplateId: text(input.styleTemplateId),
    language: input.language === "en" ? "en" : input.language === "vi" ? "vi" : undefined,
    provider: input.provider === "openai" ? "openai" : input.provider === "claude" ? "claude" : undefined,
    model: text(input.model),
    effort: input.effort === "low" || input.effort === "medium" || input.effort === "high" ? input.effort : undefined,
  };
}

/** Keeps only well-formed fields from a client patch (anything else is ignored). */
function sanitizeUpdate(body: unknown): RenderProjectUpdate {
  const input = (body ?? {}) as Record<string, unknown>;
  const patch: RenderProjectUpdate = {};
  if (typeof input.name === "string" && input.name.trim()) patch.name = input.name.trim();
  if (isFrameRatio(input.frameRatio)) patch.frameRatio = input.frameRatio;
  if (SOURCE_MODES.includes(input.sourceMode as RenderProject["sourceMode"])) {
    patch.sourceMode = input.sourceMode as RenderProject["sourceMode"];
  }
  if (input.sourceOptions && typeof input.sourceOptions === "object") {
    patch.sourceOptions = sanitizeSourceOptions(input.sourceOptions as Record<string, unknown>);
  }
  if (typeof input.ideaText === "string") patch.ideaText = input.ideaText;
  if (input.targetDurationSec === null || (typeof input.targetDurationSec === "number" && input.targetDurationSec > 0)) {
    patch.targetDurationSec = input.targetDurationSec === null ? null : Math.round(input.targetDurationSec);
  }
  if (typeof input.scriptText === "string") patch.scriptText = input.scriptText;
  if (Array.isArray(input.scenes)) patch.scenes = input.scenes as RenderProjectUpdate["scenes"];
  if (Array.isArray(input.audio)) patch.audio = input.audio as RenderProjectUpdate["audio"];
  return patch;
}

router.get("/projects", requireAuth, (req, res) => {
  res.json(listRenderProjects(req.user!.id, isAdmin(req)));
});

router.post("/projects", requireAuth, (req, res) => {
  const name = (req.body as { name?: unknown }).name;
  if (typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "Thiếu tên bản dựng." });
    return;
  }
  const id = createRenderProject(req.user!.id, name.trim());
  res.json(getRenderProject(req.user!.id, isAdmin(req), id));
});

router.get("/projects/:id", requireAuth, (req, res) => {
  const project = projectOr404(req, res);
  if (project) res.json(project);
});

router.patch("/projects/:id", requireAuth, (req, res) => {
  const project = projectOr404(req, res);
  if (!project) return;
  updateRenderProject(project.id, sanitizeUpdate(req.body));
  res.json(getRenderProject(req.user!.id, isAdmin(req), project.id));
});

router.delete("/projects/:id", requireAuth, async (req, res) => {
  const project = projectOr404(req, res);
  if (!project) return;
  if (getRenderJob(project.id)?.status === "running") {
    res.status(409).json({ error: "Bản dựng đang được xuất — đợi xong rồi xoá." });
    return;
  }
  for (const fileId of deleteRenderProject(project.id)) {
    await deleteFile(req.user!.id, isAdmin(req), fileId);
  }
  res.json({ ok: true });
});

/** Transcribes an uploaded video/audio file into the project's script (Studio's upload source; nothing saved in the Studio). */
router.post(
  "/projects/:id/script/upload",
  requireAuth,
  (req, res, next) => {
    upload.single("file")(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
        res.status(400).json({ error: `File quá lớn. Giới hạn ${MAX_UPLOAD_BYTES / 1024 / 1024}MB.` });
        return;
      }
      if (err) {
        res.status(400).json({ error: errorMessage(err) });
        return;
      }
      next();
    });
  },
  async (req, res) => {
    const project = projectOr404(req, res);
    if (!project) return;
    if (!req.file) {
      res.status(400).json({ error: "Chưa chọn file." });
      return;
    }
    try {
      const scriptText = await scriptFromUpload(req.user!, project, req.file);
      updateRenderProject(project.id, { scriptText });
      res.json(getRenderProject(req.user!.id, isAdmin(req), project.id));
    } catch (err) {
      res.status(400).json({ error: errorMessage(err) });
    }
  },
);

/** Gets the script from one of the Studio's sources (link, document, idea, template) into the project — nothing saved in the Studio. */
router.post("/projects/:id/script/:source", requireAuth, async (req, res) => {
  const project = projectOr404(req, res);
  if (!project) return;
  const source = req.params.source as RenderScriptSource;
  if (!RENDER_SCRIPT_SOURCES.includes(source)) {
    res.status(404).json({ error: "Không có nguồn kịch bản này." });
    return;
  }
  try {
    const scriptText = await scriptFromSource(req.user!, project, source);
    updateRenderProject(project.id, { scriptText });
    res.json(getRenderProject(req.user!.id, isAdmin(req), project.id));
  } catch (err) {
    res.status(400).json({ error: errorMessage(err) });
  }
});

/** Storyboards the script into scenes (Claude + the video-shotcraft skill when available), replacing the current scenes. */
router.post("/projects/:id/split-scenes", requireAuth, async (req, res) => {
  const project = projectOr404(req, res);
  if (!project) return;
  try {
    const scenes = await planScenes(req.user!.id, project);
    updateRenderProject(project.id, { scenes });
    res.json(getRenderProject(req.user!.id, isAdmin(req), project.id));
  } catch (err) {
    res.status(400).json({ error: errorMessage(err) });
  }
});

/**
 * Starts rendering the project to an MP4 in the background (a long video
 * takes far longer than a request should stay open) and answers right away;
 * the page polls `/render-status`. Saved under the project's owner.
 */
router.post("/projects/:id/render", requireAuth, (req, res) => {
  const project = projectOr404(req, res);
  if (!project) return;
  if (project.scenes.length === 0) {
    res.status(400).json({ error: "Chưa có cảnh nào để xuất." });
    return;
  }
  if (isRenderRunning()) {
    res.status(409).json({ error: "Đang chạy một việc xuất video khác — đợi xong rồi thử lại." });
    return;
  }
  res.status(202).json(startRenderJob(req.user!, project.id));
});

/**
 * The hands-off flow, in the background: Claude storyboards the script with
 * the video-shotcraft skill (when there are no scenes yet), finds a picture
 * on the web for each scene, then the MP4 is rendered.
 */
router.post("/projects/:id/auto", requireAuth, (req, res) => {
  const project = projectOr404(req, res);
  if (!project) return;
  if (project.scenes.length === 0 && !project.scriptText.trim()) {
    res.status(400).json({ error: "Kịch bản đang trống." });
    return;
  }
  if (!hasProviderKey(taskContextFor(req.user!.id), "claude")) {
    res.status(400).json({ error: "Làm video tự động cần Anthropic (Claude) API key — thêm trong Cài đặt." });
    return;
  }
  if (isRenderRunning()) {
    res.status(409).json({ error: "Đang chạy một việc xuất video khác — đợi xong rồi thử lại." });
    return;
  }
  res.status(202).json(startAutoJob(req.user!, project.id));
});

/** Stops the project's running render/auto job. */
router.post("/projects/:id/cancel", requireAuth, (req, res) => {
  const project = projectOr404(req, res);
  if (project) res.json({ cancelled: cancelRenderJob(project.id) });
});

/** The project's latest render job (running, or how the last one ended) — null when none since the server started. */
router.get("/projects/:id/render-status", requireAuth, (req, res) => {
  const project = projectOr404(req, res);
  if (project) res.json(getRenderJob(project.id));
});

/** Render history, newest first. */
router.get("/projects/:id/renders", requireAuth, (req, res) => {
  const project = projectOr404(req, res);
  if (project) res.json(listVideoRenders(project.id));
});

/**
 * Serves a render's images/audio to Remotion's headless Chrome, which has no
 * session cookie — so no `requireAuth`: the per-render token (see
 * media-grants.ts) is the access check, and only local requests are served.
 */
router.get("/media/:token/:fileId", (req, res) => {
  const file = LOOPBACK.has(req.socket.remoteAddress ?? "")
    ? grantedFile(req.params.token, req.params.fileId)
    : null;
  if (!file) {
    res.status(404).json({ error: "Không tìm thấy file." });
    return;
  }
  res.setHeader("Content-Type", file.mime);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.sendFile(file.absolutePath);
});

export default router;
