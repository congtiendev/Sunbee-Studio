import type { AnalyzeProvider } from "@shared/script-cost-estimate";
import type { TrainingCandidate } from "@shared/types";

/**
 * The "add new" part of a source section: makes new material right on the
 * training page (fetch a link, transcribe a file, upload a document…) and hands
 * it back as a candidate, which the page then picks.
 */
export interface SourceAdderProps {
  /** The AI the training page is set to; used to fetch/transcribe too. */
  ai: { provider: AnalyzeProvider; model: string };
  onAdded: (candidate: TrainingCandidate) => void;
  disabled?: boolean;
}

/** Shorter scripts say too little to learn from (matches the server). */
export const MIN_SCRIPT_CHARS = 150;

export type AddStatus =
  | { state: "waiting" }
  | { state: "working" }
  | { state: "done" }
  | { state: "error"; message: string };

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
