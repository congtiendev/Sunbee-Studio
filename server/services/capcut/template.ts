/**
 * The draft skeleton every Sunbee CapCut draft starts from.
 *
 * CapCut's draft format is undocumented and newer builds reject drafts that
 * don't look like their own, so nothing here is invented: these are the
 * files of the "capcut_legacy" template (an empty project saved by CapCut
 * 6.5.0) that VectCutAPI copies into every draft — the setup the "Người Que"
 * pipeline ships real videos with on CapCut 9.3 (Windows) and 9.5 (Mac).
 * The writer fills in only the timeline (`tracks`, `materials`, `duration`,
 * canvas) and the meta fields that name the folder; everything else is kept
 * as CapCut wrote it. Source: VectCutAPI `template/` (Apache-2.0).
 *
 * Re-check this file when CapCut is updated past the last tested version:
 * create an empty project in the new CapCut and compare with
 * `node scripts/capcut-inspect.mjs <its folder>`.
 */

/** Platform block written into every draft (CapCut ignores that it says "mac" on Windows). */
const PLATFORM = {
  app_id: 359289,
  app_source: "cc",
  app_version: "6.5.0",
  device_id: "c4ca4238a0b923820dcc509a6f75849b",
  hard_disk_id: "307563e0192a94465c0e927fbc482942",
  mac_address: "c3371f2d4fb02791c067ce44d8fb4ed5",
  os: "mac",
  os_version: "15.5",
};

/** Every `materials` list CapCut 6.5 writes, in its order; the writer fills the ones it uses. */
export const MATERIAL_KEYS = [
  "ai_translates",
  "audio_balances",
  "audio_effects",
  "audio_fades",
  "audio_track_indexes",
  "audios",
  "beats",
  "canvases",
  "chromas",
  "color_curves",
  "common_mask",
  "digital_human_model_dressing",
  "digital_humans",
  "drafts",
  "effects",
  "flowers",
  "green_screens",
  "handwrites",
  "hsl",
  "images",
  "log_color_wheels",
  "loudnesses",
  "manual_beautys",
  "manual_deformations",
  "material_animations",
  "material_colors",
  "multi_language_refs",
  "placeholder_infos",
  "placeholders",
  "plugin_effects",
  "primary_color_wheels",
  "realtime_denoises",
  "shapes",
  "smart_crops",
  "smart_relights",
  "sound_channel_mappings",
  "speeds",
  "stickers",
  "tail_leaders",
  "text_templates",
  "texts",
  "time_marks",
  "transitions",
  "video_effects",
  "video_trackings",
  "videos",
  "vocal_beautifys",
  "vocal_separations",
] as const;

export type MaterialKey = (typeof MATERIAL_KEYS)[number];
export type DraftMaterials = Record<MaterialKey, unknown[]>;

export function emptyMaterials(): DraftMaterials {
  return Object.fromEntries(MATERIAL_KEYS.map((key) => [key, []])) as unknown as DraftMaterials;
}

/** `draft_info.json` of an empty project (the template's own id; the writer gives each draft its own). */
export function emptyDraftInfo(): Record<string, unknown> {
  return {
    canvas_config: { background: null, height: 1080, ratio: "original", width: 1920 },
    color_space: -1,
    config: {
      adjust_max_index: 1,
      attachment_info: [],
      combination_max_index: 1,
      export_range: null,
      extract_audio_last_index: 1,
      lyrics_recognition_id: "",
      lyrics_sync: true,
      lyrics_taskinfo: [],
      maintrack_adsorb: true,
      material_save_mode: 0,
      multi_language_current: "none",
      multi_language_list: [],
      multi_language_main: "none",
      multi_language_mode: "none",
      original_sound_last_index: 1,
      record_audio_last_index: 1,
      sticker_max_index: 1,
      subtitle_keywords_config: null,
      subtitle_recognition_id: "",
      subtitle_sync: true,
      subtitle_taskinfo: [],
      system_font_list: [],
      use_float_render: false,
      video_mute: false,
      zoom_info_params: null,
    },
    cover: null,
    create_time: 0,
    duration: 0,
    extra_info: null,
    fps: 30,
    free_render_index_mode_on: false,
    group_container: null,
    id: "26FDE5CD-364C-45A3-8930-A40DF2F7EB2B",
    is_drop_frame_timecode: false,
    keyframe_graph_list: [],
    keyframes: {
      adjusts: [],
      audios: [],
      effects: [],
      filters: [],
      handwrites: [],
      stickers: [],
      texts: [],
      videos: [],
    },
    last_modified_platform: { ...PLATFORM },
    lyrics_effects: [],
    materials: emptyMaterials(),
    mutable_config: null,
    name: "",
    new_version: "138.0.0",
    path: "",
    platform: { ...PLATFORM },
    relationships: [],
    render_index_track_mode_on: true,
    retouch_cover: null,
    source: "default",
    static_cover_image_path: "",
    time_marks: null,
    tracks: [],
    uneven_animation_template_info: {
      composition: "",
      content: "",
      order: "",
      sub_template_info_list: [],
    },
    update_time: 0,
    version: 360000,
  };
}

/** The older empty draft the template keeps as `template.tmp` (blank platform, older schema tag). */
export function legacyTemplateTmp(): Record<string, unknown> {
  const blank = Object.fromEntries(Object.keys(PLATFORM).map((key) => [key, key === "app_id" ? 0 : ""]));
  return {
    ...emptyDraftInfo(),
    canvas_config: { background: null, height: 0, ratio: "original", width: 0 },
    id: "470E26D0-9077-4231-A7A7-619F75FF92B3",
    last_modified_platform: blank,
    new_version: "75.0.0",
    platform: blank,
    render_index_track_mode_on: false,
  };
}

