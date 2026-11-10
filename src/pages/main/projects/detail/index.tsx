import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { NameDialog } from "@/components/shared/name-dialog";
import { PageBreadcrumb } from "@/components/shared/page-breadcrumb";
import { PageMeta } from "@/components/shared/page-meta";
import { SkeletonSection } from "@/components/shared/skeleton-blocks";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { useTranslations } from "@/i18n";
import { FolderIcon, PlusIcon } from "@/icons";
import { apiClient } from "@/lib/api-client";
import { pathParams, paths, studioUrl } from "@/lib/paths";
import type { Category, Project, VideoSummary } from "@shared/types";
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import CategorySection from "@/pages/main/projects/detail/category-section";
import ItemActionsMenu from "@/pages/main/projects/item-actions-menu";
import NewVideoDialog from "@/pages/main/projects/new-video-dialog";

interface ProjectData {
  project: Project;
  categories: Category[];
  videos: VideoSummary[];
}

/** Every dialog this page can open — one at a time. */
type DialogState =
  | { kind: "renameProject" }
  | { kind: "deleteProject" }
  | { kind: "createCategory" }
  | { kind: "renameCategory"; category: Category }
  | { kind: "deleteCategory"; category: Category }
  | { kind: "createVideo"; category: Category }
  | { kind: "renameVideo"; video: VideoSummary }
  | { kind: "deleteVideo"; video: VideoSummary }
  | { kind: "newVideo" }
  | null;

interface NameDialogConfig {
  title: string;
  placeholder: string;
  initialValue?: string;
  submitLabel: string;
  onSubmit: (name: string) => Promise<void>;
}

interface ConfirmDialogConfig {
  title: string;
  description: string;
  onConfirm: () => Promise<void>;
}

/** A project's page (`?id=<projectId>`): its categories and their videos. */
export default function ProjectDetailPage() {
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get(pathParams.projectId);
  // Keyed so another project starts from a clean state.
  return <ProjectDetail key={projectId ?? ""} projectId={projectId} />;
}

