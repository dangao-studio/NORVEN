/* 諾文小鎮：3D 小鎮（three.js r128）
 * 小鎮分頁的立體模型：建築、居民、日夜、天氣、對話泡泡。
 * 對外只有 NOVUM.town3d 這組函式；資料由 app.js 每秒送進來。
 * 載不到 three.js 或裝置不支援 WebGL 時，app.js 會自動退回平面街區圖。
 */
(function () {
  "use strict";
  const N = window.NOVUM;
  let T = null, loading = null;

  let _sup = null;
  function supported() {
    if (_sup !== null) return _sup;
    try {
      const c = document.createElement("canvas");
      const gl = window.WebGLRenderingContext && (c.getContext("webgl") || c.getContext("experimental-webgl"));
      _sup = !!gl;
      if (gl && gl.getExtension("WEBGL_lose_context")) gl.getExtension("WEBGL_lose_context").loseContext();
    } catch (e) { _sup = false; }
    return _sup;
  }
  function loadThree() {
    if (window.THREE) return Promise.resolve(window.THREE);
    if (loading) return loading;
    loading = new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "vendor/three.min.js";
      s.onload = () => window.THREE ? res(window.THREE) : rej(new Error("three"));
      s.onerror = () => { loading = null; rej(new Error("three")); };
      document.head.appendChild(s);
    });
    return loading;
  }

  /* ═════════ 版圖 ═════════ */
  const BLOCK = {
    central0: [0, 0], central1: [18, 0],
    academy0: [0, -25], academy1: [18, -25],
    oldtown0: [-18, 0], oldtown1: [-18, -25],
    outer0: [36, 0], outer1: [62, -25], outer2: [62, 0]
  };
  const BOUNDS = { x0: -34, x1: 80, z0: -36, z1: 30 };
  const PAL = {
    central: { ground: 0xD8CBB2, wall: [0xF8E6CE, 0xF4D2B8, 0xFBF1E0, 0xEFC8A8, 0xDDE8E2], roof: [0xD8705A, 0xE89060, 0xC85A4A, 0x6A8AA8] },
    academy: { ground: 0xB6CC9C, wall: [0xE0A888, 0xEED2B8, 0xF2E6D4, 0xD49A80], roof: [0x5A7298, 0x4A6288, 0x6A84A8] },
    oldtown: { ground: 0xC6BAA6, wall: [0xD4C8B4, 0xC8B8A0, 0xE0D4BC, 0xB8AC98], roof: [0x7A5E4C, 0x8A6A52, 0x6A5444] },
    outer: { ground: 0xC2C6BE, wall: [0xA8C0C0, 0xC8D0C8, 0xC0A890, 0xB8C4B0], roof: [0x4A8088, 0xC07048, 0x5A6E74] },
    pero: { ground: 0xDCC8D4, wall: [0xF8C8D8, 0xBCE2F0, 0xFAE8A8, 0xD8C8F4], roof: [0x8A6ED0, 0xE87098, 0x48B870] },
    other: { ground: 0xBCD2B0, wall: [0xD4E4CC, 0xF0E0C4, 0xCCE0E8, 0xEAD4C8], roof: [0x3E7266, 0x5A80B4, 0x9A7A5A] }
  };
  const palOf = l => l.region === "outer" ? (l.page === 1 ? PAL.pero : l.page === 2 ? PAL.other : PAL.outer) : PAL[l.region];
  const blockOf = l => BLOCK[l.region + l.page];
  function lotPos(l) {
    const b = blockOf(l), c = l.slot % 2, r = Math.floor(l.slot / 2);
    return { x: b[0] + 3.5 + c * 7, z: b[1] + 3.5 + r * 7 };
  }
  function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function typeOf(l) {
    const n = l.name + l.id;
    if (/鐘塔/.test(n)) return "tower";
    if (/公園/.test(n)) return "park";
    if (/地下湖/.test(n)) return "lake";
    if (/河岸/.test(n)) return "river";
    if (/表演/.test(n)) return "stage";
    if (/夜市|市場|市集|巷口/.test(n)) return "market";
    if (/轉運站|舊站/.test(n)) return "station";
    if (/大學|高中|中學|學區|圖書館|資料館|展館|研究/.test(n)) return "school";
    if (/塔屋/.test(n)) return "wizard";
    if (/閣樓/.test(n)) return "attic";
    if (/公寓|宿舍|街廊/.test(n)) return "tall";
    if (/街|巷/.test(n)) return "street";
    if (l.kind === "home") return "house";
    return "shop";
  }
  const OPEN = { tower: 1, park: 1, lake: 1, river: 1, market: 1, stage: 1, station: 1 };

  /* ═════════ 場景狀態 ═════════ */
  let built = false, buildP = null;
  let renderer = null, scene, camera, root, sun, hemi, moonFill;
  let host = null, hooks = {}, running = false, raf = 0, lastT = 0, ro = null;
  const cam = { target: null, dist: 40, az: 0.62, polar: 0.92, fly: null, follow: null };
  const mats = {};
  let winMat, lampMat, clockMat, waterMat, lanternMat;
  const lots = {};          // locId → { x, z, open, h, group }
  const walkers = {};       // id → walker
  const bubbles = [];
  const hintMarks = {};
  let labelSprites = [], districtSprites = [];
  let rain, stars, clouds = [], festGroup, fireflies;
  let state = null, firstPlace = true, showLabels = true, xray = false;
  const tmpV = () => new T.Vector3();

  function mat(color, extra) {
    const k = color + (extra ? JSON.stringify(extra) : "");
    if (!mats[k]) {
      // 整體飽和度拉高一點、稍微壓暗，避免在陽光下顯得灰白
      const c = new T.Color(color), hsl = {}; c.getHSL(hsl);
      if (hsl.s > 0.04) c.setHSL(hsl.h, Math.min(1, hsl.s * 1.35 + 0.04), hsl.l * (hsl.l > 0.8 ? 0.94 : 0.98));
      mats[k] = new T.MeshLambertMaterial(Object.assign({}, extra || {}, { color: c }));
    }
    return mats[k];
  }
  function add(g, geo, m, x, y, z, cast) {
    const mesh = new T.Mesh(geo, m);
    mesh.position.set(x || 0, y || 0, z || 0);
    if (cast !== false) mesh.castShadow = true;
    mesh.receiveShadow = true;
    g.add(mesh);
    return mesh;
  }
  const box = (g, w, h, d, m, x, y, z, cast) => add(g, new T.BoxGeometry(w, h, d), m, x, (y || 0) + h / 2, z, cast);
  function pyramid(g, w, d, h, m, x, y, z) {
    const geo = new T.ConeGeometry(1, 1, 4, 1);
    const mesh = add(g, geo, m, x, y + h / 2, z);
    mesh.scale.set(w / Math.SQRT2 * 1.08, h, d / Math.SQRT2 * 1.08);
    mesh.userData.pyr = true;
    return mesh;
  }
  function gable(g, w, d, h, m, x, y, z) {
    const sh = new T.Shape(); sh.moveTo(-w / 2 - 0.15, 0); sh.lineTo(w / 2 + 0.15, 0); sh.lineTo(0, h); sh.lineTo(-w / 2 - 0.15, 0);
    const geo = new T.ExtrudeGeometry(sh, { depth: d + 0.3, bevelEnabled: false });
    geo.translate(0, 0, -(d + 0.3) / 2);
    return add(g, geo, m, x, y, z);
  }
  function windows(g, w, h, d, floors, cols, y0, x0, z0) {
    const geo = new T.PlaneGeometry(0.42, 0.55);
    for (let f = 0; f < floors; f++) for (let c = 0; c < cols; c++) {
      const x = x0 - w / 2 + (c + 0.5) * (w / cols), y = y0 + 0.8 + f * (h / floors);
      const m = new T.Mesh(geo, winMat); m.position.set(x, y, z0 + d / 2 + 0.01); g.add(m);
    }
  }
  function tree(g, x, z, s, hue) {
    s = s || 1;
    add(g, new T.CylinderGeometry(0.12 * s, 0.16 * s, 0.9 * s, 6), mat(0x7A5A3E), x, 0.45 * s, z);
    const top = hue === "pine" ? new T.ConeGeometry(0.7 * s, 1.7 * s, 7) : new T.IcosahedronGeometry(0.75 * s, 0);
    add(g, top, mat(hue === "pine" ? 0x4F7A55 : (hue || 0x6E9E5A)), x, (hue === "pine" ? 1.6 : 1.5) * s, z);
  }
  function lamp(g, x, z) {
    add(g, new T.CylinderGeometry(0.06, 0.08, 2.2, 6), mat(0x3B3F4A), x, 1.1, z, false);
    const b = new T.Mesh(new T.SphereGeometry(0.2, 10, 8), lampMat); b.position.set(x, 2.3, z); g.add(b);
  }

  /* ═════════ 建築 ═════════ */
  function buildLot(l) {
    const p = lotPos(l), pal = palOf(l), type = typeOf(l), h0 = hashStr(l.id);
    const pick = (arr, k) => arr[(h0 >>> (k || 0)) % arr.length];
    const g = new T.Group(); g.position.set(p.x, 0, p.z); g.userData.loc = l.id;
    const wall = mat(pick(pal.wall)), roof = mat(pick(pal.roof, 3)), trim = mat(0xF7F1E6), dark = mat(0x4A3B33);
    let h = 3;
    const plate = (color) => add(g, new T.BoxGeometry(6.4, 0.12, 6.4), mat(color), 0, 0.06, 0, false);
    switch (type) {
      case "house": {
        plate(0xCFC6AE);
        box(g, 3.4, 2.2, 3, wall, 0, 0.12, -0.4);
        gable(g, 3.4, 3, 1.4, roof, 0, 2.32, -0.4);
        box(g, 0.7, 1.2, 0.08, dark, 0, 0.12, 1.12);
        windows(g, 3.4, 2.2, 3, 1, 3, 0.12, 0, -0.4);
        if (h0 % 2) box(g, 0.4, 1, 0.4, mat(0x8E7A6A), 1, 2.6, -1);
        tree(g, -2.4, 2.2, 0.8); h = 3.8; break;
      }
      case "attic": {
        plate(0xD8CDB4);
        box(g, 2.8, 2.6, 2.6, wall, 0, 0.12, -0.6);
        pyramid(g, 2.8, 2.6, 2.6, mat(0x6B5B8A), 0, 2.72, -0.6);
        box(g, 0.9, 0.9, 0.1, winMat, 0, 3.2, 0.62, false);
        add(g, new T.ConeGeometry(0.3, 0.8, 4), mat(0xF1E3C8), -1.6, 0.5, 1.6);
        h = 5.4; break;
      }
      case "shop": {
        plate(0xD6CDB8);
        box(g, 3.8, 2.8, 3.2, wall, 0, 0.12, -0.5);
        box(g, 4.0, 0.25, 3.4, roof, 0, 2.92, -0.5);
        const aw = box(g, 3.6, 0.12, 1.1, mat(pick(pal.roof, 5)), 0, 1.95, 1.5);
        aw.rotation.x = 0.35;
        box(g, 2.4, 1.1, 0.06, winMat, -0.4, 0.5, 1.12, false);
        box(g, 0.6, 1.4, 0.08, dark, 1.3, 0.12, 1.12);
        box(g, 1.6, 0.45, 0.12, trim, 0, 2.35, 1.18, false);
        windows(g, 3.8, 1, 3.2, 1, 3, 1.9, 0, -0.5);
        lamp(g, 2.6, 2.6); h = 3.6; break;
      }
      case "tall": {
        plate(0xCFC9BC);
        const tall = /街廊/.test(l.name) ? 7.8 : 5.6;
        box(g, 3.6, tall, 3.4, wall, 0, 0.12, -0.6);
        box(g, 3.9, 0.3, 3.7, roof, 0, tall + 0.12, -0.6);
        windows(g, 3.6, tall - 0.6, 3.4, Math.round(tall / 1.7), 3, 0.12, 0, -0.6);
        box(g, 0.9, 1.3, 0.1, dark, 0, 0.12, 1.12);
        if (/街廊/.test(l.name)) { for (let i = 1; i < 4; i++) box(g, 4.4, 0.12, 0.8, mat(0x6F8A8C), 0, i * 1.9, 1.4, false); }
        h = tall + 0.6; break;
      }
      case "school": {
        plate(0xD9D3C0);
        const big = /大學/.test(l.name);
        box(g, 5.6, big ? 3.6 : 3, 3.4, wall, 0, 0.12, -1);
        pyramid(g, 5.8, 3.6, 1.1, roof, 0, (big ? 3.6 : 3) + 0.12, -1);
        for (let i = 0; i < 4; i++) add(g, new T.CylinderGeometry(0.16, 0.16, big ? 3.2 : 2.6, 8), trim, -1.8 + i * 1.2, (big ? 3.2 : 2.6) / 2 + 0.12, 0.95);
        box(g, 5, 0.3, 0.9, trim, 0, (big ? 3.32 : 2.72), 0.95, false);
        windows(g, 5.6, big ? 3.2 : 2.6, 3.4, 2, 4, 0.12, 0, -1);
        add(g, new T.CylinderGeometry(0.04, 0.04, 3, 5), mat(0x777777), 2.6, 1.6, 2.4, false);
        box(g, 0.8, 0.5, 0.04, mat(pick(pal.roof, 2)), 2.98, 2.7, 2.4, false);
        if (/高中/.test(l.name)) add(g, new T.CylinderGeometry(0.35, 0.35, 0.3, 14), mat(0xC2455A), -2.4, 0.3, 2.3);
        h = (big ? 4.9 : 4.3); break;
      }
      case "wizard": {
        plate(0xCFC7B6);
        add(g, new T.CylinderGeometry(1.3, 1.5, 5, 10), mat(0xB8AFA0), 0, 2.6, -0.5);
        add(g, new T.ConeGeometry(1.9, 2.8, 10), mat(0x3D3555), 0, 6.5, -0.5);
        add(g, new T.TorusGeometry(1.75, 0.12, 6, 20), mat(0x3D3555), 0, 5.12, -0.5).rotation.x = Math.PI / 2;
        box(g, 0.6, 0.7, 0.1, winMat, 0, 3.4, 0.92, false);
        box(g, 0.7, 1.3, 0.1, dark, 0, 0.12, 0.98);
        h = 8.2; break;
      }
      case "street": {
        plate(0xCBC2B0);
        const n = 3;
        for (let i = 0; i < n; i++) {
          const hh = 2.2 + ((h0 >>> (i * 3)) % 4) * 0.6, x = -2 + i * 2;
          box(g, 1.85, hh, 2.8, mat(pal.wall[(h0 + i) % pal.wall.length]), x, 0.12, -1);
          if ((h0 >>> i) % 2) gable(g, 1.85, 2.8, 0.9, mat(pal.roof[(h0 + i) % pal.roof.length]), x, hh + 0.12, -1);
          else box(g, 2, 0.2, 3, mat(pal.roof[(h0 + i) % pal.roof.length]), x, hh + 0.12, -1);
          box(g, 0.9, 0.8, 0.06, winMat, x, 0.4, 0.42, false);
          h = Math.max(h, hh + 1.2);
        }
        if (/塗鴉/.test(l.name)) { box(g, 5.6, 1.4, 0.15, mat(0x7C5CC4), 0, 0.12, 2.6); box(g, 1.4, 0.6, 0.17, mat(0x2FA85C), -1, 0.5, 2.6, false); box(g, 1.1, 0.5, 0.17, mat(0xF8E28E), 1.2, 0.8, 2.6, false); }
        if (/改裝|材料|機械|維修/.test(l.name)) add(g, new T.TorusGeometry(0.5, 0.15, 6, 12), mat(0x9A9A9A), 2.4, 1, 2.2);
        lamp(g, -2.6, 2.6); break;
      }
      case "tower": {
        plate(0xD8D0BF);
        add(g, new T.CylinderGeometry(2.6, 2.6, 0.1, 24), mat(0xC9BFAA), 0, 0.17, 0, false);
        box(g, 1.7, 7, 1.7, mat(0xD9C7A5), 0, 0.2, -0.3);
        box(g, 2.0, 0.3, 2.0, mat(0x8E6A45), 0, 7.2, -0.3);
        pyramid(g, 2, 2, 2.2, mat(0x5C6D7E), 0, 7.5, -0.3);
        const face = new T.CircleGeometry(0.6, 20);
        for (let i = 0; i < 4; i++) {
          const f = new T.Mesh(face, clockMat), a = i * Math.PI / 2;
          f.position.set(Math.sin(a) * 0.86, 6.2, -0.3 + Math.cos(a) * 0.86); f.rotation.y = a; g.add(f);
        }
        lamp(g, -2.5, 2.4); lamp(g, 2.5, 2.4);
        h = 10.2; break;
      }
      case "park": {
        plate(0x9FC48A);
        add(g, new T.CylinderGeometry(1.05, 1.15, 0.45, 18), mat(0xCFC5B0), 0, 0.34, 0);
        const w = new T.Mesh(new T.CylinderGeometry(0.9, 0.9, 0.05, 18), waterMat); w.position.set(0, 0.55, 0); g.add(w);
        add(g, new T.CylinderGeometry(0.12, 0.18, 0.9, 8), mat(0xCFC5B0), 0, 0.9, 0);
        [[-2.3, -2.2], [2.3, -2.4], [-2.5, 0.6], [2.4, 1.2], [-1.2, -2.6]].forEach(([x, z], i) => tree(g, x, z, 0.9 + (i % 2) * 0.25, i === 4 ? 0x86B06A : null));
        box(g, 1.4, 0.35, 0.45, mat(0x9C6B45), 0, 0.12, 2.3);
        lamp(g, 1.4, 2.5); h = 3; break;
      }
      case "lake": {
        plate(0x8C8F86);
        add(g, new T.CylinderGeometry(2.7, 2.9, 0.4, 22), mat(0x6F6B63), 0, 0.3, 0);
        const w = new T.Mesh(new T.CylinderGeometry(2.4, 2.4, 0.06, 22), mat(0x234B5A, { emissive: 0x0E2E3A })); w.position.set(0, 0.52, 0); g.add(w);
        const arch = add(g, new T.TorusGeometry(1.9, 0.55, 6, 16, Math.PI), mat(0x55524C), 0, 0.3, -2.5);
        arch.rotation.z = 0;
        box(g, 0.8, 0.12, 2, mat(0x8A6A4A), 1.6, 0.5, 1.8, false);
        add(g, new T.CylinderGeometry(0.02, 0.02, 1.8, 4), mat(0x333333), 1.7, 1.3, 2.4, false).rotation.z = -0.5;
        h = 3.2; break;
      }
      case "river": {
        plate(0xC7C3B2);
        for (let i = 0; i < 5; i++) add(g, new T.CylinderGeometry(0.05, 0.05, 0.8, 4), mat(0x5B5249), -2.9, 0.5, -2.6 + i * 1.3, false);
        box(g, 0.08, 0.08, 6, mat(0x5B5249), -2.9, 0.86, 0, false);
        tree(g, 1.8, -1.8, 1.1, 0x7FA86C); tree(g, 2.2, 1.6, 0.9);
        box(g, 1.3, 0.35, 0.45, mat(0x9C6B45), 0, 0.12, 0.4);
        lamp(g, -1.6, 2.4); h = 3; break;
      }
      case "market": case "stage": {
        plate(type === "stage" ? 0xE8D2E6 : 0xD9CDB5);
        if (type === "stage") {
          box(g, 4.6, 0.6, 2.6, mat(0x3D3555), 0, 0.12, -1.4);
          for (const x of [-2.2, 2.2]) box(g, 0.2, 3.2, 0.2, mat(0x777777), x, 0.72, -2.5);
          box(g, 4.6, 0.25, 0.25, mat(0x777777), 0, 3.9, -2.5);
          box(g, 0.7, 1.1, 0.6, mat(0x222222), -1.8, 0.72, -1);
          box(g, 0.7, 1.1, 0.6, mat(0x222222), 1.8, 0.72, -1);
          h = 4.8;
        } else {
          const cols = [0xC0603F, 0xE0B54A, 0x4A6FA5, 0x2F8A6A, 0xD98AA0];
          [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.0], [1.6, 1.0]].forEach(([x, z], i) => {
            box(g, 1.7, 0.8, 1.1, mat(0x9C7A55), x, 0.12, z);
            for (const dx of [-0.75, 0.75]) box(g, 0.06, 1.7, 0.06, mat(0x6B5A4A), x + dx, 0.12, z - 0.45, false);
            const a = box(g, 1.9, 0.08, 1.3, mat(cols[(h0 + i) % cols.length]), x, 1.75, z, false); a.rotation.x = -0.12;
          });
          if (/夜市/.test(l.name)) {
            for (let i = 0; i < 7; i++) { const m = new T.Mesh(new T.SphereGeometry(0.2, 8, 6), lanternMat); m.position.set(-2.7 + i * 0.9, 2.6 + Math.sin(i) * 0.15, -0.3); g.add(m); }
            box(g, 6, 0.03, 0.03, mat(0x333333), 0, 2.78, -0.3, false);
          }
          h = 3.2;
        }
        lamp(g, 2.7, 2.7); break;
      }
      case "station": {
        plate(0xC9C9C0);
        box(g, 5.8, 0.5, 2.2, mat(0xB4AEA2), 0, 0.12, -1.6);
        for (const x of [-2.4, 0, 2.4]) box(g, 0.14, 2.3, 0.14, mat(0x4F5D62), x, 0.62, -1.2, false);
        const c = box(g, 6.2, 0.14, 2.4, mat(/舊站/.test(l.name) ? 0x8E4A3A : 0x3F6E73), 0, 2.9, -1.6); c.rotation.x = 0.08;
        box(g, 6.4, 0.08, 0.12, mat(0x5A5A5A), 0, 0.12, 0.5, false); box(g, 6.4, 0.08, 0.12, mat(0x5A5A5A), 0, 0.12, 1.5, false);
        if (/舊站/.test(l.name)) {
          add(g, new T.CylinderGeometry(0.55, 0.55, 2.4, 12), mat(0x2E2E33), -0.5, 0.75, 1.0).rotation.z = Math.PI / 2;
          box(g, 1.1, 1.4, 1.1, mat(0x2E2E33), 1.2, 0.2, 1.0);
          add(g, new T.CylinderGeometry(0.15, 0.2, 0.7, 8), mat(0x2E2E33), -1.3, 1.6, 1.0);
        }
        box(g, 1.2, 0.5, 0.06, mat(0xF7F1E6), 0, 2.1, -0.5, false);
        h = 3.8; break;
      }
    }
    if (N.voxTown) {
      // 換成體素建築：舊的幾何拿掉，只保留地點的位置和資料
      while (g.children.length) { const c = g.children.pop(); if (c.geometry) c.geometry.dispose(); }
      const reg = l.region === "outer" ? (l.page === 1 ? "pero" : l.page === 2 ? "other" : "outer") : l.region;
      const info = { type, reg, hash: h0, wall: pick(pal.wall), roof: pick(pal.roof, 3), winMat, lampMat };
      if (l.id === "Hale’s Oven") Object.assign(info, { gable: true, timber: true, wall: 0xF0E2C4, roof: 0xC0583A });
      if (l.id === "史威特偵探社") Object.assign(info, { wall: 0xB4583E, roof: 0x2E4A3A, brick: true });
      if (l.id === "諾文甜點店") Object.assign(info, { wall: 0xF2B6C4, roof: 0xF07AA0 });
      const r = N.voxTown.lot(T, l, info);
      const vg = new T.Group(); vg.position.y = VOXY; r.meshes.forEach(m => vg.add(m)); g.add(vg);
      r.lamps.forEach(([x, z]) => lampSpots.push([p.x + x, p.z + z]));
      h = Math.max(2.5, r.top + 0.3);
    }
    root.add(g);
    // 名牌
    const lab = textSprite(`${l.icon} ${l.name}`, { size: 30, bg: "rgba(255,253,248,.9)", fg: "#2b2a28", pad: 14, h: 0.62 });
    lab.position.set(p.x, h + 1.1, p.z); lab.userData.loc = l.id; lab.renderOrder = 5;
    root.add(lab); labelSprites.push(lab);
    const shell = [];
    if (!OPEN[type]) {
      // 可以透視的外殼：建築本體（不含地坪、門外的路燈和樹）
      g.children.forEach((m, i) => {
        if (i === 0 || !m.isMesh) return;
        if (Math.abs(m.position.x) > 3.1 || m.position.z > 1.35) return;
        m.material = m.material.clone();
        shell.push(m);
      });
    }
    lots[l.id] = { x: p.x, z: p.z, open: !!OPEN[type], h, group: g, type, shell, cut: 0, occ: 0, spots: [] };

  }


  /* ═════════ 室內家具 ═════════ */
  const RECT = { house: [-1.45, 1.45, -1.7, 0.9], attic: [-1.2, 1.2, -1.7, 0.5], shop: [-1.65, 1.65, -1.9, 0.9], tall: [-1.55, 1.55, -2.1, 0.9],
    school: [-2.55, 2.55, -2.5, 0.5], wizard: [-1.0, 1.0, -1.4, 0.4], street: [-2.7, 2.7, -2.2, 0.2] };
  const colOf = c => {
    if (typeof c === "string" && c.indexOf("owner:") === 0) { const ch = N.characters.find(x => x.id === c.slice(6)); return ch ? new T.Color(ch.color).getHex() : 0x999999; }
    return c == null ? 0x8E6A45 : c;
  };
  let starMat, glowMats = {};
  const glow = c => glowMats[c] || (glowMats[c] = new T.MeshLambertMaterial({ color: c, emissive: c, emissiveIntensity: 0.9 }));
  const fb = (g, w, h, d, c, x, y, z) => box(g, w, h, d, typeof c === "number" ? mat(c) : c, x, y, z, false);
  const cyl = (g, r1, r2, h, c, x, y, z, seg) => add(g, new T.CylinderGeometry(r1, r2, h, seg || 10), typeof c === "number" ? mat(c) : c, x, y + h / 2, z, false);
  // 椅子：(fx, fz) 是坐的人面向的方向，椅背在反方向
  function chair(g, x, z, fx, fz, c) {
    fb(g, 0.4, 0.06, 0.4, c, x, 0.34, z);
    for (const dx of [-0.16, 0.16]) for (const dz of [-0.16, 0.16]) fb(g, 0.04, 0.34, 0.04, c, x + dx, 0, z + dz);
    if (fx) fb(g, 0.05, 0.42, 0.4, c, x - fx * 0.18, 0.4, z);
    else fb(g, 0.4, 0.42, 0.05, c, x, 0.4, z - fz * 0.18);
  }
  function furn(type, o, g) {
    const c = colOf(o.c), wood = 0x8E6A45, sp = [];
    switch (type) {
      case "bed":
        fb(g, 0.95, 0.28, 1.7, 0x6B4E3A, 0, 0, 0); fb(g, 0.88, 0.12, 1.6, 0xF4F0E8, 0, 0.28, 0);
        fb(g, 0.92, 0.1, 1.05, c, 0, 0.34, 0.3); fb(g, 0.6, 0.12, 0.3, 0xFFFFFF, 0, 0.4, -0.6);
        fb(g, 0.95, 0.7, 0.08, 0x6B4E3A, 0, 0, -0.86);
        sp.push({ x: 0, z: 0.05, pose: "lie", tag: "sleep", y: 0.36, owner: o.owner }); break;
      case "sofa":
        fb(g, 1.4, 0.32, 0.62, c, 0, 0.05, 0); fb(g, 1.4, 0.55, 0.16, c, 0, 0.3, -0.26);
        fb(g, 0.14, 0.5, 0.62, c, -0.7, 0.05, 0); fb(g, 0.14, 0.5, 0.62, c, 0.7, 0.05, 0);
        sp.push({ x: -0.33, z: 0.06, pose: "sit", tag: "relax", y: 0.36 }, { x: 0.33, z: 0.06, pose: "sit", tag: "relax", y: 0.36 }); break;
      case "beanbag": {
        const m = add(g, new T.SphereGeometry(0.42, 12, 8), mat(c), 0, 0.2, 0, false); m.scale.y = 0.55;
        sp.push({ x: 0, z: 0.05, pose: "sit", tag: "relax", y: 0.28 }); break; }
      case "bench2":
        fb(g, 1.3, 0.07, 0.4, c, 0, 0.4, 0); fb(g, 0.08, 0.4, 0.35, c, -0.55, 0, 0); fb(g, 0.08, 0.4, 0.35, c, 0.55, 0, 0);
        sp.push({ x: -0.32, z: 0.02, pose: "sit", tag: "relax", y: 0.44 }, { x: 0.32, z: 0.02, pose: "sit", tag: "relax", y: 0.44 }); break;
      case "table": {
        const n = o.seats == null ? 2 : o.seats, w = n > 2 ? 1.15 : 0.8;
        fb(g, w, 0.06, 0.7, c, 0, 0.55, 0);
        for (const dx of [-w / 2 + 0.06, w / 2 - 0.06]) for (const dz of [-0.28, 0.28]) fb(g, 0.05, 0.55, 0.05, 0x6B5A4A, dx, 0, dz);
        const seats = [[-(w / 2 + 0.32), 0], [w / 2 + 0.32, 0], [0, 0.62], [0, -0.62]].slice(0, n);
        seats.forEach(([x, z]) => { chair(g, x, z, z ? 0 : (x < 0 ? 1 : -1), z ? (z < 0 ? 1 : -1) : 0, 0x7A5A40); sp.push({ x, z: z + (z > 0 ? 0.02 : z < 0 ? -0.02 : 0), pose: "sit", tag: "eat", y: 0.42 }); });
        if (o.bowls) for (let i = 0; i < 3; i++) cyl(g, 0.14, 0.09, 0.1, 0xF4F0E8, -0.35 + i * 0.35, 0.61, 0);
        if (o.donuts) for (let i = 0; i < 3; i++) { const m = add(g, new T.TorusGeometry(0.09, 0.045, 6, 12), mat([0xE8A87C, 0xF2B5C9, 0x8E5A3A][i]), -0.2 + i * 0.2, 0.64, 0, false); m.rotation.x = Math.PI / 2; }
        break; }
      case "longtable":
        fb(g, 2.6, 0.06, 0.8, c, 0, 0.55, 0);
        for (const dx of [-1.2, 1.2]) for (const dz of [-0.3, 0.3]) fb(g, 0.05, 0.55, 0.05, 0x5A4A3A, dx, 0, dz);
        for (const x of [-0.85, 0, 0.85]) { chair(g, x, 0.62, 0, -1, 0x7A5A40); sp.push({ x, z: 0.64, pose: "sit", tag: "study", y: 0.42 }); fb(g, 0.25, 0.04, 0.32, [0xC0603F, 0x4A6FA5, 0x2F8A6A][(x + 1) | 0], x, 0.61, 0.1); }
        break;
      case "desk":
        fb(g, 0.95, 0.05, 0.5, c, 0, 0.62, 0);
        for (const dx of [-0.42, 0.42]) fb(g, 0.05, 0.62, 0.45, c, dx, 0, 0);
        chair(g, 0, 0.5, 0, -1, 0x6B5A4A);
        fb(g, 0.22, 0.12, 0.3, 0xC0603F, -0.25, 0.67, -0.05); fb(g, 0.3, 0.02, 0.22, 0xFFFFFF, 0.15, 0.67, 0.02);
        if (o.papers) for (let i = 0; i < 3; i++) fb(g, 0.22, 0.04 + i * 0.03, 0.3, 0xF4F0E8, -0.3 + i * 0.25, 0.67, -0.1);
        sp.push({ x: 0, z: 0.52, pose: "sit", tag: "study", y: 0.42 }); break;
      case "classroom": {
        const rows = o.rows || 2, cols = o.cols || 3;
        for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
          const x = (k - (cols - 1) / 2) * 1.4, z = (r - (rows - 1) / 2) * 1.05;
          fb(g, 0.8, 0.05, 0.42, c, x, 0.58, z - 0.15); fb(g, 0.05, 0.58, 0.38, c, x - 0.35, 0, z - 0.15); fb(g, 0.05, 0.58, 0.38, c, x + 0.35, 0, z - 0.15);
          chair(g, x, z + 0.28, 0, -1, 0x6B5A4A);
          sp.push({ x, z: z + 0.3, pose: "sit", tag: "study", y: 0.42 });
        }
        fb(g, 2.2, 0.9, 0.05, 0x2F4A3A, 0, 0.9, -(rows - 1) / 2 * 1.05 - 0.75);
        break; }
      case "shelf": {
        fb(g, 1.0, 1.7, 0.32, c, 0, 0, 0.16);
        const bc = [0xC0603F, 0x4A6FA5, 0xE0B54A, 0x2F8A6A, 0x7C5CC4, 0xD98AA0, 0xF4F0E8];
        for (let r = 0; r < 4; r++) { let x = -0.42; let i = r * 3;
          while (x < 0.4) { const w = 0.06 + ((i * 7) % 5) * 0.015, h = 0.26 + ((i * 3) % 4) * 0.03;
            const m = o.glow && r === 2 && i % 5 === 0 ? glow(o.glow) : mat(bc[i % bc.length]);
            fb(g, w, h, 0.22, m, x + w / 2, 0.08 + r * 0.4, 0.2); x += w + 0.015; i++; } }
        break; }
      case "counter":
        fb(g, 1.6, 0.85, 0.55, c, 0, 0, 0); fb(g, 1.7, 0.06, 0.65, 0xD8CBB8, 0, 0.85, 0);
        for (const x of [-0.45, 0.45]) { cyl(g, 0.16, 0.16, 0.05, 0x3B3F4A, x, 0.6, 0.6); cyl(g, 0.03, 0.03, 0.6, 0x3B3F4A, x, 0, 0.6); sp.push({ x, z: 0.62, pose: "sit", tag: "eat", y: o.low ? 0.46 : 0.66, face: Math.PI }); }
        sp.push({ x: 0, z: -0.55, pose: "stand", tag: "cook", y: 0 });
        for (let i = 0; i < 3; i++) cyl(g, 0.08, 0.08, 0.14, [0xE8A87C, 0xC0603F, 0xF4F0E8][i], -0.5 + i * 0.35, 0.91, -0.1);
        break;
      case "stove":
        fb(g, 0.75, 0.85, 0.55, 0x3B3F4A, 0, 0, 0); fb(g, 0.75, 0.04, 0.55, 0x22252C, 0, 0.85, 0);
        cyl(g, 0.2, 0.18, 0.25, 0x9A9A9A, -0.15, 0.89, 0); add(g, new T.CircleGeometry(0.12, 12), glow(0xFF7A3A), 0.2, 0.9, 0.05, false).rotation.x = -Math.PI / 2;
        sp.push({ x: 0, z: 0.58, pose: "stand", tag: "cook", y: 0 }); break;
      case "drums": {
        const k = add(g, new T.CylinderGeometry(0.3, 0.3, 0.32, 16), mat(c), 0, 0.3, 0.12, false); k.rotation.x = Math.PI / 2;
        cyl(g, 0.17, 0.17, 0.12, 0xE8E4DC, -0.42, 0.5, -0.05); cyl(g, 0.15, 0.15, 0.14, c, 0.18, 0.62, -0.05); cyl(g, 0.15, 0.15, 0.14, c, -0.18, 0.62, -0.05);
        cyl(g, 0.02, 0.02, 0.95, 0x9A9A9A, 0.5, 0, -0.1); cyl(g, 0.26, 0.26, 0.015, 0xD8B04A, 0.5, 0.95, -0.1);
        cyl(g, 0.02, 0.02, 1.05, 0x9A9A9A, -0.55, 0, -0.25); cyl(g, 0.22, 0.22, 0.015, 0xD8B04A, -0.55, 1.05, -0.25);
        cyl(g, 0.18, 0.18, 0.06, 0x2B2B2B, 0, 0.36, -0.5); cyl(g, 0.03, 0.03, 0.36, 0x2B2B2B, 0, 0, -0.5);
        sp.push({ x: 0, z: -0.52, pose: "sit", tag: "drum", y: 0.42 }); break; }
      case "bench":
        fb(g, 1.2, 0.08, 0.55, c, 0, 0.76, 0);
        for (const dx of [-0.54, 0.54]) for (const dz of [-0.22, 0.22]) fb(g, 0.06, 0.76, 0.06, 0x3B3F4A, dx, 0, dz);
        fb(g, 0.18, 0.16, 0.14, 0x5A5A5A, -0.4, 0.84, -0.1); fb(g, 0.3, 0.03, 0.08, 0xC0C0C0, 0.1, 0.84, 0.05); cyl(g, 0.05, 0.05, 0.05, 0xD8B04A, 0.35, 0.84, -0.12);
        sp.push({ x: 0, z: 0.6, pose: "stand", tag: "work", y: 0 }); break;
      case "toolwall":
        fb(g, 1.3, 0.85, 0.04, 0xB59570, 0, 1.0, 0.02);
        for (let i = 0; i < 6; i++) fb(g, 0.05, 0.25 + (i % 3) * 0.08, 0.04, [0x9A9A9A, 0xC0603F, 0x2FA85C][i % 3], -0.5 + i * 0.2, 1.15, 0.06);
        break;
      case "rug": {
        const m = new T.Mesh(new T.PlaneGeometry(o.w || 1.6, o.d || 1.2), mat(c)); m.rotation.x = -Math.PI / 2; m.position.y = 0.135; m.receiveShadow = true; g.add(m); break; }
      case "plant":
        cyl(g, 0.16, 0.12, 0.28, 0xB86A45, 0, 0, 0); add(g, new T.IcosahedronGeometry(0.28, 0), mat(0x5E9A55), 0, 0.5, 0, false); break;
      case "poster":
        fb(g, 0.6, 0.8, 0.03, c, 0, 1.05, 0.03); fb(g, 0.44, 0.5, 0.035, 0xF4F0E8, 0, 1.2, 0.035); break;
      case "lamp":
        cyl(g, 0.03, 0.04, 1.3, 0x3B3F4A, 0, 0, 0); add(g, new T.SphereGeometry(0.14, 10, 8), lampMat, 0, 1.38, 0, false); break;
      case "candle":
        cyl(g, 0.12, 0.14, 0.5, 0x3B2E2A, 0, 0, 0); cyl(g, 0.04, 0.04, 0.14, 0xF4F0E8, 0, 0.5, 0); add(g, new T.SphereGeometry(0.04, 6, 5), glow(0xFFB04A), 0, 0.68, 0, false); break;
      case "perch":
        cyl(g, 0.03, 0.04, 1.2, 0x5A4632, 0, 0, 0); fb(g, 0.4, 0.04, 0.05, 0x5A4632, 0, 1.2, 0);
        add(g, new T.SphereGeometry(0.16, 10, 8), mat(0x8A6A4A), 0, 1.4, 0, false);
        for (const x of [-0.06, 0.06]) add(g, new T.SphereGeometry(0.035, 6, 5), glow(0xFFD24A), x, 1.45, 0.14, false);
        break;
      case "cauldron": {
        const m = add(g, new T.SphereGeometry(0.32, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mat(0x22252C), 0, 0.34, 0, false); m.material.side = T.DoubleSide;
        const t = add(g, new T.CircleGeometry(0.28, 14), glow(0x5ED38A), 0, 0.3, 0, false); t.rotation.x = -Math.PI / 2; break; }
      case "mount":
        fb(g, 0.4, 0.4, 0.05, 0x5A4632, 0, 1.35, 0.03); add(g, new T.SphereGeometry(0.13, 8, 6), mat(0x8A6A4A), 0, 1.55, 0.14, false);
        for (const x of [-0.12, 0.12]) { const a = add(g, new T.ConeGeometry(0.025, 0.3, 5), mat(0xE8DCC8), x, 1.78, 0.12, false); a.rotation.z = x > 0 ? -0.5 : 0.5; }
        break;
      case "amp":
        fb(g, 0.5, 0.6, 0.35, 0x22252C, 0, 0, 0); fb(g, 0.4, 0.4, 0.02, 0x3B3F4A, 0, 0.1, 0.18); break;
      case "tank":
        fb(g, 1.0, 0.45, 0.4, 0x3B3F4A, 0, 0, 0.2); fb(g, 0.95, 0.5, 0.35, glow(0x2E8B9A), 0, 0.45, 0.2);
        for (let i = 0; i < 3; i++) add(g, new T.SphereGeometry(0.04, 6, 4), glow(0xBFF2FF), -0.3 + i * 0.3, 0.65 + (i % 2) * 0.1, 0.38, false);
        break;
      case "rods":
        for (let i = 0; i < 3; i++) { const m = cyl(g, 0.012, 0.02, 1.8, 0x3B2E2A, -0.15 + i * 0.15, 0, 0.1); m.rotation.z = 0.12 - i * 0.06; } break;
      case "fridge":
        fb(g, 0.6, 1.4, 0.55, 0xF4F0E8, 0, 0, 0); fb(g, 0.02, 0.4, 0.02, 0x9A9A9A, 0.22, 0.8, 0.28);
        for (let i = 0; i < 4; i++) fb(g, 0.1, 0.12, 0.01, [0xE0578A, 0xF2C14E, 0x2FA85C, 0x4A6FA5][i], -0.18 + (i % 2) * 0.14, 0.9 + ((i / 2) | 0) * 0.18, 0.28);
        break;
      case "stars":
        for (let i = 0; i < 6; i++) add(g, new T.SphereGeometry(0.06, 6, 5), starMat, Math.cos(i * 1.7) * 0.7, 1.6 + (i % 3) * 0.25, Math.sin(i * 1.7) * 0.5, false);
        break;
      case "chimes":
        fb(g, 0.6, 0.04, 0.04, 0x5A4632, 0, 1.9, 0);
        for (let i = 0; i < 5; i++) cyl(g, 0.025, 0.025, 0.3 + i * 0.07, 0xC0C0C0, -0.24 + i * 0.12, 1.55 - i * 0.07, 0);
        break;
      case "lights": {
        const w = 3.1;
        for (let i = 0; i < 12; i++) add(g, new T.SphereGeometry(0.05, 6, 5), i % 3 === 2 ? glow(0x8FB7FF) : lampMat, -w / 2 + i * (w / 11), 2.0 - Math.sin(i / 11 * Math.PI) * 0.18, 0.08, false);
        break; }
      case "display":
        fb(g, 0.9, 0.7, 0.5, 0xE8DCC8, 0, 0, 0);
        fb(g, 0.85, 0.35, 0.45, new T.MeshLambertMaterial({ color: 0xCFE8F0, transparent: true, opacity: 0.45 }), 0, 0.7, 0);
        for (let i = 0; i < 3; i++) cyl(g, 0.08, 0.08, 0.1, [0xF2B5C9, 0xE8A87C, 0xF4E1A6][i], -0.25 + i * 0.25, 0.72, 0);
        break;
      case "newsstand":
        fb(g, 1.4, 0.8, 0.5, 0x6B5A4A, 0, 0, 0);
        for (let i = 0; i < 6; i++) { const m = fb(g, 0.18, 0.24, 0.02, [0xC0603F, 0x4A6FA5, 0xE0B54A, 0x2F8A6A, 0xD98AA0, 0x7C5CC4][i], -0.55 + i * 0.22, 0.82, 0.05); m.rotation.x = -0.4; }
        sp.push({ x: 0, z: -0.5, pose: "stand", tag: "cook", y: 0 }); break;
      case "clothes":
        cyl(g, 0.02, 0.02, 1.4, 0x9A9A9A, -0.5, 0, 0); cyl(g, 0.02, 0.02, 1.4, 0x9A9A9A, 0.5, 0, 0); fb(g, 1.05, 0.03, 0.03, 0x9A9A9A, 0, 1.38, 0);
        for (let i = 0; i < 5; i++) fb(g, 0.16, 0.55, 0.3, [0xC2455A, 0x4A6FA5, 0xF2C14E, 0x2F5D50, 0xE8DCC8][i], -0.36 + i * 0.18, 0.8, 0);
        break;
      case "caseboard":
        fb(g, 1.7, 1.05, 0.05, 0x2F4A3A, 0, 0.75, 0.03); fb(g, 1.8, 0.06, 0.08, 0x8E6A45, 0, 0.72, 0.05);
        for (let i = 0; i < 6; i++) fb(g, 0.2, 0.16, 0.012, [0xF4F0E8, 0xF2E3A0, 0xF4F0E8][i % 3], -0.6 + (i % 3) * 0.6, 1.05 + Math.floor(i / 3) * 0.4, 0.06);
        for (const [x1, y1, x2, y2] of [[-0.6, 1.1, 0, 1.45], [0, 1.45, 0.6, 1.1], [-0.6, 1.5, 0.6, 1.1]]) {
          const len = Math.hypot(x2 - x1, y2 - y1), m = fb(g, len, 0.012, 0.01, 0xC2392B, (x1 + x2) / 2, (y1 + y2) / 2, 0.075); m.rotation.z = Math.atan2(y2 - y1, x2 - x1);
        }
        sp.push({ x: 0, z: 0.5, pose: "stand", tag: "study", y: 0 }); break;
      case "fireplace":
        fb(g, 1.0, 1.05, 0.4, 0x9A8F84, 0, 0, 0.18); fb(g, 1.15, 0.08, 0.48, 0x6B5A4A, 0, 1.05, 0.2);
        fb(g, 0.56, 0.5, 0.05, 0x22252C, 0, 0.08, 0.39);
        add(g, new T.ConeGeometry(0.12, 0.28, 6), glow(0xFF8A3A), -0.08, 0.24, 0.36, false); add(g, new T.ConeGeometry(0.09, 0.22, 6), glow(0xFFC24A), 0.1, 0.21, 0.36, false);
        fb(g, 0.06, 0.32, 0.06, 0xD8B04A, -0.3, 1.13, 0.2); fb(g, 0.18, 0.14, 0.12, 0xF4F0E8, 0.3, 1.13, 0.2);
        break;
      case "stairs":
        for (let i = 0; i < 5; i++) fb(g, 0.6, 0.12, 0.16, 0x8E6A45, 0, i * 0.12, -i * 0.16);
        fb(g, 0.04, 0.6, 0.8, 0x6B4E3A, 0.3, 0.3, -0.32);
        break;
      case "hammock": sp.push({ x: 0, z: 0, pose: "lie", tag: "sleep", y: 0.5, owner: o.owner }); break;
      case "computer": sp.push({ x: 0, z: 0.6, pose: "sit", tag: "study", y: 0.42 }); break;
      case "gamechair": case "readchair": sp.push({ x: 0, z: 0.05, pose: "sit", tag: "relax", y: 0.42 }); break;
      case "magicdesk": sp.push({ x: 0, z: 0.55, pose: "sit", tag: "study", y: 0.42 }); break;
      case "typewriter": sp.push({ x: 0, z: 0.45, pose: "stand", tag: "study", y: 0 }); break;
      case "altar": case "oven": case "arm": sp.push({ x: 0, z: 0.7, pose: "stand", tag: type === "oven" ? "cook" : "work", y: 0 }); break;
      case "stall": sp.push({ x: 0, z: -0.6, pose: "stand", tag: "cook", y: 0 }); break;
      case "crates":
        fb(g, 0.6, 0.5, 0.6, 0x9C7A55, 0, 0, 0); fb(g, 0.5, 0.4, 0.5, 0x8A6A4A, 0.1, 0.5, -0.05); fb(g, 0.45, 0.45, 0.45, 0x9C7A55, 0.6, 0, 0.1);
        break;
    }
    return sp;
  }
  const furnMats = {};
  /* ═════════ 體素風格 ═════════
   * 1. 材質：表面依世界座標切成一格一格的方塊，每格顏色略有深淺，格線微暗；牆腳、家具腳有接觸陰影（AO）。
   * 2. 形狀：圓柱、球、錐、山牆屋頂都換成方塊或階梯狀的方塊堆。
   * 小鎮和房間共用同一組參數，算圖前各自設定格子大小。 */
  const VOXU = { uVox: { value: 0.25 }, uAO: { value: 0.8 }, uFloorY: { value: 0 }, uRoomBox: { value: null } };
  function voxify(m) {
    if (!m || !m.isMeshLambertMaterial || m.userData.vox || m.map) return m;
    m.userData.vox = true;
    m.onBeforeCompile = sh => {
      if (!VOXU.uRoomBox.value) VOXU.uRoomBox.value = new T.Vector4(-1e9, -1e9, 0, 0);
      Object.assign(sh.uniforms, VOXU);
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vVoxWP;\nvarying vec3 vVoxN;")
        .replace("#include <project_vertex>", "#include <project_vertex>\nvVoxWP = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvVoxN = normalize(mat3(modelMatrix) * objectNormal);");
      sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vVoxWP;\nvarying vec3 vVoxN;\nuniform float uVox; uniform float uAO; uniform float uFloorY; uniform vec4 uRoomBox;")
        .replace("#include <color_fragment>", `#include <color_fragment>
          vec3 vn = abs(normalize(vVoxN));
          vec3 q = (vVoxWP - normalize(vVoxN) * 0.02 * uVox) / uVox;
          vec3 cell = floor(q);
          float hh = fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
          diffuseColor.rgb *= 0.93 + hh * 0.13;
          vec3 fq = abs(fract(q) - 0.5);
          float ed = vn.x > 0.6 ? max(fq.y, fq.z) : (vn.y > 0.6 ? max(fq.x, fq.z) : max(fq.x, fq.y));
          diffuseColor.rgb *= mix(1.0, 0.84, smoothstep(0.43, 0.5, ed));
          if (vn.y < 0.6) diffuseColor.rgb *= mix(0.66, 1.0, smoothstep(0.0, uAO, vVoxWP.y - uFloorY));
          if (uRoomBox.z > 0.5 && vn.y > 0.6 && vVoxWP.y < uFloorY + 0.05) {
            float dw = min(vVoxWP.x - uRoomBox.x, vVoxWP.z - uRoomBox.y);
            diffuseColor.rgb *= mix(0.7, 1.0, smoothstep(0.0, 0.6, dw));
          }`);
    };
    m.needsUpdate = true;
    return m;
  }
  // 把幾個方塊合成一個幾何體
  function boxesGeo(list) {
    const pos = [], nor = [], uv = [];
    for (const [w, h, d, x, y, z] of list) {
      const g = new T.BoxGeometry(w, h, d).toNonIndexed(); g.translate(x, y, z);
      pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array); uv.push(...g.attributes.uv.array);
    }
    const out = new T.BufferGeometry();
    out.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
    out.setAttribute("normal", new T.Float32BufferAttribute(nor, 3));
    out.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
    return out;
  }
  // 由下往上越來越窄的方塊堆（錐、屋頂）
  function steps(w0, w1, d0, d1, h, n, yBase, cx, cz) {
    const list = [];
    for (let i = 0; i < n; i++) { const t = (i + 0.5) / n, w = w0 + (w1 - w0) * t, d = d0 + (d1 - d0) * t; list.push([w, h / n, d, cx, yBase + h / n * (i + 0.5), cz]); }
    return boxesGeo(list);
  }
  function voxelizeGroup(g) {
    g.traverse(o => {
      if (!o.isMesh || o.userData.char || o.userData.noVox) return;
      const m = o.material;
      if (!m || !m.isMeshLambertMaterial || m.map) return;
      o.material = voxify(m);
      const geo = o.geometry, t = geo.type, P = geo.parameters || {};
      let ng = null;
      if (/Sphere|Icosahedron|Dodecahedron|Octahedron|Lathe/.test(t)) {
        geo.computeBoundingBox(); const b = geo.boundingBox, sz = new T.Vector3(), c = new T.Vector3(); b.getSize(sz); b.getCenter(c);
        const k = /Octahedron/.test(t) ? 0.7 : 0.84;
        ng = boxesGeo([[sz.x * k, sz.y * k, sz.z * k, c.x, c.y, c.z]]);
      } else if (t === "CylinderGeometry") {
        const rt = P.radiusTop, rb = P.radiusBottom, h = P.height, rm = Math.max(rt, rb);
        if (P.openEnded) return;
        if (Math.abs(rt - rb) < 0.3 * rm) { const r = (rt + rb) / 2 * 1.8; ng = boxesGeo([[r, h, r, 0, 0, 0]]); }
        else ng = steps(rb * 1.8, rt * 1.8, rb * 1.8, rt * 1.8, h, 3, -h / 2, 0, 0);
      } else if (t === "ConeGeometry") {
        const r = P.radius, h = P.height, sq = P.radialSegments === 4;
        const w = sq ? r * Math.SQRT2 : r * 1.8;
        ng = steps(w, w * 0.18, w, w * 0.18, h, sq ? 4 : 3, -h / 2, 0, 0);
        if (sq) o.rotation.y -= 0;   // 已經是方的
      } else if (t === "CircleGeometry") {
        const r = P.radius * 1.6; ng = new T.PlaneGeometry(r, r);
      } else if (t === "ExtrudeGeometry") {
        geo.computeBoundingBox(); const b = geo.boundingBox, sz = new T.Vector3(), c = new T.Vector3(); b.getSize(sz); b.getCenter(c);
        ng = steps(sz.x, sz.x * 0.12, sz.z, sz.z, sz.y, 5, b.min.y, c.x, c.z);
      }
      if (ng) o.geometry = ng;
    });
  }
  /* ═════════ 方塊小鎮：形狀換成方塊、貼上 16×16 像素貼圖 ═════════ */
  const PX = 16, TILE = 1.0;          // 一張貼圖 16 格，鋪滿 1 單位
  const pixTex = {};
  function pixelTexture(hex) {
    if (pixTex[hex]) return pixTex[hex];
    const c = new T.Color(hex), hsl = {}; c.getHSL(hsl);
    const cv = document.createElement("canvas"); cv.width = cv.height = PX; const g = cv.getContext("2d");
    let seed = hex * 9301 + 49297; const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    const kind = hsl.s > 0.22 && hsl.h > 0.17 && hsl.h < 0.45 ? "leaf"
      : hsl.s < 0.12 ? "stone"
      : hsl.h > 0.03 && hsl.h < 0.13 && hsl.l < 0.42 ? "plank" : "plain";
    const put = (x, y, k) => { const q = c.clone(); q.offsetHSL(0, 0, k); g.fillStyle = "#" + q.getHexString(); g.fillRect(x, y, 1, 1); };
    for (let y = 0; y < PX; y++) for (let x = 0; x < PX; x++) {
      let k = (rnd() - 0.5) * (kind === "leaf" ? 0.12 : kind === "stone" ? 0.07 : 0.045);
      if (kind === "leaf" && rnd() < 0.12) k -= 0.08;
      if (kind === "stone" && (x % 8 === 0 || y % 8 === ((x >> 3) % 2 ? 4 : 0))) k -= 0.06;
      if (kind === "plank" && y % 4 === 3) k -= 0.07;
      if (kind === "plank" && y % 4 === 0 && x === ((y >> 2) * 5) % PX) k -= 0.07;
      if (kind === "plain" && rnd() < 0.05) k -= 0.04;
      put(x, y, k);
    }
    const t = new T.CanvasTexture(cv);
    t.magFilter = T.NearestFilter; t.minFilter = T.NearestMipmapLinearFilter; t.wrapS = t.wrapT = T.RepeatWrapping;
    return (pixTex[hex] = t);
  }
  const pixMats = {};
  function pixelMat(m) {
    const hex = m.color.getHex(), k = hex + "|" + m.side;
    if (!pixMats[k]) pixMats[k] = new T.MeshLambertMaterial({ map: pixelTexture(hex), side: m.side });
    return pixMats[k];
  }
  // 依每個面的方向用世界尺寸重算貼圖座標，大小不同的方塊像素一樣大
  function worldUV(o) {
    const geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    geo.computeVertexNormals();
    const pos = geo.attributes.position, nor = geo.attributes.normal, sc = new T.Vector3(); o.getWorldScale(sc);
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) * sc.x, y = pos.getY(i) * sc.y, z = pos.getZ(i) * sc.z;
      const ax = Math.abs(nor.getX(i)), ay = Math.abs(nor.getY(i)), az = Math.abs(nor.getZ(i));
      let u, v;
      if (ay >= ax && ay >= az) { u = x; v = z; } else if (ax >= az) { u = z; v = y; } else { u = x; v = y; }
      uv[i * 2] = u / TILE; uv[i * 2 + 1] = v / TILE;
    }
    geo.setAttribute("uv", new T.BufferAttribute(uv, 2));
    o.geometry = geo;
  }
  function blockify(g) {
    g.updateMatrixWorld(true);
    g.traverse(o => {
      if (!o.isMesh || o.userData.char || o.userData.noVox) return;
      let p = o.parent; while (p) { if (p.userData && p.userData.isWalker) return; p = p.parent; }
      const m = o.material;
      if (!m || !m.isMeshLambertMaterial || m.map || m.transparent) return;
      const emis = m.emissive && m.emissive.getHex() !== 0;
      const geo = o.geometry, t = geo.type, P = geo.parameters || {};
      let ng = null;
      if (/Sphere|Icosahedron|Dodecahedron|Octahedron|Lathe/.test(t)) {
        geo.computeBoundingBox(); const b = geo.boundingBox, sz = new T.Vector3(), c = new T.Vector3(); b.getSize(sz); b.getCenter(c);
        const k = /Octahedron/.test(t) ? 0.7 : 0.84;
        ng = boxesGeo([[sz.x * k, sz.y * k, sz.z * k, c.x, c.y, c.z]]);
      } else if (t === "CylinderGeometry") {
        const rt = P.radiusTop, rb = P.radiusBottom, h = P.height, rm = Math.max(rt, rb);
        if (!P.openEnded) {
          if (Math.abs(rt - rb) < 0.3 * rm) { const r = (rt + rb) / 2 * 1.8; ng = boxesGeo([[r, h, r, 0, 0, 0]]); }
          else ng = steps(rb * 1.8, rt * 1.8, rb * 1.8, rt * 1.8, h, 3, -h / 2, 0, 0);
        }
      } else if (t === "ConeGeometry") {
        const r = P.radius, h = P.height, sq = P.radialSegments === 4;
        const w = sq ? r * Math.SQRT2 : r * 1.8;
        ng = steps(w, w * 0.18, w, w * 0.18, h, sq ? 4 : 3, -h / 2, 0, 0);
      } else if (t === "TorusGeometry") {
        const R = P.radius + P.tube, tb = P.tube * 2;
        ng = boxesGeo([[R * 2, tb, tb, 0, R - tb / 2, 0], [R * 2, tb, tb, 0, -R + tb / 2, 0], [tb, R * 2, tb, R - tb / 2, 0, 0], [tb, R * 2, tb, -R + tb / 2, 0, 0]]);
      } else if (t === "ExtrudeGeometry") {
        geo.computeBoundingBox(); const b = geo.boundingBox, sz = new T.Vector3(), c = new T.Vector3(); b.getSize(sz); b.getCenter(c);
        ng = steps(sz.x, sz.x * 0.12, sz.z, sz.z, sz.y, 5, b.min.y, c.x, c.z);
      }
      if (ng) o.geometry = ng;
      if (emis) return;                    // 發光的東西（窗、燈）不貼圖
      worldUV(o);
      o.material = pixelMat(m);
    });
  }
  function warmMat(m) {
    if (!m || !m.color || (m.emissive && m.emissive.getHex() !== 0) || m.transparent) return m;
    const k = m.color.getHex();
    if (!furnMats[k]) furnMats[k] = new T.MeshLambertMaterial({ color: k, emissive: k, emissiveIntensity: 0.1, side: m.side });
    return furnMats[k];
  }
  function buildInterior(l, L, g) {
    const R0 = RECT[L.type];
    if (!(N.interiors && N.interiors[l.id]) || !R0) return;
    const spec = floorsOf(l.id)[0].items || [];
    const ig = new T.Group(); ig.visible = false; g.add(ig); L.interior = ig;
    for (const [type, u, v, o0] of spec) {
      const o = o0 || {}, item = new T.Group();
      const x = R0[0] + u * (R0[1] - R0[0]), z = R0[2] + v * (R0[3] - R0[2]);
      item.position.set(x, 0, z);
      const a = (o.rot || 0) * Math.PI / 180; item.rotation.y = a;
      ig.add(item);
      for (const sp of furn(type, o, item)) {
        const wx = x + sp.x * Math.cos(a) + sp.z * Math.sin(a), wz = z - sp.x * Math.sin(a) + sp.z * Math.cos(a);
        L.spots.push({ x: L.x + wx, z: L.z + wz, pose: sp.pose, tag: sp.tag, y: sp.y, owner: sp.owner, yaw: a + faceOf(sp) });
      }
    }
    ig.traverse(m => { if (m.isMesh) m.material = warmMat(m.material); });
  }
  const TAGS = [["cook", /營業|備料|揉麵團|試新菜|煮晚餐|甜湯|時段|顧店|尖峰/], ["drum", /鼓|練團/], ["eat", /吃|餐|宵夜|點心|甜點|泡麵|討|茶/],
    ["work", /修|焊|磨|零件|手工|工作台|設計圖|機器|保養|做/], ["study", /讀|書|寫|報告|查|筆記|自修|作業|功課|資料|稿|課|整理|口供|照片|研究|白板|委託|帳本/]];
  function tagOf(w) { if (!w.avail) return "sleep"; for (const [t, re] of TAGS) if (re.test(w.act || "")) return t; return "relax"; }
  // 為同一地點的人分配家具位置；回傳 id → spot（沒有合適家具的不在裡面）
  // 坐、躺時面向哪裡（家具自己的座標）：吃飯面向桌子中央，讀書面向桌面，其餘朝前
  function faceOf(sp) {
    if (sp.face != null) return sp.face;
    if (sp.tag === "eat") return Math.abs(sp.x) + Math.abs(sp.z) < 0.05 ? 0 : Math.atan2(-sp.x, -sp.z);
    if (sp.tag === "study") return Math.PI;
    return 0;
  }
  function seatPeople(L, ids, where) {
    const out = {}, used = new Set(), sp = L.spots;
    const take = (id, pred) => { const i = sp.findIndex((s, k) => !used.has(k) && pred(s)); if (i < 0) return false; used.add(i); out[id] = sp[i]; return true; };
    const sleepers = ids.filter(id => !where[id].avail), awake = ids.filter(id => where[id].avail);
    for (const id of sleepers) take(id, s => s.tag === "sleep" && s.owner === id) || take(id, s => s.tag === "sleep" && !s.owner) || take(id, s => s.tag === "relax");
    for (const id of awake) {
      const t = tagOf(where[id]);
      take(id, s => s.tag === t) || take(id, s => s.tag === "relax") || take(id, s => s.tag === "eat" || s.tag === "study");
    }
    return out;
  }

  /* ═════════ 文字與泡泡貼圖 ═════════ */
  const FONT = '-apple-system, "PingFang TC", "Noto Sans CJK TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif';
  function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function textSprite(text, o) {
    const c = document.createElement("canvas"), ctx = c.getContext("2d");
    const fs = o.size || 30, pad = o.pad || 12;
    ctx.font = `700 ${fs}px ${FONT}`;
    const w = Math.ceil(ctx.measureText(text).width) + pad * 2, h = fs + pad * 1.3;
    c.width = w; c.height = h;
    ctx.font = `700 ${fs}px ${FONT}`;
    ctx.fillStyle = o.bg; roundRect(ctx, 1, 1, w - 2, h - 2, h / 2 - 1); ctx.fill();
    if (o.border) { ctx.strokeStyle = o.border; ctx.lineWidth = 3; ctx.stroke(); }
    ctx.fillStyle = o.fg; ctx.textBaseline = "middle"; ctx.fillText(text, pad, h / 2 + 1);
    const tex = new T.CanvasTexture(c); tex.minFilter = T.LinearFilter;
    const sp = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
    const H = o.h || 0.9; sp.scale.set(H * w / h, H, 1);
    return sp;
  }
  function wrapText(ctx, text, maxW) {
    const lines = []; let cur = "";
    for (const ch of text) {
      if (ctx.measureText(cur + ch).width > maxW && cur) { lines.push(cur); cur = ch; } else cur += ch;
    }
    if (cur) lines.push(cur);
    if (lines.length > 3) { lines.length = 3; lines[2] = lines[2].slice(0, -1) + "…"; }
    return lines;
  }
  function bubbleSprite(text, color, kind) {
    const c = document.createElement("canvas"), ctx = c.getContext("2d");
    const fs = 30, pad = 18, maxW = 330;
    ctx.font = `600 ${fs}px ${FONT}`;
    const lines = wrapText(ctx, text, maxW);
    const tw = Math.max(...lines.map(s => ctx.measureText(s).width));
    const w = Math.ceil(tw + pad * 2), lh = fs * 1.32, bh = Math.ceil(lines.length * lh + pad * 1.4), tail = 18;
    c.width = w + 4; c.height = bh + tail + 4;
    ctx.font = `600 ${fs}px ${FONT}`;
    ctx.fillStyle = kind === "love" ? "#FFF0F4" : kind === "think" ? "#F2F0FA" : "#FFFDF8";
    roundRect(ctx, 2, 2, w, bh, 22); ctx.fill();
    ctx.beginPath(); ctx.moveTo(w / 2 - 14, bh); ctx.lineTo(w / 2, bh + tail); ctx.lineTo(w / 2 + 14, bh); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = 4;
    roundRect(ctx, 2, 2, w, bh, 22); ctx.stroke();
    ctx.fillStyle = "#2b2a28"; ctx.textBaseline = "top";
    lines.forEach((s, i) => ctx.fillText(s, pad + 2, pad * 0.75 + 2 + i * lh));
    const tex = new T.CanvasTexture(c); tex.minFilter = T.LinearFilter;
    const sp = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
    const H = 0.0125 * c.height; sp.scale.set(H * c.width / c.height, H, 1);
    sp.center.set(0.5, 0);
    sp.renderOrder = 20;
    return sp;
  }
  function emojiSprite(e, size) {
    const c = document.createElement("canvas"); c.width = c.height = 96;
    const ctx = c.getContext("2d"); ctx.font = `72px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(e, 48, 54);
    const tex = new T.CanvasTexture(c);
    const sp = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    sp.scale.set(size || 1, size || 1, 1);
    return sp;
  }

  /* ═════════ 居民 ═════════ */
  const texLoader = () => new T.TextureLoader();
  function avatarTexture(c) {
    const f = N.avatars && N.avatars[c.id];
    const cv = document.createElement("canvas"); cv.width = cv.height = 128;
    const ctx = cv.getContext("2d");
    ctx.fillStyle = c.color; ctx.beginPath(); ctx.arc(64, 64, 62, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.font = `700 60px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(c.id[0], 64, 68);
    const tex = new T.CanvasTexture(cv);
    if (f) {
      const img = new Image();
      img.onload = () => { ctx.clearRect(0, 0, 128, 128); ctx.drawImage(img, 0, 0, 128, 128); tex.needsUpdate = true; };
      img.src = "icons/avatars/" + f + ".webp";
    }
    return tex;
  }
  // 低多邊形小人（沒有外型資料時退回圓柱＋頭像）
  function chibiFor(id, k, parent) {
    // 有 skin 的角色用方塊小人，其他人先用圖示人形
    const ch = N.blocky && N.blocky.has(id) ? N.blocky.make(T, id) : N.picto && N.picto.has(id) ? N.picto.make(T, id) : null;
    if (!ch) return null;
    ch.root.scale.set(k, k, k); ch.k = k; parent.add(ch.root);
    return ch;
  }
  function turnTo(cur, want, f) { let d = want - cur; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return cur + d * f; }
  function makeWalker(c) {
    const g = new T.Group();
    const body = add(g, new T.CylinderGeometry(0.26, 0.4, 0.78, 12), mat(new T.Color(c.color).getHex()), 0, 0.39, 0);
    const shadow = new T.Mesh(new T.CircleGeometry(0.5, 16), new T.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.14; g.add(shadow);
    const head = new T.Sprite(new T.SpriteMaterial({ map: avatarTexture(c), transparent: true }));
    head.scale.set(1.3, 1.3, 1); head.position.y = 1.35; head.userData.char = c.id; g.add(head);
    const ring = new T.Mesh(new T.TorusGeometry(0.62, 0.07, 6, 28), new T.MeshBasicMaterial({ color: 0xD8A75A }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.16; ring.visible = false; g.add(ring);
    const zz = emojiSprite("💤", 0.7); zz.position.set(0.6, 2.1, 0); zz.visible = false; g.add(zz);
    const name = textSprite(c.id, { size: 26, bg: "rgba(24,27,38,.78)", fg: "#fff", pad: 10, h: 0.5 });
    name.position.y = 0.0; name.center.set(0.5, 1.2); name.visible = false; g.add(name);
    g.scale.set(1.45, 1.45, 1.45); g.userData.isWalker = true;
    root.add(g);
    const ch = chibiFor(c.id, 0.62, g);
    if (ch) { body.visible = false; head.visible = false; zz.position.y = 1.45; }
    return { id: c.id, color: c.color, g, body, head, ring, zz, name, ch, yaw: 0, pos: new T.Vector3(), path: [], loc: null, asleep: false, phase: Math.random() * 6, fade: 1, train: false };
  }
  function spotFor(locId, i, n) {
    const L = lots[locId]; if (!L) return null;
    if (L.open) {
      const r = n > 1 ? 1.5 + n * 0.12 : 0, a = (i / Math.max(1, n)) * Math.PI * 2 + 0.6;
      const off = L.type === "tower" || L.type === "park" ? 1.6 : L.type === "lake" ? 0 : 0.8;
      return new T.Vector3(L.x + Math.sin(a) * r * (L.type === "lake" ? 1.6 : 1), 0, L.z + off + Math.cos(a) * r * (L.type === "lake" ? 1.6 : 1));
    }
    // 室內最多六個位置，再多的人站到門口
    const inside = Math.min(n, 6);
    if (i < inside) {
      const cols = inside <= 2 ? inside : 3, row = Math.floor(i / cols), inRow = Math.min(cols, inside - row * cols), k = i % cols;
      const rows = Math.ceil(inside / cols);
      return new T.Vector3(L.x + (k - (inRow - 1) / 2) * 1.05, 0, L.z - 0.7 + (row - (rows - 1) / 2) * 1.0);
    }
    const j = i - inside, perRow = 5, row = Math.floor(j / perRow), inRow = Math.min(perRow, n - inside - row * perRow), k = j % perRow;
    return new T.Vector3(L.x + (k - (inRow - 1) / 2) * 1.2, 0, L.z + 2.2 + row * 1.15);
  }
  const doorOf = id => { const L = lots[id]; return L && !L.open ? new T.Vector3(L.x, 0, L.z + 2.3) : null; };
  function routeTo(w, dest, destLoc) {
    routeCore(w, dest, destLoc);
    const d1 = w.loc && doorOf(w.loc), d2 = doorOf(destLoc);
    if (w.train) return;
    if (d2 && w.path.length) w.path.splice(w.path.length - 1, 0, d2);
    if (d1) w.path.unshift(d1);
  }
  function routeCore(w, dest, destLoc) {
    const from = w.pos.clone(), a = w.loc && E_loc(w.loc), b = E_loc(destLoc);
    w.path = [];
    if (!a || !b) { w.g.position.copy(dest); w.pos.copy(dest); return; }
    const sameBlock = a.region === b.region && a.page === b.page;
    const far = (a.region === "outer" && a.page > 0) || (b.region === "outer" && b.page > 0);
    if (far && !sameBlock) { w.train = true; w.trainT = 0; w.trainTo = dest.clone(); return; }
    if (sameBlock) { w.path = [dest]; return; }
    const ba = blockOf(a), bb = blockOf(b);
    const ex1 = Math.abs(from.x - (ba[0] - 2)) < Math.abs(from.x - (ba[0] + 16)) ? ba[0] - 2 : ba[0] + 16;
    const ex2 = Math.abs(dest.x - (bb[0] - 2)) < Math.abs(dest.x - (bb[0] + 16)) ? bb[0] - 2 : bb[0] + 16;
    const roads = [-27, -2, 23];
    let rz = roads[0], best = 1e9;
    for (const z of roads) { const d = Math.abs(from.z - z) + Math.abs(dest.z - z); if (d < best) { best = d; rz = z; } }
    const V = (x, z) => new T.Vector3(x, 0, z);
    w.path = [V(ex1, from.z), V(ex1, rz), V(ex2, rz), V(ex2, dest.z), dest];
  }
  function E_loc(id) { return N.locations.find(l => l.id === id); }

  /* ═════════ 天空、天氣、光 ═════════ */
  const SKY = [[0, 0x141A2E], [300, 0x1F2546], [350, 0xE7A987], [420, 0xCFE3EC], [720, 0xBEE0EF], [1000, 0xD3E3E6], [1060, 0xEBA178], [1120, 0x6A5C8A], [1180, 0x222A48], [1440, 0x141A2E]];
  const SUNC = [[0, 0xFFB088], [360, 0xFFB088], [450, 0xFFD6B0], [600, 0xFFF2E2], [840, 0xFFF0DA], [960, 0xFFDDB0], [1050, 0xFFB070], [1130, 0xFF8A60], [1440, 0xFF8A60]];
  const HEMIC = [[0, 0xFFD8C0], [360, 0xFFD8C0], [480, 0xE8EEFF], [900, 0xE4EEFF], [1020, 0xFFE6CC], [1100, 0xFFC8A8], [1440, 0xFFC8A8]];
  function lerpKeys(keys, m) {
    for (let i = 0; i < keys.length - 1; i++) {
      const [a, ca] = keys[i], [b, cb] = keys[i + 1];
      if (m >= a && m <= b) return new T.Color(ca).lerp(new T.Color(cb), (m - a) / (b - a));
    }
    return new T.Color(keys[0][1]);
  }
  function nightFactor(m) {
    if (m < 300 || m > 1170) return 1;
    if (m < 390) return 1 - (m - 300) / 90;
    if (m > 1050) return (m - 1050) / 120;
    return 0;
  }
  function applySky(min, weather) {
    let sky = lerpKeys(SKY, min);
    const nf = nightFactor(min);
    const noon = Math.max(0, 1 - Math.abs(min - 750) / 240);   // 中午前後把光壓低一點
    let sunI = (0.95 - noon * 0.2) * (1 - nf) + 0.1, hemiI = (0.26 - noon * 0.06) * (1 - nf) + 0.3;
    if (weather === "雨") { sky.lerp(new T.Color(0x6E7886), 0.55 * (1 - nf * 0.6)); sunI *= 0.35; hemiI *= 0.9; }
    if (weather === "多雲") { sky.lerp(new T.Color(0xC9CED3), 0.35 * (1 - nf)); sunI *= 0.7; }
    if (weather === "霧") { sky.lerp(new T.Color(0xD8D8D2), 0.6 * (1 - nf * 0.5)); sunI *= 0.55; }
    scene.background = sky;
    scene.fog.color.copy(sky);
    const near = weather === "霧" ? 34 : 70, far = weather === "霧" ? 120 : 190;
    scene.fog.near = near; scene.fog.far = far;
    const ang = ((Math.min(1140, Math.max(330, min)) - 330) / 810) * Math.PI;
    const t = TOWN_C, step = Math.round(ang * 72 / Math.PI) * Math.PI / 72, el = Math.sin(step);   // 每 10 分鐘換一次角度
    sun.position.set(t.x + Math.cos(step) * 80, 16 + el * 60, t.z + 52);
    sun.target.position.copy(t); sun.target.updateMatrixWorld();
    if (nf > 0.5) sun.position.set(t.x - 34, 86, t.z + 40);   // 夜裡是月光
    const sk = sun.position.x.toFixed(1) + "," + sun.position.y.toFixed(1);
    if (sk !== perf.sunKey) { perf.sunKey = sk; renderer.shadowMap.needsUpdate = true; }
    sun.intensity = sunI;
    sun.color.copy(nf > 0.5 ? new T.Color(0x9FB0E0) : lerpKeys(SUNC, min));
    hemi.intensity = hemiI;
    hemi.color.copy(nf > 0.5 ? new T.Color(0x6F7FB8) : lerpKeys(HEMIC, min));
    hemi.groundColor.set(nf > 0.5 ? 0x2A2838 : 0x8A7458);
    moonFill.intensity = nf * 0.35;
    winMat.emissiveIntensity = 0.15 + nf * 1.05;
    for (const k in furnMats) furnMats[k].emissiveIntensity = 0.06 + nf * 0.42;
    lampMat.emissiveIntensity = nf > 0.2 ? 1.2 : 0.1;
    if (poolMat) poolMat.opacity = Math.max(0, nf - 0.15) * 0.75;
    lanternMat.emissiveIntensity = 0.4 + nf * 1.1;
    clockMat.emissiveIntensity = 0.25 + nf * 0.7;
    stars.material.opacity = weather === "雨" || weather === "霧" ? nf * 0.25 : nf * 0.9;
    rain.visible = weather === "雨";
    const cloudy = weather === "多雲" || weather === "雨" ? 1 : weather === "晴" ? 0.4 : 0.2;
    clouds.forEach((c, i) => { c.visible = i / clouds.length < cloudy; });
    cloudMat.color.set(weather === "雨" ? 0x9AA2AC : nf > 0.5 ? 0x3E4766 : 0xFFFFFF);
    fireflies.visible = nf > 0.6 && weather !== "雨";
  }
  let cloudMat;

  function ensureMats() {
    if (winMat) return;
    winMat = new T.MeshLambertMaterial({ color: 0x3E4A63, emissive: 0xFFC56B, emissiveIntensity: 0.2 });
    lampMat = new T.MeshLambertMaterial({ color: 0xFFF1C8, emissive: 0xFFD27A, emissiveIntensity: 0.1 });
    lanternMat = new T.MeshLambertMaterial({ color: 0xD9473A, emissive: 0xFF5A3A, emissiveIntensity: 0.6 });
    clockMat = new T.MeshLambertMaterial({ color: 0xFFF8E6, emissive: 0xFFF0C8, emissiveIntensity: 0.3, side: T.DoubleSide });
    starMat = new T.MeshLambertMaterial({ color: 0xE8D8FF, emissive: 0xB89BFF, emissiveIntensity: 1 });
    waterMat = new T.MeshLambertMaterial({ color: 0x6FB2C8, emissive: 0x1C4D5E, emissiveIntensity: 0.3 });
  }
  /* ═════════ 建立場景 ═════════ */
  // 分段蓋，每段之間讓畫面喘口氣，載入頁的進度條才會動
  const breathe = (onP, p, label) => { if (onP) onP(p, label); return new Promise(r => setTimeout(r, 0)); };
  async function build(onP) {
    await breathe(onP, 0.04, "整理街道……");
    renderer = new T.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "low-power" });
    renderer.setPixelRatio(perf.ratio = Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = true;   // 影子只在太陽換角度時重算
    renderer.domElement.className = "t3d-canvas";
    scene = new T.Scene();
    scene.fog = new T.Fog(0xBEE0EF, 70, 190);
    camera = new T.PerspectiveCamera(36, 1, 0.5, 400);
    cam.target = new T.Vector3(14, 0, 6);
    root = new T.Group(); scene.add(root);

    hemi = new T.HemisphereLight(0xFFF7E8, 0x6A6658, 0.6); scene.add(hemi);
    moonFill = new T.DirectionalLight(0x8090D0, 0); moonFill.position.set(-30, 40, -20); scene.add(moonFill);
    sun = new T.DirectionalLight(0xFFF4E0, 0.9);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera; sc.left = -64; sc.right = 64; sc.top = 64; sc.bottom = -64; sc.near = 1; sc.far = 220;
    sun.shadow.bias = -0.0008;
    scene.add(sun); scene.add(sun.target);

    ensureMats();

    // 地面
    const grass = new T.Mesh(new T.PlaneGeometry(420, 420), mat(0x86A462)); grass.rotation.x = -Math.PI / 2; grass.receiveShadow = true; root.add(grass);
    const road = new T.Mesh(new T.PlaneGeometry(76, 56), mat(0x8A8C92)); road.rotation.x = -Math.PI / 2; road.position.set(16, 0.02, -2); road.receiveShadow = true; root.add(road);
    // 河
    const river = new T.Mesh(new T.PlaneGeometry(6, 90), waterMat); river.rotation.x = -Math.PI / 2; river.position.set(-26, 0.04, -4); root.add(river);
    for (const z of [-14.5, 10.5]) box(root, 7, 0.3, 3, mat(0xA3917A), -26, 0, z);
    // 街區地坪
    for (const r of N.regions) r.pages.forEach((pg, i) => {
      const b = BLOCK[r.id + i]; if (!b) return;
      const sample = N.locations.find(l => l.region === r.id && l.page === i);
      const pal = sample ? palOf(sample) : PAL.central;
      const ext = r.id === "outer" && i > 0;
      if (ext) {
        const island = new T.Mesh(new T.CylinderGeometry(15, 16, 1, 7), mat(0x9DB685)); island.position.set(b[0] + 7, -0.48, b[1] + 10.5); island.receiveShadow = true; root.add(island);
      }
      const slab = new T.Mesh(new T.BoxGeometry(14.6, 0.1, 21.6), mat(pal.ground)); slab.position.set(b[0] + 7, 0.05, b[1] + 10.5); slab.receiveShadow = true; root.add(slab);
      const ds = textSprite(ext ? pg.replace("列車可達：", "🚆 ") : `${r.name}・${pg}`, { size: 40, bg: "rgba(24,27,38,.72)", fg: "#fff", pad: 18, h: 2.2 });
      ds.position.set(b[0] + 7, 12, b[1] + 10.5); ds.renderOrder = 4; root.add(ds); districtSprites.push(ds);
    });
    // 鐵道
    const railM = mat(0x5A5A5A), tieM = mat(0x7A5A3E);
    const rail = (x0, z0, x1, z1) => {
      const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz), ang = Math.atan2(dx, dz);
      const g = new T.Group(); g.position.set(x0, 0.08, z0); g.rotation.y = ang;
      for (const o of [-0.45, 0.45]) { const m = new T.Mesh(new T.BoxGeometry(0.1, 0.1, len), railM); m.position.set(o, 0.05, len / 2); g.add(m); }
      for (let s = 0; s < len; s += 1.1) { const m = new T.Mesh(new T.BoxGeometry(1.3, 0.06, 0.28), tieM); m.position.set(0, 0, s); g.add(m); }
      root.add(g);
    };
    rail(50, 6, 62, -14); rail(50, 8, 62, 10); rail(-36, 23.5, 50, 23.5);
    // 路燈
    // 外圍的樹
    for (let i = 0; i < 70; i++) {
      const a = (i * 137.5) * Math.PI / 180, r = 52 + (i % 7) * 4.5;
      const x = 18 + Math.cos(a) * r, z = -2 + Math.sin(a) * r * 0.7;
      if (x > 54 && x < 80 && z > -30 && z < 25) continue;
      tree(root, x, z, 1 + (i % 3) * 0.3, i % 3 ? "pine" : null);
    }
    await breathe(onP, 0.1, "鋪人行道、立路燈……");
    buildStreets();
    await breathe(onP, 0.2, "蓋房子……");
    // 地點
    for (let i = 0; i < N.locations.length; i++) {
      buildLot(N.locations[i]);
      if (i % 4 === 3) await breathe(onP, 0.2 + 0.55 * i / N.locations.length, `蓋房子……（${i + 1}／${N.locations.length}）`);
    }
    await breathe(onP, 0.78, "種樹、整理花圃……");
    // 街區裡沒有地點的空格：補小花園或背景小屋
    if (N.voxTown) for (const k in BLOCK) {
      const used = new Set(N.locations.filter(l => l.region + l.page === k).map(l => l.slot));
      const reg = k === "outer1" ? "pero" : k === "outer2" ? "other" : k.replace(/\d+$/, ""), pal = PAL[reg] || PAL.central;
      for (let slot = 0; slot < 6; slot++) {
        if (used.has(slot)) continue;
        const p = lotPos({ region: k.replace(/\d+$/, ""), page: +k.slice(-1), slot }), hh = hashStr(k + slot);
        const r = N.voxTown.filler(T, { kind: hh % 2 ? "cottage" : "garden", reg, seed: hh, wall: pal.wall[hh % pal.wall.length], roof: pal.roof[(hh >> 3) % pal.roof.length], winMat, lampMat });
        const g = new T.Group(); g.position.set(p.x, VOXY, p.z); r.meshes.forEach(m => g.add(m)); root.add(g);
        r.lamps.forEach(([x, z]) => lampSpots.push([p.x + x, p.z + z]));
      }
    }
    buildLampPools();
    // 星星
    const sg = new T.BufferGeometry(), sp = [];
    for (let i = 0; i < 400; i++) { const a = Math.random() * Math.PI * 2, e = 0.15 + Math.random() * 1.2, r = 220; sp.push(Math.cos(a) * Math.cos(e) * r + 16, Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r); }
    sg.setAttribute("position", new T.Float32BufferAttribute(sp, 3));
    stars = new T.Points(sg, new T.PointsMaterial({ color: 0xFFFFFF, size: 1.3, sizeAttenuation: false, transparent: true, opacity: 0, fog: false }));
    scene.add(stars);
    // 雨
    const rg = new T.BufferGeometry(), rp = [];
    for (let i = 0; i < 1400; i++) rp.push((Math.random() - 0.5) * 80, Math.random() * 30, (Math.random() - 0.5) * 80);
    rg.setAttribute("position", new T.Float32BufferAttribute(rp, 3));
    rain = new T.Points(rg, new T.PointsMaterial({ color: 0xA9BCD0, size: 0.16, transparent: true, opacity: 0.75 }));
    rain.visible = false; scene.add(rain);
    // 雲
    cloudMat = new T.MeshLambertMaterial({ color: 0xFFFFFF, transparent: true, opacity: 0.85, emissive: 0x555555, emissiveIntensity: 0.4 });
    for (let i = 0; i < 9; i++) {
      const c = new T.Group();
      for (let k = 0; k < 4; k++) { const m = new T.Mesh(new T.IcosahedronGeometry(1.6 + (k % 2) * 0.8, 1), cloudMat); m.position.set(k * 1.7 - 2.5, (k % 2) * 0.5, (k % 3) * 0.6); c.add(m); }
      c.position.set(-30 + i * 13, 34 + (i % 3) * 3, -30 + (i * 17) % 55); c.userData.v = 0.6 + (i % 4) * 0.25;
      scene.add(c); clouds.push(c);
    }
    // 螢火蟲（公園、河岸的夜晚）
    const fg = new T.BufferGeometry(), fp = [];
    const fpark = lots["諾文公園"], friver = lots["諾文河岸步道"];
    for (let i = 0; i < 60; i++) { const L = i % 2 ? fpark : friver; if (!L) continue; fp.push(L.x + (Math.random() - 0.5) * 6, 0.5 + Math.random() * 2.5, L.z + (Math.random() - 0.5) * 6); }
    fg.setAttribute("position", new T.Float32BufferAttribute(fp, 3));
    fireflies = new T.Points(fg, new T.PointsMaterial({ color: 0xFFF2A0, size: 0.18, transparent: true, opacity: 0.9 }));
    fireflies.userData.base = fp.slice(); scene.add(fireflies);
    festGroup = new T.Group(); scene.add(festGroup);
    // 居民（之後加進來的會動的東西都不投影子：影子是靜態的，改用腳下的圓影）
    const nStatic = root.children.length;
    await breathe(onP, 0.9, "叫醒居民……");
    for (const c of N.characters) walkers[c.id] = makeWalker(c);
    // 相遇提示
    for (const l of N.locations) {
      const s = emojiSprite("💬", 1.3); s.visible = false; s.userData.loc = l.id; s.renderOrder = 6;
      root.add(s); hintMarks[l.id] = s;
    }
    buildLife();
    root.children.slice(nStatic).forEach(o => o.traverse(m => { m.castShadow = false; }));
    clouds.forEach(c => c.traverse(m => { m.castShadow = false; }));
    blockify(root);
    bindInput(renderer.domElement);
    built = true;
    await breathe(onP, 1, "好了！");
  }


  /* ═════════ 街道：號誌、斑馬線、車、站牌、郵筒…… ═════════ */
  const traffic = [];
  function buildStreets() {
    const R0 = root, M = c => mat(c);
    const B = (w, h, d, c, x, y, z, p) => box(p || R0, w, h, d, typeof c === "number" ? M(c) : c, x, y || 0, z);
    const G = (x, z, ry) => { const g = new T.Group(); g.position.set(x, 0, z); g.rotation.y = ry || 0; R0.add(g); return g; };
    const rnd = (a, b) => { const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x); };
    const glowM = c => new T.MeshBasicMaterial({ color: c });
    const SIDE = 0.75, SH = 0.16, SWALK = 0xE8DECE, CURBC = 0xB8AC98;

    /* ── 小物件 ── */
    const KIT = {
      tree(x, z, s, c) { s = s || 1; const g = G(x, z); box(g, 0.18 * s, 1.1 * s, 0.18 * s, M(0x7A4E32), 0, SH, 0);
        for (const [dx, dy, dz, r] of [[0, 1.6, 0, 0.75], [0.4, 1.35, 0.15, 0.5], [-0.35, 1.45, -0.15, 0.55]]) add(g, new T.IcosahedronGeometry(r * s, 0), mat(c || 0x7AAE5A), dx * s, SH + dy * s, dz * s); },
      bush(x, z, c, s) { const m = add(R0, new T.IcosahedronGeometry(0.38 * (s || 1), 0), mat(c || 0x6A9E50), x, SH + 0.25, z); m.scale.y = 0.75; },
      flowers(x, z, ry) { const g = G(x, z, ry); box(g, 1.1, 0.35, 0.45, M(0xA8907A), 0, SH, 0); for (let i = 0; i < 5; i++) add(g, new T.IcosahedronGeometry(0.15, 0), mat([0xF07A9A, 0xF4D35E, 0xFFFFFF, 0xC88EE8, 0xF4A060][i]), -0.42 + i * 0.21, SH + 0.45, 0); },
      bench(x, z, ry) { const g = G(x, z, ry); box(g, 1.2, 0.07, 0.4, M(0x9A6A40), 0, SH + 0.38, 0); box(g, 1.2, 0.35, 0.07, M(0x9A6A40), 0, SH + 0.45, -0.2); for (const dx of [-0.5, 0.5]) box(g, 0.07, 0.38, 0.35, M(0x2E3238), dx, SH, 0); },
      lamp(x, z, gas) { lampSpots.push([x, z]); const g = G(x, z); box(g, 0.1, 2.6, 0.1, M(gas ? 0x2E2A26 : 0x3A3E46), 0, SH, 0);
        const b = new T.Mesh(gas ? new T.BoxGeometry(0.32, 0.4, 0.32) : new T.SphereGeometry(0.18, 10, 8), lampMat); b.position.set(0, SH + 2.75, 0); g.add(b);
        if (gas) box(g, 0.42, 0.08, 0.42, M(0x2E2A26), 0, SH + 2.95, 0); },
      mail(x, z) { const g = G(x, z); box(g, 0.4, 0.8, 0.35, M(0xC8402A), 0, SH, 0); box(g, 0.46, 0.12, 0.4, M(0xA8301E), 0, SH + 0.8, 0); },
      hydrant(x, z) { const g = G(x, z); box(g, 0.2, 0.45, 0.2, M(0xD8402A), 0, SH, 0); box(g, 0.32, 0.1, 0.1, M(0xD8402A), 0, SH + 0.28, 0); },
      trash(x, z) { const g = G(x, z); box(g, 0.32, 0.55, 0.32, M(0x5A7E6A), 0, SH, 0); box(g, 0.38, 0.06, 0.38, M(0x4A6A5A), 0, SH + 0.55, 0); },
      bikes(x, z, ry) { const g = G(x, z, ry); for (let i = 0; i < 3; i++) { box(g, 0.06, 0.32, 0.65, M(0x2A2A2A), -0.35 + i * 0.35, SH, 0); box(g, 0.06, 0.06, 0.45, M([0x3A6E9A, 0xC8402A, 0xE8B83A][i]), -0.35 + i * 0.35, SH + 0.35, 0); } },
      board(x, z, ry) { const g = G(x, z, ry); box(g, 0.5, 0.75, 0.06, M(0x2A2A2A), 0, SH, 0); box(g, 0.36, 0.06, 0.07, M(0xF4F0E4), 0, SH + 0.5, 0); box(g, 0.3, 0.06, 0.07, M(0xF4D890), 0, SH + 0.36, 0); },
      fence(x, z, len, ry, c) { const g = G(x, z, ry); for (let i = 0; i <= len / 0.45; i++) box(g, 0.08, 0.5, 0.08, M(c || 0xF4EEE2), -len / 2 + i * 0.45, SH, 0); box(g, len, 0.06, 0.05, M(c || 0xF4EEE2), 0, SH + 0.38, 0); },
      crates(x, z) { const g = G(x, z); box(g, 0.5, 0.45, 0.5, M(0xA8845A), 0, SH, 0); box(g, 0.4, 0.35, 0.4, M(0x987450), 0.05, SH + 0.45, 0); box(g, 0.4, 0.4, 0.4, M(0xA8845A), 0.5, SH, 0.1); },
      mat(x, z, c) { B(0.9, 0.02, 0.5, c || 0x8A4E3A, x, SH, z); },
      puddle(x, z) { const m = new T.Mesh(new T.CircleGeometry(0.5, 10), new T.MeshLambertMaterial({ color: 0x7A8E9A, transparent: true, opacity: 0.55 })); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.13, z); m.scale.set(1, 0.6, 1); R0.add(m); },
      pots(x, z) { for (let i = 0; i < 3; i++) { B(0.25, 0.25, 0.25, 0xB86A45, x + i * 0.3, SH, z); KIT.bush(x + i * 0.3, z, [0x6A9E50, 0xE88AA0, 0x8AB860][i], 0.5); } },
      ac(g, x, y, z) { box(g, 0.5, 0.35, 0.3, M(0xE8E4DC), x, y, z); box(g, 0.3, 0.25, 0.02, M(0x9A9A9A), x, y + 0.05, z + 0.16); },
      gears(g, x, y, z) { for (let i = 0; i < 2; i++) { const t = add(g, new T.TorusGeometry(0.25 + i * 0.12, 0.07, 4, 8), mat(0xB8903A), x + i * 0.45, y + i * 0.2, z, false); } },
      pipe(g, x, y, z, len) { box(g, 0.14, len, 0.14, M(0x9A7A5A), x, y, z); box(g, 0.22, 0.12, 0.22, M(0xB8903A), x, y + len * 0.5, z); }
    };

    const LEGACY = !N.voxTown;
    if (LEGACY) {
    /* ── 每個街區：人行道、路緣、行道樹、路燈 ── */
    const PASTEL = [0xF4D6C0, 0xF2E4C4, 0xD4E6E0, 0xE8D4E8, 0xF4C8C0, 0xDCE4F2, 0xF0E0B0, 0xD8E8C8];
    const ROOFS = [0xD8705A, 0x6A8AA8, 0xE8A050, 0x8A6A9A, 0x5A9A8A, 0xC85A5A, 0x9A7A5A];
    for (const key in BLOCK) {
      const [bx, bz] = BLOCK[key], ext = key === "outer1" || key === "outer2";
      const x0 = bx - 0.3 - SIDE, x1 = bx + 14.3 + SIDE, z0 = bz - 0.3 - SIDE, z1 = bz + 21.3 + SIDE, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      const gas = key.indexOf("oldtown") === 0;
      // 人行道（四條）
      for (const [w, d, x, z] of [[x1 - x0, SIDE, cx, z0 + SIDE / 2], [x1 - x0, SIDE, cx, z1 - SIDE / 2], [SIDE, z1 - z0, x0 + SIDE / 2, cz], [SIDE, z1 - z0, x1 - SIDE / 2, cz]]) {
        B(w, SH, d, SWALK, x, 0, z).castShadow = false;
      }
      // 人行道上：每隔一段交錯放路燈和行道樹，中間偶爾一張長椅或垃圾桶
      const along = (ax, az, bx2, bz2, seed) => {
        const len = Math.hypot(bx2 - ax, bz2 - az), n = Math.floor(len / 2.6);
        for (let i = 1; i < n; i++) {
          const t = i / n, x = ax + (bx2 - ax) * t, z = az + (bz2 - az) * t, k = (i + seed) % 4;
          if (k === 0) KIT.lamp(x, z, gas); else if (k === 2) KIT.tree(x, z, 0.62, [0x7AAE5A, 0x8AB860, 0x6A9E50][(i + seed) % 3]);
          else if (k === 3 && rnd(x, z) < 0.35) (rnd(z, x) < 0.5 ? KIT.trash : KIT.hydrant)(x, z);
        }
      };
      const e = SIDE / 2;
      along(x0 + e, z0 + e, x1 - e, z0 + e, 0); along(x0 + e, z1 - e, x1 - e, z1 - e, 1); along(x0 + e, z0 + e, x0 + e, z1 - e, 2); along(x1 - e, z0 + e, x1 - e, z1 - e, 3);
      if (ext) continue;
      // 舊城的水窪
      if (gas) for (let i = 0; i < 3; i++) KIT.puddle(bx + 2 + rnd(bx, i) * 10, bz + 3 + rnd(i, bz) * 15);
    }

    /* ── 每個地點：旁邊補背景小樓、門口放生活小物 ── */
    for (const l of N.locations) {
      const p = lotPos(l), t = typeOf(l), h0 = hashStr(l.id), r = k => rnd(h0 % 997, k);
      const bw = { house: 3.4, shop: 3.8, tall: 3.6, attic: 2.8, street: 4.2, wizard: 3 }[t];
      if (bw) {
        // 兩側的窄樓（背景建築）
        for (const side of [-1, 1]) {
          if (r(side + 5) < 0.25) continue;
          const w = Math.min(1.25, (6.2 - bw) / 2 - 0.05), hgt = 1.8 + r(side + 9) * 3.2, x = p.x + side * (bw / 2 + w / 2 + 0.02), z = p.z - 0.7;
          const g = G(x, z), wc = PASTEL[Math.floor(r(side + 11) * PASTEL.length)], rc = ROOFS[Math.floor(r(side + 13) * ROOFS.length)];
          box(g, w, hgt, 2.6, M(wc), 0, 0.12, 0);
          for (let y = 0.9; y < hgt - 0.4; y += 1.1) { box(g, w * 0.55, 0.55, 0.05, winMat, 0, 0.12 + y, 1.31, false); box(g, w * 0.65, 0.08, 0.2, M(0xF4EEE2), 0, 0.1 + y, 1.38); if (r(y * 3 + side) < 0.4) for (let i = 0; i < 3; i++) add(g, new T.IcosahedronGeometry(0.1, 0), mat([0xF07A9A, 0xF4D35E, 0x8AB860][i]), -0.25 + i * 0.25, 0.25 + y, 1.42); }
          if (r(side + 17) < 0.5) { const roof = add(g, new T.ConeGeometry(Math.max(w, 2.6) * 0.72, 0.9, 4), mat(rc), 0, 0.12 + hgt + 0.45, 0); roof.rotation.y = Math.PI / 4; roof.scale.set(w / 2.6 * 1.05, 1, 1.05); }
          else { box(g, w + 0.1, 0.12, 2.7, M(rc), 0, 0.12 + hgt, 0); if (r(side + 19) < 0.6) KIT.ac(g, 0, 0.24 + hgt, -0.5); }
          if (r(side + 21) < 0.5) box(g, 0.25, 0.7, 0.25, M(0x9A6A5A), w * 0.2, 0.12 + hgt, -0.8);   // 煙囪
        }
      }
      // 門口的小物：店家、住家、學校各有不同
      const fz = p.z + 2.55, L = p.x - 2.35, Rr = p.x + 2.35;
      if (t === "shop" || t === "street") { KIT.flowers(L + 0.3, fz, 0); KIT.board(Rr - 0.2, fz - 0.3, Math.PI * 0.1); KIT.mat(p.x, p.z + 1.4); if (r(1) < 0.5) KIT.bench(p.x - 0.3, fz + 0.25, Math.PI); else KIT.bikes(p.x, fz + 0.2, 0); if (r(2) < 0.5) KIT.crates(Rr - 0.3, p.z - 2.5); }
      else if (t === "house" || t === "attic") { KIT.mail(Rr - 0.2, fz); KIT.fence(p.x - 1.2, fz + 0.3, 2.2, 0); KIT.bush(L + 0.2, fz - 0.6, 0x6A9E50); KIT.pots(p.x + 0.6, p.z + 1.6); KIT.tree(L + 0.1, p.z - 2.3, 0.7, 0x8AB860); }
      else if (t === "tall") { KIT.bikes(L + 0.6, fz, 0); KIT.trash(Rr - 0.2, fz); KIT.mat(p.x, p.z + 1.25, 0x5A6E8A); KIT.flowers(p.x + 1.2, fz - 0.2, 0); }
      else if (t === "school") { KIT.bikes(L + 0.4, fz + 0.2, 0); KIT.bench(Rr - 0.8, fz + 0.2, Math.PI); KIT.tree(L + 0.1, p.z - 2.6, 0.8); KIT.tree(Rr - 0.1, p.z - 2.6, 0.8, 0x6A9E50); }
      else if (t === "wizard") { KIT.pots(L + 0.2, fz); KIT.tree(Rr - 0.2, fz, 0.7, 0x5A8A6A); }
    }

    } else for (const k in BLOCK) {
      // 體素人行道：墊高、方磚、路緣，路燈和行道樹站在上面
      const [bx, bz] = BLOCK[k], reg = k === "outer1" ? "pero" : k === "outer2" ? "other" : k.replace(/\d+$/, "");
      const r = N.voxTown.block(T, 14.6, 21.6, { reg, seed: bx * 7 + bz, winMat, lampMat });
      const g = new T.Group(); g.position.set(bx - 0.3, VOXY, bz - 0.3); r.meshes.forEach(m => g.add(m)); root.add(g);
      r.lamps.forEach(([x, z]) => lampSpots.push([bx - 0.3 + x, bz - 0.3 + z]));
    }
    /* ── 每個地點的招牌細節 ── */
    const at = (id, f) => { const l = N.locations.find(x => x.id === id); if (l) { const p = lotPos(l); const g = G(p.x, p.z); f(g); } };
    if (LEGACY) {
    at("史威特偵探社", g => {   // 屋頂的大放大鏡招牌
      box(g, 0.1, 1.2, 0.1, M(0x3A3E46), 1.2, 3.1, -1.2);
      const ring = add(g, new T.TorusGeometry(0.5, 0.1, 6, 16), mat(0xD8B04A), 1.2, 4.7, -1.2); ring.rotation.y = 0.5;
      const glass = add(g, new T.CircleGeometry(0.42, 16), new T.MeshLambertMaterial({ color: 0xBFE0F0, emissive: 0x6AA0C0, emissiveIntensity: 0.3, transparent: true, opacity: 0.8, side: T.DoubleSide }), 1.2, 4.7, -1.2, false); glass.rotation.y = 0.5;
      const hd = box(g, 0.14, 0.7, 0.14, M(0x6B4A30), 1.6, 3.9, -1.0); hd.rotation.z = 0.7;
      for (let i = 0; i < 10; i++) { const b = new T.Mesh(new T.SphereGeometry(0.06, 6, 5), glowM([0xFFE08A, 0xFF9A6A, 0x9AD8FF][i % 3])); b.position.set(-1.8 + i * 0.4, 2.4 - Math.sin(i / 9 * Math.PI) * 0.25, 1.2); g.add(b); }
    });
    at("Hale’s Oven", g => {   // 冒煙的磚煙囪、屋頂麵包招牌
      box(g, 0.6, 1.6, 0.6, M(0xA8644C), 1.3, 2.9, -1.4);
      for (let i = 0; i < 4; i++) { const m = add(g, new T.IcosahedronGeometry(0.22 + i * 0.08, 0), new T.MeshLambertMaterial({ color: 0xF4F0EC, transparent: true, opacity: 0.75 - i * 0.15 }), 1.3 + i * 0.15, 4.8 + i * 0.45, -1.4, false); m.userData.smoke = i; smoke.push(m); }
      const bread = add(g, new T.SphereGeometry(0.4, 10, 8), mat(0xD8A050), -0.6, 3.6, -0.2); bread.rotation.z = Math.PI / 2; bread.scale.set(1, 1.4, 1);
    });
    at("諾文甜點店", g => { const d = add(g, new T.TorusGeometry(0.45, 0.22, 8, 16), mat(0xF2B5C9), 0, 3.9, -0.5); d.rotation.x = -0.4; for (let i = 0; i < 6; i++) box(g, 0.08, 0.04, 0.04, M([0xF4D35E, 0x4AC8E8, 0xFFFFFF][i % 3]), -0.3 + i * 0.12, 4.12, -0.35 + (i % 2) * 0.1); });
    at("玫君的租屋", g => { box(g, 0.08, 0.6, 0.6, M(0x2A2A33), 1.85, 2.0, 0.6); add(g, new T.CylinderGeometry(0.22, 0.22, 0.25, 10), mat(0xB8282A), 1.95, 2.3, 0.6).rotation.z = Math.PI / 2; });
    at("瑞特的租屋", g => { box(g, 0.05, 1.8, 0.05, M(0x3B2E2A), 1.8, 0.2, 1.4); const m = add(g, new T.TorusGeometry(0.35, 0.08, 6, 12), mat(0xD8402A), -1.9, 1.6, 0.9); });
    at("禮的家", g => { for (let i = 0; i < 3; i++) { const b = new T.Mesh(new T.BoxGeometry(0.1, 0.1, 0.1), glowM(0xFFB04A)); b.position.set(-0.6 + i * 0.6, 1.3, 1.15); g.add(b); } });
    at("星星家", g => { for (let i = 0; i < 5; i++) { const s0 = new T.Mesh(new T.OctahedronGeometry(0.12, 0), glowM(0xC8A8FF)); s0.position.set(-1.2 + i * 0.6, 3.6 + (i % 2) * 0.3, -0.4); g.add(s0); } });
    at("佐代的公寓", g => { box(g, 0.08, 0.5, 0.5, M(0x6A1E2E), -1.9, 3.2, 0.5); add(g, new T.ConeGeometry(0.18, 0.3, 4), mat(0xE8DCC8), -1.95, 3.6, 0.5); });
    at("神崎家", g => { const t2 = new T.Mesh(new T.CylinderGeometry(0.02, 0.02, 1.6, 4), mat(0x9A9A9A)); t2.position.set(1.1, 4.2, -0.8); g.add(t2); box(g, 0.5, 0.06, 0.06, M(0x9A9A9A), 1.1, 4.8, -0.8); });

    } else at("Hale’s Oven", g => {   // 體素煙囪上冒煙
      for (let i = 0; i < 4; i++) { const m = add(g, new T.IcosahedronGeometry(0.22 + i * 0.08, 0), new T.MeshLambertMaterial({ color: 0xF4F0EC, transparent: true, opacity: 0.75 - i * 0.15 }), 1.06, 4.8 + i * 0.45, -0.94, false); m.userData.smoke = i; smoke.push(m); }
    });
    /* ── 時間融合：不同時代的東西混在街上 ── */
    // 中央：鐘塔旁的老爺車、電線桿上的紀元裂縫
    const vintage = (x, z, ry) => { const g = G(x, z, ry); box(g, 0.9, 0.4, 2.0, M(0x2E4A3A), 0, 0.3, 0); box(g, 0.8, 0.5, 0.9, M(0x2E4A3A), 0, 0.7, -0.3); box(g, 0.82, 0.08, 1.0, M(0x1E2A22), 0, 1.2, -0.3);
      for (const wx of [-0.5, 0.5]) for (const wz of [-0.7, 0.7]) { const w = add(g, new T.CylinderGeometry(0.32, 0.32, 0.12, 12), mat(0x1E1E22), wx, 0.32, wz); w.rotation.z = Math.PI / 2; }
      box(g, 0.2, 0.2, 0.15, M(0xD8B04A), -0.3, 0.55, 1.05); box(g, 0.2, 0.2, 0.15, M(0xD8B04A), 0.3, 0.55, 1.05); };
    vintage(13, 24.6, Math.PI / 2); vintage(-4, -28.6, -Math.PI / 2);
    const rift = (x, z) => { const g = G(x, z); box(g, 0.14, 4, 0.14, M(0x6A5A4A), 0, SH, 0); box(g, 1.0, 0.08, 0.08, M(0x6A5A4A), 0, SH + 3.7, 0);
      for (let i = 0; i < 5; i++) { const c = new T.Mesh(new T.OctahedronGeometry(0.1 + (i % 2) * 0.06, 0), glowM(i % 2 ? 0xC8A8FF : 0x8AE8FF)); c.position.set(Math.sin(i * 2) * 0.2, SH + 1.6 + i * 0.35, Math.cos(i * 2) * 0.2); c.userData.rift = i; g.add(c); riftBits.push(c); } };
    rift(14.67, 9.5); rift(-3.33, -14);
    // 舊城：蒸汽管線、齒輪掛在牆上
    if (LEGACY) for (const id of ["諾文舊街", "諾文古籍巷", "諾文舊物市場", "諾文服飾街"]) at(id, g => { KIT.pipe(g, 1.9, 0.12, -1.6, 2.6); KIT.gears(g, -1.6, 2.4, 1.15); });
    // 外城：銅色管線、煙囪、平交道
    if (LEGACY) for (const id of ["諾文機械工作坊", "諾文科技維修站", "諾文機械市集", "諾文轉運站"]) at(id, g => { KIT.pipe(g, -2.6, 0.12, -1.2, 3.2); box(g, 0.6, 3.6, 0.6, M(0x8A4E3A), 2.6, 0.12, -2.4); KIT.gears(g, 1.6, 2.6, 1.15); });

    /* ── 路口：斑馬線、標線、紅綠燈 ── */
    const dash = M(0xF2EEE2), VX = [-2, 16, 34];
    for (const x of VX) for (let z = -24; z < 22; z += 1.6) if (Math.abs(z + 2) > 2.6) { const m = new T.Mesh(new T.BoxGeometry(0.1, 0.02, 0.6), dash); m.position.set(x, 0.035, z); R0.add(m); }
    for (let x = -18; x < 50; x += 1.6) if (!VX.some(v => Math.abs(x - v) < 2.6)) { const m = new T.Mesh(new T.BoxGeometry(0.6, 0.02, 0.1), dash); m.position.set(x, 0.035, -2); R0.add(m); }
    for (const x of VX) {
      for (let i = -2; i <= 2; i++) for (const zz of [-0.55, -3.45]) { const a = new T.Mesh(new T.BoxGeometry(0.24, 0.02, 0.9), dash); a.position.set(x + i * 0.42, 0.04, zz); R0.add(a); }
      for (let i = -2; i <= 2; i++) for (const xx of [x - 1.5, x + 1.5]) { const a = new T.Mesh(new T.BoxGeometry(0.9, 0.02, 0.22), dash); a.position.set(xx, 0.04, -2 + i * 0.36); R0.add(a); }
      for (const [dx, dz, ry] of [[1.32, 1.32, 0], [-1.32, -1.32, Math.PI]]) {
        const g = G(x + dx, -2 + dz, ry);
        box(g, 0.1, 2.3, 0.1, M(0x2E3238), 0, SH, 0); box(g, 0.32, 0.85, 0.26, M(0x22252C), 0, SH + 2.2, 0.08);
        const ls = [0xFF4A3A, 0xFFC23A, 0x4AE07A].map((c, i) => { const m = new T.MeshBasicMaterial({ color: 0x333333 }); const o = new T.Mesh(new T.BoxGeometry(0.18, 0.18, 0.05), m); o.position.set(0, SH + 2.88 - i * 0.25, 0.23); g.add(o); return { m, c }; });
        traffic.push({ ls, phase: ry ? 0 : 1 });
      }
    }
    // 寬馬路邊停的車、公車站
    const CAR = [0xD8705A, 0x6A9AC8, 0xF2EEE2, 0x8AB880, 0xE8C060, 0xB88AC8];
    const car = (x, z, ry, c) => { const g = G(x, z, ry); box(g, 0.9, 0.45, 1.8, M(c), 0, 0.15, 0); box(g, 0.8, 0.4, 0.95, M(c), 0, 0.6, -0.1); box(g, 0.82, 0.3, 0.75, M(0xBFD8E8), 0, 0.64, -0.1);
      for (const wx of [-0.45, 0.45]) for (const wz of [-0.55, 0.55]) box(g, 0.12, 0.3, 0.3, M(0x1E1E22), wx, 0, wz); };
    [[2, 24.6, Math.PI / 2], [7.5, 24.6, Math.PI / 2], [21, 24.6, -Math.PI / 2], [28, 24.6, -Math.PI / 2], [-12, 24.6, Math.PI / 2], [4, -28.6, Math.PI / 2], [24, -28.6, -Math.PI / 2], [-10, -28.6, Math.PI / 2], [40, 24.6, Math.PI / 2]]
      .forEach(([x, z, r], i) => car(x, z, r, CAR[i % CAR.length]));
    const bs = G(11, 25.4, Math.PI);
    box(bs, 2.2, 0.08, 0.8, M(0x3A6E9A), 0, SH + 2.0, 0); for (const xx of [-1, 1]) box(bs, 0.07, 2.0, 0.07, M(0x2E3238), xx, SH, 0.3);
    box(bs, 2.1, 1.3, 0.05, new T.MeshLambertMaterial({ color: 0xBFD8E8, transparent: true, opacity: 0.5 }), 0, SH + 0.5, -0.35); box(bs, 1.7, 0.07, 0.35, M(0x9A6A40), 0, SH + 0.42, -0.12);
  }
  const smoke = [], riftBits = [], lampSpots = [];
  const VOXY = -0.02;
  const TOWN_C = { x: 22, y: 0, z: -3, clone() { return new T.Vector3(22, 0, -3); } };
  const perf = { ratio: 1, acc: 0, n: 0, sunKey: "", cool: 0 };            // 體素地面頂端剛好比街區地坪高一點點
  let poolMat = null;
  function buildLampPools() {
    const cv = document.createElement("canvas"); cv.width = cv.height = 64;
    const x = cv.getContext("2d"), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, "rgba(255,214,140,1)"); gr.addColorStop(0.45, "rgba(255,190,110,.45)"); gr.addColorStop(1, "rgba(255,170,90,0)");
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    poolMat = new T.MeshBasicMaterial({ map: new T.CanvasTexture(cv), transparent: true, blending: T.AdditiveBlending, depthWrite: false, opacity: 0 });
    const geo = new T.PlaneGeometry(4.2, 4.2);
    for (const [px, pz] of lampSpots) { const m = new T.Mesh(geo, poolMat); m.rotation.x = -Math.PI / 2; m.position.set(px, 0.19, pz); m.renderOrder = 2; root.add(m); }
  }
  function trafficFrame(tt) {
    for (const m of smoke) { const k = (tt * 0.25 + m.userData.smoke * 0.25) % 1; m.position.y = 4.8 + k * 1.8; m.material.opacity = 0.7 * (1 - k); m.scale.setScalar(0.8 + k * 0.9); }
    for (const c of riftBits) { c.rotation.y = tt * 1.5 + c.userData.rift; c.position.x = Math.sin(tt * 0.8 + c.userData.rift * 2) * 0.22; }
    for (const t of traffic) {
      const k = Math.floor((tt / 6 + t.phase * 1.5)) % 3, on = k === 0 ? 2 : k === 1 ? 1 : 0;   // 綠→黃→紅
      t.ls.forEach((l, i) => l.m.color.setHex(i === on ? l.c : 0x2A2A2A));
    }
  }

  /* ═════════ 鎮上的小生命：花貓、貓頭鷹、鴿子、路過的鎮民 ═════════ */
  const life = { cat: null, owl: null, pigeons: [], folk: [] };
  function buildLife() {
    // 花貓：Hale's Oven 門口
    const H = lots["Hale’s Oven"];
    if (H) {
      const g = new T.Group();
      const body = add(g, new T.SphereGeometry(0.32, 10, 8), mat(0xF4E6D2), 0, 0.3, 0); body.scale.set(1, 0.8, 1.5);
      add(g, new T.SphereGeometry(0.16, 8, 6), mat(0xE08A3A), 0.1, 0.42, -0.15);
      add(g, new T.SphereGeometry(0.13, 8, 6), mat(0x4A3B33), -0.12, 0.38, 0.2);
      const head = add(g, new T.SphereGeometry(0.22, 10, 8), mat(0xF4E6D2), 0, 0.55, 0.45);
      add(g, new T.SphereGeometry(0.12, 8, 6), mat(0xE08A3A), 0.08, 0.66, 0.42);
      for (const x of [-0.12, 0.12]) { const e = add(g, new T.ConeGeometry(0.07, 0.15, 4), mat(x < 0 ? 0xE08A3A : 0xF4E6D2), x, 0.78, 0.45); }
      const tail = add(g, new T.CylinderGeometry(0.04, 0.05, 0.55, 6), mat(0x4A3B33), 0, 0.45, -0.55); tail.rotation.x = -0.6;
      g.scale.set(0.9, 0.9, 0.9);
      root.add(g);
      life.cat = { g, tail, home: new T.Vector3(H.x + 1.9, 0, H.z + 2.6), pos: new T.Vector3(H.x + 1.9, 0, H.z + 2.6), tgt: null, wait: 3 };
      g.position.copy(life.cat.pos);
    }
    // 貓頭鷹：在幾個屋頂之間飛
    const perches = ["梅魯塔的塔屋", "沙布堤亞大學", "諾文聯邦圖書館", "諾文鐘塔廣場", "史威特偵探社"].map(id => lots[id]).filter(Boolean)
      .map(L => new T.Vector3(L.x, L.h + 0.2, L.z - 0.3));
    if (perches.length) {
      const g = new T.Group();
      const body = add(g, new T.SphereGeometry(0.28, 10, 8), mat(0x8A6A4A), 0, 0, 0); body.scale.set(1, 1.2, 1);
      add(g, new T.SphereGeometry(0.2, 10, 8), mat(0xC9A27A), 0, 0.05, 0.12);
      for (const x of [-0.1, 0.1]) add(g, new T.SphereGeometry(0.06, 6, 5), glow(0xFFD24A), x, 0.15, 0.24);
      const wl = add(g, new T.BoxGeometry(0.5, 0.05, 0.25), mat(0x6B4E3A), -0.32, 0, 0), wr = add(g, new T.BoxGeometry(0.5, 0.05, 0.25), mat(0x6B4E3A), 0.32, 0, 0);
      root.add(g);
      life.owl = { g, wl, wr, perches, at: 0, from: perches[0].clone(), to: perches[0].clone(), t: 1, wait: 6 };
      g.position.copy(perches[0]);
    }
    // 鴿子：公園
    const P = lots["諾文公園"];
    if (P) for (let i = 0; i < 6; i++) {
      const g = new T.Group();
      const b = add(g, new T.SphereGeometry(0.14, 8, 6), mat(0x8E929A), 0, 0.14, 0); b.scale.set(1, 0.9, 1.3);
      add(g, new T.SphereGeometry(0.08, 6, 5), mat(0x6E7480), 0, 0.26, 0.14);
      root.add(g);
      const pos = new T.Vector3(P.x + (Math.random() - 0.5) * 4, 0, P.z + 1 + Math.random() * 1.5);
      g.position.copy(pos);
      life.pigeons.push({ g, pos, base: new T.Vector3(P.x, 0, P.z + 1), hop: Math.random() * 3, fly: 0, vy: 0 });
    }
    // 路過的鎮民：沿著街道繞圈
    const loops = [
      [[-2, -27], [34, -27], [34, -2], [-2, -2]],
      [[-2, -2], [34, -2], [34, 23], [-2, 23]],
      [[-20, -2], [16, -2], [16, 23], [-20, 23]],
      [[16, -27], [52, -27], [52, 23], [16, 23]]
    ].map(l => l.map(([x, z]) => new T.Vector3(x, 0, z)));
    const cols = [0x7A8290, 0x9A8F84, 0x6E7A6A, 0x8A7A90, 0x9C8A70, 0x7A6E66, 0x6A7F8C, 0x8C7F7A];
    for (let i = 0; i < 12; i++) {
      const g = new T.Group(), c = cols[i % cols.length];
      add(g, new T.CylinderGeometry(0.2, 0.28, 0.75, 8), mat(c), 0, 0.38, 0);
      add(g, new T.SphereGeometry(0.2, 8, 6), mat(0xE8D8C8), 0, 0.92, 0);
      if (i % 3 === 0) add(g, new T.ConeGeometry(0.26, 0.2, 8), mat(0x3B3F4A), 0, 1.1, 0);
      if (i % 4 === 1) { const u = add(g, new T.ConeGeometry(0.55, 0.3, 8), mat([0xC0603F, 0x4A6FA5, 0x2F8A6A][i % 3]), 0, 1.45, 0); u.visible = false; g.userData.umb = u; }
      g.scale.set(1.15, 1.15, 1.15);
      root.add(g);
      const loop = loops[i % loops.length];
      life.folk.push({ g, loop, seg: i % 4, t: Math.random(), speed: 1.6 + Math.random() * 1.2, dir: i % 2 ? 1 : -1, phase: Math.random() * 6, rank: i });
    }
  }
  function lifeFrame(dt, tt, nf, rainy) {
    const c = life.cat;
    if (c) {
      const sleepy = nf > 0.6;
      if (c.tgt) {
        const d = c.tgt.clone().sub(c.pos), len = d.length();
        if (len < 0.05) { c.tgt = null; c.wait = 4 + Math.random() * 10; }
        else { c.pos.add(d.multiplyScalar(Math.min(1, 0.9 * dt / len))); c.g.rotation.y = Math.atan2(c.tgt.x - c.pos.x, c.tgt.z - c.pos.z); }
      } else if ((c.wait -= dt) <= 0 && !sleepy) {
        c.tgt = c.home.clone().add(new T.Vector3((Math.random() - 0.5) * 3.2, 0, (Math.random() - 0.3) * 1.6));
      }
      c.g.position.set(c.pos.x, c.tgt ? Math.abs(Math.sin(tt * 9)) * 0.04 : 0, c.pos.z);
      c.g.scale.y = sleepy && !c.tgt ? 0.62 : 0.9;
      c.tail.rotation.z = Math.sin(tt * (sleepy ? 0.8 : 2.4)) * 0.5;
    }
    const o = life.owl;
    if (o) {
      if (o.t < 1) {
        o.t = Math.min(1, o.t + dt / 3.2);
        const k = o.t, p = new T.Vector3().lerpVectors(o.from, o.to, k); p.y += Math.sin(k * Math.PI) * 4;
        o.g.position.copy(p); o.g.rotation.y = Math.atan2(o.to.x - o.from.x, o.to.z - o.from.z);
        const f = Math.sin(tt * 18) * 0.7; o.wl.rotation.z = f; o.wr.rotation.z = -f;
      } else {
        o.wl.rotation.z = 0.9; o.wr.rotation.z = -0.9;
        o.g.position.y = o.to.y + Math.sin(tt * 1.2) * 0.02;
        if ((o.wait -= dt * (nf > 0.5 ? 1.8 : 0.6)) <= 0) {
          let n = o.at; while (n === o.at) n = Math.floor(Math.random() * o.perches.length);
          o.from = o.g.position.clone(); o.to = o.perches[n].clone(); o.at = n; o.t = 0; o.wait = 8 + Math.random() * 14;
        }
      }
    }
    for (const pg of life.pigeons) {
      let scared = false;
      for (const id in walkers) { const w = walkers[id]; if (w.g.visible && w.pos.distanceTo(pg.pos) < 1.6) { scared = true; break; } }
      if (scared && pg.fly <= 0) { pg.fly = 1.6; pg.vy = 4; const a = Math.random() * 6.28; pg.dst = pg.base.clone().add(new T.Vector3(Math.cos(a) * 2.4, 0, Math.sin(a) * 1.4)); }
      if (pg.fly > 0) {
        pg.fly -= dt; pg.vy -= 5 * dt;
        pg.pos.lerp(pg.dst, Math.min(1, dt * 1.5));
        pg.g.position.set(pg.pos.x, Math.max(0, pg.g.position.y + pg.vy * dt), pg.pos.z);
      } else {
        pg.hop -= dt;
        if (pg.hop <= 0) { pg.hop = 0.6 + Math.random() * 2.5; pg.pos.add(new T.Vector3((Math.random() - 0.5) * 0.4, 0, (Math.random() - 0.5) * 0.4)); pg.pos.x = Math.max(pg.base.x - 2.6, Math.min(pg.base.x + 2.6, pg.pos.x)); pg.pos.z = Math.max(pg.base.z - 1.2, Math.min(pg.base.z + 1.6, pg.pos.z)); }
        pg.g.position.set(pg.pos.x, pg.hop > 0.45 ? 0 : Math.abs(Math.sin(pg.hop * 7)) * 0.08, pg.pos.z);
        pg.g.rotation.y = Math.sin(tt * 0.7 + pg.hop) * 1.5;
      }
      pg.g.visible = nf < 0.7;
    }
    const want = nf > 0.8 ? 2 : nf > 0.3 ? 6 : 12;
    for (const f of life.folk) {
      f.g.visible = f.rank < want;
      if (!f.g.visible) continue;
      const a = f.loop[f.seg], b = f.loop[(f.seg + 1) % f.loop.length], len = a.distanceTo(b);
      f.t += f.dir * f.speed * dt / len;
      if (f.t > 1) { f.t = 0; f.seg = (f.seg + 1) % f.loop.length; }
      if (f.t < 0) { f.t = 1; f.seg = (f.seg + f.loop.length - 1) % f.loop.length; }
      const A = f.loop[f.seg], B = f.loop[(f.seg + 1) % f.loop.length];
      const side = (f.rank % 2 ? 0.9 : -0.9);
      const dx = B.x - A.x, dz = B.z - A.z, L = Math.hypot(dx, dz) || 1;
      f.g.position.set(A.x + dx * f.t - dz / L * side, Math.abs(Math.sin(tt * 7 + f.phase)) * 0.06, A.z + dz * f.t + dx / L * side);
      if (f.g.userData.umb) f.g.userData.umb.visible = rainy;
    }
  }

  /* ═════════ 放著看：自動導演 ═════════ */
  const director = { on: false, next: 0, lastSay: null, az0: 0 };
  function directorFrame(dt, now) {
    if (!director.on) return;
    cam.az += dt * 0.04;
    if (now < director.next) return;
    director.next = now + 13000 + Math.random() * 6000;
    const vis = Object.values(walkers).filter(w => w.g.visible && w.fade > 0.5);
    let pick = null;
    if (director.lastSay && now - director.lastSay.t < 4000 && walkers[director.lastSay.id]) pick = walkers[director.lastSay.id];
    if (!pick) {
      const social = vis.filter(w => vis.some(o => o !== w && o.loc === w.loc));
      const pool = social.length && Math.random() < 0.75 ? social : vis;
      pick = pool[Math.floor(Math.random() * pool.length)];
    }
    if (pick) {
      cam.fly = { from: cam.target.clone(), to: new T.Vector3(pick.pos.x, 0, pick.pos.z), d0: cam.dist, d1: 24 + Math.random() * 10, t: 0 };
      cam.fly.dur = 3.5; cam.follow = null;
      setTimeout(() => { if (director.on) cam.follow = pick.id; }, 3600);
    } else if (lots["諾文鐘塔廣場"]) {
      const L = lots["諾文鐘塔廣場"]; cam.fly = { from: cam.target.clone(), to: new T.Vector3(L.x, 0, L.z), d0: cam.dist, d1: 36, t: 0, dur: 3.5 };
    }
  }
  function setDirector(on) {
    director.on = on; director.next = 0;
    if (!on) { cam.follow = null; flyTo(14, 6, 40); }
    setTimeout(resize, 60); setTimeout(resize, 400);
  }

  /* ═════════ 相機與手勢 ═════════ */
  function placeCamera() {
    const t = cam.target, d = cam.dist, p = cam.polar, a = cam.az;
    camera.position.set(t.x + Math.sin(p) * Math.sin(a) * d, Math.cos(p) * d, t.z + Math.sin(p) * Math.cos(a) * d);
    camera.lookAt(t);
  }
  function clampTarget() {
    cam.target.x = Math.max(BOUNDS.x0, Math.min(BOUNDS.x1, cam.target.x));
    cam.target.z = Math.max(BOUNDS.z0, Math.min(BOUNDS.z1, cam.target.z));
    cam.dist = Math.max(10, Math.min(130, cam.dist));
  }
  let interacting = 0;
  function bindInput(el) {
    const ptrs = new Map();
    let start = null, moved = 0, prevPinch = null;
    const pinchInfo = () => {
      const [a, b] = [...ptrs.values()];
      return { d: Math.hypot(a.x - b.x, a.y - b.y), ang: Math.atan2(b.y - a.y, b.x - a.x), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
    };
    const pan = (dx, dy) => {
      const k = cam.dist * 0.0021;
      const sa = Math.sin(cam.az), ca = Math.cos(cam.az);
      cam.target.x -= (dx * ca + dy * sa / Math.cos(cam.polar * 0.6)) * k;
      cam.target.z -= (-dx * sa + dy * ca / Math.cos(cam.polar * 0.6)) * k;
      cam.follow = null; cam.fly = null;
      clampTarget();
    };
    el.addEventListener("pointerdown", e => {
      el.setPointerCapture && el.setPointerCapture(e.pointerId);
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (ptrs.size === 1) { start = { x: e.clientX, y: e.clientY, t: performance.now() }; moved = 0; }
      if (ptrs.size === 2) prevPinch = pinchInfo();
      interacting = performance.now();
    });
    el.addEventListener("pointermove", e => {
      if (!ptrs.has(e.pointerId)) return;
      const p = ptrs.get(e.pointerId), dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      interacting = performance.now();
      if (ptrs.size === 1) { moved += Math.abs(dx) + Math.abs(dy); if (moved > 6) pan(dx, dy); }
      else if (ptrs.size === 2 && prevPinch) {
        const cur = pinchInfo();
        cam.dist *= prevPinch.d / Math.max(1, cur.d);
        cam.az -= (cur.ang - prevPinch.ang);
        pan((cur.mx - prevPinch.mx) * 0.5, (cur.my - prevPinch.my) * 0.5);
        moved = 99; prevPinch = cur; clampTarget();
      }
    });
    const up = e => {
      if (!ptrs.has(e.pointerId)) return;
      ptrs.delete(e.pointerId);
      if (ptrs.size < 2) prevPinch = null;
      if (ptrs.size === 0 && start && moved < 8 && performance.now() - start.t < 450) tap(e.clientX, e.clientY);
      if (ptrs.size === 0) start = null;
    };
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", e => { ptrs.delete(e.pointerId); prevPinch = null; start = null; });
    el.addEventListener("wheel", e => { e.preventDefault(); cam.dist *= 1 + Math.max(-0.3, Math.min(0.3, e.deltaY * 0.0012)); clampTarget(); interacting = performance.now(); }, { passive: false });
    el.addEventListener("contextmenu", e => e.preventDefault());
  }
  function tap(cx, cy) {
    const r = renderer.domElement.getBoundingClientRect();
    const v = new T.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    const rc = new T.Raycaster(); rc.setFromCamera(v, camera);
    // 泡泡 → 居民 → 地點
    const bh = rc.intersectObjects(bubbles.map(b => b.sp), false);
    if (bh.length) { const b = bubbles.find(x => x.sp === bh[0].object); if (b && hooks.onChar) return hooks.onChar(b.id); }
    const heads = [];
    Object.values(walkers).filter(w => w.g.visible).forEach(w => { if (w.ch) heads.push(...w.ch.pickables()); else heads.push(w.head); });
    const hh = rc.intersectObjects(heads, false);
    if (hh.length && hooks.onChar) return hooks.onChar(hh[0].object.userData.char);
    const marks = Object.values(hintMarks).filter(s => s.visible).concat(labelSprites.filter(s => s.visible), Object.values(lots).filter(L => L.badge).map(L => L.badge));
    const mh = rc.intersectObjects(marks, false);
    if (mh.length && hooks.onLoc) return hooks.onLoc(mh[0].object.userData.loc);
    const gh = rc.intersectObjects(Object.values(lots).map(L => L.group), true);
    if (gh.length) {
      let o = gh[0].object; while (o && !o.userData.loc) o = o.parent;
      if (o && hooks.onLoc) return hooks.onLoc(o.userData.loc);
    }
    if (hooks.onEmpty) hooks.onEmpty();
  }
  function flyTo(x, z, dist) {
    cam.fly = { from: cam.target.clone(), to: new T.Vector3(x, 0, z), d0: cam.dist, d1: dist || cam.dist, t: 0 };
    cam.follow = null;
  }

  /* ═════════ 每幀 ═════════ */
  function frame(now) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    const rawDt = lastT ? (now - lastT) / 1000 : 0.016;
    const dt = Math.min(0.05, rawDt); lastT = now;
    const tt = now / 1000;
    // 連續幾秒都很卡就降一點解析度（最低 1 倍）
    perf.acc += rawDt; perf.n++;
    if (perf.acc > 2.5) {
      const avg = perf.acc / perf.n; perf.acc = 0; perf.n = 0;
      if (avg > 0.034 && perf.ratio > 1) { perf.ratio = Math.max(1, perf.ratio - 0.25); renderer.setPixelRatio(perf.ratio); resize && resize(); }
    }
    // 相機
    if (cam.fly) {
      cam.fly.t = Math.min(1, cam.fly.t + dt / (cam.fly.dur || 0.8));
      const e = cam.fly.t < 0.5 ? 2 * cam.fly.t * cam.fly.t : 1 - Math.pow(-2 * cam.fly.t + 2, 2) / 2;
      cam.target.lerpVectors(cam.fly.from, cam.fly.to, e);
      cam.dist = cam.fly.d0 + (cam.fly.d1 - cam.fly.d0) * e;
      if (cam.fly.t >= 1) cam.fly = null;
    } else if (cam.follow && walkers[cam.follow]) {
      const p = walkers[cam.follow].g.position;
      cam.target.x += (p.x - cam.target.x) * Math.min(1, dt * 3);
      cam.target.z += (p.z - cam.target.z) * Math.min(1, dt * 3);
    }
    directorFrame(dt, now);
    placeCamera();
    // 走路
    const talkingIds = new Set(bubbles.map(b => b.id));
    for (const id in walkers) {
      const w = walkers[id];
      let walking = false;
      if (w.train) {
        w.trainT += dt;
        const k = w.trainT / 1.6;
        if (k < 0.5) w.fade = 1 - k * 2;
        else { if (!w.trainArrived) { w.pos.copy(w.trainTo); w.trainArrived = true; } w.fade = Math.min(1, (k - 0.5) * 2); }
        if (k >= 1) { w.train = false; w.trainArrived = false; w.fade = 1; }
      } else if (w.path.length) {
        const tgt = w.path[0], d = tgt.clone().sub(w.pos); d.y = 0;
        const len = d.length(), sp = w.speed || 5.5;
        if (len > 0.001) w.wantYaw = Math.atan2(d.x, d.z);
        if (len < sp * dt) { w.pos.copy(tgt); w.path.shift(); }
        else w.pos.add(d.multiplyScalar(sp * dt / len));
        walking = true;
      }
      const Lw = !w.path.length && !w.train && lots[w.loc];
      const indoors = Lw && !Lw.open && Math.abs(w.pos.x - Lw.x) < 3 && w.pos.z < Lw.z + 1;
      // 姿勢：到位之後才坐下、躺下
      const pose = !walking && !w.train && w.dest && w.pos.distanceTo(w.dest) < 0.05 ? (w.destPose || "stand") : "stand";
      if (pose !== w.pose) {
        w.pose = pose;
        if (w.ch) w.ch.setPose(pose, -0.42 / w.ch.k);
        else if (pose === "lie") { w.body.rotation.set(Math.PI / 2, 0, 0); w.body.position.set(0, 0.22, 0.12); w.body.scale.set(1, 1, 1); w.head.position.set(0, 0.62, -0.42); }
        else if (pose === "sit") { w.body.rotation.set(0, 0, 0); w.body.scale.set(1, 0.62, 1); w.body.position.set(0, 0.24, 0); w.head.position.set(0, 1.0, 0); }
        else { w.body.rotation.set(0, 0, 0); w.body.scale.set(1, 1, 1); w.body.position.set(0, 0.39, 0); w.head.position.set(0, 1.35, 0); }
      }
      const sc0 = 1.45, sc = w.g.scale.x + (sc0 - w.g.scale.x) * Math.min(1, dt * 5);
      w.g.scale.set(sc, sc, sc);
      const baseY = pose === "stand" ? 0 : (w.destY || 0);
      const bob = w.ch ? 0 : walking ? Math.abs(Math.sin(tt * 11 + w.phase)) * 0.22 : (w.asleep || pose !== "stand" ? 0 : Math.sin(tt * 2 + w.phase) * 0.04);
      w.g.position.set(w.pos.x, baseY + bob, w.pos.z);
      w.g.visible = !indoors;
      if (w.ch) {
        const want = walking ? (w.wantYaw || 0) : pose !== "stand" && w.destYaw != null ? w.destYaw : cam.az;
        w.yaw = turnTo(w.yaw, want, Math.min(1, dt * (walking ? 10 : pose !== "stand" ? 12 : 3)));
        w.ch.root.rotation.y = w.yaw;
        w.ch.root.visible = w.fade > 0.3;
        if (w.g.visible) w.ch.update(dt, tt, { walking, asleep: w.asleep, talking: talkingIds.has(id) });
      } else {
        w.head.material.opacity = (w.asleep ? 0.6 : 1) * w.fade;
        w.body.visible = w.fade > 0.3;
      }
      w.ring.visible = state && state.observing === id;
      if (w.ring.visible) { const s = 1 + Math.sin(tt * 4) * 0.08; w.ring.scale.set(s, s, s); }
      w.zz.visible = w.asleep && w.fade > 0.5;
      if (w.zz.visible) w.zz.position.y = 2.1 + Math.sin(tt * 1.5 + w.phase) * 0.12;
      w.name.visible = (cam.dist < 26 || w.ring.visible) && w.fade > 0.5;
    }
    // 泡泡
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i], w = walkers[b.id];
      b.age += dt;
      const life = b.life;
      const a = b.age < 0.25 ? b.age / 0.25 : b.age > life - 0.6 ? Math.max(0, (life - b.age) / 0.6) : 1;
      b.sp.material.opacity = a;
      if (w) b.sp.position.set(w.g.position.x, 3.0 + (b.stack || 0) * 0.15 + (1 - Math.min(1, b.age / 0.25)) * -0.3, w.g.position.z);
      const sc = Math.max(0.7, Math.min(2.4, cam.dist / 30));
      b.sp.scale.set(b.w * sc, b.h * sc, 1);
      if (b.age >= life) { root.remove(b.sp); b.sp.material.map.dispose(); b.sp.material.dispose(); bubbles.splice(i, 1); }
    }
    // 提示、名牌
    for (const id in hintMarks) { const s = hintMarks[id]; if (s.visible) s.position.y = s.userData.y + Math.sin(tt * 3 + s.userData.y) * 0.18; }
    for (const id in lots) {
      const L = lots[id]; if (!L.shell.length) continue;
      const want = 0;
      if (Math.abs(L.cut - want) < 0.001) continue;
      L.cut += (want - L.cut) * Math.min(1, dt * 6);
      if (Math.abs(L.cut - want) < 0.01) L.cut = want;
      const op = 1 - 0.8 * L.cut;
      if (L.interior) L.interior.visible = L.cut > 0.05;
      for (const m of L.shell) { m.material.transparent = L.cut > 0.01; m.material.opacity = op; m.material.depthWrite = L.cut < 0.5; m.castShadow = L.cut < 0.5; }
    }
    const lblOn = showLabels && cam.dist < 64, lblScale = Math.max(0.8, Math.min(1.5, cam.dist / 36));
    for (const s of labelSprites) { s.visible = lblOn; if (lblOn) { if (!s.userData.sx) { s.userData.sx = s.scale.x; s.userData.sy = s.scale.y; } s.scale.set(s.userData.sx * lblScale, s.userData.sy * lblScale, 1); } }
    for (const s of districtSprites) s.visible = cam.dist > 52;
    // 天氣
    if (rain.visible) {
      const a = rain.geometry.attributes.position;
      for (let i = 0; i < a.count; i++) { let y = a.getY(i) - dt * 26; if (y < 0) y += 30; a.setY(i, y); }
      a.needsUpdate = true;
      rain.position.set(cam.target.x, 0, cam.target.z);
    }
    const camY = camera.position.y;
    cloudMat.opacity = 0.85 * Math.max(0, Math.min(1, (Math.abs(camY - 36) - 6) / 10));
    for (const c of clouds) { c.position.x += c.userData.v * dt; if (c.position.x > 90) c.position.x = -55; }
    if (fireflies.visible) {
      const a = fireflies.geometry.attributes.position, base = fireflies.userData.base;
      for (let i = 0; i < a.count; i++) { a.setX(i, base[i * 3] + Math.sin(tt * 0.7 + i) * 0.5); a.setY(i, base[i * 3 + 1] + Math.sin(tt * 1.3 + i * 2) * 0.3); }
      a.needsUpdate = true;
      fireflies.material.opacity = 0.5 + Math.sin(tt * 3) * 0.4;
    }
    lifeFrame(dt, tt, state ? nightFactor(state.min) : 0, state && state.weather === "雨");
    anomFrame(tt);
    trafficFrame(tt);
    festGroup.children.forEach((m, i) => { m.position.y = m.userData.y + ((tt * 0.8 + i * 0.37) % 6); m.material.opacity = 1 - ((tt * 0.8 + i * 0.37) % 6) / 6; });
    VOXU.uVox.value = 0.25; VOXU.uAO.value = 0.9; VOXU.uFloorY.value = 0; if (VOXU.uRoomBox.value) VOXU.uRoomBox.value.z = 0;
    renderer.render(scene, camera);
  }


  /* ═════════ 平面圖：等角小房間 ═════════ */
  const RM = { floor: 0, autoFloor: false, lastState: null, renderer: null, scene: null, camera: null, group: null, host: null, loc: null, ppl: {}, running: false, raf: 0, az: 0, hooks: {}, W: 4.4, D: 3.8, spots: [], last: 0, sun: null, hemi: null, lamp: null };
  const roomType = id => { const l = E_loc(id); return l ? typeOf(l) : "house"; };
  function roomSize(id) {
    const t = roomType(id);
    if (t === "school" || t === "street" || OPEN[t]) return [6.2, 4.2];
    if (t === "tall" || t === "shop") return [5, 4];
    return [4.6, 3.8];
  }
  function roomOwner(id) { for (const c of N.characters) if (N.schedules[c.id] && N.schedules[c.id].home === id) return c; return null; }
  function roomTheme(id, fl) {
    const e = N.interiors && N.interiors[id] || {}, th = Object.assign({}, e.theme || {}, fl.theme || {});
    const owner = roomOwner(id);
    if (th.wall == null) th.wall = owner ? new T.Color(owner.color).lerp(new T.Color(0xF4EADA), 0.72).getHex() : 0xE8D3B4;
    th.dark = !!(fl.dark || e.dark); th.outdoor = !!(fl.outdoor || e.outdoor);
    return th;
  }
  function buildRoom(id) {
    const g = RM.group;
    while (g.children.length) g.remove(g.children[0]);
    const [W, D] = roomSize(id); RM.W = W; RM.D = D; RM.spots = [];
    const fl = floorsOf(id), F = fl[Math.min(RM.floor, fl.length - 1)], spec = F.items || [], th = roomTheme(id, F);
    RM.theme = th;
    RM.lamp.position.set(th.lampX != null ? th.lampX : -0.2, 2.05, th.lampZ != null ? th.lampZ : -0.2);
    const place = (u, v) => [-W / 2 + 0.35 + u * (W - 0.7), -D / 2 + 0.1 + v * (D - 0.5)];
    const vr = N.voxRoom.build(T, W, D, spec, th, place, colOf);
    for (const k of ["solid", "glow", "win"]) if (vr.meshes[k]) g.add(vr.meshes[k]);
    RM.winMat = vr.meshes.winMat;
    // 座位：沿用 furn() 算出來的位置（幾何丟掉不用）
    const dummy = new T.Group();
    for (const [type, u, v, o0] of spec) {
      const o = o0 || {}, [x, z] = place(u, v), a = (o.rot || 0) * Math.PI / 180;
      for (const sp of furn(type, o, dummy)) {
        const wx = x + sp.x * Math.cos(a) + sp.z * Math.sin(a), wz = z - sp.x * Math.sin(a) + sp.z * Math.cos(a);
        RM.spots.push({ x: wx, z: wz, pose: sp.pose, tag: sp.tag, y: sp.y, owner: sp.owner, yaw: a + faceOf(sp) });
      }
    }
    // 光源：最亮的四個
    vr.lights.sort((p, q) => q.power - p.power);
    RM.plights.forEach((L, i) => { const s0 = vr.lights[i]; if (s0) { L.position.set(s0.x, s0.y, s0.z); L.color.set(s0.color); L.userData.base = s0.power; } else L.userData.base = 0; });
    for (const id2 in RM.ppl) { RM.scene.remove(RM.ppl[id2].g); }
    RM.ppl = {};
    fitRoomCam();
    if (RM.lastState) roomLight(RM.lastState);
  }
  function roomLight(s) {
    const nf = nightFactor(s.min), th = RM.theme || {}, dark = th.dark;
    const out = th.outdoor;
    // 室內：只有一盞主燈（天花板吊燈），白天多一點窗外的柔光；只點蠟燭的房間只靠蠟燭；戶外才有太陽
    RM.sun.intensity = out ? (dark ? 0 : 0.9 * (1 - nf) + 0.05) : 0;
    RM.sun.castShadow = !!out && !dark;
    RM.hemi.intensity = dark ? 0.1 : out ? 0.7 * (1 - nf) + 0.15 : 0.16 + 0.22 * (1 - nf);
    RM.hemi.color.set(dark ? 0x7A6A9A : 0xFFF0DC); RM.hemi.groundColor.set(dark ? 0x1A1420 : 0x5A4A3E);
    RM.lamp.intensity = dark || out ? 0 : 1.5;
    RM.lamp.castShadow = !dark && !out;
    RM.plights.forEach(L => { L.intensity = (L.userData.base || 0) * (dark ? 2.6 : out ? 0.4 + nf * 1.2 : 0.35); });
    if (RM.winMat) RM.winMat.color.set(dark ? 0x3A3A5A : new T.Color(0xFFE6A8).lerp(new T.Color(0x2A3256), nf).getHex());
    RM.scene.background = null;
    // 背景：白天是暖亮的米色，黃昏轉橘，夜裡回到深黑
    if (RM.host) {
      const day = new T.Color(dark ? 0x3A3448 : 0xF2E8D8), dusk = new T.Color(dark ? 0x241E2C : 0xE8B890), night = new T.Color(0x0E0D12);
      const m = s.min % 1440, duskK = Math.max(0, 1 - Math.abs(m - 1080) / 70);
      const c = day.clone().lerp(night, nf); if (nf > 0.05 && nf < 0.95) c.lerp(dusk, duskK * 0.6);
      const top = c.clone().lerp(new T.Color(0xFFFFFF), (1 - nf) * 0.25);
      RM.host.style.background = `linear-gradient(180deg, #${top.getHexString()} 0%, #${c.getHexString()} 100%)`;
      RM.host.classList.toggle("room-day", nf < 0.5);
    }
  }
  function roomPerson(c) {
    const g = new T.Group();
    const body = add(g, new T.CylinderGeometry(0.1, 0.16, 0.36, 12), mat(new T.Color(c.color).getHex()), 0, 0.21, 0);
    const sh = new T.Mesh(new T.CircleGeometry(0.24, 14), new T.MeshBasicMaterial({ color: 0, transparent: true, opacity: 0.2, depthWrite: false })); sh.rotation.x = -Math.PI / 2; sh.position.y = 0.01; g.add(sh);
    const head = new T.Sprite(new T.SpriteMaterial({ map: avatarTexture(c), transparent: true })); head.scale.set(0.54, 0.54, 1); head.position.y = 0.62; head.userData.char = c.id; g.add(head);
    const name = textSprite(c.id, { size: 24, bg: "rgba(24,27,38,.75)", fg: "#fff", pad: 9, h: 0.22 }); name.center.set(0.5, 0); name.position.y = 0.92; g.add(name);
    const zz = emojiSprite("💤", 0.26); zz.position.set(0.24, 0.8, 0); zz.visible = false; g.add(zz);
    const st = emojiSprite("💬", 0.26); st.position.set(-0.26, 0.8, 0); st.visible = false; g.add(st);
    const ring = new T.Mesh(new T.TorusGeometry(0.28, 0.035, 6, 24), new T.MeshBasicMaterial({ color: 0xD8A75A })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.02; ring.visible = false; g.add(ring);
    RM.scene.add(g);
    const ch = chibiFor(c.id, 0.72, g);
    if (ch) { body.visible = false; head.visible = false; }
    return { id: c.id, g, body, head, name, zz, st, ring, sh, ch, yaw: Math.PI / 4, pos: null, dest: null, pose: "stand", destPose: "stand", destY: 0, phase: Math.random() * 6 };
  }
  function setRoomPose(p, pose) {
    p.pose = pose;
    if (p.ch) {
      p.ch.setPose(pose, -0.5 / p.ch.k);
      const k = p.ch.k, top = pose === "lie" ? 0.42 : pose === "sit" ? 1.06 * k : 1.62 * k;
      if (pose === "lie") { p.name.position.set(0, 0.6, -0.5); p.zz.position.set(0.24, 0.66, -0.5); p.sh.visible = false; }
      else { p.name.position.set(0, top + 0.08, 0); p.zz.position.set(0.24, top, 0); p.st.position.set(-0.26, top, 0); p.sh.visible = pose === "stand"; }
      return;
    }
    if (pose === "lie") { p.body.visible = false; p.head.position.set(0, 0.2, -0.5); p.name.position.set(0, 0.46, -0.5); p.zz.position.set(0.24, 0.5, -0.5); p.sh.visible = false; }
    else if (pose === "sit") { p.body.visible = true; p.body.scale.set(1, 0.65, 1); p.body.position.set(0, 0.12, 0); p.head.position.set(0, 0.5, 0); p.name.position.set(0, 0.8, 0); p.zz.position.set(0.24, 0.72, 0); p.sh.visible = false; }
    else { p.body.visible = true; p.body.scale.set(1, 1, 1); p.body.position.set(0, 0.18, 0); p.head.position.set(0, 0.62, 0); p.name.position.set(0, 0.92, 0); p.zz.position.set(0.24, 0.8, 0); p.sh.visible = true; }
  }
  function fitRoomCam() {
    if (!RM.host) return;
    const w = RM.host.clientWidth || 300, h = RM.host.clientHeight || 260, asp = w / h;
    const size = (RM.W + RM.D) * 0.74;
    let vh = size, vw = size * asp;
    if (vw < size * 1.3) { vw = size * 1.3; vh = vw / asp; }
    const c = RM.camera; c.left = -vw / 2; c.right = vw / 2; c.top = vh / 2; c.bottom = -vh / 2; c.updateProjectionMatrix();
    RM.renderer.setSize(w, h, false); RM.renderer.domElement.style.width = w + "px"; RM.renderer.domElement.style.height = h + "px";
  }
  function placeRoomCam() {
    const a = Math.PI / 4 + RM.az, e = 0.62, d = 30;
    RM.camera.position.set(Math.sin(a) * Math.cos(e) * d, Math.sin(e) * d + 0.7, Math.cos(a) * Math.cos(e) * d);
    RM.camera.lookAt(0, 0.55, 0);
  }
  function roomInit() {
    ensureMats();
    RM.renderer = new T.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
    RM.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    RM.renderer.shadowMap.enabled = true; RM.renderer.shadowMap.type = T.PCFSoftShadowMap;
    RM.renderer.domElement.className = "room-canvas";
    RM.scene = new T.Scene();
    RM.camera = new T.OrthographicCamera(-3, 3, 2, -2, 0.1, 100);
    RM.group = new T.Group(); RM.scene.add(RM.group);
    RM.hemi = new T.HemisphereLight(0xFFF3E2, 0x8A7868, 0.62); RM.scene.add(RM.hemi);
    RM.sun = new T.DirectionalLight(0xFFE2B8, 0.85); RM.sun.position.set(-7, 9, 5); RM.sun.castShadow = true;
    RM.sun.shadow.mapSize.set(2048, 2048); RM.sun.shadow.radius = 4; const sc = RM.sun.shadow.camera; sc.left = -5; sc.right = 5; sc.top = 5; sc.bottom = -5; sc.near = 1; sc.far = 30; RM.sun.shadow.bias = -0.0015;
    RM.scene.add(RM.sun);
    RM.lamp = new T.PointLight(0xFFD6A0, 0, 7.5, 1.4); RM.lamp.position.set(0, 2.05, 0);
    RM.lamp.shadow.mapSize.set(1024, 1024); RM.lamp.shadow.bias = -0.004; RM.lamp.shadow.radius = 3; RM.lamp.shadow.camera.near = 0.1; RM.scene.add(RM.lamp);
    RM.plights = [0, 1, 2, 3].map(() => { const L = new T.PointLight(0xFFA050, 0, 3.6, 1.6); RM.scene.add(L); return L; });
    const el = RM.renderer.domElement;
    let start = null, moved = 0;
    el.addEventListener("pointerdown", e => { start = { x: e.clientX, y: e.clientY, t: performance.now() }; moved = 0; el.setPointerCapture && el.setPointerCapture(e.pointerId); });
    el.addEventListener("pointermove", e => {
      if (!start) return;
      const dx = e.clientX - start.x; moved = Math.max(moved, Math.abs(dx) + Math.abs(e.clientY - start.y));
      if (moved > 6) { RM.az = Math.max(-0.55, Math.min(0.55, RM.az0 + dx * 0.006)); }
    });
    el.addEventListener("pointerdown", () => { RM.az0 = RM.az; });
    el.addEventListener("pointerup", e => {
      if (start && moved < 8 && performance.now() - start.t < 450) roomTap(e.clientX, e.clientY);
      start = null;
    });
    el.addEventListener("pointercancel", () => { start = null; });
    // 縮放：滾輪或雙指
    el.addEventListener("wheel", e => { e.preventDefault(); RM.camera.zoom = Math.max(1, Math.min(2.6, RM.camera.zoom * (1 - e.deltaY * 0.0015))); RM.camera.updateProjectionMatrix(); }, { passive: false });
    const touches = new Map(); let pd = 0;
    el.addEventListener("touchstart", e => { if (e.touches.length === 2) { pd = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); start = null; } }, { passive: true });
    el.addEventListener("touchmove", e => {
      if (e.touches.length !== 2 || !pd) return;
      e.preventDefault();
      const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      RM.camera.zoom = Math.max(1, Math.min(2.6, RM.camera.zoom * d / pd)); pd = d; RM.camera.updateProjectionMatrix();
    }, { passive: false });
    el.addEventListener("touchend", e => { if (e.touches.length < 2) pd = 0; }, { passive: true });
  }
  function roomTap(cx, cy) {
    const r = RM.renderer.domElement.getBoundingClientRect();
    const v = new T.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    const rc = new T.Raycaster(); rc.setFromCamera(v, RM.camera);
    const list = []; Object.values(RM.ppl).forEach(p => { if (p.ch) list.push(...p.ch.pickables()); else list.push(p.head); });
    const hits = rc.intersectObjects(list, false);
    if (hits.length && RM.hooks.onChar) RM.hooks.onChar(hits[0].object.userData.char);
  }
  function roomFrame(now) {
    if (!RM.running) return;
    if (!RM.host || !RM.host.isConnected) { roomStop(); return; }
    RM.raf = requestAnimationFrame(roomFrame);
    const dt = Math.min(0.05, (now - (RM.last || now)) / 1000); RM.last = now;
    const tt = now / 1000;
    for (const id in RM.ppl) {
      const p = RM.ppl[id];
      if (!p.pos) continue;
      const d = p.dest.clone().sub(p.pos); const len = d.length();
      let walking = false;
      if (len > 0.01) { p.wantYaw = Math.atan2(d.x, d.z); const step = Math.min(len, 1.6 * dt); p.pos.add(d.multiplyScalar(step / len)); walking = true; }
      const pose = walking ? "stand" : p.destPose;
      if (pose !== p.pose) setRoomPose(p, pose);
      if (p.ch) {
        p.g.position.set(p.pos.x, pose === "stand" ? 0 : p.destY, p.pos.z);
        const want = walking ? p.wantYaw : pose !== "stand" && p.destYaw != null ? p.destYaw : Math.PI / 4 + RM.az;
        p.yaw = turnTo(p.yaw, want, Math.min(1, dt * (walking ? 10 : pose !== "stand" ? 12 : 3)));
        p.ch.root.rotation.y = p.yaw;
        p.ch.update(dt, tt, { walking, asleep: p.asleep, talking: p.st.visible && !p.asleep });
      } else {
      const y = pose === "stand" ? (walking ? Math.abs(Math.sin(tt * 10 + p.phase)) * 0.06 : 0) : p.destY;
      p.g.position.set(p.pos.x, y + (pose === "stand" && !walking ? Math.sin(tt * 2 + p.phase) * 0.01 : 0), p.pos.z);
      }
      if (p.ring.visible) { const s = 1 + Math.sin(tt * 4) * 0.08; p.ring.scale.set(s, s, s); }
      if (p.zz.visible) p.zz.position.y += Math.sin(tt * 1.5 + p.phase) * 0.0015;
    }
    placeRoomCam();
    RM.renderer.render(RM.scene, RM.camera);
  }
  function roomStop() { RM.running = false; cancelAnimationFrame(RM.raf); }
  function roomMount(el, locId, hooks) {
    RM.hooks = hooks || {};
    return loadThree().then(three => {
      T = three;
      if (!RM.renderer) roomInit();
      if (RM.host !== el) RM.autoFloor = true;
      RM.host = el;
      el.insertBefore(RM.renderer.domElement, el.firstChild);
      if (RM.loc !== locId) { RM.loc = locId; RM.az = 0; RM.floor = 0; RM.autoFloor = true; RM.camera.zoom = 1; RM.camera.updateProjectionMatrix(); buildRoom(locId); } else fitRoomCam();
      floorUI();
      if (!RM.running) { RM.running = true; RM.last = 0; RM.raf = requestAnimationFrame(roomFrame); }
    });
  }
  // s = { where, min, observing, hints:Set, talking:Set }
  function roomUpdate(s) {
    if (!RM.renderer || !RM.loc || !RM.host || !RM.host.isConnected) return;
    const nf = nightFactor(s.min);
    roomLight(s);
    winMat.emissiveIntensity = 0.15 + nf * 1.05; lampMat.emissiveIntensity = nf > 0.2 ? 1.2 : 0.15;
    for (const k in furnMats) furnMats[k].emissiveIntensity = 0.04 + nf * 0.22;
    RM.lastState = s;
    const here = N.characters.map(c => c.id).filter(id => s.where[id] && s.where[id].loc === RM.loc);
    if (RM.autoFloor) {
      RM.autoFloor = false;
      const cnt = [0, 0]; here.forEach(id => cnt[floorOf(RM.loc, s.where[id])]++);
      const want = here.indexOf(s.observing) >= 0 ? floorOf(RM.loc, s.where[s.observing]) : (cnt[1] > cnt[0] ? 1 : 0);
      if (want !== RM.floor && floorsOf(RM.loc).length > 1) { RM.floor = want; buildRoom(RM.loc); }
      floorUI();
    }
    const fbtn = RM.host.querySelectorAll("[data-rfloor]");
    fbtn.forEach(b => { const i = +b.dataset.rfloor, n = here.filter(id => floorOf(RM.loc, s.where[id]) === i).length; b.textContent = floorsOf(RM.loc)[i].name.split("・")[0] + (n ? ` · ${n}人` : ""); b.title = floorsOf(RM.loc)[i].name; b.className = i === RM.floor ? "on" : ""; });
    const ids = here.filter(id => floorOf(RM.loc, s.where[id]) === RM.floor);
    const seats = RM.spots.length ? seatPeople({ spots: RM.spots }, ids, s.where) : {};
    const free = ids.filter(id => !seats[id]);
    // 沒有家具可用的人：站在房間前半部
    const standAt = i => new T.Vector3(-RM.W / 2 + 0.7 + (i % 5) * ((RM.W - 1.4) / 4), 0, RM.D / 2 - 0.45 - Math.floor(i / 5) * 0.5);
    for (const id in RM.ppl) if (ids.indexOf(id) < 0) { RM.scene.remove(RM.ppl[id].g); delete RM.ppl[id]; }
    ids.forEach(id => {
      let p = RM.ppl[id];
      const seat = seats[id], dest = seat ? new T.Vector3(seat.x, 0, seat.z) : standAt(free.indexOf(id));
      if (!p) { p = RM.ppl[id] = roomPerson(N.characters.find(c => c.id === id)); p.pos = dest.clone(); }
      p.dest = dest; p.destPose = seat ? seat.pose : "stand"; p.destY = seat ? seat.y : 0; p.destYaw = seat ? seat.yaw : null;
      const asleep = !s.where[id].avail;
      p.zz.visible = asleep; p.asleep = asleep;
      p.st.visible = !asleep && ((s.talking && s.talking.has(id)) || (s.hints && s.hints.has(id)));
      p.ring.visible = s.observing === id;
      p.head.material.opacity = asleep ? 0.8 : 1;
      p.name.material.color.set(s.observing === id ? 0xFFE2A8 : 0xFFFFFF);
    });
  }
  function floorsOf(id) { const e = N.interiors && N.interiors[id]; return !e ? [{ items: [] }] : Array.isArray(e) ? [{ items: e }] : e.floors || [e]; }
  function floorOf(locId, w) {
    const fl = floorsOf(locId); if (fl.length < 2) return 0;
    if (!w.avail) return 1;
    return fl[1].match && new RegExp(fl[1].match).test(w.act || "") ? 1 : 0;
  }
  function floorUI() {
    const old = RM.host && RM.host.querySelector(".room-floors"); if (old) old.remove();
    const fl = floorsOf(RM.loc); if (!RM.host || fl.length < 2) return;
    const box = document.createElement("div"); box.className = "room-floors";
    fl.forEach((f, i) => { const b = document.createElement("button"); b.type = "button"; b.dataset.rfloor = i; b.className = i === RM.floor ? "on" : ""; b.textContent = f.name.split("・")[0]; box.appendChild(b); });
    box.addEventListener("click", e => {
      const b = e.target.closest("[data-rfloor]"); if (!b) return;
      e.stopPropagation();
      RM.floor = +b.dataset.rfloor; RM.autoFloor = false; buildRoom(RM.loc); floorUI(); if (RM.lastState) roomUpdate(RM.lastState);
    });
    RM.host.appendChild(box);
  }
  function roomHas(locId) { return !!(N.interiors && N.interiors[locId]); }
  N.room3d = { supported, has: roomHas, mount: roomMount, update: roomUpdate, stop: roomStop };

  /* ═════════ 對外 ═════════ */
  function resize() {
    if (!host || !built) return;
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = w + "px"; renderer.domElement.style.height = h + "px";
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  function mount(el, h) {
    hooks = h || {};
    return loadThree().then(three => {
      T = three;
      if (!buildP) buildP = build(hooks.onProgress);
      return buildP;
    }).then(() => {
      host = el;
      el.insertBefore(renderer.domElement, el.firstChild);
      resize();
      if (window.ResizeObserver) { if (ro) ro.disconnect(); ro = new ResizeObserver(resize); ro.observe(el); }
      else window.addEventListener("resize", resize);
      if (!running) { running = true; lastT = 0; raf = requestAnimationFrame(frame); }
    });
  }
  function unmount() {
    running = false; cancelAnimationFrame(raf);
    if (ro) { ro.disconnect(); ro = null; }
    if (renderer && renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    host = null;
  }
  function pause(p) {
    if (!built || !host) return;
    if (p) { running = false; cancelAnimationFrame(raf); }
    else if (!running) { running = true; lastT = 0; raf = requestAnimationFrame(frame); }
  }
  let festKey = "";
  function update(s) {
    if (!built) return;
    state = s;
    applySky(s.min, s.weather);
    // 居民位置
    const groups = {};
    for (const c of N.characters) {
      const w = s.where[c.id]; if (!w || !lots[w.loc]) continue;
      (groups[w.loc] = groups[w.loc] || []).push(c.id);
    }
    for (const id in lots) {
      const L = lots[id], n = (groups[id] || []).length;
      L.occ = n;
      if (L.open) continue;
      if (L.badgeN !== n) {
        if (L.badge) { root.remove(L.badge); L.badge.material.map.dispose(); L.badge.material.dispose(); L.badge = null; }
        if (n) { L.badge = textSprite("👤 " + n, { size: 28, bg: "rgba(168,118,51,.95)", fg: "#fff", pad: 12, h: 0.6 }); L.badge.position.set(L.x + 2.1, L.h + 0.4, L.z); L.badge.userData.loc = id; L.badge.renderOrder = 6; root.add(L.badge); }
        L.badgeN = n;
      }
    }
    for (const loc in groups) {
      const ids = groups[loc], L0 = lots[loc];
      const seats = {};
      const rest = ids.filter(id => !seats[id]);
      ids.forEach((id, i0) => {
        const seat = seats[id], i = rest.indexOf(id);
        const wk = walkers[id], dest = spotFor(loc, i0, ids.length);
        wk.destPose = seat ? seat.pose : "stand"; wk.destY = seat ? seat.y : 0; wk.destYaw = seat ? seat.yaw : null;
        wk.asleep = !s.where[id].avail;
        if (firstPlace || !wk.loc) { wk.pos.copy(dest); wk.g.position.copy(dest); wk.loc = loc; wk.path = []; wk.dest = dest; return; }
        if (wk.loc !== loc) {
          const far = wk.pos.distanceTo(dest);
          routeTo(wk, dest, loc);
          const total = wk.path.reduce((acc, p, k) => acc + p.distanceTo(k ? wk.path[k - 1] : wk.pos), 0) || far;
          wk.speed = Math.max(5.5, total / 9);
          wk.loc = loc; wk.dest = dest;
        } else if (!wk.dest || wk.dest.distanceTo(dest) > 0.05) {
          if (!wk.path.length && !wk.train) wk.path = [dest];
          else if (wk.path.length) wk.path[wk.path.length - 1] = dest;
          else wk.trainTo = dest;
          wk.dest = dest; wk.speed = wk.speed || 5.5;
        }
      });
    }
    firstPlace = false;
    // 相遇提示
    const hotLocs = new Set();
    if (s.hints) for (const id of s.hints) if (s.where[id]) hotLocs.add(s.where[id].loc);
    for (const id in hintMarks) {
      const m = hintMarks[id], L = lots[id];
      m.visible = hotLocs.has(id);
      if (m.visible) { m.userData.y = L.h + 2.3; m.position.set(L.x + 1.6, m.userData.y, L.z); }
    }
    // 節日燈籠
    const fk = (s.fests || []).map(f => f.id).join(",");
    if (fk !== festKey) {
      festKey = fk;
      while (festGroup.children.length) festGroup.remove(festGroup.children[0]);
      const L = lots[s.partyLoc] || lots["諾文鐘塔廣場"];
      if (fk && L) {
        const icon = s.fests[0].icon || "🏮";
        for (let i = 0; i < 10; i++) {
          const sp = emojiSprite(i % 3 ? "✨" : icon, i % 3 ? 0.7 : 1.1);
          sp.position.set(L.x + Math.cos(i * 1.7) * 2.6, 0, L.z + Math.sin(i * 1.7) * 2.6); sp.userData.y = 2 + (i % 4) * 0.3;
          festGroup.add(sp);
        }
      }
    }
  }
  function say(id, text, kind, delay) {
    if (!built || !walkers[id] || !text) return;
    const go = () => {
      director.lastSay = { id, t: performance.now() };
      if (N.town3d.onSay) N.town3d.onSay(id, text);
      for (const b of bubbles) if (b.id === id) b.age = Math.max(b.age, b.life - 0.6);
      const w = walkers[id], sp = bubbleSprite(text, w.color, kind);
      root.add(sp);
      bubbles.push({ id, sp, age: 0, life: Math.min(9, 3.5 + text.length * 0.12), w: sp.scale.x, h: sp.scale.y });
    };
    if (delay) setTimeout(go, delay); else go();
  }
  function focus(id, close) {
    const w = walkers[id]; if (!w) return;
    flyTo(w.pos.x, w.pos.z, close ? 22 : cam.dist);
    setTimeout(() => { cam.follow = id; }, 820);
  }
  function flyRegion(rid) {
    const ps = N.regions.find(r => r.id === rid);
    if (!ps) return;
    const b = BLOCK[rid + "0"], b2 = BLOCK[rid + (ps.pages.length > 1 && rid !== "outer" ? "1" : "0")];
    flyTo((b[0] + b2[0]) / 2 + 7, (b[1] + b2[1]) / 2 + 10.5, rid === "outer" ? 50 : 40);
  }
  // 紀元層異常：地點上方出現一圈慢慢轉的光環和飄起來的光點
  let anom = null, anomLoc = null;
  function setAnomaly(locId) {
    if (!built || locId === anomLoc) return;
    anomLoc = locId;
    if (anom) { scene.remove(anom); anom = null; }
    const L = locId && lots[locId]; if (!L) return;
    const g = new T.Group(); g.position.set(L.x, 0, L.z);
    const ringM = new T.MeshBasicMaterial({ color: 0xA894FF, transparent: true, opacity: 0.7, depthWrite: false });
    const ring = new T.Mesh(new T.TorusGeometry(2.6, 0.08, 4, 32), ringM); ring.rotation.x = Math.PI / 2; ring.position.y = 0.25; g.add(ring);
    const col = new T.Mesh(new T.CylinderGeometry(2.3, 2.3, 9, 24, 1, true), new T.MeshBasicMaterial({ color: 0xB9A8FF, transparent: true, opacity: 0.12, side: T.DoubleSide, depthWrite: false }));
    col.position.y = 4.5; g.add(col);
    const dots = [];
    for (let i = 0; i < 14; i++) { const d = new T.Mesh(new T.OctahedronGeometry(0.16, 0), new T.MeshBasicMaterial({ color: i % 3 ? 0xE8DDFF : 0xF4D35E, transparent: true, opacity: 0.9 })); d.userData = { a: i / 14 * Math.PI * 2, r: 1 + (i % 4) * 0.4, s: 0.4 + (i % 5) * 0.15, y0: (i * 0.7) % 8 }; g.add(d); dots.push(d); }
    g.userData = { ring, col, dots };
    anom = g; scene.add(g);
  }
  function anomFrame(tt) {
    if (!anom) return;
    const u = anom.userData;
    u.ring.rotation.z = tt * 0.6; u.ring.material.opacity = 0.5 + Math.sin(tt * 2) * 0.2;
    u.col.material.opacity = 0.08 + Math.sin(tt * 1.3) * 0.04;
    for (const d of u.dots) { const k = d.userData, a = k.a + tt * k.s; d.position.set(Math.cos(a) * k.r, (k.y0 + tt * 0.8 * k.s) % 8 + 0.3, Math.sin(a) * k.r); d.rotation.y = tt * 2; }
  }
  function flyLoc(locId, d) { const L = lots[locId]; if (L) flyTo(L.x, L.z - 0.4, d || 24); }
  function setLabels(on) { showLabels = on; }
  function setXray(on) { xray = on; }
  function home() { flyTo(14, 6, 40); }
  N.town3d = { setAnomaly, supported, mount, unmount, update, say, focus, flyRegion, flyLoc, setLabels, setXray, setDirector, home, pause,
    isFollowing: () => cam.follow, isReady: () => built };
})();
