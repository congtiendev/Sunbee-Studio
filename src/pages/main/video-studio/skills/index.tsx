import { PageBreadcrumb } from "@/components/shared/page-breadcrumb";
import { PageMeta } from "@/components/shared/page-meta";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { useTranslations } from "@/i18n";
import { DownloadIcon, PencilIcon, PlusIcon, TrashBinIcon, UploadIcon } from "@/icons";
import { apiClient } from "@/lib/api-client";
import type { SkillImportResult, StyleTemplate } from "@shared/types";
import { useEffect, useRef, useState } from "react";
import SkillEditorSheet from "./skill-editor-sheet";

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const IMPORT_ACCEPT = ".json,.md,.markdown,.zip";

/** Skill library: style, instructions and approved examples the AI follows. */
export default function VideoStudioSkillsPage() {
  const t = useTranslations("videoStudio.skills");
  const tNav = useTranslations("sidebar.items");

  const [skills, setSkills] = useState<StyleTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StyleTemplate | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<SkillImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reload = () =>
    apiClient.templates
      .list()
      .then(setSkills)
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));

  useEffect(() => {
    void reload();
  }, []);

  const openEditor = (id: string | null) => {
    setEditingId(id);
    setEditorOpen(true);
  };

  const handleImport = async (file: File) => {
    setError(null);
    setImportResult(null);
    setImporting(true);
    try {
      setImportResult(await apiClient.templates.import(file));
      await reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setImporting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiClient.templates.delete(deleteTarget.id);
      setSkills((prev) => prev.filter((skill) => skill.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      <PageMeta title={tNav("videoStudioSkills")} description={t("pageDescription")} />
      <PageBreadcrumb pageTitle={t("pageTitle")} />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <p className="me-auto max-w-2xl text-sm text-gray-500 dark:text-gray-400">
          {t("pageDescription")}
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept={IMPORT_ACCEPT}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void handleImport(file);
          }}
        />
        <Button
          type="button"
          variant="outline"
          className="gap-1.5"
          disabled={importing}
          onClick={() => fileInputRef.current?.click()}
        >
          {importing ? <Spinner /> : <UploadIcon className="size-4" />}
          {t("importButton")}
        </Button>
        <Button type="button" className="gap-1.5" onClick={() => openEditor(null)}>
          <PlusIcon className="size-4" />
          {t("createButton")}
        </Button>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {importResult && (
        <Alert variant="success" className="mb-4">
          <AlertDescription>
            {t("importDone", {
              name: importResult.skill.name,
              examples: importResult.examples,
              documents: importResult.documents,
            })}
            {importResult.skippedFiles.length > 0 &&
              ` ${t("importSkipped", { files: importResult.skippedFiles.join(", ") })}`}
          </AlertDescription>
        </Alert>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : skills.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 px-6 py-12 text-center dark:border-gray-700">
          <p className="text-sm text-gray-500 dark:text-gray-400">{t("empty")}</p>
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{t("importHint")}</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {skills.map((skill) => (
            <div
              key={skill.id}
              className="glass-flat flex flex-col rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]"
            >
              <div className="flex items-start gap-2">
                <h3 className="min-w-0 flex-1 truncate text-base font-semibold text-gray-800 dark:text-white/90">
                  {skill.name}
                </h3>
                <Badge
                  variant="light"
                  color={skill.origin === "anthropic" ? "warning" : "primary"}
                  size="sm"
                  className="shrink-0"
                >
                  {t(`origin.${skill.origin ?? "app"}`)}
                </Badge>
              </div>
              {skill.description && (
                <p className="mt-1 line-clamp-2 text-sm text-gray-500 dark:text-gray-400">
                  {skill.description}
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-1.5">
                {skill.genre && (
                  <Badge variant="light" color="info" size="sm">
                    {skill.genre}
                  </Badge>
                )}
                {skill.styleTags.slice(0, 4).map((tag) => (
                  <Badge key={tag} variant="light" color="gray" size="sm">
                    {tag}
                  </Badge>
                ))}
                {skill.instructions?.trim() && (
                  <Badge variant="light" color="success" size="sm">
                    {t("hasInstructions")}
                  </Badge>
                )}
              </div>
              <div className="mt-auto flex items-center gap-1 pt-4">
                <span className="me-auto text-xs text-gray-400 dark:text-gray-500">
                  {new Date(skill.updatedAt ?? skill.createdAt).toLocaleDateString()}
                  {skill.ownerEmail ? ` · ${skill.ownerEmail}` : ""}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  title={t("editButton")}
                  onClick={() => openEditor(skill.id)}
                >
                  <PencilIcon className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  title={t("exportButton")}
                  onClick={() => {
                    // Content-Disposition: attachment → the browser downloads instead of navigating.
                    window.location.href = apiClient.templates.exportUrl(skill.id);
                  }}
                >
                  <DownloadIcon className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  title={t("deleteButton")}
                  onClick={() => setDeleteTarget(skill)}
                >
                  <TrashBinIcon className="size-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <SkillEditorSheet
        open={editorOpen}
        onOpenChange={setEditorOpen}
        skillId={editingId}
        onSaved={() => void reload()}
      />

      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deleteTitle")}</DialogTitle>
            <DialogDescription>
              {t("deleteDescription", { name: deleteTarget?.name ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)}>
              {t("editor.cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleting}
              onClick={() => void handleDelete()}
            >
              {deleting && <Spinner />}
              {t("deleteButton")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
