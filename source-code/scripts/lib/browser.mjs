// Chrome headless điều khiển qua DevTools Protocol (WebSocket có sẵn trong Node 22+) cho script thu bằng chứng:
// mở trang, gửi form như người dùng, chụp ảnh, đọc cookie (tab Application) và ghi lại request / response thật của
// trình duyệt (tab Network: header Set-Cookie, Cookie, Location…). Không thêm thư viện (không Puppeteer / Playwright).
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function openBrowser() {
  const profile = mkdtempSync(join(tmpdir(), "b8-chrome-"));
  const port = 9300 + Math.floor(Math.random() * 500);
  const proc = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--no-first-run", "--window-size=1280,900", "about:blank"], { stdio: "ignore" });
  let target;
  for (let i = 0; i < 150 && !target; i++) {
    await sleep(200);
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page"); } catch {}
  }
  if (!target) { proc.kill(); throw new Error("Không mở được Chrome headless (đặt CHROME_PATH nếu Chrome nằm chỗ khác)."); }

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  let id = 0, loads = 0;
  const waiting = new Map();
  // Network: mỗi requestId có thể gồm nhiều chặng (303 → GET trang đích); ghép chặng với header thật theo thứ tự.
  const hops = new Map(); // requestId → { hops: [{method,url,postData}], req: [headers], res: [{status, headers}] }
  const entry = (rid) => hops.get(rid) ?? hops.set(rid, { hops: [], req: [], res: [] }).get(rid);
  let order = [];
  ws.addEventListener("message", (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && waiting.has(msg.id)) { waiting.get(msg.id)(msg); waiting.delete(msg.id); return; }
    const p = msg.params;
    if (msg.method === "Page.loadEventFired") loads++;
    else if (msg.method === "Network.requestWillBeSent" && p.type === "Document") {
      entry(p.requestId).hops.push({ method: p.request.method, url: p.request.url, postData: p.request.postData });
      if (!order.includes(p.requestId)) order.push(p.requestId);
    } else if (msg.method === "Network.requestWillBeSentExtraInfo") entry(p.requestId).req.push(p.headers);
    else if (msg.method === "Network.responseReceivedExtraInfo") entry(p.requestId).res.push({ status: p.statusCode, headers: p.headers });
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const n = ++id;
    waiting.set(n, (msg) => (msg.error ? reject(new Error(`${method}: ${msg.error.message}`)) : resolve(msg.result)));
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");

  const page = {
    send,
    async viewport(width, height = 900) {
      await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 800 });
    },
    // Chờ trang tải xong sau một hành động (điều hướng, gửi form có redirect 303 → trang đích).
    async navigating(action) {
      const before = loads;
      await action();
      for (let i = 0; i < 150 && loads === before; i++) await sleep(100);
      await sleep(300); // để ui.js chạy xong (vẽ 6 ô mã, đếm ngược, widget)
    },
    goto(url) { return page.navigating(() => send("Page.navigate", { url })); },
    async eval(body) {
      const r = await send("Runtime.evaluate", { expression: `(async () => { ${body} })()`, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? JSON.stringify(r.exceptionDetails));
      return r.result.value;
    },
    async waitFor(cond, timeout = 15000) {
      const end = Date.now() + timeout;
      while (Date.now() < end) { if (await page.eval(`return Boolean(${cond});`)) return true; await sleep(200); }
      throw new Error(`Hết thời gian chờ: ${cond}`);
    },
    // Điền ô của form đầu tiên khớp selector như người dùng gõ (sự kiện input để ui.js cập nhật theo).
    fill(form, values) {
      return page.eval(`const f = document.querySelector(${JSON.stringify(form)});
        for (const [k, v] of Object.entries(${JSON.stringify(values)})) { const el = f.elements[k]; el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); }
        return 1;`);
    },
    // Bấm nút gửi (requestSubmit với đúng nút → formaction của nút được dùng) và chờ trang mới.
    submit(form, button = 'button[type="submit"]') {
      return page.navigating(() => page.eval(`const f = document.querySelector(${JSON.stringify(form)}); f.requestSubmit(f.querySelector(${JSON.stringify(button)})); return 1;`));
    },
    // CAPTCHA khi chạy tự động: bấm ô "Tôi không phải người máy" từ Chrome do script điều khiển thì widget quay mãi
    // (Google nhận ra trình duyệt tự động, kể cả với key thử) — mình KHÔNG tìm cách lách. Server đang dùng secret thử
    // (Google chấp nhận mọi token), nên script điền thẳng một token thử vào ô g-recaptcha-response mà widget tạo ra.
    // Ảnh chụp vì vậy thấy ô chưa tick; tick thật làm tay với key thật (checklist BUILD_LOG bước 16).
    async fillTestCaptcha() {
      await page.waitFor(`document.querySelector('[name="g-recaptcha-response"]')`);
      await page.eval(`document.querySelector('[name="g-recaptcha-response"]').value = "token-thu"; return 1;`);
    },
    async screenshot() {
      const { data } = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true,
        clip: await page.eval(`return { x: 0, y: 0, width: document.documentElement.clientWidth, height: Math.min(document.documentElement.scrollHeight, 1600), scale: 1 };`) });
      return Buffer.from(data, "base64");
    },
    async cookies() { return (await send("Network.getCookies")).cookies; },
    // Các request trang (Document) từ lần gọi trước: [{ method, url, postData, status, reqHeaders, resHeaders }].
    takeNetwork() {
      const out = [];
      for (const rid of order) {
        const e = hops.get(rid);
        e.hops.forEach((h, i) => out.push({ ...h, reqHeaders: e.req[i] ?? {}, status: e.res[i]?.status, resHeaders: e.res[i]?.headers ?? {} }));
        hops.delete(rid);
      }
      order = [];
      return out;
    },
    close() { ws.close(); proc.kill(); setTimeout(() => rmSync(profile, { recursive: true, force: true }), 500); },
  };
  return page;
}
