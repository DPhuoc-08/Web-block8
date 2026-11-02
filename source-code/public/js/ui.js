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
});

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
