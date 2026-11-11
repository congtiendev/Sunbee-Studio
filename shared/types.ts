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
  /** Target length (seconds) last used writing a script from an idea/documents — a page setting, not tied to any video. */
  scriptIdeaDurationSec?: number | null;
  scriptDocumentDurationSec?: number | null;
  /** The in-progress idea/brief text itself — same reasoning: not tied to any video, so it needs its own persistence to survive a reload. */
  scriptIdeaText?: string;
  scriptDocumentBrief?: string;
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

/** "script": voice/style for writing (instructions, examples, pacing). "image": graphics methodology for the Assets step (graphicsStyle). "editing": shot/cut/pacing methodology for the scene-breakdown step (editingStyle). Each skill is exactly one. */
export type SkillType = "script" | "image" | "editing";

export interface StyleTemplate {
  id: string;
  name: string;
  createdAt: string;
  /** Which step this skill applies to; governs which of instructions/graphicsStyle/editingStyle is used. */
  type: SkillType;
  genre: string;
  styleTags: string[];
  pacing: { avgShotLengthSec: number; cutsPerMinute: number };
  toneDescription: string;
  resourceInventory: Record<string, unknown>;
  /** What the skill is for (shown in the library). */
  description?: string;
  /** type "script": free-form instructions added to every AI call that uses the skill. */
  instructions?: string;
  /** type "image": graphics/art-style methodology, folded into every image-gen prompt in the Assets step so a video's generated art stays visually consistent. */
  graphicsStyle?: string;
  /** type "editing": shot size, camera movement, cut rhythm and scene-transition methodology, folded into the scene-breakdown (analyze) step so a video's editing stays consistent regardless of who wrote the script. */
  editingStyle?: string;
  /** type "image": up to 10 reference illustrations (their *style* only, never copied content) described into every image-gen prompt alongside graphicsStyle. Set only via the dedicated upload/remove endpoints. */
  referenceImageFileIds: string[];
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

export type SkillInput = Omit<
  StyleTemplate,
  "id" | "createdAt" | "updatedAt" | "userId" | "ownerEmail" | "referenceImageFileIds"
>;

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
  /** Live (not soft-deleted) categories and videos — filled by list/get endpoints. */
  categoryCount?: number;
  videoCount?: number;
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

/** A video with the project/category it lives in — what the studio and "recent" lists need. */
export interface VideoSummary extends Video {
  categoryName: string;
  projectId: string;
  projectName: string;
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

/** One character appearing in a scene: who (consistent across scenes) and what they're doing here. */
export interface SceneCharacter {
  name: string;
  action: string;
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
  /** Absent on versions analyzed before this field existed. */
  characters?: SceneCharacter[];
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

/**
 * Saves hand-edited script text outside of fetch/write/analyze (auto-save, or
 * the manual save). Updates `versionId` in place if it's still a "draft";
 * otherwise (no id, or the version is already "analyzed") a new draft is
 * created instead, so an edit never rewrites an analyzed version's text out
 * from under its scenes.
 */
export interface ScriptSaveTextRequest {
  videoId: string;
  scriptText: string;
  versionId?: string;
}

export interface ScriptAnalyzeRequest {
  scriptText: string;
  sourceType?: ScriptSourceType;
  sourceUrl?: string;
  styleTemplateId?: string;
  /** A type "editing" skill applied to this analysis, independent of styleTemplateId. */
  editingStyleTemplateId?: string;
  frames?: string[];
  provider?: "openai" | "claude";
  model?: string;
  effort?: "low" | "medium" | "high";
  videoId?: string;
  /** Recorded on the saved version for comparison; analyze itself infers output language from scriptText. */
  language?: "vi" | "en";
}

export interface ScriptStyle {
  genre: string;
  styleTags: string[];
  toneDescription: string;
}

/** A character of the script, with a locked appearance reused in every scene's image-gen prompt where they appear — even one that only appears once, so its one image still gets a specific, consistent look instead of an unguided guess. */
export interface RecurringCharacter {
  name: string;
  appearance: string;
  /** A user-uploaded reference photo/drawing of this character (own file, kind "character-reference"); its look is described into that character's image prompts, taking priority over `appearance` text. */
  appearanceImageFileId?: string;
}

/** A recurring object/prop (weapon, brand logo, vehicle, signature item...) with a locked look, same idea as `RecurringCharacter` but for things instead of people. */
export interface RecurringObject {
  name: string;
  appearance: string;
  /** A user-uploaded reference photo/drawing of this object (own file, kind "character-reference"); its look is described into that object's image prompts, taking priority over `appearance` text. */
  appearanceImageFileId?: string;
}

export interface ScriptAnalyzeResult {
  scenes: ScriptScene[];
  resources: ScriptResources;
  style: ScriptStyle;
}

export interface ScriptAnalyzeResponse extends ScriptAnalyzeResult {
  versionId: string;
  /** Absent for responses that don't compute a roster (e.g. "write from template"). */
  characterRoster?: RecurringCharacter[];
  objectRoster?: RecurringObject[];
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
  /** Absent on versions saved before this field existed. */
  characterRoster?: RecurringCharacter[];
  /** Absent on versions saved before this field existed. */
  objectRoster?: RecurringObject[];
  videoId?: string;
  /** Reviewed (and possibly edited) by the user; usable as a few-shot example. */
  approved?: boolean;
  /** Source "template": the analyzed version this script was modelled on. */
  templateSourceId?: string;
  /** The skill selected when writing/analyzing this version, if any — restored on reload. */
  styleTemplateId?: string;
  /** The type "editing" skill selected when analyzing this version, if any — restored on reload. */
  editingStyleTemplateId?: string;
  /** The AI provider/model/script language used to produce this version — recorded for comparing versions, not read back into any form. */
  provider?: "openai" | "claude";
  model?: string;
  language?: "vi" | "en";
  userId?: string;
  ownerEmail?: string;
}

/** A light row for list/dashboard views: no script text, frames, scenes or resources. */
export interface ScriptAnalysisListItem {
  id: string;
  createdAt: string;
  sourceType: ScriptSourceType;
  sourceUrl?: string;
  kind: "draft" | "analyzed";
  sceneCount: number;
  videoId?: string;
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
  /** Hand-edited roster (e.g. filled-in appearance detail); omitted keeps the base version's roster as-is. */
  characterRoster?: RecurringCharacter[];
  objectRoster?: RecurringObject[];
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

// ---------- AI training (skills learned from videos, documents, …) ----------

/**
 * Kinds of material a skill can be trained on — the same three ways the Script
 * step gets a script: from a video link, an uploaded video, or documents. Each
 * kind is one training source on the server (`server/modules/training/sources/`);
 * adding a kind adds a value here.
 */
export type TrainingSourceKind = "link" | "upload" | "document" | "image";

/** A piece of material picked for training, by kind and id (a video id, a document id…). */
export interface TrainingSourceRef {
  kind: TrainingSourceKind;
  id: string;
}

/** Something the user can pick to train on, as listed by its source. */
export interface TrainingCandidate extends TrainingSourceRef {
  title: string;
  /** Where it lives, used to group the list (e.g. "Project › Category"). */
  group: string;
  excerpt: string;
  charCount: number;
  /** Extra state worth showing, e.g. "approved" / "analyzed" for a script. */
  badges: string[];
  /** The project video this belongs to, if any (lets the studio pre-pick it). */
  videoId?: string;
  /** Image sources only: a thumbnail, shown instead of a text excerpt. */
  previewUrl?: string;
}

/** Every source kind with its candidates and how many one run may use. */
export interface TrainingSourceList {
  kind: TrainingSourceKind;
  max: number;
  candidates: TrainingCandidate[];
}

/**
 * One run of the AI-training page: learn into a new skill, or refine an existing
 * one. Training is cumulative: refining re-reads everything the skill learned
 * before plus `sources`, and merges it with the current guide.
 */
export interface SkillTrainingRequest {
  /** Refine this skill; omitted → create a new one. */
  skillId?: string;
  /** New skill's name (the AI suggests one when empty). Ignored when refining. */
  name?: string;
  /** New skill only: "script" or "image" (an existing skill's own type always wins). Omitted → "script". */
  type?: SkillType;
  /** Material added in this run (on top of what the skill already learned from). */
  sources: TrainingSourceRef[];
  /** Previously learned sources to drop from the skill from now on. */
  removeSources?: TrainingSourceRef[];
  /** Also attach attachable sources (documents) to the skill, for script writing to consult. */
  attachToSkill?: boolean;
  provider?: "openai" | "claude";
  model?: string;
  effort?: "low" | "medium" | "high";
  /** Saved with the version, e.g. "added the March videos". */
  note?: string;
}

/** The skill fields a version captures (enough to restore it). */
export interface SkillSnapshot {
  name: string;
  description: string;
  type: SkillType;
  genre: string;
  styleTags: string[];
  toneDescription: string;
  instructions: string;
  graphicsStyle: string;
  editingStyle: string;
  pacing: { avgShotLengthSec: number; cutsPerMinute: number };
  resourceInventory: Record<string, unknown>;
}

/** "train": a training run; "restore": an older version brought back; "snapshot": the skill before its first training. */
export type SkillVersionKind = "train" | "restore" | "snapshot";

export interface SkillVersion {
  id: string;
  skillId: string;
  /** 1, 2, 3… per skill. */
  version: number;
  kind: SkillVersionKind;
  note: string;
  createdAt: string;
  snapshot: SkillSnapshot;
  /**
   * Everything the skill had learned from after this run (cumulative); `added`
   * marks what this run added. `label` is null when the item was deleted since.
   */
  sources: SkillVersionSource[];
  provider?: string;
  model?: string;
}

export interface SkillVersionSource extends TrainingSourceRef {
  label: string | null;
  added?: boolean;
}

export interface SkillTrainingResult {
  skill: SkillDetail;
  version: SkillVersion;
}

/** An uploaded training image, saved to the library of a user's image-skill training material. */
export interface TrainingImageSummary {
  id: string;
  title: string;
  fileId: string;
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

export type StoredFileKind = "document" | "asset" | "skill-attachment" | "character-reference";

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
  /** AI image sources: style references (data URLs, up to 10) to describe into the prompt. */
  referenceImages?: string[];
  /** AI image sources: output frame shape. Omitted: square. */
  aspectRatio?: ImageAspectRatio;
  /** AI image sources: a type "image" skill's locked graphics methodology, applied to every scene's generation this session. */
  graphicsStyle?: string;
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

/**
 * Prepares ready-to-paste image prompts for many required assets at once —
 * deliberately without graphicsStyle/referenceImages, for a skill attached
 * directly in an external AI chat (so style doesn't need restating per item).
 * Dry-run: never generates an image, only rewrites the prompt text.
 */
export interface AssetPromptBatchRequest {
  items: {
    key: string;
    description: string;
    sceneContext?: string;
    /** Reference photos (data URLs) of the characters in this request, named so the prompt keeps their actual look. */
    characterImages?: { name: string; image: string }[];
  }[];
  provider: "openai" | "claude";
}

export interface AssetPromptBatchResponse {
  results: { key: string; prompt: string; count: number }[];
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
