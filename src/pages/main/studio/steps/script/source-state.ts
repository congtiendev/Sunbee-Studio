import type { ScriptStepState } from "./use-script-step";

/**
 * The slice of the script step the source panels, script editor and skill
 * picker read — so another owner (the video-render module) can drive the same
 * UI with its own storage. `ScriptStepState` satisfies it as-is.
 */
export type ScriptSourceState = Pick<
  ScriptStepState,
  // Shared AI options
  | "availableProviders"
  | "describeProvider"
  | "changeDescribeProvider"
  | "describeModel"
  | "setDescribeModel"
  | "effort"
  | "setEffort"
  | "scriptLanguage"
  | "setScriptLanguage"
  | "styleTemplates"
  | "selectedTemplateId"
  | "setSelectedTemplateId"
  // Link
  | "url"
  | "setUrl"
  | "linkUseAi"
  | "setLinkUseAi"
  | "linkOrigin"
  | "fetchFromLink"
  | "fetching"
  // Upload
  | "uploadFile"
  | "setUploadFile"
  | "transcribeUpload"
  | "transcribing"
  // Document
  | "sourceDocumentIds"
  | "setSourceDocumentIds"
  | "brief"
  | "setBrief"
  | "targetDurationSec"
  | "setTargetDurationSec"
  | "writeFromDocuments"
  // Idea
  | "idea"
  | "setIdea"
  | "ideaDurationSec"
  | "setIdeaDurationSec"
  | "writeFromIdea"
  // Template
  | "videoId"
  | "templateVersionId"
  | "setTemplateVersionId"
  | "topic"
  | "setTopic"
  | "templateDocumentIds"
  | "setTemplateDocumentIds"
  | "templateDurationSec"
  | "setTemplateDurationSec"
  | "writeFromTemplate"
  | "writing"
  // Script editor
  | "scriptText"
  | "setScriptText"
  | "busy"
  | "analyzing"
  | "elapsedSec"
>;
