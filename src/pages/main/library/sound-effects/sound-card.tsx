import { Button } from "@/components/ui/button";
import { useTranslations } from "@/i18n";
import { TrashBinIcon } from "@/icons";
import type { LibraryAsset } from "@shared/types";

interface SoundCardProps {
  asset: LibraryAsset;
  onDelete: () => void;
}

export function SoundCard({ asset, onDelete }: SoundCardProps) {
  const t = useTranslations("soundEffects");

  return (
    <div className="glass-flat flex flex-col rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-gray-800 dark:text-white/90" title={asset.name}>
          {asset.name}
        </p>
        <Button type="button" variant="ghost" size="icon-xs" title={t("deleteButton")} onClick={onDelete}>
          <TrashBinIcon className="size-4" />
        </Button>
      </div>
      <audio className="mt-2 w-full" controls src={`/api/files/${asset.fileId}`} />
    </div>
  );
}
