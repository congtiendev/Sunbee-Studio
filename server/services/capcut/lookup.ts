import type { CapcutRef } from "../../../shared/timeline.js";
import { CAPCUT_CATALOG } from "./catalog.js";
import type { CapcutCatalogItem } from "./catalog-types.js";

let byKey: Map<string, CapcutCatalogItem> | null = null;

/** A catalog item by key ("in:Zoom_In", "transition:Flash", "scene:Shake"…), as a timeline reference; null when unknown or unset. */
export function capcutRef(key: string | null | undefined, fallbackMs = 500): CapcutRef | null {
  if (!key) return null;
  byKey ??= new Map(
    [...CAPCUT_CATALOG.intros, ...CAPCUT_CATALOG.outros, ...CAPCUT_CATALOG.combos, ...CAPCUT_CATALOG.transitions, ...CAPCUT_CATALOG.effects].map(
      (item) => [item.key, item],
    ),
  );
  const item = byKey.get(key);
  if (!item) return null;
  return {
    key: item.key,
    name: item.name,
    resourceId: item.resourceId,
    effectId: item.effectId,
    durationMs: item.durationMs ?? fallbackMs,
    overlap: item.overlap,
    params: item.params,
  };
}

/** What the recipe editor offers: intros, transitions and whole-picture ("scene") effects, by key and name. */
export function capcutChoices() {
  const short = ({ key, name, durationMs }: CapcutCatalogItem) => ({ key, name, durationMs });
  return {
    intros: CAPCUT_CATALOG.intros.map(short),
    transitions: CAPCUT_CATALOG.transitions.map(short),
    effects: CAPCUT_CATALOG.effects.filter((e) => e.key.startsWith("scene:")).map(short),
  };
}
