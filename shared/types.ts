export interface NamedApiKey {
  id: string;
  name: string;
  apiKey: string;
}

export interface UiPreferences {
  themeMode?: "light" | "dark" | "auto";
  uiStyle?: "classic" | "liquid";
  glassOpacity?: number;
  glassRadius?: number;
  scaleMode?: "auto" | "medium" | "off";
}

export interface AppSettings extends UiPreferences {
  openaiApiKey?: string;
  /** The active Anthropic key's value, derived from `anthropicApiKeys`/`activeAnthropicApiKeyId`. */
  anthropicApiKey?: string;
  anthropicApiKeys?: NamedApiKey[];
  activeAnthropicApiKeyId?: string;
  encryptionAvailable: boolean;
  mcpEnabled?: boolean;
  mcpToken?: string;
  /** Keys of research sources that need one (pexels, pixabay, ...), by source key. */
  researchApiKeys?: Record<string, string>;
}

export interface StyleTemplate {
  id: string;
  name: string;
  createdAt: string;
  genre: string;
  styleTags: string[];
  pacing: { avgShotLengthSec: number; cutsPerMinute: number };
  toneDescription: string;
  resourceInventory: Record<string, unknown>;
  /** What the skill is for (shown in the library). */
  description?: string;
  /** Free-form instructions added to every AI call that uses the skill. */
  instructions?: string;
  /** "anthropic" when imported from an Agent Skill (SKILL.md). */
  origin?: SkillOrigin;
  /** The original SKILL.md, kept for Agent Skills so they can be re-exported. */
  skillMd?: string;
  updatedAt?: string;
  userId?: string;
  ownerEmail?: string;
}

export type SkillOrigin = "app" | "anthropic";

/** A skill with the approved examples and documents attached to it. */
export interface SkillDetail extends StyleTemplate {
  examples: ScriptAnalysisSummary[];
  documents: DocumentSummary[];
}

export type SkillInput = Omit<StyleTemplate, "id" | "createdAt" | "updatedAt" | "userId" | "ownerEmail">;

export interface SkillUpdateRequest extends Partial<SkillInput> {
  exampleIds?: string[];
  documentIds?: string[];
}

export interface Project {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  userId?: string;
  ownerEmail?: string;
}

export interface Category {
  id: string;
  projectId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  userId?: string;
  ownerEmail?: string;
}

export interface Video {
  id: string;
  categoryId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  userId?: string;
  ownerEmail?: string;
}

export interface FetchTranscriptRequest {
  url: string;
  videoId?: string;
  /** Default true: clean captions with AI; transcribe the audio when there are none. */
  useAi?: boolean;
  provider?: "openai" | "claude";
  model?: string;
  language?: "vi" | "en";
}

/** How a link's script was obtained. */
export type LinkScriptOrigin =
  | "captions"
  | "captionsCleaned"
  | "transcribed"
  | "transcribedReviewed"
  | "framesDescribed";

export interface FetchTranscriptResult {
  scriptText: string;
  /** Source "link" only. */
  origin?: LinkScriptOrigin;
  frames?: string[];
  versionId?: string;
  noSpeechDetected?: boolean;
  aiDescribed?: boolean;
}

export type SceneNarrativeRole =
  | "hook"
  | "context"
  | "buildup"
  | "keyPoint"
  | "emotionalBeat"
  | "proof"
  | "transition"
  | "callToAction"
  | "outro";

export type ShotSize =
  | "extremeCloseUp"
  | "closeUp"
  | "medium"
  | "wide"
  | "extremeWide";

export type CameraMovement =
  | "static"
  | "pan"
  | "tilt"
  | "zoom"
  | "handheld"
  | "tracking";

export type RequiredAssetType = "image" | "video" | "audio" | "graphic";
export type RequiredAssetSource = "generate" | "stock" | "provided";

export interface RequiredAsset {
  type: RequiredAssetType;
  description: string;
  source: RequiredAssetSource;
}

export interface ScriptScene {
  index: number;
  content: string;
  visualDescription: string;
  estimatedDurationSec: number;
  narrativeRole: SceneNarrativeRole;
  shotSize: ShotSize;
  cameraMovement: CameraMovement;
  heroMoment: boolean;
  requiredAssets: RequiredAsset[];
}

export interface ScriptResources {
  shotCount: number;
  voiceover: string;
  music: string;
  images: string[];
  notes: string;
}

/** Where a script version came from. */
export type ScriptSourceType = "youtube" | "import" | "document" | "template" | "idea";

export interface ScriptAnalyzeRequest {
  scriptText: string;
  sourceType?: ScriptSourceType;
  sourceUrl?: string;
  styleTemplateId?: string;
  frames?: string[];
  provider?: "openai" | "claude";
  model?: string;
  effort?: "low" | "medium" | "high";
  videoId?: string;
}

export interface ScriptStyle {
  genre: string;
  styleTags: string[];
  toneDescription: string;
}

