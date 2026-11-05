import type {
  AppSettings,
  StyleTemplate,
  VideoAnalyzeRequest,
  VideoAnalyzeResult,
  VideoProgressEvent,
} from "../../electron/shared/types";

declare global {
  interface Window {
    sunbeeVideo: {
      analyzeVideo(req: VideoAnalyzeRequest): Promise<VideoAnalyzeResult>;
      onProgress(cb: (e: VideoProgressEvent) => void): () => void;
    };
    sunbeeSettings: {
      get(): Promise<AppSettings>;
      set(patch: Partial<AppSettings>): Promise<AppSettings>;
    };
    sunbeeTemplates: {
      list(): Promise<StyleTemplate[]>;
      save(
        template: Omit<StyleTemplate, "id" | "createdAt">,
      ): Promise<StyleTemplate>;
      delete(id: string): Promise<void>;
    };
  }
}

export {};
