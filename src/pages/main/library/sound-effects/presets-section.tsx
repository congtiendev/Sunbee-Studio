import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useTranslations } from "@/i18n";
import type { Translator } from "@/i18n";
import { FolderIcon } from "@/icons";
import { apiClient } from "@/lib/api-client";
import { PackSoundsDialog } from "@/pages/main/library/sound-effects/pack-sounds-dialog";
import type { LibraryAsset, SoundEffectPack } from "@shared/types";
import { useEffect, useMemo, useState } from "react";

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

interface PacksSectionProps {
  /** The user's sound library, to list an installed pack's sounds. */
  assets: LibraryAsset[];
  onInstalled: (assets: LibraryAsset[]) => void;
}

function PackCard({
  pack,
  installing,
  onInstall,
  onOpen,
  t,
}: {
  pack: SoundEffectPack;
  installing: boolean;
  onInstall: () => void;
  onOpen: () => void;
  t: Translator;
}) {
  const className =
    "flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 text-start dark:border-gray-800 dark:bg-white/[0.03]";
  const body = (
    <>
      <FolderIcon className="size-5 shrink-0 text-gray-400 dark:text-gray-500" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-800 dark:text-white/90">{pack.title}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <Badge variant="light" color={pack.license.startsWith("CC0") ? "success" : "warning"} size="sm">
            {pack.license}
          </Badge>
          {pack.soundCount > 0 && (
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {t("packs.soundCount", { count: pack.soundCount })}
            </span>
          )}
        </div>
        {pack.description && (
          <p className="mt-1 line-clamp-2 text-xs text-gray-400 dark:text-gray-500" title={pack.description}>
            {pack.description}
          </p>
        )}
      </div>
      {pack.installed ? (
        <Badge variant="light" color="success" size="sm">
          {t("packs.installedBadge")}
        </Badge>
      ) : (
        <Button type="button" size="sm" variant="outline" disabled={installing} onClick={onInstall}>
          {installing && <Spinner />}
          {t("packs.installButton")}
        </Button>
      )}
    </>
  );

  // An installed pack opens its sounds for preview; one not yet added only offers "Add".
  return pack.installed ? (
    <button
      type="button"
      title={t("packs.listenHint")}
      onClick={onOpen}
      className={`${className} cursor-pointer transition-colors hover:border-brand-300 hover:bg-gray-50 dark:hover:border-brand-800 dark:hover:bg-white/[0.06]`}
    >
      {body}
    </button>
  ) : (
    <div className={className}>{body}</div>
  );
}

/** Catalog of ready-made CC0 sound-effect packs (SFX Kit, Kenney.nl) — one pack = one category/folder's worth of sounds. */
export function PacksSection({ assets, onInstalled }: PacksSectionProps) {
  const t = useTranslations("soundEffects");
  const [packs, setPacks] = useState<SoundEffectPack[]>([]);
  const [loading, setLoading] = useState(true);
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openPack, setOpenPack] = useState<SoundEffectPack | null>(null);

  useEffect(() => {
    apiClient.assets.soundPacks
      .list()
      .then(setPacks)
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  // Each pack IS a category/folder (its title is the category name) — group
  // by source so the two catalogs read as two clearly separate folder trees
  // instead of one flat, undifferentiated grid.
  const groups = useMemo(() => {
    const bySource = new Map<string, SoundEffectPack[]>();
    for (const pack of packs) {
      const list = bySource.get(pack.source) ?? [];
      list.push(pack);
      bySource.set(pack.source, list);
    }
    return [...bySource.entries()];
  }, [packs]);

  const handleInstall = async (pack: SoundEffectPack) => {
    setInstallingId(pack.id);
    setError(null);
    try {
      const assets = await apiClient.assets.soundPacks.install(pack.id);
      setPacks((prev) => prev.map((p) => (p.id === pack.id ? { ...p, installed: true } : p)));
      onInstalled(assets);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setInstallingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    );
  }

  return (
    <div>
      <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">{t("packs.intro")}</p>
      {error && <p className="mb-2 text-sm text-red-500 dark:text-red-400">{error}</p>}
      {packs.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">{t("packs.empty")}</p>
      ) : (
        groups.map(([source, sourcePacks]) => (
          <div key={source} className="mb-4 last:mb-0">
            <h4 className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-300">
              {source}
              <span className="text-xs font-normal text-gray-400 dark:text-gray-500">
                {t("packs.folderCount", { count: sourcePacks.length })}
              </span>
            </h4>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {sourcePacks.map((pack) => (
                <PackCard
                  key={pack.id}
                  pack={pack}
                  installing={installingId === pack.id}
                  onInstall={() => void handleInstall(pack)}
                  onOpen={() => setOpenPack(pack)}
                  t={t}
                />
              ))}
            </div>
          </div>
        ))
      )}
      <PackSoundsDialog
        pack={openPack}
        sounds={openPack ? assets.filter((asset) => asset.sourcePackId === openPack.id) : []}
        onOpenChange={(open) => !open && setOpenPack(null)}
      />
    </div>
  );
}
