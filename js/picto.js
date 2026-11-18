/* 諾文小鎮：圖示人形
 * 像標誌上的那種人形：圓圓的頭、膠囊形的身體和手腳，用每個人的代表色區分；頭是他的頭像圖示。
 */
(function () {
  "use strict";
  const N = window.NOVUM = window.NOVUM || {};
  let T = null;
  const ch = id => (N.characters || []).find(c => c.id === id);

  // 膠囊：用車床旋轉出來，兩端是半圓
  const capCache = {};
  function capsule(r, len) {
    const k = r + "|" + len; if (capCache[k]) return capCache[k];
    const pts = [], seg = 5;
    for (let i = 0; i <= seg; i++) { const a = -Math.PI / 2 + (i / seg) * (Math.PI / 2); pts.push(new T.Vector2(Math.cos(a) * r, Math.sin(a) * r - len / 2)); }
    for (let i = 0; i <= seg; i++) { const a = (i / seg) * (Math.PI / 2); pts.push(new T.Vector2(Math.cos(a) * r, Math.sin(a) * r + len / 2)); }
    return (capCache[k] = new T.LatheGeometry(pts, 10));
  }
  const matCache = {};
  function mat(hex) {
    if (!matCache[hex]) { const c = new T.Color(hex); matCache[hex] = new T.MeshLambertMaterial({ color: c, emissive: c.clone().multiplyScalar(0.35) }); }
    return matCache[hex];
  }
  const texCache = {};
  function avatarTex(id) {
    if (texCache[id]) return texCache[id];
    const f = N.avatars && N.avatars[id];
    if (!f) return null;
    const t = new T.TextureLoader().load("icons/avatars/" + f + ".webp");
    t.minFilter = T.LinearFilter;
    return (texCache[id] = t);
  }
  // 沒有頭像時：畫一個代表色的圓，中間寫名字的第一個字
  function letterTex(id, color) {
    const cv = document.createElement("canvas"); cv.width = cv.height = 128; const g = cv.getContext("2d");
    g.fillStyle = color; g.beginPath(); g.arc(64, 64, 62, 0, 7); g.fill();
    g.fillStyle = "#fff"; g.font = "bold 60px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(id[0], 64, 68);
    return new T.CanvasTexture(cv);
  }

  function make(three, id) {
    T = three;
    const c = ch(id); if (!c) return null;
    const color = c.color || "#888888", m = mat(color);
    const root = new T.Group(), rig = new T.Group(); root.add(rig);
    const body = new T.Group(); rig.add(body);
    const add = (geo, parent, x, y, z) => { const o = new T.Mesh(geo, m); o.position.set(x || 0, y || 0, z || 0); o.castShadow = true; parent.add(o); return o; };
    // 腿
    const legs = [-1, 1].map(k => { const g = new T.Group(); g.position.set(k * 0.085, 0.56, 0); body.add(g); add(capsule(0.075, 0.38), g, 0, -0.27, 0); return g; });
    // 身體
    add(capsule(0.17, 0.3), body, 0, 0.8, 0);
    // 手
    const arms = [-1, 1].map(k => { const g = new T.Group(); g.position.set(k * 0.215, 0.98, 0); body.add(g); add(capsule(0.065, 0.34), g, 0, -0.22, 0); return g; });
    // 頭：頭像圖示，跟身體之間留一點縫
    const head = new T.Group(); head.position.y = 1.36; body.add(head);
    const sm = new T.SpriteMaterial({ map: avatarTex(id) || letterTex(id, color), transparent: true, depthWrite: true });
    const face = new T.Sprite(sm); face.scale.set(0.58, 0.58, 1); head.add(face);
    root.traverse(o => { if (o.isMesh || o.isSprite) o.userData.char = id; });
    const st = { root, rig, body, head, legs, arms, face, sm, pose: "stand", phase: Math.random() * 6, talkT: 0 };
    return {
      root, height: 1.6,
      pickables: () => [face, ...body.children.filter(o => o.isMesh)],
      setPose: (p, hz) => setPose(st, p, hz),
      update: (dt, tt, o) => update(st, dt, tt, o || {})
    };
  }
  function setPose(st, p, hz) {
    if (st.pose === p) return; st.pose = p;
    st.rig.rotation.set(0, 0, 0); st.rig.position.set(0, 0, 0); st.legs.forEach(g => g.rotation.set(0, 0, 0));
    if (p === "sit") { st.legs.forEach(g => { g.rotation.x = -Math.PI / 2; }); st.rig.position.y = -0.52; }
    if (p === "lie") { st.rig.rotation.x = -Math.PI / 2; st.rig.position.set(0, 0.2, (hz == null ? -0.5 : hz) + 1.36); }
  }
  // o = { walking, asleep, talking }
  function update(st, dt, tt, o) {
    const ph = st.phase, [la, ra] = st.arms, [ll, rl] = st.legs;
    let ax = 0, bodyY = 0, headY = 0;
    if (st.pose === "stand" && o.walking) {
      const w = Math.sin(tt * 9 + ph); ll.rotation.x = w * 0.45; rl.rotation.x = -w * 0.45; ax = w * 0.5; bodyY = Math.abs(Math.cos(tt * 9 + ph)) * 0.03;
    } else if (st.pose === "stand") { ll.rotation.x = rl.rotation.x = 0; bodyY = o.asleep ? 0 : Math.sin(tt * 1.6 + ph) * 0.008; }
    else if (st.pose === "sit") ax = -0.45;
    if (o.talking) { st.talkT += dt; headY = Math.abs(Math.sin(st.talkT * 9)) * 0.035; } else st.talkT = 0;
    la.rotation.set(-ax, 0, -0.1); ra.rotation.set(ax, 0, 0.1);
    st.head.position.y = 1.36 + headY;
    st.sm.opacity = o.asleep ? 0.7 : 1;
    st.body.position.y = bodyY;
  }
  N.picto = { make, has: id => !!ch(id) };
})();
