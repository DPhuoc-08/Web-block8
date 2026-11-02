// Danh mục dùng để SINH dữ liệu seed (bộ sinh ở generate.js). Toàn bộ là dữ liệu giả lập để kiểm tra phân trang và
// tìm kiếm, không phải thực đơn hay giá thị trường thật.

// ===== Đầu bếp: ghép họ × tên đệm × tên (bộ sinh bỏ tên trùng) =====
export const HO = ["Nguyễn", "Trần", "Lê", "Phạm", "Hoàng", "Huỳnh", "Phan", "Vũ", "Võ", "Đặng", "Bùi", "Đỗ", "Hồ", "Ngô", "Dương", "Lý", "Đinh", "Trương", "Mai", "Tô"];
export const DEM = ["Văn", "Thị", "Minh", "Quốc", "Thanh", "Ngọc", "Hữu", "Gia", "Bảo", "Đức", "Thu", "Kim", "Anh", "Hoài", "Xuân"];
export const TEN = ["An", "Bình", "Châu", "Dũng", "Giang", "Hà", "Hải", "Hạnh", "Hiếu", "Hòa", "Hùng", "Khánh", "Khoa", "Lan", "Linh", "Long", "Mai", "Nam", "Nga", "Nhung", "Phong", "Phúc", "Quân", "Quyên", "Sơn", "Tài", "Thảo", "Thắng", "Trang", "Trí", "Trung", "Tú", "Uyên", "Vy", "Yến"];

