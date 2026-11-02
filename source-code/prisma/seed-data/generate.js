// Bộ sinh dữ liệu seed TẤT ĐỊNH: cùng hạt giống → luôn ra đúng cùng dữ liệu (kết quả "Kỳ vọng" của các kịch bản
// kiểm tra không đổi giữa các lần seed). Không dùng Math.random; dùng PRNG mulberry32 có hạt giống cố định.
//
// Kết quả: 16 tag, 60 đầu bếp, 250 nguyên liệu, 1.200 món (20 món block6 giữ id 1–20 + 7 món đặc biệt ở vị trí cố định
// + 1.173 món sinh). Quy tắc: đầu bếp phụ trách món luôn có ít nhất 1 tag trùng với món; tải chia đều (~20 món/người).
import { TAGS, CHEFS as BASE_CHEFS, INGREDIENTS as BASE_INGREDIENT_LIST, DISHES as BASE_DISHES } from "./base.js";
import {
  HO, DEM, TEN, MORE_INGREDIENTS, UNUSED_INGREDIENTS, KEYWORD_INGREDIENTS, BASE_INGREDIENTS, PANTRY,
  FAMILIES, REGION_HINTS, SEAFOOD, MEAT, SPECIAL_DISHES,
} from "./catalog.js";

const SEED = 20261026;
const TOTAL_DISHES = 1200;
const TOTAL_CHEFS = 60;
const TYPE_TAGS = TAGS.slice(0, 11); // loại món
const EXTRA_TAGS = TAGS.slice(11); // Hải sản, Món chay, Miền Bắc, Miền Trung, Miền Nam
const REGIONS = ["Miền Bắc", "Miền Trung", "Miền Nam"];
const NO_SPECIAL_TAG = new Set(["Tráng miệng", "Đồ uống"]); // không gắn Hải sản / Món chay tự động
const VEGGIE = /chay|đậu hũ|nấm|rau|bông bí|cải|khổ qua|đậu que|khoai|ngó sen|đu đủ|xoài|bắp chuối|măng tây|bí đỏ/i;

// So khớp NGUYÊN TỪ (chữ có dấu): "cá" không được khớp trong "Cánh gà". \b của JavaScript không hiểu chữ có dấu
// → dùng lookaround với \p{L} (mọi chữ cái Unicode).
const wholeWords = (re) => new RegExp(`(?<!\\p{L})(?:${re.source})(?!\\p{L})`, "iu");
const IS_SEAFOOD = wholeWords(SEAFOOD);
const IS_MEAT = wholeWords(MEAT);
const IS_VEGGIE = wholeWords(VEGGIE);
const REPEATED_WORD = /(?<!\p{L})(\p{L}+) \1(?!\p{L})/iu;
const KEYWORDS = KEYWORD_INGREDIENTS.map(([keyword, options]) => [wholeWords(new RegExp(keyword)), options]);

