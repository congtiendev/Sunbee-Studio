import { PageBreadcrumb } from "@/components/shared/page-breadcrumb";
import { PageMeta } from "@/components/shared/page-meta";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { useTranslations } from "@/i18n";
import { BrainIcon, CheckIcon } from "@/icons";
import { paths } from "@/lib/paths";
import { useEffect, useRef } from "react";
import { Link } from "react-router";
import ProviderModelFields from "@/pages/main/studio/steps/script/provider-model-fields";
import GuidePreview from "./guide-preview";
import SourcePicker from "./source-picker";
import {
  useTraining,
  type TrainingEffort,
  type TrainingState,
  type TrainingTarget,
} from "./use-training";
import VersionHistory from "./version-history";

/**
 * AI training: the AI reads many videos and documents and writes a complete
 * skill (voice, structure, visual style, knowledge). Every run is a version.
 */
export default function TrainingPage() {
  const t = useTranslations("training");
  const tNav = useTranslations("sidebar.items");
  const state = useTraining();

  return (
    <div>
      <PageMeta title={t("title")} description={t("metaDescription")} />
      <PageBreadcrumb
        pageTitle={t("title")}
        trail={[{ label: tNav("skills"), to: paths.librarySkills }]}
      />

      <div className="mb-5 flex items-start gap-3 rounded-2xl border border-brand-100 bg-brand-50/50 p-4 text-sm text-gray-700 dark:border-brand-500/20 dark:bg-brand-500/5 dark:text-gray-300">
        <BrainIcon className="mt-0.5 size-5 shrink-0 text-brand-500 dark:text-brand-400" />
        <p>{t("intro")}</p>
      </div>

      {state.loadError && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{state.loadError}</AlertDescription>
        </Alert>
      )}

      {!state.skills || !state.sourceLists ? (
        !state.loadError && (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        )
      ) : (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
          <div className="min-w-0 space-y-5 xl:col-span-2">
            <TargetCard state={state} />
            <SourcesCard state={state} />
            <RunCard state={state} />
            {state.result && <ResultCard state={state} />}
          </div>

          <Card className="h-fit min-w-0 gap-4 p-5 xl:sticky xl:top-24">
            <CardTitle>{t("versions.title")}</CardTitle>
            {state.target === "existing" && state.skillId ? (
              <VersionHistory
                versions={state.versions}
                onRestore={state.restore}
              />
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t("versions.newSkillHint")}
              </p>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

type Props = { state: TrainingState };

function TargetCard({ state }: Props) {
  const t = useTranslations("training.target");
  const skills = state.skills ?? [];

  return (
    <Card className="gap-4 p-5">
      <CardTitle>{t("title")}</CardTitle>
      <RadioGroup
        value={state.target}
        onValueChange={(value) => state.chooseTarget(value as TrainingTarget)}
        className="flex flex-wrap gap-6"
      >
        {(["new", "existing"] as const).map((value) => (
          <Field
            key={value}
            orientation="horizontal"
            className="w-auto gap-2.5"
          >
            <RadioGroupItem id={`training-target-${value}`} value={value} />
            <Label
              htmlFor={`training-target-${value}`}
              className="cursor-pointer"
            >
              {t(value)}
            </Label>
          </Field>
        ))}
      </RadioGroup>

      {state.target === "new" ? (
        <Input
          value={state.name}
          onChange={(e) => state.setName(e.target.value)}
          placeholder={t("namePlaceholder")}
        />
      ) : skills.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {t("noSkills")}
        </p>
      ) : (
        <>
          <Select
            value={state.skillId ?? undefined}
            onValueChange={(value) => state.chooseSkill(value as string)}
          >
            <SelectTrigger className="w-full sm:w-96">
              <SelectValue placeholder={t("pickSkill")}>
                {() => state.currentSkill?.name ?? t("pickSkill")}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {skills.map((skill) => (
                <SelectItem key={skill.id} value={skill.id}>
                  {skill.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {t("refineHint")}
          </p>
        </>
      )}
    </Card>
  );
}

function SourcesCard({ state }: Props) {
  const t = useTranslations("training.sources");
  const refining = state.target === "existing" && Boolean(state.skillId);

  return (
    <Card className="gap-5 p-5">
      <div className="space-y-1">
        <CardTitle>{t("title")}</CardTitle>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {refining ? t("refineHint") : t("hint")}
        </p>
      </div>
      {refining && <LearnedSources state={state} />}
      {refining && (
        <p className="-mb-2 text-sm font-medium text-gray-800 dark:text-white/90">
          {t("addNew")}
        </p>
      )}
      {(state.sourceLists ?? []).map((list) => (
        <SourcePicker
          key={list.kind}
          list={list}
          selected={state.selection[list.kind] ?? []}
          onChange={(ids) => state.setKindSelection(list.kind, ids)}
          ai={{ provider: state.provider, model: state.model }}
          onAdded={state.addCandidate}
          learnedIds={state.learnedIdsOf(list.kind)}
        />
      ))}
    </Card>
  );
}

/** What the skill already learned from: always merged again, each one can be dropped. */
function LearnedSources({ state }: Props) {
  const t = useTranslations("training.sources.learned");
  const tKinds = useTranslations("training.sources");

  if (state.versions === null) {
    return (
      <div className="flex justify-center py-2">
        <Spinner />
      </div>
    );
  }

  return (
    <section className="space-y-2 rounded-xl border border-green-200 bg-green-50/50 p-3 dark:border-green-500/20 dark:bg-green-500/5">
      <p className="text-sm font-medium text-gray-800 dark:text-white/90">
        {t("title", { count: state.counts.learnedKept })}
      </p>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        {state.learned.length === 0 ? t("none") : t("hint")}
      </p>
      {state.learned.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {state.learned.map((source) => {
            const removed = state.isRemoved(source);
            return (
              <li
                key={`${source.kind}-${source.id}`}
                className="max-w-full min-w-0"
              >
                <button
                  type="button"
                  onClick={() => state.toggleRemoved(source)}
                  title={removed ? t("restore") : t("remove")}
                  className={
                    removed
                      ? "flex max-w-full items-center gap-1.5 rounded-full border border-dashed border-gray-300 px-2.5 py-1 text-xs text-gray-400 line-through dark:border-gray-700 dark:text-gray-500"
                      : "flex max-w-full items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2.5 py-1 text-xs text-gray-700 hover:border-red-300 hover:text-red-600 dark:border-gray-700 dark:bg-white/[0.03] dark:text-gray-300 dark:hover:border-red-500/40 dark:hover:text-red-400"
                  }
                >
                  <span className="shrink-0 text-gray-400 dark:text-gray-500">
                    {tKinds(`${source.kind}.title`, {
                      defaultValue: source.kind,
                    })}
                  </span>
                  <span className="truncate">
                    {source.label ?? t("deleted")}
                  </span>
                  <span aria-hidden="true" className="shrink-0 no-underline">
                    {removed ? "↺" : "×"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function RunCard({ state }: Props) {
  const t = useTranslations("training.run");
  const tScript = useTranslations("videoStudio.script");
  const effortLabels: Record<TrainingEffort, string> = {
    low: tScript("effortLow"),
    medium: tScript("effortMedium"),
    high: tScript("effortHigh"),
  };
  const { newScripts, newDocuments, learnedKept, learnedScripts } =
    state.counts;
  const refining = state.target === "existing";
  const added = newScripts + newDocuments;
  const nothing = refining ? added + learnedKept === 0 : added === 0;
  const scripts = newScripts + (refining ? learnedScripts : 0);
  const fewScripts = scripts > 0 && scripts < 3;

  return (
    <Card className="gap-4 p-5">
      <CardTitle>{t("title")}</CardTitle>

      <div className="flex flex-wrap items-end gap-4">
        <ProviderModelFields
          providerLabel={t("providerLabel")}
          provider={state.provider}
          onProviderChange={state.changeProvider}
          model={state.model}
          onModelChange={state.setModel}
          availableProviders={state.availableProviders}
        />
        <Field className="w-40">
          <FieldLabel>{tScript("effortLabel")}</FieldLabel>
          <Select
            value={state.effort}
            onValueChange={(value) => state.setEffort(value as TrainingEffort)}
          >
            <SelectTrigger>
              <SelectValue>{() => effortLabels[state.effort]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {(["low", "medium", "high"] as const).map((value) => (
                <SelectItem key={value} value={value}>
                  {effortLabels[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <Field>
        <FieldLabel>{t("noteLabel")}</FieldLabel>
        <Input
          value={state.note}
          onChange={(e) => state.setNote(e.target.value)}
          placeholder={t("notePlaceholder")}
        />
      </Field>

      {newDocuments > 0 && (
        <Field orientation="horizontal" className="items-center gap-2.5">
          <Checkbox
            checked={state.attachToSkill}
            onCheckedChange={(value) => state.setAttachToSkill(Boolean(value))}
          />
          <FieldLabel className="font-normal">{t("attach")}</FieldLabel>
        </Field>
      )}

      {state.runError && (
        <Alert variant="destructive">
          <AlertDescription>{state.runError}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          onClick={() => void state.run()}
          disabled={!state.canRun}
        >
          {state.training ? <Spinner /> : <BrainIcon className="size-4" />}
          {state.training
            ? t("training")
            : refining
              ? t("submitRefine")
              : t("submit")}
        </Button>
        <span
          className={
            nothing
              ? "text-xs text-gray-500 dark:text-gray-400"
              : fewScripts
                ? "text-xs text-amber-600 dark:text-amber-400"
                : "text-xs text-green-600 dark:text-green-400"
          }
        >
          {refining && !state.skillId
            ? t("needsSkill")
            : nothing
              ? t("needsSource")
              : (refining
                  ? t("summaryRefine", { learned: learnedKept, added }) +
                    (added === 0 ? ` ${t("resynthesize")}` : "")
                  : t("summary", {
                      videos: newScripts,
                      documents: newDocuments,
                    })) + (fewScripts ? ` ${t("fewVideos")}` : "")}
        </span>
      </div>
    </Card>
  );
}

function ResultCard({ state }: Props) {
  const t = useTranslations("training.result");
  const result = state.result!;
  const isNew = result.version.version === 1;
  const ref = useRef<HTMLDivElement>(null);

  // The result appears below the form: bring it into view when a run finishes.
  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [result.version.id]);

  return (
    <Card
      ref={ref}
      className="scroll-mt-24 gap-4 border-green-200 p-5 dark:border-green-500/30"
    >
      <div className="flex items-start gap-2">
        <CheckIcon className="mt-0.5 size-5 shrink-0 text-green-600 dark:text-green-400" />
        <div className="space-y-1">
          <CardTitle>
            {t(isNew ? "createdTitle" : "trainedTitle", {
              name: result.skill.name,
              version: result.version.version,
            })}
          </CardTitle>
          {result.skill.description && (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {result.skill.description}
            </p>
          )}
        </div>
      </div>
      {result.skill.styleTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {result.skill.styleTags.map((tag) => (
            <Badge key={tag} variant="light" color="gray" size="sm">
              {tag}
            </Badge>
          ))}
        </div>
      )}
      <GuidePreview text={result.skill.instructions ?? ""} />
      <div className="flex flex-wrap items-center gap-3">
        <p className="me-auto text-xs text-gray-500 dark:text-gray-400">
          {t("useHint")}
        </p>
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link to={paths.librarySkills} />}
        >
          {t("openSkills")}
        </Button>
      </div>
    </Card>
  );
}