export interface ScriptAnalyzeResult {
  scenes: ScriptScene[];
  resources: ScriptResources;
  style: ScriptStyle;
}

export interface ScriptAnalyzeResponse extends ScriptAnalyzeResult {
  versionId: string;
}

export interface ScriptAnalysisRecord {
  id: string;
  createdAt: string;
  sourceType: ScriptSourceType;
  sourceUrl?: string;
  scriptText: string;
  frames: string[];
  kind: "draft" | "analyzed";
  scenes: ScriptScene[];
  resources: ScriptResources;
  style?: ScriptStyle;
  videoId?: string;
  /** Reviewed (and possibly edited) by the user; usable as a few-shot example. */
  approved?: boolean;
  /** Source "template": the analyzed version this script was modelled on. */
  templateSourceId?: string;
  userId?: string;
  ownerEmail?: string;
}

/** A light view of a version, for pickers (no frames). */
export interface ScriptAnalysisSummary {
  id: string;
  createdAt: string;
  sourceType: ScriptSourceType;
  sourceUrl?: string;
  scriptExcerpt: string;
  sceneCount: number;
  genre?: string;
  videoId?: string;
  videoName?: string;
  approved: boolean;
}

/** Save the (possibly edited) scenes of a version as a new approved version. */
export interface ScriptApproveRequest {
  versionId: string;
  scenes: ScriptScene[];
  resources: ScriptResources;
  style: ScriptStyle;
}

export type DocumentTargetType = "skill" | "project";

export interface DocumentLink {
  targetType: DocumentTargetType;
  targetId: string;
}

export interface DocumentSummary {
  id: string;
  title: string;
  mime: string;
  charCount: number;
  fileId?: string;
  createdAt: string;
  ownerEmail?: string;
  /** Skills/projects the document is attached to (only on list responses). */
  links?: DocumentLink[];
}

/** Replace the documents attached to a skill or project. */
export interface DocumentLinksRequest extends DocumentLink {
  documentIds: string[];
}

/** Script source "template": a new script + scenes modelled on an analyzed version. */
export interface ScriptFromTemplateRequest {
  /** The analyzed version whose structure, pacing and voice to reuse. */
  templateVersionId: string;
  /** The new video's topic. */
  topic: string;
  /** Optional facts to draw the new content from. */
  documentIds?: string[];
  /** Defaults to the template's total duration. */
  targetDurationSec?: number;
  language?: "vi" | "en";
  provider?: "openai" | "claude";
  model?: string;
  effort?: "low" | "medium" | "high";
  styleTemplateId?: string;
  videoId?: string;
}

export interface ScriptFromTemplateResponse extends ScriptAnalyzeResponse {
  scriptText: string;
}

/** Script source "document": AI writes a script from reference documents. */
export interface ScriptFromDocumentRequest {
  documentIds: string[];
  /** What the video should be about / the angle to take (optional). */
  brief?: string;
  targetDurationSec?: number;
  language?: "vi" | "en";
  provider?: "openai" | "claude";
  model?: string;
  effort?: "low" | "medium" | "high";
  /** Skill whose style and instructions the script should follow. */
  styleTemplateId?: string;
  videoId?: string;
}

/** Script source "idea": AI writes a script straight from a free-text idea, no source material. */
export interface ScriptFromIdeaRequest {
  idea: string;
  targetDurationSec?: number;
  language?: "vi" | "en";
  provider?: "openai" | "claude";
  model?: string;
  effort?: "low" | "medium" | "high";
  /** Skill whose style and instructions the script should follow. */
  styleTemplateId?: string;
  videoId?: string;
}

export interface DocumentRecord extends DocumentSummary {
  textContent: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: "user" | "admin";
  createdAt: string;
}

export interface AuthRegisterRequest {
  email: string;
  name: string;
  password: string;
}

export interface AuthLoginRequest {
  email: string;
  password: string;
  remember: boolean;
}

export interface LogEntry {
  time: string;
  level: "info" | "warn" | "error";
  message: string;
  [key: string]: unknown;
}

export interface LogsResult {
  dates: string[];
  entries: LogEntry[];
}

/** A portable snapshot of one account's own data, for moving between machines. */
export interface DataExportBundle {
  version: 1;
  exportedAt: string;
  projects: Project[];
  categories: Category[];
  videos: Video[];
  scriptAnalyses: ScriptAnalysisRecord[];
  styleTemplates: StyleTemplate[];
  settings: {
    openaiApiKey?: string;
    anthropicApiKeys?: NamedApiKey[];
    mcpEnabled?: boolean;
  };
}

export interface DataImportResult {
  projects: number;
  categories: number;
  videos: number;
  scriptAnalyses: number;
  styleTemplates: number;
  anthropicKeys: number;
  openaiKeyImported: boolean;
}

/** UI text in every supported locale (keep in sync with src/i18n/routing.ts). */
export interface LocalizedText {
  en: string;
  vi: string;
}

