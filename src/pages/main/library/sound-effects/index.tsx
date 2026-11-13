import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { PageBreadcrumb } from "@/components/shared/page-breadcrumb";
import { PageMeta } from "@/components/shared/page-meta";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTranslations } from "@/i18n";
import { InfoCircleIcon, SearchIcon, XIcon } from "@/icons";
import { apiClient } from "@/lib/api-client";
import { BrowseTab } from "@/pages/main/library/sound-effects/browse-tab";
import { NowPlayingBar } from "@/pages/main/library/sound-effects/now-playing-bar";
import { PacksSection } from "@/pages/main/library/sound-effects/presets-section";
import { PreviewPlayer, PreviewPlayerContext } from "@/pages/main/library/sound-effects/preview-player";
import { SavedTab } from "@/pages/main/library/sound-effects/saved-tab";
import type { LibraryAsset, SystemSound, SystemSoundLibrary } from "@shared/types";
import { useEffect, useMemo, useState } from "react";

type TabKey = "browse" | "saved" | "packs";

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function RowsSkeleton() {
  return (
    <div className="flex flex-col gap-1">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-2 py-2">
          <Skeleton className="size-12 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/2" />
            <Skeleton className="h-3 w-1/4" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Sound library laid out like a story music picker: search on top, category
 * chips, a list where tapping a row previews it (one sound at a time) and a
 * bookmark saves it. Tabs: the system library, the user's saved sounds, and
 * the CC0 packs (SFX Kit, Kenney) installable by folder.
 */
export default function SoundEffectsPage() {
  const t = useTranslations("soundEffects");
  const tNav = useTranslations("sidebar.items");

  const [player] = useState(() => new PreviewPlayer());
  useEffect(() => () => player.dispose(), [player]);

  const [library, setLibrary] = useState<SystemSoundLibrary | null>(null);
  const [assets, setAssets] = useState<LibraryAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("browse");
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<Set<string>>(() => new Set());
  const [deleteTarget, setDeleteTarget] = useState<LibraryAsset | null>(null);

  useEffect(() => {
    Promise.all([apiClient.assets.systemSounds.list(), apiClient.assets.library.list({ type: "audio" })])
      .then(([systemLibrary, audio]) => {
        setLibrary(systemLibrary);
        setAssets(audio);
      })
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  // System sound id → the library asset it was saved as.
  const savedBySound = useMemo(() => {
    const map = new Map<string, LibraryAsset>();
    for (const asset of assets) {
      if (asset.sourcePackId?.startsWith("system:")) map.set(asset.sourcePackId.slice("system:".length), asset);
    }
    return map;
  }, [assets]);
  const savedIds = useMemo(() => new Set(savedBySound.keys()), [savedBySound]);

  const runPending = async (key: string, work: () => Promise<void>) => {
    setPending((prev) => new Set(prev).add(key));
    setError(null);
    try {
      await work();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const removeAsset = async (asset: LibraryAsset) => {
    await apiClient.assets.library.delete(asset.id);
    setAssets((prev) => prev.filter((a) => a.id !== asset.id));
  };

  const toggleSave = (sound: SystemSound) =>
    void runPending(sound.id, async () => {
      const existing = savedBySound.get(sound.id);
      if (existing) {
        await removeAsset(existing);
        return;
      }
      const asset = await apiClient.assets.systemSounds.save(sound.id);
      setAssets((prev) => [asset, ...prev.filter((a) => a.id !== asset.id)]);
    });

  const changeTab = (value: TabKey) => {
    player.stop();
    setTab(value);
  };

  return (
    <PreviewPlayerContext.Provider value={player}>
      <PageMeta title={tNav("soundEffects")} description={t("pageDescription")} />
      <PageBreadcrumb pageTitle={t("pageTitle")} />

      <div className="w-full">
        <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-6 dark:border-gray-800 dark:bg-white/[0.03]">
          <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">{t("pageDescription")}</p>

          {tab !== "packs" && (
            <div className="relative mb-4 max-w-2xl">
              <SearchIcon className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
              <Input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("searchPlaceholder")}
                aria-label={t("searchPlaceholder")}
                className="h-12 rounded-full border-transparent bg-gray-100 ps-12 pe-11 shadow-none [&::-webkit-search-cancel-button]:hidden dark:border-transparent dark:bg-white/[0.06]"
              />
              {query && (
                <button
                  type="button"
                  aria-label={t("clearSearch")}
                  onClick={() => setQuery("")}
                  className="absolute end-3 top-1/2 flex size-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-gray-400 hover:bg-gray-200 hover:text-gray-700 dark:hover:bg-white/10 dark:hover:text-gray-200"
                >
                  <XIcon className="size-4" />
                </button>
              )}
            </div>
          )}

          {error && <p className="mb-3 text-sm text-red-500 dark:text-red-400">{error}</p>}

          <Tabs value={tab} onValueChange={(value) => changeTab(value as TabKey)} className="gap-4">
            <TabsList variant="line" className="w-full justify-start">
              <TabsTrigger value="browse">{t("tabs.browse")}</TabsTrigger>
              <TabsTrigger value="saved" className="gap-1.5">
                {t("tabs.saved")}
                {assets.length > 0 && (
                  <Badge variant="light" color="gray" size="sm">
                    {assets.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="packs">{t("tabs.packs")}</TabsTrigger>
            </TabsList>

            <TabsContent value="browse">
              {loading ? (
                <RowsSkeleton />
              ) : (
                library && (
                <>
                  <BrowseTab
                    library={library}
                    query={query}
                    savedIds={savedIds}
                    pendingIds={pending}
                    onToggleSave={toggleSave}
                  />
                  {library.license && library.sounds.length > 0 && (
                    <p className="mt-6 flex items-start gap-2 text-xs text-gray-400 dark:text-gray-500">
                      <InfoCircleIcon className="mt-px size-4 shrink-0" />
                      {t("browse.licenseNote", { license: library.license })}
                    </p>
                  )}
                </>
                )
              )}
            </TabsContent>

            <TabsContent value="saved">
              {loading ? (
                <RowsSkeleton />
              ) : (
                <SavedTab
                  assets={assets}
                  query={query}
                  pendingIds={pending}
                  onUnsave={(asset) => void runPending(asset.id, () => removeAsset(asset))}
                  onDelete={setDeleteTarget}
                />
              )}
            </TabsContent>

            <TabsContent value="packs">
              <PacksSection
                assets={assets}
                onInstalled={(installed) => setAssets((prev) => [...installed, ...prev])}
              />
            </TabsContent>
          </Tabs>
        </div>
        <NowPlayingBar />
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={t("deleteTitle")}
        description={t("deleteDescription", { name: deleteTarget?.name ?? "" })}
        confirmLabel={t("deleteButton")}
        onConfirm={async () => {
          if (deleteTarget) await removeAsset(deleteTarget);
        }}
      />
    </PreviewPlayerContext.Provider>
  );
}
