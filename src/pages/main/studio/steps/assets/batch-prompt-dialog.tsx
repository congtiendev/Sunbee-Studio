import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import AiSettingsFields from "@/components/shared/ai-settings-fields";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import type { AiEffort } from "@/components/shared/effort-field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import { Progress } from "@/components/ui/progress-bar";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useTranslations } from "@/i18n";
import {
  BrushIcon,
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  DownloadIcon,
  LayerIcon,
  SparkIcon,
} from "@/icons";
import { apiClient } from "@/lib/api-client";
import { cn } from "@/utils";
import type {
  AssetCandidate,
  AssetEnrichResponse,
  AssetPromptRecord,
  RecurringCharacter,
  RecurringObject,
  ScriptScene,
  FrameRatio,
  ImageLayer,
  SceneResource,
  SceneShot,
  ScriptAnalysisRecord,
  StyleTemplate,
} from "@shared/types";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import BatchImageImport from "./batch-image-import";
import {
  buildPackZip,
  generatedInstructionsMarkdown,
  instructionsMarkdown,
  packAsText,
  packFileList,
  packFileName,
  type PackInput,
} from "./chatgpt-pack";
import { blobToDataUrl, sceneContextOf } from "./scene-context";
import { trimToSubject } from "./trim-image";
import { describeShotForAi, shotOf } from "@shared/shots";
import { isRealPhoto, needsImage } from "@shared/types";
import {
  defaultModelFor,
  type AnalyzeProvider,
} from "@shared/script-cost-estimate";

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

interface PromptGroup {
  key: string;
  description: string;
  category: "character" | "background";
  sceneContext: string;
  slots: { sceneIndex: number; assetIndex: number; assetId: string }[];
  /** Roster characters/objects this request's description names — their reference photos (if any) ground the generated prompt. */
  entries: (RecurringCharacter | RecurringObject)[];
  prompt?: string;
  /** When the prompt was written — newer than the image picked for it means that image is out of date. */
  promptUpdatedAt?: string;
  /** Whole frame or transparent cutout — the AI's call with the prompt, unless the user picked one. */
  layer?: ImageLayer;
  /** The user picked `layer` by hand; the next prompt is written for it. */
  layerChosen?: boolean;
  /** Where/at what angle it sits in its scene, from the analysis. */
  placement?: string;
  /** The shot it's for (in its first scene) and how many shots that scene has. */
  shot?: SceneShot;
  shotTotal?: number;
}

interface SavedPrompt {
  prompt: string;
  layer?: ImageLayer;
  updatedAt?: string;
}

/** Deduped prompt groups: identical-wording required assets across scenes collapse into one. */
function groupRequiredAssets(
  scenes: ScriptScene[],
  characterRoster: RecurringCharacter[],
  objectRoster: RecurringObject[],
): PromptGroup[] {
  const byNormalized = new Map<string, PromptGroup>();
  let counter = 0;
  for (const scene of scenes) {
    // Screen order — by shot, then as listed — so codes follow the order the
    // images are made in (what "assign in order" on import relies on).
    const inShotOrder = scene.requiredAssets
      .map((asset, assetIndex) => ({ asset, assetIndex }))
      .sort(
        (a, b) =>
          (a.asset.shot ?? Infinity) - (b.asset.shot ?? Infinity) ||
          a.assetIndex - b.assetIndex,
      );
    inShotOrder.forEach(({ asset, assetIndex }) => {
      // Prompts are for pictures to generate: not editor text (CapCut writes it), not real photos (researched).
      if (!needsImage(asset) || isRealPhoto(asset)) return;
      const normalized = asset.description.trim().toLowerCase();
      if (!normalized) return;
      const existing = byNormalized.get(normalized);
      if (existing) {
        existing.slots.push({ sceneIndex: scene.index, assetIndex, assetId: asset.id });
        return;
      }
      const entries = [
        ...characterRoster.filter((c) =>
          normalized.includes(c.name.toLowerCase()),
        ),
        ...objectRoster.filter((o) =>
          normalized.includes(o.name.toLowerCase()),
        ),
      ];
      counter += 1;
      byNormalized.set(normalized, {
        key: `p${counter}`,
        description: asset.description,
        category: entries.length > 0 ? "character" : "background",
        sceneContext: sceneContextOf(scene, characterRoster, objectRoster),
        slots: [{ sceneIndex: scene.index, assetIndex, assetId: asset.id }],
        entries,
        layer: asset.layer,
        layerChosen: Boolean(asset.layer),
        placement: asset.placement,
        shot: shotOf(scene, asset.shot),
        shotTotal: scene.shots?.length,
      });
    });
  }
  return [...byNormalized.values()];
}

/** Same normalization as the dedupe above and the server's `assetPromptKey`. */
const promptKeyOf = (description: string) => description.trim().toLowerCase();

/** Fills in prompts saved earlier for this video and frame (matched by description). */
function withSavedPrompts(
  groups: PromptGroup[],
  saved: ReadonlyMap<string, SavedPrompt>,
): PromptGroup[] {
  return groups.map((group) => {
    if (group.prompt) return group;
    const found = saved.get(promptKeyOf(group.description));
    // A hand-picked layer the saved prompt wasn't written for needs a new one.
    if (!found || (group.layerChosen && found.layer !== group.layer))
      return group;
    return {
      ...group,
      prompt: found.prompt,
      promptUpdatedAt: found.updatedAt,
      layer: found.layer ?? group.layer,
    };
  });
}

function libraryCandidateOf(
  asset: Awaited<ReturnType<typeof apiClient.assets.library.upload>>,
): AssetCandidate {
  const fileUrl = apiClient.documents.fileUrl(asset.fileId);
  return {
    sourceKey: "library",
    externalId: asset.id,
    mediaType: asset.mediaType,
    title: asset.name,
    previewUrl: asset.mediaType === "image" ? fileUrl : undefined,
    url: fileUrl,
    description: [
      asset.description,
      asset.tags.length ? `#${asset.tags.join(" #")}` : "",
    ]
      .filter(Boolean)
      .join(" "),
  };
}

/** Scenes per ready-made batch offered for long scripts. */
const CHUNK_SIZE = 20;
/** Prompts written per request — small enough for the progress bar to move and "Stop" to answer quickly. */
const PROMPTS_PER_REQUEST = 3;
/** Scenes per client request when planning shots & layers — matches the server's own AI-call batching, for smooth progress. */
const SPLIT_CHUNK_SCENES = 4;

