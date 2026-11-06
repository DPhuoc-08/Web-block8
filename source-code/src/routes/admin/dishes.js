// Quản trị món ăn (SSR) — chuyển từ AdminDishListPage / DishFormPage / DishDeletePage của block7.
// GET chỉ hiển thị; ghi dữ liệu chỉ qua POST / PATCH / DELETE (method-override), ghi xong luôn redirect 303
// (Post/Redirect/Get) để Reload không gửi lại request ghi.
import { Router } from "express";
import { prisma, isNotFound, isForeignKeyViolation, isUniqueViolation, nameTaken } from "../../db.js";
import { parseId } from "../../validators/id.js";
import { hasErrors } from "../../validators/common.js";
import { validateDish, checkDishRefs } from "../../validators/dish.js";
import { parseListQuery, ADMIN_PAGE_SIZE_DEFAULT } from "../../validators/list-query.js";
import { listDishes, getDish, TAG_SELECT, flatTags } from "../../queries/dishes.js";
import { pageWindow } from "../../list-query.js";
import { one, many, toNumberIfDigits, toIdArray, splitNames, safeBack, withFlash, withBack } from "../../forms.js";

const router = Router();
const BASE = "/admin/dishes";

// Kiểu tìm của admin món (block7 plan 14.e): cơ bản tìm tên món + tên tag; toàn văn / gần đúng xếp theo điểm.
const MODES = [
  { value: "basic", label: "Cơ bản", placeholder: "Tìm theo tên món hoặc tag" },
  { value: "fulltext", label: "Toàn văn", placeholder: "Các từ trong tên, mô tả — ví dụ: nước dùng xương" },
  { value: "fuzzy", label: "Gần đúng", placeholder: "Tên gõ sai vẫn ra — ví dụ: Bò lúc lắt" },
];

const notFound = (res, text = "Món cần sửa không tồn tại hoặc đã bị xoá.") =>
  res.status(404).render("404", { title: "Không tìm thấy món", heading: "Không tìm thấy món", text });

// Bộ lọc tình trạng (plan 12.4). Giá trị là hợp đồng trên URL, form GET gửi đúng các giá trị này.
const AVAILABILITY = [
  { value: "", label: "Mọi tình trạng" },
  { value: "true", label: "Đang phục vụ" },
  { value: "false", label: "Tạm hết" },
];

// URL danh sách gọn: q, mode (khác cơ bản), bộ lọc, page (khác 1) — như AdminSearch của block7.
function listParams({ q, mode, available, chef, page }) {
  const p = {};
  if (q) p.q = q;
  if (mode !== "basic") p.mode = mode;
  if (available) p.available = available;
  if (chef) p.chef = chef;
  if (page && page !== "1") p.page = page;
  return p;
}
const listUrlOf = (state) => {
  const s = new URLSearchParams(listParams(state)).toString();
  return s ? `${BASE}?${s}` : BASE;
};

