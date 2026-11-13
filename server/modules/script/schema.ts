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

import { randomUUID } from "node:crypto";
import type { RequiredAsset, SceneShot, ScriptScene } from "../../../shared/types.js";

const REQUIRED_ASSET_TYPES = ["image", "video", "audio", "graphic"] as const;
const REQUIRED_ASSET_SOURCES = ["generate", "stock", "provided"] as const;
const SHOT_ANGLES = ["eyeLevel", "highAngle", "lowAngle", "topDown", "overShoulder", "pov", "dutch"] as const;

/** One shot of a scene (see `SceneShot`). */
export const SCENE_SHOT_SCHEMA = {
  type: "object",
  properties: {
    order: { type: "integer" },
    shotSize: { type: "string", enum: SHOT_SIZES },
    angle: { type: "string", enum: SHOT_ANGLES },
    cameraMovement: { type: "string", enum: CAMERA_MOVEMENTS },
    subject: { type: "string" },
    purpose: { type: "string" },
    durationSec: { type: "integer" },
    technique: { type: "string" },
  },
  required: [
    "order",
    "shotSize",
    "angle",
    "cameraMovement",
    "subject",
    "purpose",
    "durationSec",
    "technique",
  ],
  additionalProperties: false,
} as const;

/** "none": audio/video — no image layer. Mapped away by `withAssetLayers`. */
const REQUIRED_ASSET_LAYERS = ["scene", "cutout", "none"] as const;

/** One required asset, as every AI task that lists them returns it. */
export const REQUIRED_ASSET_ITEM_SCHEMA = {
  type: "object",
  properties: {
    type: { type: "string", enum: REQUIRED_ASSET_TYPES },
    description: { type: "string" },
    source: { type: "string", enum: REQUIRED_ASSET_SOURCES },
    layer: { type: "string", enum: REQUIRED_ASSET_LAYERS },
    placement: { type: "string" },
    shot: { type: "integer" },
  },
  required: ["type", "description", "source", "layer", "placement", "shot"],
  additionalProperties: false,
} as const;

/**
 * How required images are layered — shared by the scene analysis and the
 * "split layers" pass over an existing analysis, so both split the same way.
 */
/**
 * Breaking each scene into shots like a film director — shared by the scene
 * analysis and the "shots & layers" pass over an existing analysis.
 */
