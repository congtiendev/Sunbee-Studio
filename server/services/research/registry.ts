import type { ResearchSourceInfo } from "../../../shared/types.js";
import { getSettings } from "../../settings-store.js";
import { taskContextFor } from "../ai/task.js";
import { pexelsSource } from "./sources/pexels.js";
import { pinterestSource } from "./sources/pinterest.js";
import { pixabaySource } from "./sources/pixabay.js";
import { fromStockSource, type ResearchSource } from "./types.js";

/**
 * Every place assets can be researched from, in display order. Stock sites
 * live here; step modules add their own (the internal library, AI web
 * search) with `registerResearchSource` when they load.
 */
const SOURCES: ResearchSource[] = [
  fromStockSource(pexelsSource),
  fromStockSource(pixabaySource),
  fromStockSource(pinterestSource),
];

export function registerResearchSource(source: ResearchSource): void {
  if (!SOURCES.some((s) => s.key === source.key)) SOURCES.push(source);
}

export function findResearchSource(key: string): ResearchSource | undefined {
  return SOURCES.find((s) => s.key === key);
}

export function listResearchSources(userId: string): ResearchSourceInfo[] {
  const keys = getSettings(userId).researchApiKeys ?? {};
  const ai = taskContextFor(userId);
  return SOURCES.map((source) => ({
    key: source.key,
    label: source.label,
    kind: source.kind,
    mediaTypes: source.mediaTypes,
    requiresKey: source.requiresKey,
    keyUrl: source.keyUrl,
    generates: source.generates,
    available:
      (!source.requiresKey || Boolean(keys[source.key])) && (source.isAvailable?.({ ai }) ?? true),
  }));
}
