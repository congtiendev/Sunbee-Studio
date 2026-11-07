import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../middleware/require-auth.js";
import {
  deleteScriptAnalysis,
  listScriptAnalyses,
  listVersionsForVideo,
  saveScriptVersion,
} from "../services/db/script-analyses-repo.js";
import { getTemplateById } from "../services/db/style-templates-repo.js";
import { analyzeScriptWithClaude } from "../services/script/analyze-script-claude.js";
import { analyzeScript } from "../services/script/analyze-script.js";
import {
  downloadVideoForFrames,
  fetchTranscriptFromVideoUrl,
} from "../services/script/fetch-transcript.js";
import { transcribeVideoFile } from "../services/script/transcribe-video.js";
import { getSettings } from "../settings-store.js";
import type { FetchTranscriptRequest, ScriptAnalyzeRequest } from "../../shared/types.js";

const router = Router();

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // OpenAI's transcription API size cap
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
});

router.post("/fetch-transcript", requireAuth, async (req, res) => {
  try {
    const body = req.body as FetchTranscriptRequest;
    const [scriptText, frames] = await Promise.all([
      fetchTranscriptFromVideoUrl(body.url),
      downloadVideoForFrames(body.url),
    ]);
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
    res.json({ scriptText, frames, versionId: version.id });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
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
          error: err instanceof Error ? err.message : "Tải file video thất bại.",
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
      const settings = getSettings(req.user!.id);
      if (!settings.openaiApiKey) {
        res.status(400).json({
          error: "Chưa thiết lập OpenAI API key. Vào Settings để nhập key trước.",
        });
        return;
      }
      const body = req.body as {
        videoId?: string;
        provider?: "openai" | "claude";
        model?: string;
        language?: "vi" | "en";
      };
      const { scriptText, frames, noSpeechDetected, aiDescribed } = await transcribeVideoFile(
        req.file.buffer,
        req.file.originalname,
        settings.openaiApiKey,
        settings.anthropicApiKey,
        body.provider,
        body.model,
        body.language,
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
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  },
);

router.post("/analyze", requireAuth, async (req, res) => {
  try {
    const body = req.body as ScriptAnalyzeRequest;
    const provider = body.provider ?? "openai";
    const settings = getSettings(req.user!.id);
    const apiKey =
      provider === "claude" ? settings.anthropicApiKey : settings.openaiApiKey;
    if (!apiKey) {
      res.status(400).json({
        error:
          provider === "claude"
            ? "Chưa thiết lập Anthropic API key. Vào Settings để nhập key trước."
            : "Chưa thiết lập OpenAI API key. Vào Settings để nhập key trước.",
      });
      return;
    }
    const styleTemplate = body.styleTemplateId
      ? (getTemplateById(
          req.user!.id,
          req.user!.role === "admin",
          body.styleTemplateId,
        ) ?? undefined)
      : undefined;
    const result =
      provider === "claude"
        ? await analyzeScriptWithClaude(
            body.scriptText,
            apiKey,
            styleTemplate,
            body.frames ?? [],
            body.model,
            body.effort,
          )
        : await analyzeScript(
            body.scriptText,
            apiKey,
            styleTemplate,
            body.frames ?? [],
            body.model,
            body.effort,
          );
    const version = saveScriptVersion(
      req.user!.id,
      body.sourceType ?? "import",
      body.sourceUrl,
      body.scriptText,
      body.frames ?? [],
      "analyzed",
      result,
      body.videoId,
    );
    res.json({ ...result, versionId: version.id });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
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
