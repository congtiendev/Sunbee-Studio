import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";
import { ClockIcon } from "@/icons";
import { useTranslations } from "@/i18n";
import { useMemo, useState } from "react";
import VersionSheet from "@/pages/main/video-studio/version-sheet";
import type { StepComponentProps } from "../registry";
import AnalysisSettings from "./analysis-settings";
import { passageForFrame } from "./frame-passage";
import FramePreviewPanel from "./frame-preview";
import FramesStrip from "./frames-strip";
import ResourcesPanel from "./result/resources-panel";
import SaveSkillCard from "./result/save-skill-card";
import SceneEditor from "./result/scene-editor";
import ScriptChecklist, {
  computeScriptChecklist,
} from "./result/script-checklist";
import ScriptEditor, { type ScriptHighlight } from "./script-editor";
import { SCRIPT_SOURCES, type ScriptSourceKey } from "./sources/registry";
import { useScriptStep } from "./use-script-step";

const SECTION =
  "mt-6 space-y-3 border-t border-gray-100 pt-6 dark:border-gray-800";

/** Step 1 — build the script: pick a source, edit the text, analyze it into scenes. */
export default function ScriptStep({
  videoId,
  onComplete,
}: StepComponentProps) {
  const t = useTranslations("videoStudio.script");
  const step = useScriptStep(videoId, onComplete);
  const [versionSheetOpen, setVersionSheetOpen] = useState(false);
  const [frameFocus, setFrameFocus] = useState<{
    framesCount: number;
    text: string;
    index: number;
    nonce: number;
  } | null>(null);

  // A clicked frame stays selected only while the script text it was matched
  // against is unchanged and its index is still in range (not a stale
  // selection from a since-replaced frame list).
  const activeFrame =
    frameFocus &&
    frameFocus.text === step.scriptText &&
    frameFocus.index < step.frames.length
      ? frameFocus
      : null;
  const highlight = useMemo<ScriptHighlight | null>(() => {
    if (!activeFrame) return null;
    const range = passageForFrame(
      activeFrame.text,
      activeFrame.index,
      activeFrame.framesCount,
    );
    return range ? { ...range, nonce: activeFrame.nonce } : null;
  }, [activeFrame]);

  const selectFrame = (index: number) =>
    setFrameFocus((prev) => ({
      framesCount: step.frames.length,
      text: step.scriptText,
      index,
      nonce: (prev?.nonce ?? 0) + 1,
    }));
  const passageOf = (index: number) => {
    const range = passageForFrame(step.scriptText, index, step.frames.length);
    return range ? step.scriptText.slice(range.start, range.end) : null;
  };

  const previewIndex = activeFrame?.index ?? null;
  const previewFrame = previewIndex !== null ? (step.frames[previewIndex] ?? null) : null;
  const navigatePreview = (delta: number) => {
    if (previewIndex === null) return;
    const next = Math.min(
      step.frames.length - 1,
      Math.max(0, previewIndex + delta),
    );
    selectFrame(next);
  };

  const source =
    SCRIPT_SOURCES.find((s) => s.key === step.mode) ?? SCRIPT_SOURCES[0]!;
  const SourcePanel = source.Panel;
  const checklist = step.result ? computeScriptChecklist(step.result) : null;

  return (
    <div className="min-w-0">
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <CardTitle>{t("sourceTitle")}</CardTitle>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setVersionSheetOpen(true)}
          >
            <ClockIcon className="size-4" />
            {t("history.openButton")}
          </Button>
        </div>
        <VersionSheet
          open={versionSheetOpen}
          onOpenChange={setVersionSheetOpen}
          videoId={videoId}
          currentVersionId={step.currentVersionId}
          onSelect={step.loadVersion}
        />

        <RadioGroup
          value={step.mode}
          onValueChange={(value) => step.setMode(value as ScriptSourceKey)}
          className="flex flex-wrap items-center gap-6"
        >
          {SCRIPT_SOURCES.map((s) => (
            <Field
              key={s.key}
              orientation="horizontal"
              className="w-auto gap-2.5"
            >
              <RadioGroupItem id={`script-source-${s.key}`} value={s.key} />
              <Label
                htmlFor={`script-source-${s.key}`}
                className="cursor-pointer"
              >
                {t(s.labelKey)}
              </Label>
            </Field>
          ))}
        </RadioGroup>

        {SourcePanel && <SourcePanel step={step} />}

        <div className="flex h-[30rem] items-stretch overflow-hidden rounded-xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.02]">
          <ScriptEditor
            step={step}
            showResultHint={source.producesScript}
            highlight={highlight}
            className="min-w-0 flex-1"
          />
          <FramePreviewPanel
            open={activeFrame !== null}
            onOpenChange={(open) => !open && setFrameFocus(null)}
            frame={previewFrame}
            index={previewIndex}
            total={step.frames.length}
            passage={previewIndex !== null ? passageOf(previewIndex) : null}
            onNavigate={navigatePreview}
          />
        </div>

        {step.noSpeechHint && (
          <Alert variant={step.aiDescribed ? "info" : "warning"}>
            <AlertDescription>
              {t(step.aiDescribed ? "noSpeechAiDescribedHint" : "noSpeechHint")}
            </AlertDescription>
          </Alert>
        )}

        <FramesStrip
          frames={step.frames}
          activeIndex={activeFrame?.index ?? null}
          onSelect={selectFrame}
        />

        <AnalysisSettings step={step} />

        {step.error && (
          <Alert variant="destructive">
            <AlertDescription>{step.error}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            onClick={() => void step.analyze()}
            disabled={
              (!step.scriptText && step.frames.length === 0) ||
              step.analyzing
            }
          >
            {step.analyzing && <Spinner />}
            {t("analyzeButton")}
          </Button>

          {step.costEstimate && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {t("costEstimate", {
                amount: step.costEstimate.estimatedCostUsd.toFixed(4),
                confidence: t(`confidence.${step.costEstimate.confidence}`),
              })}
            </span>
          )}
        </div>
      </div>

      {step.result && (
        <>
          {checklist && (
            <div className={SECTION}>
              <CardTitle>{t("checklistTitle")}</CardTitle>
              <ScriptChecklist
                items={checklist}
                labels={{
                  hasScenes: t("checklist.hasScenes"),
                  sceneDurationSane: t("checklist.sceneDurationSane"),
                  resourcesFilled: t("checklist.resourcesFilled"),
                  scenesHaveAssets: t("checklist.scenesHaveAssets"),
                }}
              />
            </div>
          )}

          <div className={`${SECTION} space-y-4`}>
            <CardTitle>{t("scenesTitle")}</CardTitle>
            <SceneEditor
              key={step.resultKey}
              scenes={step.result.scenes}
              approved={step.approved}
              approving={step.approving}
              canApprove={Boolean(step.currentVersionId)}
              onApprove={step.approve}
            />
          </div>

          <div className={SECTION}>
            <CardTitle>{t("resourcesTitle")}</CardTitle>
            <ResourcesPanel resources={step.result.resources} />
          </div>

          <div className={`${SECTION} space-y-4`}>
            <CardTitle>{t("saveSkillTitle")}</CardTitle>
            <SaveSkillCard
              key={step.resultKey}
              result={step.result}
              exampleVersionId={
                step.approved ? (step.currentVersionId ?? undefined) : undefined
              }
              onSaved={() => void step.refreshTemplates()}
              onError={step.setError}
            />
          </div>
        </>
      )}
    </div>
  );
}
