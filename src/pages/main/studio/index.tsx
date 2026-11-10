import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { NameDialog } from "@/components/shared/name-dialog";
import { PageBreadcrumb } from "@/components/shared/page-breadcrumb";
import { PageMeta } from "@/components/shared/page-meta";
import { SkeletonPanel } from "@/components/shared/skeleton-blocks";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTranslations } from "@/i18n";
import { PlayIcon, PlusIcon } from "@/icons";
import { apiClient } from "@/lib/api-client";
import { pathParams, paths, projectUrl, studioUrl } from "@/lib/paths";
import type { VideoSummary } from "@shared/types";
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import ItemActionsMenu from "@/pages/main/projects/item-actions-menu";
import NewVideoDialog from "@/pages/main/projects/new-video-dialog";
import VideoWorkspace from "@/pages/main/studio/video-workspace";

/** The studio for one video (`?video=<id>`): where the step pipeline runs. */
export default function StudioPage() {
  const t = useTranslations("videoStudio");
  const [searchParams] = useSearchParams();
  const videoId = searchParams.get(pathParams.videoId);

  return (
    <div>
      <PageMeta title={t("metaTitle")} description={t("metaDescription")} />
      {videoId ? (
        <StudioForVideo key={videoId} videoId={videoId} />
      ) : (
        <NoVideo />
      )}
    </div>
  );
}

function NoVideo() {
  const t = useTranslations("videoStudio");
  const tProjects = useTranslations("projects");
  const [newVideoOpen, setNewVideoOpen] = useState(false);

  return (
    <>
      <PageBreadcrumb pageTitle={t("title")} />
      <Card className="items-center gap-3 py-14 text-center">
        <PlayIcon className="size-10 text-gray-400 dark:text-gray-600" />
        <CardTitle>{t("workspace.noVideoTitle")}</CardTitle>
        <p className="max-w-sm text-sm text-gray-500 dark:text-gray-400">
          {t("workspace.noVideoDescription")}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link to={paths.projects} />}
          >
            {t("workspace.goToProjects")}
          </Button>
          <Button type="button" onClick={() => setNewVideoOpen(true)}>
            <PlusIcon className="size-4" />
            {tProjects("newVideo.button")}
          </Button>
        </div>
      </Card>
      <NewVideoDialog open={newVideoOpen} onOpenChange={setNewVideoOpen} />
    </>
  );
}

function StudioForVideo({ videoId }: { videoId: string }) {
  const t = useTranslations("videoStudio");
  const tProjects = useTranslations("projects");
  const tCommon = useTranslations("common");
  const navigate = useNavigate();

  const [video, setVideo] = useState<VideoSummary | null>(null);
  // Other videos of the same category, for quick switching.
  const [siblings, setSiblings] = useState<VideoSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"rename" | "delete" | null>(null);

  useEffect(() => {
    let active = true;
    apiClient.videos
      .get(videoId)
      .then(async (found) => {
        if (!active) return;
        setVideo(found);
        const list = await apiClient.videos.list(found.categoryId);
        if (active) setSiblings(list);
      })
      .catch(
        (err) =>
          active && setError(err instanceof Error ? err.message : String(err)),
      );
    return () => {
      active = false;
    };
  }, [videoId]);

  if (error) {
    return (
      <>
        <PageBreadcrumb pageTitle={t("title")} />
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link to={paths.projects} />}
        >
          {t("workspace.goToProjects")}
        </Button>
      </>
    );
  }

  if (!video) {
    return (
      <>
        <PageBreadcrumb pageTitle={t("title")} />
        <SkeletonPanel className="h-96" />
      </>
    );
  }

  return (
    <>
      <PageBreadcrumb
        pageTitle={video.name}
        trail={[
          { label: tProjects("title"), to: paths.projects },
          { label: video.projectName, to: projectUrl(video.projectId) },
          { label: video.categoryName },
        ]}
        actions={
          <>
            {siblings.length > 1 && (
              <Select
                value={video.id}
                onValueChange={(id) => void navigate(studioUrl(id as string))}
              >
                <SelectTrigger
                  className="w-56"
                  aria-label={t("workspace.switchVideo")}
                >
                  <PlayIcon className="size-4 shrink-0" />
                  <SelectValue>{() => video.name}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {siblings.map((sibling) => (
                    <SelectItem key={sibling.id} value={sibling.id}>
                      {sibling.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <ItemActionsMenu
              label={video.name}
              onRename={() => setDialog("rename")}
              onDelete={() => setDialog("delete")}
            />
          </>
        }
      />

      <VideoWorkspace key={video.id} videoId={video.id} />

      <NameDialog
        open={dialog === "rename"}
        onOpenChange={() => setDialog(null)}
        title={tProjects("video.renameTitle")}
        placeholder={tProjects("video.namePlaceholder")}
        initialValue={video.name}
        submitLabel={tCommon("rename")}
        onSubmit={async (name) => {
          await apiClient.videos.rename(video.id, name);
          setVideo({ ...video, name });
          setSiblings((prev) =>
            prev.map((v) => (v.id === video.id ? { ...v, name } : v)),
          );
        }}
      />

      <ConfirmDialog
        open={dialog === "delete"}
        onOpenChange={() => setDialog(null)}
        title={tProjects("video.deleteTitle")}
        description={tProjects("video.deleteDescription", { name: video.name })}
        onConfirm={async () => {
          await apiClient.videos.delete(video.id);
          void navigate(projectUrl(video.projectId));
        }}
      />
    </>
  );
}
