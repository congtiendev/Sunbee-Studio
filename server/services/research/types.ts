import type {
  AssetCandidate,
  FrameRatio,
  ImageAspectRatio,
  ResearchMediaType,
  ResearchSourceKind,
} from "../../../shared/types.js";
import type { TaskContext } from "../ai/task.js";

export interface ResearchQuery {
  query: string;
  /** Omitted: any type the source has. Stock sites default to images. */
  mediaType?: ResearchMediaType;
  perPage?: number;
}

export interface ResearchContext {
  userId: string;
  isAdmin: boolean;
  /** This source's API key, when it needs one. */
  apiKey?: string;
  /** For AI-backed sources (web research): the user's provider keys. */
  ai: TaskContext;
  /** What the asset is for, in the user's words (AI sources use it as the brief). */
  description?: string;
  /** The scene the asset belongs to, for AI sources. */
  sceneContext?: string;
  /** AI image sources: style references (data URLs, up to 10) to describe into the prompt. */
  referenceImages?: string[];
  /** AI image sources: output frame shape. Omitted: square. */
  aspectRatio?: ImageAspectRatio;
  /** AI image sources: the video's frame ratio — takes precedence over `aspectRatio`. */
  frameRatio?: FrameRatio;
  /** AI image sources: a type "image" skill's locked graphics methodology, applied to every scene's generation this session. */
  graphicsStyle?: string;
}

export interface ResearchResult {
  candidates: AssetCandidate[];
  /** AI sources: a written summary of what was found. */
  summary?: string;
}

/**
 * One place assets can be searched (a stock site, the internal library...).
 * Adding a source = one file implementing this + one line in `registry.ts`.
 */
export interface ResearchSource {
  key: string;
  label: string;
  kind: ResearchSourceKind;
  mediaTypes: ResearchMediaType[];
  requiresKey: boolean;
  keyUrl?: string;
  /** AI sources only: creates new media, vs. finding existing media (web search, stock). */
  generates?: boolean;
  /** Returns an error message, or null when the key works. */
  validateKey?(apiKey: string): Promise<string | null>;
  /** Whether the user can use it beyond an API key of its own (e.g. needs an AI key). */
  isAvailable?(ctx: Pick<ResearchContext, "ai">): boolean;
  search(query: ResearchQuery, ctx: ResearchContext): Promise<ResearchResult>;
}

/** A plain stock-site search: query in, candidates out. */
export interface StockSource extends Omit<ResearchSource, "search"> {
  search(query: ResearchQuery, ctx: ResearchContext): Promise<AssetCandidate[]>;
}

export function fromStockSource(source: StockSource): ResearchSource {
  return { ...source, search: async (query, ctx) => ({ candidates: await source.search(query, ctx) }) };
}

export const DEFAULT_PER_PAGE = 12;

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`);
  }
  return (await res.json()) as T;
}
