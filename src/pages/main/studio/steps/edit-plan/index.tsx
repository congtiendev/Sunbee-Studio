import { SkeletonPanel } from "@/components/shared/skeleton-blocks";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { useTranslations } from "@/i18n";
import { apiClient } from "@/lib/api-client";
import { cn } from "@/utils";
import type {
  CapcutExportResponse,
  EditPlanResponse,
  EditPlanWarning,
  EditStyleLearnResponse,
} from "@shared/edit-plan";
import type { EditRecipe } from "@shared/edit-recipe";
import type { StyleTemplate } from "@shared/types";
import { useCallback, useEffect, useState } from "react";
import type { StepComponentProps } from "../registry";
import LearnStyleDialog from "./learn-style-dialog";
import RecipeEditor from "./recipe-editor";

/** Select value for "no skill of its own": the one the script was analyzed with, else the default recipe. */
const ANALYSIS_SKILL = "__analysis__";

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** 83500 → "1:23". */
function clock(ms: number): string {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

const WARNING_ORDER: EditPlanWarning["code"][] = [
  "noNarration",
  "missingPick",
  "noBackground",
  "spriteGrid",
  "downloadFailed",
  "skippedMedia",
];
/** Details listed per warning kind before "and N more". */
const WARNINGS_SHOWN = 8;

/** Step 3 — the scenes, shots and picked images laid out on a timeline, exported to CapCut. */
export default function EditPlanStep({
  videoId,
  onComplete,
  onBusyChange,
}: StepComponentProps) {
  const t = useTranslations("videoStudio.editPlan");

  const [plan, setPlan] = useState<EditPlanResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fromScene, setFromScene] = useState("");
  const [toScene, setToScene] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exported, setExported] = useState<CapcutExportResponse | null>(null);
  const [editSkills, setEditSkills] = useState<StyleTemplate[]>([]);
  const [skillChoice, setSkillChoice] = useState(ANALYSIS_SKILL);
  const [savingRecipe, setSavingRecipe] = useState(false);
  const [learnOpen, setLearnOpen] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([apiClient.editPlan.timeline(videoId), apiClient.templates.list(), apiClient.videos.get(videoId)])
      .then(([result, templates, video]) => {
        if (!active) return;
        setPlan(result);
        setEditSkills(templates.filter((skill) => skill.type === "editing"));
        setSkillChoice(video.editSkillId ?? ANALYSIS_SKILL);
      })
      .catch((err) => {
        if (active) setError(errorMessage(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [videoId]);

  /** Rebuilds after more images were picked or narration was added. */
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPlan(await apiClient.editPlan.timeline(videoId));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [videoId]);

  /** The video's editing skill: its recipe drives the plan and the CapCut export. */
  const chooseSkill = async (value: string) => {
    setSkillChoice(value);
    try {
      await apiClient.videos.update(videoId, { editSkillId: value === ANALYSIS_SKILL ? null : value });
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const saveRecipe = async (recipe: EditRecipe) => {
    if (!plan?.editSkill) return;
    setSavingRecipe(true);
    try {
      await apiClient.templates.update(plan.editSkill.id, { editRecipe: recipe });
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSavingRecipe(false);
    }
  };

  const onLearned = (result: EditStyleLearnResponse) => {
    setEditSkills((prev) => [result.skill, ...prev.filter((skill) => skill.id !== result.skill.id)]);
    void chooseSkill(result.skill.id);
  };

  const sceneNumber = (value: string) => {
    const n = Number(value);
    return Number.isInteger(n) && n > 0 ? n : undefined;
  };

  const exportToCapcut = async () => {
    setExporting(true);
    onBusyChange?.(true);
    setError(null);
    setExported(null);
    try {
      const result = await apiClient.editPlan.exportCapcut({
        videoId,
        fromScene: sceneNumber(fromScene),
        toScene: sceneNumber(toScene),
      });
      setExported(result);
      onComplete();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setExporting(false);
      onBusyChange?.(false);
    }
  };

  if (loading && !plan) {
    return (
      <div className="space-y-4">
        <SkeletonPanel className="h-10" />
        <SkeletonPanel className="h-24" />
        <SkeletonPanel className="h-64" />
      </div>
    );
  }

  const scenes = plan?.scenes ?? [];
  const totals = scenes.reduce(
    (sum, scene) => ({
      shots: sum.shots + scene.shots,
      images: sum.images + scene.images,
      imagesWanted: sum.imagesWanted + scene.imagesWanted,
      subtitles: sum.subtitles + scene.subtitles,
    }),
    { shots: 0, images: 0, imagesWanted: 0, subtitles: 0 },
  );
  const warningsByCode = WARNING_ORDER.map((code) => ({
    code,
    items: plan?.warnings.filter((w) => w.code === code) ?? [],
  })).filter((group) => group.items.length > 0);

  const describeWarning = (w: EditPlanWarning) =>
    t(`warnings.${w.code}.item`, {
      scene: w.sceneIndex ?? "",
      shot: w.shotOrder ?? "",
      detail: (w.detail ?? "").slice(0, 120),
    });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-72">
          <CardTitle>{t("title")}</CardTitle>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {t("description")}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={loading || exporting}
          onClick={() => void load()}
        >
          {loading && <Spinner className="size-4" />}
          {t("refresh")}
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {plan && (
        <>
          {/* The editing skill: its recipe is what the CapCut export does. */}
          <div className="space-y-3 rounded-xl border border-gray-200 bg-gray-50/60 p-4 dark:border-gray-800 dark:bg-white/[0.02]">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-0 flex-1 basis-64 space-y-1.5">
                <Label htmlFor="edit-skill">{t("skill.label")}</Label>
                <Select value={skillChoice} onValueChange={(v) => void chooseSkill(v as string)}>
                  <SelectTrigger id="edit-skill" className="w-full sm:w-80">
                    <SelectValue>
                      {() =>
                        skillChoice === ANALYSIS_SKILL
                          ? t("skill.fromAnalysis", { name: plan.editSkill?.name ?? t("skill.defaultRecipe") })
                          : (editSkills.find((skill) => skill.id === skillChoice)?.name ?? "")
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ANALYSIS_SKILL}>{t("skill.analysisOption")}</SelectItem>
                    {editSkills.map((skill) => (
                      <SelectItem key={skill.id} value={skill.id}>
                        {skill.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => setLearnOpen(true)}>
                {t("skill.learn")}
              </Button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {plan.editSkill && editSkills.find((s) => s.id === plan.editSkill?.id)?.editRecipe
                ? t("skill.hint")
                : t("skill.noRecipe")}
            </p>
            <RecipeEditor
              key={`${plan.editSkill?.id ?? "default"}:${JSON.stringify(plan.recipe)}`}
              recipe={plan.recipe}
              canSave={Boolean(plan.editSkill)}
              saving={savingRecipe}
              onSave={(recipe) => void saveRecipe(recipe)}
            />
          </div>
          <LearnStyleDialog open={learnOpen} onOpenChange={setLearnOpen} onLearned={onLearned} />

          {/* Overview */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              { label: t("stats.duration"), value: clock(plan.timeline.durationMs) },
              { label: t("stats.scenes"), value: scenes.length },
              { label: t("stats.shots"), value: totals.shots },
              { label: t("stats.images"), value: `${totals.images}/${totals.imagesWanted}` },
              { label: t("stats.subtitles"), value: totals.subtitles },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-xl border border-gray-200 px-4 py-3 dark:border-gray-800"
              >
                <p className="text-xs text-gray-500 dark:text-gray-400">{stat.label}</p>
                <p className="mt-1 text-lg font-semibold text-gray-800 tabular-nums dark:text-white/90">
                  {stat.value}
                </p>
              </div>
            ))}
          </div>
          {plan.estimatedTiming && (
            <p className="text-xs text-gray-500 dark:text-gray-400">{t("estimatedTiming")}</p>
          )}

          {/* What's missing */}
          {warningsByCode.length > 0 && (
            <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-500/30 dark:bg-amber-500/10">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                {t("warningsTitle")}
              </p>
              {warningsByCode.map(({ code, items }) => (
                <details key={code} className="group text-sm">
                  <summary className="cursor-pointer text-amber-800 dark:text-amber-300">
                    {t(`warnings.${code}.title`, {
                      count: code === "noNarration" ? Number(items[0]?.detail ?? 0) : items.length,
                    })}
                  </summary>
                  {code !== "noNarration" && (
                    <ul className="mt-2 space-y-1 ps-4 text-xs text-gray-600 dark:text-gray-400">
                      {items.slice(0, WARNINGS_SHOWN).map((w, i) => (
                        <li key={i} className="list-disc">
                          {describeWarning(w)}
                        </li>
                      ))}
                      {items.length > WARNINGS_SHOWN && (
                        <li className="list-none text-gray-500 dark:text-gray-500">
                          {t("andMore", { count: items.length - WARNINGS_SHOWN })}
                        </li>
                      )}
                    </ul>
                  )}
                  {code === "noNarration" && (
                    <p className="mt-2 ps-4 text-xs text-gray-600 dark:text-gray-400">
                      {t("warnings.noNarration.hint")}
                    </p>
                  )}
                </details>
              ))}
            </div>
          )}

          {/* Export */}
          <div className="space-y-3 rounded-xl border border-gray-200 bg-gray-50/60 p-4 dark:border-gray-800 dark:bg-white/[0.02]">
            <div>
              <p className="text-sm font-medium text-gray-800 dark:text-white/90">{t("export.title")}</p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t("export.description")}</p>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit-plan-from">{t("export.fromScene")}</Label>
                <Input
                  id="edit-plan-from"
                  type="number"
                  min={1}
                  className="w-28"
                  placeholder="1"
                  value={fromScene}
                  onChange={(e) => setFromScene(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-plan-to">{t("export.toScene")}</Label>
                <Input
                  id="edit-plan-to"
                  type="number"
                  min={1}
                  className="w-28"
                  placeholder={String(scenes.at(-1)?.sceneIndex ?? "")}
                  value={toScene}
                  onChange={(e) => setToScene(e.target.value)}
                />
              </div>
              <Button
                type="button"
                className="gap-1.5"
                disabled={exporting || scenes.length === 0}
                onClick={() => void exportToCapcut()}
              >
                {exporting && <Spinner className="size-4" />}
                {exporting ? t("export.working") : t("export.button")}
              </Button>
            </div>
            {exported && (
              <Alert>
                <AlertDescription>
                  {t("export.done", {
                    name: exported.folderName,
                    duration: clock(exported.durationMs),
                  })}
                </AlertDescription>
              </Alert>
            )}
          </div>

          {/* Timeline overview, scene by scene */}
          <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 dark:bg-white/[0.03] dark:text-gray-400">
                <tr>
                  <th className="px-4 py-2 text-start font-medium">{t("table.scene")}</th>
                  <th className="px-4 py-2 text-start font-medium">{t("table.time")}</th>
                  <th className="px-4 py-2 text-end font-medium">{t("table.shots")}</th>
                  <th className="px-4 py-2 text-end font-medium">{t("table.images")}</th>
                  <th className="px-4 py-2 text-end font-medium">{t("table.subtitles")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {scenes.map((scene) => {
                  const complete = scene.images >= scene.imagesWanted;
                  return (
                    <tr key={scene.sceneIndex} className="text-gray-700 dark:text-gray-300">
                      <td className="px-4 py-2 font-medium">#{scene.sceneIndex}</td>
                      <td className="px-4 py-2 tabular-nums">
                        {clock(scene.startMs)}–{clock(scene.startMs + scene.durationMs)}
                      </td>
                      <td className="px-4 py-2 text-end tabular-nums">{scene.shots}</td>
                      <td
                        className={cn(
                          "px-4 py-2 text-end tabular-nums",
                          complete
                            ? "text-green-600 dark:text-green-400"
                            : "text-amber-600 dark:text-amber-400",
                        )}
                      >
                        {scene.images}/{scene.imagesWanted}
                      </td>
                      <td className="px-4 py-2 text-end tabular-nums">{scene.subtitles}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