export type PromptScope = "global" | "user";

export interface PromptOverride {
  scope: PromptScope;
  taskKey: string;
  slot: string;
  content: string;
  updatedAt: string;
}

/** One editable prompt of an AI task, as listed in Settings → Prompts. */
export interface PromptSlotInfo {
  key: string;
  label: LocalizedText;
  description?: LocalizedText;
  defaultContent: string;
  userOverride?: string;
  globalOverride?: string;
}

/** An AI task (one model call in a Video Studio step) and its editable prompts. */
export interface PromptTaskInfo {
  key: string;
  module: string;
  /** Sub-section of the step that runs the task (script source key, "analyze"...). */
  group?: string;
  label: LocalizedText;
  description: LocalizedText;
  prompts: PromptSlotInfo[];
}

export type StoredFileKind = "document" | "asset" | "skill-attachment";

export interface StoredFile {
  id: string;
  userId: string;
  kind: StoredFileKind;
  originalName: string;
  mime: string;
  size: number;
  sha256: string;
  createdAt: string;
}

/** "link": a web page found by AI research (reference material, not a media file). */
export type ResearchMediaType = "image" | "video" | "audio" | "link";

export type ResearchSourceKind = "stock" | "library" | "ai";

/** A research source as shown in the UI (Settings → API Keys, the research panel). */
export interface ResearchSourceInfo {
  key: string;
  label: string;
  kind: ResearchSourceKind;
  mediaTypes: ResearchMediaType[];
  requiresKey: boolean;
  /** Where to get an API key, when one is required. */
  keyUrl?: string;
  /** Whether the current user has what the source needs (key set, provider key...). */
  available: boolean;
  /** AI sources only: creates new media, vs. finding existing media (web search, stock). */
  generates?: boolean;
}

/** One search hit from a research source. */
export interface AssetCandidate {
  sourceKey: string;
  externalId: string;
  mediaType: ResearchMediaType;
  title: string;
  /** Small image to show in a results grid. */
  previewUrl?: string;
  /** The media itself (full image, playable video file). */
  url: string;
  /** Page on the source site, for attribution / licence details. */
  pageUrl?: string;
  /** Credit line required by the source's licence. */
  attribution?: string;
  width?: number;
  height?: number;
  durationSec?: number;
  /** Extra text (library description, why a web page is relevant...). */
  description?: string;
}

export type LibraryMediaType = "image" | "video" | "audio";

/** A file in the user's internal asset library. */
export interface LibraryAsset {
  id: string;
  fileId: string;
  mediaType: LibraryMediaType;
  name: string;
  tags: string[];
  description: string;
  mime: string;
  size: number;
  createdAt: string;
  ownerEmail?: string;
}

/** The asset picked for one required asset of one scene of a video. */
export interface SceneResource {
  id: string;
  videoId: string;
  sceneIndex: number;
  assetIndex: number;
  /** The required asset's description when it was picked (to spot outdated picks). */
  assetDescription: string;
  candidate: AssetCandidate;
  createdAt: string;
}

export interface SceneResourceSelectRequest {
  videoId: string;
  sceneIndex: number;
  assetIndex: number;
  assetDescription: string;
  /** null clears the pick. */
  candidate: AssetCandidate | null;
}

/** AI image sources: "square" for a general asset, "portrait"/"landscape" to match a vertical/horizontal video frame. */
export type ImageAspectRatio = "square" | "portrait" | "landscape";

export interface AssetResearchRequest {
  sourceKey: string;
  query: string;
  /** Omitted: any type the source has (the library). */
  mediaType?: ResearchMediaType;
  description?: string;
  sceneContext?: string;
  /** AI image sources: a style reference (data URL) to describe into the prompt. */
  referenceImage?: string;
  /** AI image sources: output frame shape. Omitted: square. */
  aspectRatio?: ImageAspectRatio;
}

export interface AssetResearchResponse {
  candidates: AssetCandidate[];
  summary?: string;
}

export interface AssetQuerySuggestRequest {
  description: string;
  sceneContext?: string;
  mediaType: ResearchMediaType;
}

export interface AssetQuerySuggestResponse {
  queries: string[];
  /** False when no AI key is set and the description was used as-is. */
  aiUsed: boolean;
}

/** Portable skill file (`.sunbee-skill.json`). */
export interface SunbeeSkillPackage {
  format: "sunbee-skill";
  version: 1;
  exportedAt: string;
  skill: SkillInput;
  examples: {
    scriptText: string;
    sourceType: ScriptSourceType;
    scenes: ScriptScene[];
    resources: ScriptResources;
    style?: ScriptStyle;
  }[];
  documents: { title: string; mime: string; textContent: string }[];
}

export interface SkillImportResult {
  skill: StyleTemplate;
  examples: number;
  documents: number;
  /** Files in an Agent Skill .zip that weren't text and so weren't imported. */
  skippedFiles: string[];
}
