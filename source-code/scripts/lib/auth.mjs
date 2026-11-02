// Client đã sẵn sàng vào khu quản trị. Trước khi có đăng nhập (bước 10) chỉ là client thường.
import { client } from "./client.mjs";

export async function adminClient() {
  return client();
}
