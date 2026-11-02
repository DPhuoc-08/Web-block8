// JavaScript CHỈ để tiện dùng (plan block8 mục 9.3): không fetch/XHR, không gửi dữ liệu thay form.
// Tắt JavaScript thì mọi trang vẫn dùng được: form gửi bằng HTML thường, server làm hết việc.

// Báo cho CSS biết có JavaScript: các phần "chỉ khi có JS" (nút thu gọn, ẩn nhóm nâng cao) mới bật.
document.documentElement.classList.add("js");

// Ảnh món là link ngoài: link chết → bỏ <img>, hiện hình minh hoạ đã in sẵn ngay sau nó (như onError của block7).
// Lắng nghe ở pha capture trên window (sự kiện error của <img> không nổi bọt), đăng ký ngay trong <head>
// để không lỡ ảnh lỗi trước khi trang tải xong.
window.addEventListener(
  "error",
  (event) => {
    const img = event.target;
    if (!(img instanceof HTMLImageElement) || !img.classList.contains("dish-photo")) return;
    const art = img.nextElementSibling;
    if (art && art.classList.contains("dish-art")) {
      art.hidden = false;
      img.remove();
    }
  },
  true,
);

// reCAPTCHA v2 (render=explicit): Google gọi hàm này khi script đã tải. Màn hẹp hơn 360px (vùng form chỉ còn ~280px)
// dùng bản "compact" 164×144 của Google thay cho bản 304×78 để không tràn ngang (ghi chú Figma vòng 2).
window.renderCaptcha = () => {
  for (const el of document.querySelectorAll(".g-recaptcha")) {
    window.grecaptcha.render(el, { sitekey: el.dataset.sitekey, size: window.innerWidth < 360 ? "compact" : "normal", hl: "vi" });
  }
};

document.addEventListener("DOMContentLoaded", () => {
  // Ô chọn có data-autosubmit (sắp xếp ở thực đơn): đổi là gửi form GET luôn, không cần bấm "Áp dụng".
  for (const select of document.querySelectorAll("select[data-autosubmit]")) {
    select.addEventListener("change", () => select.form.requestSubmit());
  }

  // Thanh danh mục: thu gọn các tag ít dùng sau nút "N tag khác".
  for (const button of document.querySelectorAll(".cat-bar .cat-more")) {
    button.addEventListener("click", () => {
      const open = button.closest(".cat-bar").classList.toggle("expanded");
      button.setAttribute("aria-expanded", String(open));
      button.textContent = open ? "Thu gọn" : button.dataset.label;
    });
  }

  // Khung tìm của thực đơn: đổi kiểu tìm thì đổi gợi ý, khoá/mở "Tìm theo", hiện/ẩn nhóm nâng cao (như block7).
  const form = document.querySelector("form.search-form");
  if (form) setupSearchPanel(form);

  // Nút "Hiện" mật khẩu (trang tài khoản): đổi ô giữa password và text; tắt JS thì nút ẩn, ô vẫn dùng được.
  for (const button of document.querySelectorAll(".pw-toggle")) {
    const input = document.getElementById(button.getAttribute("aria-controls"));
    button.addEventListener("click", () => {
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      button.setAttribute("aria-pressed", String(show));
      button.setAttribute("aria-label", show ? "Ẩn mật khẩu" : "Hiện mật khẩu");
      button.querySelector("span").textContent = show ? "Ẩn" : "Hiện";
    });
  }

  // ----- Khu quản trị -----
  // Form ghi (data-once): bấm lần hai khi request đầu chưa về thì bỏ qua → không tạo hai món giống nhau.
  for (const f of document.querySelectorAll("form[data-once]")) {
    f.addEventListener("submit", (event) => {
      if (f.dataset.submitting) return event.preventDefault();
      f.dataset.submitting = "1";
      const button = f.querySelector("[data-busy-label]");
      if (button) button.textContent = button.dataset.busyLabel;
    });
  }

  // Form chưa lưu (data-unsaved-guard): rời trang khi đã sửa gì đó → trình duyệt hỏi lại (thay LeaveConfirm của block7).
  for (const f of document.querySelectorAll("form[data-unsaved-guard]")) {
    let dirty = false;
    f.addEventListener("input", () => (dirty = true));
    f.addEventListener("change", () => (dirty = true));
    f.addEventListener("submit", () => (dirty = false));
    window.addEventListener("beforeunload", (event) => {
      if (dirty) event.preventDefault();
    });
  }

  // Ô chọn có gợi ý (ComboPicker của block7) dựng trên các ô thật của form.
  for (const group of document.querySelectorAll('[data-combo="multi"]')) setupMultiCombo(group);
  for (const group of document.querySelectorAll('[data-combo="single"]')) setupChefCombo(group);

  // Form vừa bị trả về vì lỗi: đưa focus tới ô lỗi đầu tiên (như useFocusFirstError của block7).
  if (document.querySelector("[data-focus-first-error]")) {
    const first = document.querySelector(".invalid input:not([type=hidden]), .invalid select, .invalid textarea, .invalid [role=combobox]");
    const visible = first && first.offsetParent !== null ? first : document.querySelector(".invalid [role=combobox]");
    visible?.focus();
  }

  // Dòng vừa thêm / sửa (?saved=) nằm ngoài màn hình → cuộn tới; đang thấy thì đứng yên.
  document.querySelector("tr.just-saved")?.scrollIntoView({ block: "nearest" });
});

