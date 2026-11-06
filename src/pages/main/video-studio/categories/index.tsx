import { PageBreadcrumb } from "@/components/shared/page-breadcrumb";
import { PageMeta } from "@/components/shared/page-meta";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  LayoutGridIcon,
  PencilIcon,
  PlusIcon,
  TableIcon,
  TrashBinIcon,
} from "@/icons";
import { apiClient } from "@/lib/api-client";
import type { Category, Project } from "@shared/types";
import { useEffect, useState } from "react";

type ViewMode = "card" | "table";

export default function VideoStudioCategoriesPage() {
  const t = useTranslations("videoStudio.manage");
  const tRoot = useTranslations("videoStudio");

  const [viewMode, setViewMode] = useState<ViewMode>("card");
  const [projects, setProjects] = useState<Project[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState("");
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryProjectId, setNewCategoryProjectId] = useState<string | null>(null);
  const [creatingSubmitting, setCreatingSubmitting] = useState(false);

  const projectName = (projectId: string) =>
    projects.find((p) => p.id === projectId)?.name ?? "";

  useEffect(() => {
    setLoading(true);
    setError(null);
    apiClient.projects
      .list()
      .then(async (data) => {
        setProjects(data);
        const lists = await Promise.all(data.map((p) => apiClient.categories.list(p.id)));
        setCategories(lists.flat());
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, []);

  const handleCreateCategory = async () => {
    const name = newCategoryName.trim();
    if (!name || !newCategoryProjectId) return;
    setCreatingSubmitting(true);
    try {
      const category = await apiClient.categories.create(newCategoryProjectId, name);
      setCategories((prev) => [...prev, category]);
      setNewCategoryName("");
      setCreatingCategory(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreatingSubmitting(false);
    }
  };

  const handleRenameCategory = async (id: string) => {
    const name = editingCategoryName.trim();
    if (!name) return;
    try {
      await apiClient.categories.rename(id, name);
      setCategories((prev) => prev.map((c) => (c.id === id ? { ...c, name } : c)));
      setEditingCategoryId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDeleteCategory = async (id: string) => {
    try {
      await apiClient.categories.delete(id);
      setCategories((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div>
      <PageMeta
        title={tRoot("sidebar.items.videoStudioCategories")}
        description={t("categoriesPageDescription")}
      />
      <PageBreadcrumb pageTitle={t("categoriesPageTitle")} />

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
            {categories.length === 0 && !creatingCategory && (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t("categoriesEmptyAll")}
              </p>
            )}

            {categories.length > 0 &&
              (viewMode === "card" ? (
                <div className="space-y-2">
                  {categories.map((category) => (
                    <div
                      key={category.id}
                      className="flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-3 dark:border-gray-800"
                    >
                      {editingCategoryId === category.id ? (
                        <>
                          <Input
                            autoFocus
                            value={editingCategoryName}
                            onChange={(e) => setEditingCategoryName(e.target.value)}
                            className="h-8 max-w-xs text-sm"
                          />
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => void handleRenameCategory(category.id)}
                          >
                            {t("saveButton")}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setEditingCategoryId(null)}
                          >
                            {t("cancelButton")}
                          </Button>
                        </>
                      ) : (
                        <>
                          <span className="flex-1 truncate text-sm font-medium text-gray-800 dark:text-white/90">
                            {category.name}
                          </span>
                          <Badge variant="light" color="gray" size="sm">
                            {projectName(category.projectId)}
                          </Badge>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => {
                              setEditingCategoryId(category.id);
                              setEditingCategoryName(category.name);
                            }}
                          >
                            <PencilIcon className="size-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => void handleDeleteCategory(category.id)}
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
                          {t("categoriesTitle")}
                        </TableCell>
                        <TableCell
                          isHeader
                          className="w-56 px-4 py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-400"
                        >
                          {t("projectsTitle")}
                        </TableCell>
                        <TableCell isHeader className="w-24 px-4 py-3" />
                      </TableRow>
                    </TableHeader>
                    <TableBody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {categories.map((category) => (
                        <TableRow key={category.id}>
                          <TableCell className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                            {editingCategoryId === category.id ? (
                              <div className="flex items-center gap-2">
                                <Input
                                  autoFocus
                                  value={editingCategoryName}
                                  onChange={(e) => setEditingCategoryName(e.target.value)}
                                  className="h-8 max-w-xs text-sm"
                                />
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={() => void handleRenameCategory(category.id)}
                                >
                                  {t("saveButton")}
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setEditingCategoryId(null)}
                                >
                                  {t("cancelButton")}
                                </Button>
                              </div>
                            ) : (
                              category.name
                            )}
                          </TableCell>
                          <TableCell className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                            {projectName(category.projectId)}
                          </TableCell>
                          <TableCell className="px-4 py-3 text-end">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-xs"
                              onClick={() => {
                                setEditingCategoryId(category.id);
                                setEditingCategoryName(category.name);
                              }}
                            >
                              <PencilIcon className="size-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-xs"
                              onClick={() => void handleDeleteCategory(category.id)}
                            >
                              <TrashBinIcon className="size-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ))}

            <div className="border-t border-gray-100 pt-4 dark:border-gray-800">
              {creatingCategory ? (
                <div className="flex items-center gap-2">
                  <Select
                    value={newCategoryProjectId ?? undefined}
                    onValueChange={(value) => setNewCategoryProjectId(value as string)}
                  >
                    <SelectTrigger className="max-w-xs">
                      <SelectValue placeholder={t("pickProjectPlaceholder")}>
                        {() => projectName(newCategoryProjectId ?? "")}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {projects.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    autoFocus
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder={tRoot("category.namePlaceholder")}
                    className="max-w-xs"
                  />
                  <Button
                    type="button"
                    onClick={() => void handleCreateCategory()}
                    disabled={!newCategoryName.trim() || !newCategoryProjectId || creatingSubmitting}
                  >
                    {creatingSubmitting && <Spinner />}
                    {tRoot("category.addButton")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setCreatingCategory(false);
                      setNewCategoryName("");
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
                  onClick={() => {
                    setCreatingCategory(true);
                    setNewCategoryProjectId(projects[0]?.id ?? null);
                  }}
                  disabled={projects.length === 0}
                >
                  <PlusIcon className="size-4" />
                  {tRoot("category.addButton")}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
