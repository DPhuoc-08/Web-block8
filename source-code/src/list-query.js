// Điều kiện của thực đơn nằm trên URL của trang: /dishes?mode=&by=&q=&tag=&minPrice=&maxPrice=&available=&sort=&page=
// (chuyển từ web/src/listQuery.js của block7, bỏ `view` vì SSR chỉ có kiểu số trang).
// Hai việc khác nhau, hai nơi khác nhau:
// - validators/list-query.js: kiểm tra và đổi sang kiểu dữ liệu để truy vấn (lỗi → 400 kèm lỗi cạnh ô);
// - file này: đọc NGUYÊN VĂN các ô (chuỗi) để điền lại form và dựng link, kể cả giá trị sai (người dùng thấy mình gõ gì).

export const MODES = [
  { value: "basic", label: "Cơ bản", hint: "Chứa đúng từ khoá" },
  { value: "advanced", label: "Nâng cao", hint: "Từ khoá + tag + khoảng giá + trạng thái" },
  { value: "fulltext", label: "Toàn văn", hint: "Các từ trong tên và mô tả món, không cần liền nhau" },
  { value: "fuzzy", label: "Gần đúng", hint: "Gần giống khi gõ sai" },
];
export const TEXT_MODES = ["fulltext", "fuzzy"];

// "Tìm theo": từ khoá so với tên món (mặc định), tên nguyên liệu hoặc tên đầu bếp. Toàn văn luôn tìm tên + mô tả món.
export const SEARCH_BY = [
  { value: "name", label: "Theo tên món", noun: "" },
  { value: "ingredient", label: "Theo nguyên liệu", noun: "nguyên liệu " },
  { value: "chef", label: "Theo đầu bếp", noun: "đầu bếp " },
];
export const usesBy = (mode) => mode !== "fulltext";

// Gợi ý trong ô chữ theo "Tìm theo" và chế độ (ví dụ lấy từ dữ liệu seed, như block7).
export const PLACEHOLDER = {
  name: { basic: "Tìm món, ví dụ: phở, bún", fuzzy: "Ví dụ: bò lúc lắt" },
  ingredient: { basic: "Nguyên liệu, ví dụ: tôm", fuzzy: "Ví dụ: tôm xú" },
  chef: { basic: "Tên đầu bếp, ví dụ: Mai", fuzzy: "Ví dụ: Trần Thị Bít" },
  fulltext: "Ví dụ: nước dùng xương",
};
export const placeholderFor = (mode, by) =>
  mode === "fulltext" ? PLACEHOLDER.fulltext : (PLACEHOLDER[by] ?? PLACEHOLDER.name)[mode === "fuzzy" ? "fuzzy" : "basic"];

// `value` là khoá của SORTS trong validators/list-query.js.
export const SORTS = [
  { value: "", label: "Mặc định" },
  { value: "ten", label: "Tên A → Z" },
  { value: "gia-tang", label: "Giá thấp → cao" },
  { value: "gia-giam", label: "Giá cao → thấp" },
];

export const AVAILABILITY = [
  { value: "", label: "Mọi trạng thái" },
  { value: "true", label: "Còn phục vụ" },
  { value: "false", label: "Tạm hết" },
];

// Đọc các ô từ query string. Thiếu → mặc định; tham số lặp (?q=a&q=b, ra mảng) → coi như trống ở form,
// còn validators báo lỗi riêng.
export function readQuery(query) {
  const get = (k) => (typeof query[k] === "string" ? query[k].trim() : "");
  return {
    mode: get("mode") || "basic",
    by: get("by") || "name",
    q: get("q"),
    tag: get("tag"),
    minPrice: get("minPrice"),
    maxPrice: get("maxPrice"),
    available: get("available"),
    sort: get("sort"),
    page: get("page"),
  };
}

// Tham số URL trang: chỉ những tham số thuộc chế độ đang dùng, bỏ giá trị mặc định (mode basic, by name, page 1).
// basic chỉ q + sort; advanced thêm tag, giá, trạng thái; fulltext/fuzzy chỉ q (xếp theo điểm, không sort).
export function pageParams(query) {
  const p = {};
  if (query.mode !== "basic") p.mode = query.mode;
  if (usesBy(query.mode) && query.by !== "name") p.by = query.by;
  if (query.q) p.q = query.q;
  if (query.mode === "advanced") {
    for (const k of ["tag", "minPrice", "maxPrice", "available"]) if (query[k]) p[k] = query[k];
  }
  if (!TEXT_MODES.includes(query.mode) && query.sort) p.sort = query.sort;
  if (query.page && query.page !== "1") p.page = query.page;
  return p;
}

const withQuery = (path, params) => {
  const s = new URLSearchParams(params).toString();
  return s ? `${path}?${s}` : path;
};

export const menuUrl = (query) => withQuery("/dishes", pageParams(query));

export const isFiltered = (query) =>
  Boolean(query.q || (query.mode === "advanced" && (query.tag || query.minPrice || query.maxPrice || query.available)) || query.sort);

// Dải số trang rút gọn: luôn có trang đầu, trang cuối và các trang quanh trang hiện tại; chỗ bị lược thay bằng "…".
// pageWindow(5, 100) → [1, "…", 4, 5, 6, "…", 100]
export function pageWindow(page, totalPages, around = 1) {
  const pages = new Set([1, totalPages]);
  for (let p = page - around; p <= page + around; p++) if (p >= 1 && p <= totalPages) pages.add(p);
  const sorted = [...pages].sort((a, b) => a - b);
  const result = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) result.push("…");
    result.push(p);
  });
  return result;
}

// `back` (trang chi tiết → quay về đúng danh sách đang lọc): chỉ nhận URL của thực đơn, không nhận URL ngoài
// hay "//host" — tránh dùng trang của mình để chuyển người dùng sang trang lạ (open redirect).
export const safeMenuBack = (value) => (typeof value === "string" && /^\/dishes(\?|$)/.test(value) ? value : "/dishes");
