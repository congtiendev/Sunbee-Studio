import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { SkeletonCard } from "@/components/shared/skeleton-blocks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTranslations } from "@/i18n";
import { ANALYZE_MODELS } from "@shared/script-cost-estimate";
import type { SkillVersion } from "@shared/types";
import { useState } from "react";
import GuidePreview from "./guide-preview";

function modelLabel(version: SkillVersion): string | null {
  if (!version.model) return null;
  const all = [...ANALYZE_MODELS.openai, ...ANALYZE_MODELS.claude];
  return all.find((m) => m.id === version.model)?.label ?? version.model;
}

/** A skill's versions, newest first: what each run learned from, its guide, and restore. */
export default function VersionHistory({
  versions,
  onRestore,
}: {
  versions: SkillVersion[] | null;
  onRestore: (versionId: string) => Promise<void>;
}) {
  const t = useTranslations("training.versions");
  const [openId, setOpenId] = useState<string | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<SkillVersion | null>(null);

  if (versions === null) {
    return (
      <div className="space-y-3">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }
  if (versions.length === 0) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400">{t("empty")}</p>
    );
  }

  return (
    <>
      <ol className="space-y-3">
        {versions.map((version, index) => {
          const isCurrent = index === 0;
          const open = openId === version.id;
          const model = modelLabel(version);
          return (
            <li
              key={version.id}
              className="rounded-xl border border-gray-200 p-3 dark:border-gray-800"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-gray-800 dark:text-white/90">
                  v{version.version}
                </span>
                <Badge
                  variant="light"
                  color={version.kind === "train" ? "primary" : "gray"}
                  size="sm"
                >
                  {t(`kinds.${version.kind}`)}
                </Badge>
                {isCurrent && (
                  <Badge variant="light" color="success" size="sm">
                    {t("current")}
                  </Badge>
                )}
                <span className="ms-auto text-xs text-gray-400 dark:text-gray-500">
                  {new Date(version.createdAt).toLocaleString()}
                </span>
              </div>

              {version.note && (
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                  {version.note}
                </p>
              )}
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {t("sourcesCount", { count: version.sources.length })}
                {version.kind === "train" &&
                  version.version > 1 &&
                  ` · ${t("addedCount", {
                    count: version.sources.filter((s) => s.added).length,
                  })}`}
                {model ? ` · ${model}` : ""}
              </p>
              {version.sources.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {version.sources.map((source) => (
                    <Badge
                      key={`${source.kind}-${source.id}`}
                      variant="light"
                      color={source.added ? "primary" : "gray"}
                      size="sm"
                      className="max-w-full min-w-0"
                      title={
                        source.added
                          ? `${t("addedInRun")}: ${source.label ?? ""}`
                          : (source.label ?? undefined)
                      }
                    >
                      {/* Long video names must not widen the card. */}
                      <span className="truncate">
                        {source.added ? "+ " : ""}
                        {source.label ?? t("deleted")}
                      </span>
                    </Badge>
                  ))}
                </div>
              )}

              <div className="mt-2 flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setOpenId(open ? null : version.id)}
                >
                  {open ? t("hide") : t("view")}
                </Button>
                {!isCurrent && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setRestoreTarget(version)}
                  >
                    {t("restore")}
                  </Button>
                )}
              </div>

              {open && (
                <GuidePreview
                  text={
                    version.snapshot.type === "image"
                      ? version.snapshot.graphicsStyle
                      : version.snapshot.instructions
                  }
                  className="mt-2 max-h-72"
                />
              )}
            </li>
          );
        })}
      </ol>

      <ConfirmDialog
        open={restoreTarget !== null}
        onOpenChange={(next) => !next && setRestoreTarget(null)}
        title={t("restoreTitle", { version: restoreTarget?.version ?? 0 })}
        description={t("restoreDescription", {
          version: restoreTarget?.version ?? 0,
        })}
        confirmLabel={t("restore")}
        destructive={false}
        onConfirm={() =>
          restoreTarget ? onRestore(restoreTarget.id) : Promise.resolve()
        }
      />
    </>
  );
}
