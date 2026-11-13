/** A CapCut built-in (animation, transition or effect), referenced in a draft by its ids; CapCut downloads it on open. */
export interface CapcutCatalogItem {
  /** Stable key, e.g. "in:Zoom_In", "transition:Flash", "scene:Shake". */
  key: string;
  name: string;
  resourceId: string;
  effectId: string;
  /** Default length (animations, transitions). */
  durationMs?: number;
  /** Transitions: the clips overlap during it. */
  overlap?: boolean;
  /** Effects: adjustable parameters and their defaults. */
  params?: { name: string; default: number; min: number; max: number }[];
}

export interface CapcutCatalog {
  source: string;
  intros: CapcutCatalogItem[];
  outros: CapcutCatalogItem[];
  combos: CapcutCatalogItem[];
  transitions: CapcutCatalogItem[];
  effects: CapcutCatalogItem[];
}
