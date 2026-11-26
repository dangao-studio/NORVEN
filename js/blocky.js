/* 諾文小鎮：方塊小人
 * 讀角色的麥塊 skin（64×64），組成頭、身體、手、腳六塊，外層（頭髮、外套、裙襬）稍微浮出來。
 * 介面跟 N.picto 一樣：make() 回傳 { root, height, pickables, setPose, update }。
 * 比例：1 格 = 0.05，整個人 32 格高 = 1.6。 */
(function () {
  "use strict";
  const N = window.NOVUM = window.NOVUM || {};
  const P = 0.05;
  let T = null;
  const texCache = {}, matCache = {};
  function skinOf(id) { return N.skins && N.skins[id]; }
  function tex(id) {
    if (texCache[id]) return texCache[id];
    const t = new T.TextureLoader().load("icons/skins/" + skinOf(id).f + ".png");
    t.magFilter = T.NearestFilter; t.minFilter = T.NearestFilter; t.generateMipmaps = false;
    return (texCache[id] = t);
  }
  function mats(id) {
    if (matCache[id]) return matCache[id];
    const t = tex(id);
    // 加一點自發光，讓昏暗的房間裡也看得清楚臉和衣服
    const base = new T.MeshLambertMaterial({ map: t, emissive: 0xFFFFFF, emissiveMap: t, emissiveIntensity: 0.22 });
    const over = new T.MeshLambertMaterial({ map: t, emissive: 0xFFFFFF, emissiveMap: t, emissiveIntensity: 0.22, transparent: true, alphaTest: 0.5, side: T.DoubleSide });
    return (matCache[id] = { base, over });
  }
  // 一個方塊，依麥塊的展開圖設定六個面的貼圖位置
  function part(w, h, d, u, v, grow, m) {
    const g = new T.BoxGeometry((w + grow) * P, (h + grow) * P, (d + grow) * P), uv = g.attributes.uv;
    const rects = [[u + d + w, v + d, d, h], [u, v + d, d, h], [u + d, v, w, d], [u + d + w, v, w, d], [u + d, v + d, w, h], [u + d + w + d, v + d, w, h]];
    for (let f = 0; f < 6; f++) {
      const [x0, y0, rw, rh] = rects[f];
      for (let k = 0; k < 4; k++) { const i = f * 4 + k, a = uv.getX(i), b = uv.getY(i); uv.setXY(i, (x0 + a * rw) / 64, 1 - (y0 + (1 - b) * rh) / 64); }
    }
    const o = new T.Mesh(g, m); o.castShadow = true; return o;
  }
  function make(three, id) {
    T = three;
    const sk = skinOf(id); if (!sk) return null;
    const { base, over } = mats(id), aw = sk.slim ? 3 : 4;
    const root = new T.Group(), rig = new T.Group(); root.add(rig);
    const body = new T.Group(); rig.add(body);
    const meshes = [];
    // 以關節為軸心：x,y,z 是關節位置（格），dy 是方塊中心相對關節的位移
    const limb = (w, h, d, u, v, ou, ov, grow, x, y, z, dy) => {
      const g = new T.Group(); g.position.set(x * P, y * P, z * P); body.add(g);
      const a = part(w, h, d, u, v, 0, base), b = part(w, h, d, ou, ov, grow, over);
      a.position.y = b.position.y = dy * P; g.add(a, b); meshes.push(a, b); return g;
    };
    const head = limb(8, 8, 8, 0, 0, 32, 0, 1, 0, 24, 0, 4);
    limb(8, 12, 4, 16, 16, 16, 32, 0.5, 0, 18, 0, 0);
    const ra = limb(aw, 12, 4, 40, 16, 40, 32, 0.5, -(4 + aw / 2), 22, 0, -4);
    const la = limb(aw, 12, 4, 32, 48, 48, 48, 0.5, 4 + aw / 2, 22, 0, -4);
    const rl = limb(4, 12, 4, 0, 16, 0, 32, 0.5, -2, 12, 0, -6);
    const ll = limb(4, 12, 4, 16, 48, 0, 48, 0.5, 2, 12, 0, -6);
    root.traverse(o => { if (o.isMesh) o.userData.char = id; });
    const st = { rig, body, head, arms: [la, ra], legs: [ll, rl], pose: "stand", phase: Math.random() * 6, talkT: 0 };
    return {
      root, height: 1.6,
      pickables: () => meshes,
      setPose: (p, hz) => setPose(st, p, hz),
      update: (dt, tt, o) => update(st, dt, tt, o || {}),
      emote: name => emote(st, name)
    };
  }
  function setPose(st, p, hz) {
    if (st.pose === p) return; st.pose = p;
    st.rig.rotation.set(0, 0, 0); st.rig.position.set(0, 0, 0); st.legs.forEach(g => g.rotation.set(0, 0, 0));
    st.body.rotation.x = 0;
    if (p === "sit") { st.legs.forEach(g => { g.rotation.x = -Math.PI / 2; }); st.rig.position.y = -0.56; }
    if (p === "lie") { st.rig.rotation.x = -Math.PI / 2; st.rig.position.set(0, 0.12, (hz == null ? -0.5 : hz) + 1.4); }
  }
  /* ───── 動作 ─────
   * 一層一層疊：走路 → 待著（呼吸、東張西望）→ 正在做的事（煮菜、讀書、打鼓、吃東西、做工）→ 說話的手勢 → 表情動作（揮手、擊掌、歡呼……）。
   * 每一層只給「想要的角度」，最後一起平滑轉過去，所以換動作不會一下跳過去。
   * o = { walking, speed, asleep, talking, act } */
  const EMO = { wave: 1.8, nod: 1.0, cheer: 1.6, shrug: 1.3, give: 1.6, high: 1.2, pat: 1.6, hug: 2.2, laugh: 1.6, think: 2.0, bow: 1.4, surprise: 1.0, clap: 1.4 };
  const GEST = ["explain", "explain", "open", "point", "tilt", "still", "hip", "nod"];
  const lerp = (a, b, k) => a + (b - a) * k;
  function emote(st, name) { if (EMO[name]) st.emo = { name, t: 0, dur: EMO[name] }; }
  function update(st, dt, tt, o) {
    const ph = st.phase, [la, ra] = st.arms, [ll, rl] = st.legs;
    // 想要的角度：左右手 [x, z]、頭 [x, y, z]、身體 [前傾, 高度, 側傾]
    const L = [0, -0.05], R = [0, 0.05], H = [0, 0, 0], B = [0, 0, 0];
    let walking = st.pose === "stand" && o.walking;
    if (walking) {
      // 步伐跟速度走：慢慢走小步、跑步大步又快
      const sp = o.speed || 1, fq = 5.5 + sp * 3.2, amp = Math.min(0.85, 0.4 + sp * 0.18);
      st.wph = (st.wph || 0) + dt * fq;
      const w = Math.sin(st.wph + ph); ll.rotation.x = w * amp; rl.rotation.x = -w * amp;
      L[0] = -w * amp * 1.1; R[0] = w * amp * 1.1; B[1] = Math.abs(Math.cos(st.wph + ph)) * (0.015 + sp * 0.012);
    } else if (st.pose === "stand") {
      ll.rotation.x = rl.rotation.x = 0;
      if (!o.asleep) {
        // 待著：呼吸、手輕輕擺、偶爾左右看看
        B[1] = Math.sin(tt * 1.6 + ph) * 0.006;
        L[0] = Math.sin(tt * 0.9 + ph) * 0.04; R[0] = -L[0];
        const look = Math.sin(tt * 0.23 + ph * 3) + Math.sin(tt * 0.61 + ph);
        H[1] = Math.abs(look) > 1.2 ? Math.sign(look) * 0.45 : look * 0.12;
        H[0] = Math.sin(tt * 0.37 + ph) * 0.05;
      }
    } else if (st.pose === "sit") { L[0] = R[0] = -0.5; H[1] = Math.sin(tt * 0.3 + ph) * 0.15; }
    // 正在做的事
    const act = !walking && !o.asleep && !o.talking ? o.act : null;
    if (act === "cook") { L[0] = -1.0 + Math.sin(tt * 5 + ph) * 0.18; R[0] = -1.1 + Math.sin(tt * 5 + ph + 2) * 0.18; L[1] = 0.15; R[1] = -0.15; H[0] = 0.3; }
    else if (act === "study") { L[0] = R[0] = -1.05; L[1] = 0.2; R[1] = -0.2; H[0] = 0.35 + Math.sin(tt * 0.5 + ph) * 0.05; if (Math.sin(tt * 0.4 + ph) > 0.97) R[1] = -0.5; }
    else if (act === "drum") { L[0] = -0.9 + Math.sin(tt * 13 + ph) * 0.45; R[0] = -0.9 + Math.sin(tt * 13 + ph + 3) * 0.45; H[0] = Math.sin(tt * 6.5) * 0.12; }
    else if (act === "work") { R[0] = -1.1 + Math.abs(Math.sin(tt * 4 + ph)) * 0.6; L[0] = -0.9; H[0] = 0.3; }
    else if (act === "eat") { const c = (tt * 0.4 + ph) % 1; if (c < 0.2) { R[0] = -2.0; R[1] = 0.35; } else R[0] = st.pose === "sit" ? -0.9 : -0.4; L[0] = st.pose === "sit" ? -0.8 : -0.2; }
    // 說話：每隔一兩秒換一個手勢
    if (o.talking && !o.asleep) {
      st.talkT += dt; st.gT = (st.gT || 0) - dt;
      if (st.gT <= 0) { st.g = GEST[Math.floor(Math.random() * GEST.length)]; st.gT = 1.1 + Math.random() * 1.6; }
      const t = st.talkT, g = st.g;
      if (g === "explain") { R[0] = -0.95 + Math.sin(t * 5) * 0.15; R[1] = -0.25; }
      else if (g === "open") { L[0] = R[0] = -0.6; L[1] = 0.55; R[1] = -0.55; }
      else if (g === "point") { R[0] = -1.45; R[1] = -0.05; }
      else if (g === "tilt") { H[2] = 0.18; }
      else if (g === "hip") { L[1] = 0.5; R[1] = -0.5; L[0] = R[0] = 0.15; }
      H[0] += g === "nod" ? Math.sin(t * 9) * 0.12 : Math.sin(t * 7) * 0.05;
      if (st.pose === "sit") { L[0] = Math.min(L[0], -0.5); R[0] = Math.min(R[0], -0.5); }
    } else st.talkT = 0;
    // 表情動作（一次性，前後淡入淡出）
    const e = st.emo;
    if (e) {
      e.t += dt;
      const k = Math.min(1, e.t / 0.18, (e.dur - e.t) / 0.25), f = e.t;
      if (e.t >= e.dur) st.emo = null;
      else {
        const mix = (arr, v) => { arr[0] = lerp(arr[0], v[0], k); arr[1] = lerp(arr[1], v[1], k); };
        switch (e.name) {
          case "wave": mix(R, [-0.2, -2.6 + Math.sin(f * 12) * 0.35]); break;
          case "nod": H[0] = lerp(H[0], Math.sin(f * 10) * 0.28, k); break;
          case "cheer": mix(L, [-0.2, 2.7]); mix(R, [-0.2, -2.7]); B[1] += Math.abs(Math.sin(f * 9)) * 0.08 * k; break;
          case "shrug": mix(L, [-0.5, 0.6]); mix(R, [-0.5, -0.6]); H[2] = lerp(H[2], 0.2, k); B[1] += 0.02 * k; break;
          case "give": mix(L, [-1.35, -0.1]); mix(R, [-1.35, 0.1]); B[0] = lerp(B[0], 0.12, k); break;
          case "high": mix(R, [-2.9, -0.2]); break;
          case "pat": mix(R, [-1.75 + Math.sin(f * 10) * 0.12, 0.1]); break;
          case "hug": mix(L, [-1.35, -0.45]); mix(R, [-1.35, 0.45]); B[0] = lerp(B[0], 0.1, k); break;
          case "laugh": H[0] = lerp(H[0], -0.25, k); B[1] += Math.abs(Math.sin(f * 14)) * 0.025 * k; mix(L, [-0.4, 0.1]); mix(R, [-0.4, -0.1]); break;
          case "think": mix(R, [-2.3, 0.35]); H[2] = lerp(H[2], -0.15, k); H[0] = lerp(H[0], -0.1, k); break;
          case "bow": { const w = k * Math.sin(Math.min(1, f / e.dur) * Math.PI); H[0] = lerp(H[0], 0.55, w); B[0] = lerp(B[0], 0.08, w); mix(L, [-0.15, -0.05]); mix(R, [-0.15, 0.05]); break; }
          case "surprise": mix(L, [-0.3, 0.9]); mix(R, [-0.3, -0.9]); H[0] = lerp(H[0], -0.2, k); B[1] += 0.06 * k * Math.max(0, 1 - f * 3); break;
          case "clap": { const c = Math.sin(f * 16) * 0.2; mix(L, [-1.3, -0.35 - c]); mix(R, [-1.3, 0.35 + c]); break; }
        }
      }
    }
    // 平滑轉到想要的角度
    const sk = Math.min(1, dt * 12);
    la.rotation.x = lerp(la.rotation.x, L[0], sk); la.rotation.z = lerp(la.rotation.z, L[1], sk);
    ra.rotation.x = lerp(ra.rotation.x, R[0], sk); ra.rotation.z = lerp(ra.rotation.z, R[1], sk);
    if (o.asleep && st.pose !== "lie") { H[0] = 0.35; H[1] = 0; }
    st.head.rotation.x = lerp(st.head.rotation.x, H[0], sk); st.head.rotation.y = lerp(st.head.rotation.y, H[1], Math.min(1, dt * 4)); st.head.rotation.z = lerp(st.head.rotation.z, H[2], sk);
    st.body.rotation.x = lerp(st.body.rotation.x, B[0], sk);
    st.body.position.y = B[1];
  }
  N.blocky = { make, has: id => !!skinOf(id) };
})();