// So khớp bỏ dấu, không phân biệt hoa thường ("tom" khớp "Tôm sú") — như plain() của block7.
const plain = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();
const MAX_SUGGESTIONS = 8;
let comboSeq = 0;

// Phần giao diện chung của ô gợi ý: chip đã chọn + ô gõ + danh sách gợi ý (↑/↓, Enter chọn, Esc đóng,
// Backspace ở ô trống bỏ chip cuối, Enter KHÔNG gửi form). Mọi thay đổi đi qua `api` để ghi vào ô thật của form.
// api: { candidates() → [{ id, name, meta }], chips() → [{ label, meta, remove }], pick(id), addNew(name),
//        exists(name), placeholder(), showOnEmpty, single }
function buildCombo(group, noun, api) {
  const listId = `combo-${++comboSeq}`;
  const wrap = document.createElement("div");
  wrap.className = "picker";
  wrap.innerHTML = `<ul class="chip-list"></ul><div class="combo"><input type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="${listId}" autocomplete="off"><ul class="combo-list" id="${listId}" role="listbox" hidden></ul></div>`;
  const chipList = wrap.querySelector(".chip-list");
  const input = wrap.querySelector("input");
  const list = wrap.querySelector(".combo-list");
  list.setAttribute("aria-label", `Gợi ý ${noun}`);
  group.querySelector(".combo-source").after(wrap);
  let options = [];
  let active = 0;
  let open = false;

  function renderChips() {
    chipList.replaceChildren();
    for (const chip of api.chips()) {
      const li = document.createElement("li");
      li.className = "chip";
      const label = document.createElement("span");
      label.textContent = chip.label;
      li.append(label);
      if (chip.meta) {
        const meta = document.createElement("small");
        meta.className = "chip-meta";
        meta.textContent = chip.meta;
        li.append(meta);
      }
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "chip-remove";
      remove.textContent = "×";
      remove.setAttribute("aria-label", `Bỏ ${chip.label}`);
      remove.addEventListener("click", () => (chip.remove(), refresh()));
      li.append(remove);
      chipList.append(li);
    }
    chipList.hidden = chipList.children.length === 0;
    input.placeholder = api.placeholder();
    input.setAttribute("aria-label", api.placeholder());
  }

  function renderList() {
    const q = input.value.trim();
    const matches = (q ? api.candidates().filter((i) => plain(i.name).includes(plain(q))) : api.showOnEmpty ? api.candidates() : []).slice(0, MAX_SUGGESTIONS);
    options = matches.map((item) => ({ type: "pick", item }));
    // Chưa có đúng tên này → mục cuối "+ Thêm … mới “…”".
    if (q && !api.exists(q)) options.push({ type: "new", name: q });
    active = Math.min(active, Math.max(options.length - 1, 0));
    list.replaceChildren();
    options.forEach((o, i) => {
      const li = document.createElement("li");
      li.id = `${listId}-${i}`;
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", String(i === active));
      li.className = `combo-option${i === active ? " active" : ""}${o.type === "new" ? " new" : ""}`;
      if (o.type === "pick") {
        li.textContent = o.item.name;
        if (o.item.meta) {
          const small = document.createElement("small");
          small.textContent = o.item.meta;
          li.append(small);
        }
      } else li.textContent = `+ Thêm ${noun} mới “${o.name}”`;
      // mousedown + preventDefault: chọn trước khi ô mất focus (blur đóng danh sách).
      li.addEventListener("mousedown", (e) => (e.preventDefault(), choose(o)));
      li.addEventListener("mouseenter", () => ((active = i), renderList()));
      list.append(li);
    });
    const expanded = open && options.length > 0;
    list.hidden = !expanded;
    input.setAttribute("aria-expanded", String(expanded));
    if (expanded) input.setAttribute("aria-activedescendant", `${listId}-${active}`);
    else input.removeAttribute("aria-activedescendant");
  }

  function choose(o) {
    if (!o) return;
    if (o.type === "pick") api.pick(o.item.id);
    else api.addNew(o.name);
    input.value = "";
    active = 0;
    if (api.single || o.type === "new") open = false;
    refresh();
  }

  function refresh() {
    renderChips();
    renderList();
    api.changed?.();
  }

  input.addEventListener("input", () => ((open = true), (active = 0), renderList()));
  input.addEventListener("focus", () => ((open = true), renderList()));
  input.addEventListener("blur", () => ((open = false), renderList()));
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault(); // không gửi form món
      if (open && options.length) choose(options[active]);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      open = true;
      active = Math.min(active + 1, options.length - 1);
      renderList();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      active = Math.max(active - 1, 0);
      renderList();
    } else if (e.key === "Escape") {
      open = false;
      renderList();
    } else if (e.key === "Backspace" && !input.value) {
      const chips = api.chips();
      if (chips.length) (chips.at(-1).remove(), refresh());
    }
  });
  refresh();
  return { refresh };
}

