import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTranslations } from "@/i18n";
import { usePreviewPlayer, type PreviewTrack } from "@/pages/main/library/sound-effects/preview-player";
import { SoundRow } from "@/pages/main/library/sound-effects/sound-row";
import type { LibraryAsset, SoundEffectPack } from "@shared/types";

interface PackSoundsDialogProps {
  pack: SoundEffectPack | null;
  /** The pack's installed sounds (library assets whose `sourcePackId` is the pack's id). */
  sounds: LibraryAsset[];
  onOpenChange: (open: boolean) => void;
}

/** Lists an installed pack's sounds as preview rows (tap to listen), same as the rest of the page. */
export function PackSoundsDialog({ pack, sounds, onOpenChange }: PackSoundsDialogProps) {
  const t = useTranslations("soundEffects");
  const player = usePreviewPlayer();
  const queue = sounds.map(
    (sound): PreviewTrack => ({
      id: `asset:${sound.id}`,
      src: `/api/files/${sound.fileId}`,
      title: sound.name,
      subtitle: sound.category ?? pack?.title ?? "",
    }),
  );

  return (
    <Dialog
      open={pack !== null}
      onOpenChange={(open) => {
        if (!open) player.stop();
        onOpenChange(open);
      }}
    >
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{pack?.title}</DialogTitle>
          <DialogDescription>
            {pack?.description ?? t("packs.soundCount", { count: sounds.length })}
          </DialogDescription>
        </DialogHeader>
        {sounds.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">{t("packs.noSounds")}</p>
        ) : (
          <div className="custom-scrollbar -mx-2 max-h-[60vh] overflow-y-auto">
            {queue.map((track) => (
              <SoundRow key={track.id} track={track} queue={queue} />
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
