/* 諾文小鎮：小鎮的生活層
 * 離線補算、蝴蝶效應、小鎮八卦、物品流轉、紀元層異常、地點記憶、無聲互動與每日焦點。
 * 每半小時（小鎮時間）跑一步；離開期間沒跑到的步數，回來時一次補上。
 * 存在存檔槽的 slot.life。
 */
(function () {
  "use strict";
  const N = window.NOVUM = window.NOVUM || {};
  const E = () => N.engine;
  let X = null;   // app 傳進來的工具

  /* ═════════ 每日焦點 ═════════ */
  const FOCI = [
    { id: "lazy", icon: "☁️", name: "慵懶的一天", desc: "大家動作都慢半拍，安靜待在一起的時間變多了。", quiet: 1.8, gossip: 0.7, items: 0.8 },
    { id: "gossip", icon: "💭", name: "消息滿天飛", desc: "今天大家特別愛聊別人的事，消息傳得很快。", gossip: 2.2, quiet: 0.6 },
    { id: "busy", icon: "🏃", name: "忙碌的一天", desc: "每個人都在趕自己的事，借東西、還東西的人特別多。", quiet: 0.5, items: 1.8 },
    { id: "calm", icon: "🍃", name: "安靜的一天", desc: "說話的人變少，陪著彼此的人變多。", quiet: 2.2, gossip: 0.5 },
    { id: "unstable", icon: "🌀", name: "紀元層不穩", desc: "EL-7 的紀元縫隙特別薄，舊紀元的東西可能會冒出來。", anomaly: 3 },
    { id: "warm", icon: "🌤️", name: "暖洋洋的一天", desc: "適合分東西、幫忙，也適合回禮。", items: 1.6, butterfly: 1.8 },
    { id: "rain", icon: "☔", name: "雨天的悠閒", desc: "外面下著雨，大家窩在室內，傘借來借去。", quiet: 1.6, items: 1.5, onlyWx: "雨" },
    { id: "fog", icon: "🌫️", name: "霧裡的小鎮", desc: "霧把小鎮包起來，奇怪的事比平常多一點。", anomaly: 2, quiet: 1.3, onlyWx: "霧" }
  ];
  const F = (f, k) => f[k] == null ? 1 : f[k];
  function focusOf(ck) {
    const day = X.dayKeyOf(ck), r = X.rng(day + "|focus");
    const wx = FOCI.find(f => f.onlyWx === ck.weather);
    if (wx && r() < 0.55) return wx;
    const pool = FOCI.filter(f => !f.onlyWx);
    return pool[Math.floor(r() * pool.length)];
  }

  /* ═════════ 角色的口吻（八卦、異常反應） ═════════ */
  const OPEN = { "史威特": "我跟你說喔，", "沏萊爾": "……我是聽說啦，", "佐代": "有件事。", "白": "欸欸聽好了，", "玫君": "……順便說一下，",
    "黑子": "那、那個，我聽說……", "櫻子": "你知道嗎？", "何禹瀧": "欸，要不要聽八卦？", "海爾": "店裡的客人說，", "瑞特": "嘿，告訴你一件事，",
    "禮": "我記下了一件事。", "人間天使": "小道消息喔～", "星星": "我跟你講喔！", "癇癪": "哼，你一定還不知道，", "ミニクイ": "欸欸欸！", "梅魯塔": "風裡傳來一個消息，" };
  const REACT = { "史威特": "真的嗎！這可是重要情報！", "沏萊爾": "……是喔。干我什麼事。", "佐代": "……知道了。", "白": "哈！真的假的！", "玫君": "關我什麼事。",
    "黑子": "咦、咦？真的嗎……", "櫻子": "原來是這樣，謝謝你告訴我。", "何禹瀧": "噗，這個我收下了。", "海爾": "嗯哼，別到處講。", "瑞特": "有意思，再多說一點。",
    "禮": "……我記下來了。", "人間天使": "哇～好想知道後續！", "星星": "嘻嘻，真好玩。", "癇癪": "無、無聊！……然後呢？", "ミニクイ": "什麼！我怎麼都不知道！", "梅魯塔": "果然如此。" };
  const WITNESS = { "史威特": "等等，這個一定要記錄下來！", "沏萊爾": "……我什麼都沒看到。走了。", "佐代": "……時間，差了一點。", "白": "哇喔，這個我喜歡！可以收起來嗎？",
    "玫君": "……吵死了。", "黑子": "咦咦咦？那、那是什麼……", "櫻子": "好神奇……要跟大家說！", "何禹瀧": "喔？這玩意兒拆得下來嗎？", "海爾": "別靠太近。",
    "瑞特": "哈，比地下湖還精彩。", "禮": "……它們也看得到嗎。", "人間天使": "哎呀，又有東西從舊紀元漏過來了～", "星星": "嘻嘻……它在跟我打招呼。",
    "癇癪": "誰、誰在搞鬼！給我出來！", "ミニクイ": "哇啊！好奇怪！好奇怪！", "梅魯塔": "紀元層又變薄了。得記下來。" };

  /* ═════════ 物品 ═════════ */
  const ITEMS = [
    { id: "lens", icon: "🔍", name: "偵探社的放大鏡", owner: "史威特" },
    { id: "umbrella", icon: "☂️", name: "黃色摺疊傘", owner: "沏萊爾", rain: true },
    { id: "notebook", icon: "📓", name: "記時間的小筆記本", owner: "佐代" },
    { id: "jam", icon: "🍓", name: "草莓果醬", owner: "白" },
    { id: "sticks", icon: "🥁", name: "備用鼓棒", owner: "玫君" },
    { id: "wrench", icon: "🔧", name: "小扳手", owner: "黑子" },
    { id: "clip", icon: "🎀", name: "粉紅髮夾", owner: "櫻子" },
    { id: "badge", icon: "🔩", name: "手打的銀色徽章", owner: "何禹瀧" },
    { id: "recipe", icon: "📖", name: "手寫食譜", owner: "海爾" },
    { id: "float", icon: "🎣", name: "釣魚浮標", owner: "瑞特" },
    { id: "novel", icon: "📚", name: "恐怖小說", owner: "禮" },
    { id: "coupon", icon: "🍩", name: "甜甜圈兌換券", owner: "人間天使" },
    { id: "stickers", icon: "⭐", name: "星星貼紙", owner: "星星" },
    { id: "plasters", icon: "🩹", name: "急救貼布盒", owner: "癇癪" },
    { id: "ramen", icon: "🍜", name: "拉麵集點卡", owner: "ミニクイ" },
    { id: "feather", icon: "🪶", name: "貓頭鷹羽毛", owner: "梅魯塔" }
  ];
  const RELICS = [
    { icon: "🪙", name: "刻著舊年號的硬幣" }, { icon: "⌚", name: "停在三點十三分的懷錶" }, { icon: "❄️", name: "齒輪形的雪花標本" },
    { icon: "🪧", name: "寫著「營業中」的木牌" }, { icon: "✨", name: "裝著金色灰塵的小瓶子" }, { icon: "🎟️", name: "舊紀元的列車票根" }
  ];
  const GIFTS = ["一盒餅乾", "一杯熱可可", "兩顆糖", "一塊蛋糕", "一瓶果汁", "一包烤栗子"];

  /* ═════════ 紀元層異常 ═════════ */
  const ANOM = [
    "鐘聲倒著響了三下，最後一聲聽起來像是從很久以前傳來的。",
    "地面浮出一段舊紀元的石板路，踩上去會聽見蒸汽列車的汽笛聲，過了十分鐘才慢慢沉回去。",
    "所有人的影子都慢了半拍，跟著主人動的時候總是遲一點。",
    "一盞舊式煤氣燈憑空亮起，燈罩上刻著沒有人看得懂的年號。",
    "空氣裡飄起細細的金色灰塵，摸起來是溫的，一落地就不見了。",
    "附近的時鐘全部停在同一個時間：三點十三分。",
    "傳來一陣聽不懂語言的合唱，像是隔著一層厚玻璃。",
    "牆上出現一扇本來不存在的門，門把上掛著寫著「營業中」的木牌，一會兒就消失了。",
    "下起只落在這裡的雪，每一片雪花都是小小的齒輪。",
    "水窪裡倒映的不是現在的天空，而是一片綠色的極光。"
  ];
  function anomaliesOf(ck) {
    const day = X.dayKeyOf(ck), f = focusOf(ck), r = X.rng(day + "|anom");
    const spots = N.locations.filter(l => l.kind === "public");
    const out = [];
    let n = r() < 0.4 * F(f, "anomaly") ? 1 : 0;
    if (F(f, "anomaly") >= 3) n += 1;
    for (let i = 0; i < n; i++) {
      const start = 540 + Math.floor(r() * 26) * 30;
      out.push({ id: day + "|a" + i, start, end: start + 30, loc: spots[Math.floor(r() * spots.length)].id, text: ANOM[Math.floor(r() * ANOM.length)], relic: Math.floor(r() * RELICS.length) });
    }
    return out;
  }
  function anomalyAt(ck) { return anomaliesOf(ck).find(a => ck.min >= a.start && ck.min < a.end) || null; }

  /* ═════════ 存檔 ═════════ */
  function L() {
    const s = X.slot();
    if (!s.life) s.life = {};
    const l = s.life;
    l.gossip = l.gossip || []; l.places = l.places || {}; l.chains = l.chains || []; l.items = l.items || {}; l.relics = l.relics || {};
    l.couples = l.couples || []; l.notes = l.notes || {}; l.done = l.done || {};
    for (const it of ITEMS) if (!l.items[it.id]) l.items[it.id] = { holder: it.owner, hist: [] };
    return l;
  }
  const allItems = () => { const l = L(); return ITEMS.concat(Object.keys(l.relics).map(k => Object.assign({ id: k }, l.relics[k]))); };
  const itemDef = id => allItems().find(i => i.id === id);
  const short = (t, n) => t.length > (n || 18) ? t.slice(0, n || 18) + "…" : t;

  /* ── 小工具 ── */
  function stamp(ck) { return { dow: ck.dow, min: ck.min, day: X.dayKeyOf(ck), abs: ck.abs }; }
  function placeMem(loc, ck, text) {
    const l = L(), p = l.places[loc] = l.places[loc] || { v: {}, mem: [] };
    p.mem.unshift(Object.assign(stamp(ck), { text }));
    if (p.mem.length > 15) p.mem.length = 15;
  }
  function note(id, ck, text) {
    const l = L(), d = X.dayKeyOf(ck);
    l.notes[d] = l.notes[d] || {};
    if (!l.notes[d][id]) l.notes[d][id] = text;
    const keys = Object.keys(l.notes); if (keys.length > 4) delete l.notes[keys.sort()[0]];
  }
  function addGossip(text, about, knows, ck, src) {
    const l = L();
    if (l.gossip.some(g => g.text === text)) return null;
    const g = Object.assign(stamp(ck), { id: "g" + ck.abs.toString(36) + Math.floor(Math.random() * 999), text, about: about || [], knows: [...new Set(knows || [])], path: [], src: src || "" });
    l.gossip.unshift(g);
    if (l.gossip.length > 30) l.gossip.length = 30;
    return g;
  }
  function holderName(h) { return h && h[0] === "@" ? X.locName(h.slice(1)) : h; }
  function moveItem(id, to, ck, text, out, loc, cast) {
    const l = L(), st = l.items[id];
    st.holder = to;
    st.hist.unshift(Object.assign(stamp(ck), { text }));
    if (st.hist.length > 12) st.hist.length = 12;
    if (loc) placeMem(loc, ck, text);
    const d = itemDef(id);
    if (to === d.owner) { l.gossip = l.gossip.filter(g => g.text !== `${d.owner}在找${d.name}`); l.chains = l.chains.filter(c => !(c.type === "search" && c.item === id)); }
    out.push(Object.assign(stamp(ck), { kind: "item", text: `${d.icon} ${text}`, cast: cast || [], loc }));
  }
  function bump(a, b, amt, why, loc) { if (amt > 0) gain(a, b, amt, why, loc); }
  function pending(type, a, b) { return L().chains.some(c => c.type === type && c.a === a && (b == null || c.b === b)); }
  function schedule(type, dueAbs, data) {
    const l = L();
    if ((type === "thanks" || type === "search") && pending(type, data.a, data.b)) return;
    if (l.chains.length > 40) l.chains.shift();
    l.chains.push(Object.assign({ type, due: dueAbs }, data));
  }

  /* ═════════ 一步：小鎮時間的半小時 ═════════ */
  function step(ck, where, mode) {
    const out = [];
    curCk = ck; inStep = true; stepOut = out;
    try { return stepInner(ck, where, mode, out); } finally { inStep = false; stepOut = null; curCk = null; }
  }
  function stepInner(ck, where, mode, out) {
    const l = L(), f = focusOf(ck), r = X.rng(X.slotSeed() + "|life|" + ck.abs);
    const ids = N.characters.map(c => c.id);
    const avail = ids.filter(id => where[id] && where[id].avail);
    const byLoc = {};
    for (const id of avail) (byLoc[where[id].loc] = byLoc[where[id].loc] || []).push(id);
    const pairs = [];
    for (const loc in byLoc) { const g = byLoc[loc]; for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) pairs.push([g[i], g[j], loc]); }

    // 地點記憶：誰來過
    for (const id of avail) {
      const loc = where[id].loc; if (N.schedules[id] && N.schedules[id].home === loc) continue;
      const p = l.places[loc] = l.places[loc] || { v: {}, mem: [] };
      p.v[id] = (p.v[id] || 0) + 1;
    }

    // 蝴蝶效應：時間到的後續
    const due = l.chains.filter(c => c.due <= ck.abs);
    l.chains = l.chains.filter(c => c.due > ck.abs);
    for (const c of due.slice(0, 2)) runChain(c, ck, where, out, r);

    // 紀元層異常
    for (const a of anomaliesOf(ck)) {
      if (l.done[a.id] || ck.min < a.start || ck.min >= a.end) continue;
      l.done[a.id] = 1;
      const wit = (byLoc[a.loc] || []).slice(0, 3);
      placeMem(a.loc, ck, "🌀 " + a.text);
      const e = Object.assign(stamp(ck), { kind: "anomaly", text: `🌀 ${X.locName(a.loc)}：${a.text}`, cast: wit, loc: a.loc });
      if (wit.length) e.quote = `${wit[0]}：「${WITNESS[wit[0]] || "……那是什麼？"}」`;
      out.push(e);
      for (const w of wit) note(w, ck, `今天在${X.locName(a.loc)}看到怪事。${short(a.text, 16)}`);
      if (wit.length) addGossip(`${X.locName(a.loc)}出現了舊紀元的怪事，${short(a.text, 20)}`, [], wit, ck, "anomaly");
      // 隔天有人去調查
      const inv = wit.find(w => ["梅魯塔", "禮", "史威特", "佐代"].includes(w)) || ["梅魯塔", "禮", "史威特"][Math.floor(r() * 3)];
      schedule("investigate", ck.abs + 1440 - ck.min + 600 + Math.floor(r() * 12) * 30, { a: inv, loc: a.loc, relic: a.relic, aid: a.id });
    }
    const dk = Object.keys(l.done); if (dk.length > 30) dk.slice(0, dk.length - 30).forEach(k => delete l.done[k]);

    // 新的戀人，會變成八卦
    const rel = X.slot().rel || {};
    for (const k in rel) if (rel[k].status === "交往中" && !l.couples.includes(k)) {
      l.couples.push(k); const [a, b] = k.split("|");
      addGossip(`${a}和${b}好像在交往了`, [a, b], [a, b], ck, "love");
    }

    // 小鎮八卦：碰面時傳出去
    const rate = 0.3 * F(f, "gossip");
    let told = 0;
    for (const [a, b, loc] of pairs) {
      for (const [s, t] of [[a, b], [b, a]]) {
        const g = l.gossip.find(g => g.knows.includes(s) && !g.knows.includes(t) && !g.about.includes(t));
        if (!g) continue;
        const rr = X.getRel(s, t).pts;
        if (r() > rate * (0.6 + rr / 100)) continue;
        g.knows.push(t); g.path.push([s, t]);
        if (told < 1 && r() < 0.6) {
          told++;
          out.push(Object.assign(stamp(ck), { kind: "gossip", text: `💭 ${s}在${X.locName(loc)}把「${short(g.text)}」的消息告訴了${t}。`,
            quote: `${s}：「${OPEN[s] || ""}${g.text}。」`, quote2: `${t}：「${REACT[t] || "真的嗎？"}」`, cast: [s, t], loc }));
        }
        break;
      }
    }
    // 舊八卦慢慢淡掉
    l.gossip = l.gossip.filter(g => ck.abs - g.abs < 3 * 1440);

    // 無聲互動
    const qrate = 0.1 * F(f, "quiet");
    for (const [a, b, loc] of pairs) {
      if (X.getRel(a, b).pts < 50 || r() > qrate) continue;
      const t = quietText(a, b, loc, ck, r);
      bump(a, b, 1);
      placeMem(loc, ck, "🤫 " + t);
      out.push(Object.assign(stamp(ck), { kind: "quiet", text: `🤫 ${t}`, cast: [a, b], loc }));
      if (r() < 0.08) addGossip(`${a}和${b}常常安安靜靜地待在一起`, [a, b], [a], ck, "quiet");
      break;
    }

    // 物品流轉
    itemsStep(ck, where, byLoc, out, r, f);

    // 自主行動
    autoStep(ck, where, byLoc, out, r, mode);

    return out;
  }

  function quietText(a, b, loc, ck, r) {
    const pool = [
      `${a}和${b}待在${X.locName(loc)}，各做各的事，誰都沒說話，但誰也沒有先走。`,
      `${a}把一杯熱茶推到${b}手邊。${b}點了點頭，什麼也沒說。`,
      `${b}在打瞌睡，${a}看了一眼，把旁邊的聲音關小了一點。`,
      `${a}和${b}並肩看著窗外，安靜了好一陣子。`,
      `${a}幫${b}把散在桌上的東西收好，兩人一句話都沒說。`,
      `${a}遞了一顆糖給${b}，${b}接過去，回了一個小小的點頭。`
    ];
    if (ck.weather === "雨") pool.push(`雨下得很大，${a}和${b}就這樣聽了半個小時的雨。`);
    if (ck.min >= 21 * 60) pool.push(`夜深了，${a}和${b}誰也沒提要回去。`);
    return pool[Math.floor(r() * pool.length)];
  }

  function itemsStep(ck, where, byLoc, out, r, f) {
    const l = L(), rate = F(f, "items");
    const order = allItems().slice().sort(() => r() - 0.5);
    for (const d of order) {
      const st = l.items[d.id]; if (!st) continue;
      const h = st.holder;
      // 忘在某處的東西，被人撿到
      if (h[0] === "@") {
        const loc = h.slice(1), here = byLoc[loc] || [];
        if (here.length && r() < 0.35) {
          const fnd = here[Math.floor(r() * here.length)];
          moveItem(d.id, fnd, ck, fnd === d.owner ? `${fnd}在${X.locName(loc)}找回了自己的${d.name}。` : `${fnd}在${X.locName(loc)}撿到了${d.name}。`, out, loc, [fnd]);
          if (fnd !== d.owner) schedule("return", ck.abs + 60, { a: fnd, b: d.owner, item: d.id });
          return;
        }
        continue;
      }
      const w = where[h]; if (!w || !w.avail) continue;
      const comp = (byLoc[w.loc] || []).filter(o => o !== h);
      // 碰到主人就還回去
      if (h !== d.owner && comp.includes(d.owner) && r() < 0.6) {
        moveItem(d.id, d.owner, ck, `${h}把${d.name}還給了${d.owner}。`, out, w.loc, [h, d.owner]);
        bump(h, d.owner, 1);
        if (r() < 0.5 * F(f, "butterfly")) schedule("thanks", ck.abs + 120 + Math.floor(r() * 16) * 30, { a: h, b: d.owner, why: `借${d.name}給自己` });
        return;
      }
      // 借給旁邊的人
      const lendP = 0.04 * rate * (d.rain && ck.weather === "雨" ? 4 : 1);
      if (comp.length && h === d.owner && r() < lendP) {
        const to = comp[Math.floor(r() * comp.length)];
        moveItem(d.id, to, ck, d.rain && ck.weather === "雨" ? `外面下雨，${h}把${d.name}借給了${to}。` : `${h}把${d.name}借給了${to}。`, out, w.loc, [h, to]);
        schedule("return", ck.abs + 240 + Math.floor(r() * 24) * 30, { a: to, b: h, item: d.id });
        return;
      }
      // 不小心忘在外面
      const home = N.schedules[h] && N.schedules[h].home;
      if (w.loc !== home && E().locById(w.loc) && E().locById(w.loc).kind === "public" && r() < 0.004 * rate) {
        moveItem(d.id, "@" + w.loc, ck, `${h}把${d.name}忘在${X.locName(w.loc)}了。`, out, w.loc, [h]);
        note(h, ck, `${d.name}好像不見了。`);
        schedule("search", ck.abs + 120, { a: d.owner, item: d.id });
        return;
      }
    }
  }

  /* ═════════ 蝴蝶效應：後續 ═════════ */
  function runChain(c, ck, where, out, r) {
    const l = L(), loc = c.a && where[c.a] ? where[c.a].loc : null;
    if (c.type === "thanks") {
      const gift = GIFTS[Math.floor(r() * GIFTS.length)];
      const t = `${c.a}為了謝謝${c.b}上次${c.why || "幫忙"}，送了${gift}過去。`;
      bump(c.a, c.b, 2);
      out.push(Object.assign(stamp(ck), { kind: "butterfly", text: `🦋 ${t}`, cast: [c.a, c.b], loc }));
      if (loc) placeMem(loc, ck, "🦋 " + t);
      if (r() < 0.4) addGossip(`${c.a}送了${gift}給${c.b}`, [c.a, c.b], [c.a, c.b], ck, "butterfly");
    } else if (c.type === "revenge") {
      const t = `${c.a}還記著上次被${c.b}捉弄，偷偷在${c.b}的背上貼了一張紙條。`;
      out.push(Object.assign(stamp(ck), { kind: "butterfly", text: `🦋 ${t}`, cast: [c.a, c.b], loc }));
      addGossip(`${c.b}背上被貼了紙條，自己還不知道`, [c.b], [c.a], ck, "butterfly");
    } else if (c.type === "return") {
      const st = l.items[c.item], d = itemDef(c.item);
      if (!st || !d || st.holder !== c.a) return;
      const wa = where[c.a], wb = where[c.b];
      if (wa && wb && wa.loc === wb.loc && wa.avail) {
        moveItem(c.item, c.b, ck, `${c.a}把${d.name}還給了${c.b}。`, out, wa.loc, [c.a, c.b]);
        bump(c.a, c.b, 1);
        if (r() < 0.5) schedule("thanks", ck.abs + 180, { a: c.a, b: c.b, why: `借${d.name}給自己` });
      } else if (ck.abs - c.due < 2 * 1440) schedule("return", ck.abs + 60, c);   // 還沒碰到面，晚點再說
      else if (wa) moveItem(c.item, "@" + wa.loc, ck, `${c.a}一直沒碰到${c.b}，把${d.name}寄放在${X.locName(wa.loc)}。`, out, wa.loc, [c.a]);
    } else if (c.type === "search") {
      const st = l.items[c.item], d = itemDef(c.item);
      if (!st || !d || st.holder === c.a) return;
      const t = `${c.a}到處在找${d.name}，問了好幾個人。`;
      out.push(Object.assign(stamp(ck), { kind: "butterfly", text: `🦋 ${t}`, cast: [c.a], loc }));
      addGossip(`${c.a}在找${d.name}`, [], [c.a], ck, "search");
    } else if (c.type === "investigate") {
      const rel = RELICS[c.relic], id = "relic-" + c.aid.replace(/\W/g, "");
      if (l.relics[id]) return;
      l.relics[id] = { icon: rel.icon, name: rel.name, owner: c.a };
      l.items[id] = { holder: c.a, hist: [] };
      moveItem(id, c.a, ck, `${c.a}跑去${X.locName(c.loc)}調查昨天的異常，撿到了${rel.name}。`, out, c.loc, [c.a]);
      out[out.length - 1].kind = "butterfly";
      note(c.a, ck, `去${X.locName(c.loc)}調查，撿到${rel.name}。`);
      addGossip(`${c.a}從${X.locName(c.loc)}撿到了${rel.name}`, [], [c.a], ck, "relic");
    } else if (c.type === "chatSeed") {
      addGossip(`${c.a}和${c.b}最近很常聊天`, [c.a, c.b], [c.a, c.b], ck, "chat");
    }
  }

  /* 玩家的小行動，會在之後引出別的事 */
  function onAction(action, a, b) {
    const ck = X.clockNow(), r = X.rng(ck.abs + action + a + b), f = focusOf(ck), m = F(f, "butterfly");
    if (action === "food" && r() < 0.7 * m) schedule("thanks", ck.abs + 120 + Math.floor(r() * 16) * 30, { a: b, b: a, why: "分點心給自己" });
    if (action === "help" && r() < 0.7 * m) schedule("thanks", ck.abs + 90 + Math.floor(r() * 12) * 30, { a, b, why: "幫忙" });
    if (action === "tease" && r() < 0.6) schedule("revenge", ck.abs + 180 + Math.floor(r() * 20) * 30, { a: b, b: a });
    if (action === "chat" && r() < 0.5) schedule("chatSeed", ck.abs + 30, { a, b });
    X.save();
  }

  /* ═════════ 同步：每秒呼叫，半小時跑一步；落後的步數一次補上 ═════════ */
  function sync(ck) {
    const l = L(), idx = Math.floor(ck.abs / 30);
    if (l.last == null || idx < l.last) { l.last = idx; X.save(); return null; }
    if (idx === l.last) return null;
    if (ck.mode === "preview" && idx - l.last > 6) l.last = idx - 1;   // 小鎮時間被手動調過：不補算
    const gap = idx - l.last, from = Math.max(l.last + 1, idx - 96);
    const all = [], before = JSON.parse(JSON.stringify(X.slot().rel || {}));
    const used = new Set();
    for (let k = from; k <= idx; k++) {
      const pk = k === idx ? ck : X.clockAtAbs(k * 30);
      const where = k === idx ? X.currentWhere(ck) : X.whereAt(pk);
      const items = step(pk, where, k === idx ? "live" : "catch");
      // 補算期間：也補上大家碰面時的對話
      if (k < idx) {
        const r = X.rng(X.slotSeed() + "|chat|" + k);
        if (r() < 0.35) {
          const byLoc = {};
          for (const c of N.characters) { const w = where[c.id]; if (w && w.avail) (byLoc[w.loc] = byLoc[w.loc] || []).push(c.id); }
          const groups = Object.keys(byLoc).filter(x => byLoc[x].length >= 2);
          if (groups.length) {
            const loc = groups[Math.floor(r() * groups.length)], g = byLoc[loc];
            const a = g[0], b = g[1 + Math.floor(r() * (g.length - 1))];
            const sum = X.pairSummary(a, b, pk, where, used, X.slotSeed() + "|away|" + k);
            if (sum) items.push(Object.assign(stamp(pk), { kind: sum.kind === "love" ? "love" : "chat", text: `${sum.kind === "love" ? "💗" : "💬"} ${X.locName(loc)}：${sum.kind === "event" ? `〈${sum.title}〉` : ""}${sum.text}`, quote: sum.quote, cast: [a, b], loc }));
          }
        }
      }
      all.push(...items);
    }
    l.last = idx;
    X.save();
    const rel = X.slot().rel || {}, changes = [];
    for (const k in rel) { const [a, b] = k.split("|"), o = before[k] ? before[k].pts : X.baseRel(a, b); if (rel[k].pts - o >= 3) changes.push({ a, b, from: o, to: rel[k].pts, stage: X.stageOf(rel[k].pts, rel[k].status) }); }
    changes.sort((p, q) => (q.to - q.from) - (p.to - p.from));
    return { entries: all, gap, mins: gap * 30, changes };
  }

  /* ═════════ 畫面 ═════════ */
  const when = e => `週${E().WEEK[e.dow]} ${E().fmtMin(e.min)}`;
  function entryHTML(e) {
    return `<li class="life-row"><span class="life-t">${when(e)}</span><span class="life-x">${X.esc(e.text)}</span>${e.quote ? `<span class="life-q">${X.esc(e.quote)}</span>` : ""}${e.quote2 ? `<span class="life-q">${X.esc(e.quote2)}</span>` : ""}</li>`;
  }
  function awayHTML(res) {
    const h = Math.floor(res.mins / 60), m = res.mins % 60;
    const order = ["milestone", "love", "gather", "invite", "anomaly", "chat", "gossip", "butterfly", "quiet", "item"], cap = { milestone: 6, love: 3, gather: 4, invite: 2, anomaly: 2, chat: 3, gossip: 2, butterfly: 2, quiet: 2, item: 2 };
    const pick = [];
    for (const k of order) { if (pick.length >= 18) break; pick.push(...res.entries.filter(e => e.kind === k || (k === "chat" && e.kind === "event")).slice(-cap[k]).slice(0, 18 - pick.length)); }
    const list = pick.sort((a, b) => a.abs - b.abs);
    return `<h3>你不在的時候</h3><p class="sheet-desc">離開了 ${h ? h + " 小時" : ""}${m ? m + " 分鐘" : ""}，這段時間小鎮照常過著。</p>
      ${res.changes && res.changes.length ? `<div class="life-place"><div class="life-h">💗 這段時間變熟的人</div>${res.changes.slice(0, 8).map(c => `<div class="life-chg">${X.person(c.a, 20)}${X.esc(c.a)} ↔ ${X.person(c.b, 20)}${X.esc(c.b)}<span>${c.from} → ${c.to}・${X.esc(c.stage)}</span></div>`).join("")}</div>` : ""}
      ${list.length ? `<ul class="life-list" style="margin-top:10px">${list.map(entryHTML).join("")}</ul>` : `<div class="empty">大家都過著平常的日子，沒什麼特別的事。</div>`}
      <div class="sheet-actions"><button type="button" class="btn primary" data-close>知道了</button></div>`;
  }
  function focusHTML(ck) {
    const f = focusOf(ck);
    return `<button type="button" class="focus-pill" data-focus="1">${f.icon} 今天：${X.esc(f.name)}</button>`;
  }
  function placeHTML(loc) {
    const l = L(), p = l.places[loc], ck = X.clockNow();
    const lying = allItems().filter(d => l.items[d.id] && l.items[d.id].holder === "@" + loc);
    const an = anomalyAt(ck);
    let h = "";
    if (an && an.loc === loc) h += `<div class="life-anom">🌀 現在這裡：${X.esc(an.text)}</div>`;
    if (lying.length) h += `<div class="life-lost">🎁 有人忘在這裡：${lying.map(d => `${d.icon}${X.esc(d.name)}`).join("、")}</div>`;
    if (!p) return h ? `<div class="life-place">${h}</div>` : "";
    const top = Object.keys(p.v).sort((a, b) => p.v[b] - p.v[a]).slice(0, 5);
    if (top.length) h += `<div class="life-sub">常來的人</div><div class="life-regs">${top.map(id => `<span class="life-reg">${X.person(id, 22)}<small>${Math.max(1, Math.round(p.v[id] / 2))} 小時</small></span>`).join("")}</div>`;
    if (p.mem.length) h += `<div class="life-sub">這裡發生過</div><ul class="life-list">${p.mem.slice(0, 6).map(entryHTML).join("")}</ul>`;
    return `<div class="life-place"><div class="life-h">📜 這裡的記憶</div>${h}</div>`;
  }
  function gossipHTML() {
    const l = L(), ck = X.clockNow(), f = focusOf(ck);
    if (!l.gossip.length) return `<div class="empty" style="margin-top:14px">還沒有什麼消息在傳。大家碰面聊天之後，就會有八卦慢慢傳開。</div>`;
    return `<p class="life-tip">${f.icon} 今天是「${X.esc(f.name)}」。${X.esc(f.desc)}</p>
      <ul class="gossip-list">${l.gossip.map(g => `<li class="gossip">
        <div class="g-text">${X.esc(g.text)}</div>
        <div class="g-meta">${when(g)}起　已經有 ${g.knows.length} 個人知道</div>
        <div class="g-who">${g.knows.map(id => X.person(id, 20)).join("")}</div>
        ${g.path.length ? `<div class="g-path">${g.path.slice(-4).map(([a, b]) => `${X.esc(a)} → ${X.esc(b)}`).join("　")}</div>` : ""}
      </li>`).join("")}</ul>`;
  }
  function itemsHTML() {
    const l = L();
    return `<p class="life-tip">小東西會在大家之間借來借去、忘在哪裡、被誰撿到。點開看看它們經歷過什麼。</p>
      <ul class="item-list">${allItems().map(d => { const st = l.items[d.id]; if (!st) return ""; const h = st.holder, away = h[0] === "@";
        return `<li class="item"><details><summary><span class="i-ic">${d.icon}</span><span class="i-n">${X.esc(d.name)}<small>${X.esc(d.owner)}的</small></span>
          <span class="i-h">${away ? "📍 " + X.esc(holderName(h)) : (h === d.owner ? "在主人身上" : X.person(h, 20) + " " + X.esc(h) + "手上")}</span></summary>
          ${st.hist.length ? `<ul class="life-list">${st.hist.map(entryHTML).join("")}</ul>` : `<div class="i-empty">一直待在${X.esc(d.owner)}身邊。</div>`}</details></li>`; }).join("")}</ul>`;
  }
  function carryHTML(id) {
    const l = L(), list = allItems().filter(d => l.items[d.id] && l.items[d.id].holder === id && d.owner !== id);
    return list.length ? `<div class="life-carry">身上帶著別人的：${list.map(d => `${d.icon}${X.esc(d.name)}（${X.esc(d.owner)}的）`).join("、")}</div>` : "";
  }
  function diaryNote(id, ck) { const l = L(), d = l.notes[X.dayKeyOf(ck)]; return d && d[id] || ""; }
  function quietBubbles(a, b) {
    const pick = arr => arr[Math.floor(Math.random() * arr.length)];
    return [[a, pick(["……", "🍵", "📖", "🎧", "（點頭）"])], [b, pick(["……", "（點頭）", "☕", "（打了個呵欠）", "嗯。"])]];
  }
  function quietChance(ck) { return 0.16 * F(focusOf(ck), "quiet"); }


  /* ═════════ 自主性：自己聚會、自己約人、改行程、小圈子、關係里程碑 ═════════ */
  const PACE = { slow: 0.7, normal: 1.8, fast: 3.2 };
  const pace = () => PACE[X.pace()] || 1.4;
  const isCP = (a, b) => (N.cpPairs || []).some(k => k === a + "|" + b || k === b + "|" + a);
  const HANG = ["Hale’s Oven", "諾文鐘塔廣場", "諾文甜點店", "諾文公園", "諾文夜市", "諾文聯邦圖書館", "諾文舊街", "諾文混合書街", "諾文舊物市場", "諾文河岸步道", "諾文服飾街", "諾文機械市集", "諾文立體街廊", "史威特偵探社"];
  const FAV = { "史威特": "史威特偵探社", "沏萊爾": "諾文聯邦圖書館", "佐代": "諾文鐘塔廣場", "白": "諾文舊物市場", "玫君": "諾文立體街廊", "黑子": "諾文機械市集",
    "櫻子": "諾文服飾街", "何禹瀧": "諾文機械市集", "海爾": "Hale’s Oven", "瑞特": "諾文地下湖", "禮": "諾文混合書街", "人間天使": "諾文甜點店", "星星": "諾文古籍巷",
    "癇癪": "諾文夜市", "ミニクイ": "諾文夜市", "梅魯塔": "諾文聯邦圖書館" };
  const TOPIC = { "史威特": ["偵探社最近接的委託", "下一次的調查計畫"], "沏萊爾": ["史威特那套漏洞百出的推理", "期末報告"], "佐代": ["時間差了幾秒這種小事", "最近看見的奇怪細節"],
    "白": ["下一個惡作劇", "從別的維度撿回來的東西"], "玫君": ["樂團的新曲", "鼓棒又斷了一根"], "黑子": ["剛修好的機器", "想做的小發明"],
    "櫻子": ["學校的活動", "新開的服飾店"], "何禹瀧": ["最新的金工作品", "誰最近出糗"], "海爾": ["店裡的新菜單", "今天哪個客人很難搞"],
    "瑞特": ["地下湖的大魚", "下次要去哪裡冒險"], "禮": ["正在讀的恐怖小說", "新收的標本"], "人間天使": ["甜點店的新口味", "最近聽到的八卦"],
    "星星": ["一本奇怪的書", "昨晚做的夢"], "癇癪": ["佩洛那邊的事", "某個不會照顧自己的人"], "ミニクイ": ["哪家拉麵最好吃", "夜市的新攤位"], "梅魯塔": ["魔法課上的學生", "貓頭鷹最近的脾氣"] };
  const INVITE = {
    "史威特": ["{b}，{t}要不要一起去{loc}？我請客！", "好呀！我會準時到的～"], "沏萊爾": ["{t}我會在{loc}。你要來就來。", "……知道了。別遲到。"],
    "佐代": ["{t}，{loc}。", "好。"], "白": ["{t}去{loc}玩！不准拒絕～", "好欸！到時候突然出現嚇你！"], "玫君": ["{t} {loc} 來不來", "嗯"],
    "黑子": ["那、那個……{t}可以一起去{loc}嗎？", "好、好的！我會去！"], "櫻子": ["{t}要不要一起去{loc}呀？", "好呀，到時候見！"],
    "何禹瀧": ["喂，{t}{loc}，敢不來你試試看。", "行啊，誰怕誰。"], "海爾": ["{t}來{loc}一趟，有東西給你試吃。", "好，我會過去。"],
    "瑞特": ["{t}在{loc}，來不來？保證有趣。", "哈，算我一份。"], "禮": ["{t}要一起去{loc}嗎？不勉強。", "好，我會去的。"],
    "人間天使": ["{t}在{loc}見～記得帶甜甜圈！", "好喔～"], "星星": ["{t}來{loc}嘛，嘻嘻。", "嘻嘻，好呀。"], "癇癪": ["{t}給我到{loc}來！……有話跟你說。", "哼，去就去。"],
    "ミニクイ": ["欸欸！{t}去{loc}好不好！", "好耶！！"], "梅魯塔": ["{t}，在{loc}碰個面吧。", "好，我會到。"] };
  const DECLINE = { "玫君": "沒空", "佐代": "不行。", "沏萊爾": "那個時間有事。下次。", "何禹瀧": "沒空啦，下次再陪你玩。", "癇癪": "今、今天不行！" };
  const RANK = ["認識", "熟人", "朋友", "好友", "很在意", "戀人"];
  let inStep = false, ctxWhy = "", ctxLoc = null, curCk = null, stepOut = null;

  function A() {
    const l = L();
    l.plans = l.plans || []; l.circles = l.circles || []; l.together = l.together || {}; l.miles = l.miles || [];
    if (!l.cpInit) {
      l.cpInit = 1;
      for (const k of N.cpPairs || []) { const [a, b] = k.split("|"); if (!X.loveEligible(a, b)[0]) continue; const r = Object.assign({}, X.getRel(a, b)); if (!r.route) { r.route = true; X.setRel(a, b, r); } }
    }
    return l;
  }
  // 讓好感往上加，順便記下原因與地點（里程碑會用到）
  function gain(a, b, amt, why, loc) {
    const r = Object.assign({}, X.getRel(a, b));
    const cap = r.route || r.status ? 100 : 84;
    const n = Math.max(1, Math.round(amt));
    if (r.pts >= cap) return 0;
    ctxWhy = why || ""; ctxLoc = loc || null;
    r.pts = Math.min(cap, r.pts + n); X.setRel(a, b, r);
    ctxWhy = ""; ctxLoc = null;
    return n;
  }
  // app 的 setRel 每次都會通知這裡：關係升級就留下里程碑
  function relChanged(a, b, o, n) {
    if (!X) return;
    const s0 = X.stageOf(o.pts, o.status), s1 = X.stageOf(n.pts, n.status);
    if (RANK.indexOf(s1) <= RANK.indexOf(s0)) return;
    const l = A(), ck = curCk || X.clockNow();
    const loc = ctxLoc || (X.currentWhere(ck)[a] || {}).loc;
    const why = ctxWhy || (s1 === "戀人" ? "終於說出口了" : "相處的時間越來越多");
    const m = Object.assign(stamp(ck), { a, b, label: s1, why, loc });
    l.miles.unshift(m); if (l.miles.length > 60) l.miles.length = 60;
    const e = Object.assign(stamp(ck), { kind: "milestone", text: `🎖️ ${a}和${b}變成「${s1}」了。`, quote: `${loc && why.indexOf(X.locName(loc)) < 0 ? "在" + X.locName(loc) + "，" : ""}${why}。`, cast: [a, b], loc });
    if (inStep && stepOut) stepOut.push(e);
    else X.pushNews({ kind: "milestone", text: e.text, cast: e.cast, loc: e.loc });
  }

  /* 行程覆蓋：約好的時間地點、小圈子的固定聚會 */
  function plansAt(ck) {
    const l = A(), out = {};
    for (const p of l.plans) if (ck.abs >= p.start && ck.abs < p.end) for (const id of p.members) if (!out[id]) out[id] = { loc: p.loc, act: p.acts[id] || p.act, until: Date.now() + 1e9, plan: true };
    return out;
  }
  const whenLabel = abs => { const ck = X.clockAtAbs(abs); return `${ck.abs - X.clockNow().abs < 1440 && ck.dow === X.clockNow().dow ? "" : "週" + E().WEEK[ck.dow]}${E().fmtMin(ck.min)}`; };
  const names = ids => ids.length <= 2 ? ids.join("和") : ids.slice(0, -1).join("、") + "和" + ids[ids.length - 1];
  const pk = (a, b) => [a, b].sort().join("|");

  function autoStep(ck, where, byLoc, out, r, mode) {
    const l = A(), P = pace(), BUSY = X.BUSY;
    {
      // 過期的約定清掉；剛開始的約定：碰面
      l.plans = l.plans.filter(p => p.end > ck.abs);
      for (const p of l.plans) if (!p.met && ck.abs >= p.start) {
        p.met = 1;
        const here = p.members.filter(id => where[id] && where[id].loc === p.loc && where[id].avail);
        if (here.length < 2) continue;
        for (let i = 0; i < here.length; i++) for (let j = i + 1; j < here.length; j++) gain(here[i], here[j], 2 * P, p.circle ? `「${p.circle}」的固定聚會` : "照約定碰面", p.loc);
        out.push(Object.assign(stamp(ck), { kind: "gather", text: p.circle ? `👥 「${p.circle}」的大家在${X.locName(p.loc)}聚齊了：${names(here)}。` : `🤝 ${names(here)}照約定在${X.locName(p.loc)}碰面了${p.date ? "，今天是約會" : ""}。`, cast: here, loc: p.loc }));
      }

      // 自主聚會：同一個地方的人自己聚在一起聊開了（只寫摘要）
      const groups = Object.keys(byLoc).map(loc => ({ loc, ids: byLoc[loc] })).filter(g => g.ids.length >= 2 && E().locById(g.loc) && E().locById(g.loc).kind !== "external");
      groups.forEach(g => { let s = 0, n = 0; for (let i = 0; i < g.ids.length; i++) for (let j = i + 1; j < g.ids.length; j++) { s += X.getRel(g.ids[i], g.ids[j]).pts; n++; } g.score = s / n + r() * 30; });
      groups.sort((x, y) => y.score - x.score);
      const maxG = P > 2 ? 2 : 1;
      for (const g of groups.slice(0, maxG)) {
        if (r() > Math.min(0.9, 0.3 * P)) continue;
        const ids = g.ids.slice(0, 5);
        if (ids.some(id => BUSY.test(where[id].act || "")) && r() < 0.6) continue;
        const t1 = topicOf(ids, r), t2 = topicOf(ids.slice().reverse(), r);
        const tpl = [
          `${names(ids)}在${X.locName(g.loc)}聊了快一個小時，從${t1}一路聊到${t2}。`,
          `${ids[0]}說起${t1}，${ids[1]}聽得很認真${ids[2] ? `，${ids[2]}在旁邊插了好幾次嘴` : ""}。`,
          `${names(ids)}湊在一起討論${t1}，誰也說服不了誰，最後笑成一團。`,
          `${names(ids)}聊${t1}聊到忘了時間。`,
          `${ids[1]}問起${t1}，結果${ids[0]}講個不停，話題最後歪到${t2}。`
        ];
        const text = tpl[Math.floor(r() * tpl.length)];
        for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) gain(ids[i], ids[j], (isCP(ids[i], ids[j]) ? 4 : 2.5) * P, `一起聊了${t1}`, g.loc);
        out.push(Object.assign(stamp(ck), { kind: "gather", text: `🫖 ${text}`, cast: ids, loc: g.loc }));
        placeMem(g.loc, ck, "🫖 " + text);
        if (ids.length >= 3) countTrio(ids, g.loc, ck, 2, out);
      }
      // 小圈子：在閒晃的地方常常湊在一起的三個人
      for (const g of groups) if (g.ids.length >= 3 && HANG.concat(["諾文地下湖", "諾文古籍巷"]).includes(g.loc) && !g.ids.some(id => BUSY.test(where[id].act || ""))) countTrio(g.ids, g.loc, ck, 1, out);

      // 固定配對：好感夠了，會自己告白
      for (const k of N.cpPairs || []) {
        const [a, b] = k.split("|"), wa = where[a], wb = where[b];
        if (!wa || !wb || !wa.avail || !wb.avail || wa.loc !== wb.loc) continue;
        const rel = X.getRel(a, b);
        if (rel.status === "交往中" || rel.pts < 85 || !X.loveEligible(a, b)[0] || r() > 0.5 * P) continue;
        const [s, t] = r() < 0.5 ? [a, b] : [b, a];
        const nr = Object.assign({}, rel, { status: "交往中", route: true, pts: Math.min(100, rel.pts + 5) });
        ctxWhy = `${s}在${X.locName(wa.loc)}告白，${t}答應了`; ctxLoc = wa.loc; X.setRel(a, b, nr); ctxWhy = ""; ctxLoc = null;
        out.push(Object.assign(stamp(ck), { kind: "love", text: `💗 ${s}在${X.locName(wa.loc)}向${t}告白了，${t}答應了。`, cast: [s, t], loc: wa.loc }));
      }

      // 自己約人：白天傳訊息約今天稍晚碰面
      if (ck.min >= 8 * 60 && ck.min <= 18 * 60 && r() < Math.min(0.6, 0.14 * P)) invite(ck, where, r, out);
      // 小圈子的固定聚會：當天中午在群組約
      if (ck.min >= 12 * 60 && ck.min < 12 * 60 + 30) for (const c of l.circles) if (c.dow === ck.dow) circleMeet(c, ck, r, out);
    }
  }
  function countTrio(ids, loc, ck, w, out) {
    const l = A();
    // 取彼此最要好的三個人
    let best = null, bs = -1;
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) for (let k = j + 1; k < ids.length; k++) {
      const t = [ids[i], ids[j], ids[k]], sc = X.getRel(t[0], t[1]).pts + X.getRel(t[0], t[2]).pts + X.getRel(t[1], t[2]).pts;
      if (sc > bs) { bs = sc; best = t; }
    }
    if (!best || bs < 150) return;
    const key = best.slice().sort().join("|"), t = l.together[key] = l.together[key] || { n: 0, locs: {}, dows: {} };
    t.n += w; t.locs[loc] = (t.locs[loc] || 0) + w; t.dows[ck.dow] = (t.dows[ck.dow] || 0) + w;
    const need = Math.max(3, Math.round(7 / pace()));
    if (t.n >= need && !l.circles.some(c => c.key === key || c.members.filter(m => best.includes(m)).length >= 2) && l.circles.length < 6) formCircle(key, t, ck, out);
  }
  function topicOf(ids, r) {
    const pool = [];
    ids.forEach(id => (TOPIC[id] || []).forEach(t => pool.push(t)));
    const g = L().gossip.find(x => ids.some(id => x.knows.includes(id)) && !x.about.some(a => ids.includes(a)));
    if (g && r() < 0.35) return `「${short(g.text, 14)}」那件事`;
    return pool[Math.floor(r() * pool.length)] || "最近的事";
  }
  function invite(ck, where, r, out) {
    const l = A(), ids = N.characters.map(c => c.id).filter(id => where[id] && where[id].avail);
    if (ids.length < 2) return;
    const a = ids[Math.floor(r() * ids.length)];
    if (l.plans.some(p => p.members.includes(a))) return;
    const cands = N.characters.map(c => c.id).filter(b => b !== a && !l.plans.some(p => p.members.includes(b)));
    let tot = 0; const ws = cands.map(b => { const rel = X.getRel(a, b); const w = Math.max(1, rel.pts - 35) * (rel.status === "交往中" || isCP(a, b) ? 3 : 1); tot += w; return w; });
    let x = r() * tot, b = cands[0]; for (let i = 0; i < cands.length; i++) { x -= ws[i]; if (x <= 0) { b = cands[i]; break; } }
    const start = ck.abs - (ck.min % 30) + 60 + Math.floor(r() * 5) * 30, end = start + 90 + Math.floor(r() * 3) * 30;
    const sk = X.clockAtAbs(start), ek = X.clockAtAbs(end - 1);
    if (ek.min > 22 * 60 || ek.dow !== ck.dow) return;
    const fw = X.whereAt(sk), wa = fw[a], wb = fw[b];
    const loc = [FAV[a], FAV[b]].concat(HANG)[r() < 0.6 ? Math.floor(r() * 2) : 2 + Math.floor(r() * HANG.length)] || "諾文公園";
    const rel = X.getRel(a, b), date = rel.status === "交往中";
    const t = whenLabel(start), cid = X.chatKeyWith(a, b);
    const inv = (INVITE[a] || INVITE["櫻子"])[0].replace("{b}", b).replace("{t}", t).replace("{loc}", X.locName(loc));
    const msgs = [[a, inv]];
    const busyB = !wb || !wb.avail || X.BUSY.test(wb.act || ""), busyA = !wa || !wa.avail || X.BUSY.test(wa.act || "");
    let skip = false;
    if (busyA) return;
    if (busyB) {
      if (wb && wb.avail && /上課|自修/.test(wb.act) && rel.pts >= 70 && r() < 0.25 * pace()) skip = true;
      else { msgs.push([b, DECLINE[b] || "那個時間不行耶，下次吧！"]); X.addMsgs(cid, ck, msgs); return; }
    }
    msgs.push([b, skip ? "……好，那堂課蹺掉算了。" : (INVITE[b] || INVITE["櫻子"])[1]]);
    X.addMsgs(cid, ck, msgs);
    const acts = {}; acts[a] = date ? `和${b}約會` : `跟${b}約好在這裡碰面`; acts[b] = skip ? `蹺了課，跑來跟${a}碰面` : date ? `和${a}約會` : `跟${a}約好在這裡碰面`;
    l.plans.push({ members: [a, b], loc, start, end, acts, act: acts[a], date });
    out.push(Object.assign(stamp(ck), { kind: "invite", text: `📱 ${a}傳訊息約${b}${t}去${X.locName(loc)}${skip ? `，${b}決定蹺課赴約` : `，${b}答應了`}。`, cast: [a, b], loc }));
  }
  const SUFFIX = { "Hale’s Oven": "聚餐組", "史威特偵探社": "偵探小隊", "諾文公園": "散步會", "諾文夜市": "夜市團", "諾文聯邦圖書館": "讀書會", "諾文河岸步道": "河邊閒晃組",
    "諾文甜點店": "甜點同好會", "諾文鐘塔廣場": "鐘塔下集合", "諾文機械市集": "零件尋寶團", "諾文混合書街": "書蟲會", "諾文地下湖": "釣魚社" };
  function formCircle(key, t, ck, out) {
    const l = A(), members = key.split("|");
    const loc = Object.keys(t.locs).sort((a, b) => t.locs[b] - t.locs[a])[0], dow = +Object.keys(t.dows).sort((a, b) => t.dows[b] - t.dows[a])[0];
    const SH = { "Hale’s Oven": "Hale", "史威特偵探社": "" }, short2 = SH[loc] != null ? SH[loc] : SUFFIX[loc] ? "" : X.locName(loc).replace(/^諾文/, "");
    const name = `週${E().WEEK[dow]}${short2}${SUFFIX[loc] || "小圈子"}`;
    const c = { id: "c" + ck.abs.toString(36), key, name, members, loc, dow, made: stamp(ck) };
    l.circles.push(c);
    out.push(Object.assign(stamp(ck), { kind: "milestone", text: `👥 ${names(members)}成了一個小圈子：「${name}」。`, quote: `以後每到週${E().WEEK[dow]}，大家會在${X.locName(loc)}聚一聚。`, cast: members, loc }));
    const host = members[0];
    X.addMsgs("circle:" + c.id, ck, [[host, `建了一個群組。以後週${E().WEEK[dow]}就在${X.locName(loc)}吧？`], [members[1], (INVITE[members[1]] || INVITE["櫻子"])[1]], [members[2], (INVITE[members[2]] || INVITE["櫻子"])[1]]]);
    addGossip(`${names(members)}組了一個叫「${name}」的小圈子`, [], members, ck, "circle");
  }
  function circleMeet(c, ck, r, out) {
    const l = A(); if (l.plans.some(p => p.circleId === c.id && p.day === X.dayKeyOf(ck))) return;
    const base = ck.abs - ck.min, start = base + 19 * 60, end = base + 21 * 60;
    const fw = X.whereAt(X.clockAtAbs(start)), go = c.members.filter(id => fw[id] && fw[id].avail && !X.BUSY.test(fw[id].act || ""));
    const host = c.members[Math.floor(r() * c.members.length)];
    const msgs = [[host, `今晚七點，老地方？`]];
    c.members.filter(id => id !== host).forEach(id => msgs.push([id, go.includes(id) ? (INVITE[id] || INVITE["櫻子"])[1] : (DECLINE[id] || "今天不行，你們玩！")]));
    X.addMsgs("circle:" + c.id, ck, msgs);
    if (go.length < 2) return;
    const acts = {}; go.forEach(id => { acts[id] = `「${c.name}」的固定聚會`; });
    l.plans.push({ members: go, loc: c.loc, start, end, acts, act: acts[go[0]], circle: c.name, circleId: c.id, day: X.dayKeyOf(ck) });
  }
  function circleChats(owner) { return A().circles.filter(c => c.members.includes(owner)).map(c => ({ id: "circle:" + c.id, name: c.name, icon: "👥", members: c.members, threads: [] })); }
  function circleChat(cid) { const c = A().circles.find(x => "circle:" + x.id === cid); return c ? { id: cid, name: c.name, icon: "👥", members: c.members, threads: [] } : null; }
  function milesHTML(id) {
    const l = A(), ms = l.miles.filter(m => m.a === id || m.b === id).slice(0, 8), cs = l.circles.filter(c => c.members.includes(id));
    if (!ms.length && !cs.length) return "";
    return `<div class="life-place">${cs.length ? `<div class="life-h">👥 小圈子</div>${cs.map(c => `<div class="life-circle"><b>${X.esc(c.name)}</b><span>${c.members.map(m => X.person(m, 20)).join("")}</span></div>`).join("")}` : ""}
      ${ms.length ? `<div class="life-h" style="margin-top:8px">🎖️ 一起走過的里程碑</div><ul class="life-list">${ms.map(m => `<li class="life-row"><span class="life-t">${when(m)}</span><span class="life-x">${X.esc(m.a === id ? m.b : m.a)}：變成「${X.esc(m.label)}」</span><span class="life-q">${m.loc ? X.esc(X.locName(m.loc)) + "・" : ""}${X.esc(m.why)}</span></li>`).join("")}</ul>` : ""}</div>`;
  }

  N.life = {
    init: x => { X = x; }, sync, onAction, relChanged, plansAt, circleChats, circleChat, milesHTML, focusOf, anomalyAt, quietBubbles, quietChance,
    awayHTML, focusHTML, placeHTML, gossipHTML, itemsHTML, carryHTML, diaryNote
  };
})();
