// 驗證資料：行程覆蓋、地點存在、事件可觸發性、住處分散、禁用符號
const fs = require("fs"), vm = require("vm"), path = require("path");
const root = process.argv[2];
const ctx = { window: {}, console };
ctx.window = ctx; vm.createContext(ctx);
for (const f of ["data/characters.js", "data/locations.js", "data/schedules.js", "data/events-new.js", "data/events-more.js", "data/events-solo.js", "data/events-original.js", "data/voices.js", "data/voices-b.js", "data/relations.js", "data/phone.js", "data/phone-voices.js", "data/festivals.js", "data/floorplans.js", "js/engine.js"]) {
  vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), ctx, { filename: f });
}
const N = ctx.NOVUM, E = N.engine;
const locIds = new Set(N.locations.map(l => l.id));
const chars = N.characters.map(c => c.id);
let problems = 0;
const warn = (...a) => { problems++; console.log("⚠", ...a); };

// 1. 行程
for (const c of chars) {
  const s = N.schedules[c];
  if (!s) { warn("no schedule", c); continue; }
  if (!locIds.has(s.home)) warn("bad home", c, s.home);
  for (const b of s.blocks) if (!locIds.has(b[3])) warn("bad loc", c, b);
  for (const parity of ["A", "B"]) for (let dow = 0; dow < 7; dow++) for (let m = 0; m < 1440; m += 5) {
    const r = E.resolve(c, { dow, min: m, parity });
    if (r.gap) { warn("gap", c, "dow", dow, parity, E.fmtMin(m)); break; }
  }
}
// 2. 事件
const evs = E.allEvents();
const ids = new Set();
const weathers = ["晴", "多雲", "雨", "霧"];
const reach = {};
for (const ev of evs) {
  if (ids.has(ev.id)) warn("dup id", ev.id); ids.add(ev.id);
  if (ev.place !== "*" && !locIds.has(ev.place)) warn("bad event loc", ev.id, ev.loc);
  for (const c of ev.cast) if (!chars.includes(c)) warn("bad cast", ev.id, c);
  for (const l of ev.lines) {
    if (l[0] !== "＊" && !ev.cast.includes(l[0])) warn("speaker not in cast", ev.id, l[0]);
    if (/[—–]/.test(l[1])) warn("dash in", ev.id, l[1]);
  }
  let slots = 0;
  const days = new Set();
  for (const parity of ["A", "B"]) for (let dow = 0; dow < 7; dow++) for (let m = 0; m < 1440; m += 5) {
    const w = ev.weather || "晴";
    const clock = { dow, min: m, parity, date: ev.date || "01-01", weather: w };
    if (!E.timeOK(ev, clock)) continue;
    const where = E.whereabouts(clock);
    const me = where[ev.cast[0]];
    if (!me || (ev.place !== "*" && me.loc !== ev.place)) continue;
    if (ev.alone && Object.keys(where).some(id => !ev.cast.includes(id) && where[id].loc === me.loc && where[id].avail)) continue;
    if (ev.cast.every(c => where[c].loc === me.loc && (ev.asleep ? !where[c].avail : where[c].avail))) { slots++; days.add(dow); }
  }
  reach[ev.id] = slots;
  if (!slots) warn("UNREACHABLE", ev.id, ev.title, ev.place, ev.t.join("-"), ev.cast.join("/"), ev.days || "", ev.weather || "");
}
// 3. 住處分散（每天 03:00）
for (let dow = 0; dow < 7; dow++) {
  const occ = E.occupancy(E.whereabouts({ dow, min: 180, parity: "A" }));
  const big = Object.entries(occ).filter(([k, v]) => v.length > 2);
  if (big.length) warn("crowded at 03:00 dow", dow, JSON.stringify(big));
}
// 4. 角色出場統計
const cnt = {};
for (const ev of evs) if (reach[ev.id]) for (const c of ev.cast) cnt[c] = (cnt[c] || 0) + 1;
console.log("reachable events per character:", JSON.stringify(cnt));
console.log("events:", evs.length, "unreachable:", Object.values(reach).filter(x => !x).length, "problems:", problems);

