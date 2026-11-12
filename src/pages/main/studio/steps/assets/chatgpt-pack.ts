import { frameRatioForAi } from "@shared/frame-ratio";
import { describeShotForAi } from "@shared/shots";
import type {
  FrameRatio,
  ImageLayer,
  SceneShot,
  StyleTemplate,
} from "@shared/types";
import JSZip from "jszip";

/**
 * The "pack for ChatGPT": everything needed to generate a scene range's
 * images by hand in ChatGPT, one image per turn — instructions, the chosen
 * graphics skill (text + reference images), character/object reference
 * photos and the prompt list. The user unzips it and drags the files into
 * the chat (ChatGPT only *sees* images attached directly, not ones inside a
 * zip). The text is the content handed to ChatGPT, so it stays in Vietnamese
 * like the prompts themselves.
 */

export interface PackGroup {
  key: string;
  description: string;
  sceneContext: string;
  scenes: number[];
  /** AI-written prompt; without one the description + scene context are used. */
  prompt?: string;
  /** Roster characters/objects named in this request. */
  characters: string[];
  /** A whole frame of the scene, or the subject alone as a transparent PNG; unknown until a prompt is written. */
  layer?: ImageLayer;
  /** Camera angle / position / perspective in its scene. */
  placement?: string;
  /** The shot it's for, in its first scene. */
  shot?: SceneShot;
  shotTotal?: number;
}

export interface PackInput {
  range: { from: number; to: number };
  /** The video's frame — every whole-frame image uses it. */
  frameRatio: FrameRatio;
  groups: PackGroup[];
  skill?: Pick<
    StyleTemplate,
    "name" | "description" | "graphicsStyle" | "instructions" | "skillMd"
  >;
  /** The skill's reference illustrations (data URLs). */
  styleImages: string[];
  /** Reference photos of roster characters/objects (data URLs). */
  characterImages: { name: string; dataUrl: string }[];
  /** Hand-edited replacement for the generated `huong-dan.md` text, if the user customized it. */
  instructionsOverride?: string;
}

interface PackFile {
  file: string;
  dataUrl: string;
}

function mimeOf(dataUrl: string): string {
  return /^data:([^;,]+)/.exec(dataUrl)?.[1] ?? "image/png";
}

function extensionOf(mime: string): string {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  return "png";
}

/** "Ông Ba Đực" → "ong-ba-duc" — file names ChatGPT and every OS handle. */
function slug(text: string): string {
  return (
    text
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[đĐ]/g, "d")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "anh"
  );
}

const INSTRUCTIONS_FILE = "huong-dan.md";
/** Named after the skill, so it's obvious in the zip (and in ChatGPT) which skill was packed. */
export const skillFileName = (skill: NonNullable<PackInput["skill"]>) =>
  `skill-${slug(skill.name)}.md`;
export const promptsFileName = (range: PackInput["range"]) =>
  `prompts-canh-${range.from}-${range.to}.md`;
export const packFileName = (input: Pick<PackInput, "range" | "skill">) =>
  `chatgpt-${input.skill ? `${slug(input.skill.name)}-` : ""}canh-${input.range.from}-${input.range.to}.zip`;

function plan(input: PackInput) {
  const styleFiles: PackFile[] = input.styleImages.map((dataUrl, i) => ({
    file: `mau-phong-cach-${i + 1}.${extensionOf(mimeOf(dataUrl))}`,
    dataUrl,
  }));
  const used = new Set<string>();
  const characterFiles = input.characterImages.map(({ name, dataUrl }) => {
    let base = `nhan-vat-${slug(name)}`;
    for (let n = 2; used.has(base); n++) base = `nhan-vat-${slug(name)}-${n}`;
    used.add(base);
    return { name, file: `${base}.${extensionOf(mimeOf(dataUrl))}`, dataUrl };
  });
  return { styleFiles, characterFiles };
}

function styleMarkdown(skill: NonNullable<PackInput["skill"]>): string {
  const sections = [
    `# Skill phong cách đồ hoạ: ${skill.name}`,
    skill.description?.trim(),
    skill.graphicsStyle?.trim() &&
      `## Quy tắc phong cách\n\n${skill.graphicsStyle.trim()}`,
    skill.instructions?.trim() &&
      `## Ghi chú thêm\n\n${skill.instructions.trim()}`,
    skill.skillMd?.trim() &&
      skill.skillMd.trim() !== skill.graphicsStyle?.trim() &&
      `## Tài liệu skill\n\n${skill.skillMd.trim()}`,
  ];
  return `${sections.filter(Boolean).join("\n\n")}\n`;
}

