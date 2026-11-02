// Trang khách (chỉ GET, không cần đăng nhập): thực đơn /dishes và chi tiết /dishes/:id.
// Chuyển từ DishListPage / DishDetailPage của block7: server đọc URL → validate → truy vấn → render cả trang HTML.
import { Router } from "express";
import { parseId } from "../validators/id.js";
import { hasErrors } from "../validators/common.js";
import { parseListQuery } from "../validators/list-query.js";
import { listDishes, getDish, listTags } from "../queries/dishes.js";
import { hasArt } from "../dish-art.js";
import {
  MODES, TEXT_MODES, SEARCH_BY, SORTS, AVAILABILITY, PLACEHOLDER, usesBy, placeholderFor,
  readQuery, pageParams, menuUrl, isFiltered, pageWindow, safeMenuBack,
} from "../list-query.js";

const router = Router();

const SHOWN_KINDS = 5; // thanh danh mục: hiện sẵn 5 loại món nhiều món nhất (block7 13.b)

// Thanh danh mục: mỗi nút là lối tắt của chế độ Nâng cao (mode=advanced&tag=<id>), giữ từ khoá / giá đã áp dụng,
// về trang 1. Số trên nút = dishCount của tag (toàn bộ món, không theo bộ lọc — block7 13.c).
function categoryBar(tags, form) {
  const activeTag = form.mode === "advanced" ? form.tag : "";
  const byCount = (a, b) => b.dishCount - a.dishCount || a.id - b.id;
  const kinds = tags.filter((t) => hasArt(t.name)).sort(byCount);
  const pill = (t) => ({ ...t, url: menuUrl({ ...form, mode: "advanced", tag: String(t.id), page: "" }), current: activeTag === String(t.id), art: hasArt(t.name) });
  const shown = kinds.slice(0, SHOWN_KINDS).map(pill);
  const hidden = [...kinds.slice(SHOWN_KINDS), ...tags.filter((t) => !hasArt(t.name)).sort(byCount)].map(pill);
  return {
    allUrl: menuUrl({ ...form, mode: "advanced", tag: "", page: "" }),
    allCurrent: !activeTag,
    shown,
    hidden,
    // Tag đang lọc nằm trong phần ẩn → phần ẩn luôn mở (nút đang chọn phải thấy được).
    activeHidden: hidden.some((t) => t.current),
  };
}

router.get("/dishes", async (req, res) => {
  const form = readQuery(req.query);
  // URL trang không nhận pageSize (thực đơn cố định 12 món/trang như block7); searchIn chỉ dành cho admin.
  const query = parseListQuery({ ...req.query, pageSize: undefined, searchIn: undefined });

  // URL gọn: form GET gửi cả ô trống (tag=&minPrice=) và tham số không thuộc chế độ đang chọn. Điều kiện hợp lệ thì
  // chuyển về URL chỉ gồm tham số có hiệu lực (như toPageParams của block7) → link copy được gọn, Back/Forward rõ ràng.
  // Có lỗi thì giữ nguyên URL để hiện đúng giá trị sai cạnh ô.
  if (!hasErrors(query.errors)) {
    const canonical = new URLSearchParams(pageParams(form));
    if (typeof req.query.msg === "string") canonical.set("msg", req.query.msg);
    const target = canonical.size ? `/dishes?${canonical}` : "/dishes";
    if (req.originalUrl !== target) return res.redirect(target);
  }

  // Tag (thanh danh mục, ô chọn tag) và một trang món: hai việc độc lập → chạy song song.
  const errors = query.errors;
  const [tags, data] = await Promise.all([listTags(), hasErrors(errors) ? null : listDishes(query)]);
  // Tag phải có thật: lọc theo tag không tồn tại là điều kiện sai, không phải "0 kết quả" (như API block7).
  const tagMissing = query.tagId !== null && !errors.tag && !tags.some((t) => t.id === query.tagId);
  if (tagMissing) errors.tag = "Tag không tồn tại.";
  const invalid = hasErrors(errors);
  const result = invalid ? null : data;

  const filtered = isFiltered(form);
  const totalPages = result ? Math.ceil(result.total / result.pageSize) : 0;
  const listUrl = menuUrl(form);
  // Trang chi tiết quay về đúng danh sách đang lọc: chỉ thêm ?back= khi danh sách không phải thực đơn mặc định.
  const cardHref = (id) => (listUrl === "/dishes" ? `/dishes/${id}` : `/dishes/${id}?${new URLSearchParams({ back: listUrl })}`);
  // Link số trang: giữ bộ điều kiện, chỉ đổi page; #ket-qua → trình duyệt cuộn thẳng tới đầu danh sách.
  const pageHref = (n) => `${menuUrl({ ...form, page: n > 1 ? String(n) : "" })}#ket-qua`;
  const byNoun = usesBy(form.mode) ? (SEARCH_BY.find((b) => b.value === form.by)?.noun ?? "") : "";

  res.status(invalid ? 400 : 200).render("dishes/index", {
    title: "Thực đơn",
    form,
    errors,
    invalid,
    result,
    filtered,
    // Đầu trang đầy đủ chỉ ở trang 1 khi chưa có điều kiện; còn lại thu gọn để kết quả lên gần đầu màn hình.
    heroFull: !filtered && (form.page === "" || form.page === "1"),
    // Ảnh ghép: 3 món CÓ ẢNH đầu tiên của chính trang vừa tải (không thêm truy vấn, không ghi cứng link ảnh).
    heroPhotos: result ? result.items.filter((d) => d.imageUrl).slice(0, 3) : [],
    tagOptions: tags.filter((t) => t.dishCount > 0),
    categories: categoryBar(tags.filter((t) => t.dishCount > 0), form),
    modes: MODES,
    searchBy: SEARCH_BY,
    sorts: SORTS,
    availability: AVAILABILITY,
    isText: TEXT_MODES.includes(form.mode),
    byLocked: !usesBy(form.mode),
    placeholder: placeholderFor(form.mode, usesBy(form.mode) ? form.by : "name"),
    placeholders: PLACEHOLDER, // public/js/ui.js đổi gợi ý khi chọn kiểu tìm / "Tìm theo"
    modeHint: MODES.find((m) => m.value === form.mode)?.hint ?? "Chế độ tìm không hợp lệ.",
    byNoun,
    // Form sắp xếp gửi lại bộ điều kiện ĐÃ ÁP DỤNG (không gồm sort, page) + sort mới → về trang 1.
    sortHidden: Object.entries(pageParams({ ...form, sort: "", page: "" })),
    clearUrl: "/dishes",
    totalPages,
    pages: result && totalPages > 1 ? pageWindow(Math.min(result.page, totalPages), totalPages) : [],
    pageHref,
    cardHref,
  });
});

router.get("/dishes/:id", async (req, res) => {
  // Id sai định dạng ("abc", "2.5") → 404 ngay, không truy vấn.
  const id = parseId(req.params.id);
  const dish = id === null ? null : await getDish(id);
  if (!dish) return res.status(404).render("404", { title: "Không tìm thấy món", heading: "Không tìm thấy món", text: "Món ăn này không tồn tại hoặc đã bị xoá." });
  res.render("dishes/show", { title: dish.name, dish, backUrl: safeMenuBack(req.query.back) });
});

export default router;
