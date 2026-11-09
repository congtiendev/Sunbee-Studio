import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useTranslations } from "@/i18n";
import { useState } from "react";

interface NameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  placeholder?: string;
  /** Pre-filled value, e.g. the current name when renaming. */
  initialValue?: string;
  submitLabel: string;
  /** Receives the trimmed name. The dialog stays open (and shows the error) when this throws. */
  onSubmit: (name: string) => Promise<void>;
}

/** A single-field dialog for creating or renaming something by name. */
export function NameDialog({ open, onOpenChange, ...props }: NameDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* Mounted only while open, so every opening starts from `initialValue`. */}
        {open && (
          <NameDialogForm onClose={() => onOpenChange(false)} {...props} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function NameDialogForm({
  title,
  placeholder,
  initialValue = "",
  submitLabel,
  onSubmit,
  onClose,
}: Omit<NameDialogProps, "open" | "onOpenChange"> & { onClose: () => void }) {
  const tCommon = useTranslations("common");
  const [name, setName] = useState(initialValue);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = name.trim();
  const canSubmit =
    trimmed.length > 0 && trimmed !== initialValue.trim() && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(trimmed);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  };

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void handleSubmit();
      }}
    >
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
      </DialogHeader>
      <Input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={placeholder}
      />
      {error && <p className="text-sm text-red-500 dark:text-red-400">{error}</p>}
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          disabled={submitting}
          onClick={onClose}
        >
          {tCommon("cancel")}
        </Button>
        <Button type="submit" disabled={!canSubmit}>
          {submitting && <Spinner />}
          {submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}
