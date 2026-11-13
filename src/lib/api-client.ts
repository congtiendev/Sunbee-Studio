import type {
  AppSettings,
  AssetCandidate,
  AssetPromptBatchRequest,
  AssetPromptBatchResponse,
  AssetPromptRecord,
  AssetSplitLayersRequest,
  AssetSplitLayersResponse,
  FrameRatio,
  AssetQuerySuggestRequest,
  AssetQuerySuggestResponse,
  AssetResearchRequest,
  AssetResearchResponse,
  AuthLoginRequest,
  AuthRegisterRequest,
  Category,
  DataExportBundle,
  DataImportResult,
  DocumentLink,
  DocumentLinksRequest,
  DocumentRecord,
  DocumentSummary,
  FetchTranscriptRequest,
  FetchTranscriptResult,
  LibraryAsset,
  LibraryMediaType,
  LogsResult,
  Project,
  PromptOverride,
  PromptScope,
  PromptTaskInfo,
  RenderProject,
  RenderProjectSummary,
  RenderProjectUpdate,
  ResearchSourceInfo,
  SkillDetail,
  SkillTrainingRequest,
  SkillTrainingResult,
  SkillVersion,
  TrainingImageSummary,
  TrainingSourceList,
  SkillImportResult,
  SkillInput,
  SkillUpdateRequest,
  ScriptAnalysisListItem,
  ScriptAnalysisRecord,
  ScriptAnalysisSummary,
  ScriptApproveRequest,
  ScriptAnalyzeRequest,
  ScriptAnalyzeResponse,
  ScriptFromDocumentRequest,
  ScriptFromIdeaRequest,
  ScriptFromTemplateRequest,
  ScriptFromTemplateResponse,
  ScriptSaveTextRequest,
  SceneResource,
  SceneResourceSelectRequest,
  SoundEffectPack,
  SystemSoundLibrary,
  StyleTemplate,
  TrashItem,
  TrashItemType,
  TrashPurgeResult,
  User,
  Video,
  VideoRender,
  VideoRenderJob,
  VideoSummary,
  VoicePreset,
  VoiceProfile,
} from "@shared/types";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(
      (data && typeof data === "object" && "error" in data
        ? (data.error as string)
        : null) ?? `Request failed (${res.status})`,
    );
  }
  return data as T;
}

// Separate from `request()`: a multipart body must not be JSON-stringified,
// and the browser needs to set its own Content-Type (with the boundary).
async function requestUpload<T>(path: string, formData: FormData): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    credentials: "include",
    body: formData,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(
      (data && typeof data === "object" && "error" in data
        ? (data.error as string)
        : null) ?? `Request failed (${res.status})`,
    );
  }
  return data as T;
}

// A request whose success response is raw binary (audio), not JSON — error
// responses are still JSON, so those parse normally.
async function requestBlob(
  path: string,
  init: { method: "POST"; headers?: Record<string, string>; body: BodyInit },
): Promise<Blob> {
  const res = await fetch(path, { credentials: "include", ...init });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(
      (data && typeof data === "object" && "error" in data
        ? (data.error as string)
        : null) ?? `Request failed (${res.status})`,
    );
  }
  return res.blob();
}