export const DIRECTOR_RULE =
  "Hãy làm việc như một ĐẠO DIỄN HOẠT HÌNH KỂ CHUYỆN giàu kinh nghiệm (kiểu kênh kể chuyện/giải thích hài hước trên YouTube): mục tiêu là giữ người xem không rời mắt — nhịp nhanh, bất ngờ, hài đúng lúc, cảm xúc rõ.\n" +
  "PHÂN SHOT NHƯ ĐẠO DIỄN (`shots` của mỗi cảnh): kể mỗi cảnh bằng các SHOT như dựng phim, không phải một khung hình cho cả cảnh. Đọc diễn biến cảnh rồi chọn coverage phù hợp: toàn cảnh thiết lập (ở đâu, lúc nào), insert/cận đặc vật quan trọng (màn hình, chữ, đồ vật đang có sự kiện), cận mặt phản ứng, trung cảnh hành động, qua vai/POV khi khán giả cần thấy cái nhân vật đang nhìn (vd. đọc màn hình — thay vì bắt nhân vật lật màn hình về phía máy quay), nhìn thẳng camera khi nhân vật nói với khán giả. Mỗi shot có: `order`, cỡ cảnh `shotSize`, góc máy `angle` (eyeLevel, highAngle, lowAngle, topDown, overShoulder, pov, dutch), `cameraMovement`, `subject` (trong khung có gì, xảy ra gì), `purpose` (nhịp truyện mà shot gánh), `durationSec`.\n" +
  "- Số shot do nội dung quyết định: chỉ cảnh rất ngắn (≤ 2s) hoặc thuần chuyển cảnh mới được 1 shot; cảnh có sự kiện, lời thoại hoặc phản ứng phải có TỐI THIỂU 2 shot khác góc, thường 3–8 shot. Tổng `durationSec` các shot ≈ thời lượng cảnh; shot thường 1–3 giây, cắt theo nhịp lời kể.\n" +
  "- Các shot LIỀN NHAU phải khác cỡ cảnh HOẶC góc máy (cùng cỡ + cùng góc = jump cut, cấm). Một cảnh không được dùng cùng một cỡ cảnh + góc máy cho mọi shot.\n" +
  "- NỐI MẠCH GIỮA CÁC CẢNH: đọc cảnh ngay trước; khi cảnh trước kết thúc ở một vật/hành động mà cảnh này chuyển sang nhân vật (hoặc ngược lại), mở đầu bằng một SHOT NỐI liên kết hai cảnh (vd. cảnh trước là cận điện thoại trên chăn → shot nối từ trên xuống thấy nhân vật đang cầm chính chiếc điện thoại đó, rồi mới cắt vào shot nhân vật nói với camera).\n" +
  "- LIÊN TỤC BỐI CẢNH & TRẠNG THÁI — áp dụng cho MỌI thứ lặp lại giữa các shot/cảnh (nhân vật, đồ vật, trang phục, không gian, thời điểm, ánh sáng), không chỉ các ví dụ dưới đây: trạng thái của một nhân vật/đồ vật/không gian ở CUỐI một shot hoặc cảnh là ĐIỂM BẮT ĐẦU của shot/cảnh kế tiếp nhắc tới đúng nhân vật/đồ vật/không gian đó — không được âm thầm đổi khác, biến mất hay bật ra mà không có lý do kể được bằng hình. Trước khi chốt mỗi shot, tự hỏi: nhân vật này vừa ở đâu/làm gì, đang cầm/mặc gì, hiện đang thời điểm/ánh sáng gì — shot này có mâu thuẫn với điều đó không?\n" +
  "  · NHÂN VẬT BẬT RA VÔ CĂN CỨ: nếu không gian của cảnh là nơi riêng của một nhân vật (giường, bàn làm việc, xe, bếp...) và cảnh này hoặc cảnh sau cho nhân vật đó XUẤT HIỆN đang hoạt động trong chính không gian đó (vd. đang ngủ rồi ngồi dậy, đang ở ngoài rồi ngồi vào bàn đã dọn sẵn), nền của shot trước đó KHÔNG được vẽ \"chưa có ai\"/\"chưa có gì của họ\" một cách tuyệt đối nếu điều đó khiến nhân vật bật ra vô căn cứ — phải cho thấy sự hiện diện của họ dù chưa rõ mặt (vd. một hình dáng người nhô lên dưới chăn, một phần tay/vai đã vào khung). Chỉ vẽ không gian HOÀN TOÀN trống khi nhân vật thật sự CHƯA từng ở đó (phòng trống trước khi ai đó bước vào từ ngoài, hoặc nhân vật chưa hề được giới thiệu tới thời điểm này).\n" +
  "  · ĐỒ VẬT/TRANG PHỤC ĐỔI KHÁC KHÔNG LÝ DO: đồ vật nhân vật đang cầm/đội/mặc, vị trí của nó, và mọi đạo cụ khác trong khung phải giữ nguyên giữa các shot của cùng một nhịp hành động, trừ khi kịch bản có một hành động cụ thể làm nó đổi khác (đặt xuống, cởi ra, đổi đồ, đưa cho người khác...) — khi đó ghi rõ hành động đó trong `subject` của shot làm việc đó. Vd. đang cầm điện thoại tay phải thì không được đổi sang tay trái hay biến mất ở shot liền sau nếu không có lý do.\n" +
  "  · KHÔNG GIAN/THỜI ĐIỂM NHẢY VÔ LÝ: các shot của cùng một cảnh, hoặc hai cảnh liền kề mà kịch bản không nêu có chuyển cảnh/time-skip, phải cùng một nơi, cùng thời điểm trong ngày, cùng hướng và cường độ ánh sáng — không để trời đang sáng sớm bỗng thành giữa trưa, hay nhân vật đang ở phòng này bỗng xuất hiện ở không gian khác mà không có shot di chuyển/chuyển cảnh giải thích.\n" +
  "- SHOT NỐI/CHUYỂN TIẾP, shot thiết lập bối cảnh và shot POV/qua vai ngắn (≤ 2s, không ai diễn gì đặc biệt) → MỖI shot chỉ cần MỘT ảnh tĩnh hoàn chỉnh (\"scene\"), không tách lớp, không sprite sheet — chuyển động máy (đẩy, lia, zoom) làm lúc dựng.\n" +
  "- SHOT CHỈ ĐẨY MÁY/CẬN HƠN vào ĐÚNG chủ thể và trạng thái đã có ở shot liền trước, không có hành động/biến đổi mới nào xảy ra riêng trong shot này — bất kể chủ thể là gì (màn hình, đồ vật, mặt nhân vật, một góc bối cảnh...) → KHÔNG tạo ảnh mới: để trống `requiredAssets` của shot này, ghi trong `purpose`/`technique` rằng đây là một cú đẩy máy/zoom kỹ thuật số vào đúng ảnh của shot trước lúc dựng. Nếu khung quá khác (đổi hẳn tỉ lệ khung hay góc máy) buộc phải vẽ ảnh riêng, mô tả PHẢI mở đầu bằng \"Cùng [chủ thể/trạng thái] như ảnh shot {order shot trước}\" và giữ Y HỆT bối cảnh, ánh sáng, các vật xung quanh của ảnh đó — không bịa bối cảnh mới.\n" +
  "- Quy tắc dựng: giữ trục 180° (nhân vật quay cùng hướng giữa các shot), ánh sáng/thời điểm nhất quán trong cùng bối cảnh, nối hành động mượt giữa các shot (cầm vật bằng tay nào thì giữ tay đó), xen shot phản ứng sau sự kiện, đặt shot nhấn (cận đặc, nhìn thẳng camera) vào câu chốt.\n" +
  "- KỸ THUẬT QUAY & CHUYỂN CẢNH (`technique` của shot — để trống nếu chỉ là cắt thường): chủ động chọn để video thú vị, theo nhịp hài/cảm xúc của câu chuyện, không rải đều cho có. CHỈ ghi những kỹ thuật quyết định HÌNH ẢNH cần vẽ: góc máy đặc biệt (POV qua mắt nhân vật, qua vai, từ trên xuống, góc thấp hất lên cho vẻ áp đảo, góc cao cho vẻ nhỏ bé, dutch angle khi bất an, dolly zoom cho khoảnh khắc sốc); chuyển cảnh bằng hình (match cut — hai shot liền nhau có bố cục/hình dáng khớp nhau; whip pan — lia nhanh nối hai cảnh; shot nối; pull-back reveal — lùi máy hé lộ bối cảnh bất ngờ; smash cut/cutaway gag — chèn khung đối lập hoặc tưởng tượng; split screen — hai khung song song); chiều sâu lớp (parallax 2.5D — nền xa, trung, tiền cảnh trượt khác tốc độ; rack focus — đổi tiêu điểm tiền–hậu cảnh). Hiệu ứng thuần dựng (crash zoom, freeze frame, slow-motion/speed ramp, J-cut/L-cut, khoảng lặng, chữ/emoji bật lên, montage) KHÔNG ghi ở đây — để bước Kế hoạch dựng quyết định.\n" +
  "- MỖI KỸ THUẬT CẦN ẢNH TƯƠNG ỨNG — liệt kê đủ trong requiredAssets của shot: parallax → nền tách thành các lớp riêng (xa / trung / tiền cảnh, mỗi lớp một ảnh, lớp gần là cutout); rack focus → tiền cảnh và hậu cảnh là hai lớp riêng; match cut → ảnh của hai shot có bố cục khớp nhau (ghi rõ điểm khớp — hình dáng, vị trí trong khung — trong mô tả cả hai ảnh); whip pan → khung đầu và khung cuối cùng hướng lia; split screen → mỗi nửa một khung; smash cut/cutaway → khung riêng cho cảnh chèn; pull-back reveal → khung rộng hơn, đủ chi tiết ở phần được hé lộ; POV/qua vai → vẽ đúng tầm mắt nhân vật, có tiền cảnh (vai, tay) nếu là qua vai.\n" +
  "- Nếu có phong cách dựng/phân cảnh cố định (skill phân cảnh) thì chọn shot và kỹ thuật theo đúng phong cách đó.\n" +
  "- HOOK (cảnh 1): shot đầu tiên mở bằng khoảnh khắc gây tò mò/sốc nhất của câu chuyện, dài ≤ 1,5s, có MẶT NGƯỜI hoặc CHỮ trong khung ngay từ khung hình đầu — KHÔNG mở bằng toàn cảnh tĩnh không người, không chữ. Câu hỏi/tiêu đề chính của video phải hiện trên hình trong 4 giây đầu.\n" +
  "- MẬT ĐỘ HÌNH (giữ chân người xem): cứ 2,5–3 giây phải có thêm MỘT phần tử mới trên hình (icon, chữ khoá, đạo cụ, ảnh minh hoạ) lấy từ danh từ/ý chính trong lời đọc của đoạn đó — mỗi phần tử là một cutout riêng trong requiredAssets. Người dẫn KHÔNG được đứng nói một mình trên nền trống quá 2,5s: khi người dẫn giải thích, đặt họ ở mép khung (cao ~45–55% khung, đứng trên đáy khung) và dành ~60% khung cho hình minh hoạ của điều đang nói.\n" +
  "- NHẤT QUÁN: trang phục và màu áo của mỗi nhân vật giữ y hệt mọi cảnh (theo mô tả cố định của nhân vật); động tác 'trình bày/chỉ vào' phải có thứ được trình bày trên hình; nhân vật đứng/ngồi trên một mặt phẳng hợp phối cảnh (sàn, ghế, bàn), không lơ lửng.\n" +
  "- Cảnh-level `shotSize`/`cameraMovement` là shot chủ đạo của cảnh.\n" +
  "- MỖI ảnh (image/graphic) thuộc đúng MỘT shot — ghi `shot` = `order` của shot đó, và vẽ theo đúng cỡ cảnh + góc máy của shot đó; audio/video ghi `shot` = 0. Mỗi góc máy cần ảnh riêng: cùng bối cảnh nhưng khác góc (toàn cảnh phòng vs. mặt chăn nhìn từ trên xuống) là hai NỀN khác nhau; cùng nhân vật ở shot cận mặt và shot trung cận là hai ảnh khác nhau. Chỉ dùng lại ảnh (mô tả Y HỆT) khi cùng bối cảnh VÀ cùng góc máy.";

