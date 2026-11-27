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
  // 椅子：座面高 0.45、座面 0.5×0.5（坐 1.6 公尺的人剛好）
  function chairV(B, x, z, fx, fz, c) {
    B(0.5, 0.1, 0.5, c, x, 0.35, z);
    for (const dx of [-0.2, 0.2]) for (const dz of [-0.2, 0.2]) B(0.1, 0.35, 0.1, 0x4E3624, x + dx, 0, z + dz);
    if (fx) B(0.1, 0.5, 0.5, c, x - fx * 0.2, 0.45, z); else B(0.5, 0.5, 0.1, c, x, 0.45, z - fz * 0.2);
  }
  // 桌面抬高：原本 0.6 的桌面改成 0.75（lim 以上的零件一起往上移，桌腳拉長），椅子不受影響
  function lift(B, lim, dy) {
    const L = (w, h, d, c, x, y, z, f, pat) => {
      y = y || 0;
      if (y >= lim - 0.001) return B(w, h, d, c, x, y + dy, z, f, pat);
      if (y < 0.001 && Math.abs(h - lim) < 0.001) return B(w, h + dy, d, c, x, y, z, f, pat);
      return B(w, h, d, c, x, y, z, f, pat);
    };
    L.light = (x, y, z, col, pw) => B.light(x, y >= lim ? y + dy : y, z, col, pw);
    L.paint = B.paint;
    return L;
  }
  function candleV(B, x, y, z, tall) {
    B(0.1, tall || 0.2, 0.1, 0xF2EAD8, x, y, z); B(0.1, 0.1, 0.1, 0xFFC04A, x, y + (tall || 0.2), z, F_GLOW);
  }
  function leaves(B, x, y, z, r, seed) {
    for (let i = 0; i < 14; i++) { const a = hashI(seed, i, 1) * 6.28, d = hashI(seed, i, 2) * r; B(0.2, 0.2, 0.2, pick([0x5E9A4E, 0x4E8A44, 0x7AB05E], i), x + Math.cos(a) * d, y + hashI(seed, i, 3) * r * 1.2, z + Math.sin(a) * d); }
  }

  /* ── 家具 ── */
  // 櫃子的一層：一段書、一個小東西、再一段書……（瓶罐、盒子、小盆栽、相框、小擺飾）
  const KNICK = [0x8EE0C8, 0xE8A0B0, 0xF0D890, 0xC8A0E8, 0xE8E0D0, 0x9AC0E0];
  function trinket(B, x, y, z, k) {
    switch (k % 6) {
      case 0: B(0.1, 0.2, 0.1, pick(KNICK, k), x, y, z); B(0.1, 0.1, 0.1, 0xD8D0C0, x, y + 0.2, z); break;            // 瓶子
      case 1: B(0.2, 0.1, 0.2, pick([0xB8683E, 0x6A8AA8, 0xC8B090], k), x, y, z); B(0.1, 0.1, 0.1, pick(KNICK, k + 2), x, y + 0.1, z); break;   // 小盒子
      case 2: B(0.1, 0.1, 0.1, 0xB8683E, x, y, z); B(0.2, 0.1, 0.2, 0x5E9A4E, x, y + 0.1, z); B(0.1, 0.1, 0.1, 0x7AB05E, x, y + 0.2, z); break;   // 小盆栽
      case 3: B(0.2, 0.2, 0.1, 0x6A4630, x, y, z - 0.05); B(0.1, 0.1, 0.1, pick(KNICK, k + 1), x, y + 0.05, z); break;   // 小相框
      case 4: B(0.1, 0.1, 0.1, pick(KNICK, k + 3), x, y, z); B(0.1, 0.1, 0.1, pick(KNICK, k + 4), x, y + 0.1, z); break;   // 小擺飾
      default: B(0.2, 0.1, 0.2, 0xE8E0D0, x, y, z); B(0.1, 0.1, 0.1, 0x8A5E3E, x, y + 0.1, z);                          // 杯子
    }
  }
  function shelfRow(B, x0, x1, y, z, seed, pal, booksOnly) {
    let x = x0, i = seed || 0;
    while (x < x1 - 0.05) {
      if (!booksOnly && hashI(i, seed, 4) < 0.28 && x < x1 - 0.2) { trinket(B, x + 0.1, y, z, i + seed); x += 0.25; }
      else { const h = 0.2 + ((i * 7) % 3) * 0.05, lean = hashI(i, seed, 2) < 0.1; B(0.1, lean ? 0.15 : h, 0.2, pick(pal || BOOKS, i * 3 + 1), x + 0.05, y, z); x += 0.1; if ((i * 5) % 7 === 3) x += 0.1; }
      i++;
    }
  }
  function shelfTop(B, x0, x1, y, z, seed) { for (let x = x0 + 0.05, k = 0; x < x1; x += 0.3, k++) if (hashI(k, seed, 6) < 0.7) trinket(B, x, y, z, k * 3 + seed); }
  function vfurn(type, o, B, c, ctx) {
    const wood = 0x8E6A45;
    switch (type) {
      case "bed": {
        const fr = o.frame || 0x6B4E3A;
        B(1.0, 0.2, 1.8, fr, 0, 0, 0); B(0.9, 0.1, 1.7, 0xF4F0E8, 0, 0.2, 0);
        B(0.9, 0.1, 1.1, c, 0, 0.3, 0.3, 0, (i, j, k) => (k === 0 ? 0xF4F0E8 : (i + k) % 5 === 0 ? mix(c, 0x000000, 0.12) : c));
        B(0.6, 0.1, 0.3, 0xFFFFFF, 0, 0.3, -0.6); B(1.0, 0.7, 0.1, fr, 0, 0, -0.9); B(1.0, 0.4, 0.1, fr, 0, 0, 0.9);
        break; }
      case "hammock": {   // 夠一個人整個躺平：布面 1.8 × 0.8，中間低、兩頭翹起來，用繩子掛在柱子上
        const rope = 0x8A7A68, stripe = (i, j, k) => (i + k) % 3 ? c : mix(c, 0xFFFFFF, 0.3);
        B(0.1, 1.5, 0.1, 0x3A2A3A, -1.1, 0, 0); B(0.1, 1.5, 0.1, 0x3A2A3A, 1.1, 0, 0);
        B(1.2, 0.1, 0.8, c, 0, 0.4, 0, 0, stripe);
        B(0.3, 0.1, 0.8, c, -0.75, 0.5, 0, 0, stripe); B(0.3, 0.1, 0.8, c, 0.75, 0.5, 0, 0, stripe);
        B(0.1, 0.1, 0.8, c, -0.9, 0.6, 0); B(0.1, 0.1, 0.8, c, 0.9, 0.6, 0);
        for (const sx of [-1, 1]) for (let t = 0; t < 4; t++) B(0.1, 0.1, 0.1, rope, sx * (0.95 + t * 0.05), 0.7 + t * 0.2, 0);
        B(0.4, 0.1, 0.5, 0xFFFFFF, 0.65, 0.6, 0); break; }
      case "sofa":
        B(1.6, 0.3, 0.7, c, 0, 0.1, 0); B(1.6, 0.5, 0.2, mix(c, 0x000000, 0.15), 0, 0.3, -0.3);
        B(0.2, 0.6, 0.8, mix(c, 0x000000, 0.15), -0.9, 0, -0.05); B(0.2, 0.6, 0.8, mix(c, 0x000000, 0.15), 0.9, 0, -0.05);
        B(1.4, 0.1, 0.6, 0x3A2A22, 0, 0, 0);
        B(0.3, 0.3, 0.1, o.pillow || 0xF4E1A6, -0.5, 0.4, -0.15); B(0.3, 0.3, 0.1, mix(o.pillow || 0xF4E1A6, 0xFFFFFF, 0.3), 0.5, 0.4, -0.15); break;
      case "beanbag":
        B(0.7, 0.2, 0.7, c, 0, 0, 0); B(0.5, 0.1, 0.5, c, 0, 0.2, 0); B(0.5, 0.3, 0.2, mix(c, 0x000000, 0.15), 0, 0.2, -0.25); break;
      case "gamechair":
        B(0.5, 0.1, 0.5, 0x22262E, 0, 0.3, 0); B(0.1, 0.3, 0.1, 0x555A66, 0, 0, 0); B(0.5, 0.1, 0.1, 0x555A66, 0, 0, 0); B(0.1, 0.1, 0.5, 0x555A66, 0, 0, 0);
        B(0.5, 0.8, 0.1, 0x22262E, 0, 0.4, -0.22, 0, (i, j) => (i === 0 || i === 4 || j === 7) ? 0x8EEA3A : 0x22262E); break;
      case "bench2":
        B(1.3, 0.1, 0.4, c, 0, 0.4, 0, 0, (i, j, k) => k % 2 ? c : mix(c, 0x000000, 0.12));
        B(0.1, 0.4, 0.4, 0x3B3F4A, -0.55, 0, 0); B(0.1, 0.4, 0.4, 0x3B3F4A, 0.55, 0, 0); break;
      case "table": {
        const Bt = lift(B, 0.5, 0.15);
        const n = o.seats == null ? 2 : o.seats, w = n > 2 ? 1.2 : 0.8;
        Bt(w, 0.1, 0.7, c, 0, 0.5, 0);
        for (const dx of [-w / 2 + 0.05, w / 2 - 0.05]) for (const dz of [-0.3, 0.3]) Bt(0.1, 0.5, 0.1, 0x5A4632, dx, 0, dz);
        const seats = [[-(w / 2 + 0.35), 0], [w / 2 + 0.35, 0], [0, 0.7], [0, -0.7]].slice(0, n);
        seats.forEach(([x, z]) => chairV(B, x, z, z ? 0 : (x < 0 ? 1 : -1), z ? (z < 0 ? 1 : -1) : 0, 0x7A5A40));
        if (o.bowls) for (let i = 0; i < 3; i++) { Bt(0.2, 0.1, 0.2, 0xF4F0E8, -0.35 + i * 0.35, 0.6, 0); Bt(0.1, 0.1, 0.1, 0xE8A040, -0.35 + i * 0.35, 0.7, 0); }
        if (o.donuts) for (let i = 0; i < 3; i++) Bt(0.2, 0.1, 0.2, [0xE8A87C, 0xF2B5C9, 0x8E5A3A][i], -0.25 + i * 0.25, 0.6, 0);
        if (o.ramen) { Bt(0.3, 0.1, 0.3, 0xD8402A, 0, 0.6, 0); Bt(0.2, 0.1, 0.2, 0xF4D890, 0, 0.7, 0); }
        if (o.noodle) { Bt(0.2, 0.2, 0.2, 0xF4F0E8, 0.1, 0.6, 0); Bt(0.4, 0.1, 0.3, 0xE8DCC8, -0.2, 0.6, 0.1); }
        if (o.cake) { Bt(0.3, 0.2, 0.3, 0xF4E8E0, 0, 0.6, 0); Bt(0.1, 0.1, 0.1, 0xD8282A, 0, 0.8, 0); }
        if (o.tea) { Bt(0.1, 0.1, 0.1, 0xF4F0E8, -0.2, 0.6, 0); Bt(0.2, 0.2, 0.2, 0xF4F0E8, 0.15, 0.6, 0); }
        break; }
      case "longtable": {
        const Bt = lift(B, 0.5, 0.15);
        Bt(2.6, 0.1, 0.8, c, 0, 0.5, 0, 0, (i, j, k) => (k === 0 || k === 7) ? mix(c, 0x000000, 0.15) : c);
        for (const dx of [-1.2, 1.2]) for (const dz of [-0.3, 0.3]) Bt(0.1, 0.5, 0.1, 0x4E3624, dx, 0, dz);
        for (const x of [-0.85, 0, 0.85]) chairV(B, x, 0.7, 0, -1, 0x7A5A40);
        if (o.chairsBack) for (const x of [-0.85, 0, 0.85]) chairV(B, x, -0.7, 0, 1, 0x7A5A40);
        Bt(0.3, 0.1, 0.2, 0xF4F0E8, -0.9, 0.6, 0); Bt(0.2, 0.1, 0.2, 0xF4F0E8, -0.85, 0.7, 0); Bt(0.1, 0.2, 0.1, 0xF4F0E8, -0.3, 0.6, -0.1);
        Bt(0.4, 0.1, 0.3, 0x3E6E8E, 0.3, 0.6, 0.1); Bt(0.1, 0.3, 0.1, 0x3B3F4A, 0.9, 0.6, -0.1); Bt(0.3, 0.1, 0.3, 0xFFE6A8, 0.9, 0.9, -0.1, F_GLOW);
        if (o.lampLight !== false) Bt.light(0.9, 1.0, -0.1, 0xFFB060, 0.6);
        break; }
      case "desk": {
        const Bt = lift(B, 0.6, 0.1);
        Bt(1.0, 0.1, 0.5, c, 0, 0.6, 0); Bt(0.1, 0.6, 0.5, c, -0.45, 0, 0); Bt(0.3, 0.6, 0.5, mix(c, 0x000000, 0.1), 0.35, 0, 0, 0, (i, j) => j === 2 ? 0x3A2A22 : mix(c, 0x000000, 0.1));
        chairV(B, 0, 0.6, 0, -1, 0x6B5A4A);
        Bt(0.2, 0.1, 0.3, 0xC0603F, -0.25, 0.7, -0.05); Bt(0.3, 0.1, 0.2, 0xFFFFFF, 0.15, 0.7, 0.05);
        if (o.papers) for (let i = 0; i < 3; i++) Bt(0.2, 0.1 + i * 0.1, 0.3, 0xF4F0E8, -0.3 + i * 0.25, 0.7, -0.1);
        if (o.lamp !== false) { Bt(0.1, 0.3, 0.1, 0x3B3F4A, 0.4, 0.7, -0.15); Bt(0.2, 0.1, 0.2, 0xFFE6A8, 0.4, 1.0, -0.1, F_GLOW); Bt.light(0.4, 1.0, -0.1, 0xFFB060, 0.5); }
        break; }
      case "magicdesk": {
        const Bt = lift(B, 0.6, 0.1);
        Bt(1.2, 0.1, 0.6, c, 0, 0.6, 0); Bt(0.1, 0.6, 0.6, c, -0.55, 0, 0); Bt(0.1, 0.6, 0.6, c, 0.55, 0, 0);
        chairV(B, 0, 0.65, 0, -1, 0x4A2A30);
        Bt(0.4, 0.1, 0.3, 0xE8D8B0, -0.2, 0.7, 0, 0, (i, j, k) => (i + k) % 3 === 0 ? 0x8E2A3A : 0xE8D8B0);   // 畫著法陣的羊皮紙
        Bt(0.3, 0.1, 0.2, 0x5A1E2E, 0.25, 0.7, -0.1); Bt(0.3, 0.1, 0.2, 0x3A1A4A, 0.25, 0.8, -0.1);   // 魔法書
        Bt(0.1, 0.2, 0.1, 0x8EE0C8, 0.45, 0.7, 0.1, F_GLOW); Bt(0.1, 0.1, 0.1, 0xC88EE8, 0.35, 0.7, 0.15, F_GLOW);   // 玻璃瓶
        Bt(0.1, 0.1, 0.1, 0xB89BFF, -0.45, 0.7, -0.15, F_GLOW);   // 水晶
        candleV(B, -0.45, 0.7, 0.15, 0.2); Bt.light(-0.45, 0.95, 0.15, 0xFFA040, 0.7);
        break; }
      case "classroom": {
        const Bt = lift(B, 0.5, 0.15);
        const rows = o.rows || 2, cols = o.cols || 3;
        for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
          const x = (k - (cols - 1) / 2) * 1.4, z = (r - (rows - 1) / 2) * 1.05;
          Bt(0.8, 0.1, 0.4, c, x, 0.5, z - 0.15); Bt(0.1, 0.5, 0.4, 0x6B6E78, x - 0.35, 0, z - 0.15); Bt(0.1, 0.5, 0.4, 0x6B6E78, x + 0.35, 0, z - 0.15);
          Bt(0.3, 0.1, 0.2, pick(BOOKS, r * 3 + k), x + 0.1, 0.6, z - 0.15);
          chairV(B, x, z + 0.35, 0, -1, 0x6B5A4A);
        }
        const bz = -(rows - 1) / 2 * 1.05 - 0.75;
        Bt(2.4, 1.0, 0.1, 0x2F4A3A, 0, 0.9, bz, 0, (i, j) => (i === 0 || i === 23 || j === 0 || j === 9) ? 0x8E6A45 : 0x2F4A3A);
        Bt(0.6, 0.1, 0.1, 0xF4F0E8, -0.3, 1.5, bz + 0.05); Bt(0.4, 0.1, 0.1, 0xF4F0E8, 0.4, 1.3, bz + 0.05); Bt(0.8, 0.1, 0.1, 0xF4F0E8, 0, 1.1, bz + 0.05);
        Bt(0.8, 0.8, 0.4, 0x8E6A45, 1.6, 0, bz + 0.4);
        break; }
      case "shelf": {
        const h = o.h || 1.7, fc = c;
        B(1.0, h, 0.4, fc, 0, 0, 0.15, 0, (i, j, k) => k > 0 && i > 0 && i < 9 && j > 0 && j % 4 !== 0 && j < h / V - 1 ? 0x2A1E16 : fc);
        for (let r = 0; r < Math.floor(h / 0.4); r++) shelfRow(B, -0.4, 0.4, 0.1 + r * 0.4, 0.2, r * 5 + (o.seed || 0), o.pal, o.mostlyBooks);
        shelfTop(B, -0.4, 0.4, h, 0.2, o.seed || 0);
        if (o.jars) for (let i = 0; i < 3; i++) B(0.1, 0.2, 0.1, [0x8EE0C8, 0xC88EE8, 0xE8C88E][i], -0.3 + i * 0.3, 0.1 + 2 * 0.4, 0.25, i === 1 ? F_GLOW : 0);
        if (o.candle) { candleV(B, 0.3, h, 0.15, 0.2); B.light(0.3, h + 0.3, 0.2, 0xFFA040, 0.6); }
        break; }
      case "counter": {
        const h = o.low ? 0.75 : 0.95;
        B(1.6, h, 0.5, c, 0, 0, 0, 0, (i, j) => j % 2 === 0 && j > 0 ? mix(c, 0x000000, 0.12) : c); B(1.8, 0.1, 0.6, 0xD8CBB8, 0, h, 0);
        for (const x of [-0.45, 0.45]) { B(0.4, 0.1, 0.4, 0x5A3B26, x, o.low ? 0.35 : 0.6, 0.65); B(0.1, o.low ? 0.35 : 0.6, 0.1, 0x3B3F4A, x, 0, 0.65); }
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
      case "computer": {   // 多螢幕電腦桌（科技風）
        const Bt = lift(B, 0.6, 0.1);
        Bt(1.4, 0.1, 0.6, 0x22262E, 0, 0.6, 0); Bt(0.1, 0.6, 0.6, 0x22262E, -0.65, 0, 0); Bt(0.1, 0.6, 0.6, 0x22262E, 0.65, 0, 0);
        Bt(1.4, 0.1, 0.1, 0x8EEA3A, 0, 0.55, 0.3, F_GLOW);
        for (const [x, ry] of [[-0.45, 0], [0, 0], [0.45, 0]]) { Bt(0.4, 0.3, 0.1, 0x111418, x, 0.8, -0.2); Bt(0.3, 0.2, 0.1, x ? 0x4AC8E8 : 0x8EEA3A, x, 0.85, -0.15, F_GLOW); Bt(0.1, 0.1, 0.1, 0x111418, x, 0.7, -0.2); }
        Bt(0.5, 0.1, 0.2, 0x333844, 0, 0.7, 0.1); Bt(0.1, 0.1, 0.1, 0x8EEA3A, 0.25, 0.7, 0.1, F_GLOW);
        Bt.light(0, 1.0, 0.2, 0x7AE8C8, 0.8);
        // 電競椅
        Bt(0.5, 0.1, 0.5, 0x22262E, 0, 0.4, 0.6); Bt(0.1, 0.4, 0.1, 0x555A66, 0, 0, 0.6);
        Bt(0.5, 0.7, 0.1, 0x22262E, 0, 0.5, 0.85, 0, (i, j) => (i === 0 || i === 4) ? 0x8EEA3A : 0x22262E);
        break; }
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
      case "oillamp": {   // 油燈：黃銅底座、玻璃燈罩裡一點火光；books:true 底下墊一疊書
        let y = 0;
        if (o.books) { for (let i = 0; i < 3; i++) B(0.3 - (i % 2) * 0.1, 0.1, 0.2, pick(BOOKS, i + (o.seed || 0)), (i % 2) * 0.05, i * 0.1, 0); y = 0.3; }
        const brass = 0xC89A4A;
        B(0.2, 0.1, 0.2, brass, 0, y, 0); B(0.1, 0.1, 0.1, mix(brass, 0x000000, 0.2), 0, y + 0.1, 0);
        B(0.2, 0.2, 0.2, 0xFFD890, 0, y + 0.2, 0, F_GLOW); B(0.1, 0.1, 0.1, 0x3B3F4A, 0, y + 0.4, 0);
        B.light(0, y + 0.3, 0, 0xFFA040, 0.45); break; }
      case "nightstand": {   // 床頭櫃／邊桌：小抽屜，上面一盞小檯燈、幾本書
        const cc = c || 0x7A5638;
        B(0.5, 0.5, 0.4, cc, 0, 0, 0.2, 0, (i, j) => j === 2 ? mix(cc, 0x000000, 0.2) : (j === 3 && i === 2) ? 0xD8B060 : cc);
        B(0.5, 0.1, 0.4, mix(cc, 0xFFFFFF, 0.1), 0, 0.5, 0.2);
        B(0.1, 0.2, 0.1, 0x3B3F4A, 0.1, 0.6, 0.15); B(0.3, 0.2, 0.3, pick([0xFFE6A8, 0xFFD8B0, 0xF8D0A0], o.seed || 0), 0.1, 0.8, 0.15, F_GLOW);
        B.light(0.1, 0.9, 0.2, 0xFFB060, 0.35);
        B(0.2, 0.1, 0.2, pick(BOOKS, o.seed || 1), -0.1, 0.6, 0.25);
        break; }
      case "coffeetable": {   // 茶几：矮桌，上面有杯子、書、小盆栽
        const cc = c || 0x6B4A30;
        B(1.0, 0.1, 0.6, cc, 0, 0.35, 0); for (const dx of [-0.4, 0.4]) for (const dz of [-0.2, 0.2]) B(0.1, 0.35, 0.1, mix(cc, 0x000000, 0.2), dx, 0, dz);
        B(0.8, 0.1, 0.4, mix(cc, 0x000000, 0.1), 0, 0.1, 0);
        B(0.1, 0.1, 0.1, 0xF4F0E8, -0.3, 0.45, 0.1); B(0.1, 0.1, 0.1, 0xE8A0A0, -0.15, 0.45, -0.1);
        B(0.3, 0.1, 0.2, pick(BOOKS, o.seed || 2), 0.2, 0.45, 0.05); B(0.2, 0.1, 0.2, 0xB8683E, 0.3, 0.55, -0.15); leaves(B, 0.3, 0.65, -0.15, 0.12, o.seed || 3);
        break; }
      case "island": {   // 店中間的展示台：一圈小商品
        const cc = c || 0x7A5638;
        B(1.4, 0.8, 0.8, cc, 0, 0, 0, 0, (i, j) => j % 3 === 0 ? mix(cc, 0x000000, 0.15) : cc); B(1.5, 0.1, 0.9, mix(cc, 0xFFFFFF, 0.12), 0, 0.8, 0);
        for (let k = 0; k < 4; k++) trinket(B, -0.5 + k * 0.33, 0.9, -0.2, k + (o.seed || 0) * 3);
        books(B, -0.6, 0.1, 0.9, 0.2, 0.2, o.seed || 4); trinket(B, 0.4, 0.9, 0.2, (o.seed || 0) + 9);
        break; }
      case "sideboard": {   // 靠牆的矮櫃：抽屜、門，上面擺花瓶、相框、書、小東西
        const cc = c || 0x7A5638;
        B(1.4, 0.8, 0.5, cc, 0, 0, 0.2, 0, (i, j, k, ni, nj) => (j === 3 || i === 7) ? mix(cc, 0x000000, 0.2) : (j === 5 && (i === 3 || i === 10)) ? 0xD8B060 : cc);
        B(1.5, 0.1, 0.6, mix(cc, 0xFFFFFF, 0.1), 0, 0.8, 0.2);
        B(0.2, 0.3, 0.2, pick([0xE8E0D0, 0x5A7A9A, 0xB8683E], o.seed || 0), -0.5, 0.9, 0.2); B(0.2, 0.2, 0.2, pick([0xF07AA0, 0xF4C840, 0xFFFFFF], o.seed || 1), -0.5, 1.2, 0.2);
        B(0.3, 0.3, 0.1, 0x6A4630, -0.1, 0.9, 0.05); B(0.1, 0.2, 0.1, 0x8AB0C8, -0.1, 0.95, 0.1);
        books(B, 0.15, 0.45, 0.9, 0.2, 0.2, o.seed || 2); trinket(B, 0.6, 0.9, 0.25, (o.seed || 0) + 4);
        break; }
      case "curio": {   // 玻璃展示櫃：一格一格擺滿收藏
        const cc = c || 0x5A3B26;
        B(0.9, 1.9, 0.4, cc, 0, 0, 0.15, 0, (i, j, k, ni, nj, nk) => (i === 0 || i === ni - 1 || j === 0 || j === nj - 1 || j % 5 === 0) ? cc : k === nk - 1 ? null : 0x2A1E16);
        for (let r = 0; r < 3; r++) for (let k = 0; k < 3; k++) trinket(B, -0.25 + k * 0.25, 0.1 + r * 0.5, 0.2, r * 7 + k + (o.seed || 0));
        B(0.7, 0.4, 0.1, 0xC8E0E8, 0, 1.4, 0.35, F_WIN);
        break; }
      case "frames": {   // 牆上一組大小不一的相框
        const fr = [[-0.35, 1.5, 0.3, 0.4], [0.05, 1.65, 0.3, 0.3], [0.35, 1.45, 0.2, 0.3], [-0.05, 1.3, 0.2, 0.2], [0.3, 1.85, 0.2, 0.2]];
        fr.forEach(([x, y, w, h], i) => { B(w + 0.1, h + 0.1, 0.1, i % 2 ? 0x6A4630 : 0xD8B060, x, y, 0.05); B(w - 0.1 > 0 ? w - 0.1 : 0.1, h - 0.1 > 0 ? h - 0.1 : 0.1, 0.1, pick([0x8AB0C8, 0xE8B0A0, 0x9AC08A, 0xF0D890, 0xB8A0D8], i + (o.seed || 0)), x, y + 0.1, 0.1); });
        break; }
      case "wallshelf":   // 牆上的層板，放書、小盆栽、瓶子
        B(1.0, 0.1, 0.3, c || 0x8A5E3E, 0, 1.4, 0.15); B(0.1, 0.2, 0.2, 0x3B3F4A, -0.4, 1.3, 0.1); B(0.1, 0.2, 0.2, 0x3B3F4A, 0.4, 1.3, 0.1);
        books(B, -0.45, 0.05, 1.5, 0.15, 0.2, o.seed || 3);
        B(0.2, 0.2, 0.2, 0xB8683E, 0.2, 1.5, 0.15); B(0.2, 0.2, 0.2, 0x5E9A4E, 0.2, 1.7, 0.15); B(0.1, 0.2, 0.1, pick([0x8EE0C8, 0xE8A0B0, 0xF0D890], o.seed || 1), 0.4, 1.5, 0.15);
        break;
      case "hangplant":   // 掛在牆上的垂吊植物
        B(0.1, 0.3, 0.1, 0x3B3F4A, 0, 1.8, 0.1); B(0.3, 0.2, 0.3, 0xB8683E, 0, 1.6, 0.2);
        for (let i = 0; i < 6; i++) B(0.1, 0.2 + (i % 3) * 0.1, 0.1, pick([0x5E9A4E, 0x4E8A44, 0x7AB05E], i), -0.15 + (i % 4) * 0.1, 1.35 - (i % 3) * 0.1, 0.15 + (i % 2) * 0.1);
        break;
      case "pots":   // 牆邊一排小盆栽
        for (let i = 0; i < 3; i++) { const x = -0.25 + i * 0.25, h = 0.2 + (i % 2) * 0.1; B(0.2, h, 0.2, pick([0xB8683E, 0xE8E0D0, 0x5A7A9A], i + (o.seed || 0)), x, 0, 0.15); leaves(B, x, h, 0.15, 0.15 + (i % 2) * 0.05, i * 5 + (o.seed || 0)); }
        break;
      case "sconce":   // 壁燈：掛在牆上的小燈
        B(0.1, 0.3, 0.1, 0x3B3F4A, 0, 1.5, 0.05); B(0.3, 0.1, 0.2, 0x3B3F4A, 0, 1.75, 0.1); B(0.2, 0.2, 0.2, 0xFFE6A8, 0, 1.6, 0.15, F_GLOW);
        B.light(0, 1.7, 0.35, 0xFFB060, 0.6); break;
      case "lamp":
        B(0.1, 1.5, 0.1, 0x3B3F4A, 0, 0, 0); B(0.3, 0.1, 0.3, 0x3B3F4A, 0, 0, 0); B(0.3, 0.3, 0.3, 0xFFE6A8, 0, 1.5, 0, F_GLOW);
        B.light(0, 1.6, 0, 0xFFB060, 0.7); break;
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
      case "typewriter": {
        const Bt = lift(B, 0.6, 0.1);
        Bt(0.6, 0.1, 0.4, 0x5A4632, 0, 0.6, 0); Bt(0.1, 0.6, 0.4, 0x5A4632, -0.25, 0, 0); Bt(0.1, 0.6, 0.4, 0x5A4632, 0.25, 0, 0);
        Bt(0.3, 0.1, 0.2, 0x2A2A2E, 0, 0.7, 0); Bt(0.2, 0.2, 0.1, 0xF4F0E8, 0, 0.8, -0.05); break; }
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
        B(0.7, 1.8, 0.6, 0xF4F0E8, 0, 0, 0, 0, (i, j) => j === 11 ? 0xD8D4CC : 0xF4F0E8); B(0.1, 0.5, 0.1, 0x9A9A9A, 0.25, 0.9, 0.32);
        for (let i = 0; i < 4; i++) B(0.1, 0.1, 0.1, [0xE0578A, 0xF2C14E, 0x2FA85C, 0x4A6FA5][i], -0.15 + (i % 2) * 0.2, 1.3 + Math.floor(i / 2) * 0.2, 0.32); break;
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
        B(0.1, 1.7, 0.1, 0x9A9A9A, -0.5, 0, 0); B(0.1, 1.7, 0.1, 0x9A9A9A, 0.5, 0, 0); B(1.1, 0.1, 0.1, 0x9A9A9A, 0, 1.7, 0);
        for (let i = 0; i < 5; i++) B(0.1, 0.8 - (i % 2) * 0.2, 0.4, (o.pal || [0xC2455A, 0x4A6FA5, 0xF2C14E, 0x2F5D50, 0xE8DCC8])[i % 5], -0.36 + i * 0.18, 0.9 + (i % 2) * 0.2, 0); break;
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
        B(0.3, 0.6, 0.3, 0xA8A498, 0, 0, 0); B(0.5, 0.1, 0.5, 0xA8A498, 0, 0.6, 0); B(0.3, 0.2, 0.3, 0xFFE6A8, 0, 0.7, 0, F_GLOW); B(0.5, 0.1, 0.5, 0xA8A498, 0, 0.9, 0); B.light(0, 0.8, 0, 0xFFB060, 0.5); break;
      case "streetlamp":
        B(0.1, 2.0, 0.1, 0x2E3238, 0, 0, 0); B(0.3, 0.1, 0.3, 0x2E3238, 0, 0, 0); B(0.3, 0.3, 0.3, 0xFFE6A8, 0, 2.0, 0, F_GLOW); B(0.4, 0.1, 0.4, 0x2E3238, 0, 2.3, 0); B.light(0, 2.0, 0, 0xFFB060, 0.6); break;
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
      { const dl = o.l || 1.6; B(0.8, 0.2, dl, 0x8A6A4A, 0, 0.1, 0, 0, (i, j, k) => k % 2 ? 0x8A6A4A : 0x7A5A3A); for (let z = -dl / 2 + 0.1; z <= dl / 2 - 0.1 + 1e-6; z += Math.max(0.6, (dl - 0.2) / Math.max(1, Math.round((dl - 0.2) / 0.8)))) for (const x of [-0.35, 0.35]) B(0.1, 0.3, 0.1, 0x5A4632, x, 0, z); } break;
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
      case "clocktower": if (o.big) {   // 鐘塔廣場正中間的大鐘塔（真實大小，約 15 公尺高）
        B(4.4, 0.3, 4.4, 0xB8B0A2, 0, 0, 0); B(3.8, 0.3, 3.8, 0xC8C0B0, 0, 0.3, 0);
        B(3.0, 9.0, 3.0, 0xD8C8A5, 0, 0.6, 0, 0, (i, j, k, ni, nj, nk) => (j % 6 === 0) ? 0xC4B492 : ((i === 0 || i === ni - 1) && (k === 0 || k === nk - 1)) ? 0xB8A888 : 0xD8C8A5);
        for (const [dx, dz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {   // 每面一扇門／窗
          const ax = dx ? 0.1 : 0.8, az = dz ? 0.1 : 0.8;
          B(ax, 2.1, az, 0x5A3A26, dx * 1.5, 0.6, dz * 1.5); B(dx ? 0.1 : 0.5, 1.0, dz ? 0.1 : 0.5, 0xF4D8A0, dx * 1.5, 4.6, dz * 1.5, F_WIN);
          B(dx ? 0.1 : 1.4, 1.4, dz ? 0.1 : 1.4, 0xF4F0E4, dx * 1.65, 10.0, dz * 1.65, F_GLOW);   // 鐘面
          B(dx ? 0.12 : 0.1, 0.6, dz ? 0.12 : 0.1, 0x2A2A2A, dx * 1.72, 10.7, dz * 1.72); B(dx ? 0.12 : 0.45, 0.1, dz ? 0.12 : 0.45, 0x2A2A2A, dx * 1.72 + (dz ? 0.18 : 0), 10.7, dz * 1.72 + (dx ? 0.18 : 0));
        }
        B(3.4, 0.3, 3.4, 0x8E6A45, 0, 9.6, 0); B(3.2, 2.2, 3.2, 0xD0C0A0, 0, 9.6, 0); B(3.5, 0.3, 3.5, 0x8E6A45, 0, 11.8, 0);
        B(2.6, 1.6, 2.6, 0xC8B898, 0, 12.1, 0, 0, (i, j, k, ni, nj, nk) => ((i % 5 === 0 || k % 5 === 0) || j === nj - 1) ? 0xC8B898 : null);   // 鐘樓（開口）
        B(0.6, 0.6, 0.6, 0xC8A040, 0, 12.6, 0);
        for (let s2 = 0; s2 < 6; s2++) { const w = 3.0 - s2 * 0.5; B(w, 0.5, w, s2 % 2 ? 0x3E6A5A : 0x4A7A68, 0, 13.7 + s2 * 0.5, 0); }
        B(0.1, 0.8, 0.1, 0xC8A040, 0, 16.7, 0);
        break;
      } B(1.2, 2.4, 1.2, 0xC8B898, 0, 0, 0, 0, (i, j, k) => (j % 3 === 0) ? 0xB8A888 : 0xC8B898); B(0.6, 0.6, 0.1, 0xF4F0E4, 0, 1.6, 0.6, F_GLOW); B(0.1, 0.3, 0.1, 0x2A2A2A, 0, 1.8, 0.65); break;
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
    const nx = Math.round(W / V), nz = Math.round(D / V), x0 = -Math.round(W / 2 / V), z0 = -Math.round(D / 2 / V), H = th.outdoor ? 0 : (th.ceil ? Math.round(th.ceil / V) : 26);
    // 右後角切掉一塊（L 形房間）：cut = [寬, 深]（公尺）
    const cw = th.cut ? Math.round(th.cut[0] / V) : 0, cd = th.cut ? Math.round(th.cut[1] / V) : 0;
    const inCut = (x, z) => cw && x >= nx - cw && z < cd;
    const fl = th.floor || [0xB07D52, 0xA06F47, 0xB98858], seam = th.seam || 0x7E5636;
    for (let x = -2; x < nx; x++) for (let z = -2; z < nz; z++) {
      let c;
      if (th.outdoor) { const h = hashI(x, z, 5), gf = GROUND[th.ground || "grass"] || GROUND.grass; c = gf(x, z, h); }
      else c = floorPat(th.floorPat, x, z, fl, seam);
      if (!th.outdoor && inCut(x, z)) continue;
      G.set(x0 + x, -1, z0 + z, c, F_NOAO);
      G.set(x0 + x, -2, z0 + z, th.outdoor ? 0x7A5A3A : 0x6E4A30, F_NOAO);
    }
    if (th.outdoor) return;
    const wall = th.wall, wall2 = th.wall2 || mix(th.wall, 0x000000, 0.06), wain = th.wain || 0x82593A, trim = th.trim || 0x5A3B26, cap = th.cap || mix(th.wall, 0xFFFFFF, 0.25);
    const wy = th.wainH != null ? th.wainH : 8, wp = th.wallPat, wc3 = th.wall3 || mix(wall, 0xFFFFFF, 0.3);
    const paper = (u, y, base) => wallPat(wp, u, y, base, wc3);
    const wc = (u, y, base) => y < wy ? ((u % 6 === 0) ? mix(wain, 0x000000, 0.1) : wain) : y === wy ? trim : y >= H - 1 ? cap : paper(u, y, base);
    for (let x = -2; x < nx; x++) for (let y = -1; y < H; y++) for (let z = -2; z < 0; z++) {
      if (inCut(x, 0)) { if (z === -1 || z === -2) G.set(x0 + x, y, z0 + cd + z, wc(x, y, wall), 0); continue; }
      G.set(x0 + x, y, z0 + z, wc(x, y, wall), 0);
    }
    // L 形的內轉角牆
    if (cw) for (let z = -2; z < cd; z++) for (let y = -1; y < H; y++) for (let k = 0; k < 2; k++) G.set(x0 + nx - cw - 1 - k + 1, y, z0 + z, wc(z, y, wall2), 0);
    for (let z = 0; z < nz; z++) for (let y = -1; y < H; y++) for (let x = -2; x < 0; x++) G.set(x0 + x, y, z0 + z, wc(z, y, wall2), 0);
    // 主燈顏色
    if (th.lampC) th._lampC = th.lampC;
    // 窗戶：每間房一種造型，大中小混著開在左牆和後牆
    if (th.window !== false) windows(G, th, x0, z0, nx, nz, cw, cd);
  }

  /* ── 右牆、前牆（前牆中間一扇門）──
   * 回傳 sideOf(x, y, z)：牆上的方塊屬於哪一面（L 左、B 後、R 右、F 前），踢腳板以下和地板是 null（永遠不透明） */
  function outerWalls(G, W, D, th) {
    const nx = Math.round(W / V), nz = Math.round(D / V), x0 = -Math.round(W / 2 / V), z0 = -Math.round(D / 2 / V), x1 = x0 + nx, z1 = z0 + nz;
    const H = th.ceil ? Math.round(th.ceil / V) : 26;
    const cw = th.cut ? Math.round(th.cut[0] / V) : 0, cd = th.cut ? Math.round(th.cut[1] / V) : 0;
    const wall = th.wall, wall2 = th.wall2 || mix(th.wall, 0x000000, 0.06), wain = th.wain || 0x82593A, trim = th.trim || 0x5A3B26, cap = th.cap || mix(th.wall, 0xFFFFFF, 0.25);
    const wy = th.wainH != null ? th.wainH : 8, wp = th.wallPat, wc3 = th.wall3 || mix(wall, 0xFFFFFF, 0.3);
    const wc = (u, y, base) => y < wy ? ((u % 6 === 0) ? mix(wain, 0x000000, 0.1) : wain) : y === wy ? trim : y >= H - 1 ? cap : wallPat(wp, u, y, base, wc3);
    const put = (x, y, z, c) => { if (!G.has(x, y, z)) G.set(x, y, z, c, 0); };
    const zr0 = cw ? z0 + cd - 2 : z0 - 2;
    // 右牆
    for (let x = x1; x < x1 + 2; x++) for (let z = zr0; z < z1 + 2; z++) {
      for (let y = -2; y < 0; y++) put(x, y, z, y === -1 ? 0x6E4A30 : 0x5E3E28);
      for (let y = 0; y < H; y++) put(x, y, z, wc(z - z0, y, wall2));
    }
    // 前牆：門寬 1 公尺、高 2.1 公尺，門框、門板、門把
    const dx0 = -5, dx1 = 4, dh = 21;
    for (let z = z1; z < z1 + 2; z++) for (let x = x0 - 2; x < x1; x++) {
      for (let y = -2; y < 0; y++) put(x, y, z, y === -1 ? 0x6E4A30 : 0x5E3E28);
      for (let y = 0; y < H; y++) {
        const inDoor = x >= dx0 && x <= dx1 && y < dh, frame = (x === dx0 - 1 || x === dx1 + 1) && y <= dh || (x >= dx0 - 1 && x <= dx1 + 1 && y === dh);
        if (inDoor) { if (z === z1 + 1) put(x, y, z, (x === dx0 || x === dx1 || y === 0 || y === dh - 1) ? 0x5A3C26 : 0x6A4A30); continue; }
        put(x, y, z, frame ? trim : wc(x - x0, y, wall));
      }
    }
    put(dx1 - 1, 10, z1, 0xD8A840);
    const base = 2;
    return (x, y, z) => {
      if (y < base) return null;
      if (x < x0) return "L";
      if (z < z0) return "B";
      if (x >= x1) return "R";
      if (z >= z1) return "F";
      if (cw && z < z0 + cd && x >= x1 - cw - 1) return z >= z0 + cd - 2 && x > x1 - cw ? "B" : "R";
      return null;
    };
  }

  /* ── 天花板主燈 ──
   * dome 碗型吊燈、chandelier 燭台吊燈、flush 吸頂燈、lantern 紙燈籠、bulbs 燈泡串、industrial 工業風燈罩
   * 燈光是柔和的點光（不投影子），所以不會有從上往下打的硬陰影 */
  const CEIL_STYLES = ["dome", "chandelier", "flush", "lantern", "bulbs", "industrial"];
  function ceilLamp(G, lx, lz, H, style, th, lights) {
    const set = (x, y, z, c, f) => G.set(lx + x, y, lz + z, c, f || 0);
    const glowC = th.bulbC || 0xFFE6B0, metal = th.lampMetal || 0x3A3430, brass = 0xC89A4A, col = th.lampC || 0xFFB870;
    let ly = H - 6;
    switch (style) {
      case "chandelier": {
        for (let y = H - 4; y < H; y++) set(0, y, 0, brass);
        for (let y = H - 7; y < H - 4; y++) set(0, y, 0, brass);
        for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) { const d = Math.hypot(dx, dz); if (d > 2.4 && d < 3.5) set(dx, H - 7, dz, brass); }
        for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3, x = Math.round(Math.cos(a) * 3), z = Math.round(Math.sin(a) * 3); set(x, H - 6, z, 0xF4ECDC); set(x, H - 5, z, glowC, F_GLOW); }
        set(0, H - 8, 0, brass); ly = H - 6; break; }
      case "flush": {
        for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) if (Math.abs(dx) + Math.abs(dz) < 4) set(dx, H - 1, dz, (Math.abs(dx) < 2 && Math.abs(dz) < 2) ? glowC : 0xF4F0E8, (Math.abs(dx) < 2 && Math.abs(dz) < 2) ? F_GLOW : 0);
        ly = H - 2; break; }
      case "lantern": {
        for (let y = H - 5; y < H; y++) set(0, y, 0, 0x3A3430);
        const cy = H - 8;
        for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) for (let dz = -2; dz <= 2; dz++) if (Math.hypot(dx, dy * 1.15, dz) < 2.6) set(dx, cy + dy, dz, (dy + 2) % 2 ? mix(th.lanternC || 0xF8E0B8, 0xC07040, 0.15) : (th.lanternC || 0xF8E0B8), F_GLOW);
        set(0, cy + 3, 0, 0x3A3430); set(0, cy - 3, 0, 0x3A3430); ly = cy; break; }
      case "bulbs": {
        for (const [x, z, n] of [[-2, -1, 5], [1, -2, 8], [0, 2, 6], [2, 1, 4]]) { for (let y = H - n; y < H; y++) set(x, y, z, 0x2A2420); set(x, H - n - 1, z, glowC, F_GLOW); }
        ly = H - 7; break; }
      case "industrial": {
        for (let y = H - 5; y < H; y++) set(0, y, 0, 0x2A2420);
        const sh = th.shade || 0x2E4A3E;
        set(0, H - 6, 0, sh); for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) set(dx, H - 7, dz, sh);
        for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) if (Math.max(Math.abs(dx), Math.abs(dz)) === 2) set(dx, H - 8, dz, sh);
        set(0, H - 8, 0, glowC, F_GLOW); ly = H - 9; break; }
      default: {   // dome
        for (let y = H - 5; y < H; y++) set(0, y, 0, metal);
        const sh = th.shade || 0xE8D8C0;
        for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) set(dx, H - 6, dz, sh);
        for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) if (Math.max(Math.abs(dx), Math.abs(dz)) === 2 && Math.abs(dx) + Math.abs(dz) < 4) set(dx, H - 7, dz, sh);
        for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) set(dx, H - 8, dz, glowC, F_GLOW);
        ly = H - 9;
      }
    }
    lights.push({ x: (lx + 0.5) * V, y: ly * V, z: (lz + 0.5) * V, color: col, power: 1.3, ceil: true });
  }

  /* ── 窗戶 ──
   * 造型：square 方窗、grid 格子窗、arch 拱窗、tall 細長窗、round 圓窗、wide 橫長窗
   * mask(i, j, w, h)：0 牆、1 窗框、2 玻璃 */
  const WIN = {
    square: { sz: [[7, 7], [11, 10], [15, 12]], y: 9, mask: (i, j, w, h) => (i === 0 || j === 0 || i === w - 1 || j === h - 1 || i === (w >> 1) || (w > 12 && j === (h >> 1))) ? 1 : 2 },
    grid: { sz: [[7, 10], [10, 13], [13, 13]], y: 8, mask: (i, j, w, h) => (i % 3 === 0 || j % 3 === 0 || i === w - 1 || j === h - 1) ? 1 : 2 },
    arch: { sz: [[7, 12], [9, 15], [11, 17]], y: 7, mask: (i, j, w, h) => {
      const r = (w - 1) / 2, cy = h - 1 - r;
      if (j > cy) { const d = Math.hypot(i - r, j - cy); if (d > r + 0.4) return 0; if (d > r - 0.6) return 1; }
      return (i === 0 || i === w - 1 || j === 0 || i === Math.round(r) || j === Math.round(cy)) ? 1 : 2; } },
    tall: { sz: [[5, 13], [5, 16], [7, 18]], y: 5, mask: (i, j, w, h) => (i === 0 || j === 0 || i === w - 1 || j === h - 1 || j === h - 5) ? 1 : 2 },
    round: { sz: [[9, 9], [11, 11], [13, 13]], y: 11, mask: (i, j, w) => {
      const r = (w - 1) / 2, d = Math.hypot(i - r, j - r);
      return d > r + 0.4 ? 0 : d > r - 0.7 ? 1 : (i === Math.round(r) || j === Math.round(r)) ? 1 : 2; } },
    wide: { sz: [[14, 6], [19, 7], [24, 7]], y: 12, mask: (i, j, w, h) => (i === 0 || j === 0 || i === w - 1 || j === h - 1 || i % 5 === 0) ? 1 : 2 }
  };
  function windows(G, th, x0, z0, nx, nz, cw, cd) {
    const seed = th.seed || ((th.wall || 0) % 9973), H = th.ceil ? Math.round(th.ceil / V) : 26;
    const keys = Object.keys(WIN), style = WIN[th.winStyle] ? th.winStyle : keys[seed % keys.length], S = WIN[style];
    const frame = th.frame || 0xF4EEE2, out = th._winBlock = new Map();
    th._wins = [];   // 窗戶的位置（公尺）：給房間的陽光和光柱用
    const list = th.windows || (() => {
      const L = [];
      // 一間房一到兩扇就好：左牆一扇，後牆夠寬的話一半的房間再開一扇（有窗的地方牆上就不能擺東西）
      L.push(["L", 0.3 + (seed % 5) * 0.1, seed % 3]);
      if ((nx - cw) * V >= 7 && (seed >> 2) % 2) L.push(["B", 0.25 + ((seed >> 3) % 3) * 0.1, (seed + 1) % 3]);
      return L;
    })();
    for (const [side, t, si] of list) {
      const [w, h] = S.sz[Math.min(2, si)], y0 = Math.min(S.y, H - h - 3);
      const len = side === "L" ? nz : nx - cw;
      const a0 = Math.max(2, Math.min(len - w - 3, Math.round(t * len - w / 2)));
      th._wins.push(side === "L" ? { side, x: x0 * V, u0: (z0 + a0) * V, u1: (z0 + a0 + w) * V, y0: y0 * V, y1: (y0 + h) * V } : { side, z: z0 * V, u0: (x0 + a0) * V, u1: (x0 + a0 + w) * V, y0: y0 * V, y1: (y0 + h) * V });
      // 牆上挖洞、裝框、放玻璃
      for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) {
        const m = S.mask(i, j, w, h); if (!m) continue;
        for (let k = 1; k <= 2; k++) {
          const [x, z] = side === "L" ? [x0 - k, z0 + a0 + i] : [x0 + a0 + i, z0 - k], y = y0 + j;
          if (m === 1) G.set(x, y, z, frame, 0);
          else if (k === 1) G.set(x, y, z, 0xFFE6A8, F_WIN); else G.m.delete(K(x, y, z));
        }
      }
      // 窗台
      if (style !== "round" && style !== "wide") for (let i = -1; i <= w; i++) { const [x, z] = side === "L" ? [x0, z0 + a0 + i] : [x0 + a0 + i, z0]; G.set(x, y0 - 1, z, frame, 0); }
      // 窗簾
      if (th.curtain) for (let y = y0 - 1; y < Math.min(H - 1, y0 + h + 2); y++) for (const i of th.closed ? range(-1, w + 1) : [-2, -1, w, w + 1]) {
        const [x, z] = side === "L" ? [x0, z0 + a0 + i] : [x0 + a0 + i, z0];
        G.set(x, y, z, (i + y) % 3 ? th.curtain : mix(th.curtain, 0x000000, 0.15), 0);
      }
      // 窗前 0.6 公尺：自動擺的家具不能高過窗台
      for (let i = -2; i < w + 2; i++) for (let d = 0; d < 6; d++) {
        const [x, z] = side === "L" ? [x0 + d, z0 + a0 + i] : [x0 + a0 + i, z0 + d];
        out.set((x + 512) * 1024 + (z + 512), [y0, y0 + h]);
      }
    }
  }
  const range = (a, b) => { const r = []; for (let i = a; i < b; i++) r.push(i); return r; };

  // 壁紙：stripe 直條、pin 細直條、dots 點點、check 格子、diamond 菱格、brick 磚、panel 木板、wave 波浪、star 星星
  function wallPat(p, u, y, base, c3) {
    switch (p) {
      case "stripe": return (u >> 1) % 3 === 0 ? c3 : base;
      case "pin": return u % 5 === 0 ? c3 : base;
      case "dots": return (u % 4 === 1 && y % 4 === 1) || (u % 4 === 3 && y % 4 === 3) ? c3 : base;
      case "check": return ((u >> 1) + (y >> 1)) % 2 ? c3 : base;
      case "diamond": return (Math.abs((u % 6) - 3) + Math.abs((y % 6) - 3)) === 3 ? c3 : base;
      case "brick": return y % 3 === 0 || (u + ((y / 3 | 0) % 2) * 3) % 6 === 0 ? c3 : base;
      case "panel": return u % 4 === 0 ? c3 : base;
      case "wave": return (y + [0, 1, 1, 0, -1, -1][u % 6] + 12) % 4 === 0 ? c3 : base;
      case "star": return hashI(u, y, 9) < 0.06 ? c3 : base;
      default: return base;
    }
  }
  // 地板：plank 木地板（預設）、tile 方磚、check 黑白格、herring 人字拼、carpet 地毯、stone 石板、concrete 水泥
  function floorPat(p, x, z, fl, seam) {
    switch (p) {
      case "tile": return x % 5 === 4 || z % 5 === 4 ? seam : (((x / 5 | 0) + (z / 5 | 0)) % 2 ? fl[0] : fl[2] || fl[0]);
      case "check": return ((x >> 2) + (z >> 2)) % 2 ? fl[0] : fl[1];
      case "herring": { const b = ((x >> 1) + (z >> 2)) % 2; return ((b ? x : z) % 4 === 3) ? mix(fl[0], seam, 0.35) : (b ? fl[0] : fl[2] || fl[0]); }
      case "carpet": return (x % 8 === 0 || z % 8 === 0) ? fl[1] : fl[0];
      case "stone": return (x % 6 === 5 || (z + (x / 6 | 0) * 3) % 6 === 5) ? seam : pick(fl, (x * 7 + z * 13) >> 3);
      case "concrete": return hashI(x, z, 3) < 0.08 ? fl[1] : fl[0];
      default: return z % 4 === 3 ? mix(fl[0], seam, 0.35) : ((x + (z >> 2) * 7) % 16 === 0 ? mix(fl[0], seam, 0.2) : fl[0]);
    }
  }

  /* ── 組成網格 ── */
  function toMeshes(T, G, opt) {
    const solid0 = [], glow0 = [], win0 = [], sideOf = opt && opt.side, sides = {};
    for (const v of G.m.values()) {
      if (v.c == null) continue;
      const { x, y, z } = v;
      if (G.has(x + 1, y, z) && G.has(x - 1, y, z) && G.has(x, y + 1, z) && G.has(x, y - 1, z) && G.has(x, y, z + 1) && G.has(x, y, z - 1)) continue;
      const sd = sideOf && sideOf(x, y, z), S = sd ? (sides[sd] || (sides[sd] = { solid: [], glow: [], win: [] })) : null;
      const solid = S ? S.solid : solid0, glow = S ? S.glow : glow0, win = S ? S.win : win0;
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
    out.solid = mk(solid0, new T.MeshLambertMaterial({ color: 0xFFFFFF }), true);
    out.glow = mk(glow0, new T.MeshBasicMaterial({ color: 0xFFFFFF }), false);
    out.winMat = new T.MeshBasicMaterial({ color: 0xFFFFFF });
    out.win = mk(win0, out.winMat, false);
    out.count = solid0.length + glow0.length + win0.length;
    // 每一面牆自己一組網格、自己的材質（才能各自變透明）
    out.walls = {};
    for (const k in sides) {
      const S = sides[k], winMat = new T.MeshBasicMaterial({ color: 0xFFFFFF });
      const ms = [mk(S.solid, new T.MeshLambertMaterial({ color: 0xFFFFFF }), true), mk(S.glow, new T.MeshBasicMaterial({ color: 0xFFFFFF }), false), mk(S.win, winMat, false)].filter(Boolean);
      ms.forEach(m => { m.userData.wall = k; });
      out.walls[k] = { meshes: ms, winMat };
      out.count += S.solid.length + S.glow.length + S.win.length;
    }
    return out;
  }

  /* ── 對外：建一個房間 ──
   * spec：[type, u, v, o]；place(u, v) 換算成公尺；colOf 處理 "owner:名字" 這種顏色 */
  function build(T, W, D, spec, theme, place, colOf, opt2) {
    const G = new Grid(), lights = [];
    shell(G, W, D, theme);
    // 天花板主燈：小房間一盞、中房間兩盞、大房間四盞
    if (!theme.outdoor && theme.pendant !== false) {
      const H = theme.ceil ? Math.round(theme.ceil / V) : 26, area = W * D;
      const style = CEIL_STYLES.indexOf(theme.ceilStyle) >= 0 ? theme.ceilStyle : CEIL_STYLES[(theme.seed || 0) % CEIL_STYLES.length];
      const pends = theme.pends || (area < 44 ? [[0, -0.2]] : area < 75 ? [[-W / 4, -0.2], [W / 4, -0.2]] : [[-W / 4, -D / 4], [W / 4, -D / 4], [-W / 4, D / 4], [W / 4, D / 4]]);
      for (const [px, pz] of pends) ceilLamp(G, Math.round(px / V), Math.round(pz / V), H, style, theme, lights);
    }
    const CK = (x, z) => (x + 512) * 1024 + (z + 512);
    // 牆壁、窗戶這些房間本體佔的柱子（0～2.5 公尺高）
    const shellCols = new Map();
    for (const v of G.m.values()) {
      if (v.y < 0 || v.y > 25 || (v.f & F_NOAO)) continue;
      const k = CK(v.x, v.z), c = shellCols.get(k);
      if (c) { if (v.y < c[0]) c[0] = v.y; if (v.y > c[1]) c[1] = v.y; } else shellCols.set(k, [v.y, v.y]);
    }
    const furn = new Map();       // 已經擺好的家具佔的柱子：每格一串 [低, 高]
    // 沒指定顏色的家具：木頭跟著房間的護牆板、布料跟著窗簾／飾條，整間同一套
    const pal = roomPalette(theme), colOf0 = colOf;
    colOf = (c, type) => c != null ? colOf0(c) : WOODY.test(type) ? pal.wood : SOFT.test(type) ? pal.cloth : colOf0(c);
    const ctx = { G, W, D, th: theme, shellCols, furn, CK, colOf, winBlock: theme._winBlock || new Map(), winOn: false, decor: [], cache: new Map(), clash: [], rugs: spec.filter(it => it[0] === "rug").length };
    const [px0, pz0] = place(0, 0), [px1, pz1] = place(1, 1);
    const toUV = (x, z) => [Math.round((x - px0) / (px1 - px0) * 1000) / 1000, Math.round((z - pz0) / (pz1 - pz0) * 1000) / 1000];
    const res = spec.map(() => []);
    const placed = [];            // 已擺好的家具：[type, o, x, z]，給成套的小東西參考
    const putItem = (i, type, o, x, z) => {
      if (theme.outdoor && o.k == null && OUTK[type]) o = Object.assign({}, o, { k: OUTK[type] });
      const Gt = new Grid();
      draw(Gt, type, o, x, z, lights, colOf);
      if (theme.outdoor && PROP[type]) prop(Gt, PROP[type]);
      const cols = colsOf(Gt);
      const wo = ctx.winOn; ctx.winOn = false; const ok = footFree(ctx, cols, kindOf(type), 0); ctx.winOn = wo;
      if (!ok && type !== "oillamp") { ctx.clash.push(type); if (N.DEBUGCLASH) console.log("clash", type, x, z, JSON.stringify(o), JSON.stringify(cols.slice(0, 3))); }
      for (const v of Gt.m.values()) G.set(v.x, v.y, v.z, v.c, v.f);
      addFurn(ctx, cols);
      const [u, v] = toUV(x, z);
      res[i].push([type, u, v, o]);
      placed.push([type, o, x, z, i]);
      if (DECOR.test(type)) ctx.decor.push([x, z]);
    };
    const auto = !theme.noNudge;
    // 1. 有指定位置的家具；跟別的東西卡在一起就在附近找空位挪過去，靠近牆的貼齊牆面
    spec.forEach((it, i) => {
      let [type, u, v, o0] = it; const o = o0 || {};
      if (u == null) return;
      let [x, z] = place(u, v);
      if (theme.cut && !theme.outdoor && x > W / 2 - theme.cut[0] - 0.2 && z < -D / 2 + theme.cut[1]) z = -D / 2 + theme.cut[1] + 0.12;
      if (auto && !footFree(ctx, exactFoot(type, o, x, z, colOf), kindOf(type), 0.1)) {
        const p = nudge(ctx, type, o, x, z);
        if (p) { x = p[0]; z = p[1]; }
        else if (!/^(bed|hammock|stairs)$/.test(type)) return;   // 附近都沒位置：寧可不放也不要卡在一起
      }
      if (auto && !theme.outdoor) [x, z] = snapWall(ctx, type, o, x, z);
      putItem(i, type, o, x, z);
    });
    ctx.winOn = true;   // 之後自動擺的東西不要擋到窗戶
    // 2. 原本家具旁邊配的小東西（床頭櫃、書桌上方的層架、沙發前的茶几…）
    if (auto && !theme.outdoor) for (const p of placed.slice()) companions(ctx, p, putItem, theme);
    // 3. 自動的，擺好馬上配上旁邊的東西
    spec.forEach((it, i) => {
      let [type, u, , o0] = it; const o = o0 || {};
      if (u != null) return;
      const pos = autoPlace(ctx, type, o, i);
      if (!pos) return;
      o.rot = pos.rot;
      putItem(i, type, o, pos.x, pos.z);
      if (!theme.outdoor) companions(ctx, placed[placed.length - 1], putItem, theme);
    });
    const out = [].concat(...res);
    const occ = occupancy(G, W, D);
    // 娃娃屋：家具擺好之後才補右牆、前牆（不影響擺放和走路的格子），四面牆分開成網格，擋到鏡頭的那面可以變透明
    const sideOf = theme.outdoor ? null : outerWalls(G, W, D, theme);
    const ms = opt2 && opt2.noMesh ? {} : toMeshes(T, G, { side: sideOf });
    return { meshes: ms, grid: G, lights, occ, spec: out, clash: ctx.clash, topAt: (x, z, maxY) => topAt(G, x, z, maxY) };
  }


  // 畫一件家具；dy：整件往上（或往下）移，掛在家具上方的裝飾用
  function draw(Gt, type, o, x, z, lights, colOf) {
    let B = placer(Gt, x, z, o.rot || 0, lights);
    if (o.dy) {
      const B0 = B, dy = o.dy;
      B = (w, h, d, c, bx, y, bz, f, pat) => B0(w, h, d, c, bx, (y || 0) + dy, bz, f, pat);
      B.light = (lx, ly, lz, col, pw) => B0.light(lx, ly + dy, lz, col, pw);
      B.paint = B0.paint;
    }
    if (o.k && o.k !== 1) {   // 整件放大縮小（戶外的樹、路燈、噴水池照真實大小）
      const B1 = B, k = o.k;
      B = (w, h, d, c, bx, y, bz, f, pat) => B1(w * k, h * k, d * k, c, (bx || 0) * k, (y || 0) * k, (bz || 0) * k, f, pat);
      B.light = (lx, ly, lz, col, pw) => B1.light(lx * k, ly * k, lz * k, col, pw);
      B.paint = (w, d, c, px, pz, pat) => B1.paint(w * k, d * k, c, (px || 0) * k, (pz || 0) * k, pat);
    }
    vfurn(type, o, B, colOf(o.c, type), {});
  }
  /* 戶外沒有牆和天花板：掛在半空的東西要有東西撐著。
   * "string"：燈籠串、燈泡串、小旗子 → 兩端各一根柱子撐到繩子的高度；"wall"：掛牆的時鐘、公布欄、塗鴉板、齒輪 → 底下兩根腳 */
  const PROP = { lanterns: "string", lights: "string", bunting: "string", stars: "string", clock: "wall", board: "wall", graffiti: "wall", gears: "wall", butterflies: "wall", banners: "wall", herbs: "wall", dryplant: "wall", map: "wall", poster: "wall" };
  function prop(Gt, kind) {
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const v of Gt.m.values()) { x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); z0 = Math.min(z0, v.z); z1 = Math.max(z1, v.z); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); }
    if (x0 > x1 || y0 <= 0) return;
    const wide = x1 - x0 >= z1 - z0, zc = Math.round((z0 + z1) / 2), xc = Math.round((x0 + x1) / 2);
    const ends = wide ? [[x0 - 1, zc], [x1 + 1, zc]] : [[xc, z0 - 1], [xc, z1 + 1]];
    if (kind === "string") {
      for (const [px, pz] of ends) { for (let y = 0; y <= y1 + 1; y++) Gt.set(px, y, pz, 0x3A3A3E, 0); Gt.set(px, y1 + 2, pz, 0x2A2A2E, 0); }
      // 繩子：從柱頂接到第一個、最後一個燈
      if (wide) { for (let x = x0 - 1; x <= x1 + 1; x++) if (!Gt.has(x, y1 + 1, zc)) Gt.set(x, y1 + 1, zc, 0x2A2A2E, 0); }
      else { for (let z = z0 - 1; z <= z1 + 1; z++) if (!Gt.has(xc, y1 + 1, z)) Gt.set(xc, y1 + 1, z, 0x2A2A2E, 0); }
    } else {
      // 背板＋兩根腳
      const zb = wide ? z0 - 1 : null, xb = wide ? null : x0 - 1;
      for (const [px, pz] of ends) for (let y = 0; y < y0 + 1; y++) Gt.set(wide ? px + (px < xc ? 1 : -1) : (xb), y, wide ? zb : pz + (pz < zc ? 1 : -1), 0x4A3A2E, 0);
      if (wide) { for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) if (!Gt.has(x, y, zb)) Gt.set(x, y, zb, 0x5A4632, 0); }
      else { for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) if (!Gt.has(xb, y, z)) Gt.set(xb, y, z, 0x5A4632, 0); }
    }
  }
  // 戶外的東西照真實大小（人 1.6 公尺）：樹 4～5 公尺、路燈 3.7 公尺、噴水池 3 公尺寬…
  const OUTK = { tree: 2.6, streetlamp: 1.6, fountain: 2, stonelamp: 1.3, well: 1.4, bush: 1.5, flowers: 1.3, newsstand: 1.25, stall: 1.4, rocks: 1.4, plant: 1.4 };
  const rotXZ = (rot, x, z) => { const q = Math.round((((rot || 0) % 360 + 360) % 360) / 90) % 4; return q === 0 ? [x, z] : q === 1 ? [z, -x] : q === 2 ? [-x, -z] : [-z, x]; };
  // 背面朝牆的家具：離牆不到 1 公尺就往後推到貼牆
  const WALLY = /^(bed|desk|magicdesk|computer|shelf|vanity|sideboard|curio|clothes|fireplace|stove|oven|fridge|breadrack|filing|lockers|vending|herbs|scrolls|radios|display|altar|dimbox|piano|servers|record|typewriter)$/;
  function snapWall(ctx, type, o, x, z) {
    if (!WALLY.test(type)) return [x, z];
    const q = Math.round((((o.rot || 0) % 360 + 360) % 360) / 90) % 4;
    if (q !== 0 && q !== 1) return [x, z];          // 只有後牆、左牆是真的牆
    const [bx, bz] = rotXZ(o.rot, 0, -1), cols = exactFoot(type, o, x, z, ctx.colOf);
    let k = 0;
    for (let s = 1; s <= 10; s++) { if (footFree(ctx, cols, 0, 0, Math.round(bx) * s, Math.round(bz) * s)) k = s; else break; }
    if (k === 10) return [x, z];                    // 推 1 公尺都沒碰到牆：本來就在房間中間
    // 公尺換格子有四捨五入的誤差：實際蓋出來再確認一次，卡到就少推一格
    for (; k > 0; k--) {
      const nx = Math.round((x + Math.round(bx) * k * V) * 1000) / 1000, nz = Math.round((z + Math.round(bz) * k * V) * 1000) / 1000;
      if (footFree(ctx, exactFoot(type, o, nx, nz, ctx.colOf), kindOf(type), 0)) return [nx, nz];
    }
    return [x, z];
  }
  const WOODY = /^(shelf|sideboard|curio|nightstand|coffeetable|island|desk|wallshelf|table|longtable|filing|bench|counter|magicdesk|typewriter|vanity|breadrack)$/;
  const SOFT = /^(sofa|readchair|beanbag|bed)$/;
  function roomPalette(th) {
    const wain = th.wain || 0x82593A, frame = th.frame || wain;
    // 護牆板太亮（白、淺灰）就用窗框色，再壓暗一點當家具木色
    const lum = c => ((c >> 16 & 255) * 0.3 + (c >> 8 & 255) * 0.59 + (c & 255) * 0.11) / 255;
    let wood = th.furnC || (lum(wain) > 0.55 ? mix(frame, 0x000000, 0.1) : mix(wain, 0x000000, 0.12));
    if (lum(wood) > 0.6) wood = mix(wood, 0x6B4A30, 0.5);
    const cloth = th.cloth || th.curtain || th.trim || mix(th.wall || 0xC8A882, 0x000000, 0.25);
    const rug = [th.rugC || mix(cloth, 0x000000, 0.1), mix(th.cap || th.wall || 0xE8D8B0, 0xFFFFFF, 0.2)];
    return { wood, cloth, rug };
  }
  /* ── 成套擺放：每種家具旁邊該有的東西 ──
   * side 旁邊（先右後左）、above 正上方的牆上、wall 旁邊的牆上、front 正前方、under 底下的地毯
   * 幾種家具的上方、旁邊沒位置就不放 */
  const COMP = {
    bed: [["nightstand", "side"], ["frames", "above"], ["rug", "under", { foot: true }]],
    sofa: [["coffeetable", "front"], ["frames", "above"], ["rug", "under", { front: true }]],
    desk: [["wallshelf", "above"]],
    magicdesk: [["wallshelf", "above"]],
    computer: [["wallshelf", "above"]],
    sideboard: [["frames", "above"]],
    shelf: [["shelf", "side"], ["sconce", "wall"]],
    vanity: [["plant", "side"]],
    clothes: [["mirror", "side"]],
    counter: [["wallshelf", "above"]],
    stove: [["pans", "above"]],
    oven: [["pans", "above"]],
    fireplace: [["frames", "above"]],
    coffeetable: [["readchair", "left", { rot: 90 }], ["readchair", "right", { rot: 270 }], ["rug", "under"]],
    table: [["rug", "under"]],
    longtable: [["rug", "under"]],
    island: [["rug", "under"]]
  };
  const DECOR = /^(frames|wallshelf|sconce|pans|mirror|clock|poster|map|board|hangplant)$/;
  const RUGC = [[0x8A3A2E, 0xD8A75A], [0x3E5A6E, 0xE8D8B0], [0x6A4A2A, 0xC88E5A], [0x5A3A5A, 0xD8B070], [0x4E6A4A, 0xE8D090], [0xA8603A, 0xF0D8A8]];
  function companions(ctx, P, putItem, th) {
    const [type, o, ax, az, idx] = P, list = COMP[type];
    if (!list) return;
    const base = footAt0(ctx, type, Object.assign({}, o, { rot: 0 }), 0, 0), [x0, x1, z0, z1] = base.box;
    if (!base.base.length) return;
    let top = 0; for (const c of base.base) top = Math.max(top, c[3]);
    const rot = o.rot || 0, ceil = (th.ceil || 2.6) - 0.05;
    // 這件家具背後是不是牆（上方、旁邊的牆面才掛得上東西）
    const [bx, bz] = rotXZ(rot, 0, -1), back = [];
    for (const c of exactFoot(type, o, ax, az, ctx.colOf)) back.push(c);
    let wallBack = false;
    for (const [cx, cz] of back) { const nx = cx + Math.round(bx), nz = cz + Math.round(bz); if (ctx.shellCols.has(ctx.CK(nx, nz))) { wallBack = true; break; } }
    const seed = idx * 7 + Math.round(ax * 10) + Math.round(az * 3);
    for (const [ct, slot, extra] of list) {
      const co = Object.assign({ seed: Math.abs(seed + ct.length) % 9 }, extra || {});
      const crot = (extra && extra.rot != null ? extra.rot : 0);
      co.rot = rot + crot;
      if ((slot === "above" || slot === "wall") && !wallBack) continue;
      if (slot === "top") {   // 放在家具上面：挑一個角落，算那裡的桌面高度
        // 中間那塊最常見的高度＝桌面；挑桌面上離中心最遠、再往內縮一格的位置（避開桌上原本的東西）
        const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, hw = (x1 - x0) / 3, hd = (z1 - z0) / 3, cnt = {};
        for (const c of base.base) if (Math.abs(c[0] - mx) <= hw && Math.abs(c[1] - mz) <= hd) cnt[c[3]] = (cnt[c[3]] || 0) + 1;
        const t = +Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0];
        if (!(t >= 3 && t <= 14)) continue;
        const surf = new Set(base.base.filter(c => c[3] === t).map(c => c[0] + "," + c[1]));
        let best = null, bd = -1;
        for (const c of base.base) {
          if (c[3] !== t) continue;
          let ok = true; for (let dx = -1; dx <= 1 && ok; dx++) for (let dz = -1; dz <= 1; dz++) if (!surf.has((c[0] + dx) + "," + (c[1] + dz))) { ok = false; break; }
          if (!ok) continue;
          const d = Math.abs(c[0] - mx) + Math.abs(c[1] - mz) * 0.9;
          if (d > bd) { bd = d; best = c; }
        }
        if (!best) continue;
        const cx = best[0], cz = best[1];
        co.dy = Math.round((t + 1) * V * 10) / 10;
        const [wx, wz] = rotXZ(rot, cx * V + V / 2, cz * V + V / 2);
        putItem(idx, ct, co, ax + wx, az + wz);
        continue;
      }
      if (ct === "rug") {
        if (ctx.rugs >= 2) continue;
        const rp = roomPalette(th), rc = ctx.rugs ? [mix(rp.rug[0], 0xFFFFFF, 0.12), rp.rug[1]] : rp.rug;
        let w = (x1 - x0 + 1) * V + 0.8, d = (z1 - z0 + 1) * V + 0.6, lz = (z0 + z1 + 1) / 2 * V;
        if (extra && extra.foot) { d = Math.min(1.2, d); lz = z1 * V - d / 2 + 0.3; w += 0.4; }
        if (extra && extra.front) { d = 1.6; lz = z1 * V + 0.6; w += 0.2; }
        const [wx, wz] = rotXZ(rot, (x0 + x1 + 1) / 2 * V, lz);
        Object.assign(co, { w: Math.round(w * 10) / 10, d: Math.round(d * 10) / 10, c: rc[0], c2: rc[1], rot });
        ctx.rugs = (ctx.rugs || 0) + 1;
        putItem(idx, "rug", co, ax + wx, az + wz);
        continue;
      }
      const cf = footAt0(ctx, ct, Object.assign({}, co, { rot: crot, dy: 0 }), 0, 0);
      if (!cf.base.length) continue;
      const [c0, c1, d0, d1] = cf.box;
      let cmin = 99, cmax = 0; for (const c of cf.base) { cmin = Math.min(cmin, c[2]); cmax = Math.max(cmax, c[3]); }
      const tries = [];
      const midX = Math.round((x0 + x1) / 2 - (c0 + c1) / 2);
      if (slot === "side" || slot === "wall") { const g = slot === "wall" ? 2 : 1; tries.push([x1 + g - c0, z0 - d0], [x0 - g - c1, z0 - d0]); }
      if (slot === "right") tries.push([x1 + 2 - c0, Math.round((z0 + z1) / 2 - (d0 + d1) / 2)]);
      if (slot === "left") tries.push([x0 - 2 - c1, Math.round((z0 + z1) / 2 - (d0 + d1) / 2)]);
      if (slot === "front") tries.push([midX, z1 + 4 - d0]);
      if (slot === "above") {
        tries.push([midX, z0 - d0]);
        // 抬到家具頂端再上面 0.25 公尺（太矮的裝飾往上，太高的往下）
        const want = (top + 1) * V + 0.1 - cmin * V;
        co.dy = Math.round(Math.max(-0.5, want) * 10) / 10;
        if ((cmax + 1) * V + co.dy > ceil) continue;
        if (Math.abs(co.dy) < 0.05) delete co.dy;
      }
      for (const [lx, lz] of tries) {
        const [wx, wz] = rotXZ(rot, lx * V, lz * V), x = ax + wx, z = az + wz;
        // 牆上的裝飾彼此至少隔 1.2 公尺，不要一面牆掛滿
        if (DECOR.test(ct) && ctx.decor.some(([dx, dz]) => Math.hypot(dx - x, dz - z) < 1.2)) continue;
        if (footFree(ctx, exactFoot(ct, co, x, z, ctx.colOf), kindOf(ct), 0)) { putItem(idx, ct, co, x, z); break; }
      }
    }
  }
  /* ── 家具碰撞：用真正蓋出來的方塊算佔地（每一根柱子的高度範圍），不再用估計的尺寸 ── */
  function colsOf(Gt) {
    const m = new Map();
    for (const v of Gt.m.values()) {
      if (v.y < 0 || v.y > 25 || (v.f & F_NOAO)) continue;
      const k = v.x + "," + v.z, c = m.get(k);
      if (c) { if (v.y < c[2]) c[2] = v.y; if (v.y > c[3]) c[3] = v.y; } else m.set(k, [v.x, v.z, v.y, v.y]);
    }
    return [...m.values()];
  }
  function exactFoot(type, o, x, z, colOf) {
    const Gt = new Grid();
    draw(Gt, type, Object.assign({}, o), x, z, [], colOf);
    return colsOf(Gt);
  }
  function addFurn(ctx, cols) {
    for (const [x, z, y0, y1] of cols) { const k = ctx.CK(x, z), a = ctx.furn.get(k); if (a) a.push([y0, y1]); else ctx.furn.set(k, [[y0, y1]]); }
  }
  // 在原點蓋一次（每種家具＋選項＋方向只算一次），之後平移著用
  function footAt0(ctx, type, o, rot, pad) {
    const key = type + "|" + JSON.stringify(o) + "|" + rot + "|" + pad;
    let f = ctx.cache.get(key);
    if (f) return f;
    const base = exactFoot(type, Object.assign({}, o, { rot }), 0, 0, ctx.colOf);
    // 往外擴 pad 格：家具之間留走道
    const dil = new Map();
    for (const [x, z, y0, y1] of base) for (let dx = -pad; dx <= pad; dx++) for (let dz = -pad; dz <= pad; dz++) {
      const k = (x + dx) + "," + (z + dz), c = dil.get(k);
      if (c) { if (y0 < c[2]) c[2] = y0; if (y1 > c[3]) c[3] = y1; } else dil.set(k, [x + dx, z + dz, y0, y1]);
    }
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const c of base) { x0 = Math.min(x0, c[0]); x1 = Math.max(x1, c[0]); z0 = Math.min(z0, c[1]); z1 = Math.max(z1, c[1]); }
    f = { base, dil: [...dil.values()], box: [x0, x1, z0, z1] };
    ctx.cache.set(key, f);
    return f;
  }
  const kindOf = type => (SIZE[type] && SIZE[type][2]) || 0;
  // 牆柱只檢查有地板的那幾格；沒地板的格子（嵌在牆裡）只有靠牆家具可以用
  function footFree(ctx, cols, kind, pad, dx, dz, dil) {
    const { G, shellCols, furn, CK } = ctx; dx = dx || 0; dz = dz || 0;
    if (!cols.length) return true;
    let onFloor = 0;
    for (const [x0, z0, y0, y1] of cols) {
      const x = x0 + dx, z = z0 + dz;
      if (ctx.winOn) { const w = ctx.winBlock.get(CK(x, z)); if (w && w[0] <= y1 && w[1] >= y0) return false; }
      if (!G.has(x, -1, z)) { if (!kind) return false; continue; }
      onFloor++;
      const s = shellCols.get(CK(x, z));
      if (s && s[0] <= y1 && s[1] >= y0) return false;
      if (!dil) { const a = furn.get(CK(x, z)); if (a) for (const [a0, a1] of a) if (a0 <= y1 + 1 && a1 >= y0 - 1) return false; }
    }
    if (onFloor < cols.length * 0.35) return false;
    if (dil) for (const [x0, z0, y0, y1] of dil) {
      if (!kind) {   // 放地板中間的東西離牆也要留走道（有椅子的桌子才坐得進去）
        const x = x0 + dx, z = z0 + dz;
        if (!G.has(x, -1, z)) return false;
        const s = shellCols.get(CK(x, z)); if (s && s[0] <= y1 && s[1] >= y0) return false;
      }
      const a = furn.get(CK(x0 + dx, z0 + dz));
      if (a) for (const [a0, a1] of a) if (a0 <= y1 + 1 && a1 >= y0 - 1) return false;
    }
    return true;
  }
  // 指定位置被佔了：往外一圈一圈找，最遠 1.4 公尺
  function nudge(ctx, type, o, x, z) {
    const rot = o.rot || 0, kind = kindOf(type), f = footAt0(ctx, type, o, rot, 1);
    const kx = Math.round(x / V), kz = Math.round(z / V);
    for (let r = 1; r <= 14; r++) {
      const ring = [];
      for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) if (Math.max(Math.abs(dx), Math.abs(dz)) === r) ring.push([dx, dz]);
      ring.sort((a, b) => (a[0] * a[0] + a[1] * a[1]) - (b[0] * b[0] + b[1] * b[1]));
      for (const [dx, dz] of ring) {
        if (!footFree(ctx, f.base, kind, 0, kx + dx, kz + dz, f.dil)) continue;
        const nx = (kx + dx) * V, nz = (kz + dz) * V;
        if (footFree(ctx, exactFoot(type, o, nx, nz, ctx.colOf), kind, 0)) return [nx, nz];
      }
    }
    return null;
  }
  // 某個位置最高的家具表面（坐下、躺下的高度），maxY 公尺以下
  function topAt(G, x, z, maxY) {
    const ix = Math.floor(x / V), iz = Math.floor(z / V), lim = Math.round((maxY || 0.9) / V);
    let best = -1;
    for (let y = lim; y >= 0; y--) if (G.has(ix, y, iz)) { best = y; break; }   // 只看正下方那一格（椅背不算）
    return best < 0 ? 0 : (best + 1) * V;
  }
  /* 自動擺放：靠牆的東西貼著後牆或左牆，其他的找地板上的空位（離別的家具留 0.3 公尺） */
  const SIZE = { oillamp: [0.3, 0.3], nightstand: [0.5, 0.45, 1], coffeetable: [1.0, 0.6], island: [1.4, 0.8], sideboard: [1.5, 0.6, 1], curio: [0.9, 0.5, 1], frames: [1.0, 0.2, 2], wallshelf: [1.0, 0.3, 2], hangplant: [0.4, 0.3, 2], pots: [0.8, 0.4, 1], sconce: [0.4, 0.2, 2], plant: [0.5, 0.5], shelf: [1.0, 0.5, 1], sofa: [1.6, 0.8], table: [1.6, 1.6], longtable: [2.8, 1.8], desk: [1.1, 1.1, 1], lamp: [0.4, 0.4], clock: [0.5, 0.2, 2],
    poster: [0.7, 0.2, 2], board: [1.3, 0.2, 2], map: [1.2, 0.2, 2], bookpile: [0.5, 0.5], boxes: [0.7, 0.7], crates: [0.9, 0.9], catbed: [0.6, 0.6], record: [0.6, 0.5, 1],
    globe: [0.5, 0.5], fridge: [0.8, 0.7, 1], beanbag: [0.8, 0.8], readchair: [0.8, 0.8], flowers: [0.5, 0.5], candles: [0.4, 0.4], mirror: [0.7, 0.2, 2], clothes: [1.1, 0.6, 1],
    vanity: [1.0, 0.9, 1], filing: [0.6, 0.6, 1], lockers: [1.3, 0.5, 1], vending: [0.9, 0.8, 1], bench: [1.5, 0.6], bench2: [1.4, 0.5], tree: [1.4, 1.4], bush: [0.9, 0.9],
    streetlamp: [0.5, 0.5], trash: [0.5, 0.5], crystal: [0.5, 0.5], skulls: [0.7, 0.4, 1], cauldron: [0.9, 0.9], telescope: [0.7, 0.7], typewriter: [0.8, 1.1, 1], herbs: [0.9, 0.5, 1],
    stove: [1.0, 0.6, 1], oven: [1.2, 0.9, 1], breadrack: [1.0, 0.5, 1], drums: [1.4, 1.2], fireplace: [1.4, 0.6, 1], rug: [0, 0], gamechair: [0.6, 0.6], computer: [1.5, 1.3, 1],
    radios: [1.0, 0.5, 1], parts: [0.8, 0.6], toolwall: [1.3, 0.2, 2], display: [1.2, 0.6, 1], mannequin: [0.6, 0.6], statue: [0.8, 0.8], snacks: [0.8, 0.6], stall: [2.0, 1.4],
    lanterns: [0, 0], lights: [0, 0], stars: [0, 0], bunting: [0, 0], scrolls: [1.0, 0.5, 1], dryplant: [0.5, 0.2, 2], magicdesk: [1.3, 1.2, 1], amp: [0.6, 0.5], cables: [0.8, 0.8],
    welder: [1.0, 0.7], machine: [1.4, 1.0], tank: [0.9, 0.9], medkit: [0.5, 0.2, 2], newsstand: [1.2, 0.8], hydrant: [0.4, 0.4], rocks: [1.0, 0.8], well: [1.2, 1.2], fountain: [2.0, 2.0],
    stonelamp: [0.5, 0.5], podium: [0.8, 0.6], bike: [1.6, 0.5], banners: [0, 0], butterflies: [0, 0], lifebuoy: [0.6, 0.2, 2], net: [1.2, 0.2, 2], rods: [0.8, 0.4, 1], filingcab: [0.6, 0.6, 1] };
  /* 自動擺放：靠牆的東西貼著後牆、左牆、右牆（真的貼齊牆面），其他的找地板上的空位，彼此留走道 */
  function autoPlace(ctx, type, o, n) {
    const { G, W, D, shellCols, CK } = ctx;
    const sz = SIZE[type] || [0.8, 0.8], kind = sz[2] || 0;
    if (sz[0] === 0) return { x: 0, z: 0, rot: 0 };          // 掛在天花板的東西：不佔地
    const seed = n * 17 + type.length * 31;
    const pad = kind === 2 ? 3 : kind ? 3 : /table|desk|classroom/.test(type) ? 6 : 5;
    const hx = Math.floor(-W / 2 / V) - 2, hX = Math.ceil(W / 2 / V) + 2, hz = Math.floor(-D / 2 / V) - 2, hZ = Math.ceil(D / 2 / V) + 2;
    const freeCol = (x, z) => G.has(x, -1, z) && !shellCols.has(CK(x, z));
    const cand = [];
    if (kind) {
      // rot 0 背面朝後牆（-z），rot 90 背面朝左牆（-x），rot 270 背面朝右牆（+x）
      for (const rot of [0, 90]) {   // 右邊和前面是開著給鏡頭看的，沒有牆
        const f = footAt0(ctx, type, o, rot, pad), [bx0, bx1, bz0, bz1] = f.box;
        if (!f.base.length) return { x: 0, z: 0, rot: 0 };
        if (rot === 0) {
          for (let kx = hx - bx0; kx + bx1 <= hX; kx++) {
            // 這段牆最前面的牆面
            let wall = -1e9;
            for (let x = kx + bx0; x <= kx + bx1; x++) { let z = hz; while (z < hZ && !freeCol(x, z)) z++; wall = Math.max(wall, z); }
            if (wall >= hZ - 2) continue;
            cand.push([kx, wall - bz0, rot, f, 0]);
          }
        } else {
          const sgn = rot === 90 ? 1 : -1;
          for (let kz = hz - bz0; kz + bz1 <= hZ - 6; kz++) {
            let wall = sgn > 0 ? -1e9 : 1e9;
            for (let z = kz + bz0; z <= kz + bz1; z++) {
              if (sgn > 0) { let x = hx; while (x < hX && !freeCol(x, z)) x++; wall = Math.max(wall, x); }
              else { let x = hX; while (x > hx && !freeCol(x, z)) x--; wall = Math.min(wall, x); }
            }
            if (Math.abs(wall) > 1e8) continue;
            const kx = sgn > 0 ? wall - bx0 : wall - bx1;
            cand.push([kx, kz, rot, f, 0]);
          }
        }
      }
    } else {
      const f = footAt0(ctx, type, o, 0, pad), [bx0, bx1, bz0, bz1] = f.box;
      if (!f.base.length) return { x: 0, z: 0, rot: 0 };
      // 前面 1 公尺留給鏡頭那一側（不擺東西擋住視線）
      for (let kx = hx - bx0; kx + bx1 <= hX; kx += 2) for (let kz = hz - bz0; kz + bz1 <= hZ - 10; kz += 2) {
        const wd = Math.min(kx + bx0 - (-W / 2 / V), kz + bz0 - (-D / 2 / V), W / 2 / V - (kx + bx1));
        cand.push([kx, kz, 0, f, wd]);
      }
    }
    // 打散順序（同一個房間每次都一樣）；地板上的東西比較靠牆的先試，但不一定貼牆
    const r = c => hashI(c[0] + c[2], c[1], seed);
    cand.sort((a, b) => (a[4] - b[4]) * 0.08 + r(a) - r(b));
    for (const [kx, kz, rot, f] of cand) {
      if (!footFree(ctx, f.base, kind, 0, kx, kz, f.dil)) continue;
      const x = kx * V, z = kz * V, oo = Object.assign({}, o, { rot });
      if (DECOR.test(type) && ctx.decor.some(([dx, dz]) => Math.hypot(dx - x, dz - z) < 1.2)) continue;
      if (footFree(ctx, exactFoot(type, oo, x, z, ctx.colOf), kind, 0)) return { x, z, rot };
    }
    return null;
  }
  // 走路用的格子：每格 0.2 公尺，0.2～1.4 公尺高之間有東西就算擋路（地毯、地板不算）
  function occupancy(G, W, D) {
    const C = 0.2, nx = Math.ceil(W / C), nz = Math.ceil(D / C), x0 = -W / 2, z0 = -D / 2, data = new Uint8Array(nx * nz);
    for (const v of G.m.values()) {
      if (v.y < 2 || v.y > 14 || (v.f & F_NOAO)) continue;
      const cx = Math.floor((v.x * V + V / 2 - x0) / C), cz = Math.floor((v.z * V + V / 2 - z0) / C);
      if (cx >= 0 && cz >= 0 && cx < nx && cz < nz) data[cz * nx + cx] = 1;
    }
    for (let cz = 0; cz < nz; cz++) for (let cx = 0; cx < nx; cx++) { const vx = Math.floor((x0 + (cx + 0.5) * C) / V), vz = Math.floor((z0 + (cz + 0.5) * C) / V); if (!G.has(vx, -1, vz)) data[cz * nx + cx] = 1; }
    return { C, nx, nz, x0, z0, data };
  }
  N.voxRoom = { build, V, _k: { Grid, vfurn, placer, toMeshes, mix, hashI, F_GLOW, F_WIN, F_NOAO } };
})();
