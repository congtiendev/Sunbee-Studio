import { SkeletonFieldRow } from "@/components/shared/skeleton-blocks";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useTranslations } from "@/i18n";
import { TrashBinIcon, UploadIcon } from "@/icons";
import { apiClient } from "@/lib/api-client";
import { zodResolver } from "@hookform/resolvers/zod";
import type { DocumentSummary, ScriptAnalysisSummary, SkillDetail } from "@shared/types";
import { useEffect, useRef, useState } from "react";
import { Controller, useForm, type FieldError as FormFieldError } from "react-hook-form";
import DocumentPicker from "../documents/document-picker";
import ExamplesPicker from "./examples-picker";
import { EMPTY_SKILL_FORM, skillFormSchema, splitTags, type SkillFormData } from "./schema";

const SECTION_TITLE = "text-sm font-semibold text-gray-800 dark:text-white/90";

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function toForm(skill: SkillDetail): SkillFormData {
  return {
    name: skill.name,
    description: skill.description ?? "",
    type: skill.type ?? "script",
    genre: skill.genre,
    styleTags: skill.styleTags.join(", "),
    toneDescription: skill.toneDescription,
    avgShotLengthSec: Number(skill.pacing.avgShotLengthSec.toFixed(1)),
    cutsPerMinute: Number(skill.pacing.cutsPerMinute.toFixed(1)),
    instructions: skill.instructions ?? "",
    graphicsStyle: skill.graphicsStyle ?? "",
  };
}

interface SkillEditorSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null → create a new skill. */
  skillId: string | null;
  onSaved: (skill: SkillDetail) => void;
}

