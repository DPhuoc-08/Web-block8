// Trình duyệt tối giản cho script kiểm tra: giữ cookie giữa các request (như cookie jar của curl),
// không tự đi theo redirect (để đọc được 302/303 + Location), đọc ô ẩn _csrf trong form của trang vừa mở.
// Đọc mỗi lần gửi request (không cố định lúc import): check-auth.mjs tự chạy server riêng ở cổng khác.
const base = () => process.env.BASE_URL ?? "http://localhost:3000";
export const BASE = base();

export function client() {
  const jar = new Map();
  const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  function store(res) {
    for (const line of res.headers.getSetCookie?.() ?? []) {
      const [pair, ...attrs] = line.split(";");
      const [name, ...rest] = pair.split("=");
      const value = rest.join("=");
      const expired = attrs.some((a) => /^\s*expires=Thu, 01 Jan 1970/i.test(a)) || attrs.some((a) => /^\s*max-age=0\b/i.test(a));
      if (expired || value === "") jar.delete(name.trim());
      else jar.set(name.trim(), value);
    }
  }
  let csrf = "";
  async function request(method, path, fields, headers = {}) {
    const init = { method, redirect: "manual", headers: { ...headers } };
    if (jar.size) init.headers.cookie = cookieHeader();
    if (fields) {
      const body = new URLSearchParams();
      for (const [k, v] of fields) body.append(k, v);
      init.body = body;
    }
    const res = await fetch(base() + path, init);
    store(res);
    const text = await res.text();
    const m = text.match(/name="_csrf" value="([^"]+)"/);
    if (m) csrf = m[1];
    return { status: res.status, location: res.headers.get("location"), headers: res.headers, text };
  }
  return {
    jar,
    get: (path, headers) => request("GET", path, null, headers),
    // Gửi form như trình duyệt: tự kèm _csrf của trang đã mở gần nhất (bỏ qua bằng { csrf: false }).
    post: (path, fields = [], { csrf: withCsrf = true, headers } = {}) =>
      request("POST", path, withCsrf && csrf ? [["_csrf", csrf], ...fields] : fields, headers),
    get csrf() { return csrf; },
    set csrf(v) { csrf = v; },
  };
}

// Đếm ĐẠT / CHƯA ĐẠT, in từng dòng; cuối script gọi done() → mã thoát 1 nếu có ca chưa đạt.
export function reporter(title) {
  let pass = 0, fail = 0;
  console.log(`\n== ${title} ==`);
  return {
    ok(cond, label, extra = "") {
      cond ? pass++ : fail++;
      console.log(`${cond ? "ĐẠT     " : "CHƯA ĐẠT"} ${label}${extra !== "" ? ` — ${extra}` : ""}`);
      return cond;
    },
    get counts() { return { pass, fail }; },
  };
}

export const savedIdOf = (location) => Number(new URL(location ?? "/", base()).searchParams.get("saved"));
