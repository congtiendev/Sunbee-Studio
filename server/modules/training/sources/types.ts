import type {
  ScriptScene,
  TrainingCandidate,
  TrainingSourceKind,
} from "../../../../shared/types.js";
import type { Caller } from "../../../services/skills/skills.js";

/**
 * How the AI should read a piece of material:
 * - "sample": writing by the author — learn the voice by comparing samples;
 * - "reference": guides, rules, sample texts, subject knowledge — follow and summarize.
 */
export type MaterialRole = "sample" | "reference";

/** One piece of material, loaded and ready for the training prompt. */
export interface TrainingMaterial {
  kind: TrainingSourceKind;
  id: string;
  title: string;
  text: string;
  role: MaterialRole;
  /** A video's analyzed scenes: adds the visual/editing style. */
  scenes?: ScriptScene[];
  /**
   * Added in this run, as opposed to learned in an earlier one (set by the
   * training service). Tells the AI what is new evidence vs. what the current
   * guide already summarizes.
   */
  isNew?: boolean;
  /**
   * AI notes from reading the whole source (set when the material is too long
   * to pass verbatim); the training prompt then uses these plus an excerpt.
   */
  digest?: SourceDigest;
}

/** What the AI noted reading one source in full (see `tasks/digest-source.ts`). */
export interface SourceDigest {
  voice: string[];
  structure: string[];
  visual: string[];
  knowledge: string[];
  sampleLines: string[];
  /** Characters read, and in how many parts. */
  chars: number;
  parts: number;
}

/**
 * A kind of material skills can be trained on. One file per kind in this folder,
 * listed in `./index.ts`; the training page renders a picker per kind from
 * `listCandidates`, so a new kind needs no new page code — only its labels in
 * `training.sources.<kind>` of both message files.
 */
export interface TrainingSource {
  kind: TrainingSourceKind;
  /** Plural noun for server messages, e.g. "video", "tài liệu". */
  noun: string;
  /** The most items of this kind one run may use (keeps each one's share of the prompt useful). */
  max: number;
  /** What the caller can pick from. */
  listCandidates(caller: Caller): TrainingCandidate[];
  /** The picked items the caller may read, in order; unreadable or empty ones are dropped. */
  load(caller: Caller, ids: string[]): TrainingMaterial[];
  /** Display names for a version's sources; missing (deleted/unreadable) ids are left out. */
  labels(caller: Caller, ids: string[]): Map<string, string>;
  /** When the user asks to, link the items to the skill so later AI calls can consult them. */
  attachToSkill?(caller: Caller, skillId: string, ids: string[]): void;
}