// 5. 語氣庫與手機
for (const c of chars) { const v = N.voices[c]; if (!v) { warn("no voice", c); continue; }
  for (const a of N.actions) { for (const k of ["open","reply","follow"]) if (!v[k][a.id] || !v[k][a.id].length) warn("voice missing", c, k, a.id); }
  for (const k of ["approach","react","share","react2","close","assign"]) if (!v[k] || !v[k].length) warn("voice missing", c, k); }
for (const ch of N.chats) { for (const m of ch.members) if (!chars.includes(m)) warn("chat member", ch.id, m);
  for (const t of ch.threads) for (const m of t.m) { if (m[0] !== "?" && !ch.members.includes(m[0])) warn("chat sender", ch.id, m[0]); if (/[—–]/.test(m[1])) warn("dash", ch.id); } }
for (const id in N.floorplans) { if (!locIds.has(id)) warn("plan loc", id); const p = N.floorplans[id];
  for (const r of p.rules) if (!p.spots[r[1]]) warn("plan rule spot", id, r[1]);
  for (const k of p.idle) if (!p.spots[k]) warn("plan idle", id, k);
  for (const per in (p.personal||{})) { const q=p.personal[per]; if (q.sleep && !p.spots[q.sleep]) warn("plan sleep", id, per); } }
for (let i=0;i<50;i++){ const a=chars[i%16], b=chars[(i*7+3)%16]; if(a===b) continue; for (const x of N.actions){ const L=E.generateInteraction(a,b,x.id,"某處"); if (L.length<6) warn("short gen",a,b,x.id); for(const l of L) if(/[{}]/.test(l[1])) warn("unfilled",l[1]); } }
console.log("voices/phone/plans checked");

for (const c of chars) { const v=N.voices[c]; const g=N.ageGroup[c]; if ((g==="adult"||g==="teen") && !v.love) warn("no love", c); if (g==="junior" && v.love) warn("love on blocked", c);
  if (v.love) for (const k of ["gest","invite","yesDate","noDate","confess","yes","no","afterYes","sweet"]) if(!v.love[k]||!v.love[k].length) warn("love missing",c,k); }
for (let i=0;i<40;i++){ const a=chars[i%16], b=chars[(i*5+1)%16]; if(a===b||!N.voices[a].love||!N.voices[b].love) continue;
  for (const k of ["date","confess","sweet"]) for (const ok of [true,false]) { const L=E.generateLove(a,b,k,ok,"某處"); for(const l of L) if(/[{}]/.test(l[1])) warn("unfilled love",l[1]); } }
console.log("love checked");

for (const c of chars) { const v=N.phoneVoice[c]; if(!v){warn("no phone voice",c);continue;}
  for (const t of N.phoneTypes) for (const k of ["send","reply"]) { const a=v[k][t.id]; if(!a||!a.length) warn("phone voice missing",c,k,t.id); else for(const x of a) if(/[—–]/.test(x)) warn("dash",c); } }
console.log("phone voices checked");

for (const f of N.festivals) { for (const l of f.locs) if (!locIds.has(l)) warn("fest loc", f.id, l); for (const k of ["open","mid","end"]) if(!f[k]||!f[k].length) warn("fest text", f.id, k);
  for (const c in (f.lines||{})) if (!chars.includes(c)) warn("fest line char", f.id, c); for (const n of (f.need||[])) if(!chars.includes(n)) warn("need",f.id,n);
  const all=[...f.open,...f.mid,...f.end,...Object.values(f.lines||{})]; for(const t of all) if(/[—–]/.test(t)) warn("dash fest",f.id); }
