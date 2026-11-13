import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useTranslations } from "@/i18n";
import { PlayIcon } from "@/icons";
import type { VoiceProfile } from "@shared/types";
import { useVoicePreview } from "./use-voice-preview";

interface TextToSpeechPanelProps {
  profiles: VoiceProfile[];
  selectedProfileId: string | undefined;
  onSelectedProfileIdChange: (id: string) => void;
}

/** Pick any saved voice, type text, hear it — the one text-to-speech converter for the whole library. */
export function TextToSpeechPanel({
  profiles,
  selectedProfileId,
  onSelectedProfileIdChange,
}: TextToSpeechPanelProps) {
  const t = useTranslations("voiceLibrary");
  const { text, setText, generating, slow, error, previewUrl, audioRef, generate } =
    useVoicePreview(selectedProfileId);

  const selected = profiles.find((p) => p.id === selectedProfileId);

  return (
    <div className="glass-flat mb-4 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
        {t("ttsPanel.title")}
      </h3>
      <div className="mt-3 grid gap-3 md:grid-cols-[240px_1fr]">
        <Field>
          <FieldLabel>{t("ttsPanel.selectLabel")}</FieldLabel>
          <Select value={selectedProfileId} onValueChange={(value) => onSelectedProfileIdChange(value as string)}>
            <SelectTrigger>
              <SelectValue placeholder={t("ttsPanel.selectPlaceholder")}>
                {() => selected?.name ?? t("ttsPanel.selectPlaceholder")}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {profiles.map((profile) => (
                <SelectItem key={profile.id} value={profile.id}>
                  {profile.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel>{t("ttsPanel.textLabel")}</FieldLabel>
          <Textarea
            rows={2}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t("ttsPanel.textPlaceholder")}
          />
        </Field>
      </div>

      {error && <p className="mt-2 text-sm text-red-500 dark:text-red-400">{error}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button
          type="button"
          className="gap-1.5"
          disabled={!selectedProfileId || !text.trim() || generating}
          onClick={() => void generate()}
        >
          {generating ? <Spinner /> : <PlayIcon className="size-4" />}
          {generating ? t("ttsPanel.generating") : t("ttsPanel.generateButton")}
        </Button>
        {generating && slow && (
          <p className="text-xs text-gray-400 dark:text-gray-500">{t("preview.engineNotReady")}</p>
        )}
        {previewUrl && (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <audio ref={audioRef} className="h-9 flex-1 min-w-48" controls src={previewUrl} />
        )}
      </div>
    </div>
  );
}
