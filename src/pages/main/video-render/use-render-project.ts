import { getTranslations } from "@/i18n";
import { apiClient } from "@/lib/api-client";
import type {
  LibraryAsset,
  RenderManifestAudioCue,
  RenderProject,
  RenderProjectUpdate,
  RenderScene,
  RenderSourceOptions,
  VideoRender,
  VideoRenderJob,
} from "@shared/types";
import { useEffect, useMemo, useState } from "react";

const POLL_MS = 2000;

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** The server forgets running jobs when it restarts (they live in memory). */
function renderInterrupted(): string {
  return getTranslations("videoRender.render")("interrupted");
}

/** Everything the page edits — compared against the last saved copy to know what's unsaved. */
function editableOf(project: RenderProject): Required<RenderProjectUpdate> {
  return {
    name: project.name,
    frameRatio: project.frameRatio,
    sourceMode: project.sourceMode,
    sourceOptions: project.sourceOptions,
    ideaText: project.ideaText,
    targetDurationSec: project.targetDurationSec,
    scriptText: project.scriptText,
    scenes: project.scenes,
    audio: project.audio,
  };
}

export const NEW_SCENE: RenderScene = {
  text: "",
  durationSec: 3,
  shotKind: "kenBurns",
  captionStyle: "lowerThird",
  transitionOut: "cut",
  imageHint: "",
};

