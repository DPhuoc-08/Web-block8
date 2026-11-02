import { MAX_INT, queryStr } from "./common.js";
import { parseId } from "./id.js";

// Đọc + validate query string của GET /api/dishes (plan mục 5.3). Query string luôn là CHUỖI (hoặc mảng khi lặp
// tham số), nên mọi giá trị đều phải parse rõ ràng:
// - thiếu hoặc chuỗi trắng → "không có tiêu chí" (dùng mặc định), KHÔNG phải lỗi;
// - có giá trị mà sai định dạng → VALIDATION_FAILED kèm fields theo đúng tên tham số (SPA hiện lỗi cạnh ô).
// Khác bộ lọc block6 (bỏ qua giá trị lạ): block7 báo lỗi để người dùng biết điều kiện của mình không được áp dụng.
// Không dùng `if (value)` cho giá trị đã parse: false và 0 là tiêu chí có hiệu lực.

export const PAGE_SIZE_DEFAULT = 12;
export const ADMIN_PAGE_SIZE_DEFAULT = 20;
export const PAGE_SIZE_MAX = 100;

// fulltext, fuzzy: chỉ đọc q (bắt buộc), xếp theo điểm phù hợp — không nhận sort và tiêu chí của advanced.
export const MODES = ["basic", "advanced", "fulltext", "fuzzy"];
export const TEXT_MODES = ["fulltext", "fuzzy"];

// Giá trị `sort` là hợp đồng với SPA. Luôn thêm id làm thứ tự phụ → thứ tự xác định, các trang chia cùng một danh sách.
export const SORTS = {
  "": [{ id: "asc" }],
  ten: [{ name: "asc" }, { id: "asc" }],
  "gia-tang": [{ price: "asc" }, { id: "asc" }],
  "gia-giam": [{ price: "desc" }, { id: "asc" }],
  "moi-nhat": [{ id: "desc" }], // giữ trong API; admin đã thôi dùng, xếp id tăng dần (plan mục 12)
};

// Trang admin tìm thêm theo tên tag (giữ từ block6, mở rộng của basic). Khoá lạ bị bỏ qua như block6.
const SEARCHABLE = ["name", "tag"];

// `by` (plan mục 14): q so khớp với cột nào — tên món (mặc định, đúng đề), tên nguyên liệu, tên đầu bếp.
// Dùng ở basic, advanced, fuzzy; fulltext bỏ qua (document của fulltext là tên + mô tả món).
// Khác `searchIn` (admin, bỏ qua khoá lạ): `by` là lựa chọn của khách trên URL → giá trị lạ báo lỗi để biết không được áp dụng.
export const SEARCH_BY = ["name", "ingredient", "chef"];

const NON_NEGATIVE_INT = /^(0|[1-9]\d*)$/;

// Trả { value } — value = null khi thiếu/trắng — hoặc { error } khi là mảng (?x=a&x=b) hay kiểu lạ.
function text(raw) {
  if (raw === undefined) return { value: null };
  if (typeof raw !== "string") return { error: "Tham số chỉ được gửi một lần." };
  const v = raw.trim();
  return { value: v === "" ? null : v };
}

// Đọc một tham số chuỗi; lỗi (mảng) ghi vào `errors` theo đúng tên tham số.
const reader = (query, errors) => (key) => {
  const r = text(query[key]);
  if (r.error) errors[key] = r.error;
  return r.value ?? null;
};

// page, pageSize — dùng chung cho /api/dishes, /api/chefs, /api/ingredients (cùng quy tắc, khác mặc định).
// Thiếu/trắng → mặc định; sai (0, âm, lẻ, chữ, > 100) → lỗi, không tự sửa: người gọi biết tham số không được áp dụng.
export function parsePaging(query, errors, { defaultSize, noun }) {
  const read = reader(query, errors);
  const rawPage = read("page");
  const rawSize = read("pageSize");

  let page = 1;
  if (rawPage !== null) {
    page = parseId(rawPage);
    if (page === null) errors.page = "Số trang phải là số nguyên dương.";
  }

  let pageSize = defaultSize;
  if (rawSize !== null) {
    pageSize = parseId(rawSize);
    if (pageSize === null || pageSize > PAGE_SIZE_MAX) errors.pageSize = `Số ${noun} mỗi trang phải từ 1 đến ${PAGE_SIZE_MAX}.`;
  }
  return { page, pageSize };
}

