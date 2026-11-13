import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTranslations } from "@/i18n";
import { MicrophoneIcon, TrashBinIcon } from "@/icons";
import type { VoiceProfile } from "@shared/types";

interface VoiceCardProps {
  profile: VoiceProfile;
  onDelete: () => void;
  onQuickPreview: () => void;
}

export function VoiceCard({ profile, onDelete, onQuickPreview }: VoiceCardProps) {
  const t = useTranslations("voiceLibrary");

  return (
    <div className="glass-flat flex flex-col rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex items-start gap-2">
        <h3 className="min-w-0 flex-1 truncate text-base font-semibold text-gray-800 dark:text-white/90">
          {profile.name}
        </h3>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          title={t("ttsPanel.quickPreviewButton")}
          onClick={onQuickPreview}
        >
          <MicrophoneIcon className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          title={t("deleteButton")}
          onClick={onDelete}
        >
          <TrashBinIcon className="size-4" />
        </Button>
      </div>
      <div className="mt-1 flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
        <span>{new Date(profile.createdAt).toLocaleDateString()}</span>
        {profile.presetVoiceId && (
          <Badge variant="light" color="primary" size="sm">
            {t("presets.installedBadge")}
          </Badge>
        )}
      </div>
      {profile.sampleFileId && (
        <audio className="mt-3 w-full" controls src={`/api/files/${profile.sampleFileId}`} />
      )}
    </div>
  );
}
