import { z } from "zod";

/** Messages are i18n keys under `videoStudio.skills.form`. */
export const skillFormSchema = z.object({
  name: z.string().trim().min(1, "nameRequired"),
  description: z.string(),
  genre: z.string(),
  /** Comma-separated in the form, an array in the API. */
  styleTags: z.string(),
  toneDescription: z.string(),
  avgShotLengthSec: z.number({ invalid_type_error: "numberInvalid" }).min(0, "numberInvalid"),
  cutsPerMinute: z.number({ invalid_type_error: "numberInvalid" }).min(0, "numberInvalid"),
  instructions: z.string(),
});

export type SkillFormData = z.infer<typeof skillFormSchema>;

export const EMPTY_SKILL_FORM: SkillFormData = {
  name: "",
  description: "",
  genre: "",
  styleTags: "",
  toneDescription: "",
  avgShotLengthSec: 0,
  cutsPerMinute: 0,
  instructions: "",
};

export function splitTags(value: string): string[] {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}
