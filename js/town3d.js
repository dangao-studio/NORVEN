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

  /* ═════════ 畫質 ═════════
   * 高畫質（電腦）：10 公分一格的城市建築（voxcity.js）；一般（手機）：原本簡化的方塊小鎮（voxtown.js）。
   * 設定存在 localStorage「novum-quality」：auto／high／low。auto＝滑鼠操作而且螢幕夠寬才開高畫質。 */
  function quality() {
    let q = "auto"; try { q = localStorage.getItem("novum-quality") || "auto"; } catch (e) { }
    if (q === "high" || q === "low" || q === "mobile") return q;
    return window.matchMedia && matchMedia("(pointer:fine)").matches && Math.max(screen.width, screen.height) >= 1000 ? "high" : "low";   // 手機（要在小鎮頁切到 3D 才會開）：簡化小鎮，房間用一般畫質
  }
  // HQ：用城市建築（電腦高畫質、手機城市都是）；MQ：手機城市（同樣的建築和夜景，但範圍小、光源少、後製簡單）
  const MQ = () => !!N.voxCity && quality() === "mobile";
  const HQ = () => !!N.voxCity && (quality() === "high" || MQ());


  /* ═════════ 高畫質後製：防過曝（亮部柔和收住）＋移軸景深（上下微微模糊，像微縮模型） ═════════ */
  function makePost(rend, amount) {
    const HF = { minFilter: T.LinearFilter, magFilter: T.LinearFilter, type: T.HalfFloatType };
    // 場景先畫進這張圖再做後製；一般的 render target 沒有反鋸齒，邊緣和細線會一閃一閃，所以 WebGL2 用多重取樣（MSAA）的版本
    const ms = rend.capabilities && rend.capabilities.isWebGL2 && T.WebGLMultisampleRenderTarget;
    const rt = ms ? new T.WebGLMultisampleRenderTarget(4, 4, HF) : new T.WebGLRenderTarget(4, 4, HF);
    if (ms) rt.samples = 4;
    const rtA = new T.WebGLRenderTarget(4, 4, HF), rtB = new T.WebGLRenderTarget(4, 4, HF);
    const VS = "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }";
    const mat = new T.ShaderMaterial({
      uniforms: { tDiffuse: { value: rt.texture }, tBloom: { value: rtA.texture }, bloom: { value: 0 }, grade: { value: 0 }, res: { value: new T.Vector2(1, 1) }, amount: { value: amount },
        dSat: { value: 0 }, dCon: { value: 0 }, dHi: { value: new T.Vector3() }, dSh: { value: new T.Vector3() } },
      vertexShader: VS,
      fragmentShader: `uniform sampler2D tDiffuse; uniform sampler2D tBloom; uniform float bloom; uniform float grade; uniform vec2 res; uniform float amount; varying vec2 vUv;
        uniform float dSat; uniform float dCon; uniform vec3 dHi; uniform vec3 dSh;
        vec3 soft(vec3 c){ vec3 k = 0.8 + 0.2 * (1.0 - exp(-(c - 0.8) / 0.2)); return mix(c, k, step(0.8, c)); }
        void main(){
          float d = abs(vUv.y - 0.5); float b = smoothstep(0.2, 0.6, d) * 2.6 * amount;
          vec4 c;
          if (amount < 0.001) c = texture2D(tDiffuse, vUv);   // 手機：不做景深模糊
          else {
          vec4 sum = vec4(0.0); float tot = 0.0;
          for (int i = -3; i <= 3; i++) for (int j = -3; j <= 3; j++) {
            float w = 1.0 - length(vec2(float(i), float(j))) / 4.6;
            if (w > 0.0) { sum += texture2D(tDiffuse, vUv + vec2(float(i), float(j)) * b / res) * w; tot += w; }
          }
          c = sum / tot;
          }
          if (bloom > 0.001) c.rgb += texture2D(tBloom, vUv).rgb * bloom;   // 光暈：亮的東西往外暈開
          {
            // 白天的調色：飽和度、對比，亮部／暗部各染一點顏色（早上蜜桃奶油、下午橘＋紫）
            float l0 = dot(c.rgb, vec3(0.299, 0.587, 0.114));
            vec3 g0 = mix(vec3(l0), c.rgb, 1.0 + dSat);
            g0 = (g0 - 0.5) * (1.0 + dCon) + 0.5;
            g0 += dSh * (1.0 - smoothstep(0.0, 0.5, l0)) + dHi * smoothstep(0.35, 1.0, l0);
            c.rgb = max(g0, 0.0);
          }
          if (grade > 0.001) {
            // 夜晚的調色：飽和度、對比拉高；暗部偏藍紫、亮部偏暖；四周暗角
            float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
            vec3 g = mix(vec3(l), c.rgb, 1.0 + 0.2 * grade);
            g = (g - 0.5) * (1.0 + 0.18 * grade) + 0.5;
            float sh = 1.0 - smoothstep(0.0, 0.45, l), hi = smoothstep(0.45, 1.0, l);
            g += grade * (vec3(0.03, -0.005, 0.07) * sh + vec3(0.05, 0.015, -0.03) * hi);
            float vg = smoothstep(0.95, 0.35, length((vUv - 0.5) * vec2(1.1, 1.0)));
            g *= mix(1.0, 0.72 + 0.28 * vg, grade);
            c.rgb = max(g, 0.0);
          }
          c.rgb = soft(c.rgb); gl_FragColor = c;
        }`, depthTest: false, depthWrite: false });
    // 光暈：抓出亮的部分（一半解析度），再橫、直各模糊兩輪（第二輪範圍更大）
    const bright = new T.ShaderMaterial({ uniforms: { t: { value: null }, thr: { value: 0.88 } }, vertexShader: VS,
      fragmentShader: "uniform sampler2D t; uniform float thr; varying vec2 vUv; void main(){ vec3 c = texture2D(t, vUv).rgb; float l = max(c.r, max(c.g, c.b)); gl_FragColor = vec4(c * smoothstep(thr, thr + 0.25, l), 1.0); }", depthTest: false, depthWrite: false });
    const blur = new T.ShaderMaterial({ uniforms: { t: { value: null }, dir: { value: new T.Vector2() } }, vertexShader: VS,
      fragmentShader: `uniform sampler2D t; uniform vec2 dir; varying vec2 vUv;
        void main(){ vec3 s = texture2D(t, vUv).rgb * 0.2270;
          s += (texture2D(t, vUv + dir * 1.385).rgb + texture2D(t, vUv - dir * 1.385).rgb) * 0.3162;
          s += (texture2D(t, vUv + dir * 3.231).rgb + texture2D(t, vUv - dir * 3.231).rgb) * 0.0703;
          gl_FragColor = vec4(s, 1.0); }`, depthTest: false, depthWrite: false });
    const sc = new T.Scene(), cm = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1), quad = new T.Mesh(new T.PlaneGeometry(2, 2), mat);
    sc.add(quad);
    const pass = (m, target) => { quad.material = m; rend.setRenderTarget(target); rend.render(sc, cm); };
    let w0 = 0, h0 = 0;
    return {
      mat,
      render(scene, camera, out) {
        const sz = rend.getDrawingBufferSize(new T.Vector2());
        if (sz.x !== w0 || sz.y !== h0) { w0 = sz.x; h0 = sz.y; rt.setSize(w0, h0); rtA.setSize(w0 >> 1, h0 >> 1); rtB.setSize(w0 >> 1, h0 >> 1); mat.uniforms.res.value.set(w0, h0); }
        rend.setRenderTarget(rt); rend.clear(); rend.render(scene, camera);
        if (mat.uniforms.bloom.value > 0.001) {
          const px = 1 / (w0 >> 1), py = 1 / (h0 >> 1);
          bright.uniforms.t.value = rt.texture; pass(bright, rtA);
          for (const k of [1, 2.6]) {
            blur.uniforms.t.value = rtA.texture; blur.uniforms.dir.value.set(px * k, 0); pass(blur, rtB);
            blur.uniforms.t.value = rtB.texture; blur.uniforms.dir.value.set(0, py * k); pass(blur, rtA);
          }
        }
        pass(mat, out || null);
      }
    };
  }

  /* ═════════ 版圖 ═════════ */
  /* 棋盤式城市：以鐘塔廣場為中心往外擴散，越外面越淡、最後藏進霧裡。
   * 每格是一個街區（14×21 單位），廣場旁的大道比較寬（7），其他巷道窄（4.5）。
   * 有地點的九個街區分散在城裡，其他格子都是裝飾用的房子：近的細緻、遠的簡化。 */
  const GRID = (() => {
    const BW = 14, BD = 21, NC = 6, NR = 5, RC = 84;
    // 路寬：廣場旁的大道 9.5、其他街 6.5；兩邊人行道各 1.75（街區邊往外 0.3 開始）
    const AW = 9.5, NW = 6.5, SIDEW = 2.05, ROADE = AW / 2 + 0.1;
    const gx = i => (i === 0 || i === 1) ? AW : NW, gz = j => (j === 0 || j === 1) ? AW : NW;
    const colX = {}, rowZ = {};
    colX[0] = 0; for (let i = 1; i <= NC; i++) colX[i] = colX[i - 1] + BW + gx(i); for (let i = -1; i >= -NC; i--) colX[i] = colX[i + 1] - gx(i + 1) - BW;
    rowZ[0] = 0; for (let j = 1; j <= NR; j++) rowZ[j] = rowZ[j - 1] + BD + gz(j); for (let j = -1; j >= -NR; j--) rowZ[j] = rowZ[j + 1] - gz(j + 1) - BD;
    const xr = [], zr = [];
    for (let i = -NC; i <= NC + 1; i++) xr.push(i === NC + 1 ? colX[NC] + BW + NW / 2 : colX[i] - gx(i) / 2);
    for (let j = -NR; j <= NR + 1; j++) zr.push(j === NR + 1 ? rowZ[NR] + BD + NW / 2 : rowZ[j] - gz(j) / 2);
    const LOC = { academy1: [-2, -2], academy0: [1, -2], outer2: [3, -2], oldtown0: [-3, 0], central0: [-1, 1], outer0: [2, 0], oldtown1: [-2, 2], central1: [1, 2], outer1: [3, 2] };
    const BLOCK = {}, cells = [];
    for (const k in LOC) BLOCK[k] = [colX[LOC[k][0]], rowZ[LOC[k][1]]];
    const taken = new Set(Object.values(LOC).map(([i, j]) => i + "," + j));
    // 城的輪廓：不規則的一團（幾個不同頻率的波疊起來），西邊是海
    const RB = th => 92 + 8 * Math.sin(3 * th + 0.7) + 6 * Math.sin(5 * th + 2.1) + 3 * Math.sin(9 * th + 0.4);
    const rb = (x, z) => Math.hypot(x - BW / 2, (z - BD / 2) * 0.92) / RB(Math.atan2(z - BD / 2, x - BW / 2));
    const keyOf = (i, j) => i <= -2 ? (j > 0 ? "oldtown1" : "oldtown0") : i >= 2 ? (j > 0 ? "outer1" : j < 0 ? "outer2" : "outer0") : j <= -2 ? (i < 0 ? "academy1" : "academy0") : j >= 2 ? "central1" : "central0";
    const hs = (a, b) => { const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return v - Math.floor(v); };
    for (let i = -NC; i <= NC; i++) for (let j = -NR; j <= NR; j++) {
      const r = Math.hypot(colX[i], rowZ[j]) / RC, q = rb(colX[i] + BW / 2, rowZ[j] + BD / 2), loc = taken.has(i + "," + j);
      if (!loc && q > 1.12) continue;
      // 輪廓邊上的格子一半補房子、一半留成公園廣場菜園（混合補）
      const kind = i === 0 && j === 0 ? "plaza" : loc ? "loc" : q <= 0.95 || (q <= 1.03 && hs(i, j) < 0.5) ? (Math.max(Math.abs(i), Math.abs(j)) <= 1 || r < 0.55 ? "near" : "far") : "open";
      cells.push({ i, j, x: colX[i], z: rowZ[j], kind, r, key: keyOf(i, j) });
    }
    // 西邊每一排最外面的空格改成港邊倉庫區
    const edge = {}; for (const c of cells) if (edge[c.j] == null || c.i < edge[c.j]) edge[c.j] = c.i;
    for (const c of cells) if (c.kind === "open" && edge[c.j] === c.i) c.kind = "harbor";
    const rows = Object.keys(edge).map(Number).sort((a, b) => a - b);
    // 地下湖：舊城河岸那個街區往南、島最外面那一格（城的邊緣），整格給岩丘和洞口
    let lakeCell = null;
    { const [li] = LOC.oldtown1, col = cells.filter(c => c.i === li && (c.kind === "open" || c.kind === "far" || c.kind === "near"));
      const jm = Math.max(...col.map(c => c.j), -1e9); lakeCell = col.find(c => c.j === jm && c.j > LOC.oldtown1[1]) || null;
      if (lakeCell) lakeCell.kind = "lake"; }
    // 港池：舊城那排最西邊的格子挖成方形港池
    let basin = null;
    { const j = rows.includes(-1) ? -1 : rows[Math.floor(rows.length / 2)], c = cells.find(c => c.j === j && c.i === edge[j]);
      if (c && c.kind !== "loc") { basin = { x0: c.x - 9, x1: c.x + 11, z0: c.z + 1.5, z1: c.z + BD - 1.5, cell: c }; cells.splice(cells.indexOf(c), 1); } }
    /* 島：每個街區（含港池那格）往外 8（馬路 3.6＋濱海步道 4.4）以內是陸地，轉角是圓的，偶爾往外鼓一點；
     * 用 0.5 的格子算出陸地遮罩、離岸距離，再沿著邊界描出岸線（一圈封閉的折線，陸地在右手邊） */
    const MR = 0.5, all = basin ? cells.concat([basin.cell]) : cells;
    const MX0 = Math.min(...all.map(c => c.x)) - 24, MZ0 = Math.min(...all.map(c => c.z)) - 24;
    const MW = Math.ceil((Math.max(...all.map(c => c.x)) + BW + 24 - MX0) / MR), MH = Math.ceil((Math.max(...all.map(c => c.z)) + BD + 24 - MZ0) / MR);
    const mask = new Uint8Array(MW * MH);
    const bump = (x, z) => 2.2 * Math.max(0, Math.sin(x / 11 + z / 17 + 0.6)) ** 2 + 1.2 * Math.max(0, Math.sin(x / 5.3 - z / 7.1)) ** 3;
    for (const c of all) {
      const ex = ROADE + 4.4 + 3.5;
      for (let gz = Math.max(0, Math.floor((c.z - ex - MZ0) / MR)); gz < Math.min(MH, Math.ceil((c.z + BD + ex - MZ0) / MR)); gz++)
        for (let gx = Math.max(0, Math.floor((c.x - ex - MX0) / MR)); gx < Math.min(MW, Math.ceil((c.x + BW + ex - MX0) / MR)); gx++) {
          const x = MX0 + (gx + 0.5) * MR, z = MZ0 + (gz + 0.5) * MR;
          const dx = Math.max(c.x - x, 0, x - c.x - BW), dz = Math.max(c.z - z, 0, z - c.z - BD);
          if (Math.hypot(dx, dz) <= ROADE + 4.4 + bump(x, z)) mask[gz * MW + gx] = 1;
        }
    }
    if (basin) for (let gz = 0; gz < MH; gz++) for (let gx = 0; gx < MW; gx++) { const x = MX0 + (gx + 0.5) * MR, z = MZ0 + (gz + 0.5) * MR; if (x < basin.x1 && x > basin.cell.x - 20 && z > basin.z0 && z < basin.z1) mask[gz * MW + gx] = 0; }
    // 被陸地圍住的小水窪填掉（只留跟外海連通的海）
    { const seen = new Uint8Array(MW * MH), q = []; for (let gx = 0; gx < MW; gx++) { q.push(gx, (MH - 1) * MW + gx); } for (let gz = 0; gz < MH; gz++) q.push(gz * MW, gz * MW + MW - 1);
      while (q.length) { const k = q.pop(); if (seen[k] || mask[k]) continue; seen[k] = 1; const gx = k % MW, gz = (k - gx) / MW; if (gx > 0) q.push(k - 1); if (gx < MW - 1) q.push(k + 1); if (gz > 0) q.push(k - MW); if (gz < MH - 1) q.push(k + MW); }
      for (let k = 0; k < MW * MH; k++) if (!mask[k] && !seen[k]) mask[k] = 1; }
    // 離岸距離（陸地上，單位）：兩趟掃描的倒角距離
    const dist = new Float32Array(MW * MH);
    for (let k = 0; k < MW * MH; k++) dist[k] = mask[k] ? 1e6 : 0;
    const D1 = MR, D2 = MR * Math.SQRT2;
    for (let gz = 0; gz < MH; gz++) for (let gx = 0; gx < MW; gx++) { const k = gz * MW + gx; let v = dist[k]; if (!v) continue;
      if (gx > 0) v = Math.min(v, dist[k - 1] + D1); if (gz > 0) { v = Math.min(v, dist[k - MW] + D1); if (gx > 0) v = Math.min(v, dist[k - MW - 1] + D2); if (gx < MW - 1) v = Math.min(v, dist[k - MW + 1] + D2); } dist[k] = v; }
    for (let gz = MH - 1; gz >= 0; gz--) for (let gx = MW - 1; gx >= 0; gx--) { const k = gz * MW + gx; let v = dist[k]; if (!v) continue;
      if (gx < MW - 1) v = Math.min(v, dist[k + 1] + D1); if (gz < MH - 1) { v = Math.min(v, dist[k + MW] + D1); if (gx < MW - 1) v = Math.min(v, dist[k + MW + 1] + D2); if (gx > 0) v = Math.min(v, dist[k + MW - 1] + D2); } dist[k] = v; }
    const mIdx = (x, z) => { const gx = Math.floor((x - MX0) / MR), gz = Math.floor((z - MZ0) / MR); return gx < 0 || gz < 0 || gx >= MW || gz >= MH ? -1 : gz * MW + gx; };
    const seaAt = (x, z) => { const k = mIdx(x, z); return k < 0 || !mask[k]; };
    const coastDist = (x, z) => { const k = mIdx(x, z); return k < 0 ? 0 : dist[k]; };
    // 描邊：沿著陸地格子的外框走（陸地在右手邊），再用 Chaikin 磨圓
    let coast = [];
    { const L = (gx, gz) => gx >= 0 && gz >= 0 && gx < MW && gz < MH && mask[gz * MW + gx] === 1;
      const nxt = new Map(), key = (x, z) => x * 100000 + z;
      for (let gz = 0; gz < MH; gz++) for (let gx = 0; gx < MW; gx++) { if (!L(gx, gz)) continue;
        // 頂點座標用格線（gx..gx+1），每條有海的邊加一段：陸地在右手邊（x 往右、z 往下的平面）
        if (!L(gx, gz - 1)) nxt.set(key(gx + 1, gz), key(gx, gz));
        if (!L(gx + 1, gz)) nxt.set(key(gx + 1, gz + 1), key(gx + 1, gz));
        if (!L(gx, gz + 1)) nxt.set(key(gx, gz + 1), key(gx + 1, gz + 1));
        if (!L(gx - 1, gz)) nxt.set(key(gx, gz), key(gx, gz + 1)); }
      let best = [];
      const used = new Set();
      for (const st of nxt.keys()) { if (used.has(st)) continue; const loop = []; let k = st; while (!used.has(k) && nxt.has(k)) { used.add(k); loop.push(k); k = nxt.get(k); } if (loop.length > best.length) best = loop; }
      let P = best.map(k => [MX0 + Math.floor(k / 100000) * MR, MZ0 + (k % 100000) * MR]);
      // 拿掉同一直線上的中間點、再磨圓三次
      for (let it = 0; it < 3; it++) { const Q = []; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; Q.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]); } P = Q; }
      const R2 = [P[0]]; for (let i = 1; i < P.length; i++) { const a = R2[R2.length - 1]; if (Math.hypot(P[i][0] - a[0], P[i][1] - a[1]) > 0.7) R2.push(P[i]); }
      coast = R2; }
    const minX = colX[-NC], maxX = colX[NC] + BW, minZ = rowZ[-NR], maxZ = rowZ[NR] + BD;
    // 某個 x 範圍（街區）左右兩邊的巷道中線
    const sideOf = (bx, right) => right ? xr.find(x => x > bx + BW - 0.1) : xr.slice().reverse().find(x => x < bx + 0.1);
    // 有沒有在馬路上（某個街區往外 3.6 以內）
    const onRoad = (x, z) => (cells.some(c => x > c.x - ROADE && x < c.x + BW + ROADE && z > c.z - ROADE && z < c.z + BD + ROADE) || (basin && x >= basin.x1 && x < basin.cell.x + BW + ROADE && z > basin.cell.z - ROADE && z < basin.cell.z + BD + ROADE)) && !seaAt(x, z);
    // 在人行道上（街區往外 SIDEW 以內）；馬路＝onRoad 但不在人行道
    const onWalkway = (x, z) => cells.some(c => x > c.x - SIDEW && x < c.x + BW + SIDEW && z > c.z - SIDEW && z < c.z + BD + SIDEW);
    return { AW, NW, SIDEW, ROADE, onWalkway: null, BW, BD, RC, cx: BW / 2, cz: BD / 2, colX, rowZ, xr, zr, BLOCK, cells, minX, maxX, minZ, maxZ, sideOf, plaza: { x: colX[0], z: rowZ[0] }, lakeCell, rb, coast, seaAt, coastDist, basin, onRoad, edge, walkway: onWalkway };
  })();
  const BLOCK = GRID.BLOCK;
  const BOUNDS = { x0: GRID.minX + 10, x1: GRID.maxX - 10, z0: GRID.minZ + 10, z1: GRID.maxZ - 10 };
  const PAL = {
    central: { ground: 0xD8CBB2, wall: [0xF8E6CE, 0xF4D2B8, 0xFBF1E0, 0xEFC8A8, 0xDDE8E2], roof: [0xD8705A, 0xE89060, 0xC85A4A, 0x6A8AA8] },
    academy: { ground: 0xB6CC9C, wall: [0xE0A888, 0xEED2B8, 0xF2E6D4, 0xD49A80], roof: [0x5A7298, 0x4A6288, 0x6A84A8] },
    oldtown: { ground: 0xC6BAA6, wall: [0xD4C8B4, 0xC8B8A0, 0xE0D4BC, 0xB8AC98], roof: [0x7A5E4C, 0x8A6A52, 0x6A5444] },
    outer: { ground: 0xC2C6BE, wall: [0xA8C0C0, 0xC8D0C8, 0xC0A890, 0xB8C4B0], roof: [0x4A8088, 0xC07048, 0x5A6E74] },
    pero: { ground: 0xDCC8D4, wall: [0xF8C8D8, 0xBCE2F0, 0xFAE8A8, 0xD8C8F4], roof: [0x8A6ED0, 0xE87098, 0x48B870] },
    other: { ground: 0xBCD2B0, wall: [0xD4E4CC, 0xF0E0C4, 0xCCE0E8, 0xEAD4C8], roof: [0x3E7266, 0x5A80B4, 0x9A7A5A] }
  };
  const palOf = l => l.region === "outer" ? (l.page === 1 ? PAL.pero : l.page === 2 ? PAL.other : PAL.outer) : PAL[l.region];
  const isPlaza = l => /鐘塔廣場/.test(l.id);
  const blockOf = l => isPlaza(l) ? [GRID.plaza.x, GRID.plaza.z] : BLOCK[l.region + l.page];
  // 地下湖搬到城邊那一格：洞口朝南（朝海邊步道），lot 中心在洞口後面一點
  const lakeMoved = l => !!(l && GRID.lakeCell && /地下湖/.test(l.id));
  const LAKE = { K: 1.5, door: 1.6, mouth: 1.4, back: 3.6 };   // 洞口模型放大 1.5 倍；門口、洞口、隧道底（單位，相對 lot 中心往 +z）
  function lotPos(l) {
    if (lakeMoved(l)) return { x: GRID.lakeCell.x + 7, z: GRID.lakeCell.z + 16 };
    if (isPlaza(l)) return { x: GRID.plaza.x + 7, z: GRID.plaza.z + 7 };   // 鐘塔廣場：正中間那一整格
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
  let built = false, buildP = null, townPost = null;
  let renderer = null, scene, camera, root, sun, hemi, moonFill;
  let host = null, hooks = {}, running = false, raf = 0, lastT = 0, ro = null;
  const cam = { target: null, dist: 40, az: 0.62, polar: 0.92, fly: null, follow: null };
  const WALK = 1.1;   // 居民走路的速度（單位／秒）：跟第一人稱走路一樣（1 單位＝1.6 公尺，約 1.8 公尺／秒）
  let TC = null;   // 在小鎮上操控的人（戶外地點）
  const FP = { on: false, yaw: 0, pitch: 0, el: null };   // 第一人稱（操控時按 V）
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
  // 夜市擺在哪條街：地點旁邊那條大道，沿著街區整段（避開兩頭的路口）
  function nightStreet(l) {
    // 一邊是地點街區的人行道（到街區邊 1.2），另一邊是裝飾街區，房子直接貼到街邊（0.3）
    const b = blockOf(l), sx = sideX(l), gap = Math.abs(b[0] - sx) * 2, left = sx < b[0];
    const xa = left ? b[0] - gap + 0.3 : b[0] + GRID.BW + GRID.SIDEW, xb = left ? b[0] - GRID.SIDEW : b[0] + GRID.BW + gap - 0.3;
    return { x: (xa + xb) / 2, z0: b[1] + 1.5, len: GRID.BD - 3, w: xb - xa };
  }
  function buildLot(l) {
    const p0 = lotPos(l), pal = palOf(l), type = typeOf(l), h0 = hashStr(l.id);
    const night = /夜市/.test(l.id) ? nightStreet(l) : null;
    // 夜市的位置（居民站的地方、名牌）在街上；原本的地點格子只是裝飾房子
    const p = night ? { x: night.x, z: p0.z } : p0;
    let plat = null;
    const pick = (arr, k) => arr[(h0 >>> (k || 0)) % arr.length];
    const g = new T.Group(); g.position.set(p0.x, 0, p0.z); g.userData.loc = l.id;
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
      if (type === "lake" && N.voxCity.lakeGate) {
        // 地下湖：河岸邊拱起的岩丘和石砌洞口，台階往下（湖在地底，地面上只看得到入口）
        const r = N.voxCity.lakeGate(T), K = lakeMoved(l) ? LAKE.K : 1;
        r.group.position.y = VOXY; r.group.scale.multiplyScalar(K); g.add(r.group);
        r.lamps.forEach(([x, z, c]) => lampSpots.push([p.x + x * K, p.z + z * K, c]));
        h = Math.max(2.5, r.top * K + 0.6);
        // 搬到城邊之後：整格是一座岩丘，洞口嵌在南面（朝海邊步道），比例跟旁邊的房子、路燈差不多
        if (lakeMoved(l) && N.voxCity.lakeHill) {
          const U = 1.6, c = GRID.lakeCell;
          const hill = N.voxCity.lakeHill(T, { w: 7 * U, d0: (p.z - c.z) * U, d1: (c.z + 21 - p.z) * U, gate: { w: 5.4 * K, back: 5.4 * K, tunnel: 1.4 * K, tback: 4.2 * K, h: 3.0 * K } });
          hill.group.position.y = VOXY; g.add(hill.group);
          h = Math.max(h, hill.top + 0.6);
        }
      } else if (night) {
        // 夜市：原本的空地改成一排小吃店（裝飾），攤子擺在旁邊大道的兩側
        if (HQ()) {
          const r = N.voxCity.lot(T, l, Object.assign({}, info, { type: "shop" }));
          r.group.position.y = VOXY; g.add(r.group);
          r.lamps.forEach(([x, z, c]) => lampSpots.push([p0.x + x, p0.z + z, c]));
        } else {
          const r = N.voxTown.lot(T, l, Object.assign({}, info, { type: "street" }));
          const vg = new T.Group(); vg.position.y = VOXY; r.meshes.forEach(m => vg.add(m)); g.add(vg);
          r.lamps.forEach(([x, z]) => lampSpots.push([p0.x + x, p0.z + z]));
        }
        // 夜市平台（13×7 公尺）沿著大道擺：平台的長邊順著街
        plat = placePlat(l.id, p.x, p.z, -Math.PI / 2); plat.group.userData.loc = l.id;
        h = 4.2;
      } else if (type === "tower") {
        h = 16;   // 鐘塔在 buildPlaza 用廣場平台蓋
      } else if (isPlat(l)) {
        // 戶外地點：直接用房間平台的模型（11.2 公尺見方，跟小鎮一格一樣大）
        plat = placePlat(l.id, p.x, p.z, 0); plat.group.userData.loc = l.id;
        h = 3.2;
      } else if (HQ() && !OPEN[type]) {
        const r = N.voxCity.lot(T, l, Object.assign({}, info, { lite: MQ() }));
        r.group.position.y = VOXY; g.add(r.group);
        r.lamps.forEach(([x, z, c]) => lampSpots.push([p.x + x, p.z + z, c]));
        h = Math.max(2.5, r.top + 0.3);
      } else if (HQ() && type === "tower") {
        h = 16;   // 鐘塔在 buildPlaza 蓋
      } else {
      const r = N.voxTown.lot(T, l, info);
      const vg = new T.Group(); vg.position.y = VOXY; r.meshes.forEach(m => vg.add(m)); g.add(vg);
      r.lamps.forEach(([x, z]) => lampSpots.push([p.x + x, p.z + z]));
      h = Math.max(2.5, r.top + 0.3);
      }
    }
    root.add(g);
    // 名牌
    const lab = textSprite(`${l.icon} ${l.name}`, { size: 30, bg: "rgba(255,253,248,.9)", fg: "#2b2a28", pad: 14, h: 0.62 });
    lab.position.set(p.x, h + 1.1, p.z); lab.userData.loc = l.id; lab.renderOrder = 5;
    root.add(lab); labelSprites.push(lab);
    const shell = [];
    if (!OPEN[type] && !plat) {
      // 可以透視的外殼：建築本體（不含地坪、門外的路燈和樹）
      g.children.forEach((m, i) => {
        if (i === 0 || !m.isMesh) return;
        if (Math.abs(m.position.x) > 3.1 || m.position.z > 1.35) return;
        m.material = m.material.clone();
        shell.push(m);
      });
    }
    lots[l.id] = { x: p.x, z: p.z, open: !!OPEN[type] || !!plat, h, group: g, type, shell, cut: 0, occ: 0, spots: [], plat };

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
      case "hammock": sp.push({ x: 0.15, z: 0, pose: "lie", tag: "sleep", y: 0.5, owner: o.owner, face: -Math.PI / 2 }); break;   // 吊床是左右長（x 方向），枕頭在 +x：躺的人轉 90 度，頭朝枕頭；往枕頭那邊挪一點讓頭剛好在枕頭上
      case "computer": sp.push({ x: 0, z: 0.6, pose: "sit", tag: "study", y: 0.42 }); break;
      case "gamechair": case "readchair": sp.push({ x: 0, z: 0.05, pose: "sit", tag: "relax", y: 0.42 }); break;
      case "magicdesk": sp.push({ x: 0, z: 0.55, pose: "sit", tag: "study", y: 0.42 }); break;
      case "typewriter": sp.push({ x: 0, z: 0.45, pose: "stand", tag: "study", y: 0 }); break;
      case "altar": case "oven": case "arm": sp.push({ x: 0, z: 0.7, pose: "stand", tag: type === "oven" ? "cook" : "work", y: 0 }); break;
      case "stall": sp.push({ x: 0, z: -0.6 * (o.k || 1), pose: "stand", tag: "cook", y: 0 }); break;
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
    m.extensions = Object.assign(m.extensions || {}, { derivatives: true });   // WebGL1 要開這個才有 fwidth
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
          // 一個像素蓋住幾格（遠處、斜看的地面會蓋住很多格）：格子線和每格的明暗跟著淡掉，不然會變成一閃一閃的摩爾紋
          vec3 fw = fwidth(q);
          float fwm = vn.x > 0.6 ? max(fw.y, fw.z) : (vn.y > 0.6 ? max(fw.x, fw.z) : max(fw.x, fw.y));
          diffuseColor.rgb *= mix(0.995, 0.93 + hh * 0.13, 1.0 - smoothstep(0.3, 0.9, fwm));
          vec3 fq = abs(fract(q) - 0.5);
          float ed = vn.x > 0.6 ? max(fq.y, fq.z) : (vn.y > 0.6 ? max(fq.x, fq.z) : max(fq.x, fq.y));
          float aa = max(fwm * 0.6, 0.004);
          float ln = smoothstep(0.43 - aa, 0.43 + aa, ed) * (1.0 - smoothstep(0.1, 0.38, fwm));
          diffuseColor.rgb *= mix(1.0, 0.84, ln) * mix(1.0, 0.975, smoothstep(0.1, 0.38, fwm));
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
    sp.layers.set(1);   // 名牌、泡泡畫在後製之後（不會被光暈、景深弄糊）
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
    sp.layers.set(1);   // 名牌、泡泡畫在後製之後（不會被光暈、景深弄糊）
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
    const wq = emojiSprite("💭", 0.85); wq.position.set(-0.55, 2.2, 0); wq.visible = false; g.add(wq);   // 有心事想找玩家說
    const name = textSprite(c.id, { size: 26, bg: "rgba(24,27,38,.78)", fg: "#fff", pad: 10, h: 0.5 });
    name.position.y = 0.0; name.center.set(0.5, 1.2); name.visible = false; g.add(name);
    g.scale.set(1.45, 1.45, 1.45); g.userData.isWalker = true;
    root.add(g);
    // 比例：小鎮 1 單位 = 1.6 公尺，人 1.6 公尺 → 1 單位高
    const ch = chibiFor(c.id, 0.431, g);
    if (ch) { body.visible = false; head.visible = false; zz.position.y = 0.95; zz.scale.multiplyScalar(0.7); ring.scale.setScalar(0.6); wq.position.set(-0.28, 1.02, 0); wq.scale.multiplyScalar(0.45); }
    wq.userData.y = wq.position.y;
    return { id: c.id, color: c.color, g, body, head, ring, zz, wq, name, ch, yaw: 0, pos: new T.Vector3(), path: [], loc: null, asleep: false, phase: Math.random() * 6, fade: 1, train: false };
  }
  function spotFor(locId, i, n) {
    const L = lots[locId]; if (!L) return null;
    if (L.open && L.type === "lake") {
      // 走進洞口、沿台階往下（走到隧道深處就看不到了，跟進室內一樣）
      if (GRID.lakeCell) return new T.Vector3(L.x + ((i % 3) - 1) * 0.45, 0, L.z - LAKE.back + 0.9 + Math.floor(i / 3) * 0.35);
      return new T.Vector3(L.x + (i - (n - 1) / 2) * 0.9, 0, L.z + 2.3);   // 舊位置：站在洞口前
    }
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
    return new T.Vector3(L.x + (k - (inRow - 1) / 2) * 0.9, 0, L.z + 3.2 - row * 0.5);
  }
  /* 小鎮走路不穿過房子：
   * 每排地點前面留一條小路（地點中心往前 3.2），房子的門開在這條小路上。
   * 出門 → 走到門前小路 → 沿小路走到街區旁的馬路 → 沿馬路 → 進另一個街區的小路 → 進門。 */
  const FRONT = { house: 1.95, attic: 1.85, shop: 2.4, tall: 2.4, school: 2.95, street: 1.2, wizard: 1.0 };
  const laneZ = L => L.z + 3.2;
  const doorOf = id => { const L = lots[id]; return L && !L.open ? new T.Vector3(L.x, 0, L.z + (FRONT[L.type] || 2.2)) : null; };
  // 走得進去的入口：室內地點的門，或地下湖的洞口（搬到城邊之後）
  const entryOf = id => { const L = lots[id]; return L && L.type === "lake" && GRID.lakeCell ? new T.Vector3(L.x, 0, L.z + LAKE.door) : doorOf(id); };
  const sideX = l => { const b = blockOf(l); return GRID.sideOf(b[0], isPlaza(l) ? true : l.slot % 2 === 1); };   // 離這個地點最近的街區旁巷道
  /* 走路路線：用小鎮的走路格子找路（會繞過房子、裝飾街區、平台上的家具），不會再直接穿過建築
   * 出門：從房間裡走到門口、站到門外；進門：走到門外、進門、走到位子。找不到路時用舊的沿街路線。 */
  function routeTo(w, dest, destLoc) {
    w.path = []; w.toLoc = destLoc; w.fromLoc = w.loc;
    let a = w.loc && E_loc(w.loc), bestD = 1e9;
    for (const l of N.locations) { const L0 = lots[l.id]; if (!L0) continue; const d = Math.max(Math.abs(w.pos.x - L0.x), Math.abs(w.pos.z - L0.z)); if (d < bestD) { bestD = d; if (d < 3.5) a = l; } }
    const b = E_loc(destLoc), La = a && lots[a.id], Lb = b && lots[b.id];
    if (!b || !Lb) return routeToOld(w, dest, destLoc);
    if (a && a.id === b.id && bestD < 3.5) { w.path = [dest]; return; }
    const V = (x, z) => new T.Vector3(x, 0, z), P = [];
    let start = w.pos.clone();
    const d1 = a && La && bestD < 3.5 ? entryOf(a.id) : null;
    if (d1 && w.pos.z < d1.z - 0.05 && Math.abs(w.pos.x - La.x) < 3.4) { start = V(d1.x, d1.z + 0.35); P.push(V(La.x, Math.min(w.pos.z, La.z + 0.6)), d1, start.clone()); }
    const d2 = entryOf(b.id), goal = d2 ? V(d2.x, d2.z + 0.35) : dest.clone();
    const mid = wPath(start, goal);
    if (!mid) return routeToOld(w, dest, destLoc);
    P.push(...mid);
    if (d2) P.push(goal, d2, V(Lb.x, Lb.z + 0.6));
    P.push(dest);
    w.path = P.filter((p, i) => i === 0 || p.distanceTo(P[i - 1]) > 0.01);
  }
  function routeToOld(w, dest, destLoc) {
    w.path = []; w.toLoc = destLoc; w.fromLoc = w.loc;
    // 出發點用人實際站的位置判斷（上一趟可能走到一半就改去別的地方）
    let a = w.loc && E_loc(w.loc), bestD = 1e9;
    for (const l of N.locations) { const L0 = lots[l.id]; if (!L0) continue; const d = Math.max(Math.abs(w.pos.x - L0.x), Math.abs(w.pos.z - L0.z)); if (d < bestD) { bestD = d; if (d < 3.5) a = l; } }
    const onStreet = bestD >= 3.5;
    const b = E_loc(destLoc), La = a && lots[a.id], Lb = b && lots[b.id];
    if (!a || !b || !La || !Lb) { w.g.position.copy(dest); w.pos.copy(dest); return; }
    const far = false;   // 全部在同一座城裡，走路就到
    const sameBlock = a.region === b.region && a.page === b.page;
    if (far && !sameBlock) { w.train = true; w.trainT = 0; w.trainTo = dest.clone(); return; }
    if (a.id === b.id) { w.path = [dest]; return; }
    const V = (x, z) => new T.Vector3(x, 0, z), P = [];
    // 出門
    const d1 = doorOf(a.id), inside = d1 && w.pos.z < d1.z - 0.1;
    if (onStreet) P.push(V(w.pos.x, laneZ(La)));
    else { if (inside) P.push(V(La.x, La.z + 0.6), d1); P.push(V(inside ? La.x : w.pos.x, laneZ(La))); }
    if (sameBlock && Math.abs(La.z - Lb.z) < 0.1) {
      P.push(V(Lb.x, laneZ(Lb)));
    } else {
      const xa = sideX(a), xb = sideX(b);
      P.push(V(xa, laneZ(La)));
      if (sameBlock && xa === xb) P.push(V(xb, laneZ(Lb)));
      else {
        const roads = GRID.zr;
        let rz = roads[0], best = 1e9;
        for (const z of roads) { const d = Math.abs(laneZ(La) - z) + Math.abs(laneZ(Lb) - z) + Math.abs(xa - xb) * 0; if (d < best) { best = d; rz = z; } }
        P.push(V(xa, rz), V(xb, rz), V(xb, laneZ(Lb)));
      }
      P.push(V(Lb.x, laneZ(Lb)));
    }
    // 進門
    const d2 = doorOf(b.id);
    if (d2) P.push(d2, V(Lb.x, Lb.z + 0.6));
    P.push(dest);
    // 去掉連續重複的點
    w.path = P.filter((p, i) => i === 0 || p.distanceTo(P[i - 1]) > 0.01);
  }
  function E_loc(id) { return N.locations.find(l => l.id === id); }

  /* ═════════ 天空、天氣、光 ═════════ */
  // 早上：奶油、蜜桃色的柔光（天空和霧偏暖米色、陰影淡）；中午：清爽的藍天；下午：橘色的陽光、紫色的天光和陰影
  const SKY = [[0, 0x141A2E], [300, 0x1F2546], [350, 0xE7A987], [420, 0xF2D6BC], [540, 0xEEDDC8], [660, 0xCFE2EA], [720, 0xBEE0EF], [880, 0xC6DCEC], [960, 0xF2C49C], [1030, 0xE69A98], [1080, 0xB884B4], [1130, 0x5E5486], [1180, 0x222A48], [1440, 0x141A2E]];
  const SUNC = [[0, 0xFFB088], [360, 0xFFB088], [450, 0xFFC898], [560, 0xFFD8B0], [680, 0xFFF2E2], [840, 0xFFEACC], [950, 0xFFBE7C], [1040, 0xFF9450], [1130, 0xFF7A50], [1440, 0xFF7A50]];
  const HEMIC = [[0, 0xFFD8C0], [360, 0xFFCCB0], [480, 0xFFD8BC], [600, 0xFCE2D0], [700, 0xEAEEFC], [860, 0xE6E6FC], [960, 0xD8C2F2], [1050, 0xBE9CE8], [1110, 0xA888D8], [1440, 0xA888D8]];
  const GNDC = [[0, 0x8A7458], [360, 0xD8A07C], [560, 0xD8AC88], [720, 0x8A7458], [900, 0x8A6A62], [1040, 0x7A4E74], [1440, 0x7A4E74]];
  // 早上、下午各自的「濃度」（0～1）：給光的強弱和後製調色用
  const morningK = m => m < 380 || m > 680 ? 0 : m < 450 ? (m - 380) / 70 : m < 560 ? 1 : 1 - (m - 560) / 120;
  const eveK = m => m < 860 || m > 1130 ? 0 : m < 980 ? (m - 860) / 120 : m < 1060 ? 1 : 1 - (m - 1060) / 70;
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
  /* 影子範圍的中心：第一人稱時放在眼前（看得到的地方才有影子），其他時候是鏡頭看的地方。
   * 先粗略對齊（6 單位才換一次，影子不用一直重算），再對齊到影子貼圖的像素格：
   * 沒對齊的話，每次中心一換，所有影子的邊緣都會重新取樣、整片地面的影子線一跳一跳的。 */
  function shadowCenter(dx, dy, dz) {
    let bx = cam.target.x, bz = cam.target.z;
    if (FP.on && TC && walkers[TC.id]) { const p = walkers[TC.id].pos; bx = p.x - Math.sin(FP.yaw) * 26; bz = p.z - Math.cos(FP.yaw) * 26; }
    const c = new T.Vector3(Math.round(bx / 6) * 6, 0, Math.round(bz / 6) * 6);
    const zA = new T.Vector3(dx, dy, dz).normalize(), xA = new T.Vector3(0, 1, 0).cross(zA).normalize(), yA = zA.clone().cross(xA);
    const sc = sun.shadow.camera, tex = (sc.right - sc.left) / sun.shadow.mapSize.x;
    const px = c.dot(xA), py = c.dot(yA);
    c.addScaledVector(xA, Math.round(px / tex) * tex - px).addScaledVector(yA, Math.round(py / tex) * tex - py);
    return c;
  }
  function applySky(min, weather) {
    let sky = lerpKeys(SKY, min);
    const nf = nightFactor(min);
    const noon = Math.max(0, 1 - Math.abs(min - 750) / 240);   // 中午前後把光壓低一點
    const mk = morningK(min), ek = eveK(min);
    let sunI = (0.95 - noon * 0.2 + mk * 0.04 + ek * 0.05) * (1 - nf) + 0.1, hemiI = (0.26 - noon * 0.06 + mk * 0.26 + ek * 0.04) * (1 - nf) + 0.3;   // 早上陰影淡（天光多）、下午陽光濃
    if (weather === "雨") { sky.lerp(new T.Color(0x6E7886), 0.55 * (1 - nf * 0.6)); sunI *= 0.35; hemiI *= 0.9; }
    if (weather === "多雲") { sky.lerp(new T.Color(0xC9CED3), 0.35 * (1 - nf)); sunI *= 0.7; }
    if (weather === "霧") { sky.lerp(new T.Color(0xD8D8D2), 0.6 * (1 - nf * 0.5)); sunI *= 0.55; }
    if (HQ()) sky.lerp(new T.Color(0x140E2A), nf * 0.9);   // 高畫質的夜晚：深藍紫的天空和霧，讓彩色燈光跳出來   // 高畫質的夜晚：偏紅褐的城市夜霧（燈光照在霧上）
    scene.background = sky;
    scene.fog.color.copy(sky);
    const near = weather === "霧" ? 34 : 70, far = weather === "霧" ? 120 : 190;
    scene.fog.near = near; scene.fog.far = far;
    const ang = ((Math.min(1140, Math.max(330, min)) - 330) / 810) * Math.PI;
    // 高畫質：太陽（和它的影子範圍）跟著鏡頭看的地方走，整座城都有影子
    const step = Math.round(ang * 72 / Math.PI) * Math.PI / 72, el = Math.sin(step);   // 每 10 分鐘換一次角度
    const moon = nf > 0.5, sd = moon ? [-34, 86, 40] : [Math.cos(step) * 80, 16 + el * 60, 52];
    const t = HQ() && cam.target ? shadowCenter(sd[0], sd[1], sd[2]) : TOWN_C;
    if (HQ()) { sunI *= 1.18; hemiI *= 0.78; }   // 陽光強一點、天空光少一點：明暗比較分明
    sun.position.set(t.x + sd[0], t.y + sd[1], t.z + sd[2]);   // 夜裡是月光
    sun.target.position.set(t.x, t.y, t.z); sun.target.updateMatrixWorld();
    nightLights(nf);
    const sk = sun.position.x.toFixed(1) + "," + sun.position.y.toFixed(1);
    if (sk !== perf.sunKey) { perf.sunKey = sk; renderer.shadowMap.needsUpdate = true; }
    sun.intensity = sunI;
    sun.color.copy(nf > 0.5 ? new T.Color(0x9FB0E0) : lerpKeys(SUNC, min));
    hemi.intensity = hemiI;
    hemi.color.copy(nf > 0.5 ? new T.Color(0x6F7FB8) : lerpKeys(HEMIC, min));
    hemi.groundColor.copy(nf > 0.5 ? new T.Color(0x2A2838) : lerpKeys(GNDC, min));
    moonFill.intensity = nf * 0.35;
    if (HQ() && nf > 0) {
      // 高畫質夜景：環境光變成深藍紫、整體壓暗，牆面的顏色交給彩色燈光
      hemi.color.lerp(new T.Color(0x6258B8), nf); hemi.groundColor.lerp(new T.Color(0x2A1A48), nf);
      hemi.intensity = hemiI * (1 + 0.15 * nf); sun.intensity = sunI * (1 - 0.6 * nf); sun.color.lerp(new T.Color(0x6A70D8), nf);
      moonFill.intensity = nf * 0.18;
    }
    winMat.emissiveIntensity = 0.15 + nf * 1.05;
    if (N.voxCity) N.voxCity.setNight(nf);
    for (const k in furnMats) furnMats[k].emissiveIntensity = 0.06 + nf * 0.42;
    lampMat.emissiveIntensity = nf > 0.2 ? 1.2 : 0.1;
    if (poolMat) poolMat.opacity = Math.max(0, nf - 0.15) * (HQ() ? 0.22 : 0.75);
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
    renderer.setPixelRatio(perf.ratio = Math.min(window.devicePixelRatio || 1, MQ() ? 1.25 : 1.75));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = true;   // 影子只在太陽換角度時重算
    renderer.domElement.className = "t3d-canvas";
    scene = new T.Scene();
    scene.fog = new T.Fog(0xBEE0EF, 70, 190);
    camera = new T.PerspectiveCamera(36, 1, 0.5, 1200);
    cam.target = new T.Vector3(7, 0, 12);
    root = new T.Group(); scene.add(root);

    hemi = new T.HemisphereLight(0xFFF7E8, 0x6A6658, 0.6); scene.add(hemi);
    moonFill = new T.DirectionalLight(0x8090D0, 0); moonFill.position.set(-30, 40, -20); scene.add(moonFill);
    sun = new T.DirectionalLight(0xFFF4E0, 0.9);
    sun.castShadow = true;
    sun.shadow.mapSize.set(MQ() ? 1024 : HQ() ? 4096 : 2048, MQ() ? 1024 : HQ() ? 4096 : 2048);
    const sc = sun.shadow.camera, SR = HQ() ? 58 : 64; sc.left = -SR; sc.right = SR; sc.top = SR; sc.bottom = -SR; sc.near = 1; sc.far = 220;
    sun.shadow.bias = -0.0008;
    scene.add(sun); scene.add(sun.target);

    ensureMats();

    // 地面
    // 地面、馬路、海、岸壁、港口、離島（都在 buildCoast 裡）；山不蓋在海上
    buildCoast();
    if (N.voxCity) { const mt = N.voxCity.mountains(T, GRID.RC + 125, GRID.RC + 215, MQ(), (x, z) => { const dx = GRID.cx - x; return dx > 20 && Math.abs(z - GRID.cz) < dx * 1.3 ? 1 : 0; }); /* 隔著海峽的大陸：北、東、南三面遠遠的山，西邊是外海 */ mt.group.position.set(GRID.cx, -0.3, GRID.cz); root.add(mt.group); }
    // 街區地坪
    for (const r of N.regions) r.pages.forEach((pg, i) => {
      const b = BLOCK[r.id + i]; if (!b) return;
      const sample = N.locations.find(l => l.region === r.id && l.page === i);
      const pal = sample ? palOf(sample) : PAL.central;
      const ext = false;
      if (ext) {
        const island = new T.Mesh(new T.CylinderGeometry(15, 16, 1, 7), mat(0x9DB685)); island.position.set(b[0] + 7, -0.48, b[1] + 10.5); island.receiveShadow = true; root.add(island);
      }
      const slab = new T.Mesh(new T.BoxGeometry(14.6, 0.06, 21.6), mat(pal.ground)); slab.position.set(b[0] + 7, 0.03, b[1] + 10.5); slab.receiveShadow = true; root.add(slab);
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

    // 路燈
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
      const used = new Set(N.locations.filter(l => l.region + l.page === k && !isPlaza(l) && !lakeMoved(l)).map(l => l.slot));
      const reg = k === "outer1" ? "pero" : k === "outer2" ? "other" : k.replace(/\d+$/, ""), pal = PAL[reg] || PAL.central;
      for (let slot = 0; slot < 6; slot++) {
        if (used.has(slot)) continue;
        const p = lotPos({ region: k.replace(/\d+$/, ""), page: +k.slice(-1), slot }), hh = hashStr(k + slot);
        if (HQ()) {
          const r = N.voxCity.filler(T, { key: k, seed: hh });
          r.group.position.set(p.x, VOXY, p.z); root.add(r.group);
          r.lamps.forEach(([x, z, c]) => lampSpots.push([p.x + x, p.z + z, c]));
          if (slot % 4 === 3) await breathe(onP, 0.8, "蓋背景的房子……");
          continue;
        }
        const r = N.voxTown.filler(T, { kind: hh % 2 ? "cottage" : "garden", reg, seed: hh, wall: pal.wall[hh % pal.wall.length], roof: pal.roof[(hh >> 3) % pal.roof.length], winMat, lampMat });
        const g = new T.Group(); g.position.set(p.x, VOXY, p.z); r.meshes.forEach(m => g.add(m)); root.add(g);
        r.lamps.forEach(([x, z]) => lampSpots.push([p.x + x, p.z + z]));
      }
    }
    // 其他格子：裝飾用的街區（近的細緻、遠的簡化），一路延伸到霧裡
    let ci = 0;
    for (const c of GRID.cells) {
      if (c.kind === "loc") continue;
      if (c.kind === "plaza") { buildPlaza(c); continue; }
      if (c.kind === "lake") {
        // 地下湖那一格：岩丘和洞口由地點自己蓋，這裡只補四周的人行道（手機也要，不然洞口前面沒有路）
        if (N.voxTown) { const sw = N.voxTown.block(T, 14.6, 21.6, { reg: "oldtown", seed: c.i * 7 + c.j * 13, winMat, lampMat, crystal: false }); const g = new T.Group(); g.position.set(c.x - 0.3, VOXY, c.z - 0.3); sw.meshes.forEach(m => g.add(m)); root.add(g); sw.lamps.forEach(([x, z]) => lampSpots.push([c.x - 0.3 + x, c.z - 0.3 + z])); }
        continue;
      }
      if (MQ() && c.r > 0.5) continue;   // 手機：外圈交給霧和山
      const slab = new T.Mesh(new T.BoxGeometry(14.6, 0.06, 21.6), mat(0xD0C4AE)); slab.position.set(c.x + 7, 0.03, c.z + 10.5); slab.receiveShadow = true; root.add(slab);
      if ((c.kind === "open" || c.kind === "harbor") && N.voxTown && N.voxTown.park) {
        root.remove(slab);   // 地坪會跟體素地面搶畫（草地變成沙色），這種格子不用
        // 城邊的空格：公園、廣場、社區菜園，或港邊的倉庫區；四周一樣有人行道
        const reg = c.key.replace(/\d+$/, ""), regP = c.key === "outer1" ? "pero" : c.key === "outer2" ? "other" : reg, hh = hashStr("o" + c.i + "," + c.j);
        const sw = N.voxTown.block(T, 14.6, 21.6, { reg: regP, seed: c.i * 7 + c.j * 13, winMat, lampMat, crystal: HQ() });
        const r = c.kind === "harbor" ? N.voxTown.harbor(T, 14.6, 21.6, { seed: hh, winMat, lampMat }) : N.voxTown.park(T, 14.6, 21.6, { kind: ["park", "garden", "park", "plaza"][((c.i * 3 + c.j * 5) % 4 + 4) % 4], reg: regP, seed: hh, winMat, lampMat });
        const g = new T.Group(); g.position.set(c.x - 0.3, VOXY, c.z - 0.3); sw.meshes.forEach(m => g.add(m)); r.meshes.forEach(m => g.add(m)); root.add(g);
        sw.lamps.concat(r.lamps).forEach(([x, z]) => lampSpots.push([c.x - 0.3 + x, c.z - 0.3 + z]));
        (sw.crystals || []).forEach(([x, y, z]) => crystalSpots.push([c.x - 0.3 + x, VOXY + y, c.z - 0.3 + z, regP]));
        c.sub = c.kind === "harbor" ? "harbor" : ["park", "garden", "park", "plaza"][((c.i * 3 + c.j * 5) % 4 + 4) % 4];
        if (++ci % 2 === 0) await breathe(onP, 0.82 + 0.08 * ci / GRID.cells.length, "往外蓋……");
        continue;
      }
      if (c.kind === "near") {
        const reg = c.key.replace(/\d+$/, ""), regP = c.key === "outer1" ? "pero" : c.key === "outer2" ? "other" : reg;
        if (N.voxTown) { const r = N.voxTown.block(T, 14.6, 21.6, { reg: regP, seed: c.i * 7 + c.j * 13, winMat, lampMat, crystal: HQ(), alley: alleyOf(c) }); const g = new T.Group(); g.position.set(c.x - 0.3, VOXY, c.z - 0.3); r.meshes.forEach(m => g.add(m)); root.add(g); r.lamps.forEach(([x, z]) => lampSpots.push([c.x - 0.3 + x, c.z - 0.3 + z])); (r.crystals || []).forEach(([x, y, z]) => crystalSpots.push([c.x - 0.3 + x, VOXY + y, c.z - 0.3 + z, regP])); }
        if (HQ() && N.voxCity.block) {
          // 高畫質：四面朝外的街區、中間圍中庭，房子跟主建築同一套蓋法（手機：離中心遠一點的用省略版）
          const r = N.voxCity.block(T, { key: c.key, seed: hashStr(c.i + "," + c.j), lite: MQ(), yard: true, alley: alleyOf(c) }); r.group.position.set(c.x, VOXY, c.z); root.add(r.group);
          r.lamps.forEach(([lx, lz, lc]) => lampSpots.push([c.x + lx, c.z + lz, lc]));
        } else for (let slot = 0; slot < 6; slot++) {
          const x = c.x + 3.5 + (slot % 2) * 7, z = c.z + 3.5 + Math.floor(slot / 2) * 7, hh = hashStr(c.i + "," + c.j + "," + slot);
          if (N.voxTown) { const pal = PAL[regP] || PAL.central; const r = N.voxTown.filler(T, { kind: hh % 3 ? "cottage" : "garden", reg: regP, seed: hh, wall: pal.wall[hh % pal.wall.length], roof: pal.roof[(hh >> 3) % pal.roof.length], winMat, lampMat }); const g = new T.Group(); g.position.set(x, VOXY, z); r.meshes.forEach(m => g.add(m)); root.add(g); }
        }
      } else if (N.voxCity) {
        // 遠處：高畫質用同一套房子的省略版，一般畫質維持簡化方塊
        const r = HQ() && N.voxCity.block ? N.voxCity.block(T, { key: c.key, seed: hashStr(c.i + ":" + c.j), lite: true }) : N.voxCity.farBlock(T, { key: c.key, seed: hashStr(c.i + ":" + c.j) });
        r.group.position.set(c.x, VOXY, c.z); root.add(r.group);
        // 外圈也要有人行道（島變小之後走得到，第一人稱看得到）
        if (N.voxTown) { const reg = c.key.replace(/\d+$/, ""), regP = c.key === "outer1" ? "pero" : c.key === "outer2" ? "other" : reg; const sw = N.voxTown.block(T, 14.6, 21.6, { reg: regP, seed: c.i * 7 + c.j * 13, winMat, lampMat, crystal: false }); const g = new T.Group(); g.position.set(c.x - 0.3, VOXY, c.z - 0.3); sw.meshes.forEach(m => g.add(m)); root.add(g); sw.lamps.forEach(([x, z]) => lampSpots.push([c.x - 0.3 + x, c.z - 0.3 + z])); }
      }
      if (++ci % (HQ() ? 1 : 3) === 0) await breathe(onP, 0.82 + 0.08 * ci / GRID.cells.length, "往外蓋……");
    }
    if (HQ()) { await breathe(onP, 0.9, "拉電線、掛燈籠……"); buildOverheads(); buildCrystals(); }
    buildEntrances();
    buildLampPools();
    // 星星
    const sg = new T.BufferGeometry(), sp = [], scol = [];
    const SC = [[1, 1, 1], [0.75, 0.85, 1], [1, 0.85, 0.7], [0.85, 0.7, 1], [0.7, 1, 0.95]];
    for (let i = 0; i < 1400; i++) {
      // 一半的星星集中在一條斜斜的銀河帶上
      const band = i % 2 === 0, a = Math.random() * Math.PI * 2, e = band ? 0.35 + Math.sin(a * 1 + 0.6) * 0.3 + (Math.random() - 0.5) * 0.22 : 0.12 + Math.random() * 1.3, r = 600;
      sp.push(Math.cos(a) * Math.cos(e) * r + 16, Math.sin(Math.max(0.05, e)) * r, Math.sin(a) * Math.cos(e) * r);
      const c = SC[i % SC.length], k = 0.5 + Math.random() * 0.5; scol.push(c[0] * k, c[1] * k, c[2] * k);
    }
    sg.setAttribute("position", new T.Float32BufferAttribute(sp, 3)); sg.setAttribute("color", new T.Float32BufferAttribute(scol, 3));
    stars = new T.Points(sg, new T.PointsMaterial({ vertexColors: true, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    scene.add(stars);
    if (HQ() && N.voxCity && N.voxCity.island) { buildSky(); buildMagic(); }
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
      const [bx, bz] = BLOCK[key], ext = false;
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
      const r = N.voxTown.block(T, 14.6, 21.6, { reg, seed: bx * 7 + bz, winMat, lampMat, crystal: HQ() });
      (r.crystals || []).forEach(([x, y, z]) => crystalSpots.push([bx - 0.3 + x, VOXY + y, bz - 0.3 + z, reg]));
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
      for (let i = 0; i < 4; i++) { const m = add(g, new T.IcosahedronGeometry(0.22 + i * 0.08, 0), new T.MeshLambertMaterial({ color: 0xF4F0EC, transparent: true, opacity: 0.75 - i * 0.15 }), 1.06, 5.6 + i * 0.45, -1.19, false); m.userData.smoke = i; smoke.push(m); }
    });
    /* ── 時間融合：不同時代的東西混在街上 ── */
    // 中央：鐘塔旁的老爺車、電線桿上的紀元裂縫
    const vintage = (x, z, ry) => { const g = G(x, z, ry); box(g, 0.9, 0.4, 2.0, M(0x2E4A3A), 0, 0.3, 0); box(g, 0.8, 0.5, 0.9, M(0x2E4A3A), 0, 0.7, -0.3); box(g, 0.82, 0.08, 1.0, M(0x1E2A22), 0, 1.2, -0.3);
      for (const wx of [-0.5, 0.5]) for (const wz of [-0.7, 0.7]) { const w = add(g, new T.CylinderGeometry(0.32, 0.32, 0.12, 12), mat(0x1E1E22), wx, 0.32, wz); w.rotation.z = Math.PI / 2; }
      box(g, 0.2, 0.2, 0.15, M(0xD8B04A), -0.3, 0.55, 1.05); box(g, 0.2, 0.2, 0.15, M(0xD8B04A), 0.3, 0.55, 1.05); };
    vintage(GRID.plaza.x - 1.8, GRID.plaza.z + 14, 0); vintage(GRID.colX[1] - 1.6, GRID.rowZ[-1] + 8, Math.PI);
    const rift = (x, z) => { const g = G(x, z); box(g, 0.14, 4, 0.14, M(0x6A5A4A), 0, SH, 0); box(g, 1.0, 0.08, 0.08, M(0x6A5A4A), 0, SH + 3.7, 0);
      for (let i = 0; i < 5; i++) { const c = new T.Mesh(new T.OctahedronGeometry(0.1 + (i % 2) * 0.06, 0), glowM(i % 2 ? 0xC8A8FF : 0x8AE8FF)); c.position.set(Math.sin(i * 2) * 0.2, SH + 1.6 + i * 0.35, Math.cos(i * 2) * 0.2); c.userData.rift = i; g.add(c); riftBits.push(c); } };
    rift(GRID.colX[1] + 15.2, GRID.rowZ[1] + 22);   // 廣場西北角路口那一個拿掉了（站在馬路中間）
    // 舊城：蒸汽管線、齒輪掛在牆上
    if (LEGACY) for (const id of ["諾文舊街", "諾文古籍巷", "諾文舊物市場", "諾文服飾街"]) at(id, g => { KIT.pipe(g, 1.9, 0.12, -1.6, 2.6); KIT.gears(g, -1.6, 2.4, 1.15); });
    // 外城：銅色管線、煙囪、平交道
    if (LEGACY) for (const id of ["諾文機械工作坊", "諾文科技維修站", "諾文機械市集", "諾文轉運站"]) at(id, g => { KIT.pipe(g, -2.6, 0.12, -1.2, 3.2); box(g, 0.6, 3.6, 0.6, M(0x8A4E3A), 2.6, 0.12, -2.4); KIT.gears(g, 1.6, 2.6, 1.15); });

    /* ── 鐘塔廣場：四周一圈樹、長椅、花圃、路燈 ── */
    if (!N.interiors || !N.interiors["諾文鐘塔廣場"]) { const px = GRID.plaza.x, pz = GRID.plaza.z;
      for (let k = 0; k < 6; k++) { const x = px + 1.2 + k * 2.32; KIT.tree(x, pz + 1.0, 0.75); KIT.tree(x, pz + 20.0, 0.75); }
      for (let k = 0; k < 8; k++) { const z = pz + 2.6 + k * 2.3; if (k === 3 || k === 4) continue; KIT.tree(px + 0.9, z, 0.7); KIT.tree(px + 13.1, z, 0.7); }
      for (const [x, z, r] of [[px + 3.2, pz + 7, Math.PI / 2], [px + 10.8, pz + 7, -Math.PI / 2], [px + 3.2, pz + 14, Math.PI / 2], [px + 10.8, pz + 14, -Math.PI / 2]]) KIT.bench(x, z, r);
      for (const [x, z] of [[px + 4.5, pz + 4], [px + 9.5, pz + 4], [px + 4.5, pz + 17.5], [px + 9.5, pz + 17.5]]) { KIT.flowers(x, z, 0); KIT.lamp(x + (x > px + 7 ? 1.3 : -1.3), z, true); }
    }
    /* ── 大道：中線、路口斑馬線、紅綠燈（廣場四周的十字大道） ── */
    const dash = M(0xF2EEE2);
    const AH = GRID.AW / 2, AX = [GRID.colX[0] - AH, GRID.colX[1] - AH], AZ = [GRID.rowZ[0] - AH, GRID.rowZ[1] - AH];
    for (const x of AX) for (let z = GRID.minZ; z < GRID.maxZ; z += 1.6) if (!AZ.some(v => Math.abs(z - v) < AH + 0.7) && GRID.onRoad(x, z)) { const m = new T.Mesh(new T.BoxGeometry(0.1, 0.02, 0.6), dash); m.position.set(x, 0.035, z); R0.add(m); }
    for (const z of AZ) for (let x = GRID.minX; x < GRID.maxX; x += 1.6) if (!AX.some(v => Math.abs(x - v) < AH + 0.7) && GRID.onRoad(x, z)) { const m = new T.Mesh(new T.BoxGeometry(0.6, 0.02, 0.1), dash); m.position.set(x, 0.035, z); R0.add(m); }
    for (const x of AX) for (const z of AZ) {
      // 斑馬線橫跨整條大道（從這邊的路緣到對面的路緣），才會跟廣場、對面的人行道接在一起；廣場這一圈不放紅綠燈
      const nS = Math.floor((AH - 0.45) / 0.5);
      for (let i = -nS; i <= nS; i++) for (const zz of [z + AH - 0.2, z - AH + 0.2]) { const a = new T.Mesh(new T.BoxGeometry(0.3, 0.02, 1.2), dash); a.position.set(x + i * 0.5, 0.04, zz); R0.add(a); }
      for (let i = -nS; i <= nS; i++) for (const xx of [x - AH + 0.2, x + AH - 0.2]) { const a = new T.Mesh(new T.BoxGeometry(1.2, 0.02, 0.3), dash); a.position.set(xx, 0.04, z + i * 0.5); R0.add(a); }
    }
    // 大道邊停的車、廣場南邊的公車站
    const CAR = [0xD8705A, 0x6A9AC8, 0xF2EEE2, 0x8AB880, 0xE8C060, 0xB88AC8];
    const car = (x, z, ry, c) => { const g = G(x, z, ry); box(g, 0.9, 0.45, 1.8, M(c), 0, 0.15, 0); box(g, 0.8, 0.4, 0.95, M(c), 0, 0.6, -0.1); box(g, 0.82, 0.3, 0.75, M(0xBFD8E8), 0, 0.64, -0.1);
      for (const wx of [-0.45, 0.45]) for (const wz of [-0.55, 0.55]) box(g, 0.12, 0.3, 0.3, M(0x1E1E22), wx, 0, wz); };
    let ci = 0;
    for (const z of AZ) for (const side of [-1, 1]) for (let x = GRID.minX + 20; x < GRID.maxX - 20; x += 9.5) { if (AX.some(v => Math.abs(x - v) < 6) || rnd(x, z + side) < 0.85 || !GRID.onRoad(x - 2, z + side * 2.2) || !GRID.onRoad(x + 2, z + side * 2.2) || !GRID.onRoad(x, z + side * 3.2)) continue; car(x, z + side * 2.2, side > 0 ? -Math.PI / 2 : Math.PI / 2, CAR[ci++ % CAR.length]); }
    const bs = G(GRID.plaza.x + 4, GRID.rowZ[1] - 1.2, Math.PI);
    box(bs, 2.2, 0.08, 0.8, M(0x3A6E9A), 0, SH + 2.0, 0); for (const xx of [-1, 1]) box(bs, 0.07, 2.0, 0.07, M(0x2E3238), xx, SH, 0.3);
    box(bs, 2.1, 1.3, 0.05, new T.MeshLambertMaterial({ color: 0xBFD8E8, transparent: true, opacity: 0.5 }), 0, SH + 0.5, -0.35); box(bs, 1.7, 0.07, 0.35, M(0x9A6A40), 0, SH + 0.42, -0.12);
  }
  const smoke = [], riftBits = [], lampSpots = [];
  const VOXY = -0.02;
  const TOWN_C = { x: 7, y: 0, z: 10.5, clone() { return new T.Vector3(7, 0, 10.5); } };
  const perf = { ratio: 1, acc: 0, n: 0, sunKey: "", cool: 0 };            // 體素地面頂端剛好比街區地坪高一點點
  let poolMat = null;
  /* 中央的鐘塔廣場：一整格的石板廣場，中間是大鐘塔，四周長椅、花圃、路燈 */
  /* ═════════ 建築之間：電線、燈籠串、小旗子、燈泡串、空橋 ═════════
   * 中等密度。每條路、每條門前小路隨機拉幾條，高度不一；舊城多燈籠、中央和學院多小旗子、外城多彩色燈泡。 */
  /* ═════════ 天上：浮空島嶼、遠方的聖劍 ═════════ */
  const SKYO = { relic: null, ring: null, glow: null, mats: [] };
  function buildSky() {
    const g = new T.Group(); scene.add(g);
    for (let i = 0, nI = MQ() ? 4 : 9; i < nI; i++) {
      const a = i * (MQ() ? 1.6 : 0.7) + 0.4 + Math.sin(i * 3.1) * 0.25, r = GRID.RC + 50 + (i % 3) * 35, h = 28 + (i * 37 % 40);
      const isl = N.voxCity.island(T, 17 + i * 31);
      isl.group.position.set(GRID.cx + Math.cos(a) * r, h, GRID.cz + Math.sin(a) * r);
      isl.group.rotation.y = i * 1.3; isl.group.userData.bob = i;
      g.add(isl.group);
    }
    SKYO.islands = g;
    // 聖劍：遠方天上一把倒插的巨劍（剪影），劍身邊緣和符文環微微發光
    const relic = new T.Group(), dark = new T.MeshBasicMaterial({ color: 0x1A1830, fog: false, transparent: true, opacity: 1 });
    SKYO.mats.push(dark);
    const part = (w, h, d, y) => { const m = new T.Mesh(new T.BoxGeometry(w, h, d), dark); m.position.y = y; relic.add(m); };
    for (let k = 0; k < 8; k++) part(9 - k * 0.9, 18, 1.6, -8 - k * 17);   // 劍身越往下越細
    part(1.5, 8, 1.5, -144);                                              // 劍尖
    part(34, 4.5, 4, 3); part(5, 22, 5, 16); part(8, 7, 8, 30);            // 護手、握柄、劍首
    const glowMat = new T.LineBasicMaterial({ color: 0xFFD88A, transparent: true, opacity: 0, fog: false });
    SKYO.glow = glowMat;
    relic.children.slice().forEach(m => { const e = new T.LineSegments(new T.EdgesGeometry(m.geometry), glowMat); e.position.copy(m.position); relic.add(e); });
    const ringMat = new T.MeshBasicMaterial({ color: 0x9AD8FF, transparent: true, opacity: 0, fog: false, side: T.DoubleSide, depthWrite: false, blending: T.AdditiveBlending });
    const ring = new T.Mesh(new T.TorusGeometry(26, 0.6, 6, 64), ringMat); ring.rotation.x = Math.PI / 2; ring.position.y = -40; relic.add(ring);
    const ring2 = new T.Mesh(new T.TorusGeometry(18, 0.4, 6, 48), ringMat); ring2.rotation.x = Math.PI / 2; ring2.position.y = -70; relic.add(ring2);
    SKYO.ring = [ring, ring2]; SKYO.ringMat = ringMat;
    relic.position.set(GRID.cx - 300, 260, GRID.cz - 380); relic.rotation.z = 0.08; relic.rotation.y = 0.5; relic.scale.setScalar(2.4);
    scene.add(relic); SKYO.relic = relic;
  }
  /* ═════════ 浮在空中的法陣、全息螢幕、星座 ═════════ */
  const MAGIC = { circles: [], screens: [], cons: null };
  function circleTex(col, seed) {
    const cv = document.createElement("canvas"); cv.width = cv.height = 512;
    const x = cv.getContext("2d"), c = "#" + new T.Color(col).getHexString(), C = 256;
    x.strokeStyle = c; x.fillStyle = c; x.shadowColor = c; x.shadowBlur = 14; x.lineCap = "round";
    const ring = (r, w) => { x.lineWidth = w; x.beginPath(); x.arc(C, C, r, 0, Math.PI * 2); x.stroke(); };
    ring(240, 6); ring(222, 3); ring(150, 4); ring(70, 3);
    const n = 5 + (seed % 3);   // 星形
    x.lineWidth = 4; x.beginPath();
    for (let i = 0; i <= n; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI * 2 / n; i ? x.lineTo(C + Math.cos(a) * 150, C + Math.sin(a) * 150) : x.moveTo(C + Math.cos(a) * 150, C + Math.sin(a) * 150); }
    x.stroke();
    // 外圈的符文：一格一格的小符號
    x.font = "bold 22px serif"; x.textAlign = "center"; x.textBaseline = "middle";
    const R = "ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ";
    for (let i = 0; i < 28; i++) { const a = i / 28 * Math.PI * 2; x.save(); x.translate(C + Math.cos(a) * 231, C + Math.sin(a) * 231); x.rotate(a + Math.PI / 2); x.fillText(R[(i * 7 + seed) % R.length], 0, 0); x.restore(); }
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; x.beginPath(); x.arc(C + Math.cos(a) * 186, C + Math.sin(a) * 186, 8, 0, Math.PI * 2); x.stroke(); }
    const t = new T.CanvasTexture(cv); return t;
  }
  function screenTex(col, seed) {
    const cv = document.createElement("canvas"); cv.width = 256; cv.height = 160;
    const x = cv.getContext("2d"), c = "#" + new T.Color(col).getHexString();
    x.fillStyle = c; x.globalAlpha = 0.18; x.fillRect(0, 0, 256, 160); x.globalAlpha = 1;
    x.strokeStyle = c; x.lineWidth = 4; x.strokeRect(4, 4, 248, 152);
    const rnd = k => { const v = Math.sin(seed * 91.7 + k * 13.3) * 43758.5; return v - Math.floor(v); };
    const kind = seed % 3;
    if (kind === 0) {   // 長條圖
      for (let i = 0; i < 9; i++) { const h = 20 + rnd(i) * 100; x.fillRect(22 + i * 24, 140 - h, 14, h); }
    } else if (kind === 1) {   // 波形＋文字列
      x.lineWidth = 3; x.beginPath(); for (let i = 0; i <= 60; i++) { const yy = 60 + Math.sin(i * 0.35 + seed) * 22 * (0.5 + rnd(i) * 0.5); i ? x.lineTo(16 + i * 3.7, yy) : x.moveTo(16, yy); } x.stroke();
      for (let r = 0; r < 4; r++) x.fillRect(18, 100 + r * 12, 60 + rnd(r + 9) * 150, 6);
    } else {   // 地圖／雷達
      x.lineWidth = 2; for (const r of [20, 40, 60]) { x.beginPath(); x.arc(80, 80, r, 0, Math.PI * 2); x.stroke(); }
      x.beginPath(); x.moveTo(80, 80); x.lineTo(80 + 60 * Math.cos(seed), 80 + 60 * Math.sin(seed)); x.stroke();
      for (let i = 0; i < 5; i++) x.fillRect(160, 24 + i * 24, 30 + rnd(i) * 60, 10);
    }
    return new T.CanvasTexture(cv);
  }
  function buildMagic() {
    const COLS = [0x8AD8FF, 0xC88AFF, 0xFFD88A, 0x6AFFC8, 0xFF8AD0];
    // 法陣：廣場上空一個大的、各區上空幾個，水平慢慢轉；有的直立掛在大道上
    const spots = [[GRID.plaza.x + 7, 18, GRID.plaza.z + 10.5, 9, 0]];
    let k = 0;
    // 只留鐘塔廣場上空的法陣
    spots.forEach(([x, y, z, r, vert], i) => {
      const col = COLS[i % COLS.length];
      const m = new T.Mesh(new T.PlaneGeometry(r * 2, r * 2), new T.MeshBasicMaterial({ map: circleTex(col, i * 3 + 1), transparent: true, opacity: 0.7, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }));
      m.position.set(x, y, z); if (!vert) m.rotation.x = -Math.PI / 2; m.userData = { y, spin: (i % 2 ? 1 : -1) * (0.15 + (i % 3) * 0.08), vert, ph: i };
      m.layers.set(0); root.add(m); MAGIC.circles.push(m);
      lampSpots.push([x, z, col]);
    });
    // 全息螢幕：路口上空浮著的半透明面板
    for (let i = 0; i < 14; i++) {
      const xs = GRID.xr[(i * 3 + 1) % GRID.xr.length], zs = GRID.zr[(i * 5 + 2) % GRID.zr.length];
      if (Math.hypot(xs - GRID.cx, zs - GRID.cz) > GRID.RC * 0.85) continue;
      const col = COLS[(i + 2) % COLS.length], w = 2.2 + (i % 3) * 0.9;
      const m = new T.Mesh(new T.PlaneGeometry(w, w * 0.62), new T.MeshBasicMaterial({ map: screenTex(col, i + 1), transparent: true, opacity: 0.85, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }));
      const y = 5 + (i % 4) * 1.6; m.position.set(xs, y, zs); m.rotation.y = (i % 4) * Math.PI / 2 + 0.3;
      m.userData = { y, ph: i * 1.7 }; root.add(m); MAGIC.screens.push(m);
    }
    // 星座：幾組連線的星（天球上），夜裡亮
    const CON = [
      [[0, 0], [1.2, 0.5], [2.3, 0.3], [3.1, 1.0], [4.0, 0.6], [3.6, -0.4]],          // 長尾
      [[0, 0], [0.8, 1.2], [1.8, 0.8], [2.4, 1.8], [1.8, 0.8], [2.2, -0.2]],          // 劍
      [[0, 0], [0.9, 0.2], [1.6, -0.3], [2.4, 0.1], [1.6, -0.3], [1.2, -1.1]],
      [[0, 0], [0.6, 0.9], [1.4, 1.0], [2.0, 0.2], [1.4, -0.6], [0.5, -0.5], [0, 0]], // 環
      [[0, 0], [0.7, 0.7], [1.6, 0.9], [2.5, 0.5], [3.2, 1.2]]
    ];
    const lp = [], pp = [];
    CON.forEach((c, j) => {
      const az0 = j * 1.25 + 0.3, el0 = 0.55 + (j % 3) * 0.17, R = 590, sc = 0.07;
      const P = c.map(([u, v]) => { const az = az0 + u * sc, el = el0 + v * sc; return [Math.cos(az) * Math.cos(el) * R + GRID.cx, Math.sin(el) * R, Math.sin(az) * Math.cos(el) * R + GRID.cz]; });
      for (let i = 0; i < P.length - 1; i++) lp.push(...P[i], ...P[i + 1]);
      P.forEach(p => pp.push(...p));
    });
    const lg = new T.BufferGeometry(); lg.setAttribute("position", new T.Float32BufferAttribute(lp, 3));
    const lm = new T.LineBasicMaterial({ color: 0x9AC8FF, transparent: true, opacity: 0, fog: false, depthWrite: false });
    const pg = new T.BufferGeometry(); pg.setAttribute("position", new T.Float32BufferAttribute(pp, 3));
    const pm = new T.PointsMaterial({ color: 0xE8F2FF, size: 4, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
    const g = new T.Group(); g.add(new T.LineSegments(lg, lm)); g.add(new T.Points(pg, pm)); scene.add(g);
    MAGIC.cons = { lm, pm };
  }
  function magicFrame(tt, nf) {
    for (const m of MAGIC.circles) {
      const u = m.userData;
      if (u.vert) m.rotation.z = tt * u.spin; else m.rotation.z = tt * u.spin;
      m.position.y = u.y + Math.sin(tt * 0.6 + u.ph) * 0.25;
      m.material.opacity = (0.35 + nf * 0.5) * (0.85 + 0.15 * Math.sin(tt * 2 + u.ph));
    }
    for (const m of MAGIC.screens) {
      const u = m.userData; m.position.y = u.y + Math.sin(tt * 0.8 + u.ph) * 0.15;
      m.material.opacity = (0.45 + nf * 0.45) * (Math.sin(tt * 13 + u.ph * 7) > 0.97 ? 0.4 : 1);
    }
    if (MAGIC.cons) { MAGIC.cons.lm.opacity = nf * 0.55; MAGIC.cons.pm.opacity = nf; }
  }
  function skyFrame(tt, nf) {
    magicFrame(tt, nf);
    if (!SKYO.relic) return;
    SKYO.islands.children.forEach((g, i) => { g.position.y += Math.sin(tt * 0.3 + i) * 0.004; g.rotation.y += 0.0004; });
    SKYO.ring.forEach((r, i) => { r.rotation.z = tt * (i ? -0.15 : 0.1); });
    SKYO.glow.opacity = 0.15 + nf * 0.7;
    SKYO.ringMat.opacity = 0.08 + nf * 0.5;
    // 白天是淡淡的剪影（接近天空色），晚上變深、邊緣發光
    const sky = scene.background && scene.background.isColor ? scene.background : new T.Color(0x9ABCD8);
    SKYO.mats[0].color.copy(sky).lerp(new T.Color(0x0A0818), 0.25 + nf * 0.55);
  }
  const OVH = { lanMat: null };
  /* 水晶路燈的水晶：八面體、依區域上色，發光、慢慢轉、上下浮一點點 */
  const crystalSpots = [], CRY = { mesh: null };
  const CRYC = { central: 0xFFC86A, academy: 0x8AB0FF, oldtown: 0xFFB04A, outer: 0x3AE8FF, pero: 0xFF5AD8, other: 0x6AFFB0 };
  function buildCrystals() {
    if (!crystalSpots.length) return;
    const geo = new T.OctahedronGeometry(0.2, 0); geo.scale(1, 1.6, 1);
    const im = new T.InstancedMesh(geo, new T.MeshBasicMaterial({ color: 0xFFFFFF }), crystalSpots.length);
    crystalSpots.forEach((c, i) => { const col = CRYC[c[3]] || 0x8AB0FF; im.setColorAt(i, new T.Color(col)); lampSpots.push([c[0], c[2], col]); });
    im.userData.noVox = true; root.add(im); CRY.mesh = im;
    crystalFrame(0);
  }
  function crystalFrame(tt) {
    const im = CRY.mesh; if (!im) return;
    const M = new T.Matrix4(), Q = new T.Quaternion(), S = new T.Vector3(1, 1, 1), P = new T.Vector3(), Y = new T.Vector3(0, 1, 0);
    crystalSpots.forEach((c, i) => { P.set(c[0], c[1] + Math.sin(tt * 1.3 + i) * 0.05, c[2]); Q.setFromAxisAngle(Y, tt * 0.6 + i); M.compose(P, Q, S); im.setMatrixAt(i, M); });
    im.instanceMatrix.needsUpdate = true;
  }
  function buildOverheads() {
    const rnd = (a, b, c) => { let h = (a * 73856093) ^ (b * 19349663) ^ (c * 83492791); h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
    const lines = [], lan = [], flags = [], bulbs = [], walks = [];
    const cellAt = {}; for (const c of GRID.cells) cellAt[c.i + "," + c.j] = c;
    const locAtSlot = (k, slot) => N.locations.find(l => l.region + l.page === k && l.slot === slot && !isPlaza(l) && !lakeMoved(l));
    // 街區某一側在 z（或 x）位置有沒有牆可以掛
    const hasWall = (c, side, t) => {
      if (c.kind === "plaza") return false;
      if (c.kind !== "loc") return true;
      const k = Object.keys(BLOCK).find(q => BLOCK[q][0] === c.x && BLOCK[q][1] === c.z); if (!k) return true;
      let slot;
      if (side === "L" || side === "R") { const row = Math.max(0, Math.min(2, Math.floor((t - c.z) / 7))); slot = row * 2 + (side === "R" ? 1 : 0); }
      else { const col = t - c.x < 7 ? 0 : 1; slot = (side === "B" ? 4 : 0) + col; }
      const l = locAtSlot(k, slot), L = l && lots[l.id];
      return !(L && (L.open || L.plat));
    };
    const deco = (key, h) => /oldtown/.test(key) ? (h < 0.55 ? "lan" : null) : /outer/.test(key) ? (h < 0.5 ? "bulb" : null) : (h < 0.4 ? "flag" : null);
    const cable = (ax, az, bx, bz, y, kind) => {
      const n = 10, L = Math.hypot(bx - ax, bz - az), sag = Math.min(0.9, L * 0.06 + 0.15), pts = [];
      for (let i = 0; i <= n; i++) { const t = i / n; pts.push([ax + (bx - ax) * t, y - sag * 4 * t * (1 - t), az + (bz - az) * t]); }
      for (let i = 0; i < n; i++) lines.push(...pts[i], ...pts[i + 1]);
      if (!kind) return;
      const step = kind === "lan" ? 0.75 : kind === "bulb" ? 0.4 : 0.5, cnt = Math.max(2, Math.floor(L / step));
      for (let i = 1; i < cnt; i++) {
        const t = i / cnt, x = ax + (bx - ax) * t, z = az + (bz - az) * t, yy = y - sag * 4 * t * (1 - t);
        if (kind === "lan") lan.push([x, yy - 0.16, z, i % 4 === 0 ? 0xF4E4C0 : 0xE8382A]);
        else if (kind === "bulb") bulbs.push([x, yy - 0.06, z, [0xFF4AC8, 0x4AE8FF, 0xFFD84A, 0x9A6AFF, 0x6AFF9A][i % 5]]);
        else flags.push([x, yy - 0.12, z, [0xD84A4A, 0xF4D35E, 0x3E6A9A, 0x4A8A6A, 0xF4F0E8][i % 5], Math.atan2(bx - ax, bz - az)]);
      }
      if (kind !== "flag") lampSpots.push([(ax + bx) / 2, (az + bz) / 2, kind === "lan" ? 0xFF5A30 : 0xC86AFF]);
    };
    for (const c of GRID.cells) {
      if (c.kind === "plaza" || c.r > 0.9) continue;
      // 橫過右邊的路
      const R = cellAt[(c.i + 1) + "," + c.j];
      if (R && R.kind !== "plaza") for (let q = 0; q < 2; q++) {
        const z = c.z + 2 + rnd(c.i, c.j, q) * 17;
        if (!hasWall(c, "R", z) || !hasWall(R, "L", z)) continue;
        cable(c.x + 14.3, z, R.x - 0.3, z + (rnd(c.i, c.j, q + 9) - 0.5) * 1.5, 2.7 + rnd(c.i, c.j, q + 3) * 1.1, deco(c.key, rnd(c.i, c.j, q + 5)));
      }
      // 橫過下面的路
      const D = cellAt[c.i + "," + (c.j + 1)];
      if (D && D.kind !== "plaza") for (let q = 0; q < 2; q++) {
        const x = c.x + 1.5 + rnd(c.j, c.i, q + 20) * 11;
        if (!hasWall(c, "B", x) || !hasWall(D, "T", x)) continue;
        cable(x, c.z + 21.3, x + (rnd(c.i, c.j, q + 29) - 0.5) * 1.5, D.z - 0.3, 2.7 + rnd(c.i, c.j, q + 23) * 1.1, deco(c.key, rnd(c.i, c.j, q + 25)));
      }
      // 空橋：窄路（4.5）兩邊都是房子的地方，偶爾一座
      if (R && R.kind !== "plaza" && R.x - (c.x + 14) < GRID.NW + 0.5 && rnd(c.i, c.j, 77) < 0.12) {
        const z = c.z + 5 + rnd(c.i, c.j, 78) * 10;
        if (hasWall(c, "R", z) && hasWall(R, "L", z)) walks.push([c.x + 14.3, R.x - 0.3, z]);
      }
    }
    // 地點街區裡的門前小路：前後兩排都是房子才拉
    for (const k in BLOCK) {
      const [bx, bz] = BLOCK[k];
      for (let r = 0; r < 2; r++) for (let col = 0; col < 2; col++) {
        const la = locAtSlot(k, r * 2 + col), lb = locAtSlot(k, (r + 1) * 2 + col), A = la && lots[la.id], B = lb && lots[lb.id];
        if ((A && (A.open || A.plat)) || (B && (B.open || B.plat))) continue;
        for (let q = 0; q < 2; q++) {
          const h = rnd(bx | 0, bz | 0, r * 10 + col * 3 + q), x = bx + col * 7 + 1 + h * 5;
          cable(x, bz + 3.5 + r * 7 + 2.5, x + (rnd(q, r, col) - 0.5), bz + 7 * (r + 1) + 0.2, 2.3 + rnd(col, q, r) * 0.8, deco(k, rnd(r, col, q + 40)));
        }
      }
    }
    const g = new T.Group();
    // 每 5 段電線挑 1 條變成魔力線（青紫色發光）
    const plain = [], mana = [];
    for (let i = 0, seg = 0; i < lines.length; i += 60, seg++) (seg % 5 === 2 ? mana : plain).push(...lines.slice(i, i + 60));
    const lg = new T.BufferGeometry(); lg.setAttribute("position", new T.Float32BufferAttribute(plain, 3));
    g.add(new T.LineSegments(lg, new T.LineBasicMaterial({ color: 0x1C1C22 })));
    if (mana.length) { const mg = new T.BufferGeometry(); mg.setAttribute("position", new T.Float32BufferAttribute(mana, 3)); OVH.manaMat = new T.LineBasicMaterial({ color: 0x9A7AFF }); g.add(new T.LineSegments(mg, OVH.manaMat)); }
    OVH.lanMat = new T.MeshBasicMaterial({ color: 0xFFFFFF });
    const inst = (list, geo, matl, rot) => {
      if (!list.length) return;
      const im = new T.InstancedMesh(geo, matl, list.length), M = new T.Matrix4(), Q = new T.Quaternion(), S = new T.Vector3(1, 1, 1), P = new T.Vector3();
      list.forEach((e, i) => { P.set(e[0], e[1], e[2]); Q.setFromAxisAngle(new T.Vector3(0, 1, 0), rot ? e[4] : 0); M.compose(P, Q, S); im.setMatrixAt(i, M); im.setColorAt(i, new T.Color(e[3])); });
      im.instanceMatrix.needsUpdate = true; im.userData.noVox = true; g.add(im);
    };
    inst(lan, new T.BoxGeometry(0.14, 0.2, 0.14), OVH.lanMat);
    inst(bulbs, new T.BoxGeometry(0.07, 0.07, 0.07), OVH.lanMat);
    inst(flags, new T.BoxGeometry(0.02, 0.2, 0.16), new T.MeshLambertMaterial({ color: 0xFFFFFF }), true);
    root.add(g);
    // 空橋
    for (const [x0, x1, z] of walks) {
      const r = N.voxCity.skywalk(T, (x1 - x0) * 1.6);
      r.group.position.set(x0, 0, z); root.add(r.group);
      r.lamps.forEach(([lx, lz, lc]) => lampSpots.push([x0 + lx, z + lz, lc]));
    }
  }
  function buildPlaza(c) {
    const cx = c.x + 7, cz = c.z + 10.5;
    const cv = document.createElement("canvas"); cv.width = 512; cv.height = 768;
    const x = cv.getContext("2d");
    x.fillStyle = "#E4DACA"; x.fillRect(0, 0, 512, 768);
    for (let r = 20; r < 420; r += 22) { x.strokeStyle = r % 44 ? "#D2C6B2" : "#C8BCA8"; x.lineWidth = 3; x.beginPath(); x.arc(256, 384, r, 0, Math.PI * 2); x.stroke(); }
    for (let a = 0; a < 16; a++) { x.strokeStyle = "#CFC3AE"; x.lineWidth = 2; x.beginPath(); x.moveTo(256, 384); x.lineTo(256 + Math.cos(a * Math.PI / 8) * 500, 384 + Math.sin(a * Math.PI / 8) * 500); x.stroke(); }
    const tex = new T.CanvasTexture(cv); tex.magFilter = T.NearestFilter;
    const m = new T.Mesh(new T.PlaneGeometry(14.6, 21.6), new T.MeshLambertMaterial({ map: tex })); m.rotation.x = -Math.PI / 2; m.position.set(cx, 0.06, cz); m.receiveShadow = true; root.add(m);   // 比體素地面（0.105）低一點，不搶畫
    // 鐘塔廣場：整個中央廣場就是房間的那個平台（22.4×33.6 公尺，大鐘塔在裡面）
    const pl = N.locations.find(isPlaza);
    if (pl && isPlat(pl)) { const P = placePlat(pl.id, cx, cz, 0); P.group.userData.loc = pl.id; plazaPlat = P; if (lots[pl.id]) lots[pl.id].plat = P, lots[pl.id].open = true; }
  }
  let plazaPlat = null;
  /* 晚上：離鏡頭最近的路燈、燈籠、霓虹變成真的燈，會照亮旁邊的牆（顏色跟著燈） */
  /* 夜裡照亮牆面的彩色燈：
   * 1. 先把燈點分群：同一種顏色、靠得很近的（招牌、霓虹、燈籠一整排）只算一盞，放在那一群的中間
   * 2. 每一群的顏色固定（照位置決定），不會因為鏡頭移動換色
   * 3. 只開鏡頭附近的幾群；換的時候慢慢淡入淡出，不會一下亮一下暗 */
  let nlights = null, nlClusters = null, nlOn = 0, nlLastPick = 0, nlTarget = null;
  function lampClusters() {
    const SAT = [0xFF3AB0, 0x2AD8FF, 0xFF7A2A, 0x9A5AFF];
    const fix = p => {
      const c = new T.Color(p[2] || 0xFF9A48), hsl = {}; c.getHSL(hsl);
      const k = ((Math.round(p[0] * 0.37) * 7 + Math.round(p[1] * 0.37) * 13) % 4 + 4) % 4;
      if (hsl.s < 0.5 || (k === 1 && hsl.h > 0.05 && hsl.h < 0.15)) c.set(SAT[((Math.round(p[0]) * 3 + Math.round(p[1]) * 5) % 4 + 4) % 4]);
      else c.setHSL(hsl.h, Math.min(0.85, hsl.s), 0.58);
      c.getHSL(hsl); c.setHSL(hsl.h, hsl.s * 0.8, hsl.l);
      return c;
    };
    const hueKey = c => { const h = {}; c.getHSL(h); return Math.round(h.h * 8) % 8; };
    const out = [];
    for (const p of lampSpots) {
      const c = fix(p), hk = hueKey(c);
      const g = out.find(q => q.hk === hk && Math.hypot(q.sx / q.n - p[0], q.sz / q.n - p[1]) < 6.5);
      if (g) { g.sx += p[0]; g.sz += p[1]; g.n++; }
      else out.push({ hk, sx: p[0], sz: p[1], n: 1, color: c });
    }
    out.forEach((g, i) => { g.x = g.sx / g.n; g.z = g.sz / g.n; g.id = i; g.y = 2.8 + (i % 3) * 0.7; g.power = Math.min(1.5, 0.8 + g.n * 0.12); });
    return out;
  }
  function nightLights(nf) {
    if (!HQ() || !built) return;
    nlOn = Math.min(1, Math.max(0, nf - 0.05) / 0.6);
  }
  function nightLightsFrame(dt, now) {
    if (!HQ() || !built || !cam.target) return;
    if (!nlights) { nlights = []; for (let i = 0, nL = MQ() ? 6 : 22; i < nL; i++) { const L = new T.PointLight(0xFFA050, 0, MQ() ? 14 : 10, 1.3); L.castShadow = false; L.userData = { cid: -1, cur: 0, want: 0 }; scene.add(L); nlights.push(L); } }
    if (!nlClusters || nlClusters.srcN !== lampSpots.length) { nlClusters = lampClusters(); nlClusters.srcN = lampSpots.length; nlLastPick = 0; }
    const t = cam.target;
    // 每 0.4 秒重新挑一次（還沒換上的燈等舊的淡出後補上）；目標用鏡頭看的地方
    if (nlOn > 0 && now - nlLastPick > 400) {
      nlLastPick = now; nlTarget = { x: t.x, z: t.z };
      // 由近到遠挑，彼此至少隔 5 單位（燈分散開，不會全擠在一棟樓上）；大群的燈優先
      const sorted = nlClusters.map(g => [g, ((g.x - t.x) ** 2 + (g.z - t.z) ** 2) / (0.6 + g.n * 0.15)]).sort((a, b) => a[1] - b[1]);
      const want = [];
      for (const [g] of sorted) { if (want.some(q => Math.hypot(q.x - g.x, q.z - g.z) < 5)) continue; want.push(g); if (want.length >= nlights.length) break; }
      const ids = new Set(want.map(g => g.id));
      for (const L of nlights) if (!ids.has(L.userData.cid)) L.userData.want = 0;
      const have = new Set(nlights.filter(L => L.userData.want > 0).map(L => L.userData.cid));
      for (const g of want) {
        if (have.has(g.id)) continue;
        const L = nlights.find(q => q.userData.want === 0 && q.userData.cur < 0.03) || null;
        if (!L) break;   // 等淡出完再換
        L.userData.cid = g.id; L.userData.want = g.power; L.position.set(g.x, g.y, g.z); L.color.copy(g.color);
      }
    }
    const k = Math.min(1, dt * 2.5);
    for (const L of nlights) { const u = L.userData; u.cur += ((nlOn > 0 ? u.want : 0) - u.cur) * k; if (u.want === 0 && u.cur < 0.03) u.cur = 0; L.intensity = u.cur * nlOn * 1.15; }
  }
  /* ═════════ 海岸：海、岸壁、濱海步道、港池、棧橋、防波堤燈塔、離島和石拱橋、城外的田和小屋 ═════════
   * 岸線在 GRID 裡算好（GRID.coast，由北往南的折線，陸地在右手邊）；這裡把東西沿著它擺上去。
   * 大量的小方塊合成一個網格（Batch），不然物件數會爆。 */
  function Batch() {
    const P = [], Cl = [], Nm = [], col = new T.Color();
    const FACES = [[[1, 0, 0], [[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1]]], [[-1, 0, 0], [[-1, -1, 1], [-1, 1, 1], [-1, 1, -1], [-1, -1, -1]]],
      [[0, 1, 0], [[-1, 1, -1], [-1, 1, 1], [1, 1, 1], [1, 1, -1]]], [[0, -1, 0], [[-1, -1, 1], [-1, -1, -1], [1, -1, -1], [1, -1, 1]]],
      [[0, 0, 1], [[1, -1, 1], [1, 1, 1], [-1, 1, 1], [-1, -1, 1]]], [[0, 0, -1], [[-1, -1, -1], [-1, 1, -1], [1, 1, -1], [1, -1, -1]]]];
    return {
      // 底在 y、中心在 (x, z)、繞 y 轉 ry
      box(w, h, d, x, y, z, ry, c, noBottom) {
        const cs = Math.cos(ry || 0), sn = Math.sin(ry || 0); col.set(c);
        for (let f = 0; f < 6; f++) {
          if (noBottom && f === 3) continue;
          const [n, q] = FACES[f], nx = n[0] * cs + n[2] * sn, nz = -n[0] * sn + n[2] * cs;
          const v = q.map(([a, b, e]) => { const lx = a * w / 2, lz = e * d / 2; return [x + lx * cs + lz * sn, y + (b + 1) * h / 2, z - lx * sn + lz * cs]; });
          for (const k of [0, 1, 2, 0, 2, 3]) { P.push(...v[k]); Nm.push(nx, n[1], nz); Cl.push(col.r, col.g, col.b); }
        }
      },
      quad(a, b, c2, d2, y, c) {   // 平放的四邊形（逆時針，從上面看）
        col.set(c);
        for (const p of [a, b, c2, a, c2, d2]) { P.push(p[0], y, p[1]); Nm.push(0, 1, 0); Cl.push(col.r, col.g, col.b); }
      },
      mesh(m, shadow) {
        if (!P.length) return null;
        const g = new T.BufferGeometry();
        g.setAttribute("position", new T.Float32BufferAttribute(P, 3)); g.setAttribute("normal", new T.Float32BufferAttribute(Nm, 3)); g.setAttribute("color", new T.Float32BufferAttribute(Cl, 3));
        const o = new T.Mesh(g, m || coastMat()); o.userData.noVox = true; o.receiveShadow = true; o.castShadow = shadow !== false; o.matrixAutoUpdate = false; o.updateMatrix(); root.add(o); return o;
      }
    };
  }
  let _coastMat = null;
  const coastMat = () => _coastMat || (_coastMat = new T.MeshLambertMaterial({ vertexColors: true }));
  const COAST = { sea: null, foam: null, beam: null, beamGlow: null, boats: [], lights: [] };
  const hs2 = (a, b) => { const v = Math.sin(a * 91.7 + b * 47.3) * 24634.6345; return v - Math.floor(v); };
  function buildCoast() {
    const pts = GRID.coast, B = Batch(), Bg = Batch(), BASIN = GRID.basin;
    // ── 海、陸地（各自一塊多邊形）──
    // 海＝一大塊中間挖掉島；島＝岸線圍起來的那塊
    const seaSh = new T.Shape(), landSh = new T.Shape(), hole = new T.Path();
    seaSh.moveTo(-900, -900); seaSh.lineTo(900, -900); seaSh.lineTo(900, 900); seaSh.lineTo(-900, 900); seaSh.lineTo(-900, -900);
    pts.forEach((p, k) => { if (!k) { landSh.moveTo(p[0], -p[1]); hole.moveTo(p[0], -p[1]); } else { landSh.lineTo(p[0], -p[1]); hole.lineTo(p[0], -p[1]); } });
    landSh.closePath(); hole.closePath(); seaSh.holes.push(hole);
    const seaM = new T.MeshPhongMaterial({ color: 0x2E6E8E, emissive: 0x0E2A3A, specular: 0x2A4050, shininess: 18 });
    const sea = new T.Mesh(new T.ShapeGeometry(seaSh), seaM); sea.rotation.x = -Math.PI / 2; sea.position.y = -0.42; sea.userData.noVox = true; sea.receiveShadow = true; root.add(sea); COAST.sea = sea;
    const bed = new T.Mesh(new T.PlaneGeometry(1800, 1800), new T.MeshBasicMaterial({ color: 0x173A4A })); bed.rotation.x = -Math.PI / 2; bed.position.set(0, -1.6, 0); bed.userData.noVox = true; root.add(bed);
    const land = new T.Mesh(new T.ShapeGeometry(landSh), mat(0x86A462)); land.rotation.x = -Math.PI / 2; land.receiveShadow = true; land.userData.noVox = true; root.add(land);
    // ── 馬路：每個街區往外 ROADE 的長方形聯集起來就是整片路網 ──
    // 先把所有長方形的邊切成格子（座標壓縮），算出哪些格子是路，再一列一列合併成不重疊的路面；
    // 路的外緣（格子旁邊不是路）才鋪石頭路緣，所以不會有路緣跑到別條路中間、也不會有路面疊在一起。
    { const RE = GRID.ROADE, rects = GRID.cells.map(c => [c.x - RE, c.x + GRID.BW + RE, c.z - RE, c.z + GRID.BD + RE]);
      if (BASIN) { const c = BASIN.cell; rects.push([c.x + 11, c.x + GRID.BW + RE, c.z - RE, c.z + GRID.BD + RE]); }
      const uniq = a => [...new Set(a.map(v => Math.round(v * 1000) / 1000))].sort((p, q) => p - q);
      const xs = uniq(rects.flatMap(r => [r[0], r[1]])), zs = uniq(rects.flatMap(r => [r[2], r[3]]));
      const NX = xs.length - 1, NZ = zs.length - 1, cov = new Uint8Array(NX * NZ);
      for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
        const mx = (xs[i] + xs[i + 1]) / 2, mz = (zs[j] + zs[j + 1]) / 2;
        if (rects.some(r => mx > r[0] && mx < r[1] && mz > r[2] && mz < r[3])) cov[j * NX + i] = 1;
      }
      const at = (i, j) => i >= 0 && j >= 0 && i < NX && j < NZ && cov[j * NX + i];
      for (let j = 0; j < NZ; j++) for (let i = 0; i < NX;) {
        if (!at(i, j)) { i++; continue; }
        let k = i; while (at(k + 1, j)) k++;
        Bg.quad([xs[i], zs[j + 1]], [xs[k + 1], zs[j + 1]], [xs[k + 1], zs[j]], [xs[i], zs[j]], 0.02, 0x8A8C92);
        i = k + 1;
      }
      // 路緣：沿著路網外緣，同一條線上相連的段合併成一條
      const runs = new Map(), push = (key, a0, a1) => { let L = runs.get(key); if (!L) runs.set(key, L = []); L.push([a0, a1]); };
      for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
        if (!at(i, j)) continue;
        if (!at(i - 1, j)) push("x|" + xs[i] + "|1", zs[j], zs[j + 1]);
        if (!at(i + 1, j)) push("x|" + xs[i + 1] + "|-1", zs[j], zs[j + 1]);
        if (!at(i, j - 1)) push("z|" + zs[j] + "|1", xs[i], xs[i + 1]);
        if (!at(i, j + 1)) push("z|" + zs[j + 1] + "|-1", xs[i], xs[i + 1]);
      }
      for (const [key, L] of runs) {
        const [ax, v, sg] = key.split("|"), c = +v, inw = +sg * 0.15;
        L.sort((p, q) => p[0] - q[0]);
        const merged = []; for (const seg of L) { const m = merged[merged.length - 1]; if (m && seg[0] <= m[1] + 1e-3) m[1] = Math.max(m[1], seg[1]); else merged.push(seg.slice()); }
        for (const [a0, a1] of merged) {
          if (ax === "x") B.box(0.3, 0.12, a1 - a0, c + inw, 0.0, (a0 + a1) / 2, 0, 0xB8AC98, true);
          else B.box(a1 - a0, 0.12, 0.3, (a0 + a1) / 2, 0.0, c + inw, 0, 0xB8AC98, true);
        }
      } }
    // ── 岸線重新取樣成短段 ──
    const segs = [];
    for (let k = 0; k < pts.length; k++) {
      const [ax, az] = pts[k], [bx, bz] = pts[(k + 1) % pts.length], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / 1.6));
      for (let q = 0; q < n; q++) { const t0 = q / n, t1 = (q + 1) / n; segs.push([ax + (bx - ax) * t0, az + (bz - az) * t0, ax + (bx - ax) * t1, az + (bz - az) * t1]); }
    }
    const harb = GRID.cells.filter(c => c.kind === "harbor");
    const dockAt = (x, z) => (BASIN && z > BASIN.z0 - 8 && z < BASIN.z1 + 8 && x < BASIN.x1 + 10) || harb.some(c => z > c.z - 4 && z < c.z + GRID.BD + 4 && x < c.x + 2);
    const piers = [], features = [];   // 棧橋、橋頭：那裡不放欄杆
    let acc = 0, lampAcc = 4, postAcc = 0;
    const STONE = [0x8E8676, 0x968E7E, 0x857D6E], COP = 0xC8BEA8, PROM = [0xCFC3AC, 0xC4B8A0];
    const PW = 4.4;   // 濱海步道寬
    for (const [ax, az, bx, bz] of segs) {
      const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz); if (L < 0.01) continue;
      const nx = dz / L, nz = -dx / L, ry = Math.atan2(dx, dz), mx = (ax + bx) / 2, mz = (az + bz) / 2;
      const inTown = true, dock = dockAt(mx, mz);
      // 岸壁：石塊牆＋壓頂
      const sc = STONE[Math.floor(hs2(mx, mz) * 3)];
      B.box(0.6, 1.0, L + 0.04, mx + nx * 0.3, -0.85, mz + nz * 0.3, ry, sc, true);
      if (hs2(mz, mx) < 0.25) B.box(0.62, 0.12, L * 0.6, mx + nx * 0.28, -0.42, mz + nz * 0.28, ry, 0x4E6A50, true);   // 水線上的青苔
      if (!inTown) {
        // 城外：岸邊是草坡和石頭
        if (hs2(mx * 3, mz) < 0.35) B.box(0.7 + hs2(mx, 1) * 0.8, 0.3 + hs2(mx, 2) * 0.4, 0.8, mx - nx * (0.4 + hs2(mx, 3)), -0.5, mz - nz * (0.4 + hs2(mx, 3)), ry + hs2(mx, 4), 0x7A766C, true);
        continue;
      }
      // 濱海步道（方磚，兩色交錯）
      const p0 = [ax + nx * 0.6, az + nz * 0.6], p1 = [bx + nx * 0.6, bz + nz * 0.6], p2 = [bx + nx * PW, bz + nz * PW], p3 = [ax + nx * PW, az + nz * PW];
      Bg.quad(p0, p3, p2, p1, 0.06, PROM[Math.floor(acc / 1.6) % 2]);
      Bg.quad([p3[0] - nx * 0.25, p3[1] - nz * 0.25], [p3[0], p3[1]], [p2[0], p2[1]], [p2[0] - nx * 0.25, p2[1] - nz * 0.25], 0.075, 0xA89C88);
      acc += L;
      // 路燈（步道內側）
      lampAcc += L;
      if (lampAcc > 9) {
        lampAcc = 0; const lx = mx + nx * (PW - 0.6), lz = mz + nz * (PW - 0.6), gas = mx < -40;
        B.box(0.36, 0.12, 0.36, lx, 0.06, lz, ry, 0x2E3238); B.box(0.1, 2.7, 0.1, lx, 0.18, lz, ry, gas ? 0x2E2A26 : 0x3A3E46);
        B.box(0.5, 0.06, 0.08, lx - nx * 0.18, 2.75, lz - nz * 0.18, ry + Math.PI / 2, 0x3A3E46);
        const bulb = new T.Mesh(new T.BoxGeometry(0.24, 0.3, 0.24), lampMat); bulb.position.set(lx - nx * 0.38, 2.52, lz - nz * 0.38); bulb.userData.noVox = true; root.add(bulb);
        B.box(0.32, 0.07, 0.32, lx - nx * 0.38, 2.83, lz - nz * 0.38, ry, 0x2E3238);
        lampSpots.push([lx - nx * 0.5, lz - nz * 0.5, 0xFFC878]);
      }
      // 步道上偶爾一張長椅（面海）或花箱
      if (!dock && hs2(mx * 7, mz) < 0.06) { const bx2 = mx + nx * 2.2, bz2 = mz + nz * 2.2; B.box(1.2, 0.07, 0.42, bx2, 0.44, bz2, ry + Math.PI / 2, 0x9A6A40); B.box(1.2, 0.34, 0.07, bx2 + nx * 0.2, 0.5, bz2 + nz * 0.2, ry + Math.PI / 2, 0x9A6A40); for (const s of [-0.5, 0.5]) B.box(0.07, 0.38, 0.36, bx2 + dz / L * s, 0.06, bz2 - dx / L * s, ry, 0x2E3238); }
      else if (!dock && hs2(mz * 5, mx) < 0.05) { const fx = mx + nx * 3.4, fz = mz + nz * 3.4; B.box(1.1, 0.4, 0.5, fx, 0.06, fz, ry + Math.PI / 2, 0xA8907A); for (let q = 0; q < 4; q++) B.box(0.2, 0.2, 0.2, fx + (dz / L) * (-0.36 + q * 0.24), 0.46, fz - (dx / L) * (-0.36 + q * 0.24), ry, [0xF07A9A, 0xF4D35E, 0x6A9E50, 0xC88EE8][q]); }
    }
    // 步道和馬路之間：草地＋行道樹（岸線往外凸的地方比較寬）
    { let acc2 = 0;
      for (const [ax, az, bx, bz] of segs) {
        const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz); acc2 += L; if (acc2 < 3.1) continue; acc2 = 0;
        const nx = dz / L, nz = -dx / L; let g = PW + 0.6; while (g < 16 && !GRID.onRoad(ax + nx * g, az + nz * g)) g += 0.5;
        const gap = g - PW - 0.5; if (gap < 1.6 || g >= 16) continue;
        const o = PW + 0.3 + gap / 2 + (hs2(ax, az) - 0.5) * (gap - 1.4);
        if (hs2(az, ax) < 0.6) tree(root, ax + nx * o, az + nz * o, 0.8 + hs2(ax, 9) * 0.3, hs2(az, 11) < 0.25 ? "pine" : [0x6E9E5A, 0x7AAE5A, 0x5E8E4A][Math.floor(hs2(ax, 5) * 3)]);
      } }
    // ── 港池：三面岸壁已經跟著岸線蓋了；這裡放船、起重機、魚市攤 ──
    if (BASIN) {
      const { x0, x1, z0, z1 } = BASIN;
      boat(x1 - 4, z0 + 2.6, Math.PI / 2, 4.2, 0xC8402A, true); boat(x1 - 9, z1 - 2.4, -Math.PI / 2, 5, 0x3A6ABA, true); boat(x0 + 6, (z0 + z1) / 2 + 1, Math.PI / 2 + 0.1, 3.4, 0xF4F0E4, true);
      crane(x1 + 2.2, z0 - 2.6, 0); 
      for (let q = 0; q < 3; q++) stall(x1 + 1.8, z1 + 1.6 + q * 0, q, 0);
      features.push([x1 + 2, z0 - 2.6, 3]);
    }
    // 岸線上找位置：分數最高、而且朝外的方向差不多對的那一點；回傳點、往外的方向
    const spot = (score, dir) => {
      let best = null, bs = -1e9;
      for (const [ax, az, bx, bz] of segs) {
        const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz); if (L < 0.01) continue;
        const ox = -dz / L, oz = dx / L; if (dir && ox * dir[0] + oz * dir[1] < 0.85) continue;
        if (BASIN && ax > BASIN.x0 - 6 && ax < BASIN.x1 + 6 && az > BASIN.z0 - 8 && az < BASIN.z1 + 8) continue;
        const sc = score(ax, az); if (sc > bs) { bs = sc; best = { x: (ax + bx) / 2, z: (az + bz) / 2, ox, oz }; }
      }
      return best;
    };
    // ── 棧橋（木頭）：西岸兩座，旁邊停小船 ──
    for (const zt of [GRID.rowZ[1] + 10, GRID.rowZ[3] + 4]) { const p = spot((x, z) => -Math.abs(z - zt) * 3 - x * 0.1, [-1, 0]); if (p) jetty(p.x, p.z, 11 + hs2(zt, 1) * 4, Math.atan2(p.ox, p.oz)); }
    // ── 防波堤＋燈塔：島的西南角 ──
    { const p = spot((x, z) => -x * 0.6 + z, [-0.7, 0.7]) || spot((x, z) => -x * 0.6 + z); if (p) { const a = Math.atan2(p.oz, p.ox) + 0.35; breakwater(p.x, p.z, Math.cos(a), Math.sin(a), 26); } }
    // ── 離島＋石拱橋：島的西北角 ──
    { const p = spot((x, z) => -x * 0.6 - z, [-1, 0]) || spot((x, z) => -x * 0.6 - z); const IR = 8.5;
      if (p) { const xI = p.x + p.ox * 30, zI = p.z + p.oz * 30; isle(xI, zI, IR, 1);
        const I = COAST.isle; let e = IR; while (e > 2 && I.rrAt(-p.ox * e, -p.oz * e) > 0.86) e -= 0.2; archBridge(p.x - p.ox * 0.2, p.z - p.oz * 0.2, xI - p.ox * e, zI - p.oz * e); } }
    // ── 鐵路橋：從轉運站那條大道往東，高架跨過城、再跨海到遠方的大陸 ──
    railBridge();
    // 遠處海上幾座小島的剪影（西邊外海）
    for (let q = 0; q < 5; q++) { const a = Math.PI * (0.62 + q * 0.19), r = 175 + q * 22; isle(GRID.cx + Math.cos(a) * r, GRID.cz + Math.sin(a) * r, 10 + q * 3, 0); }
    // 海上的帆船（慢慢漂）
    for (let q = 0; q < 5; q++) { const a = Math.PI * (0.7 + q * 0.17), r = 140 + q * 8; boat(GRID.cx + Math.cos(a) * r, GRID.cz + Math.sin(a) * r, q * 1.3, 3.6 + q * 0.4, [0xF4F0E4, 0xC8402A, 0x3A6ABA, 0xE8B83A, 0xF4F0E4][q], false, true); }
    railings();
    B.mesh(); Bg.mesh(null, false);
    // 岸邊的白浪
    const fp = [];
    for (const [ax, az, bx, bz] of segs) { const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz); if (L < 0.01) continue; const nx = dz / L, nz = -dx / L; const o0 = -0.05, o1 = -0.7 - hs2(ax, az) * 0.5; fp.push(ax + nx * o0, -0.4, az + nz * o0, ax + nx * o1, -0.4, az + nz * o1, bx + nx * o1, -0.4, bz + nz * o1, ax + nx * o0, -0.4, az + nz * o0, bx + nx * o1, -0.4, bz + nz * o1, bx + nx * o0, -0.4, bz + nz * o0); }
    const fg = new T.BufferGeometry(); fg.setAttribute("position", new T.Float32BufferAttribute(fp, 3));
    COAST.foam = new T.Mesh(fg, new T.MeshBasicMaterial({ color: 0xE8F4F8, transparent: true, opacity: 0.35, depthWrite: false, side: T.DoubleSide })); COAST.foam.userData.noVox = true; root.add(COAST.foam);

    /* 壓頂石和欄杆：沿著岸線往內平移的折線一段接一段蓋（轉角用斜接，不會錯開或高低不一）；
     * 橋頭、棧橋、防波堤那裡斷開並補一根端柱；碼頭那段改成繫船柱。要在那些東西都擺好之後才蓋。 */
    function railings() {
      const n = segs.length, V = segs.map(q => [q[0], q[1]]);
      const nrm = i => { const [ax, az, bx, bz] = segs[i], L = Math.hypot(bx - ax, bz - az) || 1; return [(bz - az) / L, -(bx - ax) / L]; };
      const off = (i, d) => { const a = nrm((i - 1 + n) % n), b = nrm(i % n); let mx = a[0] + b[0], mz = a[1] + b[1]; const l = Math.hypot(mx, mz) || 1; mx /= l; mz /= l; const c = Math.max(0.6, mx * b[0] + mz * b[1]); const v = V[i % n]; return [v[0] + mx * d / c, v[1] + mz * d / c]; };
      const seg = (p, q, w, h, y, c) => { const dx = q[0] - p[0], dz = q[1] - p[1], L = Math.hypot(dx, dz); if (L < 0.005) return; B.box(w, h, L + 0.03, (p[0] + q[0]) / 2, y, (p[1] + q[1]) / 2, Math.atan2(dx, dz), c, true); };
      const post = p => { B.box(0.08, 0.84, 0.08, p[0], 0.14, p[1], 0, 0x2E3238); B.box(0.12, 0.08, 0.12, p[0], 0.98, p[1], 0, 0x4A4E56); };
      let pa = 0, ba = 0, was = false;
      for (let i = 0; i < n; i++) {
        seg(off(i, 0.33), off(i + 1, 0.33), 0.78, 0.12, 0.02, COP);
        const p = off(i, 0.55), q = off(i + 1, 0.55), mx = (p[0] + q[0]) / 2, mz = (p[1] + q[1]) / 2, L = Math.hypot(q[0] - p[0], q[1] - p[1]);
        const skip = features.some(f => Math.hypot(f[0] - mx, f[1] - mz) < f[2] + 0.4);
        if (skip || dockAt(mx, mz)) {
          if (was) post(p); was = false;
          if (!skip) { ba += L; if (ba > 4.5) { ba = 0; B.box(0.24, 0.32, 0.24, mx, 0.14, mz, 0, 0x2E3238); B.box(0.32, 0.07, 0.32, mx, 0.46, mz, 0, 0x3A3E46); } }
          continue;
        }
        if (!was) { post(p); pa = 0; } was = true;
        seg(p, q, 0.06, 0.06, 0.95, 0x2E3238); seg(p, q, 0.04, 0.04, 0.58, 0x2E3238);
        pa += L; if (pa > 1.5) { pa = 0; post(q); }
      }
    }
    /* ── 小工具 ── */
    function boat(x, z, ry, len, c, moored, sail) {
      const g = new T.Group(); g.position.set(x, -0.42, z); g.rotation.y = ry; root.add(g);
      const b = Batch(), w = len * 0.36;
      for (let q = 0; q < 4; q++) { const k = q / 3, wl = w * (1 - k * 0.3), ll = len * (1 - k * 0.12) - (q === 3 ? 0 : 0); b.box(wl * (q === 0 ? 0.7 : 1), 0.16, ll * (q === 0 ? 0.8 : 1), 0, -0.2 + q * 0.16, 0, 0, q === 3 ? 0xF4F0E4 : c); }
      b.box(w * 0.8, 0.06, len * 0.86, 0, 0.44, 0, 0, 0xA8845A);
      if (sail) { b.box(0.08, len * 1.1, 0.08, 0, 0.44, len * 0.05, 0, 0x6A4A30); b.box(0.04, len * 0.85, len * 0.5, 0.02, 0.7, -len * 0.22, 0, 0xF8F4EC); }
      else { b.box(w * 0.7, 0.55, len * 0.32, 0, 0.5, -len * 0.18, 0, 0xF4F0E4); b.box(w * 0.74, 0.06, len * 0.36, 0, 1.05, -len * 0.18, 0, c); b.box(w * 0.6, 0.2, 0.04, 0, 0.75, -len * 0.01, 0, 0x5A7A9A); if (moored) b.box(0.05, 0.9, 0.05, 0, 0.5, len * 0.3, 0, 0x6A4A30); }
      const m = b.mesh(); if (m) { root.remove(m); m.matrixAutoUpdate = true; g.add(m); }
      COAST.boats.push({ g, base: g.position.clone(), ph: hs2(x, z) * 6, drift: sail ? 0.25 + hs2(z, x) * 0.2 : 0, ry });
    }
    function crane(x, z, ry) {
      const c = 0xD8682A;
      for (const [a, b] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) B.box(0.18, 4.4, 0.18, x + a, 0.06, z + b, ry, c);
      B.box(2.0, 0.3, 2.0, x, 4.4, z, ry, c); B.box(1.1, 0.9, 1.1, x + 0.3, 4.7, z, ry, 0xE8E4DC); B.box(0.5, 0.35, 0.04, x + 0.3, 5.0, z + 0.57, ry, 0x5A7A9A);
      B.box(7.5, 0.28, 0.4, x - 3.2, 5.0, z, ry, c); B.box(1.6, 0.6, 0.6, x + 1.6, 4.8, z, ry, 0x5A5E66);
      B.box(0.03, 2.6, 0.03, x - 6.4, 2.4, z, ry, 0x2A2A2A); B.box(0.3, 0.2, 0.3, x - 6.4, 2.25, z, ry, 0xE8B83A);
      for (let y = 0.6; y < 4.2; y += 0.9) for (const b2 of [-0.9, 0.9]) B.box(1.8, 0.07, 0.07, x, y, z + b2, ry, c);
    }
    function stall(x, z, q, ry) {
      const cs = [0xE8403A, 0x3A8ABA, 0xF4A040][q % 3], sx = x + q * 0, sz = z + q * 2.3;
      B.box(1.8, 0.75, 1.0, sx + 0.8, 0.06, sz, ry, 0x8A6440); for (let i = 0; i < 4; i++) B.box(0.34, 0.12, 0.34, sx + 0.2 + i * 0.4, 0.81, sz, ry, [0xC8D8E8, 0xE89A8A, 0xD8C8A8, 0xA8C8D8][(i + q) % 4]);
      for (const a of [0, 1.7]) B.box(0.07, 1.9, 0.07, sx + a, 0.06, sz - 0.6, ry, 0x6A4A30);
      for (let i = 0; i < 5; i++) B.box(0.38, 0.06, 1.5, sx + 0.08 + i * 0.38, 1.9 - i * 0, sz - 0.2, ry, i % 2 ? 0xF4F0E4 : cs);
      if (q === 0) features.push([sx, sz, 2]);
    }
    function jetty(x0, z0, len, ry) {
      // 沿著 ry 方向往海裡伸（ry：繞 y 的角度，0 是 +z）；用區域座標 (u 往外, v 橫向) 換成世界座標
      features.push([x0, z0, 1.6]);
      const W = 1.6, ux = Math.sin(ry), uz = Math.cos(ry), at = (u, v) => [x0 + ux * u + uz * v, z0 + uz * u - ux * v];
      for (let s = 0; s < len; s += 0.36) { const [x, z] = at(0.3 + s, 0); B.box(W, 0.1, 0.32, x, 0.12, z, ry, (Math.floor(s / 0.36) % 3) ? 0x9A7450 : 0x8A6440); }
      for (let s = 1; s < len; s += 2.2) for (const o of [-W / 2, W / 2]) { const [x, z] = at(0.3 + s, o); B.box(0.2, 1.6, 0.2, x, -1.3, z, ry, 0x5A4A3A); B.box(0.22, 0.12, 0.22, x, 0.3, z, ry, 0x6A5444); }
      for (let s = 0.5; s < len; s += 1.1) { const [x, z] = at(0.3 + s, -W / 2 + 0.05); B.box(0.06, 0.55, 0.06, x, 0.22, z, ry, 0x6A5444); }
      { const [x, z] = at(0.3 + len / 2, -W / 2 + 0.05); B.box(0.06, 0.05, len, x, 0.72, z, ry, 0x6A5444); }
      { const [x, z] = at(len - 0.2, W / 2 - 0.1); B.box(0.1, 1.6, 0.1, x, 0.22, z, ry, 0x2E3238); const L = new T.Mesh(new T.BoxGeometry(0.2, 0.24, 0.2), lampMat); L.position.set(x, 1.9, z); L.userData.noVox = true; root.add(L); }
      { const [x, z] = at(len * 0.55, 1.9); boat(x, z, ry + Math.PI - 0.05, 3.2 + hs2(x0, z0), [0x3A6ABA, 0xE8B83A, 0x4A8A5A][Math.floor(hs2(z0, 2) * 3)], true); }
      if (hs2(z0, 4) < 0.6) { const [x, z] = at(len * 0.3, -1.8); boat(x, z, ry + 0.08, 2.8, 0xF4F0E4, true); }
    }
    function breakwater(x, z, ux, uz, len) {
      const ry = Math.atan2(ux, uz);
      features.push([x, z, 2.2]);
      for (let s = 0; s < len; s += 1.2) {
        const px = x + ux * s, pz = z + uz * s;
        B.box(2.4, 1.4, 1.3, px, -1.1, pz, ry, STONE[Math.floor(hs2(s, 1) * 3)], true); B.box(2.6, 0.12, 1.3, px, 0.3, pz, ry, COP, true);
        for (const sd of [-1, 1]) if (hs2(s, sd) < 0.8) { const o = 1.5 + hs2(s, sd + 3) * 0.6; B.box(0.8, 0.7, 0.8, px + uz * sd * o, -0.75, pz - ux * sd * o, ry + hs2(s, 9), 0x8A8478, true); }
      }
      // 燈塔
      const lx = x + ux * (len + 0.6), lz = z + uz * (len + 0.6);
      B.box(4.2, 1.6, 4.2, lx, -1.2, lz, ry, 0x8A8274, true); B.box(4.4, 0.15, 4.4, lx, 0.4, lz, ry, COP);
      const tiers = 9;
      for (let q = 0; q < tiers; q++) { const w = 2.3 - q * 0.1; B.box(w, 0.9, w, lx, 0.55 + q * 0.9, lz, ry, q % 2 ? 0xC8382A : 0xF4F0EC); }
      const top = 0.55 + tiers * 0.9;
      B.box(2.4, 0.15, 2.4, lx, top, lz, ry, 0x2E3238);
      for (const [a, b] of [[-1.1, -1.1], [1.1, -1.1], [-1.1, 1.1], [1.1, 1.1]]) B.box(0.06, 0.6, 0.06, lx + a, top + 0.15, lz + b, ry, 0x2E3238);
      B.box(2.3, 0.05, 0.05, lx, top + 0.72, lz - 1.1, ry, 0x2E3238); B.box(2.3, 0.05, 0.05, lx, top + 0.72, lz + 1.1, ry, 0x2E3238);
      const lan = new T.Mesh(new T.BoxGeometry(1.1, 1.0, 1.1), new T.MeshBasicMaterial({ color: 0xFFF0B0 })); lan.position.set(lx, top + 0.65, lz); lan.userData.noVox = true; root.add(lan); COAST.beamGlow = lan;
      for (const [a, b] of [[-0.55, -0.55], [0.55, -0.55], [-0.55, 0.55], [0.55, 0.55]]) B.box(0.08, 1.0, 0.08, lx + a, top + 0.15, lz + b, ry, 0x2E3238);
      B.box(1.4, 0.2, 1.4, lx, top + 1.15, lz, ry, 0xC8382A); B.box(0.9, 0.25, 0.9, lx, top + 1.35, lz, ry, 0xC8382A); B.box(0.4, 0.3, 0.4, lx, top + 1.6, lz, ry, 0xC8382A);
      B.box(0.6, 1.0, 0.06, lx + ux * 1.18, 0.55, lz + uz * 1.18, ry, 0x4A3020);
      // 光束（晚上才看得到），轉圈
      const bg = new T.ConeGeometry(2.4, 40, 12, 1, true); bg.translate(0, -20, 0); bg.rotateZ(Math.PI / 2);
      const beam = new T.Mesh(bg, new T.MeshBasicMaterial({ color: 0xFFF2C0, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide, fog: false }));
      beam.position.set(lx, top + 0.65, lz); beam.userData.noVox = true; root.add(beam); COAST.beam = beam;
      lampSpots.push([lx, lz, 0xFFE0A0]);
    }
    function isle(x, z, R, detail) {
      const b = detail ? B : Batch(), S = detail ? 0.85 : 2.2, sd = Math.round(x * 13 + z * 7);
      const rrAt = (a, c) => Math.hypot(a, c) / (R * (0.82 + 0.18 * Math.sin(Math.atan2(c, a) * 3 + sd))), topAt = rr => 0.3 + 1.7 * Math.pow(Math.max(0, 1 - rr * rr), 0.8);
      if (detail) COAST.isle = { x, z, R, rrAt, topAt };
      for (let a = -R - 2; a <= R + 2; a += S) for (let c = -R - 2; c <= R + 2; c += S) {
        const rr = rrAt(a, c);
        if (rr > 1) continue;
        const hgt = detail ? topAt(rr) + hs2(a + sd, c) * 0.12 : 0.4 + 5 * Math.pow(1 - rr * rr, 0.8) + hs2(a + sd, c) * 1.2;
        const top = rr > 0.86 ? 0x8A8478 : rr > 0.78 ? 0xD8C89A : 0x6E9A4A;
        b.box(S, hgt + 1.4 - 0.15, S, x + a, -1.4, z + c, 0, rr > 0.78 ? 0x7A766C : 0x6A6458, true);
        b.box(S, 0.15, S, x + a, hgt - 0.15, z + c, 0, top);
      }
      if (!detail) { const m = b.mesh(null, false); return; }
      // 島上：觀星亭（六根柱子、階梯頂、中間一顆魔導水晶）、幾棵樹、石燈籠
      const hy = topAt(0.1) + 0.05, gx = x - 1, gz = z;
      B.box(4.2, 0.3, 4.2, gx, hy - 0.1, gz, 0, 0xC8BEA8); B.box(3.6, 0.2, 3.6, gx, hy + 0.2, gz, 0, 0xD8CEB8);
      for (let q = 0; q < 6; q++) { const t = q / 6 * Math.PI * 2; B.box(0.22, 2.2, 0.22, gx + Math.cos(t) * 1.5, hy + 0.4, gz + Math.sin(t) * 1.5, -t, 0xF4F0EC); }
      for (let q = 0; q < 4; q++) B.box(3.8 - q * 0.9, 0.3, 3.8 - q * 0.9, gx, hy + 2.6 + q * 0.3, gz, 0, q % 2 ? 0x3A6A8A : 0x4A7A9A);
      B.box(0.2, 0.5, 0.2, gx, hy + 3.8, gz, 0, 0xD8A840);
      const cr = new T.Mesh(new T.OctahedronGeometry(0.42, 0), new T.MeshBasicMaterial({ color: 0x9AE8FF })); cr.position.set(gx, hy + 1.5, gz); cr.userData.noVox = true; cr.userData.spin = 1; root.add(cr); COAST.lights.push(cr);
      lampSpots.push([gx, gz, 0x9AE8FF]);
      for (const [a, c, s] of [[4.5, 3, 1.1], [-3.5, 4.8, 0.9], [2, -5, 1.0], [-5, -2, 0.8]]) tree(root, x + a, z + c, s, s < 0.9 ? "pine" : 0x5E8E4A);
    }
    function archBridge(xa, za, xb, zb) {
      // 石拱橋：橋墩有分水尖、三到四個拱、橋面微微拱起、欄杆柱頭、每個橋墩上一盞燈
      const L = Math.hypot(xb - xa, zb - za), ux = (xb - xa) / L, uz = (zb - za) / L, ry = Math.atan2(ux, uz), px = uz, pz = -ux;
      features.push([xa, za, 2.6]);
      const I = COAST.isle, hEnd = I ? I.topAt(I.rrAt(xb - I.x, zb - I.z)) : 0.2;
      const W = 2.6, n = Math.max(3, Math.round(L / 6.5)), span = L / n, deck = s => 0.18 + (hEnd - 0.18) * (s / L) + 0.85 * Math.pow(Math.sin(Math.PI * s / L), 0.7);
      COAST.bridge = { xa, za, ux, uz, L, W, deck };
      const ST = [0xB8AE9C, 0xAEA492, 0xC2B8A6];
      for (let s = 0; s <= L; s += 0.3) {
        const X = xa + ux * s, Z = za + uz * s, k = s / span, f = k - Math.floor(k), y = deck(s);
        const pier = f < 0.12 || f > 0.88;
        const arch = pier ? -1.4 : -0.3 + 1.1 * Math.sin(Math.PI * (f - 0.12) / 0.76);
        const yb = Math.min(arch, y - 0.35);
        B.box(W, y - yb, 0.32, X, yb, Z, ry, ST[Math.floor(hs2(s, 3) * 3)]);
        B.box(W + 0.2, 0.08, 0.32, X, y, Z, ry, 0xD8CEB8);
        // 欄杆：矮石牆＋柱頭
        for (const sd of [-1, 1]) { B.box(0.22, 0.5, 0.32, X + px * sd * (W / 2 - 0.05), y + 0.08, Z + pz * sd * (W / 2 - 0.05), ry, 0xC8BEA8); if (Math.floor(s / 0.3) % 6 === 0) B.box(0.3, 0.72, 0.3, X + px * sd * (W / 2 - 0.05), y + 0.08, Z + pz * sd * (W / 2 - 0.05), ry, 0xD8CEB8); }
        // 拱圈邊的石頭線
        if (!pier) for (const sd of [-1, 1]) B.box(0.06, 0.18, 0.32, X + px * sd * (W / 2 + 0.03), arch - 0.05, Z + pz * sd * (W / 2 + 0.03), ry, 0x9A907E);
      }
      for (let q = 1; q < n; q++) {
        const s = q * span, X = xa + ux * s, Z = za + uz * s;
        // 分水尖
        for (const sd of [-1, 1]) { B.box(1.0, 1.7, 1.0, X + px * sd * (W / 2 + 0.4), -1.4, Z + pz * sd * (W / 2 + 0.4), ry + Math.PI / 4, 0xA89E8C); B.box(0.8, 0.12, 0.8, X + px * sd * (W / 2 + 0.4), 0.3, Z + pz * sd * (W / 2 + 0.4), ry + Math.PI / 4, 0xC8BEA8); }
        // 燈柱
        const y = deck(s);
        for (const sd of [-1, 1]) {
          const lx = X + px * sd * (W / 2 - 0.05), lz = Z + pz * sd * (W / 2 - 0.05);
          B.box(0.14, 2.1, 0.14, lx, y + 0.8, lz, ry, 0x2E3238); B.box(0.3, 0.06, 0.3, lx, y + 2.9, lz, ry, 0x2E3238);
          const bl = new T.Mesh(new T.BoxGeometry(0.26, 0.32, 0.26), lampMat); bl.position.set(lx, y + 3.1, lz); bl.userData.noVox = true; root.add(bl);
          B.box(0.34, 0.08, 0.34, lx, y + 3.26, lz, ry, 0x2E3238);
        }
        lampSpots.push([X, Z, 0xFFC878]);
      }
      // 橋頭：兩邊各一對石柱
      for (const [X, Z] of [[xa, za], [xb, zb]]) for (const sd of [-1, 1]) { B.box(0.5, 1.4, 0.5, X + px * sd * (W / 2 + 0.1), 0.1, Z + pz * sd * (W / 2 + 0.1), ry, 0xC8BEA8); B.box(0.62, 0.12, 0.62, X + px * sd * (W / 2 + 0.1), 1.5, Z + pz * sd * (W / 2 + 0.1), ry, 0xD8CEB8); B.box(0.3, 0.3, 0.3, X + px * sd * (W / 2 + 0.1), 1.62, Z + pz * sd * (W / 2 + 0.1), ry, 0xD8A840); }
    }
  }
  /* 鐵路橋：轉運站旁的大道上方起站（樓梯塔、車擋），一路高架往東跨過城、跨海，鑽進遠方大陸的山洞。
   * 磚石拱的高架橋、兩條鐵軌、每隔一段一根電車線桿（頂上一顆魔導水晶），海上那段橋墩比較高。一列三節的列車來回跑。 */
  function railBridge() {
    const st = N.locations.find(l => /轉運站/.test(l.id)), sp = st && lots[st.id];
    const z = GRID.rowZ[0] - GRID.AW / 2, xs = sp ? sp.x - 4 : GRID.colX[2], xe = GRID.cx + GRID.RC + 132, Y = 6.2, B = Batch();
    COAST.railPiers = [];
    const ST = [0xA8644C, 0x9A5A44, 0xB0705A], CAP = 0xD8CEB8;
    let span = 7, s = 0;
    for (let x = xs; x < xe; x += 0.35) {
      const sea = GRID.seaAt(x, z), k = (x - xs) / span, f = k - Math.floor(k), pier = f < 0.12 || f > 0.88;
      const bottom = sea ? -1.6 : 0;
      const arch = pier ? bottom : Y - 2.4 + 1.6 * Math.sin(Math.PI * (f - 0.12) / 0.76);
      if (pier || !sea || true) B.box(0.37, Y - Math.max(bottom, arch) - 0.4, pier ? 1.6 : 2.8, x, Math.max(bottom, arch), z, Math.PI / 2, ST[Math.floor(hs2(x, 2) * 3)], true);
      B.box(0.37, 0.4, 3.2, x, Y - 0.4, z, Math.PI / 2, 0x6A6E74);
      B.box(0.37, 0.08, 3.4, x, Y, z, Math.PI / 2, CAP);
      // 道碴＋鐵軌
      B.box(0.37, 0.1, 2.2, x, Y + 0.08, z, Math.PI / 2, 0x5A5650);
      for (const o of [-0.5, 0.5]) B.box(0.37, 0.09, 0.09, x, Y + 0.18, z + o, Math.PI / 2, 0x8A8E96);
      if (Math.floor((x - xs) / 0.35) % 3 === 0) B.box(0.14, 0.05, 1.5, x, Y + 0.17, z, 0, 0x6A4A30);
      // 兩側的矮欄
      for (const o of [-1.55, 1.55]) B.box(0.37, 0.35, 0.12, x, Y + 0.08, z + o, Math.PI / 2, 0x5A5E66);
      if (pier && Math.abs(f - (f < 0.5 ? 0 : 1)) < 0.02 && !sea) COAST.railPiers.push([x, z]);
    }
    // 電車線桿＋魔導水晶（晚上會亮）
    for (let x = xs + 3; x < xe; x += 14) {
      for (const o of [-1.7, 1.7]) B.box(0.14, 2.6, 0.14, x, Y + 0.1, z + o, 0, 0x3A3E46);
      B.box(0.12, 0.12, 3.6, x, Y + 2.6, z, 0, 0x3A3E46);
      const c = new T.Mesh(new T.OctahedronGeometry(0.16, 0), new T.MeshBasicMaterial({ color: 0x8AE8FF })); c.position.set(x, Y + 2.95, z); c.userData.noVox = true; root.add(c);
      if (!GRID.seaAt(x, z)) lampSpots.push([x, z - 1.5, 0x8AE8FF]);
    }
    B.box(xe - xs, 0.03, 0.03, (xs + xe) / 2, Y + 2.35, z, Math.PI / 2 * 0, 0x2A2A2A);
    // 起站：車擋、月台、樓梯塔
    B.box(0.4, 0.7, 2.0, xs + 0.3, Y + 0.1, z, 0, 0xC8402A); B.box(0.5, 0.15, 2.2, xs + 0.3, Y + 0.8, z, 0, 0xE8B83A);
    B.box(8, 0.3, 1.6, xs + 4.5, Y - 0.2, z + 2.4, 0, 0xB8AE9C); for (const x of [xs + 1.5, xs + 7.5]) B.box(0.14, 2.6, 0.14, x, Y + 0.1, z + 3.0, 0, 0x3A3E46); B.box(8.6, 0.12, 2.2, xs + 4.5, Y + 2.7, z + 2.6, 0, 0x3F6E73);
    for (let q = 0; q < 16; q++) B.box(1.2, 0.18, 0.35, xs + 1 + q * 0.32 * 0, q * (Y / 16), z + 3.6 + q * 0.35 * 0 + 0.0, 0, 0x8A8E96);
    B.box(1.4, Y, 1.4, xs + 1, 0, z + 4.4, 0, 0x9A5A44);
    for (let q = 0; q < 14; q++) B.box(1.0, 0.2, 0.5, xs + 2.3, q * (Y / 14), z + 4.4 - 3 + q * 0.45 * 0 + (q % 2) * 0, 0, 0x8A8E96);
    // 山洞口
    B.box(1.2, Y + 3.6, 6.4, xe, -1.6, z, 0, 0x6A6A64); B.box(1.4, 3.2, 3.6, xe - 0.2, Y, z, 0, 0x1A1A1E);
    B.mesh(null, true);
    // 列車
    const tr = new T.Group(); root.add(tr);
    const tb = Batch(), CAR = 5.2;
    for (let q = 0; q < 3; q++) {
      const cx = -q * (CAR + 0.3);
      tb.box(CAR, 1.6, 2.1, cx, 0.35, 0, Math.PI / 2, q === 0 ? 0x3F6E73 : 0xE8E0CC);
      tb.box(CAR, 0.3, 2.14, cx, 0.35, 0, Math.PI / 2, 0x2E4A50);
      tb.box(CAR + 0.05, 0.12, 2.2, cx, 1.95, 0, Math.PI / 2, 0x5A5E66);
      for (const w of [-1, 1]) tb.box(0.25, 0.25, 0.25, cx + w * 1.8, 0.1, 0.8, 0, 0x1E1E22), tb.box(0.25, 0.25, 0.25, cx + w * 1.8, 0.1, -0.8, 0, 0x1E1E22);
    }
    tb.box(0.3, 0.9, 1.6, CAR / 2 + 0.1, 0.6, 0, 0, 0x2E3238);
    const tm = tb.mesh(); root.remove(tm); tm.matrixAutoUpdate = true; tr.add(tm);
    const wm = new T.MeshBasicMaterial({ color: 0xFFE8B0 });
    for (let q = 0; q < 3; q++) for (const sd of [-1, 1]) { const w = new T.Mesh(new T.BoxGeometry(CAR - 1.0, 0.45, 0.04), wm); w.position.set(-q * (CAR + 0.3), 1.25, sd * 1.07); w.userData.noVox = true; tr.add(w); }
    const head = new T.Mesh(new T.BoxGeometry(0.06, 0.25, 0.5), new T.MeshBasicMaterial({ color: 0xFFF6D0 })); head.position.set(CAR / 2 + 0.03, 0.8, 0); tr.add(head);
    COAST.train = { g: tr, xs: xs + 3 + CAR / 2, xe: xe + 8, z, y: Y + 0.22, wm };
  }
  // 走在橋上、島上的高度（其他地方都是 0）
  function groundAt(x, z) {
    const Bd = COAST.bridge;
    if (Bd) { const s = (x - Bd.xa) * Bd.ux + (z - Bd.za) * Bd.uz, o = Math.abs(-(x - Bd.xa) * Bd.uz + (z - Bd.za) * Bd.ux); if (s > -0.3 && s < Bd.L + 0.3 && o < Bd.W / 2 + 0.2) return Bd.deck(Math.max(0, Math.min(Bd.L, s))) + 0.08; }
    const I = COAST.isle; if (I) { const rr = I.rrAt(x - I.x, z - I.z); if (rr < 1) return I.topAt(rr); }
    return 0;
  }
  function coastFrame(dt, nf, now) {
    const t = now / 1000;
    if (COAST.foam) COAST.foam.material.opacity = (0.22 + 0.14 * Math.sin(t * 1.3)) * (1 - nf * 0.65);
    if (COAST.sea) { const m = COAST.sea.material; m.emissive.setRGB(0.05 - nf * 0.03, 0.16 - nf * 0.12, 0.23 - nf * 0.15); m.color.setRGB(0.17 - nf * 0.11, 0.42 - nf * 0.3, 0.55 - nf * 0.32); }
    for (const b of COAST.boats) {
      b.g.position.y = b.base.y + Math.sin(t * 1.4 + b.ph) * 0.05;
      b.g.rotation.z = Math.sin(t * 1.1 + b.ph) * 0.03; b.g.rotation.x = Math.sin(t * 0.9 + b.ph * 2) * 0.02;
      if (b.drift) { const k = (t * b.drift + b.ph * 10) % 60 - 30; b.g.position.z = b.base.z + k; }
    }
    if (COAST.beam) { COAST.beam.rotation.y = t * 0.7; COAST.beam.material.opacity = nf * 0.16; COAST.beamGlow.material.color.setRGB(0.8 + nf * 0.2, 0.75 + nf * 0.2, 0.55 + nf * 0.15); }
    for (const c of COAST.lights) c.rotation.y = t * 0.8;
    const R = COAST.train;
    if (R) {
      // 90 秒一趟：在站裡停 18 秒 → 開出去 26 秒 → 山洞裡 20 秒 → 開回來 26 秒
      const c = (t % 90), L = R.xe - R.xs, ease = k => k * k * (3 - 2 * k);
      const x = c < 18 ? R.xs : c < 44 ? R.xs + L * ease((c - 18) / 26) : c < 64 ? R.xe : R.xs + L * (1 - ease((c - 64) / 26));
      R.g.position.set(x, R.y, R.z); R.g.rotation.y = c >= 64 ? Math.PI : 0;
      if (c >= 64) R.g.position.x = x;
      R.wm.color.setRGB(0.55 + nf * 0.45, 0.5 + nf * 0.41, 0.4 + nf * 0.3);
    }
  }
  /* 城外：田（一條一條的作物）、樹叢、零星的農舍，慢慢淡進霧和山裡 */
  function buildOutskirts() {
    const B = Batch(), CROPS = [[0x8AB050, 0x7A9A44], [0xD8C060, 0xC8B050], [0x6A9A3C, 0x5A8A34], [0xB8A060, 0xA89050], [0x9AC060, 0x8AB050]];
    const ok = (x, z, pad) => !GRID.seaAt(x - pad, z) && !GRID.seaAt(x, z) && GRID.rb(x, z) > 1.0 && !GRID.cells.some(c => x > c.x - 6 - pad && x < c.x + GRID.BW + 6 + pad && z > c.z - 6 - pad && z < c.z + GRID.BD + 6 + pad);
    let fields = 0;
    for (let q = 0; q < 400 && fields < 44; q++) {
      const a = q * 2.399 + 0.3, r = 100 + (q % 11) * 8 + hs2(q, 1) * 8, x = GRID.cx + Math.cos(a) * r * 1.05, z = GRID.cz + Math.sin(a) * r;
      const w = 11 + hs2(q, 2) * 12, d = 8 + hs2(q, 3) * 9, ry = a + Math.PI / 2 + (hs2(q, 4) - 0.5) * 0.4;
      if (!ok(x, z, Math.max(w, d) / 2)) continue;
      fields++; const cr = CROPS[q % CROPS.length], n = Math.floor(d / 0.9), cs = Math.cos(ry), sn = Math.sin(ry);
      for (let k = 0; k < n; k++) { const o = -d / 2 + (k + 0.5) * (d / n); B.box(w, 0.1 + (k % 2) * 0.08, d / n * 0.9, x + o * sn, 0.0, z + o * cs, ry, cr[k % 2], true); }
      // 田埂上的樹籬
      for (const sd of [-1, 1]) B.box(w + 0.6, 0.5, 0.4, x + sn * sd * (d / 2 + 0.3), 0, z + cs * sd * (d / 2 + 0.3), ry, 0x4E7A2E, true);
      if (hs2(q, 6) < 0.3) { const hx = x + cs * (w / 2 + 2.2), hz = z - sn * (w / 2 + 2.2); farmhouse(hx, hz, ry); }
    }
    for (let q = 0; q < 280; q++) {
      const a = q * 2.399 + 1.1, r = 96 + hs2(q, 7) * 80, x = GRID.cx + Math.cos(a) * r * 1.05, z = GRID.cz + Math.sin(a) * r;
      if (!ok(x, z, 0.5)) continue;
      const n = 1 + Math.floor(hs2(q, 8) * 3);
      for (let k = 0; k < n; k++) tree(root, x + (hs2(q, k) - 0.5) * 4, z + (hs2(k, q) - 0.5) * 4, 1 + hs2(q, k + 9) * 0.5, hs2(q, k + 3) < 0.4 ? "pine" : [0x6E9E5A, 0x5E8E4A, 0x7AAE5A][k % 3]);
    }
    B.mesh(null, true);
    function farmhouse(x, z, ry) {
      const wc = [0xF4E8D4, 0xE8D8C0, 0xD8C8B4][Math.floor(hs2(x, z) * 3)], rc = [0xA8503A, 0x6A5444, 0x5A7298][Math.floor(hs2(z, x) * 3)];
      B.box(3.2, 1.8, 2.6, x, 0, z, ry, wc);
      for (let q = 0; q < 4; q++) B.box(3.5, 0.3, 2.9 - q * 0.75, x, 1.8 + q * 0.3, z, ry, rc);
      B.box(0.5, 0.9, 0.06, x + Math.sin(ry) * 1.31, 0, z + Math.cos(ry) * 1.31, ry, 0x6A4A30);
      B.box(0.4, 1.2, 0.4, x - Math.cos(ry) * 1.0, 2.0, z + Math.sin(ry) * 1.0, ry, 0x9A6A5A);
    }
  }
  /* 能進去的門：門楣上一塊店名木牌、門兩邊的壁燈、地上的光圈（第一人稱走在街上一眼看得出哪裡能進去；準心對到時木牌會亮一點） */
  const ENTR = {};
  function buildEntrances() {
    for (const l of N.locations) {
      const d = doorOf(l.id), L = lots[l.id]; if (!d || !L || L.plat || /夜市/.test(l.id)) continue;
      const name = l.name || l.id, fs = 44, cv = document.createElement("canvas"), cx = cv.getContext("2d");
      cx.font = `700 ${fs}px ${FONT}`; const tw = Math.ceil(cx.measureText(name).width);
      cv.width = tw + 64; cv.height = fs + 30;
      const wood = L.type === "school" ? "#2E3E5A" : /舊|古|老/.test(name) ? "#3A2416" : "#4A2E1E";
      cx.fillStyle = wood; cx.fillRect(0, 0, cv.width, cv.height);
      cx.strokeStyle = "#D8B060"; cx.lineWidth = 5; cx.strokeRect(5, 5, cv.width - 10, cv.height - 10);
      cx.font = `700 ${fs}px ${FONT}`; cx.fillStyle = "#F4DFA8"; cx.textBaseline = "middle"; cx.fillText(name, 32, cv.height / 2 + 2);
      const tex = new T.CanvasTexture(cv); tex.minFilter = T.LinearFilter; if (T.SRGBColorSpace) tex.colorSpace = T.SRGBColorSpace;
      const h = 0.27, w = Math.min(2.6, h * cv.width / cv.height);
      const pm = new T.MeshBasicMaterial({ map: tex, color: 0xB8B0A0 });
      const g = new T.Group(); g.position.set(d.x, 0, d.z); root.add(g);
      const plaque = new T.Mesh(new T.PlaneGeometry(w, h), pm); plaque.position.set(0, 1.62, 0.13); g.add(plaque);
      box(g, w + 0.06, h + 0.06, 0.05, mat(0x2A1A10), 0, 1.62 - (h + 0.06) / 2, 0.08, false);
      const lm = new T.MeshBasicMaterial({ color: 0x8A7050 });
      for (const sx of [-1, 1]) {
        const bx = sx * Math.max(0.55, Math.min(0.75, w / 2 - 0.05));
        box(g, 0.05, 0.05, 0.16, mat(0x2E3238), bx, 1.32, 0.1, false);
        const b = new T.Mesh(new T.BoxGeometry(0.08, 0.11, 0.08), lm); b.position.set(bx, 1.24, 0.18); g.add(b);
        box(g, 0.1, 0.025, 0.1, mat(0x2E3238), bx, 1.295, 0.18, false);
      }
      lampSpots.unshift([d.x, d.z + 0.6, 0xFFB060]);
      ENTR[l.id] = { pm, lm, glow: 0 };
    }
  }
  function entranceFrame(dt, nf) {
    for (const id in ENTR) {
      const E = ENTR[id], want = FP.on && FP.aimDoor === id ? 1 : 0;
      E.glow += (want - E.glow) * Math.min(1, dt * 6);
      const k = 0.72 + nf * 0.25 + E.glow * 0.35; E.pm.color.setRGB(k, k * 0.97, k * 0.9);
      const lk = 0.45 + nf * 0.55 + E.glow * 0.3; E.lm.color.setRGB(lk, lk * 0.82, lk * 0.5);
    }
  }
  function buildLampPools() {
    const cv = document.createElement("canvas"); cv.width = cv.height = 64;
    const x = cv.getContext("2d"), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, "rgba(255,214,140,1)"); gr.addColorStop(0.45, "rgba(255,190,110,.45)"); gr.addColorStop(1, "rgba(255,170,90,0)");
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    poolMat = new T.MeshBasicMaterial({ map: new T.CanvasTexture(cv), transparent: true, blending: T.AdditiveBlending, depthWrite: false, opacity: 0 });
    const geo = new T.PlaneGeometry(4.2, 4.2);
    // 地上的光圈：太近的燈只放一個（招牌、霓虹、燈籠很多，疊在一起會整片過亮）
    const placed = [];
    for (const [px, pz] of lampSpots) {
      if (placed.some(([qx, qz]) => Math.abs(qx - px) < 2.4 && Math.abs(qz - pz) < 2.4)) continue;
      placed.push([px, pz]);
      const m = new T.Mesh(geo, poolMat); m.rotation.x = -Math.PI / 2; m.position.set(px, 0.19, pz); m.renderOrder = 2; root.add(m);
    }
  }
  function trafficFrame(tt) {
    for (const m of smoke) { const k = (tt * 0.25 + m.userData.smoke * 0.25) % 1; m.position.y = 5.6 + k * 1.8; m.material.opacity = 0.7 * (1 - k); m.scale.setScalar(0.8 + k * 0.9); }
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
    // 路上跑的車（原本路過的鎮民拿掉了）
    buildTraffic();
  }
  /* ═════════ 車流：沿著街道中線開（靠右），每個路口隨機轉彎；避開諾文夜市那段街、海、沒有路的地方 ═════════ */
  const cars = [];
  let roadNet = null;
  function buildTraffic() {
    const X = GRID.xr, Z = GRID.zr;
    const AV = [GRID.colX[0] - GRID.AW / 2, GRID.colX[1] - GRID.AW / 2, GRID.rowZ[0] - GRID.AW / 2, GRID.rowZ[1] - GRID.AW / 2];
    const ns = N.locations.filter(l => /夜市/.test(l.id)).map(l => nightStreet(l));
    const okEdge = (x0, z0, x1, z1) => {
      for (let k = 0; k <= 10; k++) { const x = x0 + (x1 - x0) * k / 10, z = z0 + (z1 - z0) * k / 10; if (!GRID.onRoad(x, z) || GRID.coastDist(x, z) < 3) return false; }
      for (const m of ns) if (x0 === x1 && Math.abs(x0 - m.x) < 2.5 && Math.max(z0, z1) > m.z0 - 2 && Math.min(z0, z1) < m.z0 + m.len + 2) return false;
      return true;
    };
    const nodes = new Map(), key = (a, b) => a + "," + b, edges = [];
    const node = (a, b) => { const k = key(a, b); if (!nodes.has(k)) nodes.set(k, { a, b, x: X[a], z: Z[b], out: [] }); return nodes.get(k); };
    for (let a = 0; a < X.length; a++) for (let b = 0; b < Z.length; b++) {
      if (a + 1 < X.length && okEdge(X[a], Z[b], X[a + 1], Z[b])) { const A = node(a, b), B = node(a + 1, b); A.out.push(B); B.out.push(A); }
      if (b + 1 < Z.length && okEdge(X[a], Z[b], X[a], Z[b + 1])) { const A = node(a, b), B = node(a, b + 1); A.out.push(B); B.out.push(A); }
    }
    const list = [...nodes.values()].filter(n => n.out.length);
    roadNet = { list, AV };
    if (!list.length) return;
    const COL = [0xD8705A, 0x6A9AC8, 0xF2EEE2, 0x8AB880, 0xE8C060, 0xB88AC8, 0x4A5A6A, 0xC8402A];
    const hl = new T.MeshBasicMaterial({ color: 0xFFF2C8 }), tl = new T.MeshBasicMaterial({ color: 0xFF4A3A });
    const n = MQ() ? 6 : 14;
    for (let i = 0; i < n; i++) {
      const g = new T.Group(), c = COL[i % COL.length], M = mat(c);
      box(g, 0.9, 0.42, 1.8, M, 0, 0.14, 0); box(g, 0.8, 0.38, 0.95, M, 0, 0.56, -0.1); box(g, 0.82, 0.28, 0.75, mat(0xBFD8E8), 0, 0.6, -0.1);
      for (const wx of [-0.45, 0.45]) for (const wz of [-0.58, 0.58]) box(g, 0.12, 0.28, 0.3, mat(0x1E1E22), wx, 0, wz);
      for (const sx of [-0.3, 0.3]) { const h = new T.Mesh(new T.BoxGeometry(0.16, 0.1, 0.04), hl); h.position.set(sx, 0.38, 0.91); g.add(h); const t = new T.Mesh(new T.BoxGeometry(0.16, 0.1, 0.04), tl); t.position.set(sx, 0.4, -0.91); g.add(t); }
      g.scale.setScalar(0.85); root.add(g);
      const A = list[Math.floor(Math.random() * list.length)], B = A.out[Math.floor(Math.random() * A.out.length)];
      cars.push({ g, A, B, t: Math.random(), v: 0, vmax: 2.6 + Math.random() * 1.2, yaw: 0, hl, tl });
    }
  }
  function laneOff(A, B) { const wide = roadNet.AV.some(v => (A.x === B.x && Math.abs(A.x - v) < 0.2) || (A.z === B.z && Math.abs(A.z - v) < 0.2)); return wide ? 1.35 : 0.55; }
  function carsFrame(dt, nf) {
    if (!cars.length) return;
    for (const c of cars) {
      const dx = c.B.x - c.A.x, dz = c.B.z - c.A.z, L = Math.hypot(dx, dz) || 1;
      // 前面同一段、同方向有車就慢下來
      let ahead = 1e9;
      for (const o of cars) if (o !== c && o.A === c.A && o.B === c.B && o.t > c.t) ahead = Math.min(ahead, (o.t - c.t) * L);
      const want = ahead < 2.4 ? 0 : ahead < 4.5 ? c.vmax * 0.4 : c.vmax * (c.t > 0.85 || c.t < 0.1 ? 0.55 : 1);
      c.v += (want - c.v) * Math.min(1, dt * 2.5);
      c.t += c.v * dt / L;
      if (c.t >= 1) {
        const opts = c.B.out.filter(n => n !== c.A), nx = (opts.length ? opts : c.B.out)[Math.floor(Math.random() * (opts.length || c.B.out.length))];
        c.A = c.B; c.B = nx; c.t = 0; continue;
      }
      const o = laneOff(c.A, c.B), ux = dx / L, uz = dz / L;
      c.g.position.set(c.A.x + dx * c.t - uz * o, 0.02, c.A.z + dz * c.t + ux * o);
      const yaw = Math.atan2(ux, uz); let d = yaw - c.yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
      c.yaw += d * Math.min(1, dt * 8); c.g.rotation.y = c.yaw;
    }
    const k = 0.35 + nf * 0.65; cars[0].hl.color.setRGB(k, k * 0.95, k * 0.8);
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
    if (FP.on && TC && walkers[TC.id]) {
      // 第一人稱：眼睛在角色頭的高度（約 1.5 公尺），看的方向由滑鼠決定
      const w = walkers[TC.id], cp = Math.cos(FP.pitch);
      const fx = -Math.sin(FP.yaw) * cp, fy = Math.sin(FP.pitch), fz = -Math.cos(FP.yaw) * cp;
      camera.position.set(w.g.position.x - Math.sin(FP.yaw) * 0.08, w.g.position.y + 0.94, w.g.position.z - Math.cos(FP.yaw) * 0.08);
      camera.lookAt(camera.position.x + fx, camera.position.y + fy, camera.position.z + fz);
      cam.target.set(w.g.position.x, 0, w.g.position.z);   // 燈光、影子跟著角色
      return;
    }
    const t = cam.target, d = cam.dist, p = cam.polar, a = cam.az;
    camera.position.set(t.x + Math.sin(p) * Math.sin(a) * d, Math.max(1.2, Math.cos(p) * d), t.z + Math.sin(p) * Math.cos(a) * d);
    // 壓到很低（街道視角）時，視線往上抬：看得到天上的浮島和聖劍
    if (p > 1.25) camera.lookAt(t.x, (p - 1.25) * d * 1.6, t.z); else camera.lookAt(t);
  }
  function clampTarget() {
    // 鏡頭不能離開城：目標點限制在圓形城區裡，也不能拉太遠
    // 城的形狀不規則：用輪廓比例 rb 來限制（往海那邊可以多看一點）
    const q = GRID.rb(cam.target.x, cam.target.z), lim = cam.target.x < GRID.cx ? 1.18 : 0.98;
    if (q > lim) { const k = lim / q; cam.target.x = GRID.cx + (cam.target.x - GRID.cx) * k; cam.target.z = GRID.cz + (cam.target.z - GRID.cz) * k; }
    // 手機（觸控）看小鎮時不能拉得太近：一捏就會貼到路燈上；操控居民時照原本的距離
    const minD = PH.on ? 2.5 : TC || (window.matchMedia && matchMedia("(pointer:fine)").matches) ? 5 : 16;   // 拍照模式可以拉更近
    cam.dist = Math.max(minD, Math.min(MQ() ? 75 : HQ() ? 105 : 120, cam.dist));
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
    FP.el = el;
    el.addEventListener("pointerdown", e => {
      if (FP.on && FP.busy && FP.busy()) { unlock(); return; }
      if (FP.on) {   // 第一人稱：第一次點擊鎖住滑鼠，之後點擊＝對準心互動
        if (document.pointerLockElement !== el) { try { el.requestPointerLock(); } catch (er) { } FP.drag = { x: e.clientX, y: e.clientY }; }
        else fpInteract();
        return;
      }
      el.setPointerCapture && el.setPointerCapture(e.pointerId);
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (ptrs.size === 1) { start = { x: e.clientX, y: e.clientY, t: performance.now(), rot: e.button === 2 || e.shiftKey || e.altKey }; moved = 0; }
      if (ptrs.size === 2) prevPinch = pinchInfo();
      interacting = performance.now();
    });
    el.addEventListener("pointermove", e => {
      if (FP.on) {
        let dx = 0, dy = 0;
        if (document.pointerLockElement === el) { dx = e.movementX; dy = e.movementY; }
        else if (FP.drag && e.buttons) { dx = e.clientX - FP.drag.x; dy = e.clientY - FP.drag.y; FP.drag.x = e.clientX; FP.drag.y = e.clientY; }
        FP.yaw -= dx * 0.0024; FP.pitch = Math.max(-1.25, Math.min(1.25, FP.pitch - dy * 0.0024));
        return;
      }
      if (!ptrs.has(e.pointerId)) return;
      const p = ptrs.get(e.pointerId), dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      interacting = performance.now();
      if (ptrs.size === 1) {
        moved += Math.abs(dx) + Math.abs(dy);
        // 右鍵或按著 Shift 拖曳：旋轉、調整俯視角度；一般拖曳：平移
        if (moved > 6) { if (start && start.rot) { cam.az -= dx * 0.006; cam.polar = Math.max(0.35, Math.min(HQ() ? 1.5 : 1.25, cam.polar + dy * 0.004)); cam.follow = null; cam.fly = null; } else pan(dx, dy); }
      }
      else if (ptrs.size === 2 && prevPinch) {
        const cur = pinchInfo();
        cam.dist *= prevPinch.d / Math.max(1, cur.d);
        cam.az -= (cur.ang - prevPinch.ang);
        // 雙指一起上下滑＝調整俯視角度（像地圖 App）；左右滑＝平移
        const dmx = cur.mx - prevPinch.mx, dmy = cur.my - prevPinch.my;
        cam.polar = Math.max(0.35, Math.min(HQ() ? 1.5 : 1.25, cam.polar - dmy * 0.005));
        pan(dmx * 0.5, 0); cam.follow = null; cam.fly = null;
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
    el.addEventListener("pointerup", () => { FP.drag = null; });
    el.addEventListener("wheel", e => { e.preventDefault(); if (FP.on) return; cam.dist *= 1 + Math.max(-0.3, Math.min(0.3, e.deltaY * 0.0012)); clampTarget(); interacting = performance.now(); }, { passive: false });
    el.addEventListener("contextmenu", e => e.preventDefault());
    // 鍵盤：Q／E 旋轉、R／F 抬高壓低視角
    window.addEventListener("keydown", e => {
      if (!running || !host || !host.isConnected || /INPUT|TEXTAREA/.test(document.activeElement && document.activeElement.tagName) || document.body.classList.contains("ctl-on") || document.body.classList.contains("room-editing")) return;
      const k = e.key.toLowerCase();
      if (k === "q") cam.az += 0.18; else if (k === "e") cam.az -= 0.18;
      else if (k === "r") cam.polar = Math.max(0.35, cam.polar - 0.08); else if (k === "f") cam.polar = Math.min(HQ() ? 1.5 : 1.25, cam.polar + 0.08);
      else return;
      cam.fly = null; interacting = performance.now();
    });
  }
  function tap(cx, cy) {
    if (PH.on) return;   // 拍照模式：點畫面不跳卡片
    const r = renderer.domElement.getBoundingClientRect();
    const v = new T.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    const rc = new T.Raycaster(); rc.setFromCamera(v, camera); if (rc.layers) rc.layers.enableAll();
    if (TC) return tTap(cx, cy, rc);
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
    const gh = rc.intersectObjects(Object.values(lots).map(L => L.plat ? L.plat.group : L.group), true);
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
    tFrame(dt);
    mmFrame(dt);
    cullFrame(now);
    if (FP.on && FP.busy && document.pointerLockElement && FP.busy()) unlock();
    nightLightsFrame(dt, now);
    entranceFrame(dt, state ? nightFactor(state.min) : 0);
    coastFrame(dt, state ? nightFactor(state.min) : 0, now);
    if (N.voxCity && N.voxCity.tick) N.voxCity.tick(tt);
    if (CRY.mesh && (Math.floor(tt * 30) % 2 === 0)) crystalFrame(tt);
    skyFrame(tt, state ? nightFactor(state.min) : 0);
    if (OVH.lanMat) { const nf0 = state ? nightFactor(state.min) : 0; OVH.lanMat.color.setScalar(0.55 + nf0 * 0.6); }
    directorFrame(dt, now);
    placeCamera();
    const dtW = PH.freeze ? 0 : dt, ttW = PH.freeze ? PH.ft : tt;   // 拍照模式的「定格」：居民停在原地
    // 走路
    const talkingIds = new Set(bubbles.map(b => b.id));
    for (const id in walkers) {
      const w = walkers[id];
      let walking = false;
      if (w.train) {
        w.trainT += dtW;
        const k = w.trainT / 1.6;
        if (k < 0.5) w.fade = 1 - k * 2;
        else { if (!w.trainArrived) { w.pos.copy(w.trainTo); w.trainArrived = true; } w.fade = Math.min(1, (k - 0.5) * 2); }
        if (k >= 1) { w.train = false; w.trainArrived = false; w.fade = 1; }
      } else if (w.path.length) {
        const tgt = w.path[0], d = tgt.clone().sub(w.pos); d.y = 0;
        const len = d.length(), sp = w.speed || WALK;
        if (len > 0.001) w.wantYaw = Math.atan2(d.x, d.z);
        if (len < sp * dtW) { w.pos.copy(tgt); w.path.shift(); }
        else w.pos.add(d.multiplyScalar(sp * dtW / len));
        walking = true;
      }
      if (w.manualWalk > 0) { w.manualWalk -= dtW; walking = true; }   // 搖桿／鍵盤直接走
      const Lw = !w.path.length && !w.train && lots[w.loc];
      const indoors = Lw && (!Lw.open ? Math.abs(w.pos.x - Lw.x) < 3 && w.pos.z < Lw.z + 1
        : Lw.type === "lake" && GRID.lakeCell && Math.abs(w.pos.x - Lw.x) < 1.6 && w.pos.z < Lw.z + LAKE.mouth - 1.2);   // 地下湖：走下台階、進了隧道就看不到
      // 姿勢：到位之後才坐下、躺下
      const pose = !walking && !w.train && w.dest && w.pos.distanceTo(w.dest) < 0.05 ? (w.destPose || "stand") : "stand";
      if (pose !== w.pose) {
        w.pose = pose;
        if (w.ch) w.ch.setPose(pose, -0.42 / w.ch.k);
        else if (pose === "lie") { w.body.rotation.set(Math.PI / 2, 0, 0); w.body.position.set(0, 0.22, 0.12); w.body.scale.set(1, 1, 1); w.head.position.set(0, 0.62, -0.42); }
        else if (pose === "sit") { w.body.rotation.set(0, 0, 0); w.body.scale.set(1, 0.62, 1); w.body.position.set(0, 0.24, 0); w.head.position.set(0, 1.0, 0); }
        else { w.body.rotation.set(0, 0, 0); w.body.scale.set(1, 1, 1); w.body.position.set(0, 0.39, 0); w.head.position.set(0, 1.35, 0); }
      }
      const sc0 = 1.45, sc = w.g.scale.x + (sc0 - w.g.scale.x) * Math.min(1, dtW * 5);
      w.g.scale.set(sc, sc, sc);
      const baseY = pose === "stand" ? groundAt(w.pos.x, w.pos.z) : (w.destY || 0);
      const bob = w.ch ? 0 : walking ? Math.abs(Math.sin(ttW * 11 + w.phase)) * 0.22 : (w.asleep || pose !== "stand" ? 0 : Math.sin(ttW * 2 + w.phase) * 0.04);
      w.g.position.set(w.pos.x, baseY + bob, w.pos.z);
      w.g.visible = !indoors && !(FP.on && TC && w.id === TC.id);
      if (w.ch) {
        const want = walking ? (w.wantYaw || 0) : w.destYaw != null ? w.destYaw : w.yaw;   // 站著維持方向；說話時面向對方
        w.yaw = turnTo(w.yaw, want, Math.min(1, dtW * (walking ? 10 : pose !== "stand" ? 12 : 3)));
        w.ch.root.rotation.y = w.yaw;
        w.ch.root.visible = w.fade > 0.3;
        if (w.g.visible) w.ch.update(dtW, ttW, { walking, speed: w.manualWalk > 0 ? (shiftDown ? TRUN : TSPEED) : (w.speed || WALK), asleep: w.asleep, talking: talkingIds.has(id) || ENC_TALK.has(id), act: walking ? null : w.actTag });
      } else {
        w.head.material.opacity = (w.asleep ? 0.6 : 1) * w.fade;
        w.body.visible = w.fade > 0.3;
      }
      w.ring.visible = state && state.observing === id;
      if (w.ring.visible) { const s = 1 + Math.sin(ttW * 4) * 0.08; w.ring.scale.set(s, s, s); }
      w.zz.visible = w.asleep && w.fade > 0.5;
      if (w.zz.visible) w.zz.position.y = 2.1 + Math.sin(ttW * 1.5 + w.phase) * 0.12;
      w.wq.visible = !!(state && state.wishes && state.wishes.has(id)) && !w.asleep && w.fade > 0.5 && !FP.on;
      if (w.wq.visible) w.wq.position.y = w.wq.userData.y + Math.abs(Math.sin(ttW * 2.2 + w.phase)) * 0.12;
      if (FP.on) {
        // 第一人稱：名牌只顯示附近 8 單位內的人，縮小、放在頭頂上
        if (!w.name.userData.s0) w.name.userData.s0 = w.name.scale.clone();
        const dd = camera.position.distanceTo(w.g.position);
        w.name.visible = w.fade > 0.5 && dd < 8 && !(TC && w.id === TC.id);
        const k = 0.13 + Math.min(0.2, dd * 0.022);
        w.name.scale.set(w.name.userData.s0.x * k, w.name.userData.s0.y * k, 1);
        w.name.position.y = 0.82;
        w.zz.visible = false;
      } else {
        if (w.name.userData.s0) { w.name.scale.copy(w.name.userData.s0); w.name.position.y = 0; }
        w.name.visible = (cam.dist < 26 || w.ring.visible) && w.fade > 0.5;
      }
    }
    // 泡泡
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i], w = walkers[b.id];
      b.age += dt;
      const life = b.life;
      const a = b.age < 0.25 ? b.age / 0.25 : b.age > life - 0.6 ? Math.max(0, (life - b.age) / 0.6) : 1;
      b.sp.material.opacity = a;
      if (w) b.sp.position.set(w.g.position.x, (FP.on ? 1.7 : 3.0) + (b.stack || 0) * 0.15 + (1 - Math.min(1, b.age / 0.25)) * -0.3, w.g.position.z);
      // 第一人稱：泡泡跟距離成比例縮小（近的不會蓋住整個畫面）
      const sc = FP.on ? Math.max(0.11, Math.min(0.3, (w ? camera.position.distanceTo(w.g.position) : 4) * 0.035)) : Math.max(0.7, Math.min(2.4, cam.dist / 30));
      b.sp.scale.set(b.w * sc, b.h * sc, 1);
      if (b.age >= life) { root.remove(b.sp); b.sp.material.map.dispose(); b.sp.material.dispose(); bubbles.splice(i, 1); }
    }
    // 提示、名牌
    for (const id in hintMarks) { const s = hintMarks[id]; if (s.visible) s.position.y = s.userData.y + Math.sin(tt * 3 + s.userData.y) * 0.18; }
    // 第一人稱：地點上方的人數牌、提示記號不顯示（從街上看會很大、擋視線）
    for (const id in lots) { const B = lots[id].badge; if (B) B.visible = !FP.on; }
    for (const id in hintMarks) { if (FP.on) hintMarks[id].userData.fpHid = hintMarks[id].visible ? (hintMarks[id].visible = false, true) : hintMarks[id].userData.fpHid; else if (hintMarks[id].userData.fpHid) { hintMarks[id].visible = true; hintMarks[id].userData.fpHid = false; } }
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
    const lblOn = showLabels && cam.dist < 64 && !TC, lblScale = Math.max(0.8, Math.min(1.5, cam.dist / 36));
    for (const s of labelSprites) { s.visible = lblOn; if (lblOn) { if (!s.userData.sx) { s.userData.sx = s.scale.x; s.userData.sy = s.scale.y; } s.scale.set(s.userData.sx * lblScale, s.userData.sy * lblScale, 1); } }
    for (const s of districtSprites) s.visible = cam.dist > 52;
    // 天氣
    if (rain.visible) {
      const a = rain.geometry.attributes.position;
      for (let i = 0; i < a.count; i++) { let y = a.getY(i) - dtW * 26; if (y < 0) y += 30; a.setY(i, y); }
      a.needsUpdate = true;
      rain.position.set(cam.target.x, 0, cam.target.z);
    }
    const camY = camera.position.y;
    cloudMat.opacity = 0.85 * Math.max(0, Math.min(1, (Math.abs(camY - 36) - 6) / 10));
    for (const c of clouds) { c.position.x += c.userData.v * dtW; if (c.position.x > 90) c.position.x = -55; }
    if (fireflies.visible) {
      const a = fireflies.geometry.attributes.position, base = fireflies.userData.base;
      for (let i = 0; i < a.count; i++) { a.setX(i, base[i * 3] + Math.sin(tt * 0.7 + i) * 0.5); a.setY(i, base[i * 3 + 1] + Math.sin(tt * 1.3 + i * 2) * 0.3); }
      a.needsUpdate = true;
      fireflies.material.opacity = 0.5 + Math.sin(tt * 3) * 0.4;
    }
    lifeFrame(dtW, ttW, state ? nightFactor(state.min) : 0, state && state.weather === "雨");
    carsFrame(dtW, state ? nightFactor(state.min) : 0);
    anomFrame(tt);
    trafficFrame(tt);
    festGroup.children.forEach((m, i) => { m.position.y = m.userData.y + ((tt * 0.8 + i * 0.37) % 6); m.material.opacity = 1 - ((tt * 0.8 + i * 0.37) % 6) / 6; });
    const phHid = PH.on && PH.clean ? photoHide() : null, phOut = photoTarget();
    VOXU.uVox.value = 0.25; VOXU.uAO.value = 0.9; VOXU.uFloorY.value = 0; if (VOXU.uRoomBox.value) VOXU.uRoomBox.value.z = 0;
    if (HQ()) {
      // 城市外圍用霧蓋住：霧跟著鏡頭遠近，城裡看得清楚、邊緣慢慢消失
      const fogK = state && state.weather === "霧" ? 0.6 : 1;
      if (FP.on) { scene.fog.near = 28 * fogK; scene.fog.far = 118 * fogK; }   // 平視時遠處交給霧
      else { scene.fog.near = (MQ() ? 55 : 80) * fogK; scene.fog.far = (MQ() ? 150 : 215) * fogK; }   // 固定距離：放大縮小時顏色不會跟著變
      if (!townPost) townPost = makePost(renderer, MQ() ? 0 : 0.7);
      townPost.mat.uniforms.amount.value = FP.on || MQ() || (PH.on && PH.tilt > 0) ? 0 : 0.7;   // 拍照模式開了移軸就用拍照的那一套   // 第一人稱不要移軸模糊
      const nfB = state ? nightFactor(state.min) : 0;
      townPost.mat.uniforms.bloom.value = MQ() ? 0 : nfB * 0.5;
      townPost.mat.uniforms.grade.value = Math.min(1, nfB * 1.4);
      { const U = townPost.mat.uniforms, m = state ? state.min : 720, mk = morningK(m) * (1 - nfB), ek = eveK(m) * (1 - nfB), day = 1 - nfB;
        U.dSat.value = 0.12 * day + 0.14 * mk + 0.16 * ek;   // 整體飽和度高一點，下午最濃
        U.dCon.value = -0.05 * mk + 0.05 * ek;              // 早上柔、下午分明
        U.dHi.value.set(0.06 * mk + 0.05 * ek, 0.04 * mk + 0.012 * ek, 0.01 * mk - 0.035 * ek);
        U.dSh.value.set(0.075 * mk + 0.025 * ek, 0.045 * mk - 0.012 * ek, 0.02 * mk + 0.055 * ek); }   // 傍晚開始調色   // 白天不開光暈；晚上只讓發光的東西微微暈開
      camera.layers.set(0); townPost.render(scene, camera, phOut);
      const bg = scene.background; scene.background = null;   // 背景是顏色時 three 會強制清畫面
      renderer.autoClear = false; camera.layers.set(1); renderer.render(scene, camera); renderer.autoClear = true; camera.layers.set(0); scene.background = bg;
    } else { if (phOut) renderer.setRenderTarget(phOut); camera.layers.enable(1); renderer.render(scene, camera); }
    if (phOut) photoPass(phOut);
    if (phHid) for (const o of phHid) o.visible = true;
    if (PH.shot) { const cb = PH.shot; PH.shot = null; try { cb(renderer.domElement); } catch (e) { console.warn("photo", e); } }
  }


  /* ═════════ 平面圖：等角小房間 ═════════ */
  const RM = { floor: 0, autoFloor: false, lastState: null, renderer: null, scene: null, camera: null, group: null, host: null, loc: null, ppl: {}, running: false, raf: 0, az: 0, hooks: {}, W: 4.4, D: 3.8, spots: [], last: 0, sun: null, hemi: null, lamp: null };
  const roomType = id => { const l = E_loc(id); return l ? typeOf(l) : "house"; };
  function roomSize(id) {
    const t = roomType(id);
    // 房間是真實公尺：住家 7×6、店家與公寓 9×7、學校 10×8、戶外 12×9（外觀的房子裝得下）
    if (t === "street" || OPEN[t]) return [12, 9];
    if (t === "school") return [10, 8];
    if (t === "tall" || t === "shop") return [9, 7];
    return [7, 6];
  }
  function roomOwner(id) { for (const c of N.characters) if (N.schedules[c.id] && N.schedules[c.id].home === id) return c; return null; }
  function roomTheme(id, fl) {
    const e = N.interiors && N.interiors[id] || {}, th = Object.assign({}, e.theme || {}, fl.theme || {});
    const owner = roomOwner(id);
    if (th.wall == null) th.wall = owner ? new T.Color(owner.color).lerp(new T.Color(0xF4EADA), 0.72).getHex() : 0xE8D3B4;
    th.dark = !!(fl.dark || e.dark); th.outdoor = !!(fl.outdoor || e.outdoor);
    return th;
  }
  /* 室內跟外觀對上：這一層樓在外面是哪種風格，牆、護牆板、窗框、窗戶造型、主燈就照那種 */
  function styleTheme(id, fi, th) {
    const l = E_loc(id); if (!l || !N.voxCity || th.outdoor) return th;
    const st = N.voxCity.styleOf(l, typeOf(l), hashStr(l.id)), f = st.floors[Math.min(fi, st.floors.length - 1)], p = st.pal;
    const sd = hashStr(id + fi), dark = th.dark;
    const lum = c => ((c >> 16 & 255) * 0.3 + (c >> 8 & 255) * 0.59 + (c & 255) * 0.11) / 255;
    const mixc = (a, b, k) => new T.Color(a).lerp(new T.Color(b), k).getHex();
    let o = {};
    if (f === "E") o = { wall: dark ? th.wall : p.wall, wall3: mixc(dark ? th.wall : p.wall, 0xFFFFFF, 0.4), wain: lum(p.shutter || 0x4E8A8A) > 0.6 ? 0x7A5638 : p.shutter, trim: p.frame, frame: p.frame, winStyle: sd % 3 ? "square" : "arch", ceilStyle: sd % 2 ? "chandelier" : "dome" };
    else if (f === "C") o = { wall: dark ? th.wall : 0xE8DCC4, wall3: 0xD8C8A8, wallPat: "panel", wain: 0x7A2A20, trim: 0x5A1E16, frame: 0x6A2418, cap: 0x8A2A1E, winStyle: "grid", ceilStyle: "lantern", lanternC: 0xF07850 };
    else if (f === "J") o = { wall: dark ? th.wall : 0xEEE6D6, wall3: 0xE0D4BC, wallPat: "panel", wain: p.wood || 0x4E3424, trim: 0x3A2418, frame: 0x3A2418, winStyle: "grid", ceilStyle: sd % 2 ? "lantern" : "flush", lanternC: 0xF8E4C0 };
    else if (f === "Y") o = { wall: dark ? th.wall : 0x6A6E78, wall3: 0x5A5E66, wallPat: "pin", wain: 0x3E424A, trim: 0x2A2C32, frame: 0x2A2C32, winStyle: "wide", ceilStyle: sd % 2 ? "industrial" : "bulbs" };
    o.style = f;
    return Object.assign({}, th, o);
  }
  // 家具的座位（房間公尺座標）：沿用 furn() 算出來的位置，坐、躺的高度照實際的家具表面
  function spotsOf(vr, place) {
    const out = [], dummy = new T.Group();
    for (const [type, u, v, o0] of vr.spec) {
      const o = o0 || {}, [x, z] = place(u, v), a = (o.rot || 0) * Math.PI / 180;
      for (const sp of furn(type, o, dummy)) {
        const wx = x + sp.x * Math.cos(a) + sp.z * Math.sin(a), wz = z - sp.x * Math.sin(a) + sp.z * Math.cos(a);
        const top = (sp.pose === "sit" || sp.pose === "lie") ? vr.topAt(wx, wz, sp.pose === "lie" ? 0.8 : 0.75) : 0;
        out.push({ x: wx, z: wz, pose: sp.pose, tag: sp.tag, y: top > 0.15 ? top : sp.y, owner: sp.owner, yaw: a + faceOf(sp) });
      }
    }
    while (dummy.children.length) { const c = dummy.children.pop(); if (c.geometry) c.geometry.dispose(); }
    return out;
  }
  /* 戶外地點的平台：房間畫面和小鎮上用同一套模型（同樣的擺設、同樣的大小） */
  const isPlat = l => { const e = N.interiors && N.interiors[l.id]; return !!(e && e.outdoor && !e.dark); };
  function platModel(id) {
    const fl = floorsOf(id), F = fl[0], ov = roomEdits()[id + "#0"];
    const [W, D] = F.size || roomSize(id);
    const spec = ov ? ov.items : (F.items || []), th = Object.assign({}, roomTheme(id, F), ov && ov.theme || {});
    th.seed = th.seed || [...(id + 0)].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 100003, 7);
    th.noNudge = !!ov; th.pendant = false;
    const place = (u, v) => [-W / 2 + 0.35 + u * (W - 0.7), -D / 2 + 0.1 + v * (D - 0.5)];
    const vr = N.voxRoom.build(T, W, D, spec, th, place, colOf, { noMesh: true });
    // 夜市擺在馬路上：小鎮上不要平台的地板，只留攤子
    const vox = F.noFloor ? [...vr.grid.m.values()].filter(v => v.y >= 0) : vr.grid.m.values();
    const group = N.voxCity.fromVoxels(T, vox);
    vr.grid = null;
    group.scale.setScalar(1 / 1.6);
    // 站的位置：沒被家具、舞台占住的格子，從中間往外、彼此隔開
    const free = [], o = vr.occ;
    for (let cz = 1; cz < o.nz - 1; cz++) for (let cx = 1; cx < o.nx - 1; cx++) {
      let ok = true; for (let dz = -1; dz <= 1 && ok; dz++) for (let dx = -1; dx <= 1; dx++) if (o.data[(cz + dz) * o.nx + cx + dx]) { ok = false; break; }
      if (ok) free.push([o.x0 + (cx + 0.5) * o.C, o.z0 + (cz + 0.5) * o.C]);
    }
    free.sort((a, b) => Math.hypot(a[0], a[1] - D * 0.1) - Math.hypot(b[0], b[1] - D * 0.1));
    const stand = [];
    for (const f of free) { if (stand.length >= 16) break; if (stand.every(q => Math.hypot(q[0] - f[0], q[1] - f[1]) > 0.75)) stand.push(f); }
    return { W, D, group, occ: vr.occ, spots: spotsOf(vr, place), lights: vr.lights, stand };
  }
  // 把平台擺進小鎮：中心 (x, z)，rot 是繞 y 軸的角度；回傳的座位、擋路格子都換成小鎮座標
  function placePlat(id, x, z, rot) {
    const P = platModel(id), cs = Math.cos(rot || 0), sn = Math.sin(rot || 0);
    P.group.rotation.y = rot || 0; P.group.position.set(x, 0.16, z); root.add(P.group);
    const tw = (mx, mz) => [x + (mx * cs + mz * sn) / 1.6, z + (-mx * sn + mz * cs) / 1.6];
    for (const l of P.lights) { const [lx, lz] = tw(l.x, l.z); lampSpots.push([lx, lz, l.color || 0xFFB060]); }
    P.spots = P.spots.map(sp => { const [sx, sz] = tw(sp.x, sp.z); return Object.assign({}, sp, { x: sx, z: sz, y: sp.y / 1.6 + 0.16, yaw: sp.yaw + (rot || 0) }); });
    P.stand = P.stand.map(([mx, mz]) => tw(mx, mz));
    P.x = x; P.z = z; P.rot = rot || 0; P.tw = tw;
    P.local = (tx, tz) => { const dx = (tx - x) * 1.6, dz = (tz - z) * 1.6; return [dx * cs - dz * sn, dx * sn + dz * cs]; };
    return P;
  }
  function buildRoom(id) {
    const g = RM.group;
    while (g.children.length) g.remove(g.children[0]);
    const fl = floorsOf(id), fi = Math.min(RM.floor, fl.length - 1), F = fl[fi], ov = roomEdits()[id + "#" + fi];
    const [W, D] = F.size || roomSize(id); RM.W = W; RM.D = D; RM.spots = [];
    const spec = ov ? ov.items : (F.items || []), th = Object.assign({}, styleTheme(id, fi, roomTheme(id, F)), ov && ov.theme || {});
    RM.spec = spec;
    RM.theme = th;
    // 天花板吊燈：小房間一盞、中房間兩盞、大房間四盞，平均分布，燈的高度跟著天花板
    th.seed = th.seed || [...(id + fi)].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 100003, 7);   // 窗戶造型、配色用
    th.noNudge = !!ov;   // 玩家自己擺過的房間不要幫他挪
    th.pendant = !th.dark;   // 天花板主燈（樣式照風格）；陰暗的房間不開主燈，只靠小燈
    const ceil = th.ceil || 2.6, area = W * D;
    th.pends = th.pends || (area < 44 ? [[th.lampX != null ? th.lampX : 0, th.lampZ != null ? th.lampZ : -0.1]]
      : area < 75 ? [[-W / 4, -0.1], [W / 4, -0.1]]
      : [[-W / 4, -D / 4], [W / 4, -D / 4], [-W / 4, D / 4], [W / 4, D / 4]]);
    RM.ceilLights.forEach((L, i) => {
      const p0 = th.pends[i];
      L.userData.on = !!p0; if (!p0) return;
      L.position.set(p0[0], ceil - 0.68, p0[1]); L.distance = Math.max(W, D) * 1.25;
      L.userData.share = 1.25 / Math.sqrt(th.pends.length);
    });
    const place = (u, v) => [-W / 2 + 0.35 + u * (W - 0.7), -D / 2 + 0.1 + v * (D - 0.5)];
    const vr = N.voxRoom.build(T, W, D, spec, th, place, colOf);
    RM.clash = vr.clash;
    RM.spec = vr.spec;                     // 自動擺放的家具已經有了位置
    RM.ceilLights.forEach(L => L.color.set(th.lampC || 0xFFD6A0));
    for (const k of ["solid", "glow", "win"]) if (vr.meshes[k]) g.add(vr.meshes[k]);
    RM.occ = vr.occ;
    RM.winMat = vr.meshes.winMat;
    // 座位：沿用 furn() 算出來的位置（幾何丟掉不用）
    RM.spots = spotsOf(vr, place);
    // 光源：最亮的四個
    vr.lights.sort((p, q) => q.power - p.power);
    // 太近的光合併（一排蠟燭算一盞），再挑最亮的 8 盞
    const merged = [];
    for (const l of vr.lights) { const m = merged.find(q => Math.hypot(q.x - l.x, q.z - l.z) < 0.8); if (m) m.power += l.power * 0.5; else merged.push(Object.assign({}, l)); }
    merged.sort((p, q) => q.power - p.power);
    RM.plights.forEach((L, i) => { const s0 = merged[i]; if (s0) { L.position.set(s0.x, s0.y, s0.z); L.color.set(s0.ceil ? 0xFF9A48 : s0.color === 0xFFB060 ? 0xFF8A3A : s0.color); L.userData.base = Math.min(0.9, s0.power); L.userData.ceil = !!s0.ceil; } else L.userData.base = 0; });
    for (const id2 in RM.ppl) { RM.scene.remove(RM.ppl[id2].g); }
    RM.ppl = {};
    fitRoomCam();
    if (RFP.on) roomFPWalls();
    if (RM.lastState) roomLight(RM.lastState);
  }
  /* 房間裡走路：在 0.2 公尺的格子上找一條不穿過家具的路（A*），再把路線拉直 */
  function occAt(cx, cz) { const o = RM.occ; return !o || cx < 1 || cz < 1 || cx >= o.nx - 1 || cz >= o.nz - 1 ? 1 : o.data[cz * o.nx + cx]; }
  const cellOf = v => [Math.floor((v.x - RM.occ.x0) / RM.occ.C), Math.floor((v.z - RM.occ.z0) / RM.occ.C)];
  const posOf = (cx, cz) => new T.Vector3(RM.occ.x0 + (cx + 0.5) * RM.occ.C, 0, RM.occ.z0 + (cz + 0.5) * RM.occ.C);
  function nearestFree(cx, cz) {
    for (let r = 0; r < 12; r++) for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
      if (!occAt(cx + dx, cz + dz)) return [cx + dx, cz + dz];
    }
    return [cx, cz];
  }
  function clearLine(a, b) {
    const n = Math.ceil(a.distanceTo(b) / (RM.occ.C * 0.5));
    for (let i = 1; i < n; i++) { const t = i / n, [cx, cz] = cellOf(new T.Vector3(a.x + (b.x - a.x) * t, 0, a.z + (b.z - a.z) * t)); if (occAt(cx, cz)) return false; }
    return true;
  }
  function roomPath(from, to) {
    if (!RM.occ) return [to];
    const o = RM.occ, [sx, sz] = nearestFree(...cellOf(from)), [gx, gz] = nearestFree(...cellOf(to));
    const key = (x, z) => z * o.nx + x, open = [[0, sx, sz]], came = new Map(), cost = new Map([[key(sx, sz), 0]]);
    const hh = (x, z) => Math.hypot(x - gx, z - gz);
    let found = false, guard = 0;
    while (open.length && guard++ < 6000) {
      let bi = 0; for (let i = 1; i < open.length; i++) if (open[i][0] < open[bi][0]) bi = i;
      const [, x, z] = open.splice(bi, 1)[0];
      if (x === gx && z === gz) { found = true; break; }
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const nx = x + dx, nz = z + dz;
        if (occAt(nx, nz) || (dx && dz && (occAt(x + dx, z) || occAt(x, z + dz)))) continue;
        const c = cost.get(key(x, z)) + (dx && dz ? 1.414 : 1), k = key(nx, nz);
        if (!cost.has(k) || c < cost.get(k)) { cost.set(k, c); came.set(k, key(x, z)); open.push([c + hh(nx, nz), nx, nz]); }
      }
    }
    if (!found) return [to];
    const cells = []; let k = key(gx, gz);
    while (k !== key(sx, sz)) { cells.push(posOf(k % o.nx, Math.floor(k / o.nx))); k = came.get(k); if (k == null) break; }
    cells.reverse();
    // 拉直：看得到就直接走過去
    const pts = [], all = [from.clone(), ...cells];
    let a = all[0];
    for (let i = 1; i < all.length; i++) if (i === all.length - 1 || !clearLine(a, all[i + 1])) { pts.push(all[i]); a = all[i]; }
    pts.push(to.clone());
    return pts;
  }
  function roomLight(s) {
    const nf = nightFactor(s.min), th = RM.theme || {}, dark = th.dark;
    const out = th.outdoor;
    // 室內：只有一盞主燈（天花板吊燈），白天多一點窗外的柔光；只點蠟燭的房間只靠蠟燭；戶外才有太陽
    RM.sun.intensity = out ? (dark ? 0 : 0.65 * (1 - nf) + 0.05) : dark ? 0 : 0.25 * (1 - nf);
    RM.sun.castShadow = !!out && !dark;
    RM.hemi.intensity = dark ? 0.14 : out ? 0.75 * (1 - nf) + 0.22 : 0.2 + 0.3 * (1 - nf);
    const sunIn = windowSun(s.min, nf, !out && !dark);
    if (out) { RM.sun.position.set(-7, 9, 5); RM.sun.target.position.set(0, 0, 0); RM.sun.target.updateMatrixWorld(); RM.sun.shadow.radius = 8; }   // 白天、下午：陽光從窗戶斜斜照進來，地上一塊亮的、牆擋住的地方是影子
    if (sunIn) RM.hemi.intensity = 0.2 + 0.2 * (1 - nf);   // 明暗分明一點   // 晚上暗一點、有氣氛   // 環境光多一點、直射少一點：明暗對比變小，比較柔
    RM.hemi.color.set(dark ? 0x8A7AB0 : out ? 0xFFF0DC : new T.Color(0xFFE4C4).lerp(new T.Color(th.lampC || 0xFFB060), 0.5).getHex()); RM.hemi.groundColor.set(dark ? 0x1A1420 : 0x5A4A3E);
    // 天花板的燈：白天弱一點（窗外有光），晚上全亮；只有第一盞投影子
    RM.ceilLights.forEach(L => { L.intensity = 0; L.castShadow = false; });
    /* 放燈原則：一間房的光量照面積算（淺色房間打折）；主燈分七成、小燈分三成，燈多每盞就暗；
     * 主燈白天開三成、傍晚七成、晚上全開；小燈從白天就微微亮著 */
    const lum = c => ((c >> 16 & 255) * 0.3 + (c >> 8 & 255) * 0.59 + (c & 255) * 0.11) / 255;
    const used = RM.plights.filter(L => L.userData.base);
    const ceilN = used.filter(L => L.userData.ceil).length || 1, accN = Math.max(1, used.length - ceilN);
    const budget = RM.W * RM.D * 0.05 * (1 - 0.35 * lum(th.wall || 0xE8D3B4));
    const mainK = (sunIn ? 0.12 : 0.3) + (sunIn ? 0.88 : 0.7) * nf, accK = 0.55 + 0.45 * nf;
    RM.plights.forEach(L => {
      if (!L.userData.base) { L.intensity = 0; return; }
      if (out) { L.intensity = L.userData.base * (0.3 + nf * 0.7); L.distance = 4.2; L.decay = 1.5; return; }
      if (dark) { L.intensity = Math.min(0.6, L.userData.base) * 1.3; L.distance = 4; L.decay = 1.3; return; }
      if (L.userData.ceil) { L.intensity = budget * 0.7 / ceilN * mainK; L.distance = 7; L.decay = 1; }
      else { L.intensity = Math.min(0.45, budget * 0.3 / accN) * accK; L.distance = 3.2; L.decay = 1; }
    });
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
  /* 窗戶照進來的陽光：太陽擺在左後方窗外，往房間中間斜照（早上比較高、偏蜜桃色；下午比較低、偏橘，光斑拉得長）；
   * 俯視時房間沒有天花板，所以放一塊「只擋光、看不見」的天花板，光才只從窗戶進來；窗前再加半透明的光柱 */
  function windowSun(min, nf, allow) {
    const th = RM.theme || {}, wins = th._wins || [];
    if (RM.shafts) { RM.scene.remove(RM.shafts); RM.shafts.traverse(o => { if (o.geometry) o.geometry.dispose(); }); RM.shafts = null; }
    if (RM.lid) RM.lid.visible = false;
    const day = 1 - nf; if (!allow || !wins.length || day < 0.05 || min < 330 || min > 1150) return false;
    const ek = eveK(min), mk = morningK(min);
    const d = new T.Vector3(0.82, -(0.9 - 0.3 * ek), 0.3 + 0.3 * ek).normalize();
    const H = th.ceil || 2.6;
    RM.sun.position.set(-d.x * 14, -d.y * 14, -d.z * 14); RM.sun.target.position.set(0, 0, 0); RM.sun.target.updateMatrixWorld();
    if (!RM.sun.target.parent) RM.scene.add(RM.sun.target);
    const col = lerpKeys(SUNC, min); col.lerp(new T.Color(0xFFD2A8), mk * 0.3);
    RM.sun.color.copy(col); RM.sun.intensity = (1.45 + 0.2 * ek) * day; RM.sun.castShadow = true;
    const R = Math.max(RM.W, RM.D) * 0.9, sc = RM.sun.shadow.camera; sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R; sc.near = 1; sc.far = 40; sc.updateProjectionMatrix();
    RM.sun.shadow.radius = 3; RM.sun.shadow.bias = -0.0012;
    if (RM.sun.shadow.mapSize.x < 2048 && HQ()) { RM.sun.shadow.mapSize.set(2048, 2048); if (RM.sun.shadow.map) { RM.sun.shadow.map.dispose(); RM.sun.shadow.map = null; } }
    // 看不見、只擋光的天花板（第一人稱時有真的天花板，一樣保留這塊）
    if (!RM.lid) { RM.lid = new T.Mesh(new T.BoxGeometry(1, 0.1, 1), new T.MeshBasicMaterial({ colorWrite: false, depthWrite: false })); RM.lid.castShadow = true; RM.lid.receiveShadow = false; RM.lid.userData.noVox = true; RM.scene.add(RM.lid); }
    RM.lid.scale.set(RM.W + 1.2, 1, RM.D + 1.2); RM.lid.position.set(0, H + 0.05, 0); RM.lid.visible = true;
    // 光柱：窗戶四個角沿著陽光方向打到地上，中間是很淡的暖光
    const g = new T.Group(), mat0 = new T.MeshBasicMaterial({ color: col.clone().lerp(new T.Color(0xFFFFFF), 0.2), transparent: true, opacity: 0.05 + 0.04 * ek, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, fog: false });
    for (const w of wins) {
      if (w.side === "B" && d.z < 0.2) continue;
      const P = w.side === "L" ? [[w.x, w.y0, w.u0], [w.x, w.y0, w.u1], [w.x, w.y1, w.u1], [w.x, w.y1, w.u0]] : [[w.u0, w.y0, w.z], [w.u1, w.y0, w.z], [w.u1, w.y1, w.z], [w.u0, w.y1, w.z]];
      const F = P.map(([x, y, z]) => { const t = y / -d.y; return [Math.max(-RM.W / 2, Math.min(RM.W / 2, x + d.x * t)), 0.01, Math.max(-RM.D / 2, Math.min(RM.D / 2, z + d.z * t))]; });
      const pos = [];
      for (let i = 0; i < 4; i++) { const a = P[i], b = P[(i + 1) % 4], c = F[(i + 1) % 4], e = F[i]; pos.push(...a, ...b, ...c, ...a, ...c, ...e); }
      const geo = new T.BufferGeometry(); geo.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
      const m = new T.Mesh(geo, mat0); m.userData.noVox = true; m.renderOrder = 3; g.add(m);
    }
    RM.shafts = g; RM.scene.add(g);
    return true;
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
    const ch = chibiFor(c.id, 1.0, g);   // 房間 1 單位 = 1 公尺，人 1.6 公尺
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
    if (RFP.cam) { RFP.cam.aspect = asp; RFP.cam.updateProjectionMatrix(); }
  }
  /* ═════════ 房間裡的第一人稱 ═════════
   * 透視鏡頭放在操控的人眼睛的高度；補上平常為了俯視拿掉的右牆、前牆（有門）和天花板；
   * 滑鼠鎖定轉頭（手機用拖曳），WASD 跟著視線方向走，準心對到人或家具按 E／點擊互動。 */
  const RFP = { on: false, want: false, yaw: 0, pitch: -0.08, cam: null, extra: null, busy: null, aimT: 0, aim: null };
  function roomFPWalls() {
    if (RFP.extra) { RM.scene.remove(RFP.extra); RFP.extra = null; }
    const th = RM.theme || {}; if (th.outdoor) return;
    const g = new T.Group(), W = RM.W, D = RM.D, H = th.ceil || 2.6, wy = (th.wainH != null ? th.wainH : 8) * 0.1;
    const wall = th.wall || 0xE8D8C0, wain = th.wain || 0x82593A, trim = th.trim || 0x5A3B26, cap = th.cap || new T.Color(wall).lerp(new T.Color(0xFFFFFF), 0.25).getHex();
    const M = c => { const m = new T.MeshLambertMaterial({ color: c }); return m; };
    const slab = (w, h, d, x, y, z, c) => { const m = new T.Mesh(new T.BoxGeometry(w, h, d), M(c)); m.position.set(x, y + h / 2, z); m.receiveShadow = true; m.castShadow = false; m.userData.noVox = true; g.add(m); return m; };
    // 一面牆：下半護牆板、一條飾條、上半牆面
    const wallX = (x, z0, z1) => { const L = z1 - z0, zc = (z0 + z1) / 2; slab(0.2, wy, L, x, -0.1, zc, wain); slab(0.22, 0.06, L, x, wy - 0.1, zc, trim); slab(0.2, H - wy + 0.04, L, x, wy - 0.06, zc, wall); };
    const wallZ = (z, x0, x1) => { const L = x1 - x0, xc = (x0 + x1) / 2; slab(L, wy, 0.2, xc, -0.1, z, wain); slab(L, 0.06, 0.22, xc, wy - 0.1, z, trim); slab(L, H - wy + 0.04, 0.2, xc, wy - 0.06, z, wall); };
    const cd = th.cut ? th.cut[1] : 0;
    wallX(W / 2 + 0.1, -D / 2 + cd - 0.2, D / 2 + 0.2);
    // 前牆：中間一扇門（門框＋門板＋門把）
    const dw = 1.0, dh = 2.1;
    wallZ(D / 2 + 0.1, -W / 2 - 0.2, -dw / 2); wallZ(D / 2 + 0.1, dw / 2, W / 2 + 0.2);
    slab(dw, H - dh, 0.2, 0, dh - 0.0, D / 2 + 0.1, wall);
    slab(dw + 0.16, 0.08, 0.26, 0, dh, D / 2 + 0.1, trim); for (const sx of [-1, 1]) slab(0.08, dh, 0.26, sx * (dw / 2 + 0.04), 0, D / 2 + 0.1, trim);
    const door = slab(dw - 0.04, dh - 0.02, 0.06, 0, 0, D / 2 + 0.12, 0x6A4A30); door.userData.door = true; RFP.door = door; slab(0.06, 0.06, 0.08, dw * 0.35, 1.0, D / 2 + 0.06, 0xD8A840);
    // 天花板
    slab(W + 0.6, 0.12, D + 0.6, 0, H, 0, cap);
    RFP.extra = g; RM.scene.add(g);
  }
  function roomFPSet(on) {
    if (!RM.renderer || !ctlPerson() || !ctlPerson().pos) { RFP.want = !!on; if (!on) RFP.on = false; return RFP.want; }   // 還沒準備好：等房間和人出現再切
    if (on && RM.theme && RM.theme.outdoor && !RM.theme.dark) on = false;
    RFP.on = !!on; RFP.want = !!on;
    if (RFP.on) {
      if (!RFP.cam) RFP.cam = new T.PerspectiveCamera(72, 1, 0.05, 60);
      roomFPWalls();
      RFP.yaw = 0; RFP.pitch = -0.08;   // 從門口進來：面向後牆（佈置最多的那面）
      fitRoomCam();
    } else {
      if (RFP.extra) { RM.scene.remove(RFP.extra); RFP.extra = null; }
      if (document.pointerLockElement === RM.renderer.domElement) document.exitPointerLock();
      for (const id in RM.ppl) RM.ppl[id].g.visible = true;
    }
    return RFP.on;
  }
  function roomFPCam() {
    const p = ctlPerson(); if (!p || !p.pos) return false;
    const eye = p.ch ? 1.48 * Math.min(1.1, p.ch.k || 1) : 1.0, y = (p.pose === "sit" ? 1.02 : p.pose === "lie" ? 0.45 : eye) + (p.pose === "stand" ? 0 : (p.destY || 0) * 0.3);
    const fx = -Math.sin(RFP.yaw), fz = -Math.cos(RFP.yaw);
    RFP.cam.position.set(p.pos.x + fx * 0.06, y, p.pos.z + fz * 0.06);
    RFP.cam.rotation.order = "YXZ"; RFP.cam.rotation.set(RFP.pitch, RFP.yaw, 0);
    p.g.visible = false;
    return true;
  }
  // 準心對到什麼：人（3 公尺內）或附近有座位的家具
  function roomFPAim() {
    if (!RFP.on || !RFP.cam) return null;
    const rc = new T.Raycaster(); rc.setFromCamera(new T.Vector2(0, 0), RFP.cam); rc.far = 3.2;
    const list = []; Object.values(RM.ppl).forEach(p => { if (RM.ctl && p.id === RM.ctl.id) return; if (p.ch) list.push(...p.ch.pickables()); else list.push(p.head); });
    const hp = rc.intersectObjects(list, false);
    if (hp.length) return { kind: "person", id: hp[0].object.userData.char };
    if (RFP.door) { const hd = rc.intersectObject(RFP.door, false); if (hd.length) { const hw = rc.intersectObjects(RM.group.children, true); if (!hw.length || hw[0].distance > hd[0].distance) return { kind: "exit" }; } }
    const hm = rc.intersectObjects(RM.group.children, true); if (!hm.length) return null;
    const pt = hm[0].point;
    const near = RM.spots.map(sp => [sp, Math.hypot(sp.x - pt.x, sp.z - pt.z)]).filter(([, d]) => d < 0.9).sort((a, b) => a[1] - b[1]);
    if (!near.length) return null;
    const opts = [], seen = new Set();
    for (const [sp] of near) { if (seen.has(sp.tag)) continue; seen.add(sp.tag); const A = SPOT_ACT[sp.tag] || SPOT_ACT.relax; opts.push({ icon: A[0], label: A[1], act: A[2], spot: sp }); }
    return { kind: "spot", opts, label: opts[0].label };
  }
  function roomFPInteract() {
    const a = roomFPAim(); if (!a || !RM.ctl) return;
    if (RFP.busy && RFP.busy()) return;
    if (a.kind === "exit" && document.pointerLockElement) document.exitPointerLock();
    const r = RM.renderer.domElement.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, H = RM.ctl.hooks;
    if (document.pointerLockElement) document.exitPointerLock();
    if (a.kind === "exit") { if (H.onExit) H.onExit(); return; }
    if (a.kind === "person") { if (H.onPerson) H.onPerson(a.id, cx, cy); }
    else if (H.onSpot) H.onSpot(a.opts, cx, cy);
  }
  function placeRoomCam() {
    if (RFP.want && !RFP.on && ctlPerson() && ctlPerson().pos) roomFPSet(true);
    if (RFP.on && roomFPCam()) return;
    const a = Math.PI / 4 + RM.az, e = 0.62, d = 30;
    // 操控中：鏡頭跟著那個人（放大之後才看得清楚）
    const tg = RM.camT || (RM.camT = new T.Vector3());
    const p = RM.ctl && RM.ppl[RM.ctl.id], want = p && p.pos ? p.pos : null;
    if (want) { const k = Math.max(0, (RM.camera.zoom - 1) / RM.camera.zoom); tg.lerp(new T.Vector3(want.x * k, 0, want.z * k), 0.08); }
    else tg.lerp(new T.Vector3(), 0.2);
    RM.camera.position.set(tg.x + Math.sin(a) * Math.cos(e) * d, Math.sin(e) * d + 0.7, tg.z + Math.cos(a) * Math.cos(e) * d);
    RM.camera.lookAt(tg.x, 0.55, tg.z);
  }
  function roomInit() {
    ensureMats();
    RM.renderer = new T.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
    RM.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    RM.renderer.shadowMap.enabled = true; RM.renderer.shadowMap.type = T.PCFShadowMap;   // 用 PCF 才能調模糊半徑，影子邊緣比較柔
    RM.renderer.domElement.className = "room-canvas";
    RM.scene = new T.Scene();
    RM.camera = new T.OrthographicCamera(-3, 3, 2, -2, 0.1, 100);
    RM.group = new T.Group(); RM.scene.add(RM.group);
    RM.hemi = new T.HemisphereLight(0xFFF3E2, 0x8A7868, 0.62); RM.scene.add(RM.hemi);
    RM.sun = new T.DirectionalLight(0xFFE2B8, 0.85); RM.sun.position.set(-7, 9, 5); RM.sun.castShadow = true;
    RM.sun.shadow.mapSize.set(1024, 1024); RM.sun.shadow.radius = 8; const sc = RM.sun.shadow.camera; sc.left = -5; sc.right = 5; sc.top = 5; sc.bottom = -5; sc.near = 1; sc.far = 30; RM.sun.shadow.bias = -0.0015;
    RM.scene.add(RM.sun);
    // 天花板吊燈（最多四盞）：衰減比較緩，整間比較平均地亮，不會中間一團亮、角落全黑
    RM.ceilLights = [0, 1, 2, 3].map(i => { const L = new T.PointLight(0xFFD6A0, 0, 13, 0.9); L.position.set(0, 2, 0); RM.scene.add(L); return L; });
    RM.lamp = RM.ceilLights[0];
    RM.lamp.shadow.mapSize.set(512, 512); RM.lamp.shadow.bias = -0.004; RM.lamp.shadow.radius = 9; RM.lamp.shadow.camera.near = 0.1;
    RM.plights = [0, 1, 2, 3, 4, 5, 6, 7].map(() => { const L = new T.PointLight(0xFFA050, 0, 4.2, 1.5); RM.scene.add(L); return L; });
    const el = RM.renderer.domElement;
    let start = null, moved = 0;
    el.addEventListener("pointerdown", e => { start = { x: e.clientX, y: e.clientY, t: performance.now(), yaw: RFP.yaw, pitch: RFP.pitch }; moved = 0; el.setPointerCapture && el.setPointerCapture(e.pointerId); if (RM.edit) editDown(e); });
    el.addEventListener("pointermove", e => {
      // 第一人稱：滑鼠鎖定時直接轉頭；手機（沒鎖定）用拖曳轉頭
      if (RFP.on && document.pointerLockElement === el) { RFP.yaw -= e.movementX * 0.0025; RFP.pitch = Math.max(-1.2, Math.min(1.1, RFP.pitch - e.movementY * 0.0025)); return; }
      if (RFP.on && start) { const dx = e.clientX - start.x, dy = e.clientY - start.y; moved = Math.max(moved, Math.abs(dx) + Math.abs(dy)); if (moved > 6) { RFP.yaw = start.yaw + dx * 0.006; RFP.pitch = Math.max(-1.2, Math.min(1.1, start.pitch + dy * 0.004)); } return; }
      if (RM.edit && !start) { editHover(e); return; }
      if (!start) return;
      const dx = e.clientX - start.x; moved = Math.max(moved, Math.abs(dx) + Math.abs(e.clientY - start.y));
      if (RM.edit && RM.edit.drag) { editMove(e); return; }
      if (moved > 6) { RM.az = Math.max(-0.55, Math.min(0.55, RM.az0 + dx * 0.006)); }
    });
    el.addEventListener("pointerdown", () => { RM.az0 = RM.az; });
    el.addEventListener("pointerup", e => {
      if (RM.edit) { editUp(e, moved); start = null; return; }
      if (RFP.on) {
        const tap = start && moved < 8 && performance.now() - start.t < 450; start = null;
        if (!tap) return;
        if (document.pointerLockElement === el) return roomFPInteract();
        if (matchMedia("(pointer:fine)").matches && !(RFP.busy && RFP.busy())) { el.requestPointerLock && el.requestPointerLock(); return; }
        return roomFPInteract();
      }
      if (start && moved < 8 && performance.now() - start.t < 450) roomTap(e.clientX, e.clientY);
      start = null;
    });
    el.addEventListener("pointercancel", () => { start = null; });
    // 縮放：滾輪或雙指
    el.addEventListener("wheel", e => { e.preventDefault(); if (RFP.on) return; RM.camera.zoom = Math.max(0.8, Math.min(3.2, RM.camera.zoom * (1 - e.deltaY * 0.0015))); RM.camera.updateProjectionMatrix(); }, { passive: false });
    const touches = new Map(); let pd = 0;
    el.addEventListener("touchstart", e => { if (e.touches.length === 2) { pd = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); start = null; } }, { passive: true });
    el.addEventListener("touchmove", e => {
      if (e.touches.length !== 2 || !pd) return;
      e.preventDefault();
      const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      RM.camera.zoom = Math.max(0.8, Math.min(3.2, RM.camera.zoom * d / pd)); pd = d; RM.camera.updateProjectionMatrix();
    }, { passive: false });
    el.addEventListener("touchend", e => { if (e.touches.length < 2) pd = 0; }, { passive: true });
  }
  function roomTap(cx, cy) {
    if (RM.ctl) return ctlTap(cx, cy);
    const r = RM.renderer.domElement.getBoundingClientRect();
    const v = new T.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    const rc = new T.Raycaster(); rc.setFromCamera(v, RM.camera);
    const list = []; Object.values(RM.ppl).forEach(p => { if (p.ch) list.push(...p.ch.pickables()); else list.push(p.head); });
    const hits = rc.intersectObjects(list, false);
    if (hits.length && RM.hooks.onChar) RM.hooks.onChar(hits[0].object.userData.char);
  }
  function roomFrame(now) {
    if (!RM.running) return;
    if (!RM.host || !RM.host.isConnected) { if (RM.edit) editClose(); else { roomStop(); return; } }
    RM.raf = requestAnimationFrame(roomFrame);
    const dt = Math.min(0.05, (now - (RM.last || now)) / 1000); RM.last = now;
    const tt = now / 1000;
    for (const id in RM.ppl) {
      const p = RM.ppl[id];
      p.g.visible = !RM.edit;
      if (!p.pos) continue;
      if (RM.ctl && RM.ctl.id === id) ctlStep(p, dt); else if (!RM.edit) roomWander(p, tt);
      while (p.path && p.path.length > 1 && p.pos.distanceTo(p.path[0]) < 0.03) p.path.shift();
      const tgt = p.path && p.path.length ? p.path[0] : p.dest;
      const d = tgt.clone().sub(p.pos); const len = d.length();
      let walking = false;
      if (len > 0.01) { p.wantYaw = Math.atan2(d.x, d.z); const step = Math.min(len, 1.3 * dt); p.pos.add(d.multiplyScalar(step / len)); walking = true; }
      if (p.manual) { walking = true; p.wantYaw = p.manual; }
      const pose = walking ? "stand" : p.destPose;
      if (pose !== p.pose) setRoomPose(p, pose);
      if (p.ch) {
        p.g.position.set(p.pos.x, pose === "stand" ? 0 : p.destY, p.pos.z);
        // 站著沒事時維持原本的方向（不再一律轉向鏡頭）；說話時面向對方
        const want = walking ? p.wantYaw : p.destYaw != null ? p.destYaw : p.yaw;
        p.yaw = turnTo(p.yaw, want, Math.min(1, dt * (walking ? 10 : pose !== "stand" ? 12 : 5)));
        p.ch.root.rotation.y = p.yaw;
        p.ch.update(dt, tt, { walking, asleep: p.asleep, talking: p.st.visible && !p.asleep && !!(RM.lastState && RM.lastState.talking && RM.lastState.talking.has(id)), act: walking ? null : p.actTag });
      } else {
      const y = pose === "stand" ? (walking ? Math.abs(Math.sin(tt * 10 + p.phase)) * 0.06 : 0) : p.destY;
      p.g.position.set(p.pos.x, y + (pose === "stand" && !walking ? Math.sin(tt * 2 + p.phase) * 0.01 : 0), p.pos.z);
      }
      if (p.ring.visible) { const s = 1 + Math.sin(tt * 4) * 0.08; p.ring.scale.set(s, s, s); }
      // 第一人稱：頭上的泡泡、名牌縮小（近看會太大）
      for (const o of [p.st, p.zz, p.name]) { if (!o.userData.s0) o.userData.s0 = o.scale.clone(); const k = RFP.on ? (o === p.name ? 0.55 : 0.45) : 1; o.scale.set(o.userData.s0.x * k, o.userData.s0.y * k, 1); }
      if (p.zz.visible) p.zz.position.y += Math.sin(tt * 1.5 + p.phase) * 0.0015;
    }
    placeRoomCam();
    if (RM.edit) editFrame(tt);
    const camR = RFP.on && RFP.cam ? RFP.cam : RM.camera;
    if (RFP.on && RFP.busy && document.pointerLockElement === RM.renderer.domElement && RFP.busy()) document.exitPointerLock();
    if (HQ()) { if (!RM.post) RM.post = makePost(RM.renderer, 0.25); RM.post.render(RM.scene, camR); } else RM.renderer.render(RM.scene, camR);
  }

  /* ═════════ 操控居民（房間裡） ═════════
   * 點地板：走過去　點家具：圓環選單（坐、睡、吃、讀書…）　點別人：圓環選單（聊天…）
   * 方向鍵／WASD／虛擬搖桿：直接走 */
  const SPOT_ACT = { sleep: ["😴", "睡一下", "在這裡睡一下"], relax: ["🛋️", "坐著休息", "坐著放空休息"], eat: ["🍽️", "吃點東西", "坐下來吃點東西"],
    study: ["📖", "讀書寫字", "坐下來讀書、寫東西"], work: ["🔧", "動手做事", "在工作台忙著做東西"], cook: ["🍳", "下廚", "在爐台前做吃的"], drum: ["🥁", "打鼓", "打了一段鼓"] };
  function ctlPerson() { return RM.ctl && RM.ppl[RM.ctl.id]; }
  function ctlSet(id, hooks) {
    if (!id) { if (RFP.on || RFP.want) roomFPSet(false); if (RM.ctl) { const p = RM.ppl[RM.ctl.id]; if (p) { p.manual = 0; p.ctlInit = false; } RM.camera.zoom = 1; RM.camera.updateProjectionMatrix(); } RM.ctl = null; return; }
    // 剛開始操控（或剛走進這個房間）：從他原本該在的位置重新站起來
    if (!RM.ctl || RM.ctl.id !== id) { const old = RM.ppl[id]; if (old) { RM.scene.remove(old.g); delete RM.ppl[id]; } }
    RM.ctl = { id, hooks: hooks || {}, spot: null, vx: 0, vz: 0 };
    const host = RM.host, portrait = host && host.clientHeight > host.clientWidth;
    RM.camera.zoom = portrait ? 1.9 : 1.3; RM.camera.updateProjectionMatrix();
    if (RM.lastState) roomUpdate(RM.lastState);
  }
  function roomPick(cx, cy) {
    const r = RM.renderer.domElement.getBoundingClientRect();
    const v = new T.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    const rc = new T.Raycaster(); rc.setFromCamera(v, RM.camera);
    return rc;
  }
  function ctlTap(cx, cy) {
    const H = RM.ctl.hooks, rc = roomPick(cx, cy);
    const list = []; Object.values(RM.ppl).forEach(p => { if (p.id === RM.ctl.id) return; if (p.ch) list.push(...p.ch.pickables()); else list.push(p.head); });
    const hp = rc.intersectObjects(list, false);
    if (hp.length) return H.onPerson && H.onPerson(hp[0].object.userData.char, cx, cy);
    // 家具：打到房間的方塊，看附近有沒有可以用的位置
    const hm = rc.intersectObjects(RM.group.children, true).filter(h => h.object.isInstancedMesh || h.object.isMesh);
    let pt = hm.length ? hm[0].point : null;
    if (!pt) { const pl = new T.Plane(new T.Vector3(0, 1, 0), 0), q = new T.Vector3(); if (rc.ray.intersectPlane(pl, q)) pt = q; }
    if (!pt) return;
    const near = RM.spots.map(sp => [sp, Math.hypot(sp.x - pt.x, sp.z - pt.z)]).filter(([, d]) => d < 0.9).sort((a, b) => a[1] - b[1]);
    const opts = [], seen = new Set();
    for (const [sp] of near) {
      if (seen.has(sp.tag)) continue; seen.add(sp.tag);
      const A = SPOT_ACT[sp.tag] || SPOT_ACT.relax;
      opts.push({ icon: A[0], label: A[1], act: A[2], spot: sp });
    }
    if (opts.length && pt.y > 0.12 && H.onSpot) return H.onSpot(opts, cx, cy);
    if (opts.length && H.onSpot && near[0][1] < 0.45) return H.onSpot(opts, cx, cy);
    ctlGo(new T.Vector3(pt.x, 0, pt.z));
  }
  // 走到某個點（站著），或走到某個座位做事
  function ctlGo(target, spot) {
    const p = ctlPerson(); if (!p || !RM.occ) return;
    RM.ctl.spot = spot || null; p.manual = 0;
    let dest = target;
    if (!spot) { const f = nearestFree(...cellOf(target)); dest = posOf(f[0], f[1]); }
    p.path = roomPath(p.pos, dest); p.dest = dest.clone();
    p.destPose = spot ? spot.pose : "stand"; p.destY = spot ? spot.y : 0; p.destYaw = spot ? spot.yaw : null;
    if (RM.lastState) roomUpdate(RM.lastState);
  }
  function ctlApproach(bid) {
    const p = ctlPerson(), q = RM.ppl[bid]; if (!p || !q) return;
    const d = p.pos.clone().sub(q.pos); d.y = 0; const L = d.length() || 1;
    if (L < 0.9) return;
    ctlGo(q.pos.clone().add(d.multiplyScalar(0.65 / L)));
  }
  function ctlUseSpot(opt) { ctlGo(new T.Vector3(opt.spot.x, 0, opt.spot.z), opt.spot); }
  // 直接走：vx、vz 是畫面上的方向（右、下），-1～1
  function ctlMove(vx, vz) { if (RM.ctl) { RM.ctl.vx = vx; RM.ctl.vz = vz; } }
  function ctlStep(p, dt) {
    const c = RM.ctl, m = Math.hypot(c.vx, c.vz);
    if (m < 0.15) { if (p.manual) { p.manual = 0; p.dest = p.pos.clone(); } return; }
    if (c.spot || p.path.length) { c.spot = null; p.path = []; p.destPose = "stand"; p.destY = 0; p.destYaw = null; }
    // 畫面方向換成房間座標（鏡頭從右前方 45° 看過來；第一人稱照視線方向）
    const a = RFP.on ? RFP.yaw : Math.PI / 4 + RM.az, rx = Math.cos(a), rz = -Math.sin(a), fx = -Math.sin(a), fz = -Math.cos(a);
    let dx = (c.vx * rx - c.vz * fx), dz = (c.vx * rz - c.vz * fz);
    const L = Math.hypot(dx, dz) || 1, sp = (RFP.on ? 1.3 : 1.7) * Math.min(1, m) * dt;
    dx = dx / L * sp; dz = dz / L * sp;
    const free = (x, z) => { const [cx, cz] = cellOf(new T.Vector3(x, 0, z)); return !occAt(cx, cz); };
    // 只檢查往前走的那一側（貼著家具也能沿著走），本來就卡住的話放他走出來
    const r = 0.16, stuck = !free(p.pos.x, p.pos.z);
    if (dx && (stuck || (free(p.pos.x + dx, p.pos.z) && free(p.pos.x + dx + Math.sign(dx) * r, p.pos.z)))) p.pos.x += dx;
    const z0 = p.pos.z;
    if (dz && (stuck || (free(p.pos.x, p.pos.z + dz) && free(p.pos.x, p.pos.z + dz + Math.sign(dz) * r)))) p.pos.z += dz;
    p.dest = p.pos.clone(); p.manual = Math.atan2(dx, dz);
    // 第一人稱走到大門口（前牆中間；門前擺了東西擋住的話，走到 1.5 公尺內往門走也算）：出門到街上
    if (RFP.on && RFP.door && dz > 0 && Math.abs(p.pos.x) < 0.7 && (p.pos.z > RM.D / 2 - 0.5 || (p.pos.z > RM.D / 2 - 1.5 && p.pos.z === z0)) && !RFP.leaving && c.hooks.onExit) { RFP.leaving = true; setTimeout(() => { RFP.leaving = false; }, 2500); c.hooks.onExit(); }
  }
  // 畫面座標（給圓環選單放位置）
  function ctlScreen() {
    const p = ctlPerson(); if (!p || !RM.renderer) return null;
    if (RFP.on) { const r = RM.renderer.domElement.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
    const v = p.pos.clone(); v.y = 1.2; v.project(RM.camera);
    const r = RM.renderer.domElement.getBoundingClientRect();
    return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height };
  }
  function roomStop() { RM.running = false; cancelAnimationFrame(RM.raf); }
  function roomMount(el, locId, hooks) {
    if (RM.edit) return Promise.resolve();    // 編輯中不要被拉回去
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
    const cid = RM.ctl && RM.ctl.id;
    const ids = here.filter(id => id === cid || floorOf(RM.loc, s.where[id]) === RM.floor);
    // 正在說話的人：站起來、圍在一起、面對彼此（不硬坐在原本的位置上）
    const talkPos = roomTalkPos(ids, cid, s);
    // 操控中的人自己選位置：他佔的那個座位不分給別人
    const spotsFree = RM.spots.filter(sp => !(RM.ctl && RM.ctl.spot === sp));
    const seats = spotsFree.length ? seatPeople({ spots: spotsFree }, ids.filter(id => id !== cid && !talkPos[id]), s.where) : {};
    const free = ids.filter(id => !seats[id] && !talkPos[id]);
    // 沒有家具可用的人：站在房間前半部
    const standAt = i => new T.Vector3(-RM.W / 2 + 0.7 + (i % 5) * ((RM.W - 1.4) / 4), 0, RM.D / 2 - 0.45 - Math.floor(i / 5) * 0.5);
    for (const id in RM.ppl) if (ids.indexOf(id) < 0) { RM.scene.remove(RM.ppl[id].g); delete RM.ppl[id]; }
    ids.forEach(id => {
      let p = RM.ppl[id];
      const seat = seats[id], tp = talkPos[id];
      let dest = tp ? tp.pos.clone() : seat ? new T.Vector3(seat.x, 0, seat.z) : (p && p.wdest ? p.wdest.clone() : standAt(free.indexOf(id)));
      if (!seat && !tp && RM.occ) { const f = nearestFree(...cellOf(dest)); dest = posOf(f[0], f[1]); }
      if (!p) { p = RM.ppl[id] = roomPerson(N.characters.find(c => c.id === id)); p.pos = dest.clone(); p.path = []; }
      p.free = !seat && !tp; if (!p.free) p.wdest = null;
      if (id === cid) {   // 操控中：位置、姿勢都由玩家決定
        if (!p.ctlInit) { p.ctlInit = true; p.path = []; if (RM.occ) { const f = nearestFree(...cellOf(p.pos)); p.pos.copy(posOf(f[0], f[1])); } p.dest = p.pos.clone(); p.destPose = "stand"; p.destY = 0; p.destYaw = null; }
        p.zz.visible = false; p.asleep = false; p.st.visible = !!(s.talking && s.talking.has(id)); p.ring.visible = true;
        const tk = Object.values(talkPos)[0];
        if (tk) { p.destYaw = Math.atan2(tk.pos.x - p.pos.x, tk.pos.z - p.pos.z); p.talkFaced = true; } else if (p.talkFaced) { p.destYaw = null; p.talkFaced = false; }
        p.name.material.color.set(0xFFE2A8); return;
      }
      p.ctlInit = false;
      const dk = dest.x.toFixed(2) + "," + dest.z.toFixed(2);
      if (p.destKey !== dk) { p.destKey = dk; p.path = p.pos.distanceTo(dest) > 0.05 ? roomPath(p.pos, dest) : []; }
      p.dest = dest; p.destPose = seat ? seat.pose : "stand"; p.destY = seat ? seat.y : 0; p.destYaw = tp ? tp.yaw : seat ? seat.yaw : null;
      p.actTag = seat ? seat.tag : null;
      const asleep = !s.where[id].avail;
      p.zz.visible = asleep; p.asleep = asleep;
      p.st.visible = !asleep && ((s.talking && s.talking.has(id)) || (s.hints && s.hints.has(id)));
      p.ring.visible = s.observing === id;
      p.head.material.opacity = asleep ? 0.8 : 1;
      p.name.material.color.set(s.observing === id ? 0xFFE2A8 : 0xFFFFFF);
    });
  }
  // 說話的人站在哪：以第一個（不是操控中的）說話的人現在的位置為中心，其他人圍在旁邊；同一段對話內位置不變
  function roomTalkPos(ids, cid, s) {
    const tset = s.talking || new Set(), talkers = ids.filter(id => tset.has(id) && s.where[id] && s.where[id].avail);
    const others = talkers.filter(id => id !== cid);
    if (talkers.length < 2 || !others.length || !RM.occ) { RM.talk = null; return {}; }
    const key = talkers.join("|");
    if (RM.talk && RM.talk.key === key) return RM.talk.pos;
    // 操控中的人在說話：大家走過來圍著他；不然以第一個說話的人站的地方為中心
    const cp0 = cid && talkers.includes(cid) && RM.ppl[cid];
    const p0 = cp0 || RM.ppl[others[0]];
    let anchor = p0 && p0.pos ? p0.pos.clone() : new T.Vector3(0, 0, 0.3);
    { const f = nearestFree(...cellOf(anchor)); anchor = posOf(f[0], f[1]); }
    const pos = cp0 ? {} : { [others[0]]: { pos: anchor } };
    (cp0 ? others : others.slice(1)).forEach((id, j) => {
      const q = RM.ppl[id];
      let a = q && q.pos ? Math.atan2(q.pos.x - anchor.x, q.pos.z - anchor.z) : j * 2;
      a += (j % 2 ? 1 : -1) * Math.ceil(j / 2) * 0.9;
      let v = new T.Vector3(anchor.x + Math.sin(a) * 0.75, 0, anchor.z + Math.cos(a) * 0.75);
      const f = nearestFree(...cellOf(v)); v = posOf(f[0], f[1]);
      pos[id] = { pos: v };
    });
    // 面向其他說話的人的中間（操控中的人用他現在的位置）
    const cp = cid && talkers.includes(cid) && RM.ppl[cid];
    for (const id in pos) {
      const me = pos[id].pos; let x = 0, z = 0, n = 0;
      for (const o in pos) if (o !== id) { x += pos[o].pos.x; z += pos[o].pos.z; n++; }
      if (cp) { x += anchor.x; z += anchor.z; n++; }
      pos[id].yaw = n ? Math.atan2(x / n - me.x, z / n - me.z) : null;
    }
    RM.talk = { key, pos };
    return pos;
  }
  // 沒有家具可用、也沒在說話的人：在房間裡隨便走走，停一陣子再換個地方
  function roomWander(p, tt) {
    if (!p.free || p.asleep || !RM.occ || tt < (p.wanderAt || 0)) return;
    p.wanderAt = tt + 14 + Math.random() * 26;
    for (let k = 0; k < 20; k++) {
      const v = new T.Vector3((Math.random() - 0.5) * (RM.W - 1.2), 0, (Math.random() - 0.5) * (RM.D - 1.2));
      const [cx, cz] = cellOf(v); if (occAt(cx, cz)) continue;
      p.wdest = posOf(cx, cz); p.dest = p.wdest.clone(); p.destKey = null; p.path = roomPath(p.pos, p.dest); p.destYaw = null;
      return;
    }
  }
  function roomEmote(id, name) { const p = RM.ppl[id]; if (p && p.ch && p.ch.emote) p.ch.emote(name); }
  function floorsOf(id) { const e = N.interiors && N.interiors[id]; return !e ? [{ items: [] }] : Array.isArray(e) ? [{ items: e }] : e.floors || [e]; }
  function floorOf(locId, w) {
    const fl = floorsOf(locId); if (fl.length < 2) return 0;
    if (!w.avail) return 1;
    return fl[1].match && new RegExp(fl[1].match).test(w.act || "") ? 1 : 0;
  }
  function floorUI() {
    const old = RM.host && RM.host.querySelector(".room-floors"); if (old) old.remove();
    if (RM.host && !RM.host.querySelector(".room-edit-btn")) {
      const eb = document.createElement("button"); eb.type = "button"; eb.className = "room-edit-btn"; eb.textContent = "✏️ 布置"; eb.title = "編輯房間";
      eb.addEventListener("click", e => { e.stopPropagation(); editOpen(); }); RM.host.appendChild(eb);
    }
    const fl = floorsOf(RM.loc); if (!RM.host || fl.length < 2) return;
    const box = document.createElement("div"); box.className = "room-floors";
    fl.forEach((f, i) => { const b = document.createElement("button"); b.type = "button"; b.dataset.rfloor = i; b.className = i === RM.floor ? "on" : ""; b.textContent = f.name.split("・")[0]; box.appendChild(b); });
    box.addEventListener("click", e => {
      const b = e.target.closest("[data-rfloor]"); if (!b) return;
      e.stopPropagation();
      RM.floor = +b.dataset.rfloor; RM.autoFloor = false; buildRoom(RM.loc); floorUI();
      const cp = ctlPerson(); if (cp) { cp.ctlInit = false; RM.ctl.spot = null; if (RM.ctl.hooks.onFloor) RM.ctl.hooks.onFloor(RM.floor); }
      if (RM.lastState) roomUpdate(RM.lastState);
    });
    RM.host.appendChild(box);
  }
  /* ═════════ 房間編輯器 ═════════
   * 擺設存在 localStorage「novum-rooms」，跟遊戲進度分開：{ "地點#樓層": { items: [...], theme: {...} } }
   * 家具格式跟 data/interiors.js 一樣：[種類, u, v, 選項]。居民的座位會照新的擺設重算。 */
  const ROOM_KEY = "novum-rooms";
  let editsCache = null;
  function roomEdits() {
    if (!editsCache) { try { editsCache = JSON.parse(localStorage.getItem(ROOM_KEY) || "{}") || {}; } catch (e) { editsCache = {}; } }
    return editsCache;
  }
  function saveEdits() { try { localStorage.setItem(ROOM_KEY, JSON.stringify(roomEdits())); } catch (e) { /* 存不下就算了 */ } }
  function exportEdits() { return JSON.stringify({ app: "novum-rooms", v: 1, rooms: roomEdits() }); }
  function importEdits(text) {
    const d = JSON.parse(text); if (!d || d.app !== "novum-rooms" || !d.rooms) throw new Error("bad");
    editsCache = d.rooms; saveEdits(); if (RM.loc) buildRoom(RM.loc);
  }
  const FURN = [
    ["bed", "床"], ["sofa", "沙發"], ["beanbag", "懶骨頭"], ["readchair", "閱讀椅"], ["gamechair", "電競椅"], ["hammock", "吊床"],
    ["table", "餐桌", { seats: 2 }], ["longtable", "長桌"], ["desk", "書桌"], ["computer", "電腦桌"], ["magicdesk", "魔法書桌"], ["typewriter", "打字機"],
    ["shelf", "書櫃"], ["sideboard", "矮櫃"], ["curio", "展示櫃"], ["nightstand", "床頭櫃"], ["coffeetable", "茶几"], ["island", "展示台"], ["bookpile", "書堆"], ["filing", "檔案櫃"], ["lockers", "置物櫃"], ["clothes", "衣架"], ["vanity", "梳妝台"], ["mirror", "鏡子"],
    ["fridge", "冰箱"], ["stove", "爐台"], ["counter", "吧台", { low: true }], ["oven", "麵包窯"], ["breadrack", "麵包架"],
    ["rug", "地毯", { w: 1.4, d: 1, c: 0xC8A882 }], ["plant", "盆栽"], ["flowers", "花"], ["lamp", "立燈"], ["candles", "蠟燭"], ["fireplace", "壁爐"],
    ["clock", "掛鐘"], ["frames", "相框"], ["wallshelf", "壁架"], ["sconce", "壁燈"], ["hangplant", "吊盆"], ["pots", "小盆栽"], ["poster", "海報"], ["board", "白板"], ["map", "地圖"], ["globe", "地球儀"], ["telescope", "望遠鏡"], ["record", "唱盤"],
    ["drums", "鼓組"], ["catbed", "貓窩"], ["boxes", "紙箱"], ["crates", "木箱"], ["skulls", "頭骨"], ["crystal", "水晶"], ["cauldron", "魔藥鍋"],
    ["vending", "販賣機"], ["bench", "長椅"], ["tree", "樹"], ["bush", "灌木"], ["streetlamp", "路燈"], ["fountain", "噴泉"]
  ];
  const FNAME = Object.assign({ menuboard: "菜單板", stairs: "樓梯", pans: "鍋具", catbed: "貓窩", herbs: "香草", lanterns: "燈籠", sign: "招牌", stall: "攤位", machine: "機器",
    servers: "伺服器", cables: "電線", ledstrip: "燈條", ritual: "法陣", dimbox: "異次元箱", labelwall: "標籤牆", junk: "雜物", hammock: "吊床", scrolls: "卷軸", altar: "祭壇",
    bench2: "長凳", display: "展示櫃", mannequin: "假人", podium: "講台", classroom: "課桌椅", caseboard: "線索板", radios: "收音機", parts: "零件", toolwall: "工具牆",
    welder: "焊接台", tank: "水箱", candle: "蠟燭", lights: "燈串", stars: "星星", starwall: "星空牆", perch: "棲木", rods: "釣竿", dock: "碼頭", water: "水", rocks: "石頭",
    path: "小路", statue: "雕像", well: "水井", trash: "垃圾桶", hydrant: "消防栓", newsstand: "書報攤", awning: "遮陽棚", banners: "旗子", bunting: "彩旗", snacks: "零食",
    medkit: "急救箱", sheets: "紙張", clippings: "剪報", mag: "雜誌", spray: "噴漆", graffiti: "塗鴉", amp: "音箱", arm: "機械手臂", gears: "齒輪", chimes: "風鈴",
    dryplant: "乾燥花", butterflies: "蝴蝶", lifebuoy: "救生圈", net: "網子", mount: "掛架", rails: "欄杆", platform: "月台", clocktower: "鐘塔", stonelamp: "石燈", ladder: "梯子" },
    Object.fromEntries(FURN.map(f => [f[0], f[1]])));
  const WALLS = [[0xEDE2D0, 0xB08A68], [0xF2E0E4, 0xA88068], [0xDCE8E2, 0x6E8A80], [0xE4E0F0, 0x7A6E9A], [0xF4E4C0, 0x9A7A4A], [0x3E2C3E, 0x2E201C], [0x2A3A4A, 0x1E2A36], [0xF6F4EE, 0x8A8A8A]];
  const FLOORS = [[0xB88A5E, 0xA87A50, 0xC0946A], [0x8A5E3E, 0x7A5034, 0x946A48], [0x4A3428, 0x3E2C22, 0x54392C], [0xD8CCB8, 0xCCC0AC, 0xE0D4C0], [0x9AA0A8, 0x8C929A, 0xA8AEB6], [0xC8A0A8, 0xBC94A0, 0xD4ACB2], [0x7A9A6A, 0x6E8E5E, 0x86A676], [0x3A3E4A, 0x323640, 0x444854]];
  const hex = n => "#" + n.toString(16).padStart(6, "0");
  function editKey() { return RM.loc + "#" + Math.min(RM.floor, floorsOf(RM.loc).length - 1); }
  function curEdit(create) {
    const k = editKey(), E = roomEdits();
    if (!E[k] && create) E[k] = { items: JSON.parse(JSON.stringify(RM.spec || [])) };
    return E[k];
  }
  const placeOf = (u, v) => [-RM.W / 2 + 0.35 + u * (RM.W - 0.7), -RM.D / 2 + 0.1 + v * (RM.D - 0.5)];
  const uvOf = (x, z) => [Math.max(0, Math.min(1, (x + RM.W / 2 - 0.35) / (RM.W - 0.7))), Math.max(0, Math.min(1, (z + RM.D / 2 - 0.1) / (RM.D - 0.5)))];
  function floorPoint(e) {
    const r = RM.renderer.domElement.getBoundingClientRect();
    const v = new T.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    const rc = new T.Raycaster(); rc.setFromCamera(v, RM.camera);
    const hit = new T.Vector3(); return rc.ray.intersectPlane(new T.Plane(new T.Vector3(0, 1, 0), -0.05), hit) ? hit : null;
  }
  function nearestItem(pt) {
    let best = -1, bd = 0.55;
    RM.spec.forEach(([t, u, v], i) => { const [x, z] = placeOf(u, v), d = Math.hypot(x - pt.x, z - pt.z); if (d < bd) { bd = d; best = i; } });
    return best;
  }
  function pushHistory() { const E = curEdit(true); RM.edit.hist.push(JSON.stringify(E)); if (RM.edit.hist.length > 40) RM.edit.hist.shift(); }
  function rebuild() { saveEdits(); buildRoom(RM.loc); editPanel(); }
  function editDown(e) {
    const pt = floorPoint(e); if (!pt) return;
    const i = nearestItem(pt);
    if (i >= 0) { RM.edit.sel = i; RM.edit.drag = { i, x: pt.x, z: pt.z, moved: false }; editPanel(); }
    else { RM.edit.drag = null; }
  }
  function editMove(e) {
    const pt = floorPoint(e); if (!pt) return;
    const d = RM.edit.drag; d.x = Math.round(pt.x * 10) / 10; d.z = Math.round(pt.z * 10) / 10; d.moved = true;
  }
  function editHover(e) { const pt = floorPoint(e); RM.edit.hover = pt ? nearestItem(pt) : -1; RM.renderer.domElement.style.cursor = RM.edit.hover >= 0 ? "grab" : ""; }
  function editUp(e, moved) {
    const d = RM.edit.drag; RM.edit.drag = null;
    if (d && d.moved && moved > 4) {
      pushHistory(); const E = curEdit(true), it = E.items[d.i]; const [u, v] = uvOf(d.x, d.z);
      it[1] = Math.round(u * 1000) / 1000; it[2] = Math.round(v * 1000) / 1000; rebuild();
    } else if (!d && moved < 6) { RM.edit.sel = -1; editPanel(); }
  }
  function act(kind, arg) {
    const sel = RM.edit.sel;
    if (kind === "undo") { const h = RM.edit.hist.pop(); if (!h) return; roomEdits()[editKey()] = JSON.parse(h); RM.edit.sel = -1; return rebuild(); }
    if (kind === "reset") { if (!confirmReset()) return; pushHistory(); delete roomEdits()[editKey()]; RM.edit.sel = -1; return rebuild(); }
    if (kind === "add") {
      pushHistory(); const E = curEdit(true), f = FURN.find(x => x[0] === arg);
      E.items.push([arg, 0.5, 0.55, Object.assign({}, f && f[2] || {})]); RM.edit.sel = E.items.length - 1; RM.edit.tab = ""; return rebuild();
    }
    if (kind === "wall" || kind === "floor") {
      pushHistory(); const E = curEdit(true); E.theme = E.theme || {};
      if (kind === "wall") { const [w, wn] = WALLS[arg]; Object.assign(E.theme, { wall: w, wall2: w, wain: wn }); }
      else { const f = FLOORS[arg]; Object.assign(E.theme, { floor: f.slice(), seam: f[1] - 0x101010 > 0 ? f[1] - 0x101010 : f[1] }); }
      return rebuild();
    }
    if (sel < 0) return;
    pushHistory(); const E = curEdit(true), it = E.items[sel]; if (!it) return;
    if (kind === "rot") { it[3] = Object.assign({}, it[3] || {}); it[3].rot = (((it[3].rot || 0) + 90) % 360 + 360) % 360; }
    if (kind === "del") { E.items.splice(sel, 1); RM.edit.sel = -1; }
    if (kind === "dup") { const c = JSON.parse(JSON.stringify(it)); c[1] = Math.min(1, c[1] + 0.08); c[2] = Math.min(1, c[2] + 0.06); E.items.push(c); RM.edit.sel = E.items.length - 1; }
    if (kind === "nudge") { const [dx, dz] = arg, [x, z] = placeOf(it[1], it[2]), [u, v] = uvOf(x + dx * 0.1, z + dz * 0.1); it[1] = u; it[2] = v; }
    rebuild();
  }
  let resetAsk = 0;
  function confirmReset() { const now = Date.now(); if (now - resetAsk < 2500) { resetAsk = 0; return true; } resetAsk = now; toastEd("再按一次「恢復原樣」就會清掉這一層的改動"); return false; }
  function toastEd(t) { const el = RM.edit && RM.edit.box.querySelector(".red-toast"); if (!el) return; el.textContent = t; el.hidden = false; clearTimeout(el._t); el._t = setTimeout(() => { el.hidden = true; }, 2400); }
  // 選取標記：腳下一圈黃框
  function editFrame(tt) {
    if (!RM.edit.mark) {
      const m = new T.Mesh(new T.RingGeometry(0.34, 0.42, 4, 1), new T.MeshBasicMaterial({ color: 0xFFC94A, transparent: true, opacity: 0.95, depthTest: false }));
      m.rotation.x = -Math.PI / 2; m.rotation.z = Math.PI / 4; m.renderOrder = 10; RM.scene.add(m); RM.edit.mark = m;
      const h = m.clone(); h.material = new T.MeshBasicMaterial({ color: 0xFFFFFF, transparent: true, opacity: 0.45, depthTest: false }); RM.scene.add(h); RM.edit.hmark = h;
    }
    const m = RM.edit.mark, h = RM.edit.hmark, sel = RM.edit.sel, it = RM.spec[sel];
    if (RM.edit.drag && RM.edit.drag.moved) { m.visible = true; m.position.set(RM.edit.drag.x, 0.06, RM.edit.drag.z); }
    else if (it) { const [x, z] = placeOf(it[1], it[2]); m.visible = true; m.position.set(x, 0.06, z); }
    else m.visible = false;
    m.scale.setScalar(1 + Math.sin(tt * 5) * 0.06);
    const hv = RM.spec[RM.edit.hover];
    if (hv && RM.edit.hover !== sel && !RM.edit.drag) { const [x, z] = placeOf(hv[1], hv[2]); h.visible = true; h.position.set(x, 0.05, z); } else h.visible = false;
  }
  function editPanel() {
    if (!RM.edit) return;
    const box = RM.edit.box, sel = RM.spec[RM.edit.sel], tab = RM.edit.tab, out = (RM.theme || {}).outdoor;
    const fl = floorsOf(RM.loc);
    box.querySelector(".red-title").innerHTML = `✏️ ${RM.loc}${fl.length > 1 ? "・" + fl[Math.min(RM.floor, fl.length - 1)].name.split("・")[0] : ""}${curEdit(false) ? ' <small>已改過</small>' : ""}`;
    box.querySelector(".red-sel").innerHTML = sel
      ? `<b>${FNAME[sel[0]] || "物品"}</b><button data-ed="rot" title="旋轉（R）">↻ 旋轉</button><button data-ed="dup" title="複製（D）">⧉ 複製</button><button data-ed="del" class="danger" title="刪除（Delete）">🗑 刪除</button>`
      : `<span class="red-hint">點家具選取，按住拖曳移動；點空地轉視角</span>`;
    const tb = box.querySelector(".red-tray");
    tb.hidden = !tab;
    if (tab === "add") tb.innerHTML = `<div class="red-grid">${FURN.map(f => `<button data-ed="add" data-arg="${f[0]}">${f[1]}</button>`).join("")}</div>`;
    else if (tab === "paint") tb.innerHTML = out ? `<p class="red-hint">戶外的地方沒有牆和地板可以換</p>`
      : `<div class="red-sw"><span>牆</span>${WALLS.map((w, i) => `<button data-ed="wall" data-arg="${i}" style="background:linear-gradient(${hex(w[0])} 60%, ${hex(w[1])} 60%)"></button>`).join("")}</div>
         <div class="red-sw"><span>地板</span>${FLOORS.map((f, i) => `<button data-ed="floor" data-arg="${i}" style="background:repeating-linear-gradient(90deg, ${hex(f[0])} 0 8px, ${hex(f[2])} 8px 16px)"></button>`).join("")}</div>`;
    else if (tab === "file") tb.innerHTML = `<p class="red-hint">房間的擺設只存在這台裝置。換手機或電腦時，先匯出成檔案，再到另一邊匯入。</p>
         <div class="red-row"><button data-ed="export">⬇ 匯出全部房間</button><label class="red-file">⬆ 匯入<input type="file" accept=".json,application/json" hidden></label></div>`;
    box.querySelectorAll("[data-tab]").forEach(b => b.classList.toggle("on", b.dataset.tab === tab));
    requestAnimationFrame(fitRoomCam);   // 下面的面板變高變矮時，房間畫面跟著縮放
  }
  function editOpen() {
    if (!RM.renderer || RM.edit) return;
    const home = RM.host;
    const box = document.createElement("div"); box.className = "room-editor";
    box.innerHTML = `<div class="red-top"><div class="red-title"></div><button data-ed="undo" title="復原（Ctrl+Z）">↶</button><button data-ed="done" class="primary">完成</button></div>
      <div class="red-stage"></div>
      <div class="red-toast" hidden></div>
      <div class="red-bottom"><div class="red-sel"></div><div class="red-tray" hidden></div>
        <div class="red-tabs"><button data-tab="add">➕ 家具</button><button data-tab="paint">🎨 牆和地板</button><button data-tab="file">💾 匯出入</button><button data-ed="reset">↺ 恢復原樣</button></div></div>`;
    document.body.appendChild(box); document.body.classList.add("room-editing");
    const stage = box.querySelector(".red-stage");
    RM.edit = { sel: -1, hist: [], tab: "", box, home, drag: null, hover: -1 }; RM.autoFloor = false;
    RM.host = stage; stage.appendChild(RM.renderer.domElement); RM.camera.zoom = 1.15; RM.camera.updateProjectionMatrix(); fitRoomCam();
    box.addEventListener("click", e => {
      const t = e.target.closest("[data-tab]"); if (t) { RM.edit.tab = RM.edit.tab === t.dataset.tab ? "" : t.dataset.tab; return editPanel(); }
      const b = e.target.closest("[data-ed]"); if (!b) return;
      const k = b.dataset.ed;
      if (k === "done") return editClose();
      if (k === "export") {
        const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([exportEdits()], { type: "application/json" }));
        a.download = "諾文小鎮_房間擺設.json"; document.body.appendChild(a); a.click(); a.remove(); return;
      }
      act(k, b.dataset.arg != null ? (isNaN(+b.dataset.arg) ? b.dataset.arg : +b.dataset.arg) : undefined);
    });
    box.addEventListener("change", e => {
      const f = e.target.files && e.target.files[0]; if (!f) return;
      f.text().then(t => { importEdits(t); editPanel(); toastEd("匯入好了"); }).catch(() => toastEd("這個檔案讀不了"));
    });
    RM.edit.key = e => {
      if (!RM.edit || /INPUT|TEXTAREA/.test(document.activeElement && document.activeElement.tagName)) return;
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && k === "z") { e.preventDefault(); act("undo"); }
      else if (k === "r") act("rot"); else if (k === "d") act("dup");
      else if (k === "delete" || k === "backspace") { e.preventDefault(); act("del"); }
      else if (k === "escape") editClose();
      else if (k.startsWith("arrow")) { e.preventDefault(); act("nudge", { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] }[k]); }
    };
    window.addEventListener("keydown", RM.edit.key);
    RM.edit.rs = () => fitRoomCam(); window.addEventListener("resize", RM.edit.rs);
    editPanel();
  }
  function editClose() {
    const E = RM.edit; if (!E) return;
    window.removeEventListener("keydown", E.key); window.removeEventListener("resize", E.rs);
    if (E.mark) { RM.scene.remove(E.mark); RM.scene.remove(E.hmark); }
    RM.edit = null; RM.host = E.home; E.home.insertBefore(RM.renderer.domElement, E.home.firstChild);
    E.box.remove(); document.body.classList.remove("room-editing");
    RM.renderer.domElement.style.cursor = ""; RM.camera.zoom = 1; RM.camera.updateProjectionMatrix();
    fitRoomCam(); floorUI(); if (RM.lastState) roomUpdate(RM.lastState);
  }
  function roomHas(locId) { return !!(N.interiors && N.interiors[locId]); }
  N.room3d = { supported, has: roomHas, mount: roomMount, update: roomUpdate, stop: roomStop, edit: editOpen, exportEdits, importEdits,
    _dbg: () => ({ RFP, RM }),
    fp: on => roomFPSet(on === undefined ? !(RFP.on || RFP.want) : on), isFP: () => RFP.on, aim: () => roomFPAim(), interact: () => roomFPInteract(), setBusy: fn => { RFP.busy = fn; },
    emote: roomEmote, control: ctlSet, ctlGo: (x, z) => ctlGo(new T.Vector3(x, 0, z)), ctlUseSpot, ctlMove, ctlScreen, ctlApproach, floors: () => floorsOf(RM.loc).length, setFloor: i => { if (RM.floor !== i) { RM.floor = i; buildRoom(RM.loc); floorUI(); const p = ctlPerson(); if (p) { p.ctlInit = false; if (RM.ctl) RM.ctl.spot = null; } if (RM.lastState) roomUpdate(RM.lastState); } }, curFloor: () => RM.floor };

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
    mmShow(false);
    host = null;
  }
  function pause(p) {
    if (!built || !host) return;
    if (p) { running = false; cancelAnimationFrame(raf); }
    else if (!running) { running = true; lastT = 0; raf = requestAnimationFrame(frame); }
  }
  let festKey = "";
  const SIT_RE = /吃|喝|餐|茶|咖啡|點心|讀|書|看|寫|畫|休息|坐|發呆|曬太陽|野餐|聊|餵|等|歇/;
  // 小鎮上說話的人：以第一個說話的人（操控中的人在場就以他）為中心圍成一圈、面向中間
  function townTalkPos(loc, talkers, s) {
    const out = {}; if (!talkers.length) return out;
    const tc = TC && walkers[TC.id] && (s.talking || []).indexOf(TC.id) >= 0 ? walkers[TC.id] : null;
    if (!tc && talkers.length < 2) return out;
    const key = loc + "|" + talkers.join("|") + (tc ? "|tc" : "");
    if (TALK[loc] && TALK[loc].key === key) return TALK[loc].pos;
    const a0 = tc ? tc.pos.clone() : (walkers[talkers[0]].dest || walkers[talkers[0]].pos).clone();
    const n = talkers.length + (tc ? 1 : 0), r = n > 2 ? 1.0 : 0.85;
    const cen = tc ? a0 : a0.clone();
    talkers.forEach((id, i) => {
      if (!tc && i === 0) { out[id] = { pos: a0.clone() }; return; }
      const w = walkers[id], j = tc ? i : i - 1;
      let a = Math.atan2(w.pos.x - a0.x, w.pos.z - a0.z) + (j % 2 ? 1 : -1) * Math.ceil(j / 2) * 0.8;
      out[id] = { pos: new T.Vector3(a0.x + Math.sin(a) * r, 0, a0.z + Math.cos(a) * r) };
    });
    for (const id in out) {
      const me = out[id].pos; let x = 0, z = 0, k = 0;
      for (const o in out) if (o !== id) { x += out[o].pos.x; z += out[o].pos.z; k++; }
      if (tc) { x += cen.x; z += cen.z; k++; }
      out[id].yaw = k ? Math.atan2(x / k - me.x, z / k - me.z) : null;
    }
    TALK[loc] = { key, pos: out };
    return out;
  }
  const TALK = {}; let ENC_TALK = new Set();
  function townEmote(id, name) { const w = walkers[id]; if (w && w.ch && w.ch.emote) w.ch.emote(name); }
  function update(s) {
    if (!built) return;
    PH.real = s; s = photoState(s);
    state = s;
    applySky(s.min, s.weather);
    // 居民位置
    // 提早出門：下一個行程在幾分鐘後、走過去要花的時間（照現在的時間流速換算）已經不夠了，就先出發，準時到
    const groups = {}, rate = s.rate == null ? 1 : s.rate, early = {};
    for (const c of N.characters) {
      const w = s.where[c.id]; if (!w || !lots[w.loc]) continue;
      let loc = w.loc;
      const a = s.ahead && s.ahead[c.id], wk = walkers[c.id];
      if (a && lots[a.loc] && wk && !firstPlace && rate > 0 && !(TC && TC.id === c.id)) {
        const L2 = lots[a.loc], dist = Math.hypot(wk.pos.x - L2.x, wk.pos.z - L2.z) * 1.3 + 4;
        if (a.in <= dist / WALK / 60 * rate + 0.5) { loc = a.loc; early[c.id] = true; }
      }
      (groups[loc] = groups[loc] || []).push(c.id);
    }
    for (const id in lots) {
      const L = lots[id], n = (groups[id] || []).length;
      L.occ = n;
      if (L.open && !(L.type === "lake" && GRID.lakeCell)) continue;   // 地下湖在地底：跟室內一樣用人數牌子
      if (L.badgeN !== n) {
        if (L.badge) { root.remove(L.badge); L.badge.material.map.dispose(); L.badge.material.dispose(); L.badge = null; }
        if (n) { L.badge = textSprite("👤 " + n, { size: 28, bg: "rgba(168,118,51,.95)", fg: "#fff", pad: 12, h: 0.6 }); L.badge.position.set(L.x + 2.1, L.h + 0.4, L.z); L.badge.userData.loc = id; L.badge.renderOrder = 6; root.add(L.badge); }
        L.badgeN = n;
      }
    }
    const tset = new Set(s.talking || []); ENC_TALK = tset; const bucket = Math.floor(Date.now() / 40000);
    for (const loc in groups) {
      const ids = groups[loc].filter(id => !(TC && TC.id === id)), L0 = lots[loc];   // 操控中的人自己走
      // 戶外平台：只有在吃東西、讀書、休息、聊天的人才坐下（跟房間畫面同一套座位）；其他人站著，隔一陣子換個地方站
      const seatList = L0 && L0.plat ? L0.plat.spots.filter(sp => sp.pose === "sit") : [], off = hashStr(loc) % Math.max(1, seatList.length);
      const stands = L0 && L0.plat ? L0.plat.stand : [];
      const underground = L0 && L0.type === "lake" && GRID.lakeCell;
      const talkers = underground ? [] : ids.filter(id => tset.has(id) && s.where[id].avail), talk = townTalkPos(loc, talkers, s);
      let si = 0;
      ids.forEach((id, i0) => {
        const tp = talk[id], sitter = !tp && s.where[id].avail && SIT_RE.test(s.where[id].act || "");
        const seat = sitter && si < seatList.length ? seatList[(off + si++) % seatList.length] : null;
        const st = !seat && !tp && stands.length ? stands[(hashStr(id) + bucket * 7 + i0 * 3) % stands.length] : null;
        const wk = walkers[id], dest = tp ? tp.pos.clone() : seat ? new T.Vector3(seat.x, 0, seat.z) : st ? new T.Vector3(st[0], 0, st[1]) : spotFor(loc, i0, ids.length);
        wk.destPose = seat ? seat.pose : "stand"; wk.destY = seat ? seat.y : 0; wk.destYaw = tp ? tp.yaw : seat ? seat.yaw : null;
        wk.actTag = seat ? seat.tag : null;
        wk.asleep = !s.where[id].avail && !early[id];
        if (firstPlace || !wk.loc) { wk.pos.copy(dest); wk.g.position.copy(dest); wk.loc = loc; wk.path = []; wk.dest = dest; return; }
        if (wk.loc !== loc) {
          const far = wk.pos.distanceTo(dest);
          routeTo(wk, dest, loc);
          const total = wk.path.reduce((acc, p, k) => acc + p.distanceTo(k ? wk.path[k - 1] : wk.pos), 0) || far;
          // 走路速度：一般約 1.6 公尺／秒（1 單位＝1.6 公尺），路很遠時快走到約 2.9 公尺／秒（不再一下就瞬移過去）
          wk.speed = WALK * (0.94 + (hashStr(id) % 13) / 100);   // 跟第一人稱差不多，每個人快慢差一點點
          wk.loc = loc; wk.dest = dest;
        } else if (!wk.dest || wk.dest.distanceTo(dest) > 0.05) {
          if (!wk.path.length && !wk.train) wk.path = [dest];
          else if (wk.path.length) wk.path[wk.path.length - 1] = dest;
          else wk.trainTo = dest;
          wk.dest = dest; wk.speed = wk.speed || WALK;
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
    flyTo((b[0] + b2[0]) / 2 + 7, (b[1] + b2[1]) / 2 + 10.5, 40);
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
  function home() { flyTo(GRID.plaza.x + 7, GRID.plaza.z + 10, 48); }
  /* ═════════ 在小鎮上操控（戶外地點） ═════════
   * 小鎮的走路格子：房子、裝飾街區、平台上的家具會擋路；馬路、人行道、門前小路、平台空地可以走。
   * 點地面走過去（A* 找路），鍵盤／搖桿直接走；點別人、點長椅出圓環選單；走到室內地點的門口就進去。 */
  const WG = { C: 0.35, data: null };
  function walkGrid() {
    if (WG.data) return WG;
    const C = WG.C, xs = GRID.cells.map(c => c.x), zs = GRID.cells.map(c => c.z);
    WG.x0 = Math.min(Math.min(...xs) - 14, COAST.isle ? COAST.isle.x - COAST.isle.R - 4 : 1e9); WG.z0 = Math.min(...zs) - 14; WG.nx = Math.ceil((Math.max(...xs) + GRID.BW + 14 - WG.x0) / C); WG.nz = Math.ceil((Math.max(...zs) + GRID.BD + 14 - WG.z0) / C);
    const d = WG.data = new Uint8Array(WG.nx * WG.nz), wc = WG.cost = new Uint8Array(WG.nx * WG.nz).fill(1);
    // 能走的：馬路、濱海步道（岸線往內 4.4）；海和城外的田不走
    for (let cz = 0; cz < WG.nz; cz++) for (let cx = 0; cx < WG.nx; cx++) {
      const x = WG.x0 + (cx + 0.5) * C, z = WG.z0 + (cz + 0.5) * C;
      const sea = GRID.coastDist(x, z) < 0.95;
      const prom = !sea && GRID.coastDist(x, z) < 4.7;
      if (sea || (!prom && !GRID.onRoad(x, z))) d[cz * WG.nx + cx] = 1;
      else if (!prom && !GRID.walkway(x, z)) wc[cz * WG.nx + cx] = 5;   // 車道：能走但很貴，居民會走人行道、過馬路時直直穿過去
      // 石拱橋和離島可以走
      const Bd = COAST.bridge; if (Bd) { const s2 = (x - Bd.xa) * Bd.ux + (z - Bd.za) * Bd.uz, o = Math.abs(-(x - Bd.xa) * Bd.uz + (z - Bd.za) * Bd.ux); if (s2 > -1 && s2 < Bd.L + 0.5 && o < Bd.W / 2 - 0.35) d[cz * WG.nx + cx] = 0; }
      const I = COAST.isle; if (I && I.rrAt(x - I.x, z - I.z) < 0.8) d[cz * WG.nx + cx] = 0;
    }
    const rect = (x0, x1, z0, z1) => {
      const a0 = Math.max(0, Math.floor((x0 - WG.x0) / C)), a1 = Math.min(WG.nx - 1, Math.floor((x1 - WG.x0) / C));
      const b0 = Math.max(0, Math.floor((z0 - WG.z0) / C)), b1 = Math.min(WG.nz - 1, Math.floor((z1 - WG.z0) / C));
      for (let cz = b0; cz <= b1; cz++) for (let cx = a0; cx <= a1; cx++) d[cz * WG.nx + cx] = 1;
    };
    for (const c of GRID.cells) if (c.kind === "near" || c.kind === "far" || c.kind === "harbor") rect(c.x - 0.3, c.x + 14.3, c.z - 0.3, c.z + 21.3);
    // 地下湖的岩丘（城邊那一格）：整座山擋起來，只留洞口往裡走的隧道
    { const lk = Object.keys(lots).find(id => lots[id].type === "lake"), L = lk && lots[lk], c = GRID.lakeCell;
      if (L && c) rect(c.x - 0.3, c.x + 14.3, c.z - 0.3, L.z + LAKE.mouth - 0.1); }
    for (const [px, pz] of COAST.railPiers || []) rect(px - 0.45, px + 0.45, pz - 0.6, pz + 0.6);   // 高架鐵路的橋墩
    // 給居民找路用的版本：車道擋起來，只留路口（兩條街交會的那一塊）可以穿過
    { const ped = WG.ped = d.slice(), X = GRID.xr, Z = GRID.zr, hw = GRID.AW / 2 + 0.2;
      for (let cz = 0; cz < WG.nz; cz++) for (let cx = 0; cx < WG.nx; cx++) {
        const k = cz * WG.nx + cx; if (d[k] || WG.cost[k] === 1) continue;
        const x = WG.x0 + (cx + 0.5) * C, z = WG.z0 + (cz + 0.5) * C;
        const nearX = X.some(v => Math.abs(x - v) < hw), nearZ = Z.some(v => Math.abs(z - v) < hw);
        if (!(nearX && nearZ)) ped[k] = 1;
      } }
    // 公園、廣場、菜園可以走進去（只擋外圈 0.3）
    // 有巷口的街區：巷子和中庭可以走進去（格子中心落在範圍內才打開）
    const open = (x0, x1, z0, z1) => { for (let cz = 0; cz < WG.nz; cz++) { const z = WG.z0 + (cz + 0.5) * C; if (z < z0 || z > z1) continue; for (let cx = 0; cx < WG.nx; cx++) { const x = WG.x0 + (cx + 0.5) * C; if (x >= x0 && x <= x1) d[cz * WG.nx + cx] = 0; } } };
    for (const c of GRID.cells) { const al = alleyOf(c); if (!al) continue;
      open(c.x + 5.25, c.x + 8.75, c.z + 5.25, c.z + 15.75);
      if (al === "w") open(c.x - 0.3, c.x + 5.3, c.z + 9.7, c.z + 11.3); else open(c.x + 8.7, c.x + 14.3, c.z + 9.7, c.z + 11.3); }
    { const lk = Object.keys(lots).find(id => lots[id].type === "lake"), L = lk && lots[lk];   // 操控時可以走進地下湖的隧道
      if (L && GRID.lakeCell) open(L.x - 0.9, L.x + 0.9, L.z - LAKE.back, L.z + LAKE.mouth + 0.2); }
    for (const k in BLOCK) for (let slot = 0; slot < 6; slot++) {
      const reg = k.replace(/\d+$/, ""), pg = +k.slice(-1), p = lotPos({ region: reg, page: pg, slot });
      const l = N.locations.find(q => q.region === reg && q.page === pg && q.slot === slot && !isPlaza(q) && !lakeMoved(q)), L = l && lots[l.id];
      if (L && L.plat && !/夜市/.test(l.id)) continue;            // 平台：下面照家具擋
      if (L && L.type === "lake") { rect(p.x - 3.5, p.x + 3.5, p.z - 3.5, p.z + 0.9); continue; }   // （沒搬到城邊時的舊位置）
      const front = L && !/夜市/.test(l.id) ? (FRONT[L.type] || 2.2) : l ? 2.4 : 1.95;
      rect(p.x - 3.45, p.x + 3.45, p.z - 3.5, p.z + front - 0.15);
    }
    for (const id in lots) {
      const P = lots[id].plat; if (!P || !P.occ) continue;
      const o = P.occ;
      for (let cz = 0; cz < o.nz; cz++) for (let cx = 0; cx < o.nx; cx++) {
        if (!o.data[cz * o.nx + cx]) continue;
        const [tx, tz] = P.tw(o.x0 + (cx + 0.5) * o.C, o.z0 + (cz + 0.5) * o.C), gx = Math.floor((tx - WG.x0) / C), gz = Math.floor((tz - WG.z0) / C);
        if (gx >= 0 && gz >= 0 && gx < WG.nx && gz < WG.nz) d[gz * WG.nx + gx] = 1;
      }
    }
    return WG;
  }
  // 裝飾街區的中庭巷口開在哪一邊（朝廣場那側優先，比較常被走到）：'w'、'e' 或沒有
  function alleyOf(c) { if (c.kind !== "near" || !HQ() || MQ() || !N.voxCity || !N.voxCity.block) return null; const h = hashStr(c.i + "|" + c.j); return h % 5 === 0 ? null : c.i > 0 ? (h % 3 ? "w" : "e") : c.i < 0 ? (h % 3 ? "e" : "w") : (h % 2 ? "w" : "e"); }
  const wCell = (x, z) => [Math.floor((x - WG.x0) / WG.C), Math.floor((z - WG.z0) / WG.C)];
  const wBlocked = (cx, cz) => cx < 0 || cz < 0 || cx >= WG.nx || cz >= WG.nz || WG.data[cz * WG.nx + cx] === 1;
  const wFree = (x, z) => { const [cx, cz] = wCell(x, z); return !wBlocked(cx, cz); };
  function wNearest(cx, cz) {
    for (let r = 0; r < 30; r++) for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
      if (!wBlocked(cx + dx, cz + dz)) return [cx + dx, cz + dz];
    }
    return [cx, cz];
  }
  function wLine(a, b) {
    const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / (WG.C * 0.5));
    for (let i = 1; i < n; i++) { const t = i / n; if (!wFree(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) return false; }
    return true;
  }
  // 居民找路：車道當成牆（只有路口可以過馬路），所以會走人行道；找不到才退回可以走車道的版本
  function wPath(from, to) { walkGrid(); return wPath2(from, to, true) || wPath2(from, to, false); }
  function wPath2(from, to, ped) {
    const B = ped && WG.ped ? (cx, cz) => cx < 0 || cz < 0 || cx >= WG.nx || cz >= WG.nz || WG.ped[cz * WG.nx + cx] === 1 : wBlocked;
    const near = (cx, cz) => { for (let r = 0; r < 30; r++) for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) { if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue; if (!B(cx + dx, cz + dz)) return [cx + dx, cz + dz]; } return [cx, cz]; };
    const [sx, sz] = near(...wCell(from.x, from.z)), [gx, gz] = near(...wCell(to.x, to.z)), nx = WG.nx;
    const key = (x, z) => z * nx + x, S = key(sx, sz), Gk = key(gx, gz);
    const cost = new Float64Array(nx * WG.nz).fill(1e18), came = new Int32Array(nx * WG.nz).fill(-1), closed = new Uint8Array(nx * WG.nz);   // 有關閉集合才不會在大地圖上原地打轉
    // 二元堆積
    const hk = [], hv = [];
    const push = (k, f) => { hk.push(k); hv.push(f); let i = hk.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (hv[p] <= hv[i]) break; [hk[p], hk[i]] = [hk[i], hk[p]]; [hv[p], hv[i]] = [hv[i], hv[p]]; i = p; } };
    const pop = () => { const k = hk[0], lk = hk.pop(), lv = hv.pop(); if (hk.length) { hk[0] = lk; hv[0] = lv; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < hk.length && hv[l] < hv[m]) m = l; if (r < hk.length && hv[r] < hv[m]) m = r; if (m === i) break; [hk[m], hk[i]] = [hk[i], hk[m]]; [hv[m], hv[i]] = [hv[i], hv[m]]; i = m; } } return k; };
    cost[S] = 0; push(S, 0);
    let found = false, guard = 0;
    while (hk.length && guard++ < 900000) {
      const k = pop(); if (closed[k]) continue; closed[k] = 1; if (k === Gk) { found = true; break; }
      const x = k % nx, z = (k - x) / nx;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const ax = x + dx, az = z + dz;
        if (B(ax, az) || (dx && dz && (B(x + dx, z) || B(x, z + dz)))) continue;
        const k2 = key(ax, az); if (closed[k2]) continue; const c = cost[k] + (dx && dz ? 1.414 : 1);
        if (c < cost[k2]) { cost[k2] = c; came[k2] = k; push(k2, c + Math.hypot(ax - gx, az - gz)); }
      }
    }
    if (!found) return null;
    const cells = []; let k = Gk;
    while (k !== S && k >= 0) { const x = k % nx, z = (k - x) / nx; cells.push(new T.Vector3(WG.x0 + (x + 0.5) * WG.C, 0, WG.z0 + (z + 0.5) * WG.C)); k = came[k]; }
    cells.reverse();
    const all = [from.clone(), ...cells], pts = [];
    let a = all[0];
    // 拉直路線：不能為了抄近路斜斜切過車道（兩端都在車道上才可以直線）
    const roadOK = (p, q) => { if (!ped || !WG.ped) return true; const n = Math.ceil(p.distanceTo(q) / 0.15); for (let k = 1; k < n; k++) { const t = k / n; const [cx, cz] = wCell(p.x + (q.x - p.x) * t, p.z + (q.z - p.z) * t); if (B(cx, cz)) return false; } return true; };
    for (let i = 1; i < all.length; i++) if (i === all.length - 1 || !wLine(a, all[i + 1]) || !roadOK(a, all[i + 1])) { pts.push(all[i]); a = all[i]; }
    if (wFree(to.x, to.z)) pts.push(to.clone());
    return pts;
  }
  // 平台上的點屬於哪個地點
  function platAt(x, z) {
    for (const id in lots) {
      const P = lots[id].plat; if (!P) continue;
      const [lx, lz] = P.local(x, z);
      if (Math.abs(lx) <= P.W / 2 && Math.abs(lz) <= P.D / 2) return id;
    }
    return null;
  }
  // 可以走進去的門口：室內地點的門，地下湖的洞口
  function doorAt(x, z, r) {
    for (const id in lots) {
      const L = lots[id], d = L.type === "lake" ? new T.Vector3(L.x, 0, L.z + (GRID.lakeCell ? LAKE.door : 1.15)) : doorOf(id);
      if (d && Math.hypot(d.x - x, d.z - z) < (r || 0.5)) return id;
    }
    return null;
  }
  // 操控時：走路約 1.8 公尺／秒，按住 Shift 跑步約 3.5 公尺／秒
  const TSPEED = 1.1, TRUN = 2.2;
  let shiftDown = false;
  window.addEventListener("keydown", e => { if (e.key === "Shift") shiftDown = true; });
  window.addEventListener("keyup", e => { if (e.key === "Shift") shiftDown = false; });
  window.addEventListener("blur", () => { shiftDown = false; });
  function tControl(id, hooks, opt) {
    if (!id) { if (FP.on) setFP(false); if (TC) { const w = walkers[TC.id]; if (w) { w.path = []; w.speed = WALK; } } TC = null; cam.follow = null; return; }
    walkGrid();
    const w = walkers[id]; if (!w) return;
    TC = { id, hooks: hooks || {}, vx: 0, vz: 0, spot: null, door: null, loc: (opt && opt.loc) || w.loc, t: 0 };
    director.on = false;
    if (opt && opt.at) {
      // 從門口出來：站到門外一步（往遠離房子的方向推，找第一個能走的格子），不會卡在牆裡
      const at = opt.at.clone(), L0 = lots[TC.loc];
      if (L0) { walkGrid(); const d0 = doorOf(TC.loc); if (d0) { at.set(d0.x, 0, d0.z + 0.35); for (let k = 0; k < 8 && !wFree(at.x, at.z); k++) at.z += 0.15; } }
      w.pos.copy(at); w.g.position.copy(at); TC.fromDoor = true;
    }
    w.train = false; w.fade = 1; w.path = []; w.dest = w.pos.clone(); w.destPose = "stand"; w.destY = 0; w.destYaw = null; w.speed = TSPEED; w.loc = TC.loc;
    // 鏡頭：拉近、比較從上往下看，才不會被屋頂擋住
    cam.fly = { from: cam.target.clone(), to: new T.Vector3(w.pos.x, 0, w.pos.z), d0: cam.dist, d1: 14, t: 0, dur: 0.6 };
    cam.polar = 0.42;
    setTimeout(() => { if (TC && TC.id === id) cam.follow = id; }, 650);
  }
  function tGo(target, spot) {
    if (!TC) return; const w = walkers[TC.id]; if (!w) return;
    if (typeof target === "number") target = new T.Vector3(target, 0, spot);
    TC.spot = spot && spot.pose ? spot : null; TC.vx = TC.vz = 0;
    const path = wPath(w.pos, target);
    if (!path) return;
    w.path = path; w.dest = (path[path.length - 1] || w.pos).clone(); w.speed = shiftDown ? TRUN : TSPEED;
    w.destPose = TC.spot ? TC.spot.pose : "stand"; w.destY = TC.spot ? TC.spot.y : 0; w.destYaw = TC.spot ? TC.spot.yaw : null;
    if (TC.spot) { w.path.push(new T.Vector3(TC.spot.x, 0, TC.spot.z)); w.dest = w.path[w.path.length - 1].clone(); }
    cam.follow = TC.id; cam.fly = null;
  }
  function tTap(cx, cy, rc) {
    const H = TC.hooks;
    const heads = [];
    Object.values(walkers).filter(w => w.g.visible && w.id !== TC.id).forEach(w => { if (w.ch) heads.push(...w.ch.pickables()); else heads.push(w.head); });
    const hh = rc.intersectObjects(heads, false);
    if (hh.length) return H.onPerson && H.onPerson(hh[0].object.userData.char, cx, cy);
    const pl = new T.Plane(new T.Vector3(0, 1, 0), -0.16), q = new T.Vector3();
    if (!rc.ray.intersectPlane(pl, q)) return;
    // 長椅、椅子：附近的座位出選單
    const spots = []; for (const id in lots) { const P = lots[id].plat; if (P) spots.push(...P.spots); }
    const near = spots.map(sp => [sp, Math.hypot(sp.x - q.x, sp.z - q.z)]).filter(([, d]) => d < 0.55).sort((a, b) => a[1] - b[1]);
    const opts = [], seen = new Set();
    for (const [sp] of near) { if (seen.has(sp.tag)) continue; seen.add(sp.tag); const A = SPOT_ACT[sp.tag] || SPOT_ACT.relax; opts.push({ icon: A[0], label: A[1], act: A[2], spot: sp }); }
    if (opts.length && H.onSpot) return H.onSpot(opts, cx, cy);
    // 點到房子：走到它的門口，然後進去
    const gh = rc.intersectObjects(Object.values(lots).filter(L => !L.open).map(L => L.group), true);
    if (gh.length) { let o = gh[0].object; while (o && !o.userData.loc) o = o.parent; if (o) { const d = doorOf(o.userData.loc); if (d) { tGo(d); TC.door = o.userData.loc; return; } } }
    const lk = Object.keys(lots).find(id => lots[id].type === "lake"), Lk = lk && lots[lk];
    const lkIn = Lk && (GRID.lakeCell ? (c => q.x > c.x - 0.3 && q.x < c.x + 14.3 && q.z > c.z - 0.3 && q.z < Lk.z + LAKE.mouth + 0.2)(GRID.lakeCell) : Math.abs(q.x - Lk.x) < 3.5 && q.z > Lk.z - 3.5 && q.z < Lk.z + 1.2);
    if (lkIn) { tGo(new T.Vector3(Lk.x, 0, Lk.z + (GRID.lakeCell ? LAKE.door : 1.15))); TC.door = lk; return; }
    TC.door = null;
    tGo(q);
  }
  function tApproach(bid) {
    if (!TC) return; const w = walkers[TC.id], o = walkers[bid]; if (!w || !o) return;
    const d = w.pos.clone().sub(o.pos); d.y = 0; const L = d.length() || 1;
    if (L < 0.7) return;
    tGo(o.pos.clone().add(d.multiplyScalar(0.55 / L)));
  }
  // 每幀：搖桿／鍵盤直接走、檢查走到哪個地點、走到門口就進去
  function tFrame(dt) {
    if (!TC) return;
    const w = walkers[TC.id]; if (!w) return;
    const m = Math.hypot(TC.vx, TC.vz);
    if (m > 0.15) {
      if (w.path.length || TC.spot) { w.path = []; TC.spot = null; w.destPose = "stand"; w.destY = 0; w.destYaw = null; }
      const az0 = FP.on ? FP.yaw : cam.az, sa = Math.sin(az0), ca = Math.cos(az0);
      let dx = TC.vx * ca - TC.vz * -sa, dz = TC.vx * -sa - TC.vz * -ca;   // 右 = (cos, −sin)，前 = (−sin, −cos)
      const L = Math.hypot(dx, dz) || 1, sp = (shiftDown ? TRUN : TSPEED) * Math.min(1, m) * dt;
      dx = dx / L * sp; dz = dz / L * sp;
      const r = 0.18, stuck = !wFree(w.pos.x, w.pos.z);
      if (dx && (stuck || (wFree(w.pos.x + dx, w.pos.z) && wFree(w.pos.x + dx + Math.sign(dx) * r, w.pos.z)))) w.pos.x += dx;
      if (dz && (stuck || (wFree(w.pos.x, w.pos.z + dz) && wFree(w.pos.x, w.pos.z + dz + Math.sign(dz) * r)))) w.pos.z += dz;
      w.dest = w.pos.clone(); w.wantYaw = Math.atan2(dx, dz); w.manualWalk = 0.12;
      cam.follow = TC.id;
    }
    TC.t += dt; if (TC.t < 0.25) return; TC.t = 0;
    const H = TC.hooks;
    // 走到門口（點房子走過去的，或自己走到門前）
    const d = doorAt(w.pos.x, w.pos.z, TC.door && !w.path.length ? 0.6 : 0.35);
    if (d && (TC.door === d || m > 0.15)) { TC.door = null; TC.vx = TC.vz = 0; if (H.onDoor) return H.onDoor(d); }
    const at = platAt(w.pos.x, w.pos.z);
    if (at && at !== TC.loc) { TC.loc = at; w.loc = at; if (H.onLoc) H.onLoc(at); }
  }
  function tScreen() {
    if (!TC || !walkers[TC.id] || !renderer) return null;
    const v = walkers[TC.id].g.position.clone(); v.y = 1.5; v.project(camera);
    const r = renderer.domElement.getBoundingClientRect();
    return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height };
  }
  const tCtl = {
    control: tControl, ctlGo: tGo, ctlMove: (vx, vz) => { if (TC) { TC.vx = vx; TC.vz = vz; } },
    ctlUseSpot: opt => tGo(new T.Vector3(opt.spot.x, 0, opt.spot.z), opt.spot), ctlApproach: tApproach, ctlScreen: tScreen, emote: townEmote,
    isOutdoor: id => !!(lots[id] && lots[id].plat), doorPos: id => { const L = lots[id]; if (!L) return null; return L.type === "lake" ? new T.Vector3(L.x, 0, L.z + (GRID.lakeCell ? LAKE.door + 0.5 : 1.6)) : L.plat ? null : doorOf(id) && doorOf(id).add(new T.Vector3(0, 0, 0.6)); }
  };

  /* ═════════ 第一人稱 ═════════ */
  let cullList = null, cullT = 0;
  function markCull() {
    cullList = [];
    const wg = new Set(Object.values(walkers).map(w => w.g)), bb = new T.Box3(), v = new T.Vector3();
    for (const c of root.children) {
      if (c.isSprite || wg.has(c) || c.userData.noCull) continue;
      bb.setFromObject(c); if (bb.isEmpty()) continue;
      bb.getSize(v); const r = Math.max(v.x, v.z) / 2;
      if (r > 30) continue;   // 山、馬路這種大的不管
      bb.getCenter(v); cullList.push({ o: c, x: v.x, z: v.z, r, hid: false });
    }
  }
  function cullFrame(now) {
    if (!cullList || now - cullT < 300) return; cullT = now;
    const px = camera.position.x, pz = camera.position.z;
    for (const c of cullList) {
      const hide = FP.on && Math.hypot(c.x - px, c.z - pz) - c.r > 112;
      if (hide !== c.hid) { c.hid = hide; c.o.visible = !hide; }
    }
  }
  /* ═════════ 第一人稱小地圖（左上角） ═════════
   * 底圖只畫一次（海、陸地、街、街區、公園）；每 0.1 秒依自己的位置和面向旋轉，畫上居民和地點圖示。
   * 點一下放大／縮小。 */
  const MM = { el: null, cv: null, base: null, k: 2, x0: 0, z0: 0, t: 0, big: false };
  function mmBase() {
    const k = MM.k, pad = 40;
    let x0 = GRID.minX - pad, x1 = GRID.maxX + pad, z0 = GRID.minZ - pad, z1 = GRID.maxZ + pad;
    if (COAST.isle) { x0 = Math.min(x0, COAST.isle.x - COAST.isle.R - 10); x1 = Math.max(x1, COAST.isle.x + COAST.isle.R + 10); z0 = Math.min(z0, COAST.isle.z - COAST.isle.R - 10); z1 = Math.max(z1, COAST.isle.z + COAST.isle.R + 10); }
    const W = Math.ceil((x1 - x0) * k), H = Math.ceil((z1 - z0) * k);
    const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const g = cv.getContext("2d"), P = (x, z) => [(x - x0) * k, (z - z0) * k];
    g.fillStyle = "#d9cfb8"; g.fillRect(0, 0, W, H);   // 陸地（步道、空地）
    // 街
    g.fillStyle = "#b9b2a6";
    const RE = GRID.ROADE;
    const cs = GRID.cells.concat(GRID.basin ? [GRID.basin.cell] : []);
    for (const c of cs) { const [a, b] = P(c.x - RE, c.z - RE); g.fillRect(a, b, (GRID.BW + RE * 2) * k, (GRID.BD + RE * 2) * k); }
    // 街區
    const COL = { plaza: "#e6d6ac", loc: "#c99a5b", near: "#a8988a", far: "#b3a596", open: "#9fc48a", harbor: "#9aa3a8", lake: "#7E8A74" };
    for (const c of GRID.cells) {
      g.fillStyle = COL[c.kind] || "#aaa";
      const [a, b] = P(c.x + 0.4, c.z + 0.4); g.fillRect(a, b, (GRID.BW - 0.8) * k, (GRID.BD - 0.8) * k);
      if (c.kind === "plaza") { g.fillStyle = "#cdb98a"; g.beginPath(); const [cx, cz] = P(c.x + GRID.BW / 2, c.z + GRID.BD / 2); g.arc(cx, cz, 3.2 * k, 0, 7); g.fill(); }
    }
    // 海（最後蓋上去，順便把伸到海裡的街切掉）
    const sea = g.createImageData(W, H), d = sea.data;
    for (let py = 0; py < H; py += 1) for (let px = 0; px < W; px += 1) {
      const x = x0 + (px + 0.5) / k, z = z0 + (py + 0.5) / k;
      if (!GRID.seaAt(x, z)) continue;
      if (COAST.isle && Math.hypot(x - COAST.isle.x, z - COAST.isle.z) < COAST.isle.R) continue;
      const i = (py * W + px) * 4, cd = GRID.coastDist ? -GRID.coastDist(x, z) : 9;
      const sh = Math.min(1, Math.max(0, cd / 14));   // 靠岸淺、外海深
      d[i] = 120 - 50 * sh; d[i + 1] = 182 - 50 * sh; d[i + 2] = 204 - 30 * sh; d[i + 3] = 255;
    }
    const sc = document.createElement("canvas"); sc.width = W; sc.height = H; sc.getContext("2d").putImageData(sea, 0, 0);
    g.drawImage(sc, 0, 0);
    if (COAST.isle) { g.fillStyle = "#9fc48a"; g.beginPath(); const [a, b] = P(COAST.isle.x, COAST.isle.z); g.arc(a, b, (COAST.isle.R - 1) * k, 0, 7); g.fill(); }
    if (COAST.bridge) { const B = COAST.bridge; g.strokeStyle = "#a08060"; g.lineWidth = Math.max(2, (B.W || 2.4) * k); g.beginPath(); g.moveTo(...P(B.xa, B.za)); g.lineTo(...P(B.xa + B.ux * B.L, B.za + B.uz * B.L)); g.stroke(); }
    MM.base = cv; MM.x0 = x0; MM.z0 = z0;
  }
  function mmShow(on) {
    if (on && !MM.base) { try { mmBase(); } catch (e) { console.warn("minimap", e); return; } }
    if (on && !MM.el && host) {
      const el = document.createElement("div"); el.className = "fp-minimap";
      el.innerHTML = `<canvas></canvas>`; MM.cv = el.querySelector("canvas");
      el.addEventListener("click", e => { e.stopPropagation(); MM.big = !MM.big; el.classList.toggle("big", MM.big); MM.t = 0; });
      el.addEventListener("pointerdown", e => e.stopPropagation());
      MM.el = el;
    }
    if (MM.el) {
      if (on && host && MM.el.parentNode !== host) host.appendChild(MM.el);
      if (!on && MM.el.parentNode) MM.el.parentNode.removeChild(MM.el);
    }
  }
  function mmFrame(dt) {
    const on = FP.on && !!TC && !!walkers[TC.id];
    if (on !== !!(MM.el && MM.el.parentNode)) mmShow(on);
    if (!on || !MM.cv) return;
    MM.t -= dt; if (MM.t > 0) return; MM.t = 0.1;
    const box = MM.el.clientWidth || 150, dpr = Math.min(2, window.devicePixelRatio || 1), S = Math.round(box * dpr);
    if (MM.cv.width !== S) { MM.cv.width = S; MM.cv.height = S; }
    const g = MM.cv.getContext("2d"), R = S / 2, me = walkers[TC.id].pos;
    const view = MM.big ? 110 : 48, s = R / view;                 // 半徑 view 單位
    const fx = -Math.sin(FP.yaw), fz = -Math.cos(FP.yaw), rot = -Math.PI / 2 - Math.atan2(fz, fx);
    const cr = Math.cos(rot), sr = Math.sin(rot);
    const toS = (x, z) => { const dx = (x - me.x) * s, dz = (z - me.z) * s; return [R + dx * cr - dz * sr, R + dx * sr + dz * cr]; };
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, S, S);
    g.save(); g.beginPath(); g.arc(R, R, R - 1, 0, 7); g.clip();
    g.fillStyle = "#6f9fb5"; g.fillRect(0, 0, S, S);
    g.translate(R, R); g.rotate(rot); g.scale(s / MM.k, s / MM.k); g.translate(-(me.x - MM.x0) * MM.k, -(me.z - MM.z0) * MM.k);
    g.imageSmoothingEnabled = true; g.drawImage(MM.base, 0, 0);
    g.setTransform(1, 0, 0, 1, 0, 0);
    // 地點圖示（保持正立）
    g.textAlign = "center"; g.textBaseline = "middle";
    g.font = `${Math.round((MM.big ? 13 : 12) * dpr)}px sans-serif`;
    const placed = [], gap = 20 * dpr;
    for (const l of N.locations) {
      const L = lots[l.id]; if (!L || !l.icon) continue;
      const [x, y] = toS(L.x, L.z); if (Math.hypot(x - R, y - R) > R - 8 * dpr) continue;
      if (placed.some(q => Math.hypot(q[0] - x, q[1] - y) < gap)) continue;   // 擠在一起的只畫一個
      placed.push([x, y]);
      g.fillStyle = "rgba(255,253,248,.85)"; g.beginPath(); g.arc(x, y, 8.5 * dpr, 0, 7); g.fill();
      g.fillText(l.icon, x, y + 0.5 * dpr);
    }
    // 居民
    for (const id in walkers) {
      if (id === TC.id) continue;
      const w = walkers[id]; if (!w.g.visible) continue;
      const [x, y] = toS(w.pos.x, w.pos.z); if (Math.hypot(x - R, y - R) > R - 4 * dpr) continue;
      g.fillStyle = w.color || "#fff"; g.strokeStyle = "#fff"; g.lineWidth = 1.5 * dpr;
      g.beginPath(); g.arc(x, y, 3.6 * dpr, 0, 7); g.fill(); g.stroke();
    }
    // 自己：中間往上的箭頭和視野扇形
    const grd = g.createRadialGradient(R, R, 0, R, R, R * 0.55);
    grd.addColorStop(0, "rgba(255,240,200,.45)"); grd.addColorStop(1, "rgba(255,240,200,0)");
    g.fillStyle = grd; g.beginPath(); g.moveTo(R, R); g.arc(R, R, R * 0.55, -Math.PI / 2 - 0.55, -Math.PI / 2 + 0.55); g.closePath(); g.fill();
    g.fillStyle = "#D8A75A"; g.strokeStyle = "#2A2014"; g.lineWidth = 1.5 * dpr;
    g.beginPath(); g.moveTo(R, R - 8 * dpr); g.lineTo(R + 6 * dpr, R + 6 * dpr); g.lineTo(R, R + 3 * dpr); g.lineTo(R - 6 * dpr, R + 6 * dpr); g.closePath(); g.fill(); g.stroke();
    g.restore();
    // 外框和北方
    g.strokeStyle = "rgba(255,253,248,.9)"; g.lineWidth = 3 * dpr; g.beginPath(); g.arc(R, R, R - 1.5 * dpr, 0, 7); g.stroke();
    const na = rot - Math.PI / 2, nx = R + Math.cos(na) * (R - 9 * dpr), ny = R + Math.sin(na) * (R - 9 * dpr);
    g.fillStyle = "#B9533D"; g.beginPath(); g.arc(nx, ny, 7 * dpr, 0, 7); g.fill();
    g.fillStyle = "#fff"; g.font = `bold ${Math.round(9 * dpr)}px sans-serif`; g.fillText("N", nx, ny + 0.5 * dpr);
  }
  function setFP(on) {
    on = !!on && !!TC && !!camera;
    if (on === FP.on) return FP.on;
    FP.on = on;
    if (on) {
      const w = walkers[TC.id];
      FP.yaw = cam.az; FP.pitch = -0.05;
      // 從門口出來：背對房子，面向街道（往前＝從房子中心指向門口的方向）
      const L0 = TC.fromDoor && lots[TC.loc];
      if (L0 && w) {
        // 門前是窄巷：面向最近的那條街（巷子的出口）
        const l = N.locations.find(q => q.id === TC.loc);
        if (l && !isPlaza(l)) { const sx = sideX(l), dx = sx - w.pos.x; FP.yaw = dx > 0 ? -Math.PI / 2 : Math.PI / 2; }
      }
      if (w) w.path = [];
      camera.near = 0.1; cam.fly = null; cam.follow = TC.id;
      if (!cullList) markCull();
    } else {
      camera.near = 0.5;
      if (document.pointerLockElement) try { document.exitPointerLock(); } catch (e) { }
      cam.dist = 14; cam.polar = 0.42;
    }
    camera.updateProjectionMatrix();
    cullT = 0;
    return FP.on;
  }
  const unlock = () => { if (document.pointerLockElement) try { document.exitPointerLock(); } catch (e) { } };
  // 對準畫面中間互動：人→圓環選單；長椅、椅子→座位選單；門、洞口→走進去
  function fpInteract() {
    if (!TC || !renderer) return;
    if (FP.busy && FP.busy()) return;
    const r = renderer.domElement.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const rc = new T.Raycaster(); rc.setFromCamera(new T.Vector2(0, 0), camera); if (rc.layers) rc.layers.enableAll();
    rc.far = 6;
    const H = TC.hooks, heads = [];
    Object.values(walkers).filter(w => w.g.visible && w.id !== TC.id).forEach(w => { if (w.ch) heads.push(...w.ch.pickables()); else heads.push(w.head); });
    const hh = rc.intersectObjects(heads, false);
    if (hh.length) { unlock(); return H.onPerson && H.onPerson(hh[0].object.userData.char, cx, cy); }
    const pl = new T.Plane(new T.Vector3(0, 1, 0), -0.16), q = new T.Vector3(), w = walkers[TC.id];
    let pt = rc.ray.intersectPlane(pl, q) && q.distanceTo(camera.position) < 7 ? q : null;
    if (!pt) pt = new T.Vector3(w.pos.x - Math.sin(FP.yaw) * 1.2, 0, w.pos.z - Math.cos(FP.yaw) * 1.2);
    const d = doorAt(pt.x, pt.z, 1.4) || doorAt(w.pos.x - Math.sin(FP.yaw) * 0.8, w.pos.z - Math.cos(FP.yaw) * 0.8, 1.2);
    if (d && H.onDoor) { unlock(); return H.onDoor(d); }
    const spots = []; for (const id in lots) { const P = lots[id].plat; if (P) spots.push(...P.spots); }
    const near = spots.map(sp => [sp, Math.hypot(sp.x - pt.x, sp.z - pt.z)]).filter(([, dd]) => dd < 1.2).sort((a, b) => a[1] - b[1]);
    const opts = [], seen = new Set();
    for (const [sp] of near) { if (seen.has(sp.tag)) continue; seen.add(sp.tag); const A = SPOT_ACT[sp.tag] || SPOT_ACT.relax; opts.push({ icon: A[0], label: A[1], act: A[2], spot: sp }); }
    if (opts.length && H.onSpot) { unlock(); return H.onSpot(opts, cx, cy); }
  }
  tCtl.fp = on => setFP(on === undefined ? !FP.on : on);
  tCtl.isFP = () => FP.on;
  tCtl.setBusy = fn => { FP.busy = fn; };
  tCtl.interact = () => fpInteract();
  // 第一人稱時，準心對準可以互動的東西就提示（每 0.2 秒檢查一次）
  tCtl.aim = () => {
    if (!FP.on || !TC) return null;
    const rc = new T.Raycaster(); rc.setFromCamera(new T.Vector2(0, 0), camera); rc.far = 6;
    const heads = []; Object.values(walkers).filter(w => w.g.visible && w.id !== TC.id).forEach(w => { if (w.ch) heads.push(...w.ch.pickables()); else heads.push(w.head); });
    const hh = rc.intersectObjects(heads, false); if (hh.length) { FP.aimDoor = null; return { kind: "person", id: hh[0].object.userData.char }; }
    const w = walkers[TC.id], d = doorAt(w.pos.x - Math.sin(FP.yaw) * 0.8, w.pos.z - Math.cos(FP.yaw) * 0.8, 1.2);
    FP.aimDoor = d || null;
    if (d) return { kind: "door", id: d };
    return null;
  };

  /* ═════════ 拍照模式：時間／天氣只改畫面（不動存檔）、拿掉名牌標記、濾鏡與移軸、定格、存成圖片 ═════════ */
  const PH = { on: false, min: null, weather: null, clean: true, freeze: false, ft: 0, filter: 0, tilt: 0, focus: 0.5, fov: 36, fov0: 36, shot: null, real: null, rt: null, mat: null, sc: null, cm: null };
  function photoState(s) {
    if (!PH.on || (PH.min == null && !PH.weather)) return s;
    return Object.assign({}, s, { min: PH.min == null ? s.min : PH.min, weather: PH.weather || s.weather });
  }
  // 畫這一幀之前先把名牌、人數牌、提示、泡泡藏起來，畫完再放回去（不改它們平常的狀態）
  function photoHide() {
    const out = [], hide = o => { if (o && o.visible) { o.visible = false; out.push(o); } };
    labelSprites.forEach(hide); districtSprites.forEach(hide);
    for (const id in lots) hide(lots[id].badge);
    for (const id in hintMarks) hide(hintMarks[id]);
    for (const id in walkers) { const w = walkers[id]; hide(w.name); hide(w.ring); hide(w.zz); if (w.wq) hide(w.wq); }
    bubbles.forEach(b => hide(b.sp));
    return out;
  }
  function photoTarget() {
    if (!PH.on || (!PH.filter && PH.tilt <= 0)) return null;
    if (!PH.rt) {
      const ms = renderer.capabilities && renderer.capabilities.isWebGL2 && T.WebGLMultisampleRenderTarget;
      PH.rt = ms ? new T.WebGLMultisampleRenderTarget(4, 4, { minFilter: T.LinearFilter, magFilter: T.LinearFilter }) : new T.WebGLRenderTarget(4, 4, { minFilter: T.LinearFilter, magFilter: T.LinearFilter });
      if (ms) PH.rt.samples = 4;
      PH.mat = new T.ShaderMaterial({
        uniforms: { t: { value: PH.rt.texture }, res: { value: new T.Vector2(1, 1) }, mode: { value: 0 }, tilt: { value: 0 }, focus: { value: 0.5 }, seed: { value: 0 } },
        vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
        fragmentShader: `uniform sampler2D t; uniform vec2 res; uniform float mode; uniform float tilt; uniform float focus; uniform float seed; varying vec2 vUv;
          float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + seed) * 43758.5453); }
          float hash0(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
          void main(){
            vec3 c;
            // 移軸：對焦那一條清楚，越往上下越糊（像拍微縮模型）
            // 用螺旋狀取樣、每個像素轉一個角度：模糊比較圓滑，不會出現一格一格的網紋
            float d = abs(vUv.y - focus), r = smoothstep(0.06, 0.42, d) * 22.0 * tilt * res.y / 900.0;
            if (r < 0.4) c = texture2D(t, vUv).rgb;
            else {
              vec3 sum = texture2D(t, vUv).rgb; float tot = 1.0, a0 = hash0(floor(vUv * res)) * 6.2832;
              for (int i = 1; i < 32; i++) {
                float k = float(i), rr = sqrt(k / 31.0) * r, a = a0 + k * 2.39996;
                sum += texture2D(t, vUv + vec2(cos(a), sin(a)) * rr / res).rgb; tot += 1.0;
              }
              c = sum / tot;
            }
            float l = dot(c, vec3(0.299, 0.587, 0.114));
            if (tilt > 0.001) { c = mix(vec3(l), c, 1.0 + 0.3 * tilt); c = (c - 0.5) * (1.0 + 0.1 * tilt) + 0.5; l = dot(c, vec3(0.299, 0.587, 0.114)); }
            vec2 q = vUv - 0.5; float vg = dot(q, q); float n = hash(floor(vUv * res)) - 0.5;
            if (mode > 0.5 && mode < 1.5) {          // 底片：暗部微微發灰、偏暖、顆粒
              c = mix(vec3(l), c, 0.88) * vec3(1.05, 1.0, 0.9) + vec3(0.04, 0.03, 0.05);
              c = (c - 0.5) * 0.92 + 0.5 + n * 0.06; c *= 1.0 - vg * 0.9;
            } else if (mode < 2.5 && mode > 1.5) {   // 黑白
              c = vec3((l - 0.5) * 1.15 + 0.5) + n * 0.04; c *= 1.0 - vg * 0.7;
            } else if (mode < 3.5 && mode > 2.5) {   // 懷舊：褐色老照片
              c = mix(c, vec3(l) * vec3(1.08, 0.93, 0.72) + vec3(0.05, 0.03, 0.0), 0.85) + n * 0.05; c *= 1.0 - vg * 1.1;
            } else if (mode < 4.5 && mode > 3.5) {   // 粉彩：亮一點、對比低、帶一點粉
              c = mix(c, vec3(1.0, 0.92, 0.95), 0.12); c = (c - 0.5) * 0.86 + 0.56; c = mix(vec3(dot(c, vec3(0.299, 0.587, 0.114))), c, 1.12);
            } else if (mode > 4.5) {                 // 電影：暗部偏青、亮部偏橘、四周暗一點
              c += vec3(-0.01, 0.04, 0.07) * (1.0 - smoothstep(0.0, 0.5, l)) + vec3(0.07, 0.025, -0.04) * smoothstep(0.4, 1.0, l);
              c = (c - 0.5) * 1.12 + 0.5; c *= 1.0 - vg * 0.6;
            }
            gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
          }`, depthTest: false, depthWrite: false });
      PH.sc = new T.Scene(); PH.cm = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      PH.sc.add(new T.Mesh(new T.PlaneGeometry(2, 2), PH.mat));
    }
    const sz = renderer.getDrawingBufferSize(new T.Vector2());
    if (PH.rt.width !== sz.x || PH.rt.height !== sz.y) { PH.rt.setSize(sz.x, sz.y); PH.mat.uniforms.res.value.set(sz.x, sz.y); }
    renderer.setRenderTarget(PH.rt); renderer.clear();
    return PH.rt;
  }
  function photoPass() {
    const U = PH.mat.uniforms;
    U.mode.value = PH.filter; U.tilt.value = PH.tilt; U.focus.value = PH.focus; U.seed.value = PH.freeze || PH.shot ? 1 : (performance.now() % 1000) / 100;
    const ac = renderer.autoClear; renderer.autoClear = true;
    renderer.setRenderTarget(null); renderer.render(PH.sc, PH.cm);
    renderer.autoClear = ac;
  }
  const photo = {
    enter() {
      if (!built) return false;
      PH.on = true; PH.fov0 = camera.fov; PH.fov = camera.fov;
      PH.cam0 = { target: cam.target.clone(), dist: cam.dist, polar: cam.polar, az: cam.az };   // 離開時回到進來前的鏡頭
      if (director.on) setDirector(false);
      return true;
    },
    exit() {
      PH.on = false; PH.min = null; PH.weather = null; PH.freeze = false;
      if (camera) { camera.fov = PH.fov0; camera.updateProjectionMatrix(); }
      if (PH.cam0) { cam.fly = null; cam.follow = null; cam.target.copy(PH.cam0.target); cam.dist = PH.cam0.dist; cam.polar = PH.cam0.polar; cam.az = PH.cam0.az; PH.cam0 = null; }
      clampTarget();
      if (PH.real) update(PH.real);
    },
    isOn: () => PH.on,
    get: () => ({ min: PH.min, weather: PH.weather, clean: PH.clean, freeze: PH.freeze, filter: PH.filter, tilt: PH.tilt, focus: PH.focus, fov: PH.fov, polar: cam.polar, realMin: PH.real ? PH.real.min : 720, realWeather: PH.real ? PH.real.weather : "晴" }),
    set(o) {
      if ("min" in o) PH.min = o.min;
      if ("weather" in o) PH.weather = o.weather;
      if ("clean" in o) PH.clean = !!o.clean;
      if ("freeze" in o) { PH.freeze = !!o.freeze; PH.ft = performance.now() / 1000; }
      if ("filter" in o) PH.filter = o.filter | 0;
      if ("tilt" in o) PH.tilt = Math.max(0, Math.min(1, +o.tilt));
      if ("focus" in o) PH.focus = Math.max(0.1, Math.min(0.9, +o.focus));
      if ("polar" in o) { cam.polar = Math.max(0.25, Math.min(1.5, +o.polar)); cam.fly = null; }
      if ("fov" in o && camera) { PH.fov = Math.max(14, Math.min(70, +o.fov)); camera.fov = PH.fov; camera.updateProjectionMatrix(); }
      if (("min" in o || "weather" in o) && PH.real) update(PH.real);
    },
    // 下一幀畫完時把畫布交給 cb（WebGL 畫布要在同一幀裡讀，不然會是空白）
    capture(cb) { PH.shot = cb; }
  };

  N.town3d_debug = () => ({ scene, wPath, routeTo, cars, roadNet: () => roadNet, groundAt, COAST, walkGrid, alleyOf, ENTR, camera, FP, GRID, cam, TC, WG, walkers, lots, RM, occAt, cellOf, roomPath, buildRoom });
  N.town3d = { rotate: a => { cam.fly = null; const a0 = cam.az, t0 = performance.now(); const step = () => { const k = Math.min(1, (performance.now() - t0) / 350); cam.az = a0 + a * (1 - Math.pow(1 - k, 3)); if (k < 1) requestAnimationFrame(step); }; step(); }, setAnomaly, supported, mount, unmount, update, say, emote: townEmote, focus, flyRegion, flyLoc, setLabels, setXray, setDirector, home, pause,
    isFollowing: () => cam.follow, unfollow: () => { cam.follow = null; }, isReady: () => built, ctl: tCtl, photo };
})();
