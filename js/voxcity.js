/* 諾文小鎮：高畫質城市建築（電腦版）
 * 跟房間同一套積木：1 格 = 10 公分。每棟房子一層一層疊：歐式 E、中式 C、日式 J、賽博龐克 Y，
 * 上層跟下層風格不同時，做成「後來加蓋」的樣子（往後縮一格、底下有支架和鐵皮雨遮）。
 * 每棟蓋在自己的小格子裡，再用「合併同色面」的方式轉成網格（比一格一顆方塊省很多）。
 * 對外：N.voxCity.lot(T, l, info) / filler(T, info) / openLot(T, l, info) / setNight(nf)，回傳的網格單位是公尺。 */
(function () {
  "use strict";
  const N = window.NOVUM = window.NOVUM || {};
  const V = 0.1, FH = 30;
  const F_GLOW = 1, F_WIN = 2, F_BLINK = 4, F_TICK = 8, F_HOLO = 16, F_FLOW = 32;   // HOLO：全息投影（半透明、閃）；FLOW：魔力管線（光在裡面流）   // TICK：會捲動的跑馬燈   // BLINK：屋頂天線的紅色航空燈（一閃一閃）
  const hashI = (a, b, c) => { let h = (a * 73856093) ^ (b * 19349663) ^ (c * 83492791); h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const H = hashI;
  function mix(a, b, k) {
    const ar = a >> 16 & 255, ag = a >> 8 & 255, ab = a & 255, br = b >> 16 & 255, bg = b >> 8 & 255, bb = b & 255;
    return (Math.round(ar + (br - ar) * k) << 16) | (Math.round(ag + (bg - ag) * k) << 8) | Math.round(ab + (bb - ab) * k);
  }

  /* ── 稀疏格子：一塊共用的大陣列，只記有東西的格（每棟蓋完就清掉重用） ── */
  const PAD = 14;
  let BUF = null;
  function Box(x0, x1, ymax, z0, z1) {
    this.ox = -x0 + PAD; this.oz = -z0 + PAD; this.nx = x1 - x0 + PAD * 2; this.ny = ymax + 40; this.nz = z1 - z0 + PAD * 2;
    this.n = this.nx * this.ny * this.nz;
    if (!BUF || BUF.c.length < this.n) BUF = { c: new Uint32Array(this.n), f: new Uint8Array(this.n), seen: new Uint8Array(this.n), ins: new Uint8Array(this.n) };
    this.c = BUF.c; this.f = BUF.f; this.seen = BUF.seen; this.ins = BUF.ins; this.list = []; this.insR = [];
  }
  Box.prototype.idx = function (x, y, z) {
    x += this.ox; z += this.oz;
    if (x < 0 || y < 0 || z < 0 || x >= this.nx || y >= this.ny || z >= this.nz) return -1;
    return (y * this.nz + z) * this.nx + x;
  };
  Box.prototype.set = function (x, y, z, c, f) {
    const i = this.idx(x, y, z); if (i < 0) return;
    if ((f & F_WIN) && this.tint) {   // 窗戶有暖有冷、有的沒開燈（以 1.6 公尺見方、每層樓為一格決定，同一扇窗同一種）
      const h = H((x + 4000) >> 4, (y / FH) | 0, (z + 4000) >> 4);
      if (h < 0.16) { c = mix(c, 0x1E2430, 0.85); f = 0; }
      else if (h < 0.34) c = 0xCFE6F2;
      else if (h < 0.44) c = 0xF6B070;
      else if (h < 0.48) c = 0xF2A8C8;
    }
    if (!this.seen[i]) { this.seen[i] = 1; this.list.push(i); } this.c[i] = (c & 0xFFFFFF) | 0x1000000; this.f[i] = f || 0;
  };
  Box.prototype.del = function (x, y, z) { const i = this.idx(x, y, z); if (i >= 0) this.c[i] = 0; };
  Box.prototype.has = function (x, y, z) { const i = this.idx(x, y, z); return i >= 0 && this.c[i] !== 0; };
  // 房子裡面：看不到的空間，牆的內側面不用畫
  Box.prototype.inside = function (x0, y0, z0, x1, y1, z1, v) {
    const ax = Math.max(0, x0 + this.ox), bx = Math.min(this.nx, x1 + this.ox);
    if (bx <= ax) return;
    for (let y = Math.max(0, y0); y < Math.min(this.ny, y1); y++) for (let z = Math.max(0, z0 + this.oz); z < Math.min(this.nz, z1 + this.oz); z++) {
      const row = (y * this.nz + z) * this.nx; this.ins.fill(v == null ? 1 : v, row + ax, row + bx);
    }
    if (v == null) this.insR.push([x0, y0, z0, x1, y1, z1]);
  };
  Box.prototype.clear = function () { for (const i of this.list) { this.c[i] = 0; this.f[i] = 0; this.seen[i] = 0; } this.list = []; for (const r of this.insR) this.inside(...r, 0); this.insR = []; };
  function fill(G, x0, y0, z0, x1, y1, z1, c, f) {
    for (let x = x0; x < x1; x++) for (let y = y0; y < y1; y++) for (let z = z0; z < z1; z++) {
      const cc = typeof c === "function" ? c(x, y, z) : c; if (cc != null) G.set(x, y, z, cc, f || 0);
    }
  }

  /* ── 合併同色面 → BufferGeometry（三組：實心、窗戶、發光） ── */
  const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  const SHADE = [0.86, 0.86, 1, 0.6, 0.94, 0.8];
  function meshBox(T, G, VS) {
    VS = VS || V;
    const nx = G.nx, ny = G.ny, nz = G.nz, C = G.c, Fl = G.f, I = G.ins;
    const solid = (x, y, z) => { if (x < 0 || y < 0 || z < 0 || x >= nx || y >= ny || z >= nz) return false; const i = (y * nz + z) * nx + x; return C[i] !== 0 || I[i] !== 0; };
    const out = [0, 1, 2, 3, 4, 5, 6].map(() => ({ p: [], n: [], c: [], i: [] }));
    for (let d = 0; d < 6; d++) {
      const [dx, dy, dz] = DIRS[d], ax = dx ? 0 : dy ? 1 : 2, ua = ax === 0 ? 2 : 0, va = ax === 1 ? 2 : 1;
      const buckets = new Map();
      for (const i of G.list) {
        if (!C[i]) continue;
        const x = i % nx, z = Math.floor(i / nx) % nz, y = Math.floor(i / (nx * nz));
        if (dy < 0 && y === 0) continue;   // 貼地的底面看不到
        if (solid(x + dx, y + dy, z + dz)) continue;
        const P = [x, y, z], s = P[ax], u = P[ua], v = P[va];
        // 角落陰影：面前那一格的四周有幾個方塊
        const Q = [x + dx, y + dy, z + dz]; let occ = 0;
        for (const [du, dv] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const R = Q.slice(); R[ua] += du; R[va] += dv; if (solid(R[0], R[1], R[2])) occ++; }
        const fl = Fl[i], grp = fl & F_FLOW ? 6 : fl & F_HOLO ? 5 : fl & F_TICK ? 4 : fl & F_BLINK ? 3 : fl & F_GLOW ? 2 : fl & F_WIN ? 1 : 0;
        const key = (C[i] & 0xFFFFFF) + grp * 0x1000000 + Math.min(occ, 3) * 0x8000000;
        let b = buckets.get(s); if (!b) buckets.set(s, b = []);
        b.push(u, v, key);
      }
      for (const [s, b] of buckets) {
        let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
        for (let k = 0; k < b.length; k += 3) { u0 = Math.min(u0, b[k]); u1 = Math.max(u1, b[k]); v0 = Math.min(v0, b[k + 1]); v1 = Math.max(v1, b[k + 1]); }
        const W = u1 - u0 + 1, Hh = v1 - v0 + 1, mask = new Float64Array(W * Hh);
        for (let k = 0; k < b.length; k += 3) mask[(b[k + 1] - v0) * W + (b[k] - u0)] = b[k + 2] + 1;
        for (let j = 0; j < Hh; j++) for (let i = 0; i < W;) {
          const m = mask[j * W + i]; if (!m) { i++; continue; }
          let w = 1; while (i + w < W && mask[j * W + i + w] === m) w++;
          let h = 1;
          outer: while (j + h < Hh) { for (let k = 0; k < w; k++) if (mask[(j + h) * W + i + k] !== m) break outer; h++; }
          for (let jj = 0; jj < h; jj++) for (let k = 0; k < w; k++) mask[(j + jj) * W + i + k] = 0;
          const key = m - 1, grp = Math.floor(key / 0x1000000) & 7, occ = Math.floor(key / 0x8000000), col = key & 0xFFFFFF;
          emit(out[grp], d, ax, ua, va, s, u0 + i, v0 + j, w, h, col, grp ? 1 : SHADE[d] * [1, 0.9, 0.8, 0.72][occ]);
          i += w;
        }
      }
    }
    function emit(o, d, ax, ua, va, s, u, v, w, h, col, k) {
      const [dx, dy, dz] = DIRS[d], pl = s + (dx + dy + dz > 0 ? 1 : 0);
      const corner = (cu, cv) => { const P = [0, 0, 0]; P[ax] = pl; P[ua] = cu; P[va] = cv; return [(P[0] - G.ox) * VS, P[1] * VS, (P[2] - G.oz) * VS]; };
      // 朝上的面往外多長一點點：貪婪合併後相鄰的面會有 T 字接縫，不重疊的話接縫會漏出後面的顏色，變成一閃一閃的點點線
      const E = dy > 0 ? 0.02 : 0, a = corner(u - E, v - E), b = corner(u + w + E, v - E), c = corner(u + w + E, v + h + E), e = corner(u - E, v + h + E);
      // 側面的上緣稍微壓低（只限上面沒東西的，也就是地板、台子的邊）：才不會在地面接縫和旁邊的地板搶畫
      if (!dy) {
        let open = true;
        for (let k = 0; k < w && open; k++) { const P = [0, 0, 0]; P[ax] = s; P[ua] = u + k; P[va] = v + h; if (solid(P[0], P[1], P[2])) open = false; }
        if (open) { const top = Math.max(a[1], b[1], c[1], e[1]) - 1e-6; for (const q of [a, b, c, e]) if (q[1] >= top) q[1] -= 0.02 * VS; }
      }
      const base = o.p.length / 3;
      o.p.push(...a, ...b, ...c, ...e);
      for (let q = 0; q < 4; q++) o.n.push(dx, dy, dz);
      const r = (col >> 16 & 255) / 255 * k, g = (col >> 8 & 255) / 255 * k, bl = (col & 255) / 255 * k;
      for (let q = 0; q < 4; q++) o.c.push(r, g, bl);
      // 讓正面朝外（看方向決定順序）
      // a,b,c 的順序：x 面朝 -x、y 面朝 -y、z 面朝 +z
      const sgn = ax === 2 ? (dx + dy + dz) > 0 : (dx + dy + dz) < 0;
      if (sgn) o.i.push(base, base + 1, base + 2, base, base + 2, base + 3); else o.i.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }
    return out.map(o => {
      if (!o.p.length) return null;
      const g = new T.BufferGeometry();
      g.setAttribute("position", new T.Float32BufferAttribute(o.p, 3));
      g.setAttribute("normal", new T.Float32BufferAttribute(o.n, 3));
      g.setAttribute("color", new T.Float32BufferAttribute(o.c, 3));
      g.setIndex(o.i);
      return g;
    });
  }
  let MATS = null;
  function mats(T) {
    if (MATS) return MATS;
    MATS = {
      solid: new T.MeshLambertMaterial({ vertexColors: true }),
      win: new T.MeshBasicMaterial({ vertexColors: true }),
      glow: new T.MeshBasicMaterial({ vertexColors: true }),
      blink: new T.MeshBasicMaterial({ vertexColors: true }),
      tick: new T.MeshBasicMaterial({ vertexColors: true }),
      holo: new T.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }),
      flow: new T.MeshBasicMaterial({ vertexColors: true })
    };
    // 全息：一條條掃描線往上跑，偶爾整片閃一下
    MATS.holo.onBeforeCompile = sh => {
      sh.uniforms.uTime = MATS.uTime;
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vHoW;").replace("#include <project_vertex>", "#include <project_vertex>\nvHoW = (modelMatrix * vec4(transformed, 1.0)).xyz;");
      sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vHoW;\nuniform float uTime;")
        .replace("#include <color_fragment>", `#include <color_fragment>
          float scan = 0.55 + 0.45 * step(0.5, fract(vHoW.y * 9.0 - uTime * 1.6));
          float fl = 0.75 + 0.25 * step(0.92, fract(sin(floor(uTime * 6.0) + vHoW.x * 0.01) * 43758.5));
          diffuseColor.rgb *= scan * fl;`);
    };
    // 魔力管線：一段一段的光沿著管子流過去
    MATS.flow.onBeforeCompile = sh => {
      sh.uniforms.uTime = MATS.uTime;
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vFlW;").replace("#include <project_vertex>", "#include <project_vertex>\nvFlW = (modelMatrix * vec4(transformed, 1.0)).xyz;");
      sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vFlW;\nuniform float uTime;")
        .replace("#include <color_fragment>", `#include <color_fragment>
          float d = (vFlW.x + vFlW.y * 1.3 + vFlW.z) * 1.4 - uTime * 1.8;
          float p = pow(0.5 + 0.5 * sin(d), 6.0);
          diffuseColor.rgb *= 0.35 + p * 1.3;`);
    };
    // 跑馬燈：依世界座標切成點陣，隨時間往旁邊移動（看起來像一排字在捲）
    MATS.uTime = { value: 0 };
    MATS.tick.onBeforeCompile = sh => {
      sh.uniforms.uTime = MATS.uTime;
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vTkW;").replace("#include <project_vertex>", "#include <project_vertex>\nvTkW = (modelMatrix * vec4(transformed, 1.0)).xyz;");
      sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vTkW;\nuniform float uTime;")
        .replace("#include <color_fragment>", `#include <color_fragment>
          float cell = 0.0625;
          float u = floor((vTkW.x + vTkW.z) / cell - uTime * 7.0), r = floor(vTkW.y / cell);
          float ch = floor(u / 6.0), cu = mod(u, 6.0);
          float on = cu > 4.5 ? 0.0 : step(0.42, fract(sin(dot(vec3(ch, cu, r), vec3(12.9898, 78.233, 37.719))) * 43758.5453));
          diffuseColor.rgb *= 0.12 + on * 0.95;`);
    };
    MATS.win.color.setScalar(0.62);
    return MATS;
  }
  function toMeshes(T, G, VS) {
    const gs = meshBox(T, G, VS), M = mats(T), out = [];
    ["solid", "win", "glow", "blink", "tick", "holo", "flow"].forEach((k, i) => {
      if (!gs[i]) return;
      const m = new T.Mesh(gs[i], M[k]); m.castShadow = k === "solid"; m.receiveShadow = k === "solid"; m.userData.noVox = true; m.userData.city = k;
      out.push(m);
    });
    return out;
  }

  /* ═════════ 四種風格 ═════════ */
  const WALL = {
    E: (p) => (x, y, z) => (!LITE && H(x >> 3, y >> 3, z >> 3) < 0.12 ? mix(p.wall, 0x000000, 0.04) : p.wall),
    C: (p, b) => (x, y, z) => {
      if ((x === b.x0 || x === b.x1 - 1) && (z >= b.z1 - 3 || z <= b.z0 + 2)) return 0x7A2A20;   // 轉角的紅柱子
      if (LITE) return y % 6 === 0 ? 0x9A9890 : (p.wall || 0x6E747C);
      const row = y >> 1, off = row % 2 ? 2 : 0;
      if (y % 2 === 0 || (x + off) % 5 === 0) return 0x9A9890;
      return mix(p.wall || 0x6E747C, 0x000000, (H(x >> 2, row, z) < 0.3) ? 0.1 : 0);
    },
    J: (p, b, ya, yb) => (x, y, z) => {
      const k = (y - ya) / (yb - ya);
      if (k > 0.68) return y === yb - 1 ? 0x3A2418 : 0xEEE6D6;
      if (LITE) return (((x + z) >> 2) % 2) ? (p.wood || 0x4E3424) : mix(p.wood || 0x4E3424, 0x000000, 0.2);
      return ((x + z) % 2) ? (p.wood || 0x4E3424) : mix(p.wood || 0x4E3424, 0x000000, 0.25);
    },
    Y: (p) => (x, y, z) => {
      if (x % 9 === 0 || y % 10 === 0) return 0x3E424A;
      if (LITE) return p.wall || 0x5E626C;
      const rust = H(x >> 1, 0, z) < 0.1 && H(x, y >> 3, 1) < 0.5;
      return rust ? mix(p.wall || 0x5E626C, 0x8A5A3A, 0.25) : (p.wall || 0x5E626C);
    }
  };
  function win(G, x0, y0, z, w, h, frame, glass, shop) {
    for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) {
      const fr = i === 0 || i === w - 1 || j === 0 || j === h - 1 || (!shop && i === (w >> 1)) || j === 8;
      G.set(x0 + i, y0 + j, z, fr ? frame : glass, fr ? 0 : F_WIN);
    }
    for (let i = -1; i <= w; i++) G.set(x0 + i, y0 - 1, z + 1, 0xE8DCC8, 0);
  }
  function lantern(G, x, y, z, c, lamps) {
    G.set(x, y, z, 0x3A2A20, 0);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (let dy = -3; dy <= -1; dy++) if (Math.abs(dx) + Math.abs(dz) < 2 || dy === -2) G.set(x + dx, y + dy, z + dz, c, F_GLOW);
    G.set(x, y - 4, z, 0xC8A040, 0);
    lamps.push([x * V, z * V, 0xFF5A30]);
  }
  function paperLantern(G, x, y, z, lamps) {
    for (let dy = 0; dy < 5; dy++) for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) G.set(x + dx, y + dy, z + dz, dy === 0 || dy === 4 ? 0x2A2420 : 0xFFF0D0, dy === 0 || dy === 4 ? 0 : F_GLOW);
    lamps.push([x * V, z * V, 0xFFC890]);
  }

  /* ── 側牆和背面：窗、水管、冷氣、晾衣竿、陽台、鐵梯（LITE＝遠處用的省略版，只留窗） ── */
  let LITE = false;
  const SIDEWIN = {
    E: (p) => ({ fr: p.frame || 0xF8F4EC, gl: 0xF0D8A0, w: 8, h: 11, grid: (i, j) => i === 4 || j === 6 }),
    C: () => ({ fr: 0x6A2418, gl: 0xF4D8A0, w: 8, h: 10, grid: (i, j) => i % 3 === 0 || j % 3 === 0 }),
    J: () => ({ fr: 0x3A2418, gl: 0xF4E4C0, w: 9, h: 8, grid: (i, j) => i % 2 === 0 || j === 4 }),
    Y: () => ({ fr: 0x2A2C32, gl: 0xE4ECF0, w: 6, h: 7, grid: () => false })
  };
  function sideBack(G, b, ya, yb, st, p, f, ground, lamps) {
    const { x0, x1, z0 } = b, zf = b.z1 - 1, d = zf - z0, wd = SIDEWIN[st](p);
    const wy = ground ? 9 : ya + (st === "Y" ? 12 : 9);
    const pane = (setAt, w, h) => { for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) { const fr = i === 0 || i === w - 1 || j === 0 || j === h - 1 || wd.grid(i, j); setAt(i, j, fr ? wd.fr : wd.gl, fr ? 0 : F_WIN); } };
    // 側牆：深度夠就開兩扇
    const sw = Math.min(wd.w, 10), nz = Math.max(1, Math.floor(d / 24)), zs = []; for (let k = 0; k < nz; k++) zs.push(z0 + Math.round((k + 0.55) * d / nz));
    for (const x of [x0, x1 - 1]) for (const zc of zs) {
      if (H(x, f, zc) < 0.18) continue;   // 偶爾少一扇，比較自然
      pane((i, j, c, fl) => G.set(x, wy + j, zc - (sw >> 1) + i, c, fl), sw, wd.h);
    }
    // 背面：窗戶對著正面的位置開
    const w = x1 - x0, n = Math.max(1, Math.floor((w - 6) / 14));
    const slots = []; for (let k = 0; k < n; k++) slots.push(x0 + Math.round((k + 0.5) * w / n));
    if (ground && st !== "Y") {   // 後門
      const bx = slots[slots.length - 1] + (slots.length > 1 ? 0 : 5);
      for (let i = 0; i < 7; i++) for (let j = 4; j < 22; j++) G.set(bx - 3 + i, j, z0, i === 0 || i === 6 || j === 21 ? 0x3A2A20 : (p.door || 0x5A3A26), 0);
      if (!LITE) { G.set(bx, 23, z0 - 1, 0x2E3238, 0); G.set(bx, 22, z0 - 1, 0xFFC878, F_GLOW); }
    }
    for (const sx of slots) {
      if (ground && Math.abs(sx - (slots[slots.length - 1] + (slots.length > 1 ? 0 : 5))) < 8) continue;
      pane((i, j, c, fl) => G.set(sx - (wd.w >> 1) + i, wy + j, z0, c, fl), wd.w, wd.h);
    }
    if (LITE) return;
    // 排水管：每層接起來就是一整條
    for (let y = ya; y < yb; y++) G.set(x0 + 2, y, z0 - 1, 0x6A6E74, 0);
    if (f % 2 === 0) G.set(x0 + 2, ya + 2, z0 - 2, 0x5A5E64, 0);
    if (ground) return;
    const r = k => H(x0 * 7 + f, z0, k);
    // 冷氣室外機
    if (st === "Y" || r(1) < 0.55) {
      const ax = Math.max(x0 + 5, Math.min(x1 - 12, slots[Math.floor(r(2) * slots.length)] + (r(3) < 0.5 ? -12 : 6)));
      fill(G, ax, ya + 4, z0 - 4, ax + 7, ya + 9, z0, (x, y, z) => (z === z0 - 4 && x > ax && x < ax + 4 && y > ya + 4 && y < ya + 8) ? ((x + y) % 2 ? 0x8A8E94 : 0x6A6E74) : 0xD8DADC);
      for (let k = 1; k < 5; k++) G.set(ax - 1, ya + 3 - (k > 3 ? 0 : 0), z0 - k, 0x8A8E94, 0);
    }
    // 晾衣竿：中式、日式比較常見
    if ((st === "C" || st === "J") && r(4) < 0.7) {
      const lx = x0 + 4 + Math.floor(r(5) * Math.max(1, w - 30)), ly = ya + 22;
      for (const bx of [lx, lx + 22]) for (let k = 1; k <= 4; k++) G.set(bx, ly, z0 - k, 0x4A4C52, 0);
      for (let x = lx; x <= lx + 22; x++) G.set(x, ly, z0 - 4, 0x8A8E94, 0);
      const CL = [0xF4F0E8, 0x5A7AB0, 0xE07A7A, 0xF4D35E, 0x7AB08A, 0xB8A0D8];
      for (let x = lx + 2; x < lx + 21;) {
        const cw = 2 + Math.floor(H(x, f, 6) * 3), ch = 4 + Math.floor(H(x, f, 7) * 5), cc = CL[Math.floor(H(x, f, 8) * CL.length)];
        if (H(x, f, 9) < 0.75) for (let i = 0; i < cw; i++) for (let j = 1; j <= ch; j++) G.set(x + i, ly - j, z0 - 4, cc, 0);
        x += cw + 1;
      }
    }
    // 歐式小陽台（鐵欄杆）
    if (st === "E" && r(10) < 0.4) {
      const sx = slots[Math.floor(r(11) * slots.length)];
      for (let x = sx - 7; x <= sx + 7; x++) for (let k = 1; k <= 5; k++) {
        G.set(x, ya + 1, z0 - k, 0xB8AC98, 0);
        if (k === 5 || x === sx - 7 || x === sx + 7) { if ((x + k) % 2 === 0 || k === 5 && x % 2 === 0) for (let y = ya + 2; y < ya + 7; y++) G.set(x, y, z0 - k, 0x3A3A3E, 0); G.set(x, ya + 7, z0 - k, 0x3A3A3E, 0); }
      }
      if (r(12) < 0.6) for (const px of [sx - 5, sx + 4]) { G.set(px, ya + 2, z0 - 3, 0x8A4E30, 0); G.set(px, ya + 3, z0 - 3, [0xF0607A, 0x5E9A4E, 0xF4D35E][Math.floor(r(13) * 3)], 0); }
    }
    // 賽博龐克：外掛鐵梯平台和管線
    if (st === "Y") {
      const sx = x1 - 14;
      for (let x = sx; x < sx + 11; x++) for (let k = 1; k <= 6; k++) { G.set(x, ya + 1, z0 - k, (x + k) % 2 ? 0x4A4E56 : 0x3A3E46, 0); if (k === 6 || x === sx || x === sx + 10) G.set(x, ya + 5, z0 - k, 0x2A2C32, 0); }
      for (let y = ya + 1; y < yb + 1; y++) { const t = (y - ya) / (yb - ya); G.set(sx + Math.round(t * 10), y, z0 - 3, 0x5A5E66, 0); G.set(sx + Math.round(t * 10), y, z0 - 4, 0x5A5E66, 0); }
      for (let x = x0 + 4; x < x1 - 16; x++) G.set(x, ya + 20, z0 - 1, (x >> 2) % 2 ? 0x7A808A : 0x6A7078, 0);
      if (r(14) < 0.5) { const nx = x0 + 6 + Math.floor(r(15) * Math.max(1, w - 30)); for (let x = nx; x < nx + 8; x++) for (let y = ya + 13; y < ya + 17; y++) G.set(x, y, z0 - 1, y === ya + 13 || y === ya + 16 ? 0x22242A : p.neon, y === ya + 13 || y === ya + 16 ? 0 : F_GLOW); }
    }
  }

  /* 一層樓。b = { x0, x1, z0, z1, door }（門的位置，格） */
  function storey(G, b0, f, st, p, lamps, under, ground) {
    let b = b0;
    const added = under && under !== st;   // 後來加蓋的：往後縮一格，底下有支架
    if (added) b = { x0: b0.x0 + 1, x1: b0.x1 - 1, z0: b0.z0 + 1, z1: b0.z1 - 1, door: b0.door };
    const ya = f === 0 ? 4 : f * FH, yb = (f + 1) * FH, wf = WALL[st](p, b, ya, yb);
    const { x0, x1, z0, z1 } = b, zf = z1 - 1;
    for (let y = ya; y < yb; y++) for (let x = x0; x < x1; x++) for (let z = z0; z < z1; z++) {
      if (!(x === x0 || x === x1 - 1 || z === z0 || z === zf)) continue;
      G.set(x, y, z, wf(x, y, z), 0);
    }
    G.inside(x0 + 1, ya, z0 + 1, x1 - 1, yb, zf);
    sideBack(G, b, ya, yb, st, p, f, ground, lamps);
    if (added) {
      // 接縫：鐵皮雨遮或木頭支架
      if (st === "Y" || under === "Y") for (let x = b0.x0; x < b0.x1; x++) for (let k = 0; k < 3; k++) G.set(x, ya - (k >> 1), b0.z1 + k, (x % 2) ? 0x8A9098 : 0x7A8088, 0);
      else for (let x = x0; x < x1; x += 5) for (let k = 0; k < 2; k++) { G.set(x, ya - 1 - k, zf + 1 + k, 0x5A3A26, 0); }
    }
    const w = x1 - x0, n = Math.max(1, Math.floor((w - 6) / 14));
    const slots = []; for (let k = 0; k < n; k++) slots.push(x0 + Math.round((k + 0.5) * w / n));
    const doorX = b.door != null ? b.door : slots[0];
    const away = slots.filter(sx => Math.abs(sx - doorX) > 9);
    if (st === "E") {
      if (ground) {
        const dx = doorX - 5;
        for (let i = 0; i < 10; i++) for (let j = 4; j < 25; j++) G.set(dx + i, j, zf, i === 0 || i === 9 || j === 24 ? p.frame : (i === 5 ? 0x5A3A22 : p.door), 0);
        for (const sx of away) win(G, sx - 6, 9, zf, 12, 13, p.frame, 0xF8E2A8, true);
        if (p.awning) for (let x = x0 + 1; x < x1 - 1; x++) for (let k = 0; k < 8; k++) { const y = 28 - Math.floor(k * 0.6), c = ((x - x0) >> 2) % 2 ? p.awning : 0xF4F0E8; G.set(x, y, z1 + k, c, 0); if (k === 7) G.set(x, y - 1, z1 + k, c, 0); }
        G.set(dx - 2, 18, z1, 0x2E3238, 0); G.set(dx - 2, 17, z1, 0xFFC878, F_GLOW); lamps.push([(dx - 2) * V, (z1 + 1) * V, 0xFF9A48]);
      } else for (const sx of slots) {
        win(G, sx - 4, ya + 9, zf, 9, 13, p.frame, 0xF6DCA0);
        if (p.shutter) for (const s of [-4, 10]) for (let i = 0; i < 3; i++) for (let j = 0; j < 13; j++) G.set(sx - 4 + s + i, ya + 9 + j, z1, j % 3 ? p.shutter : mix(p.shutter, 0x000000, 0.15), 0);
        if (p.flowers !== false && !LITE) for (let i = -1; i <= 9; i++) { G.set(sx - 4 + i, ya + 7, z1, 0x8A4E30, 0); if (H(i, f, sx) < 0.7) G.set(sx - 4 + i, ya + 8, z1, [0xF0607A, 0xF4D35E, 0xFFFFFF, 0x5E9A4E][Math.floor(H(sx, i, 2) * 4)], 0); }
      }
      for (let x = x0 - 1; x <= x1; x++) G.set(x, yb - 1, z1, p.trim, 0);
    } else if (st === "C") {
      if (ground) {
        for (let x = x0 + 2; x < x1 - 2; x++) for (let y = 4; y < 24; y++) {
          const open = (x - x0) % 6 !== 0 && H(x >> 1, 3, 1) < 0.4 && y > 8 && y < 20 && Math.abs(x - doorX) > 3;
          const isDoor = Math.abs(x - doorX) <= 3 && y < 22;
          if (isDoor) { G.del(x, y, zf); if (y === 4) G.set(x, y, zf, 0x5A3A26, 0); continue; }
          if (open) { G.del(x, y, zf); G.set(x, y, zf - 1, 0xFFD890, F_WIN); }
          else G.set(x, y, zf, (x - x0) % 6 === 0 ? 0x5A1E16 : y % 6 === 0 ? 0x6A2A1E : 0x8A3A26, 0);
        }
        for (const sx of slots) lantern(G, sx, 24, z1 + 2, 0xE8382A, lamps);
        fill(G, x0 + 4, 25, z1, x1 - 4, 28, z1 + 1, (x, y) => y === 25 || y === 27 ? 0xC8A040 : 0x2A1A14);
      } else for (const sx of slots) for (let i = 0; i < 11; i++) for (let j = 0; j < 12; j++) {
        const fr = i === 0 || i === 10 || j === 0 || j === 11 || i % 3 === 0 || j % 3 === 0;
        G.set(sx - 5 + i, ya + 9 + j, zf, fr ? 0x6A2418 : 0xF4D8A0, fr ? 0 : F_WIN);
      }
      for (let x = x0 - 2; x < x1 + 2; x++) { G.set(x, yb - 2, z1, 0x8A2A1E, 0); for (let k = 0; k < 3; k++) G.set(x, yb - 1 - (k === 2 ? 1 : 0), z1 + k, (x + k) % 3 ? 0x4A4E56 : 0x3A3E46, 0); }
    } else if (st === "J") {
      if (ground) {
        const dx = doorX - 6;
        for (let i = 0; i < 12; i++) for (let j = 4; j < 22; j++) G.set(dx + i, j, zf, i % 2 ? 0x3A2418 : 0xF4E4C0, i % 2 ? 0 : F_WIN);
        for (let i = 0; i < 12; i++) for (let j = 15; j < 22; j++) if (i % 4 !== 3) G.set(dx + i, j, z1, j === 18 && (i === 5 || i === 6) ? 0xF4F0E8 : (p.noren || 0x2E3E6A), 0);
        for (const sx of away) for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) { if (i % 2) G.set(sx - 5 + i, 9 + j, z1, 0x3A2418, 0); G.set(sx - 5 + i, 9 + j, zf, 0xF4E4C0, F_WIN); }
        paperLantern(G, dx - 3, 14, z1 + 1, lamps);
      } else for (const sx of slots) for (let i = 0; i < 11; i++) for (let j = 0; j < 9; j++) {
        G.set(sx - 5 + i, ya + 8 + j, zf, 0xF4E4C0, F_WIN);
        if (i % 2 === 0 || j === 0 || j === 8) G.set(sx - 5 + i, ya + 8 + j, z1, 0x3A2418, 0);
      }
      for (let x = x0 - 1; x <= x1; x++) for (let k = 0; k < 4; k++) G.set(x, yb - 1 - (k >> 1), z1 + k, (x % 2) ? 0x4A4C52 : 0x3E4046, 0);
    } else if (st === "Y") {
      if (ground) {
        for (let x = x0 + 2; x < x1 - 2; x++) for (let y = 4; y < 22; y++) {
          if (Math.abs(x - doorX) <= 4) { G.set(x, y, zf, y > 20 ? 0x2A2C32 : (x === doorX ? 0x2A2C32 : 0x9AE8F0), y > 20 || x === doorX ? 0 : F_WIN); continue; }
          G.set(x, y, zf, y % 2 ? 0x7A808A : 0x6A7078, 0);
        }
        // 店面上方：一塊彩色的招牌（顏色每家不同）
        const sc = signCol(x0 * 31 + f), sw2 = Math.min(w - 6, 22 + Math.floor(H(x0, 1, 61) * 14)), sx0 = Math.round((x0 + x1) / 2 - sw2 / 2);
        board(G, sx0, 23, z1, sw2, 6, sc, x0 * 13 + 5);
        lamps.push([(x0 + x1) / 2 * V, (z1 + 4) * V, sc.bg]);
      } else {
        // 一扇一扇的窗（不再是一整條藍色長窗），亮不亮、什麼顏色交給 Box.tint
        for (let x = x0 + 3; x + 6 <= x1 - 3; x += 9) for (let i = 0; i < 6; i++) for (let j = 0; j < 7; j++) {
          const fr = i === 0 || i === 5 || j === 0 || j === 6;
          G.set(x + i, ya + 11 + j, zf, fr ? 0x2A2C32 : 0xE4ECF0, fr ? 0 : F_WIN);
        }
        const ax = x0 + 4 + Math.floor(H(f, x0, 3) * Math.max(1, w - 12));
        fill(G, ax, ya + 5, z1, ax + 5, ya + 9, z1 + 3, (x, y) => (x + y) % 2 ? 0xC8CCD2 : 0xA8ACB4);
        for (let y = ya; y < yb; y++) G.set(x1 - 3, y, z1, 0x8A8E96, 0);
        /* 招牌：雜亂但錯落有致。
         * 「有致」：每棟有一兩條招牌欄（同一個 x 靠齊），每層一塊往上疊，寬窄不同但一邊對齊；
         * 「雜亂」：欄以外再隨機散幾塊小的，凸出牆面的深度、高度、大小都不一樣，偶爾蓋到窗戶一角；還有垂直伸出來的刀旗招牌。 */
        const cols = [x0 + 3 + Math.floor(H(x0, 0, 81) * 6)];
        if (w > 60 && H(x0, 1, 81) < 0.6) cols.push(x1 - 3 - 14 - Math.floor(H(x0, 2, 81) * 6));
        // 大小分明：每棟挑一層掛一塊「主招牌」（佔牆面一半以上、很高），其他都是小招牌
        const heroF = 1 + Math.floor(H(x0, 0, 79) * 3), hero = f === heroF || (f > 3 && (f - heroF) % 3 === 0);   // 高樓每四層再一塊大招牌
        if (hero) {
          const sc = signCol(x0 * 7 + 991 + f * 13), bw = Math.min(w - 6, Math.round(w * (0.55 + H(x0 + f, 1, 80) * 0.2))), bh = 13 + Math.floor(H(x0, 2, 80) * 5);
          const bx = x0 + 3 + Math.floor(H(x0, 3, 80) * Math.max(1, w - 6 - bw));
          board(G, bx, ya + 9, z1 + 2, bw, bh, sc, x0 * 3 + 777, false, 3);
          if (!LITE) { const nm = ICON_KEYS[Math.floor(H(x0, 4, 80) * ICON_KEYS.length)]; icon(G, nm, "z", z1 + 3, bx + 2, ya + 9 + ((bh - 7) >> 1), sc.fg, F_GLOW); }
          lamps.push([(bx + bw / 2) * V, (z1 + 4) * V, sc.bg]);
        }
        if (!hero) cols.forEach((cx0, ci) => {
          if (H(x0 + ci, f, 82) < 0.15) return;   // 偶爾有一層空著
          const sc = signCol(x0 * 7 + f * 3 + ci * 11), bw = 6 + Math.floor(H(x0 + ci, f, 83) * 6), bh = 3 + Math.floor(H(x0 + ci, f, 84) * 3);
          const right = ci === 1, bx = right ? cx0 + 14 - bw : cx0;   // 左欄靠左對齊、右欄靠右對齊
          const by = ya + 19 + Math.floor(H(x0 + ci, f, 85) * 3), dz = 1 + Math.floor(H(x0 + ci, f, 86) * 3);
          board(G, bx, by, z1 + dz - 1, bw, bh, sc, x0 * 3 + f * 17 + ci, H(x0 + ci, f, 87) < 0.3, dz);
        });
        const nS = Math.floor(H(x0, f, 63) * 3);
        for (let q = 0; q < nS; q++) {
          const sc = signCol(x0 * 5 + f * 7 + q + 40), sq = H(x0 + q, f, 64) < 0.5;
          const bw = sq ? 7 : 6 + Math.floor(H(x0 + q, f, 65) * 6), bh = sq ? 7 : 3 + Math.floor(H(x0 + q, f, 66) * 2);
          const bx = x0 + 3 + Math.floor(H(x0 + q * 5, f, 67) * Math.max(1, w - bw - 6)), by = ya + 4 + Math.floor(H(x0, f + q, 68) * 20);
          board(G, bx, by, z1 + (H(q, f, 69) < 0.5 ? 0 : 1), bw, bh, sc, x0 * 3 + f * 17 + q + 9, sq, 1);
        }
        // 刀旗招牌：從牆面垂直伸出來（街上走的人從側面看得到）
        if (H(x0, f, 88) < 0.45) {
          const sc = signCol(x0 * 9 + f + 77), bx = x0 + 6 + Math.floor(H(x0, f, 89) * Math.max(1, w - 12)), by = ya + 6 + Math.floor(H(x0, f, 90) * 10), L = 5 + Math.floor(H(x0, f, 91) * 4), hh = 8 + Math.floor(H(x0, f, 92) * 10);
          for (let k = 1; k <= L; k++) for (let y = by; y < by + hh; y++) {
            const edge = k === L || y === by || y === by + hh - 1;
            const gl = !edge && k > 1 && (y - by) % 4 !== 0 && H(bx + k, y >> 1, 93) < 0.5;
            G.set(bx, y, z1 + k, edge ? 0x22242A : gl ? sc.fg : sc.bg, edge ? 0 : F_GLOW);
          }
          G.set(bx, by + hh, z1 + 1, 0x3A3A3E, 0); G.set(bx, by - 1, z1 + 1, 0x3A3A3E, 0);
          lamps.push([bx * V, (z1 + L) * V, sc.bg]);
        }
      }
      if (f > 0 && (f === 1 || added)) {
        // 直立的彩色燈箱（取代原本的霓虹直條）
        const sx = x1 - 6, sc = signCol(x1 * 5 + f), y0 = ya + 2, hh = FH - 6;
        for (let y = y0; y < y0 + hh; y++) for (let k = 0; k < 5; k++) {
          const edge = k === 0 || k === 4 || y === y0 || y === y0 + hh - 1;
          const cy = Math.floor((y - y0 - 1) / 6), ly = (y - y0 - 1) % 6;
          const gl = !edge && ly > 0 && ly < 5 && k > 0 && k < 4 && H(x1 + cy, ly, k) < 0.45;
          G.set(sx, y, z1 + 1 + k, edge ? 0x22242A : gl ? sc.fg : sc.bg, edge ? 0 : F_GLOW);
          G.set(sx + 1, y, z1 + 1 + k, edge ? 0x22242A : gl ? sc.fg : sc.bg, edge ? 0 : F_GLOW);
        }
        lamps.push([sx * V, (z1 + 3) * V, sc.bg]);
      }
    }
    if (ground && !LITE) frontage(G, b, st, p, doorX, away, lamps);
  }
  /* ── 一樓門前：台階、腳踏墊、盆栽、立牌、販賣機、菜攤、腳踏車（站在人行道上看得到的高度） ── */
  function frontage(G, b, st, p, doorX, away, lamps) {
    const { x0, x1, z1 } = b, s = x0 * 7 + x1 * 3 + z1, R = k => H(s, k, 131);
    const inX = x => x >= x0 + 1 && x < x1 - 1;
    // 台階＋腳踏墊：一眼看出「門在這裡」
    const stone = st === "Y" ? 0x5A5E66 : st === "C" ? 0x9A8E7E : 0xB8AE9C;
    fill(G, doorX - 6, 4, z1, doorX + 6, 5, z1 + 3, (x, y, z) => z === z1 + 2 ? mix(stone, 0x000000, 0.12) : stone);
    const MATC = [0x8A4E3A, 0x3E5A7A, 0x5A7A4A, 0x9A6A3A, 0x6A4A7A];
    fill(G, doorX - 3, 4, z1, doorX + 3, 5, z1 + 2, MATC[Math.floor(R(1) * MATC.length)]);
    // 門邊的壁燈（歐式本來就有）
    if (st !== "E" && R(2) < 0.7) { const lx = doorX + (st === "J" ? 8 : 7); if (inX(lx)) { G.set(lx, 19, z1, 0x2E3238, 0); G.set(lx, 18, z1, 0xFFD890, F_GLOW); G.set(lx, 17, z1, 0x2E3238, 0); lamps.push([lx * V, (z1 + 1) * V, 0xFFB060]); } }
    const pot = (x, tall) => {
      if (!inX(x) || !inX(x + 3)) return;
      fill(G, x, 5, z1, x + 3, 8, z1 + 3, (a, y) => y === 7 ? 0xA85A3A : 0xB86A45);
      const leaf = [0x4E8A40, 0x5E9A4E, 0x6AA858], fl = [0xF07A9A, 0xF4D35E, 0xFFFFFF, 0xC88EE8];
      const hh = tall ? 16 : 11;
      for (let y = 8; y < hh; y++) for (let a = -1; a <= 3; a++) for (let c = -1; c <= 3; c++) {
        const d = ((a - 1) / 2.4) ** 2 + ((y - (tall ? 12 : 9.5)) / (tall ? 4 : 2)) ** 2 + ((c - 1) / 2.4) ** 2;
        if (d < 1 && H(x + a, y, c) < 0.85) G.set(x + a, y, z1 + c, !tall && y === hh - 1 && H(a, c, x) < 0.5 ? fl[Math.floor(H(x, a, c) * 4)] : leaf[Math.floor(H(a, y, c + x) * 3)], 0);
      }
    };
    const aboard = x => {   // A 字立牌：黑板＋粉筆字
      if (!inX(x) || !inX(x + 6)) return;
      for (let y = 5; y < 14; y++) for (let i = 0; i < 6; i++) {
        const z = z1 + 3 + Math.floor((14 - y) / 4), fr = i === 0 || i === 5 || y === 13 || y === 5;
        G.set(x + i, y, z, fr ? 0x6A4A30 : (y === 11 || y === 9) && i > 0 && i < 5 && H(i, y, x) < 0.7 ? 0xF4F0E4 : y === 7 && i === 2 ? 0xF4A0B0 : 0x2A2E2C, 0);
      }
    };
    const vending = (x, col) => {   // 販賣機：靠牆、正面發光
      if (!inX(x) || !inX(x + 7)) return;
      fill(G, x, 5, z1, x + 7, 24, z1 + 6, (a, y, z) => z === z1 + 5 && a > x && a < x + 6 && y > 9 && y < 22 ? null : col);
      for (let a = x + 1; a < x + 6; a++) for (let y = 10; y < 22; y++) {
        const row = (y - 10) % 4, glow = row !== 0;
        G.set(a, y, z1 + 5, glow ? (row === 2 ? [0xFF6A6A, 0x6AD8FF, 0xF4D35E, 0x8AE07A][(a + y) % 4] : 0xF4FAFF) : 0x3A3E46, glow ? F_GLOW : 0);
      }
      fill(G, x + 1, 6, z1 + 6, x + 6, 8, z1 + 7, 0x2A2C32);
      lamps.push([(x + 3) * V, (z1 + 6) * V, col === 0xD84040 ? 0xFF8A8A : 0xA8E0FF]);
    };
    const crates = x => {   // 菜攤：木箱裝蔬果
      if (!inX(x) || !inX(x + 12)) return;
      for (let k = 0; k < 3; k++) {
        const cx = x + k * 4, h = 8 + (k % 2) * 2;
        fill(G, cx, 5, z1 + 1, cx + 4, h, z1 + 6, (a, y, z) => a === cx || z === z1 + 5 ? 0x8A6440 : 0xA8845A);
        const fc = [0xE8403A, 0xF4A040, 0x7AB040, 0xE8D04A, 0x9A4AA8][Math.floor(R(10 + k) * 5)];
        for (let a = cx + 1; a < cx + 4; a++) for (let z = z1 + 2; z < z1 + 5; z++) G.set(a, h, z, (a + z) % 2 ? fc : mix(fc, 0x000000, 0.15), 0);
      }
    };
    const bike = x => {
      if (!inX(x) || !inX(x + 10)) return;
      const c = [0x3A6E9A, 0xC8402A, 0xE8B83A, 0x4A8A6A][Math.floor(R(20) * 4)], z = z1 + 2;
      for (const wx of [x + 1, x + 8]) for (let a = -2; a <= 2; a++) for (let y = 5; y < 10; y++) if (Math.abs(Math.hypot(a, y - 7) - 2.2) < 0.7) G.set(wx + a, y, z, 0x1E1E22, 0);
      for (let a = x + 2; a < x + 9; a++) G.set(a, 10, z, c, 0);
      G.set(x + 3, 11, z, 0x2A2A2A, 0); G.set(x + 8, 11, z, 0x5A5E66, 0); G.set(x + 8, 12, z, 0x5A5E66, 0);
    };
    const side = [doorX - 10, doorX + 7], A0 = away.length ? away[0] - 6 : null, A1 = away.length > 1 ? away[away.length - 1] - 6 : null;
    if (st === "E") {
      if (R(3) < 0.75) { pot(side[0], R(4) < 0.5); pot(side[1], R(5) < 0.5); }
      if (A0 != null && R(6) < 0.55) aboard(A0 + 3);
      if (A1 != null && A1 !== A0 && R(7) < 0.35) bike(A1);
    } else if (st === "C") {
      if (A0 != null && R(6) < 0.6) crates(A0);
      else if (R(4) < 0.6) pot(side[1], true);
      if (A1 != null && A1 !== A0 && R(7) < 0.4) aboard(A1 + 3);
    } else if (st === "J") {
      if (R(3) < 0.7) pot(side[0] - 2, true);
      if (A0 != null && R(6) < 0.35) vending(A0 + 2, R(8) < 0.5 ? 0xF4F0EC : 0xD84040);
      else if (A0 != null && R(6) < 0.7) bike(A0);
    } else if (st === "Y") {
      const vx = A0 != null ? A0 + 2 : doorX + 8;
      if (R(6) < 0.75) vending(vx, [0xD84040, 0x3A6ABA, 0xF4F0EC, 0x2A2C32][Math.floor(R(9) * 4)]);
      if (A1 != null && A1 !== A0 && R(7) < 0.5) vending(A1 + 2, R(8) < 0.5 ? 0x3A6ABA : 0xF4F0EC);
      else if (R(7) < 0.5) aboard(doorX - 13);
    }
  }
  // 招牌的顏色：底色＋字色（深底配亮字、亮底配深字）
  const SIGNC = [[0xE83A3A, 0xFFF0C8], [0xF4C430, 0x2A1E16], [0xF08A24, 0xFFFFFF], [0x3AB06A, 0xFFFFFF], [0xF4F0E4, 0xD8302A],
    [0xFF6AB0, 0xFFFFFF], [0x3A8AE8, 0xFFFFFF], [0x9A6AFF, 0xFFF0C8], [0x22242A, 0x6AFF9A], [0x1E2A4A, 0xF4D35E], [0xFFFFFF, 0x2A3A8A], [0xC8303A, 0xF4D35E]];
  function signCol(seed) { const c = SIGNC[Math.floor(H(seed, 7, 71) * SIGNC.length)]; return { bg: c[0], fg: c[1] }; }
  // 貼在牆面外的一塊招牌：深色框，裡面是底色加「字」（隨機筆畫）；sq＝小方形的圖示招牌
  function board(G, x0, y0, z, w, h, sc, seed, sq, dz) {
    if (dz > 1) for (const bx of [x0 + 1, x0 + w - 2]) for (let k = 0; k < dz - 1; k++) { G.set(bx, y0 + 1, z - k, 0x3A3A3E, 0); G.set(bx, y0 + h - 2, z - k, 0x3A3A3E, 0); }   // 支架
    const nm = sq ? ICON_KEYS[Math.floor(H(seed, 3, 73) * ICON_KEYS.length)] : null;
    for (let x = x0; x < x0 + w; x++) for (let y = y0; y < y0 + h; y++) {
      const edge = x === x0 || x === x0 + w - 1 || y === y0 || y === y0 + h - 1;
      let c = sc.bg;
      if (!edge && !LITE) {
        if (nm) { const i = x - x0 - 0, j = y0 + h - 1 - y; if (i < 7 && j < 7 && ICONS[nm][j][i] === "#") c = sc.fg; }
        else { const lx = x - x0 - 1, ly = y - y0 - 1, cx = Math.floor(lx / 4); if (lx % 4 !== 3 && h - 2 > 1 && H(seed + cx, ly, lx % 4) < 0.45) c = sc.fg; }
      }
      G.set(x, y, z, edge ? 0x22242A : c, edge ? 0 : F_GLOW);
    }
  }
  function roof(G, b, fl, st, p, under) {
    let { x0, x1, z0, z1 } = b;
    if (under && under !== st && fl > 1) { x0++; x1--; z0++; z1--; }
    const Ht = fl * FH, d = z1 - z0;
    if (st === "Y") {
      fill(G, x0, Ht, z0, x1, Ht + 3, z1, (x, y, z) => (x === x0 || x === x1 - 1 || z === z0 || z === z1 - 1) ? 0x4A4E56 : (y === Ht ? 0x3A3E46 : null));
      if (x1 - x0 > 16) fill(G, x0 + 4, Ht, z0 + 6, x0 + 12, Ht + 10, z0 + 14, (x, y) => y > Ht + 2 ? ((y % 3) ? 0x8A9098 : 0x6A7078) : 0x3A3E46);
      for (let y = Ht; y < Ht + 16; y++) G.set(x1 - 5, y, z0 + 10, 0x9A9EA6, 0);
      G.set(x1 - 5, Ht + 16, z0 + 10, 0xFF3A3A, F_GLOW);
      return Ht + 16;
    }
    const ov = st === "E" ? 2 : 4, slope = st === "J" ? 0.6 : st === "C" ? 0.75 : 0.9;
    const tileC = st === "E" ? p.roof : st === "C" ? 0x3E424A : 0x4A4C54;
    const span = d + ov * 2;
    let top = Ht;
    for (let k = 0; k < span / 2; k++) {
      const y = Ht + Math.floor(k * slope), za = z0 - ov + k, zb = z1 + ov - 1 - k;
      top = y;
      for (let x = x0 - ov; x < x1 + ov; x++) {
        const lift = st === "C" && (x < x0 - ov + 3 || x > x1 + ov - 4) && k < 3 ? 1 : 0;
        const c = (!LITE && k % 3 === 0) ? mix(tileC, 0x000000, 0.14) : tileC;   // 一排一排的瓦（同一排同色，網格比較省）
        G.set(x, y + lift, za, c, 0); G.set(x, y + lift, zb, c, 0);
      }
      for (const x of [x0, x1 - 1]) for (let z = za + 1; z < zb; z++) G.set(x, y, z, st === "E" ? p.wall : st === "C" ? 0x6E747C : 0xEEE6D6, 0);
      if (zb - za > 1) G.inside(x0 + 1, y, za + 1, x1 - 1, y + 1, zb);   // 閣樓裡面看不到，屋瓦的內側面不用畫
    }
    // 山牆上的小閣樓窗
    if (top - Ht >= 9) {
      const zc = Math.round((z0 + z1) / 2), gw = st === "J" ? 7 : 5, gy = Ht + 2;
      for (const x of [x0, x1 - 1]) for (let i = 0; i < gw; i++) for (let j = 0; j < 5; j++) {
        const fr = i === 0 || i === gw - 1 || j === 0 || j === 4 || (st === "J" && i % 2 === 0);
        G.set(x, gy + j, zc - (gw >> 1) + i, fr ? (st === "E" ? 0xF8F4EC : 0x3A2418) : (st === "J" ? 0xF4E4C0 : 0xF0D8A0), fr ? 0 : F_WIN);
      }
    }
    if (st === "C") {
      const zc = Math.round((z0 + z1) / 2);
      for (let x = x0 - ov; x < x1 + ov; x++) G.set(x, top + 1, zc, 0x2E3238, 0);
      for (const x of [x0 - ov, x1 + ov - 1]) for (let y = top + 1; y < top + 4; y++) G.set(x, y, zc, 0x2E3238, 0);
    }
    if (st === "E" && p.chimney) fill(G, x1 - 8, Ht, z0 + 4, x1 - 4, top + 5, z0 + 8, (x, y) => (y % 3 === 0) ? 0x8A503A : 0xB06A4A);
    return top + 4;
  }
  // 一棟：floors＝每層的風格（下 → 上）。回傳最高點（公尺）
  function building(G, b, floors, p, lamps) {
    const pd = b.pad == null ? 1 : b.pad;
    fill(G, b.x0 - pd, 0, b.z0 - pd, b.x1 + pd, 4, b.z1 + pd, (x, y, z) => (floors[0] === "Y" ? 0x4A4E56 : ((x + z) % 4 === 0 ? 0xA89C88 : 0xB8AC98)));
    G.tint = true;
    floors.forEach((st, f) => storey(G, b, f, st, p, lamps, f ? floors[f - 1] : null, f === 0));
    const top = roof(G, b, floors.length, floors[floors.length - 1], p, floors.length > 1 ? floors[floors.length - 2] : null);
    G.tint = false;
    const t2 = LITE ? top : extras(G, b, floors, p, lamps, top);
    return Math.max(top, t2) * V;
  }

  /* ═════════ 小配件和招牌（中等密度，每棟固定） ═════════
   * 正面：冷氣、通風口、電錶箱、小點燈；招牌依風格：中日賽博的直式燈箱、歐式鐵架吊牌、賽博霓虹圖案；
   * 屋頂：天線和紅色航空燈、水塔、碟形天線、看板。內容都是諾文自己的符號，不放真實品牌。 */
  const ICONS = {
    donut: ["..###..", ".#####.", "##...##", "##...##", "##...##", ".#####.", "..###.."],
    lens: ["..###..", ".#...#.", ".#...#.", ".#...#.", "..###..", "....##.", ".....##"],
    bread: ["..###..", ".#####.", "#######", "#.#.#.#", "#######", "#######", "......."],
    bowl: [".#.#.#.", "..#.#..", "#######", "#######", ".#####.", "..###..", "......."],
    cat: ["#.....#", "##...##", "#######", "#.###.#", "#######", ".#####.", "..#.#.."],
    star: ["...#...", "...#...", "#######", ".#####.", "..###..", ".##.##.", "##...##"],
    note: ["...####", "...#..#", "...#..#", "...#..#", ".###.##", "####.##", ".##...."],
    cup: ["..#.#..", ".#.#...", "######.", "#####.#", "#####.#", "######.", ".####.."],
    fish: ["...#...", "..###.#", ".######", "#.#####", ".######", "..###.#", "...#..."],
    heart: [".##.##.", "#######", "#######", "#######", ".#####.", "..###..", "...#..."],
    gear: ["..#.#..", ".#####.", "##...##", ".#.#.#.", "##...##", ".#####.", "..#.#.."],
    book: ["##...##", "###.###", "###.###", "###.###", "###.###", "##...##", "......."]
  };
  const ICON_KEYS = Object.keys(ICONS);
  const NEONC = [0xFF4AC8, 0x4AE8FF, 0xFFD84A, 0x9A6AFF, 0xFF6A4A, 0x6AFF9A];
  // 在一個平面上畫圖示：axis "z" 畫在 z = c 的平面（x 往右、y 往上），axis "x" 畫在 x = c 的平面
  function icon(G, name, axis, c, u0, y0, col, f, flip) {
    const bm = ICONS[name];
    for (let j = 0; j < 7; j++) for (let i = 0; i < 7; i++) {
      if (bm[j][flip ? 6 - i : i] !== "#") continue;
      if (axis === "z") G.set(u0 + i, y0 + 6 - j, c, col, f); else G.set(c, y0 + 6 - j, u0 + i, col, f);
    }
  }
  function extras(G, b, floors, p, lamps, top) {
    const sd = (b.x0 * 7919 + b.z0 * 131 + floors.length * 17 + (p.wall || 0)) | 0, r = k => H(sd, k, 911);
    const n = floors.length, Ht = n * FH, last = floors[n - 1], flatTop = last === "Y";
    let hi = top;
    // ── 每層的正面小零件 ──
    floors.forEach((st, f) => {
      if (f === 0) return;
      const under = floors[f - 1], added = under !== st;
      const x0 = b.x0 + (added ? 1 : 0), x1 = b.x1 - (added ? 1 : 0), z1 = b.z1 - (added ? 1 : 0), ya = f * FH;
      const w = x1 - x0, k = Math.max(1, Math.floor((w - 6) / 14)), slots = [];
      for (let q = 0; q < k; q++) slots.push(x0 + Math.round((q + 0.5) * w / k));
      const gaps = [x0 + 2]; for (let q = 0; q < k - 1; q++) gaps.push(Math.round((slots[q] + slots[q + 1]) / 2)); gaps.push(x1 - 3);
      gaps.forEach((gx, q) => {
        const h = H(sd + f, q, 37);
        if (h < 0.3) {   // 冷氣室外機（掛在窗台下方）
          const ax = Math.max(x0 + 1, Math.min(x1 - 7, gx - 3));
          fill(G, ax, ya + 3, z1, ax + 6, ya + 8, z1 + 3, (x, y, z) => (z === z1 + 2 && x > ax && x < ax + 4 && y > ya + 3 && y < ya + 7) ? ((x + y) % 2 ? 0x8A8E94 : 0x6A6E74) : 0xD8DADC);
          for (let y = ya + 3; y > ya - 2; y--) G.set(ax + 5, y, z1, 0x7A7E84, 0);
        } else if (h < 0.4) {   // 通風口
          fill(G, gx - 2, ya + 18, z1, gx + 2, ya + 22, z1 + 1, (x, y) => (y % 2) ? 0x5A5E64 : 0x3A3E44);
        } else if (h < 0.5) {   // 電錶箱
          fill(G, gx - 1, ya + 6, z1, gx + 2, ya + 11, z1 + 1, 0x8A9098); G.set(gx, ya + 9, z1 + 1, 0x4AE8FF, F_GLOW);
        } else if (h < 0.68) {   // 小點燈（夜裡的小亮點）
          G.set(gx, ya + 24, z1, NEONC[Math.floor(H(gx, f, 41) * NEONC.length)], F_GLOW);
        }
      });
      // 賽博的樓層：牆上的霓虹圖案
      if (st === "Y" && H(sd, f, 43) < 0.45) {
        const gx = gaps[Math.floor(H(sd, f, 44) * gaps.length)], col = NEONC[Math.floor(H(sd, f, 45) * NEONC.length)];
        const ux = Math.max(x0 + 1, Math.min(x1 - 9, gx - 3));
        fill(G, ux - 1, ya + 11, z1, ux + 8, ya + 20, z1 + 1, 0x16181E);
        icon(G, ICON_KEYS[Math.floor(H(sd, f, 46) * ICON_KEYS.length)], "z", z1 + 1, ux, ya + 12, col, F_GLOW);
        lamps.push([(ux + 3) * V, (z1 + 2) * V, col]);
      }
    });
    // ── 直式燈箱招牌（從牆上伸出來，兩面都有字） ──
    const st0 = floors[Math.min(1, n - 1)];
    const wantV = n >= 2 && (st0 === "E" ? r(1) < 0.22 : r(1) < 0.55);
    if (wantV) {
      const side = r(2) < 0.5 ? b.x0 + 2 : b.x1 - 4, len = 8, z1 = b.z1;
      const hgt = Math.min(Ht - FH - 6, 26 + Math.floor(r(3) * 26)), y0 = FH + 3;
      const sty = st0 === "C" ? { bg: 0xD8302A, fg: 0xFFE8A0, fr: 0x5A1E16 } : st0 === "J" ? { bg: 0xF4F0E4, fg: 0x2A1E16, fr: 0x3A2418 }
        : st0 === "Y" ? { bg: 0x16181E, fg: NEONC[Math.floor(r(4) * NEONC.length)], fr: 0x2A2C32 } : { bg: 0x2E3E6A, fg: 0xF4D35E, fr: 0x2A2A2A };
      for (let y = y0; y < y0 + hgt; y++) for (let z = z1; z < z1 + len; z++) for (let dx = 0; dx < 2; dx++) {
        const edge = y === y0 || y === y0 + hgt - 1 || z === z1 || z === z1 + len - 1;
        // 字：每 7 格一個「字」，隨機的橫豎筆畫
        const cy = Math.floor((y - y0 - 1) / 7), ly = (y - y0 - 1) % 7, lz = z - z1 - 1;
        const g = H(sd + cy, ly >> 1, lz >> 1) < 0.42 && ly > 0 && ly < 6 && lz > 0 && lz < 5;
        G.set(side + dx, y, z, edge ? sty.fr : g ? sty.fg : sty.bg, edge ? 0 : F_GLOW);
      }
      for (const yy of [y0 + 2, y0 + hgt - 3]) G.set(side, yy, z1 - 1, 0x3A3A3E, 0);
      lamps.push([(side + 1) * V, (z1 + 4) * V, st0 === "C" ? 0xFF5A30 : st0 === "Y" ? sty.fg : 0xFFD8A0]);
    }
    // ── 歐式鐵架吊牌（二樓窗下） ──
    if (st0 === "E" && n >= 2 && r(5) < 0.45) {
      const bx = r(6) < 0.5 ? b.x0 + 3 : b.x1 - 4, y = FH + 4, z1 = b.z1;
      for (let k2 = 0; k2 < 7; k2++) G.set(bx, y, z1 + k2, 0x2A2A2E, 0);
      G.set(bx, y - 1, z1 + 1, 0x2A2A2E, 0); G.set(bx, y - 2, z1, 0x2A2A2E, 0);
      fill(G, bx, y - 9, z1 + 1, bx + 1, y - 1, z1 + 8, (x, yy, z) => (yy === y - 9 || yy === y - 2 || z === z1 + 1 || z === z1 + 7) ? 0x5A3A26 : 0xE8D8B4);
      const nm = ICON_KEYS[Math.floor(r(7) * ICON_KEYS.length)], bm = ICONS[nm];
      for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) if (bm[j + 1][i + 1] === "#") { G.set(bx - 1, y - 3 - j, z1 + 2 + i, 0x8A4E30, 0); G.set(bx + 2, y - 3 - j, z1 + 2 + i, 0x8A4E30, 0); }
    }
    // ── 跑馬燈（賽博的樓，或其他風格偶爾一條）：兩層樓之間一條細長的點陣燈 ──
    if (n >= 2 && r(17) < (st0 === "Y" ? 0.55 : 0.12)) {
      const f = 1 + Math.floor(r(18) * Math.max(1, n - 1)), y0 = f * FH - 5, z1 = b.z1, xa = b.x0 + 3, xb = b.x1 - 3;
      const col = [0xFFB84A, 0x4AE8FF, 0xFF4A6A, 0x6AFF9A][Math.floor(r(19) * 4)];
      for (let x = xa - 1; x <= xb; x++) for (let y = y0 - 1; y <= y0 + 3; y++) G.set(x, y, z1, 0x16181E, 0);
      for (let x = xa; x < xb; x++) for (let y = y0; y < y0 + 3; y++) G.set(x, y, z1 + 1, col, F_TICK);
      lamps.push([((xa + xb) >> 1) * V, (z1 + 2) * V, col]);
    }
    // ── 鷹架（偶爾一棟在整修）：鍍鋅鋼管、木板、綠色防護網 ──
    if (n >= 2 && r(16) < 0.08) {
      const w = b.x1 - b.x0, half = r(20) < 0.5, xa = half ? b.x0 + (r(21) < 0.5 ? 0 : w >> 1) : b.x0, xb = half ? xa + (w >> 1) : b.x1;
      const z1 = b.z1, zo = z1 + 6, yTop = Ht - 2, PIPE = 0x9A9EA6, PLANK = 0x9A7A4A, NET = 0x3E7A5A;
      for (let x = xa; x <= xb; x += 12) for (const z of [z1 + 1, zo]) for (let y = 4; y <= yTop; y++) G.set(Math.min(x, xb), y, z, PIPE, 0);
      for (let y = 4 + FH / 2; y <= yTop; y += FH / 2) {
        for (let x = xa; x <= xb; x++) { G.set(x, y, zo, PIPE, 0); G.set(x, y, z1 + 1, PIPE, 0); }
        for (let x = xa; x <= xb; x++) for (let z = z1 + 2; z < zo; z++) G.set(x, y - 1, z, (x >> 2) % 2 ? PLANK : mix(PLANK, 0x000000, 0.15), 0);
        for (let x = xa; x <= xb; x += 12) for (let z = z1 + 1; z <= zo; z++) G.set(Math.min(x, xb), y, z, PIPE, 0);
      }
      // 斜撐
      for (let k2 = 0; k2 < FH / 2; k2++) G.set(xa + Math.round(k2 * 12 / (FH / 2)), 4 + FH / 2 + k2, zo, PIPE, 0);
      // 防護網：外側掛一大片（有幾塊沒掛，看得到後面）
      if (r(22) < 0.7) for (let x = xa + 1; x < xb; x++) for (let y = FH; y < yTop; y++) {
        if (H(x >> 3, y >> 3, sd) < 0.25) continue;
        G.set(x, y, zo + 1, (x + y) % 3 ? NET : mix(NET, 0x000000, 0.25), 0);
      }
      hi = Math.max(hi, yTop + 1);
    }
    // ── 綠化：爬藤、陽台盆栽、屋頂花園 ──
    if (H(sd >> 3, b.x1 - b.x0 + floors.length * 7, 61) < 0.92) {   // 爬藤：幾乎每棟都有，從牆腳或簷下長出 1～3 片，位置、高度、形狀隨機
      const VC = [0x4E8A40, 0x5E9E4E, 0x3E7A36, 0x6AAE58], faces = [];
      const nP = 2 + (r(61) < 0.4 ? 1 : 0);
      for (let q = 0; q < nP; q++) {
        const fq = H(sd, q, 70), w = b.x1 - b.x0, d = b.z1 - b.z0;
        // 長在哪一面：正面為主，也有側面、背面
        const face = q <= 1 ? "side" : fq < 0.5 ? "front" : "back";   // 前兩片長在左右兩面側牆（側牆最空）
        const span = face === "side" ? d : w, cx = Math.floor(H(sd, q, 71) * span);
        const hang = H(sd, q, 72) < (n >= 4 ? 0.5 : 0.3);   // 三成從屋簷往下垂，其他從地面往上爬
        const tall = face === "side" ? Math.min(Ht - 6, Math.round(Ht * (0.45 + H(sd, q, 73) * 0.45))) : Math.min(Ht - 2, Math.round(FH * (0.6 + H(sd, q, 73) * Math.min(1.8, n))));   // 側牆的爬藤長得比較高
        const width = (face === "side" ? 16 : 10) + Math.floor(H(sd, q, 74) * 16), sideX = q === 0 ? b.x0 : q === 1 ? b.x1 - 1 : (H(sd, q, 75) < 0.5 ? b.x0 : b.x1 - 1);
        const put = (u, y) => {
          if (u < 0 || u >= span) return;
          if (face === "front") G.set(b.x0 + u, y, b.z1, VC[H(u >> 2, y >> 2, sd) < 0.5 ? 0 : 1], 0);
          else if (face === "back") G.set(b.x0 + u, y, b.z0 - 1, VC[H(u >> 2, y >> 2, sd) < 0.5 ? 0 : 1], 0);
          else G.set(sideX + (sideX === b.x0 ? -1 : 1), y, b.z0 + u, VC[H(u >> 2, y >> 2, sd) < 0.5 ? 0 : 1], 0);
        };
        // 主莖蜿蜒，旁邊長葉子；越遠離莖越稀
        let u = cx;
        for (let k = 0; k < tall; k++) {
          const y = hang ? Ht - 2 - k : 4 + k;
          if (y < 4) break;
          u += H(sd + q, k >> 2, 76) < 0.33 ? -1 : H(sd + q, k >> 2, 77) < 0.5 ? 1 : 0;
          const prog = k / tall, half = Math.round(width / 2 * (hang ? 1 - prog * 0.6 : 1 - prog * 0.7));
          for (let du = -half; du <= half; du++) {
            const dens = 0.68 - Math.abs(du) / (half + 1) * 0.5;   // 稀疏一點，看得到後面的牆
            if (H((u + du) >> 1, y >> 1, sd + q) < dens) put(u + du, y);
          }
          if (!LITE && H(u, y, sd) < 0.03) put(u + 1, y);
        }
        // 偶爾開花
        if (!LITE && H(sd, q, 78) < 0.35) for (let k = 0; k < 10; k++) {
          const fu = cx + Math.floor((H(sd, k, 79) - 0.5) * width), fy = (hang ? Ht - 2 - Math.floor(H(sd, k, 80) * tall) : 4 + Math.floor(H(sd, k, 80) * tall));
          const fc = [0xF07A9A, 0xF4D35E, 0xFFFFFF, 0xC88EE8][Math.floor(H(sd, q, 81) * 4)];
          if (fu >= 0 && fu < span) { if (face === "front") G.set(b.x0 + fu, fy, b.z1 + 1, fc, 0); else if (face === "back") G.set(b.x0 + fu, fy, b.z0 - 2, fc, 0); }
        }
      }
    }
    if (n >= 2 && r(63) < 0.45) {   // 窗台盆栽：二樓以上每層幾盆垂吊植物
      for (let f = 1; f < Math.min(n, 4); f++) for (let q = 0; q < 2; q++) {
        if (H(sd, f * 3 + q, 64) < 0.4) continue;
        const gx = b.x0 + 6 + Math.floor(H(sd, f * 7 + q, 65) * Math.max(1, b.x1 - b.x0 - 12)), y = f * FH + 6;
        for (let x = gx - 3; x <= gx + 3; x++) { G.set(x, y, b.z1, 0x8A4E30, 0); G.set(x, y + 1, b.z1, 0x5E9E4E, 0); if (H(x, f, 66) < 0.5) for (let d = 1; d < 4; d++) G.set(x, y - d, b.z1, 0x4E8A40, 0); }
      }
    }
    if (flatTop && r(67) < 0.4) {   // 屋頂花園：草皮、灌木、一棵小樹、木棧
      const gx0 = b.x0 + 4, gx1 = b.x1 - 16, gz0 = b.z0 + 4, gz1 = b.z1 - 4, y0 = Ht + 3;
      for (let x = gx0; x < gx1; x++) for (let z = gz0; z < gz1; z++) G.set(x, y0, z, (x + z) % 7 === 0 ? 0x7AB866 : 0x6AA858, 0);
      for (let x = gx0; x < gx1; x++) for (const z of [gz0 - 1, gz1]) G.set(x, y0, z, 0x8A6A4A, 0);
      for (let q = 0; q < 4; q++) { const bx = gx0 + 3 + Math.floor(H(sd, q, 68) * Math.max(1, gx1 - gx0 - 6)), bz = gz0 + 3 + Math.floor(H(sd, q, 69) * Math.max(1, gz1 - gz0 - 6)); for (let x = -2; x <= 2; x++) for (let y = 1; y < 4; y++) for (let z = -2; z <= 2; z++) if (x * x + z * z + (y - 1) * (y - 1) < 7) G.set(bx + x, y0 + y, bz + z, H(x, y, q) < 0.5 ? 0x4E8A40 : 0x5E9E4E, 0); }
      const tx = gx1 - 6, tz = Math.round((gz0 + gz1) / 2);
      for (let y = 1; y < 9; y++) G.set(tx, y0 + y, tz, 0x5A4030, 0);
      for (let x = -4; x <= 4; x++) for (let y = 7; y < 14; y++) for (let z = -4; z <= 4; z++) if (x * x + (y - 10) * (y - 10) + z * z < 18) G.set(tx + x, y0 + y, tz + z, H(x, y, z + 3) < 0.5 ? 0x6AA858 : 0x5E9A4E, 0);
      hi = Math.max(hi, y0 + 14);
    }
    // ── 大樓（6 層以上）：轉角一條跨好幾層的直立大招牌（從街上遠遠就看得到） ──
    if (n >= 6) {
      const sc = signCol(sd + 501), side = r(50) < 0.5 ? b.x0 + 2 : b.x1 - 4, y0 = FH + 6, hh = Math.min(Ht - FH - 10, FH * (3 + Math.floor(r(51) * 3))), L = 9;
      for (let y = y0; y < y0 + hh; y++) for (let k = 0; k < L; k++) for (let dx = 0; dx < 2; dx++) {
        const edge = y === y0 || y === y0 + hh - 1 || k === 0 || k === L - 1;
        const cy = Math.floor((y - y0 - 2) / 9), ly = (y - y0 - 2) % 9, lk = k - 2;
        const gl = !edge && ly > 0 && ly < 7 && lk >= 0 && lk < 5 && H(sd + cy, ly >> 1, lk) < 0.5;
        G.set(side + dx, y, b.z1 + k, edge ? 0x22242A : gl ? sc.fg : sc.bg, edge ? 0 : F_GLOW);
      }
      for (let y = y0; y < y0 + hh; y += 12) G.set(side, y, b.z1 - 1 + 1, 0x3A3A3E, 0);
      lamps.push([(side + 1) * V, (b.z1 + 5) * V, sc.bg]);
    }
    // ── 魔力管線：沿著正面的一條管子（顏色依風格），一段一段的光在裡面流；轉角往下接到地面的接線盒 ──
    if (n >= 2 && r(40) < 0.4) {
      const st = floors[1] || floors[0], col = st === "Y" ? 0x3AE8FF : st === "E" ? 0xB06AFF : st === "C" ? 0xFFB84A : 0x6AFFC8;
      const f = 1 + Math.floor(r(41) * Math.max(1, n - 1)), y = f * FH - 3, z1 = b.z1, side = r(42) < 0.5 ? b.x0 + 1 : b.x1 - 3;
      for (let x = b.x0 + 1; x < b.x1 - 1; x++) for (let dy = 0; dy < 2; dy++) for (let dz = 0; dz < 2; dz++) {
        const collar = (x - b.x0) % 10 === 0;
        G.set(x, y + dy, z1 + 1 + dz, collar ? 0x5A5E66 : col, collar ? 0 : F_FLOW);
      }
      for (let yy = 4; yy < y; yy++) for (let dz = 0; dz < 2; dz++) { const collar = yy % 10 === 0; G.set(side, yy, z1 + 1 + dz, collar ? 0x5A5E66 : col, collar ? 0 : F_FLOW); G.set(side + 1, yy, z1 + 1 + dz, collar ? 0x5A5E66 : col, collar ? 0 : F_FLOW); }
      fill(G, side - 1, 4, z1 + 1, side + 3, 9, z1 + 4, (x, yy) => yy === 8 ? 0x3A3E46 : 0x4A4E56);
      G.set(side, 7, z1 + 4, col, F_GLOW); G.set(side + 1, 6, z1 + 4, col, F_GLOW);
      lamps.push([(side + 1) * V, (z1 + 2) * V, col]);
    }
    // ── 全息投影招牌（外城的樓）：牆前浮著一塊半透明的大圖示，屋頂偶爾投一個大圖示 ──
    if (floors.some(q => q === "Y") && n >= 2 && r(30) < 0.45) {
      const col = [0x3AE8FF, 0xFF4AD8, 0x8A6AFF, 0x4AFFB0][Math.floor(r(31) * 4)], nm = ICON_KEYS[Math.floor(r(32) * ICON_KEYS.length)];
      const sz = 2, W2 = 7 * sz + 4, hx = b.x0 + 4 + Math.floor(r(33) * Math.max(1, b.x1 - b.x0 - W2 - 8)), hy = FH + 4 + Math.floor(r(34) * Math.max(1, Ht - FH - W2 - 6)), hz = b.z1 + 7;
      // 投影機（牆上的小黑盒）和光束
      fill(G, hx + (W2 >> 1) - 2, hy - 4, b.z1, hx + (W2 >> 1) + 2, hy - 1, b.z1 + 3, 0x22242A);
      G.set(hx + (W2 >> 1), hy - 2, b.z1 + 3, col, F_GLOW);
      for (let k = 4; k < 7; k++) G.set(hx + (W2 >> 1), hy - 2 + (k - 3), b.z1 + k, col, F_HOLO);
      for (let x = 0; x < W2; x++) for (let y = 0; y < W2; y++) {
        const edge = x === 0 || y === 0 || x === W2 - 1 || y === W2 - 1, ix = Math.floor((x - 2) / sz), iy = 6 - Math.floor((y - 2) / sz);
        const on = !edge && ix >= 0 && ix < 7 && iy >= 0 && iy < 7 && ICONS[nm][iy][ix] === "#";
        if (edge || on) G.set(hx + x, hy + y, hz, on ? col : mix(col, 0x000000, 0.35), F_HOLO);
      }
      // 支撐臂：從牆面伸出兩根桿子到全息框上緣
      for (const ax of [hx + 1, hx + W2 - 2]) for (let k = 0; k <= 7; k++) G.set(ax, hy + W2, b.z1 + k, 0x4A4E56, 0);
      for (let x = hx; x < hx + W2; x++) G.set(x, hy + W2, hz, 0x4A4E56, 0);
      lamps.push([(hx + W2 / 2) * V, hz * V, col]);
    }
    if (flatTop && r(35) < 0.25) {
      // 屋頂的大全息：底座投影機往上打一個轉動的圖示（看起來是浮在樓頂上）
      const col = [0x3AE8FF, 0xFF4AD8, 0xFFD84A][Math.floor(r(36) * 3)], nm = ICON_KEYS[Math.floor(r(37) * ICON_KEYS.length)], sz = 3;
      const cx2 = Math.round((b.x0 + b.x1) / 2), cz2 = Math.round((b.z0 + b.z1) / 2), y0 = Ht + 3;
      fill(G, cx2 - 3, y0, cz2 - 3, cx2 + 3, y0 + 3, cz2 + 3, 0x2A2C32); for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) G.set(cx2 + dx, y0 + 3, cz2 + dz, col, F_GLOW);
      for (let y = y0 + 4; y < y0 + 10; y++) G.set(cx2, y, cz2, col, F_HOLO);
      for (let i = 0; i < 7; i++) for (let j = 0; j < 7; j++) if (ICONS[nm][j][i] === "#") for (let a2 = 0; a2 < sz; a2++) for (let b2 = 0; b2 < sz; b2++) G.set(cx2 - 10 + i * sz + a2, y0 + 10 + (6 - j) * sz + b2, cz2, col, F_HOLO);
      // 投影框：兩根柱子和上下橫桿把全息圖框住（不會看起來飄在空中）
      for (const px of [cx2 - 12, cx2 + 12]) for (let y = y0; y <= y0 + 32; y++) G.set(px, y, cz2, 0x4A4E56, 0);
      for (let x = cx2 - 12; x <= cx2 + 12; x++) { G.set(x, y0 + 32, cz2, 0x4A4E56, 0); G.set(x, y0 + 8, cz2, x % 3 ? 0x4A4E56 : col, x % 3 ? 0 : F_GLOW); }
      lamps.push([cx2 * V, cz2 * V, col]);
      hi = Math.max(hi, y0 + 33);
    }
    // ── 屋頂 ──
    const cx = Math.round((b.x0 + b.x1) / 2), cz = Math.round((b.z0 + b.z1) / 2);
    const ridge = flatTop ? Ht + 3 : top - 4;
    // 天線＋紅色航空燈
    if (r(8) < (flatTop ? 0.7 : 0.45)) {
      const ax = flatTop ? b.x0 + 4 + Math.floor(r(9) * Math.max(1, b.x1 - b.x0 - 8)) : cx + (r(9) < 0.5 ? -6 : 6), az = flatTop ? b.z0 + 6 : cz;
      const ah = 18 + Math.floor(r(10) * 24);
      for (let y = ridge; y < ridge + ah; y++) G.set(ax, y, az, 0x5A5E66, 0);
      for (let y = ridge + 4; y < ridge + ah - 4; y += 7) { G.set(ax - 1, y, az, 0x5A5E66, 0); G.set(ax + 1, y, az, 0x5A5E66, 0); }
      G.set(ax, ridge + ah, az, 0xFF2A2A, F_BLINK);
      hi = Math.max(hi, ridge + ah + 1);
    }
    if (flatTop) {
      // 水塔
      if (r(11) < 0.45) {
        const tx = b.x1 - 12, tz = b.z0 + 4;
        for (let x = -4; x <= 4; x++) for (let z = -4; z <= 4; z++) if (x * x + z * z <= 17) for (let y = 0; y < 10; y++) G.set(tx + x, Ht + 3 + y, tz + 5 + z, y === 9 ? 0x5A5E66 : (y % 3 === 0 ? 0x6A7078 : 0x8A9098), 0);
        for (const [lx, lz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) for (let y = 0; y < 3; y++) G.set(tx + lx, Ht + y, tz + 5 + lz, 0x3A3E46, 0);
      }
      // 碟形天線
      if (r(12) < 0.3) { const dx = b.x0 + 6, dz = b.z1 - 10; for (let y = 0; y < 4; y++) G.set(dx, Ht + 3 + y, dz, 0x8A8E96, 0); for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) if (i * i + j * j <= 10) G.set(dx + i, Ht + 7 + j + 3, dz + 1 + Math.floor((i * i + j * j) / 6), 0xE8E8EC, 0); }
    }
    // 屋頂看板（三層以上的樓）
    if (n >= 3 && r(13) < (flatTop ? 0.35 : 0.12)) {
      const bw = Math.min(30, b.x1 - b.x0 - 6), bx0 = cx - (bw >> 1), bz = b.z1 - 6, by = flatTop ? Ht + 3 : ridge, bh = 14;
      // 支架一路往下接到屋頂（斜屋頂前面比較低，不接會浮在空中）
      for (const px of [bx0 + 2, bx0 + bw - 3]) { let y = by + 5; while (y > 0 && !G.has(px, y, bz)) { G.set(px, y, bz, 0x3A3E46, 0); y--; } }
      const col = NEONC[Math.floor(r(14) * NEONC.length)], nm = ICON_KEYS[Math.floor(r(15) * ICON_KEYS.length)];
      for (let x = bx0; x < bx0 + bw; x++) for (let y = by + 6; y < by + 6 + bh; y++) {
        const edge = x === bx0 || x === bx0 + bw - 1 || y === by + 6 || y === by + 5 + bh;
        const stripe = !edge && x > bx0 + 11 && (y - by - 6) % 4 === 2 && x < bx0 + bw - 3;
        G.set(x, y, bz, edge ? 0x2A2C32 : stripe ? col : mix(col, 0x101218, 0.78), edge ? 0 : F_GLOW);
      }
      icon(G, nm, "z", bz + 1, bx0 + 3, by + 9, 0xFFFFFF, F_GLOW);
      for (let x = bx0; x < bx0 + bw; x++) for (let y = by + 6; y < by + 6 + bh; y++) G.set(x, y, bz - 1, 0x3A3E46, 0);
      lamps.push([cx * V, (bz + 2) * V, col]);
      hi = Math.max(hi, by + 6 + bh);
    }
    return hi;
  }

  /* ═════════ 配色和樓層：照區域和地點類型 ═════════ */
  const E_WALLS = [0xF4E8D4, 0xBFD8E8, 0xF6CCD6, 0xF2D8B0, 0xE8F0E0, 0xF4D2C0, 0xE0D8F0];
  const E_ROOFS = [0xC8643E, 0x5A6E8A, 0xB85A3A, 0xD8784A, 0x7A5A8A];
  const SHUT = [0x4E8A8A, 0x6A9A7A, 0x3E6A9A, 0x8A4A3A, 0xF4E8D4];
  const AWN = [0xD84A4A, 0x3E6A9A, 0xE07A96, 0x4A8A6A, 0xE8A040];
  const NEON = [0xFF4AC8, 0x4AE8FF, 0xFFD84A, 0x9A6AFF];
  // 區域主風格（各一個池子，隨機抽；越往外越濃）
  const POOL = { central0: "EEEEJ", central1: "JJEEJ", academy0: "EEECE", academy1: "ECECE", oldtown0: "CCJCC", oldtown1: "CJJCC", outer0: "YYYCY", outer1: "YYJYE", outer2: "YYCYY" };
  function palette(seed) {
    const r = k => H(seed, k, 77);
    const pick = (a, k) => a[Math.floor(r(k) * a.length)];
    return { wall: pick(E_WALLS, 1), roof: pick(E_ROOFS, 2), shutter: pick(SHUT, 3), awning: r(4) < 0.6 ? pick(AWN, 5) : null, frame: 0xF8F4EC, door: [0x7A4A2E, 0x3E5A7A, 0x6A8A6A, 0x5A3A6A][Math.floor(r(6) * 4)], trim: 0xE8DCC8,
      neon: pick(NEON, 7), chimney: r(8) < 0.5, noren: [0x2E3E6A, 0x8A2A2A, 0x3A5A3A][Math.floor(r(9) * 3)], wood: [0x4E3424, 0x5A3A26, 0x3E2A1E][Math.floor(r(10) * 3)] };
  }
  function floorsFor(pool, n, seed) {
    const base = pool[Math.floor(H(seed, 1, 5) * pool.length)];
    const fl = [base];
    for (let i = 1; i < n; i++) {
      // 三成機會上層換成另一種風格（加蓋），換了之後上面就跟著新的
      const prev = fl[i - 1];
      fl.push(H(seed, i, 9) < 0.3 ? pool[Math.floor(H(seed, i, 11) * pool.length)] : prev);
    }
    return fl;
  }
  // 指定地點的長相（依角色、店家特色）
  const SPEC = {
    "史威特偵探社": { floors: ["E", "E"], pal: { wall: 0xB4583E, roof: 0x2E4A3A, shutter: 0x2E4A3A, awning: 0x2E4A3A } },
    "Hale’s Oven": { floors: ["E", "E"], pal: { wall: 0xF0E2C4, roof: 0xC0583A, awning: 0xC0583A, chimney: true } },
    "諾文甜點店": { floors: ["E", "E"], pal: { wall: 0xF6CCD6, roof: 0xB85A3A, shutter: 0x6A9A7A, awning: 0xE07A96 } },
    "天使的閣樓": { floors: ["E", "E", "J"] },
    "諾文轉角騎樓": { floors: ["C", "J"] },
    "諾文夜市": { floors: ["C", "J"], pal: { noren: 0x8A2A2A } },
    "神崎家": { floors: ["J", "J"] },
    "佐代的公寓": { floors: ["E", "E", "J"] },
    "星星家": { floors: ["E", "J"], pal: { wall: 0x5A4A6A } },
    "梅魯塔的塔屋": { floors: ["E", "E", "E", "C"], tower: true },
    "諾文聯邦圖書館": { floors: ["E", "E", "E"] },
    "諾文古神話展館": { floors: ["C", "C"] },
    "禮的家": { floors: ["C", "J"] },
    "癇癪的住處": { floors: ["Y", "Y"] },
    "ミニクイ的住處": { floors: ["J", "Y"] },
    "諾文科技維修站": { floors: ["Y", "Y", "Y"] },
    "奧克托拉・研究展示區": { floors: ["Y", "Y", "Y"] }
  };
  const TYPE = {   // 寬（公尺）、層數、正面在地點中心往前幾公尺（跟小鎮的門口位置一致）
    house: [6.4, 2, 1.95], attic: [5.6, 3, 1.85], shop: [7.2, 2, 2.4], tall: [7.2, 4, 2.4], school: [10.4, 3, 2.95], street: [8.0, 2, 1.2], wizard: [4.4, 5, 1.0]
  };
  const UNIT = 1.6;   // 小鎮 1 單位 = 1.6 公尺

  // 這個地點的外觀（室內也照這個配色）：每層的風格＋配色。歐式的牆色跟室內的牆一樣
  function styleOf(l, type, seed) {
    const key = l.region + l.page, pool = POOL[key] || "EEJ", t = TYPE[type] || TYPE.shop, sp = SPEC[l.id] || {};
    const floors = sp.floors || floorsFor(pool, t[1] + (H(seed, 3, 3) < 0.3 ? 1 : 0), seed);
    const pal = palette(seed);
    const it = N.interiors && N.interiors[l.id], th = it && (it.theme || (it.floors && it.floors[0] && it.floors[0].theme));
    if (th && th.wall != null && !(it.dark)) pal.wall = th.wall;
    Object.assign(pal, sp.pal || {});
    return { floors, pal };
  }
  // 一個地點：主建築（門在正中間）＋兩邊補滿的窄樓，整排連在一起
  function lot(T, l, info) {
    const key = l.region + l.page, pool = POOL[key] || "EEJ", seed = info.hash || 1;
    const t = TYPE[info.type] || TYPE.shop;
    const lotW = 112, back = Math.round(-3.4 * UNIT / V), front = Math.round((t[2] - 0.05) * UNIT / V);
    const w = Math.round(t[0] / V), d = front - back;
    const G = new Box(-lotW / 2, lotW / 2, 200, back, front + 16), lamps = [];
    // 主建築
    const x0 = -Math.round(w / 2);
    const { floors: fl, pal: p } = styleOf(l, info.type, seed);
    let top = building(G, { x0, x1: x0 + w, z0: back, z1: front, door: 0 }, fl, p, lamps);
    // 兩側補滿：跟鄰居地點接起來
    const sideW = Math.round((lotW - w) / 2);
    for (const side of [-1, 1]) {
      if (sideW < 16) continue;
      const s2 = seed * 7 + side * 13, bx0 = side < 0 ? -lotW / 2 : x0 + w, fl2 = floorsFor(pool, 2 + Math.floor(H(s2, 1, 4) * 2.5), s2);
      const fb = Math.round(1.95 * UNIT / V) - Math.round(H(s2, 2, 2) * 4);
      LITE = !!info.lite;   // 手機：兩旁的陪襯樓用省略版
      top = Math.max(top, building(G, { x0: bx0, x1: bx0 + sideW, z0: back, z1: Math.min(front, fb) }, fl2, palette(s2), lamps));
      LITE = false;
    }
    return pack(T, G, lamps, top);
  }
  // 沒有地點的空格：兩到三棟窄樓
  function filler(T, info) {
    const pool = POOL[info.key] || "EEJ", seed = info.seed || 1, lotW = 112;
    const back = Math.round(-3.4 * UNIT / V), front0 = Math.round(1.95 * UNIT / V);
    const G = new Box(-lotW / 2, lotW / 2, 200, back, front0 + 16), lamps = [];
    let x = -lotW / 2, k = 0, top = 0;
    while (x < lotW / 2 - 10) {
      const w = Math.min(lotW / 2 - x, 30 + Math.floor(H(seed, k, 3) * 4) * 8), s2 = seed * 31 + k;
      const fl = floorsFor(pool, 2 + Math.floor(H(s2, 1, 4) * 2.5), s2);
      top = Math.max(top, building(G, { x0: x, x1: x + w, z0: back, z1: front0 - Math.round(H(s2, 2, 2) * 4), door: x + Math.round(w / 2) }, fl, palette(s2), lamps));
      x += w; k++;
    }
    return pack(T, G, lamps, top);
  }
  function pack(T, G, lamps, top) {
    const meshes = toMeshes(T, G);
    G.clear();
    // 公尺 → 小鎮單位
    const g = new T.Group(); meshes.forEach(m => g.add(m)); g.scale.setScalar(1 / UNIT);
    return { group: g, lamps: lamps.map(([x, z, c]) => [x / UNIT, z / UNIT, c]), top: top / UNIT };
  }

  /* ── 遠處的街區：40 公分一格的簡化版（霧裡看得到輪廓就好） ── */
  const FAR_WALL = { E: [0xF4E8D4, 0xBFD8E8, 0xF6CCD6, 0xF2D8B0, 0xE8F0E0], C: [0x6E747C, 0x7A7E84, 0x8A3A26], J: [0x4E3424, 0xEEE6D6, 0x5A3A26], Y: [0x5E626C, 0x52565E, 0x6A6E78] };
  const FAR_ROOF = { E: [0xC8643E, 0x5A6E8A, 0xB85A3A, 0xD8784A], C: [0x3E424A], J: [0x4A4C54], Y: [0x3A3E46] };
  function farBlock(T, info) {
    // 一整個街區（14×21 小鎮單位 ≈ 22×34 公尺）：三排房子，每排一棟棟連著
    const S = 0.4, pool = POOL[info.key] || info.pool || "EEJ", seed = info.seed || 1;
    const W = Math.round(14 * UNIT / S), Dd = Math.round(21 * UNIT / S);
    const G = new Box(0, W, 60, 0, Dd);
    const rows = 3, rowD = Math.floor(Dd / rows);
    for (let r = 0; r < rows; r++) {
      let x = 0, k = 0;
      const z0 = r * rowD + 1, z1 = z0 + rowD - 4;
      while (x < W - 2) {
        const w = Math.min(W - x, 8 + Math.floor(H(seed, r * 31 + k, 2) * 10)), s2 = seed * 17 + r * 101 + k;
        const st = pool[Math.floor(H(s2, 1, 3) * pool.length)], fl = 2 + Math.floor(H(s2, 2, 4) * 3), h = fl * 7 + 1;
        const wc = FAR_WALL[st][Math.floor(H(s2, 3, 5) * FAR_WALL[st].length)], rc = FAR_ROOF[st][Math.floor(H(s2, 4, 6) * FAR_ROOF[st].length)];
        for (let y = 0; y < h; y++) for (let xx = x; xx < x + w; xx++) for (let z = z0; z < z1; z++) {
          if (!(xx === x || xx === x + w - 1 || z === z0 || z === z1 - 1 || y === h - 1)) continue;
          const winy = y % 7 >= 3 && y % 7 <= 4 && y > 1, winx = (xx - x) % 3 === 1;
          const isWin = winy && winx && (z === z1 - 1 || z === z0);
          G.set(xx, y, z, isWin ? (st === "Y" ? 0x9AE8F0 : 0xF4D8A0) : wc, isWin ? F_WIN : 0);
        }
        G.inside(x + 1, 0, z0 + 1, x + w - 1, h - 1, z1 - 1);
        if (st === "Y") { /* 平頂，不加燈條 */ }
        else for (let k2 = 0; k2 < (z1 - z0) / 2 + 1; k2++) for (let xx = x; xx < x + w; xx++) { G.set(xx, h + Math.floor(k2 * 0.8), z0 + k2, rc, 0); G.set(xx, h + Math.floor(k2 * 0.8), z1 - 1 - k2, rc, 0); }
        x += w; k++;
      }
    }
    const meshes = toMeshes(T, G, S); G.clear();
    const g = new T.Group(); meshes.forEach(m => { m.castShadow = false; g.add(m); }); g.scale.setScalar(1 / UNIT);
    return { group: g };
  }
  /* ── 中央廣場的鐘塔：比一般房子大很多 ── */
  function clockTower(T) {
    const s = 34, h = 150, G = new Box(-s, s, h + 60, -s, s), lamps = [];
    const x0 = -s / 2, z0 = -s / 2;
    fill(G, x0 - 4, 0, z0 - 4, x0 + s + 4, 8, z0 + s + 4, (x, y, z) => ((x + z) % 5 === 0 || y === 7) ? 0xA89C88 : 0xC8BCA8);
    fill(G, x0, 8, z0, x0 + s, h, z0 + s, (x, y, z) => {
      const edge = (x === x0 || x === x0 + s - 1) && (z === z0 || z === z0 + s - 1);
      if (!(x === x0 || x === x0 + s - 1 || z === z0 || z === z0 + s - 1)) return null;
      if (edge || y % 16 === 0) return 0xD8CCB4;
      const u = (x === x0 || x === x0 + s - 1) ? z - z0 : x - x0;
      if (y % 16 > 5 && y % 16 < 13 && (u === 8 || u === 9 || u === 24 || u === 25) && y < h - 40) return 0x3A4A5A;   // 細長窗
      return 0xE8DCC4;
    });
    G.inside(x0 + 1, 8, z0 + 1, x0 + s - 1, h, z0 + s - 1);
    // 四面鐘
    const cy = h - 22, R = 11;
    for (const side of [0, 1, 2, 3]) for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++) {
      const r = Math.hypot(i, j); if (r > R + 0.4) continue;
      const hand = (i === 0 && j >= 0 && j < 9) || (j === 0 && i >= 0 && i < 6), tick = r > R - 2.2 && r <= R - 1 && (Math.abs(i) < 1 || Math.abs(j) < 1);
      const c = r > R - 1 ? 0xC8A040 : hand || tick ? 0x2A2420 : 0xFFF4D8, f = r > R - 1 || hand || tick ? 0 : F_GLOW;
      const [x, z] = side === 0 ? [i, z0 + s] : side === 1 ? [i, z0 - 1] : side === 2 ? [x0 - 1, i] : [x0 + s, i];
      G.set(x, cy + j, z, c, f);
    }
    // 尖頂＋頂端的燈
    for (let k = 0; k < 18; k++) fill(G, x0 - 2 + k, h + k * 2, z0 - 2 + k, x0 + s + 2 - k, h + k * 2 + 2, z0 + s + 2 - k, (x, y, z) => ((x + z + y) % 4 === 0) ? 0x2E5A5A : 0x3E6A6A);
    fill(G, -1, h + 36, -1, 1, h + 44, 1, 0xC8A040);
    G.set(0, h + 44, 0, 0xFFE8A0, F_GLOW);
    lamps.push([0, (z0 + s + 2) * V, 0xFFD8A0]);
    return pack(T, G, lamps, (h + 44) * V);
  }

  /* ── 城外的假山：一圈環形的山（2.4 公尺一格），越往外越高，山頂有一點雪 ── */
  function mountains(T, r0, r1, coarse, isSea) {
    const S = coarse ? 4.8 : 2.4, R0 = r0 * UNIT / S, R1 = r1 * UNIT / S, n = Math.ceil(R1);
    const G = new Box(-n, n, 70, -n, n), K = S / UNIT, OX = 7, OZ = 10.5;   // 體素→世界座標（山的中心擺在城中心）
    const hAt = (x, z) => {
      const r = Math.hypot(x, z); if (r < R0 || r > R1) return 0;
      const sea = isSea ? isSea(OX + x * K, OZ + z * K) : 0; if (sea === 1 || sea === true) return 0;   // 海上不長山；靠海的地方矮一點（回傳 0～1 的比例）
      const a = Math.atan2(z, x), k = (r - R0) / (R1 - R0);
      const ridge = 0.55 + 0.25 * Math.sin(a * 5 + 1.3) + 0.15 * Math.sin(a * 13 + 0.4) + 0.08 * Math.sin(a * 29);
      const rise = Math.sin(Math.min(1, k * 1.25) * Math.PI / 2);
      return Math.max(1, Math.round(((6 + 52 * ridge) * rise * (sea > 0 && sea < 1 ? sea : 1) + H(x >> 1, z >> 1, 3) * 2) * 2.4 / S));
    };
    const col = (y0, h) => { const y = y0 * S / 2.4; return y > 44 ? 0xF4F4F0 : y > 34 ? (H(y, h, 1) < 0.5 ? 0x8A8A84 : 0x9A9890) : y > 20 ? (H(y, h, 2) < 0.5 ? 0x5E7A4A : 0x6A8650) : (H(y, h, 3) < 0.5 ? 0x6E9A54 : 0x7AA65E); };
    for (let x = -n; x <= n; x++) for (let z = -n; z <= n; z++) {
      const h = hAt(x, z); if (!h) continue;
      // 只放看得到的那幾格（頂端往下到鄰居最矮的地方）
      const lo = Math.max(0, Math.min(hAt(x + 1, z), hAt(x - 1, z), hAt(x, z + 1), hAt(x, z - 1), h) - 1);
      for (let y = lo; y < h; y++) G.set(x, y, z, col(y, h), 0);
    }
    const meshes = toMeshes(T, G, S); G.clear();
    const g = new T.Group();
    meshes.forEach(m => {
      m.castShadow = false; m.receiveShadow = false;
      // 山只吃一半的霧，遠遠還看得到稜線
      if (m.material && !m.material._mt) {
        const mt = m.material.clone(); mt._mt = true;
        mt.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace("#include <fog_fragment>", "#ifdef USE_FOG\n float fogDepth2 = fogDepth;\n float ff = smoothstep( fogNear, fogFar, fogDepth2 ) * 0.62;\n gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, ff );\n#endif"); };
        m.material = mt;
      }
      g.add(m);
    }); g.scale.setScalar(1 / UNIT);
    return { group: g };
  }
  /* ═════════ 浮空島嶼：城外天上漂著的岩島（草頂、幾棵樹、廢墟柱子、底下垂著發光水晶） ═════════ */
  function island(T, seed) {
    const S = 0.6, r = k => H(seed, k, 131);
    const R = 7 + Math.floor(r(1) * 9), depth = Math.round(R * (1.3 + r(2) * 0.8));
    const G = new Box(-R - 3, R + 3, depth + 40, -R - 3, R + 3);
    const rad = (x, z) => Math.hypot(x, z) / (R * (0.85 + 0.15 * Math.sin(Math.atan2(z, x) * 3 + seed)));
    for (let x = -R - 2; x <= R + 2; x++) for (let z = -R - 2; z <= R + 2; z++) {
      const k = rad(x, z); if (k > 1) continue;
      const bot = Math.round(depth * Math.pow(1 - k, 0.7) * (0.8 + 0.2 * H(x >> 1, z >> 1, seed)));
      for (let y = depth - bot; y <= depth; y++) {
        const top = y === depth, c = top ? (H(x, z, 7) < 0.7 ? 0x6AA858 : 0x5E9A4E) : y > depth - 2 ? 0x7A5A3A : (H(x >> 1, y >> 1, z >> 1) < 0.5 ? 0x6E6A62 : 0x7E7A70);
        G.set(x, y, z, c, 0);
      }
    }
    const T0 = depth + 1;
    // 樹
    for (let t = 0; t < 2 + Math.floor(r(3) * 4); t++) {
      const a = r(10 + t) * 6.28, d = r(20 + t) * R * 0.6, tx = Math.round(Math.cos(a) * d), tz = Math.round(Math.sin(a) * d), th = 4 + Math.floor(r(30 + t) * 4);
      for (let y = 0; y < th; y++) G.set(tx, T0 + y, tz, 0x5A4030, 0);
      for (let x = -2; x <= 2; x++) for (let y = -1; y <= 2; y++) for (let z = -2; z <= 2; z++) if (x * x + y * y + z * z <= 6) G.set(tx + x, T0 + th + y, tz + z, H(x, y, z + t) < 0.5 ? 0x4E8A40 : 0x5E9A4E, 0);
    }
    // 廢墟柱子（古代遺跡）
    if (r(4) < 0.6) for (let q = 0; q < 3; q++) { const a = q * 2.1 + r(5), px = Math.round(Math.cos(a) * R * 0.45), pz = Math.round(Math.sin(a) * R * 0.45), ph = 3 + Math.floor(r(40 + q) * 6); for (let y = 0; y < ph; y++) G.set(px, T0 + y, pz, 0xD8D0C0, 0); }
    // 底下垂著的發光水晶
    const col = [0x8AB0FF, 0xB06AFF, 0x3AE8FF, 0xFFB84A][Math.floor(r(6) * 4)];
    for (let q = 0; q < 4; q++) { const a = q * 1.7 + r(7), d = r(50 + q) * R * 0.4, cx = Math.round(Math.cos(a) * d), cz = Math.round(Math.sin(a) * d), L = 2 + Math.floor(r(60 + q) * 4); for (let y = 0; y < L; y++) G.set(cx, depth - Math.round(depth * 0.75) - y, cz, col, F_GLOW); }
    // 小瀑布：從邊緣往下垂的一條水
    if (r(8) < 0.5) { const a = r(9) * 6.28, wx = Math.round(Math.cos(a) * R * 0.9), wz = Math.round(Math.sin(a) * R * 0.9); for (let y = depth - 18; y <= depth; y++) G.set(wx, y, wz, 0x8AC8E8, F_GLOW); }
    const ms = toMeshes(T, G, S); G.clear();
    const g = new T.Group();
    ms.forEach(m => {
      m.castShadow = false; m.receiveShadow = false;
      const mt = m.material.clone();
      mt.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace("#include <fog_fragment>", "#ifdef USE_FOG\n gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, 0.35 );\n#endif"); };
      m.material = mt; g.add(m);
    });
    g.scale.setScalar(1 / UNIT);
    return { group: g, h: depth * S / UNIT };
  }
  let NF = 0;
  function setNight(nf) {
    NF = nf;
    if (!MATS) return;
    MATS.win.color.setScalar(0.55 + nf * 0.45);
    MATS.glow.color.setScalar(0.8 + nf * 0.2);
  }
  // 每幀：航空燈一閃一閃（白天也閃，但暗一點）
  function tick(t) {
    if (!MATS) return;
    MATS.uTime.value = t;
    const on = (t % 1.8) < 0.55;
    MATS.blink.color.setScalar(on ? 0.75 + NF * 0.45 : 0.18);
  }
  /* ═════════ 裝飾街區：跟主建築同一套蓋法 ═════════
   * 先蓋「樣板房子」（每種區域風格、寬度各幾款），存起來重複使用；
   * 每個街區四面都朝外臨街，中間圍出中庭。遠處的街區用省略版（LITE）樣板。 */
  const TPL = new Map(), BD = 80;
  const strHash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  function template(T, pool, w, v, lite) {
    const key = pool + "|" + w + "|" + v + "|" + (lite ? 1 : 0);
    let t = TPL.get(key);
    if (t) return t;
    const s = (strHash(pool) % 9973) * 31 + w * 7 + v * 1013;
    // 高度依層數分：矮樓 2～3 層、中樓 4～6 層、大樓 8～14 層（下面一兩層是當地風格，上面是加蓋的賽博高樓）
    const hk = H(s, 9, 41);
    let fl;
    if (hk < 0.08 && w >= 64) { const n = 7 + Math.floor(H(s, 10, 41) * 4), base = floorsFor(pool, 1 + (H(s, 11, 41) < 0.5 ? 1 : 0), s); fl = base.concat(Array(n - base.length).fill(pool.includes("Y") || H(s, 12, 41) < 0.6 ? "Y" : base[0])); }
    else if (hk < 0.3) fl = floorsFor(pool, 4 + Math.floor(H(s, 13, 41) * 2), s);
    else fl = floorsFor(pool, 2 + Math.floor(H(s, 1, 4) * 2.2), s);
    const G = new Box(-w / 2 - 4, w / 2 + 4, fl.length * FH + 140, -BD - 10, 18), lamps = [];
    LITE = !!lite;
    const top = building(G, { x0: -w / 2, x1: w / 2, z0: -BD, z1: 0, pad: 0, door: H(s, 5, 5) < 0.5 ? 0 : null }, fl, palette(s), lamps);
    LITE = false;
    const gs = meshBox(T, G); G.clear();
    t = { parts: gs.map(g => g && { p: g.attributes.position.array, n: g.attributes.normal.array, c: g.attributes.color.array, i: g.index.array }), lamps, top };
    gs.forEach(g => g && g.dispose());
    TPL.set(key, t);
    return t;
  }
  // 把一段長度（格）切成幾棟的寬度
  const WIDTHS = [48, 64, 80, 96];
  function split(len, seed) {
    const out = []; let left = len, k = 0;
    while (left > 0) {
      const ok = WIDTHS.filter(w => w <= left && (left - w === 0 || left - w >= 48));
      const w = ok.length ? ok[Math.floor(H(seed, k++, 21) * ok.length)] : left;
      out.push(w); left -= w;
    }
    return out;
  }
  // 合併成一組網格（每種材質一個），rot：0 正面朝 +z、1 朝 +x、2 朝 −z、3 朝 −x
  function merger() {
    const acc = [[], [], [], [], [], [], []];
    return {
      add(t, rot, ox, oz) { t.parts.forEach((pt, g) => pt && acc[g].push({ pt, rot, ox, oz })); },
      meshes(T) {
        const M = mats(T), names = ["solid", "win", "glow", "blink", "tick", "holo", "flow"], out = [];
        acc.forEach((list, g) => {
          if (!list.length) return;
          let nv = 0, ni = 0; for (const a of list) { nv += a.pt.p.length; ni += a.pt.i.length; }
          const P = new Float32Array(nv), Nn = new Int8Array(nv), Cc = new Uint8Array(nv), I = new Uint32Array(ni);   // 法線、顏色用 8 位元，省一半記憶體
          let vo = 0, io = 0;
          for (const { pt, rot, ox, oz } of list) {
            const base = vo / 3, cs = [1, 0, -1, 0][rot], sn = [0, 1, 0, -1][rot];
            for (let k = 0; k < pt.p.length; k += 3) {
              const x = pt.p[k], z = pt.p[k + 2], nx = pt.n[k], nz = pt.n[k + 2];
              // y 軸旋轉：(x, z) → (x·cos + z·sin, −x·sin + z·cos)
              P[vo + k] = x * cs + z * sn + ox; P[vo + k + 1] = pt.p[k + 1]; P[vo + k + 2] = -x * sn + z * cs + oz;
              Nn[vo + k] = Math.round((nx * cs + nz * sn) * 127); Nn[vo + k + 1] = Math.round(pt.n[k + 1] * 127); Nn[vo + k + 2] = Math.round((-nx * sn + nz * cs) * 127);
              Cc[vo + k] = Math.round(pt.c[k] * 255); Cc[vo + k + 1] = Math.round(pt.c[k + 1] * 255); Cc[vo + k + 2] = Math.round(pt.c[k + 2] * 255);
            }
            for (let k = 0; k < pt.i.length; k++) I[io + k] = pt.i[k] + base;
            vo += pt.p.length; io += pt.i.length;
          }
          const geo = new T.BufferGeometry();
          geo.setAttribute("position", new T.BufferAttribute(P, 3));
          geo.setAttribute("normal", new T.BufferAttribute(Nn, 3, true));
          geo.setAttribute("color", new T.BufferAttribute(Cc, 3, true));
          geo.setIndex(new T.BufferAttribute(I, 1));
          geo.computeBoundingSphere();
          const m = new T.Mesh(geo, M[names[g]]); m.castShadow = g === 0; m.receiveShadow = g === 0; m.userData.noVox = true; m.userData.city = names[g];
          out.push(m);
        });
        return out;
      }
    };
  }
  const rotXZ = (x, z, rot) => { const cs = [1, 0, -1, 0][rot], sn = [0, 1, 0, -1][rot]; return [x * cs + z * sn, -x * sn + z * cs]; };
  // 一整個裝飾街區：info = { key, seed, lite }，回傳的 group 原點在街區左上角（小鎮單位）
  function block(T, info) {
    const pool = POOL[info.key] || "EEJ", seed = info.seed || 1, lite = !!info.lite;
    const Wv = Math.round(14 * UNIT / V), Dv = Math.round(21 * UNIT / V), NV = lite ? 3 : 4;
    const mg = merger(), lamps = [];
    const rows = [
      { len: Wv, at: (c) => [c, Dv], rot: 0 },                 // 南：朝 +z
      { len: Wv, at: (c) => [Wv - c, 0], rot: 2 },             // 北：朝 −z
      { len: Dv - 2 * BD, at: (c) => [Wv, BD + c], rot: 1 },   // 東：朝 +x
      { len: Dv - 2 * BD, at: (c) => [0, Dv - BD - c], rot: 3 } // 西：朝 −x
    ];
    // 中庭巷口：東或西那排中間空一段（3.2 公尺），從人行道走得進中庭
    const alley = lite ? null : info.alley, AL = alley ? [72, 104] : null;
    rows.forEach((r, ri) => {
      const open = (alley === "e" && ri === 2) || (alley === "w" && ri === 3);
      const segs = open ? [[0, AL[0]], [AL[1], r.len]] : [[0, r.len]];
      for (const [s0, s1] of segs) {
        let o = s0;
        split(s1 - s0, seed * 13 + ri + s0).forEach((w, k) => {
          const t = template(T, pool, w, Math.floor(H(seed, ri * 17 + k + s0, 23) * NV), lite);
          const [ox, oz] = r.at(o + w / 2);
          mg.add(t, r.rot, ox * V, oz * V);
          if (!lite) for (const [lx, lz, c] of t.lamps) { const [a, b] = rotXZ(lx, lz, r.rot); lamps.push([a + ox * V, b + oz * V, c]); }
          o += w;
        });
      }
    });
    const g = new T.Group(); mg.meshes(T).forEach(m => { if (lite) m.castShadow = false; g.add(m); });
    if (!lite || info.yard) courtyard(T, g, Wv * V, Dv * V, seed);
    if (alley) alleyGate(T, g, alley, Wv, pool, seed, lamps);
    g.scale.setScalar(1 / UNIT);
    return { group: g, lamps: lamps.map(([x, z, c]) => [x / UNIT, z / UNIT, c]) };
  }
  // 中庭：石板地、一棵樹、水井和幾個木箱（之後可以擺市集）
  function courtyard(T, g, W, D, seed) {
    // 中庭：草地、十字石板小路、兩三棵樹、花圃、灌木、長椅（房子背面圍起來的綠地）
    const x0 = BD * V, z0 = BD * V, cw = W - 2 * BD * V, cd = D - 2 * BD * V;
    const G = new Box(0, Math.round(cw / V), 60, 0, Math.round(cd / V)), nx = Math.round(cw / V), nz = Math.round(cd / V);
    const px = nx >> 1, pz = nz >> 1;
    for (let x = 0; x < nx; x++) for (let z = 0; z < nz; z++) {
      const path = Math.abs(x - px) < 4 || Math.abs(z - pz) < 4;
      const c = path ? (((x >> 2) + (z >> 2)) % 2 ? 0xB8AC98 : 0xC4B8A2) : (H(x >> 1, z >> 1, seed) < 0.5 ? 0x6AA858 : (H(x, z, 3) < 0.15 ? 0x7AB866 : 0x5E9E4E));
      G.set(x, 0, z, c, 0);
      if (!path && H(x, z, seed + 5) < 0.06) G.set(x, 1, z, 0x5A9A48, 0);   // 一點點草叢
    }
    const tree = (tx, tz, hgt, leaf) => {
      for (let y = 1; y < hgt; y++) for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) G.set(tx + a, y, tz + b, 0x5A4030, 0);
      for (let x = -8; x <= 9; x++) for (let y = hgt - 4; y < hgt + 12; y++) for (let z = -8; z <= 9; z++) {
        const d = ((x - 0.5) / 8.5) ** 2 + ((y - hgt - 4) / 7.5) ** 2 + ((z - 0.5) / 8.5) ** 2;
        if (d < 1 && H(x + tx, y, z + tz) < 0.9) G.set(tx + x, y, tz + z, leaf[Math.floor(H(x >> 2, y >> 2, z >> 2) * leaf.length)], 0);
      }
    };
    const LEAF = [[0x5E9A4E, 0x6AA858, 0x4E8A40], [0x7AB05E, 0x8CBA62, 0x6AA050], [0xE89AB0, 0xF2B8C8, 0xD8829C]];   // 綠、淺綠、櫻花
    const qx = [px >> 1, px + (px >> 1)], qz = [pz >> 1, pz + (pz >> 1)];
    let k = 0;
    for (const a of qx) for (const b of qz) {
      const h = H(seed, k++, 33);
      if (h < 0.55) tree(a - 1, b - 1, 18 + Math.floor(h * 10), LEAF[Math.floor(H(seed, k, 34) * (h < 0.12 ? 3 : 2))]);
      else if (h < 0.8) {   // 花圃
        for (let x = -6; x <= 6; x++) for (let z = -6; z <= 6; z++) {
          const edge = Math.max(Math.abs(x), Math.abs(z)) === 6;
          G.set(a + x, 1, b + z, edge ? 0x9A8C78 : 0x6A4A30, 0);
          if (!edge && (x + z) % 2 === 0) G.set(a + x, 2, b + z, [0xF07A9A, 0xF4D35E, 0xFFFFFF, 0xC88EE8, 0xF4A040][Math.floor(H(x, z, seed + k) * 5)], 0);
          else if (!edge) G.set(a + x, 2, b + z, 0x4E8A44, 0);
        }
      } else {   // 灌木＋長椅
        for (let x = -4; x <= 4; x++) for (let y = 1; y < 6; y++) for (let z = -3; z <= 3; z++) if ((x / 4.5) ** 2 + ((y - 2) / 3.5) ** 2 + (z / 3.5) ** 2 < 1) G.set(a + x, y, b + z, H(x, y, z) < 0.5 ? 0x4E8A40 : 0x5E9A4E, 0);
        for (let x = -6; x <= 6; x++) { G.set(a + x, 4, b + 6, 0x8A6A4A, 0); G.set(a + x, 4, b + 7, 0x8A6A4A, 0); G.set(a + x, 6, b + 8, 0x7A5A3A, 0); }
        for (const x of [-5, 5]) for (let y = 1; y < 4; y++) G.set(a + x, y, b + 6, 0x3B3F4A, 0);
      }
    }
    // 中間：小噴水池或水井
    for (let x = -5; x <= 5; x++) for (let z = -5; z <= 5; z++) { const d = Math.hypot(x, z); if (d <= 5.2 && d > 3.6) for (let y = 1; y < 4; y++) G.set(px + x, y, pz + z, y === 3 ? 0x8A8278 : 0x9A9288, 0); else if (d <= 3.6) G.set(px + x, 2, pz + z, 0x4E8AAA, 0); }
    for (let y = 2; y < 7; y++) G.set(px, y, pz, 0xB8B0A2, 0); G.set(px, 7, pz, 0x8AD8F0, F_GLOW);
    const ms = toMeshes(T, G); G.clear();
    ms.forEach(m => { m.position.set(x0, 0.12, z0); g.add(m); });   // 墊高一點，不然會被街區的地坪蓋住
  }

  /* 巷口：石板路從人行道通到中庭，街邊一座門樓（舊城是紅柱瓦簷、其他是磚拱），頂上掛燈籠和小招牌，巷子裡拉一串燈 */
  function alleyGate(T, g, side, Wv, pool, seed, lamps) {
    const z0 = BD + 72, z1 = BD + 104, xa = side === "w" ? 0 : Wv - BD, xb = xa + BD;
    const G = new Box(xa - 6, xb + 6, 60, z0 - 4, z1 + 4), out = side === "w" ? -1 : 1;
    const st = pool[Math.floor(H(seed, 1, 151) * pool.length)];
    for (let x = xa; x < xb; x++) for (let z = z0; z < z1; z++) {
      const c = ((x >> 2) + (z >> 2)) % 2 ? 0xB8AC98 : 0xA89C88;
      fill(G, x, 0, z, x + 1, 4, z + 1, (a, y) => y === 3 ? (H(x >> 1, z >> 1, 7) < 0.1 ? 0x8A9A6A : c) : 0x8A8070);
    }
    // 門樓：在街那一端
    const gx = side === "w" ? xa : xb - 4;
    const red = st === "C", jp = st === "J", cyb = st === "Y";
    const pil = red ? 0xA82A1E : jp ? 0x5A3A26 : cyb ? 0x3A3E46 : 0x9A6A50, top = red ? 0x3A3E46 : jp ? 0x2E2A26 : cyb ? 0x2A2C32 : 0x7A5040;
    for (const zz of [z0, z1 - 3]) fill(G, gx, 4, zz, gx + 4, 38, zz + 3, (x, y) => y < 7 ? 0x6A6258 : pil);
    fill(G, gx - (red || jp ? 2 : 0), 38, z0 - (red || jp ? 3 : 0), gx + 4 + (red || jp ? 2 : 0), 41, z1 + (red || jp ? 3 : 0), (x, y, z) => y === 40 && (z === z0 - 3 || z === z1 + 2) ? mix(top, 0xFFFFFF, 0.1) : top);
    if (red || jp) fill(G, gx - 1, 41, z0 - 2, gx + 5, 43, z1 + 2, top);
    if (!red && !jp) for (let z = z0 + 3; z < z1 - 3; z++) { const k = Math.min(z - z0 - 3, z1 - 4 - z); if (k < 4) fill(G, gx, 34 + k, z, gx + 4, 38, z + 1, pil); }
    // 招牌：掛在門樓正中，朝街
    const sc = signCol(seed * 3 + 5), sx = side === "w" ? gx - 1 : gx + 4, zc = (z0 + z1) >> 1;
    for (let z = zc - 6; z < zc + 6; z++) for (let y = 30; y < 37; y++) {
      const e = z === zc - 6 || z === zc + 5 || y === 30 || y === 36, gl = !e && (y === 33 || (y === 32 || y === 34) && (z - zc + 6) % 3 !== 0);
      G.set(sx, y, z, e ? 0x22242A : gl ? sc.fg : sc.bg, e ? 0 : F_GLOW);
    }
    lamps.push([sx * V, zc * V, sc.bg]);
    // 兩盞燈籠掛在柱子外側
    for (const zz of [z0 - 2, z1 + 1]) {
      if (red || jp) lantern(G, side === "w" ? gx - 2 : gx + 5, 30, zz, red ? 0xE8382A : 0xF4E4C0, lamps);
      else { G.set(side === "w" ? gx - 1 : gx + 4, 28, zz, 0x2E3238, 0); G.set(side === "w" ? gx - 1 : gx + 4, 27, zz, 0xFFD890, F_GLOW); }
    }
    // 巷子裡的一串燈泡（之字形）
    for (let x = xa + 6; x < xb - 4; x++) {
      const z = z0 + 4 + Math.round((Math.sin((x - xa) / 7) * 0.5 + 0.5) * (z1 - z0 - 8)), y = 34 - (((x - xa) % 14) > 7 ? 1 : 0);
      G.set(x, y, z, 0x2A2A2A, 0);
      if ((x - xa) % 5 === 0) G.set(x, y - 1, z, [0xFFE08A, 0xFF9A6A, 0x9AD8FF, 0xF4A0D0][((x - xa) / 5) % 4], F_GLOW);
    }
    lamps.push([((xa + xb) >> 1) * V, zc * V, 0xFFC878]);
    // 巷子兩旁：一點盆栽、腳踏車或木箱
    for (const zz of [z0 + 1, z1 - 5]) if (H(seed, zz, 152) < 0.6) { const x = xa + 20 + Math.floor(H(seed, zz, 153) * 30); fill(G, x, 4, zz, x + 4, 8, zz + 4, 0xA8845A); fill(G, x + 1, 8, zz, x + 4, 11, zz + 3, 0x987450); }
    const ms = toMeshes(T, G); G.clear();
    ms.forEach(m => g.add(m));
  }

  /* ═════════ 夜市：沿著街道兩側擺攤，頭上拉燈籠 ═════════
   * 街道沿 x 方向（0 → len 公尺），兩排攤子面對面，中間 width 公尺寬留給人走。 */
  function stall(G, x0, z0, face, i, lamps) {
    // face：+1 客人在 +z 那邊，−1 客人在 −z 那邊；一攤寬 24 格、深 16 格
    const AW = [0xD8402A, 0xF4A040, 0x2A9A9A, 0xE07A96, 0x3E6A9A, 0x5A9A4A], kind = Math.floor(H(i, 3, 41) * 4);
    const zc = face > 0 ? z0 + 15 : z0, zb = face > 0 ? z0 : z0 + 15, col = AW[Math.floor(H(i, 1, 41) * AW.length)];
    const Z = k => face > 0 ? z0 + k : z0 + 15 - k;   // k = 0 後面 → 15 前面
    // 櫃台
    for (let x = x0 + 1; x < x0 + 23; x++) for (let y = 1; y < 9; y++) G.set(x, y, Z(13), y === 8 ? 0xC8A878 : ((x >> 1) % 2 ? 0x9C7A55 : 0x8A6A4A), 0);
    for (let x = x0 + 1; x < x0 + 23; x++) for (let k = 9; k < 15; k++) G.set(x, 8, Z(k), 0xC8A878, 0);
    // 後面的架子
    for (let x = x0 + 2; x < x0 + 22; x++) for (let y = 1; y < 14; y++) G.set(x, y, Z(1), y % 5 === 0 ? 0x6A4E36 : 0x8A6A4A, 0);
    // 柱子
    for (const x of [x0, x0 + 23]) for (const k of [0, 15]) for (let y = 1; y < 24; y++) G.set(x, y, Z(k), 0x5A4030, 0);
    // 斜屋頂雨棚（條紋）
    for (let x = x0 - 1; x < x0 + 25; x++) for (let k = -1; k < 18; k++) { const y = 24 + Math.floor((17 - k) * 0.22); G.set(x, y, Z(k), ((x - x0) >> 2) % 2 ? col : 0xF4EEE2, 0); }
    // 招牌
    for (let x = x0 + 4; x < x0 + 20; x++) for (let y = 19; y < 23; y++) G.set(x, y, Z(16), y === 19 || y === 22 ? 0x2A1A14 : (kind === 3 ? 0x22242A : 0xF4E4C0), kind === 3 && y > 19 && y < 22 ? F_GLOW : 0);
    // 賣的東西
    if (kind === 0) {   // 湯鍋（拉麵、關東煮）
      for (const cx of [x0 + 6, x0 + 16]) for (let dx = -3; dx <= 3; dx++) for (let dk = -2; dk <= 2; dk++) if (dx * dx + dk * dk * 2 <= 10) for (let y = 9; y < 13; y++) G.set(cx + dx, y, Z(11 + dk), y === 12 && dx * dx + dk * dk * 2 < 6 ? 0xE8C890 : 0xA8ACB0, 0);
    } else if (kind === 1) {   // 串燒、炸物
      for (let x = x0 + 3; x < x0 + 21; x++) { G.set(x, 9, Z(11), 0x2A2A2A, 0); if (x % 2) for (let y = 10; y < 13; y++) G.set(x, y, Z(11), [0xB8683A, 0xD8984A, 0x8A4A2A][x % 3], 0); }
    } else if (kind === 2) {   // 水果、糖葫蘆
      for (let x = x0 + 3; x < x0 + 21; x += 2) for (let k = 10; k < 14; k += 2) G.set(x, 9, Z(k), [0xE8403A, 0xF4A040, 0x7AB040, 0xE85A8A][Math.floor(H(x, k, 43) * 4)], 0);
    } else {   // 小飾品、扭蛋（霓虹）
      for (let x = x0 + 3; x < x0 + 21; x += 3) for (let y = 9; y < 12; y++) G.set(x, y, Z(11), [0x9A6AFF, 0x4AE8FF, 0xFF4AC8][x % 3], y === 11 ? F_GLOW : 0);
    }
    // 紅燈籠（中、日、賽博各有一點）
    for (const x of [x0 + 2, x0 + 21]) {
      G.set(x, 23, Z(17), 0x3A2A20, 0);
      for (let y = 19; y < 23; y++) for (let dx = -1; dx <= 1; dx++) for (let dk = -1; dk <= 1; dk++) if (Math.abs(dx) + Math.abs(dk) < 2 || y === 20 || y === 21) G.set(x + dx, y, Z(17 + dk), kind === 3 ? 0xFF4AC8 : 0xE8382A, F_GLOW);
    }
    lamps.push([(x0 + 12) * V, Z(17) * V, kind === 3 ? 0xFF4AC8 : 0xFF6A3A]);
    // 前面的小板凳
    if (kind < 2) for (const x of [x0 + 5, x0 + 12, x0 + 19]) for (let y = 1; y < 5; y++) for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) G.set(x + a, y, Z(19 + b), y === 4 ? 0xD84A3A : 0x5A5E64, 0);
  }
  function marketStreet(T, info) {
    const L = Math.round(info.len / V), Wd = Math.round(info.width / V), seed = info.seed || 1;
    const G = new Box(-4, L + 4, 80, -Wd / 2 - 4, Wd / 2 + 4), lamps = [];
    let i = 0;
    for (const side of [-1, 1]) {
      // 兩排：靠路邊，客人在中間那側
      const z0 = side < 0 ? -Wd / 2 : Wd / 2 - 16;
      for (let x = 2; x + 24 <= L - 2; x += 28) {
        if (H(x, side, 47) < 0.12) { i++; continue; }   // 偶爾空一格，比較像真的夜市
        stall(G, x, z0, -side, seed * 7 + i++, lamps);
      }
    }
    // 橫過街道的燈籠串（高 4.2 公尺，留給人走）
    for (let x = 28; x < L - 8; x += 56) {
      for (const s of [-1, 1]) for (let y = 1; y < 46; y++) G.set(x, y, s * (Wd / 2 - 1), 0x3A3A3E, 0);
      for (let z = -Wd / 2 + 1; z < Wd / 2 - 1; z++) {
        const sag = Math.round(4 * (1 - (2 * z / Wd) ** 2)), y = 45 - sag;
        G.set(x, y, z, 0x2A2A2A, 0);
        if ((z + 200) % 6 === 0) for (let dy = 1; dy <= 3; dy++) for (const dx of [-1, 0, 1]) G.set(x + dx, y - dy, z, (z >> 2) % 3 === 0 ? 0xF4E4C0 : 0xE8382A, F_GLOW);
      }
      lamps.push([x * V, 0, 0xFF7A40]);
    }
    const ms = toMeshes(T, G); G.clear();
    const g = new T.Group(); ms.forEach(m => g.add(m)); g.scale.setScalar(1 / UNIT);
    return { group: g, lamps: lamps.map(([x, z, c]) => [x / UNIT, z / UNIT, c]) };
  }

  /* ═════════ 地下湖入口：河岸邊的石砌洞口，台階往下走進暗處 ═════════ */
  function lakeGate(T) {
    const G = new Box(-56, 56, 90, -56, 56), lamps = [];
    const rock = (x, y, z) => { const h = H(x >> 1, y >> 1, z >> 1); return h < 0.25 ? 0x6E6A62 : h < 0.55 ? 0x7E7A70 : h < 0.85 ? 0x8C887E : 0x5E7A4A; };
    // 地面：石板
    for (let x = -54; x < 54; x++) for (let z = -54; z < 54; z++) G.set(x, 0, z, ((x >> 3) + (z >> 3)) % 2 ? 0xA89C88 : 0xB4A894, 0);
    // 岩丘（像從地底拱起來的小山，上面長青苔和草）
    for (let x = -44; x <= 44; x++) for (let z = -50; z <= 14; z++) {
      const r = ((x / 44) ** 2 + ((z + 18) / 34) ** 2), h = Math.round(38 * Math.sqrt(Math.max(0, 1 - r)) * (0.85 + 0.15 * H(x >> 3, 0, z >> 3)));
      for (let y = 1; y <= h; y++) G.set(x, y, z, y === h && h > 6 && H(x >> 2, 7, z >> 2) < 0.45 ? (H(x, z, 2) < 0.7 ? 0x6A9A4E : 0x5A8A42) : rock(x, y, z), 0);
    }
    // 入口：拱門 2.4 公尺寬、2.4 公尺高，裡面是往下的台階（越往裡越暗）
    const aw = 12, ah = 24;
    for (let x = -aw; x <= aw; x++) for (let z = -40; z <= 15; z++) for (let y = 1; y < 40; y++) {
      const inArch = Math.abs(x) < aw && (y < ah - 6 || (x / aw) ** 2 + ((y - (ah - 6)) / 6) ** 2 < 1);
      if (inArch) G.del(x, y, z);
    }
    for (let z = -40; z <= 15; z++) {
      const step = Math.max(0, Math.floor((15 - z) / 5)), floorY = 1 - step;   // 一階 50 公分深、往下 10 公分
      for (let x = -aw + 1; x < aw; x++) {
        const dark = Math.max(0, Math.min(1, (10 - z) / 46));
        if (floorY >= 1) G.set(x, floorY, z, mix(0x9A9288, 0x1A1C20, dark), 0);
        // 地面以下的台階用深色往裡畫，看起來像往下走
        else G.set(x, 1, z, mix(0x6A645C, 0x0E1012, Math.min(1, dark + step * 0.08)), 0);
      }
      for (const x of [-aw, aw]) for (let y = 1; y < ah - 6; y++) G.set(x, y, z, mix(rock(x, y, z), 0x1A1C20, Math.max(0, Math.min(0.8, (10 - z) / 50))), 0);
    }
    // 門框：切好的石塊
    for (let x = -aw - 3; x <= aw + 3; x++) for (let y = 1; y < ah + 4; y++) for (let z = 14; z <= 16; z++) {
      const inner = Math.abs(x) < aw && (y < ah - 6 || (x / aw) ** 2 + ((y - (ah - 6)) / 6) ** 2 < 1);
      if (inner) continue;
      const ring = Math.abs(x) <= aw + 3 && (y < ah - 6 ? Math.abs(x) >= aw : (x / (aw + 3)) ** 2 + ((y - (ah - 6)) / 9) ** 2 < 1);
      if (ring) G.set(x, y, z, ((y >> 2) + (x >> 2)) % 2 ? 0xB8B0A2 : 0xA8A092, 0);
    }
    // 扶手、兩盞燈、木牌、釣具
    for (const x of [-aw + 2, aw - 2]) { for (let z = -6; z <= 13; z++) G.set(x, 10 - Math.max(0, Math.floor((13 - z) / 5)), z, 0x3A3A3E, 0); for (let z = -6; z <= 13; z += 6) for (let y = 2; y < 10; y++) G.set(x, y - Math.max(0, Math.floor((13 - z) / 5)), z, 0x3A3A3E, 0); }
    for (const x of [-aw - 6, aw + 6]) {
      for (let y = 1; y < 22; y++) G.set(x, y, 17, 0x2E3238, 0);
      for (let y = 22; y < 26; y++) for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) G.set(x + dx, y, 17 + dz, y === 25 ? 0x2E3238 : 0xFFD890, y === 25 ? 0 : F_GLOW);
      lamps.push([x * V, 18 * V, 0xFFB060]);
    }
    for (let x = 18; x < 30; x++) for (let y = 12; y < 18; y++) G.set(x, y, 21, y === 12 || y === 17 || x === 18 || x === 29 ? 0x5A3A26 : 0x8A6A4A, 0);
    for (let y = 1; y < 12; y++) G.set(23, y, 21, 0x5A3A26, 0);
    for (let x = -34; x < -24; x++) for (let z = 22; z < 30; z++) for (let y = 1; y < 6; y++) G.set(x, y, z, (x + y) % 3 ? 0x8A6A4A : 0x6A4E36, 0);
    for (let k = 0; k < 16; k++) G.set(-22 + (k >> 3), 1 + k, 26 - (k >> 2), 0x5A4030, 0);
    // 旁邊一個小水井，看得到底下的水
    for (let x = -6; x <= 6; x++) for (let z = -6; z <= 6; z++) { const d = Math.hypot(x, z); if (d <= 6 && d > 4) for (let y = 1; y < 7; y++) G.set(34 + x, y, 34 + z, y === 6 ? 0x8A8278 : 0x9A9288, 0); else if (d <= 4) G.set(34 + x, 2, 34 + z, 0x24505E, F_WIN); }
    const ms = toMeshes(T, G); G.clear();
    const g = new T.Group(); ms.forEach(m => g.add(m)); g.scale.setScalar(1 / UNIT);
    return { group: g, lamps: lamps.map(([x, z, c]) => [x / UNIT, z / UNIT, c]), top: 40 * V / UNIT };
  }

  /* ═════════ 房間的方塊（voxroom，一格 10 公分）轉成小鎮用的合併網格 ═════════
   * 戶外地點在小鎮上直接用房間平台那一套模型；分成 6.4 公尺一塊轉換，免得一次開太大的格子。 */
  function fromVoxels(T, vox) {
    vox = Array.isArray(vox) ? vox : Array.from(vox);
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, y1 = 0;
    for (const v of vox) { if (v.c == null) continue; x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); z0 = Math.min(z0, v.z); z1 = Math.max(z1, v.z); y1 = Math.max(y1, v.y); }
    const g = new T.Group(); if (x0 > x1) return g;
    const CH = 64, buckets = new Map();
    for (const v of vox) { if (v.c == null) continue; const k = Math.floor((v.x - x0) / CH) + "," + Math.floor((v.z - z0) / CH); let b = buckets.get(k); if (!b) buckets.set(k, b = []); b.push(v); }
    for (const [k, list] of buckets) {
      const [ci, cj] = k.split(",").map(Number), bx = x0 + ci * CH, bz = z0 + cj * CH;
      const G = new Box(bx, bx + CH, y1 + 3, bz, bz + CH);
      for (const v of list) G.set(v.x, v.y + 1, v.z, v.c, v.f & 3);   // 地面在 y = −1：往上挪一格
      toMeshes(T, G).forEach(m => { m.position.y = -V; g.add(m); });
      G.clear();
    }
    return g;
  }

  /* 空橋：跨過窄路，接兩邊的房子（沿 x 方向，長 len 公尺，底在 3.2 公尺高） */
  function skywalk(T, len) {
    const L = Math.round(len / V), G = new Box(-2, L + 2, 70, -10, 10), lamps = [], y0 = 32, H2 = 24;
    for (let x = 0; x < L; x++) for (let z = -8; z <= 8; z++) {
      G.set(x, y0, z, (x + z) % 3 ? 0x5A5E66 : 0x4A4E56, 0);
      G.set(x, y0 + H2, z, 0x3A3E46, 0);
      if (z === -8 || z === 8) for (let y = y0 + 1; y < y0 + H2; y++) {
        const fr = x % 8 === 0 || y === y0 + 1 || y === y0 + 2 || y === y0 + H2 - 1;
        G.set(x, y, z, fr ? 0x2A2C32 : 0x7AB8C8, fr ? 0 : F_WIN);
      }
      if (z === 0 && x % 12 === 6) G.set(x, y0 + H2 - 1, z, 0xFFE6B0, F_GLOW);
    }
    for (let x = 0; x < L; x += 2) { G.set(x, y0 + H2 + 1, -8, 0x4AE8FF, F_GLOW); }
    for (let x = 0; x < L; x++) for (let z = -7; z <= 7; z++) G.set(x, y0 - 1, z, 0x3A3E46, 0);
    lamps.push([L * V / 2, 0, 0x8ADCFF]);
    const ms = toMeshes(T, G); G.clear();
    const g = new T.Group(); ms.forEach(m => g.add(m)); g.scale.setScalar(1 / UNIT);
    return { group: g, lamps: lamps.map(([x, z, c]) => [x / UNIT, z / UNIT, c]) };
  }

  N.voxCity = { island, skywalk, tick, fromVoxels, lot, filler, farBlock, block, marketStreet, lakeGate, clockTower, mountains, setNight, mats, UNIT, styleOf, TYPE, _build: { Box, building, toMeshes, palette, floorsFor, setLite: v => { LITE = v; } } };
})();
