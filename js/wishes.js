/* 諾文小鎮：居民的小心願與心情
 * 每天有幾個人會冒出 💭，想找你說點小事（內容在 data/wishes.js）。
 * 你選的回應會變成他今天的心情、睡前日記，有時讓他跟某人更熟，或回送你一點東西。
 * 每個人此刻的心情也從這裡算：有心事、剛被你回應過、肚子餓、跟交往對象在一起，或當天的隨機心情。
 * 存在存檔槽的 slot.wish。
 */
(function () {
  "use strict";
  const N = window.NOVUM = window.NOVUM || {};
  let X = null;   // app 傳進來的工具

  const MOODS = {
    happy: { icon: "😊", label: "開心" }, excited: { icon: "✨", label: "興致勃勃" }, warm: { icon: "🌷", label: "心裡暖暖的" },
    calm: { icon: "🍃", label: "平靜" }, proud: { icon: "😤", label: "有點得意" }, shy: { icon: "😳", label: "不好意思" },
    fired: { icon: "🔥", label: "有幹勁" }, sleepy: { icon: "😪", label: "有點睏" }, blue: { icon: "🌧️", label: "有點悶" },
    worry: { icon: "💭", label: "有心事" }, hungry: { icon: "🍞", label: "肚子餓" }, love: { icon: "💗", label: "心情很好" }
  };
  const FROM = 9 * 60, UNTIL = 22 * 60;   // 心願冒出來的時間範圍

  function W() {
    const s = X.slot();
    const w = s.wish = s.wish || {};
    w.done = w.done || {}; w.told = w.told || {}; w.hist = w.hist || []; w.thanks = w.thanks || [];
    return w;
  }
  const on = () => X.enabled();
  const list = id => (N.wishes && N.wishes[id]) || [];
  const wishById = (who, wid) => list(who).find(x => x.id === wid) || null;

  /* ═════════ 今天誰有心事 ═════════ */
  let cache = { key: "", spawns: [] };
  function spawnsOf(ck) {
    const day = X.dayKeyOf(ck), w = W();
    const key = day + "|" + w.hist.length;
    if (cache.key === key) return cache.spawns;
    const r = X.rng(day + "|wish");
    const ids = N.characters.map(c => c.id).filter(id => list(id).length);
    for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    const n = 3 + Math.floor(r() * 3), out = [];
    for (const who of ids.slice(0, n)) {
      const recent = w.hist.filter(h => h.who === who && h.day !== day).slice(0, 2).map(h => h.wid);
      const pool = list(who).filter(x => recent.indexOf(x.id) < 0);
      const wish = pool[Math.floor(r() * pool.length)] || list(who)[0];
      const start = FROM + Math.floor(r() * 20) * 30;
      out.push({ who, wid: wish.id, start, day });
    }
    cache = { key, spawns: out };
    return out;
  }
  function answered(who, ck) { const d = W().done[X.dayKeyOf(ck)]; return d && d[who] || null; }
  // 此刻有心事、還沒被回應、醒著的人：Map(名字 → { wish, spawn })
  function pending(ck, where) {
    const out = new Map();
    if (!on() || ck.min < FROM || ck.min >= UNTIL) return out;
    where = where || X.currentWhere(ck);
    for (const sp of spawnsOf(ck)) {
      if (ck.min < sp.start || answered(sp.who, ck)) continue;
      const w = where[sp.who]; if (!w || !w.avail) continue;
      const wish = wishById(sp.who, sp.wid); if (wish) out.set(sp.who, { wish, spawn: sp });
    }
    return out;
  }

  /* ═════════ 心情 ═════════ */
  function moodOf(id, ck, where) {
    where = where || X.currentWhere(ck);
    const w = where[id]; if (!w || !w.avail) return null;
    const a = answered(id, ck);
    if (a && MOODS[a.mood] && ck.min - a.min < 6 * 60) return Object.assign({ key: a.mood, why: "聽你說完之後" }, MOODS[a.mood]);
    if (pending(ck, where).has(id)) return Object.assign({ key: "worry", why: "有話想跟你說" }, MOODS.worry);
    const nd = X.needs(ck)[id];
    if (nd && nd.need === "hunger") return Object.assign({ key: "hungry" }, MOODS.hungry);
    if (nd && nd.need === "tired") return Object.assign({ key: "sleepy" }, MOODS.sleepy);
    for (const o of N.characters) if (o.id !== id && where[o.id] && where[o.id].loc === w.loc && where[o.id].avail && X.getRel(id, o.id).status === "交往中")
      return Object.assign({ key: "love", why: "和" + o.id + "在一起" }, MOODS.love);
    const r = X.rng(X.dayKeyOf(ck) + "|mood|" + id + "|" + Math.floor(ck.min / 180));
    const early = ck.min < 10 * 60 || ck.min >= 22 * 60;
    const pool = [["calm", 4], ["happy", 3], ["excited", 1], ["sleepy", early ? 2.5 : 0.4], ["blue", 0.6]];
    let t = pool.reduce((s, p) => s + p[1], 0) * r();
    for (const [k, wt] of pool) { t -= wt; if (t <= 0) return Object.assign({ key: k }, MOODS[k]); }
    return Object.assign({ key: "calm" }, MOODS.calm);
  }
  function moodChip(id, ck, where) {
    const m = moodOf(id, ck, where); if (!m) return "";
    return `<span class="mood-chip mood-${m.key}" title="${X.esc(m.label)}">${m.icon} ${X.esc(m.label)}</span>`;
  }

  /* ═════════ 冒泡通知 ═════════ */
  function tick(ck) {
    if (!on()) return;
    const w = W(), day = X.dayKeyOf(ck);
    const told = w.told[day] = w.told[day] || {};
    for (const [who, p] of pending(ck)) {
      if (told[who]) continue;
      told[who] = 1;
      X.pushNews({ kind: "wish", text: `💭 ${who}好像有話想跟你說：${p.wish.hint}。`, cast: [who], wish: who });
    }
    for (const k of Object.keys(w.told)) if (k !== day) delete w.told[k];
    const keys = Object.keys(w.done).sort(); while (keys.length > 4) delete w.done[keys.shift()];
  }

  /* ═════════ 聽他說：抽屜面板 ═════════ */
  let cur = null;   // { who, wid, pick }
  const lineHTML = l => l[0] === "＊" ? `<div class="line narr old">${X.esc(l[1])}</div>`
    : `<div class="line say old">${X.person(l[0], 34)}<div><div class="who">${X.esc(l[0])}</div><div class="bubble">${X.esc(l[1])}</div></div></div>`;
  function open(who) {
    const ck = X.clockNow(), p = pending(ck).get(who);
    if (!p) { cur = null; X.sheet({ type: "wish" }, `<h3>${X.person(who, 30)}${X.esc(who)}</h3><div class="empty">${X.esc(who)}現在沒有什麼特別想說的。</div><div class="sheet-actions"><button type="button" class="btn soft" data-close>關閉</button></div>`); return; }
    cur = { who, wid: p.wish.id, pick: null };
    render();
  }
  function render() {
    if (!cur) return;
    const wish = wishById(cur.who, cur.wid); if (!wish) return;
    const o = cur.pick != null ? wish.opts[cur.pick] : null, m = o && MOODS[o.mood];
    const res = [];
    if (o) {
      if (m) res.push(`${m.icon} ${X.esc(cur.who)}現在${X.esc(m.label)}`);
      if (o.rel) res.push(`💗 ${X.esc(cur.who)} ↔ ${X.esc(o.rel[0])}　好感 +${o.rel[1]}`);
      if (o.thanks) res.push(`🎁 ${X.esc(o.thanks)}`);
    }
    X.sheet({ type: "wish" }, `<h3>${X.person(cur.who, 30)}${X.esc(cur.who)}的心事</h3>
      <p class="sheet-desc">💭 ${X.esc(wish.hint)}</p>
      <div class="transcript wish-talk">${wish.ask.map(lineHTML).join("")}
        ${o ? `<div class="wish-you">你：${X.esc(o.label)}</div>${o.reply.map(lineHTML).join("")}` : ""}</div>
      ${o ? `<div class="done-card wish-done">${res.map(t => `<div>${t}</div>`).join("")}</div>
        <div class="sheet-actions"><button type="button" class="btn primary" data-close>好</button></div>`
        : `<div class="wish-opts">${wish.opts.map((x, i) => `<button type="button" class="btn soft wish-opt" data-wishpick="${i}">${X.esc(x.label)}</button>`).join("")}</div>
        <div class="sheet-actions"><button type="button" class="link-btn" data-close>等一下再說</button></div>`}`);
  }
  function pick(i) {
    if (!cur || cur.pick != null) return;
    const wish = wishById(cur.who, cur.wid), o = wish && wish.opts[i]; if (!o) return;
    const ck = X.clockNow(), day = X.dayKeyOf(ck), w = W();
    if (answered(cur.who, ck)) return;
    cur.pick = i;
    w.done[day] = w.done[day] || {};
    w.done[day][cur.who] = { wid: wish.id, opt: i, mood: o.mood, min: ck.min };
    w.hist.unshift({ day, dow: ck.dow, min: ck.min, who: cur.who, wid: wish.id, opt: i });
    if (w.hist.length > 60) w.hist.length = 60;
    if (o.rel && N.characters.some(c => c.id === o.rel[0])) X.bump(cur.who, o.rel[0], o.rel[1]);
    if (o.thanks) { w.thanks.unshift({ day, dow: ck.dow, min: ck.min, who: cur.who, text: o.thanks }); if (w.thanks.length > 40) w.thanks.length = 40; }
    X.save(true);
    X.pushNews({ kind: "wish", text: `💭 你聽${cur.who}說了「${wish.hint}」，回了一句「${o.label}」。`, cast: o.rel ? [cur.who, o.rel[0]] : [cur.who], quiet: true });
    render();
    X.after();
  }

  /* ═════════ 給 app 用的小區塊 ═════════ */
  function diaryNote(id, ck) {
    const a = answered(id, ck); if (!a) return "";
    const wish = wishById(id, a.wid), o = wish && wish.opts[a.opt];
    return o && o.diary || "";
  }
  // 居民清單上方：現在誰想找你
  function bannerHTML(ck, where) {
    const p = pending(ck, where); if (!p.size) return "";
    return `<section class="card wish-banner"><div class="wish-b-title">💭 有人想找你說話</div>
      <div class="wish-b-list">${[...p].map(([who, x]) => `<button type="button" class="wish-b-item" data-wishopen="${X.esc(who)}">${X.person(who, 34)}<span><b>${X.esc(who)}</b><small>${X.esc(x.wish.hint)}</small></span></button>`).join("")}</div></section>`;
  }
  function buttonHTML(who, ck, where) {
    const p = pending(ck, where).get(who); if (!p) return "";
    return `<button type="button" class="btn wish-btn span2" data-wishopen="${X.esc(who)}">💭 ${X.esc(who)}有話想跟你說：${X.esc(p.wish.hint)}</button>`;
  }
  // 日誌「💭 心事」頁
  function logHTML() {
    const w = W(), E = N.engine;
    const when = h => `週${E.WEEK[h.dow]} ${E.fmtMin(h.min)}`;
    const rows = w.hist.slice(0, 30).map(h => {
      const wish = wishById(h.who, h.wid), o = wish && wish.opts[h.opt]; if (!o) return "";
      const m = MOODS[o.mood];
      return `<li>${X.person(h.who, 30)}<div><b>${X.esc(h.who)}</b><small class="muted">　${when(h)}</small><p>💭 ${X.esc(wish.hint)}<br>你：「${X.esc(o.label)}」${m ? `　${m.icon} ${X.esc(m.label)}` : ""}</p></div></li>`;
    }).join("");
    const gifts = w.thanks.slice(0, 20).map(t => `<li>${X.person(t.who, 30)}<div><b>${X.esc(t.who)}</b><small class="muted">　${when(t)}</small><p>${X.esc(t.text)}</p></div></li>`).join("");
    if (!rows && !gifts) return `<div class="empty" style="margin-top:14px">白天偶爾會有人頭上冒出 💭，代表他有點小事想找你說。聽過的心事會記在這裡。</div>`;
    return (gifts ? `<section class="card diary-day wish-log"><h4>🎁 收到的回禮</h4><ul class="diary-list">${gifts}</ul></section>` : "")
      + (rows ? `<section class="card diary-day wish-log"><h4>💭 聽過的心事</h4><ul class="diary-list">${rows}</ul></section>` : "");
  }

  N.mood = {
    MOODS,
    init(x) { X = x; },
    pending, moodOf, moodChip, tick, open, pick, render: () => render(), diaryNote, bannerHTML, buttonHTML, logHTML,
    who: () => cur && cur.who
  };
})();
