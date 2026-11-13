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
  /** The Assets step's graphics skill ("" = none), saved with its Save button. */
  assetsGraphicsSkillId?: string;
  /** Hand-edited replacement for the generated ChatGPT-pack instructions (`huong-dan.md`) — shared by every pack, not tied to any video. */
  assetsPackInstructions?: string;
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
  | "id"
  | "createdAt"
  | "updatedAt"
  | "userId"
  | "ownerEmail"
  | "referenceImageFileIds"
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

/** A video's frame shape (see `shared/frame-ratio.ts`). */
export type FrameRatio = "1:1" | "9:16" | "16:9" | "4:3";

/**
 * What one required-asset image is: a whole frame of its scene ("scene"), or
 * just its subject on a transparent background ("cutout") to be composited
 * onto the frame and animated in editing — anything that moves or changes on
 * its own (a phone lighting up, a character waving) is a cutout.
 */
export type ImageLayer = "scene" | "cutout";

export interface Video {
  id: string;
  categoryId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  userId?: string;
  ownerEmail?: string;
  /** Unset until picked; treat as `DEFAULT_FRAME_RATIO`. */
  frameRatio?: FrameRatio;
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
  effort?: "low" | "medium" | "high";
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
  "extremeCloseUp" | "closeUp" | "medium" | "wide" | "extremeWide";

export type CameraMovement =
  "static" | "pan" | "tilt" | "zoom" | "handheld" | "tracking";

/** Camera angle of one shot (see `shared/shots.ts` for how it's described to an AI). */
export type ShotAngle =
  | "eyeLevel"
  | "highAngle"
  | "lowAngle"
  | "topDown"
  | "overShoulder"
  | "pov"
  | "dutch";

/**
 * One shot of a scene, planned the way a film director breaks a moment into
 * coverage (establishing, insert, reaction, over-the-shoulder...). Each shot
 * has its own framing, so its images are drawn for that framing.
 */
export interface SceneShot {
  /** 1-based, in screen order. */
  order: number;
  shotSize: ShotSize;
  angle: ShotAngle;
  cameraMovement: CameraMovement;
  /** What's in frame and what happens in it. */
  subject: string;
  /** Why the shot is there (the story beat it carries). */
  purpose: string;
  durationSec: number;
  /**
   * The camera/transition technique of this shot, if any — the kind that
   * decides what gets drawn ("POV qua màn hình", "match cut từ mặt đồng hồ
   * sang mặt trăng", "parallax 3 lớp", "whip pan sang cảnh sau"...); empty for
   * a plain cut. Pure editing effects (crash zoom, freeze frame, speed ramp,
   * J/L-cut, pop-up text) are left to the edit plan step.
   */
  technique?: string;
}

export type RequiredAssetType = "image" | "video" | "audio" | "graphic";
export type RequiredAssetSource = "generate" | "stock" | "provided";

export interface RequiredAsset {
  type: RequiredAssetType;
  description: string;
  source: RequiredAssetSource;
  /**
   * Images only: a whole frame of the scene, or one subject (in one visual
   * state) for a transparent PNG composited and animated in editing. A
   * subject that changes during the scene is split by the analysis into a
   * background frame plus one cutout per state. Absent on older analyses.
   */
  layer?: ImageLayer;
  /**
   * Images only: how this image sits in its scene's frame. A background: the
   * camera angle/perspective and the spots left empty for what's composited.
   * A cutout: where it goes, what it rests on, its angle in that perspective,
   * facing and size in the frame — so it's drawn to fit, not flat-on.
   */
  placement?: string;
  /** Images only: the `SceneShot.order` this image is for (drawn in that shot's framing). */
  shot?: number;
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
  /** The scene broken into shots like film coverage; absent on older analyses (one shot = the scene's own framing). */
  shots?: SceneShot[];
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
export type ScriptSourceType =
  "youtube" | "import" | "document" | "template" | "idea";

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
  /** Step 2 picks (which candidate was chosen for each scene's required asset). Image files themselves aren't backed up. */
  sceneResources: SceneResource[];
  /** Step 2's cached written prompts, with the video they belong to (not on `AssetPromptRecord` itself). */
  assetPrompts: (AssetPromptRecord & { videoId: string })[];
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
  sceneResources: number;
  assetPrompts: number;
  anthropicKeys: number;
  openaiKeyImported: boolean;
  /** Categories whose project wasn't in the backup, put into a recovery project. */
  recoveredCategories?: number;
  /** Videos whose category wasn't in the backup, put into the recovery project. */
  recoveredVideos?: number;
  /** Skill reference images the backup only names (image files aren't backed up). */
  missingReferenceImages?: number;
  /** Bundle records already imported in an earlier run (matched by their original id) — skipped instead of creating a duplicate. */
  skippedDuplicates?: number;
}

export type TrashItemType = "project" | "category" | "video";

/** A soft-deleted project, category or video, as the Trash page lists it. */
export interface TrashItem {
  type: TrashItemType;
  id: string;
  name: string;
  deletedAt: string;
  ownerEmail?: string;
  /** Breadcrumb for context: the project's name for a category, "project / category" for a video. */
  parentLabel?: string;
}

/** What a trash purge actually removed — a project/category cascades into everything under it. */
export interface TrashPurgeResult {
  projects: number;
  categories: number;
  videos: number;
  scriptAnalyses: number;
  sceneResources: number;
  assetPrompts: number;
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

export type StoredFileKind =
  | "document"
  | "asset"
  | "skill-attachment"
  | "character-reference"
  | "voice-sample";

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

/** Only one local engine (VieNeu-TTS) today; the field exists so a profile keeps working if another is added later. */
export type VoiceEngine = "local";

/** A reusable voice for the TTS sidecar — either cloned from a sample, or one of VieNeu-TTS's built-in voices. */
export interface VoiceProfile {
  id: string;
  name: string;
  engine: VoiceEngine;
  /** Cloned from this sample. Exactly one of this or `presetVoiceId` is set. */
  sampleFileId?: string;
  /** One of VieNeu-TTS's 25 built-in voices (see `vieneu-presets.ts`) — no sample, ready instantly. */
  presetVoiceId?: string;
  createdAt: string;
  /** The catalog preset (see `VoicePreset`) this was installed from, if any. */
  presetId?: string;
}

export interface VoicePreviewRequest {
  text: string;
}

/**
 * A ready-made voice listed in the catalog (`server/services/voice/presets.ts`,
 * merging VieNeu-TTS's 25 built-in voices with a user-filled manifest of their
 * own sample-based voices) that the user can add to their library with one
 * click — no sample of their own to record.
 */
export interface VoicePreset {
  id: string;
  name: string;
  language: string;
  gender: "male" | "female" | "other";
  description?: string;
  /** Shown so a legally murky voice (most community checkpoints) isn't installed blindly. */
  license?: string;
  /** true = license allows commercial use; false = no; undefined = unclear — verify yourself. */
  commercialOk?: boolean;
  /** Whether the caller already installed this preset (as a `VoiceProfile`). */
  installed: boolean;
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
  /** Folder-like grouping, mainly used for sound effects (e.g. "whooshes"); free-form, unset for most assets. */
  category?: string;
  tags: string[];
  description: string;
  mime: string;
  size: number;
  createdAt: string;
  ownerEmail?: string;
  /** The catalog pack (see `SoundEffectPack`) this was installed from, if any. */
  sourcePackId?: string;
}

/**
 * A ready-made sound-effect pack listed in the catalog
 * (`server/modules/assets/sound-effects/`) that the user can add to their
 * library with one click — a whole category's worth of sounds at once.
 */
export interface SoundEffectPack {
  /** `sfxkit:<category>` or `kenney:<slug>` — also what `POST /sound-packs/:id/install` takes. */
  id: string;
  title: string;
  description?: string;
  /** How many sounds this pack adds. */
  soundCount: number;
  source: "SFX Kit (Wyzowl)" | "Kenney.nl";
  license: string;
  /** Whether the caller already installed this pack (at least one asset with this `sourcePackId`). */
  installed: boolean;
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
  /** AI image sources: the video's frame ratio — takes precedence over `aspectRatio`. */
  frameRatio?: FrameRatio;
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
    /** Chosen by the user; omitted lets the AI decide from the description. */
    layer?: ImageLayer;
    /** Where/at what angle it sits in its scene (see `RequiredAsset.placement`). */
    placement?: string;
    /** The shot it's for, described (`describeShotForAi`). */
    shot?: string;
  }[];
  provider: "openai" | "claude";
  model?: string;
  effort?: "low" | "medium" | "high";
  /** When set, each prompt is saved to this video as soon as it's written (see `AssetPromptRecord`). */
  videoId?: string;
  /** The frame the prompts compose for. */
  frameRatio?: FrameRatio;
}

export interface AssetPromptBatchResponse {
  results: { key: string; prompt: string; count: number; layer: ImageLayer }[];
}

export interface AssetSplitLayersRequest {
  videoId: string;
  /** The analyzed version whose scenes get split; overwritten in place, no new version. */
  versionId: string;
  fromScene: number;
  toScene: number;
  /** Chosen by the user; Claude when omitted. */
  provider?: "openai" | "claude";
  model?: string;
  effort?: "low" | "medium" | "high";
}

export interface AssetSplitLayersResponse {
  version: ScriptAnalysisRecord;
  /** Scenes whose asset list changed (their earlier picks were cleared). */
  changedScenes: number[];
}

/** A saved AI-written image prompt of one of a video's required assets, matched by its description. */
export interface AssetPromptRecord {
  description: string;
  prompt: string;
  /** The frame it was written for; a prompt for another ratio (or none, older ones) isn't reused. */
  frameRatio?: FrameRatio;
  layer?: ImageLayer;
  updatedAt: string;
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
