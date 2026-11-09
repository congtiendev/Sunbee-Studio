import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useTranslations } from "@/i18n";
import { apiClient } from "@/lib/api-client";
import type { DocumentSummary } from "@shared/types";
import { useState } from "react";

/** Create a document from pasted text (notes, a brief, copied web content...). */
export default function PasteTextDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (doc: DocumentSummary) => void;
}) {
  const t = useTranslations("videoStudio.documents");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = (next: boolean) => {
    if (!next) {
      setTitle("");
      setText("");
      setError(null);
    }
    onOpenChange(next);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      onCreated(await apiClient.documents.createText(title.trim(), text));
      close(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("paste.title")}</DialogTitle>
          <DialogDescription>{t("paste.description")}</DialogDescription>
        </DialogHeader>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Field>
          <FieldLabel>{t("paste.titleLabel")}</FieldLabel>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel>{t("paste.textLabel")}</FieldLabel>
          <Textarea
            rows={12}
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="max-h-[50vh]"
          />
        </Field>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => close(false)}>
            {t("cancel")}
          </Button>
          <Button
            type="button"
            disabled={saving || !title.trim() || !text.trim()}
            onClick={() => void handleSave()}
          >
            {saving && <Spinner />}
            {t("paste.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