export const ASSET_LAYER_RULE =
  "Áp dụng các quy tắc lớp dưới đây cho TỪNG SHOT (nền, cutout, sprite sheet của shot nào thì vẽ theo góc máy của shot đó).\n" +
  "LỚP HÌNH ẢNH (`layer` của mỗi tài nguyên): loại image/graphic chọn \"scene\" (MỘT khung hình hoàn chỉnh — vẽ chung với bối cảnh, phủ kín khung) hoặc \"cutout\" (CHỈ RIÊNG chủ thể — nhân vật/đồ vật — trên nền trong suốt, để ghép lên khung và làm chuyển động khi dựng); loại audio/video chọn \"none\".\n" +
  "Đây là video KỂ CHUYỆN hoạt hình, không phải slide thuyết trình: mỗi cảnh cần SINH ĐỘNG — nhân vật diễn, đồ vật phản ứng, khung hình có chuyển động. SỐ LƯỢNG và CÁCH CHIA tài nguyên của mỗi cảnh do KỊCH BẢN quyết định — KHÔNG có công thức cố định; liệt kê đúng những gì cần để DIỄN được cảnh đó:\n" +
  "- TRƯỚC KHI liệt kê, đọc kỹ diễn biến của cảnh (nội dung, lời thoại, mô tả hình ảnh, `characters[].action`) và chia thành các NHỊP hành động theo thời gian — một cảnh có thể có NHIỀU nhịp và một nhân vật có thể có NHIỀU hành động (vd. cầm điện thoại lên → nhìn thẳng camera → nói câu chốt → nhún vai). Số ảnh = số nhịp cần diễn; KHÔNG cố định một cảnh/một nhân vật chỉ có một hành động. Mỗi nhịp có chuyển động riêng → một SPRITE SHEET; các nhịp nối liền thành một chuyển động liên tục có thể gộp chung một sprite sheet nhiều khung. Ghi thứ tự nhịp đầu mô tả (\"Nhịp 1/3: ...\") để lúc dựng biết trình tự.\n" +
  "- Ở shot NHÂN VẬT DIỄN/NÓI (không phải shot nối/thiết lập), nhân vật KHÔNG BAO GIỜ chỉ là một ảnh tĩnh: đoạn có lời thoại → sprite sheet \"nói\" (khẩu hình mở/đóng, chớp mắt, cử chỉ nhẹ đúng cảm xúc của câu thoại — kể cả khi mặt đơ/nghiêm: vẫn nói và chớp mắt, chỉ là biểu cảm đơ); mỗi hành động khác (gật gù, giơ tay, ra dấu OK, lắc đầu, quay sang...) → sprite sheet riêng cho nhịp đó. Nhân vật chỉ đứng làm nền, không thoại, không hành động → tối thiểu sprite sheet thở/chớp mắt 8 khung.\n" +
  "- NHÂN VẬT HOẶC ĐỒ VẬT có chuyển động/biến đổi trong cảnh (vẫy tay, đi, chạy, nói, gật gù, run rẩy; màn hình sáng dần rồi hiện thông báo, nắp mở ra, cửa đóng lại, cốc đổ, lá rơi xoay...) → mỗi hành động/biến đổi là MỘT \"cutout\" dạng SPRITE SHEET: một ảnh lưới gồm các khung liên tiếp của cùng chủ thể đi từ trạng thái đầu đến trạng thái cuối, theo quy tắc sprite sheet của skill (mặc định 12 khung 4×3; 8 khung 4×2 cho cử động nhỏ; 16 khung 4×4 cho động tác phức tạp). Ghi rõ chữ \"sprite sheet\", chủ thể, hành động và trạng thái đầu → cuối trong mô tả.\n" +
  "- Chủ thể chỉ DỊCH CHUYỂN NGUYÊN KHỐI, hình dạng không đổi (trượt vào, phóng to, nảy, bay ngang, rung nhẹ) → MỘT \"cutout\" thường, chuyển động làm lúc dựng.\n" +
  "- Biểu cảm/tư thế ĐỔI HẲN giữa chừng cảnh (vd. đang mặt đơ rồi bật cười) → mỗi biểu cảm có sprite sheet \"nói\"/hành động riêng; cutout tĩnh chỉ dùng cho ĐỒ VẬT không chuyển động riêng.\n" +
  "- Nhiều chủ thể chuyển động độc lập → mỗi chủ thể có cutout/sprite sheet riêng.\n" +
  "- NỀN (\"scene\" không có các chủ thể sẽ ghép) cần khi cảnh có cutout phải đặt vào; nền vẽ sẵn các vật ĐỨNG YÊN và chừa chỗ cho chủ thể sẽ ghép. Cảnh dùng lại đúng bối cảnh của cảnh khác → viết mô tả nền Y HỆT mô tả đã dùng (dùng chung một ảnh, không tạo lại).\n" +
  "- Cảnh có nhiều khoảnh khắc (đổi góc máy, đổi bối cảnh, cắt cảnh giữa chừng) → mỗi khung hình/nền là một tài nguyên riêng.\n" +
  "- Chỉ dùng MỘT \"scene\" tĩnh, không tách, cho cảnh thật sự không có ai/vật gì diễn: cảnh chuyển, cảnh toàn/thiết lập bối cảnh mà máy quay pan/zoom là đủ, hoặc cảnh rất ngắn.\n" +
  "- Cảnh chữ/số liệu/đồ hoạ thông tin → tài nguyên loại graphic, tách các phần sẽ hiện ra lần lượt.\n" +
  "Ví dụ: điện thoại nằm trên chăn rồi sáng lên hiện thông báo → nền chăn (không có điện thoại) + sprite sheet \"Điện thoại thông báo sáng lên và hiện thông báo: từ màn hình tắt, sáng dần, đến khung thông báo '…' bật ra\" (8 khung); người dẫn ngồi trên giường cầm điện thoại, mặt đơ nói câu chốt → nền phòng ngủ (không có người) + sprite sheet \"Người dẫn ngồi cầm điện thoại, mặt đơ đang nói: khẩu hình mở/đóng, chớp mắt, đầu hơi nghiêng\" (12 khung); nếu cảnh còn có nhịp khác (vd. sau câu chốt thì đặt điện thoại xuống, khoanh tay) → thêm sprite sheet \"Nhịp 2/2: …\" cho nhịp đó.\n" +
  "VỊ TRÍ & GÓC (`placement` của mỗi ảnh) — để các lớp ghép lại trông TỰ NHIÊN: chọn MỘT góc máy/phối cảnh cho cả cảnh (vd. nhìn từ trên xuống chéo khoảng 45°, ngang tầm mắt, góc thấp hất lên) và ghi nhất quán vào placement của MỌI ảnh trong cảnh. Ảnh nền: ghi góc máy/phối cảnh và các chỗ chừa trống để ghép (vd. \"Nhìn từ trên xuống chéo 45°, mặt chăn chiếm nửa dưới khung; chừa trống giữa khung cho điện thoại\"). Cutout/sprite sheet: ghi chủ thể đặt ở đâu trong khung, nằm/đứng/ngồi trên bề mặt nào, nghiêng theo phối cảnh ra sao, quay hướng nào, chiếm khoảng bao nhiêu khung (vd. \"Nằm ngửa trên mặt chăn giữa khung, nhìn từ trên xuống chéo 45° nên thân máy thu ngắn theo phối cảnh, cạnh dưới gần máy quay hơn, hơi xoay chéo ~15°, dài khoảng 1/3 chiều rộng khung\"; \"Ngồi ở mép giường bên trái khung, góc 3/4 quay về máy quay, ngang tầm mắt, cao khoảng 2/3 khung\"). TUYỆT ĐỐI không để đồ vật nằm trên bề mặt mà vẽ thẳng mặt dẹt như ảnh chụp từ trên xuống trong khi nền nhìn chéo. Audio/video: placement để chuỗi rỗng.\n" +
  "TÍNH HỢP LÝ của hành động — kiểm tra từng mô tả như một người quan sát đời thật trước khi chốt: tư thế, hướng nhìn, cách cầm/dùng đồ vật phải đúng như người thật làm. Ví dụ: đang đọc điện thoại thì màn hình QUAY VỀ PHÍA NHÂN VẬT, hơi chúi xuống, ngang tầm ngực–mặt (người xem thấy mặt lưng máy); nhìn camera nói chuyện thì điện thoại hạ xuống/cầm hờ, KHÔNG chĩa màn hình vào ống kính. Khi khán giả cần thấy nội dung màn hình/giấy tờ → dùng cảnh cận (insert) riêng hoặc lớp phủ lúc dựng, KHÔNG bắt nhân vật cầm ngược đồ vật cho khán giả xem — trừ khi kịch bản cố ý cho nhân vật chìa/khoe vật đó (khi ấy ghi rõ động tác \"chìa màn hình về phía người xem\"). Mọi khung của một sprite sheet giữ cùng cách cầm, cùng tay cầm và cùng hướng đồ vật, trừ khi chính hành động là đổi cách cầm. Mô tả nào vô lý thì sửa cho hợp lý.\n" +
  "Mô tả tài nguyên chỉ nói NỘI DUNG — không ghi phong cách vẽ (hoạt hình 2D, nét viền, màu phẳng...), vì phong cách do skill đồ hoạ quyết định. Chữ cần hiện trong ảnh giữ NGUYÊN VĂN.";

