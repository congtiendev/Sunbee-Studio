import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useTranslations } from "@/i18n";
import { ChevronLeftIcon, ChevronRightIcon } from "@/icons";
import { apiClient } from "@/lib/api-client";
import { pathParams } from "@/lib/paths";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import SaveButton from "@/pages/main/studio/save-button";
import ScrollButtons from "@/pages/main/studio/scroll-buttons";
import Stepper from "@/pages/main/studio/stepper";
import { VIDEO_STUDIO_STEPS } from "@/pages/main/studio/steps/registry";
import type { StepSaveHandle } from "@/pages/main/studio/steps/step-save";
import type { VideoStudioStepKey } from "@/pages/main/studio/types";

/**
 * The step-by-step pipeline for one video. Mount it with `key={videoId}` so
 * switching videos starts from the first step with fresh progress.
 */
export default function VideoWorkspace({ videoId }: { videoId: string }) {
  const t = useTranslations("videoStudio");

  // The open step lives in the URL (`&step=assets`), so a reload or the
  // browser's back/forward keeps it; an unknown or missing step means the first.
  const [searchParams, setSearchParams] = useSearchParams();
  const stepFromUrl = VIDEO_STUDIO_STEPS.findIndex(
    (step) => step.key === searchParams.get(pathParams.step),
  );
  const activeIndex = Math.max(stepFromUrl, 0);
  const setActiveIndex = (index: number) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set(pathParams.step, VIDEO_STUDIO_STEPS[index]!.key);
        return next;
      },
      { replace: true },
    );
  // Reopening on a later step counts the ones before it as passed.
  const [furthestIndex, setFurthestIndex] = useState(activeIndex);
  const [completedSteps, setCompletedSteps] = useState<
    ReadonlySet<VideoStudioStepKey>
  >(() => new Set());
  // The active step's own AI call in progress — switching away would abandon it.
  const [stepBusy, setStepBusy] = useState(false);
  // The active step's unsaved work, reported through `useStepSave`.
  const [saveHandle, setSaveHandle] = useState<StepSaveHandle | null>(null);
  const dirty = Boolean(saveHandle?.dirty);

  const steps = VIDEO_STUDIO_STEPS.map((step) => ({
    key: step.key,
    label: t(`steps.${step.key}`),
    hint: t(`steps.${step.key}Hint`),
    icon: step.icon,
  }));

  const activeStep = VIDEO_STUDIO_STEPS[activeIndex]!;
  const isLastStep = activeIndex === steps.length - 1;
  const canGoNext =
    !activeStep.requiresCompletion || completedSteps.has(activeStep.key);

  // Finished steps are saved on the video, so a reload doesn't lock "Next" again.
  useEffect(() => {
    let active = true;
    apiClient.videos
      .get(videoId)
      .then((video) => {
        const saved = (video.completedSteps ?? []).filter((key): key is VideoStudioStepKey =>
          VIDEO_STUDIO_STEPS.some((step) => step.key === key),
        );
        if (active && saved.length) setCompletedSteps((prev) => new Set([...prev, ...saved]));
      })
      .catch(() => {
        // Without it the steps still work; they just start unfinished.
      });
    return () => {
      active = false;
    };
  }, [videoId]);

  const markStepComplete = (key: VideoStudioStepKey) => {
    if (completedSteps.has(key)) return;
    const next = new Set(completedSteps).add(key);
    setCompletedSteps(next);
    void apiClient.videos.update(videoId, { completedSteps: [...next] }).catch(() => undefined);
  };

  const save = async () => {
    if (saveHandle?.dirty && !saveHandle.saving) await saveHandle.save();
  };

  // Ctrl/⌘+S saves the open step instead of the browser's "save page".
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (saveHandle?.dirty && !saveHandle.saving) void saveHandle.save();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [saveHandle]);

  // Reloading or closing the tab with unsaved work asks first.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  /** Leaving a step saves its pending work first, so switching never drops edits. */
  const switchTo = async (index: number) => {
    if (stepBusy || index === activeIndex) return;
    await save();
    setActiveIndex(index);
    setFurthestIndex((prev) => Math.max(prev, index));
  };

  // Any step can be opened straight from the stepper; a step without what it
  // needs (e.g. no analysis yet) says so itself. "Next" still waits for completion.
  const handleNext = () => {
    if (!canGoNext || isLastStep) return;
    void switchTo(activeIndex + 1);
  };

  const handleBack = () => {
    if (activeIndex === 0) return;
    void switchTo(activeIndex - 1);
  };

  const ActiveStepComponent = activeStep.Component;

  return (
    <>
      <Card className="relative mt-5 gap-0 pt-14 sm:pt-16">
        <div className="absolute inset-x-5 -top-[18px] z-10 sm:inset-x-6">
          <Stepper
            steps={steps}
            activeIndex={activeIndex}
            furthestIndex={furthestIndex}
            completedKeys={completedSteps}
            onStepClick={(index) => void switchTo(index)}
            disabled={stepBusy}
          />
        </div>

        <div className="min-w-0 border-t border-gray-100 pt-6 dark:border-gray-800">
          <ActiveStepComponent
            key={activeStep.key}
            videoId={videoId}
            onComplete={() => markStepComplete(activeStep.key)}
            onBusyChange={setStepBusy}
            onSaveChange={setSaveHandle}
          />
        </div>
      </Card>

      <div className="mt-6 flex items-center justify-between gap-3 border-t border-gray-100 pt-5 dark:border-gray-800">
        <Button
          type="button"
          variant="outline"
          onClick={handleBack}
          disabled={activeIndex === 0 || stepBusy}
          title={stepBusy ? t("navigation.busyHint") : undefined}
          className="gap-1.5"
        >
          <ChevronLeftIcon className="size-4 rtl:rotate-180" />
          {t("navigation.back")}
        </Button>

        <SaveButton
          handle={saveHandle}
          disabled={stepBusy}
          onSave={() => void save()}
        />

        {isLastStep ? (
          <span />
        ) : (
          <Button
            type="button"
            onClick={handleNext}
            disabled={!canGoNext || stepBusy}
            title={stepBusy ? t("navigation.busyHint") : undefined}
            className="gap-1.5"
          >
            {t("navigation.next")}
            <ChevronRightIcon className="size-4 rtl:rotate-180" />
          </Button>
        )}
      </div>

      <ScrollButtons
        save={
          dirty || saveHandle?.saving
            ? { saving: Boolean(saveHandle?.saving), onSave: () => void save() }
            : undefined
        }
      />
    </>
  );
}
