// Quản trị tag (plan 12.4): danh sách, thêm, sửa tên, xoá. Tag dùng chung cho món và chuyên môn của đầu bếp, và là
// nút lọc ở thanh danh mục của thực đơn, nên trước đây gõ sai tên là không sửa được.
// Danh sách không có tìm kiếm, số trang: số tag ít (16 khi seed), hiện hết một trang là đủ.
import { Router } from "express";
import { prisma, isNotFound, isUniqueViolation, nameTaken } from "../../db.js";
import { parseId } from "../../validators/id.js";
import { hasErrors } from "../../validators/common.js";
import { validateTag } from "../../validators/tag.js";
import { listTags } from "../../queries/dishes.js";
import { hasArt } from "../../dish-art.js";
import { one, withFlash } from "../../forms.js";

const router = Router();
const BASE = "/admin/tags";
const DUPLICATE = "Đã có tag tên này.";
const notFound = (res, text = "Tag không tồn tại hoặc đã bị xoá.") =>
  res.status(404).render("404", { title: "Không tìm thấy tag", heading: "Không tìm thấy tag", text });

router.get("/", async (req, res) => {
  const savedRaw = one(req.query.saved);
  res.render("admin/tags/index", {
    title: "Quản trị tag",
    tags: await listTags(),
    savedId: res.locals.flash && /^[1-9]\d{0,9}$/.test(savedRaw) ? Number(savedRaw) : null,
  });
});

// hasArt: thực đơn nhận ra "loại món" và chọn hình minh hoạ theo đúng TÊN tag (dish-art.js), nên đổi tên các tag này
// làm mất hình riêng và đưa tag khỏi nhóm nút hiện sẵn. Cho đổi nhưng cảnh báo ngay trên form.
const renderForm = (res, { status = 200, id = null, values, currentName = null, errors = {} }) =>
  res.status(status).render("admin/tags/form", { title: id ? "Sửa tag" : "Thêm tag", id, values, errors, hasArtName: currentName !== null && hasArt(currentName) });

async function submit(req, res, id, currentName = null) {
  const values = { name: one(req.body.name) };
  const { data, errors } = validateTag(values);
  if (!errors.name && (await nameTaken(prisma.tag, data.name, id))) errors.name = DUPLICATE;
  if (hasErrors(errors)) return renderForm(res, { status: 400, id, values, currentName, errors });
  try {
    const saved = id === null ? await prisma.tag.create({ data }) : await prisma.tag.update({ where: { id }, data });
    return res.redirect(303, withFlash(BASE, { msg: id === null ? "tag-created" : "tag-updated", saved: saved.id }));
  } catch (err) {
    if (id !== null && isNotFound(err)) return notFound(res);
    // Hai người cùng lưu một tên gần như cùng lúc: @unique ở database chặn request sau.
    if (isUniqueViolation(err)) return renderForm(res, { status: 400, id, values, currentName, errors: { name: DUPLICATE } });
    throw err;
  }
}

router.get("/new", (req, res) => renderForm(res, { values: { name: "" } }));
router.post("/", (req, res) => submit(req, res, null));

const findTag = (id) => prisma.tag.findUnique({ where: { id }, select: { id: true, name: true } });

router.get("/:id/edit", async (req, res) => {
  const id = parseId(req.params.id);
  const tag = id === null ? null : await findTag(id);
  if (!tag) return notFound(res);
  renderForm(res, { id, values: { name: tag.name }, currentName: tag.name });
});

router.patch("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  const tag = id === null ? null : await findTag(id);
  if (!tag) return notFound(res);
  return submit(req, res, id, tag.name);
});

// ---------- Xoá ----------
async function deleteView(id) {
  const tag = await prisma.tag.findUnique({ where: { id }, include: { _count: { select: { dishes: true, chefs: true } } } });
  return tag && { tag: { id: tag.id, name: tag.name }, dishCount: tag._count.dishes, chefCount: tag._count.chefs };
}

const renderDelete = (res, view, { status = 200, error = null } = {}) => res.status(status).render("admin/tags/delete", { title: "Xoá tag", ...view, error });

router.get("/:id/delete", async (req, res) => {
  const id = parseId(req.params.id);
  const view = id === null ? null : await deleteView(id);
  if (!view) return notFound(res, "Tag cần xoá không tồn tại hoặc đã bị xoá.");
  renderDelete(res, view);
});

router.delete("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  const view = id === null ? null : await deleteView(id);
  if (!view) return notFound(res, "Tag này đã bị xoá trước đó.");
  // Một câu DELETE kèm điều kiện "không món, không đầu bếp nào dùng" → không có khoảng hở giữa lúc kiểm tra và lúc xoá;
  // nếu vẫn lọt, khoá ngoại Restrict của dish_tags, chef_tags cũng chặn. Không xoá kèm liên kết: món và đầu bếp phải còn ≥ 1 tag.
  const { count } = await prisma.tag.deleteMany({ where: { id, dishes: { none: {} }, chefs: { none: {} } } });
  if (count === 0) {
    const fresh = await deleteView(id);
    if (!fresh) return notFound(res, "Tag này đã bị xoá trước đó.");
    return renderDelete(res, fresh, { status: 409, error: "Không thể xoá: tag đang được dùng." });
  }
  res.redirect(303, withFlash(BASE, { msg: "tag-deleted" }));
});

export default router;
