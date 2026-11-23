/* 諾文小鎮：風格交錯和疊加的試做（?scene=mix）
 * 一排連在一起的房子，每一層樓可以是不同風格：歐式 E、中式 C、日式 J、賽博龐克 Y。
 * 例：["E","J"] = 一樓歐式店面、二樓日式木造；["C","C","Y"] = 中式老房子頂上加蓋賽博龐克。
 * 中間是鐘塔廣場，前面是街道和夜市攤位。白天、晚上可以切換，晚上每種風格的燈不一樣。 */
(function () {
  "use strict";
  const N = window.NOVUM, VR = N.voxRoom, K = VR._k, V = VR.V;
  const { Grid, vfurn, placer, toMeshes, mix, hashI, F_GLOW, F_WIN, F_NOAO } = K;
  let T;
  const FH = 30;   // 一層樓 3 公尺
  const H = (x, y, z) => hashI(x, y, z);

  /* ── 每種風格的牆 ── */
  const WALL = {
    E: (p) => (x, y, z) => mix(p.wall, H(x, y, z) < 0.5 ? 0xFFFFFF : 0x000000, H(x * 3, y, z * 7) * 0.05),
    C: (p, b) => (x, y, z) => {
      if (x === b.x0 || x === b.x1 - 1) return 0x7A2A20;                                   // 紅木柱
      const row = Math.floor(y / 2), off = row % 2 ? 2 : 0;
      if (y % 2 === 0 || (x + off) % 5 === 0) return 0x9A9890;                             // 灰縫
      return mix(p.wall || 0x6E747C, 0x000000, H(x >> 1, row, z) * 0.12);                  // 青灰磚
    },
    J: (p, b, ya, yb) => (x, y, z) => {
      const k = (y - ya) / (yb - ya);
      if (k > 0.68) return y === yb - 1 ? 0x3A2418 : mix(0xEEE6D6, 0x000000, H(x, y, z) * 0.04);   // 上段白灰泥
      return (x % 2) ? 0x4E3424 : 0x3A2618;                                                  // 下段深色木板
    },
    Y: (p) => (x, y, z) => {
      if (x % 9 === 0 || y % 10 === 0) return 0x3E424A;                                       // 金屬板接縫
      const rust = H(x, 0, z) < 0.12 && H(x, y >> 3, 1) < 0.5 ? 0.15 : 0;
      return mix(mix(p.wall || 0x5E626C, 0x8A5A3A, rust), 0x000000, H(x >> 2, y >> 2, z) * 0.08);
    }
  };

  function box(G, x0, y0, z0, x1, y1, z1, c, f) {
    for (let x = x0; x < x1; x++) for (let y = y0; y < y1; y++) for (let z = z0; z < z1; z++) {
      const cc = typeof c === "function" ? c(x, y, z) : c; if (cc != null) G.set(x, y, z, cc, f || 0);
    }
  }

  /* ── 一層樓：牆＋窗＋這層樓的小東西 ── */
  function storey(G, b, f, st, p, lights, under) {
    const ya = f === 0 ? 4 : f * FH, yb = (f + 1) * FH, wf = WALL[st](p, b, ya, yb);
    const { x0, x1, z0, z1 } = b, zf = z1 - 1;
    for (let y = ya; y < yb; y++) for (let x = x0; x < x1; x++) for (let z = z0; z < z1; z++) {
      if (!(x === x0 || x === x1 - 1 || z === z0 || z === zf)) continue;
      G.set(x, y, z, wf(x, y, z), 0);
    }
    const w = x1 - x0, n = Math.max(1, Math.floor((w - 6) / 14));
    const slots = []; for (let k = 0; k < n; k++) slots.push(x0 + Math.round((k + 0.5) * w / n));
    const ground = f === 0;
    if (st === "E") {
      if (ground) {
        // 店面：大玻璃櫥窗＋門＋條紋遮陽棚
        const dx = slots[0] - 5;
        for (let i = 0; i < 10; i++) for (let j = 4; j < 25; j++) G.set(dx + i, j, zf, i === 0 || i === 9 || j === 24 ? p.frame : (i === 5 ? 0x5A3A22 : p.door), 0);
        for (let k = 1; k < slots.length; k++) win(G, slots[k] - 6, 9, zf, 12, 13, p.frame, 0xF8E2A8, true);
        if (slots.length === 1) win(G, x1 - 14, 9, zf, 10, 13, p.frame, 0xF8E2A8, true);
        for (let x = x0 + 1; x < x1 - 1; x++) for (let k = 0; k < 8; k++) { const y = 28 - Math.floor(k * 0.6), c = ((x - x0) >> 2) % 2 ? p.awning : 0xF4F0E8; G.set(x, y, z1 + k, c, 0); if (k === 7) G.set(x, y - 1, z1 + k, c, 0); }
        G.set(dx - 2, 18, z1, 0x2E3238, 0); G.set(dx - 2, 17, z1, 0xFFC878, F_GLOW); lights.push({ x: (dx - 2) * V, y: 1.75, z: (z1 + 1) * V, c: 0xFF9A48, p: 0.6 });
      } else for (const sx of slots) {
        win(G, sx - 4, ya + 9, zf, 9, 13, p.frame, 0xF6DCA0);
        for (const s of [-4, 10]) for (let i = 0; i < 3; i++) for (let j = 0; j < 13; j++) G.set(sx - 4 + s + i, ya + 9 + j, z1, j % 3 ? p.shutter : mix(p.shutter, 0x000000, 0.15), 0);
        for (let i = -1; i <= 9; i++) { G.set(sx - 4 + i, ya + 7, z1, 0x8A4E30, 0); if (H(i, f, sx) < 0.7) G.set(sx - 4 + i, ya + 8, z1, [0xF0607A, 0xF4D35E, 0xFFFFFF, 0x5E9A4E][Math.floor(H(sx, i, 2) * 4)], 0); }
      }
      // 樓層之間的線腳
      for (let x = x0 - 1; x <= x1; x++) G.set(x, yb - 1, z1, p.trim, 0);
    } else if (st === "C") {
      if (ground) {
        // 木頭店面：一片一片的摺門，上面掛紅燈籠
        for (let x = x0 + 2; x < x1 - 2; x++) for (let y = 4; y < 24; y++) {
          const open = (x - x0) % 6 !== 0 && H(x >> 1, 3, 1) < 0.4 && y > 8 && y < 20;
          if (open) { G.m.delete(((x + 512) * 1024 + (y + 512)) * 1024 + (zf + 512)); G.set(x, y, zf - 1, 0xFFD890, F_WIN); }
          else G.set(x, y, zf, (x - x0) % 6 === 0 ? 0x5A1E16 : y % 6 === 0 ? 0x6A2A1E : 0x8A3A26, 0);
        }
        for (const sx of slots) lantern(G, sx, 24, z1 + 2, 0xE8382A, lights);
        // 招牌橫匾
        box(G, x0 + 4, 25, z1, x1 - 4, 28, z1 + 1, (x, y) => y === 25 || y === 27 ? 0xC8A040 : 0x2A1A14);
      } else for (const sx of slots) {
        // 木格窗：格子裡透出燈光
        for (let i = 0; i < 11; i++) for (let j = 0; j < 12; j++) {
          const fr = i === 0 || i === 10 || j === 0 || j === 11 || i % 3 === 0 || j % 3 === 0;
          G.set(sx - 5 + i, ya + 9 + j, zf, fr ? 0x6A2418 : 0xF4D8A0, fr ? 0 : F_WIN);
        }
      }
      // 每層的屋簷：紅色橫樑＋一排瓦
      for (let x = x0 - 2; x < x1 + 2; x++) { G.set(x, yb - 2, z1, 0x8A2A1E, 0); for (let k = 0; k < 3; k++) G.set(x, yb - 1 + (k === 2 ? -1 : 0), z1 + k, (x + k) % 3 ? 0x4A4E56 : 0x3A3E46, 0); }
    } else if (st === "J") {
      if (ground) {
        // 格子拉門＋暖簾＋門邊的紙燈籠
        const dx = slots[0] - 6;
        for (let i = 0; i < 12; i++) for (let j = 4; j < 22; j++) G.set(dx + i, j, zf, i % 2 ? 0x3A2418 : 0xF4E4C0, i % 2 ? 0 : F_WIN);
        for (let i = 0; i < 12; i++) for (let j = 15; j < 22; j++) if (i % 4 !== 3) G.set(dx + i, j, z1, j === 18 && (i === 5 || i === 6) ? 0xF4F0E8 : 0x2E3E6A, 0);   // 靛藍暖簾
        for (let k = 1; k < slots.length; k++) for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) { if (i % 2) G.set(slots[k] - 5 + i, 9 + j, z1, 0x3A2418, 0); G.set(slots[k] - 5 + i, 9 + j, zf, 0xF4E4C0, F_WIN); }
        paperLantern(G, dx - 3, 14, z1 + 1, lights);
      } else for (const sx of slots) for (let i = 0; i < 11; i++) for (let j = 0; j < 9; j++) {
        G.set(sx - 5 + i, ya + 8 + j, zf, 0xF4E4C0, F_WIN);
        if (i % 2 === 0 || j === 0 || j === 8) G.set(sx - 5 + i, ya + 8 + j, z1, 0x3A2418, 0);
      }
      // 每層之間的小屋簷（庇）
      for (let x = x0 - 1; x <= x1; x++) for (let k = 0; k < 4; k++) G.set(x, yb - 1 - (k >> 1), z1 + k, (x % 2) ? 0x4A4C52 : 0x3E4046, 0);
    } else if (st === "Y") {
      if (ground) {
        // 鐵捲門＋發光招牌
        for (let x = x0 + 2; x < x1 - 2; x++) for (let y = 4; y < 22; y++) G.set(x, y, zf, y % 2 ? 0x7A808A : 0x6A7078, 0);
        box(G, x0 + 3, 23, z1, x1 - 3, 27, z1 + 1, (x, y) => (y === 23 || y === 26) ? 0x22242A : (x % 3 ? p.neon : 0xFFFFFF), F_GLOW);
        lights.push({ x: (x0 + x1) / 2 * V, y: 2.5, z: (z1 + 4) * V, c: p.neon, p: 0.9 });
      } else {
        // 長條窗＋冷氣機＋管線
        for (let x = x0 + 3; x < x1 - 3; x++) for (let j = 0; j < 5; j++) G.set(x, ya + 12 + j, zf, j === 0 || j === 4 ? 0x2A2C32 : mix(0x9AE8F0, 0x5AA8C8, H(x, j, f) * 0.5), j === 0 || j === 4 ? 0 : F_WIN);
        const ax = x0 + 4 + Math.floor(H(f, x0, 3) * (w - 12));
        box(G, ax, ya + 5, z1, ax + 5, ya + 9, z1 + 3, (x, y, z) => (x + y) % 2 ? 0xC8CCD2 : 0xA8ACB4);
        for (let y = ya; y < yb; y++) G.set(x1 - 3, y, z1, 0x8A8E96, 0);
      }
      // 樓板邊的霓虹燈管
      for (let x = x0; x < x1; x++) G.set(x, yb - 1, z1, (f % 2) ? 0xFF4AC8 : 0x4AE8FF, F_GLOW);
      if (!ground) lights.push({ x: (x0 + x1) / 2 * V, y: (yb - 1) * V, z: (z1 + 2) * V, c: (f % 2) ? 0xFF4AC8 : 0x4AE8FF, p: 0.55 });
      // 直立的霓虹招牌
      if (f === 1 || (under && under !== "Y" && f > 0)) {
        const sx = x1 - 6;
        for (let y = ya + 2; y < yb - 4; y++) for (let k = 0; k < 4; k++) G.set(sx, y, z1 + 1 + k, (k === 0 || k === 3 || y === ya + 2 || y === yb - 5) ? 0x22242A : ((y >> 1) % 2 ? p.neon : 0xFFFFFF), (k === 0 || k === 3 || y === ya + 2 || y === yb - 5) ? 0 : F_GLOW);
        lights.push({ x: sx * V, y: (ya + 15) * V, z: (z1 + 3) * V, c: p.neon, p: 1 });
      }
    }
  }
  function win(G, x0, y0, z, w, h, frame, glass, shop) {
    for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) {
      const fr = i === 0 || i === w - 1 || j === 0 || j === h - 1 || (!shop && i === (w >> 1)) || j === 8;
      G.set(x0 + i, y0 + j, z, fr ? frame : glass, fr ? 0 : F_WIN);
    }
    for (let i = -1; i <= w; i++) G.set(x0 + i, y0 - 1, z + 1, 0xE8DCC8, 0);
  }
  function lantern(G, x, y, z, c, lights) {
    G.set(x, y, z, 0x3A2A20, 0);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (let dy = -3; dy <= -1; dy++) if (Math.abs(dx) + Math.abs(dz) < 2 || dy === -2) G.set(x + dx, y + dy, z + dz, c, F_GLOW);
    G.set(x, y - 4, z, 0xC8A040, 0);
    lights.push({ x: x * V, y: (y - 2) * V, z: z * V, c: 0xFF5A30, p: 0.55 });
  }
  function paperLantern(G, x, y, z, lights) {
    for (let dy = 0; dy < 5; dy++) for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) G.set(x + dx, y + dy, z + dz, dy === 0 || dy === 4 ? 0x2A2420 : 0xFFF0D0, dy === 0 || dy === 4 ? 0 : F_GLOW);
    lights.push({ x: x * V, y: (y + 2) * V, z: z * V, c: 0xFFC890, p: 0.5 });
  }

  /* ── 屋頂：看最上面那層的風格 ── */
  function roof(G, b, fl, st, p) {
    const { x0, x1, z0, z1 } = b, Ht = fl * FH, d = z1 - z0;
    if (st === "Y") {
      // 平屋頂：女兒牆、水塔、天線
      box(G, x0, Ht, z0, x1, Ht + 3, z1, (x, y, z) => (x === x0 || x === x1 - 1 || z === z0 || z === z1 - 1) ? 0x4A4E56 : (y === Ht ? 0x3A3E46 : null));
      box(G, x0 + 4, Ht, z0 + 6, x0 + 12, Ht + 10, z0 + 14, (x, y) => y > Ht + 2 ? ((y % 3) ? 0x8A9098 : 0x6A7078) : 0x3A3E46);
      for (let y = Ht; y < Ht + 18; y++) G.set(x1 - 6, y, z0 + 10, 0x9A9EA6, 0);
      G.set(x1 - 6, Ht + 18, z0 + 10, 0xFF3A3A, F_GLOW);
      return;
    }
    const ov = st === "J" ? 4 : st === "C" ? 4 : 2, slope = st === "J" ? 0.6 : st === "C" ? 0.75 : 1;
    const tileC = st === "E" ? p.roof : st === "C" ? 0x3E424A : 0x4A4C54;
    const span = d + ov * 2, rise = Math.ceil(span / 2 * slope);
    for (let k = 0; k < span / 2; k++) {
      const y = Ht + Math.floor(k * slope), za = z0 - ov + k, zb = z1 + ov - 1 - k;
      for (let x = x0 - ov; x < x1 + ov; x++) {
        // 中式：兩端翹起來
        const lift = st === "C" && (x < x0 - ov + 3 || x > x1 + ov - 4) && k < 3 ? 1 : 0;
        const c = mix(tileC, 0x000000, ((x + k * 2) % 4 === 0 ? 0.16 : 0) + H(x, k, 1) * 0.06);
        G.set(x, y + lift, za, c, 0); G.set(x, y + lift, zb, c, 0);
      }
      for (const x of [x0, x1 - 1]) for (let z = za + 1; z < zb; z++) G.set(x, y, z, st === "E" ? mix(p.wall, 0x000000, 0.03) : st === "C" ? 0x6E747C : 0xEEE6D6, 0);
    }
    if (st === "C") {   // 屋脊兩端的裝飾
      const top = Ht + Math.floor((span / 2 - 1) * slope) + 1, zc = Math.round((z0 + z1) / 2);
      for (let x = x0 - ov; x < x1 + ov; x++) G.set(x, top, zc, 0x2E3238, 0);
      for (const x of [x0 - ov, x1 + ov - 1]) for (let y = top; y < top + 3; y++) G.set(x, y, zc, 0x2E3238, 0);
    }
    if (st === "E" && p.chimney) box(G, x1 - 8, Ht, z0 + 4, x1 - 4, Ht + rise + 4, z0 + 8, (x, y) => mix(0xB06A4A, 0x000000, (y % 3 === 0) ? 0.2 : 0));
  }

  /* ── 一棟：每層樓的風格 ── */
  function building(G, x0, z0, w, d, floors, p, lights) {
    const b = { x0, x1: x0 + w, z0, z1: z0 + d };
    box(G, x0 - 1, 0, z0 - 1, x0 + w + 1, 4, z0 + d + 1, (x, y, z) => mix(floors[0] === "Y" ? 0x4A4E56 : 0xB8AC98, 0x000000, H(x, y, z) * 0.12));
    floors.forEach((st, f) => storey(G, b, f, st, p, lights, f ? floors[f - 1] : null));
    roof(G, b, floors.length, floors[floors.length - 1], p);
  }

  /* ── 鐘塔 ── */
  function clockTower(G, cx, cz, lights) {
    const s = 14, x0 = cx - s / 2, z0 = cz - s / 2, h = 90;
    box(G, x0 - 2, 0, z0 - 2, x0 + s + 2, 6, z0 + s + 2, (x, y, z) => mix(0xC8BCA8, 0x000000, H(x, y, z) * 0.1));
    box(G, x0, 6, z0, x0 + s, h, z0 + s, (x, y, z) => (x === x0 || x === x0 + s - 1) && (z === z0 || z === z0 + s - 1) ? 0xB8AC98 : (y % 12 === 0 ? 0xD8CCB8 : mix(0xE8DCC4, 0x000000, H(x, y, z) * 0.06)));
    // 鐘面（四面）
    for (const [dx, dz, ax] of [[0, s, 1], [0, -1, 1], [-1, 0, 0], [s, 0, 0]]) for (let i = -4; i <= 4; i++) for (let j = -4; j <= 4; j++) {
      const r = Math.hypot(i, j); if (r > 4.5) continue;
      const x = ax ? cx + i : x0 + dx, z = ax ? z0 + dz : cz + i, y = 72 + j;
      const hand = (i === 0 && j >= 0 && j < 4) || (j === 0 && i >= 0 && i < 3);
      G.set(x, y, z, r > 3.6 ? 0xC8A040 : hand ? 0x2A2420 : 0xFFF4D8, r > 3.6 || hand ? 0 : F_GLOW);
    }
    // 尖頂
    for (let k = 0; k < 10; k++) box(G, x0 - 1 + k, h + k * 2, z0 - 1 + k, x0 + s + 1 - k, h + k * 2 + 2, z0 + s + 1 - k, (x, y, z) => mix(0x3E6A6A, 0x000000, ((x + z) % 3 === 0) ? 0.15 : 0));
    lights.push({ x: cx * V, y: 7.2, z: (z0 + s + 1) * V, c: 0xFFD8A0, p: 0.8 });
  }

  function scene() {
    const G = new Grid(), lights = [];
    const X0 = -170, X1 = 170, Z0 = -95, Z1 = 85;
    for (let x = X0; x < X1; x++) for (let z = Z0; z < Z1; z++) {
      let c;
      if (z < 6) c = (x % 8 === 0 || z % 8 === 0) ? 0xC8BCA8 : mix(0xE4DACA, 0x000000, H(x >> 3, 0, z >> 3) * 0.08);
      else if (z < 8) c = 0xB0A490;
      else { const bx = (x + ((z >> 2) % 2) * 2) >> 2; c = ((x + ((z >> 2) % 2) * 2) % 4 === 0 || z % 4 === 0) ? 0x8A8070 : mix(0xA89C88, 0x000000, H(bx, 1, z >> 2) * 0.12); }
      // 廣場：圓形石板
      const dp = Math.hypot(x, (z - 30) * 1.1);
      if (dp < 38 && z > -40) c = Math.floor(dp) % 5 === 0 ? 0xC8BCA8 : mix(0xE8DECE, 0x000000, H(x >> 2, 3, z >> 2) * 0.07);
      G.set(x, -1, z, c, F_NOAO); G.set(x, -2, z, 0x6E5A44, F_NOAO);
    }
    // 交錯、疊加的一排房子（左右兩段，中間是廣場）
    const E = { wall: 0xF4E8D4, trim: 0xE0D0B8, frame: 0xF8F4EC, roof: 0xC8643E, door: 0x7A4A2E, shutter: 0x4E8A8A, awning: 0xD84A4A, chimney: true };
    const E2 = { wall: 0xBFD8E8, trim: 0xE8EEF2, frame: 0xF8F4EC, roof: 0x5A6E8A, door: 0x3E5A7A, shutter: 0xF4E8D4, awning: 0x3E6A9A };
    const E3 = { wall: 0xF6CCD6, trim: 0xFFF0F2, frame: 0xFFFFFF, roof: 0xB85A3A, door: 0x6A8A6A, shutter: 0x6A9A7A, awning: 0xE07A96, chimney: true };
    const C = { wall: 0x6E747C }, J = {}, Y1 = { wall: 0x5E626C, neon: 0xFF4AC8 }, Y2 = { wall: 0x52565E, neon: 0x4AE8FF };
    const row = [
      [44, ["C", "C"], C], [40, ["C", "C", "Y"], Object.assign({}, C, Y1)], [38, ["J", "J"], J], [50, ["E", "J"], E],
      [0, null], // 廣場
      [50, ["E", "E", "E"], E2], [44, ["E", "E", "J"], E3], [42, ["Y", "Y", "Y", "Y"], Y2], [40, ["J", "E"], E]
    ];
    let total = row.reduce((a, r) => a + (r[1] ? r[0] : 90), 0), x = -Math.round(total / 2);
    for (const [w, fl, p] of row) {
      if (!fl) { clockTower(G, x + 45, -52, lights); x += 90; continue; }
      building(G, x, -88, w, 46, fl, Object.assign({ neon: 0xFF4AC8 }, p), lights); x += w;
    }
    // 街上：夜市攤位、路燈、樹
    const P = (t, xm, zm, o) => vfurn(t, o || {}, placer(G, xm, zm, (o && o.rot) || 0, lights.fake || (lights.fake = [])), (o && o.c) || 0x8E6A45, {});
    for (const [xm, c] of [[-12.5, 0xC0603F], [-9.8, 0x5E8A58], [9.8, 0x3E6A9A], [12.5, 0xC88E3A]]) { P("stall", xm, 3.2, { c }); lantern(G, Math.round(xm / V), 30, 32, xm < 0 ? 0xE8382A : 0xFF4AC8, lights); }
    for (const xm of [-15.5, -6.2, 6.2, 15.5]) { P("streetlamp", xm, 0.6); lights.push({ x: xm, y: 2.1, z: 0.6, c: 0xFFA050, p: 0.8 }); }
    P("bench2", -3.2, 5.6, { c: 0x8A5E3E }); P("bench2", 3.2, 5.6, { c: 0x8A5E3E }); P("flowers", -1.8, 6.6); P("flowers", 1.8, 6.6);
    return { G, lights };
  }

  function start(el) {
    T = window.THREE;
    const renderer = new T.WebGLRenderer({ antialias: true });
    const pr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(pr); renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
    el.appendChild(renderer.domElement);
    const sc = new T.Scene(); sc.fog = new T.Fog(0xBFE0EC, 62, 120);
    const { G, lights } = scene();
    const ms = toMeshes(T, G), g = new T.Group();
    for (const k of ["solid", "glow", "win"]) if (ms[k]) g.add(ms[k]);
    sc.add(g);
    const hemi = new T.HemisphereLight(0xDDEEFF, 0xC8A880, 0.75); sc.add(hemi);
    const sun = new T.DirectionalLight(0xFFF0D8, 0.95); sun.position.set(-18, 26, 14); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048); const s = sun.shadow.camera; s.left = -22; s.right = 22; s.top = 18; s.bottom = -18; s.near = 1; s.far = 90; sun.shadow.bias = -0.0008; sun.shadow.radius = 4; sc.add(sun);
    // 夜晚的燈：挑最亮、彼此不要太近的 16 盞
    const pick = []; for (const L of lights.slice().sort((a, b) => b.p - a.p)) { if (pick.some(q => Math.hypot(q.x - L.x, q.z - L.z) < 1.6)) continue; pick.push(L); if (pick.length >= 14) break; }
    const pl = pick.map(L => { const p = new T.PointLight(L.c, 0, 5, 1.2); p.position.set(L.x, L.y, L.z); p.userData.p = L.p; sc.add(p); return p; });
    // 人
    for (const [id, x, z, yaw] of [["史威特", -2.5, 2.2, 0.4], ["沏萊爾", -1.9, 2.7, -2.4], ["佐代", 7.2, 4.6, 2.6], ["禮", 7.8, 4.0, -0.6], ["星星", -11.2, 4.6, 3.1], ["ミニクイ", 12.4, 4.4, 2.9]]) {
      if (!N.blocky || !N.blocky.has(id)) continue;
      const c = N.blocky.make(T, id); c.root.position.set(x, 0, z); c.root.rotation.y = yaw; sc.add(c.root); c.root.traverse(o => { if (o.isMesh) o.castShadow = true; });
    }
    const cam = new T.PerspectiveCamera(26, 1, 1, 400);
    let az = 0.5, el2 = 0.55, dist = 56; const tgt = new T.Vector3(0, 2.2, -2);
    const place = () => { cam.position.set(tgt.x + Math.sin(az) * Math.cos(el2) * dist, tgt.y + Math.sin(el2) * dist, tgt.z + Math.cos(az) * Math.cos(el2) * dist); cam.lookAt(tgt); };
    const fit = () => { renderer.setSize(el.clientWidth, el.clientHeight); cam.aspect = el.clientWidth / el.clientHeight; cam.updateProjectionMatrix(); };
    window.addEventListener("resize", fit); fit();
    let drag = null;
    el.addEventListener("pointerdown", e => { drag = { x: e.clientX, y: e.clientY, az, el2 }; });
    window.addEventListener("pointermove", e => { if (!drag) return; az = drag.az - (e.clientX - drag.x) * 0.005; el2 = Math.max(0.2, Math.min(1.2, drag.el2 + (e.clientY - drag.y) * 0.004)); });
    window.addEventListener("pointerup", () => { drag = null; });
    el.addEventListener("wheel", e => { e.preventDefault(); dist = Math.max(12, Math.min(110, dist * (1 + e.deltaY * 0.001))); }, { passive: false });
    function setTime(night) {
      renderer.setClearColor(night ? 0x141828 : 0xBFE0EC); sc.fog.color.set(night ? 0x1A1E30 : 0xBFE0EC);
      hemi.color.set(night ? 0x4A5288 : 0xDDEEFF); hemi.groundColor.set(night ? 0x3A2A30 : 0xC8A880); hemi.intensity = night ? 0.5 : 0.75;
      sun.color.set(night ? 0x8090C8 : 0xFFF0D8); sun.intensity = night ? 0.12 : 0.95;
      pl.forEach(p => { p.intensity = night ? 1.6 * p.userData.p : 0; p.distance = 7; });
      ms.winMat.color.setScalar(night ? 1 : 0.62);
      if (ms.glow) ms.glow.material.color.setScalar(night ? 1 : 0.85);
    }
    const bar = document.createElement("div"); bar.style.cssText = "position:fixed;right:12px;top:10px;display:flex;gap:6px";
    bar.innerHTML = `<button data-t="0" style="padding:9px 14px;border:0;border-radius:10px;background:#fff;font:inherit;font-weight:700;cursor:pointer">☀️ 白天</button><button data-t="1" style="padding:9px 14px;border:0;border-radius:10px;background:#fff;font:inherit;font-weight:700;cursor:pointer">🌙 晚上</button>`;
    bar.onclick = e => { const b = e.target.closest("[data-t]"); if (b) { setTime(b.dataset.t === "1"); dirty = 2; } };
    document.body.appendChild(bar);
    setTime(new URLSearchParams(location.search).get("t") === "night");
    window.PROTO = { setView: (a, e, d, x, z) => { az = a; el2 = e; dist = d; if (x != null) tgt.set(x, 2.2, z); dirty = 2; }, setTime: n => { setTime(n); dirty = 2; }, count: ms.count };
    let dirty = 2; const mark = () => { dirty = 2; }; ['pointermove', 'wheel', 'resize'].forEach(ev => window.addEventListener(ev, mark));
    const loop = () => { requestAnimationFrame(loop); if (!dirty) return; dirty--; place(); renderer.render(sc, cam); };
    loop();
  }
  N.protoMix = { start };
})();