export function instructionsMarkdown(input: PackInput): string {
  return input.instructionsOverride?.trim()
    ? input.instructionsOverride
    : generatedInstructionsMarkdown(input);
}

/** The computed instructions text, ignoring any hand-edited override — what "reset to default" restores. */
export function generatedInstructionsMarkdown(input: PackInput): string {
  const { styleFiles, characterFiles } = plan(input);
  const promptsFile = promptsFileName(input.range);
  const attachments = [
    `- \`${promptsFile}\` — danh sách ảnh cần tạo.`,
    input.skill
      ? `- \`${skillFileName(input.skill)}\` — skill phong cách đồ hoạ “${input.skill.name}”, BẮT BUỘC áp dụng cho mọi ảnh.`
      : "- Phong cách đồ hoạ: theo skill/Project đã đính kèm trong cuộc trò chuyện này.",
    styleFiles.length > 0 &&
      "- `mau-phong-cach-*` — ảnh mẫu của phong cách: học nét vẽ, màu sắc, chất liệu, tỉ lệ nhân vật; KHÔNG chép lại nhân vật/bối cảnh trong ảnh mẫu. Ảnh mẫu nào là SPRITE SHEET (lưới nhiều tư thế liên tiếp) thì đó cũng là mẫu BỐ CỤC: mọi mục “sprite sheet” làm đúng như vậy — cùng số cột/hàng, cùng kích thước ô và khoảng cách, nhân vật cùng cỡ và cùng vị trí trong mỗi ô, nền trong suốt.",
    characterFiles.length > 0 &&
      "- `nhan-vat-*` — ngoại hình cố định của nhân vật/vật phẩm: vẽ đúng như ảnh mỗi khi họ xuất hiện.",
  ];
  return `# Hướng dẫn tạo ảnh — cảnh ${input.range.from}–${input.range.to}

Hãy tạo ảnh minh hoạ cho một video kể chuyện theo danh sách trong \`${promptsFile}\` — ${input.groups.length} ảnh, chia theo CẢNH và trong mỗi cảnh theo từng SHOT (như kế hoạch quay phim). Mỗi ảnh có một MÃ riêng (p1, p2…).

## Tài liệu kèm theo

${attachments.filter(Boolean).join("\n")}

## Cách làm

1. Làm lần lượt TỪNG CẢNH theo thứ tự trong danh sách. Mỗi lượt tạo ĐỦ tất cả ảnh của MỘT cảnh, theo thứ tự mã trong cảnh đó.
2. Ghi MÃ ngay trước mỗi ảnh (ví dụ: **p1**) để tôi biết ảnh nào là ảnh nào.
3. Ảnh ghi “dùng lại” đã được tạo ở cảnh trước — KHÔNG tạo lại.
4. Mỗi ảnh có “Loại ảnh”:
   - **Khung hình hoàn chỉnh** — vẽ cả cảnh phủ kín khung **${frameRatioForAi(input.frameRatio)}**, đúng tỉ lệ này.
   - **PNG nền trong suốt, mô tả có chữ “sprite sheet”** — MỘT ảnh lưới các khung tư thế liên tiếp của cùng chủ thể theo quy tắc SPRITE SHEET trong skill, theo đúng bố cục sprite sheet mẫu nếu có (mặc định 4 cột × 3 hàng), nền trong suốt thật, các ô đều nhau.
   - **PNG nền trong suốt** — CHỈ vẽ riêng chủ thể (vật phẩm/nhân vật), không bối cảnh, nền TRONG SUỐT THẬT (PNG có kênh alpha, không vẽ giả ô bàn cờ, không nền trắng), chủ thể chiếm gần trọn ảnh, chỉ chừa viền rất mỏng quanh chủ thể (không cắt mất phần nào của chủ thể, không để khoảng trống thừa) — để ghép vào khung hình và làm chuyển động khi dựng.
5. Mỗi ảnh vẽ đúng CỠ CẢNH và GÓC MÁY của shot chứa nó (ghi ở tiêu đề shot): shot cận thì vẽ cận, shot từ trên xuống thì vẽ từ trên xuống, shot qua vai thì vẽ qua vai nhân vật… Các ảnh trong cùng một shot phải KHỚP nhau để ghép được: cùng góc máy, cùng ánh sáng, cùng tỉ lệ kích thước giữa chủ thể và nền. Làm ĐÚNG mục “Vị trí & góc trong cảnh” của từng ảnh: PNG chủ thể vẽ theo đúng phối cảnh của chỗ nó được đặt (vd. điện thoại nằm trên chăn nhìn chéo từ trên xuống thì vẽ nghiêng, thu ngắn theo phối cảnh — không vẽ thẳng mặt dẹt), nhân vật đúng tư thế với chỗ đứng/ngồi, đúng hướng quay, kèm bóng đổ mềm ngay chỗ tiếp xúc; ảnh nền chừa trống đúng những chỗ sẽ ghép.
6. Hành động phải HỢP LÝ như người thật: tư thế, hướng nhìn, cách cầm/dùng đồ vật đúng đời thực — vd. đang xem điện thoại thì màn hình quay về phía nhân vật (người xem thấy mặt lưng máy), nhìn camera nói chuyện thì điện thoại hạ xuống/cầm hờ, không chĩa màn hình vào ống kính, trừ khi yêu cầu ghi rõ là chìa màn hình cho người xem. Mọi khung của một sprite sheet giữ cùng cách cầm và cùng tay cầm. Nếu yêu cầu có chỗ vô lý thì vẽ theo cách hợp lý.
7. Không tự thêm chữ, logo hay watermark nếu yêu cầu không ghi.
8. Giữ thống nhất phong cách và ngoại hình nhân vật giữa mọi ảnh.
9. Làm xong MỘT CẢNH thì dừng lại; khi tôi nhắn “tiếp” thì làm cảnh kế tiếp. Nếu tôi nhắn “duyệt” thì làm LUÔN MỘT LẦN tất cả các cảnh còn lại, không dừng lại hỏi giữa các cảnh nữa.

## Sau khi xong toàn bộ ảnh

Khi đã tạo xong HẾT các ảnh của cảnh ${input.range.from}–${input.range.to} (hết mọi lượt “tiếp”):

1. Đặt tên mỗi file ảnh BẮT ĐẦU bằng đúng MÃ của nó, giữ đuôi ảnh (vd. \`p1.png\`, \`p12.png\`, \`p1-canh-2.png\` đều được, chỉ cần bắt đầu bằng mã).
2. Tạo MỘT thư mục riêng cho MỖI CẢNH (vd. \`canh-4\`, \`canh-5\`…), rồi xếp đúng các ảnh thuộc cảnh đó vào thư mục của nó.
3. Nén toàn bộ các thư mục cảnh đó thành MỘT file \`.zip\` duy nhất và đưa file zip đó cho tôi tải xuống.

Tôi sẽ tải file zip này lên để nhập ảnh vào dự án.

Bắt đầu với **${firstSceneLabel(input)}**.
`;
}

