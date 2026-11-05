export interface VideoAnalyzeRequest {
  sourceType: "youtube" | "upload";
  url?: string;
  localFilePath?: string;
  sourceOwnership: "own" | "reference";
}

export interface VideoAnalyzeResult {
  jobId: string;
}

export interface VideoProgressEvent {
  jobId: string;
  stage: string;
  status: "running" | "succeeded" | "failed" | "awaiting_manual_export";
  percent: number;
  message: string;
}

export interface AppSettings {
  openaiApiKey?: string;
  anthropicApiKey?: string;
  encryptionAvailable: boolean;
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
}