// Ô chữ tên mới được thay bằng mục "+ Thêm … mới" của ô gợi ý → ẩn đi; trừ khi server vừa báo lỗi ở ô đó
// (vd. tên đã có): phải thấy được câu lỗi và giá trị đã gõ.
const hideUnlessInvalid = (label) => {
  if (!label.classList.contains("invalid")) label.hidden = true;
};

// Tên mới gõ trong ô chữ "cách nhau bằng dấu phẩy" (newIngredients, newTags).
const namesIn = (input) => input.value.split(",").map((s) => s.trim()).filter(Boolean);
const setNames = (input, names) => {
  input.value = names.join(", ");
  input.dispatchEvent(new Event("input", { bubbles: true })); // để cảnh báo "chưa lưu" biết form đã đổi
};

// Nguyên liệu (chọn nhiều): nguồn thật là các checkbox ingredientIds + ô newIngredients.
function setupMultiCombo(group) {
  const noun = group.dataset.noun;
  const boxes = [...group.querySelectorAll('input[type="checkbox"]')];
  const newInput = group.querySelector('input[name^="new"]');
  const summary = group.querySelector("[data-count-summary]");
  group.querySelector(".combo-source").hidden = true;
  hideUnlessInvalid(newInput.closest("label")); // ô chữ vẫn nằm trong form và vẫn được gửi
  const item = (b) => ({ id: b.value, name: b.dataset.name, meta: b.dataset.meta, box: b });
  const tick = (b, on) => ((b.checked = on), b.dispatchEvent(new Event("change", { bubbles: true })));
  buildCombo(group, noun, {
    showOnEmpty: false,
    single: false,
    candidates: () => boxes.filter((b) => !b.checked).map(item),
    exists: (name) => boxes.some((b) => plain(b.dataset.name) === plain(name)) || namesIn(newInput).some((n) => plain(n) === plain(name)),
    chips: () => [
      ...boxes.filter((b) => b.checked).map((b) => ({ label: b.dataset.name, meta: b.dataset.meta, remove: () => tick(b, false) })),
      ...namesIn(newInput).map((n) => ({ label: n, meta: "mới — tạo khi lưu", remove: () => setNames(newInput, namesIn(newInput).filter((x) => x !== n)) })),
    ],
    pick: (id) => tick(boxes.find((b) => b.value === id), true),
    addNew: (name) => setNames(newInput, [...namesIn(newInput), name]),
    placeholder: () => "Gõ để tìm nguyên liệu, ví dụ: tôm, hành",
    changed: () => {
      if (summary) summary.textContent = `Đã chọn ${boxes.filter((b) => b.checked).length + namesIn(newInput).length} ${noun}`;
    },
  });
}