/** The scene an image is made in: the first scene of the range that uses it. */
const homeScene = (group: PackGroup) => Math.min(...group.scenes);

function firstSceneLabel(input: PackInput): string {
  const first = input.groups.length
    ? Math.min(...input.groups.map(homeScene))
    : input.range.from;
  return `Cảnh ${first}`;
}

const isSpriteSheet = (group: PackGroup) => /sprite/i.test(group.description);

/**
 * The image list, by scene — ChatGPT makes one whole scene per turn, so the
 * images that have to fit together (a background and what goes on it) are
 * made together. An image several scenes share is listed in its first scene
 * and named as "reused" in the later ones. Codes run in this same order, so
 * "assign in order" on import still matches.
 */
export function promptsMarkdown(input: PackInput): string {
  const { characterFiles } = plan(input);
  const fileOf = new Map(characterFiles.map((c) => [c.name, c.file]));
  const describe = (group: PackGroup) => {
    const characters = group.characters
      .map((name) =>
        fileOf.has(name) ? `${name} (ảnh \`${fileOf.get(name)}\`)` : name,
      )
      .join(", ");
    const bullets = [
      group.layer === "cutout"
        ? isSpriteSheet(group)
          ? "- Loại ảnh: SPRITE SHEET — PNG nền trong suốt, lưới nhiều khung liên tiếp"
          : "- Loại ảnh: PNG nền trong suốt (chỉ chủ thể, để ghép và làm chuyển động)"
        : `- Loại ảnh: Khung hình hoàn chỉnh ${frameRatioForAi(input.frameRatio)}`,
      characters && `- Nhân vật/vật phẩm: ${characters}`,
      `- Mô tả: ${group.description}`,
      group.placement && `- Vị trí & góc trong cảnh: ${group.placement}`,
      group.prompt
        ? `- Prompt: ${group.prompt}`
        : `- Bối cảnh: ${group.sceneContext}`,
    ];
    const alsoIn = group.scenes.filter((scene) => scene !== homeScene(group));
    const heading = `#### ${group.key}${alsoIn.length ? ` (dùng lại ở cảnh ${alsoIn.join(", ")})` : ""}`;
    return `${heading}\n\n${bullets.filter(Boolean).join("\n")}`;
  };

  const sceneNumbers = [
    ...new Set(input.groups.flatMap((group) => group.scenes)),
  ].sort((a, b) => a - b);
  // A scene that only reuses earlier images has nothing to make: left out, so ChatGPT never stops on an empty turn.
  const sections = sceneNumbers
    .filter((scene) => input.groups.some((group) => homeScene(group) === scene))
    .map((scene) => {
      const made = input.groups.filter((group) => homeScene(group) === scene);
      const reused = input.groups.filter(
        (group) => homeScene(group) !== scene && group.scenes.includes(scene),
      );
      // Images under their shot, shots in screen order; images with no shot last.
      const shotOrders = [
        ...new Set(
          made.map((group) => group.shot?.order ?? Number.MAX_SAFE_INTEGER),
        ),
      ].sort((a, b) => a - b);
      const shotSections = shotOrders.map((order) => {
        const inShot = made.filter(
          (group) => (group.shot?.order ?? Number.MAX_SAFE_INTEGER) === order,
        );
        const shot = inShot[0]?.shot;
        const title = shot
          ? `### ${describeShotForAi(shot, inShot[0]?.shotTotal)}`
          : "### Ảnh khác";
        return [title, ...inShot.map(describe)].join("\n\n");
      });
      const lines = [
        `## Cảnh ${scene} — ${made.length} ảnh cần tạo`,
        ...shotSections,
        reused.length
          ? `Dùng lại (đã tạo ở cảnh trước, không tạo lại): ${reused.map((group) => group.key).join(", ")}`
          : null,
      ];
      return lines.filter(Boolean).join("\n\n");
    });
  return `# Danh sách ảnh — cảnh ${input.range.from}–${input.range.to} (${input.groups.length} ảnh)\n\n${sections.join("\n\n")}\n`;
}

