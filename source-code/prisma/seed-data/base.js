// Dữ liệu gốc chép từ seed của block6 (20 món, 7 đầu bếp, 30 nguyên liệu), đổi sang tag:
//   - loại món cũ (category) → 1 tag loại món, thêm tag đặc điểm / vùng miền khi hợp
//   - chuyên môn cũ (specialty, chuỗi tự do) → danh sách tag
// Quy tắc của seed: đầu bếp phụ trách món luôn có ít nhất 1 tag trùng với tag của món đó.

const commons = "https://upload.wikimedia.org/wikipedia/commons/thumb";
const thumb = "https://thumb.wikimedia.org/wikipedia/commons/thumb";

// 16 tag dùng chung cho loại món và chuyên môn đầu bếp.
export const TAGS = [
  // Loại món
  "Khai vị", "Món nước", "Món cơm", "Món xào", "Món chiên", "Món nướng", "Món hấp", "Món cuốn", "Lẩu", "Tráng miệng", "Đồ uống",
  // Đặc điểm
  "Hải sản", "Món chay",
  // Vùng miền
  "Miền Bắc", "Miền Trung", "Miền Nam",
];

// Chuyên môn (tag) của 7 đầu bếp block6. Mỗi người ≥ 1 tag (nhóm chốt).
export const CHEFS = [
  { name: "Nguyễn Văn An", tags: ["Món nước", "Miền Bắc"] },
  { name: "Trần Thị Bích", tags: ["Món nướng", "Món cơm", "Món cuốn"] },
  { name: "Lê Hoàng Minh", tags: ["Tráng miệng"] },
  { name: "Phạm Quốc Huy", tags: ["Món xào", "Món chiên"] },
  { name: "Võ Thị Mai", tags: ["Miền Trung", "Món nước"] },
  { name: "Đặng Gia Bảo", tags: ["Đồ uống"] },
  { name: "Bùi Thanh Tâm", tags: ["Món hấp", "Lẩu"] }, // chưa phụ trách món nào → xoá được ngay
];

export const INGREDIENTS = [
  ["Thịt bò", "kg"], ["Thịt heo", "kg"], ["Sườn heo", "kg"], ["Giò heo", "kg"], ["Gà ta", "con"],
  ["Cánh gà", "kg"], ["Tôm sú", "kg"], ["Cá basa", "kg"], ["Trứng gà", "quả"], ["Bánh phở", "kg"],
  ["Bún tươi", "kg"], ["Hủ tiếu khô", "kg"], ["Sợi mì Quảng", "kg"], ["Bánh tráng", "xấp"], ["Gạo tấm", "kg"],
  ["Gạo thơm", "kg"], ["Bột gạo", "kg"], ["Rau thơm", "bó"], ["Rau muống", "bó"], ["Giá đỗ", "kg"],
  ["Hành lá", "bó"], ["Tỏi", "kg"], ["Sả", "kg"], ["Nước mắm", "lít"], ["Đậu xanh", "kg"],
  ["Nước cốt dừa", "lít"], ["Sữa đặc", "hộp"], ["Cà phê", "kg"], ["Quả bơ", "kg"],
  ["Nấm hương", "kg"], // chưa món nào dùng → xoá được
];

