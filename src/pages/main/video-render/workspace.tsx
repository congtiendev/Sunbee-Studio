import { SkeletonPanel } from "@/components/shared/skeleton-blocks";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useTranslations } from "@/i18n";
import { ArrowLeftIcon, CheckIcon, ClockIcon, FloppyDiscIcon, LayerIcon } from "@/icons";
import { paths } from "@/lib/paths";
import { formatDuration } from "@/pages/main/library/sound-effects/category-style";
import { NowPlayingBar } from "@/pages/main/library/sound-effects/now-playing-bar";
import { PreviewPlayer, PreviewPlayerContext } from "@/pages/main/library/sound-effects/preview-player";
import AudioPanel from "@/pages/main/video-render/audio-panel";
import ContentPanel from "@/pages/main/video-render/content-panel";
import RenderPanel from "@/pages/main/video-render/render-panel";
import ScenesPanel from "@/pages/main/video-render/scenes-panel";
import { useRenderProject, type RenderProjectState } from "@/pages/main/video-render/use-render-project";
import { cn } from "@/utils";
import { FRAME_RATIOS, isFrameRatio } from "@shared/frame-ratio";
import { useEffect, useState } from "react";
import { Link } from "react-router";

type Step = "script" | "scenes" | "audio";

/** Name, length, frame shape and save state — the project's top bar. */
function ProjectHeader({ state }: { state: RenderProjectState }) {
  const t = useTranslations("videoRender");
  const project = state.project!;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border border-gray-200 bg-white p-3 sm:p-4 dark:border-gray-800 dark:bg-white/[0.03]">
      <Link
        to={paths.videoRender}
        aria-label={t("backToList")}
        title={t("backToList")}
        className="flex size-10 shrink-0 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-white"
      >
        <ArrowLeftIcon className="size-5 rtl:rotate-180" />
      </Link>

      <div className="min-w-0 flex-1 basis-60">
        <input
          aria-label={t("nameLabel")}
          value={project.name}
          disabled={state.busy}
          onChange={(e) => state.patch({ name: e.target.value })}
          className="w-full truncate rounded-lg border border-transparent bg-transparent px-2 py-1 text-lg font-semibold text-gray-800 outline-hidden transition-colors hover:border-gray-200 focus:border-brand-300 focus:ring-3 focus:ring-brand-500/20 disabled:opacity-70 dark:text-white/90 dark:hover:border-gray-700 dark:focus:border-brand-500/40"
        />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2 text-xs text-gray-500 dark:text-gray-400">
          <span className="inline-flex items-center gap-1">
            <LayerIcon className="size-3.5" />
            {t("sceneCount", { count: project.scenes.length })}
          </span>
          <span className="inline-flex items-center gap-1">
            <ClockIcon className="size-3.5" />
            {formatDuration(state.totalSec)}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className={cn("size-1.5 rounded-full", state.dirty ? "bg-amber-500" : "bg-green-500")} />
            {state.dirty ? t("unsaved") : t("saved")}
          </span>
        </div>
      </div>

      <ToggleGroup
        variant="outline"
        size="sm"
        aria-label={t("content.frameRatioLabel")}
        value={[project.frameRatio]}
        disabled={state.busy}
        onValueChange={(value) => {
          const next = value[0];
          if (isFrameRatio(next)) state.patch({ frameRatio: next });
        }}
      >
        {FRAME_RATIOS.map((ratio) => (
          <ToggleGroupItem key={ratio} value={ratio} className="px-2.5 font-jetbrains-mono text-xs">
            {ratio}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <Button
        className="gap-1.5 rounded-full"
        variant={state.dirty ? "default" : "outline"}
        onClick={() => void state.save()}
        disabled={!state.dirty || state.busy || !project.name.trim()}
      >
        {state.saving ? <Spinner /> : <FloppyDiscIcon className="size-4" />}
        {state.saving ? t("saving") : t("save")}
      </Button>
    </div>
  );
}

/** Script → Scenes → Audio, each with a one-line status, like a wizard you can jump around in. */
function StepNav({ state, value, onChange }: { state: RenderProjectState; value: Step; onChange: (step: Step) => void }) {
  const t = useTranslations("videoRender.steps");
  const project = state.project!;
  const steps: { key: Step; done: boolean; warn?: boolean; status: string }[] = [
    {
      key: "script",
      done: project.scriptText.trim().length > 0,
      status: project.scriptText.trim()
        ? t("scriptChars", { count: project.scriptText.trim().length })
        : t("scriptEmpty"),
    },
    {
      key: "scenes",
      done: project.scenes.length > 0 && state.missingImages === 0,
      warn: state.missingImages > 0,
      status:
        project.scenes.length === 0
          ? t("scenesEmpty")
          : state.missingImages > 0
            ? t("scenesMissing", { count: state.missingImages })
            : t("scenesReady", { count: project.scenes.length }),
    },
    {
      key: "audio",
      done: project.audio.length > 0,
      status: project.audio.length > 0 ? t("audioCount", { count: project.audio.length }) : t("audioOptional"),
    },
  ];

  return (
    <nav className="grid grid-cols-3 gap-1.5 rounded-2xl border border-gray-200 bg-white p-1.5 dark:border-gray-800 dark:bg-white/[0.03]">
      {steps.map((step, index) => {
        const active = step.key === value;
        return (
          <button
            key={step.key}
            type="button"
            aria-current={active ? "step" : undefined}
            onClick={() => onChange(step.key)}
            className={cn(
              "flex min-w-0 cursor-pointer flex-col items-center gap-1.5 rounded-xl px-2 py-2.5 text-center transition-colors sm:flex-row sm:gap-3 sm:px-3 sm:text-start",
              active ? "bg-gray-100 dark:bg-white/[0.07]" : "hover:bg-gray-50 dark:hover:bg-white/[0.03]",
            )}
          >
            <span
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                step.done
                  ? "bg-green-500 text-white"
                  : active
                    ? "bg-brand-500 text-white"
                    : "bg-gray-200 text-gray-600 dark:bg-white/10 dark:text-gray-300",
              )}
            >
              {step.done ? <CheckIcon className="size-4" /> : index + 1}
            </span>
            <span className="w-full min-w-0 sm:w-auto">
              <span
                className={cn(
                  "block truncate text-xs font-medium sm:text-sm",
                  active ? "text-gray-900 dark:text-white" : "text-gray-700 dark:text-gray-300",
                )}
              >
                {t(step.key)}
              </span>
              <span
                className={cn(
                  "hidden truncate text-xs sm:block",
                  step.warn ? "text-amber-600 dark:text-amber-400" : "text-gray-500 dark:text-gray-400",
                )}
              >
                {step.status}
              </span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}

/** One render project — mounted with `key={projectId}`. */
export default function RenderProjectWorkspace({ projectId }: { projectId: string }) {
  const t = useTranslations("videoRender");
  const state = useRenderProject(projectId);
  const { project } = state;
  const [step, setStep] = useState<Step | null>(null);
  const [player] = useState(() => new PreviewPlayer());
  useEffect(() => () => player.dispose(), [player]);

  if (state.loading) return <SkeletonPanel />;
  if (!project) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{state.error ?? t("notFound")}</AlertDescription>
      </Alert>
    );
  }

  // A project that already has scenes opens on them; a new one starts with its script.
  const activeStep: Step = step ?? (project.scenes.length > 0 ? "scenes" : "script");
  const goTo = (next: Step) => {
    player.stop();
    setStep(next);
  };

  return (
    <PreviewPlayerContext.Provider value={player}>
      <div className="flex flex-col gap-5">
        <ProjectHeader state={state} />

        {state.error && (
          <Alert variant="destructive">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}

        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_22rem] 2xl:grid-cols-[minmax(0,1fr)_26rem]">
          <div className="flex min-w-0 flex-col gap-5">
            <StepNav state={state} value={activeStep} onChange={goTo} />
            {activeStep === "script" && <ContentPanel state={state} onSplitDone={() => goTo("scenes")} />}
            {activeStep === "scenes" && <ScenesPanel state={state} onEditScript={() => goTo("script")} />}
            {activeStep === "audio" && <AudioPanel state={state} />}
          </div>
          <aside className="xl:sticky xl:top-24">
            <RenderPanel state={state} />
          </aside>
        </div>

        <NowPlayingBar />
      </div>
    </PreviewPlayerContext.Provider>
  );
}
