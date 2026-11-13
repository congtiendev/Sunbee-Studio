import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { useTranslations } from "@/i18n";
import { PencilIcon, PlusIcon } from "@/icons";
import { formatDuration } from "@/pages/main/library/sound-effects/category-style";
import SceneRow from "@/pages/main/video-render/scene-row";
import type { RenderProjectState } from "@/pages/main/video-render/use-render-project";
import { cn } from "@/utils";
import type { RenderScene } from "@shared/types";

/** Every scene as a strip sized by its duration — a glance at pacing and missing pictures; click to jump to a scene. */
function SceneTimeline({ scenes, totalSec }: { scenes: RenderScene[]; totalSec: number }) {
  const t = useTranslations("videoRender");

  return (
    <div>
      <div className="flex h-14 gap-1">
        {scenes.map((scene, index) => {
          const missing = !scene.imageFileId && scene.shotKind !== "titleCard";
          return (
            <button
              // Scenes have no ids; position is their identity.
              key={index}
              type="button"
              title={`${t("scene", { index: index + 1 })} · ${scene.durationSec}s`}
              onClick={() =>
                document.getElementById(`render-scene-${index}`)?.scrollIntoView({ behavior: "smooth", block: "center" })
              }
              style={{ flexGrow: Math.max(scene.durationSec, 0.5), flexBasis: 0 }}
              className={cn(
                "relative min-w-5 cursor-pointer overflow-hidden rounded-md transition-[filter] hover:brightness-110",
                missing
                  ? "bg-amber-100 ring-1 ring-amber-300 ring-inset dark:bg-amber-500/15 dark:ring-amber-500/40"
                  : "bg-gray-200 dark:bg-gray-800",
              )}
            >
              {scene.imageFileId && (
                <img
                  src={`/api/files/${scene.imageFileId}`}
                  alt=""
                  loading="lazy"
                  className="absolute inset-0 size-full object-cover"
                />
              )}
              <span className="absolute start-1 bottom-1 rounded bg-black/60 px-1 text-[10px] leading-4 font-medium text-white tabular-nums">
                {index + 1}
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-gray-400 tabular-nums dark:text-gray-500">
        <span>0:00</span>
        <span>{formatDuration(totalSec)}</span>
      </div>
    </div>
  );
}

/** Step 2: the storyboard — a timeline strip, then one editable card per scene. */
export default function ScenesPanel({ state, onEditScript }: { state: RenderProjectState; onEditScript: () => void }) {
  const t = useTranslations("videoRender");
  const project = state.project!;

  return (
    <Card className="flex flex-col gap-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <CardTitle>{t("scenesTitle")}</CardTitle>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t("scenesHint")}</p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5 rounded-full" onClick={state.addScene} disabled={state.busy}>
          <PlusIcon className="size-4" />
          {t("addScene")}
        </Button>
      </div>

      {project.scenes.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-gray-300 px-6 py-12 text-center dark:border-gray-700">
          <p className="max-w-md text-sm text-gray-500 dark:text-gray-400">{t("noScenes")}</p>
          <Button className="gap-1.5 rounded-full" onClick={onEditScript}>
            <PencilIcon className="size-4" />
            {t("goToScript")}
          </Button>
        </div>
      ) : (
        <>
          <SceneTimeline scenes={project.scenes} totalSec={state.totalSec} />

          {state.missingImages > 0 && (
            <Alert variant="warning">
              <AlertDescription>{t("missingImages", { count: state.missingImages })}</AlertDescription>
            </Alert>
          )}

          <div className="flex flex-col gap-3">
            {project.scenes.map((scene, index) => (
              <SceneRow
                // Scenes have no ids; position is their identity (re-keyed when moved, which is fine here).
                key={index}
                index={index}
                scene={scene}
                frameRatio={project.frameRatio}
                isFirst={index === 0}
                isLast={index === project.scenes.length - 1}
                disabled={state.busy}
                onChange={(changes) => state.updateScene(index, changes)}
                onMove={(offset) => state.moveScene(index, offset)}
                onRemove={() => state.removeScene(index)}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={state.addScene}
            disabled={state.busy}
            className="flex cursor-pointer items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-gray-200 py-4 text-sm font-medium text-gray-500 transition-colors hover:border-brand-300 hover:text-brand-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-800 dark:text-gray-400 dark:hover:border-brand-500/40 dark:hover:text-brand-400"
          >
            <PlusIcon className="size-4" />
            {t("addScene")}
          </button>
        </>
      )}
    </Card>
  );
}