// ===== Nguyên liệu (bổ sung cho 30 nguyên liệu của block6) — [tên, đơn vị] =====
export const MORE_INGREDIENTS = [
  // Thịt
  ["Bắp bò", "kg"], ["Thăn bò", "kg"], ["Gân bò", "kg"], ["Đuôi bò", "kg"], ["Bò viên", "kg"], ["Ba chỉ heo", "kg"],
  ["Nạc vai heo", "kg"], ["Sườn non", "kg"], ["Chân giò", "kg"], ["Thịt heo xay", "kg"], ["Heo quay", "kg"], ["Lòng heo", "kg"],
  ["Gà công nghiệp", "con"], ["Đùi gà", "kg"], ["Ức gà", "kg"], ["Lòng gà", "kg"], ["Thịt vịt", "kg"], ["Vịt quay", "con"],
  ["Thịt dê", "kg"], ["Thịt ếch", "kg"], ["Lươn", "kg"], ["Chả lụa", "kg"], ["Lạp xưởng", "kg"], ["Giò sống", "kg"],
  ["Nem chua", "cái"], ["Xúc xích", "kg"],
  // Hải sản
  ["Tôm thẻ", "kg"], ["Tôm càng", "kg"], ["Mực ống", "kg"], ["Mực lá", "kg"], ["Bạch tuộc", "kg"], ["Cua biển", "kg"],
  ["Cua đồng", "kg"], ["Ghẹ", "kg"], ["Nghêu", "kg"], ["Sò huyết", "kg"], ["Sò điệp", "kg"], ["Hàu", "kg"], ["Ốc hương", "kg"],
  ["Ốc bươu", "kg"], ["Cá lóc", "kg"], ["Cá thu", "kg"], ["Cá hồi", "kg"], ["Cá ngừ", "kg"], ["Cá kèo", "kg"],
  ["Cá diêu hồng", "kg"], ["Cá lăng", "kg"], ["Cá trê", "kg"], ["Chả cá", "kg"], ["Tôm khô", "kg"], ["Mực khô", "kg"],
  // Rau, củ, nấm
  ["Cải thìa", "kg"], ["Cải ngọt", "kg"], ["Cải bẹ xanh", "kg"], ["Rau dền", "bó"], ["Mồng tơi", "bó"], ["Bông bí", "kg"],
  ["Bông điên điển", "kg"], ["Cà tím", "kg"], ["Bí đỏ", "kg"], ["Bí xanh", "kg"], ["Mướp", "kg"], ["Khổ qua", "kg"],
  ["Cà rốt", "kg"], ["Củ cải trắng", "kg"], ["Khoai tây", "kg"], ["Khoai môn", "kg"], ["Khoai lang", "kg"], ["Su hào", "kg"],
  ["Bắp cải", "kg"], ["Súp lơ xanh", "kg"], ["Đậu bắp", "kg"], ["Đậu cô ve", "kg"], ["Ngô ngọt", "kg"], ["Nấm rơm", "kg"],
  ["Nấm kim châm", "kg"], ["Nấm đùi gà", "kg"], ["Nấm mèo", "kg"], ["Măng tươi", "kg"], ["Măng tây", "kg"], ["Dọc mùng", "kg"],
  ["Cà chua", "kg"], ["Dưa leo", "kg"], ["Hành tây", "kg"], ["Ngó sen", "kg"], ["Bắp chuối", "kg"], ["Đu đủ xanh", "kg"],
  ["Xà lách", "kg"], ["Rau mầm", "kg"], ["Rau muống bào", "kg"], ["Cải thảo", "kg"], ["Kim chi", "kg"], ["Dưa cải chua", "kg"],
  ["Ớt chuông", "kg"], ["Rau đắng", "bó"],
  // Rau thơm, gia vị
  ["Hành tím", "kg"], ["Gừng", "kg"], ["Riềng", "kg"], ["Nghệ", "kg"], ["Ớt hiểm", "kg"], ["Tiêu đen", "kg"], ["Hoa hồi", "kg"],
  ["Quế", "kg"], ["Thảo quả", "kg"], ["Lá chanh", "bó"], ["Lá lốt", "bó"], ["Rau răm", "bó"], ["Ngò gai", "bó"], ["Húng quế", "bó"],
  ["Tía tô", "bó"], ["Kinh giới", "bó"], ["Thì là", "bó"], ["Lá é", "bó"], ["Ngò rí", "bó"], ["Mắm tôm", "hũ"], ["Mắm ruốc", "hũ"],
  ["Mắm nêm", "chai"], ["Tương đen", "chai"], ["Dầu hào", "chai"], ["Xì dầu", "chai"], ["Đường thốt nốt", "kg"], ["Me chua", "kg"],
  ["Chanh", "kg"], ["Tắc", "kg"], ["Sa tế", "hũ"], ["Mẻ", "hũ"], ["Chao", "hũ"], ["Hạt điều", "kg"], ["Đậu phộng", "kg"], ["Mè rang", "kg"],
  ["Hành phi", "kg"], ["Tỏi phi", "kg"], ["Bơ lạt", "kg"], ["Dầu ăn", "lít"], ["Bột chiên giòn", "kg"], ["Bột chiên xù", "kg"],
  ["Mật ong", "lít"], ["Sốt cà chua", "chai"], ["Tương ớt", "chai"],
  // Tinh bột
  ["Bún khô", "kg"], ["Miến dong", "kg"], ["Mì trứng", "kg"], ["Sợi bánh canh", "kg"], ["Bánh hỏi", "kg"], ["Bánh cuốn", "kg"],
  ["Bánh phở cuốn", "kg"], ["Bột năng", "kg"], ["Bột mì", "kg"], ["Gạo nếp", "kg"], ["Nếp cẩm", "kg"], ["Bánh mì", "ổ"],
  ["Bánh tráng phơi sương", "xấp"], ["Bánh đa nem", "xấp"], ["Mì gói", "gói"], ["Cơm nguội", "kg"],
  // Đậu, trứng, sữa
  ["Đậu hũ", "miếng"], ["Đậu hũ non", "hộp"], ["Váng đậu", "kg"], ["Đậu đỏ", "kg"], ["Đậu đen", "kg"], ["Đậu trắng", "kg"],
  ["Hạt sen", "kg"], ["Trứng vịt", "quả"], ["Trứng cút", "quả"], ["Trứng muối", "quả"], ["Sữa tươi", "lít"], ["Sữa chua", "hộp"],
  ["Kem tươi", "hộp"], ["Phô mai", "kg"],
  // Trái cây, đồ uống, tráng miệng
  ["Trà xanh", "kg"], ["Trà đen", "kg"], ["Bột matcha", "kg"], ["Bột cacao", "kg"], ["Đá viên", "kg"], ["Đường phèn", "kg"],
  ["Trân châu", "kg"], ["Thạch dừa", "kg"], ["Sương sáo", "kg"], ["Bột báng", "kg"], ["Khoai mì", "kg"], ["Chuối", "nải"],
  ["Xoài", "kg"], ["Dừa tươi", "quả"], ["Cam", "kg"], ["Chanh dây", "kg"], ["Dâu tây", "kg"], ["Mít", "kg"], ["Thơm", "quả"],
  ["Dưa hấu", "kg"], ["Ổi", "kg"], ["Bưởi", "kg"], ["Đào ngâm", "hộp"], ["Vải", "kg"], ["Việt quất", "kg"], ["Bạc hà", "bó"],
  ["Sầu riêng", "kg"], ["Nhãn", "kg"], ["Thanh long", "kg"], ["Cà phê hạt", "kg"],
  // Bổ sung để đủ 250
  ["Tiêu xanh", "kg"], ["Ớt sừng", "kg"], ["Hành boa rô", "kg"], ["Cần tây", "kg"], ["Rau ngót", "bó"], ["Bầu", "kg"],
  ["Cải xoong", "kg"], ["Rau nhút", "bó"], ["Bánh phồng tôm", "gói"], ["Bánh đa", "kg"], ["Măng khô", "kg"], ["Củ đậu", "kg"],
  ["Gạo lứt", "kg"], ["Đậu Hà Lan", "kg"], ["Rau tần ô", "bó"], ["Lá giang", "bó"], ["Sữa đậu nành", "lít"], ["Hạt chia", "kg"],
  ["Bột rau câu", "kg"], ["Lá dứa", "bó"], ["Chanh muối", "hũ"],
];

