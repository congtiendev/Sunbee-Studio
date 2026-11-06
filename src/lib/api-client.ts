import type {
  AppSettings,
  AuthLoginRequest,
  AuthRegisterRequest,
  Category,
  DataExportBundle,
  DataImportResult,
  FetchTranscriptRequest,
  FetchTranscriptResult,
  LogsResult,
  Project,
  ScriptAnalysisRecord,
  ScriptAnalyzeRequest,
  ScriptAnalyzeResponse,
  StyleTemplate,
  User,
  Video,
} from "@shared/types";

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
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
    logs: (params: { date?: string; level?: string } = {}): Promise<LogsResult> => {
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
    testKey: (req: {
      provider: "openai" | "anthropic";
      apiKey: string;
    }): Promise<{ ok: true } | { ok: false; error: string }> =>
      request("/api/settings/test-key", {
        method: "POST",
        body: JSON.stringify(req),
      }),
    addAnthropicKey: (req: { name: string; apiKey: string }): Promise<AppSettings> =>
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
      request(`/api/settings/anthropic-keys/${id}/activate`, { method: "POST" }),
  },
  data: {
    export: (): Promise<DataExportBundle> => request("/api/data/export"),
    import: (bundle: DataExportBundle): Promise<DataImportResult> =>
      request("/api/data/import", {
        method: "POST",
        body: JSON.stringify(bundle),
      }),
  },
  templates: {
    list: (): Promise<StyleTemplate[]> => request("/api/templates"),
    save: (
      template: Omit<
        StyleTemplate,
        "id" | "createdAt" | "userId" | "ownerEmail"
      >,
    ): Promise<StyleTemplate> =>
      request("/api/templates", {
        method: "POST",
        body: JSON.stringify(template),
      }),
    delete: (id: string): Promise<void> =>
      request(`/api/templates/${id}`, { method: "DELETE" }),
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
    ): Promise<FetchTranscriptResult> => {
      const formData = new FormData();
      formData.set("video", file);
      if (videoId) formData.set("videoId", videoId);
      return requestUpload("/api/script/transcribe-upload", formData);
    },
    analyze: (req: ScriptAnalyzeRequest): Promise<ScriptAnalyzeResponse> =>
      request("/api/script/analyze", {
        method: "POST",
        body: JSON.stringify(req),
      }),
    history: (videoId?: string): Promise<ScriptAnalysisRecord[]> =>
      request(`/api/script/history${videoId ? `?videoId=${videoId}` : ""}`),
    deleteHistory: (id: string): Promise<void> =>
      request(`/api/script/history/${id}`, { method: "DELETE" }),
  },
  projects: {
    list: (): Promise<Project[]> => request("/api/projects"),
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
    list: (categoryId: string): Promise<Video[]> =>
      request(`/api/videos?categoryId=${categoryId}`),
    create: (categoryId: string, name: string): Promise<Video> =>
      request("/api/videos", {
        method: "POST",
        body: JSON.stringify({ categoryId, name }),
      }),
  },
};
