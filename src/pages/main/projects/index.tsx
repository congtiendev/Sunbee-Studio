import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { NameDialog } from "@/components/shared/name-dialog";
import { PageBreadcrumb } from "@/components/shared/page-breadcrumb";
import { PageMeta } from "@/components/shared/page-meta";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useTranslations } from "@/i18n";
import { FolderIcon, PlusIcon, SearchIcon } from "@/icons";
import { apiClient } from "@/lib/api-client";
import { projectUrl } from "@/lib/paths";
import type { Project } from "@shared/types";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import ItemActionsMenu from "@/pages/main/projects/item-actions-menu";
import NewVideoDialog from "@/pages/main/projects/new-video-dialog";

type DialogState =
  | { kind: "create" }
  | { kind: "rename"; project: Project }
  | { kind: "delete"; project: Project }
  | { kind: "newVideo" }
  | null;

export default function ProjectsPage() {
  const t = useTranslations("projects");
  const tCommon = useTranslations("common");

  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState<DialogState>(null);

  useEffect(() => {
    let active = true;
    apiClient.projects
      .list()
      .then((list) => active && setProjects(list))
      .catch(
        (err) =>
          active && setError(err instanceof Error ? err.message : String(err)),
      );
    return () => {
      active = false;
    };
  }, []);

  const closeDialog = () => setDialog(null);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visible = (projects ?? []).filter((p) =>
    p.name.toLocaleLowerCase().includes(normalizedQuery),
  );

  return (
    <div>
      <PageMeta title={t("title")} description={t("metaDescription")} />
      <PageBreadcrumb
        pageTitle={t("title")}
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDialog({ kind: "create" })}
            >
              <PlusIcon className="size-4" />
              {t("createButton")}
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

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {projects === null ? (
        !error && (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        )
      ) : projects.length === 0 ? (
        <Card className="items-center gap-3 py-12 text-center">
          <FolderIcon className="size-10 text-gray-400 dark:text-gray-600" />
          <CardTitle>{t("emptyTitle")}</CardTitle>
          <p className="max-w-sm text-sm text-gray-500 dark:text-gray-400">
            {t("emptyDescription")}
          </p>
          <Button type="button" onClick={() => setDialog({ kind: "create" })}>
            <PlusIcon className="size-4" />
            {t("createButton")}
          </Button>
        </Card>
      ) : (
        <>
          <div className="relative mb-4 max-w-sm">
            <SearchIcon className="pointer-events-none absolute inset-s-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className="ps-9"
            />
          </div>

          {visible.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
              {t("noMatch", { query: query.trim() })}
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {visible.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  onRename={() => setDialog({ kind: "rename", project })}
                  onDelete={() => setDialog({ kind: "delete", project })}
                />
              ))}
            </div>
          )}
        </>
      )}

      <NameDialog
        open={dialog?.kind === "create"}
        onOpenChange={closeDialog}
        title={t("createTitle")}
        placeholder={t("namePlaceholder")}
        submitLabel={t("createButton")}
        onSubmit={async (name) => {
          const project = await apiClient.projects.create(name);
          setProjects((prev) => [project, ...(prev ?? [])]);
        }}
      />

      <NameDialog
        open={dialog?.kind === "rename"}
        onOpenChange={closeDialog}
        title={t("renameTitle")}
        placeholder={t("namePlaceholder")}
        initialValue={dialog?.kind === "rename" ? dialog.project.name : ""}
        submitLabel={tCommon("rename")}
        onSubmit={async (name) => {
          if (dialog?.kind !== "rename") return;
          const { id } = dialog.project;
          await apiClient.projects.rename(id, name);
          setProjects(
            (prev) =>
              prev?.map((p) => (p.id === id ? { ...p, name } : p)) ?? prev,
          );
        }}
      />

      <ConfirmDialog
        open={dialog?.kind === "delete"}
        onOpenChange={closeDialog}
        title={t("deleteTitle")}
        description={
          dialog?.kind === "delete"
            ? t("deleteDescription", { name: dialog.project.name })
            : ""
        }
        onConfirm={async () => {
          if (dialog?.kind !== "delete") return;
          const { id } = dialog.project;
          await apiClient.projects.delete(id);
          setProjects((prev) => prev?.filter((p) => p.id !== id) ?? prev);
        }}
      />

      <NewVideoDialog
        open={dialog?.kind === "newVideo"}
        onOpenChange={closeDialog}
      />
    </div>
  );
}

function ProjectCard({
  project,
  onRename,
  onDelete,
}: {
  project: Project;
  onRename: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations("projects");

  return (
    <div className="card-surface relative flex items-start gap-3 p-4 transition-colors hover:border-brand-300 dark:hover:border-brand-500/40">
      <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-500 dark:bg-brand-500/10 dark:text-brand-400">
        <FolderIcon className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        {/* The stretched link makes the whole card clickable; the menu sits above it. */}
        <Link
          to={projectUrl(project.id)}
          className="block truncate font-medium text-gray-800 after:absolute after:inset-0 after:rounded-2xl dark:text-white/90"
        >
          {project.name}
        </Link>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {t("stats", {
            categories: project.categoryCount ?? 0,
            videos: project.videoCount ?? 0,
          })}
        </p>
        <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
          {t("updatedAt", {
            date: new Date(project.updatedAt).toLocaleDateString(),
          })}
        </p>
      </div>
      <ItemActionsMenu
        label={project.name}
        onRename={onRename}
        onDelete={onDelete}
        className="relative z-10"
      />
    </div>
  );
}