// 5 nguyên liệu cố ý KHÔNG món nào dùng (xoá được) — gồm "Nấm hương" của block6.
export const UNUSED_INGREDIENTS = ["Nấm hương", "Đường thốt nốt", "Sầu riêng", "Lá é", "Váng đậu"];

// ===== Từ khoá trong tên món → nguyên liệu (bộ sinh lấy 1 nguyên liệu cho mỗi từ khoá khớp) =====
// Thứ tự quan trọng: cụm dài trước ("bò viên" trước "bò").
export const KEYWORD_INGREDIENTS = [
  ["bò viên", ["Bò viên"]], ["đuôi bò", ["Đuôi bò"]], ["bò", ["Thịt bò", "Bắp bò", "Thăn bò", "Gân bò"]],
  ["sườn", ["Sườn heo", "Sườn non"]], ["giò heo", ["Giò heo", "Chân giò"]], ["heo quay", ["Heo quay"]], ["ba chỉ", ["Ba chỉ heo"]],
  ["thịt", ["Thịt heo", "Nạc vai heo"]], ["heo", ["Thịt heo", "Ba chỉ heo"]], ["lòng", ["Lòng heo", "Lòng gà"]], ["chả lụa", ["Chả lụa"]],
  ["lạp xưởng", ["Lạp xưởng"]], ["nem", ["Nem chua", "Thịt heo xay"]], ["mọc", ["Giò sống"]],
  ["cánh gà", ["Cánh gà"]], ["gà", ["Gà ta", "Đùi gà", "Ức gà", "Gà công nghiệp"]], ["vịt", ["Thịt vịt", "Vịt quay"]], ["dê", ["Thịt dê"]],
  ["ếch", ["Thịt ếch"]], ["lươn", ["Lươn"]],
  ["tôm", ["Tôm sú", "Tôm thẻ", "Tôm càng"]], ["mực", ["Mực ống", "Mực lá"]], ["bạch tuộc", ["Bạch tuộc"]], ["riêu cua", ["Cua đồng"]], ["cua đồng", ["Cua đồng"]],
  ["cua", ["Cua biển"]], ["ghẹ", ["Ghẹ"]], ["nghêu", ["Nghêu"]], ["sò điệp", ["Sò điệp"]], ["sò", ["Sò huyết"]], ["hàu", ["Hàu"]],
  ["ốc", ["Ốc hương", "Ốc bươu"]], ["chả cá", ["Chả cá"]], ["cá lóc", ["Cá lóc"]], ["cá kèo", ["Cá kèo"]], ["cá thu", ["Cá thu"]],
  ["cá hồi", ["Cá hồi"]], ["cá ngừ", ["Cá ngừ"]], ["cá trê", ["Cá trê"]], ["cá lăng", ["Cá lăng"]], ["diêu hồng", ["Cá diêu hồng"]], ["cá", ["Cá basa", "Cá lóc", "Cá diêu hồng"]],
  ["hải sản", ["Tôm thẻ", "Mực ống", "Nghêu"]],
  ["đậu hũ", ["Đậu hũ", "Đậu hũ non"]], ["nấm", ["Nấm rơm", "Nấm kim châm", "Nấm đùi gà", "Nấm mèo"]], ["trứng", ["Trứng gà", "Trứng vịt"]],
  ["rau muống", ["Rau muống"]], ["cải thìa", ["Cải thìa"]], ["bông bí", ["Bông bí"]], ["đậu que", ["Đậu cô ve"]], ["khổ qua", ["Khổ qua"]],
  ["cà tím", ["Cà tím"]], ["bí đỏ", ["Bí đỏ"]], ["măng tây", ["Măng tây"]], ["măng", ["Măng tươi"]], ["kim chi", ["Kim chi"]], ["ngó sen", ["Ngó sen"]],
  ["đu đủ", ["Đu đủ xanh"]], ["xoài", ["Xoài"]], ["bắp chuối", ["Bắp chuối"]], ["rau mầm", ["Rau mầm"]], ["khoai tây", ["Khoai tây"]],
  ["phô mai", ["Phô mai"]], ["trứng muối", ["Trứng muối"]], ["sả", ["Sả"]], ["tỏi", ["Tỏi"]], ["gừng", ["Gừng"]], ["lá lốt", ["Lá lốt"]], ["me", ["Me chua"]], ["mật ong", ["Mật ong"]],
  ["sa tế", ["Sa tế"]], ["riềng", ["Riềng"]], ["mỡ hành", ["Hành lá"]], ["bơ tỏi", ["Bơ lạt", "Tỏi"]], ["chao", ["Chao"]],
  ["đậu xanh", ["Đậu xanh"]], ["đậu đỏ", ["Đậu đỏ"]], ["đậu đen", ["Đậu đen"]], ["khoai môn", ["Khoai môn"]], ["bưởi", ["Bưởi"]],
  ["dừa", ["Dừa tươi", "Nước cốt dừa"]], ["chuối", ["Chuối"]], ["flan", ["Trứng gà", "Sữa đặc"]], ["mít", ["Mít"]], ["nếp cẩm", ["Nếp cẩm"]],
  ["trân châu", ["Trân châu"]], ["hạt sen", ["Hạt sen"]], ["sương sáo", ["Sương sáo"]], ["thạch", ["Thạch dừa"]], ["sữa chua", ["Sữa chua"]],
  ["đào", ["Đào ngâm"]], ["vải", ["Vải"]], ["chanh dây", ["Chanh dây"]], ["cam", ["Cam"]], ["dưa hấu", ["Dưa hấu"]], ["dâu", ["Dâu tây"]],
  ["ổi", ["Ổi"]], ["thơm", ["Thơm"]], ["cà rốt", ["Cà rốt"]], ["matcha", ["Bột matcha"]], ["cacao", ["Bột cacao"]], ["bơ", ["Quả bơ"]],
  ["việt quất", ["Việt quất"]], ["bạc hà", ["Bạc hà"]], ["cà phê", ["Cà phê", "Cà phê hạt"]], ["trà", ["Trà xanh", "Trà đen"]], ["sữa", ["Sữa tươi", "Sữa đặc"]],
];

