import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { useTranslations } from "@/i18n";
import type { EditRecipe, RevealAnimation } from "@shared/edit-recipe";
import { useState } from "react";

const ANIMATIONS: RevealAnimation[] = ["none", "pop", "fade"];

/**
 * The editing skill's recipe, editable in place: what the CapCut export
 * will do (camera, how elements appear, subtitles, music level). Saving
 * writes it back into the skill, so every video using the skill follows it.
 */
export default function RecipeEditor({
  recipe,
  canSave,
  saving,
  onSave,
}: {
  recipe: EditRecipe;
  /** False when the plan runs on the default recipe (no editing skill picked). */
  canSave: boolean;
  saving: boolean;
  onSave: (recipe: EditRecipe) => void;
}) {
  const t = useTranslations("videoStudio.editPlan.recipe");
  const [draft, setDraft] = useState<EditRecipe>(recipe);
  const dirty = JSON.stringify(draft) !== JSON.stringify(recipe);
  const update = <K extends keyof EditRecipe>(key: K, patch: Partial<EditRecipe[K]>) =>
    setDraft((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));

  const select = <T extends string>(id: string, label: string, value: T, options: T[], onChange: (v: T) => void) => (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={(v) => onChange(v as T)}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue>{() => t(`options.${value}`)}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {t(`options.${option}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
  const number = (id: string, label: string, value: number, onChange: (v: number) => void, step = 10) => (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type="number" step={step} value={value} onChange={(e) => onChange(Number(e.target.value) || 0)} />
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {select("recipe-camera", t("camera"), draft.camera.motion, ["none", "fromShots"], (motion) =>
          update("camera", { motion }),
        )}
        {number("recipe-intensity", t("intensity"), draft.camera.intensity, (intensity) => update("camera", { intensity }), 0.1)}
        {number("recipe-drift", t("holdDrift"), draft.camera.holdDrift, (holdDrift) => update("camera", { holdDrift }), 0.01)}
        {number("recipe-sprite-ms", t("spriteMs"), draft.sprite.frameMs, (frameMs) => update("sprite", { frameMs }))}
        {select("recipe-reveal-mode", t("revealMode"), draft.reveal.mode, ["together", "sequential"], (mode) =>
          update("reveal", { mode }),
        )}
        {select("recipe-reveal-animation", t("revealAnimation"), draft.reveal.animation, ANIMATIONS, (animation) =>
          update("reveal", { animation }),
        )}
        {number("recipe-reveal-ms", t("revealMs"), draft.reveal.durationMs, (durationMs) => update("reveal", { durationMs }))}
        {number("recipe-lead-ms", t("leadMs"), draft.reveal.leadMs, (leadMs) => update("reveal", { leadMs }))}
        {select("recipe-text-animation", t("textAnimation"), draft.text.animation, ANIMATIONS, (animation) =>
          update("text", { animation }),
        )}
        {number("recipe-text-ms", t("textMs"), draft.text.durationMs, (durationMs) => update("text", { durationMs }))}
        {number("recipe-music-db", t("musicDb"), draft.music.volumeDb, (volumeDb) => update("music", { volumeDb }), 1)}
        <div className="flex items-center gap-2 self-end pb-2">
          <Switch
            id="recipe-subtitles"
            checked={draft.subtitles.enabled}
            onCheckedChange={(enabled) => update("subtitles", { enabled })}
          />
          <Label htmlFor="recipe-subtitles">{t("subtitles")}</Label>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          size="sm"
          disabled={!canSave || !dirty || saving}
          onClick={() => onSave(draft)}
          className="gap-1.5"
        >
          {saving && <Spinner className="size-4" />}
          {t("save")}
        </Button>
        {!canSave && <p className="text-xs text-gray-500 dark:text-gray-400">{t("needsSkill")}</p>}
      </div>
    </div>
  );
}
