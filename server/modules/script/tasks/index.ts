import { analyzeScriptTask } from "./analyze.js";
import { cleanCaptionsTask } from "./clean-captions.js";
import { describeFramesTask } from "./describe-frames.js";
import { scriptFromDocumentTask } from "./from-document.js";
import { scriptFromIdeaTask } from "./from-idea.js";
import { scriptFromTemplateTask } from "./from-template.js";
import { verifyTranscriptTask } from "./verify-transcript.js";

/** Every AI task of the script step, in pipeline order (drives Settings → Prompts). */
export const scriptTasks = [
  cleanCaptionsTask,
  verifyTranscriptTask,
  describeFramesTask,
  scriptFromDocumentTask,
  scriptFromIdeaTask,
  scriptFromTemplateTask,
  analyzeScriptTask,
];

export {
  analyzeScriptTask,
  cleanCaptionsTask,
  describeFramesTask,
  scriptFromDocumentTask,
  scriptFromIdeaTask,
  scriptFromTemplateTask,
  verifyTranscriptTask,
};
