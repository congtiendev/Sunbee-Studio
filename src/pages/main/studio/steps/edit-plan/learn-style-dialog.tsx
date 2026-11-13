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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { useTranslations } from "@/i18n";
import { apiClient } from "@/lib/api-client";
import type { EditStyleLearnResponse } from "@shared/edit-plan";
import { useState } from "react";

/**
 * Paste a sample video's link, get an editing skill: the server downloads it,
 * measures cuts/reveals/music and has an AI read contact sheets of its
 * frames (about a minute). The new skill becomes this video's editing skill.
 */
export default function LearnStyleDialog({
  open,
  onOpenChange,
  onLearned,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLearned: (result: EditStyleLearnResponse) => void;
}) {
  const t = useTranslations("videoStudio.editPlan.learn");
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<EditStyleLearnResponse | null>(null);

  const learn = async () => {
    setWorking(true);
    setError(null);
    setResult(null);
    try {
      const learned = await apiClient.editPlan.learnStyle({ url: url.trim(), name: name.trim() || undefined });
      setResult(learned);
      onLearned(learned);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setWorking(false);
    }
  };

  const m = result?.measurements;
  return (
    <Dialog open={open} onOpenChange={(next) => !working && onOpenChange(next)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="learn-url">{t("url")}</Label>
            <Input
              id="learn-url"
              placeholder="https://www.youtube.com/watch?v=…"
              value={url}
              disabled={working}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="learn-name">{t("name")}</Label>
            <Input
              id="learn-name"
              placeholder={t("namePlaceholder")}
              value={name}
              disabled={working}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          {working && (
            <p className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <Spinner className="size-4" />
              {t("working")}
            </p>
          )}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {result && m && (
            <div className="space-y-2 rounded-xl border border-green-200 bg-green-50/60 p-3 text-sm dark:border-green-500/30 dark:bg-green-500/10">
              <p className="font-medium text-green-800 dark:text-green-300">
                {t("done", { name: result.skill.name })}
              </p>
              <p className="text-gray-700 dark:text-gray-300">{result.summary}</p>
              <ul className="list-disc space-y-0.5 ps-5 text-xs text-gray-600 dark:text-gray-400">
                <li>{t("facts.pacing", { mean: m.shotSec.mean, cuts: m.cutsPerMinute })}</li>
                <li>{t("facts.reveals", { reveals: m.revealsPerMinute })}</li>
                <li>{t("facts.pauses", { pct: m.cutInPausePct, baseline: m.pauseBaselinePct })}</li>
                <li>
                  {m.musicLikely
                    ? t("facts.music", { db: Math.round(m.speechDb - m.floorDb) })
                    : t("facts.noMusic")}
                </li>
              </ul>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={working} onClick={() => onOpenChange(false)}>
            {t(result ? "close" : "cancel")}
          </Button>
          <Button type="button" disabled={working || !url.trim()} onClick={() => void learn()} className="gap-1.5">
            {working && <Spinner className="size-4" />}
            {t("submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
