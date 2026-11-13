import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../../middleware/require-auth.js";
import type { VoicePreviewRequest } from "../../../shared/types.js";
import { installPreset, listPresets, previewPreset } from "../../services/voice/presets.js";
import { createLocalVoiceEngine, separateVocals } from "../../services/voice/providers/local-engine.js";
import { deleteFile, getFileForUser, saveFile } from "../../services/storage/files.js";
import { createVoiceProfile, deleteVoiceProfile, getVoiceProfile, listVoiceProfiles } from "./repo.js";

/** Voice library: voices cloned from a reference sample or picked from the built-in catalog, for lồng tiếng. */
const router = Router();

const MAX_SAMPLE_BYTES = 20 * 1024 * 1024;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_SAMPLE_BYTES } });

const MAX_SONG_BYTES = 30 * 1024 * 1024;
const uploadSong = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_SONG_BYTES } });

/** Songs longer than this are rejected before wasting CPU on separation. */
const MAX_SONG_DURATION_SEC = 10 * 60;

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** ffprobe is expected on PATH, same convention as `server/modules/script/media`. */
function probeDurationSec(filePath: string): Promise<number | null> {
  return new Promise((resolve) => {
    const child = spawn("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath,
    ]);
    let out = "";
    child.stdout.on("data", (chunk: Buffer) => (out += chunk.toString()));
    child.stderr.resume(); // drain so "-v error" output can't block the pipe
    child.on("error", () => resolve(null));
    child.on("exit", (code) => {
      const seconds = Number(out.trim());
      resolve(code === 0 && Number.isFinite(seconds) ? seconds : null);
    });
  });
}

router.get("/profiles", requireAuth, (req, res) => {
  res.json(listVoiceProfiles(req.user!.id));
});

router.post(
  "/profiles",
  requireAuth,
  (req, res, next) => {
    upload.single("sample")(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
        res.status(400).json({
          error: `File quá lớn. Giới hạn ${MAX_SAMPLE_BYTES / 1024 / 1024}MB.`,
        });
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
    const name = (req.body as { name?: string }).name?.trim();
    if (!name) {
      res.status(400).json({ error: "Vui lòng nhập tên giọng nói." });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: "Chưa chọn file mẫu giọng nói." });
      return;
    }
    if (!req.file.mimetype.startsWith("audio/")) {
      res.status(400).json({ error: "Chỉ nhận file âm thanh." });
      return;
    }
    try {
      const stored = await saveFile(
        req.user!.id,
        "voice-sample",
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype,
      );
      res.json(createVoiceProfile(req.user!.id, name, stored.id));
    } catch (err) {
      res.status(400).json({ error: errorMessage(err) });
    }
  },
);

router.delete("/profiles/:id", requireAuth, async (req, res) => {
  const fileId = deleteVoiceProfile(req.user!.id, req.params.id as string);
  if (fileId === undefined) {
    res.status(404).json({ error: "Không tìm thấy giọng nói này." });
    return;
  }
  if (fileId) await deleteFile(req.user!.id, req.user!.role === "admin", fileId);
  res.json({ ok: true });
});

router.post("/profiles/:id/preview", requireAuth, async (req, res) => {
  const profile = getVoiceProfile(req.user!.id, req.params.id as string);
  if (!profile) {
    res.status(404).json({ error: "Không tìm thấy giọng nói này." });
    return;
  }
  const { text } = req.body as VoicePreviewRequest;
  if (!text?.trim()) {
    res.status(400).json({ error: "Vui lòng nhập văn bản để đọc thử." });
    return;
  }
  try {
    let sampleAudioPath: string | undefined;
    if (profile.sampleFileId) {
      const sample = getFileForUser(req.user!.id, req.user!.role === "admin", profile.sampleFileId);
      if (!sample) throw new Error("Không tìm thấy file mẫu giọng nói.");
      sampleAudioPath = sample.absolutePath;
    }
    const wav = await createLocalVoiceEngine().synthesize({
      text: text.trim(),
      sampleAudioPath,
      presetVoiceId: profile.presetVoiceId,
    });
    res.setHeader("Content-Type", "audio/wav");
    res.send(wav);
  } catch (err) {
    res.status(502).json({ error: errorMessage(err) });
  }
});

router.get("/presets", requireAuth, async (req, res) => {
  try {
    res.json(await listPresets(req.user!.id));
  } catch (err) {
    res.status(500).json({ error: errorMessage(err) });
  }
});

router.post("/presets/:id/install", requireAuth, async (req, res) => {
  try {
    res.json(await installPreset(req.user!.id, req.params.id as string));
  } catch (err) {
    res.status(400).json({ error: errorMessage(err) });
  }
});

/** Reads `text` aloud in a catalog voice, before installing it. */
router.post("/presets/:id/preview", requireAuth, async (req, res) => {
  const { text } = req.body as VoicePreviewRequest;
  if (!text?.trim()) {
    res.status(400).json({ error: "Vui lòng nhập câu mẫu để đọc thử." });
    return;
  }
  try {
    const wav = await previewPreset(req.params.id as string, text.trim());
    if (!wav) {
      res.status(404).json({ error: "Không tìm thấy giọng này trong catalog." });
      return;
    }
    res.setHeader("Content-Type", "audio/wav");
    res.send(wav);
  } catch (err) {
    res.status(502).json({ error: errorMessage(err) });
  }
});

/** Isolates the vocal track from an uploaded song; returns it as a playable WAV, not persisted. */
router.post(
  "/separate-vocals",
  requireAuth,
  (req, res, next) => {
    uploadSong.single("song")(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
        res.status(400).json({
          error: `File quá lớn. Giới hạn ${MAX_SONG_BYTES / 1024 / 1024}MB.`,
        });
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
    if (!req.file) {
      res.status(400).json({ error: "Chưa chọn file bài hát." });
      return;
    }
    if (!req.file.mimetype.startsWith("audio/")) {
      res.status(400).json({ error: "Chỉ nhận file âm thanh." });
      return;
    }
    const dir = await mkdtemp(join(tmpdir(), "sunbee-voice-"));
    try {
      const songPath = join(dir, req.file.originalname || "song");
      await writeFile(songPath, req.file.buffer);
      const durationSec = await probeDurationSec(songPath);
      if (durationSec !== null && durationSec > MAX_SONG_DURATION_SEC) {
        res.status(400).json({
          error: `Bài hát quá dài. Giới hạn ${Math.round(MAX_SONG_DURATION_SEC / 60)} phút.`,
        });
        return;
      }
      const wav = await separateVocals(songPath);
      res.setHeader("Content-Type", "audio/wav");
      res.send(wav);
    } catch (err) {
      res.status(502).json({ error: errorMessage(err) });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
);

export default router;