/** The schema's "none" layer (audio/video) becomes no field at all. */
function normalizeAsset(asset: RequiredAsset): RequiredAsset {
  const { layer, placement, shot, ...rest } = asset as Omit<RequiredAsset, "layer"> & {
    layer?: string;
  };
  const isImageLayer = layer === "scene" || layer === "cutout";
  return {
    ...rest,
    ...(isImageLayer ? { layer } : {}),
    ...(isImageLayer && placement?.trim() ? { placement: placement.trim() } : {}),
    ...(isImageLayer && shot && shot > 0 ? { shot } : {}),
  };
}

/** Shots in screen order, numbered 1..n; an image pointing at a shot that doesn't exist loses the link. */
export function normalizeShots(shots: SceneShot[] | undefined): SceneShot[] {
  return [...(shots ?? [])].sort((a, b) => a.order - b.order);
}

/**
 * What a scene's `narration` is — repeated in the JSON schema itself, so it
 * holds even when a user overrides the task's prompt. The voiceover is
 * synthesized from it word for word, so it must be exactly the spoken text.
 */
export const NARRATION_RULE =
  "LỜI ĐỌC (`narration` của mỗi cảnh): chép NGUYÊN VĂN, đúng từng chữ, phần lời trong kịch bản sẽ được ĐỌC THÀNH TIẾNG trong cảnh đó (lời dẫn chuyện và lời thoại) — giọng đọc AI sẽ đọc đúng chuỗi này. " +
  "Không tóm tắt, không viết lại, không thêm chữ; bỏ ra ngoài mọi ghi chú hình ảnh/chỉ dẫn dựng (vd. phần trong [ngoặc vuông], \"(cắt cảnh)\", mô tả hành động không được đọc). " +
  "Lời đọc của các cảnh nối tiếp nhau theo đúng thứ tự kịch bản: ghép lại phải ra toàn bộ phần lời của kịch bản, không sót, không lặp. Cảnh không có lời (chỉ hình) để chuỗi rỗng.";

