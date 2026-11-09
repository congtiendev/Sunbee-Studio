import { analyzeScriptTask } from "./analyze.js";
import { cleanCaptionsTask } from "./clean-captions.js";
import { describeFramesTask } from "./describe-frames.js";
import { scriptFromDocumentTask } from "./from-document.js";
import { scriptFromTemplateTask } from "./from-template.js";
import { verifyTranscriptTask } from "./verify-transcript.js";

/** Every AI task of the script step, in pipeline order (drives Settings → Prompts). */
export const scriptTasks = [
  cleanCaptionsTask,
  verifyTranscriptTask,
  describeFramesTask,
  scriptFromDocumentTask,
  scriptFromTemplateTask,
  analyzeScriptTask,
];

export {
  analyzeScriptTask,
  cleanCaptionsTask,
  describeFramesTask,
  scriptFromDocumentTask,
  scriptFromTemplateTask,
  verifyTranscriptTask,
};