/** `draft_meta_info.json`; the writer fills the folder/name/time fields. */
export function draftMetaInfo(input: {
  draftId: string;
  folderName: string;
  draftsRoot: string;
  folderPath: string;
  createdUs: number;
  durationUs: number;
  timelineSize: number;
}): Record<string, unknown> {
  return {
    cloud_draft_cover: true,
    cloud_draft_sync: true,
    cloud_package_completed_time: "",
    draft_cloud_capcut_purchase_info: "",
    draft_cloud_last_action_download: false,
    draft_cloud_package_type: "",
    draft_cloud_purchase_info: "",
    draft_cloud_template_id: "",
    draft_cloud_tutorial_info: "",
    draft_cloud_videocut_purchase_info: "",
    draft_cover: "draft_cover.jpg",
    draft_deeplink_url: "",
    draft_enterprise_info: {
      draft_enterprise_extra: "",
      draft_enterprise_id: "",
      draft_enterprise_name: "",
      enterprise_material: [],
    },
    draft_fold_path: input.folderPath,
    draft_id: input.draftId,
    draft_is_ae_produce: false,
    draft_is_ai_packaging_used: false,
    draft_is_ai_shorts: false,
    draft_is_ai_translate: false,
    draft_is_article_video_draft: false,
    draft_is_cloud_temp_draft: false,
    draft_is_from_deeplink: "false",
    draft_is_invisible: false,
    draft_materials: [0, 1, 2, 3, 6, 7, 8].map((type) => ({ type, value: [] })),
    draft_materials_copied_info: [],
    draft_name: input.folderName,
    draft_need_rename_folder: false,
    draft_new_version: "",
    draft_removable_storage_device: "",
    draft_root_path: input.draftsRoot,
    draft_segment_extra_info: [],
    draft_timeline_materials_size_: input.timelineSize,
    draft_type: "",
    tm_draft_cloud_completed: "",
    tm_draft_cloud_entry_id: -1,
    tm_draft_cloud_modified: 0,
    tm_draft_cloud_parent_entry_id: -1,
    tm_draft_cloud_space_id: -1,
    tm_draft_cloud_user_id: -1,
    tm_draft_create: input.createdUs,
    tm_draft_modified: input.createdUs,
    tm_draft_removed: 0,
    tm_duration: input.durationUs,
  };
}

/** The template's small side files, verbatim (path relative to the draft folder → content). */
export function sideFiles(createdSec: number): Record<string, string> {
  return {
    draft_settings: [
      "[General]",
      "cloud_last_modify_platform=mac",
      `draft_create_time=${createdSec}`,
      `draft_last_edit_time=${createdSec}`,
      "real_edit_keys=1",
      "real_edit_seconds=8",
      "",
    ].join("\n"),
    "attachment_pc_common.json": JSON.stringify({
      ai_packaging_infos: [],
      ai_packaging_report_info: {
        caption_id_list: [],
        commercial_material: "",
        material_source: "",
        method: "",
        page_from: "",
        style: "",
        task_id: "",
        text_style: "",
        tos_id: "",
        video_category: "",
      },
      broll: {
        ai_packaging_infos: [],
        ai_packaging_report_info: {
          caption_id_list: [],
          commercial_material: "",
          material_source: "",
          method: "",
          page_from: "",
          style: "",
          task_id: "",
          text_style: "",
          tos_id: "",
          video_category: "",
        },
      },
      commercial_music_category_ids: [],
      pc_feature_flag: 0,
      recognize_tasks: [],
      reference_lines_config: { horizontal_lines: [], is_lock: false, is_visible: false, vertical_lines: [] },
      safe_area_type: 0,
      template_item_infos: [],
      unlock_template_ids: [],
    }),
    "attachment_editing.json": JSON.stringify({
      editing_draft: {
        ai_remove_filter_words: { enter_source: "", right_id: "" },
        ai_shorts_info: { report_params: "", type: 0 },
        digital_human_template_to_video_info: { has_upload_material: false, template_type: 0 },
        draft_used_recommend_function: "",
        edit_type: 0,
        eye_correct_enabled_multi_face_time: 0,
        has_adjusted_render_layer: false,
        is_open_expand_player: false,
        is_use_adjust: false,
        is_use_edit_multi_camera: false,
        is_use_lock_object: false,
        is_use_loudness_unify: false,
        is_use_retouch_face: false,
        is_use_smart_adjust_color: false,
        is_use_smart_motion: false,
        is_use_text_to_audio: false,
        material_edit_session: { material_edit_info: [], session_id: "", session_time: 0 },
        profile_entrance_type: "",
        publish_enter_from: "",
        publish_type: "",
        single_function_type: 0,
        text_convert_case_types: [],
        version: "1.0.0",
        video_recording_create_draft: "",
      },
    }),
    "common_attachment/aigc_aigc_generate.json": JSON.stringify({
      aigc_aigc_generate: { aigc_generate_segment_list: [], version: "1.0.0" },
    }),
    "common_attachment/attachment_script_video.json": JSON.stringify({
      script_video: {
        attachment_valid: false,
        language: "",
        overdub_recover: [],
        overdub_sentence_ids: [],
        parts: [],
        sync_subtitle: false,
        translate_segments: [],
        translate_type: "",
        version: "1.0.0",
      },
    }),
    "draft_agency_config.json": JSON.stringify({
      is_auto_agency_enabled: false,
      is_auto_agency_popup: false,
      is_single_agency_mode: false,
      marterials: null,
      use_converter: false,
      video_resolution: 720,
    }),
    "draft_biz_config.json": "",
    "performance_opt_info.json": JSON.stringify({ manual_cancle_precombine_segs: null }),
  };
}
