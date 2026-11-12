import { Router } from "express";
import multer from "multer";
import { requireVideoAccess } from "../../middleware/require-access.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { taskContextFor } from "../../services/ai/task.js";
import { saveFile } from "../../services/storage/files.js";
import type {
  FetchTranscriptRequest,
  ScriptAnalyzeRequest,
  ScriptApproveRequest,
  ScriptFromDocumentRequest,
  ScriptFromIdeaRequest,
  ScriptFromTemplateRequest,
  ScriptSaveTextRequest,
} from "../../../shared/types.js";
import {
  deleteScriptAnalysis,
  getScriptAnalysisById,
  listAnalyzedSummaries,
  listScriptAnalysesLight,
  listVersionsForVideo,
  saveScriptVersion,
  updateDraftScriptText,
} from "./repo.js";
import { analyzeScriptForUser, approveScriptVersion } from "./service.js";
import { writeScriptFromDocuments } from "./sources/document.js";
import { writeScriptFromIdea } from "./sources/idea.js";
import { fetchScriptFromLink } from "./sources/link.js";
import { writeScriptFromTemplate } from "./sources/template.js";
import { MAX_UPLOAD_BYTES, transcribeVideoFile } from "./sources/upload.js";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
});

const MAX_ROSTER_IMAGE_BYTES = 10 * 1024 * 1024;
const uploadRosterImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_ROSTER_IMAGE_BYTES },
});

/** A character or object roster entry's reference photo — just a file store write; the fileId is saved into `characterRoster`/`objectRoster` via /approve or /save-text like any other hand edit. */
router.post(
  "/reference-image",
  requireAuth,
  (req, res, next) => {
    uploadRosterImage.single("file")(req, res, (err: unknown) => {
      if (err) {
        res.status(400).json({ error: errorMessage(err) });
        return;
      }
      next();
    });
  },
  async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: "Chưa chọn ảnh." });
      return;
    }
    if (!req.file.mimetype.startsWith("image/")) {
      res.status(400).json({ error: "Chỉ nhận file ảnh." });
      return;
    }
    const stored = await saveFile(
      req.user!.id,
      "character-reference",
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
    );
    res.json({ fileId: stored.id });
  },
);

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

router.post("/fetch-transcript", requireAuth, requireVideoAccess, async (req, res) => {
  try {
    const body = req.body as FetchTranscriptRequest;
    const { scriptText, frames, origin, noSpeechDetected } =
      await fetchScriptFromLink(body.url, taskContextFor(req.user!.id), {
        useAi: body.useAi ?? true,
        provider: body.provider,
        model: body.model,
        effort: body.effort,
        language: body.language,
      });
    const version = saveScriptVersion(
      req.user!.id,
      "youtube",
      body.url,
      scriptText,
      frames,
      "draft",
      undefined,
      body.videoId,
      // "captions" means the raw captions were kept as-is — no AI call made.
      origin === "captions"
        ? {}
        : { provider: body.provider, model: body.model, language: body.language },
    );
    res.json({
      scriptText,
      frames,
      versionId: version.id,
      origin,
      noSpeechDetected,
      aiDescribed: origin === "framesDescribed",
    });
  } catch (err) {
    res.status(400).json({ error: errorMessage(err) });
  }
});

router.post(
  "/transcribe-upload",
  requireAuth,
  (req, res, next) => {
    upload.single("video")(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
        res.status(400).json({
          error: `File video quá lớn. Giới hạn ${MAX_UPLOAD_BYTES / 1024 / 1024}MB.`,
        });
        return;
      }
      if (err) {
        res.status(400).json({
          error:
            err instanceof Error ? err.message : "Tải file video thất bại.",
        });
        return;
      }
      next();
    });
  },
  // After multer: only now is the multipart `videoId` in req.body.
  requireVideoAccess,
  async (req, res) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "Chưa chọn file video." });
        return;
      }
      const body = req.body as {
        videoId?: string;
        provider?: "openai" | "claude";
        model?: string;
        effort?: "low" | "medium" | "high";
        language?: "vi" | "en";
      };
      const { scriptText, frames, noSpeechDetected, aiDescribed } =
        await transcribeVideoFile(
          req.file.buffer,
          req.file.originalname,
          taskContextFor(req.user!.id),
          {
            describeProvider: body.provider,
            describeModel: body.model,
            describeEffort: body.effort,
            language: body.language,
          },
        );
      const version = saveScriptVersion(
        req.user!.id,
        "import",
        req.file.originalname,
        scriptText,
        frames,
        "draft",
        undefined,
        body.videoId,
        { provider: body.provider, model: body.model, language: body.language },
      );
      res.json({
        scriptText,
        frames,
        versionId: version.id,
        noSpeechDetected,
        aiDescribed,
      });
    } catch (err) {
      res.status(400).json({ error: errorMessage(err) });
    }
  },
);

