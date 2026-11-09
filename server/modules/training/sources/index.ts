import type {
  TrainingSourceKind,
  TrainingSourceList,
  TrainingSourceRef,
} from "../../../../shared/types.js";
import type { Caller } from "../../../services/skills/skills.js";
import { documentSource } from "./document.js";
import { linkSource, uploadSource } from "./script-versions.js";
import type { TrainingMaterial, TrainingSource } from "./types.js";

/**
 * Every kind of material skills can be trained on, in the order the training
 * page shows them. Adding a kind: one file implementing `TrainingSource`, one
 * entry here, its value in `TrainingSourceKind`, and its labels in both message files.
 */
export const TRAINING_SOURCES: TrainingSource[] = [
  linkSource,
  uploadSource,
  documentSource,
];

export function sourceFor(
  kind: TrainingSourceKind,
): TrainingSource | undefined {
  return TRAINING_SOURCES.find((source) => source.kind === kind);
}

export function listTrainingSources(caller: Caller): TrainingSourceList[] {
  return TRAINING_SOURCES.map((source) => ({
    kind: source.kind,
    max: source.max,
    candidates: source.listCandidates(caller),
  }));
}

/** Picked ids per kind, dropping unknown kinds and duplicates. */
export function groupByKind(
  refs: TrainingSourceRef[],
): Map<TrainingSource, string[]> {
  const grouped = new Map<TrainingSource, string[]>();
  for (const ref of refs) {
    const source = sourceFor(ref.kind);
    if (!source || typeof ref.id !== "string") continue;
    const ids = grouped.get(source) ?? [];
    if (!ids.includes(ref.id)) ids.push(ref.id);
    grouped.set(source, ids);
  }
  return grouped;
}

/**
 * Loads picked material. With `enforceLimit` (the default — material added in
 * one run), a kind over its limit throws a user-facing message; a skill's
 * accumulated sources load without it.
 */
export function loadMaterials(
  caller: Caller,
  refs: TrainingSourceRef[],
  { enforceLimit = true }: { enforceLimit?: boolean } = {},
): TrainingMaterial[] {
  const materials: TrainingMaterial[] = [];
  for (const [source, ids] of groupByKind(refs)) {
    if (enforceLimit && ids.length > source.max) {
      throw new Error(
        `Chọn tối đa ${source.max} ${source.noun} cho một lần huấn luyện.`,
      );
    }
    materials.push(...source.load(caller, ids));
  }
  return materials;
}

/** A version's sources with display labels (null when the item is gone or unreadable). */
export function labelSources<T extends TrainingSourceRef>(
  caller: Caller,
  refs: T[],
): (T & { label: string | null })[] {
  const labels = new Map<TrainingSourceKind, Map<string, string>>();
  for (const [source, ids] of groupByKind(refs)) {
    labels.set(source.kind, source.labels(caller, ids));
  }
  return refs.map((ref) => ({
    ...ref,
    label: labels.get(ref.kind)?.get(ref.id) ?? null,
  }));
}
