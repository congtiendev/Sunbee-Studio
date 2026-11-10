import { SkeletonPanel } from "@/components/shared/skeleton-blocks";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress-bar";
import { useTranslations } from "@/i18n";
import { SearchIcon, StarFilledIcon, TrashBinIcon } from "@/icons";
import { apiClient } from "@/lib/api-client";
import type {
  AssetCandidate,
  ResearchSourceInfo,
  SceneResource,
  ScriptAnalysisRecord,
  StyleTemplate,
} from "@shared/types";
import { useEffect, useMemo, useState } from "react";
import type { StepComponentProps } from "../registry";
import CandidatePreview from "./candidate-preview";
import GraphicsSkillSelect, { NO_GRAPHICS_SKILL } from "./graphics-skill-select";
import ResearchSheet, { type ResearchTarget } from "./research-sheet";

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

const slotKey = (sceneIndex: number, assetIndex: number) => `${sceneIndex}:${assetIndex}`;

/** Step 2 — research and pick the media every scene needs. */
export default function AssetsStep({ videoId, onComplete }: StepComponentProps) {
  const t = useTranslations("videoStudio.assets");
  const tScript = useTranslations("videoStudio.script");

  const [version, setVersion] = useState<ScriptAnalysisRecord | null>(null);
  const [sources, setSources] = useState<ResearchSourceInfo[]>([]);
  const [selections, setSelections] = useState<SceneResource[]>([]);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<ResearchTarget | null>(null);
  const [clearing, setClearing] = useState<string | null>(null);
  const [imageSkills, setImageSkills] = useState<StyleTemplate[]>([]);
  const [graphicsSkillId, setGraphicsSkillId] = useState(NO_GRAPHICS_SKILL);
  const [referenceImage, setReferenceImage] = useState<string | undefined>(undefined);

  useEffect(() => {
    let active = true;
    Promise.all([
      apiClient.script.history(videoId),
      apiClient.assets.sources(),
      apiClient.assets.selections(videoId),
      apiClient.templates.list(),
    ])
      .then(([history, sourceList, picks, templates]) => {
        if (!active) return;
        // The newest analyzed version is the one the scenes come from.
        setVersion(history.find((v) => v.kind === "analyzed" && v.scenes.length > 0) ?? null);
        const order = { library: 0, stock: 1, ai: 2 } as const;
        setSources([...sourceList].sort((a, b) => order[a.kind] - order[b.kind]));
        setSelections(picks);
        setImageSkills(templates.filter((t) => t.type === "image"));
        setError(null);
      })
      .catch((err) => {
        if (active) setError(errorMessage(err));
      })
      .finally(() => {
        if (active) setLoadedFor(videoId);
      });
    return () => {
      active = false;
    };
  }, [videoId]);

  const bySlot = useMemo(
    () => new Map(selections.map((pick) => [slotKey(pick.sceneIndex, pick.assetIndex), pick])),
    [selections],
  );
  // Stable reference across re-renders (not a fresh `?? []` every render) so
  // ResearchSheet's effects keyed on it don't re-fire unless it actually changed.
  const characterRoster = useMemo(() => version?.characterRoster ?? [], [version]);
  const graphicsSkill = useMemo(
    () => imageSkills.find((skill) => skill.id === graphicsSkillId),
    [imageSkills, graphicsSkillId],
  );
  const graphicsStyle = graphicsSkill?.graphicsStyle;

  // The skill's reference illustration (style only) — fetched once per skill
  // selection and described into every generation alongside graphicsStyle.
  useEffect(() => {
    let active = true;
    const fileId = graphicsSkill?.referenceImageFileId;
    if (!fileId) {
      setReferenceImage(undefined);
      return;
    }
    fetch(apiClient.documents.fileUrl(fileId))
      .then((res) => res.blob())
      .then(blobToDataUrl)
      .then((dataUrl) => {
        if (active) setReferenceImage(dataUrl);
      })
      .catch(() => {
        if (active) setReferenceImage(undefined);
      });
    return () => {
      active = false;
    };
  }, [graphicsSkill?.referenceImageFileId]);
  const totalSlots = version?.scenes.reduce((sum, scene) => sum + scene.requiredAssets.length, 0) ?? 0;
  const filledSlots =
    version?.scenes.reduce(
      (sum, scene) =>
        sum + scene.requiredAssets.filter((_, i) => bySlot.has(slotKey(scene.index, i))).length,
      0,
    ) ?? 0;

  const select = async (candidate: AssetCandidate) => {
    if (!target) return;
    try {
      const saved = await apiClient.assets.select({
        videoId,
        sceneIndex: target.scene.index,
        assetIndex: target.assetIndex,
        assetDescription: target.asset.description,
        candidate,
      });
      if (!saved) return;
      const next = [
        ...selections.filter(
          (pick) => !(pick.sceneIndex === saved.sceneIndex && pick.assetIndex === saved.assetIndex),
        ),
        saved,
      ];
      setSelections(next);
      if (next.length >= totalSlots) onComplete();
      setTarget(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const clear = async (sceneIndex: number, assetIndex: number) => {
    const key = slotKey(sceneIndex, assetIndex);
    setClearing(key);
    try {
      await apiClient.assets.select({ videoId, sceneIndex, assetIndex, assetDescription: "", candidate: null });
      setSelections((prev) => prev.filter((pick) => slotKey(pick.sceneIndex, pick.assetIndex) !== key));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setClearing(null);
    }
  };

  if (loadedFor !== videoId) {
    return (
      <div className="space-y-5">
        <SkeletonPanel className="h-10" />
        <div className="space-y-4">
          {Array.from({ length: 4 }, (_, i) => (
            <SkeletonPanel key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  if (!version) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-300 px-6 py-12 text-center dark:border-gray-700">
        <p className="text-sm text-gray-500 dark:text-gray-400">{t("noAnalysis")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <CardTitle className="me-auto">{t("title")}</CardTitle>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {t("progress", { done: filledSlots, total: totalSlots })}
        </span>
        <Progress
          value={totalSlots ? Math.round((filledSlots / totalSlots) * 100) : 0}
          className="w-40"
        />
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400">{t("description")}</p>

      <GraphicsSkillSelect
        skills={imageSkills}
        value={graphicsSkillId}
        onChange={setGraphicsSkillId}
        className="max-w-md"
      />

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-4">
        {version.scenes.map((scene) => (
          <section
            key={scene.index}
            className="rounded-xl border border-gray-200 p-4 dark:border-gray-800"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-gray-800 dark:text-white/90">
                {t("scene", { index: scene.index })}
              </span>
              {scene.heroMoment && <StarFilledIcon className="size-3.5 text-yellow-400" />}
              <Badge variant="light" color="primary" size="sm">
                {tScript(`narrativeRoles.${scene.narrativeRole}`)}
              </Badge>
              <span className="text-xs text-gray-500 dark:text-gray-400">{scene.estimatedDurationSec}s</span>
            </div>
            <p className="mt-1 line-clamp-2 text-sm text-gray-600 dark:text-gray-400">{scene.content}</p>

            {scene.requiredAssets.length === 0 ? (
              <p className="mt-3 text-xs text-gray-400 dark:text-gray-500">{t("noAssets")}</p>
            ) : (
              <ul className="mt-3 divide-y divide-gray-100 dark:divide-gray-800">
                {scene.requiredAssets.map((asset, assetIndex) => {
                  const pick = bySlot.get(slotKey(scene.index, assetIndex));
                  const outdated = pick && pick.assetDescription !== asset.description;
                  return (
                    <li key={assetIndex} className="flex flex-wrap items-center gap-3 py-3">
                      <div className="min-w-0 flex-1 basis-60">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge variant="light" color="gray" size="sm">
                            {tScript(`assetTypes.${asset.type}`)}
                          </Badge>
                          <Badge variant="light" color="info" size="sm">
                            {t(`assetSources.${asset.source}`)}
                          </Badge>
                        </div>
                        <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">{asset.description}</p>
                      </div>

                      {pick ? (
                        <div className="flex min-w-0 basis-72 items-center gap-2.5">
                          <CandidatePreview candidate={pick.candidate} compact className="h-12 w-20 shrink-0 rounded-lg" />
                          <div className="min-w-0">
                            <p className="truncate text-xs font-medium text-gray-800 dark:text-white/90">
                              {pick.candidate.title}
                            </p>
                            <p className="truncate text-[11px] text-gray-500 dark:text-gray-400">
                              {t(`sources.${pick.candidate.sourceKey}`, { defaultValue: pick.candidate.sourceKey })}
                              {pick.candidate.attribution ? ` · ${pick.candidate.attribution}` : ""}
                            </p>
                            {outdated && (
                              <p className="text-[11px] text-amber-600 dark:text-amber-400">{t("outdated")}</p>
                            )}
                          </div>
                        </div>
                      ) : (
                        <span className="basis-72 text-xs text-gray-400 dark:text-gray-500">{t("notPicked")}</span>
                      )}

                      <div className="flex shrink-0 gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant={pick ? "outline" : "default"}
                          className="gap-1.5"
                          onClick={() => setTarget({ scene, assetIndex, asset })}
                        >
                          <SearchIcon className="size-4" />
                          {t(pick ? "change" : "research.open")}
                        </Button>
                        {pick && (
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            title={t("remove")}
                            disabled={clearing === slotKey(scene.index, assetIndex)}
                            onClick={() => void clear(scene.index, assetIndex)}
                          >
                            <TrashBinIcon className="size-4" />
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ))}
      </div>

      <ResearchSheet
        target={target}
        sources={sources}
        selected={target ? bySlot.get(slotKey(target.scene.index, target.assetIndex))?.candidate : undefined}
        characterRoster={characterRoster}
        graphicsStyle={graphicsStyle}
        referenceImage={referenceImage}
        onOpenChange={(open) => !open && setTarget(null)}
        onSelect={select}
      />
    </div>
  );
}
