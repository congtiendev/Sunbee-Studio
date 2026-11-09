import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../../middleware/require-auth.js";
import { taskContextFor } from "../../services/ai/task.js";
import type {
  FetchTranscriptRequest,
  ScriptAnalyzeRequest,
  ScriptApproveRequest,
  ScriptFromDocumentRequest,
  ScriptFromIdeaRequest,
  ScriptFromTemplateRequest,
} from "../../../shared/types.js";
import {
  deleteScriptAnalysis,
  listAnalyzedSummaries,
  listScriptAnalyses,
  listVersionsForVideo,
  saveScriptVersion,
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

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

router.post("/fetch-transcript", requireAuth, async (req, res) => {
  try {
    const body = req.body as FetchTranscriptRequest;
    const { scriptText, frames, origin, noSpeechDetected } =
      await fetchScriptFromLink(body.url, taskContextFor(req.user!.id), {
        useAi: body.useAi ?? true,
        provider: body.provider,
        model: body.model,
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
router.post("/from-document", requireAuth, async (req, res) => {
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
    );
    res.json({ scriptText, frames: [], versionId: version.id });
  } catch (err) {
    res.status(400).json({ error: errorMessage(err) });
  }
});

/** Source "idea": AI writes the script straight from a short idea; saved as a draft. */
router.post("/from-idea", requireAuth, async (req, res) => {
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
    );
    res.json({ scriptText, frames: [], versionId: version.id });
  } catch (err) {
    res.status(400).json({ error: errorMessage(err) });
  }
});

/** Source "template": new script + scenes modelled on an analyzed version; saved as analyzed. */
router.post("/from-template", requireAuth, async (req, res) => {
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

router.post("/analyze", requireAuth, async (req, res) => {
  try {
    res.json(
      await analyzeScriptForUser(req.user!, req.body as ScriptAnalyzeRequest),
    );
  } catch (err) {
    res.status(400).json({ error: errorMessage(err) });
  }
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

router.get("/history", requireAuth, (req, res) => {
  const videoId = req.query.videoId;
  if (typeof videoId === "string" && videoId) {
    res.json(listVersionsForVideo(req.user!.id, videoId));
    return;
  }
  res.json(listScriptAnalyses(req.user!.id, req.user!.role === "admin"));
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