// Đầu bếp (chọn một): nguồn thật là ô chọn chefId (+ "new" và ô newChef). Người có chuyên môn trùng tag đang tick
// của món đứng đầu gợi ý, kèm "· đúng chuyên môn" — tính lại mỗi khi tick / bỏ tick tag.
function setupChefCombo(group) {
  const select = group.querySelector("select");
  const newInput = group.querySelector('input[name="newChef"]');
  const summary = group.querySelector("[data-fit-summary]");
  const form = group.closest("form");
  const tagBoxes = [...form.querySelectorAll('input[name="tagIds"]')];
  group.querySelector(".combo-source").hidden = true;
  hideUnlessInvalid(newInput.closest("label"));
  const chefs = [...select.options].filter((o) => o.value && o.value !== "new").map((o) => ({ id: o.value, name: o.dataset.name, meta: o.dataset.meta, tags: o.dataset.tags.split(",").filter(Boolean) }));
  const chosenTags = () => new Set(tagBoxes.filter((b) => b.checked).map((b) => b.value));
  const fits = (c, tags) => c.tags.some((t) => tags.has(t));
  const setChef = (value, name = "") => {
    select.value = value;
    newInput.value = name;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  };
  const combo = buildCombo(group, "đầu bếp", {
    showOnEmpty: true,
    single: true,
    candidates: () => {
      const tags = chosenTags();
      const meta = (c) => `${c.meta}${fits(c, tags) ? " · đúng chuyên môn" : ""}`;
      const rest = chefs.filter((c) => c.id !== select.value).map((c) => ({ ...c, meta: meta(c) }));
      return [...rest.filter((c) => fits(c, tags)), ...rest.filter((c) => !fits(c, tags))];
    },
    exists: (name) => chefs.some((c) => plain(c.name) === plain(name)),
    chips: () => {
      if (select.value === "new" && newInput.value.trim()) return [{ label: newInput.value.trim(), meta: "mới — chuyên môn = tag của món", remove: () => setChef("") }];
      const c = chefs.find((x) => x.id === select.value);
      return c ? [{ label: c.name, meta: c.meta, remove: () => setChef("") }] : [];
    },
    pick: (id) => setChef(id),
    addNew: (name) => setChef("new", name),
    placeholder: () => (select.value ? "Gõ để đổi đầu bếp" : "Gõ tên đầu bếp, hoặc bấm để xem gợi ý"),
    changed: updateSummary,
  });
  function updateSummary() {
    if (!summary) return;
    const tags = chosenTags();
    summary.textContent = tags.size === 0 ? "Chọn tag của món để thấy đầu bếp đúng chuyên môn ở đầu gợi ý." : `${chefs.filter((c) => fits(c, tags)).length} đầu bếp đúng chuyên môn với tag đã chọn.`;
  }
  for (const b of tagBoxes) b.addEventListener("change", () => combo.refresh());
}

function setupSearchPanel(form) {
  const { mode, by, q } = form.elements;
  const advanced = form.querySelector(".search-advanced");
  const toggle = form.querySelector(".filter-toggle");
  const hint = form.querySelector(".mode-hint");
  const placeholders = JSON.parse(q.dataset.placeholders);

  function sync() {
    const m = mode.value;
    const isAdvanced = m === "advanced";
    advanced.toggleAttribute("data-collapsed", !isAdvanced);
    toggle.setAttribute("aria-expanded", String(isAdvanced));
    toggle.querySelector("span").textContent = isAdvanced ? "Ẩn bộ lọc" : "Bộ lọc nâng cao";
    // Toàn văn chỉ tìm trong tên + mô tả món: "Tìm theo" khoá ở tên món (ô disabled không được gửi đi).
    if (m === "fulltext") by.value = "name";
    by.disabled = m === "fulltext";
    hint.textContent = mode.selectedOptions[0]?.dataset.hint ?? "";
    q.placeholder = m === "fulltext" ? placeholders.fulltext : (placeholders[by.value] ?? placeholders.name)[m === "fuzzy" ? "fuzzy" : "basic"];
  }

  mode.addEventListener("change", sync);
  by.addEventListener("change", sync);
  // "Bộ lọc nâng cao" = bật/tắt kiểu Nâng cao ngay trong form; chưa đổi URL cho tới khi bấm Tìm.
  toggle.addEventListener("click", () => {
    mode.value = mode.value === "advanced" ? "basic" : "advanced";
    sync();
  });
}
