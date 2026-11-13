import { apiClient } from "@/lib/api-client";
import type { ScriptSourceState } from "@/pages/main/studio/steps/script/source-state";
import type { ScriptSourceKey } from "@/pages/main/studio/steps/script/sources/registry";
import { NO_TEMPLATE } from "@/pages/main/studio/steps/script/use-script-step";
import { defaultModelFor, type AnalyzeProvider } from "@shared/script-cost-estimate";
import type { RenderSourceMode, StyleTemplate } from "@shared/types";
import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { RenderProjectState } from "./use-render-project";

/** The Studio's picker calls "type/paste it yourself" `import`; a render project stores it as `script`. */
export function sourceKeyOf(mode: RenderSourceMode): ScriptSourceKey {
  return mode === "script" ? "import" : mode;
}

export function sourceModeOf(key: ScriptSourceKey): RenderSourceMode {
  return key === "import" ? "script" : key;
}

/** A React-style setter (value or updater) over a value stored somewhere else. */
function setterOf<T>(current: T, set: (value: T) => void): Dispatch<SetStateAction<T>> {
  return (action) => set(typeof action === "function" ? (action as (prev: T) => T)(current) : action);
}

/**
 * Drives the Video Studio's own script-source UI (panels, script editor,
 * skill picker) from a render project: every input lands in the project's
 * `sourceOptions`, and every action runs through the video-render API — so the
 * script is kept in the project, never as a Studio script version.
 */
export function useRenderScriptSource(state: RenderProjectState): ScriptSourceState {
  const project = state.project!;
  const options = project.sourceOptions;
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [styleTemplates, setStyleTemplates] = useState<StyleTemplate[]>([]);
  const [availableProviders, setAvailableProviders] = useState<Record<AnalyzeProvider, boolean>>({
    openai: true,
    claude: true,
  });
  const [elapsedSec, setElapsedSec] = useState(0);
  const working = state.scripting || state.splitting;

  useEffect(() => {
    let active = true;
    apiClient.templates
      .list()
      .then((list) => active && setStyleTemplates(list.filter((t) => (t.type ?? "script") === "script")))
      .catch(() => undefined);
    apiClient.settings
      .get()
      .then(
        (settings) =>
          active &&
          setAvailableProviders({
            openai: Boolean(settings.openaiApiKey),
            claude: Boolean(settings.anthropicApiKey),
          }),
      )
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  // Same "Working… 0:12" clock the Studio's script editor shows.
  useEffect(() => {
    if (!working) return;
    setElapsedSec(0);
    const id = setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [working]);

  const provider = options.provider ?? "claude";
  const duration = project.targetDurationSec;
  const setDuration = setterOf(duration, (targetDurationSec) => state.patch({ targetDurationSec }));
  const documentIds = options.documentIds ?? [];
  const setDocumentIds = setterOf(documentIds, (ids) => state.patchSource({ documentIds: ids }));
  const mode = project.sourceMode;
  const scriptingFrom = (...modes: RenderSourceMode[]) => state.scripting && modes.includes(mode);

  return {
    availableProviders,
    describeProvider: provider,
    changeDescribeProvider: (next) => state.patchSource({ provider: next, model: defaultModelFor(next) }),
    describeModel: options.model ?? defaultModelFor(provider),
    setDescribeModel: setterOf(options.model ?? defaultModelFor(provider), (model) => state.patchSource({ model })),
    effort: options.effort ?? "medium",
    setEffort: setterOf(options.effort ?? "medium", (effort) => state.patchSource({ effort })),
    scriptLanguage: options.language ?? "vi",
    setScriptLanguage: setterOf(options.language ?? "vi", (language) => state.patchSource({ language })),
    styleTemplates,
    selectedTemplateId: options.styleTemplateId ?? NO_TEMPLATE,
    setSelectedTemplateId: setterOf(options.styleTemplateId ?? NO_TEMPLATE, (id) =>
      state.patchSource({ styleTemplateId: id === NO_TEMPLATE ? undefined : id }),
    ),

    url: options.url ?? "",
    setUrl: setterOf(options.url ?? "", (url) => state.patchSource({ url })),
    linkUseAi: options.linkUseAi ?? true,
    setLinkUseAi: setterOf(options.linkUseAi ?? true, (linkUseAi) => state.patchSource({ linkUseAi })),
    linkOrigin: null,
    fetchFromLink: () => state.fetchScript("link"),
    fetching: scriptingFrom("link"),

    uploadFile,
    setUploadFile,
    transcribeUpload: async () => {
      if (uploadFile) await state.uploadScript(uploadFile);
    },
    transcribing: scriptingFrom("upload"),

    sourceDocumentIds: documentIds,
    setSourceDocumentIds: setDocumentIds,
    brief: options.brief ?? "",
    setBrief: setterOf(options.brief ?? "", (brief) => state.patchSource({ brief })),
    targetDurationSec: duration,
    setTargetDurationSec: setDuration,
    writeFromDocuments: () => state.fetchScript("document"),

    idea: project.ideaText,
    setIdea: setterOf(project.ideaText, (ideaText) => state.patch({ ideaText })),
    ideaDurationSec: duration,
    setIdeaDurationSec: setDuration,
    writeFromIdea: () => state.fetchScript("idea"),

    // Not a Studio video: every analyzed version is a valid template.
    videoId: "",
    templateVersionId: options.templateVersionId ?? null,
    setTemplateVersionId: setterOf(options.templateVersionId ?? null, (id) =>
      state.patchSource({ templateVersionId: id ?? undefined }),
    ),
    topic: options.topic ?? "",
    setTopic: setterOf(options.topic ?? "", (topic) => state.patchSource({ topic })),
    templateDocumentIds: documentIds,
    setTemplateDocumentIds: setDocumentIds,
    templateDurationSec: duration,
    setTemplateDurationSec: setDuration,
    writeFromTemplate: () => state.fetchScript("template"),
    writing: scriptingFrom("document", "idea", "template"),

    scriptText: project.scriptText,
    setScriptText: (scriptText) => state.patch({ scriptText }),
    busy: state.busy,
    analyzing: state.splitting,
    elapsedSec,
  };
}