/** Source "document": AI writes the script from reference documents; saved as a draft. */
router.post("/from-document", requireAuth, requireVideoAccess, async (req, res) => {
  try {
    const body = req.body as ScriptFromDocumentRequest;
    const { scriptText, documentTitles } = await writeScriptFromDocuments(
      req.user!,
      body,
    );
    const version = saveScriptVersion(
      req.user!.id,
      "document",
      documentTitles.join(", "),
      scriptText,
      [],
      "draft",
      undefined,
      body.videoId,
      {
        styleTemplateId: body.styleTemplateId,
        provider: body.provider ?? "claude",
        model: body.model,
        language: body.language ?? "vi",
      },
    );
    res.json({ scriptText, frames: [], versionId: version.id });
  } catch (err) {
    res.status(400).json({ error: errorMessage(err) });
  }
});

/** Source "idea": AI writes the script straight from a short idea; saved as a draft. */
router.post("/from-idea", requireAuth, requireVideoAccess, async (req, res) => {
  try {
    const body = req.body as ScriptFromIdeaRequest;
    const { scriptText } = await writeScriptFromIdea(req.user!, body);
    const version = saveScriptVersion(
      req.user!.id,
      "idea",
      body.idea,
      scriptText,
      [],
      "draft",
      undefined,
      body.videoId,
      {
        styleTemplateId: body.styleTemplateId,
        provider: body.provider ?? "claude",
        model: body.model,
        language: body.language ?? "vi",
      },
    );
    res.json({ scriptText, frames: [], versionId: version.id });
  } catch (err) {
    res.status(400).json({ error: errorMessage(err) });
  }
});

/** Source "template": new script + scenes modelled on an analyzed version; saved as analyzed. */
router.post("/from-template", requireAuth, requireVideoAccess, async (req, res) => {
  try {
    res.json(
      await writeScriptFromTemplate(
        req.user!,
        req.body as ScriptFromTemplateRequest,
      ),
    );
  } catch (err) {
    res.status(400).json({ error: errorMessage(err) });
  }
});

router.post("/analyze", requireAuth, requireVideoAccess, async (req, res) => {
  try {
    res.json(
      await analyzeScriptForUser(req.user!, req.body as ScriptAnalyzeRequest),
    );
  } catch (err) {
    res.status(400).json({ error: errorMessage(err) });
  }
});

/** Auto-save / manual save of hand-edited script text, outside analyze/approve. */
router.post("/save-text", requireAuth, (req, res) => {
  const body = req.body as ScriptSaveTextRequest;
  const isAdmin = req.user!.role === "admin";
  const updated = body.versionId
    ? updateDraftScriptText(req.user!.id, isAdmin, body.versionId, body.scriptText)
    : null;
  if (updated) {
    res.json(updated);
    return;
  }
  const base = body.versionId
    ? getScriptAnalysisById(req.user!.id, isAdmin, body.versionId)
    : null;
  const version = saveScriptVersion(
    req.user!.id,
    base?.sourceType ?? "import",
    base?.sourceUrl,
    body.scriptText,
    base?.frames ?? [],
    "draft",
    undefined,
    body.videoId,
  );
  res.json(version);
});

router.post("/approve", requireAuth, (req, res) => {
  try {
    res.json(approveScriptVersion(req.user!, req.body as ScriptApproveRequest));
  } catch (err) {
    res.status(400).json({ error: errorMessage(err) });
  }
});

/** Analyzed versions (light summaries) to pick as skill examples or video templates. */
router.get("/analyzed", requireAuth, (req, res) => {
  res.json(
    listAnalyzedSummaries(req.user!.id, {
      approvedOnly: req.query.approved === "1",
    }),
  );
});

router.get("/history", requireAuth, requireVideoAccess, (req, res) => {
  const videoId = req.query.videoId;
  if (typeof videoId === "string" && videoId) {
    res.json(listVersionsForVideo(req.user!.id, videoId));
    return;
  }
  // No videoId: a dashboard/admin-style list across every video, so only the
  // light projection (no script text/frames/scenes bodies) is sent.
  res.json(listScriptAnalysesLight(req.user!.id, req.user!.role === "admin"));
});

router.delete("/history/:id", requireAuth, (req, res) => {
  deleteScriptAnalysis(
    req.user!.id,
    req.user!.role === "admin",
    req.params.id as string,
  );
  res.json({ ok: true });
});

export default router;