// Món của block6 có ảnh thật → món sinh cùng loại dùng lại ảnh (kèm ghi công). [từ khoá đầu tên, vị trí trong BASE_DISHES]
const IMAGE_HINTS = [
  [/^Phở (?!cuốn)/, 0], [/^Bún bò/, 2], [/^Hủ tiếu/, 3], [/^Cơm tấm/, 5], [/kho tộ/, 7], [/lúc lắc/, 8],
  [/^Rau muống xào/, 9], [/^Gỏi cuốn/, 10], [/^Chả giò/, 11], [/^Cánh gà/, 13], [/^Chè/, 15], [/^Bánh flan/, 16], [/^Cà phê/, 17],
];

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildSeed() {
  const rand = mulberry32(SEED);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const between = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
  const shuffle = (arr) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  // ===== Nguyên liệu =====
  const ingredients = [...BASE_INGREDIENT_LIST, ...MORE_INGREDIENTS];
  const ingredientNames = new Set(ingredients.map(([name]) => name));
  if (ingredientNames.size !== ingredients.length) throw new Error("Seed: tên nguyên liệu bị trùng.");
  const unused = new Set(UNUSED_INGREDIENTS);
  // Mọi tên nguyên liệu mà catalog nhắc tới phải có thật → báo lỗi sớm thay vì seed thiếu.
  const referenced = [
    ...KEYWORD_INGREDIENTS.flatMap(([, list]) => list),
    ...BASE_INGREDIENTS.map(([, name]) => name),
    ...Object.values(PANTRY).flat(),
    ...SPECIAL_DISHES.flatMap((d) => d.ingredients),
    ...UNUSED_INGREDIENTS,
  ];
  const missing = [...new Set(referenced.filter((n) => !ingredientNames.has(n)))];
  if (missing.length) throw new Error(`Seed: catalog nhắc tới nguyên liệu không có: ${missing.join(", ")}`);
  const usable = (name) => ingredientNames.has(name) && !unused.has(name);

  // ===== Đầu bếp =====
  // Chuyên môn chính chia theo tỉ lệ số món của từng loại (phương pháp số dư lớn nhất), mỗi loại ít nhất 3 người.
  const generatedChefCount = TOTAL_CHEFS - BASE_CHEFS.length;
  const totalByType = Object.fromEntries(TYPE_TAGS.map((t) => [t, FAMILIES[t].count]));
  const sumTypes = Object.values(totalByType).reduce((a, b) => a + b, 0);
  const quota = Object.fromEntries(TYPE_TAGS.map((t) => [t, Math.max(3, Math.floor((totalByType[t] / sumTypes) * generatedChefCount))]));
  let assigned = Object.values(quota).reduce((a, b) => a + b, 0);
  const byRemainder = [...TYPE_TAGS].sort((a, b) => ((totalByType[b] / sumTypes) * generatedChefCount % 1) - ((totalByType[a] / sumTypes) * generatedChefCount % 1));
  for (let i = 0; assigned < generatedChefCount; i = (i + 1) % byRemainder.length, assigned++) quota[byRemainder[i]]++;
  const primaries = shuffle(TYPE_TAGS.flatMap((t) => Array(quota[t]).fill(t))).slice(0, generatedChefCount);

  const takenNames = new Set(BASE_CHEFS.map((c) => c.name));
  const fullNames = shuffle(HO.flatMap((h) => DEM.flatMap((d) => TEN.map((t) => `${h} ${d} ${t}`)))).filter((n) => !takenNames.has(n));
  const chefs = BASE_CHEFS.map((c) => ({ name: c.name, tags: c.tags, noDishes: c.name === "Bùi Thanh Tâm" }));
  primaries.forEach((primary, i) => {
    const tags = [primary];
    if (rand() < 0.5) tags.push(pick(EXTRA_TAGS));
    if (rand() < 0.25) tags.push(pick(TYPE_TAGS));
    // Người cuối cùng: có chuyên môn nhưng chưa phụ trách món nào (xoá được ngay) — như "Bùi Thanh Tâm".
    chefs.push({ name: fullNames[i], tags: [...new Set(tags)], noDishes: i === primaries.length - 1 });
  });

  // ===== Món sinh =====
  const reserved = new Set([...BASE_DISHES, ...SPECIAL_DISHES].map((d) => d.name.toLowerCase()));
  const generated = [];
  for (const type of TYPE_TAGS) {
    const family = FAMILIES[type];
    const candidates = [];
    for (const [bases, mains, styles] of family.sets) {
      for (const base of bases) {
        for (const main of mains) {
          for (const style of styles) {
            const name = [base, main, style].filter(Boolean).join(" ");
            // Họ món dạng "Bò xào tỏi": phần chính là động từ → món chính là phần nền.
            const mainLabel = mains.length === 1 ? base.toLowerCase() : main;
            // Bỏ tên lặp chữ liền nhau do ghép phần chính với kiểu ("Gỏi tôm" + "tôm thịt" → "Gỏi tôm tôm thịt").
            if (REPEATED_WORD.test(name)) continue;
            if (!reserved.has(name.toLowerCase())) candidates.push({ name, type, mainLabel, family });
          }
        }
      }
    }
    const unique = [...new Map(candidates.map((c) => [c.name.toLowerCase(), c])).values()];
    if (unique.length < family.count) throw new Error(`Seed: ${type} chỉ ghép được ${unique.length}/${family.count} tên.`);
    generated.push(...shuffle(unique).slice(0, family.count));
  }
  const needed = TOTAL_DISHES - BASE_DISHES.length - SPECIAL_DISHES.length;
  const picked = shuffle(generated).slice(0, needed);

  const makeDish = ({ name, type, mainLabel, family }) => {
    const tags = [type];
    const region = REGION_HINTS.find(([re]) => re.test(name))?.[1];
    if (region) tags.push(region);
    if (!NO_SPECIAL_TAG.has(type) && IS_SEAFOOD.test(name)) tags.push("Hải sản");
    if (!NO_SPECIAL_TAG.has(type) && IS_VEGGIE.test(name) && (!IS_MEAT.test(name) || /chay/i.test(name))) tags.push("Món chay");
    if (!region && rand() < 0.25) tags.push(pick(REGIONS));
    const regionTag = tags.find((t) => REGIONS.includes(t));

    const [lo, hi] = family.price;
    const description =
      rand() < 0.08
        ? null
        : capitalize(
            pick(family.descriptions)
              .replace("{main}", mainLabel)
              .replace("{name}", name)
              .replace("{region}", regionTag ? `miền ${regionTag.split(" ")[1]}` : "truyền thống"),
          );

    // Nguyên liệu: tinh bột theo chữ đầu tên + mỗi từ khoá khớp lấy 1 nguyên liệu + bù từ kho theo loại cho đủ 3–6.
    const list = [];
    const add = (n) => usable(n) && !list.includes(n) && list.push(n);
    const starch = BASE_INGREDIENTS.find(([prefix]) => name.startsWith(prefix));
    if (starch) add(starch[1]);
    let rest = name;
    for (const [keyword, options] of KEYWORDS) {
      if (keyword.test(rest)) {
        add(pick(options));
        rest = rest.replace(keyword, " "); // "bò viên" đã khớp thì không khớp thêm "bò"
      }
    }
    const target = between(3, 6);
    for (const n of shuffle(PANTRY[type])) if (list.length < target) add(n);
    const image = IMAGE_HINTS.find(([re]) => re.test(name));

    return {
      name,
      tags: [...new Set(tags)],
      price: between(Math.ceil(lo / 5000), Math.floor(hi / 5000)) * 5000,
      description,
      ingredients: list.slice(0, 6),
      imageUrl: image ? BASE_DISHES[image[1]].imageUrl : null,
      imageCredit: image ? BASE_DISHES[image[1]].imageCredit : null,
      available: rand() >= 0.15,
    };
  };

  // Thứ tự cuối: 20 món block6 (id 1–20), món sinh xen kẽ các loại, món đặc biệt chèn đúng vị trí `at` (= id).
  const dishes = [...BASE_DISHES.map((d) => ({ ...d, available: d.available ?? true })), ...picked.map(makeDish)];
  for (const s of [...SPECIAL_DISHES].sort((a, b) => a.at - b.at)) {
    dishes.splice(s.at - 1, 0, { name: s.name, tags: s.tags, price: s.price, description: s.description, ingredients: s.ingredients, imageUrl: null, imageCredit: null, available: true });
  }

  // ===== Phủ nguyên liệu: mọi nguyên liệu (trừ 5 cố ý không dùng) phải có ít nhất một món dùng =====
  // Nguyên liệu chưa ai dùng → thêm vào món sinh đầu tiên (theo id) còn < 6 nguyên liệu và hợp với nguyên liệu đó:
  // cùng loại có nguyên liệu trong kho PANTRY, hoặc tên món khớp từ khoá dẫn tới nguyên liệu (vd. "giò heo" → Chân giò,
  // khi lần bốc ngẫu nhiên đã chọn Giò heo).
  const used = new Set(dishes.flatMap((d) => d.ingredients));
  const firstGenerated = BASE_DISHES.length;
  const fits = (d, name) =>
    PANTRY[d.tags[0]]?.includes(name) || KEYWORDS.some(([keyword, options]) => options.includes(name) && keyword.test(d.name));
  for (const [name] of ingredients) {
    if (used.has(name) || unused.has(name)) continue;
    const dish = dishes.slice(firstGenerated).find((d) => d.ingredients.length < 6 && !d.ingredients.includes(name) && fits(d, name));
    if (!dish) throw new Error(`Seed: không món nào dùng được nguyên liệu "${name}" (thêm vào kho PANTRY hoặc từ khoá).`);
    dish.ingredients.push(name);
    used.add(name);
  }

  // ===== Gán đầu bếp: người cùng chuyên môn đang phụ trách ít món nhất (giữ nguyên đầu bếp của 20 món block6) =====
  const load = new Map(chefs.map((c) => [c.name, 0]));
  for (const d of BASE_DISHES) load.set(d.chef, load.get(d.chef) + 1);
  const active = chefs.filter((c) => !c.noDishes);
  for (const d of dishes) {
    if (d.chef) continue;
    const fits = active.filter((c) => c.tags.some((t) => d.tags.includes(t)));
    if (fits.length === 0) throw new Error(`Seed: không có đầu bếp đúng chuyên môn cho "${d.name}".`);
    const chef = fits.reduce((best, c) => (load.get(c.name) < load.get(best.name) ? c : best));
    d.chef = chef.name;
    load.set(chef.name, load.get(chef.name) + 1);
  }

  if (dishes.length !== TOTAL_DISHES) throw new Error(`Seed: ${dishes.length} món, cần ${TOTAL_DISHES}.`);
  return { tags: TAGS, chefs: chefs.map(({ name, tags }) => ({ name, tags })), ingredients, dishes };
}
