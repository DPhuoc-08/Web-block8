// Hình minh hoạ cho món chưa có ảnh (chuyển từ web/src/components/DishArt.jsx của block7): mỗi loại món một hình
// nét mảnh trên nền màu của nhóm. Chọn theo tag loại món ĐẦU TIÊN của món (tags sắp theo id, loại món đứng trước).
// Tag thêm sau này chưa có hình → hình đĩa chung, nhóm xanh lá. Dữ liệu là hằng trong code; template
// partials/art-icon.ejs vẽ thành <svg>, không có giá trị nào lấy từ người dùng.

const ART = {
  "Món nước": {
    group: "nuoc",
    d: ["M10 30H54A22 20 0 0 1 10 30Z", "M24 50h16", "M17 30c4-4 8 4 12 0s8 4 12 0s4 3 6 2", "M38 6l10 22", "M45 5l8 21", "M20 22c-2-3 2-5 0-8", "M28 20c-2-3 2-5 0-8"],
  },
  "Lẩu": {
    group: "nuoc",
    d: ["M8 26h48", "M6 32h6", "M52 32h6", "M24 20c-2-3 2-5 0-8", "M32 20c-2-3 2-5 0-8", "M40 20c-2-3 2-5 0-8", "M18 57h28", "M12 38h40"],
    rect: [{ x: 12, y: 26, width: 40, height: 24, rx: 4 }],
  },
  "Món cơm": {
    group: "com",
    d: ["M10 34H54A22 18 0 0 1 10 34Z", "M24 52h16", "M16 34c0-9 7-14 16-14s16 5 16 14", "M26 26l2 1", "M34 24l2 1", "M38 29l2-1", "M29 31h2"],
  },
  "Món xào": {
    group: "com",
    d: ["M8 34H44A18 12 0 0 1 8 34Z", "M44 36L58 31", "M12 14c5-5 12-7 18-5"],
    circle: [{ cx: 18, cy: 23, r: 2.2 }, { cx: 27, cy: 16, r: 2.2 }, { cx: 35, cy: 24, r: 2.2 }],
  },
  "Món chiên": {
    group: "com",
    d: ["M8 30c8-12 28-12 36 0-8 12-28 12-36 0z", "M44 30l12-8v16z", "M23 22c3 5 3 11 0 16", "M30 25l4 5-4 5", "M14 50h8", "M27 53h8", "M40 50h8"],
    circle: [{ cx: 16, cy: 28, r: 1.6 }],
  },
  "Món nướng": {
    group: "com",
    d: ["M8 46L56 14", "M20 60c-3-4 3-6 0-10", "M32 60c-3-4 3-6 0-10", "M44 60c-3-4 3-6 0-10"],
    circle: [{ cx: 18, cy: 39.3, r: 5 }, { cx: 28, cy: 32.7, r: 5 }, { cx: 38, cy: 26, r: 5 }, { cx: 48, cy: 19.3, r: 5 }],
  },
  "Khai vị": {
    group: "xanh",
    d: ["M20 40c4-13 19-18 25-15-2 9-11 17-25 15z", "M23 39l17-11"],
    ellipse: [{ cx: 32, cy: 44, rx: 25, ry: 9 }],
    circle: [{ cx: 46, cy: 40, r: 2.5 }],
  },
  "Món cuốn": {
    group: "xanh",
    d: ["M16 35.5h16", "M30 24.5h16"],
    ellipse: [{ cx: 32, cy: 46, rx: 26, ry: 8 }],
    rect: [{ x: 10, y: 30, width: 30, height: 11, rx: 5.5 }, { x: 24, y: 19, width: 30, height: 11, rx: 5.5 }],
  },
  "Món hấp": {
    group: "xanh",
    d: ["M12 26c0-8 9-12 20-12s20 4 20 12z", "M29 9h6v5h-6z", "M12 37h40", "M22 26v22", "M42 26v22", "M8 54h48"],
    rect: [{ x: 12, y: 26, width: 40, height: 22, rx: 3 }],
  },
  "Đồ uống": {
    group: "uong",
    d: ["M18 14h28l-4 42H22z", "M35 22L44 4", "M19 24h26"],
    rect: [{ x: 24, y: 30, width: 8, height: 8, rx: 1.5 }, { x: 33, y: 37, width: 7, height: 7, rx: 1.5 }],
  },
  "Tráng miệng": {
    group: "uong",
    d: ["M8 52h48", "M18 49L22 28h20l4 21z", "M22 28c5 4 15 4 20 0", "M27 20c0-4 4-6 5-10 1 4 5 6 5 10"],
  },
};

// Hình chung cho tag không có trong bảng trên: đĩa có nắp chụp.
const FALLBACK = { group: "xanh", d: ["M14 42c0-10 8-18 18-18s18 8 18 18z", "M8 42h48", "M14 48h36"], circle: [{ cx: 32, cy: 20, r: 3 }] };

// Tag có hình riêng = tag loại món (thanh danh mục dùng để tách loại món khỏi vùng miền, Hải sản, Món chay).
export const hasArt = (name) => Object.hasOwn(ART, name);

// Hình của một tên tag (không có thì hình chung).
export const artShape = (name) => ART[name] ?? FALLBACK;

// Hình cho một món: tag đầu tiên có hình; không có thì tag đầu tiên (hình chung). Trả nhóm màu + tên tag để làm nhãn.
export function artFor(tags = []) {
  const tag = tags.find((t) => hasArt(t.name)) ?? tags[0] ?? null;
  const shape = artShape(tag?.name);
  return { group: shape.group, name: tag?.name ?? null, shape };
}