function ProjectDetail({ projectId }: { projectId: string | null }) {
  const t = useTranslations("projects");
  const tCommon = useTranslations("common");
  const navigate = useNavigate();

  const [data, setData] = useState<ProjectData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);

  useEffect(() => {
    if (!projectId) return;
    let active = true;
    Promise.all([
      apiClient.projects.get(projectId),
      apiClient.categories.list(projectId),
      apiClient.videos.listByProject(projectId),
    ])
      .then(([project, categories, videos]) => {
        if (active) setData({ project, categories, videos });
      })
      .catch(
        (err) =>
          active && setError(err instanceof Error ? err.message : String(err)),
      );
    return () => {
      active = false;
    };
  }, [projectId]);

  if (!projectId || error) {
    return (
      <div>
        <PageMeta title={t("title")} description={t("metaDescription")} />
        <PageBreadcrumb pageTitle={t("title")} />
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error ?? t("detail.notFound")}</AlertDescription>
        </Alert>
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link to={paths.projects} />}
        >
          {t("detail.backToProjects")}
        </Button>
      </div>
    );
  }

  if (!data) {
    return (
      <div>
        <PageMeta title={t("title")} description={t("metaDescription")} />
        <PageBreadcrumb pageTitle={t("title")} trail={[{ label: t("title"), to: paths.projects }]} />
        <div className="space-y-5">
          <SkeletonSection cards={2} />
          <SkeletonSection cards={3} />
        </div>
      </div>
    );
  }

  const { project, categories, videos } = data;
  const update = (patch: Partial<ProjectData>) =>
    setData((prev) => (prev ? { ...prev, ...patch } : prev));
  const closeDialog = () => setDialog(null);

  const nameDialog = ((): NameDialogConfig | null => {
    switch (dialog?.kind) {
      case "renameProject":
        return {
          title: t("renameTitle"),
          placeholder: t("namePlaceholder"),
          initialValue: project.name,
          submitLabel: tCommon("rename"),
          onSubmit: async (name) => {
            await apiClient.projects.rename(project.id, name);
            update({ project: { ...project, name } });
          },
        };
      case "createCategory":
        return {
          title: t("detail.categoryCreateTitle"),
          placeholder: t("detail.categoryNamePlaceholder"),
          submitLabel: tCommon("create"),
          onSubmit: async (name) => {
            const category = await apiClient.categories.create(
              project.id,
              name,
            );
            update({ categories: [...categories, category] });
          },
        };
      case "renameCategory": {
        const { category } = dialog;
        return {
          title: t("detail.categoryRenameTitle"),
          placeholder: t("detail.categoryNamePlaceholder"),
          initialValue: category.name,
          submitLabel: tCommon("rename"),
          onSubmit: async (name) => {
            await apiClient.categories.rename(category.id, name);
            update({
              categories: categories.map((c) =>
                c.id === category.id ? { ...c, name } : c,
              ),
            });
          },
        };
      }
      case "createVideo": {
        const { category } = dialog;
        return {
          title: t("video.createTitle"),
          placeholder: t("video.namePlaceholder"),
          submitLabel: t("newVideo.submit"),
          onSubmit: async (name) => {
            const video = await apiClient.videos.create(category.id, name);
            void navigate(studioUrl(video.id));
          },
        };
      }
      case "renameVideo": {
        const { video } = dialog;
        return {
          title: t("video.renameTitle"),
          placeholder: t("video.namePlaceholder"),
          initialValue: video.name,
          submitLabel: tCommon("rename"),
          onSubmit: async (name) => {
            await apiClient.videos.rename(video.id, name);
            update({
              videos: videos.map((v) =>
                v.id === video.id ? { ...v, name } : v,
              ),
            });
          },
        };
      }
      default:
        return null;
    }
  })();

  const confirmDialog = ((): ConfirmDialogConfig | null => {
    switch (dialog?.kind) {
      case "deleteProject":
        return {
          title: t("deleteTitle"),
          description: t("deleteDescription", { name: project.name }),
          onConfirm: async () => {
            await apiClient.projects.delete(project.id);
            void navigate(paths.projects);
          },
        };
      case "deleteCategory": {
        const { category } = dialog;
        return {
          title: t("detail.categoryDeleteTitle"),
          description: t("detail.categoryDeleteDescription", {
            name: category.name,
          }),
          onConfirm: async () => {
            await apiClient.categories.delete(category.id);
            update({
              categories: categories.filter((c) => c.id !== category.id),
              videos: videos.filter((v) => v.categoryId !== category.id),
            });
          },
        };
      }
      case "deleteVideo": {
        const { video } = dialog;
        return {
          title: t("video.deleteTitle"),
          description: t("video.deleteDescription", { name: video.name }),
          onConfirm: async () => {
            await apiClient.videos.delete(video.id);
            update({ videos: videos.filter((v) => v.id !== video.id) });
          },
        };
      }
      default:
        return null;
    }
  })();

  return (
    <div>
      <PageMeta title={project.name} description={t("metaDescription")} />
      <PageBreadcrumb
        pageTitle={project.name}
        trail={[{ label: t("title"), to: paths.projects }]}
        actions={
          <>
            <ItemActionsMenu
              label={project.name}
              onRename={() => setDialog({ kind: "renameProject" })}
              onDelete={() => setDialog({ kind: "deleteProject" })}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => setDialog({ kind: "createCategory" })}
            >
              <PlusIcon className="size-4" />
              {t("detail.addCategory")}
            </Button>
            <Button
              type="button"
              onClick={() => setDialog({ kind: "newVideo" })}
            >
              <PlusIcon className="size-4" />
              {t("newVideo.button")}
            </Button>
          </>
        }
      />

      {categories.length === 0 ? (
        <Card className="items-center gap-3 py-12 text-center">
          <FolderIcon className="size-10 text-gray-400 dark:text-gray-600" />
          <CardTitle>{t("detail.emptyTitle")}</CardTitle>
          <p className="max-w-md text-sm text-gray-500 dark:text-gray-400">
            {t("detail.emptyDescription")}
          </p>
          <Button
            type="button"
            onClick={() => setDialog({ kind: "createCategory" })}
          >
            <PlusIcon className="size-4" />
            {t("detail.addCategory")}
          </Button>
        </Card>
      ) : (
        <div className="space-y-5">
          {categories.map((category) => (
            <CategorySection
              key={category.id}
              category={category}
              videos={videos.filter((v) => v.categoryId === category.id)}
              onAddVideo={() => setDialog({ kind: "createVideo", category })}
              onRename={() => setDialog({ kind: "renameCategory", category })}
              onDelete={() => setDialog({ kind: "deleteCategory", category })}
              onRenameVideo={(video) =>
                setDialog({ kind: "renameVideo", video })
              }
              onDeleteVideo={(video) =>
                setDialog({ kind: "deleteVideo", video })
              }
            />
          ))}
        </div>
      )}

      <NameDialog
        open={nameDialog !== null}
        onOpenChange={closeDialog}
        title={nameDialog?.title ?? ""}
        placeholder={nameDialog?.placeholder}
        initialValue={nameDialog?.initialValue}
        submitLabel={nameDialog?.submitLabel ?? ""}
        onSubmit={(name) => nameDialog?.onSubmit(name) ?? Promise.resolve()}
      />

      <ConfirmDialog
        open={confirmDialog !== null}
        onOpenChange={closeDialog}
        title={confirmDialog?.title ?? ""}
        description={confirmDialog?.description}
        onConfirm={() => confirmDialog?.onConfirm() ?? Promise.resolve()}
      />

      <NewVideoDialog
        open={dialog?.kind === "newVideo"}
        onOpenChange={closeDialog}
        defaultProjectId={project.id}
      />
    </div>
  );
}
