import { PageBreadcrumb } from "@/components/shared/page-breadcrumb";
import { PageMeta } from "@/components/shared/page-meta";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SkeletonTable } from "@/components/shared/skeleton-blocks";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { useTranslations } from "@/i18n";
import { EyeIcon, FileIcon, PencilIcon, TrashBinIcon, UploadIcon } from "@/icons";
import { apiClient } from "@/lib/api-client";
import type { DocumentSummary, Project, StyleTemplate } from "@shared/types";
import { useEffect, useRef, useState } from "react";
import DocumentSheet from "./document-sheet";
import PasteTextDialog from "./paste-text-dialog";
import { DOCUMENT_ACCEPT, documentTypeLabel, formatCharCount } from "./utils";

const HEADER_CELL = "px-4 py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-400";
const BODY_CELL = "px-4 py-3 text-sm text-gray-500 dark:text-gray-400";

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Reference documents: knowledge for the AI and source material for scripts. */
export default function VideoStudioDocumentsPage() {
  const t = useTranslations("videoStudio.documents");
  const tNav = useTranslations("sidebar.items");

  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [skills, setSkills] = useState<StyleTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DocumentSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reloadDocuments = () =>
    apiClient.documents
      .list()
      .then(setDocuments)
      .catch((err) => setErrors([errorMessage(err)]));

  useEffect(() => {
    Promise.all([
      apiClient.documents.list(),
      apiClient.projects.list(),
      apiClient.templates.list(),
    ])
      .then(([docs, projectList, skillList]) => {
        setDocuments(docs);
        setProjects(projectList);
        setSkills(skillList);
      })
      .catch((err) => setErrors([errorMessage(err)]))
      .finally(() => setLoading(false));
  }, []);

  const handleUpload = async (files: File[]) => {
    setUploading(true);
    setErrors([]);
    const failures: string[] = [];
    for (const file of files) {
      try {
        await apiClient.documents.upload(file);
      } catch (err) {
        failures.push(`${file.name}: ${errorMessage(err)}`);
      }
    }
    setErrors(failures);
    await reloadDocuments();
    setUploading(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiClient.documents.delete(deleteTarget.id);
      setDocuments((prev) => prev.filter((doc) => doc.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      setErrors([errorMessage(err)]);
    } finally {
      setDeleting(false);
    }
  };

  const targetName = (type: string, id: string) =>
    (type === "project" ? projects : skills).find((item) => item.id === id)?.name;

  return (
    <div>
      <PageMeta title={tNav("documents")} description={t("pageDescription")} />
      <PageBreadcrumb pageTitle={t("pageTitle")} />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <p className="me-auto max-w-2xl text-sm text-gray-500 dark:text-gray-400">
          {t("pageDescription")}
        </p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={DOCUMENT_ACCEPT}
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            if (files.length > 0) void handleUpload(files);
          }}
        />
        <Button type="button" variant="outline" className="gap-1.5" onClick={() => setPasteOpen(true)}>
          <PencilIcon className="size-4" />
          {t("pasteButton")}
        </Button>
        <Button
          type="button"
          className="gap-1.5"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? <Spinner /> : <UploadIcon className="size-4" />}
          {t("uploadButton")}
        </Button>
      </div>

      {errors.length > 0 && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>
            {errors.map((message) => (
              <div key={message}>{message}</div>
            ))}
          </AlertDescription>
        </Alert>
      )}

      {loading ? (
        <SkeletonTable rows={6} cols={6} />
      ) : documents.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 px-6 py-12 text-center dark:border-gray-700">
          <FileIcon className="mx-auto mb-3 size-8 text-gray-400" />
          <p className="text-sm text-gray-500 dark:text-gray-400">{t("empty")}</p>
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{t("formatsHint")}</p>
        </div>
      ) : (
        <Card>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="border-b border-gray-100 dark:border-gray-800">
                  <TableRow>
                    <TableCell isHeader className={HEADER_CELL}>
                      {t("columns.title")}
                    </TableCell>
                    <TableCell isHeader className={HEADER_CELL}>
                      {t("columns.type")}
                    </TableCell>
                    <TableCell isHeader className={HEADER_CELL}>
                      {t("columns.size")}
                    </TableCell>
                    <TableCell isHeader className={HEADER_CELL}>
                      {t("columns.attachedTo")}
                    </TableCell>
                    <TableCell isHeader className={HEADER_CELL}>
                      {t("columns.createdAt")}
                    </TableCell>
                    <TableCell isHeader className="w-24 px-4 py-3" />
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {documents.map((doc) => (
                    <TableRow key={doc.id}>
                      <TableCell className="max-w-xs px-4 py-3">
                        <button
                          type="button"
                          onClick={() => setViewingId(doc.id)}
                          className="block max-w-full truncate text-start text-sm font-medium text-gray-800 hover:text-brand-500 dark:text-white/90 dark:hover:text-brand-400"
                        >
                          {doc.title}
                        </button>
                      </TableCell>
                      <TableCell className={BODY_CELL}>
                        <Badge variant="light" color="gray" size="sm">
                          {documentTypeLabel(doc.mime)}
                        </Badge>
                      </TableCell>
                      <TableCell className={BODY_CELL}>
                        {t("charCount", { count: formatCharCount(doc.charCount) })}
                      </TableCell>
                      <TableCell className={BODY_CELL}>
                        <div className="flex flex-wrap gap-1">
                          {(doc.links ?? []).length === 0 && (
                            <span className="text-xs text-gray-400 dark:text-gray-500">—</span>
                          )}
                          {(doc.links ?? []).map((link) => {
                            const name = targetName(link.targetType, link.targetId);
                            return name ? (
                              <Badge
                                key={`${link.targetType}:${link.targetId}`}
                                variant="light"
                                color={link.targetType === "project" ? "info" : "primary"}
                                size="sm"
                              >
                                {t(`linkType.${link.targetType}`)}: {name}
                              </Badge>
                            ) : null;
                          })}
                        </div>
                      </TableCell>
                      <TableCell className={BODY_CELL}>
                        {new Date(doc.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-end whitespace-nowrap">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          title={t("viewButton")}
                          onClick={() => setViewingId(doc.id)}
                        >
                          <EyeIcon className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          title={t("deleteButton")}
                          onClick={() => setDeleteTarget(doc)}
                        >
                          <TrashBinIcon className="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <DocumentSheet
        documentId={viewingId}
        onOpenChange={(open) => !open && setViewingId(null)}
        projects={projects}
        skills={skills}
        onChanged={() => void reloadDocuments()}
      />

      <PasteTextDialog
        open={pasteOpen}
        onOpenChange={setPasteOpen}
        onCreated={() => void reloadDocuments()}
      />

      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deleteTitle")}</DialogTitle>
            <DialogDescription>
              {t("deleteDescription", { name: deleteTarget?.title ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)}>
              {t("cancel")}
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
