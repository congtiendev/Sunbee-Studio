import { apiClient } from "@/lib/api-client";
import {
  defaultModelFor,
  estimateAnalyzeScriptCost,
  type AnalyzeProvider,
} from "@shared/script-cost-estimate";
import type {
  LinkScriptOrigin,
  RecurringCharacter,
  RecurringObject,
  ScriptAnalysisRecord,
  ScriptAnalyzeResult,
  ScriptScene,
  ScriptSourceType,
  StyleTemplate,
} from "@shared/types";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ScriptSourceKey } from "./sources/registry";

export const NO_TEMPLATE = "__none__";

export type AnalyzeEffort = "low" | "medium" | "high";
export type ScriptLanguage = "vi" | "en";

/** The source picker entry a saved version came from. */
function modeForSource(sourceType: ScriptSourceType): ScriptSourceKey {
  if (sourceType === "youtube") return "link";
  if (sourceType === "document") return "document";
  if (sourceType === "idea") return "idea";
  if (sourceType === "template") return "template";
  return "import";
}

/** How the version produced by each source is labelled when analyzed. */
function sourceTypeForMode(mode: ScriptSourceKey): ScriptSourceType {
  if (mode === "link") return "youtube";
  if (mode === "document") return "document";
  if (mode === "idea") return "idea";
  if (mode === "template") return "template";
  return "import";
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * All state and actions of the script step. The step's components are thin
 * views over this hook, so a new source panel or result section only needs
 * the slice of state it reads.
 */
export function useScriptStep(videoId: string, onAnalyzed?: () => void) {
  const [mode, setMode] = useState<ScriptSourceKey>("link");
  const [url, setUrl] = useState("");
  // Source "link": AI cleans captions / transcribes videos without captions.
  const [linkUseAi, setLinkUseAi] = useState(true);
  const [linkOrigin, setLinkOrigin] = useState<LinkScriptOrigin | null>(null);
  const [scriptText, setScriptTextRaw] = useState("");
  const [fetching, setFetching] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [writing, setWriting] = useState(false);
  // Source "document": which documents to write from, the brief and target length.
  const [sourceDocumentIds, setSourceDocumentIds] = useState<string[]>([]);
  const [brief, setBrief] = useState("");
  const [targetDurationSec, setTargetDurationSec] = useState<number | null>(60);
  // Source "idea": the idea itself and its target length.
  const [idea, setIdea] = useState("");
  const [ideaDurationSec, setIdeaDurationSec] = useState<number | null>(60);

  // The idea/brief text and target length are page settings, not tied to any
  // saved version — kept in the user's account settings so they don't
  // quietly reset on reload (or on another device).
  const [draftSettingsLoaded, setDraftSettingsLoaded] = useState(false);
  useEffect(() => {
    let active = true;
    void apiClient.settings.get().then((settings) => {
      if (!active) return;
      if (settings.scriptDocumentDurationSec) setTargetDurationSec(settings.scriptDocumentDurationSec);
      if (settings.scriptIdeaDurationSec) setIdeaDurationSec(settings.scriptIdeaDurationSec);
      if (settings.scriptDocumentBrief) setBrief(settings.scriptDocumentBrief);
      if (settings.scriptIdeaText) setIdea(settings.scriptIdeaText);
      setDraftSettingsLoaded(true);
    });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!draftSettingsLoaded) return;
    const id = setTimeout(
      () => void apiClient.settings.set({ scriptDocumentDurationSec: targetDurationSec }),
      800,
    );
    return () => clearTimeout(id);
  }, [targetDurationSec, draftSettingsLoaded]);
  useEffect(() => {
    if (!draftSettingsLoaded) return;
    const id = setTimeout(
      () => void apiClient.settings.set({ scriptIdeaDurationSec: ideaDurationSec }),
      800,
    );
    return () => clearTimeout(id);
  }, [ideaDurationSec, draftSettingsLoaded]);
  useEffect(() => {
    if (!draftSettingsLoaded) return;
    const id = setTimeout(() => void apiClient.settings.set({ scriptDocumentBrief: brief }), 800);
    return () => clearTimeout(id);
  }, [brief, draftSettingsLoaded]);
  useEffect(() => {
    if (!draftSettingsLoaded) return;
    const id = setTimeout(() => void apiClient.settings.set({ scriptIdeaText: idea }), 800);
    return () => clearTimeout(id);
  }, [idea, draftSettingsLoaded]);
  // Source "template": the analyzed version to model, the new topic, optional facts.
  const [templateVersionId, setTemplateVersionId] = useState<string | null>(null);
  const [topic, setTopic] = useState("");
  const [templateDocumentIds, setTemplateDocumentIds] = useState<string[]>([]);
  /** null → same length as the template. */
  const [templateDurationSec, setTemplateDurationSec] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<
    | (ScriptAnalyzeResult & {
        characterRoster?: RecurringCharacter[];
        objectRoster?: RecurringObject[];
      })
    | null
  >(null);
  const [styleTemplates, setStyleTemplates] = useState<StyleTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState(NO_TEMPLATE);
  // Type "editing" skills: shot/cut/pacing methodology applied to the
  // scene-breakdown (analyze) step, independent of the writing skill above.
  const [editingStyleTemplates, setEditingStyleTemplates] = useState<StyleTemplate[]>([]);
  const [selectedEditingStyleId, setSelectedEditingStyleId] = useState(NO_TEMPLATE);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [frames, setFrames] = useState<string[]>([]);
  const [provider, setProvider] = useState<AnalyzeProvider>("claude");
  const [model, setModel] = useState<string>(defaultModelFor("claude"));
  const [effort, setEffort] = useState<AnalyzeEffort>("medium");
  const [availableProviders, setAvailableProviders] = useState<
    Record<AnalyzeProvider, boolean>
  >({ openai: true, claude: true });
  const [currentVersionId, setCurrentVersionId] = useState<string | null>(null);
  // Tracks whether `scriptText` has hand-edits beyond the last save, and when
  // that last save happened — shown next to the history button so the user
  // always knows which version is in use and whether anything would be lost.
  const [savedScriptText, setSavedScriptText] = useState("");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [savingText, setSavingText] = useState(false);
  const [noSpeechHint, setNoSpeechHint] = useState(false);
  const [aiDescribed, setAiDescribed] = useState(false);
  const [describeProvider, setDescribeProvider] = useState<AnalyzeProvider>("claude");
  const [describeModel, setDescribeModel] = useState<string>(defaultModelFor("claude"));
  const [scriptLanguage, setScriptLanguage] = useState<ScriptLanguage>("vi");
  // Bumped whenever a new analysis result is loaded, so result sections can reset local state.
  const [resultKey, setResultKey] = useState(0);
  // Whether the loaded result is a user-approved version (a skill example candidate).
  const [approved, setApproved] = useState(false);
  const [approving, setApproving] = useState(false);

  const busy = fetching || transcribing || writing || analyzing;

  // Seconds elapsed since the current AI call started — shown so a long
  // fetch/analysis doesn't look stalled.
  const [elapsedSec, setElapsedSec] = useState(0);
  useEffect(() => {
    if (!busy) return;
    setElapsedSec(0);
    const id = setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [busy]);

  const changeProvider = (next: AnalyzeProvider) => {
    setProvider(next);
    setModel(defaultModelFor(next));
  };

  const changeDescribeProvider = (next: AnalyzeProvider) => {
    setDescribeProvider(next);
    setDescribeModel(defaultModelFor(next));
  };

  /** Editing the script by hand drops the "no speech detected" hint. */
  const setScriptText = (text: string) => {
    setScriptTextRaw(text);
    setNoSpeechHint(false);
    setAiDescribed(false);
    setLinkOrigin(null);
  };

  const refreshTemplates = () =>
    apiClient.templates
      .list()
      .then((templates) => {
        // Image-type skills apply to the Assets step, not script writing.
        setStyleTemplates(templates.filter((t) => (t.type ?? "script") === "script"));
        setEditingStyleTemplates(templates.filter((t) => t.type === "editing"));
      })
      .catch(() => {
        // Non-critical: the style-template pickers just stay empty.
      });

  useEffect(() => {
    let active = true;
    void refreshTemplates();
    apiClient.settings
      .get()
      .then((settings) => {
        if (!active) return;
        setAvailableProviders({
          openai: Boolean(settings.openaiApiKey),
          claude: Boolean(settings.anthropicApiKey),
        });
        // Prefer Claude by default, but fall back to whichever key is
        // actually configured if only one of them is.
        if (!settings.anthropicApiKey && settings.openaiApiKey) {
          changeProvider("openai");
        } else if (!settings.openaiApiKey && settings.anthropicApiKey) {
          changeProvider("claude");
        }
      })
      .catch(() => {
        // Non-critical: provider selector just assumes both are available.
      });
    return () => {
      active = false;
    };
  }, []);

  /**
   * Persists hand-edited `scriptText` outside of fetch/write/analyze — auto-save
   * (debounced below) or a manual "Save" action. Updates the current version in
   * place while it's still a draft; forks a new draft instead once it's
   * "analyzed", so an edit never rewrites an analyzed version's text out from
   * under its scenes.
   */
  const saveScriptTextNow = async () => {
    if (scriptText === savedScriptText) return;
    setSavingText(true);
    try {
      const record = await apiClient.script.saveText({
        videoId,
        scriptText,
        versionId: currentVersionId ?? undefined,
      });
      setCurrentVersionId(record.id);
      setSavedScriptText(record.scriptText);
      setLastSavedAt(new Date());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSavingText(false);
    }
  };

  // Saves any pending hand-edits before switching away, so picking a
  // different version from history never silently discards them.
  const loadVersion = async (record: ScriptAnalysisRecord) => {
    if (scriptText !== savedScriptText) await saveScriptTextNow();
    setError(null);
    setCurrentVersionId(record.id);
    setScriptTextRaw(record.scriptText);
    setSavedScriptText(record.scriptText);
    setLastSavedAt(new Date(record.createdAt));
    setLinkOrigin(null);
    setFrames(record.frames);
    setUploadFile(null);
    setMode(modeForSource(record.sourceType));
    setUrl(record.sourceType === "youtube" ? (record.sourceUrl ?? "") : "");
    setIdea(record.sourceType === "idea" ? (record.sourceUrl ?? "") : "");
    if (record.templateSourceId) setTemplateVersionId(record.templateSourceId);
    setSelectedTemplateId(record.styleTemplateId ?? NO_TEMPLATE);
    setSelectedEditingStyleId(record.editingStyleTemplateId ?? NO_TEMPLATE);
    setResult(
      record.kind === "analyzed" && record.style
        ? {
            scenes: record.scenes,
            resources: record.resources,
            style: record.style,
            characterRoster: record.characterRoster,
            objectRoster: record.objectRoster,
          }
        : null,
    );
    setResultKey((key) => key + 1);
    setApproved(Boolean(record.approved));
    // An already-analyzed version completes the step (unlocks "Next").
    if (record.kind === "analyzed" && record.scenes.length > 0) onAnalyzed?.();
    setNoSpeechHint(false);
    setAiDescribed(false);
  };

  useEffect(() => {
    let active = true;
    apiClient.script
      .history(videoId)
      .then((data) => {
        if (!active) return;
        if (data.length > 0) void loadVersion(data[0]!);
        else {
          setCurrentVersionId(null);
          setScriptTextRaw("");
          setSavedScriptText("");
          setLastSavedAt(null);
          setFrames([]);
          setResult(null);
        }
      })
      .catch(() => {
        // Non-critical: start from a blank script for this video.
      });
    return () => {
      active = false;
    };
  }, [videoId]);

  const scriptTextDirty = scriptText !== savedScriptText;

  // Auto-save hand-edits a short while after typing stops, so the "Save"
  // button is a fallback rather than the only way to persist them.
  useEffect(() => {
    if (!scriptTextDirty || busy) return;
    const id = setTimeout(() => void saveScriptTextNow(), 2500);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- debounced on text change alone; saveScriptTextNow closes over the latest state of this same render
  }, [scriptText, scriptTextDirty, busy]);

  const costEstimate = useMemo(
    () =>
      scriptText || frames.length > 0
        ? estimateAnalyzeScriptCost(scriptText, frames.length, provider, model)
        : null,
    [scriptText, frames.length, provider, model],
  );

  const fetchFromLink = async () => {
    setError(null);
    setFetching(true);
    setFrames([]);
    setNoSpeechHint(false);
    setAiDescribed(false);
    setLinkOrigin(null);
    try {
      const res = await apiClient.script.fetchTranscript({
        url,
        videoId,
        useAi: linkUseAi,
        provider: describeProvider,
        model: describeModel,
        language: scriptLanguage,
      });
      setScriptTextRaw(res.scriptText);
      setSavedScriptText(res.scriptText);
      setLastSavedAt(new Date());
      setFrames(res.frames ?? []);
      setCurrentVersionId(res.versionId ?? null);
      // The link panel explains how the script was obtained; the generic
      // "no speech" hint only covers a transcription that came back empty.
      setNoSpeechHint(res.origin === "transcribed" && Boolean(res.noSpeechDetected));
      setLinkOrigin(res.origin ?? null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setFetching(false);
    }
  };

  const transcribeUpload = async () => {
    if (!uploadFile) return;
    setError(null);
    setTranscribing(true);
    setLinkOrigin(null);
    setFrames([]);
    setNoSpeechHint(false);
    setAiDescribed(false);
    try {
      const res = await apiClient.script.transcribeUpload(
        uploadFile,
        videoId,
        describeProvider,
        describeModel,
        scriptLanguage,
      );
      setScriptTextRaw(res.scriptText);
      setSavedScriptText(res.scriptText);
      setLastSavedAt(new Date());
      setFrames(res.frames ?? []);
      setCurrentVersionId(res.versionId ?? null);
      setNoSpeechHint(Boolean(res.noSpeechDetected));
      setAiDescribed(Boolean(res.aiDescribed));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setTranscribing(false);
    }
  };

  const writeFromDocuments = async () => {
    if (sourceDocumentIds.length === 0) return;
    setError(null);
    setWriting(true);
    setFrames([]);
    setNoSpeechHint(false);
    setAiDescribed(false);
    try {
      const res = await apiClient.script.fromDocument({
        documentIds: sourceDocumentIds,
        brief: brief.trim() || undefined,
        targetDurationSec: targetDurationSec ?? undefined,
        language: scriptLanguage,
        provider: describeProvider,
        model: describeModel,
        styleTemplateId: selectedTemplateId === NO_TEMPLATE ? undefined : selectedTemplateId,
        videoId,
      });
      setScriptTextRaw(res.scriptText);
      setSavedScriptText(res.scriptText);
      setLastSavedAt(new Date());
      setCurrentVersionId(res.versionId ?? null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setWriting(false);
    }
  };

  const writeFromIdea = async () => {
    if (!idea.trim()) return;
    setError(null);
    setWriting(true);
    setFrames([]);
    setNoSpeechHint(false);
    setAiDescribed(false);
    try {
      const res = await apiClient.script.fromIdea({
        idea: idea.trim(),
        targetDurationSec: ideaDurationSec ?? undefined,
        language: scriptLanguage,
        provider: describeProvider,
        model: describeModel,
        styleTemplateId: selectedTemplateId === NO_TEMPLATE ? undefined : selectedTemplateId,
        videoId,
      });
      setScriptTextRaw(res.scriptText);
      setSavedScriptText(res.scriptText);
      setLastSavedAt(new Date());
      setCurrentVersionId(res.versionId ?? null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setWriting(false);
    }
  };

  const writeFromTemplate = async () => {
    if (!templateVersionId || !topic.trim()) return;
    setError(null);
    setWriting(true);
    setResult(null);
    setApproved(false);
    setFrames([]);
    setNoSpeechHint(false);
    setAiDescribed(false);
    try {
      const res = await apiClient.script.fromTemplate({
        templateVersionId,
        topic: topic.trim(),
        documentIds: templateDocumentIds,
        targetDurationSec: templateDurationSec ?? undefined,
        language: scriptLanguage,
        provider: describeProvider,
        model: describeModel,
        effort,
        styleTemplateId: selectedTemplateId === NO_TEMPLATE ? undefined : selectedTemplateId,
        videoId,
      });
      setScriptTextRaw(res.scriptText);
      setSavedScriptText(res.scriptText);
      setLastSavedAt(new Date());
      setResult({
        scenes: res.scenes,
        resources: res.resources,
        style: res.style,
        characterRoster: res.characterRoster,
        objectRoster: res.objectRoster,
      });
      setResultKey((key) => key + 1);
      setCurrentVersionId(res.versionId);
      onAnalyzed?.();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setWriting(false);
    }
  };

  const analyzeAbortRef = useRef<AbortController | null>(null);

  const analyze = async () => {
    setError(null);
    setAnalyzing(true);
    setResult(null);
    setApproved(false);
    const controller = new AbortController();
    analyzeAbortRef.current = controller;
    try {
      const res = await apiClient.script.analyze(
        {
          scriptText,
          sourceType: sourceTypeForMode(mode),
          sourceUrl: mode === "link" ? url : undefined,
          styleTemplateId: selectedTemplateId === NO_TEMPLATE ? undefined : selectedTemplateId,
          editingStyleTemplateId:
            selectedEditingStyleId === NO_TEMPLATE ? undefined : selectedEditingStyleId,
          frames,
          provider,
          model,
          effort,
          videoId,
          language: scriptLanguage,
        },
        controller.signal,
      );
      setResult(res);
      setResultKey((key) => key + 1);
      setCurrentVersionId(res.versionId);
      // The script text sent is now exactly what the saved "analyzed" version holds.
      setSavedScriptText(scriptText);
      setLastSavedAt(new Date());
      onAnalyzed?.();
    } catch (err) {
      if ((err as { name?: string }).name !== "AbortError") setError(errorMessage(err));
    } finally {
      setAnalyzing(false);
      analyzeAbortRef.current = null;
    }
  };

  /** The request keeps running server-side (and may still save a version) — this only stops waiting for it client-side. */
  const cancelAnalyze = () => analyzeAbortRef.current?.abort();

  /** Saves the (edited) scenes — and optionally hand-edited character/object rosters — as a new approved version. */
  const approve = async (
    scenes: ScriptScene[],
    characterRoster?: RecurringCharacter[],
    objectRoster?: RecurringObject[],
  ) => {
    if (!result || !currentVersionId) return false;
    setError(null);
    setApproving(true);
    try {
      const record = await apiClient.script.approve({
        versionId: currentVersionId,
        scenes,
        resources: result.resources,
        style: result.style,
        characterRoster,
        objectRoster,
      });
      setResult({
        scenes: record.scenes,
        resources: record.resources,
        style: result.style,
        characterRoster: record.characterRoster,
        objectRoster: record.objectRoster,
      });
      setResultKey((key) => key + 1);
      setCurrentVersionId(record.id);
      setApproved(true);
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    } finally {
      setApproving(false);
    }
  };

  return {
    videoId,
    mode,
    setMode,
    url,
    setUrl,
    linkUseAi,
    setLinkUseAi,
    linkOrigin,
    scriptText,
    setScriptText,
    frames,
    uploadFile,
    setUploadFile,
    fetching,
    transcribing,
    writing,
    analyzing,
    cancelAnalyze,
    busy,
    elapsedSec,
    sourceDocumentIds,
    setSourceDocumentIds,
    brief,
    setBrief,
    targetDurationSec,
    setTargetDurationSec,
    writeFromDocuments,
    idea,
    setIdea,
    ideaDurationSec,
    setIdeaDurationSec,
    writeFromIdea,
    templateVersionId,
    setTemplateVersionId,
    topic,
    setTopic,
    templateDocumentIds,
    setTemplateDocumentIds,
    templateDurationSec,
    setTemplateDurationSec,
    writeFromTemplate,
    error,
    setError,
    result,
    resultKey,
    approved,
    approving,
    approve,
    styleTemplates,
    refreshTemplates,
    selectedTemplateId,
    setSelectedTemplateId,
    editingStyleTemplates,
    selectedEditingStyleId,
    setSelectedEditingStyleId,
    provider,
    changeProvider,
    model,
    setModel,
    effort,
    setEffort,
    availableProviders,
    describeProvider,
    changeDescribeProvider,
    describeModel,
    setDescribeModel,
    scriptLanguage,
    setScriptLanguage,
    currentVersionId,
    noSpeechHint,
    aiDescribed,
    costEstimate,
    loadVersion,
    fetchFromLink,
    transcribeUpload,
    analyze,
    scriptTextDirty,
    savingText,
    lastSavedAt,
    saveScriptTextNow,
  };
}

export type ScriptStepState = ReturnType<typeof useScriptStep>;