// ---------- Danh sách ----------
// /admin/dishes?q=&mode=&available=&chef=&page= — 20 món/trang, id tăng dần (block7 plan 12); toàn văn / gần đúng xếp điểm rồi id.
router.get("/", async (req, res) => {
  const state = {
    q: one(req.query.q).trim(), mode: one(req.query.mode).trim() || "basic", page: one(req.query.page).trim(),
    available: one(req.query.available).trim(), chef: one(req.query.chef).trim(),
  };
  const modeKnown = MODES.some((m) => m.value === state.mode);
  // Dùng lại validator của thực đơn: cùng quy tắc page, q bắt buộc ở toàn văn / gần đúng, escape % _ \.
  // Cơ bản tìm cả tên tag (searchIn), không sort → id tăng dần.
  const query = parseListQuery({
    q: req.query.q,
    page: req.query.page,
    mode: modeKnown ? state.mode : "basic",
    pageSize: String(ADMIN_PAGE_SIZE_DEFAULT),
    searchIn: state.mode === "basic" ? "name,tag" : undefined,
  });
  if (!modeKnown) query.errors.mode = "Kiểu tìm phải là một trong: Cơ bản, Toàn văn, Gần đúng.";

  // Bộ lọc nằm ngoài parseListQuery (của thực đơn chỉ đọc available ở chế độ nâng cao). Query chỉ nhận khi là chuỗi;
  // giá trị sai báo lỗi thay vì âm thầm bỏ qua, để người xem biết điều kiện của mình chưa được áp dụng.
  const chefs = await prisma.chef.findMany({ select: { id: true, name: true }, orderBy: [{ name: "asc" }, { id: "asc" }] });
  if (req.query.available !== undefined && (typeof req.query.available !== "string" || !AVAILABILITY.some((a) => a.value === state.available))) {
    query.errors.available = "Tình trạng lọc không hợp lệ.";
  } else {
    query.available = state.available === "" ? null : state.available === "true";
  }
  if (req.query.chef !== undefined && typeof req.query.chef !== "string") {
    query.errors.chef = "Đầu bếp lọc không hợp lệ.";
  } else if (state.chef) {
    query.chefId = parseId(state.chef);
    if (query.chefId === null || !chefs.some((c) => c.id === query.chefId)) query.errors.chef = "Đầu bếp lọc không tồn tại.";
  }

  // URL gọn (form GET gửi cả mode=basic, q rỗng): như thực đơn, chỉ khi điều kiện hợp lệ.
  if (!hasErrors(query.errors)) {
    const canonical = new URLSearchParams(listParams(state));
    for (const k of ["msg", "saved"]) if (typeof req.query[k] === "string") canonical.set(k, req.query[k]);
    const target = canonical.size ? `${BASE}?${canonical}` : BASE;
    if (req.originalUrl !== target) return res.redirect(target);
  }

  const invalid = hasErrors(query.errors);
  const result = invalid ? null : await listDishes(query);
  const totalPages = result ? Math.ceil(result.total / result.pageSize) : 0;
  const listUrl = listUrlOf(state);
  // Dòng vừa thêm/sửa (?msg=…&saved=<id>) được tô; chỉ nhận số và chỉ dùng để so sánh, không in ra trang.
  const savedRaw = one(req.query.saved);
  const savedId = res.locals.flash && /^[1-9]\d{0,9}$/.test(savedRaw) ? Number(savedRaw) : null;

  res.status(invalid ? 400 : 200).render("admin/dishes/index", {
    title: "Quản trị món ăn",
    state,
    modes: MODES,
    placeholder: MODES.find((m) => m.value === state.mode)?.placeholder ?? MODES[0].placeholder,
    modeLabel: MODES.find((m) => m.value === state.mode)?.label ?? "",
    errors: query.errors,
    invalid,
    result,
    scored: result ? result.items.some((d) => d.score !== undefined) : false,
    totalPages,
    pages: result && totalPages > 1 ? pageWindow(Math.min(result.page, totalPages), totalPages) : [],
    pageHref: (n) => listUrlOf({ ...state, page: n > 1 ? String(n) : "" }),
    savedId,
    listUrl,
    availabilityOptions: AVAILABILITY,
    chefOptions: chefs,
    filtered: Boolean(state.available || state.chef),
    newHref: withBack(`${BASE}/new`, listUrl, BASE),
    editHref: (id) => withBack(`${BASE}/${id}/edit`, listUrl, BASE),
    deleteHref: (id) => withBack(`${BASE}/${id}/delete`, listUrl, BASE),
  });
});

// ---------- Form thêm / sửa ----------

// Danh sách form cần (đọc lại ở mỗi lần mở form → luôn khớp database, cũng là tập id hợp lệ để chọn).
async function loadOptions() {
  const [tags, chefs, ingredients] = await Promise.all([
    prisma.tag.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.chef.findMany({ select: { id: true, name: true, tags: TAG_SELECT }, orderBy: { id: "asc" } }),
    prisma.ingredient.findMany({ select: { id: true, name: true, unit: true }, orderBy: { name: "asc" } }),
  ]);
  return { tags, chefs: chefs.map((c) => ({ ...c, tags: flatTags(c.tags) })), ingredients };
}

