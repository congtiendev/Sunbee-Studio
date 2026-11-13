import type { ComponentType } from "react";
import type { ScriptSourceState } from "../source-state";
import DocumentPanel from "./document-panel";
import IdeaPanel from "./idea-panel";
import LinkPanel from "./link-panel";
import TemplatePanel from "./template-panel";
import UploadPanel from "./upload-panel";

/**
 * Where a script can come from. Each source is one entry here plus (when it
 * needs extra inputs) a panel component; the source picker and the step
 * render straight from this list.
 */
export type ScriptSourceKey = "link" | "upload" | "document" | "idea" | "template" | "import";

export interface ScriptSourcePanelProps {
  step: ScriptSourceState;
}

export interface ScriptSourceDefinition {
  key: ScriptSourceKey;
  /** Key under `videoStudio.script`. */
  labelKey: string;
  /** Extra inputs shown above the script editor. */
  Panel?: ComponentType<ScriptSourcePanelProps>;
  /** Whether the script editor shows the "this is the fetched result" hint. */
  producesScript: boolean;
}

export const SCRIPT_SOURCES: ScriptSourceDefinition[] = [
  { key: "link", labelKey: "fromLink", Panel: LinkPanel, producesScript: true },
  { key: "upload", labelKey: "uploadVideo", Panel: UploadPanel, producesScript: true },
  { key: "document", labelKey: "fromDocumentSource", Panel: DocumentPanel, producesScript: true },
  { key: "idea", labelKey: "fromIdeaSource", Panel: IdeaPanel, producesScript: true },
  { key: "template", labelKey: "fromTemplateSource", Panel: TemplatePanel, producesScript: true },
  { key: "import", labelKey: "importScript", producesScript: false },
];