// Tinh bột theo chữ đầu tên món.
export const BASE_INGREDIENTS = [
  ["Phở cuốn", "Bánh phở cuốn"], ["Phở", "Bánh phở"], ["Bún", "Bún tươi"], ["Hủ tiếu", "Hủ tiếu khô"], ["Mì Quảng", "Sợi mì Quảng"],
  ["Mì", "Mì trứng"], ["Miến", "Miến dong"], ["Bánh canh", "Sợi bánh canh"], ["Cháo", "Gạo thơm"], ["Cơm tấm", "Gạo tấm"],
  ["Cơm", "Gạo thơm"], ["Xôi", "Gạo nếp"], ["Gỏi cuốn", "Bánh tráng"], ["Bò bía", "Bánh đa nem"], ["Bánh tráng", "Bánh tráng phơi sương"],
  ["Bánh hỏi", "Bánh hỏi"], ["Bánh cuốn", "Bánh cuốn"], ["Bánh mì", "Bánh mì"],
];

// Nguyên liệu phụ theo loại món — bộ sinh bù cho đủ 3–6 nguyên liệu mỗi món.
export const PANTRY = {
  "Món nước": ["Hành lá", "Rau thơm", "Giá đỗ", "Hành tím", "Gừng", "Hoa hồi", "Quế", "Ngò gai", "Chanh", "Ớt hiểm", "Nước mắm", "Thảo quả",
    "Củ cải trắng", "Mắm tôm", "Mắm ruốc", "Nghệ", "Thì là", "Bún khô", "Dọc mùng", "Rau đắng", "Bánh đa", "Măng khô", "Tiêu xanh"],
  "Món cơm": ["Hành lá", "Nước mắm", "Dưa leo", "Cà chua", "Hành phi", "Tiêu đen", "Tỏi", "Dầu ăn",
    "Dưa cải chua", "Cải ngọt", "Su hào", "Cơm nguội", "Trứng cút", "Bí xanh", "Mồng tơi", "Rau dền", "Rau ngót", "Bầu", "Gạo lứt"],
  "Món xào": ["Tỏi", "Hành tây", "Ớt chuông", "Dầu hào", "Xì dầu", "Dầu ăn", "Tiêu đen", "Hành lá", "Cà rốt",
    "Bắp cải", "Súp lơ xanh", "Đậu bắp", "Ngô ngọt", "Cà tím", "Mướp", "Hạt điều", "Ớt sừng", "Cần tây", "Đậu Hà Lan"],
  "Món chiên": ["Dầu ăn", "Bột chiên giòn", "Bột chiên xù", "Tỏi phi", "Tương ớt", "Xà lách", "Tiêu đen",
    "Bột năng", "Bột mì", "Bơ lạt", "Phô mai", "Trứng muối", "Sốt cà chua", "Khoai lang", "Xúc xích"],
  "Món nướng": ["Sả", "Mật ong", "Hành lá", "Tiêu đen", "Dầu ăn", "Hành tím", "Ớt hiểm", "Đậu phộng",
    "Mẻ", "Mắm nêm", "Bánh mì", "Hành boa rô"],
  "Món hấp": ["Gừng", "Sả", "Hành lá", "Lá chanh", "Xì dầu", "Ngò rí", "Húng quế"],
  "Món cuốn": ["Xà lách", "Rau thơm", "Dưa leo", "Tía tô", "Kinh giới", "Đậu phộng", "Tương đen", "Củ đậu"],
  "Lẩu": ["Cải thảo", "Nấm kim châm", "Rau muống bào", "Cà chua", "Sả", "Ớt hiểm", "Bún tươi", "Đậu hũ", "Mì gói",
    "Bông điên điển", "Cải bẹ xanh", "Cải xoong", "Rau nhút", "Rau tần ô", "Lá giang"],
  "Khai vị": ["Rau răm", "Đậu phộng", "Hành phi", "Chanh", "Ớt hiểm", "Nước mắm", "Cà rốt", "Mè rang",
    "Tôm khô", "Mực khô", "Bánh phồng tôm", "Măng tây"],
  "Tráng miệng": ["Nước cốt dừa", "Đường phèn", "Đá viên", "Bột báng", "Sữa đặc", "Mè rang",
    "Khoai mì", "Đậu trắng", "Kem tươi", "Bột rau câu", "Lá dứa"],
  "Đồ uống": ["Đá viên", "Đường phèn", "Sữa đặc", "Chanh", "Tắc", "Mật ong", "Thanh long", "Nhãn", "Sữa đậu nành", "Hạt chia", "Chanh muối"],
};