// Giá trị form giữ dạng chuỗi như ô nhập (giá, id); hiện lại đúng những gì người dùng đã gõ khi có lỗi.
const EMPTY = { name: "", price: "", description: "", imageUrl: "", imageCredit: "", available: true, chefId: "", tagIds: [], ingredientIds: [], newTags: "", newIngredients: "", newChef: "" };

const valuesFromDish = (dish) => ({
  ...EMPTY,
  name: dish.name,
  price: String(dish.price),
  description: dish.description ?? "",
  imageUrl: dish.imageUrl ?? "",
  imageCredit: dish.imageCredit ?? "",
  available: dish.available,
  chefId: String(dish.chef.id),
  tagIds: dish.tags.map((t) => String(t.id)),
  ingredientIds: dish.ingredients.map((i) => String(i.id)),
});

const valuesFromBody = (body) => ({
  name: one(body.name),
  price: one(body.price),
  description: one(body.description),
  imageUrl: one(body.imageUrl),
  imageCredit: one(body.imageCredit),
  // Checkbox không tick thì trình duyệt không gửi gì → false.
  available: one(body.available) === "on",
  chefId: one(body.chefId),
  tagIds: many(body.tagIds),
  ingredientIds: many(body.ingredientIds),
  newTags: one(body.newTags),
  newIngredients: one(body.newIngredients),
  newChef: one(body.newChef),
});

// Đầu bếp có chuyên môn trùng tag đang chọn của món đứng trước (gợi ý, block7: API không bắt buộc đúng chuyên môn).
function chefGroups(chefs, tagIds) {
  const chosen = new Set(tagIds.map(Number));
  const fits = (c) => c.tags.some((t) => chosen.has(t.id));
  return { fit: chefs.filter(fits), other: chefs.filter((c) => !fits(c)) };
}

function renderForm(res, { status = 200, id = null, values, errors = {}, generalError = null, options, back }) {
  const selectedIngredients = new Set(values.ingredientIds);
  res.status(status).render("admin/dishes/form", {
    title: id ? "Sửa món" : "Thêm món",
    id,
    values,
    errors,
    generalError,
    back,
    tags: options.tags,
    chefs: chefGroups(options.chefs, values.tagIds),
    // Nguyên liệu đã chọn đứng đầu danh sách tick (bản không JavaScript): thấy ngay mình đã chọn gì.
    ingredients: [...options.ingredients.filter((i) => selectedIngredients.has(String(i.id))), ...options.ingredients.filter((i) => !selectedIngredients.has(String(i.id)))],
  });
}