/** Numbered step of the workflow panel: ① range → ② prompts → ③ import. */
function WorkflowStep({
  number,
  title,
  done = false,
  action,
  children,
}: {
  number: number;
  title: string;
  done?: boolean;
  /** Small control at the end of the step's title row. */
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3 border-b border-gray-100 py-5 first:pt-0 last:border-b-0 last:pb-0 dark:border-gray-800">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
            done
              ? "bg-green-500/15 text-green-600 dark:text-green-400"
              : "bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-300",
          )}
        >
          {done ? <CheckIcon className="size-3" /> : number}
        </span>
        <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
          {title}
        </h3>
        {action && <div className="ms-auto">{action}</div>}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

interface BatchPromptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  videoId: string;
  scenes: ScriptScene[];
  characterRoster: RecurringCharacter[];
  objectRoster: RecurringObject[];
  /** The graphics skill chosen in the step's toolbar, packed as the style to follow. */
  graphicsSkill?: StyleTemplate;
  /** That skill's reference illustrations (data URLs). */
  referenceImages: string[];
  /** The video's frame: prompts compose for it, and only prompts written for it are reused. */
  frameRatio: FrameRatio;
  /** The analyzed version `scenes` come from — what "split layers" rewrites. */
  versionId: string;
  /** The video's actual saved picks — which codes already have a real image, not just ones imported this dialog session. */
  selections: SceneResource[];
  /** After "split layers" saved a new version. */
  onScenesChanged: (version: ScriptAnalysisRecord) => void;
  onImported: () => void;
}