// ===== Họ món theo loại: [tên nền, danh sách phần chính, danh sách kiểu] → tên = nền + chính + kiểu =====
// `count`: số món sinh cho loại này (tổng 1.180). `price`: [thấp, cao] (đồng, bộ sinh làm tròn 5.000).
export const FAMILIES = {
  "Món nước": {
    count: 220, price: [35000, 95000],
    sets: [
      [["Phở"], ["bò tái", "bò chín", "bò viên", "gà", "gà xé", "tái nạm", "đuôi bò", "sốt vang", "chay nấm"], ["", "Hà Nội", "Nam Định", "đặc biệt", "tô lớn"]],
      [["Bún"], ["bò", "riêu cua", "chả cá", "mọc", "ốc", "măng vịt", "thịt nướng", "cá lóc", "mắm", "chay"], ["", "Huế", "Hà Nội", "miền Tây", "Nha Trang", "đặc biệt"]],
      [["Hủ tiếu"], ["Nam Vang", "bò kho", "xương", "mực", "hải sản", "gõ", "chay"], ["", "khô", "đặc biệt", "Sa Đéc", "Mỹ Tho"]],
      [["Mì"], ["vịt tiềm", "hoành thánh", "xá xíu", "hải sản", "bò kho"], ["", "khô", "nước", "tô lớn"]],
      [["Miến"], ["gà", "lươn", "vịt", "cua", "măng gà"], ["", "trộn", "nước"]],
      [["Bánh canh"], ["cua", "chả cá", "giò heo", "tôm", "cá lóc", "ghẹ", "mực"], ["", "Huế", "Trảng Bàng", "đặc biệt"]],
      [["Cháo"], ["gà", "lòng", "sườn", "cá", "hàu", "vịt", "nấm"], ["", "Hà Nội", "rau đắng", "hành gừng"]],
    ],
    descriptions: [
      "Nước dùng hầm xương nhiều giờ, {main} mềm thơm, ăn kèm rau sống và chanh ớt.",
      "Tô {name} nóng, nước dùng trong ngọt thanh, thêm hành lá và tiêu.",
      "Sợi tươi làm mỗi sáng, chan nước dùng đậm vị, {main} thái mỏng.",
      "Hương vị {region}, nước dùng nấu theo công thức gia truyền.",
    ],
  },
  "Món cơm": {
    count: 160, price: [40000, 110000],
    sets: [
      [["Cơm", "Cơm tấm", "Cơm niêu"], ["sườn nướng", "gà kho gừng", "cá kho tộ", "thịt kho trứng", "bò lúc lắc", "mực xào", "tôm rim", "đậu hũ sốt cà", "gà chiên mắm", "heo quay", "vịt quay", "cá thu sốt cà", "chả trứng", "ba chỉ rim mắm", "gà nướng mật ong", "sườn ram"], ["", "đặc biệt", "phần lớn", "kèm canh chua"]],
      [["Xôi"], ["gà xé", "lạp xưởng", "chả lụa", "đậu xanh", "thịt kho"], ["", "đặc biệt", "lá sen"]],
    ],
    descriptions: [
      "Cơm nóng ăn kèm {main}, dưa leo, cà chua và nước mắm pha.",
      "Phần {name} đầy đặn, có canh và rau theo ngày.",
      "{main} đậm đà, cơm dẻo, thêm mỡ hành và đồ chua.",
    ],
  },
  "Món xào": {
    count: 140, price: [35000, 120000],
    sets: [
      [["Bò", "Mực", "Tôm", "Gà", "Lòng gà", "Ếch", "Lươn", "Ốc", "Bạch tuộc", "Thịt heo", "Lòng heo"], ["xào"], ["tỏi", "sả ớt", "hành tây", "chua ngọt", "rau củ", "thập cẩm", "me", "kim chi", "măng"]],
      [["Rau muống", "Cải thìa", "Bông bí", "Đậu que", "Nấm", "Khổ qua", "Mì", "Miến", "Hủ tiếu"], ["xào"], ["tỏi", "bò", "hải sản", "trứng", "chay"]],
    ],
    descriptions: [
      "Xào lửa lớn cho {main} giòn ngọt, giữ màu xanh của rau.",
      "Đĩa {name} thơm mùi tỏi phi, nêm vừa ăn, dùng nóng.",
      "Nguyên liệu tươi trong ngày, sốt sệt bám đều, hợp ăn với cơm trắng.",
    ],
  },
  "Món chiên": {
    count: 120, price: [35000, 150000],
    sets: [
      [["Cá diêu hồng", "Gà", "Cánh gà", "Tôm", "Mực", "Đậu hũ", "Cá kèo", "Ếch", "Sườn", "Khoai tây", "Chả giò", "Nem", "Cá lóc", "Cá trê"], ["chiên"], ["giòn", "nước mắm", "bơ tỏi", "xù", "sả", "muối ớt", "me", "sốt cay", "trứng muối"]],
    ],
    descriptions: [
      "Chiên vàng giòn bên ngoài, bên trong mềm, chấm kèm nước sốt nhà làm.",
      "{name} giòn rụm, ăn kèm rau sống và tương ớt.",
      "Lớp áo bột mỏng, chiên ngập dầu sạch, ráo dầu trước khi dọn.",
    ],
  },
  "Món nướng": {
    count: 120, price: [45000, 220000],
    sets: [
      [["Sườn", "Ba chỉ", "Gà", "Bò", "Mực", "Tôm", "Cá", "Cá hồi", "Hàu", "Sò điệp", "Ếch", "Vịt", "Dê", "Bạch tuộc", "Nem"], ["nướng"], ["mỡ hành", "muối ớt", "sả", "lá lốt", "mật ong", "than hoa", "riềng mẻ", "sa tế", "phô mai"]],
    ],
    descriptions: [
      "Ướp gia vị qua đêm, nướng trên than hoa cho thơm cháy cạnh.",
      "{name} dọn ngay khi vừa rời bếp than, ăn kèm rau sống và muối tiêu chanh.",
      "Nướng vừa chín tới, giữ vị ngọt tự nhiên của {main}.",
    ],
  },
  "Món hấp": {
    count: 70, price: [60000, 250000],
    sets: [
      [["Cá", "Gà", "Tôm", "Nghêu", "Sò", "Cua", "Ghẹ", "Bạch tuộc", "Ốc", "Vịt"], ["hấp"], ["gừng", "sả", "bia", "xì dầu", "hành", "lá chanh", "Thái", "lá sen"]],
    ],
    descriptions: [
      "Hấp cách thủy giữ trọn vị ngọt, thơm mùi {main} và rau gia vị.",
      "{name} hấp vừa chín, chấm muối tiêu chanh hoặc nước mắm gừng.",
    ],
  },
  "Món cuốn": {
    count: 60, price: [30000, 90000],
    sets: [
      [["Gỏi cuốn", "Bò bía", "Phở cuốn", "Bánh tráng cuốn", "Cuốn diếp", "Bánh hỏi", "Bánh cuốn"], ["tôm thịt", "bò", "gà", "chay", "cá", "mực", "thịt heo", "nem nướng", "lạp xưởng"], ["", "chấm tương", "chấm mắm nêm"]],
    ],
    descriptions: [
      "Cuốn tại bàn với rau sống tươi, chấm nước sốt pha sẵn.",
      "{name} cuốn chặt tay, rau thơm giòn mát, hợp ăn nhẹ buổi trưa.",
    ],
  },
  "Lẩu": {
    count: 60, price: [180000, 450000],
    sets: [
      [["Lẩu"], ["Thái", "mắm", "cá kèo", "bò", "gà lá é", "hải sản", "nấm", "dê", "riêu cua", "cá lăng", "ếch măng cay", "kim chi", "đuôi bò", "vịt nấu chao", "chua cay"], ["", "nhỏ", "lớn", "2 người", "4 người"]],
    ],
    descriptions: [
      "Nồi lẩu nước dùng đậm vị, kèm rau, nấm, bún và đồ nhúng theo ngày.",
      "{name} dọn kèm bếp, nêm sẵn, thêm rau và mì tuỳ khẩu vị.",
      "Nước lẩu chua cay vừa phải, đồ nhúng tươi, phù hợp đi nhóm.",
    ],
  },
  "Khai vị": {
    count: 80, price: [30000, 120000],
    sets: [
      [["Gỏi", "Nộm"], ["ngó sen", "đu đủ", "xoài", "gà", "bò", "mực", "tôm", "bắp chuối", "rau mầm", "hải sản", "cá ngừ"], ["", "tôm thịt", "chua cay", "Thái"]],
      [["Súp"], ["cua", "gà", "hải sản", "măng tây", "bí đỏ", "nấm"], ["", "trứng cút"]],
    ],
    descriptions: [
      "Món khai vị trộn chua ngọt, rắc đậu phộng và hành phi.",
      "{name} thanh mát, kích thích vị giác trước món chính.",
      "Rau củ thái sợi, trộn nước mắm chua ngọt, thêm rau răm.",
    ],
  },
  "Tráng miệng": {
    count: 70, price: [15000, 50000],
    sets: [
      [["Chè"], ["đậu xanh", "đậu đỏ", "đậu đen", "bưởi", "khoai môn", "chuối", "thái", "hạt sen", "nếp cẩm", "sương sáo", "trân châu", "bắp"], ["", "nước cốt dừa", "nóng", "đá"]],
      [["Kem", "Sữa chua", "Bánh flan", "Thạch", "Tàu hủ"], ["dừa", "xoài", "mít", "trân châu", "cà phê", "dâu", "matcha"], ["", "đá"]],
    ],
    descriptions: [
      "Món ngọt mát lạnh, vị ngọt vừa phải, thêm nước cốt dừa béo nhẹ.",
      "{name} nấu mỗi ngày, dùng lạnh hoặc nóng tuỳ thích.",
    ],
  },
  "Đồ uống": {
    count: 80, price: [15000, 65000],
    sets: [
      [["Trà"], ["đào", "vải", "chanh dây", "tắc", "sen", "gừng mật ong", "matcha sữa", "sữa trân châu"], ["", "ít đường", "size lớn"]],
      [["Sinh tố", "Nước ép"], ["xoài", "dâu", "bơ", "cam", "dưa hấu", "ổi", "thơm", "cà rốt", "mãng cầu", "việt quất"], ["", "size lớn"]],
      [["Cà phê"], ["đen đá", "sữa nóng", "muối", "dừa", "trứng", "cốt dừa"], ["", "size lớn"]],
      [["Soda", "Đá xay"], ["chanh bạc hà", "việt quất", "dâu", "matcha", "cacao"], [""]],
    ],
    descriptions: [
      "Pha tại quầy khi gọi, dùng ngay để giữ vị tươi.",
      "{name} mát lạnh, ngọt dịu, hợp giải khát buổi trưa.",
      "Nguyên liệu tươi, đá viên riêng, chỉnh đường theo yêu cầu.",
    ],
  },
};

