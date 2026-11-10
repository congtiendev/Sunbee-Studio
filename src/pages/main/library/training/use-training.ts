import { apiClient } from "@/lib/api-client";
import { pathParams } from "@/lib/paths";
import {
  defaultModelFor,
  type AnalyzeProvider,
} from "@shared/script-cost-estimate";
import type {
  SkillTrainingResult,
  SkillType,
  SkillVersion,
  SkillVersionSource,
  StyleTemplate,
  TrainingCandidate,
  TrainingSourceKind,
  TrainingSourceList,
  TrainingSourceRef,
} from "@shared/types";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { SCRIPT_KINDS, type TrainingSelection } from "./sources";

export type TrainingTarget = "new" | "existing";
export type TrainingEffort = "low" | "medium" | "high";

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export const refKey = (ref: TrainingSourceRef) => `${ref.kind}:${ref.id}`;

/** The scripts belonging to a project video (e.g. the one the studio sent us from). */
function selectionForVideo(
  videoId: string,
  lists: TrainingSourceList[],
): TrainingSelection {
  const selection: TrainingSelection = {};
  for (const list of lists) {
    const ids = list.candidates
      .filter((c) => c.videoId === videoId)
      .map((c) => c.id);
    if (ids.length > 0) selection[list.kind] = ids;
  }
  return selection;
}

/**
 * Everything the AI-training page does: pick a skill (new or existing), add
 * material for every source kind, run training, browse and restore versions.
 *
 * Training an existing skill is cumulative: what it learned before (the latest
 * version's sources) is always re-used — the user only adds new material, and
 * may drop learned sources one by one. `?skill=` opens an existing skill;
 * `?video=` pre-picks that video's script.
 */
