import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { NameDialog } from "@/components/shared/name-dialog";
import { PageBreadcrumb } from "@/components/shared/page-breadcrumb";
import { PageMeta } from "@/components/shared/page-meta";
import { SkeletonPanel } from "@/components/shared/skeleton-blocks";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useLocale, useTranslations } from "@/i18n";
import { ClockIcon, LayerIcon, PlayIcon, PlusIcon, TrashBinIcon } from "@/icons";
import { apiClient } from "@/lib/api-client";
import { pathParams, paths, videoRenderUrl } from "@/lib/paths";
import type { RenderProjectSummary } from "@shared/types";
import { formatDuration } from "@/pages/main/library/sound-effects/category-style";
import RenderProjectWorkspace from "@/pages/main/video-render/workspace";
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";

/**
 * Video render: a self-contained video maker, separate from the Video Studio
 * — its own projects, each with its own script, AI scenes, images and audio,
 * rendered to MP4.
 */
export default function VideoRenderPage() {
  const t = useTranslations("videoRender");
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get(pathParams.renderProjectId);

  return (
    <div>
      <PageMeta title={t("title")} description={t("metaDescription")} />
      <PageBreadcrumb
        pageTitle={t("title")}
        trail={projectId ? [{ label: t("title"), to: paths.videoRender }] : []}
      />

      {projectId ? (
        <RenderProjectWorkspace key={projectId} projectId={projectId} />
      ) : (
        <ProjectList />
      )}
    </div>
  );
}

function ProjectList() {
  const t = useTranslations("videoRender");
  const locale = useLocale();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<RenderProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<RenderProjectSummary | null>(null);

  useEffect(() => {
    let active = true;
    apiClient.videoRender
      .list()
      .then((list) => active && setProjects(list))
      .catch((err) => active && setError(err instanceof Error ? err.message : String(err)));
    return () => {
      active = false;
    };
  }, []);

  return (
    <>
      <div className="mb-5 flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-5 sm:flex-row sm:items-center dark:border-gray-800 dark:bg-white/[0.03]">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br from-brand-400 to-brand-600 text-white shadow-theme-xs">
          <PlayIcon className="size-5 ms-0.5" />
        </span>
        <p className="min-w-0 flex-1 text-sm text-gray-600 dark:text-gray-400">{t("intro")}</p>
        <Button className="gap-1.5 rounded-full" onClick={() => setCreating(true)}>
          <PlusIcon className="size-4" />
          {t("newProject")}
        </Button>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!projects ? (
        !error && <SkeletonPanel />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex min-h-48 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-gray-300 text-sm font-medium text-gray-500 transition-colors hover:border-brand-300 hover:text-brand-500 dark:border-gray-700 dark:text-gray-400 dark:hover:border-brand-500/40 dark:hover:text-brand-400"
          >
            <span className="flex size-10 items-center justify-center rounded-full bg-gray-100 dark:bg-white/[0.06]">
              <PlusIcon className="size-5" />
            </span>
            {projects.length === 0 ? t("noProjects") : t("newProject")}
          </button>
          {projects.map((project) => (
            <div
              key={project.id}
              className="group relative flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white transition-shadow hover:shadow-theme-md dark:border-gray-800 dark:bg-white/[0.03]"
            >
              <Link to={videoRenderUrl(project.id)} className="flex flex-1 flex-col">
                <div className="relative flex aspect-video items-center justify-center bg-linear-to-br from-gray-800 to-gray-950">
                  <span
                    className="border-2 border-white/40 bg-white/5"
                    style={{
                      aspectRatio: project.frameRatio.replace(":", " / "),
                      height: project.frameRatio === "16:9" || project.frameRatio === "4:3" ? "45%" : "62%",
                    }}
                  />
                  <span className="absolute flex size-10 items-center justify-center rounded-full bg-white/15 text-white opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">
                    <PlayIcon className="size-4 ms-0.5" />
                  </span>
                  <span className="absolute start-3 top-3 rounded-md bg-black/50 px-1.5 py-0.5 font-jetbrains-mono text-[11px] text-white">
                    {project.frameRatio}
                  </span>
                </div>
                <div className="flex flex-col gap-1.5 p-4">
                  <span className="truncate font-semibold text-gray-800 group-hover:text-brand-500 dark:text-white/90 dark:group-hover:text-brand-400">
                    {project.name}
                  </span>
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                    <span className="inline-flex items-center gap-1">
                      <LayerIcon className="size-3.5" />
                      {t("sceneCount", { count: project.sceneCount })}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <ClockIcon className="size-3.5" />
                      {formatDuration(project.durationSec)}
                    </span>
                  </span>
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    {new Date(project.updatedAt).toLocaleString(locale)}
                    {project.ownerEmail && ` · ${project.ownerEmail}`}
                  </span>
                </div>
              </Link>
              <button
                type="button"
                aria-label={t("deleteProject")}
                title={t("deleteProject")}
                onClick={() => setDeleting(project)}
                className="absolute end-3 top-3 flex size-8 cursor-pointer items-center justify-center rounded-full bg-black/50 text-white/80 opacity-0 backdrop-blur-sm transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-red-500 hover:text-white"
              >
                <TrashBinIcon className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <NameDialog
        open={creating}
        onOpenChange={setCreating}
        title={t("newProject")}
        placeholder={t("namePlaceholder")}
        submitLabel={t("create")}
        onSubmit={async (name) => {
          const project = await apiClient.videoRender.create(name);
          void navigate(videoRenderUrl(project.id));
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t("deleteConfirmTitle", { name: deleting?.name ?? "" })}
        description={t("deleteConfirmDescription")}
        onConfirm={async () => {
          if (!deleting) return;
          await apiClient.videoRender.delete(deleting.id);
          setProjects((list) => list?.filter((p) => p.id !== deleting.id) ?? null);
          setDeleting(null);
        }}
      />
    </>
  );
}