// Từ khoá → tag vùng miền / đặc điểm (cộng thêm vào tag loại món).
export const REGION_HINTS = [
  [/Hà Nội|Nam Định|bún chả/i, "Miền Bắc"],
  [/Huế|Quảng|Nha Trang|Hội An|lá é/i, "Miền Trung"],
  [/Nam Vang|Sài Gòn|miền Tây|Trảng Bàng|Sa Đéc|Mỹ Tho|cá kèo|mắm|điên điển|kho tộ|chao/i, "Miền Nam"],
];
export const SEAFOOD = /tôm|mực|cua|ghẹ|nghêu|sò|hàu|ốc|bạch tuộc|hải sản|cá/i;
export const MEAT = /bò|heo|thịt|sườn|ba chỉ|gà|vịt|dê|ếch|lươn|lòng|nem|chả|lạp xưởng|xá xíu|hoành thánh|mọc|giò|tôm|mực|cua|ghẹ|nghêu|sò|hàu|ốc|bạch tuộc|hải sản|cá|trứng|riêu|mắm/i;

// Món đặc biệt, đặt ở vị trí cố định xa trang đầu: giá 0, tên có ký tự đặc biệt (thử escape wildcard), mô tả NULL.
export const SPECIAL_DISHES = [
  { at: 300, name: "Trà đá", tags: ["Đồ uống", "Món chay"], price: 0, description: "Trà đá miễn phí cho khách dùng bữa tại quán.", ingredients: ["Trà xanh", "Đá viên"] },
  { at: 420, name: "Rau sống (tặng kèm)", tags: ["Khai vị", "Món chay"], price: 0, description: null, ingredients: ["Xà lách", "Rau thơm", "Dưa leo"] },
  { at: 560, name: "Combo 100% bò", tags: ["Món nướng", "Lẩu"], price: 399000, description: "Combo nướng và lẩu toàn thịt bò cho 4 người.", ingredients: ["Thịt bò", "Bắp bò", "Gân bò", "Sả", "Cải thảo"] },
  { at: 700, name: "Trà_sữa nhà làm", tags: ["Đồ uống"], price: 30000, description: "Trà đen pha sữa tươi, trân châu nấu mỗi sáng.", ingredients: ["Trà đen", "Sữa tươi", "Trân châu"] },
  { at: 830, name: "Nước sâm (tặng kèm)", tags: ["Đồ uống", "Món chay"], price: 0, description: null, ingredients: ["Đường phèn", "Đá viên", "Bạc hà"] },
  { at: 960, name: "Cơm \\ cháo tuỳ chọn", tags: ["Món cơm"], price: 25000, description: "Chọn cơm trắng hoặc cháo trắng ăn kèm món chính.", ingredients: ["Gạo thơm", "Hành lá", "Nước mắm"] },
  { at: 1100, name: "Đá viên (tặng kèm)", tags: ["Đồ uống", "Món chay"], price: 0, description: null, ingredients: ["Đá viên"] },
];
