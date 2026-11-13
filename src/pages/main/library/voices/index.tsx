import { PageBreadcrumb } from "@/components/shared/page-breadcrumb";
import { PageMeta } from "@/components/shared/page-meta";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { SkeletonCardGrid } from "@/components/shared/skeleton-blocks";
import { useTranslations } from "@/i18n";
import { PlusIcon } from "@/icons";
import { apiClient } from "@/lib/api-client";
import type { VoiceProfile } from "@shared/types";
import { useEffect, useState } from "react";
import { CreateVoiceDialog } from "./create-voice-dialog";
import { PresetsSection } from "./presets-section";
import { TextToSpeechPanel } from "./text-to-speech-panel";
import { VoiceCard } from "./voice-card";

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Voice library: reusable voices cloned from one reference sample each (local engine). */
export default function VoicesPage() {
  const t = useTranslations("voiceLibrary");
  const tNav = useTranslations("sidebar.items");

  const [profiles, setProfiles] = useState<VoiceProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<VoiceProfile | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState<string | undefined>(undefined);

  useEffect(() => {
    apiClient.voiceover
      .list()
      .then(setProfiles)
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <PageMeta title={tNav("voices")} description={t("pageDescription")} />
      <PageBreadcrumb pageTitle={t("pageTitle")} />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <p className="me-auto max-w-2xl text-sm text-gray-500 dark:text-gray-400">
          {t("pageDescription")}
        </p>
        <Button type="button" className="gap-1.5" onClick={() => setCreateOpen(true)}>
          <PlusIcon className="size-4" />
          {t("createButton")}
        </Button>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {profiles.length > 0 && (
        <TextToSpeechPanel
          profiles={profiles}
          selectedProfileId={selectedProfileId}
          onSelectedProfileIdChange={setSelectedProfileId}
        />
      )}

      <PresetsSection onInstalled={(profile) => setProfiles((prev) => [profile, ...prev])} />

      {loading ? (
        <SkeletonCardGrid count={6} />
      ) : profiles.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 px-6 py-12 text-center dark:border-gray-700">
          <p className="text-sm text-gray-500 dark:text-gray-400">{t("empty")}</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {profiles.map((profile) => (
            <VoiceCard
              key={profile.id}
              profile={profile}
              onDelete={() => setDeleteTarget(profile)}
              onQuickPreview={() => setSelectedProfileId(profile.id)}
            />
          ))}
        </div>
      )}

      <CreateVoiceDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreate={(name, sample) => apiClient.voiceover.create(name, sample)}
        onCreated={(profile) => setProfiles((prev) => [profile, ...prev])}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={t("deleteTitle")}
        description={t("deleteDescription", { name: deleteTarget?.name ?? "" })}
        confirmLabel={t("deleteButton")}
        onConfirm={async () => {
          if (!deleteTarget) return;
          await apiClient.voiceover.delete(deleteTarget.id);
          setProfiles((prev) => prev.filter((p) => p.id !== deleteTarget.id));
        }}
      />
    </div>
  );
}
