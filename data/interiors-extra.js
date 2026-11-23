/* 諾文小鎮：房間的補充布置（接在 data/interiors.js 後面）
 * size：房間大小 [寬, 深]（公尺）　cut：右後角切掉 [寬, 深]，變成 L 形
 * t：牆和地板（wallPat 壁紙花紋、wall3 花紋顏色、floorPat 地板花紋、floor 地板三色、seam 縫、lampC 主燈顏色、shade 燈罩、ceil 天花板高、wainH 護牆板高）
 * add：再放進去的家具，沒寫位置的會自動找空位（靠牆的貼牆，其他找地板空地）
 * 壁紙：stripe pin dots check diamond brick panel wave star　地板：plank tile check herring carpet stone concrete */
(function () {
  const N = window.NOVUM;
  // 燈光以暖色為主、飽和度高一點；冷白光只留給現代的地方（癇癪家、科技維修站、研究展示區、工科宿舍）
  const WARM = 0xFFB060, COZY = 0xFF9E4A, WHITE = 0xFFC078, COOL = 0xC8DCFF, PINK = 0xFF9EB8, MINT = 0x9CFFC8, PURPLE = 0xC08CFF, AMBER = 0xFF9040;
  const X = {
    /* ── 住處 ── */
    "佐代的公寓": { size: [7.5, 6.5], t: { wallPat: "diamond", wall3: 0x4A2E44, floorPat: "herring", lampC: 0xE8A8C8 }, add: ["crystal", [{ seed: 7 }]] },
    "神崎家": { size: [7.5, 6], t: { wallPat: "dots", wall3: 0xFFFFFF, floorPat: "plank", lampC: PINK }, add: ["shelf", "poster"] },
    "星星家": { size: [6.5, 6], cut: [2, 1.6], t: { wallPat: "star", wall3: 0x8A6AB8, floorPat: "carpet", lampC: 0xC8A0FF }, add: ["skulls", "crystal", "scrolls"] },
    "禮的家": { size: [7, 6], t: { wallPat: "pin", wall3: 0x2E3A4E, floorPat: "herring" }, add: ["globe"] },
    "玫君的租屋": { size: [6.5, 5.5], t: { wallPat: "brick", wall3: 0x2E2A36, floorPat: "concrete", floor: [0x6E6A70, 0x625E66, 0x76727A], seam: 0x4A464E, lampC: 0xFFB0B0 }, add: ["record", "clothes", "mirror"] },
    "瑞特的租屋": { size: [7, 6], cut: [1.8, 1.8], t: { wallPat: "panel", wall3: 0xC8BCA0, floorPat: "plank", lampC: WARM }, add: ["shelf", "map", "readchair"] },
    "癇癪的住處": { size: [7, 5.5], t: { wallPat: "check", wall3: 0x24303C, floorPat: "tile", floor: [0x2E3440, 0x262C36, 0x343A46], seam: 0x1A1E26, lampC: MINT }, add: ["radios"] },
    "ミニクイ的住處": { size: [6.5, 5.5], t: { wallPat: "stripe", wall3: 0xFFF2F6, floorPat: "plank", lampC: PINK }, add: ["shelf", "poster"] },
    "天使的閣樓": { size: [6.5, 5.5], cut: [1.8, 1.4], t: { wallPat: "dots", wall3: 0xE8E0F4, floorPat: "plank", lampC: 0xFFF0D0, ceil: 2.4 }, add: ["shelf", "readchair", "mirror"] },
    "梅魯塔的塔屋": { size: [7.5, 7], t: { wallPat: "brick", wall3: 0x2E2234, floorPat: "stone", floor: [0x5A5248, 0x4E4840, 0x625A50], seam: 0x3A342E, lampC: PURPLE, ceil: 3.0 }, add: ["shelf", "globe", "telescope", "scrolls", "readchair"] },
    "沙布堤亞宿舍": { size: [6.5, 5.5], t: { wallPat: "pin", wall3: 0xDCE4EC, floorPat: "plank", lampC: WHITE }, add: ["clothes", "poster"] },
    "艾比所工科宿舍": { size: [6.5, 5.5], t: { wallPat: "check", wall3: 0xC8D0D8, floorPat: "tile", lampC: COOL }, add: ["radios", "shelf"] },
    /* ── 店家、工作的地方 ── */
    "史威特偵探社#0": { size: [9.5, 7.5], cut: [2.2, 1.6], t: { wallPat: "stripe", wall3: 0xE0D4B4, floorPat: "herring", lampC: AMBER }, add: ["filing", "filing", "typewriter", "globe", "record", "readchair", "map"] },
    "史威特偵探社#1": { size: [8, 6.5], t: { wallPat: "dots", wall3: 0xFFFFFF, floorPat: "plank", lampC: PINK }, add: ["vanity", "clothes", "mirror", "poster"] },
    "Hale’s Oven#0": { size: [10, 7.5], t: { wallPat: "brick", wall3: 0xE4D0B0, floorPat: "check", floor: [0x6E4A30, 0xE4D4BC, 0x6E4A30], lampC: COZY }, add: [["table", { seats: 2, tea: true }], ["table", { seats: 4, bowls: true }], "board", "herbs", "fridge"] },
    "Hale’s Oven#1": { size: [8, 6.5], t: { wallPat: "panel", wall3: 0xD8C8A8, floorPat: "plank", lampC: WARM }, add: ["sofa", "record", "clothes"] },
    "諾文甜點店": { size: [9, 7], t: { wallPat: "stripe", wall3: 0xFFFFFF, floorPat: "check", floor: [0xF4E8EC, 0xE8B8C8, 0xF4E8EC], seam: 0xD8A8B8, lampC: PINK }, add: [["table", { seats: 2, cake: true }], ["table", { seats: 2, donuts: true }], "display", "board"] },
    "沙布堤亞大學": { size: [11, 8.5], t: { wallPat: "panel", wall3: 0xDCD0B8, floorPat: "herring", lampC: WHITE, ceil: 3.0 }, add: ["shelf", "board", "globe", "map", "filing"] },
    "艾比所高中": { size: [10, 8], t: { wallPat: "pin", wall3: 0xE4ECE4, floorPat: "tile", floor: [0xB8B0A0, 0xACA494, 0xC4BCAC], lampC: WHITE }, add: ["board", "poster", "shelf", "clock"] },
    "蓋亞中學": { size: [10, 8], t: { wallPat: "check", wall3: 0xF4EEE0, floorPat: "plank", lampC: WHITE }, add: ["shelf", "poster", "clock", "map"] },
    "城東學區": { size: [10, 8], t: { wallPat: "dots", wall3: 0xFFFFFF, floorPat: "tile", lampC: WHITE }, add: ["shelf", "lockers", "poster", "clock", "globe"] },
    "諾文聯邦圖書館": { size: [11, 8.5], t: { wallPat: "panel", wall3: 0xD8CCB0, floorPat: "carpet", floor: [0x7A3A34, 0x6A3029, 0x84423A], seam: 0x5A2824, lampC: AMBER, ceil: 3.2 }, add: ["shelf", "shelf", "readchair", "readchair", "globe", "desk"] },
    "諾文聯邦資料館": { size: [10, 8], cut: [2.4, 2], t: { wallPat: "pin", wall3: 0xC8D0D8, floorPat: "tile", floor: [0xA8ACB0, 0x9CA0A4, 0xB4B8BC], lampC: AMBER }, add: ["filing", "filing", "desk", "typewriter"] },
    "諾文古神話展館": { size: [11, 8.5], t: { wallPat: "brick", wall3: 0xD8CCB4, floorPat: "stone", floor: [0xD8D0C0, 0xC8C0B0, 0xE0D8C8], seam: 0xA8A090, lampC: 0xFFE8C0, ceil: 3.4 }, add: ["statue", "display", "scrolls", "stonelamp", "stonelamp", "bench2"] },
    "諾文機械工作坊": { size: [10, 8], t: { wallPat: "brick", wall3: 0x8A8478, floorPat: "concrete", floor: [0x8A8A86, 0x7E7E7A, 0x96968E], seam: 0x6A6A66, lampC: 0xFFE0A0 }, add: ["machine", "radios"] },
    "諾文科技維修站": { size: [9, 7], t: { wallPat: "check", wall3: 0xC8D4E0, floorPat: "tile", floor: [0xC8CCD0, 0xBCC0C4, 0xD4D8DC], lampC: COOL }, add: ["computer", "radios", "shelf", "lockers"] },
    "諾文混合書街": { size: [10, 7.5], cut: [2, 1.8], t: { wallPat: "panel", wall3: 0xC8B898, floorPat: "plank", lampC: AMBER }, add: ["shelf", "readchair", "globe"] },
    "諾文古籍巷": { size: [9, 7], t: { wallPat: "brick", wall3: 0x3A2A22, floorPat: "stone" }, add: ["scrolls", "globe", "map"] },
    "諾文服飾街": { size: [10, 7.5], t: { wallPat: "stripe", wall3: 0xFFFFFF, floorPat: "herring", lampC: 0xFFF0E0 }, add: ["clothes", "mirror", "mannequin", "vanity"] },
    "メクタ・改裝街": { size: [10, 8], t: { wallPat: "brick", wall3: 0x5A5048, floorPat: "concrete", lampC: 0xFFD080 }, add: ["radios", "tank"] },
    "メクタ・材料街": { size: [10, 8], t: { wallPat: "panel", wall3: 0x8A7A68, floorPat: "concrete", lampC: 0xFFE0B0 }, add: ["shelf", "tank", "machine"] },
    "諾文舊街": { size: [9, 7], cut: [2, 1.6], t: { wallPat: "wave", wall3: 0xC8B49A, floorPat: "stone", floor: [0xB4A894, 0xA89C88, 0xC0B4A0], seam: 0x8E8270, lampC: AMBER }, add: ["clock", "record", "shelf", "readchair", "map"] },
    /* ── 戶外 ── */
    "諾文轉角騎樓": { size: [11.2, 11.2], noGen: true, add: [] },
    "諾文石造街區": { size: [11.2, 11.2], noGen: true, add: [] },
    "佩洛・塗鴉街": { size: [11.2, 11.2], noGen: true, add: [] },
    "諾文立體街廊": { size: [11.2, 11.2], noGen: true, add: [] },
    "諾文鐘塔廣場": { size: [22.4, 33.6], noGen: true, add: [] },
    "諾文公園": { size: [11.2, 11.2], noGen: true, add: [] },
    "諾文生活區": { size: [11.2, 11.2], noGen: true, add: [] },
    "諾文夜市": { size: [13, 8.6], noGen: true, noFloor: true, add: [] },
    "諾文舊物市場": { size: [11.2, 11.2], noGen: true, add: [] },
    "諾文河岸步道": { size: [11.2, 11.2], noGen: true, add: [] },
    "諾文地下湖": { size: [18, 14], add: ["rocks", "crystal", "crystal", "stonelamp", "rocks"] },
    "諾文轉運站": { size: [11.2, 11.2], noGen: true, add: [] },
    "諾文舊站": { size: [11.2, 11.2], noGen: true, add: [] },
    "諾文機械市集": { size: [11.2, 11.2], noGen: true, add: [] }
  };
  // 之前還沒有房間的地方
  N.interiors["佩洛・表演廣場"] = { outdoor: true, theme: { ground: "asphalt" }, items: [
    ["platform", 0.5, 0.14, { c: 0x3D3555, w: 7.0, d: 2.4 }], ["amp", 0.22, 0.1, {}], ["amp", 0.78, 0.1, {}], ["drums", 0.5, 0.08, {}], ["lights", 0.5, 0.0, {}],
    ["bench2", 0.32, 0.5, {}], ["bench2", 0.5, 0.5, {}], ["bench2", 0.68, 0.5, {}],
    ["bench2", 0.32, 0.66, {}], ["bench2", 0.5, 0.66, {}], ["bench2", 0.68, 0.66, {}],
    ["graffiti", 0.03, 0.45, { rot: 90 }], ["vending", 0.95, 0.45, { rot: -90 }],
    ["streetlamp", 0.06, 0.85, {}], ["streetlamp", 0.94, 0.85, {}]] };
  X["佩洛・表演廣場"] = { size: [11.2, 11.2], noGen: true, add: [] };
  N.interiors["維塔・草藥市集"] = { outdoor: true, theme: { ground: "grass" }, items: [
    ["stall", 0.25, 0.12, { c: 0x5E8A58 }], ["stall", 0.75, 0.12, { c: 0xC0603F }], ["herbs", 0.5, 0.02, {}],
    ["dryplant", 0.06, 0.04, {}], ["dryplant", 0.94, 0.04, {}],
    ["lanterns", 0.5, 0.35, {}],
    ["well", 0.12, 0.6, {}], ["bench2", 0.5, 0.55, {}],
    ["flowers", 0.3, 0.45, {}], ["flowers", 0.7, 0.45, {}],
    ["tree", 0.9, 0.66, { seed: 9 }], ["plant", 0.35, 0.82, { seed: 3 }], ["plant", 0.65, 0.82, { seed: 6 }]] };
  X["維塔・草藥市集"] = { size: [11.2, 11.2], noGen: true, add: [] };
  N.interiors["奧克托拉・研究展示區"] = { theme: { wall: 0xE4ECF0, wain: 0x6E8494, trim: 0x3A4A58 }, items: [
    ["display", 0.2, 0.05, {}], ["display", 0.55, 0.05, {}], ["machine", 0.85, 0.2, {}], ["telescope", 0.15, 0.6, {}],
    ["globe", 0.45, 0.55, {}], ["computer", 0.8, 0.75, { rot: 180 }], ["podium", 0.5, 0.85, {}]] };
  X["奧克托拉・研究展示區"] = { size: [11, 8.5], cut: [2.4, 1.8], t: { wallPat: "pin", wall3: 0xC8D8E4, floorPat: "tile", floor: [0xDCE0E4, 0xD0D4D8, 0xE8ECF0], seam: 0xB0B8C0, lampC: COOL, ceil: 3.2 }, add: ["crystal", "statue", "plant", "bench2", "lockers", "board", "tank"] };

  // 每間房都再補一些：照亮房間的小燈（壁燈、立燈、蠟燭），加上植物、掛畫這些讓房間不空的東西
  // 牆上掛滿（相框、層板、垂吊植物、壁燈），牆邊擺滿（盆栽、書堆、箱子），中間留走路的空間
  // 自動補的是「主角家具」，旁邊的小東西（上方的相框、層架、壁燈、盆栽、地毯、椅子）會成套跟著擺
  const GEN = {
    home: ["sideboard", "shelf", "curio", "sideboard", "shelf"],
    shop: ["shelf", "sideboard", "curio", "island", "shelf", "sideboard"],
    school: ["shelf", "shelf", "sideboard", "map", "clock"],
    dark: ["shelf", "curio", "sideboard", "scrolls"],
    outdoor: ["bush", "flowers", "tree", "plant", "bush", "flowers"]
  };
  const BIG = { home: ["shelf"], shop: ["island", "shelf", "curio"], school: ["shelf"], dark: ["curio"] };
  const homeIds = new Set((N.locations || []).filter(l => l.kind === "home").map(l => l.id));
  for (const id in N.interiors) {
    const e = N.interiors[id], fl = e.floors || [e];
    fl.forEach((F, i) => {
      const k = id + (fl.length > 1 ? "#" + i : "");
      const out = F.outdoor || e.outdoor, dark = F.dark || e.dark;
      const cat = out ? "outdoor" : dark ? "dark" : /大學|高中|中學|學區/.test(id) ? "school" : homeIds.has(id) || i > 0 ? "home" : "shop";
      X[k] = X[k] || {}; if (!X[k].noGen) X[k].add = (X[k].add || []).concat(GEN[cat]);
      // 大房間再多一組：中間的閱讀角／展示台，牆邊再一排櫃子
      const sz = X[k].size || F.size;
      if (sz && sz[0] * sz[1] >= 70 && BIG[cat]) X[k].add = X[k].add.concat(BIG[cat]);
    });
  }
  // 套進去
  for (const key in X) {
    const [id, fi] = key.split("#"), e = N.interiors[id]; if (!e) continue;
    const fl = e.floors || [e], F = fl[fi ? +fi : 0], x = X[key]; if (!F) continue;
    if (x.size) F.size = x.size;
    if (x.noFloor) F.noFloor = true;
    F.theme = Object.assign({}, F.theme || {}, x.t || {}, x.cut ? { cut: x.cut } : {});
    F.items = (F.items || []).concat((x.add || []).map(a => typeof a === "string" ? [a, null, null, {}] : [a[0], null, null, Object.assign({}, a[1])]));
  }
})();