// 20 món của block6, giữ thứ tự để id vẫn là 1–20.
// Cố ý có: 2 món tạm hết (available: false), 1 món chưa có ảnh, 1 món chưa có mô tả.
export const DISHES = [
  {
    name: "Phở bò tái", tags: ["Món nước", "Miền Bắc"], price: 55000, chef: "Nguyễn Văn An",
    description: "Nước dùng hầm xương 12 tiếng, bánh phở tươi.",
    ingredients: ["Thịt bò", "Bánh phở", "Hành lá", "Rau thơm"],
    imageUrl: `${commons}/4/42/Ph%E1%BB%9F_b%C3%B2_in_a_German_restaurant_01.jpg/960px-Ph%E1%BB%9F_b%C3%B2_in_a_German_restaurant_01.jpg`,
    imageCredit: "Kritzolina · CC BY-SA 4.0 · Wikimedia Commons",
  },
  {
    name: "Bún chả Hà Nội", tags: ["Món nước", "Món nướng", "Miền Bắc"], price: 50000, chef: "Nguyễn Văn An",
    description: "Chả nướng than hoa, ăn kèm bún và rau sống.",
    ingredients: ["Thịt heo", "Bún tươi", "Nước mắm", "Rau thơm"],
    imageUrl: `${commons}/4/4d/B%C3%BAn_ch%E1%BA%A3_Vietnamese_food.jpg/960px-B%C3%BAn_ch%E1%BA%A3_Vietnamese_food.jpg`,
    imageCredit: "stuart_spivack · CC BY 2.0 · Wikimedia Commons",
  },
  {
    name: "Bún bò Huế", tags: ["Món nước", "Miền Trung"], price: 55000, chef: "Võ Thị Mai",
    description: "Nước dùng sả ớt, giò heo, bún sợi to.",
    ingredients: ["Thịt bò", "Giò heo", "Bún tươi", "Sả", "Rau thơm"],
    imageUrl: `${thumb}/0/00/Bun-Bo-Hue-from-Huong-Giang-2011.jpg/960px-Bun-Bo-Hue-from-Huong-Giang-2011.jpg`,
    imageCredit: "Kham Tran · CC BY 3.0 · Wikimedia Commons",
  },
  {
    name: "Hủ tiếu Nam Vang", tags: ["Món nước", "Miền Nam"], price: 50000, chef: "Nguyễn Văn An",
    description: "Hủ tiếu dai, thịt heo, tôm, nước dùng ngọt thanh.",
    ingredients: ["Hủ tiếu khô", "Thịt heo", "Tôm sú", "Hành lá", "Giá đỗ"],
    imageUrl: `${thumb}/9/97/H%E1%BB%A7_ti%E1%BA%BFu_Nam_Vang_S%C3%A0i_G%C3%B2n.jpg/960px-H%E1%BB%A7_ti%E1%BA%BFu_Nam_Vang_S%C3%A0i_G%C3%B2n.jpg`,
    imageCredit: "Tonbi ko · CC BY-SA 4.0 · Wikimedia Commons",
  },
  {
    name: "Mì Quảng", tags: ["Món nước", "Miền Trung"], price: 45000, chef: "Võ Thị Mai",
    description: "Sợi mì vàng, tôm thịt, ăn kèm bánh tráng nướng.",
    ingredients: ["Sợi mì Quảng", "Tôm sú", "Thịt heo", "Bánh tráng", "Rau thơm"],
    imageUrl: `${thumb}/d/df/Mi_Quang_1A_Danang.jpg/960px-Mi_Quang_1A_Danang.jpg`,
    imageCredit: "Jpatokal · CC BY-SA 4.0 · Wikimedia Commons",
  },
  {
    name: "Cơm tấm sườn bì", tags: ["Món cơm", "Món nướng", "Miền Nam"], price: 60000, chef: "Trần Thị Bích",
    description: "Sườn nướng mật ong, bì, chả trứng.",
    ingredients: ["Gạo tấm", "Sườn heo", "Trứng gà", "Nước mắm"],
    imageUrl: `${commons}/0/0f/C%C6%A1m_t%E1%BA%A5m_SG_l%E1%BB%81_%C4%91%C6%B0%E1%BB%9Dng_%28c%C6%A1m_s%C6%B0%E1%BB%9Dn%2C_mi%E1%BA%BFng_s%C6%B0%E1%BB%9Dn_n%C6%B0%E1%BB%9Bng_m%E1%BA%ADt_ong%29_ng30th7n2022_%281%29.jpg/960px-C%C6%A1m_t%E1%BA%A5m_SG_l%E1%BB%81_%C4%91%C6%B0%E1%BB%9Dng_%28c%C6%A1m_s%C6%B0%E1%BB%9Dn%2C_mi%E1%BA%BFng_s%C6%B0%E1%BB%9Dn_n%C6%B0%E1%BB%9Bng_m%E1%BA%ADt_ong%29_ng30th7n2022_%281%29.jpg`,
    imageCredit: "Phương Huy · CC0 · Wikimedia Commons",
  },
  {
    name: "Cơm gà Hội An", tags: ["Món cơm", "Miền Trung"], price: 55000, chef: "Võ Thị Mai",
    description: "Cơm nấu nước luộc gà, gà xé trộn rau răm.",
    ingredients: ["Gà ta", "Gạo thơm", "Rau thơm", "Hành lá"],
    imageUrl: null, imageCredit: null, // cố ý chưa có ảnh
  },
  {
    name: "Cá kho tộ", tags: ["Món cơm", "Miền Nam"], price: 65000, chef: "Trần Thị Bích",
    description: "Cá basa kho tộ đất, nước màu, tiêu.",
    ingredients: ["Cá basa", "Nước mắm", "Tỏi", "Hành lá"],
    imageUrl: `${thumb}/e/e9/Ph%C3%BA_Qu%E1%BB%91c_2022_%28c%C3%A1_kho_t%E1%BB%99%29_%281%29.jpg/960px-Ph%C3%BA_Qu%E1%BB%91c_2022_%28c%C3%A1_kho_t%E1%BB%99%29_%281%29.jpg`,
    imageCredit: "Phương Huy · CC BY-SA 4.0 · Wikimedia Commons",
  },
  {
    name: "Bò lúc lắc", tags: ["Món xào"], price: 85000, chef: "Phạm Quốc Huy",
    description: "Bò cắt hạt lựu xào lửa lớn, ăn kèm salad.",
    ingredients: ["Thịt bò", "Tỏi", "Trứng gà"],
    imageUrl: `${thumb}/7/78/Product_Shots_of_Food-Bo_Luc_Lac.jpg/960px-Product_Shots_of_Food-Bo_Luc_Lac.jpg`,
    imageCredit: "Nick Nguyen · CC BY-SA 2.0 · Wikimedia Commons",
  },
  {
    name: "Rau muống xào tỏi", tags: ["Món xào"], price: 30000, chef: "Phạm Quốc Huy",
    description: "Rau muống xào giòn với tỏi phi.",
    ingredients: ["Rau muống", "Tỏi", "Nước mắm"],
    imageUrl: `${thumb}/c/ca/Rau_mu%E1%BB%91ng_x%C3%A0o_t%E1%BB%8Fi%2C_th%C3%A1ng_4_n%C4%83m_2018.jpg/960px-Rau_mu%E1%BB%91ng_x%C3%A0o_t%E1%BB%8Fi%2C_th%C3%A1ng_4_n%C4%83m_2018.jpg`,
    imageCredit: "Phương Huy · Public domain · Wikimedia Commons",
  },
  {
    name: "Gỏi cuốn tôm thịt", tags: ["Khai vị", "Món cuốn", "Miền Nam"], price: 35000, chef: "Trần Thị Bích",
    description: "Cuốn bánh tráng, chấm tương đậu phộng.",
    ingredients: ["Tôm sú", "Thịt heo", "Bánh tráng", "Bún tươi", "Rau thơm"],
    imageUrl: `${commons}/9/90/G%E1%BB%8Fi_cu%E1%BB%91n.jpg/960px-G%E1%BB%8Fi_cu%E1%BB%91n.jpg`,
    imageCredit: "Tran Hai Duong · CC0 · Wikimedia Commons",
  },
  {
    name: "Chả giò", tags: ["Khai vị", "Món chiên", "Miền Nam"], price: 40000, chef: "Phạm Quốc Huy",
    description: "Chả giò chiên giòn, nhân thịt heo và tôm.",
    ingredients: ["Bánh tráng", "Thịt heo", "Tôm sú", "Trứng gà"],
    imageUrl: `${thumb}/e/e5/Ch%E1%BA%A3_gi%C3%B2_SG_%28nem_r%C3%A1n_gi%C3%B2n%29_%E1%BB%9F_qu%C3%A1n_b%C3%BAn_ri%C3%AAu_B%C3%A0_Ti_ng26th7n2023_%281%29.jpg/960px-Ch%E1%BA%A3_gi%C3%B2_SG_%28nem_r%C3%A1n_gi%C3%B2n%29_%E1%BB%9F_qu%C3%A1n_b%C3%BAn_ri%C3%AAu_B%C3%A0_Ti_ng26th7n2023_%281%29.jpg`,
    imageCredit: "Phương Huy · CC BY-SA 4.0 · Wikimedia Commons",
  },
  {
    name: "Bánh xèo miền Tây", tags: ["Món chiên", "Miền Nam"], price: 45000, chef: "Phạm Quốc Huy",
    description: "Tạm ngưng phục vụ trong tháng này.",
    ingredients: ["Bột gạo", "Nước cốt dừa", "Tôm sú", "Giá đỗ"],
    imageUrl: `${commons}/a/a5/B%C3%A1nh_x%C3%A8o_with_n%C6%B0%E1%BB%9Bc_m%E1%BA%AFm.jpg/960px-B%C3%A1nh_x%C3%A8o_with_n%C6%B0%E1%BB%9Bc_m%E1%BA%AFm.jpg`,
    imageCredit: "Vivian D Nguyen · CC BY-SA 2.0 · Wikimedia Commons",
    available: false,
  },
  {
    name: "Cánh gà chiên nước mắm", tags: ["Món chiên"], price: 60000, chef: "Phạm Quốc Huy",
    description: "Cánh gà chiên giòn, sốt nước mắm tỏi.",
    ingredients: ["Cánh gà", "Nước mắm", "Tỏi"],
    imageUrl: `${thumb}/c/c7/C%C3%A1nh_g%C3%A0_chi%C3%AAn_n%C6%B0%E1%BB%9Bc_m%E1%BA%AFm%2C_th%C3%A1ng_8_n%C4%83m_2018_%281%29.JPG/960px-C%C3%A1nh_g%C3%A0_chi%C3%AAn_n%C6%B0%E1%BB%9Bc_m%E1%BA%AFm%2C_th%C3%A1ng_8_n%C4%83m_2018_%281%29.JPG`,
    imageCredit: "Phương Huy · Public domain · Wikimedia Commons",
  },
  {
    name: "Cơm chiên Dương Châu", tags: ["Món cơm", "Món chiên"], price: 50000, chef: "Trần Thị Bích",
    description: "Cơm chiên trứng, tôm, lạp xưởng, rau củ.",
    ingredients: ["Gạo thơm", "Trứng gà", "Tôm sú", "Hành lá"],
    imageUrl: `${thumb}/f/f1/C%C6%A1m_chi%C3%AAn_D%C6%B0%C6%A1ng_Ch%C3%A2u_%E1%BB%9F_%C4%90%C3%B4ng_H%C3%A0_n%C4%83m_2017.jpg/960px-C%C6%A1m_chi%C3%AAn_D%C6%B0%C6%A1ng_Ch%C3%A2u_%E1%BB%9F_%C4%90%C3%B4ng_H%C3%A0_n%C4%83m_2017.jpg`,
    imageCredit: "Phương Huy · CC BY-SA 4.0 · Wikimedia Commons",
  },
  {
    name: "Chè ba màu", tags: ["Tráng miệng", "Món chay", "Miền Nam"], price: 25000, chef: "Lê Hoàng Minh",
    description: null, // cố ý chưa có mô tả
    ingredients: ["Đậu xanh", "Nước cốt dừa"],
    imageUrl: "https://live.staticflickr.com/65535/51714302932_da40b9d5bc_c.jpg",
    imageCredit: "avlxyz · CC BY-NC 2.0 · Flickr",
  },
  {
    name: "Bánh flan", tags: ["Tráng miệng"], price: 20000, chef: "Lê Hoàng Minh",
    description: "Flan trứng sữa, nước đường thắng, đá bào.",
    ingredients: ["Trứng gà", "Sữa đặc", "Cà phê"],
    imageUrl: `${thumb}/c/cc/Ly_b%C3%A1nh_l%C4%83ng_%28flan%29_Vi%E1%BB%87t_Nam.jpg/960px-Ly_b%C3%A1nh_l%C4%83ng_%28flan%29_Vi%E1%BB%87t_Nam.jpg`,
    imageCredit: "Phương Huy · CC BY-SA 4.0 · Wikimedia Commons",
  },
  {
    name: "Cà phê sữa đá", tags: ["Đồ uống"], price: 25000, chef: "Đặng Gia Bảo",
    description: "Cà phê phin pha sữa đặc, uống với đá.",
    ingredients: ["Cà phê", "Sữa đặc"],
    imageUrl: `${thumb}/e/ec/Ca_Phe_Sua_Da.jpg/960px-Ca_Phe_Sua_Da.jpg`,
    imageCredit: "Clarin · CC BY 2.5 · Wikimedia Commons",
  },
  {
    name: "Nước mía", tags: ["Đồ uống", "Món chay"], price: 15000, chef: "Đặng Gia Bảo",
    description: "Ép tươi tại chỗ, thêm tắc.",
    ingredients: ["Sả"],
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/6/63/Sugarcanejuice.jpg",
    imageCredit: "Food Trails · CC BY-SA 2.0 · Wikimedia Commons",
    available: false,
  },
  {
    name: "Sinh tố bơ", tags: ["Đồ uống", "Món chay"], price: 35000, chef: "Đặng Gia Bảo",
    description: "Bơ sáp xay với sữa đặc.",
    ingredients: ["Quả bơ", "Sữa đặc"],
    imageUrl: `${thumb}/a/a5/Sinh_t%E1%BB%91_b%C6%A1.jpg/960px-Sinh_t%E1%BB%91_b%C6%A1.jpg`,
    imageCredit: "Hoangkid · Public domain · Wikimedia Commons",
  },
];
