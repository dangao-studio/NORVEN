/* 諾文小鎮：室內布置（體素房間）
 * 每個地點一份家具清單：[種類, u, v, 選項]
 *   u：左(0)→右(1)　v：後牆(0)→門口(1)
 *   選項 c：顏色（"owner:角色名" 用角色代表色）　rot：旋轉角度（90 = 背靠左牆）　owner：床的主人
 * theme：牆、護牆板、地板的配色；dark：不開燈只靠蠟燭；outdoor：戶外（沒有牆，地面用 ground）
 * 家具會提供位置給居民：床／吊床（睡覺）、沙發／懶骨頭／閱讀椅（休息）、餐桌（吃東西）、
 *   書桌／魔法書桌／電腦桌（讀書寫字）、工作台（修東西）、爐台／吧台／麵包窯（做菜）、鼓組（打鼓）。
 */
window.NOVUM = window.NOVUM || {};

const WOOD_DARK = { floor: [0x4A3428, 0x3E2C22, 0x54392C], seam: 0x2A1C16 };
NOVUM.interiors = {
  /* ═════════ 住處 ═════════ */
  "佐代的公寓": { theme: Object.assign({ wall: 0x3E2C3E, wall2: 0x382838, wain: 0x2E201C, trim: 0x6A1E2E, cap: 0x4A3040, curtain: 0x6A1E2E, frame: 0x2E201C }, WOOD_DARK), items: [
    ["rug", 0.5, 0.6, { c: 0x4A2A4E, c2: 0x7A1E2E, w: 1.8, d: 1.3 }],
    ["ritual", 0.28, 0.75, { r: 0.4, glow: 0xC84A5A, lightC: 0xFF7A5A }],
    ["bed", 0.12, 0.3, { owner: "佐代", c: 0x6A1E2E, frame: 0x2E201C }],
    ["skulls", 0.32, 0.0, { n: 3 }],
    ["magicdesk", 0.5, 0.02, { c: 0x3A2620 }],
    ["shelf", 0.04, 0.95, { c: 0x2E201C, rot: 90, jars: true, pal: [0x5A1E2E, 0x3A1A4A, 0x2A2A3A, 0x6A4A2A, 0xC8B898] }],
    ["sofa", 0.52, 0.86, { c: 0x6A1E2E, rot: 180, pillow: 0x4A2A4E }],
    ["clock", 0.72, 0.0, {}],
    ["hammock", 0.85, 0.3, { owner: "白", c: 0xE8E4F0, rot: 90 }],
    ["dimbox", 0.95, 0.72, { rot: -90 }],
    ["labelwall", 0.86, 0.0, {}],
    ["junk", 0.78, 0.9, {}],
    ["lamp", 0.96, 0.98, {}]
  ] },
  "神崎家": { theme: { wall: 0xF2E0E4, wain: 0xA88068 }, items: [
    ["rug", 0.5, 0.62, { c: 0xE8A8B8, w: 1.6, d: 1.2 }],
    ["bed", 0.12, 0.3, { owner: "櫻子", c: 0xF2A8C0 }],
    ["vanity", 0.34, 0.03, { c: 0xF4EAE4 }],
    ["clothes", 0.04, 0.85, { rot: 90, pal: [0xF2A8C0, 0xFFFFFF, 0x3A5A9A, 0xF4D35E, 0xE8C0E0] }],
    ["bed", 0.88, 0.3, { owner: "黑子", c: 0x3A3A44 }],
    ["bench", 0.62, 0.05, { c: 0x6B5A4A, radio: true }],
    ["toolwall", 0.62, 0.0, {}],
    ["table", 0.5, 0.82, { c: 0xE8D8C8, seats: 2, tea: true }],
    ["plant", 0.97, 0.97, { seed: 2 }]
  ] },
  "星星家": { dark: true, theme: { wall: 0x2A2238, wall2: 0x241E32, wain: 0x1E1826, trim: 0x4A1E3A, cap: 0x2E2440, curtain: 0x3A1A2A, closed: true, floor: [0x2E2430, 0x28202A, 0x342834], seam: 0x1A141C }, items: [
    ["ritual", 0.5, 0.6, { r: 0.7, glow: 0xB04AE8 }],
    ["altar", 0.5, 0.02, {}],
    ["banners", 0.5, 0.0, {}],
    ["bed", 0.12, 0.3, { owner: "星星", c: 0x4A2A5A, frame: 0x2A1E2A }],
    ["candles", 0.85, 0.12, { n: 6, power: 0.9 }],
    ["candles", 0.15, 0.92, { n: 4, power: 0.7 }],
    ["dryplant", 0.95, 0.96, {}],
    ["herbs", 0.82, 0.0, {}],
    ["starwall", 0.2, 0.0, {}],
    ["beanbag", 0.82, 0.8, { c: 0x3A2A4A }]
  ] },
  "禮的家": { dark: true, theme: { wall: 0x34302E, wall2: 0x2E2A28, wain: 0x241C18, trim: 0x3A2A22, cap: 0x3E3836, curtain: 0x2A1E1E, floor: [0x3E3028, 0x362A22, 0x44342A], seam: 0x22180E }, items: [
    ["rug", 0.5, 0.62, { c: 0x3A2A2A, c2: 0x6A5A3A, w: 1.6, d: 1.2 }],
    ["bed", 0.12, 0.3, { owner: "禮", c: 0x2E3A5A, frame: 0x241C18 }],
    ["shelf", 0.4, 0.02, { c: 0x241C18, candle: true, pal: [0x2A2A2E, 0x5A1E1E, 0x3A3A4A, 0x4A3A2A, 0xC8B898] }],
    ["shelf", 0.62, 0.02, { c: 0x241C18, seed: 4, pal: [0x2A2A2E, 0x5A1E1E, 0x3A3A4A, 0x4A3A2A, 0xC8B898] }],
    ["mount", 0.85, 0.0, {}],
    ["butterflies", 0.22, 0.0, {}],
    ["typewriter", 0.04, 0.82, { rot: 90 }],
    ["candles", 0.04, 0.66, { n: 3, y: 0.7, power: 0.8 }],
    ["record", 0.95, 0.55, { rot: -90 }],
    ["amp", 0.95, 0.82, { rot: -90 }],
    ["poster", 0.96, 0.32, { c: 0x1A1A1E, c2: 0x8E1E1E, rot: -90 }],
    ["readchair", 0.68, 0.78, { c: 0x3A2A3A, rot: 180 }],
    ["candles", 0.5, 0.78, { n: 2, power: 0.6 }]
  ] },
  "玫君的租屋": { theme: { wall: 0x3A3E48, wain: 0x2A2A33, trim: 0x6FC8C0 }, items: [
    ["rug", 0.55, 0.65, { c: 0x2A2A33, c2: 0xB8282A, w: 1.6, d: 1.2 }],
    ["bed", 0.12, 0.3, { owner: "玫君", c: 0xB8282A, frame: 0x2A2A33 }],
    ["drums", 0.62, 0.32, { c: 0xB8282A, rot: 180 }],
    ["amp", 0.86, 0.04, {}],
    ["poster", 0.4, 0.0, { c: 0x1A1A1E, c2: 0x6FC8C0 }],
    ["poster", 0.04, 0.8, { c: 0xB8282A, c2: 0x1A1A1E, rot: 90 }],
    ["sheets", 0.55, 0.72, {}],
    ["beanbag", 0.88, 0.85, { c: 0x2A2A33 }]
  ] },
  "瑞特的租屋": { theme: { wall: 0xD8DCC8, wain: 0x4E5634, trim: 0x2E3A22 }, items: [
    ["rug", 0.5, 0.65, { c: 0x4E5634, w: 1.6, d: 1.1 }],
    ["bed", 0.12, 0.3, { owner: "瑞特", c: 0x4E5634 }],
    ["tank", 0.55, 0.02, {}],
    ["rods", 0.84, 0.02, {}],
    ["lifebuoy", 0.96, 0.4, { rot: -90 }],
    ["net", 0.32, 0.0, {}],
    ["fridge", 0.96, 0.9, { rot: -90 }],
    ["table", 0.5, 0.75, { c: 0x8E6A45, seats: 2, noodle: true }],
    ["boxes", 0.06, 0.9, {}]
  ] },
  "癇癪的住處": { dark: true, theme: { wall: 0x1E222A, wall2: 0x1A1E26, wain: 0x2A2E36, trim: 0x8EEA3A, cap: 0x2A2E36, floor: [0x2A2E36, 0x30343E, 0x262A32], seam: 0x1A1E24, frame: 0x3A3F4A }, items: [
    ["ledstrip", 0.5, 0.0, { w: 4.2, y: 2.3 }],
    ["computer", 0.5, 0.04, {}],
    ["servers", 0.85, 0.04, {}],
    ["bed", 0.12, 0.3, { owner: "癇癪", c: 0x2A2E36, frame: 0x3A3F4A }],
    ["arm", 0.95, 0.6, { rot: -90 }],
    ["medkit", 0.2, 0.0, {}],
    ["cables", 0.6, 0.62, {}],
    ["gamechair", 0.25, 0.85, { rot: 180 }],
    ["rug", 0.5, 0.75, { c: 0x22262E, c2: 0x8EEA3A, w: 1.4, d: 1.0 }]
  ] },
  "ミニクイ的住處": { theme: { wall: 0xF4E4D8, wain: 0x2A9A9A, trim: 0x2E3D6B }, items: [
    ["rug", 0.5, 0.65, { c: 0xF4A8B8, w: 1.6, d: 1.2 }],
    ["bed", 0.12, 0.3, { owner: "ミニクイ", c: 0x2A9A9A }],
    ["fridge", 0.88, 0.04, {}],
    ["table", 0.5, 0.7, { c: 0xE8D0B0, seats: 2, ramen: true }],
    ["poster", 0.48, 0.0, { c: 0xD8402A, c2: 0xF4D890 }],
    ["snacks", 0.7, 0.06, {}],
    ["beanbag", 0.9, 0.85, { c: 0xF4A8B8 }]
  ] },
  "天使的閣樓": { theme: { wall: 0xF8F4EC, wain: 0xE8E0D0, trim: 0xD8C8A8 }, items: [
    ["rug", 0.5, 0.62, { c: 0xF4E8E0, c2: 0xF4D35E, w: 1.6, d: 1.2 }],
    ["bed", 0.12, 0.3, { owner: "人間天使", c: 0xFFFFFF }],
    ["beanbag", 0.85, 0.75, { c: 0xF2B5C9 }],
    ["table", 0.5, 0.72, { c: 0xF4F0E8, seats: 2, donuts: true }],
    ["clothes", 0.62, 0.04, { pal: [0xFFFFFF, 0xF4F0E8, 0xE8E4DC, 0xFFFFFF, 0xF2B5C9] }],
    ["plant", 0.04, 0.95, { seed: 5 }],
    ["chimes", 0.88, 0.0, {}]
  ] },
  "梅魯塔的塔屋": { theme: { wall: 0x3E4A4A, wain: 0x2A3436, trim: 0xA8B07A }, items: [
    ["rug", 0.5, 0.65, { c: 0x2A3436, c2: 0xA8B07A, w: 1.6, d: 1.2 }],
    ["bed", 0.12, 0.3, { owner: "梅魯塔", c: 0x2A3436 }],
    ["shelf", 0.4, 0.02, { c: 0x3B2E2A, jars: true }],
    ["perch", 0.62, 0.08, {}],
    ["cauldron", 0.7, 0.62, {}],
    ["desk", 0.88, 0.04, { c: 0x5A4632, papers: true }],
    ["herbs", 0.4, 0.0, {}],
    ["crystal", 0.04, 0.9, {}],
    ["map", 0.04, 0.6, { rot: 90 }]
  ] },
  "沙布堤亞宿舍": { theme: { wall: 0xE8EEF2, wain: 0x9DB6C4, trim: 0x5A6E7A }, items: [
    ["rug", 0.5, 0.65, { c: 0x9DB6C4, w: 1.6, d: 1.2 }],
    ["bed", 0.1, 0.3, { owner: "沏萊爾", c: 0x9DB6C4 }],
    ["desk", 0.55, 0.04, { c: 0xE8E0D0, papers: true }],
    ["shelf", 0.84, 0.02, { c: 0x8E6A45 }],
    ["sofa", 0.62, 0.86, { c: 0xA66BD6, rot: 180 }],
    ["bookpile", 0.32, 0.08, {}],
    ["plant", 0.97, 0.97, { seed: 6 }]
  ] },
  "艾比所工科宿舍": { theme: { wall: 0xDCDCDC, wain: 0x2E3D6B, trim: 0xE89AB0 }, items: [
    ["rug", 0.5, 0.65, { c: 0x2E3D6B, w: 1.6, d: 1.2 }],
    ["bed", 0.1, 0.3, { owner: "何禹瀧", c: 0x2E3D6B }],
    ["bench", 0.55, 0.05, { c: 0x5A5A62, anvil: true }],
    ["display_rack", 0.84, 0.02, {}],
    ["chimes", 0.55, 0.0, {}],
    ["desk", 0.96, 0.7, { c: 0x8E6A45, rot: -90 }],
    ["poster", 0.04, 0.82, { c: 0x2E3D6B, c2: 0xE89AB0, rot: 90 }]
  ] },

  /* ═════════ 偵探社、Hale’s Oven ═════════ */
  "史威特偵探社": { floors: [
    { name: "1樓・社辦", theme: { wall: 0xE8D3B4, wain: 0x82593A }, items: [
      ["rug", 0.42, 0.62, { c: 0x8E3E34, w: 2.8, d: 1.7 }],
      ["lights", 0.5, 0.0, { w: 4.4 }],
      ["shelf", 0.06, 0.02, { c: 0x5A3F2A, h: 2.1 }],
      ["caseboard", 0.36, 0.0, {}],
      ["fireplace", 0.86, 0.02, {}],
      ["longtable", 0.42, 0.56, { c: 0x6B4A30, chairsBack: true }],
      ["sofa", 0.92, 0.62, { c: 0xE07A3F, rot: -90 }],
      ["stairs", 0.06, 0.95, {}],
      ["plant", 0.97, 0.97, { seed: 1 }]
    ] },
    { name: "2樓・史威特的房間", match: "休息室|二樓", theme: { wall: 0xF4ECD8, wain: 0xA9C8E8, trim: 0x3E5C8A }, items: [
      ["rug", 0.5, 0.6, { c: 0xA9C8E8, c2: 0xF0CC6A, w: 1.8, d: 1.4 }],
      ["bed", 0.14, 0.3, { owner: "史威特", c: 0xF0CC6A }],
      ["desk", 0.62, 0.04, { c: 0xF4E6D8 }],
      ["shelf", 0.9, 0.02, { c: 0xE8C9A6 }],
      ["clippings", 0.38, 0.0, {}],
      ["table", 0.62, 0.8, { c: 0xFFFFFF, seats: 2, cake: true }],
      ["stairs", 0.06, 0.95, {}],
      ["lamp", 0.97, 0.97, {}]
    ] }
  ] },
  "Hale’s Oven": { floors: [
    { name: "1樓・餐館", theme: { wall: 0xF0DCC0, wain: 0x8E5A3A, trim: 0x5A3B26 }, items: [
      ["oven", 0.84, 0.03, {}],
      ["pans", 0.58, 0.0, {}],
      ["breadrack", 0.32, 0.02, {}],
      ["menuboard", 0.06, 0.0, {}],
      ["counter", 0.5, 0.36, { c: 0x8E5A3A, low: true, register: true }],
      ["table", 0.34, 0.84, { c: 0x9C6B45, seats: 2 }],
      ["table", 0.76, 0.76, { c: 0x9C6B45, seats: 4, bowls: true }],
      ["stairs", 0.06, 0.95, {}],
      ["catbed", 0.96, 0.96, {}],
      ["lamp", 0.96, 0.4, {}]
    ] },
    { name: "2樓・海爾的住處", match: "住處|後屋|帳本", theme: { wall: 0xE8D8C0, wain: 0x6B4E3A }, items: [
      ["rug", 0.5, 0.62, { c: 0xA8502A, w: 1.8, d: 1.3 }],
      ["bed", 0.16, 0.3, { owner: "海爾", c: 0xA8502A }],
      ["shelf", 0.58, 0.02, { c: 0x6B4E3A }],
      ["breadrack", 0.82, 0.02, {}],
      ["table", 0.62, 0.74, { c: 0x8E6A45, seats: 2, tea: true }],
      ["plant", 0.97, 0.12, { seed: 4 }],
      ["stairs", 0.06, 0.95, {}]
    ] }
  ] },
  "諾文甜點店": { theme: { wall: 0xF8E0E6, wain: 0xF2B5C9, trim: 0xE8A87C }, items: [
    ["display", 0.35, 0.06, { items: [0xF2B5C9, 0xE8A87C, 0xF4E1A6], light: true }],
    ["counter", 0.75, 0.08, { c: 0xF4E4E8, register: true }],
    ["table", 0.22, 0.74, { c: 0xF7E3E8, seats: 2, donuts: true }],
    ["table", 0.72, 0.68, { c: 0xF7E3E8, seats: 2, cake: true }],
    ["poster", 0.06, 0.0, { c: 0xF2B5C9, c2: 0xFFFFFF }],
    ["plant", 0.97, 0.97, { seed: 7 }]
  ] },

  /* ═════════ 學校 ═════════ */
  "沙布堤亞大學": { theme: { wall: 0xE8E0D0, wain: 0x6B4E3A }, items: [
    ["classroom", 0.5, 0.56, { c: 0x8E6A45, rows: 2, cols: 3 }],
    ["podium", 0.86, 0.14, {}],
    ["shelf", 0.03, 0.02, { c: 0x5A4632 }],
    ["shelf", 0.97, 0.02, { c: 0x5A4632, seed: 3 }],
    ["globe", 0.04, 0.9, {}]
  ] },
  "艾比所高中": { theme: { wall: 0xE8ECEE, wain: 0x6A7A8A }, items: [
    ["classroom", 0.36, 0.58, { c: 0x9C7A55 }],
    ["drums", 0.88, 0.6, { c: 0xB8282A, rot: -90 }],
    ["amp", 0.96, 0.9, { rot: -90 }],
    ["lockers", 0.92, 0.02, {}]
  ] },
  "蓋亞中學": { theme: { wall: 0xF0EAD8, wain: 0x7A8A6A }, items: [
    ["classroom", 0.5, 0.56, { c: 0xB5957A }],
    ["podium", 0.86, 0.14, {}],
    ["lockers", 0.06, 0.02, {}],
    ["board", 0.97, 0.5, { rot: -90 }]
  ] },
  "城東學區": { theme: { wall: 0xF0EAD8, wain: 0x8A7A6A }, items: [
    ["classroom", 0.5, 0.56, { c: 0xB5957A }],
    ["podium", 0.86, 0.14, {}],
    ["board", 0.06, 0.0, {}],
    ["plant", 0.97, 0.97, { seed: 8 }]
  ] },

  /* ═════════ 資料區 ═════════ */
  "諾文聯邦圖書館": { theme: { wall: 0xE8DCC4, wain: 0x5A4632 }, items: [
    ["shelf", 0.08, 0.02, { c: 0x5A4632, h: 2.1 }], ["shelf", 0.3, 0.02, { c: 0x5A4632, h: 2.1, seed: 2 }],
    ["shelf", 0.52, 0.02, { c: 0x5A4632, h: 2.1, seed: 5 }], ["shelf", 0.74, 0.02, { c: 0x5A4632, h: 2.1, seed: 8 }],
    ["ladder", 0.63, 0.12, {}],
    ["longtable", 0.42, 0.66, { c: 0x6B4A30 }],
    ["counter", 0.9, 0.6, { c: 0x6B4A30, rot: -90 }]
  ] },
  "諾文聯邦資料館": { theme: { wall: 0xDCDCD4, wain: 0x5A6070 }, items: [
    ["filing", 0.06, 0.02, {}], ["filing", 0.18, 0.02, {}],
    ["shelf", 0.4, 0.02, { c: 0x6A7078 }], ["shelf", 0.6, 0.02, { c: 0x6A7078, seed: 6 }],
    ["longtable", 0.45, 0.66, { c: 0x5A5E66 }],
    ["boxes", 0.9, 0.08, {}], ["boxes", 0.94, 0.9, {}]
  ] },
  "諾文古神話展館": { theme: { wall: 0xE8E0D0, wain: 0x8A7A5A, trim: 0xD8B04A }, items: [
    ["display", 0.22, 0.3, { items: [0xD8B04A, 0x8A6A4A, 0x6A8AA8], light: true }],
    ["display", 0.5, 0.3, { items: [0xC8C0B0, 0xD8B04A, 0x8A4E3A], light: true }],
    ["display", 0.78, 0.3, { items: [0x6A8A5A, 0xD8B04A, 0xE8DCC8], light: true }],
    ["statue", 0.06, 0.06, {}], ["statue", 0.94, 0.06, {}],
    ["bench2", 0.5, 0.82, { c: 0x6B5A4A }],
    ["sign", 0.3, 0.7, { c: 0x5A4632 }]
  ] },

  /* ═════════ 街區與工坊 ═════════ */
  "諾文機械工作坊": { theme: { wall: 0xC8C4BC, wain: 0x5A5E66 }, items: [
    ["bench", 0.25, 0.05, { c: 0x5A5A62, radio: true }], ["bench", 0.62, 0.05, { c: 0x5A5A62 }],
    ["toolwall", 0.25, 0.0, {}], ["toolwall", 0.62, 0.0, {}],
    ["parts", 0.9, 0.02, {}], ["welder", 0.94, 0.6, {}],
    ["table", 0.45, 0.72, { c: 0x6B5A4A, seats: 2 }]
  ] },
  "諾文科技維修站": { theme: { wall: 0xD8DCE0, wain: 0x4A6E8A }, items: [
    ["counter", 0.35, 0.14, { c: 0x4A6E8A, register: true }],
    ["radios", 0.35, 0.0, {}],
    ["bench", 0.75, 0.08, { c: 0x5A5A62, radio: true }],
    ["parts", 0.95, 0.02, {}],
    ["boxes", 0.06, 0.9, {}]
  ] },
  "諾文混合書街": { theme: { wall: 0xE8DCC4, wain: 0x5A4632 }, items: [
    ["shelf", 0.08, 0.02, { c: 0x5A4632 }], ["shelf", 0.28, 0.02, { c: 0x5A4632, seed: 3 }], ["shelf", 0.48, 0.02, { c: 0x5A4632, seed: 7 }],
    ["counter", 0.8, 0.12, { c: 0x6B4A30, register: true }],
    ["bookpile", 0.3, 0.6, { seed: 2 }], ["bookpile", 0.6, 0.7, { seed: 5 }],
    ["readchair", 0.85, 0.75, { c: 0x8E3E34, rot: -90 }]
  ] },
  "諾文古籍巷": { dark: true, theme: { wall: 0x3E3430, wain: 0x2A201A, floor: [0x4A3A2E, 0x423226, 0x52402E], seam: 0x2A1E16 }, items: [
    ["shelf", 0.1, 0.02, { c: 0x3B2E2A, candle: true, pal: [0x5A1E1E, 0x3A2A1E, 0x6A5A3A, 0xC8B898] }],
    ["scrolls", 0.35, 0.02, {}],
    ["shelf", 0.6, 0.02, { c: 0x3B2E2A, seed: 4, pal: [0x5A1E1E, 0x3A2A1E, 0x6A5A3A, 0xC8B898] }],
    ["map", 0.85, 0.0, {}],
    ["candle", 0.88, 0.5, {}],
    ["counter", 0.5, 0.66, { c: 0x3B2E2A }],
    ["candles", 0.3, 0.68, { n: 3, y: 0.8, power: 0.7 }]
  ] },
  "諾文服飾街": { theme: { wall: 0xF4ECE4, wain: 0xC2455A }, items: [
    ["clothes", 0.2, 0.28, {}], ["clothes", 0.45, 0.28, { pal: [0x2F5D50, 0xE8DCC8, 0xC2455A, 0x4A6FA5, 0xF2C14E] }], ["clothes", 0.2, 0.62, { pal: [0xF2B5C9, 0xFFFFFF, 0xA9C8E8, 0xE8C0E0, 0xF4D35E] }],
    ["fitting", 0.9, 0.2, {}],
    ["mirror", 0.7, 0.0, {}],
    ["mannequin", 0.06, 0.08, { c: 0x4A6FA5 }], ["mannequin", 0.55, 0.7, { c: 0xC2455A }],
    ["counter", 0.82, 0.78, { c: 0xE8DCC8, rot: -90, register: true }]
  ] },
  "メクタ・改裝街": { theme: { wall: 0x9A9EA6, wain: 0x4A4E56, trim: 0xF4D35E }, items: [
    ["bench", 0.22, 0.05, { c: 0x4A4E56 }], ["toolwall", 0.22, 0.0, {}],
    ["parts", 0.5, 0.02, {}],
    ["counter", 0.8, 0.14, { c: 0x5A5E66, register: true }],
    ["machine", 0.3, 0.68, {}], ["welder", 0.62, 0.72, {}]
  ] },
  "メクタ・材料街": { theme: { wall: 0xB8B0A0, wain: 0x6A5A4A }, items: [
    ["crates", 0.2, 0.3, {}], ["crates", 0.5, 0.15, {}], ["crates", 0.2, 0.75, {}],
    ["parts", 0.82, 0.02, {}],
    ["counter", 0.75, 0.62, { c: 0x6B5A4A, register: true }]
  ] },
  "諾文舊街": { theme: { wall: 0xD8C8B0, wain: 0x6B5A4A }, items: [
    ["counter", 0.3, 0.2, { c: 0x6B5A4A, register: true }],
    ["shelf", 0.75, 0.02, { c: 0x6B4A30, jars: true }],
    ["bench2", 0.6, 0.8, { c: 0x6B5A4A }],
    ["sign", 0.06, 0.06, { c: 0x8A4E3A }],
    ["plant", 0.97, 0.97, { seed: 9 }]
  ] },
  "諾文轉角騎樓": { outdoor: true, theme: { ground: "tile" }, items: [
    ["newsstand", 0.25, 0.1, {}], ["trash", 0.42, 0.06, {}],
    ["vending", 0.05, 0.38, { rot: 90 }], ["vending", 0.05, 0.52, { rot: 90 }], ["claw", 0.05, 0.68, { rot: 90 }],
    ["bike", 0.68, 0.08, {}], ["bike", 0.78, 0.08, {}], ["bike", 0.88, 0.08, {}],
    ["bench2", 0.45, 0.5, { c: 0x6B5A4A }], ["bench2", 0.72, 0.5, { c: 0x6B5A4A }],
    ["plant", 0.3, 0.5, { seed: 2 }], ["plant", 0.88, 0.5, { seed: 5 }],
    ["streetlamp", 0.95, 0.85, {}], ["streetlamp", 0.08, 0.85, {}]
  ] },
  "諾文石造街區": { outdoor: true, theme: { ground: "stone" }, items: [
    ["well", 0.5, 0.4, {}],
    ["bench2", 0.24, 0.42, { c: 0x8C8478, rot: 90 }], ["bench2", 0.76, 0.42, { c: 0x8C8478, rot: -90 }],
    ["stonelamp", 0.32, 0.18, {}], ["stonelamp", 0.68, 0.18, {}], ["stonelamp", 0.32, 0.66, {}], ["stonelamp", 0.68, 0.66, {}],
    ["tree", 0.08, 0.1, { seed: 3 }], ["tree", 0.92, 0.1, { seed: 6 }],
    ["bush", 0.05, 0.55, {}], ["bush", 0.95, 0.55, {}],
    ["crates", 0.9, 0.8, {}], ["plant", 0.1, 0.82, { seed: 4 }]
  ] },
  "佩洛・塗鴉街": { outdoor: true, theme: { ground: "asphalt" }, items: [
    ["graffiti", 0.5, 0.0, {}],
    ["crates", 0.08, 0.22, {}], ["boxes", 0.16, 0.32, {}],
    ["spray", 0.32, 0.14, {}], ["amp", 0.7, 0.16, {}],
    ["beanbag", 0.42, 0.48, { c: 0x8EEA3A }], ["beanbag", 0.58, 0.48, { c: 0xFF4AC8 }],
    ["trash", 0.92, 0.18, {}], ["bike", 0.12, 0.8, {}],
    ["streetlamp", 0.95, 0.85, {}]
  ] },
  "諾文立體街廊": { outdoor: true, theme: { ground: "tile" }, items: [
    ["stairs", 0.06, 0.25, {}],
    ["bunting", 0.5, 0.0, {}],
    ["plant", 0.3, 0.06, { seed: 2 }], ["plant", 0.5, 0.06, { seed: 7 }], ["plant", 0.7, 0.06, { seed: 4 }],
    ["bench2", 0.38, 0.45, { c: 0x6F8090 }], ["bench2", 0.62, 0.45, { c: 0x6F8090 }],
    ["vending", 0.95, 0.25, { rot: -90 }], ["vending", 0.95, 0.4, { rot: -90 }], ["arcade", 0.95, 0.56, { rot: -90 }],
    ["streetlamp", 0.2, 0.85, {}], ["streetlamp", 0.8, 0.85, {}]
  ] },

  /* ═════════ 戶外 ═════════ */
  "諾文鐘塔廣場": { outdoor: true, theme: { ground: "stone" }, items: [
    ["clocktower", 0.5, 0.42, { big: true }],
    ["bench2", 0.5, 0.6, { c: 0x6B5A4A }], ["bench2", 0.5, 0.24, { c: 0x6B5A4A, rot: 180 }],
    ["bench2", 0.28, 0.42, { c: 0x6B5A4A, rot: 90 }], ["bench2", 0.72, 0.42, { c: 0x6B5A4A, rot: -90 }],
    ["streetlamp", 0.32, 0.28, {}], ["streetlamp", 0.68, 0.28, {}], ["streetlamp", 0.32, 0.56, {}], ["streetlamp", 0.68, 0.56, {}],
    ["flowers", 0.42, 0.32, {}], ["flowers", 0.58, 0.32, {}], ["flowers", 0.42, 0.52, {}], ["flowers", 0.58, 0.52, {}],
    ["tree", 0.06, 0.05, { seed: 1 }], ["tree", 0.94, 0.05, { seed: 2 }], ["tree", 0.06, 0.3, { seed: 3 }], ["tree", 0.94, 0.3, { seed: 4 }],
    ["tree", 0.06, 0.55, { seed: 5 }], ["tree", 0.94, 0.55, { seed: 6 }], ["tree", 0.06, 0.8, { seed: 7 }], ["tree", 0.94, 0.8, { seed: 8 }],
    ["fountain", 0.5, 0.8, {}],
    ["bench2", 0.36, 0.8, { c: 0x6B5A4A, rot: 90 }], ["bench2", 0.64, 0.8, { c: 0x6B5A4A, rot: -90 }],
    ["newsstand", 0.82, 0.94, {}], ["hydrant", 0.18, 0.94, {}]
  ] },
  "諾文公園": { outdoor: true, theme: { ground: "grass" }, items: [
    ["path", 0.5, 0.5, { w: 1.4, d: 10.6 }],
    ["fountain", 0.5, 0.42, {}],
    ["tree", 0.1, 0.08, { seed: 1 }], ["tree", 0.9, 0.08, { seed: 2 }], ["tree", 0.1, 0.66, { seed: 3 }], ["tree", 0.9, 0.66, { seed: 4 }],
    ["bench2", 0.27, 0.42, { c: 0x6B5A4A, rot: 90 }], ["bench2", 0.73, 0.42, { c: 0x6B5A4A, rot: -90 }],
    ["flowers", 0.34, 0.22, {}], ["flowers", 0.66, 0.22, {}], ["flowers", 0.34, 0.62, {}], ["flowers", 0.66, 0.62, {}],
    ["bush", 0.05, 0.38, {}], ["bush", 0.95, 0.38, {}],
    ["streetlamp", 0.4, 0.85, {}], ["streetlamp", 0.6, 0.85, {}],
    ["swing", 0.2, 0.84, {}], ["picnic", 0.8, 0.85, {}]
  ] },
  "諾文生活區": { outdoor: true, theme: { ground: "tile" }, items: [
    ["board", 0.5, 0.0, {}],
    ["bike", 0.12, 0.08, {}], ["bike", 0.2, 0.08, {}], ["bike", 0.28, 0.08, {}],
    ["newsstand", 0.76, 0.1, {}],
    ["vending", 0.95, 0.32, { rot: -90 }], ["vending", 0.95, 0.46, { rot: -90 }],
    ["bench2", 0.35, 0.45, { c: 0x6B5A4A }], ["bench2", 0.62, 0.45, { c: 0x6B5A4A }],
    ["tree", 0.1, 0.62, { seed: 5 }], ["flowers", 0.5, 0.62, {}],
    ["trash", 0.85, 0.62, {}], ["hydrant", 0.92, 0.82, {}],
    ["streetlamp", 0.95, 0.85, {}]
  ] },
  "諾文夜市": { outdoor: true, theme: { ground: "asphalt" }, items: [
    ["stall", 0.1, 0.06, { c: 0xD8402A, seed: 0 }], ["stall", 0.36, 0.06, { c: 0x2A9A9A, seed: 1 }],
    ["stall", 0.64, 0.06, { c: 0xF4A040, seed: 2 }], ["stall", 0.9, 0.06, { c: 0xE07A96, seed: 3 }],
    ["stall", 0.1, 0.99, { c: 0x3E6A9A, seed: 4, rot: 180 }], ["stall", 0.36, 0.99, { c: 0x5A9A4A, seed: 5, rot: 180 }],
    ["stall", 0.64, 0.99, { c: 0xD8402A, seed: 6, rot: 180 }], ["stall", 0.9, 0.99, { c: 0xF4A040, seed: 7, rot: 180 }],
    ["lanterns", 0.5, 0.5, {}],
    ["table", 0.25, 0.5, { c: 0xC8B088, seats: 2, ramen: true }],
    ["table", 0.75, 0.5, { c: 0xC8B088, seats: 2, bowls: true }]
  ] },
  "諾文舊物市場": { outdoor: true, theme: { ground: "stone" }, items: [
    ["stall", 0.2, 0.12, { c: 0x8A6A4A, seed: 3 }], ["stall", 0.5, 0.12, { c: 0x6A4A6A, seed: 1 }], ["stall", 0.8, 0.12, { c: 0x4A6A5A, seed: 5 }],
    ["clock", 0.5, 0.0, {}],
    ["crates", 0.05, 0.3, {}], ["boxes", 0.06, 0.42, {}], ["crates", 0.95, 0.3, {}], ["record", 0.94, 0.42, { rot: -90 }],
    ["bench2", 0.38, 0.55, { c: 0x6B5A4A }], ["bench2", 0.62, 0.55, { c: 0x6B5A4A }],
    ["tree", 0.1, 0.72, { seed: 7 }], ["tree", 0.9, 0.72, { seed: 8 }],
    ["stonelamp", 0.3, 0.85, {}], ["stonelamp", 0.7, 0.85, {}]
  ] },
  "諾文河岸步道": { outdoor: true, theme: { ground: "grass" }, items: [
    ["water", 0.5, 0.1, { w: 10.6, d: 1.8 }],
    ["path", 0.5, 0.42, { w: 10.6, d: 1.4, c: 0xC8B898 }],
    ["bench2", 0.3, 0.3, { c: 0x6B5A4A, rot: 180 }], ["bench2", 0.7, 0.3, { c: 0x6B5A4A, rot: 180 }],
    ["streetlamp", 0.12, 0.3, {}], ["streetlamp", 0.5, 0.3, {}], ["streetlamp", 0.88, 0.3, {}],
    ["rocks", 0.06, 0.22, {}], ["rocks", 0.94, 0.22, {}],
    ["tree", 0.12, 0.72, { seed: 4 }], ["tree", 0.88, 0.72, { seed: 5 }],
    ["flowers", 0.35, 0.66, {}], ["flowers", 0.65, 0.66, {}], ["bush", 0.5, 0.7, {}],
    ["viewer", 0.62, 0.2, { rot: 180 }], ["picnic", 0.22, 0.58, {}]
  ] },
  "諾文地下湖": { dark: true, outdoor: true, theme: { ground: "cave" }, items: [
    ["water", 0.5, 0.3, { w: 16.4, d: 7.6 }],
    ["dock", 0.46, 0.5, { l: 3.6 }],
    ["rocks", 0.03, 0.62, {}], ["rocks", 0.96, 0.66, {}], ["rocks", 0.97, 0.08, {}], ["rocks", 0.04, 0.06, {}], ["rocks", 0.25, 0.6, {}],
    ["rods", 0.58, 0.66, {}],
    ["net", 0.18, 0.86, {}],
    ["stonelamp", 0.32, 0.7, {}], ["stonelamp", 0.78, 0.7, {}], ["candles", 0.66, 0.84, { n: 3, power: 0.6 }],
    ["bench2", 0.44, 0.82, { c: 0x5A4632 }]
  ] },
  "諾文轉運站": { outdoor: true, theme: { ground: "tile" }, items: [
    ["rails", 0.5, 0.0, { w: 11.2 }],
    ["platform", 0.5, 0.2, { w: 10.6, d: 1.4 }],
    ["bench2", 0.28, 0.42, { c: 0x4A6E8A }], ["bench2", 0.55, 0.42, { c: 0x4A6E8A }],
    ["vending", 0.88, 0.42, {}], ["trash", 0.72, 0.44, {}],
    ["board", 0.05, 0.55, { rot: 90 }],
    ["plant", 0.4, 0.78, { seed: 2 }],
    ["streetlamp", 0.1, 0.85, {}], ["streetlamp", 0.9, 0.85, {}]
  ] },
  "諾文舊站": { outdoor: true, theme: { ground: "stone" }, items: [
    ["rails", 0.5, 0.0, { w: 11.2 }],
    ["platform", 0.5, 0.2, { w: 10.6, d: 1.4 }],
    ["clock", 0.8, 0.0, {}],
    ["bench2", 0.42, 0.42, { c: 0x5A4632 }], ["bench2", 0.68, 0.42, { c: 0x5A4632 }],
    ["stonelamp", 0.15, 0.42, {}], ["stonelamp", 0.9, 0.42, {}],
    ["crates", 0.12, 0.8, {}], ["boxes", 0.22, 0.82, {}],
    ["sign", 0.75, 0.85, { c: 0x5A4632 }]
  ] },
  "諾文機械市集": { outdoor: true, theme: { ground: "asphalt" }, items: [
    ["stall", 0.2, 0.12, { c: 0x5A6A7A, seed: 2 }], ["machine", 0.5, 0.14, {}], ["stall", 0.8, 0.12, { c: 0xB8903A, seed: 0 }],
    ["gears", 0.5, 0.0, {}],
    ["crates", 0.08, 0.5, {}], ["boxes", 0.16, 0.58, {}],
    ["welder", 0.4, 0.52, {}], ["tank", 0.62, 0.52, {}],
    ["parts", 0.95, 0.5, { rot: -90 }],
    ["lanterns", 0.5, 0.35, {}],
    ["streetlamp", 0.08, 0.85, {}], ["streetlamp", 0.92, 0.85, {}]
  ] }
};
