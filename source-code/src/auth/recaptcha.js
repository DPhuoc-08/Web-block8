// Xác minh Google reCAPTCHA v2 (checkbox) TẠI BACKEND (plan mục 7).
// Widget trên trang chỉ tạo token (ô g-recaptcha-response trong form); backend gửi token + secret tới Google:
// chỉ cho qua khi success === true VÀ hostname nằm trong RECAPTCHA_HOSTNAMES. Token có hạn 2 phút và chỉ xác minh được
// một lần (dùng lại → Google trả "timeout-or-duplicate"). Không tin trường nào khác do trình duyệt gửi.
// Không gọi được Google (mạng, quá 5 giây) → { unavailable: true }: route trả 503, KHÔNG mặc định cho qua.
const VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";

export const recaptchaSiteKey = () => process.env.RECAPTCHA_SITE_KEY ?? "";

export async function verifyRecaptcha(token) {
  if (typeof token !== "string" || token.trim() === "") return { ok: false, reason: "missing-input-response" };
  try {
    const res = await fetch(VERIFY_URL, {
      method: "POST",
      body: new URLSearchParams({ secret: process.env.RECAPTCHA_SECRET_KEY ?? "", response: token }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { ok: false, unavailable: true };
    const data = await res.json();
    const hosts = (process.env.RECAPTCHA_HOSTNAMES ?? "").split(",").map((h) => h.trim()).filter(Boolean);
    if (data.success === true && hosts.includes(data.hostname)) return { ok: true };
    return { ok: false, reason: data.success === true ? `hostname:${data.hostname}` : (data["error-codes"] ?? []).join(",") || "invalid" };
  } catch {
    return { ok: false, unavailable: true };
  }
}
