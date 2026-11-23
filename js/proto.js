/* 諾文小鎮：電腦版高畫質試做（一條小街）
 * 跟房間同一套積木：1 格 = 10 公分，人 1.6 公尺。
 * 建築、路面、街上的小東西全部用方塊拼；其中一棟切開前牆和屋頂，直接看到裡面的家具（跟房間共用同一份家具模型）。
 * 後製：柔和陰影＋移軸景深（像在看微縮模型）。 */
(function () {
  "use strict";
  const N = window.NOVUM;
  const VR = N.voxRoom, K = VR._k, V = VR.V;
  const { Grid, vfurn, placer, toMeshes, mix, hashI, F_GLOW, F_WIN, F_NOAO } = K;
  let T;
  const Q = new URLSearchParams(location.search);

  /* ── 小工具：用格子座標畫方塊 ── */
  function box(G, x0, y0, z0, x1, y1, z1, c, f) {
    for (let x = x0; x < x1; x++) for (let y = y0; y < y1; y++) for (let z = z0; z < z1; z++) {
      const cc = typeof c === "function" ? c(x, y, z) : c;
      if (cc == null) continue;
      if (cc === -1) G.m.delete(((x + 512) * 1024 + (y + 512)) * 1024 + (z + 512)); else G.set(x, y, z, cc, f || 0);
    }
  }
  const del = (G, x, y, z) => G.m.delete(((x + 512) * 1024 + (y + 512)) * 1024 + (z + 512));
  // 灰泥牆：每一格顏色有一點點不一樣，看起來像手抹的
  const plaster = base => (x, y, z) => mix(base, hashI(x, y, z) < 0.5 ? 0xFFFFFF : 0x000000, hashI(x * 3, y, z * 7) * 0.05);
  const putFurn = (G, type, o, xm, zm, lights, ym) => {
    let B = placer(G, xm, zm, o.rot || 0, lights);
    if (ym) { const B0 = B; B = (w, h, d, c, x, y, z, f, p) => B0(w, h, d, c, x, (y || 0) + ym, z, f, p); B.light = (x, y, z, c, p) => B0.light(x, y + ym, z, c, p); B.paint = B0.paint; }
    vfurn(type, o, B, o.c != null ? o.c : 0x8E6A45, {});
  };

  /* ── 一棟房子 ──
   * x0,z0：左後角（格）　w,d：寬深（格）　fl：樓層數　p：配色
   * cut：切開前牆和屋頂，看得到裡面 */
  function house(G, x0, z0, w, d, fl, p, opt, lights) {
    opt = opt || {};
    const FH = 30, H = fl * FH, x1 = x0 + w, z1 = z0 + d, cut = opt.cut;
    const wallC = plaster(p.wall), trim = p.trim, stone = 0xB8AC98;
    // 石砌牆基
    box(G, x0 - 1, 0, z0 - 1, x1 + 1, 4, z1 + 1, (x, y, z) => (x > x0 - 1 && x < x1 && z > z0 - 1 && z < z1) ? null : mix(stone, 0x000000, hashI(x, y, z) * 0.12));
    // 牆
    for (let y = 4; y < H; y++) for (let x = x0; x < x1; x++) for (let z = z0; z < z1; z++) {
      const edge = x === x0 || x === x1 - 1 || z === z0 || z === z1 - 1;
      if (!edge) continue;
      if (cut && z === z1 - 1) continue;                                   // 前牆拿掉
      if (cut && y >= FH && x !== x0 && z !== z0) continue;
      const corner = (x === x0 || x === x1 - 1) && (z === z0 || z === z1 - 1);
      G.set(x, y, z, corner && (y >> 1) % 2 ? mix(p.wall, 0x8A7A68, 0.35) : wallC(x, y, z), 0);
    }
    // 每層樓之間的線腳
    for (let f = 1; f < fl; f++) for (let x = x0 - 1; x <= x1; x++) for (const z of [z0 - 1, z1]) if (!(cut && z === z1)) G.set(x, f * FH, z, trim, 0);
    // 樓板（切開的那棟看得到）
    if (cut) for (let f = 0; f < fl; f++) box(G, x0 + 1, f * FH + (f ? 0 : 3), z0 + 1, x1 - 1, f * FH + (f ? 1 : 4), z1 - 1, (x, y, z) => (x + (z >> 2)) % 6 === 0 ? 0x7A5638 : mix(0xA87A50, 0x000000, hashI(x, 0, z >> 2) * 0.1));
    // 窗戶、門
    const winAt = (fx, f, side) => {
      // fx：沿牆的位置（格）　side：front/left
      const y0 = f * FH + (f ? 9 : 10), ww = 9, wh = 13;
      for (let i = -1; i <= ww; i++) for (let j = -1; j <= wh; j++) {
        const fr = i === -1 || i === ww || j === -1 || j === wh || i === (ww >> 1) || j === 8;
        const [x, z] = side === "front" ? [fx + i, z1 - 1] : [x0, z0 + fx + i];
        if (fr) G.set(x, y0 + j, z, p.frame, 0); else G.set(x, y0 + j, z, 0xFFE6A8, F_WIN);
      }
      // 百葉窗、窗台花箱
      if (p.shutter) for (const s of [-4, ww + 1]) for (let i = 0; i < 3; i++) for (let j = 0; j < wh; j++) {
        const [x, z] = side === "front" ? [fx + s + i, z1] : [x0 - 1, z0 + fx + s + i];
        G.set(x, y0 + j, z, j % 3 === 0 ? mix(p.shutter, 0x000000, 0.15) : p.shutter, 0);
      }
      for (let i = -1; i <= ww; i++) {
        const [x, z, ox, oz] = side === "front" ? [fx + i, z1, 0, 1] : [x0 - 1, z0 + fx + i, -1, 0];
        G.set(x, y0 - 2, z, 0xE8DCC8, 0);
        if (f > 0 && opt.flowers) {
          G.set(x + ox, y0 - 2, z + oz, 0x9A5A3A, 0); G.set(x + ox, y0 - 1, z + oz, 0x8A4E30, 0);
          if (hashI(x, y0, z) < 0.75) G.set(x + ox, y0, z + oz, [0xF0607A, 0xF4D35E, 0xFFFFFF, 0xE8508A, 0x5E9A4E][Math.floor(hashI(z, x, 3) * 5)], 0);
          if (hashI(x, z, 9) < 0.5) G.set(x + ox * 2, y0 - 2 - Math.floor(hashI(x, 1, z) * 3), z + oz * 2, 0x5E9A4E, 0);
        }
      }
    };
    if (!cut) {
      for (let f = 0; f < fl; f++) {
        const n = Math.max(1, Math.floor((w - 8) / 16));
        for (let k = 0; k < n; k++) {
          const fx = x0 + Math.round((k + 0.5) * w / n) - 4;
          if (f === 0 && k === (opt.doorAt != null ? opt.doorAt : 0)) continue;
          winAt(fx, f, "front");
        }
      }
      // 門
      const n = Math.max(1, Math.floor((w - 8) / 16)), dk = opt.doorAt != null ? opt.doorAt : 0, dx = x0 + Math.round((dk + 0.5) * w / n) - 5;
      for (let i = -1; i <= 10; i++) for (let j = 4; j <= 25; j++) {
        const fr = i === -1 || i === 10 || j === 25;
        G.set(dx + i, j, z1 - 1, fr ? p.frame : (i === 5 ? mix(p.door, 0x000000, 0.2) : (j - 4) % 5 === 0 ? mix(p.door, 0x000000, 0.12) : p.door), 0);
      }
      G.set(dx + 7, 14, z1, 0xD8B060, 0);
      box(G, dx - 1, 0, z1, dx + 11, 2, z1 + 3, 0xC8BCA8);    // 台階
      // 遮陽棚
      if (opt.awning) {
        const ax0 = x0 + 2, ax1 = x1 - 2;
        for (let x = ax0; x < ax1; x++) for (let k = 0; k < 9; k++) {
          const y = 28 - Math.floor(k * 0.6), c = ((x - ax0) >> 2) % 2 ? opt.awning : 0xF4F0E8;
          G.set(x, y, z1 + k, c, 0); if (k === 8) { G.set(x, y - 1, z1 + k, c, 0); if (x % 2) G.set(x, y - 2, z1 + k, c, 0); }
        }
      }
      // 招牌
      if (opt.sign) {
        for (let i = 0; i < 4; i++) G.set(x1 - 3, 22, z1 + i, 0x2E3238, 0);
        box(G, x1 - 3, 13, z1 + 1, x1 - 2, 21, z1 + 4, (x, y, z) => (y === 13 || y === 20 || z === z1 + 1 || z === z1 + 3) ? 0x6A4630 : opt.sign);
      }
      // 側牆窗
      for (let f = 0; f < fl; f++) winAt(Math.floor(d / 2) - 4, f, "left");
    }
    // 屋頂：瓦片一層一層往上縮（雙坡，坡面朝前後）
    if (!cut) {
      const ov = 2, rise = Math.ceil((d + ov * 2) / 2);
      for (let k = 0; k < rise; k++) {
        const y = H + k, za = z0 - ov + k, zb = z1 + ov - 1 - k;
        if (za > zb) break;
        for (let x = x0 - ov; x < x1 + ov; x++) {
          const tile = c => mix(c, 0x000000, ((x + k * 2) % 4 === 0 ? 0.18 : 0) + hashI(x, k, 1) * 0.08);
          G.set(x, y, za, tile(p.roof), 0); G.set(x, y, zb, tile(p.roof), 0);
          if (k === 0 && hashI(x, 5, za) < 0.2) G.set(x, y - 1, zb, mix(p.roof, 0x000000, 0.25), 0);
        }
        // 山牆
        for (const x of [x0, x1 - 1]) for (let z = za + 1; z < zb; z++) G.set(x, y, z, wallC(x, y, z), 0);
      }
      // 煙囪
      if (opt.chimney) box(G, x1 - 8, H, z0 + 4, x1 - 4, H + rise + 5, z0 + 8, (x, y, z) => y >= H + rise + 4 ? 0x5A4A40 : mix(0xB06A4A, 0x000000, ((y + (x % 2)) % 3 === 0) ? 0.2 : 0));
    }
    // 切開的那棟：裡面擺家具（跟房間同一份模型）
    if (cut && opt.inside) for (const [type, xm, zm, o, ym] of opt.inside) putFurn(G, type, o || {}, xm, zm, lights, ym);
  }

  /* ── 樹：圓圓的樹冠 ── */
  function tree(G, xm, zm, s) {
    const cx = Math.round(xm / V), cz = Math.round(zm / V), h = Math.round(18 * s), r = Math.round(9 * s);
    box(G, cx - 1, 0, cz - 1, cx + 1, h, cz + 1, (x, y) => mix(0x6A4A30, 0x000000, (y % 4 === 0) ? 0.15 : 0));
    const cy = h + r - 3;
    for (let x = -r; x <= r; x++) for (let y = -r; y <= r; y++) for (let z = -r; z <= r; z++) {
      const d = Math.hypot(x, y * 1.15, z) + hashI(x, y, z) * 2.2;
      if (d > r) continue;
      if (d < r - 2.5) continue;   // 只留外殼
      const lit = (y + r) / (2 * r);
      G.set(cx + x, cy + y, cz + z, mix(mix(0x4E8A3E, 0x8CC060, lit * 0.8), 0x000000, hashI(x, z, y) * 0.12), 0);
    }
  }
  function lamp(G, xm, zm, lights) {
    const x = Math.round(xm / V), z = Math.round(zm / V);
    box(G, x - 1, 0, z - 1, x + 2, 2, z + 2, 0x2E3238); box(G, x, 2, z, x + 1, 26, z + 1, 0x2E3238);
    for (let i = 0; i < 4; i++) G.set(x + 1 + i, 25, z, 0x2E3238, 0);
    box(G, x + 3, 21, z - 1, x + 6, 24, z + 2, 0xFFE2A0, F_GLOW); box(G, x + 2, 24, z - 2, x + 7, 25, z + 3, 0x2E3238);
    lights.push({ x: (x + 4.5) * V, y: 2.2, z: (z + 0.5) * V, color: 0xFFB060, power: 1 });
  }

  // 甜點店：外面的粉色灰泥牆、白窗框、綠百葉窗，室內照同一組顏色
  const CAFE = { wall: 0xF6CCD6, trim: 0xFFF0F2, frame: 0xFFFFFF, roof: 0xB85A3A, door: 0x6A8A6A, shutter: 0x6A9A7A };

  /* ── 整條街 ── */
  function buildScene() {
    const G = new Grid(), lights = [];
    const X0 = -140, X1 = 140, Z0 = -90, Z1 = 90;
    // 地面：後面人行道、中間石板路、前面草地和小廣場
    for (let x = X0; x < X1; x++) for (let z = Z0; z < Z1; z++) {
      let c;
      if (z < 10) c = (x % 8 === 0 || z % 8 === 0) ? 0xC8BCA8 : mix(0xE4DACA, 0x000000, hashI(x >> 3, 0, z >> 3) * 0.08);           // 人行道方磚
      else if (z < 12) c = 0xB0A490;                                                                                                   // 路緣
      else if (z < 52) { const bx = (x + ((z >> 2) % 2) * 2) >> 2; c = ((x + ((z >> 2) % 2) * 2) % 4 === 0 || z % 4 === 0) ? 0x8A8070 : mix(0xA89C88, hashI(bx, 0, z >> 2) < 0.5 ? 0xFFFFFF : 0x000000, hashI(bx, 1, z >> 2) * 0.12); }   // 石板路
      else if (z < 54) c = 0xB0A490;
      else c = mix(0x7AB05E, 0x000000, hashI(x, 0, z) * 0.1 + (hashI(x >> 2, 1, z >> 2) < 0.3 ? 0.08 : 0));                           // 草地
      G.set(x, -1, z, c, F_NOAO); G.set(x, -2, z, 0x6E5A44, F_NOAO);
    }
    // 小廣場：圓形石板
    for (let x = -30; x <= 30; x++) for (let z = 56; z <= 88; z++) { const d = Math.hypot(x, (z - 72) * 1.3); if (d < 20) G.set(x, -1, z, (Math.floor(d) % 4 === 0) ? 0xC8BCA8 : mix(0xE4DACA, 0x000000, hashI(x >> 2, 3, z >> 2) * 0.08), F_NOAO); }
    // 三棟房子＋一棟切開
    house(G, -134, -84, 52, 50, 2, { wall: 0xF4E8D4, trim: 0xE0D0B8, frame: 0xF8F4EC, roof: 0xC8643E, door: 0x7A4A2E, shutter: 0x4E8A8A }, { awning: 0xD84A4A, sign: 0xF4C860, flowers: true, chimney: true }, lights);
    house(G, -78, -80, 38, 46, 3, { wall: 0xBFD8E8, trim: 0xE8EEF2, frame: 0xF8F4EC, roof: 0x5A6E8A, door: 0x3E5A7A, shutter: 0xF4E8D4 }, { flowers: true }, lights);
    house(G, -36, -84, 56, 50, 2, CAFE, { awning: 0xE07A96, sign: 0xF4D35E, flowers: true, doorAt: 1, chimney: true }, lights);
    house(G, 26, -84, 60, 50, 2, { wall: 0xF4E8D4, trim: 0xE0D0B8, frame: 0xF8F4EC, roof: 0xC8643E, door: 0x4E6A8A, shutter: 0x4E8A8A }, { flowers: true, chimney: true, doorAt: 1 }, lights);
    // 第五棟：塔樓
    house(G, 92, -86, 40, 52, 4, { wall: 0xE8D8B8, trim: 0xFFF4E0, frame: 0xF8F4EC, roof: 0x7A4A8A, door: 0x5A3A6A, shutter: 0x7A4A8A }, { flowers: true, chimney: false }, lights);
    // 街上的東西（同一份零件）
    const P = (t, x, z, o) => putFurn(G, t, o || {}, x, z, lights);
    [[-11, 0.7], [-4, 0.7], [3, 0.7], [11, 0.7]].forEach(([x, z]) => lamp(G, x, z, lights));
    tree(G, -9.5, 7.6, 1.1); tree(G, 9.8, 7.4, 1.25); tree(G, 6.5, 8.6, 0.8);
    P("bench2", -5.5, 6.2, { c: 0x8A5E3E }); P("bench2", 5.5, 6.2, { c: 0x8A5E3E });
    P("fountain", 0, 7.2, {});
    P("flowers", -2.3, 5.9); P("flowers", 2.3, 5.9); P("flowers", -11.5, 6.3); P("bush", -7.6, 8.5); P("bush", 12.2, 6.2);
    P("crates", -8.2, 0.4); P("plant", -10.2, 0.4); P("plant", -2.5, 0.35); P("trash", 7.6, 0.6); P("plant", 9.0, 0.4);
    P("newsstand", -1.2, 0.6, { rot: 0 });
    return { G, lights };
  }

  /* ── 移軸景深：畫面上下模糊、中間清楚 ── */
  function tiltShift(renderer) {
    const rt = new T.WebGLRenderTarget(4, 4, { minFilter: T.LinearFilter, magFilter: T.LinearFilter, type: T.HalfFloatType });   // 浮點：超過 1 的亮度先留著，最後再柔和地壓回來
    const mat = new T.ShaderMaterial({
      uniforms: { tDiffuse: { value: rt.texture }, res: { value: new T.Vector2(1, 1) }, amount: { value: 1.0 }, expo: { value: 1.0 } },
      vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
      fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 res; uniform float amount; uniform float expo; varying vec2 vUv;
        vec3 soft(vec3 c){ vec3 k = 0.78 + 0.22 * (1.0 - exp(-(c - 0.78) / 0.22)); return mix(c, k, step(0.78, c)); }
        void main(){
          float d = abs(vUv.y - 0.48); float b = smoothstep(0.16, 0.55, d) * 3.2 * amount;
          vec4 sum = vec4(0.0); float tot = 0.0;
          for (int i = -4; i <= 4; i++) for (int j = -4; j <= 4; j++) {
            vec2 o = vec2(float(i), float(j)) * b / res; float w = 1.0 - length(vec2(i, j)) / 6.0;
            if (w > 0.0) { sum += texture2D(tDiffuse, vUv + o) * w; tot += w; }
          }
          vec4 c = sum / tot;
          // 一點點暖色調和暗角
          c.rgb = soft(c.rgb * expo);   // 防過曝：0.78 以上慢慢收住，不會變成一片白
          c.rgb = mix(c.rgb, c.rgb * vec3(1.04, 1.0, 0.94), 0.6);
          float vig = smoothstep(0.95, 0.35, length(vUv - 0.5)); c.rgb *= mix(0.86, 1.0, vig);
          gl_FragColor = c;
        }`, depthTest: false, depthWrite: false });
    const quad = new T.Mesh(new T.PlaneGeometry(2, 2), mat), sc = new T.Scene(), cam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    sc.add(quad);
    return {
      setSize(w, h, pr) { rt.setSize(w * pr, h * pr); mat.uniforms.res.value.set(w * pr, h * pr); },
      render(scene, camera) { renderer.setRenderTarget(rt); renderer.render(scene, camera); renderer.setRenderTarget(null); renderer.render(sc, cam); },
      mat
    };
  }

  /* ── 室內：跟外觀同一組顏色（牆＝外牆灰泥、護牆板＝百葉窗綠、窗框白、窗戶造型一樣） ── */
  function buildInterior(scene, lights3) {
    const F = N.interiors["諾文甜點店"];
    const [W, D] = F.size || [9, 7];
    const th = Object.assign({}, F.theme, {
      wall: CAFE.wall, wall2: mix(CAFE.wall, 0x000000, 0.05), wallPat: "stripe", wall3: mix(CAFE.wall, 0xFFFFFF, 0.45),
      wain: CAFE.shutter, trim: CAFE.frame, cap: CAFE.trim, frame: CAFE.frame, winStyle: "square",
      floorPat: "check", floor: [0xF4ECE6, 0xE8C8D0, 0xF4ECE6], seam: 0xD8B0BC, lampC: 0xFF9A48, bulbC: 0xFFC070, ceilStyle: Q.get("lamp") || "chandelier", seed: 11, furnC: 0x8A6A4E, cloth: 0xE07A96
    });
    const place = (u, v) => [-W / 2 + 0.35 + u * (W - 0.7), -D / 2 + 0.1 + v * (D - 0.5)];
    const vr = VR.build(T, W, D, F.items.map(it => [it[0], it[1], it[2], Object.assign({}, it[3])]), th, place, c => c == null ? 0x8E6A45 : c);
    const g = new T.Group();
    for (const k of ["solid", "glow", "win"]) if (vr.meshes[k]) g.add(vr.meshes[k]);
    vr.meshes.winMat.color.set(0xFFF4D8);
    scene.add(g);
    vr.lights.sort((a, b) => b.power - a.power);
    for (const L of vr.lights.slice(0, 10)) { const p = new T.PointLight(L.color, 0.5 * L.power, 3.5, 1.6); p.position.set(L.x, L.y, L.z); p.userData.ceil = !!L.ceil; scene.add(p); lights3.push(p); }
    const lum = c => ((c >> 16 & 255) * 0.3 + (c >> 8 & 255) * 0.59 + (c & 255) * 0.11) / 255;
    return { W, D, vr, light: (lum(th.wall) + lum(th.floor[0])) / 2 };
  }

  function start(el) {
    T = window.THREE;
    const renderer = new T.WebGLRenderer({ antialias: true });
    const pr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(pr);
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.setClearColor(0xBFE0EC);
    el.appendChild(renderer.domElement);
    const scene = new T.Scene();
    scene.fog = new T.Fog(0xBFE0EC, 60, 110);
    const { G, lights } = buildScene();
    const ms = toMeshes(T, G);
    const g = new T.Group(); g.scale.setScalar(1);
    for (const k of ["solid", "glow", "win"]) if (ms[k]) g.add(ms[k]);
    scene.add(g);
    // 晴天下午的光：天空藍、地面暖，太陽從左後方斜照，影子柔
    const hemi = new T.HemisphereLight(0xDDEEFF, 0xC8A880, 0.75); scene.add(hemi);
    const sun = new T.DirectionalLight(0xFFF0D8, 0.95); sun.position.set(-18, 26, 14); sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096); const sc = sun.shadow.camera; sc.left = -20; sc.right = 20; sc.top = 16; sc.bottom = -16; sc.near = 1; sc.far = 80;
    sun.shadow.bias = -0.0008; sun.shadow.radius = 4; scene.add(sun);
    for (const L of lights.slice(0, 8)) { const p = new T.PointLight(L.color, 0.35 * L.power, 4, 1.6); p.position.set(L.x, L.y, L.z); scene.add(p); }
    ms.winMat.color.set(0xF8E8C0);
    // 居民（同一套方塊小人，1 公尺 = 1 單位）
    const ppl = [["史威特", -3.5, 2.2, 0.4], ["沏萊爾", -2.8, 2.6, -2.4], ["佐代", 4.2, -2.9, 2.6], ["海爾", 2.9, -5.0, 0], ["櫻子", 6.9, 6.4, 3.4], ["黑子", 7.5, 6.0, -2.2], ["星星", -9.5, 4.0, 1.2]];
    const chs = [];
    for (const [id, x, z, yaw] of ppl) {
      if (!N.blocky || !N.blocky.has(id)) continue;
      const c = N.blocky.make(T, id); c.root.position.set(x, 0, z); c.root.rotation.y = yaw; scene.add(c.root); chs.push(c);
      c.root.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
    }
    // 室內場景（另外一個 scene，點「進去看看」才切過去）
    const room = new T.Scene(), rl = [];
    const rhemi = new T.HemisphereLight(0xFFF4EC, 0xC8A090, 0.7); room.add(rhemi);
    const rsun = new T.DirectionalLight(0xFFF0D8, 0.55); rsun.position.set(-4, 8, 3); rsun.castShadow = true; rsun.shadow.mapSize.set(2048, 2048);
    const rsc = rsun.shadow.camera; rsc.left = -7; rsc.right = 7; rsc.top = 7; rsc.bottom = -7; rsc.near = 1; rsc.far = 30; rsun.shadow.bias = -0.001; rsun.shadow.radius = 4; room.add(rsun);
    const R = buildInterior(room, rl);
    // 看不見但會擋光的天花板、前牆、右牆：陽光只能從窗戶照進來
    { const m = new T.MeshBasicMaterial({ colorWrite: false, depthWrite: false }), H = 2.7;
      for (const [w, h, d, x, y, z] of [[R.W + 1, 0.1, R.D + 1, 0, H, 0], [R.W + 1, H + 0.2, 0.1, 0, H / 2, R.D / 2 + 0.05], [0.1, H + 0.2, R.D + 1, R.W / 2 + 0.05, H / 2, 0]]) {
        const o = new T.Mesh(new T.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; o.renderOrder = -1; room.add(o);
      } }
    R.vr.meshes.solid && (R.vr.meshes.solid.castShadow = true);
    for (const [id, x, z, yaw, pose] of [["沏萊爾", 2.3, -2.2, 0.3], ["史威特", -1.6, 1.0, 2.6], ["佐代", 0.4, 1.4, -2.2], ["海爾", -2.6, -2.1, 0.2]]) {
      if (!N.blocky || !N.blocky.has(id)) continue;
      const c = N.blocky.make(T, id); c.root.position.set(x, 0, z); c.root.rotation.y = yaw; room.add(c.root); chs.push(c);
      c.root.traverse(o => { if (o.isMesh) o.castShadow = true; });
    }
    /* ── 室內燈光範本：早上、中午、傍晚、晚上 ──
     * 白天：陽光從窗戶斜照進來（真的影子，地上一塊亮光）＋淡淡的光柱，燈幾乎不開
     * 傍晚：橘紅的低角度夕陽，光拉得很長；燈開始亮
     * 晚上：窗外深藍，全靠檯燈、壁燈、蠟燭這些小光源，燈旁邊有一圈光暈 */
    const haloTex = (() => { const c = document.createElement("canvas"); c.width = c.height = 64; const x = c.getContext("2d"); const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.25, "rgba(255,255,255,.45)"); g.addColorStop(1, "rgba(255,255,255,0)"); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new T.CanvasTexture(c); })();
    const halos = R.vr.lights.slice(0, 14).map(L => { const sp = new T.Sprite(new T.SpriteMaterial({ map: haloTex, color: L.color, transparent: true, blending: T.AdditiveBlending, depthWrite: false })); sp.position.set(L.x, L.y, L.z); sp.scale.setScalar(0.9 * L.power + 0.3); room.add(sp); return sp; });
    // 光柱：從左牆的窗戶往陽光方向拉出去的半透明體積
    const winPos = [];
    if (R.vr.meshes.win) { const m = new T.Matrix4(), v = new T.Vector3(); for (let i = 0; i < R.vr.meshes.win.count; i++) { R.vr.meshes.win.getMatrixAt(i, m); v.setFromMatrixPosition(m); winPos.push(v.clone()); } }
    const leftWin = winPos.filter(v => v.x < -R.W / 2 + 0.05);
    let shaft = null;
    if (leftWin.length) {
      const bb = new T.Box3().setFromPoints(leftWin), geo = new T.BufferGeometry();
      shaft = new T.Mesh(geo, new T.MeshBasicMaterial({ color: 0xFFF0C8, transparent: true, opacity: 0.18, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, vertexColors: true }));
      shaft.userData.bb = bb; room.add(shaft);
    }
    function setShaft(dir, op, col) {
      if (!shaft) return;
      shaft.visible = op > 0.01; if (!shaft.visible) return;
      const bb = shaft.userData.bb, x = bb.min.x + 0.06;
      const top = [[x, bb.max.y, bb.min.z], [x, bb.max.y, bb.max.z], [x, bb.min.y, bb.max.z], [x, bb.min.y, bb.min.z]];
      const t = y => y / -dir.y;   // 走到地板要多遠
      const bot = top.map(([a, y, c]) => [a + dir.x * t(y), 0.01, c + dir.z * t(y)]);
      const pos = [], colA = [];
      const quad = (a, b, c, d, ca, cb) => { for (const [p, k] of [[a, ca], [b, ca], [c, cb], [a, ca], [c, cb], [d, cb]]) { pos.push(...p); colA.push(k, k, k); } };
      for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; quad(top[i], top[j], bot[j], bot[i], 1, 0.15); }
      shaft.geometry.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
      shaft.geometry.setAttribute("color", new T.Float32BufferAttribute(colA, 3));
      shaft.geometry.computeBoundingSphere();
      shaft.material.opacity = op; shaft.material.color.set(col);
    }
    const LIGHT = {
      morning: { sky: 0xDCE8FF, ground: 0xC8B098, hemi: 0.68, sun: 0xFFF4E0, sunI: 1.25, dir: [0.85, -0.45, 0.3], lamp: 0.3, win: 0xF4F8FF, bg: 0x3A3A48, shaft: 0.16, shaftC: 0xFFF8E8 },
      noon: { sky: 0xFFF4E8, ground: 0xD0B090, hemi: 0.82, sun: 0xFFF0D8, sunI: 1.1, dir: [0.55, -0.8, 0.25], lamp: 0.25, win: 0xFFF8E8, bg: 0x3A3640, shaft: 0.1, shaftC: 0xFFF0D0 },
      dusk: { sky: 0xE8A890, ground: 0x7A5048, hemi: 0.5, sun: 0xFF9A5A, sunI: 1.4, dir: [0.95, -0.3, 0.1], lamp: 0.7, win: 0xFFB070, bg: 0x2E2430, shaft: 0.22, shaftC: 0xFFA060 },
      night: { sky: 0x4A4268, ground: 0x3A2618, hemi: 0.2, sun: 0x8090C8, sunI: 0.0, dir: [0.6, -0.7, 0], lamp: 1.0, win: 0x2A3A6A, bg: 0x16141C, shaft: 0, shaftC: 0x8090C8 }
    };
    const lampBase = rl.map(p => p.intensity);
    function setLight(k) {
      const L = LIGHT[k];
      rhemi.color.set(L.sky); rhemi.groundColor.set(L.ground); rhemi.intensity = L.hemi;
      rsun.color.set(L.sun); rsun.intensity = L.sunI; rsun.visible = L.sunI > 0;
      const d = new T.Vector3(...L.dir).normalize(); rsun.position.set(-d.x * 12, -d.y * 12, -d.z * 12); rsun.target.position.set(0, 0, 0); room.add(rsun.target);
      // 放燈原則：一間房的光量照面積算（淺色房間打折），主燈分七成、小燈分三成；時段決定開多少
      const ceilN = rl.filter(p => p.userData.ceil).length || 1, accN = Math.max(1, rl.length - ceilN);
      const budget = R.W * R.D * 0.05 * (1 - 0.35 * R.light);
      const mainK = L.lamp, accK = Math.min(1, 0.35 + L.lamp * 0.75);
      rl.forEach(p => {
        p.color.set(p.userData.ceil ? 0xFF9A48 : 0xFF8A3A); p.decay = 1.0;
        if (p.userData.ceil) { p.intensity = budget * 0.7 / ceilN * mainK; p.distance = 7; }
        else { p.intensity = Math.min(0.45, budget * 0.3 / accN) * accK; p.distance = 3.2; }
      });
      halos.forEach(h => { h.material.color.set(0xFFA050); h.material.opacity = 0.08 + L.lamp * 0.55; h.visible = true; });
      R.vr.meshes.winMat.color.set(L.win);
      if (R.vr.meshes.glow) R.vr.meshes.glow.material.color.setRGB(0.6 + L.lamp * 0.4, 0.5 + L.lamp * 0.3, 0.35 + L.lamp * 0.15);
      ts.mat.uniforms.expo.value = inRoom ? 1.0 : 1.0;
      setShaft(d, L.shaft, L.shaftC);
      if (inRoom) renderer.setClearColor(L.bg);
      curLight = k;
      document.querySelectorAll("[data-lt]").forEach(b => b.style.background = b.dataset.lt === k ? "#F4D58A" : "#fff");
    }
    let curLight = "noon";
    let inRoom = false;
    // 鏡頭：斜上方俯視，可以拖曳旋轉、滾輪縮放
    const cam = new T.PerspectiveCamera(24, 1, 1, 400);
    let az = 0.62, el2 = 0.62, dist = 52, tgt = new T.Vector3(0, 1, -1);
    const place = () => { cam.position.set(tgt.x + Math.sin(az) * Math.cos(el2) * dist, tgt.y + Math.sin(el2) * dist, tgt.z + Math.cos(az) * Math.cos(el2) * dist); cam.lookAt(tgt); };
    const ts = tiltShift(renderer);
    const fit = () => { const w = el.clientWidth, h = el.clientHeight; renderer.setSize(w, h); ts.setSize(w, h, pr); cam.aspect = w / h; cam.updateProjectionMatrix(); };
    window.addEventListener("resize", fit); fit();
    let drag = null;
    el.addEventListener("pointerdown", e => { drag = { x: e.clientX, y: e.clientY, az, el2 }; });
    window.addEventListener("pointermove", e => { if (!drag) return; az = drag.az - (e.clientX - drag.x) * 0.005; el2 = Math.max(0.25, Math.min(1.2, drag.el2 + (e.clientY - drag.y) * 0.004)); });
    window.addEventListener("pointerup", () => { drag = null; });
    el.addEventListener("wheel", e => { e.preventDefault(); dist = Math.max(14, Math.min(90, dist * (1 + e.deltaY * 0.001))); }, { passive: false });
    const bar = document.createElement("div"); bar.style.cssText = "position:fixed;right:12px;top:60px;display:none;gap:6px;flex-direction:column";
    bar.innerHTML = [["morning", "🌅 早上"], ["noon", "☀️ 中午"], ["dusk", "🌇 傍晚"], ["night", "🌙 晚上"]].map(([k, t]) => `<button data-lt="${k}" style="padding:8px 14px;border:0;border-radius:10px;background:#fff;font:inherit;font-weight:700;font-size:13px;cursor:pointer">${t}</button>`).join("");
    bar.innerHTML += `<div style="height:8px"></div>` + [["dome", "碗型吊燈"], ["chandelier", "燭台吊燈"], ["flush", "吸頂燈"], ["lantern", "紙燈籠"], ["bulbs", "燈泡串"], ["industrial", "工業風"]].map(([k, t]) => `<button data-ls="${k}" style="padding:7px 12px;border:0;border-radius:10px;background:${(Q.get("lamp") || "chandelier") === k ? "#F4D58A" : "#fff"};font:inherit;font-weight:700;font-size:12px;cursor:pointer">💡 ${t}</button>`).join("");
    bar.onclick = e => { const b = e.target.closest("[data-lt]"); if (b) setLight(b.dataset.lt); const c = e.target.closest("[data-ls]"); if (c) location.search = "?room=1&t=" + curLight + "&lamp=" + c.dataset.ls; };
    document.body.appendChild(bar);
    const go = r => {
      inRoom = r; renderer.setClearColor(r ? LIGHT[curLight].bg : 0xBFE0EC); bar.style.display = r ? "flex" : "none";
      if (r) { az = 0.78; el2 = 0.68; dist = 19; tgt.set(0, 0.6, 0); ts.mat.uniforms.amount.value = 0.45; }
      else { az = 0.62; el2 = 0.62; dist = 52; tgt.set(0, 1, -1); ts.mat.uniforms.amount.value = 1; }
      const b = document.getElementById("enterBtn"); if (b) b.textContent = r ? "🚪 回到街上" : "🍰 走進甜點店";
    };
    const btn = document.createElement("button"); btn.id = "enterBtn"; btn.textContent = "🍰 走進甜點店";
    btn.style.cssText = "position:fixed;right:12px;top:10px;padding:10px 16px;border:0;border-radius:12px;background:#fff;font:inherit;font-weight:700;font-size:14px;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.15)";
    btn.onclick = () => go(!inRoom); document.body.appendChild(btn);
    setLight(Q.get("t") || "noon");
    if (Q.get("room")) go(true);
    window.PROTO = { go, setLight, setView: (a, e, d, x, z) => { az = a; el2 = e; dist = d; if (x != null) tgt.set(x, 1, z); }, tilt: v => { ts.mat.uniforms.amount.value = v; }, count: ms.count };
    let last = 0;
    const loop = now => {
      requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now;
      for (const c of chs) c.update(dt, now / 1000, { walking: false });
      place(); ts.render(inRoom ? room : scene, cam);
    };
    requestAnimationFrame(loop);
  }
  N.proto = { start };
})();
