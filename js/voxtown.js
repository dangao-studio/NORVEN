/* 諾文小鎮：體素小鎮
 * 小鎮的建築、院子、人行道都用 0.125 的小方塊堆出來，再合併成網格。
 * 為了手機跑得動：
 *   ・同一平面上顏色和角落陰影都一樣的相鄰面合成一塊（貪婪合併）
 *   ・朝下的面只有貼地的不畫（第一人稱會從樹冠、遮雨棚下面往上看）
 *   ・雜色用「好幾格一起變色」，才合併得起來
 * 窗戶玻璃、燈另外做成會在夜裡發光的網格。
 * 介面：N.voxTown.lot(T, l, info) 回傳一個地點的網格；N.voxTown.block(T, x0, z0, info) 回傳一個街區的人行道。 */
(function () {
  "use strict";
  const N = window.NOVUM = window.NOVUM || {};
  const V = 0.125;
  let T = null;

  /* ───── 體素格（每次建一個地點時重設） ───── */
  let G, GW, GL;                      // 一般、窗戶玻璃、燈
  const key = (x, y, z) => ((x + 256) * 512 + y) * 1024 + (z + 256);
  function reset() { G = new Map(); GW = new Map(); GL = new Map(); }
  function set(x, y, z, c) {
    if (y < 0) return; const k = key(x, y, z);
    GW.delete(k); GL.delete(k);
    if (c == null) G.delete(k); else G.set(k, c);
  }
  function glass(x, y, z) { const k = key(x, y, z); G.delete(k); GL.delete(k); GW.set(k, 1); }
  function light(x, y, z) { const k = key(x, y, z); G.delete(k); GW.delete(k); GL.set(k, 1); }
  const solid = (x, y, z) => { const k = key(x, y, z); return G.has(k) || GW.has(k) || GL.has(k); };
  function hash(x, y, z) { let h = (x * 374761393 + y * 668265263 + z * 1274126177) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
  const pick = (arr, x, y, z) => arr[Math.floor(hash(x, y, z) * arr.length) % arr.length];
  function box(x0, y0, z0, x1, y1, z1, fn) {
    for (let x = x0; x < x1; x++) for (let y = y0; y < y1; y++) for (let z = z0; z < z1; z++) {
      const c = typeof fn === "function" ? fn(x, y, z) : fn; if (c != null) set(x, y, z, c);
    }
  }
  function shell(x0, y0, z0, x1, y1, z1, fn) {
    for (let x = x0; x < x1; x++) for (let y = y0; y < y1; y++) for (let z = z0; z < z1; z++) {
      if (x > x0 && x < x1 - 1 && z > z0 && z < z1 - 1 && y < y1 - 1) continue;
      const c = typeof fn === "function" ? fn(x, y, z) : fn; if (c != null) set(x, y, z, c);
    }
  }
  // 圓滾滾的一團，用 2×2×2 的方塊堆（樹冠、灌木）
  function blob(cx, cy, cz, rx, ry, rz, fn, rough) {
    rough = rough == null ? 0.12 : rough;
    for (let x = Math.floor((cx - rx - 2) / 2) * 2; x <= cx + rx + 2; x += 2)
      for (let y = Math.max(0, Math.floor((cy - ry - 2) / 2) * 2); y <= cy + ry + 2; y += 2)
        for (let z = Math.floor((cz - rz - 2) / 2) * 2; z <= cz + rz + 2; z += 2) {
          const d = ((x + 1 - cx) / rx) ** 2 + ((y + 1 - cy) / ry) ** 2 + ((z + 1 - cz) / rz) ** 2;
          if (d < 1 - rough * hash(x, y, z) * 0.9) { const c = fn(x, y, z); box(x, y, z, x + 2, y + 2, z + 2, c); }
        }
  }

  /* ───── 調色 ───── */
  const C = {
    leaf: [0x557F2E, 0x648F34, 0x47702A, 0x76A03A, 0x8CB040], pine: [0x3E6A2E, 0x4A7834, 0x355C28],
    trunk: 0x6A4A30, soil: 0x5A3E2A, stone: 0xB9AE9C, stoneD: 0x9E937F, side: 0xD6CBB6, seam: 0xC4B8A2, curb: 0xA89C88,
    white: 0xF6F2EA, iron: 0x2E3036, gold: 0xD8A840, wood: 0x8A5A36, woodD: 0x6A4228, glass: 0x3E5468,
    brick: 0xB4583E, brickD: 0x9A4834, mortar: 0xD8C8B0, water: 0x4E8EA8, waterD: 0x3E7894
  };
  const FLW = [0xF2E6E0, 0xE8504A, 0xF4C840, 0xC888E0, 0xF07AA0, 0xFFFFFF, 0xF49A40];
  const GRASS = { central: [0x6E9A3E, 0x7AA644], academy: [0x76A444, 0x6A9A3C], oldtown: [0x6A8A44, 0x748F48], outer: [0x7A9450, 0x6E8A4A], pero: [0x7AAA54, 0x88B060], other: [0x6EA048, 0x7AAA50] };
  const PAVE = { central: [0xD2C6AE, 0xC4B8A0], academy: [0xC8BCA6, 0xBCB09A], oldtown: [0xA8A090, 0x968E80], outer: [0xB4B6B0, 0xA4A6A0], pero: [0xE8D0DC, 0xD8C0D0], other: [0xC8C4B0, 0xBAB6A2] };

  /* ───── 小物件 ───── */
  function tree(x, z, h, r, tone) {
    box(x, 1, z, x + 2, h, z + 2, C.trunk);
    const L = (a, b, c) => { const A = Math.floor(a / 3), B = Math.floor(b / 3), Q = Math.floor(c / 3); return hash(A, B, Q) < 0.08 ? 0xB8C860 : pick(tone || C.leaf, A, B, Q); };
    blob(x + 1, h, z + 1, r, r * 0.9, r, L);
    blob(x + 1 + r * 0.5, h - r * 0.3, z + 1 + r * 0.2, r * 0.6, r * 0.55, r * 0.6, L);
  }
  function pine(x, z, h) {
    box(x, 1, z, x + 2, 5, z + 2, C.trunk);
    for (let y = 4; y < h; y += 2) { const r = Math.max(1.2, 3.4 * Math.sin(Math.PI * (y - 2) / (h - 1))); blob(x + 1, y, z + 1, r, 1.2, r, (a, b) => pick(C.pine, 0, b >> 2, 0), 0.1); }
  }
  function bush(x, z, r, flowers) {
    blob(x, r * 0.7, z, r + 0.5, r * 0.8 + 0.5, r + 0.5, (a, b, c) => flowers && hash(a, b, c) < 0.14 ? pick(FLW, a, b + 3, c) : pick(C.leaf, a >> 2, b >> 2, c >> 2));
  }
  function hedge(x0, z0, x1, z1, h) { box(x0, 1, z0, x1, h, z1, (a, b, c) => pick([0x4E7A2E, 0x5A8634, 0x456E28], a >> 1, b >> 1, c >> 1)); }
  function flowerbed(x0, z0, x1, z1) {
    box(x0, 1, z0, x1, 2, z1, (a, b, c) => (a === x0 || a === x1 - 1 || c === z0 || c === z1 - 1) ? C.stoneD : 0x5A8634);
    for (let x = x0 + 1; x < x1 - 1; x++) for (let z = z0 + 1; z < z1 - 1; z++) if (hash(x, 9, z) < 0.35) set(x, 2, z, pick(FLW, x, 3, z));
  }
  function fence(x0, z0, len, ax, c) {
    c = c || C.white;
    for (let i = 0; i < len; i++) {
      const X = ax ? x0 + i : x0, Z = ax ? z0 : z0 + i;
      if (i % 3 === 0) box(X, 1, Z, X + 1, 6, Z + 1, c); else { set(X, 2, Z, c); set(X, 4, Z, c); }
    }
  }
  function pot(x, z) {
    box(x, 1, z, x + 2, 3, z + 2, 0xB8683E);
    blob(x + 1, 4, z + 1, 1.6, 1.4, 1.6, (a, b, c) => hash(a, b, c) < 0.3 ? pick(FLW, a, b, c) : 0x5A8634, 0);
  }
  function lampPost(x, z, gas, lamps) {
    box(x, 1, z, x + 1, 22, z + 1, gas ? 0x2E2A26 : C.iron); box(x - 1, 1, z - 1, x + 2, 2, z + 2, C.iron);
    for (let a = x - 1; a < x + 2; a++) for (let c = z - 1; c < z + 2; c++) for (let b = 22; b < 25; b++) light(a, b, c);
    box(x - 1, 25, z - 1, x + 2, 26, z + 2, gas ? 0x2E2A26 : C.iron);
    if (gas) set(x, 26, z, 0x2E2A26);
    if (lamps) lamps.push([x + 0.5, z + 0.5]);
  }
  function bench(x, z, ax) {
    for (let i = 0; i < 9; i++) {
      const X = ax ? x + i : x, Z = ax ? z : z + i;
      set(X, 3, Z, C.wood); set(ax ? X : X + 1, 3, ax ? Z + 1 : Z, C.wood); set(ax ? X : X - 1, 4, ax ? Z - 1 : Z, C.woodD); set(ax ? X : X - 1, 5, ax ? Z - 1 : Z, C.wood);
      if (i === 0 || i === 8) { set(X, 1, Z, C.iron); set(X, 2, Z, C.iron); }
    }
  }
  function crates(x, z) { box(x, 1, z, x + 4, 5, z + 4, C.wood); box(x + 1, 5, z, x + 4, 8, z + 3, C.woodD); box(x + 4, 1, z + 1, x + 7, 4, z + 4, C.wood); }
  function bikes(x, z) { for (let i = 0; i < 3; i++) { const bx = x + i * 3; box(bx, 1, z, bx + 1, 4, z + 5, C.iron); set(bx, 4, z + 1, [0x3A6E9A, 0xC8402A, 0xE8B83A][i]); } }
  function mailbox(x, z) { box(x, 1, z, x + 2, 7, z + 2, 0xC8402A); box(x - 1, 7, z, x + 3, 8, z + 2, 0xA8301E); }
  function gears(x, y, z) {
    const ring = (cx, cy, r) => { for (let a = 0; a < 24; a++) { const t = a / 24 * Math.PI * 2; set(Math.round(cx + Math.cos(t) * r), Math.round(cy + Math.sin(t) * r), z, a % 3 ? 0xB8903A : 0x9A7428); } };
    ring(x, y, 3); ring(x + 5, y + 3, 2);
  }
  function pipe(x, z, y0, h) { box(x, y0, z, x + 2, y0 + h, z + 2, 0x9A7A5A); box(x - 1, y0 + (h >> 1), z - 1, x + 3, y0 + (h >> 1) + 1, z + 3, 0xB8903A); }

  /* ───── 牆面、窗、門、屋頂 ───── */
  const faceZ = (x0, z, dir) => ({ at: (u, y) => [x0 + u, y, z], out: (u, y, k) => [x0 + u, y, z + dir * k] });
  const faceX = (x, z0, dir) => ({ at: (u, y) => [x, y, z0 + u], out: (u, y, k) => [x + dir * k, y, z0 + u] });
  function windowOn(f, a0, y0, w, h, o) {
    o = o || {};
    for (let u = a0 - 1; u <= a0 + w; u++) for (let y = y0 - 1; y <= y0 + h; y++) {
      const [X, Y, Z] = f.at(u, y);
      if (u === a0 - 1 || u === a0 + w || y === y0 - 1 || y === y0 + h) set(X, Y, Z, o.frame || C.white); else glass(X, Y, Z);
    }
    if (o.box) for (let u = a0 - 1; u <= a0 + w; u++) {
      const [X, Y, Z] = f.out(u, y0 - 2, 1); set(X, Y, Z, C.wood);
      const [X2, Y2, Z2] = f.out(u, y0 - 1, 1); set(X2, Y2, Z2, ((u >> 1) % 2) ? pick(FLW, u >> 1, y0, X2 + Z2) : 0x5A8634);
    }
    if (o.shutter) for (const u of [a0 - 2, a0 + w + 1]) for (let y = y0; y < y0 + h; y++) { const [X, Y, Z] = f.out(u, y, 1); set(X, Y, Z, o.shutter); }
  }
  function door(f, a0, w, h, c) {
    for (let u = a0; u < a0 + w; u++) for (let y = 1; y < 1 + h; y++) { const [X, Y, Z] = f.at(u, y); set(X, Y, Z, (u === a0 + w - 2 && y === 1 + (h >> 1)) ? C.gold : c); }
    for (let u = a0 - 1; u <= a0 + w; u++) { const [X, Y, Z] = f.at(u, 1 + h); set(X, Y, Z, C.white); }
  }
  // 山牆屋頂，屋脊沿 x
  function gableRoof(x0, z0, x1, z1, y0, c1, c2) {
    const n = Math.ceil((z1 - z0) / 2) + 1;
    for (let i = 0; i < n; i++) {
      const za = z0 - 1 + i, zb = z1 - i; if (za > zb) break;
      const tc = ((i >> 1) % 2) ? c1 : c2;
      for (let x = x0 - 1; x <= x1; x++) {
        set(x, y0 + i, za, tc); set(x, y0 + i, zb, tc);
        if (i === n - 1) for (let z = za + 1; z < zb; z++) set(x, y0 + i, z, c2);
      }
    }
  }
  function gableEnds(x0, x1, z0, z1, y0, c) {
    const n = Math.ceil((z1 - z0) / 2);
    for (let i = 0; i < n; i++) for (let z = z0 + i + 1; z < z1 - i - 1; z++) { set(x0, y0 + i, z, c); set(x1 - 1, y0 + i, z, c); }
  }
  function flatRoof(x0, z0, x1, z1, y, c, lip) {
    box(x0 - 1, y, z0 - 1, x1 + 1, y + 1, z1 + 1, lip || c);
    box(x0 - 1, y + 1, z0 - 1, x1 + 1, y + 2, z1 + 1, (a, b, q) => (a === x0 - 1 || a === x1 || q === z0 - 1 || q === z1) ? (lip || c) : null);
  }
  function awning(x0, x1, z, y, c1, c2, depth) {
    for (let x = x0; x < x1; x++) for (let k = 0; k < depth; k++) {
      const c = (((x - x0) >> 1) % 2) ? c1 : c2;
      set(x, y - (k >> 1), z + k, c);
    }
  }
  const brickWall = (base, dark) => (x, y) => y % 3 === 0 ? C.mortar : ((y / 3 | 0) % 4 === 1 ? dark : base);
  const stoneWall = (base) => (x, y, z) => (y % 4 === 0) ? 0x8E8676 : ((((x + z) >> 2) + (y >> 2)) % 3 ? base : mixC(base, 0x000000, 0.08));
  const timberWall = (base, beam, x0, x1, top) => (x, y, z) => (y === 1 || y === top - 1 || x === x0 || x === x1 - 1 || (x - x0) % 10 === 0) ? beam : base;
  function mixC(a, b, t) {
    const r = ((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t, g = ((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t, bl = (a & 255) * (1 - t) + (b & 255) * t;
    return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
  }

  /* ───── 一棟建築：牆、窗、門、屋頂 ─────
   * o: x0,z0,w,d,h（格）、wall(色或函式)、roof: gable|flat、roofC:[c1,c2]、
   *    floors（每層高度）、winW、winH、shutter、box、door:{c,w}、lit（一樓大窗） */
  /* 比例：一格 0.2 公尺（小鎮 1 單位 = 1.6 公尺），人 1.6 公尺 = 8 格。
   * 一層樓 15 格（3 公尺）、店門 10 格（2 公尺）、住家門 9 格（1.8 公尺，比人高一點）。 */
  function building(o) {
    const x0 = o.x0, z0 = o.z0, x1 = x0 + o.w, z1 = z0 + o.d, h = o.h;
    const wf = typeof o.wall === "function" ? o.wall : () => o.wall;
    shell(x0, 1, z0, x1, h, z1, wf);
    const F = faceZ(x0, z1 - 1, 1), floorH = o.floorH || 15;
    const dw = (o.door && o.door.w) || 5, dh = (o.door && o.door.h) || 10, du = (o.door && o.door.u != null) ? o.door.u : ((o.w - dw) >> 1);
    door(F, du, dw, dh, (o.door && o.door.c) || 0x5A3A28);
    if (o.lit) { windowOn(F, 3, 3, du - 6, 8, { frame: o.frame }); windowOn(F, du + dw + 3, 3, o.w - du - dw - 6, 8, { frame: o.frame }); }
    else if (o.w >= 22) { windowOn(F, Math.max(3, du - 9), 4, 5, 6, { frame: o.frame, shutter: o.shutter, box: o.box }); windowOn(F, du + dw + 4, 4, 5, 6, { frame: o.frame, shutter: o.shutter, box: o.box }); }
    const ww = o.winW || 5, wh = o.winH || 7, n = Math.max(1, Math.floor((o.w - 4) / (ww + 6)));
    const gap = (o.w - n * ww) / (n + 1);
    for (let y = floorH + 4; y + wh < h - 1; y += floorH) {
      for (let i = 0; i < n; i++) windowOn(F, Math.round(gap + i * (ww + gap)), y, ww, wh, { frame: o.frame, shutter: o.shutter, box: o.box });
      if (o.floorLine) box(x0 - 1, y - 4, z1, x1 + 1, y - 3, z1 + 1, o.floorLine);
    }
    { const S = faceX(x1 - 1, z0, 1); windowOn(S, (o.d >> 1) - 2, 4, 4, 6, { frame: o.frame, shutter: o.shutter }); if (h > 28) windowOn(S, (o.d >> 1) - 2, floorH + 4, 4, 6, { frame: o.frame, shutter: o.shutter }); }
    if (o.roof === "gable") { gableRoof(x0, z0, x1, z1, h, o.roofC[0], o.roofC[1]); gableEnds(x0, x1, z0, z1, h, typeof o.wall === "function" ? wf(0, h, 0) : o.wall); }
    else flatRoof(x0, z0, x1, z1, h, o.roofC[1], o.roofC[0]);
    return { x0, z0, x1, z1, h, F, du, dw, top: o.roof === "gable" ? h + Math.ceil(o.d / 2) : h + 2 };
  }

  /* ───── 依地點類型設計 ───── */
  function design(l, info, lamps) {
    const type = info.type, reg = info.reg, h0 = info.hash, R = k => hash(h0 % 9973, k, 7);
    const wallC = info.wall, roofC = info.roof, roofD = mixC(roofC, 0x000000, 0.18);
    const grass = GRASS[reg] || GRASS.central, pave = PAVE[reg] || PAVE.central;
    const oldtown = reg === "oldtown", outer = reg === "outer";
    const wallFn = info.brick ? brickWall(wallC, mixC(wallC, 0, 0.16)) : oldtown ? stoneWall(wallC) : reg === "academy" ? brickWall(wallC, mixC(wallC, 0, 0.14)) : () => wallC;
    let top = 24;
    // 地面：院子是草地，中間一條石板路通往門口
    const groundPaved = OPEN[type] && type !== "park" && type !== "river";
    box(-26, 0, -26, 26, 1, 26, (x, y, z) => groundPaved ? (((x >> 3) + (z >> 3)) % 2 ? pave[0] : pave[1]) : (((x >> 4) + (z >> 4)) % 3 ? grass[0] : grass[1]));
    if (!OPEN[type]) box(-3, 0, 12, 3, 1, 26, (x, y, z) => (((x >> 1) + (z >> 1)) % 2 ? pave[0] : pave[1]));
    const gas = oldtown;
    switch (type) {
      case "house": {
        const b = building({ x0: -18, z0: -18, w: 36, d: 31, h: 17, wall: wallFn, roof: "gable", roofC: [roofC, roofD], shutter: R(1) < 0.5 ? roofD : null, box: true, door: { c: R(2) < 0.5 ? 0x5A3A28 : roofD, h: 9 } });
        top = b.top;
        box(9, b.h, -12, 13, b.h + 14, -8, oldtown ? 0x8E8676 : 0x9A5A4A);                 // 煙囪
        fence(-25, 22, 22, true); fence(4, 22, 22, true);
        flowerbed(-23, 15, -11, 19); bush(18, 17, 2.4, true); pot(5, 14); pot(-7, 14);
        if (R(3) < 0.6) tree(-25, -25, 20, 4); else pine(21, -25, 22);
        mailbox(14, 19);
        break;
      }
      case "attic": {
        const b = building({ x0: -16, z0: -16, w: 32, d: 28, h: 15, wall: wallFn, roof: "gable", roofC: [roofC, roofD], box: true, door: { c: 0xC8A040, h: 9 } });
        top = b.top;
        const S = faceX(b.x0, b.z0, -1); windowOn(S, 11, b.h + 2, 4, 4, {});
        fence(-25, 22, 22, true); fence(4, 22, 22, true);
        for (const x of [-21, -12, 12, 21]) bush(x, 18, 2.2, true);
        tree(21, -24, 22, 4); pine(-23, -24, 20);
        break;
      }
      case "shop": {
        const gab = !!info.gable;
        const b = building({ x0: -23, z0: -20, w: 46, d: 36, h: 30, wall: info.timber ? timberWall(wallC, 0x6A4630, -23, 23, 30) : wallFn, roof: gab ? "gable" : "flat", roofC: gab ? [roofC, roofD] : [0xF2ECE0, mixC(wallC, 0x000000, 0.12)], lit: true, door: { c: 0x3A2A22, w: 6 }, winW: 6, winH: 7, box: true, floorLine: gab ? null : 0xF2ECE0 });
        top = b.top;
        awning(-22, 22, 16, 14, roofC, 0xF4EEE2, 4);
        pot(-22, 18); pot(20, 18); bench(-25, 21, true);
        if (R(4) < 0.5) crates(16, -26); else bikes(17, 17);
        break;
      }
      case "tall": {
        const b = building({ x0: -23, z0: -20, w: 46, d: 36, h: 48, wall: wallFn, roof: "flat", roofC: [0xE8E2D6, mixC(wallC, 0x000000, 0.15)], winW: 5, winH: 7, box: R(5) < 0.5, frame: 0xF2ECE0 });
        top = b.top;
        for (let y = 18; y < 46; y += 15) box(-18, y, 16, -8, y + 1, 19, 0xE8E2D6);
        box(6, 50, -12, 12, 56, -6, 0x8A8E94); box(-14, 50, 2, -10, 53, 6, 0xE8E4DC);
        bikes(-25, 17); bush(22, 19, 2, true);
        break;
      }
      case "school": {
        const b = building({ x0: -26, z0: -22, w: 52, d: 41, h: 32, wall: wallFn, roof: "gable", roofC: [roofC, roofD], winW: 5, winH: 8, frame: 0xF2ECE0, door: { c: 0x3A2A22, w: 7, h: 11 } });
        top = b.top;
        box(-5, 1, 19, 5, 2, 23, C.stone);                                                  // 台階
        box(-4, 23, 19, 4, 28, 20, 0xF2ECE0); light(0, 25, 20); set(0, 25, 21, C.iron);    // 時鐘
        box(24, 1, 22, 25, 30, 23, C.iron); box(18, 24, 22, 24, 29, 23, info.flag || 0xC8402A);   // 旗竿
        bikes(8, 19); bench(-22, 21, true);
        break;
      }
      case "wizard": {
        for (let y = 1; y < 46; y++) for (let x = -9; x < 9; x++) for (let z = -12; z < 6; z++) {
          const d = Math.hypot(x + 0.5, z + 3.5); if (d < 9 && d > 7.5) set(x, y, z, y % 6 === 0 ? 0x8A7E70 : 0xB8AE9E);
        }
        for (let i = 0; i < 9; i++) { const r = 10 - i * 1.15; for (let x = -11; x < 11; x++) for (let z = -14; z < 8; z++) { const d = Math.hypot(x + 0.5, z + 3.5); if (d < r && d > r - 2.2) set(x, 46 + i * 2, z, 0x5A3E8A); if (d < r) set(x, 47 + i * 2, z, d > r - 2.2 ? 0x4A3278 : null); } }
        light(0, 66, -4); light(0, 67, -4);
        const F = faceZ(-8, 5, 1);
        door(F, 6, 5, 10, 0x3A2A4A); windowOn(F, 7, 24, 3, 5, { frame: 0x8A7E70 }); windowOn(F, 7, 36, 3, 5, { frame: 0x8A7E70 });
        top = 66; flowerbed(-20, 10, -10, 16); flowerbed(10, 10, 20, 16); pine(-22, -20, 26); tree(18, -18, 22, 5, [0x5A8A6A, 0x4A7A5A]);
        set(5, 30, 6, 0x6A4A30); set(5, 31, 6, 0xC8A880);    // 貓頭鷹棲木
        break;
      }
      case "street": {
        // 一排窄窄的店面，高低、顏色都不一樣
        const cols = [wallC, info.wall2 || mixC(wallC, 0xFFFFFF, 0.25), info.wall3 || mixC(roofC, 0xFFFFFF, 0.45)];
        let x = -24; let i = 0; top = 0;
        while (x < 16) {
          const w = 14 + Math.floor(R(10 + i) * 4), h = 28 + Math.floor(R(20 + i) * 12), c = cols[i % 3];
          const wf = oldtown ? stoneWall(c) : () => c;
          const b = building({ x0: x, z0: -16, w: Math.min(w, 24 - x), d: 22, h, wall: wf, roof: R(30 + i) < 0.5 ? "gable" : "flat", roofC: [roofC, roofD], lit: true, door: { w: 4, u: 2, c: roofD }, winW: 4, winH: 6, box: R(40 + i) < 0.5 });
          // （店面一樓 15 格高，遮陽棚在門上方）
          awning(x + 1, b.x1 - 1, 6, 13, i % 2 ? roofC : 0x4A6FA5, 0xF4EEE2, 4);
          top = Math.max(top, b.top); x = b.x1; i++;
        }
        for (let k = -20; k < 22; k += 14) pot(k, 12);
        if (oldtown) { pipe(23, -12, 1, 26); gears(-20, 26, 6); }
        if (reg === "outer") { pipe(-25, -12, 1, 30); gears(16, 28, 6); }
        bench(-6, 18, true); crates(14, 16);
        break;
      }
      case "tower": {
        // 鐘塔、蓮花池、花圃、長椅
        const tx = -6, tz = -18;
        shell(tx, 1, tz, tx + 12, 64, tz + 12, (x, y) => y % 8 === 0 ? 0xC8B490 : 0xDCCCAA);
        for (let i = 0; i < 6; i++) box(tx - 1 + i, 64 + i * 2, tz - 1 + i, tx + 13 - i, 66 + i * 2, tz + 13 - i, i % 2 ? 0x56607A : 0x444C62);
        for (let x = -4; x <= 4; x++) for (let y = -4; y <= 4; y++) if (x * x + y * y <= 17) {
          if (x * x + y * y > 11) set(tx + 6 + x, 52 + y, tz + 12, C.gold); else light(tx + 6 + x, 52 + y, tz + 12);
        }
        for (let k = 0; k < 4; k++) set(tx + 6, 52 + k, tz + 13, C.iron); for (let k = 1; k < 3; k++) set(tx + 6 + k, 52, tz + 13, C.iron);
        for (let x = -16; x <= 16; x++) for (let z = 4; z <= 18; z++) {
          const d = (x / 16) ** 2 + ((z - 11) / 7) ** 2;
          if (d < 1) { set(x, 0, z, ((x >> 2) + (z >> 2)) % 2 ? C.water : C.waterD); if (d > 0.78) set(x, 1, z, C.stoneD); }
        }
        for (let i = 0; i < 7; i++) { const lx = -10 + Math.floor(hash(i, 3, h0 % 97) * 20), lz = 8 + Math.floor(hash(i, 5, 2) * 6); box(lx, 1, lz, lx + 2, 2, lz + 2, 0x5E8A36); if (i % 2 === 0) set(lx, 2, lz, pick([0xF4C8D8, 0xFFFFFF, 0xF07AA0], i, 0, 0)); }
        flowerbed(-24, -24, -12, -18); flowerbed(12, -24, 24, -18); bench(-24, -10, false); bench(22, -10, false);
        lampPost(-23, 22, gas, lamps); lampPost(22, 22, gas, lamps);
        tree(-22, 0, 24, 6); tree(18, 0, 26, 7);
        top = 76; break;
      }
      case "park": {
        box(-4, 0, -26, 4, 1, 26, (x, y, z) => ((x >> 1) + (z >> 1)) % 2 ? pave[0] : pave[1]);
        box(-26, 0, -4, 26, 1, 4, (x, y, z) => ((x >> 1) + (z >> 1)) % 2 ? pave[0] : pave[1]);
        for (let x = -8; x <= 8; x++) for (let z = -8; z <= 8; z++) { const d = Math.hypot(x, z); if (d < 8) { set(x, 1, z, d > 6.5 ? C.stone : null); set(x, 0, z, d <= 6.5 ? C.water : C.stone); } }
        box(-1, 1, -1, 1, 6, 1, C.stone); light(0, 6, 0);
        tree(-22, -22, 26, 7); tree(14, -22, 24, 6, [0x76A03A, 0x8CB040, 0x648F34]); tree(-22, 12, 22, 6); pine(18, 14, 26); pine(20, -6, 22);
        flowerbed(-20, -10, -8, -6); flowerbed(8, 6, 20, 10); bench(-14, 6, true); bench(6, -9, true);
        bush(-10, 20, 3, true); bush(10, 22, 2.6, true);
        lampPost(6, 6, gas, lamps); lampPost(-7, -7, gas, lamps);
        top = 34; break;
      }
      case "lake": {
        // 地下湖入口：石頭拱門、湖面、木棧板、釣竿
        for (let x = -20; x <= 20; x++) for (let z = -16; z <= 16; z++) { const d = (x / 20) ** 2 + (z / 16) ** 2; if (d < 1) { set(x, 0, z, d < 0.85 ? (((x >> 2) + (z >> 2)) % 2 ? 0x2E5A6A : 0x24505E) : 0x6F6B63); if (d >= 0.85) set(x, 1, z, 0x6F6B63); } }
        for (let a = 0; a <= 16; a++) { const t = a / 16 * Math.PI; for (let k = -2; k <= 2; k++) box(Math.round(Math.cos(t) * 16) - 2, Math.round(Math.sin(t) * 16) + 1, -22 + k, Math.round(Math.cos(t) * 16) + 2, Math.round(Math.sin(t) * 16) + 4, -21 + k, 0x55524C); }
        box(10, 1, 6, 16, 2, 22, C.wood); for (let z = 6; z < 22; z += 5) box(10, 0, z, 11, 1, z + 1, C.woodD);
        for (let k = 0; k < 12; k++) set(14 + (k >> 2), 2 + k, 20 - (k >> 1), 0x333333);
        for (let i = 0; i < 5; i++) light(-14 + i * 7, 2, -12 + (i % 2) * 4);
        top = 22; break;
      }
      case "river": {
        box(-26, 0, -26, -12, 1, 26, (x, y, z) => (x + z) % 3 ? C.wood : C.woodD);          // 木棧道
        for (let z = -24; z < 26; z += 8) box(-26, 1, z, -25, 7, z + 1, C.woodD); box(-26, 6, -26, -25, 7, 26, C.woodD);
        for (let i = 0; i < 12; i++) { const x = -10 + Math.floor(hash(i, 1, 1) * 30), z = -22 + Math.floor(hash(i, 2, 2) * 44); box(x, 1, z, x + 1, 3 + (i % 3), z + 1, 0x7A9A44); }
        tree(8, -18, 26, 7); tree(14, 14, 22, 6, [0x76A03A, 0x8CB040]); bench(-8, 2, false);
        lampPost(-14, 18, gas, lamps); lampPost(-14, -14, gas, lamps);
        top = 34; break;
      }
      case "market": case "stage": {
        if (type === "stage") {
          box(-22, 1, -24, 22, 6, -4, 0x3D3555); box(-22, 6, -24, 22, 7, -4, 0x5A4E78);
          for (const x of [-22, 21]) box(x, 6, -24, x + 1, 34, -23, 0x777777); box(-22, 34, -24, 22, 36, -23, 0x777777);
          box(-20, 7, -23, -14, 30, -22, 0xA8304A); box(14, 7, -23, 20, 30, -22, 0xA8304A);
          box(-18, 7, -14, -12, 16, -9, 0x222222); box(12, 7, -14, 18, 16, -9, 0x222222);
          for (let i = 0; i < 6; i++) light(-15 + i * 6, 33, -22);
          top = 38;
        } else {
          const cols = [0xC0603F, 0xE0B54A, 0x4A6FA5, 0x2F8A6A, 0xD98AA0];
          [[-20, -20], [4, -20], [-20, 2], [4, 2]].forEach(([x, z], i) => {
            box(x, 1, z, x + 16, 7, z + 9, 0x9C7A55);
            for (let k = 0; k < 4; k++) box(x + 1 + k * 4, 7, z + 1, x + 3 + k * 4, 9, z + 3, pick(FLW, i, k, h0 % 13));
            for (const dx of [0, 15]) box(x + dx, 7, z, x + dx + 1, 16, z + 1, 0x6B5A4A);
            awning(x - 1, x + 17, z - 3, 17, cols[(h0 + i) % cols.length], 0xF4EEE2, 6);
          });
          if (/夜市/.test(l.name)) for (let i = 0; i < 12; i++) { const x = -24 + i * 4; light(x, 20 + Math.round(Math.sin(i) * 1), 0); box(x - 1, 22, 0, x + 3, 23, 1, 0x333333); }
          crates(-24, 20); crates(18, 20);
          top = 24;
        }
        lampPost(23, 22, gas, lamps);
        break;
      }
      case "station": {
        box(-25, 1, -24, 25, 5, -6, 0xB4AEA2);                                              // 月台
        for (const x of [-20, 0, 20]) box(x, 5, -14, x + 1, 22, -13, 0x4F5D62);
        const old = /舊站/.test(l.name);
        for (let i = 0; i < 6; i++) box(-26, 22 + (i >> 1), -24 + i * 3, 26, 23 + (i >> 1), -21 + i * 3, old ? (i % 2 ? 0x8E4A3A : 0x7A3E30) : (i % 2 ? 0x3F6E73 : 0x335C60));
        box(-26, 0, 4, 26, 1, 5, 0x5A5A5A); box(-26, 0, 12, 26, 1, 13, 0x5A5A5A);
        for (let x = -26; x < 26; x += 4) box(x, 0, 3, x + 2, 1, 14, 0x7A5A3E);
        bench(-12, -18, true); bench(6, -18, true);
        box(-6, 14, -7, 6, 18, -6, old ? 0x2E2A26 : 0x2E4A6A); for (let x = -4; x < 4; x += 2) set(x, 16, -5, C.white);
        if (old) { box(-14, 1, 5, 4, 10, 12, 0x2E2E33); box(-14, 10, 6, -10, 16, 10, 0x2E2E33); box(0, 10, 7, 4, 13, 10, 0x8E4A3A); }
        lampPost(22, 20, gas, lamps);
        top = 28; break;
      }
    }
    return top;
  }
  const OPEN = { tower: 1, park: 1, lake: 1, river: 1, market: 1, stage: 1, station: 1 };

  /* ───── 各地點的招牌細節 ───── */
  function landmark(id, lamps) {
    switch (id) {
      case "史威特偵探社": {
        for (let a = 0; a < 40; a++) { const t = a / 40 * Math.PI * 2; set(Math.round(10 + Math.cos(t) * 5), Math.round(44 + Math.sin(t) * 5), -4, C.gold); }
        for (let i = 0; i < 6; i++) set(14 + i, 40 - i, -4, 0x6A4630);
        box(10, 32, -4, 11, 39, -3, C.iron);
        for (let x = -21; x < 22; x += 2) light(x, 13 - Math.round(Math.sin((x + 21) / 42 * Math.PI) * 2), 17);
        break;
      }
      case "Hale’s Oven": {
        box(6, 30, -12, 11, 44, -7, (x, y) => brickWall(C.brick, C.brickD)(x, y));
        for (const [tx, tz] of [[-18, 19], [16, 19]]) {
          box(tx, 1, tz, tx + 1, 6, tz + 1, C.iron); box(tx - 2, 6, tz - 2, tx + 3, 7, tz + 3, C.wood);
          box(tx, 7, tz, tx + 1, 11, tz + 1, C.white);
          blob(tx + 0.5, 11.5, tz + 0.5, 5, 1.2, 5, (a, b, c) => ((Math.atan2(c - tz, a - tx) * 3 / Math.PI + 6) | 0) % 2 ? 0xC8402A : 0xF4EEE2, 0);
        }
        blob(0, 13, 16.5, 4, 1.4, 1.2, () => 0xD8A050, 0);
        break;
      }
      case "諾文甜點店": {
        for (let a = -7; a <= 7; a++) for (let b = -7; b <= 7; b++) for (let c = -3; c <= 3; c++) {
          const r = Math.hypot(a, b), q = (r - 4.8) ** 2 + c * c;
          if (q < 5) set(a, 41 + b, -2 + c, c > 0 && q < 4.5 ? (hash(a, b, c) < 0.15 ? pick([0xF4D35E, 0x4AC8E8, 0xFFFFFF], a, b, 0) : 0xF2A0BC) : 0xD8A060);
        }
        box(0, 32, -2, 1, 36, -1, C.white);
        break;
      }
      case "星星家": for (let i = 0; i < 5; i++) light(-14 + i * 7, 36 + (i % 2) * 3, -4); break;
      case "禮的家": light(-10, 7, 12); light(-9, 7, 12); light(8, 7, 12); light(9, 7, 12); break;
      case "佐代的公寓": box(-24, 30, 6, -23, 34, 10, 0x6A1E2E); set(-25, 34, 8, 0xE8DCC8); set(-25, 35, 8, 0xE8DCC8); break;
      case "神崎家": box(8, 28, -4, 9, 42, -3, 0x9A9A9A); box(5, 40, -4, 12, 41, -3, 0x9A9A9A); break;
      case "瑞特的租屋": for (let a = 0; a < 20; a++) { const t = a / 20 * Math.PI * 2; set(18, Math.round(10 + Math.sin(t) * 3), Math.round(2 + Math.cos(t) * 3), a % 5 < 2 ? C.white : 0xD8402A); } break;
      case "玫君的租屋": box(18, 10, 0, 19, 14, 4, 0x2A2A33); box(19, 11, 1, 21, 13, 3, 0xB8282A); break;
      case "梅魯塔的塔屋": set(5, 32, 6, 0x8A6A4A); set(5, 33, 6, 0xC8A880); set(6, 33, 6, 0xF4C840); break;
    }
  }

  /* ───── 網格：貪婪合併、角落陰影、不畫朝下的面 ───── */
  const AOV = [1, 0.82, 0.68, 0.55];
  function mesh(map, useColor) {
    const slices = new Map();
    for (const [k, c] of map) {
      const z = (k % 1024) - 256, y = Math.floor(k / 1024) % 512, x = Math.floor(k / 1024 / 512) - 256, p = [x, y, z];
      for (let a = 0; a < 3; a++) for (const sg of [1, -1]) {
        if (a === 1 && sg < 0 && y <= 2) continue;   // 第一人稱會從下面看：只有貼地的底面不畫
        const n = p.slice(); n[a] += sg;
        if (solid(n[0], n[1], n[2])) continue;
        const u = (a + 1) % 3, v = (a + 2) % 3;
        let aoK = 0;
        if (useColor) {
          const ao = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([su, sv]) => {
            const q1 = n.slice(); q1[u] += su; const q2 = n.slice(); q2[v] += sv; const q3 = n.slice(); q3[u] += su; q3[v] += sv;
            const s1 = solid(q1[0], q1[1], q1[2]) ? 1 : 0, s2 = solid(q2[0], q2[1], q2[2]) ? 1 : 0, s3 = solid(q3[0], q3[1], q3[2]) ? 1 : 0;
            return s1 && s2 ? 3 : s1 + s2 + s3;
          });
          aoK = ao[0] + ao[1] * 4 + ao[2] * 16 + ao[3] * 64;
        }
        const kk = (useColor ? c : 0) * 256 + aoK, sk = a * 4096 + (sg > 0 ? 2048 : 0) + (p[a] + (sg > 0 ? 1 : 0) + 512);
        let m = slices.get(sk); if (!m) slices.set(sk, m = new Map());
        m.set((p[u] + 512) * 4096 + (p[v] + 512), kk);
      }
    }
    const pos = [], col = [], nor = [], tmp = new T.Color();
    for (const [sk, m] of slices) {
      const a = Math.floor(sk / 4096), sg = (sk % 4096) >= 2048 ? 1 : -1, plane = (sk % 2048) - 512, u = (a + 1) % 3, v = (a + 2) % 3;
      const cells = [...m.keys()].sort((p, q) => p - q), done = new Set();
      for (const id of cells) {
        if (done.has(id)) continue;
        const kk = m.get(id), u0 = Math.floor(id / 4096), v0 = id - u0 * 4096;
        let v1 = v0 + 1; while (m.get(u0 * 4096 + v1) === kk && !done.has(u0 * 4096 + v1)) v1++;
        let u1 = u0 + 1;
        outer: for (;;) { for (let vv = v0; vv < v1; vv++) { const j = u1 * 4096 + vv; if (m.get(j) !== kk || done.has(j)) break outer; } u1++; }
        for (let uu = u0; uu < u1; uu++) for (let vv = v0; vv < v1; vv++) done.add(uu * 4096 + vv);
        const c = Math.floor(kk / 256), aoc = kk % 256, ao = [aoc & 3, (aoc >> 2) & 3, (aoc >> 4) & 3, (aoc >> 6) & 3].map(i => AOV[i]);
        const corner = (uu, vv) => { const q = [0, 0, 0]; q[a] = plane * V; q[u] = (uu - 512) * V; q[v] = (vv - 512) * V; return q; };
        const E = a === 1 && sg > 0 ? 0.02 : 0, P = [corner(u0 - E, v0 - E), corner(u1 + E, v0 - E), corner(u1 + E, v1 + E), corner(u0 - E, v1 + E)];   // 朝上的面往外多長一點點，蓋住 T 字接縫
        if (a !== 1) {   // 側面的上緣稍微壓低（只限上面沒東西的地板、台子邊），不跟旁邊的地板搶畫
          const vox = plane - 512 - (sg > 0 ? 1 : 0), yTop = (a === 0 ? u1 : v1) - 512, h0 = (a === 0 ? v0 : u0) - 512, h1 = (a === 0 ? v1 : u1) - 512;
          let open = true;
          for (let k = h0; k < h1 && open; k++) { const q = [0, 0, 0]; q[a] = vox; q[1] = yTop; q[a === 0 ? 2 : 0] = k; if (solid(q[0], q[1], q[2])) open = false; }
          if (open) { const top = Math.max(P[0][1], P[1][1], P[2][1], P[3][1]) - 1e-6; for (const q of P) if (q[1] >= top) q[1] -= 0.02 * V; }
        }
        let idx = (ao[0] + ao[2] > ao[1] + ao[3]) ? [0, 1, 2, 0, 2, 3] : [1, 2, 3, 1, 3, 0];
        if (sg < 0) idx = [idx[0], idx[2], idx[1], idx[3], idx[5], idx[4]];
        tmp.setHex(c); const nn = [0, 0, 0]; nn[a] = sg;
        for (const i of idx) { pos.push(P[i][0], P[i][1], P[i][2]); nor.push(nn[0], nn[1], nn[2]); if (useColor) col.push(tmp.r * ao[i], tmp.g * ao[i], tmp.b * ao[i]); }
      }
    }
    if (!pos.length) return null;
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
    g.setAttribute("normal", new T.Float32BufferAttribute(nor, 3));
    if (useColor) g.setAttribute("color", new T.Float32BufferAttribute(col, 3));
    g.computeBoundingSphere();
    return g;
  }
  let colorMat = null;
  function meshes(info) {
    if (!colorMat) colorMat = new T.MeshLambertMaterial({ vertexColors: true });
    const out = [];
    const g0 = mesh(G, true); if (g0) { const m = new T.Mesh(g0, colorMat); m.castShadow = m.receiveShadow = true; out.push(m); }
    const g1 = mesh(GW, false); if (g1) { const m = new T.Mesh(g1, info.winMat); m.receiveShadow = true; out.push(m); }
    const g2 = mesh(GL, false); if (g2) out.push(new T.Mesh(g2, info.lampMat));
    out.forEach(m => { m.userData.noVox = true; m.matrixAutoUpdate = false; });
    return out;
  }

  /* ───── 對外 ───── */
  // 一個地點：回傳 { meshes, top（單位）, lamps（地點座標，單位） }
  function lot(three, l, info) {
    T = three; reset();
    const lamps = [];
    const top = design(l, info, lamps);
    landmark(l.id, lamps);
    return { meshes: meshes(info), top: top * V, lamps: lamps.map(([x, z]) => [x * V, z * V]), tris: 0 };
  }
  // 一個街區四周的人行道（墊高、方磚、路緣）、路燈、行道樹
  function block(three, w, d, info) {
    T = three; reset();
    const lamps = [], W = Math.round(w / V), D = Math.round(d / V), S = 14;   // 人行道 14 格（1.75 單位）：靠路緣那條放路燈、行道樹、街道家具，靠房子那邊留給人走
    const gas = info.reg === "oldtown";
    for (let x = -S; x < W + S; x++) for (let z = -S; z < D + S; z++) {
      if (x >= 0 && x < W && z >= 0 && z < D) continue;
      const edge = x === -S || x === W + S - 1 || z === -S || z === D + S - 1;
      const seam = (x + 200) % 8 === 0 || (z + 200) % 8 === 0;
      set(x, 0, z, edge ? C.curb : C.side); set(x, 1, z, edge ? C.curb : seam ? C.seam : C.side);
    }
    const crystals = [];
    const onWalk = (x, z, i) => {
      if (i % 2 === 0) {
        // 高畫質：一半的路燈換成水晶燈（金屬底座＋托架，水晶本身由 town3d 另外畫，會發光、慢慢轉）
        if (info.crystal && i % 4 === 0) {
          box(x, 1, z, x + 1, 16, z + 1, C.iron); box(x - 1, 1, z - 1, x + 2, 3, z + 2, C.iron);
          for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) { set(x + dx, 16, z + dz, C.iron); set(x + dx * 2, 17, z + dz * 2, C.iron); set(x + dx * 2, 18, z + dz * 2, C.iron); }
          crystals.push([x + 0.5, 21, z + 0.5]); lamps.push([x + 0.5, z + 0.5]);
        } else lampPost(x, z, gas, lamps);
      }
      else {
        box(x - 2, 2, z - 2, x + 3, 3, z + 3, (a, b, c) => (a === x - 2 || a === x + 2 || c === z - 2 || c === z + 2) ? C.curb : C.soil);
        box(x, 3, z, x + 1, 17, z + 1, C.trunk);
        blob(x + 0.5, 18, z + 0.5, 4.5, 3.8, 4.5, (a, b, c) => pick(info.reg === "oldtown" ? [0x5A7A3A, 0x4E6E34, 0x667F40] : C.leaf, Math.floor(a / 3), Math.floor(b / 3), Math.floor(c / 3)));
      }
    };
    let i = 0;
    // 兩側人行道上的東西要避開各排的門前小路（街區內 56、112、168 格）
    const lane = z => [56, 112, 168].some(L => Math.abs(z - L) < 8);
    for (let x = 10; x < W - 4; x += 20) { onWalk(x, -S + 4, i++); onWalk(x + 10, D + S - 5, i++); }
    const alleyZ = z => info.alley && z > 70 && z < 100;   // 中庭巷口前面留空
    for (let z = 12; z < D - 4; z += 22) { if (!lane(z) && !(info.alley === "w" && alleyZ(z))) onWalk(-S + 4, z, i++); if (!lane(z + 11) && !(info.alley === "e" && alleyZ(z + 11))) onWalk(W + S - 5, z + 11, i++); }
    /* 街道家具：路燈和行道樹之間，靠路緣那側隨機放長椅、腳踏車架、郵筒、垃圾桶、花箱、書報箱、魔導資訊柱 */
    const furn = (x, z, ax, k) => {
      const r = hash(x, k, info.seed | 0), kind = Math.floor(hash(k, x + z, 77) * 8);
      if (r > 0.6) return;
      const X = (a, b) => ax ? x + a : x + b, Z = (a, b) => ax ? z + b : z + a;   // a：沿著街、b：往路緣
      if (kind === 0) bench(ax ? x - 4 : x, ax ? z : z - 4, ax);
      else if (kind === 1) { for (let q = 0; q < 3; q++) { box(X(q * 3, 0), 2, Z(q * 3, 0), X(q * 3, 0) + 1, 5, Z(q * 3, 0) + 1, C.iron); set(X(q * 3, 1), 4, Z(q * 3, 1), [0x3A6E9A, 0xC8402A, 0xE8B83A][q]); set(X(q * 3, 2), 3, Z(q * 3, 2), 0x1E1E22); } }
      else if (kind === 2) mailbox(x, z);
      else if (kind === 3) { box(x, 2, z, x + 2, 6, z + 2, 0x5A7E6A); box(x, 6, z, x + 2, 7, z + 2, 0x4A6A5A); }
      else if (kind === 4) { const x1 = ax ? x + 7 : x + 3, z1 = ax ? z + 3 : z + 7; box(x, 2, z, x1, 4, z1, (a, b, c) => b === 3 && a > x && a < x1 - 1 && c > z && c < z1 - 1 ? (hash(a, 5, c) < 0.4 ? pick(FLW, a, 1, c) : 0x5A8634) : C.wood); }
      else if (kind === 5) { box(x, 2, z, x + 2, 7, z + 2, [0x3A6ABA, 0xE8B83A, 0x5A9A6A][Math.floor(hash(x, z, 9) * 3)]); set(x, 6, z, 0xF4F0E4); }
      else if (kind === 6 && info.crystal) { box(x, 2, z, x + 2, 4, z + 2, C.iron); box(x, 4, z, x + 2, 11, z + 2, 0x4A4E5A); light(x, 9, z); light(x + 1, 8, z + 1); box(x, 11, z, x + 2, 12, z + 2, C.gold); }
      else { for (let q = 0; q < 3; q++) box(X(q * 3, 0), 2, Z(q * 3, 0), X(q * 3, 0) + 1, 5, Z(q * 3, 0) + 1, 0x8A8E96); }
    };
    for (let x = 20; x < W - 6; x += 20) { furn(x, -S + 1, true, 1); furn(x + 10, D + S - 4, true, 2); }
    for (let z = 23; z < D - 6; z += 22) {
      if (!lane(z) && !(info.alley === "w" && alleyZ(z))) furn(-S + 1, z, false, 3);
      if (!lane(z + 11) && !(info.alley === "e" && alleyZ(z + 11))) furn(W + S - 4, z + 11, false, 4);
    }
    // 四個角：路口的短石柱
    for (const [cx, cz] of [[-S + 2, -S + 2], [W + S - 4, -S + 2], [-S + 2, D + S - 4], [W + S - 4, D + S - 4]]) for (const [dx, dz] of [[0, 0], [3, 0], [0, 3]]) box(cx + (cx < 0 ? dx : -dx), 2, cz + (cz < 0 ? dz : -dz), cx + (cx < 0 ? dx : -dx) + 1, 5, cz + (cz < 0 ? dz : -dz) + 1, C.stoneD);
    // 消防栓、垃圾桶
    for (let k = 0; k < 4; k++) { const x = 4 + Math.floor(hash(k, info.seed, 1) * (W - 8)); box(x, 2, D + S - 4, x + 2, 6, D + S - 2, k % 2 ? 0xD8402A : 0x5A7E6A); }
    return { meshes: meshes(info), lamps: lamps.map(([x, z]) => [x * V, z * V]), crystals: crystals.map(([x, y, z]) => [x * V, y * V, z * V]) };
  }
  // 沒有地點的空格：小花園或背景小屋，讓街區不會空一塊
  function filler(three, info) {
    T = three; reset();
    const lamps = [], grass = GRASS[info.reg] || GRASS.central, pave = PAVE[info.reg] || PAVE.central, k = info.seed;
    box(-26, 0, -26, 26, 1, 26, (x, y, z) => (((x >> 4) + (z >> 4)) % 3 ? grass[0] : grass[1]));
    if (info.kind === "cottage") {
      const b = building({ x0: -14, z0: -18, w: 28, d: 22, h: 15, wall: info.wall, roof: "gable", roofC: [info.roof, mixC(info.roof, 0, 0.18)], box: true, door: { h: 9 } });
      box(-3, 0, 4, 3, 1, 26, (x, y, z) => (((x >> 1) + (z >> 1)) % 2 ? pave[0] : pave[1]));
      fence(-25, 22, 22, true); fence(4, 22, 22, true); flowerbed(-22, 9, -12, 14); bush(19, 12, 2.4, true);
      tree(18, -22, 24, 6); pine(-22, -22, 22);
    } else {
      box(-3, 0, -26, 3, 1, 26, (x, y, z) => (((x >> 1) + (z >> 1)) % 2 ? pave[0] : pave[1]));
      tree(-20, -18, 24, 7); tree(12, 8, 22, 6, [0x76A03A, 0x8CB040, 0x648F34]); pine(14, -20, 24); pine(-18, 14, 22);
      flowerbed(-14, -4, -6, 4); flowerbed(8, -12, 18, -6); bench(6, 14, true); hedge(-25, 20, -6, 23, 4); hedge(6, 20, 25, 23, 4);
      bush(-10, 18, 2.6, true); lampPost(4, -6, info.reg === "oldtown", lamps);
    }
    return { meshes: meshes(info), lamps: lamps.map(([x, z]) => [x * V, z * V]) };
  }
  /* 城邊沒蓋房子的格子：公園、廣場、社區菜園（info.kind），四周的人行道另外由 block() 蓋 */
  function park(three, w, d, info) {
    T = three; reset();
    const W = Math.round(w / V), D = Math.round(d / V), lamps = [], k = Math.abs(info.seed | 0) % 100000;
    const grass = GRASS[info.reg] || GRASS.central, pave = PAVE[info.reg] || PAVE.central, gas = info.reg === "oldtown";
    const R = n => hash(k, n, 41);
    const paveC = (x, z) => (((x >> 2) + (z >> 2)) % 2 ? pave[0] : pave[1]);
    if (info.kind === "plaza") {
      box(0, 0, 0, W, 1, D, (x, y, z) => { const r = Math.hypot(x - W / 2, z - D / 2); return Math.abs(r - 30) < 1.5 ? C.stoneD : paveC(x, z); });
      // 中間：魔導水晶方尖碑＋一圈水池
      const cx = W >> 1, cz = D >> 1;
      for (let x = cx - 14; x <= cx + 14; x++) for (let z = cz - 14; z <= cz + 14; z++) { const r = Math.hypot(x - cx, z - cz); if (r < 14 && r >= 12) box(x, 1, z, x + 1, 3, z + 1, C.stone); else if (r < 12) set(x, 1, z, (x + z) % 5 ? C.water : C.waterD); }
      box(cx - 3, 1, cz - 3, cx + 3, 6, cz + 3, C.stoneD); box(cx - 2, 6, cz - 2, cx + 2, 26, cz + 2, (x, y) => y % 6 === 0 ? C.gold : C.stone);
      for (let y = 26; y < 31; y++) for (let x = cx - 1; x <= cx; x++) for (let z = cz - 1; z <= cz; z++) light(x, y, z);
      lamps.push([cx, cz]);
      // 四角的樹（方形樹穴）、長椅、路燈
      for (const [x, z] of [[18, 22], [W - 22, 22], [18, D - 26], [W - 22, D - 26], [18, D >> 1], [W - 22, D >> 1]]) { box(x - 3, 1, z - 3, x + 5, 2, z + 5, C.stoneD); box(x - 2, 1, z - 2, x + 4, 2, z + 4, C.soil); tree(x, z, 24 + (x % 3) * 2, 6); }
      for (const [x, z, ax] of [[cx - 4, cz - 26, true], [cx - 4, cz + 25, true], [cx - 26, cz - 4, false], [cx + 25, cz - 4, false]]) bench(x, z, ax);
      for (const [x, z] of [[cx - 20, cz - 20], [cx + 20, cz + 20], [cx - 20, cz + 20], [cx + 20, cz - 20]]) lampPost(x, z, gas, lamps);
      flowerbed(6, 6, 30, 12); flowerbed(W - 30, D - 12, W - 6, D - 6);
    } else if (info.kind === "garden") {
      // 社區菜園：一畦一畦的作物、工具小屋、稻草人、水塔
      box(0, 0, 0, W, 1, D, (x, y, z) => grass[((x >> 4) + (z >> 4)) % 2]);
      const CROP = [[0x5A8634, 0xE8403A], [0x6A9A3C, 0xF4A040], [0x4E7A2E, 0x9A4AA8], [0x7AAA50, 0xF4D35E], [0x5E8A3A, 0x5E8A3A]];
      for (let r = 0; r < 5; r++) for (let q = 0; q < 2; q++) {
        const x0 = 8 + q * 54, z0 = 10 + r * 30, cr = CROP[(r + q + (k & 3)) % CROP.length];
        box(x0 - 1, 1, z0 - 1, x0 + 47, 2, z0 + 21, (x, y, z) => x === x0 - 1 || x === x0 + 46 || z === z0 - 1 || z === z0 + 20 ? C.woodD : C.soil);
        for (let z = z0 + 1; z < z0 + 19; z += 3) for (let x = x0 + 1; x < x0 + 45; x++) { set(x, 2, z, cr[0]); if (hash(x, z, k) < 0.25) set(x, 3, z, cr[1]); }
      }
      box(W - 26, 0, D - 26, W - 4, 1, D - 4, C.stoneD);
      shell(W - 24, 1, D - 24, W - 8, 14, D - 8, (x, y) => y % 3 === 0 ? C.woodD : C.wood);
      for (let x = W - 26; x < W - 6; x++) for (let z = D - 26; z < D - 6; z++) set(x, 14 + Math.min(Math.abs(z - (D - 16)), 9) * -0 + 0, z, x % 2 ? 0x8A4E3A : 0x7A4434);
      // 稻草人
      box(56, 1, 70, 57, 16, 71, C.wood); box(51, 11, 70, 62, 12, 71, C.wood); box(55, 15, 69, 58, 19, 72, 0xE8C878); box(54, 19, 69, 59, 20, 72, 0x8A4E3A);
      // 水塔
      box(6, 1, D - 20, 7, 18, D - 19, C.wood); box(16, 1, D - 20, 17, 18, D - 19, C.wood); box(6, 1, D - 10, 7, 18, D - 9, C.wood); box(16, 1, D - 10, 17, 18, D - 9, C.wood);
      box(5, 18, D - 21, 18, 28, D - 8, (x, y) => y % 3 ? 0x7A9AAA : 0x5A7A8A);
      fence(0, 0, W, true); fence(0, D - 1, W - 30, true); lampPost(W >> 1, D - 4, gas, lamps);
    } else {
      // 公園：草地、彎曲的小路、池塘（小木橋）、樹、長椅、花圃
      box(0, 0, 0, W, 1, D, (x, y, z) => grass[((x >> 3) + (z >> 3) + (hash(x >> 3, 1, z >> 3) < 0.3 ? 1 : 0)) % 2]);
      const path = z => (W >> 1) + Math.round(Math.sin(z / 23 + k) * 22);
      for (let z = 0; z < D; z++) { const c = path(z); for (let x = c - 4; x <= c + 4; x++) set(x, 0, z, paveC(x, z)); }
      for (let x = 0; x < W; x++) { const z0 = (D >> 1) + Math.round(Math.sin(x / 17 + k * 2) * 8); for (let z = z0 - 3; z <= z0 + 3; z++) set(x, 0, z, paveC(x, z)); }
      const pz = R(1) < 0.5 ? 38 : D - 40, px = path(pz) < W / 2 ? W - 32 : 30;
      for (let x = px - 22; x <= px + 22; x++) for (let z = pz - 18; z <= pz + 18; z++) {
        const e = ((x - px) / 20) ** 2 + ((z - pz) / 15) ** 2 + hash(x >> 2, 3, z >> 2) * 0.15;
        if (e < 1) set(x, 0, z, e > 0.8 ? C.stoneD : (x + z) % 7 ? C.water : C.waterD);
        if (e < 0.25 && hash(x, 5, z) < 0.04) { set(x, 1, z, 0x5A9A5A); }
      }
      for (let x = px - 4; x < px + 4; x++) for (let z = pz - 17; z <= pz + 17; z++) { const a = Math.round(2 - 2 * ((z - pz) / 17) ** 2); set(x, 1 + a, z, (z % 2) ? C.wood : C.woodD); if (x === px - 4 || x === px + 3) set(x, 2 + a, z, C.woodD); }
      const spots = [[14, 14], [W - 18, 20], [20, D - 22], [W - 20, D - 18], [16, D >> 1], [W - 14, (D >> 1) + 20], [30, 60], [W - 34, D - 70], [24, 110], [W - 26, 100]];
      spots.forEach(([x, z], n) => { if (Math.abs(x - path(z)) < 10 || (Math.abs(x - px) < 26 && Math.abs(z - pz) < 22)) return; if (n % 4 === 3) pine(x, z, 22 + n % 3 * 2); else tree(x, z, 22 + (n % 3) * 3, 5 + (n % 2), n % 2 ? [0x76A03A, 0x8CB040, 0x648F34] : null); });
      for (const z of [26, 80, 134]) { const c = path(z); bench(c + 6, z, false); }
      for (const z of [50, 120]) lampPost(path(z) - 6, z, gas, lamps);
      flowerbed(4, 66, 22, 76); flowerbed(W - 22, 140, W - 4, 150); bush(W - 8, 58, 2.6, true); bush(8, 150, 2.4, true);
    }
    return { meshes: meshes(info), lamps: lamps.map(([x, z]) => [x * V, z * V]) };
  }
  /* 港邊的格子：倉庫、貨櫃、木箱、漁網架（靠海那邊是街，再過去才是碼頭步道） */
  function harbor(three, w, d, info) {
    T = three; reset();
    const W = Math.round(w / V), D = Math.round(d / V), lamps = [], k = Math.abs(info.seed | 0) % 100000;
    box(0, 0, 0, W, 1, D, (x, y, z) => (((x >> 3) + (z >> 3)) % 2 ? 0xA8A090 : 0x9C9484));
    // 倉庫：紅磚、拱形大門朝街（西邊）、山牆屋頂
    const WALL = [[0xB4583E, 0x9A4834], [0x8A9A8A, 0x7A8A7A], [0xC8B898, 0xB8A888]];
    const ware = (z0, len, ci) => {
      const x0 = 8, x1 = W - 26, h = 34, wc = WALL[ci % WALL.length];
      shell(x0, 1, z0, x1, h, z0 + len, (x, y, z) => y % 5 === 0 ? wc[1] : ((x + z) >> 1) % 7 ? wc[0] : wc[1]);
      for (let z = z0; z < z0 + len; z++) for (let i = 0; i <= (x1 - x0) / 2 + 1; i++) { const y = h + Math.min(i, (x1 - x0) / 2 + 1 - i) * 0.7; set(x0 - 1 + i, Math.round(y), z, z % 4 ? 0x5A6068 : 0x4A5058); set(x1 - i, Math.round(y), z, z % 4 ? 0x5A6068 : 0x4A5058); }
      for (let z = z0; z < z0 + len; z++) for (let y = h; y < h + (x1 - x0) * 0.35; y++) { const half = (y - h) / 0.7; if (x0 + half < x1 - half) { set(Math.round(x0 + half), y, z0, wc[0]); set(Math.round(x0 + half), y, z0 + len - 1, wc[0]); } }
      // 大門（朝 -x：街）＋門上的號碼燈
      const dz = z0 + (len >> 1) - 7;
      for (let z = dz; z < dz + 14; z++) for (let y = 1; y < 22; y++) { const arch = y > 18 && Math.abs(z - dz - 6.5) > 7 - (22 - y) * 1.6; if (!arch) set(x0, y, z, (z - dz) % 3 === 0 ? 0x4A3020 : 0x6A4A30); }
      for (let z = dz - 1; z <= dz + 14; z++) set(x0 - 1, 22, z, C.white);
      set(x0 - 1, 25, dz + 6, 0xF4E8C0); light(x0 - 1, 26, dz + 6); light(x0 - 1, 26, dz + 7); lamps.push([x0 - 2, dz + 7]);
      for (let z = z0 + 4; z < z0 + len - 4; z += 9) if (Math.abs(z - dz - 7) > 10) for (let y = 24; y < 30; y++) for (let q = 0; q < 4; q++) glass(x0, y, z + q);
    };
    ware(6, 70, k); ware(D - 80, 74, k + 1);
    // 中間：貨櫃堆、木箱、漁網架
    const CON = [0xC8402A, 0x3A6ABA, 0x4A8A5A, 0xE8A040, 0x8A8E96];
    const con = (x, y, z, c) => box(x, y, z, x + 30, y + 13, z + 12, (a, b, q) => (a - x) % 3 === 0 ? mixC(c, 0x000000, 0.18) : c);
    con(14, 1, 82, CON[k % 5]); con(14, 14, 82, CON[(k + 2) % 5]); con(48, 1, 84, CON[(k + 3) % 5]);
    crates(20, 72); crates(70, 76);
    for (let i = 0; i < 2; i++) { const x = 52 + i * 18; box(x, 1, 74, x + 1, 14, 75, C.wood); box(x + 12, 1, 74, x + 13, 14, 75, C.wood); for (let a = x; a <= x + 12; a++) for (let y = 7; y < 14; y++) if ((a + y) % 2) set(a, y, 74, 0x8A9A7A); }
    lampPost(W - 14, 30, true, lamps); lampPost(W - 14, D - 30, true, lamps);
    return { meshes: meshes(info), lamps: lamps.map(([x, z]) => [x * V, z * V]) };
  }
  N.voxTown = { lot, block, filler, park, harbor, V };
})();
