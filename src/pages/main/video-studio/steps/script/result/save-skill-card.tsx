import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useTranslations } from "@/i18n";
import { apiClient } from "@/lib/api-client";
import type { ScriptAnalyzeResult } from "@shared/types";
import { useState } from "react";

/** Saves the analyzed style + pacing as a reusable skill. */
export default function SaveSkillCard({
  result,
  exampleVersionId,
  onSaved,
  onError,
}: {
  result: ScriptAnalyzeResult;
  /** An approved version to attach as the skill's first example. */
  exampleVersionId?: string;
  onSaved: () => void;
  onError: (message: string) => void;
}) {
  const t = useTranslations("videoStudio.script");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const totalDurationSec = result.scenes.reduce(
        (sum, scene) => sum + scene.estimatedDurationSec,
        0,
      );
      const avgShotLengthSec =
        result.scenes.length > 0 ? totalDurationSec / result.scenes.length : 0;
      const cutsPerMinute =
        totalDurationSec > 0 ? (result.scenes.length / totalDurationSec) * 60 : 0;

      const skill = await apiClient.templates.save({
        name: name.trim(),
        genre: result.style.genre,
        styleTags: result.style.styleTags,
        toneDescription: result.style.toneDescription,
        pacing: { avgShotLengthSec, cutsPerMinute },
        resourceInventory: { ...result.resources },
      });
      if (exampleVersionId) {
        await apiClient.templates.update(skill.id, { exampleIds: [exampleVersionId] });
      }
      setSaved(true);
      onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Field>
        <FieldLabel>{t("skillNameLabel")}</FieldLabel>
        <div className="flex gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("skillNamePlaceholder")}
          />
          <Button
            type="button"
            onClick={() => void handleSave()}
            disabled={!name.trim() || saving}
          >
            {saving && <Spinner />}
            {t("saveSkillButton")}
          </Button>
        </div>
      </Field>

      {saved && (
        <Alert variant="success">
          <AlertDescription>{t("skillSaved")}</AlertDescription>
        </Alert>
      )}
    </>
  );
}