for (const c of chars) { const v=N.partyVoice[c]; if(!v) warn("no party voice",c); else for(const k of ["arrive","chat"]) if(!v[k]||!v[k].length) warn("party voice",c,k);
  const o=N.outingVoice[c]; if(!o||!o.invite||!o.enjoy||!o.enjoy.length) warn("outing voice",c); }
for (const sp of N.outingSpots) if (!locIds.has(sp.loc)) warn("outing loc", sp.loc);
console.log("festivals checked");

// 小心願（data/wishes.js）：每人都有、id 不重複、說話的人與相關的人存在、心情有定義、沒有破折號
{
  vm.runInContext(fs.readFileSync(path.join(root, "data/wishes.js"), "utf8"), ctx, { filename: "data/wishes.js" });
  const MOOD = ["happy", "excited", "warm", "calm", "proud", "shy", "fired", "sleepy", "blue"], seen = new Set();
  const lineOk = (w, l) => { if (l[0] !== "＊" && !chars.includes(l[0])) warn("wish speaker", w.id, l[0]); if (/[—–]/.test(l[1])) warn("dash wish", w.id); };
  for (const c of chars) {
    const L = N.wishes[c]; if (!L || L.length < 2) { warn("few wishes", c); continue; }
    for (const w of L) {
      if (seen.has(w.id)) warn("dup wish", w.id); seen.add(w.id);
      if (!w.hint || /[。—–]/.test(w.hint)) warn("wish hint", w.id);
      w.ask.forEach(l => lineOk(w, l));
      if (!w.opts || w.opts.length < 2 || w.opts.length > 3) warn("wish opts", w.id);
      for (const o of w.opts || []) {
        if (!MOOD.includes(o.mood)) warn("wish mood", w.id, o.mood);
        o.reply.forEach(l => lineOk(w, l));
        if (o.rel && (!chars.includes(o.rel[0]) || o.rel[0] === c)) warn("wish rel", w.id, o.rel[0]);
        for (const t of [o.label, o.diary, o.thanks]) if (t && /[—–]/.test(t)) warn("dash wish", w.id);
      }
    }
  }
  for (const c in N.wishes) if (!chars.includes(c)) warn("wish char", c);
  console.log("wishes checked:", seen.size, "problems so far:", problems);
}

// 自己做點什麼（data/doings.js）：每人都有喜歡的事和答應的話、用途都有定義、人名存在、沒有破折號
{
  vm.runInContext(fs.readFileSync(path.join(root, "data/doings.js"), "utf8"), ctx, { filename: "data/doings.js" });
  const D = N.doings, U = D.uses, dash = t => /[—–]/.test(t);
  let n = 0;
  for (const k in U) { if (!U[k].icon || !U[k].label || !U[k].act || !(U[k].min > 0)) warn("doing use", k); if (dash(U[k].label) || dash(U[k].act)) warn("dash doing", k); for (const c of U[k].only || []) if (!chars.includes(c)) warn("doing only", k, c); }
  for (const t in D.useOf) if (!U[D.useOf[t]]) warn("doing useOf", t, D.useOf[t]);
  for (const c of chars) {
    const L = D.likes[c]; if (!L || Object.keys(L).length < 4) warn("few doing likes", c);
    for (const k in L || {}) { n++; if (!U[k]) warn("doing like use", c, k); else if (U[k].only && !U[k].only.includes(c)) warn("doing like not allowed", c, k); if (dash(L[k])) warn("dash doing", c, k); }
    if (!D.ok[c] || D.ok[c].length < 2) warn("doing ok", c); else for (const t of D.ok[c]) if (dash(t)) warn("dash doing ok", c);
  }
  for (const c in D.no) { if (!chars.includes(c)) warn("doing no char", c); for (const k of D.no[c]) if (!U[k]) warn("doing no use", c, k); }
  console.log("doings checked:", Object.keys(U).length, "uses,", n, "lines; problems so far:", problems);
}
