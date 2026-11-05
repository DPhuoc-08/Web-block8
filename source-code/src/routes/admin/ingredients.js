// Quản trị nguyên liệu (SSR) — chuyển từ api/src/routes/ingredients.js và các trang admin nguyên liệu của block7.
// Tên không trùng (không phân biệt hoa thường). Nguyên liệu đang được món nào dùng thì KHÔNG cho xoá → 409.
import { Router } from "express";
import { prisma, isNotFound, isUniqueViolation, isForeignKeyViolation, nameTaken } from "../../db.js";
import { parseId } from "../../validators/id.js";
import { hasErrors } from "../../validators/common.js";
import { validateIngredient } from "../../validators/ingredient.js";
import { containsIn } from "../../validators/list-query.js";
import { unaccentedIngredientIds } from "../../search/accent.js";
import { one, safeBack, withFlash } from "../../forms.js";
import { adminList, ADMIN_LIST_MODES } from "./list.js";

const router = Router();
const BASE = "/admin/ingredients";
const DUPLICATE = "Đã có nguyên liệu tên này.";
const withCount = { _count: { select: { dishes: true } } };
const notFound = (res, text = "Nguyên liệu không tồn tại hoặc đã bị xoá.") =>
  res.status(404).render("404", { title: "Không tìm thấy nguyên liệu", heading: "Không tìm thấy nguyên liệu", text });

router.get("/", async (req, res) => {
  const view = await adminList(req, res, {
    base: BASE,
    noun: "nguyên liệu",
    modes: ADMIN_LIST_MODES("Tìm theo tên hoặc đơn vị", "Nước mắn"),
    matchers: [containsIn("name"), containsIn("unit")],
    unaccentedIds: unaccentedIngredientIds,
    fuzzyMatcher: "ingredientName",
    delegate: prisma.ingredient,
    include: withCount,
  });
  if (!view) return;
  if (view.result) view.result.items = view.result.items.map(({ _count, ...i }) => ({ ...i, dishCount: _count.dishes }));
  res.status(view.status).render("admin/ingredients/index", { title: "Quản trị nguyên liệu", ...view });
});

const renderForm = (res, { status = 200, id = null, values, errors = {}, back }) =>
  res.status(status).render("admin/ingredients/form", { title: id ? "Sửa nguyên liệu" : "Thêm nguyên liệu", id, values, errors, back });

async function submit(req, res, id) {
  const values = { name: one(req.body.name), unit: one(req.body.unit) };
  const back = safeBack(one(req.body.back), BASE);
  // Form luôn gửi ô đơn vị → validateIngredient lưu null khi bỏ trống (không lưu "").
  const { data, errors } = validateIngredient(values);
  if (!errors.name && (await nameTaken(prisma.ingredient, data.name, id))) errors.name = DUPLICATE;
  if (hasErrors(errors)) return renderForm(res, { status: 400, id, values, errors, back });
  try {
    const saved = id === null ? await prisma.ingredient.create({ data }) : await prisma.ingredient.update({ where: { id }, data });
    return res.redirect(303, withFlash(id === null ? BASE : back, { msg: id === null ? "ingredient-created" : "ingredient-updated", saved: saved.id }));
  } catch (err) {
    if (id !== null && isNotFound(err)) return notFound(res);
    if (isUniqueViolation(err)) return renderForm(res, { status: 400, id, values, errors: { name: DUPLICATE }, back });
    throw err;
  }
}

router.get("/new", (req, res) => renderForm(res, { values: { name: "", unit: "" }, back: safeBack(req.query.back, BASE) }));
router.post("/", (req, res) => submit(req, res, null));

router.get("/:id/edit", async (req, res) => {
  const id = parseId(req.params.id);
  const ingredient = id === null ? null : await prisma.ingredient.findUnique({ where: { id } });
  if (!ingredient) return notFound(res);
  renderForm(res, { id, values: { name: ingredient.name, unit: ingredient.unit ?? "" }, back: safeBack(req.query.back, BASE) });
});
router.patch("/:id", (req, res) => {
  const id = parseId(req.params.id);
  return id === null ? notFound(res) : submit(req, res, id);
});

// ---------- Xoá ----------
async function deleteView(id) {
  const ingredient = await prisma.ingredient.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!ingredient) return null;
  const dishes = await prisma.dish.findMany({ where: { ingredients: { some: { ingredientId: id } } }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  return { ingredient, dishes };
}

router.get("/:id/delete", async (req, res) => {
  const id = parseId(req.params.id);
  const view = id === null ? null : await deleteView(id);
  if (!view) return notFound(res, "Nguyên liệu cần xoá không tồn tại hoặc đã bị xoá.");
  res.render("admin/ingredients/delete", { title: "Xoá nguyên liệu", ...view, error: null, back: safeBack(req.query.back, BASE) });
});

router.delete("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  const back = safeBack(one(req.body.back), BASE);
  const view = id === null ? null : await deleteView(id);
  if (!view) return notFound(res, "Nguyên liệu này đã bị xoá trước đó.");
  const blocked = () =>
    res.status(409).render("admin/ingredients/delete", { title: "Xoá nguyên liệu", ...view, error: "Không thể xoá: nguyên liệu đang được món dùng.", back });
  // Đang được dùng → 409, không xoá (dish_ingredients.ingredientId là khoá ngoại Restrict).
  if (view.dishes.length > 0) return blocked();
  try {
    await prisma.ingredient.delete({ where: { id } });
  } catch (err) {
    if (isNotFound(err)) return notFound(res, "Nguyên liệu này đã bị xoá trước đó.");
    // Vừa được thêm vào một món ở tab khác giữa lúc kiểm tra và lúc xoá → khoá ngoại chặn.
    if (isForeignKeyViolation(err)) return blocked();
    throw err;
  }
  res.redirect(303, withFlash(back, { msg: "ingredient-deleted" }));
});

export default router;