export default function BatchPromptDialog({
  open,
  onOpenChange,
  videoId,
  scenes,
  characterRoster,
  objectRoster,
  graphicsSkill,
  referenceImages,
  frameRatio,
  selections,
  versionId,
  onScenesChanged,
  onImported,
}: BatchPromptDialogProps) {
  const t = useTranslations("videoStudio.assets.batchPrompt");
  const tAssets = useTranslations("videoStudio.assets");
  const tScript = useTranslations("videoStudio.script");

  const sceneIndices = scenes.map((s) => s.index);
  const minScene = sceneIndices.length ? Math.min(...sceneIndices) : 1;
  const maxScene = sceneIndices.length ? Math.max(...sceneIndices) : 1;

  // Long scripts (hundreds of scenes) make too many prompts for one chat, so
  // the user works one scene range at a time. `range` is what the list below
  // was built from; the inputs stay free text until applied, so a field can
  // be cleared while typing.
  const [range, setRange] = useState({ from: minScene, to: maxScene });
  const [fromDraft, setFromDraft] = useState(String(minScene));
  const [toDraft, setToDraft] = useState(String(maxScene));
  const scenesIn = (r: { from: number; to: number }) =>
    scenes.filter((s) => s.index >= r.from && s.index <= r.to);
  const sceneCount = scenesIn(range).length;
  const draftChanged =
    fromDraft !== String(range.from) || toDraft !== String(range.to);
  const isWholeRange =
    !draftChanged && range.from === minScene && range.to === maxScene;

  // Ready-made batches for long scripts.
  const chunks: { from: number; to: number }[] = [];
  if (maxScene - minScene + 1 > CHUNK_SIZE) {
    for (let from = minScene; from <= maxScene; from += CHUNK_SIZE) {
      chunks.push({ from, to: Math.min(from + CHUNK_SIZE - 1, maxScene) });
    }
  }

  const [groups, setGroups] = useState<PromptGroup[]>(() =>
    groupRequiredAssets(scenes, characterRoster, objectRoster),
  );
  // Prompts are saved server-side as soon as they're written; these are the
  // ones already in the DB for this video, re-applied whenever the list is rebuilt.
  const [savedPrompts, setSavedPrompts] = useState<
    ReadonlyMap<string, SavedPrompt>
  >(() => new Map());
  const applySavedPrompts = useCallback(
    (records: AssetPromptRecord[]) => {
      // Only prompts written for this frame (older ones, written for a square frame, have none).
      const saved = new Map(
        records
          .filter((r) => r.frameRatio === frameRatio)
          .map((r) => [
            promptKeyOf(r.description),
            { prompt: r.prompt, layer: r.layer, updatedAt: r.updatedAt },
          ]),
      );
      setSavedPrompts(saved);
      setGroups((prev) => withSavedPrompts(prev, saved));
    },
    [frameRatio],
  );
  const loadSavedPrompts = async () =>
    applySavedPrompts(await apiClient.assets.savedImagePrompts(videoId));
  useEffect(() => {
    let active = true;
    apiClient.assets
      .savedImagePrompts(videoId)
      .then((records) => {
        if (active) applySavedPrompts(records);
      })
      .catch(() => {
        // Without them the dialog still works; prompts can be written again.
      });
    return () => {
      active = false;
    };
  }, [videoId, applySavedPrompts]);
  /** Real picks by asset id — the source of truth for what already has an image. */
  const pickedBySlot = useMemo(
    () => new Map(selections.map((s) => [s.assetId, s])),
    [selections],
  );
  /**
   * Code → preview URL of the image it actually has saved, derived from the
   * video's real picks (not a per-dialog-session guess) — so it's still
   * accurate after closing and reopening this dialog, or switching range
   * and back.
   */
  const imported = useMemo(() => {
    const map = new Map<string, string>();
    for (const group of groups) {
      const picks = group.slots.map((slot) =>
        pickedBySlot.get(slot.assetId),
      );
      if (picks.length > 0 && picks.every((pick) => pick)) {
        const candidate = picks[0]!.candidate;
        map.set(group.key, candidate.previewUrl ?? candidate.url);
      }
    }
    return map;
  }, [groups, pickedBySlot]);
  // Images to make again although one is picked: its prompt or description
  // changed after it was picked, or the user asked for a new one here.
  const [redoMarks, setRedoMarks] = useState<ReadonlyMap<string, boolean>>(() => new Map());
  const redo = useMemo(() => {
    const keys = new Set<string>();
    for (const group of groups) {
      if (!imported.has(group.key)) continue;
      const mark = redoMarks.get(group.key);
      const stale = group.slots.some((slot) => {
        const pick = pickedBySlot.get(slot.assetId);
        if (!pick) return false;
        const changedText = pick.assetDescription.trim() !== group.description.trim();
        const newerPrompt = Boolean(group.promptUpdatedAt && group.promptUpdatedAt > pick.createdAt);
        return changedText || newerPrompt;
      });
      if (mark ?? stale) keys.add(group.key);
    }
    return keys;
  }, [groups, imported, pickedBySlot, redoMarks]);
  const toggleRedo = (key: string) =>
    setRedoMarks((prev) => new Map(prev).set(key, !redo.has(key)));
  /** Code → the untrimmed file, for items whose import was cropped — so "use the original" can undo it. */
  const [originals, setOriginals] = useState<ReadonlyMap<string, File>>(
    () => new Map(),
  );
  const [restoring, setRestoring] = useState<string | null>(null);
  const [confirmRewrite, setConfirmRewrite] = useState(false);
  const [confirmSplit, setConfirmSplit] = useState(false);
  const [splitting, setSplitting] = useState(false);
  const [splitResult, setSplitResult] = useState<number[] | null>(null);
  const [splitProgress, setSplitProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const stopSplitRef = useRef(false);
  const [enriching, setEnriching] = useState(false);
  const [enrichResult, setEnrichResult] = useState<AssetEnrichResponse | null>(null);

  // A new version (after "split layers") brings new scenes: rebuild the list
  // for the same range, during render rather than in an effect.
  const [scenesShown, setScenesShown] = useState(scenes);
  if (scenesShown !== scenes) {
    setScenesShown(scenes);
    setGroups(
      withSavedPrompts(
        groupRequiredAssets(scenesIn(range), characterRoster, objectRoster),
        savedPrompts,
      ),
    );
    setOriginals(new Map());
  }

  const imageAssetsInRange = scenesIn(range).flatMap((scene) =>
    scene.requiredAssets.filter(
      (asset) => asset.type === "image" || asset.type === "graphic",
    ),
  );
  // Planned = broken into shots, every image layered and tied to a shot.
  const layeredCount = imageAssetsInRange.filter(
    (asset) => asset.layer && asset.shot,
  ).length;
  const allLayered =
    imageAssetsInRange.length > 0 &&
    layeredCount === imageAssetsInRange.length &&
    scenesIn(range).every((scene) => (scene.shots?.length ?? 0) > 0);

  /**
   * Has the AI split this range's moving subjects into background +
   * per-state cutouts — a few scenes per call (matching the server's own AI-
   * call batching) so progress shows as it goes and a long run can be
   * stopped partway; each call saves to the same version in place, so
   * stopping just leaves the rest of the range unplanned, not undone.
   */
  const splitLayers = async () => {
    const sceneIndices = scenesIn(range).map((s) => s.index);
    if (sceneIndices.length === 0) return;
    setSplitting(true);
    setError(null);
    setSplitResult(null);
    setSplitProgress({ done: 0, total: sceneIndices.length });
    stopSplitRef.current = false;
    const changed: number[] = [];
    try {
      for (
        let i = 0;
        i < sceneIndices.length && !stopSplitRef.current;
        i += SPLIT_CHUNK_SCENES
      ) {
        const chunk = sceneIndices.slice(i, i + SPLIT_CHUNK_SCENES);
        const { version, changedScenes } = await apiClient.assets.splitLayers({
          videoId,
          versionId,
          fromScene: chunk[0]!,
          toScene: chunk[chunk.length - 1]!,
          provider: aiProvider,
          model: aiModel,
          effort: aiEffort,
        });
        changed.push(...changedScenes);
        if (changedScenes.length > 0) {
          onScenesChanged(version);
          onImported();
        }
        setSplitProgress({
          done: Math.min(i + chunk.length, sceneIndices.length),
          total: sceneIndices.length,
        });
      }
      setSplitResult(changed);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSplitting(false);
      setSplitProgress(null);
    }
  };
  /** Stickers + pop-up key words for the range's shots where the speaker is alone on a plain backdrop. */
  const enrich = async () => {
    setEnriching(true);
    setError(null);
    setEnrichResult(null);
    try {
      const result = await apiClient.assets.enrich({
        videoId,
        versionId,
        fromScene: range.from,
        toScene: range.to,
        provider: aiProvider,
        model: aiModel,
        effort: aiEffort,
      });
      onScenesChanged(result.version);
      onImported();
      setEnrichResult(result);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setEnriching(false);
    }
  };
  const [tab, setTab] = useState<PromptGroup["category"]>("character");
  const [showInstructions, setShowInstructions] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [packing, setPacking] = useState(false);
  const [copyingAll, setCopyingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  // Prompts are long English paragraphs — collapsed by default (one card per
  // group, hundreds of groups) so the list stays scannable.
  const [expandedPrompts, setExpandedPrompts] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const togglePromptExpanded = (key: string) =>
    setExpandedPrompts((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // AI provider/model/effort for "Phân shot" and "Tạo prompt" — always
  // user-picked, Claude by default (never a silent OpenAI fallback), limited
  // to whichever keys are actually set in Settings.
  const [aiProvider, setAiProviderRaw] = useState<AnalyzeProvider>("claude");
  const [aiModel, setAiModel] = useState(defaultModelFor("claude"));
  // "Tạo prompt" historically ran at low effort (a short rewrite, not worth
  // more); kept as the shared default so switching providers/effort here
  // never costs more by default than before, only when chosen.
  const [aiEffort, setAiEffort] = useState<AiEffort>("low");
  const [availableAiProviders, setAvailableAiProviders] = useState<
    Record<AnalyzeProvider, boolean>
  >({ openai: true, claude: true });
  const setAiProvider = (next: AnalyzeProvider) => {
    setAiProviderRaw(next);
    setAiModel(defaultModelFor(next));
  };

  // Hand-edited replacement for the generated instructions, shared by every
  // pack (an account setting, not tied to this video) — null until loaded or
  // never customized, in which case the generated text is used as-is.
  const [instructionsOverride, setInstructionsOverride] = useState<
    string | null
  >(null);
  const [instructionsDraft, setInstructionsDraft] = useState<string | null>(
    null,
  );
  const [savingInstructions, setSavingInstructions] = useState(false);
  useEffect(() => {
    let active = true;
    void apiClient.settings.get().then((settings) => {
      if (!active) return;
      if (settings.assetsPackInstructions) {
        setInstructionsOverride(settings.assetsPackInstructions);
      }
      setAvailableAiProviders({
        openai: Boolean(settings.openaiApiKey),
        claude: Boolean(settings.anthropicApiKey),
      });
      // Prefer Claude by default, but fall back to whichever key is actually
      // configured if only one of them is.
      if (!settings.anthropicApiKey && settings.openaiApiKey) {
        setAiProvider("openai");
      } else if (!settings.openaiApiKey && settings.anthropicApiKey) {
        setAiProvider("claude");
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const clampScene = (text: string, fallback: number) => {
    const n = Number.parseInt(text, 10);
    return Number.isFinite(n)
      ? Math.min(Math.max(n, minScene), maxScene)
      : fallback;
  };

  /** Rebuilds the list for a scene range (codes restart at p1, so prompts and imports reset). */
  const applyRange = (next?: { from: number; to: number }) => {
    const from = clampScene(fromDraft, minScene);
    const to = clampScene(toDraft, maxScene);
    const r = next ?? { from: Math.min(from, to), to: Math.max(from, to) };
    setFromDraft(String(r.from));
    setToDraft(String(r.to));
    setRange(r);
    setGroups(
      withSavedPrompts(
        groupRequiredAssets(scenesIn(r), characterRoster, objectRoster),
        savedPrompts,
      ),
    );
    setOriginals(new Map());
  };

  const characterGroups = useMemo(
    () => groups.filter((g) => g.category === "character"),
    [groups],
  );
  const backgroundGroups = useMemo(
    () => groups.filter((g) => g.category === "background"),
    [groups],
  );
  const generatedCount = groups.filter((g) => g.prompt).length;
  const allPromptsReady = groups.length > 0 && generatedCount === groups.length;
  const importedCount = groups.filter((g) => imported.has(g.key)).length;
  // Fall back to the other tab when the chosen one has nothing in this range.
  const activeTab =
    tab === "character" && characterGroups.length === 0
      ? "background"
      : tab === "background" &&
          backgroundGroups.length === 0 &&
          characterGroups.length > 0
        ? "character"
        : tab;

  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(
        () => setCopiedKey((prev) => (prev === key ? null : prev)),
        2000,
      );
    } catch (err) {
      console.error("Failed to copy text: ", err);
    }
  };

  /**
   * "Copy all" for pasting into a chat: the text only (instructions + skill
   * methodology + prompt list). A clipboard write can hold only one item, so
   * it can't carry the reference images alongside it the way the zip does —
   * those still need the download-and-drag-in flow.
   */
  const copyAll = async () => {
    setCopyingAll(true);
    try {
      await copy("__all__", packAsText(packInput()));
    } finally {
      setCopyingAll(false);
    }
  };

  const saveInstructions = async (text: string) => {
    setSavingInstructions(true);
    try {
      await apiClient.settings.set({ assetsPackInstructions: text });
      setInstructionsOverride(text.trim() ? text : null);
      setInstructionsDraft(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSavingInstructions(false);
    }
  };

  const characterImageCache = useRef(new Map<string, string>());
  const characterImagesFor = async (
    entries: (RecurringCharacter | RecurringObject)[],
  ): Promise<{ name: string; image: string }[]> => {
    const withPhoto = entries.filter(
      (
        c,
      ): c is (RecurringCharacter | RecurringObject) & {
        appearanceImageFileId: string;
      } => Boolean(c.appearanceImageFileId),
    );
    const images = await Promise.all(
      withPhoto.map(async (c) => {
        const fileId = c.appearanceImageFileId;
        const cached = characterImageCache.current.get(fileId);
        if (cached) return cached;
        const dataUrl = await fetch(apiClient.documents.fileUrl(fileId))
          .then((res) => res.blob())
          .then(blobToDataUrl);
        characterImageCache.current.set(fileId, dataUrl);
        return dataUrl;
      }),
    );
    return withPhoto.map((c, i) => ({ name: c.name, image: images[i]! }));
  };

  // Set by "Stop": the batch finishes the request in flight, then stops.
  const stopRef = useRef(false);

  /**
   * Writes the missing prompts a few at a time, so the progress bar moves and
   * "Stop" works; each one is saved to the DB server-side as it's written.
   */
  /**
   * `rewrite`: every item in the range, not just the missing ones — e.g. after
   * the prompt-writing rules changed. Layers the AI picked are re-decided;
   * ones picked by hand are kept.
   */
  const generateAll = async ({
    rewrite = false,
  }: { rewrite?: boolean } = {}) => {
    const pending = rewrite ? groups : groups.filter((g) => !g.prompt);
    if (pending.length === 0) return;
    setGenerating(true);
    setError(null);
    stopRef.current = false;
    try {
      for (
        let i = 0;
        i < pending.length && !stopRef.current;
        i += PROMPTS_PER_REQUEST
      ) {
        const batch = pending.slice(i, i + PROMPTS_PER_REQUEST);
        const items = await Promise.all(
          batch.map(async (g) => ({
            key: g.key,
            description: g.description,
            sceneContext: g.sceneContext,
            characterImages: await characterImagesFor(g.entries),
            layer: g.layerChosen ? g.layer : undefined,
            placement: g.placement,
            shot: g.shot ? describeShotForAi(g.shot, g.shotTotal) : undefined,
          })),
        );
        const { results } = await apiClient.assets.imagePrompts({
          provider: aiProvider,
          model: aiModel,
          effort: aiEffort,
          items,
          videoId,
          frameRatio,
        });
        const byKey = new Map(
          results.map((r) => [r.key, { prompt: r.prompt, layer: r.layer }]),
        );
        setGroups((prev) =>
          prev.map((g) => {
            const written = byKey.get(g.key);
            return written
              ? { ...g, prompt: written.prompt, promptUpdatedAt: new Date().toISOString(), layer: written.layer }
              : g;
          }),
        );
        setSavedPrompts((prev) => {
          const next = new Map(prev);
          for (const g of batch) {
            const written = byKey.get(g.key);
            if (written) next.set(promptKeyOf(g.description), written);
          }
          return next;
        });
      }
    } catch (err) {
      setError(errorMessage(err));
      // A request cut short still saved what it wrote before failing — show those.
      await loadSavedPrompts().catch(() => {});
    } finally {
      setGenerating(false);
    }
  };

  /** Picks whole frame / cutout by hand; a prompt written for the other one is dropped to be rewritten. */
  const chooseLayer = (key: string, layer: ImageLayer) =>
    setGroups((prev) =>
      prev.map((g) =>
        g.key === key
          ? {
              ...g,
              layer,
              layerChosen: true,
              prompt: g.layer === layer ? g.prompt : undefined,
            }
          : g,
      ),
    );

  const sceneNumbers = (group: PromptGroup) => [
    ...new Set(group.slots.map((s) => s.sceneIndex)),
  ];
  const sceneLabel = (group: PromptGroup) =>
    group.slots
      .map((s) => tAssets("scene", { index: s.sceneIndex }))
      .join(", ");
  /** "Cảnh 1, 5, 9" — one word, then the numbers (same scene listed once). */
  const sceneList = (group: PromptGroup) =>
    t("scenesList", { list: sceneNumbers(group).join(", ") });

  // ---------- the pack for ChatGPT ----------

  // Code order (p1, p2… = scene order) everywhere ChatGPT or "assign in order"
  // is involved — the tabs only split the list for reading.
  const orderedGroups = groups;
  // The pack holds only the images still missing or to redo — ones already
  // made stay in use when the script, shots or prompts change; codes stay the
  // same (p7 is p7 whatever else is in the pack), so "assign in order" still
  // lines up (it fills the codes still missing or to redo).
  const packGroups = orderedGroups.filter((group) => !imported.has(group.key) || redo.has(group.key));
  const packReady = packGroups.length > 0 && packGroups.every((group) => group.prompt);
  const packInput = (
    characterImages: PackInput["characterImages"] = [],
  ): PackInput => ({
    range,
    frameRatio,
    groups: packGroups.map((group) => ({
      key: group.key,
      description: group.description,
      sceneContext: group.sceneContext,
      scenes: sceneNumbers(group),
      prompt: group.prompt,
      characters: group.entries.map((entry) => entry.name),
      layer: group.layer,
      placement: group.placement,
      shot: group.shot,
      shotTotal: group.shotTotal,
    })),
    skill: graphicsSkill,
    styleImages: referenceImages,
    characterImages,
    instructionsOverride: instructionsOverride ?? undefined,
  });

  // Every roster character/object named in the pack, once.
  const rangeEntries = [
    ...new Map(
      packGroups.flatMap((g) => g.entries).map((entry) => [entry.name, entry]),
    ).values(),
  ];
  // For listing the pack's files before the photos are fetched (names only).
  const characterPhotoPlaceholders = rangeEntries
    .filter((entry) => entry.appearanceImageFileId)
    .map((entry) => ({ name: entry.name, dataUrl: "data:image/png;base64," }));

  const downloadPack = async () => {
    setPacking(true);
    setError(null);
    try {
      const characterImages = (await characterImagesFor(rangeEntries)).map(
        (c) => ({
          name: c.name,
          dataUrl: c.image,
        }),
      );
      const input = packInput(characterImages);
      const url = URL.createObjectURL(await buildPackZip(input));
      const a = document.createElement("a");
      a.href = url;
      a.download = packFileName(input);
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPacking(false);
    }
  };

  // ---------- bringing the images back ----------

  const assignImage = async (
    key: string,
    file: File,
    options: { trim?: boolean } = {},
  ) => {
    const group = groups.find((g) => g.key === key);
    if (!group) return;
    // An object/character for compositing keeps no empty margin around it.
    // A sprite sheet keeps its canvas: trimming would shift its frame grid.
    const isSpriteSheet = /sprite/i.test(group.description);
    const cut =
      group.layer === "cutout" && !isSpriteSheet && options.trim !== false
        ? await trimToSubject(file)
        : null;
    const upload = cut?.file ?? file;
    const asset = await apiClient.assets.library.upload(upload, {
      name: group.description.slice(0, 80),
      tags: "batch-import",
    });
    const candidate = libraryCandidateOf(asset);
    for (const slot of group.slots) {
      await apiClient.assets.select({
        videoId,
        assetId: slot.assetId,
        assetDescription: group.description,
        candidate,
      });
    }
    setOriginals((prev) => {
      const next = new Map(prev);
      if (cut?.trimmed) next.set(key, file);
      else next.delete(key);
      return next;
    });
  };

  /** Puts the untrimmed image back in place of a crop that cut too much. */
  const restoreOriginal = async (key: string) => {
    const original = originals.get(key);
    if (!original) return;
    setRestoring(key);
    setError(null);
    try {
      await assignImage(key, original, { trim: false });
      onImported();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setRestoring(null);
    }
  };

  const renderGroup = (group: PromptGroup) => {
    const image = imported.get(group.key);
    return (
      <div
        key={group.key}
        className="flex gap-3 rounded-xl border border-gray-200 p-3 dark:border-gray-800"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Badge variant="light" color="primary" size="sm">
              {group.key}
            </Badge>
            <span
              className="min-w-0 truncate text-xs text-gray-500 dark:text-gray-400"
              title={sceneLabel(group)}
            >
              {sceneList(group)}
            </span>
            <span
              className={cn(
                "ms-auto inline-flex shrink-0 items-center gap-1 text-[11px]",
                image && redo.has(group.key)
                  ? "text-amber-600 dark:text-amber-400"
                  : image || group.prompt
                    ? "text-green-600 dark:text-green-400"
                    : "text-gray-400 dark:text-gray-500",
              )}
            >
              {(image || group.prompt) && !redo.has(group.key) && <CheckIcon className="size-3" />}
              {t(
                image
                  ? redo.has(group.key)
                    ? "statusRedo"
                    : "statusImage"
                  : group.prompt
                    ? "statusReady"
                    : "statusPending",
              )}
            </span>
            {image && (
              <button
                type="button"
                className="shrink-0 text-[11px] font-medium text-gray-500 underline-offset-2 hover:text-brand-500 hover:underline dark:text-gray-400"
                onClick={() => toggleRedo(group.key)}
              >
                {t(redo.has(group.key) ? "keepImage" : "redoImage")}
              </button>
            )}
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              title={t("copyItem")}
              onClick={() =>
                void copy(
                  group.key,
                  `${group.description}\n${group.prompt ?? ""}`,
                )
              }
            >
              {copiedKey === group.key ? (
                <CheckIcon className="size-3.5" />
              ) : (
                <CopyIcon className="size-3.5" />
              )}
            </Button>
          </div>
          <p className="mt-1.5 text-sm text-gray-700 dark:text-gray-300">
            {group.description}
          </p>
          {group.shot && (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {tAssets("shotHeader", {
                order: group.shot.order,
                total: group.shotTotal ?? 1,
              })}
              : {tScript(`shotSizes.${group.shot.shotSize}`)} ·{" "}
              {tAssets(`shotAngles.${group.shot.angle}`)}
            </p>
          )}
          {group.placement && (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {t("placementLabel")}: {group.placement}
            </p>
          )}
          {/* Whole frame vs transparent cutout (anything that moves on its own). */}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {(["scene", "cutout"] as const).map((layer) => (
              <button
                key={layer}
                type="button"
                disabled={generating}
                title={t(`layerHint.${layer}`)}
                onClick={() => chooseLayer(group.key, layer)}
                className={cn(
                  "rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors disabled:opacity-50",
                  group.layer === layer
                    ? "border-brand-500 bg-brand-50 text-brand-600 dark:border-brand-400 dark:bg-brand-500/15 dark:text-brand-400"
                    : "border-gray-200 text-gray-500 hover:border-brand-300 hover:text-brand-500 dark:border-gray-700 dark:text-gray-400",
                )}
              >
                {layer === "scene"
                  ? t("layer.scene", { ratio: frameRatio })
                  : t("layer.cutout")}
              </button>
            ))}
            {!group.layer && (
              <span className="text-[11px] text-gray-400 dark:text-gray-500">
                {t("layerAuto")}
              </span>
            )}
          </div>
          {group.prompt && (
            <div className="mt-2 rounded-lg bg-gray-50 p-2 dark:bg-white/[0.03]">
              <p
                className={cn(
                  "font-mono text-xs text-gray-600 dark:text-gray-400",
                  !expandedPrompts.has(group.key) && "line-clamp-2",
                )}
              >
                {group.prompt}
              </p>
              <button
                type="button"
                className="mt-1 text-[11px] font-medium text-brand-500 hover:underline dark:text-brand-400"
                onClick={() => togglePromptExpanded(group.key)}
              >
                {t(
                  expandedPrompts.has(group.key)
                    ? "collapsePrompt"
                    : "expandPrompt",
                )}
              </button>
            </div>
          )}
        </div>
        {image && (
          <div className="flex w-24 shrink-0 flex-col items-center gap-1">
            {/* object-contain: a cropped cutout shows whole, so a bad crop is visible. */}
            <img
              src={image}
              alt=""
              className="h-16 w-24 rounded-lg border border-gray-200 bg-[repeating-conic-gradient(#e5e7eb_0_25%,transparent_0_50%)] bg-[length:12px_12px] object-contain dark:border-gray-700 dark:bg-[repeating-conic-gradient(#374151_0_25%,transparent_0_50%)]"
            />
            {originals.has(group.key) && (
              <button
                type="button"
                disabled={restoring !== null}
                onClick={() => void restoreOriginal(group.key)}
                title={t("useOriginalHint")}
                className="text-[10px] font-medium text-brand-500 hover:underline disabled:opacity-50 dark:text-brand-400"
              >
                {restoring === group.key ? t("restoring") : t("useOriginal")}
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderList = (list: PromptGroup[]) =>
    list.length > 0 ? (
      <div className="grid items-start gap-2 xl:grid-cols-2">
        {list.map(renderGroup)}
      </div>
    ) : (
      <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
        {t("emptyTab")}
      </p>
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[90vh] flex-col sm:max-w-[min(1400px,94vw)]">
        <DialogHeader className="pe-10">
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-end gap-3">
          <AiSettingsFields
            providerLabel={t("aiProviderLabel")}
            provider={aiProvider}
            onProviderChange={setAiProvider}
            model={aiModel}
            onModelChange={setAiModel}
            availableProviders={availableAiProviders}
            effort={aiEffort}
            onEffortChange={setAiEffort}
          />
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex custom-scrollbar min-h-0 flex-1 flex-col gap-5 overflow-y-auto md:flex-row md:overflow-hidden">
          {/* Workflow: ① range → ② prompts → ③ pack → ④ import. */}
          <aside className="shrink-0 md:custom-scrollbar md:w-80 md:overflow-y-auto md:pe-1 xl:w-96">
            <WorkflowStep
              number={1}
              title={t("stepRange")}
              action={
                <button
                  type="button"
                  disabled={isWholeRange}
                  onClick={() => applyRange({ from: minScene, to: maxScene })}
                  className="text-xs font-medium text-brand-500 hover:underline disabled:pointer-events-none disabled:text-gray-400 dark:text-brand-400 dark:disabled:text-gray-500"
                >
                  {t("rangeAll")}
                </button>
              }
            >
              {/* One control for the range: "Cảnh [1] → [69]", Apply shows up once edited. */}
              <form
                className="flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  applyRange();
                }}
              >
                <InputGroup className="h-10 flex-1">
                  <InputGroupAddon>
                    <InputGroupText className="text-xs">
                      {t("rangeScenes")}
                    </InputGroupText>
                  </InputGroupAddon>
                  <InputGroupInput
                    inputMode="numeric"
                    aria-label={t("rangeFromLabel")}
                    value={fromDraft}
                    onChange={(e) =>
                      setFromDraft(e.target.value.replace(/\D/g, ""))
                    }
                    className="px-1 text-center tabular-nums"
                  />
                  <span className="text-gray-400 rtl:rotate-180" aria-hidden>
                    →
                  </span>
                  <InputGroupInput
                    inputMode="numeric"
                    aria-label={t("rangeToLabel")}
                    value={toDraft}
                    onChange={(e) =>
                      setToDraft(e.target.value.replace(/\D/g, ""))
                    }
                    className="px-1 text-center tabular-nums"
                  />
                </InputGroup>
                {draftChanged && (
                  <Button type="submit" size="sm" className="h-10">
                    {t("applyRange")}
                  </Button>
                )}
              </form>

              {chunks.length > 0 && (
                <div className="grid grid-cols-4 gap-1.5">
                  {chunks.map((chunk) => {
                    const active =
                      !draftChanged &&
                      chunk.from === range.from &&
                      chunk.to === range.to;
                    return (
                      <button
                        key={`${chunk.from}-${chunk.to}`}
                        type="button"
                        onClick={() => applyRange(chunk)}
                        className={cn(
                          "h-8 rounded-lg border text-xs font-medium tabular-nums transition-colors",
                          active
                            ? "border-brand-500 bg-brand-50 text-brand-600 dark:border-brand-400 dark:bg-brand-500/15 dark:text-brand-400"
                            : "border-gray-200 text-gray-600 hover:border-brand-300 hover:text-brand-500 dark:border-gray-700 dark:text-gray-300 dark:hover:border-brand-500/50",
                        )}
                      >
                        {chunk.from}–{chunk.to}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-white/[0.03]">
                  <p className="text-base font-semibold text-gray-800 tabular-nums dark:text-white/90">
                    {sceneCount}
                  </p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">
                    {t("statScenes")}
                  </p>
                </div>
                <div className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-white/[0.03]">
                  <p className="text-base font-semibold text-gray-800 tabular-nums dark:text-white/90">
                    {groups.length}
                  </p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">
                    {t("statItems")}
                  </p>
                </div>
              </div>
            </WorkflowStep>

            {/* ② Layers: a subject that changes in its scene needs a background
                plus one transparent PNG per state — one image can't animate. */}
            <WorkflowStep
              number={2}
              title={t("stepLayers")}
              done={allLayered}
              action={
                <span className="text-xs text-gray-500 tabular-nums dark:text-gray-400">
                  {layeredCount}/{imageAssetsInRange.length}
                </span>
              }
            >
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t("layersHint")}
              </p>
              {splitting && splitProgress && (
                <Progress
                  value={Math.round(
                    (splitProgress.done / splitProgress.total) * 100,
                  )}
                />
              )}
              {splitting ? (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full gap-1.5"
                  onClick={() => {
                    stopSplitRef.current = true;
                  }}
                >
                  <Spinner />
                  {t("stopSplitting")}
                </Button>
              ) : (
                <Button
                  type="button"
                  variant={allLayered ? "outline" : "default"}
                  className="w-full gap-1.5"
                  disabled={generating || imageAssetsInRange.length === 0}
                  onClick={() => setConfirmSplit(true)}
                >
                  <LayerIcon className="size-4" />
                  {t(allLayered ? "splitAgain" : "splitLayers", {
                    from: range.from,
                    to: range.to,
                  })}
                </Button>
              )}
              {splitResult && (
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  {splitResult.length > 0
                    ? t("splitDone", {
                        count: splitResult.length,
                        scenes: splitResult.join(", "),
                      })
                    : t("splitNoChange")}
                </p>
              )}
              <ConfirmDialog
                open={confirmSplit}
                onOpenChange={setConfirmSplit}
                title={t("splitConfirmTitle")}
                description={t("splitConfirmDescription", {
                  from: range.from,
                  to: range.to,
                })}
                confirmLabel={t("splitConfirm")}
                onConfirm={async () => {
                  setConfirmSplit(false);
                  void splitLayers();
                }}
              />
              <Button
                type="button"
                variant="outline"
                className="w-full gap-1.5"
                disabled={enriching || splitting || generating || imageAssetsInRange.length === 0}
                onClick={() => void enrich()}
              >
                {enriching ? <Spinner /> : <LayerIcon className="size-4" />}
                {t(enriching ? "enriching" : "enrich", { from: range.from, to: range.to })}
              </Button>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {enrichResult
                  ? t("enrichDone", {
                      sheets: enrichResult.sheets,
                      stickers: enrichResult.stickers,
                      photos: enrichResult.photos,
                      callouts: enrichResult.callouts,
                    })
                  : t("enrichHint")}
              </p>
            </WorkflowStep>

            {/* ③ Prompts: the AI folds in scene context and the locked look
                of characters/objects, which the bare descriptions don't carry. */}
            <WorkflowStep
              number={3}
              title={t("stepPrompts")}
              done={allPromptsReady}
              action={
                <span className="text-xs text-gray-500 tabular-nums dark:text-gray-400">
                  {generatedCount}/{groups.length}
                </span>
              }
            >
              <Progress
                value={
                  groups.length
                    ? Math.round((generatedCount / groups.length) * 100)
                    : 0
                }
              />
              {!allLayered && imageAssetsInRange.length > 0 && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
                  {t("promptsNeedLayers")}
                </p>
              )}
              {generating ? (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full gap-1.5"
                  onClick={() => {
                    stopRef.current = true;
                  }}
                >
                  <Spinner />
                  {t("stopGenerating")}
                </Button>
              ) : (
                <Button
                  type="button"
                  variant={allPromptsReady ? "outline" : "default"}
                  className="w-full gap-1.5"
                  disabled={groups.length === 0 || allPromptsReady}
                  onClick={() => void generateAll()}
                >
                  {allPromptsReady ? (
                    <CheckIcon className="size-4" />
                  ) : (
                    <SparkIcon className="size-4" />
                  )}
                  {allPromptsReady
                    ? t("promptsReady")
                    : t("generateMissing", {
                        count: groups.length - generatedCount,
                      })}
                </Button>
              )}
              {generatedCount > 0 && !generating && (
                <button
                  type="button"
                  onClick={() => setConfirmRewrite(true)}
                  className="text-xs font-medium text-gray-500 underline-offset-2 hover:text-brand-500 hover:underline dark:text-gray-400"
                >
                  {t("rewriteAll", { count: groups.length })}
                </button>
              )}
              <ConfirmDialog
                open={confirmRewrite}
                onOpenChange={setConfirmRewrite}
                title={t("rewriteAllTitle")}
                description={t("rewriteAllDescription", {
                  count: groups.length,
                })}
                confirmLabel={t("rewriteAllConfirm")}
                onConfirm={async () => {
                  setConfirmRewrite(false);
                  void generateAll({ rewrite: true });
                }}
              />
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t("generateHint")}
              </p>
            </WorkflowStep>

            <WorkflowStep number={4} title={t("stepPack")}>
              {/* What goes into the pack besides the prompts. */}
              {graphicsSkill ? (
                <div className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 dark:bg-white/[0.03]">
                  <BrushIcon className="size-4 shrink-0 text-brand-500 dark:text-brand-400" />
                  <span className="min-w-0 truncate text-xs text-gray-700 dark:text-gray-300">
                    {t("packSkill", { name: graphicsSkill.name })}
                  </span>
                  <span className="ms-auto shrink-0 text-[11px] text-gray-500 dark:text-gray-400">
                    {t("packSkillImages", { count: referenceImages.length })}
                  </span>
                </div>
              ) : (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
                  {t("packNoSkill")}
                </p>
              )}
              {graphicsSkill && referenceImages.length === 0 && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400">
                  {t("packSkillNoImages")}
                </p>
              )}

              {/* Exactly what the zip will hold, so nothing is a surprise after unzipping. */}
              <div className="rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-800">
                <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
                  {t("packFrame", {
                    ratio: frameRatio,
                    cutouts: groups.filter((g) => g.layer === "cutout").length,
                  })}
                </p>
                <p className="mt-1 text-[11px] font-medium text-gray-500 dark:text-gray-400">
                  {t("packContents")}
                </p>
                <ul className="mt-1 space-y-0.5">
                  {packFileList(packInput(characterPhotoPlaceholders)).map(
                    (file) => (
                      <li
                        key={file}
                        className="font-mono truncate text-[11px] text-gray-700 dark:text-gray-300"
                      >
                        {file}
                      </li>
                    ),
                  )}
                </ul>
              </div>

              {/* Download waits for every prompt; the bare-description pack stays
                  reachable as a deliberate second choice (e.g. no AI key). */}
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <Button
                  type="button"
                  className="gap-1.5"
                  disabled={packing || generating || !packReady}
                  onClick={() => void downloadPack()}
                >
                  {packing ? <Spinner /> : <DownloadIcon className="size-4" />}
                  {t("downloadPack")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-auto"
                  title={t("copyAll")}
                  aria-label={t("copyAll")}
                  disabled={generating || copyingAll || !packReady}
                  onClick={() => void copyAll()}
                >
                  {copyingAll ? (
                    <Spinner className="size-4" />
                  ) : copiedKey === "__all__" ? (
                    <CheckIcon className="size-4" />
                  ) : (
                    <CopyIcon className="size-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t("packOnlyMissing", {
                  count: packGroups.length,
                  kept: groups.length - packGroups.length,
                })}
              </p>
              {!packReady && packGroups.length > 0 ? (
                <div className="space-y-1">
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    {t("packNeedsPrompts", {
                      count: packGroups.filter((group) => !group.prompt).length,
                    })}
                  </p>
                  <button
                    type="button"
                    disabled={packing || generating}
                    onClick={() => void downloadPack()}
                    className="text-xs font-medium text-gray-500 underline-offset-2 hover:text-brand-500 hover:underline disabled:pointer-events-none disabled:opacity-50 dark:text-gray-400"
                  >
                    {t("downloadWithoutPrompts")}
                  </button>
                </div>
              ) : (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {t("packHint")}
                </p>
              )}

              <button
                type="button"
                className="inline-flex items-center gap-1 text-xs font-medium text-brand-500 hover:underline dark:text-brand-400"
                onClick={() => setShowInstructions((v) => !v)}
              >
                {t(showInstructions ? "hideInstructions" : "showInstructions")}
                <ChevronDownIcon
                  className={cn(
                    "size-3.5 transition-transform",
                    showInstructions && "rotate-180",
                  )}
                />
              </button>
              {showInstructions &&
                (() => {
                  const text =
                    instructionsDraft ?? instructionsMarkdown(packInput());
                  const dirty =
                    instructionsDraft !== null &&
                    instructionsDraft !==
                      (instructionsOverride ??
                        generatedInstructionsMarkdown(packInput()));
                  return (
                    <div className="space-y-1.5">
                      <Textarea
                        value={text}
                        onChange={(e) => setInstructionsDraft(e.target.value)}
                        rows={14}
                        className="font-sans max-h-72 text-xs whitespace-pre-wrap"
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                          disabled={savingInstructions || !dirty}
                          onClick={() => void saveInstructions(text)}
                        >
                          {savingInstructions && <Spinner />}
                          {t("saveInstructions")}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                          onClick={() => void copy("__instructions__", text)}
                        >
                          {copiedKey === "__instructions__" ? (
                            <CheckIcon className="size-3.5" />
                          ) : (
                            <CopyIcon className="size-3.5" />
                          )}
                          {t("copyItem")}
                        </Button>
                        {(instructionsOverride ||
                          instructionsDraft !== null) && (
                          <button
                            type="button"
                            className="text-xs text-gray-500 underline-offset-2 hover:text-brand-500 hover:underline dark:text-gray-400"
                            onClick={() => void saveInstructions("")}
                          >
                            {t("resetInstructions")}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })()}
            </WorkflowStep>

            <WorkflowStep
              number={5}
              title={t("importTitle")}
              done={groups.length > 0 && importedCount === groups.length}
              action={
                <span className="text-xs text-gray-500 tabular-nums dark:text-gray-400">
                  {t("importedCount", {
                    done: importedCount,
                    total: groups.length,
                  })}
                </span>
              }
            >
              <BatchImageImport
                key={`${range.from}-${range.to}`}
                targets={orderedGroups.map((group) => ({
                  key: group.key,
                  label: `${group.key} · ${sceneList(group)}`,
                }))}
                imported={new Set([...imported.keys()].filter((key) => !redo.has(key)))}
                onAssign={assignImage}
                onDone={onImported}
                disabled={groups.length === 0}
              />
            </WorkflowStep>
          </aside>

          {/* The requests themselves. */}
          <div className="flex min-w-0 flex-1 flex-col md:min-h-0 md:border-s md:border-gray-100 md:ps-5 md:dark:border-gray-800">
            {groups.length === 0 ? (
              <p className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
                {t("empty")}
              </p>
            ) : (
              <Tabs
                value={activeTab}
                onValueChange={(value) =>
                  setTab(value as PromptGroup["category"])
                }
                className="flex min-h-0 flex-1 flex-col"
              >
                <TabsList
                  variant="line"
                  className="w-full justify-start border-b border-gray-200 dark:border-gray-800"
                >
                  <TabsTrigger value="character" className="gap-1.5">
                    {t("characterGroup")}
                    <Badge variant="light" color="gray" size="sm">
                      {characterGroups.length}
                    </Badge>
                  </TabsTrigger>
                  <TabsTrigger value="background" className="gap-1.5">
                    {t("backgroundGroup")}
                    <Badge variant="light" color="gray" size="sm">
                      {backgroundGroups.length}
                    </Badge>
                  </TabsTrigger>
                </TabsList>
                <TabsContent
                  value="character"
                  className="pt-3 md:custom-scrollbar md:min-h-0 md:flex-1 md:overflow-y-auto"
                >
                  {renderList(characterGroups)}
                </TabsContent>
                <TabsContent
                  value="background"
                  className="pt-3 md:custom-scrollbar md:min-h-0 md:flex-1 md:overflow-y-auto"
                >
                  {renderList(backgroundGroups)}
                </TabsContent>
              </Tabs>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
