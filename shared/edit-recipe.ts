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
  /**
   * CapCut's own built-ins (keys from its catalog, e.g. "in:Zoom_In",
   * "transition:Flash", "scene:Shake"); null = not used. An intro set here
   * replaces the keyframed reveal for those elements.
   */
  capcut: {
    revealIntro: string | null;
    textIntro: string | null;
    /** On scene changes only (never every cut), at most one per `transitionMinGapSec`. */
    sceneTransition: string | null;
    transitionMinGapSec: number;
    /** Over the first moments of a scene marked as a hero moment. */
    heroEffect: string | null;
    heroEffectMs: number;
  };
  /**
   * Sound effects from the library's sound-effect packs (category ids, e.g.
   * "whooshes", "pops"); null = none for that event. `smart` picks a sound
   * from what an element is (a phone notification → "notifications"…).
   */
  sfx: {
    enabled: boolean;
    sceneChange: string | null;
    reveal: string | null;
    hero: string | null;
    smart: boolean;
    /** Level relative to the voice (dB). */
    volumeDb: number;
    /** Sparse on purpose: never more than this many a minute, and ≥ 1.2 s apart. */
    maxPerMinute: number;
  };
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
  capcut: {
    revealIntro: null,
    textIntro: null,
    sceneTransition: null,
    transitionMinGapSec: 45,
    heroEffect: null,
    heroEffectMs: 400,
  },
  sfx: {
    enabled: false,
    sceneChange: null,
    reveal: null,
    hero: null,
    smart: true,
    volumeDb: -12,
    maxPerMinute: 6,
  },
};

const clamp = (value: unknown, min: number, max: number, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;

/** A catalog/category key, or null for "not used". */
const key = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);

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
    capcut: {
      revealIntro: key(v.capcut?.revealIntro),
      textIntro: key(v.capcut?.textIntro),
      sceneTransition: key(v.capcut?.sceneTransition),
      transitionMinGapSec: clamp(v.capcut?.transitionMinGapSec, 0, 600, d.capcut.transitionMinGapSec),
      heroEffect: key(v.capcut?.heroEffect),
      heroEffectMs: Math.round(clamp(v.capcut?.heroEffectMs, 100, 5000, d.capcut.heroEffectMs)),
    },
    sfx: {
      enabled: typeof v.sfx?.enabled === "boolean" ? v.sfx.enabled : d.sfx.enabled,
      sceneChange: key(v.sfx?.sceneChange),
      reveal: key(v.sfx?.reveal),
      hero: key(v.sfx?.hero),
      smart: typeof v.sfx?.smart === "boolean" ? v.sfx.smart : d.sfx.smart,
      volumeDb: clamp(v.sfx?.volumeDb, -40, 0, d.sfx.volumeDb),
      maxPerMinute: Math.round(clamp(v.sfx?.maxPerMinute, 0, 30, d.sfx.maxPerMinute)),
    },
  };
}