// Đổi giá trị form sang body JSON-có-kiểu của validator block7, validate, kiểm tra id có thật và tên mới chưa trùng.
// Thêm nhanh khi lưu (plan block8 12.2.a): tag / nguyên liệu / đầu bếp chưa có thì gõ tên, tạo cùng lúc với món.
async function validateForm(values) {
  const newTags = splitNames(values.newTags);
  const newIngredients = splitNames(values.newIngredients);
  const wantsNewChef = values.chefId === "new";
  const newChef = values.newChef.trim();

  const input = validateDish({
    name: values.name,
    price: toNumberIfDigits(values.price),
    description: values.description,
    imageUrl: values.imageUrl,
    imageCredit: values.imageCredit,
    available: values.available,
    chefId: wantsNewChef ? undefined : toNumberIfDigits(values.chefId),
    tagIds: toIdArray(values.tagIds),
    ingredientIds: toIdArray(values.ingredientIds),
  });
  const { errors } = input;

  // "Chọn ít nhất một …" không còn đúng khi đã gõ tên mới: món nhận tag / nguyên liệu / đầu bếp vừa tạo.
  if (newTags.length && values.tagIds.length === 0) delete errors.tagIds;
  if (newIngredients.length && values.ingredientIds.length === 0) delete errors.ingredientIds;
  if (wantsNewChef) {
    delete errors.chefId;
    if (!newChef) errors.newChef = "Nhập tên đầu bếp mới.";
  }
  input.tagIds ??= [];
  input.ingredientIds ??= [];

  if (!hasErrors(errors)) await checkDishRefs(prisma, input);

  // Tên mới trùng tên đã có (không phân biệt hoa thường, như block7) → báo cạnh ô, không tạo bản ghi thứ hai.
  const taken = async (delegate, names) => (await Promise.all(names.map(async (n) => ((await nameTaken(delegate, n)) ? n : null)))).filter(Boolean);
  const [tagsTaken, ingredientsTaken, chefTaken] = await Promise.all([
    taken(prisma.tag, newTags),
    taken(prisma.ingredient, newIngredients),
    wantsNewChef && newChef ? taken(prisma.chef, [newChef]) : [],
  ]);
  if (tagsTaken.length) errors.newTags = `Đã có tag: ${tagsTaken.join(", ")}. Hãy chọn trong danh sách.`;
  if (ingredientsTaken.length) errors.newIngredients = `Đã có nguyên liệu: ${ingredientsTaken.join(", ")}. Hãy chọn trong danh sách.`;
  if (chefTaken.length) errors.newChef = `Đã có đầu bếp “${newChef}”. Hãy chọn trong danh sách.`;

  return { input, newTags, newIngredients, newChef: wantsNewChef ? newChef : null };
}

// Ghi món cùng các bản ghi mới trong MỘT transaction: lỗi ở bất kỳ bước nào → không còn tag / nguyên liệu /
// đầu bếp "mồ côi" được tạo dở.
async function saveDish(id, { input, newTags, newIngredients, newChef }) {
  return prisma.$transaction(
    async (tx) => {
      const tagIds = [...input.tagIds];
      for (const name of newTags) tagIds.push((await tx.tag.create({ data: { name } })).id);
      const ingredientIds = [...input.ingredientIds];
      for (const name of newIngredients) ingredientIds.push((await tx.ingredient.create({ data: { name } })).id);
      let chefId = input.data.chefId;
      // Đầu bếp mới bắt buộc ≥ 1 chuyên môn (block7) → nhận các tag của món (như form block7).
      if (newChef) chefId = (await tx.chef.create({ data: { name: newChef, tags: { create: tagIds.map((tagId) => ({ tagId })) } } })).id;

      const links = {
        tags: { create: tagIds.map((tagId) => ({ tagId })) },
        ingredients: { create: ingredientIds.map((ingredientId) => ({ ingredientId })) },
      };
      if (id === null) return tx.dish.create({ data: { ...input.data, chefId, ...links } });
      // Sửa: thay toàn bộ liên kết (deleteMany + create trong cùng lệnh update, như block7).
      return tx.dish.update({
        where: { id },
        data: { ...input.data, chefId, tags: { deleteMany: {}, ...links.tags }, ingredients: { deleteMany: {}, ...links.ingredients } },
      });
    },
    { maxWait: 10_000, timeout: 20_000 },
  );
}

