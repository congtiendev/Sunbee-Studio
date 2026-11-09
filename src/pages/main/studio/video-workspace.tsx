import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useTranslations } from "@/i18n";
import { ChevronLeftIcon, ChevronRightIcon } from "@/icons";
import { useState } from "react";
import Stepper from "@/pages/main/studio/stepper";
import { VIDEO_STUDIO_STEPS } from "@/pages/main/studio/steps/registry";
import type { VideoStudioStepKey } from "@/pages/main/studio/types";

/**
 * The step-by-step pipeline for one video. Mount it with `key={videoId}` so
 * switching videos starts from the first step with fresh progress.
 */
export default function VideoWorkspace({ videoId }: { videoId: string }) {
  const t = useTranslations("videoStudio");

  const [activeIndex, setActiveIndex] = useState(0);
  const [furthestIndex, setFurthestIndex] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<
    ReadonlySet<VideoStudioStepKey>
  >(() => new Set());

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

  const markStepComplete = (key: VideoStudioStepKey) =>
    setCompletedSteps((prev) =>
      prev.has(key) ? prev : new Set(prev).add(key),
    );

  const goToStep = (index: number) => {
    if (index <= furthestIndex) setActiveIndex(index);
  };

  const handleNext = () => {
    if (!canGoNext || isLastStep) return;
    const nextIndex = activeIndex + 1;
    setActiveIndex(nextIndex);
    setFurthestIndex((prev) => Math.max(prev, nextIndex));
  };

  const handleBack = () => {
    if (activeIndex > 0) setActiveIndex(activeIndex - 1);
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
            onStepClick={goToStep}
          />
        </div>

        <div className="min-w-0 border-t border-gray-100 pt-6 dark:border-gray-800">
          <ActiveStepComponent
            key={activeStep.key}
            videoId={videoId}
            onComplete={() => markStepComplete(activeStep.key)}
          />
        </div>
      </Card>

      <div className="mt-6 flex items-center justify-between border-t border-gray-100 pt-5 dark:border-gray-800">
        <Button
          type="button"
          variant="outline"
          onClick={handleBack}
          disabled={activeIndex === 0}
          className="gap-1.5"
        >
          <ChevronLeftIcon className="size-4 rtl:rotate-180" />
          {t("navigation.back")}
        </Button>

        {!isLastStep && (
          <Button
            type="button"
            onClick={handleNext}
            disabled={!canGoNext}
            className="gap-1.5"
          >
            {t("navigation.next")}
            <ChevronRightIcon className="size-4 rtl:rotate-180" />
          </Button>
        )}
      </div>
    </>
  );
}
