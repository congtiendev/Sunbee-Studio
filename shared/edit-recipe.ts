/**
 * An editing skill's numeric half: how the edit plan turns shots into a
 * timeline — camera, how elements come on screen, subtitles, music level.
 * The skill's prose (`editingStyle`) guides the AI's shot breakdown; this
 * is what the timeline builder itself follows. Learned from sample videos
 * (cut detection, motion, reveal cadence, audio) and editable by hand.
 */
export interface EditRecipe {
  camera: {
    /** "none": a locked-off frame; "fromShots": each shot's planned `cameraMovement`. */
    motion: "none" | "fromShots";
    /** Multiplies the move's size (1 = gentle default: zoom 3–10% by shot length). */
    intensity: number;
    /**
     * A slow push-in (scale gain, e.g. 0.03 = 3%) on shots that would otherwise
     * hold perfectly still for 2.5 s or more — keeps a locked-off frame from
     * looking frozen. 0 = none.
     */
    holdDrift: number;
  };
  /** Sprite sheets (a subject's animation as a grid of frames). */
  sprite: {
    /** How long each frame shows. Talking/idle loops repeat until the shot ends; one-off actions play once and hold. */
    frameMs: number;
  };
  /** How a shot's cutouts (characters, objects, pictures) come on screen. */
  reveal: {
    /** "together": all at the cut; "sequential": one after another through the shot, as the story reaches them. */
    mode: "together" | "sequential";
    animation: RevealAnimation;
    durationMs: number;
    /** After the cut, before the first element appears. */
    leadMs: number;
  };
  /** How text/graphic cutouts come on screen (titles, lists, labels). */
  text: {
    animation: RevealAnimation;
    durationMs: number;
  };
  subtitles: { enabled: boolean };
  /** Background music level relative to the voice, in dB (e.g. -20 = well under it). */
  music: { volumeDb: number };
}

/** "pop": from small and see-through, overshooting a little, settling at full size. */
export type RevealAnimation = "none" | "pop" | "fade";

const ANIMATIONS: readonly RevealAnimation[] = ["none", "pop", "fade"];

/** What the edit plan did before skills had recipes: camera moves per shot, everything on screen at the cut. */
export const DEFAULT_EDIT_RECIPE: EditRecipe = {
  camera: { motion: "fromShots", intensity: 1, holdDrift: 0 },
  sprite: { frameMs: 125 },
  reveal: { mode: "together", animation: "none", durationMs: 120, leadMs: 0 },
  text: { animation: "none", durationMs: 200 },
  subtitles: { enabled: true },
  music: { volumeDb: -20 },
};

const clamp = (value: unknown, min: number, max: number, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;

const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;

/** Any stored/sent value made into a complete, in-range recipe (missing parts from the default). */
export function normalizeEditRecipe(value: unknown): EditRecipe {
  const v = (value ?? {}) as Partial<Record<keyof EditRecipe, Record<string, unknown>>>;
  const d = DEFAULT_EDIT_RECIPE;
  return {
    camera: {
      motion: pick(v.camera?.motion, ["none", "fromShots"] as const, d.camera.motion),
      intensity: clamp(v.camera?.intensity, 0, 3, d.camera.intensity),
      holdDrift: clamp(v.camera?.holdDrift, 0, 0.1, d.camera.holdDrift),
    },
    sprite: { frameMs: Math.round(clamp(v.sprite?.frameMs, 40, 1000, d.sprite.frameMs)) },
    reveal: {
      mode: pick(v.reveal?.mode, ["together", "sequential"] as const, d.reveal.mode),
      animation: pick(v.reveal?.animation, ANIMATIONS, d.reveal.animation),
      durationMs: Math.round(clamp(v.reveal?.durationMs, 0, 2000, d.reveal.durationMs)),
      leadMs: Math.round(clamp(v.reveal?.leadMs, 0, 3000, d.reveal.leadMs)),
    },
    text: {
      animation: pick(v.text?.animation, ANIMATIONS, d.text.animation),
      durationMs: Math.round(clamp(v.text?.durationMs, 0, 2000, d.text.durationMs)),
    },
    subtitles: { enabled: typeof v.subtitles?.enabled === "boolean" ? v.subtitles.enabled : d.subtitles.enabled },
    music: { volumeDb: clamp(v.music?.volumeDb, -40, 0, d.music.volumeDb) },
  };
}
