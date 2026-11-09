import { PageBreadcrumb } from "@/components/shared/page-breadcrumb";
import { PageMeta } from "@/components/shared/page-meta";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useTranslations } from "@/i18n";
import {
  FolderIcon,
  LayoutGridIcon,
  PencilIcon,
  PlusIcon,
  TableIcon,
  TrashBinIcon,
} from "@/icons";
import { apiClient } from "@/lib/api-client";
import { cn } from "@/utils";
import type { Project } from "@shared/types";
import { useEffect, useState } from "react";

type ViewMode = "card" | "table";

export default function VideoStudioProjectsPage() {
  const t = useTranslations("videoStudio.manage");
  const tRoot = useTranslations("videoStudio");
  const tNav = useTranslations("sidebar.items");

  const [viewMode, setViewMode] = useState<ViewMode>("card");
  const [projects, setProjects] = useState<Project[]>([]);
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingProjectName, setEditingProjectName] = useState("");
  const [creatingProject, setCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [creatingSubmitting, setCreatingSubmitting] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    apiClient.projects
      .list()
      .then(async (data) => {
        setProjects(data);
        const entries = await Promise.all(
          data.map(
            async (p) => [p.id, (await apiClient.categories.list(p.id)).length] as const,
          ),
        );
        setCategoryCounts(Object.fromEntries(entries));
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, []);

  const handleCreateProject = async () => {
    const name = newProjectName.trim();
    if (!name) return;
    setCreatingSubmitting(true);
    try {
      const project = await apiClient.projects.create(name);
      setProjects((prev) => [project, ...prev]);
      setCategoryCounts((prev) => ({ ...prev, [project.id]: 0 }));
      setNewProjectName("");
      setCreatingProject(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreatingSubmitting(false);
    }
  };

  const handleRenameProject = async (id: string) => {
    const name = editingProjectName.trim();
    if (!name) return;
    try {
      await apiClient.projects.rename(id, name);
      setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, name } : p)));
      setEditingProjectId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDeleteProject = async (id: string) => {
    try {
      await apiClient.projects.delete(id);
      setProjects((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div>
      <PageMeta
        title={tNav("videoStudioProjects")}
        description={t("projectsPageDescription")}
      />
      <PageBreadcrumb pageTitle={t("projectsPageTitle")} />

      <div className="mb-4 flex justify-end gap-1">
        <Button
          type="button"
          variant={viewMode === "card" ? "default" : "outline"}
          size="icon-sm"
          onClick={() => setViewMode("card")}
        >
          <LayoutGridIcon className="size-4" />
        </Button>
        <Button
          type="button"
          variant={viewMode === "table" ? "default" : "outline"}
          size="icon-sm"
          onClick={() => setViewMode("table")}
        >
          <TableIcon className="size-4" />
        </Button>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : (
        <Card>
          <CardContent className="space-y-4">
            {viewMode === "card" ? (
              <div className="space-y-2">
                {projects.map((project) => (
                  <div
                    key={project.id}
                    className="flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-3 dark:border-gray-800"
                  >
                    <FolderIcon className="size-5 shrink-0 text-gray-400" />
                    {editingProjectId === project.id ? (
                      <>
                        <Input
                          autoFocus
                          value={editingProjectName}
                          onChange={(e) => setEditingProjectName(e.target.value)}
                          className="h-8 max-w-xs text-sm"
                        />
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => void handleRenameProject(project.id)}
                        >
                          {t("saveButton")}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setEditingProjectId(null)}
                        >
                          {t("cancelButton")}
                        </Button>
                      </>
                    ) : (
                      <>
                        <span className="flex-1 truncate text-sm font-medium text-gray-800 dark:text-white/90">
                          {project.name}
                        </span>
                        <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">
                          {t("categoryCount")}: {categoryCounts[project.id] ?? 0}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => {
                            setEditingProjectId(project.id);
                            setEditingProjectName(project.name);
                          }}
                        >
                          <PencilIcon className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => void handleDeleteProject(project.id)}
                        >
                          <TrashBinIcon className="size-4" />
                        </Button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="border-b border-gray-100 dark:border-gray-800">
                    <TableRow>
                      <TableCell
                        isHeader
                        className="px-4 py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-400"
                      >
                        {t("projectsTitle")}
                      </TableCell>
                      <TableCell
                        isHeader
                        className="w-40 px-4 py-3 text-end text-xs font-medium text-gray-500 dark:text-gray-400"
                      >
                        {t("categoryCount")}
                      </TableCell>
                      <TableCell isHeader className="w-24 px-4 py-3" />
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {projects.map((project) => (
                      <TableRow key={project.id}>
                        <TableCell className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                          {editingProjectId === project.id ? (
                            <div className="flex items-center gap-2">
                              <Input
                                autoFocus
                                value={editingProjectName}
                                onChange={(e) => setEditingProjectName(e.target.value)}
                                className="h-8 max-w-xs text-sm"
                              />
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => void handleRenameProject(project.id)}
                              >
                                {t("saveButton")}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => setEditingProjectId(null)}
                              >
                                {t("cancelButton")}
                              </Button>
                            </div>
                          ) : (
                            project.name
                          )}
                        </TableCell>
                        <TableCell className="px-4 py-3 text-end text-sm text-gray-500 dark:text-gray-400">
                          {categoryCounts[project.id] ?? 0}
                        </TableCell>
                        <TableCell className="px-4 py-3 text-end">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => {
                              setEditingProjectId(project.id);
                              setEditingProjectName(project.name);
                            }}
                          >
                            <PencilIcon className="size-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => void handleDeleteProject(project.id)}
                          >
                            <TrashBinIcon className="size-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <div className={cn("border-t border-gray-100 pt-4 dark:border-gray-800")}>
              {creatingProject ? (
                <div className="flex items-center gap-2">
                  <Input
                    autoFocus
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    placeholder={tRoot("project.namePlaceholder")}
                    className="max-w-xs"
                  />
                  <Button
                    type="button"
                    onClick={() => void handleCreateProject()}
                    disabled={!newProjectName.trim() || creatingSubmitting}
                  >
                    {creatingSubmitting && <Spinner />}
                    {tRoot("project.createButton")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setCreatingProject(false);
                      setNewProjectName("");
                    }}
                  >
                    {t("cancelButton")}
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => setCreatingProject(true)}
                >
                  <PlusIcon className="size-4" />
                  {tRoot("project.createButton")}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
