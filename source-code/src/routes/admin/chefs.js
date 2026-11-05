// Quản trị đầu bếp (SSR) — chuyển từ api/src/routes/chefs.js và các trang admin đầu bếp của block7.
// Tên không trùng (không phân biệt hoa thường); chuyên môn là danh sách tag (≥ 1).
// Xoá đầu bếp còn món: phải chọn người nhận, chuyển món + xoá trong MỘT transaction; không chọn → 409.
import { Router } from "express";
import { prisma, isNotFound, isUniqueViolation, isForeignKeyViolation, nameTaken } from "../../db.js";
import { parseId } from "../../validators/id.js";
import { hasErrors } from "../../validators/common.js";
import { validateChef } from "../../validators/chef.js";
import { allTagsExist, TAG_MISSING } from "../../validators/tag.js";
import { containsIn } from "../../validators/list-query.js";
import { unaccentedChefIds } from "../../search/accent.js";
import { TAG_SELECT, flatTags } from "../../queries/dishes.js";
import { one, many, toIdArray, splitNames, safeBack, withFlash } from "../../forms.js";
import { adminList, ADMIN_LIST_MODES } from "./list.js";

const router = Router();
const BASE = "/admin/chefs";
const DUPLICATE = "Đã có đầu bếp tên này.";
const withCount = { _count: { select: { dishes: true } }, tags: TAG_SELECT };
const toChef = ({ _count, tags, ...chef }) => ({ ...chef, tags: flatTags(tags), dishCount: _count.dishes });
const notFound = (res, text = "Đầu bếp không tồn tại hoặc đã bị xoá.") =>
  res.status(404).render("404", { title: "Không tìm thấy đầu bếp", heading: "Không tìm thấy đầu bếp", text });

router.get("/", async (req, res) => {
  const view = await adminList(req, res, {
    base: BASE,
    noun: "đầu bếp",
    modes: ADMIN_LIST_MODES("Tìm theo tên hoặc chuyên môn", "Nguyễn Văn Ann"),
    // Cơ bản: khớp tên HOẶC tên một chuyên môn (như block7).
    matchers: [containsIn("name"), (s) => ({ tags: { some: { tag: containsIn("name")(s) } } })],
    unaccentedIds: unaccentedChefIds,
    fuzzyMatcher: "chefName",
    delegate: prisma.chef,
    include: withCount,
  });
  if (!view) return;
  if (view.result) view.result.items = view.result.items.map((c) => ({ ...toChef(c), score: c.score }));
  res.status(view.status).render("admin/chefs/index", { title: "Quản trị đầu bếp", ...view });
});

// ---------- Form ----------
const tagList = () => prisma.tag.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });

function renderForm(res, { status = 200, id = null, values, errors = {}, tags, back }) {
  res.status(status).render("admin/chefs/form", { title: id ? "Sửa đầu bếp" : "Thêm đầu bếp", id, values, errors, tags, back });
}

const valuesFromBody = (body) => ({ name: one(body.name), tagIds: many(body.tagIds), newTags: one(body.newTags) });

async function submit(req, res, id) {
  const values = valuesFromBody(req.body);
  const back = safeBack(one(req.body.back), BASE);
  const newTags = splitNames(values.newTags);
  const { data, tagIds, errors } = validateChef({ name: values.name, tagIds: toIdArray(values.tagIds) });
  // Chuyên môn mới gõ tay (thêm nhanh khi lưu, như form món) thay cho "chọn ít nhất một tag".
  if (newTags.length && values.tagIds.length === 0) delete errors.tagIds;
  if (!errors.name && (await nameTaken(prisma.chef, data.name, id))) errors.name = DUPLICATE;
  if (tagIds && !(await allTagsExist(prisma, tagIds))) errors.tagIds = TAG_MISSING;
  const taken = (await Promise.all(newTags.map(async (n) => ((await nameTaken(prisma.tag, n)) ? n : null)))).filter(Boolean);
  if (taken.length) errors.newTags = `Đã có tag: ${taken.join(", ")}. Hãy chọn trong danh sách.`;
  if (hasErrors(errors)) return renderForm(res, { status: 400, id, values, errors, tags: await tagList(), back });

  try {
    const saved = await prisma.$transaction(async (tx) => {
      const ids = [...(tagIds ?? [])];
      for (const name of newTags) ids.push((await tx.tag.create({ data: { name } })).id);
      const tags = { create: ids.map((tagId) => ({ tagId })) };
      // Sửa: thay toàn bộ chuyên môn (deleteMany + create trong cùng lệnh update).
      return id === null ? tx.chef.create({ data: { ...data, tags } }) : tx.chef.update({ where: { id }, data: { ...data, tags: { deleteMany: {}, ...tags } } });
    });
    return res.redirect(303, withFlash(id === null ? BASE : back, { msg: id === null ? "chef-created" : "chef-updated", saved: saved.id }));
  } catch (err) {
    if (id !== null && isNotFound(err)) return notFound(res);
    // Hai người cùng lưu một tên gần như cùng lúc: @unique ở database chặn request sau.
    if (isUniqueViolation(err)) return renderForm(res, { status: 400, id, values, errors: { name: DUPLICATE }, tags: await tagList(), back });
    throw err;
  }
}

