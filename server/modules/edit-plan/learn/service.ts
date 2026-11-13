import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalizeEditRecipe } from "../../../../shared/edit-recipe.js";
import type { EditStyleLearnRequest, EditStyleLearnResponse } from "../../../../shared/edit-plan.js";
import type { User } from "../../../../shared/types.js";
import { MissingApiKeyError, hasProviderKey, runTask, taskContextFor } from "../../../services/ai/task.js";
import { getTemplateById, saveTemplate, updateTemplate } from "../../../services/db/style-templates-repo.js";
import { downloadVideo } from "../../script/media/fetch-transcript.js";
import { learnStyleTask } from "../tasks/learn-style.js";
import { styleSheets } from "./frames.js";
import { measureVideo, type VideoMeasurements } from "./measure.js";

type Caller = Pick<User, "id" | "role">;

/** Above this many reveals a minute, shots are built up element by element. */
const SEQUENTIAL_REVEALS_PER_MINUTE = 4;

/** The measured facts, appended to the guide so the AI breaking down a new script sees real numbers. */
function measuredFacts(m: VideoMeasurements): string {
  return [
    "Số đo từ video mẫu:",
    `- Shot dài trung bình ${m.shotSec.mean}s (trung vị ${m.shotSec.median}s, từ ${m.shotSec.p10}s đến ${m.shotSec.p90}s), ${m.cutsPerMinute} lần cắt/phút.`,
    `- ${m.revealsPerMinute} lần hiện thêm phần tử/phút giữa các lần cắt.`,
    `- ${m.cutInPausePct}% điểm cắt nằm ở quãng nghỉ của giọng (ngẫu nhiên: ${m.pauseBaselinePct}%).`,
    m.musicLikely
      ? `- Nhạc nền chạy suốt, thấp hơn giọng khoảng ${Math.round(m.speechDb - m.floorDb)} dB.`
      : "- Không có nhạc nền chạy suốt dưới giọng.",
  ].join("\n");
}

/**
 * Learns an editing skill from a sample video: downloads it (yt-dlp),
 * measures its pacing and sound (ffmpeg), shows an AI contact sheets of its
 * frames, and saves the result as a type "editing" skill — its guide
 * (`editingStyle`, for the scene breakdown) and recipe (`editRecipe`, for the
 * edit plan). Measured facts win over the AI's reading where both exist.
 */
export async function learnEditingStyle(caller: Caller, req: EditStyleLearnRequest): Promise<EditStyleLearnResponse> {
  const admin = caller.role === "admin";
  const url = req.url?.trim();
  if (!url) throw new Error("Thiếu link video mẫu.");
  const existing = req.skillId ? getTemplateById(caller.id, admin, req.skillId) : null;
  if (req.skillId && existing?.type !== "editing") throw new Error("Không tìm thấy skill dựng này.");
  const provider = req.provider ?? "claude";
  const ctx = taskContextFor(caller.id);
  if (!hasProviderKey(ctx, provider)) throw new MissingApiKeyError(provider);

  const dir = await mkdtemp(join(tmpdir(), "sunbee-style-"));
  try {
    const video = await downloadVideo(url, dir);
    if (!video) throw new Error("Không tải được video mẫu (link không được hỗ trợ, video riêng tư hoặc quá lớn).");
    const measurements = await measureVideo(video);
    const sheets = await styleSheets(video, measurements, join(dir, "sheets"));
    const out = await runTask(
      learnStyleTask,
      {
        sheets,
        measurements,
        source: url,
        currentGuide: existing?.editingStyle,
        provider,
        model: req.model,
        effort: req.effort,
      },
      ctx,
    );

    const editRecipe = normalizeEditRecipe({
      camera: { motion: out.cameraMotion, intensity: 1 },
      reveal: {
        mode: measurements.revealsPerMinute >= SEQUENTIAL_REVEALS_PER_MINUTE ? "sequential" : "together",
        animation: out.revealAnimation,
        durationMs: out.revealDurationMs,
        leadMs: out.revealLeadMs,
      },
      text: { animation: out.textAnimation, durationMs: out.textDurationMs },
      subtitles: { enabled: out.burnedSubtitles },
      music: { volumeDb: measurements.musicLikely ? Math.round(measurements.floorDb - measurements.speechDb) : -20 },
    });
    const editingStyle = `${out.editingGuide.trim()}\n\n${measuredFacts(measurements)}`;
    const pacing = { avgShotLengthSec: measurements.shotSec.mean, cutsPerMinute: measurements.cutsPerMinute };

    const skill = existing
      ? updateTemplate(caller.id, admin, existing.id, { editingStyle, editRecipe, pacing })!
      : saveTemplate(caller.id, {
          name: req.name?.trim() || "Phong cách dựng (từ video mẫu)",
          type: "editing",
          genre: "",
          styleTags: [],
          pacing,
          toneDescription: "",
          resourceInventory: { learnedFrom: url },
          description: out.summary,
          editingStyle,
          editRecipe,
        });
    const { cuts: _cuts, reveals: _reveals, ...summaryMeasurements } = measurements;
    return { skill, summary: out.summary, effects: out.effects, measurements: summaryMeasurements };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
