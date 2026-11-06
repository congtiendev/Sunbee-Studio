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
  userId?: string;
  ownerEmail?: string;
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
}

export interface FetchTranscriptResult {
  scriptText: string;
  frames?: string[];
  versionId?: string;
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

export interface ScriptAnalyzeRequest {
  scriptText: string;
  sourceType?: "youtube" | "import";
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
  sourceType: "youtube" | "import";
  sourceUrl?: string;
  scriptText: string;
  frames: string[];
  kind: "draft" | "analyzed";
  scenes: ScriptScene[];
  resources: ScriptResources;
  style?: ScriptStyle;
  videoId?: string;
  userId?: string;
  ownerEmail?: string;
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
