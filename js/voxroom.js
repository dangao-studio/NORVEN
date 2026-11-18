/* 諾文小鎮：體素房間
 * 每個房間用 0.1 公尺的小方塊真的堆出來：地板、牆、家具、擺設。
 * 每顆方塊依旁邊有沒有東西決定明暗（角落陰影），再加一點隨機深淺。
 * 家具的座位位置沿用 town3d 的 furn()，這裡只負責「長什麼樣子」。
 */
(function () {
  "use strict";
  const N = window.NOVUM = window.NOVUM || {};
  const V = 0.1;

  /* ── 方塊格子 ── */
  function Grid() { this.m = new Map(); }
  const K = (x, y, z) => ((x + 512) * 1024 + (y + 512)) * 1024 + (z + 512);
  Grid.prototype.set = function (x, y, z, c, f) { this.m.set(K(x, y, z), { x, y, z, c, f: f || 0 }); };
  Grid.prototype.has = function (x, y, z) { return this.m.has(K(x, y, z)); };
  Grid.prototype.get = function (x, y, z) { return this.m.get(K(x, y, z)); };
  const F_GLOW = 1, F_WIN = 2, F_NOAO = 4;

  // 用公尺描述一個方塊範圍（x、z 為中心，y 為底），轉成格子
  function fill(G, x0, y0, z0, x1, y1, z1, c, f, pat) {
    const ix0 = Math.round(x0 / V), ix1 = Math.max(ix0 + 1, Math.round(x1 / V));
    const iy0 = Math.round(y0 / V), iy1 = Math.max(iy0 + 1, Math.round(y1 / V));
    const iz0 = Math.round(z0 / V), iz1 = Math.max(iz0 + 1, Math.round(z1 / V));
    for (let x = ix0; x < ix1; x++) for (let y = iy0; y < iy1; y++) for (let z = iz0; z < iz1; z++) {
      const cc = pat ? pat(x - ix0, y - iy0, z - iz0, ix1 - ix0, iy1 - iy0, iz1 - iz0) : c;
      if (cc != null) G.set(x, y, z, cc, f);
    }
  }

  /* ── 把一個家具的方塊放進房間（處理旋轉） ── */
  function placer(G, ox, oz, rotDeg, lights) {
    const a = ((rotDeg || 0) % 360 + 360) % 360, q = Math.round(a / 90) % 4;
    const tr = (x, z) => q === 0 ? [x, z] : q === 1 ? [z, -x] : q === 2 ? [-x, -z] : [-z, x];
    const B = (w, h, d, c, x, y, z, f, pat) => {
      x = x || 0; y = y || 0; z = z || 0;
      const [cx, cz] = tr(x, z), sw = q % 2 ? d : w, sd = q % 2 ? w : d;
      const wx = ox + cx, wz = oz + cz;
      let P = pat;
      if (pat && q) P = (i, j, k, ni, nj, nk) => { const r = q === 1 ? [nk - 1 - k, i] : q === 2 ? [ni - 1 - i, nk - 1 - k] : [k, ni - 1 - i]; return pat(r[0], j, r[1], q % 2 ? nk : ni, nj, q % 2 ? ni : nk); };
      fill(G, wx - sw / 2, y, wz - sd / 2, wx + sw / 2, y + h, wz + sd / 2, c, f, P);
    };
    B.light = (x, y, z, color, power) => { const [cx, cz] = tr(x, z); lights.push({ x: ox + cx, y, z: oz + cz, color, power: power || 1 }); };
    B.paint = (w, d, c, x, z, pat) => {   // 畫在地板那一層（地毯、法陣）
      const [cx, cz] = tr(x || 0, z || 0), sw = q % 2 ? d : w, sd = q % 2 ? w : d;
      fill(G, ox + cx - sw / 2, -V, oz + cz - sd / 2, ox + cx + sw / 2, 0, oz + cz + sd / 2, c, F_NOAO, pat);
    };
    return B;
  }
  const pick = (arr, i) => arr[((i % arr.length) + arr.length) % arr.length];
  const hashI = (a, b, c) => { let h = (a * 73856093) ^ (b * 19349663) ^ (c * 83492791); h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

  /* ── 常用的小零件 ── */
  const BOOKS = [0xB8423A, 0x3E6E8E, 0xD8A740, 0x5E8A58, 0x8E5E9A, 0xE8E0CC, 0x6E4A30];
  function books(B, x0, x1, y, z, d, seed, pal) {
    let x = x0, i = seed || 0;
    while (x < x1 - 0.05) { const h = 0.2 + ((i * 7) % 3) * 0.05; B(0.1, h, d, pick(pal || BOOKS, i * 3 + 1), x + 0.05, y, z); x += 0.1; if ((i * 5) % 7 === 3) x += 0.1; i++; }
  }
  function chairV(B, x, z, fx, fz, c) {
    B(0.4, 0.1, 0.4, c, x, 0.3, z);
    for (const dx of [-0.15, 0.15]) for (const dz of [-0.15, 0.15]) B(0.1, 0.3, 0.1, 0x4E3624, x + dx, 0, z + dz);
    if (fx) B(0.1, 0.5, 0.4, c, x - fx * 0.15, 0.4, z); else B(0.4, 0.5, 0.1, c, x, 0.4, z - fz * 0.15);
  }
  function candleV(B, x, y, z, tall) {
    B(0.1, tall || 0.2, 0.1, 0xF2EAD8, x, y, z); B(0.1, 0.1, 0.1, 0xFFC04A, x, y + (tall || 0.2), z, F_GLOW);
  }
  function leaves(B, x, y, z, r, seed) {
    for (let i = 0; i < 14; i++) { const a = hashI(seed, i, 1) * 6.28, d = hashI(seed, i, 2) * r; B(0.2, 0.2, 0.2, pick([0x5E9A4E, 0x4E8A44, 0x7AB05E], i), x + Math.cos(a) * d, y + hashI(seed, i, 3) * r * 1.2, z + Math.sin(a) * d); }
  }

  /* ── 家具 ── */
  function vfurn(type, o, B, c, ctx) {
    const wood = 0x8E6A45;
    switch (type) {
      case "bed": {
        const fr = o.frame || 0x6B4E3A;
        B(1.0, 0.2, 1.8, fr, 0, 0, 0); B(0.9, 0.1, 1.7, 0xF4F0E8, 0, 0.2, 0);
        B(0.9, 0.1, 1.1, c, 0, 0.3, 0.3, 0, (i, j, k) => (k === 0 ? 0xF4F0E8 : (i + k) % 5 === 0 ? mix(c, 0x000000, 0.12) : c));
        B(0.6, 0.1, 0.3, 0xFFFFFF, 0, 0.3, -0.6); B(1.0, 0.7, 0.1, fr, 0, 0, -0.9); B(1.0, 0.4, 0.1, fr, 0, 0, 0.9);
        break; }
      case "hammock":
        B(0.1, 1.6, 0.1, 0x3A2A3A, -0.6, 0, 0); B(0.1, 1.6, 0.1, 0x3A2A3A, 0.6, 0, 0);
        B(1.1, 0.1, 0.6, c, 0, 0.4, 0, 0, (i, j, k) => (i + k) % 3 ? c : mix(c, 0xFFFFFF, 0.3));
        B(0.1, 0.1, 0.6, c, -0.55, 0.5, 0); B(0.1, 0.1, 0.6, c, 0.55, 0.5, 0);
        B(0.3, 0.1, 0.2, 0xFFFFFF, 0.3, 0.5, 0); break;
      case "sofa":
        B(1.4, 0.3, 0.6, c, 0, 0.1, 0); B(1.4, 0.5, 0.2, mix(c, 0x000000, 0.15), 0, 0.3, -0.25);
        B(0.2, 0.5, 0.6, mix(c, 0x000000, 0.15), -0.7, 0, 0); B(0.2, 0.5, 0.6, mix(c, 0x000000, 0.15), 0.7, 0, 0);
        B(1.2, 0.1, 0.5, 0x3A2A22, 0, 0, 0);
        B(0.2, 0.2, 0.1, o.pillow || 0xF4E1A6, -0.4, 0.4, -0.1); break;
      case "beanbag":
        B(0.7, 0.2, 0.7, c, 0, 0, 0); B(0.5, 0.1, 0.5, c, 0, 0.2, 0); B(0.5, 0.3, 0.2, mix(c, 0x000000, 0.15), 0, 0.2, -0.25); break;
      case "gamechair":
        B(0.5, 0.1, 0.5, 0x22262E, 0, 0.3, 0); B(0.1, 0.3, 0.1, 0x555A66, 0, 0, 0); B(0.5, 0.1, 0.1, 0x555A66, 0, 0, 0); B(0.1, 0.1, 0.5, 0x555A66, 0, 0, 0);
        B(0.5, 0.8, 0.1, 0x22262E, 0, 0.4, -0.22, 0, (i, j) => (i === 0 || i === 4 || j === 7) ? 0x8EEA3A : 0x22262E); break;
      case "bench2":
        B(1.3, 0.1, 0.4, c, 0, 0.4, 0, 0, (i, j, k) => k % 2 ? c : mix(c, 0x000000, 0.12));
        B(0.1, 0.4, 0.4, 0x3B3F4A, -0.55, 0, 0); B(0.1, 0.4, 0.4, 0x3B3F4A, 0.55, 0, 0); break;
      case "table": {
        const n = o.seats == null ? 2 : o.seats, w = n > 2 ? 1.2 : 0.8;
        B(w, 0.1, 0.7, c, 0, 0.5, 0);
        for (const dx of [-w / 2 + 0.05, w / 2 - 0.05]) for (const dz of [-0.3, 0.3]) B(0.1, 0.5, 0.1, 0x5A4632, dx, 0, dz);
        const seats = [[-(w / 2 + 0.3), 0], [w / 2 + 0.3, 0], [0, 0.6], [0, -0.6]].slice(0, n);
        seats.forEach(([x, z]) => chairV(B, x, z, z ? 0 : (x < 0 ? 1 : -1), z ? (z < 0 ? 1 : -1) : 0, 0x7A5A40));
        if (o.bowls) for (let i = 0; i < 3; i++) { B(0.2, 0.1, 0.2, 0xF4F0E8, -0.35 + i * 0.35, 0.6, 0); B(0.1, 0.1, 0.1, 0xE8A040, -0.35 + i * 0.35, 0.7, 0); }
        if (o.donuts) for (let i = 0; i < 3; i++) B(0.2, 0.1, 0.2, [0xE8A87C, 0xF2B5C9, 0x8E5A3A][i], -0.25 + i * 0.25, 0.6, 0);
        if (o.ramen) { B(0.3, 0.1, 0.3, 0xD8402A, 0, 0.6, 0); B(0.2, 0.1, 0.2, 0xF4D890, 0, 0.7, 0); }
        if (o.noodle) { B(0.2, 0.2, 0.2, 0xF4F0E8, 0.1, 0.6, 0); B(0.4, 0.1, 0.3, 0xE8DCC8, -0.2, 0.6, 0.1); }
        if (o.cake) { B(0.3, 0.2, 0.3, 0xF4E8E0, 0, 0.6, 0); B(0.1, 0.1, 0.1, 0xD8282A, 0, 0.8, 0); }
        if (o.tea) { B(0.1, 0.1, 0.1, 0xF4F0E8, -0.2, 0.6, 0); B(0.2, 0.2, 0.2, 0xF4F0E8, 0.15, 0.6, 0); }
        break; }
      case "longtable":
        B(2.6, 0.1, 0.8, c, 0, 0.5, 0, 0, (i, j, k) => (k === 0 || k === 7) ? mix(c, 0x000000, 0.15) : c);
        for (const dx of [-1.2, 1.2]) for (const dz of [-0.3, 0.3]) B(0.1, 0.5, 0.1, 0x4E3624, dx, 0, dz);
        for (const x of [-0.85, 0, 0.85]) chairV(B, x, 0.6, 0, -1, 0x7A5A40);
        if (o.chairsBack) for (const x of [-0.85, 0, 0.85]) chairV(B, x, -0.6, 0, 1, 0x7A5A40);
        B(0.3, 0.1, 0.2, 0xF4F0E8, -0.9, 0.6, 0); B(0.2, 0.1, 0.2, 0xF4F0E8, -0.85, 0.7, 0); B(0.1, 0.2, 0.1, 0xF4F0E8, -0.3, 0.6, -0.1);
        B(0.4, 0.1, 0.3, 0x3E6E8E, 0.3, 0.6, 0.1); B(0.1, 0.3, 0.1, 0x3B3F4A, 0.9, 0.6, -0.1); B(0.3, 0.1, 0.3, 0xFFE6A8, 0.9, 0.9, -0.1, F_GLOW);
        if (o.lampLight !== false) B.light(0.9, 1.0, -0.1, 0xFFD08A, 0.6);
        break;
      case "desk": {
        B(1.0, 0.1, 0.5, c, 0, 0.6, 0); B(0.1, 0.6, 0.5, c, -0.45, 0, 0); B(0.3, 0.6, 0.5, mix(c, 0x000000, 0.1), 0.35, 0, 0, 0, (i, j) => j === 2 ? 0x3A2A22 : mix(c, 0x000000, 0.1));
        chairV(B, 0, 0.5, 0, -1, 0x6B5A4A);
        B(0.2, 0.1, 0.3, 0xC0603F, -0.25, 0.7, -0.05); B(0.3, 0.1, 0.2, 0xFFFFFF, 0.15, 0.7, 0.05);
        if (o.papers) for (let i = 0; i < 3; i++) B(0.2, 0.1 + i * 0.1, 0.3, 0xF4F0E8, -0.3 + i * 0.25, 0.7, -0.1);
        if (o.lamp !== false) { B(0.1, 0.3, 0.1, 0x3B3F4A, 0.4, 0.7, -0.15); B(0.2, 0.1, 0.2, 0xFFE6A8, 0.4, 1.0, -0.1, F_GLOW); B.light(0.4, 1.0, -0.1, 0xFFD08A, 0.5); }
        break; }
      case "magicdesk":
        B(1.2, 0.1, 0.6, c, 0, 0.6, 0); B(0.1, 0.6, 0.6, c, -0.55, 0, 0); B(0.1, 0.6, 0.6, c, 0.55, 0, 0);
        chairV(B, 0, 0.55, 0, -1, 0x4A2A30);
        B(0.4, 0.1, 0.3, 0xE8D8B0, -0.2, 0.7, 0, 0, (i, j, k) => (i + k) % 3 === 0 ? 0x8E2A3A : 0xE8D8B0);   // 畫著法陣的羊皮紙
        B(0.3, 0.1, 0.2, 0x5A1E2E, 0.25, 0.7, -0.1); B(0.3, 0.1, 0.2, 0x3A1A4A, 0.25, 0.8, -0.1);   // 魔法書
        B(0.1, 0.2, 0.1, 0x8EE0C8, 0.45, 0.7, 0.1, F_GLOW); B(0.1, 0.1, 0.1, 0xC88EE8, 0.35, 0.7, 0.15, F_GLOW);   // 玻璃瓶
        B(0.1, 0.1, 0.1, 0xB89BFF, -0.45, 0.7, -0.15, F_GLOW);   // 水晶
        candleV(B, -0.45, 0.7, 0.15, 0.2); B.light(-0.45, 0.95, 0.15, 0xFFA040, 0.7);
        break;
      case "classroom": {
        const rows = o.rows || 2, cols = o.cols || 3;
        for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
          const x = (k - (cols - 1) / 2) * 1.4, z = (r - (rows - 1) / 2) * 1.05;
          B(0.8, 0.1, 0.4, c, x, 0.5, z - 0.15); B(0.1, 0.5, 0.4, 0x6B6E78, x - 0.35, 0, z - 0.15); B(0.1, 0.5, 0.4, 0x6B6E78, x + 0.35, 0, z - 0.15);
          B(0.3, 0.1, 0.2, pick(BOOKS, r * 3 + k), x + 0.1, 0.6, z - 0.15);
          chairV(B, x, z + 0.3, 0, -1, 0x6B5A4A);
        }
        const bz = -(rows - 1) / 2 * 1.05 - 0.75;
        B(2.4, 1.0, 0.1, 0x2F4A3A, 0, 0.9, bz, 0, (i, j) => (i === 0 || i === 23 || j === 0 || j === 9) ? 0x8E6A45 : 0x2F4A3A);
        B(0.6, 0.1, 0.1, 0xF4F0E8, -0.3, 1.5, bz + 0.05); B(0.4, 0.1, 0.1, 0xF4F0E8, 0.4, 1.3, bz + 0.05); B(0.8, 0.1, 0.1, 0xF4F0E8, 0, 1.1, bz + 0.05);
        B(0.8, 0.8, 0.4, 0x8E6A45, 1.6, 0, bz + 0.4);
        break; }
      case "shelf": {
        const h = o.h || 1.7, fc = c;
        B(1.0, h, 0.4, fc, 0, 0, 0.15, 0, (i, j, k) => k > 0 && i > 0 && i < 9 && j > 0 && j % 4 !== 0 && j < h / V - 1 ? 0x2A1E16 : fc);
        for (let r = 0; r < Math.floor(h / 0.4); r++) books(B, -0.4, 0.4, 0.1 + r * 0.4, 0.2, 0.2, r * 5 + (o.seed || 0), o.pal);
        if (o.jars) for (let i = 0; i < 3; i++) B(0.1, 0.2, 0.1, [0x8EE0C8, 0xC88EE8, 0xE8C88E][i], -0.3 + i * 0.3, 0.1 + 2 * 0.4, 0.25, i === 1 ? F_GLOW : 0);
        if (o.candle) { candleV(B, 0.3, h, 0.15, 0.2); B.light(0.3, h + 0.3, 0.2, 0xFFA040, 0.6); }
        break; }
      case "counter": {
        const h = o.low ? 0.6 : 0.8;
        B(1.6, h, 0.5, c, 0, 0, 0, 0, (i, j) => j % 2 === 0 && j > 0 ? mix(c, 0x000000, 0.12) : c); B(1.8, 0.1, 0.6, 0xD8CBB8, 0, h, 0);
        for (const x of [-0.45, 0.45]) { B(0.3, 0.1, 0.3, 0x5A3B26, x, o.low ? 0.4 : 0.6, 0.6); B(0.1, o.low ? 0.4 : 0.6, 0.1, 0x3B3F4A, x, 0, 0.6); }
        for (let i = 0; i < 3; i++) B(0.1, 0.2, 0.1, [0xE8A87C, 0xC0603F, 0xF4F0E8][i], -0.5 + i * 0.35, h + 0.1, -0.1);
        if (o.register) { B(0.3, 0.2, 0.2, 0x3B3F4A, 0.55, h + 0.1, 0); B(0.2, 0.1, 0.1, 0x8EE0A8, 0.55, h + 0.3, -0.05, F_GLOW); }
        break; }
      case "stove":
        B(0.8, 0.8, 0.6, 0x3B3F4A, 0, 0, 0); B(0.8, 0.1, 0.6, 0x22252C, 0, 0.8, 0);
        B(0.3, 0.2, 0.3, 0x9A9A9A, -0.15, 0.9, 0); B(0.2, 0.1, 0.2, 0xFF7A3A, 0.2, 0.9, 0.05, F_GLOW);
        B(0.6, 0.2, 0.1, 0x22252C, 0, 0.2, 0.3, 0, (i) => i % 2 ? 0xFF8A3A : 0x22252C); break;
      case "oven":   // 烤麵包的磚窯
        B(1.0, 1.0, 0.8, 0xA8644C, 0, 0, 0, 0, (i, j, k) => ((j % 2 ? i : i + 1) % 3 === 0 || j % 2 === 0) ? 0x8A4E3A : 0xA8644C);
        B(0.8, 0.2, 0.6, 0xA8644C, 0, 1.0, 0); B(0.6, 0.1, 0.4, 0xA8644C, 0, 1.2, 0); B(0.2, 0.6, 0.2, 0x6E4A30, 0, 1.3, -0.1);
        B(0.4, 0.4, 0.1, 0x1E1614, 0, 0.3, 0.4); B(0.2, 0.1, 0.1, 0xFF8A2A, 0, 0.3, 0.42, F_GLOW); B(0.1, 0.2, 0.1, 0xFFC84A, 0.1, 0.3, 0.42, F_GLOW);
        B.light(0, 0.5, 0.6, 0xFF9A4A, 0.8); break;
      case "pans":
        B(1.2, 0.1, 0.1, 0x3B3F4A, 0, 1.8, 0.05);
        for (let i = 0; i < 4; i++) { B(0.1, 0.3, 0.1, 0x3B3F4A, -0.45 + i * 0.3, 1.5, 0.05); B(0.3, 0.2, 0.1, [0x9A9A9A, 0xC07040, 0x9A9A9A, 0x3B3F4A][i], -0.45 + i * 0.3, 1.3, 0.05); } break;
      case "breadrack":
        B(0.9, 1.4, 0.4, 0x6B4A30, 0, 0, 0.15, 0, (i, j, k) => k > 0 && i > 0 && i < 8 && j % 4 !== 0 ? 0x2A1E16 : 0x6B4A30);
        for (let r = 0; r < 3; r++) for (let i = 0; i < 3; i++) B(0.2, 0.1, 0.2, pick([0xD8A050, 0xC08040, 0xE8C070], r + i), -0.25 + i * 0.25, 0.1 + r * 0.4, 0.2); break;
      case "menuboard":
        B(0.8, 0.9, 0.1, 0x2A2A2A, 0, 1.2, 0.05, 0, (i, j) => (i === 0 || i === 7 || j === 0 || j === 8) ? 0x8E6A45 : 0x2A2A2A);
        for (let j = 0; j < 4; j++) B(0.4 + (j % 2) * 0.1, 0.1, 0.1, j % 2 ? 0xF4D890 : 0xF4F0E8, -0.05, 1.35 + j * 0.15, 0.1); break;
      case "catbed":
        B(0.5, 0.1, 0.4, 0xC85A4A, 0, 0, 0); B(0.5, 0.2, 0.1, 0xC85A4A, 0, 0.1, -0.15);
        B(0.3, 0.2, 0.2, 0xE8A050, 0, 0.1, 0.05); B(0.1, 0.1, 0.1, 0xE8A050, -0.1, 0.3, 0.05); B(0.1, 0.1, 0.1, 0xE8A050, 0.1, 0.3, 0.05); break;
      case "drums":
        B(0.6, 0.6, 0.3, c, 0, 0, 0.1, 0, (i, j) => (i === 0 || i === 5 || j === 0 || j === 5) ? 0xE8E4DC : c);
        B(0.3, 0.1, 0.3, 0xE8E4DC, -0.45, 0.5, -0.05); B(0.1, 0.5, 0.1, 0x9A9A9A, -0.45, 0, -0.05);
        B(0.3, 0.2, 0.3, c, 0.2, 0.6, -0.05); B(0.3, 0.2, 0.3, c, -0.15, 0.6, -0.05);
        B(0.1, 1.0, 0.1, 0x9A9A9A, 0.55, 0, -0.1); B(0.5, 0.1, 0.5, 0xD8B04A, 0.55, 1.0, -0.1);
        B(0.1, 1.1, 0.1, 0x9A9A9A, -0.6, 0, -0.3); B(0.4, 0.1, 0.4, 0xD8B04A, -0.6, 1.1, -0.3);
        B(0.3, 0.1, 0.3, 0x2B2B2B, 0, 0.35, -0.5); B(0.1, 0.35, 0.1, 0x2B2B2B, 0, 0, -0.5); break;
      case "bench":
        B(1.2, 0.1, 0.6, c, 0, 0.7, 0);
        for (const dx of [-0.55, 0.55]) for (const dz of [-0.25, 0.25]) B(0.1, 0.7, 0.1, 0x3B3F4A, dx, 0, dz);
        B(0.2, 0.2, 0.2, 0x5A5A5A, -0.4, 0.8, -0.1); B(0.3, 0.1, 0.1, 0xC0C0C0, 0.1, 0.8, 0.05); B(0.1, 0.1, 0.1, 0xD8B04A, 0.35, 0.8, -0.15);
        if (o.radio) { B(0.4, 0.3, 0.2, 0x8A5A3A, -0.1, 0.8, -0.1); B(0.2, 0.2, 0.1, 0x3B3F4A, -0.15, 0.85, 0.0); B(0.1, 0.1, 0.1, 0xFF6A3A, 0.05, 0.9, 0.0, F_GLOW); }
        if (o.anvil) { B(0.3, 0.2, 0.2, 0x4A4A52, 0.3, 0.8, -0.1); B(0.1, 0.1, 0.1, 0xFF8A3A, 0.3, 1.0, -0.1, F_GLOW); }
        break;
      case "toolwall":
        B(1.3, 0.9, 0.1, 0xB59570, 0, 1.0, 0.05, 0, (i, j) => (i + j) % 2 ? 0xB59570 : 0xA8885F);
        for (let i = 0; i < 6; i++) B(0.1, 0.2 + (i % 3) * 0.1, 0.1, [0x9A9A9A, 0xC0603F, 0x2FA85C][i % 3], -0.5 + i * 0.2, 1.2, 0.12); break;
      case "rug": {
        const w = o.w || 1.6, d = o.d || 1.2, c2 = o.c2 || 0xD8A75A;
        B.paint(w, d, c, 0, 0, (i, j, k, ni, nj, nk) => (i === 0 || k === 0 || i === ni - 1 || k === nk - 1) ? c2 : ((i + k) % 4 === 0 ? mix(c, 0xFFFFFF, 0.15) : c)); break; }
      case "ritual": {   // 地上的法陣
        const r = o.r || 0.7, col = o.glow || 0xB04AE8;
        B.paint(r * 2, r * 2, 0, 0, 0, (i, j, k, ni) => { const dx = i - ni / 2 + 0.5, dz = k - ni / 2 + 0.5, d = Math.hypot(dx, dz); return Math.abs(d - ni / 2 + 1) < 0.7 || Math.abs(d - ni / 3) < 0.5 || Math.abs(dx) + Math.abs(dz) === Math.floor(ni / 3) ? col : null; });
        for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; candleV(B, Math.cos(a) * (r + 0.1), 0, Math.sin(a) * (r + 0.1), 0.2 + (i % 2) * 0.1); }
        B.light(0, 0.4, 0, o.lightC || 0xFF9A4A, 0.9); break; }
      case "skulls":   // 牆上的羊頭骨
        for (let i = 0; i < (o.n || 3); i++) {
          const x = (i - ((o.n || 3) - 1) / 2) * 0.5, y = 1.4 + (i % 2) * 0.2;
          B(0.3, 0.3, 0.2, 0xE8DCC8, x, y, 0.1); B(0.2, 0.1, 0.1, 0xE8DCC8, x, y - 0.1, 0.15);
          B(0.1, 0.1, 0.1, 0x2A1E1E, x - 0.1, y + 0.15, 0.2); B(0.1, 0.1, 0.1, 0x2A1E1E, x + 0.1, y + 0.15, 0.2);
          B(0.1, 0.2, 0.1, 0xC8B898, x - 0.2, y + 0.2, 0.1); B(0.1, 0.1, 0.1, 0xC8B898, x - 0.25, y + 0.1, 0.15);
          B(0.1, 0.2, 0.1, 0xC8B898, x + 0.2, y + 0.2, 0.1); B(0.1, 0.1, 0.1, 0xC8B898, x + 0.25, y + 0.1, 0.15);
        } break;
      case "dimbox":   // 白的「通往別的維度的箱子」
        B(0.7, 0.5, 0.5, 0x2A1E3A, 0, 0, 0, 0, (i, j, k) => (i === 0 || i === 6 || j === 0) ? 0x7A4AA8 : 0x2A1E3A);
        B(0.5, 0.1, 0.3, 0xC88EFF, 0, 0.5, 0, F_GLOW); B(0.7, 0.4, 0.1, 0x2A1E3A, 0, 0.5, -0.25);
        B(0.1, 0.1, 0.1, 0xE8C8FF, -0.1, 0.8, 0.05, F_GLOW); B(0.1, 0.1, 0.1, 0xE8C8FF, 0.15, 0.95, 0, F_GLOW);
        B.light(0, 0.7, 0, 0xB070FF, 0.8); break;
      case "labelwall":   // 貼歪的標籤
        for (let i = 0; i < 6; i++) B(0.2, 0.1, 0.1, [0xF4F0E4, 0xF6E08A, 0xF2A8C8][i % 3], -0.5 + i * 0.2, 1.0 + (i * 37 % 5) * 0.12, 0.05); break;
      case "junk":   // 白撿回來的小東西、果醬罐
        B(0.6, 0.3, 0.5, 0x5A3B4A, 0, 0, 0); B(0.1, 0.2, 0.1, 0xD83A4A, -0.2, 0.3, 0); B(0.1, 0.2, 0.1, 0xD83A4A, -0.1, 0.3, 0.1);
        B(0.2, 0.1, 0.2, 0xE8C060, 0.1, 0.3, -0.1); B(0.1, 0.3, 0.1, 0x8EA0C8, 0.2, 0.3, 0.1); B(0.2, 0.2, 0.1, 0xF2B5C9, 0, 0.4, -0.1); break;
      case "clock":
        B(0.4, 0.4, 0.1, 0x3A2A22, 0, 1.6, 0.05); B(0.2, 0.2, 0.1, 0xF4F0E4, 0, 1.7, 0.1); B(0.1, 0.1, 0.1, 0x2A1E1E, 0, 1.75, 0.13); break;
      case "altar":
        B(1.0, 0.6, 0.5, 0x2A1A2A, 0, 0, 0, 0, (i, j) => j === 5 ? 0x5A1E2E : 0x2A1A2A);
        B(0.3, 0.1, 0.2, 0xC8B868, 0, 0.6, 0, F_GLOW);   // 發光的禁書
        B(0.2, 0.2, 0.2, 0xE8DCC8, 0.35, 0.6, -0.1); B(0.1, 0.1, 0.1, 0x2A1E1E, 0.3, 0.7, -0.0);
        candleV(B, -0.35, 0.6, -0.1, 0.3); candleV(B, 0.35, 0.8, -0.1, 0.1);
        B.light(0, 0.9, 0, 0xFF8A3A, 0.9); break;
      case "banners":   // 符號布條
        for (let i = 0; i < 3; i++) { const x = (i - 1) * 0.6; B(0.3, 0.9, 0.1, 0x3A1A2A, x, 1.0, 0.05, 0, (a, b) => (b === 4 && a === 1) || (b === 6 && a !== 1) ? 0xB04AE8 : 0x3A1A2A); } break;
      case "candles":
        for (let i = 0; i < (o.n || 4); i++) candleV(B, (i % 2) * 0.2 - 0.1, (o.y || 0), Math.floor(i / 2) * 0.2 - 0.1, 0.1 + (i % 3) * 0.1);
        B.light(0, (o.y || 0) + 0.4, 0, 0xFF9A4A, o.power || 0.8); break;
      case "herbs":
        B(1.0, 0.1, 0.1, 0x5A4632, 0, 2.0, 0.1);
        for (let i = 0; i < 5; i++) B(0.1, 0.3 + (i % 2) * 0.1, 0.1, pick([0x6E8A4E, 0x8A6E4E, 0x9A8AC8], i), -0.4 + i * 0.2, 1.6, 0.1); break;
      case "telescope":
        B(0.1, 0.8, 0.1, 0x3B3F4A, 0, 0, 0); B(0.1, 0.1, 0.4, 0x3B3F4A, 0, 0.1, 0); B(0.4, 0.1, 0.1, 0x3B3F4A, 0, 0.1, 0);
        B(0.2, 0.2, 0.6, 0xD8B04A, 0, 0.8, 0.1); break;
      case "vanity":
        B(0.8, 0.6, 0.4, c, 0, 0, 0); B(0.6, 0.7, 0.1, 0xC8E0F0, 0, 0.7, -0.15, 0, (i, j) => (i === 0 || i === 5 || j === 6) ? c : 0xC8E0F0);
        B(0.1, 0.1, 0.1, 0xF07A9A, -0.2, 0.6, 0.05); B(0.1, 0.2, 0.1, 0xE8C0E0, 0.2, 0.6, 0.05); break;
      case "computer":   // 多螢幕電腦桌（科技風）
        B(1.4, 0.1, 0.6, 0x22262E, 0, 0.6, 0); B(0.1, 0.6, 0.6, 0x22262E, -0.65, 0, 0); B(0.1, 0.6, 0.6, 0x22262E, 0.65, 0, 0);
        B(1.4, 0.1, 0.1, 0x8EEA3A, 0, 0.55, 0.3, F_GLOW);
        for (const [x, ry] of [[-0.45, 0], [0, 0], [0.45, 0]]) { B(0.4, 0.3, 0.1, 0x111418, x, 0.8, -0.2); B(0.3, 0.2, 0.1, x ? 0x4AC8E8 : 0x8EEA3A, x, 0.85, -0.15, F_GLOW); B(0.1, 0.1, 0.1, 0x111418, x, 0.7, -0.2); }
        B(0.5, 0.1, 0.2, 0x333844, 0, 0.7, 0.1); B(0.1, 0.1, 0.1, 0x8EEA3A, 0.25, 0.7, 0.1, F_GLOW);
        B.light(0, 1.0, 0.2, 0x7AE8C8, 0.8);
        // 電競椅
        B(0.5, 0.1, 0.5, 0x22262E, 0, 0.4, 0.6); B(0.1, 0.4, 0.1, 0x555A66, 0, 0, 0.6);
        B(0.5, 0.7, 0.1, 0x22262E, 0, 0.5, 0.85, 0, (i, j) => (i === 0 || i === 4) ? 0x8EEA3A : 0x22262E);
        break;
      case "servers":
        for (let k = 0; k < 2; k++) B(0.5, 1.6, 0.5, 0x1A1E26, -0.3 + k * 0.6, 0, 0, 0, (i, j, kk, ni, nj, nk) => kk === nk - 1 && j % 2 === 1 && i > 0 && i < 4 ? ((i + j + k) % 3 === 0 ? 0x8EEA3A : (i + j) % 4 === 0 ? 0x4AC8E8 : 0x2A303A) : 0x1A1E26, F_GLOW * 0);
        for (let j = 0; j < 7; j++) { B(0.1, 0.1, 0.1, pick([0x8EEA3A, 0x4AC8E8, 0xFF5A3A], j), -0.4, 0.2 + j * 0.2, 0.26, F_GLOW); B(0.1, 0.1, 0.1, pick([0x4AC8E8, 0x8EEA3A], j), 0.2, 0.3 + j * 0.2, 0.26, F_GLOW); }
        break;
      case "ledstrip":
        B(o.w || 3, 0.1, 0.1, o.c || 0x8EEA3A, 0, o.y || 2.2, 0.05, F_GLOW); break;
      case "arm":   // 機械手臂工作台
        B(1.0, 0.7, 0.6, 0x3A3F4A, 0, 0, 0); B(1.0, 0.1, 0.6, 0x555A66, 0, 0.7, 0);
        B(0.2, 0.2, 0.2, 0x8EEA3A, 0.3, 0.8, -0.1); B(0.1, 0.4, 0.1, 0xC8C8D0, 0.3, 1.0, -0.1); B(0.4, 0.1, 0.1, 0xC8C8D0, 0.15, 1.4, -0.1); B(0.1, 0.2, 0.1, 0xFFB040, -0.05, 1.2, -0.1);
        B(0.3, 0.1, 0.2, 0x2FA85C, -0.25, 0.8, 0.05); B(0.1, 0.1, 0.1, 0xFF5A3A, -0.35, 0.9, 0.05, F_GLOW); break;
      case "cables":
        for (let i = 0; i < 12; i++) B(0.1, 0.1, 0.1, i % 3 ? 0x2A2E36 : 0x8EEA3A, -0.6 + i * 0.1, 0, Math.sin(i) * 0.15); break;
      case "medkit":
        B(0.4, 0.3, 0.2, 0xF4F0E8, 0, 0.9, 0.1); B(0.2, 0.1, 0.1, 0xD8282A, 0, 1.0, 0.15); B(0.1, 0.2, 0.1, 0xD8282A, 0, 0.95, 0.15); break;
      case "plant":
        B(0.3, 0.3, 0.3, 0xB86A45, 0, 0, 0); B(0.3, 0.1, 0.3, 0x4A3020, 0, 0.3, 0); leaves(B, 0, 0.4, 0, 0.25, Math.round((o.seed || 3) * 7)); break;
      case "dryplant":
        B(0.3, 0.3, 0.3, 0x3A2A2A, 0, 0, 0); for (let i = 0; i < 6; i++) B(0.1, 0.3 + (i % 3) * 0.1, 0.1, pick([0x6A4A3A, 0x4A3A3A, 0x7A5A4A], i), -0.1 + (i % 3) * 0.1, 0.3, -0.05 + Math.floor(i / 3) * 0.1); break;
      case "poster":
        B(0.6, 0.8, 0.1, c, 0, 1.0, 0.05, 0, (i, j) => (j > 2 && j < 7 && i > 0 && i < 5) ? (o.c2 || 0xF4F0E8) : c); break;
      case "lamp":
        B(0.1, 1.3, 0.1, 0x3B3F4A, 0, 0, 0); B(0.3, 0.1, 0.3, 0x3B3F4A, 0, 0, 0); B(0.3, 0.2, 0.3, 0xFFE6A8, 0, 1.3, 0, F_GLOW);
        B.light(0, 1.4, 0, 0xFFD08A, 0.7); break;
      case "candle":
        B(0.3, 0.5, 0.3, 0x3B2E2A, 0, 0, 0); candleV(B, 0, 0.5, 0, 0.2); B.light(0, 0.8, 0, 0xFFA040, 0.8); break;
      case "perch":
        B(0.1, 1.2, 0.1, 0x5A4632, 0, 0, 0); B(0.4, 0.1, 0.1, 0x5A4632, 0, 1.2, 0);
        B(0.3, 0.3, 0.2, 0x8A6A4A, 0, 1.3, 0); B(0.1, 0.1, 0.1, 0xFFD24A, -0.05, 1.5, 0.1, F_GLOW); B(0.1, 0.1, 0.1, 0xFFD24A, 0.07, 1.5, 0.1, F_GLOW); break;
      case "cauldron":
        B(0.6, 0.4, 0.6, 0x22252C, 0, 0.1, 0); B(0.4, 0.1, 0.4, 0x22252C, 0, 0, 0); B(0.4, 0.1, 0.4, 0x5ED38A, 0, 0.5, 0, F_GLOW);
        B(0.1, 0.1, 0.1, 0xA8F0C0, 0.05, 0.7, 0, F_GLOW); B.light(0, 0.8, 0, 0x5ED38A, 0.7); break;
      case "crystal":
        B(0.4, 0.3, 0.4, 0x3B2E2A, 0, 0.6, 0); B(0.2, 0.2, 0.2, 0xB89BFF, 0, 0.9, 0, F_GLOW); B(0.1, 0.6, 0.1, 0x3B2E2A, 0, 0, 0); break;
      case "mount":
        B(0.4, 0.4, 0.1, 0x5A4632, 0, 1.3, 0.05); B(0.2, 0.2, 0.2, 0x8A6A4A, 0, 1.5, 0.15); B(0.1, 0.1, 0.1, 0x2A1E1E, -0.05, 1.6, 0.25);
        B(0.1, 0.3, 0.1, 0xE8DCC8, -0.15, 1.7, 0.15); B(0.1, 0.3, 0.1, 0xE8DCC8, 0.15, 1.7, 0.15); break;
      case "butterflies":
        B(0.6, 0.5, 0.1, 0x3A2A22, 0, 1.2, 0.05); B(0.5, 0.4, 0.1, 0xC8D8E0, 0, 1.25, 0.1);
        B(0.1, 0.1, 0.1, 0x4A8AD8, -0.1, 1.4, 0.15); B(0.1, 0.1, 0.1, 0xE8A040, 0.1, 1.3, 0.15); B(0.1, 0.1, 0.1, 0x8E5E9A, 0, 1.5, 0.15); break;
      case "typewriter":
        B(0.6, 0.1, 0.4, 0x5A4632, 0, 0.6, 0); B(0.1, 0.6, 0.4, 0x5A4632, -0.25, 0, 0); B(0.1, 0.6, 0.4, 0x5A4632, 0.25, 0, 0);
        B(0.3, 0.1, 0.2, 0x2A2A2E, 0, 0.7, 0); B(0.2, 0.2, 0.1, 0xF4F0E8, 0, 0.8, -0.05); break;
      case "record":
        B(0.6, 0.5, 0.4, 0x3A2A22, 0, 0, 0); B(0.4, 0.1, 0.4, 0x1A1A1E, 0, 0.5, 0); B(0.1, 0.1, 0.1, 0xD83A4A, 0, 0.6, 0); break;
      case "amp":
        B(0.5, 0.6, 0.4, 0x22252C, 0, 0, 0, 0, (i, j, k, ni, nj, nk) => k === nk - 1 && i > 0 && i < 4 && j > 0 && j < 5 ? 0x3B3F4A : 0x22252C); B(0.1, 0.1, 0.1, 0xFF5A3A, 0.15, 0.5, 0.2, F_GLOW); break;
      case "sheets":   // 散在地上的鼓譜、衣服堆
        B.paint(0.3, 0.2, 0xF4F0E8, -0.3, 0); B.paint(0.2, 0.3, 0xF4F0E8, 0.1, 0.2); B.paint(0.3, 0.2, 0xF4F0E8, 0.3, -0.2);
        B(0.4, 0.1, 0.3, 0x3A3A44, -0.2, 0, -0.3); B(0.3, 0.1, 0.2, 0xB8282A, -0.15, 0.1, -0.3); B(0.1, 0.1, 0.3, 0xD8B88A, 0.4, 0, 0.3); break;
      case "tank":
        B(1.0, 0.4, 0.4, 0x3B3F4A, 0, 0, 0.2); B(1.0, 0.5, 0.4, 0x2E8B9A, 0, 0.4, 0.2, F_GLOW, (i, j) => j === 0 ? 0xD8C890 : (i === 3 && j < 3) ? 0x3E8A4E : (i + j) % 7 === 0 ? 0xFF9A4A : 0x2E8B9A);
        B.light(0, 0.7, 0.3, 0x4AB8D8, 0.5); break;
      case "rods":
        for (let i = 0; i < 3; i++) B(0.1, 1.8, 0.1, 0x3B2E2A, -0.2 + i * 0.2, 0, 0.1); B(0.8, 0.1, 0.1, 0x5A4632, 0, 1.2, 0.05); break;
      case "lifebuoy":
        B(0.5, 0.5, 0.1, 0xF4F0E8, 0, 1.2, 0.05, 0, (i, j) => (i > 0 && i < 4 && j > 0 && j < 4) ? null : ((i + j) % 2 ? 0xD8282A : 0xF4F0E8)); break;
      case "net":
        B(0.4, 0.3, 0.3, 0x8A6A4A, 0, 0, 0); B(0.3, 0.1, 0.3, 0x5A8A9A, 0, 0.3, 0); B(0.8, 0.6, 0.1, 0xC8B888, 0.5, 1.1, 0.05, 0, (i, j) => (i + j) % 2 ? 0xC8B888 : null); break;
      case "fridge":
        B(0.6, 1.4, 0.5, 0xF4F0E8, 0, 0, 0, 0, (i, j) => j === 8 ? 0xD8D4CC : 0xF4F0E8); B(0.1, 0.4, 0.1, 0x9A9A9A, 0.2, 0.8, 0.27);
        for (let i = 0; i < 4; i++) B(0.1, 0.1, 0.1, [0xE0578A, 0xF2C14E, 0x2FA85C, 0x4A6FA5][i], -0.15 + (i % 2) * 0.2, 1.0 + Math.floor(i / 2) * 0.2, 0.27); break;
      case "snacks":
        B(0.6, 0.2, 0.4, 0xE8C060, 0, 0, 0); B(0.3, 0.3, 0.2, 0xD8402A, -0.1, 0.2, 0); B(0.2, 0.2, 0.2, 0x4AA8E8, 0.2, 0.2, 0.05); B(0.2, 0.1, 0.2, 0xF2B5C9, 0, 0.5, 0); break;
      case "stars":
        for (let i = 0; i < 8; i++) B(0.1, 0.1, 0.1, 0xE8D8FF, Math.cos(i * 1.7) * 0.8, 2.0 + (i % 3) * 0.15, Math.sin(i * 1.7) * 0.6, F_GLOW); break;
      case "starwall":
        for (let i = 0; i < 5; i++) B(0.1, 0.1, 0.1, 0xF4D35E, -0.4 + i * 0.2, 1.2 + (i % 2) * 0.3, 0.05); break;
      case "chimes":
        B(0.6, 0.1, 0.1, 0x5A4632, 0, 1.9, 0); for (let i = 0; i < 5; i++) B(0.1, 0.3 + (i % 3) * 0.1, 0.1, 0xC0C0C0, -0.24 + i * 0.12, 1.5, 0); break;
      case "display_rack":   // 金工作品展示架
        B(0.8, 1.2, 0.3, 0x3B3F4A, 0, 0, 0.1, 0, (i, j, k) => k > 0 && i > 0 && i < 7 && j % 4 !== 0 ? 0x22252C : 0x3B3F4A);
        for (let r = 0; r < 3; r++) for (let i = 0; i < 2; i++) B(0.1, 0.2, 0.1, pick([0xC8C8D0, 0xD8B04A, 0xB87050], r + i), -0.15 + i * 0.3, 0.1 + r * 0.4, 0.15); break;
      case "lights": {
        const w = o.w || 3.0;
        for (let i = 0; i < 14; i++) B(0.1, 0.1, 0.1, pick([0xFFE08A, 0xFF9A6A, 0x9AD8FF, 0xFFE08A], i), -w / 2 + i * (w / 13), 2.0 - Math.round(Math.sin(i / 13 * Math.PI) * 1.5) * 0.1, 0.1, F_GLOW);
        break; }
      case "display":
        B(0.9, 0.7, 0.5, 0xE8DCC8, 0, 0, 0); B(0.9, 0.1, 0.5, 0xD8CBB8, 0, 0.7, 0);
        B(0.9, 0.4, 0.1, 0xCFE8F0, 0, 0.8, 0.2); B(0.1, 0.4, 0.5, 0xCFE8F0, -0.4, 0.8, 0); B(0.1, 0.4, 0.5, 0xCFE8F0, 0.4, 0.8, 0); B(0.9, 0.1, 0.5, 0xCFE8F0, 0, 1.2, 0);
        for (let i = 0; i < 3; i++) B(0.2, 0.2, 0.2, (o.items || [0xF2B5C9, 0xE8A87C, 0xF4E1A6])[i], -0.25 + i * 0.25, 0.8, 0);
        if (o.light) B.light(0, 1.0, 0, 0xFFE6C8, 0.3);
        break;
      case "statue":
        B(0.5, 0.4, 0.5, 0xC8C0B0, 0, 0, 0); B(0.3, 0.6, 0.3, 0xD8D0C0, 0, 0.4, 0); B(0.2, 0.2, 0.2, 0xD8D0C0, 0, 1.0, 0); B(0.1, 0.3, 0.1, 0xD8D0C0, 0.2, 0.7, 0); break;
      case "newsstand":
        B(1.4, 0.8, 0.5, 0x6B5A4A, 0, 0, 0); B(1.6, 0.1, 0.7, 0x2F6B5A, 0, 1.6, 0); B(0.1, 0.8, 0.1, 0x3B3F4A, -0.7, 0.8, -0.2); B(0.1, 0.8, 0.1, 0x3B3F4A, 0.7, 0.8, -0.2);
        for (let i = 0; i < 6; i++) B(0.2, 0.3, 0.1, [0xC0603F, 0x4A6FA5, 0xE0B54A, 0x2F8A6A, 0xD98AA0, 0x7C5CC4][i], -0.55 + i * 0.22, 0.8, 0.15); break;
      case "clothes":
        B(0.1, 1.4, 0.1, 0x9A9A9A, -0.5, 0, 0); B(0.1, 1.4, 0.1, 0x9A9A9A, 0.5, 0, 0); B(1.1, 0.1, 0.1, 0x9A9A9A, 0, 1.4, 0);
        for (let i = 0; i < 5; i++) B(0.1, 0.6, 0.3, (o.pal || [0xC2455A, 0x4A6FA5, 0xF2C14E, 0x2F5D50, 0xE8DCC8])[i % 5], -0.36 + i * 0.18, 0.8, 0); break;
      case "mirror":
        B(0.5, 1.3, 0.1, 0xD8B04A, 0, 0, 0.05); B(0.3, 1.1, 0.1, 0xC8E0F0, 0, 0.1, 0.1); break;
      case "mannequin":
        B(0.1, 0.8, 0.1, 0x3B3F4A, 0, 0, 0); B(0.3, 0.1, 0.3, 0x3B3F4A, 0, 0, 0); B(0.4, 0.5, 0.2, c || 0xC2455A, 0, 0.8, 0); B(0.2, 0.2, 0.2, 0xE8DCC8, 0, 1.3, 0); break;
      case "caseboard":
        B(1.8, 1.1, 0.1, 0x5A3B26, 0, 0.9, 0.05); B(1.6, 0.9, 0.1, 0x2F5A44, 0, 1.0, 0.06);
        [[-0.6, 1.6], [-0.2, 1.7], [0.2, 1.5], [0.5, 1.6], [-0.4, 1.2], [0.1, 1.1], [0.5, 1.2]].forEach(([x, y], i) => B(0.2, 0.2, 0.1, i % 3 === 1 ? 0xF6E08A : 0xF4F0E4, x, y, 0.12));
        [[-0.4, 1.7], [-0.3, 1.65], [0, 1.6], [0.1, 1.55], [0.3, 1.55], [-0.5, 1.4], [-0.3, 1.3], [-0.1, 1.2], [0.3, 1.15]].forEach(([x, y]) => B(0.1, 0.1, 0.1, 0xD8282A, x, y, 0.13));
        break;
      case "clippings":   // 案件剪報牆
        for (let i = 0; i < 6; i++) B(0.2, 0.3, 0.1, i % 2 ? 0xF4F0E4 : 0xE8DCC0, -0.5 + i * 0.2, 1.2 + (i % 3) * 0.15, 0.05);
        B(0.1, 0.1, 0.1, 0xD8282A, -0.3, 1.5, 0.1); B(0.1, 0.1, 0.1, 0xD8282A, 0.1, 1.45, 0.1); break;
      case "fireplace":
        B(1.1, 1.3, 0.5, 0x9A5A44, 0, 0, 0.15, 0, (i, j) => ((j % 2 === 0 ? i : i + 1) % 3 === 0 || j % 2 === 0) ? 0x8A4E3A : 0xA8644C);
        B(1.3, 0.1, 0.6, 0x6E4A30, 0, 1.3, 0.15); B(0.7, 0.7, 0.2, 0x1E1614, 0, 0.1, 0.35);
        B(0.5, 0.1, 0.1, 0x4A3020, 0, 0.1, 0.4); B(0.2, 0.2, 0.1, 0xFF8A2A, -0.1, 0.2, 0.4, F_GLOW); B(0.2, 0.3, 0.1, 0xFFC84A, 0.05, 0.2, 0.4, F_GLOW); B(0.1, 0.2, 0.1, 0xFF6A2A, 0.2, 0.2, 0.4, F_GLOW);
        B(0.1, 0.3, 0.1, 0xF0C04A, -0.4, 1.4, 0.15); B(0.2, 0.2, 0.2, 0xF4F0E4, 0.4, 1.4, 0.15);
        B.light(0, 0.4, 0.7, 0xFF9A4A, 1.1); break;
      case "stairs":
        for (let i = 0; i < 9; i++) B(0.7, (i + 1) * 0.1, 0.1, i % 2 ? 0x8A5E3E : 0x7A5236, 0, 0, 0.4 - i * 0.1);
        break;
      case "crates":
        B(0.6, 0.5, 0.6, 0x9C7A55, 0, 0, 0, 0, (i, j, k) => (i === 0 || i === 5 || j === 0 || j === 4) ? 0x7A5A3A : 0x9C7A55);
        B(0.5, 0.4, 0.5, 0x8A6A4A, 0.1, 0.5, -0.05); B(0.5, 0.5, 0.5, 0x9C7A55, 0.6, 0, 0.1, 0, (i, j) => (i === 0 || i === 4 || j === 0 || j === 4) ? 0x7A5A3A : 0x9C7A55); break;
      case "graffiti":
        B(2.0, 1.4, 0.1, 0x6A6E78, 0, 0.3, 0.05, 0, (i, j) => { const h = hashI(i >> 1, j >> 1, 9); return h < 0.18 ? 0xE8402A : h < 0.34 ? 0x4AC8E8 : h < 0.48 ? 0xF4D35E : h < 0.58 ? 0x8EEA3A : 0x6A6E78; }); break;
      case "spray":
        for (let i = 0; i < 4; i++) B(0.1, 0.2, 0.1, [0xE8402A, 0x4AC8E8, 0xF4D35E, 0x8EEA3A][i], -0.15 + i * 0.1, 0, 0); break;
      case "vending":
        B(0.7, 1.6, 0.6, 0xD8402A, 0, 0, 0); B(0.5, 0.9, 0.1, 0xCFE8F0, -0.05, 0.6, 0.3, F_GLOW, (i, j) => j % 3 === 0 ? 0xE8E0D0 : pick([0x4AA8E8, 0xF4D35E, 0x8EEA3A, 0xF2B5C9], i + j));
        B.light(0, 1.0, 0.5, 0xCFE8FF, 0.4); break;
      case "lockers":
        for (let i = 0; i < 4; i++) B(0.3, 1.6, 0.4, i % 2 ? 0x4A6E9A : 0x557AA8, -0.45 + i * 0.3, 0, 0.15, 0, (a, j) => j === 12 && a === 2 ? 0xC8C8D0 : null);
        break;
      case "board":   // 公布欄
        B(1.2, 0.8, 0.1, 0xB88A5A, 0, 1.0, 0.05); for (let i = 0; i < 5; i++) B(0.2, 0.3, 0.1, pick([0xF4F0E4, 0xF6E08A, 0xF2B5C9, 0xA8D8F0], i), -0.4 + i * 0.2, 1.2 + (i % 2) * 0.15, 0.1); break;
      case "globe":
        B(0.1, 0.8, 0.1, 0x5A4632, 0, 0, 0); B(0.3, 0.3, 0.3, 0x4A8AC8, 0, 0.8, 0, 0, (i, j, k) => (i + j * 2 + k) % 3 === 0 ? 0x6EA85A : 0x4A8AC8); break;
      case "podium":
        B(0.6, 0.9, 0.4, 0x6B4A30, 0, 0, 0); B(0.7, 0.1, 0.5, 0x8E6A45, 0, 0.9, 0); break;
      case "ladder":
        B(0.1, 2.0, 0.1, 0x8E6A45, -0.2, 0, 0); B(0.1, 2.0, 0.1, 0x8E6A45, 0.2, 0, 0); for (let i = 0; i < 6; i++) B(0.3, 0.1, 0.1, 0x8E6A45, 0, 0.2 + i * 0.3, 0); break;
      case "filing":
        B(0.6, 1.3, 0.5, 0x8A9098, 0, 0, 0, 0, (i, j) => j % 3 === 0 ? 0x6A7078 : (i === 2 || i === 3) && j % 3 === 1 ? 0xC8C8D0 : 0x8A9098); break;
      case "boxes":
        B(0.4, 0.3, 0.3, 0xD8C8A8, 0, 0, 0); B(0.4, 0.3, 0.3, 0xC8B898, 0.05, 0.3, 0); B(0.3, 0.2, 0.3, 0xD8C8A8, 0.45, 0, 0.05); break;
      case "scrolls":
        B(1.0, 1.2, 0.4, 0x5A3B26, 0, 0, 0.15, 0, (i, j, k) => k > 0 && i > 0 && i < 9 && j % 3 !== 0 ? 0x2A1E16 : 0x5A3B26);
        for (let r = 0; r < 3; r++) for (let i = 0; i < 4; i++) B(0.2, 0.1, 0.3, 0xE8D8B0, -0.3 + i * 0.2, 0.1 + r * 0.3, 0.2); break;
      case "map":
        B(0.8, 0.6, 0.1, 0xD8C090, 0, 1.2, 0.05, 0, (i, j) => (hashI(i, j, 4) < 0.25 ? 0xA88A5A : 0xD8C090)); B(0.1, 0.1, 0.1, 0xD8282A, 0.1, 1.5, 0.1); break;
      case "radios":
        for (let i = 0; i < 4; i++) { B(0.3, 0.3, 0.2, pick([0x8A5A3A, 0x4A6E5A, 0xC8B088, 0x6A4A6A], i), -0.45 + i * 0.3, 1.0, 0.1); B(0.1, 0.1, 0.1, 0xFF8A3A, -0.4 + i * 0.3, 1.1, 0.21, i % 2 ? F_GLOW : 0); }
        B(1.3, 0.1, 0.3, 0x5A4632, 0, 0.9, 0.1); break;
      case "readchair":
        B(0.7, 0.3, 0.7, c, 0, 0.1, 0); B(0.7, 0.6, 0.2, mix(c, 0x000000, 0.15), 0, 0.3, -0.25); B(0.1, 0.4, 0.7, mix(c, 0x000000, 0.15), -0.3, 0.1, 0); B(0.1, 0.4, 0.7, mix(c, 0x000000, 0.15), 0.3, 0.1, 0); break;
      case "bookpile":
        for (let i = 0; i < 5; i++) B(0.3, 0.1, 0.2, pick(BOOKS, i + (o.seed || 0)), (i % 2) * 0.05, i * 0.1, 0); B(0.3, 0.1, 0.2, pick(BOOKS, 3), 0.4, 0, 0.1); B(0.3, 0.1, 0.2, pick(BOOKS, 5), 0.4, 0.1, 0.1); break;
      case "fitting":
        B(0.9, 1.8, 0.1, 0x8E6A45, 0, 0, -0.4); B(0.1, 1.8, 0.9, 0x8E6A45, -0.45, 0, 0); B(0.8, 1.6, 0.1, 0xC2455A, 0, 0.1, 0.4, 0, (i, j) => j > 13 ? 0x9A3348 : (i + j) % 4 ? 0xC2455A : 0xB03C50); break;
      case "parts":
        B(1.0, 1.4, 0.4, 0x5A5E66, 0, 0, 0.15, 0, (i, j, k) => k > 0 && i > 0 && i < 9 && j % 4 !== 0 ? 0x2A2E36 : 0x5A5E66);
        for (let r = 0; r < 3; r++) for (let i = 0; i < 4; i++) B(0.1, 0.1, 0.1, pick([0xC8C8D0, 0xD8B04A, 0xB87050, 0x2FA85C], r + i), -0.3 + i * 0.2, 0.1 + r * 0.4, 0.2); break;
      case "welder":
        B(0.5, 0.6, 0.4, 0x3A5A8A, 0, 0, 0); B(0.3, 0.2, 0.1, 0x22252C, 0, 0.3, 0.2); B(0.1, 0.1, 0.1, 0xFF8A2A, 0.15, 0.5, 0.2, F_GLOW); break;
      case "sign":
        B(0.1, 1.0, 0.1, 0x5A4632, 0, 0, 0); B(0.7, 0.4, 0.1, c || 0x8E6A45, 0, 1.0, 0, 0, (i, j) => (j === 1 && i > 0 && i < 6) ? 0xF4F0E4 : (c || 0x8E6A45)); break;
      case "well":
        B(0.8, 0.5, 0.8, 0x9A9488, 0, 0, 0, 0, (i, j, k) => (i > 0 && i < 7 && k > 0 && k < 7) ? (j === 4 ? 0x3E7A9A : null) : ((i + j + k) % 3 ? 0x9A9488 : 0x8A8478));
        B(0.1, 0.8, 0.1, 0x5A4632, -0.35, 0.5, 0); B(0.1, 0.8, 0.1, 0x5A4632, 0.35, 0.5, 0); B(0.9, 0.2, 0.4, 0x8A4E3A, 0, 1.3, 0); break;
      case "stonelamp":
        B(0.3, 0.6, 0.3, 0xA8A498, 0, 0, 0); B(0.5, 0.1, 0.5, 0xA8A498, 0, 0.6, 0); B(0.3, 0.2, 0.3, 0xFFE6A8, 0, 0.7, 0, F_GLOW); B(0.5, 0.1, 0.5, 0xA8A498, 0, 0.9, 0); B.light(0, 0.8, 0, 0xFFD08A, 0.5); break;
      case "streetlamp":
        B(0.1, 2.0, 0.1, 0x2E3238, 0, 0, 0); B(0.3, 0.1, 0.3, 0x2E3238, 0, 0, 0); B(0.3, 0.3, 0.3, 0xFFE6A8, 0, 2.0, 0, F_GLOW); B(0.4, 0.1, 0.4, 0x2E3238, 0, 2.3, 0); B.light(0, 2.0, 0, 0xFFD08A, 0.6); break;
      case "tree": {
        const s = o.s || 1; B(0.2 * s, 0.8 * s, 0.2 * s, 0x6A4A30, 0, 0, 0);
        for (let i = 0; i < 18; i++) { const a = hashI(i, 7, o.seed || 1) * 6.28, d = hashI(i, 8, o.seed || 1) * 0.4 * s; B(0.3, 0.3, 0.3, pick(o.leaf || [0x5E9A4E, 0x4E8A44, 0x7AB05E, 0x6EA858], i), Math.cos(a) * d, 0.7 * s + hashI(i, 9, o.seed || 1) * 0.6 * s, Math.sin(a) * d); }
        break; }
      case "bush": for (let i = 0; i < 8; i++) B(0.2, 0.2, 0.2, pick([0x5E9A4E, 0x4E8A44, 0x7AB05E], i), (i % 4) * 0.15 - 0.2, Math.floor(i / 4) * 0.15, (i % 2) * 0.15 - 0.05); break;
      case "flowers": for (let i = 0; i < 10; i++) { const x = (i % 5) * 0.15 - 0.3, z = Math.floor(i / 5) * 0.2 - 0.1; B(0.1, 0.2, 0.1, 0x4E8A44, x, 0, z); B(0.1, 0.1, 0.1, pick([0xF07A9A, 0xF4D35E, 0xFFFFFF, 0xC88EE8], i), x, 0.2, z); } break;
      case "fountain":
        B(1.6, 0.3, 1.6, 0xB8B0A0, 0, 0, 0, 0, (i, j, k, ni, nj, nk) => (i > 0 && i < ni - 1 && k > 0 && k < nk - 1) ? (j === 2 ? 0x5AA8C8 : null) : 0xB8B0A0);
        B(0.3, 0.8, 0.3, 0xC8C0B0, 0, 0.3, 0); B(0.6, 0.1, 0.6, 0xC8C0B0, 0, 1.0, 0); B(0.2, 0.3, 0.2, 0x8AD8F0, 0, 1.1, 0, F_GLOW); break;
      case "water": B.paint(o.w || 2, o.d || 1.5, 0x3E7A9A, 0, 0, (i, j, k) => hashI(i, k, 3) < 0.12 ? 0x5AA8C8 : 0x3E7A9A); break;
      case "path": B.paint(o.w || 1, o.d || 3, o.c || 0xB8A888, 0, 0, (i, j, k) => (i + (k % 2)) % 3 === 0 ? mix(o.c || 0xB8A888, 0x000000, 0.12) : (o.c || 0xB8A888)); break;
      case "rocks":
        B(0.6, 0.4, 0.5, 0x6A6870, 0, 0, 0); B(0.4, 0.3, 0.3, 0x7A7880, 0.1, 0.4, 0); B(0.4, 0.3, 0.4, 0x5A5860, 0.5, 0, 0.2); break;
      case "dock":
        B(0.8, 0.2, 1.6, 0x8A6A4A, 0, 0.1, 0, 0, (i, j, k) => k % 2 ? 0x8A6A4A : 0x7A5A3A); for (const z of [-0.7, 0.7]) for (const x of [-0.35, 0.35]) B(0.1, 0.3, 0.1, 0x5A4632, x, 0, z); break;
      case "stall": {   // 夜市攤位
        const cc = c || 0xD8402A;
        B(1.2, 0.8, 0.6, 0x8A6A4A, 0, 0, 0); B(1.3, 0.1, 0.7, 0xD8CBB8, 0, 0.8, 0);
        B(0.1, 1.2, 0.1, 0x5A4632, -0.6, 0.8, -0.3); B(0.1, 1.2, 0.1, 0x5A4632, 0.6, 0.8, -0.3);
        B(1.4, 0.1, 0.8, cc, 0, 2.0, 0, 0, i => i % 2 ? cc : 0xF4F0E4);
        for (let i = 0; i < 3; i++) B(0.2, 0.1, 0.2, pick([0xE8A040, 0xF2B5C9, 0xD8402A, 0xF4D890], i + (o.seed || 0)), -0.35 + i * 0.35, 0.9, 0);
        B(0.2, 0.2, 0.2, 0xFF7A4A, -0.6, 1.7, 0.3, F_GLOW); B(0.2, 0.2, 0.2, 0xFF7A4A, 0.6, 1.7, 0.3, F_GLOW);
        B.light(0, 1.6, 0.4, 0xFFA060, 0.6); break; }
      case "lanterns": for (let i = 0; i < 8; i++) B(0.2, 0.2, 0.2, i % 2 ? 0xFF7A4A : 0xFFB04A, -1.5 + i * 0.43, 2.4 - (i % 2) * 0.1, 0, F_GLOW); break;
      case "platform": B(o.w || 3, 0.4, o.d || 1.2, 0xA8A498, 0, 0, 0, 0, (i, j, k, ni, nj, nk) => k === nk - 1 ? 0xF4D35E : 0xA8A498); break;
      case "rails": for (const z of [-0.25, 0.25]) B(o.w || 3, 0.1, 0.1, 0x6A6E78, 0, 0.1, z); for (let i = 0; i < 8; i++) B(0.2, 0.1, 0.8, 0x6A4A30, -1.4 + i * 0.4, 0, 0); break;
      case "clocktower": B(1.2, 2.4, 1.2, 0xC8B898, 0, 0, 0, 0, (i, j, k) => (j % 3 === 0) ? 0xB8A888 : 0xC8B898); B(0.6, 0.6, 0.1, 0xF4F0E4, 0, 1.6, 0.6, F_GLOW); B(0.1, 0.3, 0.1, 0x2A2A2A, 0, 1.8, 0.65); break;
      case "hydrant": B(0.2, 0.4, 0.2, 0xD8402A, 0, 0, 0); B(0.3, 0.1, 0.1, 0xD8402A, 0, 0.25, 0); break;
      case "trash": B(0.3, 0.5, 0.3, 0x4A6E5A, 0, 0, 0); B(0.4, 0.1, 0.4, 0x3A5A4A, 0, 0.5, 0); break;
      case "machine":   // 機械市集的機器
        B(0.8, 1.0, 0.6, 0x5A6A7A, 0, 0, 0, 0, (i, j) => (j === 5 && i % 2) ? 0xD8B04A : 0x5A6A7A); B(0.3, 0.3, 0.1, 0x22252C, -0.15, 0.6, 0.3); B(0.1, 0.1, 0.1, 0x8EEA3A, 0.2, 0.7, 0.3, F_GLOW);
        B(0.1, 0.5, 0.1, 0x8A8A8A, 0.3, 1.0, -0.2); B(0.3, 0.1, 0.1, 0x8A8A8A, 0.2, 1.4, -0.2); break;
      case "gears": for (let i = 0; i < 3; i++) B(0.3, 0.3, 0.1, 0xB8903A, -0.3 + i * 0.3, 1.0 + (i % 2) * 0.2, 0.05, 0, (a, b) => (a === 1 && b === 1) ? null : 0xB8903A); break;
      case "awning": B(o.w || 1.6, 0.1, 0.6, c || 0xD8402A, 0, o.y || 2.0, 0.3, 0, i => i % 2 ? (c || 0xD8402A) : 0xF4F0E4); break;
      case "bike": B(0.8, 0.1, 0.1, 0x3A6E9A, 0, 0.3, 0); B(0.1, 0.3, 0.3, 0x2A2A2A, -0.35, 0, 0); B(0.1, 0.3, 0.3, 0x2A2A2A, 0.35, 0, 0); B(0.2, 0.1, 0.1, 0x2A2A2A, -0.1, 0.5, 0); B(0.1, 0.2, 0.2, 0x2A2A2A, 0.3, 0.4, 0); break;
      case "bunting": for (let i = 0; i < 10; i++) B(0.1, 0.2, 0.1, pick([0xF07A9A, 0xF4D35E, 0x4AC8E8, 0x8EEA3A], i), -1.4 + i * 0.3, 2.2, 0); break;
      case "mag": B(0.2, 0.3, 0.1, 0xC0603F, 0, 0, 0); break;
    }
  }
  function mix(a, b, k) {
    const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255, br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
    return (Math.round(ar + (br - ar) * k) << 16) | (Math.round(ag + (bg - ag) * k) << 8) | Math.round(ab + (bb - ab) * k);
  }

  const GROUND = {
    grass: (x, z, h) => h < 0.33 ? 0x6EA858 : h < 0.66 ? 0x62A050 : h < 0.97 ? 0x78B060 : 0xF4D35E,
    stone: (x, z, h) => ((x >> 1) + (z >> 1)) % 2 ? (h < 0.5 ? 0xB8B0A0 : 0xACA494) : (h < 0.5 ? 0xC4BCAC : 0xB0A898),
    tile: (x, z, h) => (x % 4 === 0 || z % 4 === 0) ? 0x9A9488 : (h < 0.5 ? 0xC8C0B0 : 0xBEB6A6),
    cave: (x, z, h) => h < 0.3 ? 0x4A4650 : h < 0.7 ? 0x55515C : 0x5E5A66,
    plank: (x, z, h) => z % 3 === 0 ? 0x6E4E34 : (h < 0.5 ? 0x9A7450 : 0x8E6A48),
    asphalt: (x, z, h) => h < 0.5 ? 0x5A5E66 : 0x62666E
  };
  /* ── 房間的殼：地板、兩面牆、窗 ── */
  function shell(G, W, D, th) {
    const nx = Math.round(W / V), nz = Math.round(D / V), x0 = -Math.round(W / 2 / V), z0 = -Math.round(D / 2 / V), H = th.outdoor ? 0 : 26;
    const fl = th.floor || [0xB07D52, 0xA06F47, 0xB98858], seam = th.seam || 0x7E5636;
    for (let x = -2; x < nx; x++) for (let z = -2; z < nz; z++) {
      let c;
      if (th.outdoor) { const h = hashI(x, z, 5), gf = GROUND[th.ground || "grass"] || GROUND.grass; c = gf(x, z, h); }
      else c = z % 4 === 3 ? mix(fl[0], seam, 0.35) : fl[0];
      G.set(x0 + x, -1, z0 + z, c, F_NOAO);
      G.set(x0 + x, -2, z0 + z, th.outdoor ? 0x7A5A3A : 0x6E4A30, F_NOAO);
    }
    if (th.outdoor) return;
    const wall = th.wall, wall2 = th.wall2 || mix(th.wall, 0x000000, 0.06), wain = th.wain || 0x82593A, trim = th.trim || 0x5A3B26, cap = th.cap || mix(th.wall, 0xFFFFFF, 0.25);
    const wc = (u, y, base) => y < 8 ? ((u % 6 === 0) ? mix(wain, 0x000000, 0.1) : wain) : y === 8 ? trim : y >= H - 1 ? cap : base;
    for (let x = -2; x < nx; x++) for (let y = -1; y < H; y++) for (let z = -2; z < 0; z++) G.set(x0 + x, y, z0 + z, wc(x, y, wall), 0);
    for (let z = 0; z < nz; z++) for (let y = -1; y < H; y++) for (let x = -2; x < 0; x++) G.set(x0 + x, y, z0 + z, wc(z, y, wall2), 0);
    // 天花板吊燈（主燈）
    if (!th.dark && th.pendant !== false) {
      const lx = Math.round((th.lampX != null ? th.lampX : -0.2) / V), lz = Math.round((th.lampZ != null ? th.lampZ : -0.2) / V);
      for (let y = 22; y < 26; y++) G.set(lx, y, lz, 0x2E2A26, 0);
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) G.set(lx + dx, 21, lz + dz, 0x3A3430, 0);
      G.set(lx, 20, lz, 0xFFE8B8, F_GLOW);
    }
    // 左牆的窗
    if (th.window !== false) {
      const wz = z0 + Math.round(nz * 0.3), ww = 11;
      for (let z = wz; z < wz + ww; z++) for (let y = 10; y < 20; y++) for (let x = -2; x < 0; x++) {
        const edge = z === wz || z === wz + ww - 1 || y === 10 || y === 19 || z === wz + 5;
        if (x === -1 && !edge) G.set(x0 + x, y, z, 0xFFE6A8, F_WIN); else if (edge) G.set(x0 + x, y, z, th.frame || 0xF4EEE2, 0); else G.m.delete(K(x0 + x, y, z));
      }
      if (th.curtain) for (let y = 9; y < 21; y++) { G.set(x0, y, wz - 1, th.curtain, 0); G.set(x0, y, wz + ww, th.curtain, 0); if (th.closed) for (let z = wz; z < wz + ww; z++) G.set(x0, y, z, th.curtain, 0); }
    }
  }

  /* ── 組成網格 ── */
  function toMeshes(T, G, opt) {
    const solid = [], glow = [], win = [];
    for (const v of G.m.values()) {
      if (v.c == null) continue;
      const { x, y, z } = v;
      if (G.has(x + 1, y, z) && G.has(x - 1, y, z) && G.has(x, y + 1, z) && G.has(x, y - 1, z) && G.has(x, y, z + 1) && G.has(x, y, z - 1)) continue;
      let col = new T.Color(v.c);
      if (v.f & F_GLOW) { glow.push([x, y, z, col]); continue; }
      if (v.f & F_WIN) { win.push([x, y, z, col]); continue; }
      let empty = 0;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) if ((dx || dy || dz) && !G.has(x + dx, y + dy, z + dz)) empty++;
      let ao = Math.max(0.6, Math.min(1.04, 0.55 + empty * 0.05));
      if (v.f & F_NOAO) { let up = 0; for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) if (G.has(x + dx, y + 1, z + dz)) up++; ao = 1.02 - up * 0.04; }
      col.multiplyScalar(ao * (0.985 + hashI(x, y, z) * 0.03));
      solid.push([x, y, z, col]);
    }
    const geo = new T.BoxGeometry(V, V, V), M = new T.Matrix4(), out = {};
    const mk = (list, mat, shadow) => {
      if (!list.length) return null;
      const im = new T.InstancedMesh(geo, mat, list.length);
      list.forEach(([x, y, z, c], i) => { M.makeTranslation((x + 0.5) * V, (y + 0.5) * V, (z + 0.5) * V); im.setMatrixAt(i, M); im.setColorAt(i, c); });
      im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.castShadow = shadow; im.receiveShadow = shadow; im.userData.noVox = true; return im;
    };
    out.solid = mk(solid, new T.MeshLambertMaterial({ color: 0xFFFFFF }), true);
    out.glow = mk(glow, new T.MeshBasicMaterial({ color: 0xFFFFFF }), false);
    out.winMat = new T.MeshBasicMaterial({ color: 0xFFFFFF });
    out.win = mk(win, out.winMat, false);
    out.count = solid.length + glow.length + win.length;
    return out;
  }

  /* ── 對外：建一個房間 ──
   * spec：[type, u, v, o]；place(u, v) 換算成公尺；colOf 處理 "owner:名字" 這種顏色 */
  function build(T, W, D, spec, theme, place, colOf) {
    const G = new Grid(), lights = [];
    shell(G, W, D, theme);
    for (const [type, u, v, o0] of spec) {
      const o = o0 || {}, [x, z] = place(u, v);
      const B = placer(G, x, z, o.rot || 0, lights);
      vfurn(type, o, B, colOf(o.c), {});
    }
    const ms = toMeshes(T, G);
    return { meshes: ms, lights };
  }
  N.voxRoom = { build, V };
})();
