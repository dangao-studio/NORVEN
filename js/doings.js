/* 諾文小鎮：讓居民自己去做點什麼
 * 點一個居民 →「✨ 自己做點什麼」：列出他現在待的地方有哪些東西可以用（長椅、鞦韆、販賣機、書櫃、唱盤……），
 * 照他的個性排好（⭐ 是他喜歡的），還有附近別的地方他喜歡做的事。
 * 選了之後用「指派」讓他待在那裡一陣子（s.assign[id] 多帶 use、floor），3D 小鎮和房間會讓他走到那件東西旁邊去做。
 * 資料在 data/doings.js。對外 N.selfDo = { init, buttonHTML, open, pick, stop, options }。
 */
(function () {
  "use strict";
  const N = window.NOVUM = window.NOVUM || {};
  let X = null;   // app 傳進來的工具
  const D = () => N.doings || { uses: {}, useOf: {}, likes: {}, ok: {}, no: {} };

  // 某個地點每一層的家具（有用房間編輯器改過的話用改過的）
  function itemsOf(loc) {
    const e = N.interiors && N.interiors[loc]; if (!e) return [];
    const fl = Array.isArray(e) ? [{ items: e }] : e.floors || [e];
    let ed = {};
    try { ed = JSON.parse(localStorage.getItem("novum-rooms") || "{}") || {}; } catch (err) { ed = {}; }
    const out = [];
    fl.forEach((F, fi) => {
      const ov = ed[loc + "#" + fi], items = ov && ov.items ? ov.items : (F.items || []);
      for (const it of items) out.push({ type: it[0], o: it[3] || {}, floor: fl.length > 1 ? fi : null });
    });
    return out;
  }
  const allowed = (id, use) => {
    const U = D().uses[use]; if (!U) return false;
    if (U.only && U.only.indexOf(id) < 0) return false;
    return (D().no[id] || []).indexOf(use) < 0;
  };
  const liked = (id, use) => !!(D().likes[id] && D().likes[id][use]);
  // 這個地點他可以做的事：[{ use, floor }]，喜歡的排前面
  function usesAt(id, loc) {
    const seen = new Map(), order = Object.keys(D().uses);
    for (const it of itemsOf(loc)) {
      const use = D().useOf[it.type]; if (!use || seen.has(use) || !allowed(id, use)) continue;
      if (use === "nap" && it.o.owner && it.o.owner !== id) continue;   // 別人的床不睡
      seen.set(use, it.floor);
    }
    const out = [...seen.entries()].map(([use, floor]) => ({ use, floor, liked: liked(id, use) }));
    out.sort((a, b) => (b.liked - a.liked) || (a.use === "rest") - (b.use === "rest") || order.indexOf(a.use) - order.indexOf(b.use));
    return out;
  }
  // 別的地方：他喜歡、但這裡沒有的事，找同一區的公共場所（最多兩個）
  function awayFor(id, here, w) {
    const have = new Set(here.map(h => h.use)), cur = N.locations.find(l => l.id === w.loc), out = [];
    const likes = Object.keys(D().likes[id] || {}).filter(u => !have.has(u) && allowed(id, u) && u !== "nap");
    const places = N.locations.filter(l => l.id !== w.loc && l.kind !== "home");
    places.sort((a, b) => ((cur && b.region === cur.region) - (cur && a.region === cur.region)));
    for (const u of likes) {
      if (out.length >= 2) break;
      const l = places.find(p => itemsOf(p.id).some(it => D().useOf[it.type] === u));
      if (!l) continue;
      const it = itemsOf(l.id).find(x => D().useOf[x.type] === u);
      out.push({ use: u, loc: l.id, floor: it ? it.floor : null, liked: true });
    }
    return out;
  }
  function options(id, c) {
    const w = X.currentWhere(c || X.clockNow())[id];
    const here = usesAt(id, w.loc);
    return { w, here, away: awayFor(id, here, w) };
  }

  // 卡片、觀察頁上的按鈕
  function buttonHTML(id, c, where) {
    const w = (where || X.currentWhere(c || X.clockNow()))[id];
    if (!w || !w.avail || w.locked) return "";
    const cur = X.slot().assign[id], doing = cur && cur.use && D().uses[cur.use];
    return `<button type="button" class="btn soft${doing ? " doing" : ""}" data-doopen="${X.esc(id)}">${doing ? `${doing.icon} ${X.esc(doing.label)}中` : "✨ 自己做點什麼"}</button>`;
  }
  function optHTML(o, loc) {
    const U = D().uses[o.use];
    const label = loc ? `去${X.locName(loc)}${U.label}` : U.label;
    return `<button type="button" class="do-opt${o.liked ? " liked" : ""}" data-dopick="${X.esc(o.use)}" data-doloc="${X.esc(loc || "")}" data-dofloor="${o.floor == null ? "" : o.floor}">
      <span class="do-ic" aria-hidden="true">${U.icon}</span><span class="do-lb">${X.esc(label)}</span>${o.liked ? `<span class="do-star" aria-label="他喜歡">⭐</span>` : ""}</button>`;
  }
  function open(id) {
    const c = X.clockNow(), { w, here, away } = options(id, c), cur = X.slot().assign[id];
    X.setSheet({ type: "doings", who: id });
    const doing = cur && cur.use && D().uses[cur.use];
    const body = !w.avail ? `<p class="sheet-desc"><b>${X.esc(id)}正在休息，叫不起來。</b></p>`
      : `<p class="sheet-desc">${X.esc(id)}在<b>${X.esc(X.locName(w.loc))}</b>，可以自己去做這些事。⭐ 是${X.esc(id)}喜歡的。</p>
        ${doing ? `<div class="note do-now">正在${X.esc(cur.act)}。<button type="button" class="btn soft" data-dostop="${X.esc(id)}">回去做原本的事</button></div>` : ""}
        ${here.length ? `<div class="do-grid">${here.map(o => optHTML(o)).join("")}</div>` : `<p class="sheet-desc">這裡沒什麼東西能用。可以用「🧭 指派去…」帶${X.esc(id)}去別的地方。</p>`}
        ${away.length ? `<h4 class="do-h">去附近別的地方</h4><div class="do-grid">${away.map(o => optHTML(o, o.loc)).join("")}</div>` : ""}`;
    X.sheetBody(`<h3>${X.person(id, 30)}${X.esc(id)}想做點什麼？</h3>${body}
      <div class="sheet-actions"><button type="button" class="btn soft" data-close>關閉</button></div>`);
    X.openSheet();
  }
  function lineOf(id, use) {
    const l = D().likes[id] && D().likes[id][use]; if (l) return l;
    const ok = D().ok[id] || ["好。"]; return ok[Math.floor(Math.random() * ok.length)];
  }
  function pick(id, use, loc, floor) {
    const c = X.clockNow(), w = X.currentWhere(c)[id], U = D().uses[use];
    if (!U || !w) return;
    if (!w.avail) return X.toast(`${id}正在休息，叫不起來`);
    if (w.locked) return X.toast(`${id}正在和人說話`);
    const s = X.slot(), where = loc || w.loc;
    s.assign[id] = { loc: where, untilAbs: X.stayFor(U.min), act: U.act, use, self: true };
    if (floor !== "" && floor != null && !isNaN(+floor)) s.assign[id].floor = +floor;
    const line = lineOf(id, use);
    X.save(true); X.closeSheet(); X.render();
    X.toast(`${id}：「${line}」`);
    X.say(id, line);
  }
  function stop(id) {
    const s = X.slot(), a = s.assign[id];
    if (a && a.self) delete s.assign[id];
    X.save(true); X.closeSheet(); X.render();
  }
  function init(tools) { X = tools; }
  N.selfDo = { init, buttonHTML, open, pick, stop, options, usesAt };
})();