router.get("/new", async (req, res) => {
  renderForm(res, { values: { name: "", tagIds: [], newTags: "" }, tags: await tagList(), back: safeBack(req.query.back, BASE) });
});
router.post("/", (req, res) => submit(req, res, null));

router.get("/:id/edit", async (req, res) => {
  const id = parseId(req.params.id);
  const [chef, tags] = await Promise.all([id === null ? null : prisma.chef.findUnique({ where: { id }, include: { tags: TAG_SELECT } }), tagList()]);
  if (!chef) return notFound(res);
  const values = { name: chef.name, tagIds: chef.tags.map((l) => String(l.tag.id)), newTags: "" };
  renderForm(res, { id, values, tags, back: safeBack(req.query.back, BASE) });
});
router.patch("/:id", (req, res) => {
  const id = parseId(req.params.id);
  return id === null ? notFound(res) : submit(req, res, id);
});

// ---------- Xoá (kèm chuyển món) ----------
async function deleteView(id) {
  const chef = await prisma.chef.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!chef) return null;
  const [dishes, others] = await Promise.all([
    prisma.dish.findMany({ where: { chefId: id }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.chef.findMany({ where: { NOT: { id } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return { chef, dishes, others };
}

router.get("/:id/delete", async (req, res) => {
  const id = parseId(req.params.id);
  const view = id === null ? null : await deleteView(id);
  if (!view) return notFound(res, "Đầu bếp cần xoá không tồn tại hoặc đã bị xoá.");
  res.render("admin/chefs/delete", { title: "Xoá đầu bếp", ...view, transferTo: "", error: null, back: safeBack(req.query.back, BASE) });
});

router.delete("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  const back = safeBack(one(req.body.back), BASE);
  const view = id === null ? null : await deleteView(id);
  if (!view) return notFound(res, "Đầu bếp này đã bị xoá trước đó.");
  const rawTarget = one(req.body.transferTo).trim();
  const blocked = (status, error) => res.status(status).render("admin/chefs/delete", { title: "Xoá đầu bếp", ...view, transferTo: rawTarget, error, back });

  if (view.dishes.length === 0) {
    try {
      await prisma.chef.delete({ where: { id } });
    } catch (err) {
      if (isNotFound(err)) return notFound(res, "Đầu bếp này đã bị xoá trước đó.");
      // Vừa có món được gán cho đầu bếp này ở tab khác → khoá ngoại Restrict chặn.
      if (isForeignKeyViolation(err)) return blocked(409, "Đầu bếp vừa được giao món mới. Hãy chọn người nhận các món trước khi xoá.");
      throw err;
    }
    return res.redirect(303, withFlash(back, { msg: "chef-deleted" }));
  }

  // Còn món mà chưa chọn người nhận → 409 (xung đột với dữ liệu đang có, như block5).
  if (!rawTarget) return blocked(409, "Đầu bếp đang phụ trách món. Hãy chọn người nhận các món trước khi xoá.");
  const targetId = parseId(rawTarget);
  if (targetId === null || targetId === id || !view.others.some((c) => c.id === targetId)) {
    return blocked(400, "Đầu bếp nhận món không hợp lệ, vui lòng chọn lại.");
  }
  try {
    // Một transaction: chuyển TẤT CẢ món hiện có (kể cả món vừa được gán) sang người nhận rồi xoá đầu bếp.
    // Bước nào lỗi thì cả hai cùng huỷ — không có cảnh đã chuyển món mà chưa xoá, hay ngược lại.
    await prisma.$transaction([
      prisma.dish.updateMany({ where: { chefId: id }, data: { chefId: targetId } }),
      prisma.chef.delete({ where: { id } }),
    ]);
  } catch (err) {
    if (isNotFound(err)) return notFound(res, "Đầu bếp này đã bị xoá trước đó.");
    if (isForeignKeyViolation(err)) return blocked(400, "Đầu bếp nhận món vừa bị xoá, vui lòng chọn người khác.");
    throw err;
  }
  res.redirect(303, withFlash(back, { msg: "chef-transferred" }));
});

export default router;