// Danh sách admin đầu bếp / nguyên liệu: ?q= &page= &pageSize= hoặc ?all=true (form cần đủ danh sách để chọn).
// q giữ cách đọc của block6 (mảng ?q=a&q=b → coi như không có). `all` chỉ nhận đúng chuỗi "true".
// ?mode=fuzzy (plan 14.f): tìm gần đúng theo tên — giống fuzzy của món: q BẮT BUỘC (trống → lỗi, không âm thầm lấy
// tất cả), q lặp → lỗi; không dùng cùng all=true (form cần đủ danh sách thì gọi basic). Không có fulltext: hai bảng
// chỉ có tên 1–4 chữ, không có mô tả.
export const ADMIN_MODES = ["basic", "fuzzy"];

export function parseAdminListQuery(query, noun) {
  const errors = {};
  const read = reader(query, errors);
  const { page, pageSize } = parsePaging(query, errors, { defaultSize: ADMIN_PAGE_SIZE_DEFAULT, noun });
  const rawAll = read("all");
  if (rawAll !== null && rawAll !== "true") errors.all = "Tham số all chỉ nhận giá trị true.";

  const mode = read("mode") ?? "basic";
  if (!ADMIN_MODES.includes(mode)) errors.mode = `Kiểu tìm phải là một trong: ${ADMIN_MODES.join(", ")}.`;
  if (mode !== "fuzzy") return { mode, q: queryStr(query.q), all: rawAll === "true", page, pageSize, errors };

  const q = read("q");
  if (q === null && !errors.q) errors.q = "Nhập từ khoá để tìm.";
  if (rawAll === "true") errors.all = "Tìm gần đúng không dùng cùng all=true.";
  return { mode, q, all: false, page, pageSize, errors };
}

export function parseListQuery(query) {
  const errors = {};
  const read = reader(query, errors);

  const raw = {
    mode: read("mode"), q: read("q"), sort: read("sort"),
    tag: read("tag"), minPrice: read("minPrice"), maxPrice: read("maxPrice"), available: read("available"),
    searchIn: read("searchIn"), by: read("by"),
  };

  const mode = raw.mode ?? "basic";
  if (!MODES.includes(mode)) errors.mode = `Chế độ tìm phải là một trong: ${MODES.join(", ")}.`;

  const { page, pageSize } = parsePaging(query, errors, { defaultSize: PAGE_SIZE_DEFAULT, noun: "món" });

  const sort = raw.sort ?? "";
  if (!Object.hasOwn(SORTS, sort)) errors.sort = "Cách sắp xếp không hợp lệ.";

  const result = { mode, q: raw.q, page, pageSize, sort, by: "name", searchIn: ["name"], tagId: null, minPrice: null, maxPrice: null, available: null, errors };

  if (mode !== "fulltext" && raw.by !== null) {
    if (SEARCH_BY.includes(raw.by)) result.by = raw.by;
    else errors.by = "Chỉ tìm theo tên món, nguyên liệu hoặc đầu bếp.";
  }

  // Full-text / fuzzy cần từ khoá: q trống không được âm thầm thành "lấy tất cả".
  if (TEXT_MODES.includes(mode) && raw.q === null && !errors.q) errors.q = "Nhập từ khoá để tìm.";

  // Basic chỉ đọc q, by (+ searchIn của admin). Tham số của advanced gửi kèm basic bị bỏ qua, không lỗi.
  // searchIn (tên + tag) chỉ có nghĩa khi q so với tên món.
  if (mode === "basic" && result.by === "name" && raw.searchIn !== null) {
    const fields = raw.searchIn.split(",").filter((f) => SEARCHABLE.includes(f));
    if (fields.length) result.searchIn = [...new Set(fields)];
  }

  if (mode === "advanced") {
    if (raw.tag !== null) {
      result.tagId = parseId(raw.tag);
      if (result.tagId === null) errors.tag = "Tag không hợp lệ.";
    }
    for (const key of ["minPrice", "maxPrice"]) {
      if (raw[key] === null) continue;
      // Chỉ nhận số nguyên không âm viết bằng chữ số: "0" hợp lệ; "-1", "1.5", "1e3", "abc" là lỗi.
      if (!NON_NEGATIVE_INT.test(raw[key]) || Number(raw[key]) > MAX_INT) errors[key] = "Giá phải là số nguyên không âm (đồng).";
      else result[key] = Number(raw[key]);
    }
    if (result.minPrice !== null && result.maxPrice !== null && result.minPrice > result.maxPrice) {
      errors.maxPrice = "Giá đến phải lớn hơn hoặc bằng giá từ.";
    }
    if (raw.available !== null) {
      // Không dùng Boolean("false") (= true): chỉ nhận đúng hai chuỗi.
      if (raw.available === "true") result.available = true;
      else if (raw.available === "false") result.available = false;
      else errors.available = "Trạng thái phải là true hoặc false.";
    }
  }

  return result;
}

