import type { TrainingMaterial } from "./sources/types.js";

/**
 * Prompt budgets for training (characters). Shared by the planner that decides
 * which sources must be read in parts first (`digests.ts`) and by the training
 * prompt (`tasks/train-skill.ts`), so both agree on what fits.
 *
 * Within a budget, new material gets a larger share than material learned in an
 * earlier run (the current guide already covers that), and no source drops below
 * a floor, so every one still speaks.
 */
export const BUDGET = {
  samples: { total: 70_000, perItem: 15_000 },
  references: { total: 40_000, perItem: 12_000 },
  minShare: 1_500,
  newWeight: 3,
  learnedWeight: 1,
  /** Verbatim opening kept next to the notes of a source read in parts. */
  excerptOfDigested: 2_000,
  /** One part of a long source, read in a single call. */
  digestChunk: 24_000,
} as const;

/** Characters each item may use verbatim in the training prompt. */
export function sharesOf(
  items: TrainingMaterial[],
  budget: { total: number; perItem: number },
): number[] {
  const weights = items.map((m) =>
    m.isNew ? BUDGET.newWeight : BUDGET.learnedWeight,
  );
  const total = weights.reduce((sum, w) => sum + w, 0);
  return weights.map((w) =>
    Math.min(
      budget.perItem,
      Math.max(BUDGET.minShare, Math.floor((budget.total * w) / total)),
    ),
  );
}

export function budgetFor(role: TrainingMaterial["role"]) {
  return role === "sample" ? BUDGET.samples : BUDGET.references;
}
