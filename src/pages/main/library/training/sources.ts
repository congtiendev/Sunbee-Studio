import { DocIcon, LinkIcon, UploadIcon, type IconProps } from "@/icons";
import { paths } from "@/lib/paths";
import type { TrainingSourceKind } from "@shared/types";
import type { ComponentType } from "react";
import DocumentAdder from "./adders/document-adder";
import LinkAdder from "./adders/link-adder";
import type { SourceAdderProps } from "./adders/types";
import UploadAdder from "./adders/upload-adder";

/**
 * How each training source kind looks on the training page — the same three ways
 * the Script step gets a script. Candidates come from the server
 * (`server/modules/training/sources/`); a new kind needs an entry here and
 * `training.sources.<kind>` in both message files.
 */
export const TRAINING_SOURCE_UI: Record<
  TrainingSourceKind,
  {
    icon: ComponentType<IconProps>;
    /** Makes new material of this kind right on the page. */
    Adder: ComponentType<SourceAdderProps>;
    /** Where the user manages this kind outside training, if anywhere. */
    manageTo?: string;
  }
> = {
  link: { icon: LinkIcon, Adder: LinkAdder },
  upload: { icon: UploadIcon, Adder: UploadAdder },
  document: {
    icon: DocIcon,
    Adder: DocumentAdder,
    manageTo: paths.libraryDocuments,
  },
};

export type TrainingSelection = Partial<Record<TrainingSourceKind, string[]>>;

/** Kinds whose material is the author's own scripts (compared to learn the voice). */
export const SCRIPT_KINDS: TrainingSourceKind[] = ["link", "upload"];