// Xử lý chung cho thêm (id = null) và sửa.
async function submit(req, res, id) {
  const values = valuesFromBody(req.body);
  const back = safeBack(one(req.body.back), BASE);
  const checked = await validateForm(values);
  // Input sai → 400, không ghi DB, render lại form giữ nguyên giá trị đã nhập (kể cả ô đã tick, tên mới đã gõ).
  if (hasErrors(checked.input.errors)) {
    return renderForm(res, { status: 400, id, values, errors: checked.input.errors, options: await loadOptions(), back });
  }
  try {
    const saved = await saveDish(id, checked);
    // Thêm mới → trang 1 của danh sách + thông báo (món mới nằm ở trang cuối, block7 plan 12); sửa → đúng trang đang làm.
    // saved=<id> → danh sách tô dòng vừa lưu. Luôn đợi ghi xong rồi mới redirect.
    return res.redirect(303, withFlash(id === null ? BASE : back, { msg: id === null ? "dish-created" : "dish-updated", saved: saved.id }));
  } catch (err) {
    if (id !== null && isNotFound(err)) return notFound(res, "Món này không còn tồn tại (có thể vừa bị xoá ở nơi khác).");
    // Đầu bếp / nguyên liệu / tag vừa bị xoá, hoặc tên mới vừa được thêm ở tab khác giữa lúc kiểm tra và lúc ghi.
    if (isForeignKeyViolation(err) || isUniqueViolation(err)) {
      const again = await validateForm(values);
      const errors = hasErrors(again.input.errors) ? again.input.errors : {};
      return renderForm(res, {
        status: 400, id, values, errors, options: await loadOptions(), back,
        generalError: hasErrors(errors) ? null : "Dữ liệu vừa thay đổi ở nơi khác, vui lòng kiểm tra lại và lưu lần nữa.",
      });
    }
    throw err;
  }
}

router.get("/new", async (req, res) => {
  renderForm(res, { values: EMPTY, options: await loadOptions(), back: safeBack(req.query.back, BASE) });
});

router.post("/", (req, res) => submit(req, res, null));

router.get("/:id/edit", async (req, res) => {
  const id = parseId(req.params.id);
  const [dish, options] = await Promise.all([id === null ? null : getDish(id), loadOptions()]);
  if (!dish) return notFound(res);
  renderForm(res, { id, values: valuesFromDish(dish), options, back: safeBack(req.query.back, BASE) });
});

router.patch("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) return notFound(res);
  return submit(req, res, id);
});

// ---------- Đổi nhanh tình trạng (plan 12.4) ----------
// Việc hằng ngày của nhà hàng: một nút ngay trên danh sách, không phải mở cả form sửa. Vẫn là form POST có _csrf, không
// cần JavaScript. Form gửi giá trị ĐÍCH (không phải "đảo trạng thái") → bấm hai lần hay hai tab cùng bấm vẫn ra đúng ý.
router.patch("/:id/availability", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) return notFound(res);
  const raw = one(req.body.available);
  if (raw !== "true" && raw !== "false") {
    return res.status(400).render("404", { code: 400, title: "Yêu cầu không hợp lệ", heading: "Yêu cầu không hợp lệ", text: "Tình trạng món phải là Đang phục vụ hoặc Tạm hết." });
  }
  try {
    await prisma.dish.update({ where: { id }, data: { available: raw === "true" } });
  } catch (err) {
    if (isNotFound(err)) return notFound(res, "Món này không còn tồn tại (có thể vừa bị xoá ở nơi khác).");
    throw err;
  }
  res.redirect(303, withFlash(safeBack(one(req.body.back), BASE), { msg: "dish-availability", saved: id }));
});

// ---------- Xoá ----------
// Trang xác nhận chỉ đọc; chỉ form "Xoá" (DELETE) mới ghi. Liên kết món–nguyên liệu, món–tag tự xoá (Cascade).
router.get("/:id/delete", async (req, res) => {
  const id = parseId(req.params.id);
  const dish = id === null ? null : await prisma.dish.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!dish) return notFound(res, "Món cần xoá không tồn tại hoặc đã bị xoá.");
  res.render("admin/dishes/delete", { title: "Xoá món", dish, back: safeBack(req.query.back, BASE) });
});

router.delete("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) return notFound(res, "Món cần xoá không tồn tại hoặc đã bị xoá.");
  try {
    await prisma.dish.delete({ where: { id } });
  } catch (err) {
    if (isNotFound(err)) return notFound(res, "Món này đã bị xoá trước đó.");
    throw err;
  }
  // Xoá xong → về đúng trang đã mở; xoá món cuối của trang cuối thì trang đó vượt phạm vi → bảng hiện "Về trang cuối".
  res.redirect(303, withFlash(safeBack(one(req.body.back), BASE), { msg: "dish-deleted" }));
});

export default router;