const NARRATION_FIELD = {
  type: "string",
  description:
    "Exact words spoken aloud in this scene, copied verbatim from the script (narration and dialogue only, no visual notes). Consecutive scenes' narration joined in order must reproduce the script's spoken text. Empty for a scene with no speech.",
} as const;

/**
 * Gives every scene and required asset a permanent `id` (kept as-is when
 * present, a fresh one when missing or duplicated). Picks, prompts and
 * timelines refer to assets by this id, never by position — positions shift
 * whenever scenes are renumbered or an asset list is re-planned.
 */
export function ensureSceneIds(scenes: ScriptScene[]): ScriptScene[] {
  const seen = new Set<string>();
  const fresh = (id: string | undefined) => {
    const value = id && !seen.has(id) ? id : randomUUID();
    seen.add(value);
    return value;
  };
  return scenes.map((scene) => ({
    ...scene,
    id: fresh(scene.id),
    requiredAssets: (scene.requiredAssets ?? []).map((asset) => ({ ...asset, id: fresh(asset.id) })),
  }));
}

/** Required assets as shown to an AI: without ids (bookkeeping it can't use, and would only cost tokens). */
export function assetsForPrompt(assets: RequiredAsset[]): Omit<RequiredAsset, "id">[] {
  return assets.map(({ id: _id, ...asset }) => asset);
}

