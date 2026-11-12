import { SkeletonLines } from "@/components/shared/skeleton-blocks";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { useTranslations } from "@/i18n";
import { DownloadIcon } from "@/icons";
import { apiClient } from "@/lib/api-client";
import type { DocumentLink, DocumentRecord, Project, StyleTemplate } from "@shared/types";
import { useEffect, useState } from "react";
import { documentTypeLabel, formatCharCount } from "./utils";

const SECTION_TITLE = "text-sm font-semibold text-gray-800 dark:text-white/90";

interface DocumentSheetProps {
  documentId: string | null;
  onOpenChange: (open: boolean) => void;
  projects: Project[];
  skills: StyleTemplate[];
  /** Called after a rename or a links change so the list can refresh. */
  onChanged: () => void;
}

export default function DocumentSheet({
  documentId,
  onOpenChange,
  projects,
  skills,
  onChanged,
}: DocumentSheetProps) {
  const t = useTranslations("videoStudio.documents");
  return (
    <Sheet open={documentId !== null} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl">
        <SheetHeader className="pe-10">
          <SheetTitle>{t("sheet.title")}</SheetTitle>
          <SheetDescription>{t("sheet.description")}</SheetDescription>
        </SheetHeader>
        {documentId && (
          <DocumentSheetBody
            key={documentId}
            documentId={documentId}
            projects={projects}
            skills={skills}
            onChanged={onChanged}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function DocumentSheetBody({
  documentId,
  projects,
  skills,
  onChanged,
}: Omit<DocumentSheetProps, "onOpenChange"> & { documentId: string }) {
  const t = useTranslations("videoStudio.documents");
  const [doc, setDoc] = useState<DocumentRecord | null>(null);
  const [title, setTitle] = useState("");
  const [links, setLinks] = useState<DocumentLink[]>([]);
  const [savedLinks, setSavedLinks] = useState<DocumentLink[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([apiClient.documents.get(documentId), apiClient.documents.list()])
      .then(([record, all]) => {
        if (!active) return;
        setDoc(record);
        setTitle(record.title);
        const current = all.find((d) => d.id === documentId)?.links ?? [];
        setLinks(current);
        setSavedLinks(current);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      active = false;
    };
  }, [documentId]);

  const isLinked = (link: DocumentLink) =>
    links.some((l) => l.targetType === link.targetType && l.targetId === link.targetId);
  const toggle = (link: DocumentLink, checked: boolean) =>
    setLinks((prev) =>
      checked
        ? [...prev, link]
        : prev.filter((l) => !(l.targetType === link.targetType && l.targetId === link.targetId)),
    );
  const linksDirty =
    links.length !== savedLinks.length ||
    links.some((l) => !savedLinks.some((s) => s.targetType === l.targetType && s.targetId === l.targetId));

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (!doc) {
    return error ? (
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    ) : (
      <div className="space-y-6 px-1">
        <SkeletonLines count={2} />
        <SkeletonLines count={4} />
      </div>
    );
  }

  const targetGroups: { type: DocumentLink["targetType"]; label: string; items: { id: string; name: string }[] }[] = [
    { type: "project", label: t("sheet.projects"), items: projects },
    { type: "skill", label: t("sheet.skills"), items: skills },
  ];

  return (
    <div className="-mx-6 flex-1 space-y-6 overflow-y-auto px-6 pb-6 custom-scrollbar">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Field>
        <FieldLabel>{t("sheet.titleLabel")}</FieldLabel>
        <div className="flex gap-2">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          <Button
            type="button"
            variant="outline"
            disabled={busy || !title.trim() || title.trim() === doc.title}
            onClick={() =>
              void run(async () => {
                await apiClient.documents.rename(doc.id, title.trim());
                setDoc({ ...doc, title: title.trim() });
              })
            }
          >
            {t("sheet.rename")}
          </Button>
        </div>
      </Field>

      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
        <Badge variant="light" color="gray" size="sm">
          {documentTypeLabel(doc.mime)}
        </Badge>
        <span>{t("charCount", { count: formatCharCount(doc.charCount) })}</span>
        <span>· {new Date(doc.createdAt).toLocaleString()}</span>
        {doc.fileId && (
          <a
            href={apiClient.documents.fileUrl(doc.fileId)}
            download
            className="ms-auto inline-flex items-center gap-1 text-brand-500 hover:underline dark:text-brand-400"
          >
            <DownloadIcon className="size-4" />
            {t("sheet.downloadOriginal")}
          </a>
        )}
      </div>

      <section className="space-y-3">
        <h3 className={SECTION_TITLE}>{t("sheet.attachTitle")}</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400">{t("sheet.attachHint")}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {targetGroups.map((group) => (
            <div key={group.type} className="space-y-2">
              <span className="text-xs font-medium text-gray-500 uppercase dark:text-gray-400">
                {group.label}
              </span>
              {group.items.length === 0 ? (
                <p className="text-xs text-gray-400 dark:text-gray-500">{t("sheet.none")}</p>
              ) : (
                <div className="max-h-48 space-y-1.5 overflow-y-auto pe-1 custom-scrollbar">
                  {group.items.map((item) => {
                    const link = { targetType: group.type, targetId: item.id };
                    return (
                      <label
                        key={item.id}
                        className="flex cursor-pointer items-center gap-2.5 text-sm text-gray-700 dark:text-gray-300"
                      >
                        <Checkbox
                          checked={isLinked(link)}
                          onCheckedChange={(checked) => toggle(link, checked)}
                        />
                        <span className="truncate" title={item.name}>
                          {item.name}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
        <Button
          type="button"
          size="sm"
          disabled={busy || !linksDirty}
          onClick={() =>
            void run(async () => {
              const saved = await apiClient.documents.setDocumentLinks(doc.id, links);
              setLinks(saved);
              setSavedLinks(saved);
            })
          }
        >
          {busy && <Spinner />}
          {t("sheet.saveLinks")}
        </Button>
      </section>

      <section className="space-y-2">
        <h3 className={SECTION_TITLE}>{t("sheet.textTitle")}</h3>
        <pre className="max-h-[50vh] overflow-auto rounded-xl border border-gray-200 bg-gray-50 p-4 font-sans text-sm whitespace-pre-wrap text-gray-700 custom-scrollbar dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
          {doc.textContent}
        </pre>
      </section>
    </div>
  );
}
