import type { RenderProject, RenderScene } from "../../../shared/types.js";
import { firstAvailableProvider, hasProviderKey, runTask, taskContextFor } from "../../services/ai/task.js";
import { directRenderTask } from "./tasks/direct.js";
import { splitRenderScenesTask } from "./tasks/split-scenes.js";

/**
 * Storyboards the project's script into scenes: with a Claude key, Claude
 * directs it reading the video-shotcraft skill; with only an OpenAI key, a
 * plain structured split (no skill — skills run on Claude only).
 */
export async function planScenes(callerId: string, project: RenderProject): Promise<RenderScene[]> {
  if (!project.scriptText.trim()) throw new Error("Kịch bản đang trống.");
  const ctx = taskContextFor(callerId);
  const { sourceOptions } = project;
  if (hasProviderKey(ctx, "claude")) {
    return runTask(
      directRenderTask,
      {
        scriptText: project.scriptText,
        frameRatio: project.frameRatio,
        targetDurationSec: project.targetDurationSec,
        // The picked model only applies to the provider it belongs to.
        model: sourceOptions.provider === "claude" ? sourceOptions.model : undefined,
        effort: sourceOptions.effort,
      },
      ctx,
    );
  }
  const provider = firstAvailableProvider(ctx, "openai");
  if (!provider) throw new Error("Chưa có API key AI — thêm trong Cài đặt.");
  return runTask(
    splitRenderScenesTask,
    {
      scriptText: project.scriptText,
      frameRatio: project.frameRatio,
      provider,
      model: provider === sourceOptions.provider ? sourceOptions.model : undefined,
      effort: sourceOptions.effort,
    },
    ctx,
  );
}