export function withAssetLayers<T extends { scenes: ScriptScene[] }>(result: T): T {
  return {
    ...result,
    scenes: ensureSceneIds(result.scenes).map((scene) => {
      const shots = normalizeShots(scene.shots);
      const orders = new Set(shots.map((shot) => shot.order));
      return {
        ...scene,
        ...(shots.length ? { shots } : {}),
        requiredAssets: scene.requiredAssets.map(normalizeAsset).map((asset) =>
          asset.shot && !orders.has(asset.shot) ? { ...asset, shot: undefined } : asset,
        ),
      };
    }),
  };
}

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
          narration: NARRATION_FIELD,
          visualDescription: { type: "string" },
          estimatedDurationSec: { type: "integer" },
          narrativeRole: { type: "string", enum: NARRATIVE_ROLES },
          shotSize: { type: "string", enum: SHOT_SIZES },
          cameraMovement: { type: "string", enum: CAMERA_MOVEMENTS },
          heroMoment: { type: "boolean" },
          characters: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                action: { type: "string" },
              },
              required: ["name", "action"],
              additionalProperties: false,
            },
          },
          shots: { type: "array", items: SCENE_SHOT_SCHEMA },
          requiredAssets: {
            type: "array",
            items: REQUIRED_ASSET_ITEM_SCHEMA,
          },
        },
        required: [
          "index",
          "content",
          "narration",
          "visualDescription",
          "estimatedDurationSec",
          "narrativeRole",
          "shotSize",
          "cameraMovement",
          "heroMoment",
          "characters",
          "shots",
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
