import { PageBreadcrumb } from "@/components/shared/page-breadcrumb";
import { PageMeta } from "@/components/shared/page-meta";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SkeletonCardGrid } from "@/components/shared/skeleton-blocks";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useTranslations } from "@/i18n";
import { apiClient } from "@/lib/api-client";
import type { LibraryAsset } from "@shared/types";
import { useEffect, useMemo, useState } from "react";
import { PacksSection } from "./presets-section";
import { SoundCard } from "./sound-card";

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const UNCATEGORIZED = "__uncategorized__";

/** Sound-effect library: install ready-made packs (SFX Kit, Kenney.nl — both CC0), browse by category/folder. */
export default function SoundEffectsPage() {
  const t = useTranslations("soundEffects");
  const tNav = useTranslations("sidebar.items");

  const [assets, setAssets] = useState<LibraryAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<string>("all");
  const [deleteTarget, setDeleteTarget] = useState<LibraryAsset | null>(null);

  const reload = () =>
    apiClient.assets.library
      .list({ type: "audio" })
      .then(setAssets)
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));

  useEffect(() => {
    void reload();
  }, []);

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const asset of assets) {
      const key = asset.category ?? UNCATEGORIZED;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [assets]);

  const visible = assets.filter((asset) =>
    category === "all" ? true : (asset.category ?? UNCATEGORIZED) === category,
  );

  return (
    <div>
      <PageMeta title={tNav("soundEffects")} description={t("pageDescription")} />
      <PageBreadcrumb pageTitle={t("pageTitle")} />

      <p className="mb-4 max-w-2xl text-sm text-gray-500 dark:text-gray-400">{t("pageDescription")}</p>

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <PacksSection onInstalled={(installed) => setAssets((prev) => [...installed, ...prev])} />

      <h3 className="mb-2 mt-2 text-base font-semibold text-gray-800 dark:text-white/90">{t("library.title")}</h3>

      {loading ? (
        <SkeletonCardGrid count={6} />
      ) : assets.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 px-6 py-12 text-center dark:border-gray-700">
          <p className="text-sm text-gray-500 dark:text-gray-400">{t("library.empty")}</p>
        </div>
      ) : (
        <>
          <ToggleGroup
            variant="outline"
            className="mb-4 flex-wrap"
            value={[category]}
            onValueChange={(value) => setCategory((value[0] as string | undefined) ?? "all")}
          >
            <ToggleGroupItem value="all">{t("library.allCategories", { count: assets.length })}</ToggleGroupItem>
            {categories.map(([key, count]) => (
              <ToggleGroupItem key={key} value={key}>
                {key === UNCATEGORIZED ? t("library.uncategorized") : key} ({count})
              </ToggleGroupItem>
            ))}
          </ToggleGroup>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visible.map((asset) => (
              <SoundCard key={asset.id} asset={asset} onDelete={() => setDeleteTarget(asset)} />
            ))}
          </div>
        </>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={t("deleteTitle")}
        description={t("deleteDescription", { name: deleteTarget?.name ?? "" })}
        confirmLabel={t("deleteButton")}
        onConfirm={async () => {
          if (!deleteTarget) return;
          await apiClient.assets.library.delete(deleteTarget.id);
          setAssets((prev) => prev.filter((a) => a.id !== deleteTarget.id));
        }}
      />
    </div>
  );
}