/** All state and actions for one render project. */
export function useRenderProject(projectId: string) {
  const [project, setProject] = useState<RenderProject | null>(null);
  const [savedJson, setSavedJson] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Getting the script from a source (fetching a link, transcribing, AI writing).
  const [scripting, setScripting] = useState(false);
  const [splitting, setSplitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renders, setRenders] = useState<VideoRender[]>([]);
  const [job, setJob] = useState<VideoRenderJob | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const rendering = job?.status === "running";

  const loadSaved = (next: RenderProject) => {
    setProject(next);
    setSavedJson(JSON.stringify(editableOf(next)));
  };

  useEffect(() => {
    let active = true;
    Promise.all([
      apiClient.videoRender.get(projectId),
      apiClient.videoRender.renders(projectId),
      apiClient.videoRender.renderStatus(projectId),
    ])
      .then(([loaded, renderList, currentJob]) => {
        if (!active) return;
        loadSaved(loaded);
        setRenders(renderList);
        // Reopening the page mid-render picks the progress back up.
        if (currentJob?.status === "running") setJob(currentJob);
      })
      .catch((err) => active && setError(errorMessage(err)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [projectId]);

  // While a render runs: poll its progress, and tick the clock so the elapsed time moves.
  useEffect(() => {
    if (!rendering) return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const poll = setInterval(() => {
      apiClient.videoRender
        .renderStatus(projectId)
        .then((next) => {
          if (!next) {
            setJob(null);
            setError(renderInterrupted());
            return;
          }
          setJob(next);
          if (next.status === "done" && next.render) {
            const finished = next.render;
            setRenders((current) => [finished, ...current.filter((r) => r.id !== finished.id)]);
          }
          if (next.status === "failed") setError(next.error ?? renderInterrupted());
        })
        .catch(() => {
          // A missed poll (e.g. the server restarting) is retried on the next tick.
        });
    }, POLL_MS);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [rendering, projectId]);

  const dirty = project !== null && JSON.stringify(editableOf(project)) !== savedJson;
  const busy = saving || scripting || splitting || rendering;

  const patch = (changes: RenderProjectUpdate) =>
    setProject((current) => current && { ...current, ...changes });

  const patchSource = (changes: Partial<RenderSourceOptions>) =>
    setProject((current) => current && { ...current, sourceOptions: { ...current.sourceOptions, ...changes } });

  /** Returns false when the save failed (the error is already shown). */
  const save = async (): Promise<boolean> => {
    if (!project) return false;
    if (!dirty) return true;
    setSaving(true);
    setError(null);
    try {
      loadSaved(await apiClient.videoRender.update(projectId, editableOf(project)));
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    } finally {
      setSaving(false);
    }
  };

  /** The AI actions work on the saved project, so unsaved edits are saved first. Resolves true on success. */
  const runAi = async (
    setRunning: (running: boolean) => void,
    call: () => Promise<RenderProject>,
  ): Promise<boolean> => {
    if (!(await save())) return false;
    setRunning(true);
    setError(null);
    try {
      loadSaved(await call());
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    } finally {
      setRunning(false);
    }
  };

  /** Runs the project's current source (not "script", which is just typing; not "upload", see below). */
  const fetchScript = async (source: "link" | "document" | "idea" | "template") => {
    await runAi(setScripting, () => apiClient.videoRender.scriptFromSource(projectId, source));
  };
  const uploadScript = async (file: File) => {
    await runAi(setScripting, () => apiClient.videoRender.scriptFromUpload(projectId, file));
  };
  /** Resolves true when the scenes were replaced (the page then moves on to them). */
  const splitScenes = () => runAi(setSplitting, () => apiClient.videoRender.splitScenes(projectId));

  const render = async () => {
    if (!(await save())) return;
    setError(null);
    try {
      setNow(Date.now());
      setJob(await apiClient.videoRender.render(projectId));
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const setScenes = (update: (scenes: RenderScene[]) => RenderScene[]) =>
    setProject((current) => current && { ...current, scenes: update(current.scenes) });

  const updateScene = (index: number, changes: Partial<RenderScene>) =>
    setScenes((scenes) => scenes.map((scene, i) => (i === index ? { ...scene, ...changes } : scene)));

  const removeScene = (index: number) => setScenes((scenes) => scenes.filter((_, i) => i !== index));

  const moveScene = (index: number, offset: -1 | 1) =>
    setScenes((scenes) => {
      const target = index + offset;
      if (target < 0 || target >= scenes.length) return scenes;
      const next = [...scenes];
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });

  const addScene = () => setScenes((scenes) => [...scenes, { ...NEW_SCENE }]);

  const setAudio = (update: (audio: RenderManifestAudioCue[]) => RenderManifestAudioCue[]) =>
    setProject((current) => current && { ...current, audio: update(current.audio) });

  const addAudio = (asset: LibraryAsset) =>
    setAudio((audio) => [
      ...audio,
      {
        fileId: asset.fileId,
        label: asset.name,
        // Sound-pack installs carry a category; anything else (an uploaded song) is most likely music.
        track: asset.category ? "sfx" : "bgm",
        from: 0,
      },
    ]);

  const updateAudio = (index: number, changes: Partial<RenderManifestAudioCue>) =>
    setAudio((audio) => audio.map((cue, i) => (i === index ? { ...cue, ...changes } : cue)));

  const removeAudio = (index: number) => setAudio((audio) => audio.filter((_, i) => i !== index));

  const totalSec = useMemo(
    () => project?.scenes.reduce((sum, scene) => sum + scene.durationSec, 0) ?? 0,
    [project],
  );
  const missingImages = useMemo(
    () => project?.scenes.filter((s) => !s.imageFileId && s.shotKind !== "titleCard").length ?? 0,
    [project],
  );

  return {
    project,
    loading,
    saving,
    scripting,
    splitting,
    busy,
    dirty,
    error,
    totalSec,
    missingImages,
    renders,
    rendering,
    renderProgress: job?.progress ?? 0,
    renderElapsedSec: job ? Math.max(0, Math.floor((now - Date.parse(job.startedAt)) / 1000)) : 0,
    patch,
    patchSource,
    save,
    fetchScript,
    uploadScript,
    splitScenes,
    render,
    updateScene,
    removeScene,
    moveScene,
    addScene,
    addAudio,
    updateAudio,
    removeAudio,
  };
}

export type RenderProjectState = ReturnType<typeof useRenderProject>;
