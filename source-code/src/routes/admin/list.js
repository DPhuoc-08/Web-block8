// Phần chung của danh sách quản trị đầu bếp / nguyên liệu (chuyển từ AdminChefListPage / AdminIngredientListPage
// của block7): ?q= &mode=basic|fuzzy &page=, 20 dòng/trang, id tăng dần; gần đúng xếp điểm rồi id.
import { prisma, findPage, findFuzzyPage } from "../../db.js";
import { hasErrors } from "../../validators/common.js";
import { parseAdminListQuery, searchWhere } from "../../validators/list-query.js";
import { pageWindow } from "../../list-query.js";
import { one, withBack } from "../../forms.js";

export const ADMIN_LIST_MODES = (basicPlaceholder, fuzzyExample) => [
  { value: "basic", label: "Cơ bản", placeholder: basicPlaceholder },
  { value: "fuzzy", label: "Gần đúng", placeholder: `Tên gõ sai vẫn ra — ví dụ: ${fuzzyExample}` },
];

const listParams = ({ q, mode, page }) => {
  const p = {};
  if (q) p.q = q;
  if (mode !== "basic") p.mode = mode;
  if (page && page !== "1") p.page = page;
  return p;
};
const urlOf = (base, state) => {
  const s = new URLSearchParams(listParams(state)).toString();
  return s ? `${base}?${s}` : base;
};

// Đọc URL → validate → (chuyển về URL gọn) → truy vấn một trang. Trả null khi đã redirect.
// opts: { base, noun, modes, matchers (cột tìm ở kiểu cơ bản), unaccentedIds (cùng các cột, từ khoá không dấu), fuzzyMatcher, delegate, include }
export async function adminList(req, res, opts) {
  const { base, noun, modes } = opts;
  const state = { q: one(req.query.q).trim(), mode: one(req.query.mode).trim() || "basic", page: one(req.query.page).trim() };
  // Validator của block7: page, mode (basic|fuzzy), q bắt buộc khi gần đúng. URL trang không nhận pageSize, all.
  const query = parseAdminListQuery({ q: req.query.q, mode: req.query.mode, page: req.query.page }, noun);

  if (!hasErrors(query.errors)) {
    const canonical = new URLSearchParams(listParams(state));
    for (const k of ["msg", "saved"]) if (typeof req.query[k] === "string") canonical.set(k, req.query[k]);
    const target = canonical.size ? `${base}?${canonical}` : base;
    if (req.originalUrl !== target) {
      res.redirect(target);
      return null;
    }
  }

  const invalid = hasErrors(query.errors);
  let result = null;
  if (!invalid) {
    // `total` đếm cùng điều kiện với các dòng của trang (findPage: một transaction RepeatableRead, như block7).
    let page;
    if (query.mode === "fuzzy") {
      page = await findFuzzyPage(opts.delegate, opts.fuzzyMatcher, { include: opts.include }, query);
    } else {
      const ids = await opts.unaccentedIds(prisma, query.q);
      const where = ids ? { id: { in: ids } } : searchWhere(query.q, opts.matchers);
      page = await findPage(opts.delegate, { where, include: opts.include }, query);
    }
    const { rows, ...meta } = page;
    result = { items: rows, ...meta };
  }
  const totalPages = result ? Math.ceil(result.total / result.pageSize) : 0;
  const listUrl = urlOf(base, state);
  const savedRaw = one(req.query.saved);
  return {
    state,
    modes,
    placeholder: modes.find((m) => m.value === state.mode)?.placeholder ?? modes[0].placeholder,
    modeLabel: modes.find((m) => m.value === state.mode)?.label ?? "",
    errors: query.errors,
    invalid,
    result,
    scored: result ? result.items.some((r) => r.score !== undefined) : false,
    totalPages,
    pages: result && totalPages > 1 ? pageWindow(Math.min(result.page, totalPages), totalPages) : [],
    pageHref: (n) => urlOf(base, { ...state, page: n > 1 ? String(n) : "" }),
    savedId: res.locals.flash && /^[1-9]\d{0,9}$/.test(savedRaw) ? Number(savedRaw) : null,
    newHref: withBack(`${base}/new`, listUrl, base),
    editHref: (id) => withBack(`${base}/${id}/edit`, listUrl, base),
    deleteHref: (id) => withBack(`${base}/${id}/delete`, listUrl, base),
    status: invalid ? 400 : 200,
  };
}