// Literal contains: Prisma 7 đưa chuỗi của `contains` vào ILIKE '%…%' NGUYÊN VẸN — đã kiểm chứng bằng request thật:
// q=% và q=_ trả cả 1.200 món, q=Trà_ khớp "Trà matcha sữa" (_ thành "một ký tự bất kỳ").
// → Escape trước: `\` thành `\\`, `%` thành `\%`, `_` thành `\_` (một lượt thay thế duy nhất → không ký tự nào bị thoát hai lần).
// PostgreSQL dùng `\` làm ký tự escape mặc định của LIKE/ILIKE, nên chỉ hai dấu % do Prisma thêm ở hai đầu là wildcard.
// Parameter binding (Prisma) chống SQL injection; escaping này giữ đúng NGHĨA "chứa đúng chuỗi người dùng nhập".
export const escapeLike = (s) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

// Tìm admin đầu bếp / nguyên liệu: từ khoá khớp ở BẤT KỲ điều kiện nào trong `matchers`. Không có từ khoá → {} (lấy tất cả).
// Escape như món: trước khi sửa, q=% và q=_ trả cả 60 đầu bếp, 250 nguyên liệu (plan mục 12, BUILD_LOG bước 19).
export const containsIn = (field) => (s) => ({ [field]: { contains: s, mode: "insensitive" } });
export const searchWhere = (q, matchers) => (q ? { OR: matchers.map((match) => match(escapeLike(q))) } : {});

// Điều kiện Prisma cho basic / advanced. Các tiêu chí nối bằng AND; tiêu chí null = không áp dụng.
// `q` là literal contains, không phân biệt hoa thường (ILIKE, tham số bind), trên cột do `by` chọn:
//   name → tên món (hoặc tên món / tên tag với searchIn của admin)
//   ingredient → món có ÍT NHẤT MỘT nguyên liệu tên chứa q (EXISTS trên dish_ingredients → mỗi món đếm một lần)
//   chef → món do đầu bếp tên chứa q phụ trách
export function basicAdvancedWhere({ q, by, searchIn, tagId, minPrice, maxPrice, available }) {
  const nameOrTag = {
    name: (s) => ({ name: { contains: s, mode: "insensitive" } }),
    tag: (s) => ({ tags: { some: { tag: { name: { contains: s, mode: "insensitive" } } } } }),
  };
  const textMatch = {
    name: (s) => ({ OR: searchIn.map((f) => nameOrTag[f](s)) }),
    ingredient: (s) => ({ ingredients: { some: { ingredient: { name: { contains: s, mode: "insensitive" } } } } }),
    chef: (s) => ({ chef: { name: { contains: s, mode: "insensitive" } } }),
  };
  const conditions = [];
  if (q !== null) conditions.push(textMatch[by](escapeLike(q)));
  if (tagId !== null) conditions.push({ tags: { some: { tagId } } });
  if (minPrice !== null) conditions.push({ price: { gte: minPrice } });
  if (maxPrice !== null) conditions.push({ price: { lte: maxPrice } });
  if (available !== null) conditions.push({ available });
  return conditions.length ? { AND: conditions } : {};
}
