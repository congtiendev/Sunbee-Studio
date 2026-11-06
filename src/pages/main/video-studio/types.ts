export type VideoStudioStepKey = "script" | "assets" | "editPlan" | "render";

export interface VideoStudioStep {
  key: VideoStudioStepKey;
  label: string;
}