/** The files a pack holds, in the order they're listed to the user. */
export function packFileList(input: PackInput): string[] {
  const { styleFiles, characterFiles } = plan(input);
  return [
    INSTRUCTIONS_FILE,
    promptsFileName(input.range),
    ...(input.skill ? [skillFileName(input.skill)] : []),
    ...styleFiles.map((f) => f.file),
    ...characterFiles.map((f) => f.file),
  ];
}

/**
 * Everything the pack holds that can be plain text — instructions, the
 * skill's methodology, and the prompt list — for pasting straight into a
 * chat. The only things it can't carry are the reference *images*
 * themselves (style samples, character photos): those still need the zip,
 * or already living in a ChatGPT Project this is pasted into.
 */
export function packAsText(input: PackInput): string {
  const parts = [
    instructionsMarkdown(input),
    input.skill && styleMarkdown(input.skill),
    promptsMarkdown(input),
  ];
  return parts.filter(Boolean).join("\n---\n\n");
}

export async function buildPackZip(input: PackInput): Promise<Blob> {
  const { styleFiles, characterFiles } = plan(input);
  const zip = new JSZip();
  zip.file(INSTRUCTIONS_FILE, instructionsMarkdown(input));
  zip.file(promptsFileName(input.range), promptsMarkdown(input));
  if (input.skill)
    zip.file(skillFileName(input.skill), styleMarkdown(input.skill));
  for (const { file, dataUrl } of [...styleFiles, ...characterFiles]) {
    zip.file(file, await (await fetch(dataUrl)).blob());
  }
  return zip.generateAsync({ type: "blob" });
}
