import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress-bar";
import { Spinner } from "@/components/ui/spinner";
import { useLocale, useTranslations } from "@/i18n";
import { DownloadIcon, PlayIcon } from "@/icons";
import { formatDuration } from "@/pages/main/library/sound-effects/category-style";
import type { RenderProjectState } from "@/pages/main/video-render/use-render-project";
import { RENDER_DIMENSIONS } from "@shared/frame-ratio";

/** Preview of the latest MP4 (in the project's frame shape), the render button and progress, and earlier renders. */
export default function RenderPanel({ state }: { state: RenderProjectState }) {
  const t = useTranslations("videoRender.render");
  const locale = useLocale();
  const project = state.project!;
  const [latest, ...older] = state.renders;
  const { width, height } = RENDER_DIMENSIONS[project.frameRatio];
  const poster = project.scenes.find((scene) => scene.imageFileId)?.imageFileId;
  const percent = Math.floor(state.renderProgress * 100);

  return (
    <Card className="flex flex-col gap-4 p-4 sm:p-5">
      <CardTitle>{t("title")}</CardTitle>

      <div
        className="relative mx-auto flex max-h-[60vh] w-full items-center justify-center overflow-hidden rounded-xl bg-gray-900"
        style={{ aspectRatio: project.frameRatio.replace(":", " / "), maxWidth: project.frameRatio === "9:16" ? "18rem" : undefined }}
      >
        {latest && !state.rendering ? (
          <video key={latest.fileId} src={`/api/files/${latest.fileId}`} controls className="size-full bg-black object-contain" />
        ) : (
          <>
            {poster && <img src={`/api/files/${poster}`} alt="" className="absolute inset-0 size-full object-cover opacity-40" />}
            <div className="relative flex flex-col items-center gap-2 px-4 text-center text-white">
              {state.rendering ? (
                <>
                  <span className="text-3xl font-semibold tabular-nums">{percent}%</span>
                  <span className="text-xs text-white/70">{formatDuration(state.renderElapsedSec)}</span>
                </>
              ) : (
                <>
                  <span className="flex size-12 items-center justify-center rounded-full bg-white/15 backdrop-blur-sm">
                    <PlayIcon className="size-5 ms-0.5" />
                  </span>
                  <span className="text-xs text-white/80">{t("noRenderYet")}</span>
                </>
              )}
            </div>
          </>
        )}
      </div>

      {state.rendering && <Progress value={percent} />}

      <div className="flex flex-col gap-2">
        <Button
          className="w-full gap-1.5 rounded-full"
          size="lg"
          onClick={() => void state.render()}
          disabled={state.busy || !project.scenes.length}
        >
          {state.rendering ? <Spinner /> : <PlayIcon className="size-4" />}
          {state.rendering
            ? t("rendering", { percent, elapsed: formatDuration(state.renderElapsedSec) })
            : latest
              ? t("rerender")
              : t("button")}
        </Button>
        {latest && !state.rendering && (
          <a
            href={`/api/files/${latest.fileId}`}
            download
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-full border border-gray-300 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.04]"
          >
            <DownloadIcon className="size-4" />
            {t("download")}
          </a>
        )}
        <p className="text-xs text-gray-500 dark:text-gray-400">{state.rendering ? t("renderingHint") : t("hint")}</p>
      </div>

      <dl className="grid grid-cols-3 gap-2 rounded-xl bg-gray-50 p-3 text-center dark:bg-white/[0.03]">
        <div>
          <dt className="text-[11px] text-gray-500 dark:text-gray-400">{t("statDuration")}</dt>
          <dd className="text-sm font-semibold text-gray-800 tabular-nums dark:text-white/90">
            {formatDuration(state.totalSec)}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] text-gray-500 dark:text-gray-400">{t("statScenes")}</dt>
          <dd className="text-sm font-semibold text-gray-800 tabular-nums dark:text-white/90">{project.scenes.length}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-gray-500 dark:text-gray-400">{t("statResolution")}</dt>
          <dd className="text-sm font-semibold text-gray-800 tabular-nums dark:text-white/90">
            {width}×{height}
          </dd>
        </div>
      </dl>

      {older.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400">
            {t("history")}
          </p>
          <ul className="custom-scrollbar max-h-48 space-y-0.5 overflow-y-auto">
            {older.map((render) => (
              <li key={render.id}>
                <a
                  href={`/api/files/${render.fileId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/5"
                >
                  <PlayIcon className="size-3.5 shrink-0 text-gray-400" />
                  <span className="min-w-0 flex-1 truncate">{new Date(render.createdAt).toLocaleString(locale)}</span>
                  <span className="text-xs text-gray-400 tabular-nums dark:text-gray-500">
                    {formatDuration(render.durationMs / 1000)}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