export const apiClient = {
  auth: {
    register: (req: AuthRegisterRequest): Promise<User> =>
      request("/api/auth/register", {
        method: "POST",
        body: JSON.stringify(req),
      }),
    login: (req: AuthLoginRequest): Promise<User> =>
      request("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(req),
      }),
    logout: (): Promise<void> =>
      request("/api/auth/logout", { method: "POST" }),
    getSession: (): Promise<User | null> => request("/api/auth/session"),
    listUsers: (): Promise<User[]> => request("/api/admin/users"),
  },
  admin: {
    logs: (
      params: { date?: string; level?: string } = {},
    ): Promise<LogsResult> => {
      const query = new URLSearchParams();
      if (params.date) query.set("date", params.date);
      if (params.level) query.set("level", params.level);
      const qs = query.toString();
      return request(`/api/admin/logs${qs ? `?${qs}` : ""}`);
    },
  },
  settings: {
    get: (): Promise<AppSettings> => request("/api/settings"),
    set: (patch: Partial<AppSettings>): Promise<AppSettings> =>
      request("/api/settings", {
        method: "POST",
        body: JSON.stringify(patch),
      }),
    enableMcp: (): Promise<AppSettings & { url: string }> =>
      request("/api/settings/mcp/enable", { method: "POST" }),
    /** provider: "openai", "anthropic", or a research source key (pexels, pixabay, ...). */
    testKey: (req: {
      provider: string;
      apiKey: string;
    }): Promise<{ ok: true } | { ok: false; error: string }> =>
      request("/api/settings/test-key", {
        method: "POST",
        body: JSON.stringify(req),
      }),
    addAnthropicKey: (req: {
      name: string;
      apiKey: string;
    }): Promise<AppSettings> =>
      request("/api/settings/anthropic-keys", {
        method: "POST",
        body: JSON.stringify(req),
      }),
    renameAnthropicKey: (id: string, name: string): Promise<AppSettings> =>
      request(`/api/settings/anthropic-keys/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ name }),
      }),
    removeAnthropicKey: (id: string): Promise<AppSettings> =>
      request(`/api/settings/anthropic-keys/${id}`, { method: "DELETE" }),
    activateAnthropicKey: (id: string): Promise<AppSettings> =>
      request(`/api/settings/anthropic-keys/${id}/activate`, {
        method: "POST",
      }),
    researchSources: (): Promise<ResearchSourceInfo[]> =>
      request("/api/settings/research-sources"),
  },
  prompts: {
    list: (): Promise<PromptTaskInfo[]> => request("/api/prompts"),
    save: (
      taskKey: string,
      slot: string,
      content: string,
      scope: PromptScope = "user",
    ): Promise<PromptOverride> =>
      request(
        `/api/prompts/${encodeURIComponent(taskKey)}/${encodeURIComponent(slot)}`,
        {
          method: "PUT",
          body: JSON.stringify({ content, scope }),
        },
      ),
    reset: (
      taskKey: string,
      slot: string,
      scope: PromptScope = "user",
    ): Promise<{ ok: true }> =>
      request(
        `/api/prompts/${encodeURIComponent(taskKey)}/${encodeURIComponent(slot)}?scope=${scope}`,
        { method: "DELETE" },
      ),
  },
  data: {
    export: (): Promise<DataExportBundle> => request("/api/data/export"),
    import: (bundle: DataExportBundle): Promise<DataImportResult> =>
      request("/api/data/import", {
        method: "POST",
        body: JSON.stringify(bundle),
      }),
    trash: (): Promise<TrashItem[]> => request("/api/data/trash"),
    restoreTrash: (type: TrashItemType, id: string): Promise<{ ok: true }> =>
      request(`/api/data/trash/${type}/${id}/restore`, { method: "POST" }),
    purgeTrash: (type: TrashItemType, id: string): Promise<TrashPurgeResult> =>
      request(`/api/data/trash/${type}/${id}`, { method: "DELETE" }),
  },
  templates: {
    list: (): Promise<StyleTemplate[]> => request("/api/templates"),
    save: (template: SkillInput): Promise<StyleTemplate> =>
      request("/api/templates", {
        method: "POST",
        body: JSON.stringify(template),
      }),
    get: (id: string): Promise<SkillDetail> => request(`/api/templates/${id}`),
    update: (id: string, patch: SkillUpdateRequest): Promise<SkillDetail> =>
      request(`/api/templates/${id}`, {
        method: "PUT",
        body: JSON.stringify(patch),
      }),
    /** A .sunbee-skill.json, an Agent Skill SKILL.md, or an Agent Skill .zip. */
    import: (file: File): Promise<SkillImportResult> => {
      const formData = new FormData();
      formData.set("file", file);
      return requestUpload("/api/templates/import", formData);
    },
    exportUrl: (id: string): string => `/api/templates/${id}/export`,
    delete: (id: string): Promise<void> =>
      request(`/api/templates/${id}`, { method: "DELETE" }),
    /** type "image" skills: up to 10 reference illustrations (style only). */
    addReferenceImage: (id: string, file: File): Promise<SkillDetail> => {
      const formData = new FormData();
      formData.set("file", file);
      return requestUpload(`/api/templates/${id}/reference-images`, formData);
    },
    removeReferenceImage: (id: string, fileId: string): Promise<SkillDetail> =>
      request(`/api/templates/${id}/reference-images/${fileId}`, {
        method: "DELETE",
      }),
  },
  script: {
    fetchTranscript: (
      req: FetchTranscriptRequest,
    ): Promise<FetchTranscriptResult> =>
      request("/api/script/fetch-transcript", {
        method: "POST",
        body: JSON.stringify(req),
      }),
    transcribeUpload: (
      file: File,
      videoId?: string,
      provider?: "openai" | "claude",
      model?: string,
      language?: "vi" | "en",
      effort?: "low" | "medium" | "high",
    ): Promise<FetchTranscriptResult> => {
      const formData = new FormData();
      formData.set("video", file);
      if (videoId) formData.set("videoId", videoId);
      if (provider) formData.set("provider", provider);
      if (model) formData.set("model", model);
      if (language) formData.set("language", language);
      if (effort) formData.set("effort", effort);
      return requestUpload("/api/script/transcribe-upload", formData);
    },
    /** Source "document": AI writes a script from documents (saved as a draft version). */
    fromDocument: (
      req: ScriptFromDocumentRequest,
    ): Promise<FetchTranscriptResult> =>
      request("/api/script/from-document", {
        method: "POST",
        body: JSON.stringify(req),
      }),
    /** Source "idea": AI writes a script straight from a short idea (saved as a draft version). */
    fromIdea: (req: ScriptFromIdeaRequest): Promise<FetchTranscriptResult> =>
      request("/api/script/from-idea", {
        method: "POST",
        body: JSON.stringify(req),
      }),
    /** Source "template": new script + scenes modelled on an analyzed version. */
    fromTemplate: (
      req: ScriptFromTemplateRequest,
    ): Promise<ScriptFromTemplateResponse> =>
      request("/api/script/from-template", {
        method: "POST",
        body: JSON.stringify(req),
      }),
    analyze: (
      req: ScriptAnalyzeRequest,
      signal?: AbortSignal,
    ): Promise<ScriptAnalyzeResponse> =>
      request("/api/script/analyze", {
        method: "POST",
        body: JSON.stringify(req),
        signal,
      }),
    /** Full versions of one video — the body (script text, frames, scenes) included. */
    history: (videoId: string): Promise<ScriptAnalysisRecord[]> =>
      request(`/api/script/history?videoId=${videoId}`),
    /** Every version across all videos, light rows only (dashboard/admin lists). */
    historyOverview: (): Promise<ScriptAnalysisListItem[]> =>
      request("/api/script/history"),
    deleteHistory: (id: string): Promise<void> =>
      request(`/api/script/history/${id}`, { method: "DELETE" }),
    /** Saves the (edited) scenes as a new approved version — the examples skills learn from. */
    approve: (req: ScriptApproveRequest): Promise<ScriptAnalysisRecord> =>
      request("/api/script/approve", {
        method: "POST",
        body: JSON.stringify(req),
      }),
    analyzed: (approvedOnly = false): Promise<ScriptAnalysisSummary[]> =>
      request(`/api/script/analyzed${approvedOnly ? "?approved=1" : ""}`),
    /** Auto-save / manual save of hand-edited text, outside analyze/approve. */
    saveText: (req: ScriptSaveTextRequest): Promise<ScriptAnalysisRecord> =>
      request("/api/script/save-text", {
        method: "POST",
        body: JSON.stringify(req),
      }),
    /** A character/object roster entry's reference photo; returns its file id to save into `characterRoster`/`objectRoster` via approve/saveText. */
    uploadRosterImage: (file: File): Promise<{ fileId: string }> => {
      const formData = new FormData();
      formData.set("file", file);
      return requestUpload("/api/script/reference-image", formData);
    },
  },
  documents: {
    list: (): Promise<DocumentSummary[]> => request("/api/documents"),
    /** PDF, DOCX, TXT, MD, CSV or JSON; text is extracted server-side. */
    upload: (file: File, title?: string): Promise<DocumentSummary> => {
      const formData = new FormData();
      formData.set("file", file);
      if (title) formData.set("title", title);
      return requestUpload("/api/documents", formData);
    },
    createText: (title: string, text: string): Promise<DocumentSummary> =>
      request("/api/documents/text", {
        method: "POST",
        body: JSON.stringify({ title, text }),
      }),
    get: (id: string): Promise<DocumentRecord> =>
      request(`/api/documents/${id}`),
    rename: (id: string, title: string): Promise<void> =>
      request(`/api/documents/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ title }),
      }),
    delete: (id: string): Promise<void> =>
      request(`/api/documents/${id}`, { method: "DELETE" }),
    /** Replace every skill/project one document is attached to. */
    setDocumentLinks: (
      id: string,
      links: DocumentLink[],
    ): Promise<DocumentLink[]> =>
      request(`/api/documents/${id}/links`, {
        method: "PUT",
        body: JSON.stringify({ links }),
      }),
    /** Documents attached to one skill or project. */
    linkedTo: (
      targetType: DocumentLinksRequest["targetType"],
      targetId: string,
    ): Promise<DocumentSummary[]> =>
      request(
        `/api/documents/links?targetType=${targetType}&targetId=${targetId}`,
      ),
    setLinkedTo: (req: DocumentLinksRequest): Promise<DocumentSummary[]> =>
      request("/api/documents/links", {
        method: "PUT",
        body: JSON.stringify(req),
      }),
    fileUrl: (fileId: string): string => `/api/files/${fileId}`,
  },
  assets: {
    /** Research sources (stock sites, library, AI web) with availability for this user. */
    sources: (): Promise<ResearchSourceInfo[]> =>
      request("/api/assets/sources"),
    suggestQueries: (
      req: AssetQuerySuggestRequest,
    ): Promise<AssetQuerySuggestResponse> =>
      request("/api/assets/suggest-queries", {
        method: "POST",
        body: JSON.stringify(req),
      }),
    research: (req: AssetResearchRequest): Promise<AssetResearchResponse> =>
      request("/api/assets/research", {
        method: "POST",
        body: JSON.stringify(req),
      }),
    /** Ready-to-paste prompts for many required assets at once — no image generated, no graphicsStyle/referenceImages. */
    imagePrompts: (
      req: AssetPromptBatchRequest,
    ): Promise<AssetPromptBatchResponse> =>
      request("/api/assets/image-prompts", {
        method: "POST",
        body: JSON.stringify(req),
      }),
    splitLayers: (
      req: AssetSplitLayersRequest,
    ): Promise<AssetSplitLayersResponse> =>
      request("/api/assets/split-layers", {
        method: "POST",
        body: JSON.stringify(req),
      }),
    savedImagePrompts: (videoId: string): Promise<AssetPromptRecord[]> =>
      request(
        `/api/assets/image-prompts?videoId=${encodeURIComponent(videoId)}`,
      ),
    selections: (videoId: string): Promise<SceneResource[]> =>
      request(`/api/assets/selections?videoId=${videoId}`),
    /** Pick (or with candidate null, clear) the asset for one required asset of a scene. */
    select: (req: SceneResourceSelectRequest): Promise<SceneResource | null> =>
      request("/api/assets/selections", {
        method: "PUT",
        body: JSON.stringify(req),
      }),
    library: {
      list: (
        params: { q?: string; type?: LibraryMediaType; category?: string } = {},
      ): Promise<LibraryAsset[]> => {
        const query = new URLSearchParams();
        if (params.q) query.set("q", params.q);
        if (params.type) query.set("type", params.type);
        if (params.category) query.set("category", params.category);
        const qs = query.toString();
        return request(`/api/assets/library${qs ? `?${qs}` : ""}`);
      },
      upload: (
        file: File,
        meta: { name?: string; tags?: string; description?: string } = {},
      ): Promise<LibraryAsset> => {
        const formData = new FormData();
        formData.set("file", file);
        if (meta.name) formData.set("name", meta.name);
        if (meta.tags) formData.set("tags", meta.tags);
        if (meta.description) formData.set("description", meta.description);
        return requestUpload("/api/assets/library", formData);
      },
      update: (
        id: string,
        patch: { name?: string; tags?: string[]; description?: string },
      ): Promise<LibraryAsset> =>
        request(`/api/assets/library/${id}`, {
          method: "PATCH",
          body: JSON.stringify(patch),
        }),
      delete: (id: string): Promise<void> =>
        request(`/api/assets/library/${id}`, { method: "DELETE" }),
      /** Keeps a research candidate (an AI-generated image, a stock pick, ...) as a library asset. */
      fromCandidate: (
        candidate: AssetCandidate,
        meta: { name?: string; tags?: string; description?: string } = {},
      ): Promise<LibraryAsset> =>
        request("/api/assets/library/from-candidate", {
          method: "POST",
          body: JSON.stringify({ candidate, ...meta }),
        }),
    },
    /** The system sound library: browse/preview every sound, save single sounds into the library. */
    systemSounds: {
      list: (): Promise<SystemSoundLibrary> => request("/api/assets/system-sounds"),
      audioUrl: (id: string): string => `/api/assets/system-sounds/audio?id=${encodeURIComponent(id)}`,
      save: (id: string): Promise<LibraryAsset> =>
        request("/api/assets/system-sounds/save", { method: "POST", body: JSON.stringify({ id }) }),
    },
    /** Ready-made sound-effect packs the user can add to the library with one click. */
    soundPacks: {
      list: (): Promise<SoundEffectPack[]> => request("/api/assets/sound-packs"),
      install: (id: string): Promise<LibraryAsset[]> =>
        request(`/api/assets/sound-packs/${encodeURIComponent(id)}/install`, { method: "POST" }),
    },
  },
  /** Video render: self-contained render projects (own script, AI scenes, images, audio) rendered to MP4. */
  videoRender: {
    list: (): Promise<RenderProjectSummary[]> => request("/api/video-render/projects"),
    create: (name: string): Promise<RenderProject> =>
      request("/api/video-render/projects", {
        method: "POST",
        body: JSON.stringify({ name }),
      }),
    get: (id: string): Promise<RenderProject> =>
      request(`/api/video-render/projects/${encodeURIComponent(id)}`),
    update: (id: string, patch: RenderProjectUpdate): Promise<RenderProject> =>
      request(`/api/video-render/projects/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    delete: (id: string): Promise<void> =>
      request(`/api/video-render/projects/${encodeURIComponent(id)}`, { method: "DELETE" }),
    /** Gets the script from a Studio script source (link, document, idea, template) using the saved inputs — kept in the project only. */
    scriptFromSource: (
      id: string,
      source: "link" | "document" | "idea" | "template",
    ): Promise<RenderProject> =>
      request(`/api/video-render/projects/${encodeURIComponent(id)}/script/${source}`, { method: "POST" }),
    /** Transcribes an uploaded video/audio file into the project's script. */
    scriptFromUpload: (id: string, file: File): Promise<RenderProject> => {
      const formData = new FormData();
      formData.set("file", file);
      return requestUpload(`/api/video-render/projects/${encodeURIComponent(id)}/script/upload`, formData);
    },
    /** AI breaks the saved script into scenes, replacing the current ones. */
    splitScenes: (id: string): Promise<RenderProject> =>
      request(`/api/video-render/projects/${encodeURIComponent(id)}/split-scenes`, { method: "POST" }),
    /** Starts rendering the saved project in the background; poll `renderStatus` for progress. */
    render: (id: string): Promise<VideoRenderJob> =>
      request(`/api/video-render/projects/${encodeURIComponent(id)}/render`, { method: "POST" }),
    renderStatus: (id: string): Promise<VideoRenderJob | null> =>
      request(`/api/video-render/projects/${encodeURIComponent(id)}/render-status`),
    renders: (id: string): Promise<VideoRender[]> =>
      request(`/api/video-render/projects/${encodeURIComponent(id)}/renders`),
  },
  /** AI training: skills learned from videos and documents, one version per run. */
  training: {
    sources: (): Promise<TrainingSourceList[]> =>
      request("/api/training/sources"),
    run: (req: SkillTrainingRequest): Promise<SkillTrainingResult> =>
      request("/api/training/run", {
        method: "POST",
        body: JSON.stringify(req),
      }),
    versions: (skillId: string): Promise<SkillVersion[]> =>
      request(`/api/training/skills/${skillId}/versions`),
    restore: (
      skillId: string,
      versionId: string,
    ): Promise<SkillTrainingResult> =>
      request(`/api/training/skills/${skillId}/versions/${versionId}/restore`, {
        method: "POST",
      }),
    /** Image-skill training material: a reusable library of example images. */
    uploadImage: (file: File): Promise<TrainingImageSummary> => {
      const formData = new FormData();
      formData.set("file", file);
      return requestUpload("/api/training/images", formData);
    },
  },
  /** Voice library: reusable voices cloned from one reference sample each. */
  voiceover: {
    list: (): Promise<VoiceProfile[]> => request("/api/voiceover/profiles"),
    create: (name: string, sample: File): Promise<VoiceProfile> => {
      const formData = new FormData();
      formData.set("name", name);
      formData.set("sample", sample);
      return requestUpload("/api/voiceover/profiles", formData);
    },
    delete: (id: string): Promise<void> =>
      request(`/api/voiceover/profiles/${id}`, { method: "DELETE" }),
    /** Reads `text` aloud in this voice; the result is a playable WAV blob. */
    preview: (id: string, text: string): Promise<Blob> =>
      requestBlob(`/api/voiceover/profiles/${id}/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      }),
    /** Ready-made voices the user can add to their library with one click. */
    presets: {
      list: (): Promise<VoicePreset[]> => request("/api/voiceover/presets"),
      install: (id: string): Promise<VoiceProfile> =>
        request(`/api/voiceover/presets/${id}/install`, { method: "POST" }),
      /** Reads `text` aloud in a catalog voice, before installing it. */
      preview: (id: string, text: string): Promise<Blob> =>
        requestBlob(`/api/voiceover/presets/${id}/preview`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        }),
    },
    /** Isolates the vocal track from a song; the result is a playable WAV blob, not saved anywhere yet. */
    separateVocals: (song: File): Promise<Blob> => {
      const formData = new FormData();
      formData.set("song", song);
      return requestBlob("/api/voiceover/separate-vocals", {
        method: "POST",
        body: formData,
      });
    },
  },
  projects: {
    list: (): Promise<Project[]> => request("/api/projects"),
    get: (id: string): Promise<Project> => request(`/api/projects/${id}`),
    create: (name: string): Promise<Project> =>
      request("/api/projects", {
        method: "POST",
        body: JSON.stringify({ name }),
      }),
    rename: (id: string, name: string): Promise<void> =>
      request(`/api/projects/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ name }),
      }),
    delete: (id: string): Promise<void> =>
      request(`/api/projects/${id}`, { method: "DELETE" }),
  },
  categories: {
    list: (projectId: string): Promise<Category[]> =>
      request(`/api/categories?projectId=${projectId}`),
    create: (projectId: string, name: string): Promise<Category> =>
      request("/api/categories", {
        method: "POST",
        body: JSON.stringify({ projectId, name }),
      }),
    rename: (id: string, name: string): Promise<void> =>
      request(`/api/categories/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ name }),
      }),
    delete: (id: string): Promise<void> =>
      request(`/api/categories/${id}`, { method: "DELETE" }),
  },
  videos: {
    list: (categoryId: string): Promise<VideoSummary[]> =>
      request(`/api/videos?categoryId=${categoryId}`),
    listByProject: (projectId: string): Promise<VideoSummary[]> =>
      request(`/api/videos?projectId=${projectId}`),
    recent: (limit?: number): Promise<VideoSummary[]> =>
      request(`/api/videos/recent${limit ? `?limit=${limit}` : ""}`),
    get: (id: string): Promise<VideoSummary> => request(`/api/videos/${id}`),
    create: (categoryId: string, name: string): Promise<Video> =>
      request("/api/videos", {
        method: "POST",
        body: JSON.stringify({ categoryId, name }),
      }),
    setFrameRatio: (id: string, frameRatio: FrameRatio): Promise<void> =>
      request(`/api/videos/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ frameRatio }),
      }),
    rename: (id: string, name: string): Promise<void> =>
      request(`/api/videos/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ name }),
      }),
    delete: (id: string): Promise<void> =>
      request(`/api/videos/${id}`, { method: "DELETE" }),
  },
};