export default function SkillEditorSheet({ open, onOpenChange, skillId, onSaved }: SkillEditorSheetProps) {
  const t = useTranslations("videoStudio.skills");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-2xl">
        <DialogHeader className="pe-10">
          <DialogTitle>{skillId ? t("editor.editTitle") : t("editor.createTitle")}</DialogTitle>
          <DialogDescription>{t("editor.description")}</DialogDescription>
        </DialogHeader>
        {/* Mounted per open/skill so every open starts from fresh server data. */}
        {open && (
          <SkillEditorBody
            key={skillId ?? "new"}
            skillId={skillId}
            onCancel={() => onOpenChange(false)}
            onSaved={(skill) => {
              onSaved(skill);
              onOpenChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function SkillEditorBody({
  skillId,
  onCancel,
  onSaved,
}: {
  skillId: string | null;
  onCancel: () => void;
  onSaved: (skill: SkillDetail) => void;
}) {
  const t = useTranslations("videoStudio.skills");
  const [detail, setDetail] = useState<SkillDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(skillId !== null);
  const [analyzed, setAnalyzed] = useState<ScriptAnalysisSummary[]>([]);
  const [loadingAnalyzed, setLoadingAnalyzed] = useState(true);
  const [exampleIds, setExampleIds] = useState<string[]>([]);
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [loadingDocuments, setLoadingDocuments] = useState(true);
  const [documentIds, setDocumentIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  // A new skill has no id yet, so a picked file waits here and uploads right after creation.
  const [pendingReferenceImage, setPendingReferenceImage] = useState<File | null>(null);
  const [pendingReferenceImagePreview, setPendingReferenceImagePreview] = useState<string | null>(null);
  const [referenceImageBusy, setReferenceImageBusy] = useState(false);
  const referenceImageInputRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    reset,
    control,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<SkillFormData>({
    resolver: zodResolver(skillFormSchema),
    defaultValues: EMPTY_SKILL_FORM,
    mode: "onTouched",
  });
  const skillType = watch("type");

  useEffect(() => {
    let active = true;
    apiClient.script
      .analyzed()
      .then((rows) => {
        if (active) setAnalyzed(rows);
      })
      .catch((err) => {
        if (active) setError(errorMessage(err));
      })
      .finally(() => {
        if (active) setLoadingAnalyzed(false);
      });
    apiClient.documents
      .list()
      .then((rows) => {
        if (active) setDocuments(rows);
      })
      .catch((err) => {
        if (active) setError(errorMessage(err));
      })
      .finally(() => {
        if (active) setLoadingDocuments(false);
      });
    if (skillId) {
      apiClient.templates
        .get(skillId)
        .then((skill) => {
          if (!active) return;
          setDetail(skill);
          setExampleIds(skill.examples.map((example) => example.id));
          setDocumentIds(skill.documents.map((doc) => doc.id));
          reset(toForm(skill));
        })
        .catch((err) => {
          if (active) setError(errorMessage(err));
        })
        .finally(() => {
          if (active) setLoadingDetail(false);
        });
    }
    return () => {
      active = false;
    };
  }, [skillId, reset]);

  useEffect(() => {
    return () => {
      if (pendingReferenceImagePreview) URL.revokeObjectURL(pendingReferenceImagePreview);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cleanup-only, revokes whatever was last set
  }, []);

  const onSubmit = async (data: SkillFormData) => {
    setError(null);
    const fields = {
      name: data.name.trim(),
      description: data.description.trim(),
      type: data.type,
      genre: data.genre.trim(),
      styleTags: splitTags(data.styleTags),
      toneDescription: data.toneDescription.trim(),
      pacing: { avgShotLengthSec: data.avgShotLengthSec, cutsPerMinute: data.cutsPerMinute },
      instructions: data.instructions,
      graphicsStyle: data.graphicsStyle,
    };
    try {
      const id =
        skillId ??
        (await apiClient.templates.save({ ...fields, resourceInventory: {} })).id;
      let saved = await apiClient.templates.update(id, { ...fields, exampleIds, documentIds });
      if (pendingReferenceImage) {
        saved = await apiClient.templates.setReferenceImage(id, pendingReferenceImage);
      }
      onSaved(saved);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const pickReferenceImage = (file: File) => {
    setPendingReferenceImagePreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    if (skillId) {
      setReferenceImageBusy(true);
      apiClient.templates
        .setReferenceImage(skillId, file)
        .then((skill) => {
          setDetail(skill);
          setPendingReferenceImagePreview((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return null;
          });
        })
        .catch((err) => setError(errorMessage(err)))
        .finally(() => setReferenceImageBusy(false));
    } else {
      setPendingReferenceImage(file);
    }
  };

  const removeReferenceImage = () => {
    setPendingReferenceImagePreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setPendingReferenceImage(null);
    if (skillId && detail?.referenceImageFileId) {
      setReferenceImageBusy(true);
      apiClient.templates
        .deleteReferenceImage(skillId)
        .then(setDetail)
        .catch((err) => setError(errorMessage(err)))
        .finally(() => setReferenceImageBusy(false));
    }
  };

  const referenceImagePreviewUrl =
    pendingReferenceImagePreview ??
    (detail?.referenceImageFileId ? apiClient.documents.fileUrl(detail.referenceImageFileId) : null);

  // Examples the skill already has but that aren't in the picker list (e.g. imported, video-less).
  const pickerOptions = [
    ...(detail?.examples ?? []).filter((example) => !analyzed.some((a) => a.id === example.id)),
    ...analyzed,
  ];

  const translatedError = (fieldError?: FormFieldError) =>
    fieldError?.message ? [{ message: t(`form.${fieldError.message}`) }] : undefined;

  if (loadingDetail) {
    return (
      <div className="space-y-6 px-1">
        <div className="space-y-4">
          <SkeletonFieldRow />
          <SkeletonFieldRow />
        </div>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <SkeletonFieldRow />
            <SkeletonFieldRow />
          </div>
          <SkeletonFieldRow />
        </div>
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      className="-mx-6 flex min-h-0 flex-1 flex-col"
    >
      <div className="flex-1 space-y-6 overflow-y-auto px-6 custom-scrollbar">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {detail?.origin === "anthropic" && (
          <Alert variant="info">
            <AlertDescription>{t("editor.agentSkillHint")}</AlertDescription>
          </Alert>
        )}

        <section className="space-y-4">
          <Field data-invalid={Boolean(errors.name)}>
            <FieldLabel>{t("form.name")}</FieldLabel>
            <Input
              {...register("name")}
              placeholder={t("form.namePlaceholder")}
              aria-invalid={errors.name ? "true" : undefined}
            />
            <FieldError errors={translatedError(errors.name)} />
          </Field>
          <Field>
            <FieldLabel>{t("form.description")}</FieldLabel>
            <Input {...register("description")} placeholder={t("form.descriptionPlaceholder")} />
          </Field>
          <Field>
            <FieldLabel>{t("form.type")}</FieldLabel>
            <Controller
              control={control}
              name="type"
              render={({ field }) => (
                <RadioGroup
                  value={field.value}
                  onValueChange={field.onChange}
                  className="flex flex-wrap items-center gap-6"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem id="skill-type-script" value="script" />
                    <Label htmlFor="skill-type-script" className="cursor-pointer">
                      {t("form.typeScript")}
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem id="skill-type-image" value="image" />
                    <Label htmlFor="skill-type-image" className="cursor-pointer">
                      {t("form.typeImage")}
                    </Label>
                  </div>
                </RadioGroup>
              )}
            />
            <FieldDescription>{t("form.typeHint")}</FieldDescription>
          </Field>
        </section>

        {skillType === "script" ? (
          <>
            <section className="space-y-4">
              <h3 className={SECTION_TITLE}>{t("form.styleSection")}</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel>{t("form.genre")}</FieldLabel>
                  <Input {...register("genre")} placeholder={t("form.genrePlaceholder")} />
                </Field>
                <Field>
                  <FieldLabel>{t("form.styleTags")}</FieldLabel>
                  <Input {...register("styleTags")} placeholder={t("form.styleTagsPlaceholder")} />
                </Field>
              </div>
              <Field>
                <FieldLabel>{t("form.tone")}</FieldLabel>
                <Input {...register("toneDescription")} placeholder={t("form.tonePlaceholder")} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field data-invalid={Boolean(errors.avgShotLengthSec)}>
                  <FieldLabel>{t("form.avgShotLength")}</FieldLabel>
                  <Input
                    type="number"
                    min={0}
                    step={0.1}
                    {...register("avgShotLengthSec", { valueAsNumber: true })}
                  />
                  <FieldError errors={translatedError(errors.avgShotLengthSec)} />
                </Field>
                <Field data-invalid={Boolean(errors.cutsPerMinute)}>
                  <FieldLabel>{t("form.cutsPerMinute")}</FieldLabel>
                  <Input
                    type="number"
                    min={0}
                    step={0.1}
                    {...register("cutsPerMinute", { valueAsNumber: true })}
                  />
                  <FieldError errors={translatedError(errors.cutsPerMinute)} />
                </Field>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">{t("form.styleHint")}</p>
            </section>

            <section className="space-y-2">
              <Field>
                <FieldLabel className={SECTION_TITLE}>{t("form.instructions")}</FieldLabel>
                <FieldDescription>{t("form.instructionsHint")}</FieldDescription>
                <Textarea
                  {...register("instructions")}
                  rows={10}
                  className="font-mono text-xs"
                  placeholder={t("form.instructionsPlaceholder")}
                />
              </Field>
            </section>
          </>
        ) : (
          <section className="space-y-4">
            <Field>
              <FieldLabel className={SECTION_TITLE}>{t("form.graphicsStyle")}</FieldLabel>
              <FieldDescription>{t("form.graphicsStyleHint")}</FieldDescription>
              <Textarea
                {...register("graphicsStyle")}
                rows={10}
                className="font-mono text-xs"
                placeholder={t("form.graphicsStylePlaceholder")}
              />
            </Field>

            <Field>
              <FieldLabel className={SECTION_TITLE}>{t("form.referenceImage")}</FieldLabel>
              <FieldDescription>{t("form.referenceImageHint")}</FieldDescription>
              <input
                ref={referenceImageInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) pickReferenceImage(file);
                }}
              />
              {referenceImagePreviewUrl ? (
                <div className="flex items-center gap-3">
                  <img
                    src={referenceImagePreviewUrl}
                    alt=""
                    className="size-20 rounded-lg border border-gray-200 object-cover dark:border-gray-800"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    disabled={referenceImageBusy}
                    onClick={removeReferenceImage}
                  >
                    {referenceImageBusy ? <Spinner /> : <TrashBinIcon className="size-4" />}
                    {t("form.referenceImageRemove")}
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-fit gap-1.5"
                  disabled={referenceImageBusy}
                  onClick={() => referenceImageInputRef.current?.click()}
                >
                  {referenceImageBusy ? <Spinner /> : <UploadIcon className="size-4" />}
                  {t("form.referenceImageUpload")}
                </Button>
              )}
            </Field>
          </section>
        )}

        {skillType === "script" && (
          <>
            <section className="space-y-3 pb-2">
              <div className="flex items-center gap-2">
                <h3 className={SECTION_TITLE}>{t("examples.title")}</h3>
                <Badge variant="light" color="gray" size="sm">
                  {exampleIds.length}
                </Badge>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">{t("examples.hint")}</p>
              <ExamplesPicker
                options={pickerOptions}
                loading={loadingAnalyzed}
                selected={exampleIds}
                onChange={setExampleIds}
              />
            </section>

            <section className="space-y-3 pb-2">
              <div className="flex items-center gap-2">
                <h3 className={SECTION_TITLE}>{t("documents.title")}</h3>
                <Badge variant="light" color="gray" size="sm">
                  {documentIds.length}
                </Badge>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">{t("documents.hint")}</p>
              <DocumentPicker
                documents={documents}
                loading={loadingDocuments}
                selected={documentIds}
                onChange={setDocumentIds}
              />
            </section>
          </>
        )}
      </div>

      <DialogFooter className="border-t border-gray-100 px-6 pt-4 dark:border-gray-800">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t("editor.cancel")}
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Spinner />}
          {t("editor.save")}
        </Button>
      </DialogFooter>
    </form>
  );
}
