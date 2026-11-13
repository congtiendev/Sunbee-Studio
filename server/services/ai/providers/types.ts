import type { AnalyzeProvider } from "../../../../shared/script-cost-estimate.js";

export type ProviderKey = AnalyzeProvider;

/** Reasoning effort. OpenAI only honours low/medium/high, and only on reasoning models. */
export type AiEffort = "low" | "medium" | "high" | "xhigh" | "max";

export interface AiRequest {
  model: string;
  system: string;
  /** The user-turn text. */
  text: string;
  /** Images as data URLs (`data:image/jpeg;base64,...`). */
  images?: string[];
  /** Put the images before the text in the user turn (default: text first). */
  imagesFirst?: boolean;
  effort?: AiEffort;
  maxTokens?: number;
}

export interface AiStructuredRequest extends AiRequest {
  /** Strict JSON schema for the response. */
  schema: Record<string, unknown>;
  /** Schema name (OpenAI requires one). */
  schemaName: string;
}

export interface WebSearchSource {
  title: string;
  url: string;
}

export interface AiWebSearchResult {
  text: string;
  sources: WebSearchSource[];
}

export interface FoundImage {
  /** The actual image file's URL — not the page it was found on. */
  url: string;
  pageUrl: string;
  title: string;
}

export interface ProviderCapabilities {
  vision: boolean;
  webSearch: boolean;
  /** Can search the web for actual, directly-linkable image files. */
  imageSearch: boolean;
  /** Can load an Agent Skill folder into the model's sandbox (`generateWithSkill`). */
  skills: boolean;
}

/** An Agent Skill on disk: a folder with `SKILL.md` at its root. */
export interface SkillFolder {
  /** Folder name the skill is uploaded under (lowercase, hyphens). */
  name: string;
  /** Absolute path of the folder. */
  dir: string;
}

export interface AiSkillRequest extends AiRequest {
  skill: SkillFolder;
}

/**
 * One adapter per AI vendor. Tasks talk to this interface only, so adding a
 * vendor (or swapping SDK APIs) never touches task code.
 */
export interface LlmProvider {
  readonly key: ProviderKey;
  readonly capabilities: ProviderCapabilities;
  generateText(req: AiRequest): Promise<string>;
  /** Returns `null` when the model produced no content. */
  generateStructured<T>(req: AiStructuredRequest): Promise<T | null>;
  /** Answer with live web search, returning the cited sources. */
  webSearch(req: AiRequest): Promise<AiWebSearchResult>;
  /** Search the web for real images matching the brief (only when `capabilities.imageSearch`). */
  findImages?(req: AiRequest): Promise<FoundImage[]>;
  /** Answer with the skill's files available to the model in a sandbox (only when `capabilities.skills`); returns the final text. */
  generateWithSkill?(req: AiSkillRequest): Promise<string>;
}
