const NARRATIVE_ROLES = [
  "hook",
  "context",
  "buildup",
  "keyPoint",
  "emotionalBeat",
  "proof",
  "transition",
  "callToAction",
  "outro",
] as const;

const SHOT_SIZES = [
  "extremeCloseUp",
  "closeUp",
  "medium",
  "wide",
  "extremeWide",
] as const;

const CAMERA_MOVEMENTS = [
  "static",
  "pan",
  "tilt",
  "zoom",
  "handheld",
  "tracking",
] as const;

const REQUIRED_ASSET_TYPES = ["image", "video", "audio", "graphic"] as const;
const REQUIRED_ASSET_SOURCES = ["generate", "stock", "provided"] as const;

export const SCRIPT_ANALYSIS_SCHEMA = {
  type: "object",
  properties: {
    scenes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          index: { type: "integer" },
          content: { type: "string" },
          visualDescription: { type: "string" },
          estimatedDurationSec: { type: "integer" },
          narrativeRole: { type: "string", enum: NARRATIVE_ROLES },
          shotSize: { type: "string", enum: SHOT_SIZES },
          cameraMovement: { type: "string", enum: CAMERA_MOVEMENTS },
          heroMoment: { type: "boolean" },
          requiredAssets: {
            type: "array",
            items: {
              type: "object",
              properties: {
                type: { type: "string", enum: REQUIRED_ASSET_TYPES },
                description: { type: "string" },
                source: { type: "string", enum: REQUIRED_ASSET_SOURCES },
              },
              required: ["type", "description", "source"],
              additionalProperties: false,
            },
          },
        },
        required: [
          "index",
          "content",
          "visualDescription",
          "estimatedDurationSec",
          "narrativeRole",
          "shotSize",
          "cameraMovement",
          "heroMoment",
          "requiredAssets",
        ],
        additionalProperties: false,
      },
    },
    resources: {
      type: "object",
      properties: {
        shotCount: { type: "integer" },
        voiceover: { type: "string" },
        music: { type: "string" },
        images: { type: "array", items: { type: "string" } },
        notes: { type: "string" },
      },
      required: ["shotCount", "voiceover", "music", "images", "notes"],
      additionalProperties: false,
    },
    style: {
      type: "object",
      properties: {
        genre: { type: "string" },
        styleTags: { type: "array", items: { type: "string" } },
        toneDescription: { type: "string" },
      },
      required: ["genre", "styleTags", "toneDescription"],
      additionalProperties: false,
    },
  },
  required: ["scenes", "resources", "style"],
  additionalProperties: false,
} as const;
