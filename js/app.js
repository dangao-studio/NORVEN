/* 諾文小鎮：畫面與觀察流程 */
(function () {
  "use strict";
  const N = NOVUM, E = N.engine;
  const KEY = "novum-town";
  const SCHEMA = 1;
  const VERSION = "3.24.0";
  const $ = (s, el) => (el || document).querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pad = n => String(n).padStart(2, "0");
  const rand = (a, b) => a + Math.random() * (b - a);

  /* ═════════ 儲存（localStorage，僅限本機瀏覽器） ═════════ */
  function freshSlot() {
    return { observing: null, encounter: null, nextRollAt: 0, status: null, sceneAt: {}, read: {}, log: [], assign: {}, rel: {}, phone: {}, phoneDaily: {}, news: [], newsRead: 0, newsKey: "", partyDay: "" };
  }
  function freshStore() {
    return {
      schema: SCHEMA, mode: "real", bond: true,
      preview: { dow: 2, min: 15 * 60, anchor: Date.now(), weather: "auto", parity: "auto", fest: "auto" },
      ui: { view: "town", region: "central", page: {}, logTab: "mine" },
      slots: { real: freshSlot(), preview: freshSlot() }
    };
  }
  let storageOK = true;
  function load() {
    let s = null;
    try { const raw = localStorage.getItem(KEY); if (raw) s = JSON.parse(raw); }
    catch (e) { storageOK = false; }
    return migrate(s);
  }
  // 版本不同時：保留原資料、另存一份備份，絕不直接刪除
  function migrate(s) {
    const f = freshStore();
    if (!s || typeof s !== "object") return f;
    if (s.schema !== SCHEMA) {
      try { localStorage.setItem(KEY + "-backup-schema" + (s.schema || 0), JSON.stringify(s)); } catch (e) { /* ignore */ }
    }
    const out = Object.assign({}, f, s);
    out.preview = Object.assign({}, f.preview, s.preview || {});
    out.ui = Object.assign({}, f.ui, s.ui || {});
    out.ui.page = Object.assign({}, (s.ui && s.ui.page) || {});
    out.slots = Object.assign({}, f.slots, s.slots || {});
    for (const k of ["real", "preview"]) out.slots[k] = Object.assign(freshSlot(), out.slots[k] || {});
    out.schema = SCHEMA;
    return out;
  }
  let store = load();
  let saveTimer = null;
  function save(immediate) {
    clearTimeout(saveTimer);
    if (immediate) write(); else saveTimer = setTimeout(write, 200);
  }
  function write() {
    try { localStorage.setItem(KEY, JSON.stringify(store)); storageOK = true; }
    catch (e) { storageOK = false; }
  }
  const slot = () => store.slots[store.mode];

  /* ═════════ 時間（台灣時間／白天預覽） ═════════ */
  const WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  let fmt;
  try {
    fmt = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", weekday: "short", hour12: false });
  } catch (e) { fmt = null; }
  function taipeiParts(at) {
    const d = at == null ? new Date() : new Date(at);
    if (!fmt) {
      const t = new Date(d.getTime() + (d.getTimezoneOffset() + 480) * 60000);
      return { y: t.getFullYear(), mo: t.getMonth() + 1, d: t.getDate(), dow: t.getDay(), min: t.getHours() * 60 + t.getMinutes() };
    }
    const p = {};
    for (const x of fmt.formatToParts(d)) p[x.type] = x.value;
    let h = +p.hour; if (h === 24) h = 0;
    return { y: +p.year, mo: +p.month, d: +p.day, dow: WD[p.weekday], min: h * 60 + (+p.minute) };
  }
  function isoParity(y, mo, d) {
    const dt = new Date(Date.UTC(y, mo - 1, d));
    const day = dt.getUTCDay() || 7;
    dt.setUTCDate(dt.getUTCDate() + 4 - day);
    const y0 = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
    const wk = Math.ceil(((dt - y0) / 86400000 + 1) / 7);
    return wk % 2 ? "A" : "B";
  }
  function clockNow() {
    const t = taipeiParts();
    const date = pad(t.mo) + "-" + pad(t.d);
    const dateKey = t.y + "-" + date;
    const realParity = isoParity(t.y, t.mo, t.d);
    if (store.mode === "real") {
      return { mode: "real", dow: t.dow, min: t.min, parity: realParity, date, dateKey, weather: E.weatherFor(dateKey), abs: Math.floor(Date.now() / 60000) + 480 };
    }
    const p = store.preview;
    const elapsedMin = p.paused ? 0 : Math.max(0, (Date.now() - p.anchor) / 60000) * (p.speed || 1);
    if (p.abs0 == null) p.abs0 = 5000000 + p.dow * 1440 + p.min;
    const total = p.min + elapsedMin;
    const dow = (p.dow + Math.floor(total / 1440)) % 7;
    const min = Math.floor(total % 1440);
    return {
      mode: "preview", dow, min, date, dateKey, abs: Math.floor(p.abs0 + elapsedMin),
      parity: p.parity === "auto" ? realParity : p.parity,
      weather: p.weather === "auto" ? E.weatherFor(dateKey + "-p" + dow) : p.weather
    };
  }
  // 小鎮時間某個 abs 分鐘的時鐘（給離線補算用）
  function clockAtAbs(abs) {
    if (store.mode === "real") {
      const t = taipeiParts((abs - 480) * 60000), date = pad(t.mo) + "-" + pad(t.d), dateKey = t.y + "-" + date;
      return { mode: "real", dow: t.dow, min: t.min, parity: isoParity(t.y, t.mo, t.d), date, dateKey, weather: E.weatherFor(dateKey), abs };
    }
    const now = clockNow(), p = store.preview, base = Math.max(0, abs - 5000000);
    const dow = Math.floor(base / 1440) % 7, min = base % 1440;
    return Object.assign({}, now, { dow, min, abs, weather: p.weather === "auto" ? E.weatherFor(now.dateKey + "-p" + dow) : p.weather });
  }
  const WX_ICON = { "晴": "☀️", "多雲": "⛅", "雨": "🌧️", "霧": "🌫️" };
  function clockLabel(c) { return "週" + E.WEEK[c.dow] + " " + E.fmtMin(c.min); }
  function timeTint(c) {
    if (c.min >= 19 * 60 || c.min < 5 * 60 + 30) return "night";
    if (c.min >= 17 * 60 + 30) return "dusk";
    return "";
  }

  /* ═════════ 位置 ═════════ */
  const OVERRIDE_MAX = 2 * 3600 * 1000; // 相遇固定地點最多 2 小時（避免角色整晚卡在原地）
  function currentWhere(clock, peek) {   // peek：只是偷看未來，不要清掉到期的指派
    const enc = slot().encounter;
    const ov = enc && !enc.done && (Date.now() - enc.startedAt < OVERRIDE_MAX) ? { cast: enc.cast, loc: enc.loc } : null;
    const s = slot();
    const active = {};
    for (const k in s.assign) {
      const a = s.assign[k];
      if (a.untilAbs == null) a.untilAbs = clock.abs + Math.max(0, Math.round(((a.until || 0) - Date.now()) / 60000));  // 舊版資料轉換
      if (a.untilAbs <= clock.abs) { if (!peek) delete s.assign[k]; continue; }
      active[k] = { loc: a.loc, act: a.act, until: Date.now() + (a.untilAbs - clock.abs) * 60000 };
    }
    return E.whereabouts(clock, ov, Object.assign({}, autoNeeds(clock), autoOutings(clock), autoVisits(clock), N.life ? N.life.plansAt(clock) : {}, active));
  }
  const stayFor = minutes => clockNow().abs + Math.round(minutes);
  // 過去某個時間點的位置（含週末自動出遊，不含玩家的指派）
  function whereAt(ck) { return E.whereabouts(ck, null, Object.assign({}, autoNeeds(ck), autoOutings(ck), autoVisits(ck), N.life ? N.life.plansAt(ck) : {})); }
  /* 週末下午，好感夠高的兩人會自己約出去玩 */
  let outCache = { key: "", pairs: [] };
  function outingPairs(c) {
    const key = store.mode + c.dateKey + c.dow + JSON.stringify(slot().rel || {});
    if (outCache.key === key) return outCache.pairs;
    let pairs = [];
    if (c.dow === 0 || c.dow === 6) {
      const r = rng(c.dateKey + "|outing|" + c.dow);
      const cands = [];
      for (let i = 0; i < N.characters.length; i++) for (let j = i + 1; j < N.characters.length; j++) {
        const a = N.characters[i].id, b = N.characters[j].id, rel = getRel(a, b);
        if (rel.pts >= 70 || rel.status === "交往中") cands.push([a, b, rel.status === "交往中" ? 3 : 1]);
      }
      const used = new Set();
      cands.sort(() => r() - 0.5).sort((p, q) => q[2] - p[2]);
      for (const [a, b] of cands) {
        if (pairs.length >= 3) break;
        if (used.has(a) || used.has(b) || r() < 0.35) continue;
        used.add(a); used.add(b);
        const spot = N.outingSpots[Math.floor(r() * N.outingSpots.length)];
        pairs.push({ a, b, spot, from: 14 * 60 + Math.floor(r() * 4) * 15, to: 17 * 60 });
      }
    }
    outCache = { key, pairs };
    return pairs;
  }
  /* 空閒的人會自己跑去找朋友（每半小時重新決定一次） */
  const BUSY = /上課|營業|時段|睡|學生會|研究室|批改|講座|實驗|備料|揉麵|尖峰|採買|校外調查|集會|補課|開會|值班|接待|練團|焊接|寫報告|自修/;
  let visitCache = { key: "", map: {} };
  function autoVisits(c) {
    const half = Math.floor(c.min / 30);
    const key = store.mode + c.dateKey + c.dow + "-" + half + JSON.stringify(slot().rel || {});
    if (visitCache.key === key) return visitCache.map;
    const base = E.whereabouts(c, null, autoOutings(c));
    const r = rng(c.dateKey + "|visit|" + c.dow + "|" + half);
    const ids = N.characters.map(x => x.id).sort(() => r() - 0.5);
    const map = {}, taken = new Set();
    for (const x of ids) {
      const w = base[x];
      if (!w.avail || w.assigned || BUSY.test(w.act) || taken.has(x) || r() > 0.14) continue;
      // 已經和很要好的人待在一起，就不會特地離開去找別人
      let here = 0;
      for (const o of N.characters) {
        if (o.id === x || base[o.id].loc !== w.loc || !base[o.id].avail) continue;
        const rr = getRel(x, o.id); here = Math.max(here, rr.pts + (rr.status === "交往中" ? 40 : 0));
      }
      let best = null, bestScore = here + 15;
      for (const o of N.characters) {
        const f = o.id, fw = base[f];
        if (f === x || taken.has(f) || !fw.avail || fw.loc === w.loc || BUSY.test(fw.act) || fw.assigned) continue;
        const L = E.locById(fw.loc), rel = getRel(x, f), fx = fixedRel(x, f);
        if (!L || L.kind === "external") continue;
        if (L.kind === "home" && !(rel.status === "交往中" || (fx && fx.family))) continue;
        if (rel.pts < 45 && rel.status !== "交往中") continue;
        const sc = rel.pts + (rel.status === "交往中" ? 40 : 0) + r() * 25;
        if (sc > bestScore) { bestScore = sc; best = f; }
      }
      if (!best) continue;
      taken.add(x); taken.add(best);
      map[x] = { loc: base[best].loc, until: Date.now() + 1e9, act: `跑來這裡找${best}`, visit: best };
    }
    visitCache = { key, map };
    return map;
  }
  /* ═════════ 自己決定要去哪：餓、累、無聊（每半小時決定一次，最多持續一小時半） ═════════ */
  const MEAL = /吃|餐|宵夜|點心|甜點|泡麵|早午餐|討/;
  const NEED_TRAIT = { "ミニクイ": { hunger: 2.2 }, "瑞特": { bored: 1.6, hunger: 1.3 }, "白": { bored: 1.6 }, "史威特": { bored: 1.4 }, "人間天使": { hunger: 1.4, bored: 1.3 },
    "佐代": { bored: 0.5 }, "梅魯塔": { bored: 0.5, tired: 1.3 }, "沏萊爾": { tired: 1.4 }, "黑子": { bored: 0.7 }, "癇癪": { hunger: 1.2 }, "海爾": { hunger: 0.3, bored: 0.3 } };
  const LEISURE = ["諾文公園", "諾文河岸步道", "諾文舊物市場", "諾文服飾街", "諾文立體街廊", "諾文甜點店", "諾文古神話展館", "諾文鐘塔廣場", "諾文混合書街"];
  function foodPlace(c, r) {
    const m = c.min, opts = [];
    if (c.dow !== 1 && m >= 7 * 60 && m < 23 * 60) opts.push("Hale’s Oven", "Hale’s Oven");
    if (m >= 8 * 60 && m < 19 * 60) opts.push("諾文甜點店");
    if (m >= 18 * 60 || m < 60) opts.push("諾文夜市", "諾文夜市");
    return opts.length ? opts[Math.floor(r() * opts.length)] : null;
  }
  function needDecision(x, ck, b) {
    const w = E.resolve(x, ck);
    if (!w.avail || BUSY.test(w.act)) return null;
    const r = rng(ck.dateKey + "|need|" + x + "|" + b), tr = NEED_TRAIT[x] || {}, home = N.schedules[x].home;
    let since = 0;
    for (let m = ck.min; m >= Math.max(0, ck.min - 600); m -= 30) { if (MEAL.test(E.resolve(x, Object.assign({}, ck, { min: m })).act)) break; since = ck.min - m + 30; }
    if (since >= 240 && !MEAL.test(w.act) && r() < (0.12 + (since - 240) / 900) * (tr.hunger || 1)) {
      const place = foodPlace(ck, r);
      if (place && place !== w.loc) return { kind: "hunger", loc: place, dur: 2, act: `肚子餓了，臨時跑去${locName(place)}吃點東西` };
    }
    if ((ck.min >= 21 * 60 || ck.min < 60) && w.loc !== home && r() < 0.16 * (tr.tired || 1)) return { kind: "tired", loc: home, dur: 3, act: "累了，提早回家休息" };
    let same = 0;
    for (let m = ck.min - 30; m >= Math.max(0, ck.min - 300); m -= 30) { if (E.resolve(x, Object.assign({}, ck, { min: m })).act !== w.act) break; same += 30; }
    if (same >= 120 && ck.min >= 9 * 60 && ck.min < 20 * 60 && r() < 0.12 * (tr.bored || 1)) {
      const place = LEISURE[Math.floor(r() * LEISURE.length)];
      if (place !== w.loc) return { kind: "bored", loc: place, dur: 2, act: `有點無聊，晃去${locName(place)}透透氣` };
    }
    return null;
  }
  const needCache = new Map();
  function autoNeeds(c) {
    const half = Math.floor(c.min / 30);
    const key = store.mode + c.dateKey + c.dow + "-" + half;
    if (store.needs === false) return {};
    if (needCache.has(key)) return needCache.get(key);
    const map = {};
    for (const x of N.characters.map(o => o.id)) {
      const now = E.resolve(x, c);
      if (!now.avail) continue;
      for (let b = half; b >= Math.max(0, half - 2); b--) {
        const ck = Object.assign({}, c, { min: b * 30 });
        if (b !== half && E.resolve(x, ck).act !== now.act) break;
        const d = needDecision(x, ck, b);
        if (d) { if (b + d.dur > half) map[x] = { loc: d.loc, until: Date.now() + 1e9, act: d.act, need: d.kind, needFrom: b * 30 }; break; }
      }
    }
    if (needCache.size > 300) needCache.clear();
    needCache.set(key, map);
    return map;
  }
  function autoOutings(c) {
    const out = {}, base = E.whereabouts(c);
    for (const p of outingPairs(c)) {
      if (c.min < p.from || c.min >= p.to) continue;
      if (!base[p.a].avail || !base[p.b].avail) continue;
      out[p.a] = { loc: p.spot.loc, until: Date.now() + 1e9, act: `和${p.b}${p.spot.act}` };
      out[p.b] = { loc: p.spot.loc, until: Date.now() + 1e9, act: `和${p.a}${p.spot.act}` };
    }
    return out;
  }
  // 進行中的相遇對應的事件（互動產生的對話存在相遇本身）
  function encEvent(enc) {
    if (!enc) return null;
    if (enc.gen) return { id: enc.eid, scene: enc.eid, title: enc.title, loc: locName(enc.loc), place: enc.loc, cast: enc.cast, lines: enc.lines, src: "互動", gen: true };
    return E.eventById(enc.eid);
  }
  const locName = id => { const l = E.locById(id); return l ? l.name : id; };
  const ch = id => E.charById(id);

  /* ═════════ 小元件 ═════════ */
  const AVATARS = N.avatars || {};
  function person(id, size) {
    const c = ch(id); const col = c ? c.color : "#999";
    size = size || 24;
    if (AVATARS[id]) return `<img class="pi av" src="icons/avatars/${AVATARS[id]}.webp" width="${size}" height="${size}" alt="" loading="lazy" decoding="async" style="background:${col}" onerror="this.removeAttribute('src')">`;
    return `<svg class="pi" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="7.4" r="4.3" fill="${col}"/><path d="M3.8 21.6c0-4.8 3.7-8.2 8.2-8.2s8.2 3.4 8.2 8.2z" fill="${col}"/></svg>`;
  }
  const genericPerson = (size) => `<svg class="pi" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="7.4" r="4.3" fill="currentColor"/><path d="M3.8 21.6c0-4.8 3.7-8.2 8.2-8.2s8.2 3.4 8.2 8.2z" fill="currentColor"/></svg>`;
  let toastTimer = null;
  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2200);
  }

  /* ═════════ 街區圖底圖（SVG） ═════════ */
  function backdrop(regionId, page) {
    const S = 'fill="var(--m-street)"', P = 'fill="var(--m-park)"', W = 'fill="var(--m-water)"';
    let g = "";
    if (regionId === "outer" && page > 0) {
      g = `<path d="M0 90 Q90 40 180 70 T360 50 V0 H0Z" ${P} opacity=".55"/>
        <path d="M0 130 Q120 90 230 120 T360 105 V0 H0Z" ${P} opacity=".35"/>
        <path d="M-10 500 C 90 420, 140 330, 200 260 S 300 140, 370 110" fill="none" stroke="var(--m-street)" stroke-width="30"/>
        <path d="M-10 500 C 90 420, 140 330, 200 260 S 300 140, 370 110" fill="none" stroke="var(--m-rail)" stroke-width="12" stroke-dasharray="3 9"/>
        <path d="M-10 500 C 90 420, 140 330, 200 260 S 300 140, 370 110" fill="none" stroke="var(--m-rail)" stroke-width="2" transform="translate(-6 0)"/>
        <path d="M-10 500 C 90 420, 140 330, 200 260 S 300 140, 370 110" fill="none" stroke="var(--m-rail)" stroke-width="2" transform="translate(6 0)"/>`;
    } else if (regionId === "central") {
      g = `<rect x="0" y="70" width="360" height="9" ${S} opacity=".7"/><rect x="0" y="448" width="360" height="9" ${S} opacity=".7"/>
        <rect x="58" y="0" width="9" height="520" ${S} opacity=".7"/><rect x="292" y="0" width="9" height="520" ${S} opacity=".7"/>
        <rect x="0" y="160" width="360" height="26" ${S}/><rect x="0" y="336" width="360" height="22" ${S}/>
        <rect x="168" y="0" width="24" height="520" ${S}/>
        <circle cx="180" cy="262" r="60" fill="var(--m-plaza)" stroke="var(--m-street-edge)" stroke-width="2"/>
        <circle cx="180" cy="262" r="12" fill="var(--m-street-edge)"/>
        <rect x="12" y="374" width="146" height="64" rx="20" ${P}/><circle cx="58" cy="406" r="11" ${W}/>
        <rect x="210" y="200" width="70" height="46" rx="10" ${P} opacity=".6"/>`;
    } else if (regionId === "academy") {
      g = `<rect x="0" y="108" width="360" height="20" ${S}/><rect x="0" y="402" width="360" height="20" ${S}/>
        <rect x="26" y="0" width="14" height="520" ${S}/><rect x="320" y="0" width="14" height="520" ${S}/>
        <rect x="66" y="150" width="228" height="230" rx="34" ${P}/>
        <path d="M66 150 L294 380 M294 150 L66 380" stroke="var(--m-street)" stroke-width="10"/>
        <circle cx="180" cy="265" r="24" ${W}/><rect x="60" y="440" width="120" height="50" rx="14" ${P} opacity=".6"/>`;
    } else if (regionId === "oldtown") {
      g = `<path d="M0 118 C 80 98, 140 160, 220 128 S 330 88, 360 108" fill="none" stroke="var(--m-street)" stroke-width="16"/>
        <path d="M92 0 C 112 120, 60 220, 120 320 S 200 420, 182 520" fill="none" stroke="var(--m-street)" stroke-width="14"/>
        <path d="M0 262 C 90 250, 200 292, 360 238" fill="none" stroke="var(--m-street)" stroke-width="12"/>
        <path d="M250 0 C 240 80, 290 160, 270 230" fill="none" stroke="var(--m-street)" stroke-width="8" opacity=".8"/>
        <path d="M360 330 C 290 350, 250 420, 160 450 S 30 488, 0 500 L0 520 L360 520Z" ${W}/>
        <path d="M360 360 C 300 380, 260 440, 170 470 S 40 505, 0 515" fill="none" stroke="var(--card)" stroke-width="2" opacity=".5"/>
        <rect x="196" y="410" width="22" height="80" rx="4" fill="var(--m-street-edge)" transform="rotate(-24 207 450)"/>`;
    } else {
      g = `<rect x="0" y="232" width="360" height="22" ${S}/><rect x="120" y="0" width="16" height="520" ${S}/>
        <rect x="250" y="0" width="12" height="520" ${S} opacity=".7"/>
        <path d="M0 150 L360 96" stroke="var(--m-rail)" stroke-width="2"/><path d="M0 160 L360 106" stroke="var(--m-rail)" stroke-width="2"/>
        <path d="M0 155 L360 101" stroke="var(--m-rail)" stroke-width="9" stroke-dasharray="2 8"/>
        <path d="M0 420 L360 378" stroke="var(--m-rail)" stroke-width="2"/><path d="M0 430 L360 388" stroke="var(--m-rail)" stroke-width="2"/>
        <path d="M0 425 L360 383" stroke="var(--m-rail)" stroke-width="9" stroke-dasharray="2 8"/>
        <rect x="20" y="300" width="80" height="60" rx="10" ${P} opacity=".6"/>`;
    }
    return `<svg class="map-bg" viewBox="0 0 360 520" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="360" height="520" fill="var(--m-ground)"/>${g}</svg>`;
  }

  /* ═════════ 導覽 ═════════ */
  let view = store.ui.view || "town";
  if (view === "observe" && !slot().observing) view = "town";
  function nav(v) {
    if (watching) exitWatch();
    if (view === "town" && v !== "town" && N.town3d) { N.town3d.unmount(); card3d = null; document.body.classList.remove("t3d-full"); }
    view = v; store.ui.view = v; save();
    closeSheet();
    render();
    window.scrollTo(0, 0);
  }
  function render() {
    const c = clockNow();
    renderTop(c);
    document.querySelectorAll(".tab").forEach(t => t.classList.toggle("on", t.dataset.nav === view));
    const el = $("#view");
    el.className = "view";
    const bar = $("#actionBar");
    if (bar && view !== "observe") { bar.hidden = true; bar.innerHTML = ""; }
    if (view === "town") renderTown(el, c);
    else if (view === "residents") renderResidents(el, c);
    else if (view === "log") renderLog(el);
    else if (view === "observe") renderObserve(el, c);
    renderPill();
  }
  function renderTop(c) {
    renderBell();
    const sl = speedLabel();
    $("#clockText").textContent = clockLabel(c) + " " + (WX_ICON[c.weather] || "") + (sl ? "" : c.weather) + sl;
    $("#clockChip").setAttribute("aria-label", clockLabel(c) + "，" + c.weather + (sl ? "，" + sl.trim() : "") + "。時間與設定");
    $("#previewBanner").hidden = true;
  }
  function renderPill() {
    const s = slot(), pill = $("#obsPill");
    if (!s.observing || view === "observe") { pill.hidden = true; $("#view").classList.remove("has-pill"); return; }
    const enc = s.encounter;
    pill.innerHTML = person(s.observing, 30) + `<span>觀察中：${esc(ch(s.observing).id)}${enc && enc.pending ? "・有人在聊天" : enc && !enc.done ? "・對話還沒看完" : ""}</span>`;
    pill.hidden = false;
    $("#view").classList.add("has-pill");
  }

  /* ═════════ 相遇提示：現在有誰「可能」碰上對話 ═════════ */
  let hintCache = { key: "", set: new Set() };
  function hintSet(c, where) {
    const key = store.mode + c.dow + "-" + c.min + "-" + c.weather + "-" + JSON.stringify(slot().assign) + (slot().encounter ? slot().encounter.eid : "");
    if (hintCache.key === key) return hintCache.set;
    const set = new Set();
    for (const x of N.characters) {
      if (!where[x.id].avail) continue;
      if (E.candidates(x.id, c, where, isCooling).some(ev => ev.cast.length > 1 && !ev.asleep)) set.add(x.id);
    }
    hintCache = { key, set };
    return set;
  }
  const HINT = `<span class="hint-dot" aria-hidden="true">💬</span>`;

  /* ═════════ 小鎮 ═════════ */
  let townSig = "";
  // 手機（觸控、小螢幕）不顯示 3D 小鎮，只用街區圖；房間的 3D 畫面照常
  const isPhone = () => !(window.matchMedia && matchMedia("(pointer:fine)").matches && Math.max(screen.width, screen.height) >= 1000);
  // 手機預設看街區圖（3D 小鎮比較耗電、吃記憶體），切到「3D 小鎮」後才開；電腦預設就是 3D
  const want3d = () => isPhone() ? store.ui.town3dPhone === true : store.ui.town3d !== false;
  const use3d = () => want3d() && N.town3d && N.town3d.supported() && !fail3d;
  let fail3d = false, card3d = null, followTick = 0;
  function townTopHTML(c) {
    const tf = todayFests(c);
    return `<div class="town-top">
        ${tf.length ? `<div class="fest-banner">${tf.map(f => `<span class="fest-name">${f.icon} 今天是<span class="nw">〈${esc(f.name)}〉</span></span>`).join("")}${N.life ? `<small class="fest-focus">${N.life.focusHTML(c)}</small>` : ""}</div>` : `<div class="fest-banner plain">${N.life ? N.life.focusHTML(c) : "今天沒有節日"}</div>`}
        <button type="button" class="btn primary party-btn" id="partyBtn">🎉 發起聚會</button>
      </div>
      ${radioHTML()}
      ${N.town3d && N.town3d.supported() ? `<div class="seg view-switch" role="tablist" aria-label="小鎮顯示方式">
        <button type="button" data-view3d="1" class="${use3d() ? "on" : ""}">🧊 3D 小鎮</button>
        <button type="button" data-view3d="0" class="${use3d() ? "" : "on"}">🗺️ 街區圖</button>
      </div>` : ""}`;
  }
  /* ═════════ 諾文電台：小鎮頁上的音樂播放器（歌單隨機播放、或跟著地點換曲） ═════════ */
  function radioHTML() {
    if (!N.lofi || !N.lofi.tracks) return "";
    const on = N.lofi.isPlaying(), cu = N.lofi.current(), list = N.lofi.mode() === "list";
    return `<div class="radio ${on ? "on" : ""}" id="radio">
      <button type="button" class="radio-play" id="radioPlay" aria-label="${on ? "暫停" : "播放"}">${on ? "⏸" : "▶"}</button>
      <button type="button" class="radio-info" id="radioList" aria-label="打開歌單">
        <b id="radioName">${esc(cu ? cu.name : "諾文電台")}</b>
        <small id="radioSub">${esc(on ? (cu && cu.mood ? cu.mood : "") : list ? (N.lofi.shuffle() ? "歌單・隨機播放" : "歌單・依序播放") : "跟著地點換曲")}</small>
        <span class="radio-bar"><i id="radioProg" style="width:${Math.round(N.lofi.progress() * 100)}%"></i></span>
      </button>
      <button type="button" class="radio-btn ${list && N.lofi.shuffle() ? "on" : ""}" id="radioShuffle" aria-label="隨機播放" ${list ? "" : "disabled"}>🔀</button>
      <button type="button" class="radio-btn" id="radioNext" aria-label="下一首">⏭</button>
    </div>`;
  }
  function updateRadio() {
    const r = $("#radio"); if (!r) return;
    const tmp = document.createElement("div"); tmp.innerHTML = radioHTML(); r.replaceWith(tmp.firstElementChild);
  }
  function updateRadioProgress() { const p = $("#radioProg"); if (p && N.lofi) p.style.width = Math.round(N.lofi.progress() * 100) + "%"; }
  function openMusicSheet() { sheetState = { type: "music" }; renderMusicSheet(); openSheet(); }
  function renderMusicSheet() {
    const L = N.lofi, list = L.mode() === "list", cu = L.current(), on = L.isPlaying();
    const row = t => `<button type="button" class="track ${cu && cu.id === t.id && list ? "on" : ""}" data-track="${esc(t.id)}"><span class="track-ic">${cu && cu.id === t.id && list && on ? "♪" : t.song ? "🎼" : "📍"}</span><span class="track-n"><b>${esc(t.name)}</b><small>${esc(t.mood || "")}</small></span></button>`;
    const T = L.tracks();
    $("#sheetBody").innerHTML = `<h3>📻 諾文電台</h3>
      <div class="seg music-mode"><button type="button" data-musicmode="list" class="${list ? "on" : ""}">🎶 歌單</button><button type="button" data-musicmode="place" class="${list ? "" : "on"}">📍 跟著地點換曲</button></div>
      ${list ? `<div class="music-tools"><button type="button" class="btn soft sm" data-musictool="shuffle">${L.shuffle() ? "🔀 隨機播放：開" : "🔁 依序播放"}</button><button type="button" class="btn soft sm" data-musictool="next">⏭ 下一首</button><button type="button" class="btn ${on ? "soft" : "primary"} sm" data-musictool="play">${on ? "⏸ 暫停" : "▶ 播放"}</button></div>`
        : `<p class="sheet-desc">走到哪裡就換成那裡的曲風（咖啡廳、夜市、地下湖……）。</p><div class="music-tools"><button type="button" class="btn ${on ? "soft" : "primary"} sm" data-musictool="play">${on ? "⏸ 暫停" : "▶ 播放"}</button></div>`}
      <h4 style="margin-top:14px">🎼 諾文的歌</h4><div class="track-list">${T.filter(t => t.song).map(row).join("")}</div>
      <h4 style="margin-top:14px">📍 地方的曲子</h4><div class="track-list">${T.filter(t => !t.song).map(row).join("")}</div>
      <div class="sheet-actions"><button type="button" class="btn soft" data-close>關閉</button></div>`;
  }
  function musicClick(t) {
    const L = N.lofi; if (!L || !L.tracks) return false;
    if (t.id === "radioPlay") { const on = L.toggle(); store.ui.music = !!on; save(); updateMusicBtn(); updateRadio(); return true; }
    if (t.id === "radioNext") { L.next(); if (!L.isPlaying()) { L.start(); store.ui.music = true; } save(); updateRadio(); return true; }
    if (t.id === "radioShuffle") { L.shuffle(!L.shuffle()); updateRadio(); return true; }
    if (t.id === "radioList") { openMusicSheet(); return true; }
    const d = t.dataset || {};
    if (d.track) { L.playTrack(d.track); store.ui.music = true; save(); renderMusicSheet(); updateRadio(); return true; }
    if (d.musicmode) { L.setMode(d.musicmode); if (d.musicmode === "place") L.setTheme(musicFor(clockNow())); renderMusicSheet(); updateRadio(); return true; }
    if (d.musictool === "shuffle") { L.shuffle(!L.shuffle()); renderMusicSheet(); return true; }
    if (d.musictool === "next") { L.next(); if (!L.isPlaying()) { L.start(); store.ui.music = true; save(); } renderMusicSheet(); return true; }
    if (d.musictool === "play") { const on = L.toggle(); store.ui.music = !!on; save(); updateMusicBtn(); renderMusicSheet(); updateRadio(); return true; }
    return false;
  }
  N._state3d = c => state3d(c || clockNow());   // 除錯用
  function state3d(c) {
    const where = currentWhere(c), s = slot();
    const tf = todayFests(c);
    // 接下來 12 分鐘內誰要換地方（給 3D 小鎮提早出門用），以及現在的時間流速
    const rate = store.mode === "preview" ? (store.preview.paused ? 0 : (store.preview.speed || 1)) : 1, ahead = {};
    for (let k = 1; k <= 12 && c.min + k < 1440; k++) {
      const w2 = currentWhere(Object.assign({}, c, { min: c.min + k, abs: c.abs + k }), true);
      for (const id in w2) if (!ahead[id] && where[id] && w2[id] && w2[id].loc !== where[id].loc) ahead[id] = { loc: w2[id].loc, in: k };
    }
    return { min: c.min, weather: c.weather, where, ahead, rate, hints: hintSet(c, where), observing: s.observing, fests: tf, partyLoc: s.encounter && s.encounter.party ? s.encounter.loc : null,
      talking: s.encounter && !s.encounter.done && !s.encounter.pending ? s.encounter.cast.slice() : [] };
  }
  function renderTown3d(el, c) {
    const sp = store.preview, live = store.mode === "preview";
    el.innerHTML = townTopHTML(c) + `
      <div class="t3d ${timeTint(c)}" id="t3d">
        <div class="t3d-loading" id="t3dLoading">小鎮搭建中……</div>
        <div class="t3d-hud t3d-speed" role="group" aria-label="時間流速">
          ${[[0, `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor"/><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor"/></svg>`], [1, "1×"], [5, "5×"], [20, "20×"]].map(([v, t]) => `<button type="button" data-speed="${v}" class="${live && (v === 0 ? sp.paused : !sp.paused && (sp.speed || 1) === v) ? "on" : ""}" aria-label="${v ? "流速 " + v + " 倍" : "暫停"}">${t}</button>`).join("")}
          <button type="button" id="plus1h" aria-label="快轉一小時">+1h</button>
        </div>
        <div class="t3d-hud t3d-tools">
          <button type="button" id="t3dFull" class="t3d-phone" aria-label="全螢幕看小鎮" aria-pressed="false">⛶</button>
          <button type="button" id="t3dMore" class="t3d-phone" aria-label="更多鏡頭按鈕" aria-expanded="false">⋯</button>
          <button type="button" id="t3dHome" aria-label="回到全景">🏠</button>
          <button type="button" id="t3dLabels" class="${store.ui.labels3d !== false ? "on" : ""}" aria-label="顯示地名">🏷️</button>
          <button type="button" id="t3dFollow" aria-label="鏡頭跟著居民">📍</button>
          <button type="button" id="t3dWatch" aria-label="放著看">📺</button>
          <button type="button" data-rot3d="1" aria-label="向左轉" title="向左轉（Q；右鍵或 Shift＋拖曳也能轉）">⟲</button>
          <button type="button" data-rot3d="-1" aria-label="向右轉" title="向右轉（E）">⟳</button>
        </div>
        <div class="t3d-regions">${N.regions.map(r => `<button type="button" data-fly="${r.id}">${r.name}</button>`).join("")}</div>
        <div class="t3d-follow" id="t3dFollowChip" hidden><span></span><button type="button" id="t3dUnfollow" aria-label="鏡頭不要再跟著">✕</button></div>
        <div class="t3d-card" id="t3dCard" hidden></div>
      </div>`;
    document.body.classList.remove("t3d-full");
    // 鏡頭在跟著誰：上方小標籤，點 ✕ 放開
    clearInterval(followTick);
    followTick = setInterval(() => {
      const chip = $("#t3dFollowChip"); if (!chip) { clearInterval(followTick); return; }
      const id = N.town3d.isReady() ? N.town3d.isFollowing() : null;
      chip.hidden = !id; if (id) chip.firstChild.textContent = "鏡頭跟著" + id;
    }, 500);
    const box = $("#t3d");
    const onProgress = (p, label) => {
      if (N.splash && N.splash.active()) N.splash.progress(0.08 + p * 0.92, label);
      const l = $("#t3dLoading"); if (l) l.textContent = label;
    };
    N.town3d.mount(box, { onChar: showCard3d, onLoc: id => openLocation(id), onEmpty: hideCard3d, onProgress }).then(() => {
      const l = $("#t3dLoading"); if (l) l.remove();
      if (N.splash) N.splash.done();
      N.town3d.setLabels(store.ui.labels3d !== false);
      N.town3d.onSay = showCaption;
      N.town3d.update(state3d(clockNow()));
      if (card3d) showCard3d(card3d);
    }).catch(e => { console.error("3d", e && e.stack || e); if (N.splash) N.splash.done(); fail3d = true; if (view === "town") render(); toast("這台裝置無法顯示 3D，先用街區圖"); });
    townSig = "3d|" + todayFests(c).map(f => f.id).join(",") + "|" + timeTint(c);
  }
  function showCard3d(id) {
    card3d = id;
    const el = $("#t3dCard"); if (!el) return;
    const c = clockNow(), w = currentWhere(c)[id], x = ch(id), s = slot();
    const comp = N.characters.filter(o => o.id !== id && currentWhere(c)[o.id].loc === w.loc && currentWhere(c)[o.id].avail).map(o => o.id);
    el.innerHTML = `<button type="button" class="card3d-x" id="card3dClose" aria-label="關閉">✕</button>
      <div class="card3d-head">${person(id, 46)}<div><b>${esc(id)}</b><small>${esc(x.role)}</small></div></div>
      <div class="card3d-where"><b>${esc(locName(w.loc))}</b>・${esc(w.act)}${w.avail ? "" : `<span class="tag rest">休息中</span>`}</div>
      ${comp.length ? `<div class="card3d-with">${comp.map(o => person(o, 20)).join("")}<span>和${esc(comp.join("、"))}在一起</span></div>` : ""}
      <div class="card3d-act">
        <button type="button" class="btn primary" data-observe="${esc(id)}">${s.observing === id ? "回到觀察" : "👀 觀察"}</button>
        <button type="button" class="btn soft" data-follow3d="${esc(id)}">📍 跟著看</button>
        ${w.avail && N.interiors && N.interiors[w.loc] ? `<button type="button" class="btn soft" data-ctlstart="${esc(id)}">🎮 操控</button>` : ""}
        <button type="button" class="btn soft" data-cardloc="${esc(w.loc)}">🏠 這個地點</button>
      </div>`;
    el.hidden = false;
  }
  /* ═════════ 放著看：全螢幕、沒有按鈕，鏡頭自己找有事發生的地方 ═════════ */
  let watching = false;
  function enterWatch() {
    if (!use3d() || !N.town3d.isReady()) return;
    watching = true; hideCard3d();
    document.body.classList.add("watching");
    const box = $("#t3d");
    box.insertAdjacentHTML("beforeend", `<div class="watch-layer" id="watchLayer"><div class="watch-clock" id="watchClock"></div><div class="watch-cap" id="watchCap"></div><div class="watch-tip">點一下回到小鎮</div></div>`);
    N.town3d.setDirector(true);
    ambientAt = 0;
    try { if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {}); } catch (e) { /* 不支援就算了 */ }
    updateWatchClock();
  }
  function exitWatch() {
    watching = false;
    document.body.classList.remove("watching");
    const l = $("#watchLayer"); if (l) l.remove();
    if (N.town3d) N.town3d.setDirector(false);
    try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) { /* ignore */ }
  }
  let capTimer = 0;
  function showCaption(id, text) {
    if (!watching) return;
    const el = $("#watchCap"); if (!el) return;
    el.innerHTML = `${person(id, 26)}<span><b>${esc(id)}</b>${esc(text)}</span>`;
    el.classList.add("on");
    clearTimeout(capTimer); capTimer = setTimeout(() => el.classList.remove("on"), 6000);
  }
  function updateWatchClock() { const el = $("#watchClock"); if (el) { const c = clockNow(); el.textContent = clockLabel(c) + " " + (WX_ICON[c.weather] || ""); } }
  function updateMusicBtn() { const b = $("#musicBtn"); if (b) { const on = N.lofi && N.lofi.isPlaying(); b.classList.toggle("on", !!on); b.setAttribute("aria-label", on ? "關閉音樂" : "播放 lofi 音樂"); } }
  function hideCard3d() { card3d = null; const el = $("#t3dCard"); if (el) el.hidden = true; }

  /* ═════════ 3D 小鎮裡的自言自語與閒聊（只是氣氛，不會記進日誌） ═════════ */
  let ambientAt = 0;
  const fillTo = (line, speaker, listener) => {
    let t = line.replace(/\{to\}/g, listener ? E.nick(speaker, listener) : "").replace(/\{me\}/g, speaker);
    const lc = listener && ch(listener); if (lc && !lc.male) t = t.replace(/你/g, "妳");
    return t;
  };
  const short = t => t.length > 46 ? t.slice(0, 45) + "…" : t;
  function ambientTick(c) {
    if (view !== "town" || !use3d() || !N.town3d.isReady() || document.visibilityState !== "visible") return;
    if (!$("#sheet").hidden) return;
    const now = Date.now();
    if (now < ambientAt) return;
    ambientAt = now + (watching ? 3000 + Math.random() * 3000 : 4500 + Math.random() * 5000);
    const where = currentWhere(c), s = slot(), enc = s.encounter;
    const free = N.characters.map(x => x.id).filter(id => where[id].avail && !(enc && !enc.done && enc.cast.indexOf(id) >= 0));
    const pairs = [];
    for (let i = 0; i < free.length; i++) for (let j = i + 1; j < free.length; j++) {
      const a = free[i], b = free[j]; if (where[a].loc !== where[b].loc) continue;
      const r = getRel(a, b); pairs.push({ a, b, w: r.pts + (r.status ? 40 : 0) + (N.banter && N.banter[pairKey(a, b)] ? 30 : 0) + Math.random() * 30 });
    }
    pairs.sort((p, q) => q.w - p.w);
    if (pairs.length && Math.random() < 0.72) {
      const pr = pairs[Math.floor(Math.random() * Math.min(3, pairs.length))];
      if (N.life && getRel(pr.a, pr.b).pts >= 50 && Math.random() < N.life.quietChance(c)) {
        N.life.quietBubbles(pr.a, pr.b).forEach((l, i) => N.town3d.say(l[0], l[1], "think", i * 2200));
        return;
      }
      const ex = ambientExchange(pr.a, pr.b);
      ex.forEach((l, i) => N.town3d.say(l[0], short(l[1]), l[2], i * 2600));
      return;
    }
    const solo = free.filter(id => !pairs.some(p => p.a === id || p.b === id));
    const pool = solo.length ? solo : free;
    if (!pool.length) return;
    const id = pool[Math.floor(Math.random() * pool.length)], V = N.voices[id];
    const arr = (V.mutter && V.mutter.length ? V.mutter : V.share) || [];
    if (arr.length) N.town3d.say(id, short(fillTo(arr[Math.floor(Math.random() * arr.length)], id, null)), "think");
  }
  function ambientExchange(a, b) {
    const pk = pairKey(a, b), bt = N.banter && N.banter[pk];
    const r = getRel(a, b), pickA = arr => arr[Math.floor(Math.random() * arr.length)];
    if (bt && bt.length && Math.random() < 0.6) return pickA(bt).map(l => [l[0], l[1], ""]);
    if (Math.random() < 0.5) [a, b] = [b, a];
    const Va = N.voices[a], Vb = N.voices[b];
    if (r.status === "交往中" && Va.love && Va.love.sweet) {
      return [[a, fillTo(pickA(Va.love.sweet), a, b), "love"], [b, fillTo(pickA((Vb.love && Vb.love.sweetReply) || Vb.quip || Vb.react2), b, a), "love"]];
    }
    const first = Math.random() < 0.5 ? pickA(Va.open.chat) : pickA(Va.share.filter(x => x.indexOf(b) < 0).concat(Va.open.chat));
    return [[a, fillTo(first, a, b), ""], [b, fillTo(pickA(Vb.quip && Vb.quip.length ? Vb.quip : Vb.react2), b, a), ""]];
  }
  function newsBubbles(items) {
    if (view !== "town" || !use3d() || !N.town3d.isReady()) return;
    items.forEach((it, k) => {
      const m = /^(.+?)：「(.+)」$/.exec(it.quote || "");
      if (m) N.town3d.say(m[1], short(m[2]), it.kind === "love" ? "love" : "", k * 2000);
    });
  }

  function renderTown(el, c) {
    if (use3d()) { if (ctl && ctl.mode === "town" && el.querySelector("#t3d")) return; if (ctl && ctl.mode === "town") { el.innerHTML = townTopHTML(c); return; } return renderTown3d(el, c); }   // 操控中，3D 小鎮在操控畫面裡，不要搶回來
    const where = currentWhere(c), occ = E.occupancy(where), hints = hintSet(c, where);
    const r = N.regions.find(x => x.id === store.ui.region) || N.regions[0];
    const page = Math.min(store.ui.page[r.id] || 0, r.pages.length - 1);
    const locs = N.locations.filter(l => l.region === r.id && l.page === page);
    let slots = "";
    for (let i = 0; i < 6; i++) {
      const l = locs.find(x => x.slot === i);
      if (!l) { slots += `<div class="slot"></div>`; continue; }
      const n = (occ[l.id] || []).length;
      const kind = l.kind === "home" ? "住處" : l.kind === "external" ? "聯外" : "";
      const hot = (occ[l.id] || []).some(id => hints.has(id));
      slots += `<div class="slot"><button type="button" class="loc-tile ${l.kind} ${hot ? "hot" : ""}" data-loc="${esc(l.id)}" aria-label="${esc(l.name)}，${n ? n + " 人" : "目前沒有人"}${hot ? "，可能有相遇" : ""}">${hot ? HINT : ""}
        <span class="loc-icon" aria-hidden="true">${l.icon}</span>
        <span class="loc-name">${esc(l.name)}</span>
        ${kind ? `<span class="loc-kind">${kind}</span>` : ""}
        <span class="loc-meta ${n ? "has" : ""}">${genericPerson(16)}${n ? n + " 人" : "—"}</span>
      </button></div>`;
    }
    el.innerHTML = townTopHTML(c) + `
      <div class="region-tabs" role="tablist" aria-label="區域">
        ${N.regions.map(x => `<button type="button" role="tab" data-region="${x.id}" class="${x.id === r.id ? "on" : ""}" aria-selected="${x.id === r.id}"><b>${x.name}</b><small>${x.sub}</small></button>`).join("")}
      </div>
      <div class="seg page-tabs" role="tablist" aria-label="分頁">
        ${r.pages.map((p, i) => `<button type="button" data-page="${i}" class="${i === page ? "on" : ""}">${esc(p)}</button>`).join("")}
      </div>
      <div class="map ${timeTint(c)}" id="map">
        ${backdrop(r.id, page)}
        <div class="map-label">${esc(r.name + r.sub)}・${esc(r.pages[page])}</div>
        <div class="map-grid">${slots}</div>
      </div>`;
    townSig = sigFor(occ, c);
  }
  function sigFor(occ, c) {
    if (use3d()) return "3d|" + todayFests(c).map(f => f.id).join(",") + "|" + timeTint(c);
    const h = [...hintSet(c, currentWhere(c))].sort().join("");
    return timeTint(c) + "|" + h + "|" + Object.keys(occ).map(k => k + ":" + occ[k].length).join(",");
  }

  /* ═════════ 地點名單 ═════════ */
  let sheetState = null;
  function openLocation(locId) {
    sheetState = { type: "loc", id: locId };
    renderLocationSheet();
    openSheet();
  }
  function renderLocationSheet() {
    const l = E.locById(sheetState.id); if (!l) return;
    const c = clockNow(), where = currentWhere(c);
    const here = N.characters.filter(x => where[x.id].loc === l.id), hints = hintSet(c, where);
    sheetState.sig = here.map(x => x.id + (where[x.id].avail ? "" : "z")).join(",");
    $("#sheetBody").innerHTML = `
      <h3><span aria-hidden="true">${l.icon}</span>${esc(l.name)}</h3>
      <p class="sheet-desc">${esc(l.desc || "")}</p>
      ${planHTML(l.id)}
      ${here.length ? `<ul class="people">${here.map(x => `<li><button type="button" class="person-row" data-observe="${esc(x.id)}">${person(x.id, 30)}<span>${esc(x.id)}</span>${where[x.id].avail ? (hints.has(x.id) ? `<span class="tag hint">💬 可能有相遇</span>` : "") : `<span class="tag rest">休息中</span>`}</button></li>`).join("")}</ul>`
        : `<div class="empty">目前沒有人</div>`}
      ${N.life ? N.life.placeHTML(l.id) : ""}
      <div class="sheet-actions"><button type="button" class="btn soft" data-close>關閉</button></div>`;
    updatePlans();
  }

  /* ═════════ 居民 ═════════ */
  function renderResidents(el, c) {
    const where = currentWhere(c), s = slot(), hints = hintSet(c, where);
    el.innerHTML = `<h2 class="view-title">居民</h2>
      <div class="res-list">${N.characters.map(x => {
        const w = where[x.id];
        return `<button type="button" class="res-card" data-observe="${esc(x.id)}">
          ${person(x.id, 44)}
          <span class="res-name">${esc(x.full)}${s.observing === x.id ? `<span class="obs-badge">觀察中</span>` : ""}${hints.has(x.id) ? `<span class="tag hint">💬 可能有相遇</span>` : ""}</span>
          <span class="res-role">${esc(x.role)}</span>
          <span class="res-where"><b>${esc(locName(w.loc))}</b>・${esc(w.act)}${w.avail ? "" : ` <span class="tag rest">休息中</span>`}</span>
        </button>`;
      }).join("")}</div>`;
  }

  /* ═════════ 觀察 ═════════ */
  let profileOpen = false;
  function waitMs(first) {
    if (store.mode === "preview") return first ? rand(2500, 4500) : rand(5000, 10000);
    return first ? rand(3000, 6000) : rand(15000, 35000);
  }
  function startObserve(id) {
    const s = slot();
    if (s.observing !== id) {
      // 明確改觀察另一位：結束舊觀察，不把舊對話排隊
      if (s.encounter && !s.encounter.done) {
        const ev = encEvent(s.encounter);
        if (ev && !ev.gen) s.sceneAt[ev.scene] = Date.now();
      }
      s.observing = id; s.encounter = null; s.status = null;
      s.nextRollAt = Date.now() + waitMs(true);
      profileOpen = false;
      save(true);
    }
    nav("observe");
  }
  function stopObserve() {
    const s = slot();
    if (s.encounter && !s.encounter.done) {
      const ev = encEvent(s.encounter);
      if (ev && !ev.gen) s.sceneAt[ev.scene] = Date.now();
    }
    s.observing = null; s.encounter = null; s.status = null;
    save(true);
    nav("residents");
  }
  function isCooling(ev) {
    const t = slot().sceneAt[ev.scene];
    return t && (Date.now() - t) < ev.cd * 60000;
  }
  function tryRoll() {
    const s = slot(); if (!s.observing || s.encounter) return;
    const c = clockNow(), where = currentWhere(c), me = where[s.observing];
    const cands = E.candidates(s.observing, c, where, isCooling);
    if (!cands.length || (!me.avail && Math.random() < 0.5)) {
      s.status = me.avail ? "none" : "rest"; s.nextRollAt = Date.now() + (me.avail ? 20000 : 40000); save(); updateObserveStatus(); return;
    }
    let total = 0;
    const ws = cands.map(ev => { const w = (ev.w || 3) * (s.read[ev.id] ? 1 : 3) * (ev.cast.length > 1 ? 1.4 : 0.6); total += w; return w; });
    let r = Math.random() * total, pick = cands[0];
    for (let i = 0; i < cands.length; i++) { r -= ws[i]; if (r <= 0) { pick = cands[i]; break; } }
    s.encounter = { eid: pick.id, step: 0, loc: pick.place === "*" ? me.loc : pick.place, cast: pick.cast.slice(), startedAt: Date.now(), done: false, pending: true,
      clock: { dow: c.dow, min: c.min, date: c.date, weather: c.weather } };
    s.status = null;
    save(true);
    renderObserve($("#view"), c);
    renderPill();
  }

  function skipEncounter(auto) {
    const s = slot(), enc = s.encounter; if (!enc || !enc.pending) return;
    const ev = encEvent(enc);
    if (ev) {
      if (!ev.gen) s.sceneAt[ev.scene] = Date.now();
      const cast = enc.cast.slice(), gainN = Math.max(1, Math.round(paceMul()));
      for (let i = 0; i < cast.length; i++) for (let j = i + 1; j < cast.length; j++) { const r = Object.assign({}, getRel(cast[i], cast[j])); r.pts = Math.min(r.route || r.status ? 100 : 84, r.pts + gainN); setRel(cast[i], cast[j], r); }
      if (cast.length > 1) pushNews({ kind: "chat", text: `💬 ${cast.join("、")}在${locName(enc.loc)}聊了〈${ev.title}〉，你沒有湊過去聽。`, cast, loc: enc.loc });
    }
    s.encounter = null; s.status = null; s.nextRollAt = Date.now() + waitMs(false);
    save(true);
    if (view === "observe") render();
  }
  function renderObserve(el, c) {
    const s = slot();
    if (!s.observing) { view = "residents"; return renderResidents(el, c); }
    const x = ch(s.observing), where = currentWhere(c), w = where[x.id];
    const enc = s.encounter;
    const ev = encEvent(enc);
    const pend = !!(enc && ev && enc.pending);
    const busy = !!(enc && !enc.done && !pend);
    const planLoc = enc && ev ? enc.loc : w.loc;
    if (enc && !ev) { s.encounter = null; save(); } // 資料已更動，安全地丟掉

    let body = "";
    if (pend) {
      const others = enc.cast.filter(id => id !== x.id);
      body = `<div class="card enc-invite">
          <div class="enc-who">${enc.cast.map(id => person(id, 34)).join("")}</div>
          <div class="enc-text">${esc(x.id)}${others.length ? `和${esc(others.join("、"))}` : ""}在${esc(locName(enc.loc))}${others.length ? "聊起來了" : "好像有什麼事"}。</div>
          <div class="enc-title">〈${esc(ev.title)}〉</div>
          <div class="enc-btns"><button type="button" class="btn primary" id="encYes">👂 聽聽看</button><button type="button" class="btn soft" id="encNo">${others.length ? "讓他們聊吧" : "先不看"}</button></div>
        </div>`;
    } else if (enc && ev) {
      const shown = ev.lines.slice(0, enc.step + 1);
      body = `<div class="scene-head">
          <div class="scene-meta">📍${esc(String(ev.loc)[0] === "@" ? locName(enc.loc) : ev.loc)}・週${E.WEEK[enc.clock.dow]} ${E.fmtMin(enc.clock.min)}</div>
          <div class="scene-title">〈${esc(ev.title)}〉</div>
        </div>
        <div class="transcript" id="transcript">${shown.map((l, i) => lineHTML(l, i === shown.length - 1 && !enc.done)).join("")}</div>
        ${enc.done ? `<div class="done-card"><b>這段相遇已記入日誌。</b>${enc.partyResult ? `<div class="rel-result">${esc(enc.partyResult)}</div>` : ""}${enc.bond && enc.bond.length ? `<div class="rel-result">💗 一起度過了一段時間：${enc.bond.map(x => `${esc(x[0])} ↔ ${esc(x[1])} +${x[2]}`).join("、")}</div>` : ""}${enc.result ? `<div class="rel-result">💗 ${esc(enc.delta.a)} ↔ ${esc(enc.delta.b)}　好感 ${enc.delta.amt >= 0 ? "+" : ""}${enc.delta.amt}（${enc.result.pts}・${esc(stageOf(enc.result.pts, enc.result.status))}）${enc.result.note ? `<br>${esc(enc.result.note)}` : ""}</div>` : ""}<br>按「繼續觀察」等待下一次相遇。</div>` : ""}`;
    } else {
      const others = N.characters.filter(o => o.id !== x.id && where[o.id].loc === w.loc);
      body = `<div class="card wait-card" id="obsStatus">${statusHTML(s, x, w, others)}</div>`;
    }

    el.innerHTML = `
      <div class="card obs-head">
        ${person(x.id, 56)}
        <div class="obs-name">${esc(x.full)}</div>
        <div class="obs-role">${esc(x.role)}</div>
        <div class="obs-where" id="obsWhere">${enc && ev && !pend ? `<b>${esc(locName(enc.loc))}</b>・正在和人說話` : whereHTML(w)}</div>
        ${N.life ? N.life.carryHTML(x.id) : ""}
        <div class="obs-tools">
          <button type="button" class="btn soft" id="assignBtn" ${busy ? "disabled" : ""}>🧭 指派去…</button>
          <button type="button" class="btn soft" id="interactBtn" ${busy ? "disabled" : ""}>💬 找人互動</button>
          <button type="button" class="btn soft" id="phoneBtn">📱 偷看手機</button>
          <button type="button" class="btn soft" id="relBtn">💗 關係</button>
          <button type="button" class="btn ${busy || !w.avail ? "soft" : "primary"} span2" id="ctlBtn" ${busy || !w.avail ? `disabled aria-describedby="ctlWhy"` : ""}>🎮 操控${esc(x.id)}</button>
          ${busy || !w.avail ? `<p class="obs-why span2" id="ctlWhy">${busy ? "正在和人說話，說完才能操控。" : `${esc(x.id)}現在${esc(w.act || "在休息")}，等有空的時候才能操控。`}</p>` : ""}
          <button type="button" class="btn soft span2" id="profileBtn" aria-expanded="${profileOpen}">📇 ${profileOpen ? "收起資料" : "角色資料"}</button>
        </div>
        ${profileOpen ? `<div class="profile"><p><b>個性</b>　${esc(x.traits)}</p><p><b>關係</b>　${esc(x.relations)}</p></div>` : ""}
        <button type="button" class="link-btn" id="stopBtn">停止觀察</button>
      </div>
      <div class="card plan-card">
        <div class="plan-title"><span>📐 ${esc(locName(planLoc))}・平面圖</span><span class="muted">${planLegend(planLoc)}</span></div>
        ${planHTML(planLoc)}
      </div>
      ${body}
      ${enc && ev && !pend ? "" : timelineHTML(x.id, c, w)}`;
    updatePlans();

    // 底部按鈕
    let bar = $("#actionBar");
    if (!bar) { bar = document.createElement("div"); bar.id = "actionBar"; bar.className = "action-bar"; document.getElementById("app").appendChild(bar); }
    if (enc && ev && !pend) {
      el.classList.add("has-action");
      const last = enc.step >= ev.lines.length - 1;
      bar.innerHTML = `<div class="inner">${enc.done
        ? `<button type="button" class="next-btn alt" id="contBtn">繼續觀察</button>`
        : `<button type="button" class="next-btn" id="nextBtn">${last ? "看完了" : "下一句"}</button>`}</div>`;
      bar.hidden = false;
    } else {
      el.classList.remove("has-action");
      bar.hidden = true; bar.innerHTML = "";
    }
    if (enc && ev && !pend) scrollToCurrent(false);
  }
  function lineHTML(l, cur) {
    if (l[0] === "＊") return `<div class="line narr ${cur ? "cur" : "old"}">${esc(l[1])}</div>`;
    return `<div class="line say ${cur ? "cur" : "old"}">${person(l[0], 34)}<div><div class="who">${esc(l[0])}</div><div class="bubble">${esc(l[1])}</div></div></div>`;
  }
  function whereHTML(w) {
    let t = `<b>${esc(locName(w.loc))}</b>・${esc(w.act)}`;
    const left = Math.ceil(((w.until || 0) - Date.now()) / 60000);
    if (w.assigned && left < 100000) t += ` <span class="tag asg">還會待 ${Math.max(1, left)} 分</span>`;
    return t;
  }
  function statusHTML(s, x, w, others) {
    let main, sub;
    if (!w.avail) {
      main = `<span>${esc(x.id)}正在休息</span>`;
      sub = "睡著的時候，偶爾會聽見夢話。也可以去看看其他居民。";
    } else if (s.status === "none") {
      main = `<span class="breath"></span><span>靜靜觀察中……</span>`;
      sub = others.length ? "現在這裡沒有適合發生的相遇，再等一下看看。" : "這裡暫時只有她一個人。換個時間，或許會遇到誰。".replace("她", x.id);
    } else {
      main = `<span class="breath"></span><span>靜靜觀察中……</span>`;
      sub = "有相遇發生時，對話會出現在這裡。";
    }
    const withRow = others.length
      ? `<div class="with-row">${others.map(o => `<span class="with-chip">${person(o.id, 22)}${esc(o.id)}</span>`).join("")}</div>`
      : "";
    return `<div class="wait-status">${main}</div><div class="wait-sub">${sub}</div>
      ${others.length ? `<div class="wait-sub" style="margin-top:12px">同在這裡</div>` : ""}${withRow}`;
  }
  function updateObserveStatus() {
    if (view !== "observe") return;
    const s = slot(); if (!s.observing || s.encounter) return;
    const c = clockNow(), where = currentWhere(c), x = ch(s.observing), w = where[x.id];
    const others = N.characters.filter(o => o.id !== x.id && where[o.id].loc === w.loc);
    const st = $("#obsStatus"); if (st) st.innerHTML = statusHTML(s, x, w, others);
    const wh = $("#obsWhere"); if (wh) wh.innerHTML = whereHTML(w);
    const pc = document.querySelector(".plan-card .plan, .plan-card .room3d");
    if (pc && (pc.dataset.plan || pc.dataset.room) !== w.loc) renderObserve($("#view"), c);
  }
  function scrollToCurrent(smooth) {
    requestAnimationFrame(() => {
      const t = $("#transcript"); if (!t || !t.lastElementChild) return;
      const r = t.lastElementChild.getBoundingClientRect();
      const barTop = window.innerHeight - 170;
      if (r.bottom > barTop) window.scrollBy({ top: r.bottom - barTop + 12, behavior: smooth ? "smooth" : "auto" });
    });
  }
  function nextLine() {
    const s = slot(), enc = s.encounter; if (!enc || enc.done) return;
    const ev = encEvent(enc); if (!ev) return;
    if (enc.step < ev.lines.length - 1) {
      enc.step++; save(true); sfx("pop"); lineEmote(enc);
      const t = $("#transcript");
      if (t) {
        t.querySelectorAll(".line.cur").forEach(n => { n.classList.remove("cur"); n.classList.add("old"); });
        t.insertAdjacentHTML("beforeend", lineHTML(ev.lines[enc.step], true));
      }
      const last = enc.step >= ev.lines.length - 1;
      const btn = $("#nextBtn"); if (btn) btn.textContent = last ? "看完了" : "下一句";
      scrollToCurrent(true);
    } else {
      finishEncounter(ev);
    }
  }
  function finishEncounter(ev) {
    const s = slot(), enc = s.encounter;
    enc.done = true;
    if (enc.party) finishParty(enc);
    else if (enc.delta) {
      const res = applyDelta(enc.delta); enc.result = { pts: res.r.pts, status: res.r.status, note: res.note };
      if (enc.delta.amt > 0) sfx(/^(date|confess|sweet|datespot|hand|lean|hug|feed|anniv|festdate)$/.test(enc.delta.action) ? "heart" : "gain");
      if (enc.outing) pushNews({ kind: "outing", text: `🧺 ${enc.title}。`, cast: enc.cast.slice(), loc: enc.loc });
      if (enc.delta.action === "confess" && enc.delta.ok) pushNews({ kind: "love", text: `💗 ${enc.delta.a}和${enc.delta.b}開始交往了。`, cast: enc.cast.slice(), loc: enc.loc });
    }
    else if (!ev.gen && ev.cast.length > 1 && store.bond !== false) {
      // 日常事件：一起度過一段時間，彼此好感 +1（沒開戀愛線時最多到 84）
      enc.bond = [];
      for (let i = 0; i < ev.cast.length; i++) for (let j = i + 1; j < ev.cast.length; j++) {
        const a = ev.cast[i], b = ev.cast[j], r = Object.assign({}, getRel(a, b));
        const cap = r.route ? 100 : 84, before = r.pts;
        r.pts = Math.min(cap, r.pts + Math.max(1, Math.round(paceMul()))); setRel(a, b, r);
        if (r.pts > before) enc.bond.push([a, b, r.pts - before]);
      }
    }
    if (!ev.gen) { s.read[ev.id] = (s.read[ev.id] || 0) + 1; s.sceneAt[ev.scene] = Date.now(); }
    s.log.unshift({ k: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), eid: ev.id, title: ev.title,
      loc: String(ev.loc)[0] === "@" ? locName(enc.loc) : ev.loc, cast: ev.cast.slice(), at: Date.now(), clock: enc.clock, lines: ev.lines, src: ev.src });
    save(true);
    renderObserve($("#view"), clockNow());
    renderPill();
  }
  function continueObserve() {
    const s = slot();
    s.encounter = null; s.status = null;
    s.nextRollAt = Date.now() + waitMs(false);
    save(true);
    renderObserve($("#view"), clockNow());
    window.scrollTo(0, 0);
  }


  /* ═════════ 今天的動態（角色自己過的日子） ═════════ */
  function rng(seedStr) {
    let a = E.hash(seedStr) || 1;
    return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  const pickR = (r, arr) => arr[Math.floor(r() * arr.length)];
  let tlCache = { key: "", data: null };
  function dayTimeline(id, c) {
    const key = store.mode + id + c.dateKey + c.dow + "-" + c.min + JSON.stringify(slot().rel || {});
    if (tlCache.key === key) return tlCache.data;
    const segs = []; let cur = null;
    for (let m = 0; m < c.min; m += 15) {
      const ck = Object.assign({}, c, { min: m }), where = whereAt(ck), w = where[id];
      const comp = w.avail ? N.characters.filter(o => o.id !== id && where[o.id].loc === w.loc && where[o.id].avail).map(o => o.id) : [];
      const k = w.loc + "|" + w.act + "|" + w.avail;
      if (cur && cur.key === k) { cur.to = m + 15; for (const o of comp) if (cur.comp.indexOf(o) < 0) cur.comp.push(o); continue; }
      cur = { key: k, from: m, to: m + 15, loc: w.loc, act: w.act, avail: w.avail, comp: comp.slice() };
      segs.push(cur);
    }
    // 現在這段不重複列出
    const nowW = whereAt(c)[id];
    if (segs.length && segs[segs.length - 1].loc === nowW.loc && segs[segs.length - 1].act === nowW.act) segs.pop();
    const used = new Set();
    for (const sg of segs) sg.sum = segSummary(id, sg, c, used);
    tlCache = { key, data: segs };
    return segs;
  }
  function segSummary(id, sg, c, used) {
    if (!sg.avail || !sg.comp.length || sg.to - sg.from < 15) return null;
    const r0 = rng(c.dateKey + "|seg|" + id + "|" + sg.from);
    const lover = sg.comp.find(o => getRel(id, o).status === "交往中");
    const partner = lover && r0() < 0.75 ? lover : pickR(r0, sg.comp);
    const mid = Math.min(sg.to - 1, sg.from + Math.floor((sg.to - sg.from) / 2));
    const ck = Object.assign({}, c, { min: mid });
    return pairSummary(id, partner, ck, whereAt(ck), used, c.dateKey + "|pair|" + pairKey(id, partner) + "|" + Math.floor(sg.from / 60));
  }
  /* 兩人之間「聽說的」互動片段（時間軸與通知共用） */
  function pairSummary(id, partner, ck, where, used, seed) {
    const r = rng(seed);
    const evs = E.candidates(id, ck, where, null).filter(ev => !ev.asleep && ev.cast.indexOf(partner) >= 0);
    const fresh = evs.filter(ev => !used.has(ev.id));
    const datingHere = getRel(id, partner).status === "交往中";
    if (fresh.length && r() < (datingHere ? 0.35 : 0.65)) {
      const ev = pickR(r, fresh); used.add(ev.id);
      const first = ev.lines.find(l => l[0] === "＊") || ev.lines[0];
      const said = ev.lines.find(l => l[0] !== "＊");
      return { kind: "event", title: ev.title, text: first[0] === "＊" ? first[1] : `${first[0]}：「${first[1]}」`, quote: said && first[0] === "＊" ? `${said[0]}：「${said[1]}」` : "" };
    }
    const rel = getRel(id, partner), dating = rel.status === "交往中";
    const speaker = r() < 0.5 ? id : partner, listener = speaker === id ? partner : id;
    const V = N.voices[speaker];
    const notAbout = arr => arr.filter(x => x.indexOf(listener) < 0 && x.indexOf(E.nick(speaker, listener)) < 0);
    const pickFresh = arr => { const a = notAbout(arr).filter(x => !used.has(x)); if (!a.length) return null; const x = pickR(r, a); used.add(x); return x; };
    let line, lead;
    if (dating && V.love) { line = pickFresh(V.love.sweet); lead = pickR(r, [`${id}和${partner}並肩待了一會兒。`, `${id}和${partner}坐得比平常近一點。`, `${speaker}趁旁邊沒人注意，小聲對${listener}說話。`]); }
    else if (rel.pts >= 70) { line = pickFresh(V.share); lead = pickR(r, [`${id}和${partner}聊得很起勁。`, `${speaker}一看到${listener}就湊了過去。`]); }
    else { line = pickFresh(V.share); lead = pickR(r, [`${id}和${partner}隨口聊了幾句。`, `${speaker}跟${listener}說起最近的事。`]); }
    if (!line) return { kind: "chat", text: pickR(r, [`${id}和${partner}待在同一個地方，各忙各的。`, `${id}和${partner}打了聲招呼。`]), quote: "" };
    line = line.replace(/\{to\}/g, E.nick(speaker, listener));
    const lc = ch(listener); if (lc && !lc.male) line = line.replace(/你/g, "妳");
    return { kind: dating ? "love" : "chat", text: lead, quote: `${speaker}：「${line}」` };
  }
  let tlOpen = false;
  function timelineHTML(id, c, w) {
    const segs = dayTimeline(id, c).filter(sg => sg.to - sg.from >= 30 || sg.sum);
    const shown = tlOpen ? segs : segs.slice(-4);
    const item = (sg, now) => `<li class="tl-item ${now ? "now" : ""} ${sg.avail ? "" : "rest"}">
      <div class="tl-time">${now ? "現在" : E.fmtMin(sg.from) + "–" + E.fmtMin(Math.min(sg.to, 1440))}</div>
      <div class="tl-body"><div class="tl-what"><b>${esc(locName(sg.loc))}</b>・${esc(sg.act)}</div>
        ${sg.comp && sg.comp.length ? `<div class="tl-with">${sg.comp.map(o => person(o, 18)).join("")}<span>${esc(sg.comp.join("、"))}</span></div>` : ""}
        ${sg.sum ? `<div class="tl-sum ${sg.sum.kind}">${sg.sum.kind === "love" ? "💗" : "💬"} ${sg.sum.kind === "event" ? `〈${esc(sg.sum.title)}〉` : ""}${esc(sg.sum.text)}${sg.sum.quote ? `<br><span class="tl-q">${esc(sg.sum.quote)}</span>` : ""}</div>` : ""}</div></li>`;
    const where = currentWhere(c);
    const nowComp = w.avail ? N.characters.filter(o => o.id !== id && where[o.id].loc === w.loc && where[o.id].avail).map(o => o.id) : [];
    return `<div class="card tl-card">
      <div class="plan-title"><span>📖 ${esc(id)}今天的動態</span>${segs.length > 4 ? `<button type="button" class="tl-toggle" id="tlToggle">${tlOpen ? "收起" : "看全部"}</button>` : ""}</div>
      <ol class="tl-list">${shown.map(sg => item(sg, false)).join("")}${item({ loc: w.loc, act: w.act, avail: w.avail, comp: nowComp, sum: null }, true)}</ol>
    </div>`;
  }

  /* ═════════ 手機：角色之間自己傳的訊息 ═════════ */
  function autoDMs(a, b, c) {
    const r = getRel(a, b), dating = r.status === "交往中";
    if (!dating && r.pts < 55) return [];
    const slots = dating ? [[440, 500, "morning"], [725, 785, "care"], [960, 1020, "share"], [1290, 1370, "night"]]
      : r.pts >= 70 ? [[730, 790, "share"], [1260, 1340, "night"]] : [[740, 800, "care"]];
    const out = [];
    for (const [s0, s1, type] of slots) {
      const rr = rng(c.dateKey + "|dm|" + pairKey(a, b) + "|" + s0 + (store.mode === "preview" ? "|p" + c.dow : ""));
      if (!dating && rr() < 0.35) continue;
      const t = s0 + Math.floor(rr() * (s1 - s0));
      if (t > c.min) continue;
      const sender = rr() < 0.5 ? a : b, recv = sender === a ? b : a;
      const ok = (who, m) => E.resolve(who, Object.assign({}, c, { min: m })).avail;
      if (!ok(sender, t)) continue;
      out.push({ min: t, m: [sender, fillPhone(pickR(rr, N.phoneVoice[sender].send[type]), sender, recv)] });
      if (!ok(recv, t + 3) || t + 3 > c.min) continue;
      const L = N.voices[recv].love;
      const rep = dating && L && rr() < 0.6 ? pickR(rr, L.sweet) : pickR(rr, N.phoneVoice[recv].reply[type]);
      out.push({ min: t + 3, m: [recv, fillPhone(rep, recv, sender)] });
      if (dating && N.voices[sender].love && rr() < 0.55 && t + 5 <= c.min)
        out.push({ min: t + 5, m: [sender, fillPhone(pickR(rr, N.voices[sender].love.sweet), sender, recv)] });
    }
    return out;
  }

  /* ═════════ 室內平面圖 ═════════ */
  const planState = {};
  const ROOM_FILL = { wood: "var(--p-wood)", tile: "var(--p-tile)", rug: "var(--p-rug)", grass: "var(--m-park)", water: "var(--m-water)", stone: "var(--p-stone)" };
  const reCache = {};
  function planFor(locId) {
    if (N.floorplans[locId]) return N.floorplans[locId];
    const l = E.locById(locId);
    return l && l.kind === "home" ? N.floorplanGeneric.home : N.floorplanGeneric.public;
  }
  function planLegend() { return ""; }
  const useRoom = locId => N.room3d && N.room3d.has(locId) && N.town3d.supported() && !fail3d;
  function planHTML(locId) {
    if (useRoom(locId)) return `<div class="room3d" data-room="${esc(locId)}"><div class="room-load">房間布置中……</div></div>`;
    const p = planFor(locId);
    let g = "";
    for (const r of p.rooms) {
      g += `<rect x="${r[0]}" y="${r[1]}" width="${r[2]}" height="${r[3]}" fill="${ROOM_FILL[r[5]] || "var(--p-wood)"}" stroke="var(--p-wall)" stroke-width="0.8"/>`;
      if (r[4]) g += `<text x="${r[0] + 1.6}" y="${r[1] + 4.2}" class="plan-room">${esc(r[4])}</text>`;
    }
    for (const it of p.items) {
      g += `<rect x="${it[0]}" y="${it[1]}" width="${it[2]}" height="${it[3]}" rx="1.4" fill="var(--p-item)" stroke="var(--p-wall)" stroke-width="0.35" opacity=".9"/>`;
      if (it[4]) g += `<text x="${it[0] + it[2] / 2}" y="${it[1] + it[3] / 2 + 1.1}" class="plan-item" text-anchor="middle">${esc(it[4])}</text>`;
    }
    return `<div class="plan" data-plan="${esc(locId)}"><svg viewBox="0 0 100 70" preserveAspectRatio="none" aria-hidden="true">${g}</svg><div class="dots"></div></div>`;
  }
  function ruleSpot(p, act) {
    for (const r of p.rules) { const re = reCache[r[0]] || (reCache[r[0]] = new RegExp(r[0])); if (re.test(act)) return r[1]; }
    return null;
  }
  function chooseSpot(p, id, w) {
    const per = (p.personal && p.personal[id]) || {};
    if (!w.avail) return per.sleep || ruleSpot(p, w.act) || p.idle[0];
    const d = ruleSpot(p, w.act);
    if (d && Math.random() < 0.72) return d;
    const pool = per.home && Math.random() < 0.6 ? per.home : p.idle;
    return pool[Math.floor(Math.random() * pool.length)];
  }
  function dotPositions(locId, where) {
    const p = planFor(locId), now = Date.now();
    const enc = slot().encounter;
    const talking = enc && !enc.done && enc.loc === locId ? enc.cast : [];
    const ids = N.characters.filter(c => where[c.id].loc === locId).map(c => c.id);
    let meet = null;
    if (talking.length) {
      const st0 = planState[talking[0]];
      meet = st0 && st0.loc === locId && p.spots[st0.spot] ? st0.spot : (ruleSpot(p, where[talking[0]].act) || p.idle[0]);
    }
    for (const id of ids) {
      const w = where[id];
      let st = planState[id];
      const sleeping = !w.avail;
      if (!st || st.loc !== locId || st.sleeping !== sleeping || !p.spots[st.spot]) {
        st = planState[id] = { loc: locId, spot: chooseSpot(p, id, w), next: now + rand(6000, 14000), sleeping };
      } else if (now >= st.next && !sleeping) {
        st.spot = chooseSpot(p, id, w); st.next = now + rand(7000, 16000);
      }
      if (meet && talking.indexOf(id) >= 0) st.spot = meet;
    }
    const groups = {};
    for (const id of ids) (groups[planState[id].spot] = groups[planState[id].spot] || []).push(id);
    const out = [];
    for (const spot in groups) {
      const base = p.spots[spot] || [50, 35], g = groups[spot];
      g.forEach((id, i) => {
        const ang = (i / g.length) * Math.PI * 2 + Math.PI, r = g.length > 1 ? 7 + g.length : 0;
        out.push({ id, x: Math.min(95, Math.max(5, base[0] + Math.cos(ang) * r)), y: Math.min(64, Math.max(7, base[1] + Math.sin(ang) * r * 0.75)),
          asleep: !where[id].avail, talking: talking.indexOf(id) >= 0 });
      });
    }
    return out;
  }
  let roomHost = null;
  function updateRoom() {
    const sheetOpen = !$("#sheet").hidden;
    const el = (ctl && $("#ctl .ctl-stage[data-room]")) || (sheetOpen && $("#sheet .room3d")) || (!sheetOpen && $("#view .room3d")) || null;
    if (!el) return;
    const c0 = clockNow(), where = currentWhere(c0), s = slot();
    const talking = new Set(s.encounter && !s.encounter.done && !s.encounter.pending ? s.encounter.cast : []);
    const push = () => N.room3d.update({ where, min: c0.min, observing: s.observing, hints: hintSet(c0, where), talking });
    if (roomHost !== el || !el.querySelector(".room-canvas")) {
      roomHost = el;
      const isCtl = !!(ctl && el.closest("#ctl"));
      N.room3d.mount(el, el.dataset.room, { onChar: id => { closeSheet(); startObserve(id); } }).then(() => {
        const l = el.querySelector(".room-load"); if (l) l.remove();
        if (isCtl && ctl) { N.room3d.control(ctl.id, CTL_HOOKS); if (N.room3d.setBusy) N.room3d.setBusy(() => !!ctl && ["ctl-ring", "ctl-panel", "ctl-talk"].some(k => { const e = $("#ctl ." + k); return e && !e.hidden; })); if (ctl.fp && N.room3d.fp) N.room3d.fp(true); ctlFPUI(); }
        push();
      }).catch(() => { fail3d = true; render(); });
      return;
    }
    push();
  }
  function updatePlans() {
    if (N.room3d) updateRoom();
    const plans = document.querySelectorAll(".plan");
    if (!plans.length) return;
    const c0 = clockNow(), where = currentWhere(c0), hints = hintSet(c0, where);
    plans.forEach(pl => {
      const locId = pl.dataset.plan, box = pl.querySelector(".dots");
      const pos = dotPositions(locId, where);
      const seen = new Set();
      for (const d of pos) {
        seen.add(d.id);
        let el = box.querySelector(`[data-dot="${CSS.escape(d.id)}"]`);
        if (!el) {
          el = document.createElement("button"); el.type = "button"; el.className = "dot"; el.dataset.dot = d.id; el.dataset.observe = d.id;
          el.setAttribute("aria-label", "觀察" + d.id);
          el.innerHTML = `${person(d.id, 28)}<span class="dot-name">${esc(d.id)}</span><span class="dot-st"></span>`;
          el.style.left = d.x + "%"; el.style.top = (d.y / 70 * 100) + "%";
          box.appendChild(el);
        }
        el.style.left = d.x + "%"; el.style.top = (d.y / 70 * 100) + "%";
        el.querySelector(".dot-st").textContent = d.asleep ? "💤" : d.talking ? "🗨️" : hints.has(d.id) ? "💬" : "";
        el.classList.toggle("me", d.id === slot().observing);
      }
      box.querySelectorAll(".dot").forEach(el => { if (!seen.has(el.dataset.dot)) el.remove(); });
      const empty = pl.querySelector(".plan-empty");
      if (!pos.length && !empty) pl.insertAdjacentHTML("beforeend", `<div class="plan-empty">目前沒有人</div>`);
      if (pos.length && empty) empty.remove();
    });
  }


  /* ═════════ 操控居民 ═════════
   * 全螢幕的房間畫面：點地板走過去、點家具或別人跳出圓環選單、WASD／搖桿直接走、「出門」換地方。
   * 操控中的人用「指派」讓整個小鎮知道他在哪裡、在做什麼；結束操控就回到原本的行程。 */
  let ctl = null;
  function ctlStart(id) {
    if (!N.room3d || !use3dRoom()) return toast("這台裝置跑不了 3D 房間");
    const c = clockNow(), w = currentWhere(c)[id];
    if (!w.avail) return toast(`${id}正在休息，叫不起來`);
    const s = slot();
    if (s.observing !== id) { s.observing = id; s.encounter = null; s.status = null; }
    s.assign[id] = { loc: w.loc, untilAbs: stayFor(180), act: w.act, ctl: true };
    save(true);
    ctl = { id, loc: w.loc, act: w.act };
    const box = document.createElement("div"); box.id = "ctl"; box.className = "ctl";
    box.innerHTML = `<div class="ctl-top"><div class="ctl-me">${person(id, 40)}<div><b>${esc(id)}</b><span class="ctl-act"></span></div></div>
        <button type="button" data-ctl="shop" class="ctl-shopbtn" hidden title="店裡">🛍</button><button type="button" data-ctl="bag" title="背包">🎒</button><button type="button" data-ctl="fp" title="第一人稱（V）">👁</button><button type="button" data-ctl="out">🚪 出門</button><button type="button" data-ctl="end">結束</button></div>
      <div class="ctl-stage room3d"></div>
      <div class="ctl-hint">點地板走過去・點家具或別人會出現選單・${matchMedia("(pointer:fine)").matches ? "WASD／方向鍵直接走" : "左下搖桿直接走"}</div>
      <div class="ctl-talk" hidden></div>
      <div class="ctl-joy"><i></i></div>
      <div class="ctl-ring" hidden></div>
      <div class="ctl-panel" hidden></div>
      <div class="ctl-fade" hidden></div>`;
    document.body.appendChild(box); document.body.classList.add("ctl-on");
    box.addEventListener("click", ctlClick);
    ctlJoystick(box.querySelector(".ctl-joy"));
    ctl.keys = new Set();
    ctl.kd = e => {
      if (/INPUT|TEXTAREA/.test(document.activeElement && document.activeElement.tagName) || document.body.classList.contains("room-editing")) return;
      const k = e.key.toLowerCase();
      if (k === "escape") { if (!$("#ctl .ctl-ring").hidden || !$("#ctl .ctl-panel").hidden) return ctlCloseMenus(); return; }
      if (/^(w|a|s|d|arrowup|arrowdown|arrowleft|arrowright)$/.test(k)) { e.preventDefault(); ctl.keys.add(k); ctlKeys(); }
      // 第一人稱：V 切換、E 互動（只在小鎮上）
      if (k === "v" && CT().fp) { e.preventDefault(); ctl.fp = CT().fp(!ctl.fp); ctlFPUI(); }
      if (k === "e" && ctl.fp && CT().interact) { e.preventDefault(); CT().interact(); }
      if ((k === " " || k === "enter") && !$("#ctl .ctl-talk").hidden) { e.preventDefault(); ctlTalkNext(); }
    };
    ctl.ku = e => { ctl.keys.delete(e.key.toLowerCase()); ctlKeys(); };
    window.addEventListener("keydown", ctl.kd); window.addEventListener("keyup", ctl.ku);
    ctlEnter(w.loc);
  }
  function use3dRoom() { return !fail3d && N.room3d && N.room3d.supported(); }
  function ctlKeys() {
    const K = ctl.keys, x = (K.has("d") || K.has("arrowright") ? 1 : 0) - (K.has("a") || K.has("arrowleft") ? 1 : 0), z = (K.has("s") || K.has("arrowdown") ? 1 : 0) - (K.has("w") || K.has("arrowup") ? 1 : 0);
    const m = Math.hypot(x, z) || 1; CT().ctlMove(x / m, z / m);
  }
  function ctlJoystick(el) {
    const knob = el.querySelector("i"); let on = null;
    const mv = e => {
      if (!on) return;
      const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, R = r.width / 2;
      let dx = e.clientX - cx, dy = e.clientY - cy; const d = Math.hypot(dx, dy); if (d > R) { dx *= R / d; dy *= R / d; }
      knob.style.transform = `translate(${dx}px,${dy}px)`; CT().ctlMove(dx / R, dy / R);
    };
    el.addEventListener("pointerdown", e => { on = e.pointerId; el.setPointerCapture(e.pointerId); mv(e); e.stopPropagation(); });
    el.addEventListener("pointermove", mv);
    const up = () => { on = null; knob.style.transform = ""; CT().ctlMove(0, 0); };
    el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
  }
  // 進到某個地點的房間
  // 操控中用哪一套：戶外在小鎮上（town3d.ctl），室內在房間（room3d）
  const CT = () => ctl && ctl.mode === "town" ? N.town3d.ctl : N.room3d;
  const canTown = () => want3d() && N.town3d && N.town3d.ctl && N.town3d.supported() && !fail3d;
  const TOWN_HOOKS = {
    onPerson: (b, x, y) => ctlPersonRing(b, x, y),
    onSpot: (opts, x, y) => CTL_HOOKS.onSpot(opts, x, y),
    onLoc: loc => { if (!ctl || loc === ctl.loc) return; ctl.loc = loc; const s = slot(); s.assign[ctl.id] = { loc, untilAbs: stayFor(180), act: "在附近走動", ctl: true }; save(true); ctlHud(); },
    onDoor: loc => { if (!ctl) return; const s = slot(); s.assign[ctl.id] = { loc, untilAbs: stayFor(180), act: `走進${locName(loc)}`, ctl: true }; save(true); ctlFade(loc, () => ctlEnter(loc)); }
  };
  // 進出房子的載入畫面：淡入、角色頭像、地點名稱、轉圈；房間或小鎮準備好之後淡出
  function ctlFade(loc, then) {
    const f = $("#ctl .ctl-fade"); sfx("door"); if (!f) return then();
    const L = N.locations.find(l => l.id === loc), going = ctl.mode === "town" && !(N.interiors && N.interiors[loc] && N.interiors[loc].outdoor && !N.interiors[loc].dark);
    f.innerHTML = `<div class="ctl-load">${person(ctl.id, 56)}<p class="ctl-load-to">${going ? "走進" : "前往"}</p><h3>${L && L.icon ? L.icon + " " : ""}${esc(locName(loc))}</h3><div class="ctl-load-spin"></div></div>`;
    f.hidden = false; f.classList.remove("out");
    setTimeout(() => { if (!ctl) return; then(); setTimeout(() => { f.classList.add("out"); setTimeout(() => { f.hidden = true; f.classList.remove("out"); }, 400); }, 650); }, 500);
  }
  // 第一人稱的準心和提示
  function ctlFPUI() {
    const st = $("#ctl .ctl-stage"); if (!st) return;
    let x = st.querySelector(".fp-cross");
    if (ctl.fp) {
      if (!x) { x = document.createElement("div"); x.className = "fp-cross"; x.innerHTML = `<i></i><span></span>`; st.appendChild(x); }
      const hint = $("#ctl .ctl-hint"); if (hint) hint.textContent = matchMedia("(pointer:fine)").matches ? `點畫面鎖定滑鼠・滑鼠轉頭・WASD 走・對準${ctl.mode !== "town" ? "人或家具" : "人、長椅或門"}按 E（或點擊）・Esc 放開滑鼠・V 回到俯視` : `拖曳轉頭・左下搖桿走・對準${ctl.mode !== "town" ? "人或家具" : "人或門"}點一下互動・V 回到俯視`;
      clearInterval(ctl.aimT);
      ctl.aimT = setInterval(() => {
        if (!ctl || !ctl.fp) return clearInterval(ctl && ctl.aimT);
        const a = CT().aim ? CT().aim() : null, sp = x.querySelector("span");
        x.classList.toggle("hot", !!a);
        sp.textContent = !a ? "" : a.kind === "person" ? `E　跟${a.id}互動` : a.kind === "spot" ? `E　${a.label}` : a.kind === "exit" ? "E　出門到街上" : `E　走進${locName(a.id)}`;
      }, 200);
    } else {
      if (x) x.remove(); clearInterval(ctl.aimT);
      const hint = $("#ctl .ctl-hint"); if (hint && ctl.mode === "town") hint.textContent = `點地面走過去・點長椅或別人會出現選單・點房子會走進去・WASD／方向鍵直接走・V 第一人稱`;
      else if (hint) hint.textContent = `點地板走過去・點家具或別人會出現選單・${matchMedia("(pointer:fine)").matches ? "WASD／方向鍵直接走・V 第一人稱" : "左下搖桿直接走・右上 👁 第一人稱"}`;
    }
  }
  // 戶外：直接在 3D 小鎮上走（opt.at：從哪個門口出來）
  function ctlTown(loc, opt) {
    const stage = $("#ctl .ctl-stage");
    if (ctl.mode === "town" && stage.querySelector("canvas")) { ctl.loc = loc; ctlHud(); return; }   // 已經在小鎮上了
    N.room3d.control(null); if (N.room3d.stop) N.room3d.stop();
    roomHost = null;
    stage.removeAttribute("data-room"); stage.classList.remove("room3d"); stage.classList.add("ctl-town"); stage.innerHTML = `<div class="empty">小鎮搭建中……</div>`;
    ctl.mode = "town";
    const hint = $("#ctl .ctl-hint"); if (hint) hint.textContent = `點地面走過去・點長椅或別人會出現選單・點房子會走進去・WASD／方向鍵直接走・V 第一人稱`;
    N.town3d.mount(stage, {}).then(() => {
      if (!ctl || ctl.mode !== "town") return;
      const e = stage.querySelector(".empty"); if (e) e.remove();
      N.town3d.update(state3d(clockNow()));
      N.town3d.ctl.control(ctl.id, TOWN_HOOKS, { loc, at: opt && opt.at });
      // 選單、對話框打開時：放開滑鼠、不要再鎖（才按得到按鈕）
      if (N.town3d.ctl.setBusy) N.town3d.ctl.setBusy(() => !!ctl && ["ctl-ring", "ctl-panel", "ctl-talk"].some(k => { const e = $("#ctl ." + k); return e && !e.hidden; }));
      if (ctl.fp) { N.town3d.ctl.fp(true); }   // 從房子出來：維持第一人稱
      ctlFPUI();
    }).catch(() => { fail3d = true; ctl.mode = "room"; ctlEnter(loc); });
    ctlHud();
  }
  function ctlEnter(loc, opt) {
    ctl.loc = loc;
    const stage = $("#ctl .ctl-stage");
    const out = N.interiors && N.interiors[loc] && N.interiors[loc].outdoor && !N.interiors[loc].dark;
    if (canTown() && (out || (opt && opt.street))) return ctlTown(loc, opt);
    if (ctl.mode === "town") { N.town3d.ctl.control(null); N.town3d.unmount(); ctl.mode = "room"; ctlFPUI(); }
    stage.classList.remove("ctl-town"); stage.classList.add("room3d");
    const hint = $("#ctl .ctl-hint"); if (hint) hint.textContent = `點地板走過去・點家具或別人會出現選單・${matchMedia("(pointer:fine)").matches ? "WASD／方向鍵直接走" : "左下搖桿直接走"}`;
    if (!N.interiors || !N.interiors[loc]) { stage.innerHTML = `<div class="empty">這裡沒有可以走進去的室內。</div>`; ctlHud(); return; }
    stage.dataset.room = loc; stage.innerHTML = "";
    N.room3d.control(null);
    roomHost = null;
    updateRoom();
    ctlHud();
  }
  const CTL_HOOKS = {
    onPerson: (b, x, y) => ctlPersonRing(b, x, y),
    // 第一人稱從大門走出去：回到街上（手機沒有 3D 小鎮：打開「要去哪裡」）
    onExit: () => { if (!ctl) return; if (canTown()) { const at = N.town3d.ctl.doorPos(ctl.loc); ctlFade(ctl.loc, () => ctlEnter(ctl.loc, { street: true, at })); } else ctlOut(); },
    onSpot: (opts, x, y) => ctlRing(x, y, "🪑", opts.map(o => ({ icon: o.icon, label: o.label, pick: () => { CT().ctlUseSpot(o); ctlSetAct(o.act); } }))
      .concat([{ icon: "🚶", label: "走過去", pick: () => { const sp = o0(opts).spot; CT().ctlUseSpot({ spot: { x: sp.x, z: sp.z } }); ctlSetAct("在附近走動"); } }]))
  };
  const o0 = a => a[0];
  function ctlHud() {
    if (!ctl) return;
    const w = currentWhere(clockNow())[ctl.id], el = $("#ctl .ctl-act");
    if (el) el.textContent = `${locName(w.loc)}・${w.act}`;
    const sb = $("#ctl .ctl-shopbtn"); if (sb) { const sh = shopAt(ctl.loc); sb.hidden = !sh; if (sh) sb.innerHTML = `${sh.icon}<span class="ctl-shopname"> ${esc(sh.title)}</span>`; }
  }
  function ctlSetAct(act) {
    const s = slot(), a = s.assign[ctl.id]; if (!a) return;
    a.act = act; a.untilAbs = stayFor(180); save(true); ctlHud();
  }
  function ctlCloseMenus() { const r = $("#ctl .ctl-ring"), p = $("#ctl .ctl-panel"); if (r) r.hidden = true; if (p) p.hidden = true; }
  // 圓環選單：中間是對象，選項排成一圈
  function ctlRing(x, y, center, opts) {
    const el = $("#ctl .ctl-ring"); if (!el) return;
    ctl.ringOpts = opts; sfx("ring");
    const n = opts.length, R = n > 8 ? 112 : n > 5 ? 92 : 78;
    const W = window.innerWidth, H = window.innerHeight;
    x = Math.max(R + 40, Math.min(W - R - 40, x)); y = Math.max(R + 70, Math.min(H - R - 50, y));
    el.innerHTML = `<div class="ring-c" style="left:${x}px;top:${y}px">${center}</div>` + opts.map((o, i) => {
      const a = -Math.PI / 2 + i * Math.PI * 2 / n, px = x + Math.cos(a) * R, py = y + Math.sin(a) * R;
      return `<button type="button" class="ring-o${o.dis ? " dis" : ""}" data-ring="${i}" style="left:${px}px;top:${py}px" ${o.dis ? "disabled" : ""}><span>${o.icon}</span><small>${esc(o.label)}${o.why ? `<em>${esc(o.why)}</em>` : ""}</small></button>`;
    }).join("");
    el.hidden = false;
  }
  function ctlPersonRing(b, x, y) {
    const a = ctl.id, c = clockNow(), where = currentWhere(c);
    const s = slot();
    if (s.encounter && !s.encounter.done && !s.encounter.pending) return ctlTalk();
    const awake = where[b] && where[b].avail;
    const pn = $("#ctl .ctl-panel"); if (pn) pn.hidden = true;
    if (!awake) return ctlRing(x, y, person(b, 44), [{ icon: "💤", label: "在休息", dis: true, pick: () => {} }]);
    ctlRing(x, y, person(b, 44), ringMenu(a, b, null, x, y));
  }
  // 圓環的分類：說話、一起、小動作、小遊戲、送禮、戀愛（點分類會換成那一類的選項）
  function ringMenu(a, b, group, x, y) {
    const sub = g => () => ctlRing(x, y, person(b, 44), ringMenu(a, b, g, x, y));
    const back = { icon: "↩️", label: "返回", pick: sub(null) };
    const act = id => () => ctlInteract(b, id);
    const more = g => Object.keys(N.moreActs).filter(k => N.moreActs[k].group === g).map(k => { const A = N.moreActs[k], why = moreWhy(a, b, k); return { icon: A.icon, label: A.label, dis: !!why, why, pick: act(k) }; });
    const r = getRel(a, b), [elig] = loveEligible(a, b), love = elig && r.route;
    if (!group) {
      const o = [N.actions.find(z => z.id === "chat")].filter(Boolean).map(ac => ({ icon: ac.icon, label: ac.label, pick: act(ac.id) }));
      o.push({ icon: "🤝", label: "一起…", pick: sub("together") }, { icon: "✋", label: "小動作…", pick: sub("small") }, { icon: "🎲", label: "小遊戲…", pick: sub("game") },
        { icon: "🎁", label: "送禮", pick: () => ctlBag(b) });
      if (love) o.push({ icon: "💗", label: "戀愛…", pick: sub("love") });
      return o;
    }
    if (group === "together") return more("together").concat(N.actions.filter(z => z.id === "help").map(ac => ({ icon: ac.icon, label: ac.label, pick: act(ac.id) })), [back]);
    if (group === "small") return N.actions.filter(z => z.id === "food" || z.id === "tease").map(ac => ({ icon: ac.icon, label: ac.label, pick: act(ac.id) })).concat(more("small"), [back]);
    if (group === "game") return more("game").concat([back]);
    const o = [];
    for (const ac of N.loveActions) {
      let why = "";
      if (ac.dating && r.status !== "交往中") why = "交往後";
      else if (!ac.dating && ac.id === "confess" && r.status === "交往中") why = "已交往";
      else if (!ac.dating && r.status !== "交往中" && r.pts < ac.need) why = `好感${ac.need}`;
      o.push({ icon: ac.icon, label: ac.label, dis: !!why, why, pick: act(ac.id) });
    }
    const dw = dateWhy(a, b);
    o.push({ icon: "📍", label: "約會去…", dis: !!dw, why: dw, pick: () => ctlDatePick(b) });
    for (const k of Object.keys(N.loveMore)) { const why = moreWhy(a, b, k); if (why === null) continue; o.push({ icon: N.loveMore[k].icon, label: N.loveMore[k].label, dis: !!why, why, pick: act(k) }); }
    const an = annivInfo(a, b); if (an) o.push({ icon: N.loveSpecial.anniv.icon, label: `${an.text}紀念`, pick: act("anniv") });
    const fs = festDateOf(a, b); if (fs) o.push({ icon: fs.icon || N.loveSpecial.fest.icon, label: `一起過${fs.name}`, pick: act("festdate") });
    return o.concat([back]);
  }
  function ctlInteract(b, action) {
    sheetState = { type: "interact", who: ctl.id, target: b };   // 不用自己走過去：對方會站起來走過來
    doInteract(action);
    ctlSetAct(`和${b}說話`);
    ctlTalk();
  }
  // 對話框：一句一句看
  function ctlTalk() {
    const el = $("#ctl .ctl-talk"); if (!el) return;
    const s = slot(), enc = s.encounter, ev = enc && encEvent(enc);
    const sig = enc ? [enc.eid, enc.step, enc.pending, enc.done].join("|") : "";
    if (sig === ctl.talkSig && !el.hidden === !!enc) return;   // 沒變就不要重畫（按鈕才按得到）
    const stepChanged = enc && !enc.pending && !enc.done && (ctl.talkSig || "").split("|").slice(0, 2).join("|") !== [enc.eid, enc.step].join("|");
    ctl.talkSig = sig;
    if (stepChanged && enc.step === 0) lineEmote(enc);
    if (!enc || !ev) { el.hidden = true; return; }
    if (enc.pending) {
      const others = enc.cast.filter(x => x !== ctl.id);
      el.innerHTML = `<div class="ctl-line narr">${esc(others.length ? `${others.join("、")}好像有話要說。` : "好像有什麼事。")}〈${esc(ev.title)}〉</div>
        <div class="ctl-btns"><button type="button" class="btn primary" data-ctl="encyes">👂 聽聽看</button><button type="button" class="btn soft" data-ctl="encno">先不要</button></div>`;
      el.hidden = false; return;
    }
    if (enc.done) {
      const res = enc.result ? `好感 ${enc.result.pts}${enc.result.status ? "・" + enc.result.status : ""}${enc.result.note ? "・" + enc.result.note : ""}` : enc.bond && enc.bond.length ? enc.bond.map(([x, y, d]) => `${x}和${y} +${d}`).join("、") : "";
      el.innerHTML = `<div class="ctl-line narr">〈${esc(ev.title)}〉已記入日誌${res ? `<br><small>${esc(res)}</small>` : ""}</div><div class="ctl-btns"><button type="button" class="btn primary" data-ctl="talkok">好</button></div>`;
      el.hidden = false; return;
    }
    const l = ev.lines[enc.step], last = enc.step >= ev.lines.length - 1;
    el.innerHTML = (l[0] === "＊" ? `<div class="ctl-line narr">${esc(l[1])}</div>` : `<div class="ctl-line">${person(l[0], 36)}<div><b>${esc(l[0])}</b><p>${esc(l[1])}</p></div></div>`)
      + `<div class="ctl-btns"><span class="muted">${enc.step + 1} / ${ev.lines.length}</span><button type="button" class="btn primary" data-ctl="talknext">${last ? "看完了" : "下一句"}</button></div>`;
    el.hidden = false;
  }
  function ctlTalkNext() {
    const s = slot(), enc = s.encounter; if (!enc) return ctlTalk();
    if (enc.done) { const aa = enc.afterAct; continueObserve(); ctlSetAct(aa || "在附近走動"); ctlHud(); return ctlTalk(); }
    sfx("pop"); nextLine(); ctlTalk();
  }
  // 出門：選要去哪裡
  function ctlOut() {
    const el = $("#ctl .ctl-panel"), cur = ctl.loc;
    let list = "";
    for (const r of N.regions) r.pages.forEach((pg, pi) => {
      const ls = N.locations.filter(l => l.region === r.id && l.page === pi && (l.kind !== "home" || N.schedules[ctl.id].home === l.id || slot().rel && getRel(ctl.id, roomOwnerOf(l.id) || ctl.id).pts >= 55));
      if (!ls.length) return;
      list += `<h4>${esc(r.name + r.sub)}・${esc(pg)}</h4><div class="chip-row">${ls.map(l => `<button type="button" class="chip loc-chip ${cur === l.id ? "on" : ""}" data-ctlgo="${esc(l.id)}" ${cur === l.id ? "disabled" : ""}>${l.icon} ${esc(l.name)}</button>`).join("")}</div>`;
    });
    const street = ctl.mode !== "town" && canTown() ? `<div class="chip-row" style="margin-bottom:10px"><button type="button" class="btn primary" data-ctl="street">🚶 走到街上</button></div>` : "";
    el.innerHTML = `<div class="ctl-panel-in"><h3>${person(ctl.id, 28)}${esc(ctl.id)}要去哪裡？</h3>${street}${list}<div class="sheet-actions"><button type="button" class="btn soft" data-ctl="close">取消</button></div></div>`;
    el.hidden = false;
  }
  function roomOwnerOf(locId) { for (const c of N.characters) if (N.schedules[c.id] && N.schedules[c.id].home === locId) return c.id; return null; }
  function ctlGoTo(locId) {
    ctlCloseMenus();
    const s = slot(), name = locName(locId);
    s.assign[ctl.id] = { loc: locId, untilAbs: stayFor(180), act: `照你的安排，來${name}看看`, ctl: true };
    save(true);
    const f = $("#ctl .ctl-fade"); f.innerHTML = `<div>${person(ctl.id, 48)}<p>走去${esc(name)}…</p></div>`; f.hidden = false;
    setTimeout(() => { if (!ctl) return; ctlEnter(locId); setTimeout(() => { f.hidden = true; }, 350); }, 700);
    toast(`${ctl.id}：「${E.assignLine(ctl.id, name)}」`);
  }
  function ctlEnd(msg) {
    if (ctl) clearInterval(ctl.aimT);
    if (!ctl) return;
    const s = slot(), a = s.assign[ctl.id]; if (a && a.ctl) delete s.assign[ctl.id];
    save(true);
    N.room3d.control(null); N.room3d.ctlMove(0, 0);
    if (ctl.mode === "town" && N.town3d.ctl) { N.town3d.ctl.control(null); N.town3d.unmount(); }
    window.removeEventListener("keydown", ctl.kd); window.removeEventListener("keyup", ctl.ku);
    const box = $("#ctl"); if (box) box.remove(); document.body.classList.remove("ctl-on");
    ctl = null; roomHost = null;
    render(); if (msg) toast(msg);
  }
  function ctlClick(e) {
    const r = e.target.closest("[data-ring]");
    if (r) { const o = ctl.ringOpts[+r.dataset.ring]; ctlCloseMenus(); if (o && !o.dis) o.pick(); return; }
    if (e.target.closest(".ctl-ring") && !e.target.closest(".ring-c")) return ctlCloseMenus();
    const g = e.target.closest("[data-ctlgo]"); if (g) return ctlGoTo(g.dataset.ctlgo);
    const sd0 = e.target.closest("[data-shopbuy],[data-shopeat],[data-shopact],[data-bageat],[data-baggive],[data-giveto],[data-datespot]");
    if (sd0) return shopClick(sd0.dataset);
    const b = e.target.closest("[data-ctl]"); if (!b) return;
    const k = b.dataset.ctl;
    if (k === "end") return ctlEnd(`${ctl.id}回到原本的行程了`);
    if (k === "out") return ctlOut();
    if (k === "fp") { if (CT().fp) { ctl.fp = CT().fp(!ctl.fp); ctlFPUI(); } return; }
    if (k === "close") return ctlCloseMenus();
    if (k === "shop") { ctl.shopGreet = null; return ctlShop(); }
    if (k === "bag") return ctlBag(null);
    if (k === "shopback") return ctlShop();
    if (k === "street") { ctlCloseMenus(); const at = N.town3d.ctl.doorPos(ctl.loc); return ctlFade(ctl.loc, () => ctlEnter(ctl.loc, { street: true, at })); }
    if (k === "talknext" || k === "talkok") return ctlTalkNext();
    if (k === "encyes") { const s = slot(); if (s.encounter) { s.encounter.pending = false; s.encounter.startedAt = Date.now(); save(true); } return ctlTalk(); }
    if (k === "encno") { skipEncounter(false); return ctlTalk(); }
  }
  // 每秒：跟著小鎮時間更新；被行程拉走（睡覺、聚會）就跟著換地方或結束
  function ctlTick() {
    if (!ctl) return;
    const c = clockNow(), w = currentWhere(c)[ctl.id];
    if (!w.avail) return ctlEnd(`${ctl.id}睏了，先回去休息`);
    const a = slot().assign[ctl.id];
    if (a && a.untilAbs - c.abs < 60) { a.untilAbs = stayFor(180); save(); }
    if (w.loc !== ctl.loc) {
      // 在小鎮上：換到另一個戶外地點只要更新名稱，不要重新載入小鎮（重新載入會把畫面弄不見）
      const out = N.interiors && N.interiors[w.loc] && N.interiors[w.loc].outdoor && !N.interiors[w.loc].dark;
      if (ctl.mode === "town" && out) ctl.loc = w.loc;
      else if (ctl.mode === "town") ctlFade(w.loc, () => ctlEnter(w.loc));
      else ctlEnter(w.loc);
    }
    if (ctl.mode === "town" && N.town3d.isReady()) N.town3d.update(state3d(c));
    ctlHud();
    ctlTalk();
  }

  /* ═════════ 指派 ═════════ */
  function openAssign() {
    const id = slot().observing; if (!id) return;
    sheetState = { type: "assign", who: id, dur: (sheetState && sheetState.dur) || 60 };
    renderAssign(); openSheet();
  }
  function renderAssign() {
    const id = sheetState.who, s = slot(), w = currentWhere(clockNow())[id];
    const cur = s.assign[id];
    let list = "";
    for (const r of N.regions) {
      r.pages.forEach((pg, pi) => {
        const ls = N.locations.filter(l => l.region === r.id && l.page === pi && (l.kind !== "home" || N.schedules[id].home === l.id));
        if (!ls.length) return;
        list += `<h4>${esc(r.name + r.sub)}・${esc(pg)}</h4><div class="chip-row">${ls.map(l => `<button type="button" class="chip loc-chip ${w.loc === l.id ? "on" : ""}" data-assignloc="${esc(l.id)}">${l.icon} ${esc(l.name)}</button>`).join("")}</div>`;
      });
    }
    $("#sheetBody").innerHTML = `<h3>${person(id, 30)}指派${esc(id)}去哪裡？</h3>
      ${w.avail ? "" : `<p class="sheet-desc"><b>${esc(id)}正在休息，叫不起來。</b></p>`}
      ${cur ? `<div class="note" style="margin-bottom:10px">目前照安排待在 <b>${esc(locName(cur.loc))}</b>。<button type="button" class="btn soft" id="unassign" style="margin-left:6px;min-height:40px">取消指派</button></div>` : ""}
      <section><h4>停留多久</h4><div class="chip-row">${[[30, "30 分鐘"], [60, "1 小時"], [120, "2 小時"]].map(([v, t]) => `<button type="button" class="chip ${sheetState.dur === v ? "on" : ""}" data-dur="${v}">${t}</button>`).join("")}</div></section>
      <section>${list}</section>
      <div class="sheet-actions"><button type="button" class="btn soft" data-close>取消</button></div>`;
  }
  function doAssign(locId) {
    const id = sheetState.who, s = slot(), w = currentWhere(clockNow())[id];
    if (!w.avail) return toast(`${id}正在休息，叫不起來`);
    const name = locName(locId);
    s.assign[id] = { loc: locId, untilAbs: stayFor(sheetState.dur), act: `照你的安排，來${name}看看` };
    s.status = null; s.nextRollAt = Date.now() + waitMs(true);
    save(true); closeSheet(); render();
    toast(`${id}：「${E.assignLine(id, name)}」`);
  }

  /* ═════════ 關係與戀愛（只因玩家安排的互動而改變） ═════════ */
  const pairKey = (a, b) => [a, b].sort().join("|");
  function baseRel(a, b) {
    const v = N.relBase[a + "|" + b]; if (v != null) return v;
    const w = N.relBase[b + "|" + a]; return w != null ? w : N.relDefault;
  }
  function getRel(a, b) {
    const s = slot(); s.rel = s.rel || {};
    return s.rel[pairKey(a, b)] || { pts: baseRel(a, b), route: isCP(a, b) && loveEligible(a, b)[0], status: "", last: 0 };
  }
  function setRel(a, b, r) {
    const s = slot(); s.rel = s.rel || {};
    const old = getRel(a, b);
    s.rel[pairKey(a, b)] = r;
    if (N.life && N.life.relChanged) N.life.relChanged(a, b, old, r);
  }
  const isCP = (a, b) => (N.cpPairs || []).some(k => k === a + "|" + b || k === b + "|" + a);
  /* 進展速度：慢／一般／快 */
  const PACE_MUL = { slow: 0.7, normal: 1.3, fast: 2.2 };
  const paceMul = () => PACE_MUL[store.pace || "normal"] || 1.3;
  const fixedRel = (a, b) => N.relFixed[a + "|" + b] || N.relFixed[b + "|" + a] || null;
  function stageOf(p, status) { if (status === "交往中") return "戀人"; let st = N.relStages[0]; for (const x of N.relStages) if (p >= x.min) st = x; return st.label; }
  function loveEligible(a, b) {
    const f = fixedRel(a, b);
    if (f && f.family) return [false, "家人，不開放戀愛線"];
    const ga = N.ageGroup[a], gb = N.ageGroup[b];
    if (ga === "unset" || gb === "unset") return [false, "年齡未設定，不開放戀愛線"];
    if (ga === "junior" || gb === "junior") return [false, "國中生不開放戀愛線"];
    if (ga !== gb) return [false, "成年與未成年之間不開放戀愛線"];   // 高中生只能和高中生
    if (!N.voices[a].love || !N.voices[b].love) return [false, "尚未設定戀愛台詞"];
    return [true, ""];
  }
  const BASE_GAIN = { chat: 3, food: 3, help: 3, tease: 2, date: 5, sweet: 3, confess: 5, outing: 5 };
  function computeDelta(a, b, action, ok, base) {
    const r = getRel(a, b), pref = (N.voices[b].pref || {})[action];
    let amt = base != null ? base : (BASE_GAIN[action] || 2);
    if (pref != null) amt *= pref;
    if (action === "date" || action === "confess") amt = ok ? BASE_GAIN[action] : (action === "confess" ? -2 : 0);
    if (Date.now() - (r.last || 0) < 15 * 60000) amt *= 0.34;   // 短時間內一直互動，效果遞減
    if (amt > 0) amt *= paceMul();
    amt = Math.round(amt);
    return { a, b, amt, action, ok };
  }
  function applyDelta(d) {
    const r = Object.assign({}, getRel(d.a, d.b));
    const cap = r.route ? 100 : 84;   // 沒開戀愛線時，最多到「好友」
    r.pts = Math.max(0, Math.min(cap, r.pts + d.amt));
    r.last = Date.now();
    let note = "";
    if (d.action === "confess") {
      if (d.ok) { r.status = "交往中"; r.since = gameDay(); r.anniv = ""; note = `${d.a}和${d.b}開始交往了。`; }
      else { r.cfAt = Date.now(); note = "這次被婉拒了。過一陣子再說吧。"; }
    }
    if (d.action === "date" && !d.ok) note = "這次沒約成。";
    setRel(d.a, d.b, r);
    return { r, note };
  }

  function openRel() {
    const id = slot().observing; if (!id) return;
    sheetState = { type: "rel", who: id };
    renderRel(); openSheet();
  }
  function relGraphHTML(focus) {
    const ids = N.characters.map(x => x.id), n = ids.length, cx = 50, cy = 50, R = 40;
    const pos = {};
    ids.forEach((id, i) => { const a = -Math.PI / 2 + i * 2 * Math.PI / n; pos[id] = [cx + R * Math.cos(a), cy + R * Math.sin(a)]; });
    let lines = "";
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const a = ids[i], b = ids[j], r = getRel(a, b), fx = fixedRel(a, b);
      if (r.pts < 55 && !r.status && !(fx && fx.family)) continue;
      const hot = a === focus || b === focus;
      const col = r.status === "交往中" ? "#D2557A" : fx && fx.family ? "#A0703A" : "var(--teal)";
      const wd = r.status === "交往中" ? 1.4 : Math.max(0.25, (r.pts - 50) / 28);
      lines += `<line x1="${pos[a][0]}" y1="${pos[a][1]}" x2="${pos[b][0]}" y2="${pos[b][1]}" stroke="${col}" stroke-width="${wd}" ${fx && fx.family ? 'stroke-dasharray="1.5 1"' : ""} opacity="${hot ? 0.95 : 0.28}"/>`;
    }
    return `<div class="rel-graph"><svg viewBox="0 0 100 100" aria-hidden="true">${lines}</svg>
      ${ids.map(id => `<button type="button" class="rg-node ${id === focus ? "me" : ""}" data-observe="${esc(id)}" style="left:${pos[id][0]}%;top:${pos[id][1]}%">${person(id, id === focus ? 30 : 24)}<span>${esc(id)}</span></button>`).join("")}</div>`;
  }
  function renderRel() {
    const id = sheetState.who;
    const rows = N.characters.filter(o => o.id !== id).map(o => ({ o, r: getRel(id, o.id), fx: fixedRel(id, o.id), el: loveEligible(id, o.id) }))
      .sort((x, y) => (y.r.status ? 1 : 0) - (x.r.status ? 1 : 0) || y.r.pts - x.r.pts);
    $("#sheetBody").innerHTML = `<h3>${person(id, 30)}${esc(id)}的人際關係</h3>
      <button type="button" class="btn soft block" id="graphBtn" style="margin-bottom:10px">${sheetState.graph ? "📋 回到列表" : "🕸 看全鎮關係圖"}</button>
      ${sheetState.graph ? relGraphHTML(id) : ""}
      <ul class="rel-list" ${sheetState.graph ? "hidden" : ""}>${rows.map(({ o, r, fx, el }) => `<li class="rel-row">
        <div class="rel-top">${person(o.id, 30)}<b>${esc(o.id)}</b>${fx ? `<span class="tag">${esc(fx.label)}</span>` : ""}${r.status ? `<span class="tag love">${esc(r.status)}</span>` : r.route ? `<span class="tag love">戀愛線</span>` : ""}<span class="rel-stage">${esc(stageOf(r.pts, r.status))}・${r.pts}</span></div>
        <div class="bar"><i style="width:${r.pts}%"></i></div>
        ${el[0] ? (r.status ? `<button type="button" class="btn soft rel-tg" data-endlove="${esc(o.id)}">結束戀愛線</button>`
          : `<button type="button" class="btn soft rel-tg ${r.route ? "on" : ""}" data-route="${esc(o.id)}">${r.route ? "💗 戀愛線開啟中（點一下關閉）" : "開啟戀愛線"}</button>`)
          : `<div class="rel-no">${esc(el[1])}</div>`}
      </li>`).join("")}</ul>
      ${!sheetState.graph && N.life ? N.life.milesHTML(id) : ""}
      <div class="sheet-actions"><button type="button" class="btn primary" data-close>完成</button></div>`;
  }


  /* ═════════ 節日與聚會 ═════════ */
  function dayKeyOf(c) { return c.dateKey + (store.mode === "preview" ? "-p" + c.dow : ""); }
  function festActive(f, c) {
    if (store.mode === "preview" && store.preview.fest && store.preview.fest !== "auto") return !f.when || f.id === store.preview.fest;
    if (!f.when) return true;
    if (f.when.day) return +c.date.split("-")[1] === f.when.day;
    if (f.when.md) return c.date === f.when.md;
    if (f.when.weather) return c.weather === f.when.weather;
    return false;
  }
  const todayFests = c => N.festivals.filter(f => f.when && festActive(f, c));
  function openParty() {
    sheetState = { type: "party", fest: null, loc: null, guests: [] };
    renderParty(); openSheet();
  }
  function renderParty() {
    const c = clockNow(), st = sheetState, s = slot();
    const held = s.partyDay === dayKeyOf(c);
    if (!st.fest) {
      const list = N.festivals.slice().sort((x, y) => ((y.when && festActive(y, c)) ? 2 : festActive(y, c) ? 1 : 0) - ((x.when && festActive(x, c)) ? 2 : festActive(x, c) ? 1 : 0));
      $("#sheetBody").innerHTML = `<h3>🎉 發起聚會</h3>
        ${held ? `<p class="sheet-desc"><b>今天已經辦過聚會了，明天再來吧。</b></p>` : ""}
        <div class="fest-list">${list.map(f => {
          const on = festActive(f, c), today = f.when && on;
          return `<button type="button" class="fest-row ${today ? "today" : ""}" data-fest="${f.id}" ${on && !held ? "" : "disabled"}>
            <span class="fest-ic">${f.icon}</span><span class="fest-main"><b>${esc(f.name)}</b>${today ? `<span class="tag hint">今天</span>` : ""}<span class="fest-rule">${esc(f.rule)}</span><span class="fest-desc">${esc(f.desc)}</span></span></button>`;
        }).join("")}</div>
        <div class="sheet-actions"><button type="button" class="btn soft" data-close>取消</button></div>`;
      return;
    }
    const f = N.festivals.find(x => x.id === st.fest), where = currentWhere(c);
    if (!st.loc) st.loc = f.locs[0];
    const need = f.need || [];
    const ok = st.guests.length >= 2 && need.every(n => st.guests.indexOf(n) >= 0);
    $("#sheetBody").innerHTML = `<h3>${f.icon} ${esc(f.name)}</h3>
      <section><h4>地點</h4><div class="chip-row">${f.locs.map(l => `<button type="button" class="chip ${st.loc === l ? "on" : ""}" data-ploc="${esc(l)}">${E.locById(l).icon} ${esc(locName(l))}</button>`).join("")}</div></section>
      <section><h4>邀請誰（${st.guests.length}／16）<button type="button" class="mini-btn" id="guestAll">全部邀請</button><button type="button" class="mini-btn" id="guestNone">清空</button></h4>
        ${need.length ? `<p class="note">這個聚會需要：${esc(need.join("、"))}</p>` : ""}
        <div class="guest-grid">${N.characters.map(x => {
          const asleep = !where[x.id].avail, on = st.guests.indexOf(x.id) >= 0;
          return `<button type="button" class="guest ${on ? "on" : ""}" data-guest="${esc(x.id)}" ${asleep ? "disabled" : ""}>${person(x.id, 30)}<span>${esc(x.id)}</span>${asleep ? `<small>休息中</small>` : on ? `<small>✓ 出席</small>` : ""}</button>`;
        }).join("")}</div></section>
      <div class="sheet-actions"><button type="button" class="btn soft" id="partyBack">換聚會</button><button type="button" class="btn primary" id="partyGo" ${ok ? "" : "disabled"}>開始聚會（${st.guests.length} 人）</button></div>`;
  }
  function genParty(f, locId, guests, host) {
    const used = new Set(), L = [];
    const pick = arr => { const a = arr.filter(x => !used.has(x)); const src = a.length ? a : arr; const x = src[Math.floor(Math.random() * src.length)]; used.add(x); return x; };
    const fill = t => t.replace(/\{fest\}/g, f.name).replace(/\{place\}/g, locName(locId)).replace(/\{host\}/g, host);
    const PV = N.partyVoice;
    L.push(["＊", fill(f.open[0])]);
    if (f.open[1]) L.push(["＊", fill(f.open[1])]);
    const order = [host].concat(guests.filter(g => g !== host));
    const arrivals = order.slice(0, 8);
    for (const g of arrivals) L.push([g, pick(PV[g].arrive)]);
    if (order.length > 8) L.push(["＊", `後來，${order.slice(8).join("、")}也陸續到了。${locName(locId)}一下子變得好熱鬧。`]);
    L.push([host, fill(PV[host].toast)]);
    L.push(["＊", "大家舉起杯子，「乾杯！」的聲音此起彼落。"]);
    L.push(["＊", fill(f.mid[0])]);
    // 節日限定台詞
    const fl = f.lines ? order.filter(g => f.lines[g]) : [];
    for (const g of fl.slice(0, 3)) L.push([g, fill(f.lines[g])]);
    // 閒聊
    const chatters = order.filter(g => fl.indexOf(g) < 0).sort(() => Math.random() - 0.5).slice(0, Math.min(5, Math.max(2, order.length - fl.length)));
    for (const g of chatters) L.push([g, fill(pick(PV[g].chat))]);
    // 兩人之間的小片段：戀人優先，再來是好感高的
    const pairs = [];
    for (let i = 0; i < order.length; i++) for (let j = i + 1; j < order.length; j++) {
      const a = order[i], b = order[j], r = getRel(a, b);
      pairs.push({ a, b, w: (r.status === "交往中" ? 100 : 0) + r.pts + Math.random() * 20, dating: r.status === "交往中" });
    }
    pairs.sort((p, q) => q.w - p.w);
    const busy = new Set();
    let n = 0;
    for (const pr of pairs) {
      if (n >= 3 || busy.has(pr.a) || busy.has(pr.b)) continue;
      busy.add(pr.a); busy.add(pr.b); n++;
      const say = (who, to, arr) => { let t = pick(arr).replace(/\{to\}/g, E.nick(who, to)); const lc = ch(to); if (lc && !lc.male) t = t.replace(/你/g, "妳"); L.push([who, t]); };
      if (pr.dating && N.voices[pr.a].love && N.voices[pr.b].love) {
        L.push(["＊", `${pr.a}和${pr.b}不知不覺坐到了一起，跟熱鬧的人群隔了一點距離。`]);
        say(pr.a, pr.b, N.voices[pr.a].love.sweet); say(pr.b, pr.a, N.voices[pr.b].love.sweet);
      } else {
        L.push(["＊", `${pr.b}端著杯子，晃到${pr.a}旁邊。`]);
        const shares = N.voices[pr.b].share.filter(x => x.indexOf(pr.a) < 0 && x.indexOf(E.nick(pr.b, pr.a)) < 0);
        if (shares.length) say(pr.b, pr.a, shares); else say(pr.b, pr.a, N.voices[pr.b].open.chat);
        say(pr.a, pr.b, N.voices[pr.a].react2);
      }
    }
    if (f.mid[1]) L.push(["＊", fill(f.mid[1])]);
    for (const g of order.slice().sort(() => Math.random() - 0.5).slice(0, Math.min(3, order.length))) L.push([g, fill(PV[g].leave)]);
    L.push(["＊", fill(f.end[0])]);
    return L;
  }
  function startParty() {
    const st = sheetState, f = N.festivals.find(x => x.id === st.fest), s = slot(), c = clockNow();
    const obs = s.observing;
    const host = obs && st.guests.indexOf(obs) >= 0 ? obs : st.guests[0];
    const guests = st.guests.slice();
    closeSheet();
    s.observing = host; profileOpen = false;
    s.encounter = { eid: "PARTY-" + Date.now().toString(36), gen: true, party: f.id, title: `${f.name}（${guests.length} 人）`,
      lines: genParty(f, st.loc, guests, host), step: 0, loc: st.loc, cast: guests, startedAt: Date.now(), done: false,
      clock: { dow: c.dow, min: c.min, date: c.date, weather: c.weather } };
    s.partyDay = dayKeyOf(c);
    save(true);
    nav("observe");
  }
  function finishParty(enc) {
    const s = slot(), f = N.festivals.find(x => x.id === enc.party);
    let n = 0;
    for (let i = 0; i < enc.cast.length; i++) for (let j = i + 1; j < enc.cast.length; j++) {
      const a = enc.cast[i], b = enc.cast[j], r = Object.assign({}, getRel(a, b));
      const cap = r.route ? 100 : 84, before = r.pts;
      r.pts = Math.min(cap, r.pts + 10); setRel(a, b, r); if (r.pts > before) n++;
    }
    // 聚會後大家陸續離開：有人馬上走，有人多待一會兒；夜深了走得比較快
    const c0 = clockNow(), late = c0.min >= 21 * 60 || c0.min < 5 * 60;
    for (const g of enc.cast) {
      const stay = late ? 10 + Math.random() * 35 : 15 + Math.random() * 60;
      s.assign[g] = { loc: enc.loc, untilAbs: stayFor(stay), act: stay > 45 ? `聚會散了，還留下來收拾、聊天` : `在${f.name}的聚會上，準備回去了` };
    }
    enc.partyResult = `💗 出席的 ${enc.cast.length} 人彼此好感 +10（${n} 組有變化）`;
    pushNews({ kind: "party", text: `🎉 ${enc.cast[0] === s.observing ? s.observing : enc.cast[0]}在${locName(enc.loc)}辦了${f.name}，來了 ${enc.cast.length} 個人。`, cast: enc.cast.slice(0, 6), loc: enc.loc });
  }

  /* ═════════ 一起出去玩 ═════════ */
  function genOuting(a, b, spot) {
    const L = [], used = new Set();
    const pick = arr => { const x = arr.filter(y => !used.has(y)); const src = x.length ? x : arr; const v = src[Math.floor(Math.random() * src.length)]; used.add(v); return v; };
    const say = (who, to, t) => { t = t.replace(/\{to\}/g, E.nick(who, to)); const lc = ch(to); if (lc && !lc.male) t = t.replace(/你/g, "妳"); L.push([who, t]); };
    const fill = t => t.replace(/\{a\}/g, a).replace(/\{b\}/g, b);
    const OV = N.outingVoice, dating = getRel(a, b).status === "交往中";
    say(a, b, OV[a].invite);
    say(b, a, dating && N.voices[b].love ? pick(N.voices[b].love.yesDate) : pick(N.voices[b].reply.chat));
    L.push(["＊", fill(spot.open[0])]);
    say(a, b, pick(OV[a].enjoy));
    say(b, a, pick(OV[b].enjoy));
    L.push(["＊", fill(spot.open[1])]);
    if (dating && N.voices[a].love && N.voices[b].love) { say(a, b, pick(N.voices[a].love.sweet)); say(b, a, pick(N.voices[b].love.sweet)); }
    else { const sh = N.voices[b].share.filter(x => x.indexOf(a) < 0 && x.indexOf(E.nick(b, a)) < 0); if (sh.length) say(b, a, pick(sh)); say(a, b, pick(N.voices[a].react2)); }
    say(a, b, pick(OV[a].enjoy));
    say(b, a, pick(N.voices[b].close));
    return L;
  }
  function startOuting(spotLoc) {
    const s = slot(), a = sheetState.who, b = sheetState.target, c = clockNow();
    const spot = N.outingSpots.find(x => x.loc === spotLoc);
    closeSheet();
    s.assign[a] = { loc: spot.loc, untilAbs: stayFor(120), act: `和${b}${spot.act}` };
    s.assign[b] = { loc: spot.loc, untilAbs: stayFor(120), act: `和${a}${spot.act}` };
    s.encounter = { eid: "OUT-" + Date.now().toString(36), gen: true, outing: spot.loc, title: `${a}和${b}${spot.act}`,
      lines: genOuting(a, b, spot), step: 0, loc: spot.loc, cast: [a, b], startedAt: Date.now(), done: false,
      clock: { dow: c.dow, min: c.min, date: c.date, weather: c.weather }, delta: { a, b, amt: 5, action: "outing", ok: true } };
    save(true); render();
  }

  /* ═════════ 小鎮動態通知 ═════════ */
  function pushNews(n) {
    const s = slot(), c = clockNow();
    s.news = s.news || [];
    s.news.unshift(Object.assign({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), at: Date.now(), dow: c.dow, min: c.min, day: dayKeyOf(c) }, n));
    if (s.news.length > 80) s.news.length = 80;
    save();
    showBanner(n);
    renderBell();
  }
  let bannerTimer = null;
  function showBanner(n) {
    const b = $("#newsBanner"); if (!b) return;
    b.innerHTML = `<span class="nb-ic">🔔</span><span class="nb-t">${esc(n.text)}</span>`;
    b.hidden = false; b.classList.remove("out");
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => { b.classList.add("out"); setTimeout(() => { b.hidden = true; }, 400); }, 5000);
  }
  function renderBell() {
    const s = slot(), n = (s.news || []).filter(x => x.at > (s.newsRead || 0)).length, el = $("#bellN");
    if (!el) return;
    el.textContent = n > 9 ? "9+" : n; el.hidden = !n;
  }
  function genNews(c) {
    const s = slot(), key = store.mode + dayKeyOf(c) + "-" + Math.floor(c.min / 30);
    if (s.newsKey === key) return;
    const first = !s.newsKey;
    s.newsKey = key;
    const where = currentWhere(c);
    const enc = s.encounter;
    const r = rng(key + "|news");
    const items = [];
    // 週末出遊開始
    for (const p of outingPairs(c)) if (c.min >= p.from && c.min < p.from + 30 && where[p.a].loc === p.spot.loc)
      items.push({ kind: "outing", text: `🧺 ${p.a}和${p.b}${p.spot.act}了。`, cast: [p.a, p.b], loc: p.spot.loc });
    // 有人跑去找朋友
    const vis = autoVisits(c);
    const used0 = new Set();
    for (const x in vis) {
      if (c.min % 30 > 20) break;
      const f = vis[x].visit; if (!where[x] || where[x].loc !== where[f].loc) continue;
      const sum = pairSummary(x, f, c, where, used0, key + "|v|" + pairKey(x, f));
      items.push({ kind: "visit", text: `🚶 ${x}跑去${locName(where[f].loc)}找${f}。${sum && sum.kind !== "event" ? sum.text : ""}`, quote: sum ? sum.quote : "", cast: [x, f], loc: where[f].loc });
      if (items.length >= 2) break;
    }
    // 臨時跑去某處，剛好碰上別人
    const nd = autoNeeds(c);
    const NEED_ICON = { hunger: "🍞", tired: "🌙", bored: "🚶" }, NEED_SAY = {
      hunger: ["肚子好餓……", "先吃點東西再說。", "聞到香味了。"], tired: ["今天就到這裡吧。", "好睏……", "回家了。"], bored: ["出去走走好了。", "換個地方。", "有點悶。"] };
    for (const x in nd) {
      const n0 = nd[x];
      if (c.min - n0.needFrom > 20 || !where[x] || where[x].loc !== n0.loc) continue;
      const met = N.characters.filter(o => o.id !== x && where[o.id].loc === n0.loc && where[o.id].avail).map(o => o.id);
      if (n0.need !== "tired" && !met.length && r() < 0.6) continue;
      const rr = rng(key + "|nd|" + x);
      const head = n0.need === "hunger" ? `${x}肚子餓了，跑去${locName(n0.loc)}` : n0.need === "tired" ? `${x}累了，提早回家` : `${x}有點無聊，晃去${locName(n0.loc)}`;
      items.push({ kind: "need", text: `${NEED_ICON[n0.need]} ${head}${met.length ? "，剛好碰上" + met.slice(0, 2).join("、") : ""}。`,
        quote: `${x}：「${NEED_SAY[n0.need][Math.floor(rr() * 3)]}」`, cast: [x].concat(met.slice(0, 2)), loc: n0.loc });
      if (items.length >= 2) break;
    }
    // 同處的人自己聊起來
    const pairs = [];
    const ids = N.characters.map(x => x.id);
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i], b = ids[j];
      if (!where[a].avail || !where[b].avail || where[a].loc !== where[b].loc) continue;
      if (enc && !enc.done && (enc.cast.indexOf(a) >= 0 || enc.cast.indexOf(b) >= 0)) continue;
      const rel = getRel(a, b);
      pairs.push({ a, b, w: (rel.status === "交往中" ? 60 : 0) + rel.pts + r() * 40 });
    }
    pairs.sort((p, q) => q.w - p.w);
    const used = new Set();
    for (const pr of pairs.slice(0, Math.max(0, 2 - items.length))) {
      const sum = pairSummary(pr.a, pr.b, c, where, used, key + "|" + pairKey(pr.a, pr.b));
      if (!sum || !sum.quote && sum.kind !== "event") continue;
      items.push({ kind: sum.kind, text: `${sum.kind === "love" ? "💗" : "💬"} ${locName(where[pr.a].loc)}：${sum.kind === "event" ? `〈${sum.title}〉` : ""}${sum.text}`, quote: sum.quote, cast: [pr.a, pr.b], loc: where[pr.a].loc });
    }
    const recent = new Set((s.news || []).slice(0, 8).map(n => n.text));
    const fresh = items.filter(it => !recent.has(it.text));
    items.length = 0; fresh.forEach(x => items.push(x));
    if (!items.length) return;
    for (const it of items.slice(0, 2).reverse()) {
      s.news = s.news || [];
      s.news.unshift(Object.assign({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), at: Date.now(), dow: c.dow, min: c.min, day: dayKeyOf(c) }, it));
    }
    if (s.news.length > 80) s.news.length = 80;
    save();
    if (!first) showBanner(items[0]);
    newsBubbles(items.slice(0, 2));
    renderBell();
  }
  function openNews() {
    const s = slot();
    sheetState = { type: "news" };
    const list = s.news || [];
    $("#sheetBody").innerHTML = `<h3>🔔 小鎮動態</h3>
      ${list.length ? `<ul class="news-list">${list.map(n => `<li><button type="button" class="news-row ${n.at > (s.newsRead || 0) ? "unread" : ""}" data-observe="${esc(n.cast[0])}">
        <span class="news-time">週${E.WEEK[n.dow]} ${E.fmtMin(n.min)}</span>
        <span class="news-text">${esc(n.text)}</span>${n.quote ? `<span class="news-q">${esc(n.quote)}</span>` : ""}
        <span class="news-cast">${n.cast.map(x => person(x, 20)).join("")}</span></button></li>`).join("")}</ul>`
        : `<div class="empty">還沒有消息。過一陣子再來看看。</div>`}
      <div class="sheet-actions"><button type="button" class="btn primary" data-close>關閉</button></div>`;
    s.newsRead = Date.now(); save(); renderBell();
    openSheet();
  }

  /* ═════════ 互動 ═════════ */
  const ACT_TITLE = { chat: "{a}找{b}聊天", food: "{a}分點心給{b}", help: "{a}請{b}幫忙", tease: "{a}逗了{b}一下" };
  function openInteract() {
    const id = slot().observing; if (!id) return;
    sheetState = { type: "interact", who: id, target: null };
    renderInteract(); openSheet();
  }
  function renderInteract() {
    const id = sheetState.who, where = currentWhere(clockNow()), me = where[id];
    if (!me.avail) {
      $("#sheetBody").innerHTML = `<h3>找人互動</h3><div class="empty">${esc(id)}正在休息。</div><div class="sheet-actions"><button type="button" class="btn soft" data-close>關閉</button></div>`;
      return;
    }
    const others = N.characters.filter(o => o.id !== id && where[o.id].loc === me.loc);
    if (!sheetState.target) {
      $("#sheetBody").innerHTML = `<h3>${person(id, 30)}${esc(id)}要找誰？</h3>
        ${others.length ? `<ul class="people">${others.map(o => `<li><button type="button" class="person-row" data-target="${esc(o.id)}" ${where[o.id].avail ? "" : "disabled"}>${person(o.id, 30)}<span>${esc(o.id)}</span>${where[o.id].avail ? "" : `<span class="tag rest">休息中</span>`}</button></li>`).join("")}</ul>`
          : `<div class="empty">這裡只有${esc(id)}一個人。</div>`}
        <div class="sheet-actions"><button type="button" class="btn soft" data-close>取消</button></div>`;
    } else {
      const t = sheetState.target, r = getRel(id, t), fx = fixedRel(id, t), [elig] = loveEligible(id, t);
      let love = "";
      if (elig && r.route) {
        love = `<h4 style="margin-top:16px">💗 戀愛線</h4><div class="act-grid">${N.loveActions.map(a => {
          let dis = "", why = "";
          if (a.dating && r.status !== "交往中") { dis = "disabled"; why = "交往後開放"; }
          else if (!a.dating && a.id === "confess" && r.status === "交往中") { dis = "disabled"; why = "已經在交往"; }
          else if (!a.dating && r.status !== "交往中" && r.pts < a.need) { dis = "disabled"; why = `好感 ${a.need} 以上`; }
          return `<button type="button" class="act-btn love" data-act="${a.id}" ${dis}><span>${a.icon}</span>${esc(a.label)}${why ? `<small>${why}</small>` : ""}</button>`;
        }).join("")}${(() => {
          let h = "";
          const dw = dateWhy(id, t);
          h += `<button type="button" class="act-btn love" id="datePickBtn" ${dw ? "disabled" : ""}><span>📍</span>約會去…${dw ? `<small>${dw}以上</small>` : ""}</button>`;
          for (const k of Object.keys(N.loveMore)) { const why = moreWhy(id, t, k); if (why === null) continue; const A = N.loveMore[k]; h += `<button type="button" class="act-btn love" data-act="${k}" ${why ? "disabled" : ""}><span>${A.icon}</span>${esc(A.label)}${why ? `<small>${/^好感/.test(why) ? why + "以上" : why}</small>` : ""}</button>`; }
          const an = annivInfo(id, t); if (an) h += `<button type="button" class="act-btn love" data-act="anniv"><span>🎂</span>${esc(an.text)}紀念</button>`;
          const fs = festDateOf(id, t); if (fs) h += `<button type="button" class="act-btn love" data-act="festdate"><span>🎉</span>一起過${esc(fs.name)}</button>`;
          return h;
        })()}</div>`;
      } else if (elig) love = "";
      $("#sheetBody").innerHTML = `<h3>${person(id, 26)}${esc(id)} → ${person(t, 26)}${esc(t)}</h3>
        <div class="rel-line">${fx ? `<span class="tag">${esc(fx.label)}</span>` : ""}${r.status ? `<span class="tag love">${esc(r.status)}</span>` : ""}<span>${esc(stageOf(r.pts, r.status))}・好感 ${r.pts}</span><div class="bar"><i style="width:${r.pts}%"></i></div></div>
        <div class="act-grid">${N.actions.map(a => `<button type="button" class="act-btn" data-act="${a.id}"><span>${a.icon}</span>${esc(a.label)}</button>`).join("")}
          <button type="button" class="act-btn out" id="outingBtn" ${r.pts >= 55 || r.status ? "" : "disabled"}><span>🧺</span>一起出去玩${r.pts >= 55 || r.status ? "" : "<small>好感 55 以上</small>"}</button></div>
        ${[["together", "🤝 一起做事"], ["small", "✋ 小動作"], ["game", "🎲 小遊戲"]].map(([g, h]) => `<h4 style="margin-top:14px">${h}</h4><div class="act-grid">${Object.keys(N.moreActs).filter(k => N.moreActs[k].group === g).map(k => { const A = N.moreActs[k], why = moreWhy(id, t, k); return `<button type="button" class="act-btn" data-act="${k}" ${why ? "disabled" : ""}><span>${A.icon}</span>${esc(A.label)}${why ? `<small>${/^好感/.test(why) ? why + "以上" : why}</small>` : ""}</button>`; }).join("")}</div>`).join("")}
        ${love}
        <div class="sheet-actions"><button type="button" class="btn soft" data-target="">換一個人</button></div>`;
    }
  }
  function renderOutingPick() {
    const a = sheetState.who, b = sheetState.target;
    $("#sheetBody").innerHTML = `<h3>🧺 ${esc(a)}約${esc(b)}去哪裡玩？</h3>
      <div class="chip-row">${N.outingSpots.map(sp => `<button type="button" class="chip loc-chip" data-outing="${esc(sp.loc)}">${E.locById(sp.loc).icon} ${esc(locName(sp.loc))}</button>`).join("")}</div>
      <div class="sheet-actions"><button type="button" class="btn soft" id="outingBack">返回</button></div>`;
  }
  function doInteract(action) {
    const s = slot(), a = sheetState.who, b = sheetState.target;
    const c = clockNow(), where = currentWhere(c), loc = where[a].loc;
    const me0 = () => loc;
    closeSheet();
    if ((N.moreActs && N.moreActs[action]) || (N.loveMore && N.loveMore[action]) || action === "anniv" || action === "festdate") return doMore(a, b, action);
    const clockObj = { dow: c.dow, min: c.min, date: c.date, weather: c.weather };
    if (action === "date" || action === "confess" || action === "sweet") {
      const r = getRel(a, b);
      let ok = true;
      if (action === "date" && r.status !== "交往中") ok = isCP(a, b) || r.pts >= 70;
      if (action === "confess") ok = isCP(a, b) || r.pts >= 85;
      const T = { date: "{a}約{b}出去", confess: "{a}向{b}告白", sweet: "{a}和{b}的悄悄話" };
      s.encounter = { eid: "GEN-" + Date.now().toString(36), gen: true, title: T[action].replace("{a}", a).replace("{b}", b),
        lines: E.generateLove(a, b, action, ok, locName(loc)), step: 0, loc, cast: [a, b], startedAt: Date.now(), done: false,
        clock: clockObj, delta: computeDelta(a, b, action, ok) };
      save(true); return render();
    }
    // 聊天時，若剛好有寫好的兩人事件可以發生，優先用它
    if (action === "chat") {
      const auth = E.candidates(a, c, where, isCooling).filter(ev => ev.cast.indexOf(b) >= 0 && ev.cast.length <= 3);
      if (auth.length) {
        const pick = auth[Math.floor(Math.random() * auth.length)];
        if (N.life) N.life.onAction("chat", a, b);
        s.encounter = { eid: pick.id, step: 0, loc: me0(), cast: pick.cast.slice(), startedAt: Date.now(), done: false,
          clock: clockObj, delta: computeDelta(a, b, "chat", true) };
        save(true); return render();
      }
    }
    if (N.life) N.life.onAction(action, a, b);
    const lines = E.generateInteraction(a, b, action, locName(loc));
    s.encounter = { eid: "GEN-" + Date.now().toString(36), gen: true, title: ACT_TITLE[action].replace("{a}", a).replace("{b}", b),
      lines, step: 0, loc, cast: [a, b], startedAt: Date.now(), done: false,
      clock: clockObj, delta: computeDelta(a, b, action, true) };
    save(true); render();
  }

  /* ═════════ 錢包、背包、商店、更多互動 ═════════
   * 錢包：每個人一份（存在存檔 s.wallet），每天第一次打開時領零用錢；在店裡打工也能賺。
   * 背包：買的東西放這裡，可以自己吃，也可以送人（照每個人的喜好加好感；不喜歡的東西也只是客氣收下，不會扣）。 */
  const MONEY = () => N.money || { name: "諾幣", start: 300, daily: 150 };
  const gameDay = () => Math.floor(clockNow().abs / 1440);
  const pk = arr => arr && arr.length ? arr[Math.floor(Math.random() * arr.length)] : "";
  function pickN(arr, n) { const idx = arr.map((_, i) => i); while (idx.length > n) idx.splice(Math.floor(Math.random() * idx.length), 1); return idx.map(i => arr[i]); }   // 隨機挑 n 個，保持原本的順序
  function fillT(t, a, b, ex) {
    t = String(t).replace(/\{me\}/g, a).replace(/\{other\}/g, b || "");
    for (const k in ex || {}) t = t.split("{" + k + "}").join(ex[k]);
    return t;
  }
  function genSay(L, who, to, t, a, b, ex) {
    t = fillT(t, a, b, ex).replace(/\{to\}/g, E.nick(who, to));
    const lc = ch(to); if (lc && !lc.male) t = t.replace(/你/g, "妳");
    L.push([who, t]);
  }
  function wal(id) {
    const s = slot(); s.wallet = s.wallet || {};
    const day = dayKeyOf(clockNow());
    let w = s.wallet[id];
    if (!w) w = s.wallet[id] = { money: MONEY().start, bag: {}, pay: day, work: {} };
    if (w.pay !== day) { w.money += MONEY().daily; w.pay = day; }
    w.work = w.work || {};
    return w;
  }
  const shopAt = loc => N.shops && N.shops[loc];
  function bagAdd(w, k, n) { w.bag[k] = (w.bag[k] || 0) + n; if (w.bag[k] <= 0) delete w.bag[k]; }
  // 一段自己的小事件（吃東西、看展、打工）：記進日誌
  function startGen(title, lines, cast, loc, delta, afterAct) {
    const s = slot(), c = clockNow();
    s.encounter = { eid: "GEN-" + Date.now().toString(36), gen: true, title, lines, step: 0, loc, cast, startedAt: Date.now(), done: false,
      clock: { dow: c.dow, min: c.min, date: c.date, weather: c.weather }, delta: delta || null, afterAct: afterAct || "" };
    save(true);
    if (ctl) { ctlCloseMenus(); ctlTalk(); } else render();
  }
  const quipOf = id => pk((N.voices[id] && N.voices[id].quip) || ["嗯。"]);

  // ── 店：買東西、內用、看展、看演出、借書、打工 ──
  function ctlShop(msg) {
    const sh = shopAt(ctl.loc); if (!sh) return ctlBag(null);
    const el = $("#ctl .ctl-panel"), w = wal(ctl.id), M = MONEY().name, day = dayKeyOf(clockNow());
    if (!ctl.shopGreet) ctl.shopGreet = pk(sh.greet);
    const items = sh.items.map(k => {
      const it = N.items[k]; if (!it) return "";
      const can = w.money >= it.price;
      return `<div class="shop-it"><span class="shop-ic">${it.icon}</span><span class="shop-n"><b>${esc(it.name)}</b><small>${it.price} ${M}${w.bag[k] ? `・背包裡有 ${w.bag[k]} 個` : ""}</small></span>`
        + (it.eat && sh.acts.includes("eatin") ? `<button type="button" class="btn soft sm" data-shopeat="${k}" ${can ? "" : "disabled"}>內用</button>` : "")
        + `<button type="button" class="btn primary sm" data-shopbuy="${k}" ${can ? "" : "disabled"}>買</button></div>`;
    }).join("");
    const acts = [];
    if (sh.acts.includes("show")) acts.push(`<button type="button" class="btn soft block" data-shopact="show" ${w.money >= sh.show.price ? "" : "disabled"}>🎫 看展〈${esc(sh.show.title)}〉・${sh.show.price} ${M}</button>`);
    if (sh.acts.includes("perform")) acts.push(`<button type="button" class="btn soft block" data-shopact="perform" ${w.money >= sh.perform.price ? "" : "disabled"}>🎤 看演出・${sh.perform.price} ${M}</button>`);
    if (sh.acts.includes("borrow")) acts.push(`<button type="button" class="btn soft block" data-shopact="borrow">📖 借一本書來看（免費）</button>`);
    if (sh.acts.includes("work")) { const done = w.work[ctl.loc] === day; acts.push(`<button type="button" class="btn soft block" data-shopact="work" ${done ? "disabled" : ""}>💼 ${esc(sh.work.label)}・+${sh.work.pay} ${M}${done ? "（今天做過了）" : ""}</button>`); }
    el.innerHTML = `<div class="ctl-panel-in shop"><h3>${sh.icon} ${esc(sh.title)}</h3><p class="shop-greet">${esc(/^（/.test(ctl.shopGreet) ? ctl.shopGreet : "「" + ctl.shopGreet + "」")}</p>
      <div class="shop-wallet">${person(ctl.id, 24)}<span>${esc(ctl.id)}的錢包　<b>${w.money}</b> ${M}</span><button type="button" class="btn soft sm" data-ctl="bag">🎒 背包</button></div>
      ${msg ? `<p class="shop-msg">${esc(msg)}</p>` : ""}${items ? `<div class="shop-list">${items}</div>` : ""}${acts.length ? `<div class="shop-acts">${acts.join("")}</div>` : ""}
      <div class="sheet-actions"><button type="button" class="btn soft" data-ctl="close">離開</button></div></div>`;
    el.hidden = false;
  }
  // 背包：to 有值的時候是「要送給誰」
  function ctlBag(to, msg) {
    const el = $("#ctl .ctl-panel"), w = wal(ctl.id), M = MONEY().name, keys = Object.keys(w.bag).filter(k => N.items[k]);
    const here = currentWhere(clockNow());
    const near = N.characters.filter(o => o.id !== ctl.id && here[o.id].loc === ctl.loc && here[o.id].avail).map(o => o.id);
    ctl.giveTo = to;
    let body;
    if (ctl.giveItem && !to) {
      const it = N.items[ctl.giveItem];
      body = `<p>要把${it.icon}${esc(it.name)}送給誰？</p>${near.length ? `<div class="chip-row">${near.map(id => `<button type="button" class="chip" data-giveto="${esc(id)}">${person(id, 22)} ${esc(id)}</button>`).join("")}</div>` : `<div class="empty">附近沒有人。走到別人身邊再送吧。</div>`}`;
    } else body = keys.length ? `<div class="shop-list">${keys.map(k => {
      const it = N.items[k];
      return `<div class="shop-it"><span class="shop-ic">${it.icon}</span><span class="shop-n"><b>${esc(it.name)}</b><small>× ${w.bag[k]}</small></span>`
        + (it.eat && !to ? `<button type="button" class="btn soft sm" data-bageat="${k}">吃掉</button>` : "")
        + `<button type="button" class="btn primary sm" data-baggive="${k}">${to ? "送這個" : "送人"}</button></div>`;
    }).join("")}</div>` : `<div class="empty">背包是空的。去店裡買點東西吧。</div>`;
    el.innerHTML = `<div class="ctl-panel-in shop"><h3>🎒 ${esc(ctl.id)}的背包${to ? `　→ 送給${esc(to)}` : ""}</h3>
      <div class="shop-wallet">${person(ctl.id, 24)}<span>錢包　<b>${w.money}</b> ${M}</span>${shopAt(ctl.loc) ? `<button type="button" class="btn soft sm" data-ctl="shopback">${shopAt(ctl.loc).icon} 回到店裡</button>` : ""}</div>
      ${msg ? `<p class="shop-msg">${esc(msg)}</p>` : ""}${body}
      <div class="sheet-actions"><button type="button" class="btn soft" data-ctl="close">關閉</button></div></div>`;
    el.hidden = false;
  }
  function eatLines(a, it) { return [["＊", fillT(it.eat, a)], [a, quipOf(a)]]; }
  function shopClick(d) {
    const a = ctl.id, w = wal(a), sh = shopAt(ctl.loc), M = MONEY().name;
    if (d.shopbuy) { const it = N.items[d.shopbuy]; if (w.money < it.price) return; w.money -= it.price; bagAdd(w, d.shopbuy, 1); save(true); sfx("coin"); return ctlShop(`買了${it.icon}${it.name}，放進背包了。`); }
    if (d.shopeat) {
      const it = N.items[d.shopeat]; if (w.money < it.price) return; w.money -= it.price; save(true); sfx("coin"); setTimeout(() => sfx("eat"), 380);
      return startGen(`${a}在${sh.title}吃${it.name}`, eatLines(a, it), [a], ctl.loc, null, `在${sh.title}吃${it.name}`);
    }
    if (d.bageat) { const it = N.items[d.bageat]; bagAdd(w, d.bageat, -1); save(true); sfx("eat"); return startGen(`${a}吃了${it.name}`, eatLines(a, it), [a], ctl.loc, null, `吃${it.name}`); }
    if (d.baggive) { if (ctl.giveTo) return giveGift(a, ctl.giveTo, d.baggive); ctl.giveItem = d.baggive; return ctlBag(null); }
    if (d.giveto) { const k = ctl.giveItem; ctl.giveItem = null; return giveGift(a, d.giveto, k); }
    if (d.datespot) return doDateSpot(a, ctl.dateWith, d.datespot);
    if (d.shopact === "show" || d.shopact === "perform") {
      const sw = sh[d.shopact]; if (w.money < sw.price) return; w.money -= sw.price; save(true); sfx("ticket");
      const L = sw.lines.map(t => ["＊", fillT(t, a)]); L.push([a, quipOf(a)]);
      return startGen(`${a}去看了〈${sw.title}〉`, L, [a], ctl.loc, null, `在${sh.title}看〈${sw.title}〉`);
    }
    if (d.shopact === "borrow") {
      const bk = pk(N.borrowBooks || ["一本書"]);
      return startGen(`${a}借了${bk}`, [["＊", `${a}在書架之間繞了一圈，最後借了${bk}。`], ["＊", `找了個靠窗的位子坐下，一頁一頁地翻著。外面的聲音好像離得很遠。`], [a, quipOf(a)]], [a], ctl.loc, null, `在${sh.title}看${bk}`);
    }
    if (d.shopact === "work") {
      const wk = sh.work, day = dayKeyOf(clockNow()); if (w.work[ctl.loc] === day) return;
      w.work[ctl.loc] = day; w.money += wk.pay; save(true); sfx("cash");
      return startGen(`${a}${wk.act.replace(/^在/, "在")}`, [["＊", `${a}捲起袖子，${wk.label}。一開始手忙腳亂，後來慢慢抓到了節奏。`],
        ["＊", `忙完的時候已經過了一個小時。老闆把${wk.pay} ${M}塞進${a}手裡：「辛苦了，明天也可以再來喔。」`], [a, quipOf(a)]], [a], ctl.loc, null, wk.act);
    }
  }
  // 送禮：看對方喜不喜歡
  const GIVE_OPEN = ["{to}，這個給你。", "{to}，路上看到的，覺得很適合你。", "{to}，送你。不用客氣。", "{to}，手伸出來一下。"];
  const GIFT_REACT = {
    love: ["……這個，你怎麼知道我喜歡？", "{to}，這是我最喜歡的。……謝謝。", "欸，真的可以收嗎？我會好好珍惜的。"],
    like: ["謝謝，我很喜歡。", "喔？挺不錯的嘛。謝了，{to}。", "你有心了，謝謝。"],
    neutral: ["謝謝你，{to}。", "嗯，我收下了。", "喔，謝啦。"],
    dislike: ["……謝謝。我、我會想辦法用的。", "嗯……心意我收下了。", "這個嘛……謝謝你想到我。"]
  };
  const GIFT_GAIN = { love: 8, like: 5, neutral: 2, dislike: 0 };
  function prefTier(b, k) {
    const P = (N.giftPref || {})[b], tags = (N.items[k] || {}).tags || [];
    if (!P) return "neutral";
    if (tags.some(t => (P.love || []).includes(t))) return "love";
    if (tags.some(t => (P.dislike || []).includes(t))) return "dislike";
    if (tags.some(t => (P.like || []).includes(t))) return "like";
    return "neutral";
  }
  function giveGift(a, b, k) {
    const w = wal(a), it = N.items[k]; if (!it || !w.bag[k]) return;
    bagAdd(w, k, -1); ctl.giveTo = null; sfx("gift");
    const tier = prefTier(b, k), L = [];
    genSay(L, a, b, pk(GIVE_OPEN), a, b);
    L.push(["＊", `${a}把${it.icon}${it.name}遞給了${b}。`]);
    L.push(["＊", fillT(pk(N.voices[b].react), b, a)]);
    genSay(L, b, a, pk(GIFT_REACT[tier]), a, b);
    const TT = { love: "（好像是最喜歡的東西）", like: "（看起來很喜歡）", neutral: "", dislike: "（好像不太合口味……）" };
    setTimeout(() => { emoteTo(a, "give"); setTimeout(() => emoteTo(b, tier === "love" ? "cheer" : tier === "dislike" ? "shrug" : "bow"), 1400); }, 700);
    startGen(`${a}送給${b}${it.name}${TT[tier]}`, L, [a, b], ctl.loc, computeDelta(a, b, "gift", true, GIFT_GAIN[tier]), `和${b}說話`);
  }

  // ── 一般互動與親密小動作 ──
  const MORE_TITLE = { pat: "{a}摸了摸{b}的頭", shoulder: "{a}拍拍{b}的肩", tsukkomi: "{a}吐槽了{b}", gossip: "{a}和{b}聊八卦", highfive: "{a}和{b}擊掌",
    rps: "{a}和{b}猜拳", arm: "{a}和{b}比腕力", quiz: "{a}和{b}的問答比賽", hand: "{a}牽起{b}的手", lean: "{a}靠在{b}的肩上", hug: "{a}抱了抱{b}", feed: "{a}餵{b}吃了一口",
    walk: "{a}和{b}一起散步", meal: "{a}和{b}一起吃飯", read: "{a}和{b}一起讀書", photo: "{a}和{b}一起拍照" };
  // 能不能做：回傳 "" 可以、字串是原因、null 是根本不顯示
  function moreWhy(a, b, k) {
    const A = N.moreActs[k] || N.loveMore[k], r = getRel(a, b);
    if (N.loveMore[k]) {
      const [elig] = loveEligible(a, b);
      if (!elig || !r.route) return null;
      if (A.adult && !(N.ageGroup[a] === "adult" && N.ageGroup[b] === "adult")) return null;   // 高中生只到牽手、靠肩
      if (A.dating && r.status !== "交往中") return "交往後";
    }
    if (A.need && r.status !== "交往中" && r.pts < A.need) return `好感${A.need}`;
    return "";
  }
  function dateWhy(a, b) { const r = getRel(a, b); return r.status === "交往中" || isCP(a, b) || r.pts >= 70 ? "" : "好感70"; }
  const CN = ["", "一", "兩", "三", "四", "五", "六", "七", "八", "九", "十", "十一", "十二"];
  function annivInfo(a, b) {
    let r = getRel(a, b); if (r.status !== "交往中") return null;
    const today = gameDay();
    if (r.since == null) { r = Object.assign({}, r, { since: today }); setRel(a, b, r); save(); }
    const days = today - r.since;
    let key = null, text = "";
    if (days >= 30) { const n = Math.floor(days / 30); key = "m" + n; text = n % 12 === 0 ? `${CN[n / 12] || n / 12}年` : `${CN[n] || n}個月`; }
    else if (days >= 7) { key = "w"; text = "一個禮拜"; }
    if (!key || r.anniv === key) return null;
    return { key, text };
  }
  function festDateOf(a, b) {
    const r = getRel(a, b), [elig] = loveEligible(a, b);
    if (!elig || !r.route || dateWhy(a, b)) return null;
    const c = clockNow(), f = todayFests(c)[0];
    if (!f || r.fest === dayKeyOf(c) + f.id) return null;
    return f;
  }
  // 自己跟著走過去（操控中就換房間；在小鎮上就只改名字）
  function moveSelf(a, loc, act, min) {
    const s = slot();
    if (ctl && ctl.id === a) {
      s.assign[a] = { loc, untilAbs: stayFor(180), act, ctl: true }; save(true);
      if (loc !== ctl.loc) ctlFade(loc, () => ctlEnter(loc));
    } else s.assign[a] = { loc, untilAbs: stayFor(min || 90), act };
  }
  function doMore(a, b, id) {
    const s = slot(), c = clockNow(), where = currentWhere(c);
    let loc = where[a].loc;
    const r = getRel(a, b);
    if (id === "anniv" || id === "festdate") {
      const S = id === "anniv" ? N.loveSpecial.anniv : N.loveSpecial.fest, ex = { place: locName(loc) };
      let gain = S.gain;
      if (id === "anniv") { const an = annivInfo(a, b); if (!an) return toast("今天不是紀念日"); ex.n = an.text; setRel(a, b, Object.assign({}, getRel(a, b), { anniv: an.key })); }
      else {
        const f = festDateOf(a, b); if (!f) return toast("今天沒有節日");
        ex.fest = f.name; const go = (f.locs && f.locs[0]) || loc; ex.place = locName(go);
        setRel(a, b, Object.assign({}, getRel(a, b), { fest: dayKeyOf(c) + f.id }));
        if (go !== loc) { s.assign[b] = { loc: go, untilAbs: stayFor(90), act: `和${a}一起過${f.name}` }; moveSelf(a, go, `和${b}一起過${f.name}`); loc = go; }
      }
      const L = [];
      genSay(L, a, b, pk(S.open), a, b, ex);
      const lv = N.voices[b].love;
      genSay(L, b, a, pk((lv && lv.sweet) || N.okLines[b] || ["嗯。"]), a, b, ex);
      for (const m of pickN(S.mid, 2)) L.push(["＊", fillT(m, a, b, ex)]);
      if (N.voices[a].love) genSay(L, a, b, pk(N.voices[a].love.sweet), a, b, ex);
      genSay(L, b, a, pk(S.end), a, b, ex);
      const title = id === "anniv" ? `${a}和${b}的${ex.n}紀念日` : `${a}和${b}一起過${ex.fest}`;
      if (id === "anniv") pushNews({ kind: "love", text: `🎂 ${a}和${b}在一起滿${ex.n}了。`, cast: [a, b], loc });
      return startGen(title, L, [a, b], loc, computeDelta(a, b, id, true, gain), title.replace(`${a}和${b}`, `和${b}`));
    }
    const A = N.moreActs[id] || N.loveMore[id];
    const why = moreWhy(a, b, id); if (why) return toast(`${why}以上才能這樣做`); if (why === null) return;
    let go = null;
    if (A.go) go = pk(A.go.filter(x => x !== loc)) || A.go[0];
    const ex = { go: go ? locName(go) : "", place: locName(loc) }, L = [];
    genSay(L, a, b, pk(A.open), a, b, ex);
    if (A.group === "together" || A.game) genSay(L, b, a, pk(N.okLines[b] || ["好啊。"]), a, b, ex);
    for (const m of (A.game ? A.mid : pickN(A.mid, 2))) L.push(["＊", fillT(m, a, b, ex)]);
    if (A.game) {
      const win = Math.random() < 0.5 ? a : b, lose = win === a ? b : a;
      L.push(["＊", `${win}贏了。`]);
      genSay(L, win, lose, pk(N.winLines[win] || ["我贏了。"]), a, b, ex);
      genSay(L, lose, win, pk(N.loseLines[lose] || ["輸了。"]), a, b, ex);
    } else {
      const endBy = id === "lean" ? a : b;
      genSay(L, endBy, endBy === a ? b : a, pk(A.end), a, b, ex);
    }
    if (N.life && N.life.onAction) N.life.onAction(id, a, b);
    const title = (MORE_TITLE[id] || "{a}和{b}" + A.label).replace("{a}", a).replace("{b}", b);
    let after = `和${b}說話`;
    if (go) {
      s.assign[b] = { loc: go, untilAbs: stayFor(90), act: fillT(A.act, b, a) };
      after = fillT(A.act, a, b); moveSelf(a, go, after); loc = go;
    }
    startGen(title, L, [a, b], loc, computeDelta(a, b, id, true, A.gain), after);
    const AE = { highfive: [[a, "high"], [b, "high"]], pat: [[a, "pat"]], shoulder: [[a, "pat"]], hug: [[a, "hug"], [b, "hug"]], feed: [[a, "give"]], photo: [[a, "wave"], [b, "cheer"]], hand: [[a, "give"]] }[id];
    if (AE) setTimeout(() => AE.forEach(([x, n]) => emoteTo(x, n)), 900);
  }

  // ── 約會：選地點 ──
  function ctlDatePick(b) {
    ctl.dateWith = b;
    const el = $("#ctl .ctl-panel");
    el.innerHTML = `<div class="ctl-panel-in"><h3>📍 ${esc(ctl.id)}約${esc(b)}去哪裡？</h3>
      <div class="chip-row">${N.dateSpots.map(sp => `<button type="button" class="chip loc-chip" data-datespot="${esc(sp.loc)}">${sp.icon} ${esc(sp.label)}</button>`).join("")}</div>
      <div class="sheet-actions"><button type="button" class="btn soft" data-ctl="close">取消</button></div></div>`;
    el.hidden = false;
  }
  const DATE_INVITE = ["{to}，等一下……要不要一起去{go}？", "{to}，我想跟你去{go}。現在。", "{to}，{go}那邊，陪我去一趟好嗎？"];
  const DATE_END = ["今天……很開心。", "下次再一起來吧。", "謝謝你約我。", "時間過得好快。"];
  function doDateSpot(a, b, spotLoc) {
    const sp = N.dateSpots.find(x => x.loc === spotLoc); if (!sp || !b) return;
    const r = getRel(a, b), dating = r.status === "交往中", ex = { go: locName(sp.loc), place: locName(sp.loc) }, L = [];
    const la = N.voices[a].love, lb = N.voices[b].love;
    genSay(L, a, b, pk(DATE_INVITE), a, b, ex);
    genSay(L, b, a, pk(dating && lb ? lb.yesDate : N.okLines[b] || ["好啊。"]), a, b, ex);
    L.push(["＊", fillT(sp.beats[0], a, b, ex)]);
    genSay(L, a, b, dating && la ? pk(la.sweet) : quipOf(a), a, b, ex);
    L.push(["＊", fillT(sp.beats[1], a, b, ex)]);
    genSay(L, b, a, dating && lb ? pk(lb.sweet) : quipOf(b), a, b, ex);
    L.push(["＊", fillT(sp.beats[2], a, b, ex)]);
    genSay(L, b, a, pk(DATE_END), a, b, ex);
    s0assign(b, sp.loc, `和${a}去${sp.label}約會`);
    const after = `和${b}去${sp.label}約會`;
    moveSelf(a, sp.loc, after);
    startGen(`${a}和${b}去${sp.label}約會`, L, [a, b], sp.loc, computeDelta(a, b, "datespot", true, 6), after);
  }
  function s0assign(id, loc, act) { slot().assign[id] = { loc, untilAbs: stayFor(90), act }; }
  Object.assign(BASE_GAIN, { gift: 2, datespot: 6, anniv: 8, festdate: 6 });
  for (const k in N.moreActs || {}) BASE_GAIN[k] = N.moreActs[k].gain;
  for (const k in N.loveMore || {}) BASE_GAIN[k] = N.loveMore[k].gain;
  N._shopDbg = { doMore, ringMenu, giveGift, wal, doDateSpot, annivInfo, festDateOf, ring: b => ctlPersonRing(b, 500, 350), getRel, setRel, ctl: () => ctl };

  /* ═════════ 手機 ═════════ */
  function openPhone() {
    const id = slot().observing; if (!id) return;
    sheetState = { type: "phone", who: id, chat: null };
    renderPhone(); openSheet(); $("#sheet").classList.add("phone-mode");
  }
  function chatName(ch, owner) {
    if (!ch.dm) return ch.name;
    if (ch.unknown) return ch.unknown;
    return ch.members.find(m => m !== owner) || ch.name;
  }
  function threadLabel(t, c) {
    return (E.toMin(t) <= c.min ? "今天 " : "昨天 ") + t;
  }
  function sortedThreads(ch, c) {
    // 昨天的在前、今天的在後；同一天依時間
    return ch.threads.slice().sort((x, y) => {
      const ax = E.toMin(x.t) <= c.min ? 1 : 0, ay = E.toMin(y.t) <= c.min ? 1 : 0;
      return ax - ay || E.toMin(x.t) - E.toMin(y.t);
    });
  }
  function dmFor(a, b) {
    return N.chats.find(ch => ch.dm && !ch.unknown && ch.members.length === 2 && ch.members.indexOf(a) >= 0 && ch.members.indexOf(b) >= 0);
  }
  function chatById(cid) {
    if (cid.indexOf("dm:") === 0) { const m = cid.slice(3).split("|"); return { id: cid, dm: true, name: "", members: m, threads: [] }; }
    if (cid.indexOf("circle:") === 0) return N.life.circleChat(cid) || { id: cid, name: "群組", icon: "👥", members: [], threads: [] };
    return N.chats.find(x => x.id === cid);
  }
  function chatKeyWith(a, b) { const ex = dmFor(a, b); return ex ? ex.id : "dm:" + pairKey(a, b); }
  function extraMsgs(cid) { const s = slot(); s.phone = s.phone || {}; return s.phone[cid] || []; }
  function msgHTML(m, owner, ch) {
    const mine = m[0] === owner, who = m[0] === "?" ? "?" : m[0];
    const isSticker = /^\[貼圖\]/.test(m[1]), isPhoto = /^\[照片\]/.test(m[1]);
    const body = isSticker ? `<span class="sticker">${esc(m[1].replace(/^\[貼圖\]\s*/, ""))}</span>`
      : isPhoto ? `<span class="photo">📷 ${esc(m[1].replace(/^\[照片\]\s*/, ""))}</span>` : esc(m[1]);
    return `<div class="msg ${mine ? "mine" : ""}">${mine ? "" : (who === "?" ? `<span class="chat-ic unk sm">?</span>` : person(who, 28))}<div>${mine || ch.dm ? "" : `<div class="msg-who">${esc(who)}</div>`}<div class="msg-b ${isSticker ? "stk" : ""}">${body}</div></div></div>`;
  }
  function renderPhone() {
    const id = sheetState.who, c = clockNow(), w = currentWhere(c)[id];
    const peek = !w.avail ? `${esc(id)}睡著了，手機螢幕還亮著……` : `（偷看中……${esc(id)}好像沒發現）`;
    if (sheetState.pick) {
      $("#sheetBody").innerHTML = `<div class="phone">
        <div class="phone-top"><button type="button" class="phone-back" id="phoneBack">‹ 返回</button><b>傳訊息給…</b><span></span></div>
        <div class="chat-list">${N.characters.filter(o => o.id !== id).map(o => {
          const r = getRel(id, o.id);
          return `<button type="button" class="chat-row" data-chat="${esc(chatKeyWith(id, o.id))}">${person(o.id, 40)}<span class="chat-main"><b>${esc(o.id)}</b><span class="chat-prev">${esc(stageOf(r.pts, r.status))}・好感 ${r.pts}</span></span><span class="chat-time"></span></button>`;
        }).join("")}</div></div>`;
      return;
    }
    if (!sheetState.chat) {
      const list = N.chats.filter(ch => ch.members.indexOf(id) >= 0).concat(N.life ? N.life.circleChats(id) : []);
      for (const k of Object.keys(slot().phone || {})) {
        if (k.indexOf("dm:") === 0 && k.slice(3).split("|").indexOf(id) >= 0 && !list.some(x => x.id === k)) list.push(chatById(k));
      }
      for (const o of N.characters) {
        if (o.id === id) continue;
        const k = chatKeyWith(id, o.id);
        if (!list.some(x => x.id === k) && autoDMs(id, o.id, c).length) list.push(chatById(k));
      }
      $("#sheetBody").innerHTML = `<div class="phone">
        <div class="phone-top"><span>${E.fmtMin(c.min)}</span><b>${esc(id)}的手機</b><span>🔋</span></div>
        <div class="phone-peek">${peek}</div>
        <button type="button" class="btn soft block phone-new" id="phoneNew">✉️ 用${esc(id)}的手機傳訊息給…</button>
        <div class="chat-list">${list.length ? list.map(ch => {
          const ex = todayItems(ch, id, c);
          const tth = ch.threads.filter(t => E.toMin(t.t) <= c.min).sort((p, q) => E.toMin(p.t) - E.toMin(q.t));
          const lastAuth = tth.length ? tth[tth.length - 1] : null;
          let lm, tl;
          if (ex.length && (!lastAuth || ex[ex.length - 1].min >= E.toMin(lastAuth.t))) { const e = ex[ex.length - 1]; lm = e.m; tl = E.fmtMin(e.min); }
          else if (ch.threads.length) { const th = sortedThreads(ch, c), last = th[th.length - 1]; lm = last.m[last.m.length - 1]; tl = threadLabel(last.t, c).replace("今天 ", ""); }
          else { lm = ["", ""]; tl = ""; }
          const icon = ch.dm ? (ch.unknown ? `<span class="chat-ic unk">?</span>` : person(chatName(ch, id), 40)) : `<span class="chat-ic">${ch.icon}</span>`;
          return `<button type="button" class="chat-row" data-chat="${esc(ch.id)}">${icon}<span class="chat-main"><b>${esc(chatName(ch, id))}</b>${ch.dm ? "" : `<small>（${ch.members.length}）</small>`}<span class="chat-prev">${lm[0] === id ? "我：" : ""}${esc(lm[1].replace(/^\[(貼圖|照片)\]\s*/, "[$1]"))}</span></span><span class="chat-time">${tl}</span></button>`;
        }).join("") : `<div class="empty">沒有聊天紀錄。</div>`}</div>
        <div class="sheet-actions"><button type="button" class="btn soft" data-close>把手機放回去</button></div></div>`;
      return;
    }
    const ch = chatById(sheetState.chat);
    const thAll = sortedThreads(ch, c);
    const yThreads = thAll.filter(t => E.toMin(t.t) > c.min);              // 昨天
    const tThreads = thAll.filter(t => E.toMin(t.t) <= c.min);             // 今天（寫好的）
    const older = extraMsgs(ch.id).filter(e => e.dow !== c.dow), ex = todayItems(ch, id, c);
    let exHTML = "", lastLabel = "", lastMin = -999;
    for (const e of older) {
      const lab = "週" + E.WEEK[e.dow] + " " + E.fmtMin(e.min);
      if (lab !== lastLabel) { exHTML += `<div class="chat-day">${lab}</div>`; lastLabel = lab; }
      exHTML += msgHTML(e.m, id, ch);
    }
    const today = [];
    tThreads.forEach(t => t.m.forEach((m, i) => today.push({ min: E.toMin(t.t) + i * 0.01, m, auth: true })));
    ex.forEach(e => today.push(e));
    today.sort((p, q) => p.min - q.min);
    for (const e of today) {
      if (e.min - lastMin > 20) exHTML += `<div class="chat-day">今天 ${E.fmtMin(Math.floor(e.min))}</div>`;
      lastMin = e.min;
      exHTML += msgHTML(e.m, id, ch);
    }
    const th = yThreads;
    const canSend = ch.dm && !ch.unknown;
    const other = canSend ? ch.members.find(m => m !== id) : null;
    $("#sheetBody").innerHTML = `<div class="phone">
      <div class="phone-top"><button type="button" class="phone-back" id="phoneBack">‹ 返回</button><b>${esc(chatName(ch, id))}</b><span></span></div>
      <div class="chat-view">${th.map(t => `<div class="chat-day">${threadLabel(t.t, c)}</div>` + t.m.map(m => msgHTML(m, id, ch)).join("")).join("")}${exHTML}
        ${sheetState.typing ? `<div class="msg typing">${person(other, 28)}<div><div class="msg-b">輸入中……</div></div></div>` : ""}
        ${!th.length && !ex.length ? `<div class="phone-peek">還沒有聊過天。</div>` : ""}</div>
      ${canSend ? `<div class="send-bar">${N.phoneTypes.map(p => `<button type="button" class="send-chip" data-send="${p.id}" ${sheetState.typing ? "disabled" : ""}>${p.icon} ${esc(p.label)}</button>`).join("")}</div>
        <div class="phone-peek">用${esc(id)}的手機傳固定訊息給${esc(other)}。每天前三則會增加兩人的好感。</div>`
        : `<div class="phone-peek">${ch.dm ? "這個號碼無法回覆。" : "群組只能偷看，不能傳訊息。"}</div>`}
      <div class="phone-peek">${peek}</div></div>`;
    const cv = $(".chat-view"); if (cv) cv.scrollTop = cv.scrollHeight;
    const sh = $("#sheet"); if (sh) sh.scrollTop = sh.scrollHeight;
  }
  // 今天的訊息：角色之間自己傳的 + 你用手機傳的，依時間排序
  function todayItems(ch, owner, c) {
    const items = extraMsgs(ch.id).filter(e => e.dow === c.dow).map(e => ({ min: e.min, m: e.m }));
    if (ch.dm && !ch.unknown && ch.members.length === 2) {
      const other = ch.members.find(m => m !== owner);
      for (const x of autoDMs(owner, other, c)) items.push(x);
    }
    return items.sort((p, q) => p.min - q.min);
  }
  function fillPhone(text, from, to) {
    let t = text.replace(/\{to\}/g, E.nick(from, to));
    const l = ch(to); if (l && !l.male) t = t.replace(/你/g, "妳");
    return t;
  }
  function phoneSend(type) {
    const id = sheetState.who, cid = sheetState.chat, chat = chatById(cid);
    const other = chat.members.find(m => m !== id);
    const s = slot(), c = clockNow(), ow = currentWhere(c)[other];
    const pick = arr => arr[Math.floor(Math.random() * arr.length)];
    s.phone = s.phone || {}; s.phone[cid] = s.phone[cid] || [];
    s.phone[cid].push({ dow: c.dow, min: c.min, m: [id, fillPhone(pick(N.phoneVoice[id].send[type]), id, other)] });
    if (s.phone[cid].length > 120) s.phone[cid].splice(0, s.phone[cid].length - 120);
    save(true);
    if (!ow.avail) { renderPhone(); return toast(`${other}好像在休息，訊息還沒讀`); }
    sheetState.typing = true; renderPhone();
    const st = sheetState;
    setTimeout(() => {
      const c2 = clockNow();
      const relNow = getRel(id, other), L = N.voices[other].love;
      const replyText = relNow.status === "交往中" && L && Math.random() < 0.6 ? pick(L.sweet) : pick(N.phoneVoice[other].reply[type]);
      s.phone[cid].push({ dow: c2.dow, min: c2.min, m: [other, fillPhone(replyText, other, id)] });
      // 好感：每天前三則有效
      s.phoneDaily = s.phoneDaily || {};
      const dk = pairKey(id, other), day = c2.dateKey + (store.mode === "preview" ? "-p" + c2.dow : "");
      const rec = s.phoneDaily[dk] && s.phoneDaily[dk].day === day ? s.phoneDaily[dk] : { day, n: 0 };
      rec.n++; s.phoneDaily[dk] = rec;
      let msg;
      {
        const r = Object.assign({}, getRel(id, other)), cap = r.route || r.status ? 100 : 84;
        const gain = Math.max(1, Math.round(((N.voices[other].pref || {}).chat || 1) * paceMul()));
        const before = r.pts; r.pts = Math.min(cap, r.pts + gain); setRel(id, other, r);
        msg = r.pts > before ? `💗 ${id} ↔ ${other}　好感 +${r.pts - before}（${r.pts}）` : `${id} ↔ ${other} 已經是最要好的朋友了（開啟戀愛線才能再往上）`;
      }
      save(true);
      if (sheetState === st) { st.typing = false; renderPhone(); }
      toast(msg);
    }, 1300);
  }

  /* ═════════ 日誌 ═════════ */
  let logFilter = { who: null, q: "", limit: 40, dexWho: null, dexLimit: 60 };
  let openLog = {};
  function renderLog(el) {
    const tab = store.ui.logTab || "mine";
    const s = slot();
    el.innerHTML = `<h2 class="view-title">日誌</h2>
      <div class="seg log-tabs" role="tablist">
        <button type="button" data-logtab="mine" class="${tab === "mine" ? "on" : ""}">我讀過的（${s.log.length}）</button>
        <button type="button" data-logtab="dex" class="${tab === "dex" ? "on" : ""}">事件圖鑑</button>
        <button type="button" data-logtab="paper" class="${tab === "paper" ? "on" : ""}">📰 日報</button>
        <button type="button" data-logtab="diary" class="${tab === "diary" ? "on" : ""}">📓 日記</button>
        <button type="button" data-logtab="gossip" class="${tab === "gossip" ? "on" : ""}">💭 八卦</button>
        <button type="button" data-logtab="items" class="${tab === "items" ? "on" : ""}">🎁 物品</button>
      </div>
      <div id="logInner"></div>`;
    if (tab === "gossip") $("#logInner").innerHTML = N.life.gossipHTML();
    else if (tab === "items") $("#logInner").innerHTML = N.life.itemsHTML();
    else if (tab === "mine") renderMine(); else if (tab === "paper") renderPaper(); else if (tab === "diary") renderDiary(); else renderDex();
  }
  function filterChips(attr, cur) {
    return `<div class="filter-row" role="group" aria-label="依角色篩選">
      <button type="button" class="chip all ${!cur ? "on" : ""}" ${attr}="">全部</button>
      ${N.characters.map(x => `<button type="button" class="chip ${cur === x.id ? "on" : ""}" ${attr}="${esc(x.id)}">${person(x.id, 20)}${esc(x.id)}</button>`).join("")}
    </div>`;
  }
  /* 📰 諾文日報：把今天的消息整理成一份小報 */
  /* ═════════ 睡前的一行日記 ═════════ */
  function writeDiary(ck) {
    const out = {};
    for (const x of N.characters) {
      const id = x.id, T0 = (N.diary || {})[id]; if (!T0) continue;
      const segs = dayTimeline(id, ck);
      const mins = {}, locMin = {}, met = new Set(); let needLoc = null;
      for (const sg of segs) {
        const d = Math.min(sg.to, ck.min) - sg.from;
        if (sg.avail) { locMin[sg.loc] = (locMin[sg.loc] || 0) + d; for (const o of sg.comp) { mins[o] = (mins[o] || 0) + d; met.add(o); } }
        if (/臨時跑去|晃去/.test(sg.act || "")) needLoc = sg.loc;
      }
      const home = N.schedules[id].home;
      const topLoc = Object.keys(locMin).filter(l => l !== home).sort((a, b) => locMin[b] - locMin[a])[0] || home;
      const who = Object.keys(mins).sort((a, b) => mins[b] - mins[a])[0];
      const lover = [...met].find(o => getRel(id, o).status === "交往中");
      const r = rng(ck.dateKey + "|diary|" + id + "|" + ck.dow);
      let cat;
      if (lover && T0.love) cat = "love";
      else if (needLoc && T0.need && r() < 0.35) cat = "need";
      else if (met.size >= 4 && r() < 0.5) cat = "crowd";
      else if (who && (mins[who] || 0) >= 45) cat = "who";
      else cat = "alone";
      const arr = T0[cat] || T0.who;
      let line = arr[Math.floor(r() * arr.length)];
      const lifeNote = N.life ? N.life.diaryNote(id, ck) : "";
      if (lifeNote && r() < 0.6) { out[id] = lifeNote; continue; }
      const whoName = cat === "love" ? lover : who || "";
      line = line.replace(/\{who\}/g, whoName).replace(/\{loc\}/g, locName(topLoc)).replace(/\{n\}/g, met.size).replace(/\{place\}/g, locName(needLoc || topLoc));
      out[id] = line;
    }
    return out;
  }
  function ensureDiary(c) {
    const s = slot(); s.diary = s.diary || {};
    const day = dayKeyOf(c);
    if (c.min >= 21 * 60 + 30 && !s.diary[day]) {
      s.diary[day] = { dow: c.dow, at: Date.now(), entries: writeDiary(c) };
      const keys = Object.keys(s.diary).sort((a, b) => s.diary[b].at - s.diary[a].at);
      for (const k of keys.slice(14)) delete s.diary[k];
      save();
      pushNews({ kind: "diary", text: "📓 大家寫好今天的日記了，到日誌翻翻看。", cast: [] });
    }
  }
  function renderDiary() {
    const s = slot(), d = s.diary || {}, el = $("#logInner");
    const days = Object.keys(d).sort((a, b) => d[b].at - d[a].at);
    if (!days.length) { el.innerHTML = `<div class="empty" style="margin-top:14px">晚上九點半以後，大家會在睡前寫一行日記。</div>`; return; }
    el.innerHTML = days.map(k => {
      const e = d[k], dt = new Date(e.at);
      return `<section class="card diary-day"><h4>📓 週${E.WEEK[e.dow]}${store.mode === "real" ? `・${dt.getMonth() + 1}/${dt.getDate()}` : ""}</h4>
        <ul class="diary-list">${N.characters.filter(x => e.entries[x.id]).map(x => `<li>${person(x.id, 30)}<div><b>${esc(x.id)}</b><p>${esc(e.entries[x.id])}</p></div></li>`).join("")}</ul></section>`;
    }).join("");
  }
  function renderPaper() {
    const s = slot(), c = clockNow(), day = dayKeyOf(c);
    const today = (s.news || []).filter(n => n.day === day);
    const list = today.length ? today : (s.news || []).slice(0, 6);
    const head = list.find(n => n.kind === "party") || list.find(n => n.kind === "love") || list.find(n => n.kind === "outing") || list[0];
    const count = {};
    for (const n of list) for (const x of n.cast) count[x] = (count[x] || 0) + 1;
    const star = Object.keys(count).sort((a, b) => count[b] - count[a])[0];
    const couples = [];
    for (const k in (s.rel || {})) if (s.rel[k].status === "交往中") couples.push(k.split("|"));
    const tf = todayFests(c);
    const myLog = s.log.filter(e => e.at > Date.now() - 86400000).length;
    $("#logInner").innerHTML = `<article class="paper card">
      <header class="paper-head"><div class="paper-name">諾文日報</div><div class="paper-date">週${E.WEEK[c.dow]}・${esc(c.date.replace("-", " 月 "))} 日・${WX_ICON[c.weather] || ""}${esc(c.weather)}</div></header>
      ${tf.length ? `<div class="paper-fest">${tf.map(f => `${f.icon} 今日節日：${esc(f.name)}`).join("　")}</div>` : ""}
      ${head ? `<section class="paper-lead"><div class="paper-k">頭條</div><h3>${esc(head.text.replace(/^\S+\s/, ""))}</h3>${head.quote ? `<p>${esc(head.quote)}</p>` : ""}</section>`
        : `<section class="paper-lead"><div class="paper-k">頭條</div><h3>今天的諾文很平靜。</h3><p>記者在鐘塔廣場等了一整天，只等到一群鴿子。</p></section>`}
      ${list.length > 1 ? `<section><div class="paper-k">小鎮短訊</div><ul class="paper-list">${list.filter(n => n !== head).slice(0, 6).map(n => `<li><span>${E.fmtMin(n.min)}</span>${esc(n.text)}</li>`).join("")}</ul></section>` : ""}
      <section class="paper-cols">
        <div><div class="paper-k">今日焦點人物</div>${star ? `<div class="paper-star">${person(star, 36)}<b>${esc(star)}</b><small>上了 ${count[star]} 則消息</small></div>` : `<p class="muted">從缺</p>`}</div>
        <div><div class="paper-k">戀愛專欄</div>${couples.length ? couples.map(p => `<div class="paper-couple">💗 ${esc(p[0])} × ${esc(p[1])}</div>`).join("") : `<p class="muted">目前沒有公開的情侶。</p>`}</div>
      </section>
      <footer class="paper-foot">本報觀察員今天親眼見證了 ${myLog} 段相遇。消息多為聽說，僅供參考。</footer>
    </article>`;
  }
  function renderMine() {
    const s = slot(), q = logFilter.q.trim();
    let list = s.log;
    if (logFilter.who) list = list.filter(e => e.cast.indexOf(logFilter.who) >= 0);
    if (q) list = list.filter(e => e.title.indexOf(q) >= 0 || e.lines.some(l => l[1].indexOf(q) >= 0 || l[0].indexOf(q) >= 0));
    const shown = list.slice(0, logFilter.limit);
    $("#logInner").innerHTML = `
      <div class="log-tools">
        <input class="search" id="logSearch" type="search" placeholder="搜尋標題或台詞" value="${esc(logFilter.q)}" enterkeyhint="search" aria-label="搜尋日誌">
        ${filterChips("data-who", logFilter.who)}
      </div>
      ${s.log.length === 0 ? `<div class="empty card" style="padding:28px 16px">還沒有紀錄。<br>到「居民」選一位開始觀察，讀完的相遇會記在這裡。</div>`
        : !list.length ? `<div class="empty">沒有符合的紀錄</div>`
        : `<div class="log-list">${shown.map(logItemHTML).join("")}</div>
           ${list.length > shown.length ? `<button type="button" class="btn soft block more-btn" id="moreLog">顯示更多（還有 ${list.length - shown.length} 筆）</button>` : ""}`}`;
  }
  function logItemHTML(e) {
    const d = new Date(e.at);
    const open = !!openLog[e.k];
    return `<div class="log-item">
      <button type="button" class="log-sum" data-logk="${e.k}" aria-expanded="${open}">
        <span class="log-title">〈${esc(e.title)}〉</span>
        <span class="log-meta"><span>📍${esc(e.loc)}</span><span>週${E.WEEK[e.clock.dow]} ${E.fmtMin(e.clock.min)}</span>
          <span class="log-cast">${e.cast.map(c => person(c, 18)).join("")}</span><span>${esc(e.cast.join("、"))}</span></span>
        <span class="log-meta">讀於 ${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}</span>
      </button>
      ${open ? `<div class="log-body">${e.lines.map(l => l[0] === "＊" ? `<div class="narr">${esc(l[1])}</div>` : `<div class="say"><b>${esc(l[0])}</b>${esc(l[1])}</div>`).join("")}</div>` : ""}
    </div>`;
  }
  function renderDex() {
    const s = slot();
    let all = E.allEvents();
    if (logFilter.dexWho) all = all.filter(e => e.cast.indexOf(logFilter.dexWho) >= 0);
    const readN = all.filter(e => s.read[e.id]).length;
    const sorted = all.slice().sort((a, b) => (s.read[b.id] ? 1 : 0) - (s.read[a.id] ? 1 : 0));
    const shown = sorted.slice(0, logFilter.dexLimit);
    $("#logInner").innerHTML = `
      <div class="dex-progress card" style="padding:12px 14px"><b>${logFilter.dexWho ? esc(logFilter.dexWho) + " 的" : "全部"}相遇：已讀 ${readN} ／ ${all.length}</b>
        <div class="bar"><i style="width:${all.length ? (readN / all.length * 100).toFixed(1) : 0}%"></i></div></div>
      <div class="log-tools">${filterChips("data-dexwho", logFilter.dexWho)}</div>
      <div class="log-list">${shown.map(e => s.read[e.id]
        ? `<div class="dex-item"><span class="t">〈${esc(e.title)}〉</span><span class="c">讀過 ${s.read[e.id]} 次</span><span class="m">📍${esc(e.loc)}・${esc(e.cast.join("、"))}</span></div>`
        : `<div class="dex-item locked"><span class="t">？？？</span><span class="c"></span><span class="m">📍${esc(e.loc)}・${esc(e.cast.join("、"))}</span></div>`).join("")}</div>
      ${sorted.length > shown.length ? `<button type="button" class="btn soft block more-btn" id="moreDex">顯示更多（還有 ${sorted.length - shown.length} 則）</button>` : ""}`;
  }

  /* ═════════ 抽屜／設定 ═════════ */
  const sfx = n => { if (N.sfx) N.sfx.play(n); };
  /* 角色的動作：看目前這一句台詞，讓說話的人（或旁白提到的人）做對應的動作 */
  const EMO_SAY = [[/哈哈|嘻嘻|呵呵|噗|笑死/, "laugh"], [/耶|太好了|好耶|萬歲|贏了|成功/, "cheer"], [/謝謝|謝了|多謝|辛苦了/, "bow"], [/^(嗨|你好|早安|午安|晚安|嘿|喲|哈囉)/, "wave"],
    [/真的假的|什麼？|欸？|！？|嚇死|咦/, "surprise"], [/這個嘛|好像|為什麼|怎麼會|讓我想想|唔/, "think"], [/隨便|算了|誰知道|哼|無所謂/, "shrug"], [/^(嗯|好啊|好。|可以|沒問題|行啊|當然)/, "nod"]];
  const EMO_NARR = [[/擊掌|give me five/i, "high", "all"], [/抱/, "hug", "all"], [/遞給|遞到|塞進.*手裡/, "give", "first"], [/摸.*頭|拍了拍|拍拍/, "pat", "first"],
    [/贏了/, "cheer", "first"], [/鼓掌|拍手/, "clap", "all"], [/點了點頭|點頭/, "nod", "first"], [/鞠躬/, "bow", "first"], [/揮手|招手|揮了揮/, "wave", "first"],
    [/聳肩|聳了聳/, "shrug", "first"], [/愣了|嚇了一跳|瞪大/, "surprise", "first"], [/笑/, "laugh", "first"], [/想了想|歪頭|托著下巴/, "think", "first"]];
  function emoteTo(id, name) { try { if (N.room3d && N.room3d.emote) N.room3d.emote(id, name); if (N.town3d && N.town3d.emote) N.town3d.emote(id, name); } catch (e) { } }
  function lineEmote(enc) {
    const ev = enc && encEvent(enc), ln = ev && ev.lines && ev.lines[enc.step]; if (!ln) return;
    const [who, text] = ln, cast = enc.cast || [];
    if (who !== "＊" && cast.indexOf(who) >= 0) { const m = EMO_SAY.find(([re]) => re.test(text)); if (m) emoteTo(who, m[1]); return; }
    const named = cast.filter(id => text.indexOf(id) >= 0).sort((a, b) => text.indexOf(a) - text.indexOf(b));
    for (const [re, name, whom] of EMO_NARR) {
      const k = text.search(re); if (k < 0) continue;
      if (whom === "all") (named.length ? named : cast).forEach(id => emoteTo(id, name));
      else { const before = named.filter(id => text.indexOf(id) < k); const id = before.length ? before[before.length - 1] : named[0]; if (id) emoteTo(id, name); }
      return;
    }
  }
  function openSheet() { if ($("#sheet").hidden) sfx("open"); $("#sheet").hidden = false; $("#sheetBackdrop").hidden = false; $("#sheet").scrollTop = 0; }
  function closeSheet() { if (!$("#sheet").hidden) sfx("close"); $("#sheet").classList.remove("phone-mode"); $("#sheet").hidden = true; $("#sheetBackdrop").hidden = true; sheetState = null; }
  function confirmSheet(title, msg, okLabel, onOk) {
    sheetState = { type: "confirm", onOk };
    $("#sheetBody").innerHTML = `<h3>${esc(title)}</h3><p class="sheet-desc">${esc(msg)}</p>
      <div class="sheet-actions"><button type="button" class="btn soft" data-close>取消</button><button type="button" class="btn primary" id="confirmOk">${esc(okLabel)}</button></div>`;
    openSheet();
  }
  function openSettings() {
    sheetState = { type: "settings" };
    renderSettings();
    openSheet();
  }
  // 設定裡收起來的區塊：重畫時維持打開／收起
  const setOpen = {};
  const swHTML = on => `<i class="sw" aria-hidden="true">${on ? "開" : "關"}</i>`;
  function renderSettings() {
    const p = store.preview, c = clockNow();
    const standalone = window.navigator.standalone || (window.matchMedia && matchMedia("(display-mode: standalone)").matches);
    $("#sheetBody").innerHTML = `
      <h3>設定</h3>
      <section>
        <h4>時間模式</h4>
        <button type="button" class="mode-opt ${store.mode === "real" ? "on" : ""}" data-mode="real"><b>現實時間（台灣）</b><span>小鎮跟著台灣時間過日子。這是正式紀錄。</span></button>
        <button type="button" class="mode-opt ${store.mode === "preview" ? "on" : ""}" data-mode="preview"><b>小鎮時間（自由流動）</b><span>不跟現實同步：可以加速、暫停，也能調整星期與時間。關掉 App 時小鎮會停住，不會錯過什麼。進度和台灣時間分開保存。</span></button>
      </section>
      ${store.mode === "preview" ? `
      <section>
        <h4>小鎮時間</h4>
        <div class="time-display">週${E.WEEK[c.dow]} ${E.fmtMin(c.min)}</div>
        <div class="seg speed-seg" style="margin-bottom:10px">${[[0, "⏸ 暫停"], [1, "1×"], [5, "5×"], [20, "20×"]].map(([v, t]) => `<button type="button" data-speed="${v}" class="${(v === 0 ? p.paused : !p.paused && (p.speed || 1) === v) ? "on" : ""}">${t}</button>`).join("")}</div>
        <div class="chip-row" style="justify-content:center">${[1, 2, 3, 4, 5, 6, 0].map(d => `<button type="button" class="chip ${c.dow === d ? "on" : ""}" data-pdow="${d}">${E.WEEK[d]}</button>`).join("")}</div>
        <div class="chip-row" style="justify-content:center;margin-top:8px">
          <button type="button" class="chip" data-pshift="-60">−1 小時</button><button type="button" class="chip" data-pshift="-15">−15 分</button>
          <button type="button" class="chip" data-pshift="15">+15 分</button><button type="button" class="chip" data-pshift="60">+1 小時</button></div>
        <div class="chip-row" style="justify-content:center;margin-top:8px">${["07:30", "12:00", "15:30", "17:45", "20:30", "23:45"].map(t => `<button type="button" class="chip" data-pset="${t}">${t}</button>`).join("")}</div>
      </section>
      ` : ""}
      <section>
        <h4>音樂</h4>
        <button type="button" class="mode-opt tog ${N.lofi && N.lofi.isPlaying() ? "on" : ""}" id="musicBtn2" aria-pressed="${!!(N.lofi && N.lofi.isPlaying())}"><b>🎵 背景音樂</b><span>小鎮頁的諾文電台可以選歌。</span>${swHTML(N.lofi && N.lofi.isPlaying())}</button>
        <div class="vol-row"><span>音量</span><input type="range" id="musicVol" min="0" max="100" value="${Math.round((store.ui.musicVol == null ? 0.5 : store.ui.musicVol) * 100)}" aria-label="音量"></div>
        <button type="button" class="mode-opt tog ${store.ui.sfx !== false ? "on" : ""}" id="sfxBtn" style="margin-top:10px" aria-pressed="${store.ui.sfx !== false}"><b>🔔 按鈕和互動音效</b>${swHTML(store.ui.sfx !== false)}</button>
        <div class="vol-row"><span>音效音量</span><input type="range" id="sfxVol" min="0" max="100" value="${Math.round((store.ui.sfxVol == null ? 0.6 : store.ui.sfxVol) * 100)}" aria-label="音效音量"></div>
      </section>
      <section>
        <h4>介面顏色</h4>
        <div class="seg seg-grid">${[["town", "🕰️ 跟著小鎮時間"], ["system", "📱 跟著手機"], ["light", "☀️ 白天"], ["dark", "🌙 夜晚"]].map(([v, t]) => `<button type="button" data-theme="${v}" class="${(store.ui.theme || "town") === v ? "on" : ""}">${t}</button>`).join("")}</div>
      </section>
      <section>
        <h4>3D 畫質</h4>
        <p class="muted" style="margin:0 0 8px">高畫質是完整的城市、光影和夜景；輕量城市是同樣的建築和夜景，範圍小一點、光影簡單一點（電腦比較舊時用）；簡化小鎮是最早的方塊小鎮。自動：電腦用高畫質，手機用簡化小鎮（比較省電、不容易因為記憶體不夠被關掉）。手機想看完整街景可以選輕量城市。換了之後會重新載入。</p>
        <div class="seg">${[["auto", "🪄 自動"], ["high", "✨ 高畫質"], ["mobile", "🏙️ 輕量城市"], ["low", "🧊 簡化小鎮"]].map(([v, t]) => { let q = "auto"; try { q = localStorage.getItem("novum-quality") || "auto"; } catch (e) { } return `<button type="button" data-quality="${v}" class="${q === v ? "on" : ""}">${t}</button>`; }).join("")}</div>
      </section>
      <section>
        <h4>居民的自主行動</h4>
        <button type="button" class="mode-opt tog ${store.needs !== false ? "on" : ""}" id="needsToggle" aria-pressed="${store.needs !== false}"><b>肚子餓、累了、無聊時自己跑去別處</b>${swHTML(store.needs !== false)}</button>
      </section>
      <section>
        <h4>進展速度</h4>
        <p class="muted" style="margin:0 0 8px">好感上升、自己聚會、互相約出去的頻率。</p>
        <div class="seg">${[["slow", "🐢 慢"], ["normal", "🚶 一般"], ["fast", "🏃 快"]].map(([v, t]) => `<button type="button" data-pace="${v}" class="${(store.pace || "normal") === v ? "on" : ""}">${t}</button>`).join("")}</div>
      </section>
      <section>
        <h4>好感</h4>
        <button type="button" class="mode-opt tog ${store.bond !== false ? "on" : ""}" id="bondToggle" aria-pressed="${store.bond !== false}"><b>日常事件也會慢慢增加好感</b><span>看完有兩人以上的相遇，出場的人彼此好感 +1（沒開戀愛線時最多到 84）。</span>${swHTML(store.bond !== false)}</button>
      </section>
      ${store.mode === "preview" ? `
      <details class="set-more" data-k="sim" ${setOpen.sim ? "open" : ""}>
        <summary>🧪 模擬天氣、單雙週和節日</summary>
      <section>
        <h4>天氣</h4>
        <div class="chip-row">${["auto", "晴", "多雲", "雨", "霧"].map(w => `<button type="button" class="chip ${p.weather === w ? "on" : ""}" data-pwx="${w}">${w === "auto" ? "自動" : (WX_ICON[w] + w)}</button>`).join("")}</div>
      </section>
      <section>
        <h4>單雙週（部分行程隔週不同）</h4>
        <div class="chip-row">${[["auto", "跟現實一樣"], ["A", "單週 A"], ["B", "雙週 B"]].map(([v, t]) => `<button type="button" class="chip ${p.parity === v ? "on" : ""}" data-ppar="${v}">${t}</button>`).join("")}</div>
      </section>
      <section>
        <h4>模擬節日</h4>
        <div class="chip-row">${[["auto", "跟日期"]].concat(N.festivals.filter(f => f.when).map(f => [f.id, f.icon + f.name])).map(([v, t]) => `<button type="button" class="chip ${(p.fest || "auto") === v ? "on" : ""}" data-pfest="${v}">${esc(t)}</button>`).join("")}</div>
      </section>
      </details>` : ""}
      <section>
        <h4>進度與備份</h4>
        <div class="note"><p>進度自動存在這台裝置的瀏覽器（localStorage），不會跨裝置同步。${storageOK ? "" : "<br><b style='color:var(--rust)'>⚠ 目前無法寫入儲存空間，關掉後進度可能遺失。</b>"}</p></div>
        <div class="sheet-actions"><button type="button" class="btn soft" id="exportBtn">複製備份</button><button type="button" class="btn soft" id="importBtn">貼上還原</button></div>
        <div id="ioArea"></div>
        ${store.mode === "preview" ? `<button type="button" class="btn danger block" id="resetPreview" style="margin-top:12px">清除小鎮時間的進度</button>` : ""}
      </section>
      <details class="set-more" data-k="iph" ${setOpen.iph ? "open" : ""}>
        <summary>📲 加入 iPhone 主畫面</summary>
        <div class="note">${standalone ? "<p>✅ 目前已經是主畫面 App 模式。</p>" : ""}
          <p>1. 用 <b>Safari</b> 開啟這個小鎮的網址。<br>2. 點下方的「分享」按鈕。<br>3. 選「加入主畫面」，再按「新增」。</p>
          <p>之後從主畫面圖示開啟，就會像一般 App 一樣全螢幕顯示。注意：iPhone 會把主畫面 App 和 Safari 的進度分開保存。</p></div>
      </details>
      <p class="note" style="text-align:center;margin-top:18px">諾文小鎮 v${VERSION}・事件 ${E.allEvents().length} 則</p>
      <div class="sheet-actions"><button type="button" class="btn primary" data-close>完成</button></div>`;
    $("#sheetBody").querySelectorAll("details[data-k]").forEach(d => d.addEventListener("toggle", () => { setOpen[d.dataset.k] = d.open; }));
  }
  function renderProvisional() {
    sheetState = { type: "prov" };
    const rows = N.characters.map(x => {
      const home = N.schedules[x.id].home;
      return `<dt>${esc(x.id)}</dt><dd>${esc(locName(home))}</dd>`;
    }).join("");
    $("#sheetBody").innerHTML = `<h3>住處與暫定設定</h3>
      
      <section><h4>休息的地方</h4><dl class="kv">${rows}</dl></section>
      <section><h4>其他暫定</h4><div class="note">
        <p>・史威特暫住偵探社二樓休息室；白與佐代同住。</p>
        <p>・禮採用大學生版本，和佐代同在沙布堤亞大學。星星的國中先放在「城東學區」，校名未定。</p>
        <p>・Hale’s Oven 週一公休，海爾那天去維塔採買。</p>
        <p>・癇癪與ミニクイ住在佩洛，偶爾搭車到諾文。</p>
        <p>・天氣依日期自動決定（雨、霧會解鎖少數相遇）。</p>
        <p>・每位居民的作息依平日／週末不同，少數行程隔週不同。</p></div></section>
      <div class="sheet-actions"><button type="button" class="btn soft" id="backSettings">返回設定</button></div>`;
    $("#sheet").scrollTop = 0;
  }
  // delta：預覽時間往前（或往後）推了幾分鐘；用來讓「待多久」照遊戲時間計算
  function setPreview(dow, min, delta) {
    const cur = clockNow();
    store.preview.abs0 = cur.abs + (delta || 0);
    min = ((min % 1440) + 1440) % 1440;
    store.preview.dow = ((dow % 7) + 7) % 7;
    store.preview.min = min;
    store.preview.anchor = Date.now();
    save(true);
  }
  /* 小鎮時間的流速：1×／5×／20×／暫停 */
  function setSpeed(sp) {
    let switched = false;
    if (store.mode !== "preview") {
      store.mode = "preview"; switched = true;
      const sl = slot(); if (sl.observing && !sl.encounter) sl.nextRollAt = Date.now() + waitMs(true);
      if (store.preview.speed == null) {
        const t = taipeiParts(), c0 = clockNow();
        setPreview(t.dow, t.min, ((t.dow - c0.dow + 7) % 7) * 1440 + (t.min - c0.min));
      }
    }
    const c = clockNow();
    setPreview(c.dow, c.min, 0);
    if (sp === 0) store.preview.paused = true;
    else { store.preview.paused = false; store.preview.speed = sp; }
    save(true);
    renderTop(clockNow());
    updateSpeedUI();
    if (switched) toast("已切換到「小鎮時間」：進度和台灣時間分開保存");
  }
  function speedLabel() {
    if (store.mode !== "preview") return "";
    const p = store.preview;
    return p.paused ? " ⏸" : (p.speed || 1) > 1 ? ` ⏩${p.speed}×` : "";
  }
  function updateSpeedUI() {
    document.querySelectorAll("[data-speed]").forEach(b => {
      const v = +b.dataset.speed, p = store.preview;
      const on = store.mode === "preview" && (v === 0 ? !!p.paused : !p.paused && (p.speed || 1) === v);
      b.classList.toggle("on", on);
    });
  }
  function afterSettingChange() {
    renderSettings();
    render();
  }

  /* ═════════ 事件綁定 ═════════ */
  document.addEventListener("click", ev => {
    if (watching && ev.target.closest("#watchLayer")) return exitWatch();
    const t = ev.target.closest("button, [data-close]");
    if (!t) { if (ev.target.id === "sheetBackdrop") closeSheet(); return; }
    if (t.tagName === "BUTTON" && !t.disabled && N.sfx) N.sfx.play("tap");
    const d = t.dataset;
    if (d.nav) return nav(d.nav);
    if (d.region) { store.ui.region = d.region; save(); return render(); }
    if (d.page !== undefined && t.closest(".page-tabs")) { store.ui.page[store.ui.region] = +d.page; save(); return render(); }
    if (d.loc) return openLocation(d.loc);
    if (d.observe) { closeSheet(); return startObserve(d.observe); }
    if (d.close !== undefined) return closeSheet();
    if (t.id === "obsPill") return nav("observe");
    if (t.id === "encYes") { const s = slot(); if (s.encounter) { s.encounter.pending = false; s.encounter.startedAt = Date.now(); save(true); render(); } return; }
    if (t.id === "encNo") return skipEncounter(false);
    if (t.id === "nextBtn") return nextLine();
    if (t.id === "contBtn") return continueObserve();
    if (t.id === "stopBtn") return stopObserve();
    if (t.id === "profileBtn") { profileOpen = !profileOpen; return render(); }
    if (t.id === "tlToggle") { tlOpen = !tlOpen; return render(); }
    if (t.id === "assignBtn") return openAssign();
    if (t.id === "interactBtn") return openInteract();
    if (t.id === "phoneBtn") return openPhone();
    if (t.id === "ctlBtn") return ctlStart(slot().observing);
    if (d.ctlstart) { hideCard3d(); return ctlStart(d.ctlstart); }
    if (t.id === "relBtn") return openRel();
    if (t.id === "graphBtn") { sheetState.graph = !sheetState.graph; renderRel(); return; }
    if (t.id === "partyBtn") return openParty();
    if (t.id === "bellBtn" || t.id === "newsBanner") { const b = $("#newsBanner"); if (b) b.hidden = true; return openNews(); }
    if (d.fest) { sheetState.fest = d.fest; sheetState.loc = null; sheetState.guests = []; return renderParty(); }
    if (d.ploc) { sheetState.loc = d.ploc; return renderParty(); }
    if (d.guest) { const g = sheetState.guests, i = g.indexOf(d.guest); if (i >= 0) g.splice(i, 1); else if (g.length < 16) g.push(d.guest); return renderParty(); }
    if (t.id === "guestAll") { const w = currentWhere(clockNow()); sheetState.guests = N.characters.filter(x => w[x.id].avail).map(x => x.id).slice(0, 16); return renderParty(); }
    if (t.id === "guestNone") { sheetState.guests = []; return renderParty(); }
    if (t.id === "partyBack") { sheetState.fest = null; return renderParty(); }
    if (t.id === "partyGo") return startParty();
    if (t.id === "outingBtn") return renderOutingPick();
    if (t.id === "outingBack") return renderInteract();
    if (t.id === "datePickBtn") { $("#sheetBody").innerHTML = `<h3>📍 ${esc(sheetState.who)}約${esc(sheetState.target)}去哪裡？</h3><div class="chip-row">${N.dateSpots.map(sp => `<button type="button" class="chip loc-chip" data-datespot="${esc(sp.loc)}">${sp.icon} ${esc(sp.label)}</button>`).join("")}</div><div class="sheet-actions"><button type="button" class="btn soft" id="outingBack">返回</button></div>`; return; }
    if (d.datespot && !t.closest("#ctl")) { const a = sheetState.who, b = sheetState.target; closeSheet(); return doDateSpot(a, b, d.datespot); }
    if (d.outing) return startOuting(d.outing);
    if (d.route) {
      const a = sheetState.who, b = d.route, r = Object.assign({}, getRel(a, b));
      r.route = !r.route; if (!r.route) r.pts = Math.min(r.pts, 84);
      setRel(a, b, r); save(true); renderRel(); return toast(r.route ? `已開啟 ${a} ↔ ${b} 的戀愛線` : "已關閉戀愛線");
    }
    if (d.endlove) {
      const a = sheetState.who, b = d.endlove;
      return confirmSheet("結束戀愛線？", `${a}和${b}會回到朋友關係（好感最多保留到 84）。`, "結束", () => {
        const r = Object.assign({}, getRel(a, b)); r.route = false; r.status = ""; r.pts = Math.min(r.pts, 84);
        setRel(a, b, r); save(true); render(); toast("已結束戀愛線");
      });
    }
    if (d.dur) { sheetState.dur = +d.dur; return renderAssign(); }
    if (d.assignloc) return doAssign(d.assignloc);
    if (t.id === "unassign") { delete slot().assign[sheetState.who]; save(true); closeSheet(); render(); return toast("已取消指派，回到原本的行程"); }
    if (d.target !== undefined && sheetState && sheetState.type === "interact") { sheetState.target = d.target || null; return renderInteract(); }
    if (d.act) return doInteract(d.act);
    if (d.chat) { sheetState.chat = d.chat; sheetState.pick = false; renderPhone(); return; }
    if (t.id === "phoneBack") { if (sheetState.chat) sheetState.chat = null; else sheetState.pick = false; sheetState.typing = false; renderPhone(); $("#sheet").scrollTop = 0; return; }
    if (t.id === "phoneNew") { sheetState.pick = true; renderPhone(); $("#sheet").scrollTop = 0; return; }
    if (d.send) return phoneSend(d.send);
    if (t.id === "settingsBtn" || t.id === "clockChip") return openSettings();
    if (d.speed !== undefined) { setSpeed(+d.speed); if (sheetState && sheetState.type === "settings") renderSettings(); return; }
    if (t.id === "plus1h") { if (store.mode !== "preview") setSpeed(store.preview.speed || 1); const c = clockNow(); const m = c.min + 60; setPreview(c.dow + Math.floor(m / 1440), m, 60); lastMinute = -1; tick(); return toast("小鎮時間 +1 小時"); }
    if (d.view3d !== undefined) { document.body.classList.remove("t3d-full"); const on = d.view3d === "1"; if (isPhone()) store.ui.town3dPhone = on; else store.ui.town3d = on; save(); if (!on && N.town3d) N.town3d.unmount(); return render(); }
    if (d.fly) { if (N.town3d) N.town3d.flyRegion(d.fly); store.ui.region = d.fly; return; }
    if (t.id === "t3dFull") { const on = document.body.classList.toggle("t3d-full"); t.setAttribute("aria-pressed", on); t.textContent = on ? "✕" : "⛶"; t.setAttribute("aria-label", on ? "離開全螢幕" : "全螢幕看小鎮"); return; }
    if (t.id === "t3dMore") { const tools = t.closest(".t3d-tools"), on = tools.classList.toggle("open"); t.setAttribute("aria-expanded", on); return; }
    if (t.id === "t3dUnfollow") { N.town3d.unfollow(); $("#t3dFollowChip").hidden = true; return; }
    if (t.id === "t3dHome") { N.town3d.home(); hideCard3d(); return; }
    if (d.rot3d) { N.town3d.rotate(+d.rot3d * Math.PI / 4); return; }
    if (t.id === "t3dLabels") { store.ui.labels3d = store.ui.labels3d === false; N.town3d.setLabels(store.ui.labels3d !== false); t.classList.toggle("on", store.ui.labels3d !== false); save(); return; }
    if (t.id === "t3dWatch") return enterWatch();
    if (t.id === "musicBtn") { const on = N.lofi.toggle(); store.ui.music = !!on; save(); updateMusicBtn(); updateRadio(); const cu = N.lofi.current && N.lofi.current(); return toast(on ? "🎵 " + (cu ? cu.name : "lofi 播放中") : "音樂已關閉"); }
    if (t.closest && (t.id === "radioPlay" || t.id === "radioNext" || t.id === "radioShuffle" || t.id === "radioList" || t.dataset.track || t.dataset.musicmode || t.dataset.musictool) && musicClick(t)) return;
    if (t.id === "t3dFollow") { const id = slot().observing || card3d; if (id) { N.town3d.focus(id, true); toast("鏡頭跟著" + id); } else toast("先點一位居民，或開始觀察某人"); return; }
    if (d.follow3d) { N.town3d.focus(d.follow3d, true); return; }
    if (d.cardloc) { hideCard3d(); return openLocation(d.cardloc); }
    if (t.id === "card3dClose") return hideCard3d();
    if (d.focus && N.life) { const f = N.life.focusOf(clockNow()); return toast(`${f.icon} ${f.name}：${f.desc}`); }
    if (d.logtab) { store.ui.logTab = d.logtab; save(); return render(); }
    if (d.who !== undefined) { logFilter.who = d.who || null; logFilter.limit = 40; return renderMine(); }
    if (d.dexwho !== undefined) { logFilter.dexWho = d.dexwho || null; logFilter.dexLimit = 60; return renderDex(); }
    if (d.logk) { openLog[d.logk] = !openLog[d.logk]; return renderMine(); }
    if (t.id === "moreLog") { logFilter.limit += 40; return renderMine(); }
    if (t.id === "moreDex") { logFilter.dexLimit += 60; return renderDex(); }
    if (t.id === "confirmOk" && sheetState && sheetState.onOk) { const f = sheetState.onOk; closeSheet(); return f(); }
    // 設定
    if (d.mode) {
      if (d.mode === "preview" && store.preview.speed == null) { setSpeed(1); return afterSettingChange(); }
      if (store.mode !== d.mode) {
        store.mode = d.mode;
        const s = slot();
        if (s.observing && !s.encounter) s.nextRollAt = Date.now() + waitMs(true);
        if (view === "observe" && !s.observing) view = "residents";
        save(true);
      }
      return afterSettingChange();
    }
    if (d.pdow !== undefined) { const c = clockNow(); setPreview(+d.pdow, c.min, ((+d.pdow - c.dow + 7) % 7) * 1440); return afterSettingChange(); }
    if (d.pshift) { const c = clockNow(); const m = c.min + (+d.pshift); setPreview(c.dow + Math.floor(m / 1440), m, +d.pshift); return afterSettingChange(); }
    if (d.pset) { const c = clockNow(); const tm = E.toMin(d.pset); setPreview(c.dow + (tm < c.min ? 1 : 0), tm, (tm - c.min + 1440) % 1440); return afterSettingChange(); }
    if (d.pwx) { store.preview.weather = d.pwx; save(true); return afterSettingChange(); }
    if (d.pfest) { store.preview.fest = d.pfest; save(true); return afterSettingChange(); }
    if (d.ppar) { store.preview.parity = d.ppar; save(true); return afterSettingChange(); }
    if (t.id === "resetPreview") {
      return confirmSheet("清除小鎮時間的進度？", "只會清除「小鎮時間」的觀察與日誌，台灣時間的紀錄不受影響。", "清除", () => {
        store.slots.preview = freshSlot(); save(true); render(); toast("已清除小鎮時間的進度");
      });
    }
    if (t.id === "exportBtn") {
      const data = JSON.stringify(store);
      const done = () => toast("已複製備份文字");
      const fallback = () => {
        $("#ioArea").innerHTML = `<p class="note" style="margin-top:10px">無法自動複製，請長按下方文字全選後複製：</p><textarea class="import" readonly>${esc(data)}</textarea>`;
      };
      try { navigator.clipboard.writeText(data).then(done, fallback); } catch (e) { fallback(); }
      return;
    }
    if (t.id === "importBtn") {
      $("#ioArea").innerHTML = `<p class="note" style="margin-top:10px">把之前複製的備份文字貼在這裡：</p><textarea class="import" id="importText" placeholder='{"schema":1, ...}'></textarea>
        <button type="button" class="btn primary block" id="importGo" style="margin-top:8px">還原這份備份</button>`;
      return;
    }
    if (t.id === "importGo") {
      let parsed;
      try { parsed = JSON.parse($("#importText").value); } catch (e) { return toast("這段文字不是有效的備份"); }
      return confirmSheet("還原備份？", "目前這台裝置上的進度會被備份內容取代。", "還原", () => {
        try { localStorage.setItem(KEY + "-before-import", JSON.stringify(store)); } catch (e) { /* ignore */ }
        store = migrate(parsed); save(true); view = store.ui.view || "town"; render(); toast("已還原");
      });
    }
    if (t.id === "provBtn") return renderProvisional();
    if (d.pace) { store.pace = d.pace; save(true); return renderSettings(); }
    if (d.theme) { store.ui.theme = d.theme; save(true); applyTheme(); return renderSettings(); }
    if (d.quality) { try { localStorage.setItem("novum-quality", d.quality); } catch (e) { } save(true); return location.reload(); }
    if (t.id === "needsToggle") { store.needs = store.needs === false; save(true); render(); return renderSettings(); }
    if (t.id === "sfxBtn") { store.ui.sfx = store.ui.sfx === false; if (N.sfx) { N.sfx.setOn(store.ui.sfx); sfx("toggle"); } save(); return renderSettings(); }
    if (t.id === "musicBtn2") { const on = N.lofi.toggle(); store.ui.music = !!on; save(); updateMusicBtn(); return renderSettings(); }
    if (t.id === "bondToggle") { store.bond = store.bond === false; save(true); return renderSettings(); }
    if (t.id === "backSettings") { sheetState = { type: "settings" }; renderSettings(); $("#sheet").scrollTop = 0; return; }
  });
  document.addEventListener("input", ev => {
    if (ev.target.id === "sfxVol") { const v = ev.target.value / 100; store.ui.sfxVol = v; if (N.sfx) { N.sfx.setVolume(v); sfx("tap"); } save(); return; }
    if (ev.target.id === "musicVol") { const v = ev.target.value / 100; store.ui.musicVol = v; N.lofi.setVolume(v); save(); return; }
    if (ev.target.id === "logSearch") {
      logFilter.q = ev.target.value; logFilter.limit = 40;
      const pos = ev.target.selectionStart;
      renderMine();
      const inp = $("#logSearch"); inp.focus(); try { inp.setSelectionRange(pos, pos); } catch (e) { /* ignore */ }
    }
  });
  document.addEventListener("keydown", ev => {
    if (ev.key === "Escape" && !$("#sheet").hidden) closeSheet();
  });

  /* ═════════ 時間流動 ═════════ */
  let lastMinute = -1, lastCardMin = -1;
  /* ═════════ 生活層：每半小時一步，回來時補算離開的時間 ═════════ */
  function lifeSync(c) {
    if (!N.life) return;
    const res = N.life.sync(c);
    if (res && N.town3d && N.town3d.setAnomaly) { const an = N.life.anomalyAt(c); N.town3d.setAnomaly(an ? an.loc : null); }
    if (!res || !res.entries.length && res.gap < 4) return;
    const s = slot(); s.news = s.news || [];
    const RANKK = ["milestone", "love", "gather", "invite", "anomaly", "butterfly", "gossip", "item", "quiet"];
    const live = res.gap === 1, list = live ? res.entries.slice().sort((a, b) => RANKK.indexOf(a.kind) - RANKK.indexOf(b.kind)).slice(0, 3) : res.entries;
    for (const e of list) s.news.push(Object.assign({ id: e.abs.toString(36) + Math.random().toString(36).slice(2, 5), at: Date.now() - (clockNow().abs - e.abs) * 60000 }, e));
    s.news.sort((a, b) => b.at - a.at);
    if (s.news.length > 80) s.news.length = 80;
    save(); renderBell();
    if (live && list.length) { showBanner(list[0]); newsBubbles(list); }
    if (!live && store.mode === "real" && res.gap >= 2 && $("#sheet").hidden && !(s.encounter && !s.encounter.done)) {
      sheetState = { type: "away" }; $("#sheetBody").innerHTML = N.life.awayHTML(res); openSheet();
    }
  }
  /* 介面顏色：預設跟著小鎮的時間（晚上 19:00～早上 5:30 是夜晚配色） */
  const sysDark = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  function applyTheme(c) {
    const m = store.ui.theme || "town";
    const dark = m === "dark" || (m === "system" && sysDark && sysDark.matches) || (m === "town" && timeTint(c || clockNow()) === "night");
    const el = document.documentElement;
    if (el.classList.contains("dark") === dark && el.dataset.themed) return;
    el.dataset.themed = "1";
    el.classList.toggle("dark", dark);
    document.querySelectorAll('meta[name="theme-color"]').forEach(x => x.setAttribute("content", dark ? "#181B26" : "#F3EEE4"));
  }
  if (sysDark && sysDark.addEventListener) sysDark.addEventListener("change", () => applyTheme());
  /* 背景音樂：看你正在看哪裡換曲風（打開地點就換成那個地方的，小鎮畫面依區域，晚上換成夜晚的） */
  const MUSIC_ID = { "史威特偵探社": "detective", "Hale’s Oven": "hales", "諾文甜點店": "dessert", "諾文夜市": "nightmarket", "諾文地下湖": "lake",
    "梅魯塔的塔屋": "wizard", "諾文公園": "park", "諾文河岸步道": "park", "維塔・草藥市集": "park", "星星家": "spooky", "禮的家": "spooky", "諾文古籍巷": "spooky",
    "諾文轉運站": "station", "諾文舊站": "station" };
  function musicFor(c) {
    if (sheetState && sheetState.type === "loc") {
      const l = N.locations.find(x => x.id === sheetState.id);
      if (l) {
        if (MUSIC_ID[l.id]) return MUSIC_ID[l.id];
        if (l.region === "outer") return l.page === 1 ? "pero" : "outer";
        if (/大學|高中|中學|學區|圖書館|資料館|展館|研究/.test(l.name)) return "academy";
        if (l.region === "oldtown") return "oldtown";
        if (l.kind === "home") return "home";
        return "central";
      }
    }
    if (timeTint(c) === "night") return "night";
    if (view === "town") return { central: "central", academy: "academy", oldtown: "oldtown", outer: "outer" }[store.ui.region] || "town";
    return "town";
  }
  function tick() {
    const c = clockNow();
    if (N.lofi && N.lofi.setTheme) N.lofi.setTheme(musicFor(c));
    if (c.min !== lastMinute) {
      lastMinute = c.min;
      applyTheme(c);
      renderTop(c);
      if (view === "town") {
        const sig = sigFor(E.occupancy(currentWhere(c)), c);
        if (sig !== townSig) renderTown($("#view"), c);
      } else if (view === "residents") {
        const y = window.scrollY; renderResidents($("#view"), c); window.scrollTo(0, y);
      } else if (view === "observe") {
        updateObserveStatus();
      }
      if (sheetState && sheetState.type === "loc") {
        const old = sheetState.sig; renderLocationSheet(); if (old === sheetState.sig) { /* 無變化 */ }
      }
    }
    if (ctl) ctlTick();
    if (document.visibilityState === "visible") {
      updatePlans(); genNews(c); ensureDiary(c); lifeSync(c);
      if (view === "town" && use3d() && N.town3d.isReady() && $("#t3d")) {
        N.town3d.update(state3d(c));
        if (card3d && !$("#t3dCard").hidden && c.min !== lastCardMin) { lastCardMin = c.min; showCard3d(card3d); }
        ambientTick(c);
        if (watching) updateWatchClock();
      }
    }
    // 只有「正在看觀察畫面」且頁面在前景時，才會觸發新相遇
    const s = slot();
    if (s.encounter && s.encounter.pending && Date.now() - s.encounter.startedAt > 120000) skipEncounter(true);
    if (view === "observe" && document.visibilityState === "visible" && s.observing && !s.encounter && $("#sheet").hidden) {
      if (Date.now() >= s.nextRollAt) tryRoll();
    }
  }
  document.addEventListener("visibilitychange", () => {
    if (store.mode === "preview" && !store.preview.paused) {
      // 小鎮時間：App 不在前景時小鎮停住
      if (document.visibilityState !== "visible") { const c = clockNow(); setPreview(c.dow, c.min, 0); store.preview.frozen = true; save(true); }
      else if (store.preview.frozen) { store.preview.anchor = Date.now(); store.preview.frozen = false; save(true); }
    }
    if (N.town3d) N.town3d.pause(document.visibilityState !== "visible");
    if (N.lofi) N.lofi.pause(document.visibilityState !== "visible");
    if (document.visibilityState === "visible") {
      // 離線期間不補播：回來後重新開始等待
      const s = slot();
      if (s.observing && !s.encounter && s.nextRollAt < Date.now()) { s.nextRollAt = Date.now() + waitMs(true); save(); }
      lastMinute = -1;
      render();
    }
  });

  // 音樂：上次有開的話，第一次點畫面時接著播（iPhone 規定要先點一下）
  document.addEventListener("pointerdown", function once() {
    document.removeEventListener("pointerdown", once, true);
    if (store.ui.music && N.lofi && !N.lofi.isPlaying()) { N.lofi.start(); updateMusicBtn(); }
  }, true);
  if (N.life) N.life.init({ slot, save, clockNow, clockAtAbs, whereAt, currentWhere, getRel, setRel, locName, rng, pairSummary, dayKeyOf, esc, person,
    slotSeed: () => store.mode, pace: () => store.pace || "normal", BUSY, loveEligible, stageOf, baseRel, chatKeyWith, pushNews,
    addMsgs: (cid, ck, msgs) => { const s = slot(); s.phone = s.phone || {}; const L0 = s.phone[cid] = s.phone[cid] || []; msgs.forEach((m, i) => L0.push({ dow: ck.dow, min: Math.min(1439, ck.min + i), m })); if (L0.length > 120) L0.splice(0, L0.length - 120); } });
  // 啟動
  (function boot() {
    // 舊進度裡若有不符合規則的戀愛線（例如未成年角色），一律改回朋友關係
    for (const k of ["real", "preview"]) {
      const rel = store.slots[k].rel || {};
      for (const key in rel) {
        const [a, b] = key.split("|");
        if (!loveEligible(a, b)[0] && (rel[key].route || rel[key].status)) {
          rel[key].route = false; rel[key].status = ""; rel[key].pts = Math.min(rel[key].pts, 84);
        }
      }
    }
    for (const k of ["real", "preview"]) { const e = store.slots[k].encounter; if (e && e.loc === "*" && store.slots[k].observing) e.loc = currentWhere(clockNow())[store.slots[k].observing].loc; }
    save(true);
    const s = slot();
    if (s.observing && !s.encounter && s.nextRollAt < Date.now()) s.nextRollAt = Date.now() + waitMs(true);
    if (N.sfx) { N.sfx.setOn(store.ui.sfx !== false); N.sfx.setVolume(store.ui.sfxVol == null ? 0.6 : store.ui.sfxVol); }
    if (N.lofi) {
      N.lofi.setVolume(store.ui.musicVol == null ? 0.5 : store.ui.musicVol);
      if (N.lofi.restore) {
        N.lofi.restore(store.ui.musicMode || "list", store.ui.track, store.ui.shuffle !== false);
        N.lofi.onChange(() => { const cu = N.lofi.current(); store.ui.musicMode = N.lofi.mode(); store.ui.shuffle = N.lofi.shuffle(); if (cu && N.lofi.mode() === "list") store.ui.track = cu.id; save(); updateMusicBtn(); updateRadio(); if (sheetState && sheetState.type === "music") renderMusicSheet(); });
        setInterval(updateRadioProgress, 1000);
      }
    }
    if (N.splash) N.splash.progress(0.06, "讀取居民的行程……");
    applyTheme(clockNow());
    render();
    updateMusicBtn();
    setInterval(tick, 1000);
    // 沒有要蓋 3D 小鎮的話，載入頁直接收起來；要蓋的話等小鎮蓋好
    if (N.splash && !(view === "town" && use3d())) N.splash.done();
    setTimeout(() => N.splash && N.splash.done(), 20000);   // 保險：最多等 20 秒
    try { if ("serviceWorker" in navigator && /^https?:/.test(location.protocol)) {
      navigator.serviceWorker.register("sw.js").catch(() => { /* 不支援時照常運作 */ });
    } } catch (e) { /* 預覽環境不能用離線快取，照常運作 */ }
  })();
})();