export function useTraining() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [skills, setSkills] = useState<StyleTemplate[] | null>(null);
  const [sourceLists, setSourceLists] = useState<TrainingSourceList[] | null>(
    null,
  );
  const [loadError, setLoadError] = useState<string | null>(null);

  // What the page was opened on (`?skill=`, `?video=`); read once.
  const [initialSkillId] = useState(() => searchParams.get(pathParams.skillId));
  const [initialVideoId] = useState(() => searchParams.get(pathParams.videoId));

  const [target, setTarget] = useState<TrainingTarget>(
    initialSkillId ? "existing" : "new",
  );
  const [skillId, setSkillId] = useState<string | null>(initialSkillId);
  const [name, setName] = useState("");
  /** New skill only: which kind to create. An existing skill's own type always wins. */
  const [newType, setNewType] = useState<SkillType>("script");
  /** New material picked for this run. */
  const [selection, setSelection] = useState<TrainingSelection>({});
  const [versions, setVersions] = useState<SkillVersion[] | null>(null);
  /** Learned sources (by `refKey`) to drop from the skill in this run. */
  const [removed, setRemoved] = useState<ReadonlySet<string>>(() => new Set());

  const [availableProviders, setAvailableProviders] = useState<
    Record<AnalyzeProvider, boolean>
  >({
    openai: true,
    claude: true,
  });
  const [provider, setProvider] = useState<AnalyzeProvider>("claude");
  const [model, setModel] = useState(defaultModelFor("claude"));
  const [effort, setEffort] = useState<TrainingEffort>("medium");
  const [note, setNote] = useState("");
  const [attachToSkill, setAttachToSkill] = useState(true);

  const [training, setTraining] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [result, setResult] = useState<SkillTrainingResult | null>(null);

  const changeProvider = (next: AnalyzeProvider) => {
    setProvider(next);
    setModel(defaultModelFor(next));
  };

  const loadVersions = (id: string) =>
    apiClient.training
      .versions(id)
      .then(setVersions)
      .catch((err) => setRunError(errorMessage(err)));

  useEffect(() => {
    let active = true;
    Promise.all([
      apiClient.templates.list(),
      apiClient.training.sources(),
      apiClient.settings.get(),
    ])
      .then(([skillList, lists, settings]) => {
        if (!active) return;
        setSkills(skillList);
        setSourceLists(lists);
        const keys = {
          openai: Boolean(settings.openaiApiKey),
          claude: Boolean(settings.anthropicApiKey),
        };
        setAvailableProviders(keys);
        if (!keys.claude && keys.openai) changeProvider("openai");
        if (initialVideoId)
          setSelection(selectionForVideo(initialVideoId, lists));
        if (initialSkillId) void loadVersions(initialSkillId);
      })
      .catch((err) => active && setLoadError(errorMessage(err)));
    return () => {
      active = false;
    };
    // The initial ids never change, so this loads once.
  }, [initialSkillId, initialVideoId]);

  const syncUrl = (id: string | null) => {
    const next = new URLSearchParams();
    if (id) next.set(pathParams.skillId, id);
    setSearchParams(next, { replace: true });
  };

  const resetRun = () => {
    setResult(null);
    setRunError(null);
    setRemoved(new Set());
  };

  const chooseTarget = (next: TrainingTarget) => {
    setTarget(next);
    resetRun();
    if (next === "new") {
      setSkillId(null);
      setVersions(null);
      syncUrl(null);
    }
  };

  const chooseSkill = (id: string) => {
    setSkillId(id);
    setVersions(null);
    resetRun();
    syncUrl(id);
    void loadVersions(id);
  };

  /**
   * Everything the chosen skill has learned from so far (latest version,
   * cumulative). Sources deleted since (no label) are left out: the server
   * drops them too.
   */
  const learned: SkillVersionSource[] =
    target === "existing" && skillId
      ? (versions?.[0]?.sources ?? []).filter((source) => source.label !== null)
      : [];
  const learnedKeys = new Set(learned.map(refKey));
  const learnedIdsOf = (kind: TrainingSourceKind) =>
    new Set(learned.filter((s) => s.kind === kind).map((s) => s.id));

  const isRemoved = (ref: TrainingSourceRef) => removed.has(refKey(ref));
  const toggleRemoved = (ref: TrainingSourceRef) =>
    setRemoved((prev) => {
      const next = new Set(prev);
      if (next.has(refKey(ref))) next.delete(refKey(ref));
      else next.add(refKey(ref));
      return next;
    });

  const setKindSelection = (kind: TrainingSourceKind, ids: string[]) =>
    setSelection((prev) => ({ ...prev, [kind]: ids }));

  /** Material just made on the page (fetched link, upload, document): list it and pick it. */
  const addCandidate = (candidate: TrainingCandidate) => {
    setSourceLists(
      (prev) =>
        prev?.map((list) =>
          list.kind === candidate.kind
            ? {
                ...list,
                candidates: [
                  candidate,
                  ...list.candidates.filter((c) => c.id !== candidate.id),
                ],
              }
            : list,
        ) ?? prev,
    );
    if (learnedKeys.has(refKey(candidate))) return; // already part of the skill
    const max =
      sourceLists?.find((list) => list.kind === candidate.kind)?.max ??
      Infinity;
    setSelection((prev) => {
      const ids = prev[candidate.kind] ?? [];
      if (ids.includes(candidate.id) || ids.length >= max) return prev;
      return { ...prev, [candidate.kind]: [...ids, candidate.id] };
    });
  };

  /** New material only: anything the skill already learned is re-used anyway. */
  const newRefs: TrainingSourceRef[] = (
    Object.entries(selection) as [TrainingSourceKind, string[]][]
  )
    .flatMap(([kind, ids]) => ids.map((id) => ({ kind, id })))
    .filter((ref) => !learnedKeys.has(refKey(ref)));
  const removedRefs = learned
    .filter(isRemoved)
    .map(({ kind, id }) => ({ kind, id }));

  const newCountOf = (kinds: TrainingSourceKind[]) =>
    newRefs.filter((ref) => kinds.includes(ref.kind)).length;
  const counts = {
    newScripts: newCountOf(SCRIPT_KINDS),
    newDocuments: newCountOf(["document"]),
    newImages: newCountOf(["image"]),
    learnedKept: learned.length - removedRefs.length,
    learnedScripts: learned.filter(
      (s) => SCRIPT_KINDS.includes(s.kind) && !isRemoved(s),
    ).length,
  };

  const currentSkill = skills?.find((s) => s.id === skillId) ?? null;
  /** What kind of skill this run would produce — an existing skill's own type always wins. */
  const targetType: SkillType =
    target === "existing" ? (currentSkill?.type ?? "script") : newType;

  const canRun =
    !training &&
    (target === "new"
      ? newRefs.length > 0
      : Boolean(skillId) && newRefs.length + counts.learnedKept > 0);

  const run = async () => {
    if (!canRun) return;
    setTraining(true);
    setRunError(null);
    setResult(null);
    try {
      const outcome = await apiClient.training.run({
        skillId: target === "existing" ? (skillId ?? undefined) : undefined,
        name: target === "new" ? name.trim() || undefined : undefined,
        type: target === "new" ? newType : undefined,
        sources: newRefs,
        removeSources: removedRefs,
        attachToSkill,
        provider,
        model,
        effort,
        note: note.trim() || undefined,
      });
      setResult(outcome);
      setNote("");
      // What was added is now learned; the next run starts from the new version.
      setSelection({});
      setRemoved(new Set());
      setTarget("existing");
      setSkillId(outcome.skill.id);
      syncUrl(outcome.skill.id);
      setSkills((prev) => [
        outcome.skill,
        ...(prev ?? []).filter((s) => s.id !== outcome.skill.id),
      ]);
      void loadVersions(outcome.skill.id);
    } catch (err) {
      setRunError(errorMessage(err));
    } finally {
      setTraining(false);
    }
  };

  const restore = async (versionId: string) => {
    if (!skillId) return;
    const outcome = await apiClient.training.restore(skillId, versionId);
    resetRun();
    setSkills(
      (prev) =>
        prev?.map((s) => (s.id === outcome.skill.id ? outcome.skill : s)) ??
        prev,
    );
    await loadVersions(skillId);
  };

  return {
    skills,
    sourceLists,
    loadError,
    target,
    chooseTarget,
    skillId,
    chooseSkill,
    currentSkill,
    newType,
    setNewType,
    targetType,
    name,
    setName,
    selection,
    setKindSelection,
    addCandidate,
    learned,
    learnedIdsOf,
    isRemoved,
    toggleRemoved,
    counts,
    versions,
    availableProviders,
    provider,
    changeProvider,
    model,
    setModel,
    effort,
    setEffort,
    note,
    setNote,
    attachToSkill,
    setAttachToSkill,
    training,
    runError,
    result,
    canRun,
    run,
    restore,
  };
}

export type TrainingState = ReturnType<typeof useTraining>;
