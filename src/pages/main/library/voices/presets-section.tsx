import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useTranslations } from "@/i18n";
import { PlayIcon } from "@/icons";
import { apiClient } from "@/lib/api-client";
import type { VoiceProfile, VoicePreset } from "@shared/types";
import { useEffect, useState } from "react";

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

interface PresetsSectionProps {
  onInstalled: (profile: VoiceProfile) => void;
}

/** Catalog of ready-made voices — ships empty until entries are added to presets/manifest.json. */
export function PresetsSection({ onInstalled }: PresetsSectionProps) {
  const t = useTranslations("voiceLibrary");
  const [presets, setPresets] = useState<VoicePreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [sampleText, setSampleText] = useState(t("presets.sampleTextDefault"));
  const [tryingId, setTryingId] = useState<string | null>(null);
  const [tryingSlow, setTryingSlow] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // First-ever "nghe thử" can take minutes (venv + pip install + model
  // download) — say so instead of leaving a bare spinner past a few seconds.
  useEffect(() => {
    if (!tryingId) {
      setTryingSlow(false);
      return;
    }
    const timer = setTimeout(() => setTryingSlow(true), 5_000);
    return () => clearTimeout(timer);
  }, [tryingId]);

  useEffect(() => {
    apiClient.voiceover.presets
      .list()
      .then(setPresets)
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  // Revoke the previous object URL whenever a new one replaces it (or this unmounts).
  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const handleInstall = async (preset: VoicePreset) => {
    setInstallingId(preset.id);
    setError(null);
    try {
      const profile = await apiClient.voiceover.presets.install(preset.id);
      setPresets((prev) => prev.map((p) => (p.id === preset.id ? { ...p, installed: true } : p)));
      onInstalled(profile);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setInstallingId(null);
    }
  };

  const handleTry = async (preset: VoicePreset) => {
    if (!sampleText.trim() || tryingId) return;
    setTryingId(preset.id);
    setError(null);
    try {
      const blob = await apiClient.voiceover.presets.preview(preset.id, sampleText.trim());
      setPreviewId(preset.id);
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setTryingId(null);
    }
  };

  if (loading) return null;

  return (
    <div className="mb-4">
      <h3 className="mb-2 text-base font-semibold text-gray-800 dark:text-white/90">
        {t("presets.title")}
      </h3>
      <Field className="mb-3 max-w-md">
        <FieldLabel>{t("presets.sampleTextLabel")}</FieldLabel>
        <Input
          value={sampleText}
          onChange={(e) => setSampleText(e.target.value)}
          placeholder={t("presets.sampleTextPlaceholder")}
        />
      </Field>
      {tryingId && tryingSlow && (
        <p className="mb-2 text-xs text-gray-400 dark:text-gray-500">{t("preview.engineNotReady")}</p>
      )}
      {error && <p className="mb-2 text-sm text-red-500 dark:text-red-400">{error}</p>}
      {presets.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">{t("presets.empty")}</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {presets.map((preset) => (
            <div
              key={preset.id}
              className="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-white/[0.03]"
            >
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-800 dark:text-white/90">
                    {preset.name}
                  </p>
                  {preset.license && (
                    <Badge
                      variant="light"
                      color={preset.commercialOk === true ? "success" : preset.commercialOk === false ? "error" : "warning"}
                      size="sm"
                      className="mt-1"
                    >
                      {preset.license}
                    </Badge>
                  )}
                  {preset.description && (
                    <p className="mt-1 line-clamp-2 text-xs text-gray-400 dark:text-gray-500" title={preset.description}>
                      {preset.description}
                    </p>
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  title={t("presets.tryButton")}
                  disabled={!sampleText.trim() || tryingId === preset.id}
                  onClick={() => void handleTry(preset)}
                >
                  {tryingId === preset.id ? <Spinner /> : <PlayIcon className="size-4" />}
                </Button>
                {preset.installed ? (
                  <Badge variant="light" color="success" size="sm">
                    {t("presets.installedBadge")}
                  </Badge>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={installingId === preset.id}
                    onClick={() => void handleInstall(preset)}
                  >
                    {installingId === preset.id && <Spinner />}
                    {t("presets.installButton")}
                  </Button>
                )}
              </div>
              {previewId === preset.id && previewUrl && (
                // eslint-disable-next-line jsx-a11y/media-has-caption
                <audio className="mt-2 w-full" controls autoPlay src={previewUrl} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
