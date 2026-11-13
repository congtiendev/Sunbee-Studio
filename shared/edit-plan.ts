import type { EditRecipe } from "./edit-recipe.js";
import type { Timeline } from "./timeline.js";
import type { StyleTemplate } from "./types.js";

/**
 * Something the edit plan couldn't do as the script asked — shown in step 3
 * so the user knows what to fix (pick an image, extract narration...) before
 * exporting. `code` picks the message; the rest fills it in.
 */
export interface EditPlanWarning {
  code:
    | "missingPick"
    | "noBackground"
    | "skippedMedia"
    | "noNarration"
    | "downloadFailed"
    | "spriteGrid"
    | "sfxMissing";
  sceneIndex?: number;
  shotOrder?: number;
  /** The asset's description, or a count / detail depending on `code`. */
  detail?: string;
}

/** One scene as laid out on the timeline (for step 3's overview). */
export interface EditPlanScene {
  sceneIndex: number;
  startMs: number;
  durationMs: number;
  shots: number;
  /** Images placed / images the scene asks for. */
  images: number;
  imagesWanted: number;
  subtitles: number;
}

export interface EditPlanResponse {
  timeline: Timeline;
  scenes: EditPlanScene[];
  warnings: EditPlanWarning[];
  /** Timing comes from the script's estimates (no voiceover yet), not from real audio. */
  estimatedTiming: boolean;
  /** The editing skill whose recipe the plan followed (null: the default recipe). */
  editSkill: { id: string; name: string } | null;
  recipe: EditRecipe;
}

export interface CapcutExportRequest {
  videoId: string;
  /** Only scenes fromScene..toScene (by index, inclusive) — e.g. to preview the part that has its pictures. */
  fromScene?: number;
  toScene?: number;
}

export interface CapcutExportResponse {
  /** The project's folder name — what CapCut lists it as. */
  folderName: string;
  folderPath: string;
  durationMs: number;
  warnings: EditPlanWarning[];
}

/** What a recipe can pick from: CapCut built-ins (by catalog key) and the library's sound-effect categories. */
export interface EditRecipeChoices {
  intros: { key: string; name: string; durationMs?: number }[];
  transitions: { key: string; name: string; durationMs?: number }[];
  effects: { key: string; name: string }[];
  /** Sound-effect pack categories; `installed` = its sounds are in the user's library (usable now). */
  sfxCategories: { id: string; title: string; installed: boolean }[];
}

/** What was measured on a sample video without AI (see `server/modules/edit-plan/learn/measure.ts`). */
export interface EditStyleMeasurements {
  durationSec: number;
  shots: number;
  shotSec: { mean: number; median: number; p10: number; p90: number };
  cutsPerMinute: number;
  revealsPerMinute: number;
  revealsPerShotP90: number;
  cutInPausePct: number;
  pauseBaselinePct: number;
  speechDb: number;
  floorDb: number;
  musicLikely: boolean;
}

/** Learn an editing skill from a sample video (any link yt-dlp can download). */
export interface EditStyleLearnRequest {
  url: string;
  /** Name of the new skill (ignored when `skillId` refines an existing one). */
  name?: string;
  /** An existing type "editing" skill to refine instead of creating a new one. */
  skillId?: string;
  provider?: "openai" | "claude";
  model?: string;
  effort?: "low" | "medium" | "high";
}

export interface EditStyleLearnResponse {
  skill: StyleTemplate;
  summary: string;
  effects: string[];
  measurements: EditStyleMeasurements;
}
