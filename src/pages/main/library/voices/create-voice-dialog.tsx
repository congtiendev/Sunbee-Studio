import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTranslations } from "@/i18n";
import { apiClient } from "@/lib/api-client";
import { useEffect, useState } from "react";
import type { VoiceProfile } from "@shared/types";

interface CreateVoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (name: string, sample: File) => Promise<VoiceProfile>;
  onCreated: (profile: VoiceProfile) => void;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Name + one reference audio sample (direct upload, or extracted from a song) — everything a local voice clone needs. */
export function CreateVoiceDialog({ open, onOpenChange, ...props }: CreateVoiceDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* Mounted only while open, so every opening starts from a blank form. */}
        {open && <CreateVoiceForm onClose={() => onOpenChange(false)} {...props} />}
      </DialogContent>
    </Dialog>
  );
}

function FromSongTab({ onExtracted }: { onExtracted: (file: File) => void }) {
  const t = useTranslations("voiceLibrary");
  const [songFile, setSongFile] = useState<File | null>(null);
  const [separating, setSeparating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const handleSeparate = async () => {
    if (!songFile) return;
    setSeparating(true);
    setError(null);
    try {
      const blob = await apiClient.voiceover.separateVocals(songFile);
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSeparating(false);
    }
  };

  return (
    <div className="grid gap-3">
      <p className="text-sm text-gray-500 dark:text-gray-400">{t("fromSong.hint")}</p>
      <Input
        type="file"
        accept="audio/*"
        onChange={(e) => {
          setSongFile(e.target.files?.[0] ?? null);
          setPreviewUrl(null);
        }}
      />
      <Button
        type="button"
        variant="outline"
        disabled={!songFile || separating}
        onClick={() => void handleSeparate()}
      >
        {separating && <Spinner />}
        {separating ? t("fromSong.working") : t("fromSong.separateButton")}
      </Button>
      {separating && <p className="text-xs text-gray-400 dark:text-gray-500">{t("fromSong.workingHint")}</p>}
      {error && <p className="text-sm text-red-500 dark:text-red-400">{error}</p>}
      {previewUrl && (
        <div className="grid gap-2">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio className="w-full" controls src={previewUrl} />
          <Button
            type="button"
            onClick={async () => {
              const blob = await fetch(previewUrl).then((r) => r.blob());
              onExtracted(new File([blob], "vocals.wav", { type: "audio/wav" }));
            }}
          >
            {t("fromSong.useThisButton")}
          </Button>
        </div>
      )}
    </div>
  );
}

function CreateVoiceForm({
  onCreate,
  onCreated,
  onClose,
}: Omit<CreateVoiceDialogProps, "open" | "onOpenChange"> & { onClose: () => void }) {
  const t = useTranslations("voiceLibrary");
  const tCommon = useTranslations("common");
  const [name, setName] = useState("");
  const [sample, setSample] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = name.trim();
  const canSubmit = trimmed.length > 0 && sample !== null && !submitting;

  const handleSubmit = async () => {
    if (!trimmed) {
      setError(t("form.nameRequired"));
      return;
    }
    if (!sample) {
      setError(t("form.sampleRequired"));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      onCreated(await onCreate(trimmed, sample));
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
        <DialogTitle>{t("createButton")}</DialogTitle>
        <DialogDescription>{t("form.sampleHint")}</DialogDescription>
      </DialogHeader>
      <div className="grid gap-1.5">
        <Label>{t("form.name")}</Label>
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("form.namePlaceholder")}
        />
      </div>

      <Tabs defaultValue="upload">
        <TabsList variant="default">
          <TabsTrigger value="upload">{t("fromSong.uploadTab")}</TabsTrigger>
          <TabsTrigger value="song">{t("fromSong.songTab")}</TabsTrigger>
        </TabsList>
        <TabsContent value="upload" className="pt-3">
          <div className="grid gap-1.5">
            <Label>{t("form.sample")}</Label>
            <Input
              type="file"
              accept="audio/*"
              onChange={(e) => setSample(e.target.files?.[0] ?? null)}
            />
          </div>
        </TabsContent>
        <TabsContent value="song" className="pt-3">
          <FromSongTab onExtracted={setSample} />
        </TabsContent>
      </Tabs>

      {sample && (
        <p className="text-xs text-gray-400 dark:text-gray-500">
          {t("form.sampleSelected", { name: sample.name })}
        </p>
      )}
      {error && <p className="text-sm text-red-500 dark:text-red-400">{error}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" disabled={submitting} onClick={onClose}>
          {tCommon("cancel")}
        </Button>
        <Button type="submit" disabled={!canSubmit}>
          {submitting && <Spinner />}
          {t("form.create")}
        </Button>
      </DialogFooter>
    </form>
  );
}
