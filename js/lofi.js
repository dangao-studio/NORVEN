/* 諾文小鎮：背景音樂（WebAudio 即時合成，不需要音樂檔，離線也能播）
 * 每個地方有自己的曲風：和弦、速度、樂器音色、鼓、環境音都不一樣。
 * 換地方時會淡出再淡入。iPhone 規定聲音只能在使用者點擊後開始，所以要先點一次 🎵。
 */
(function () {
  "use strict";
  const N = window.NOVUM = window.NOVUM || {};
  let ctx = null, master = null, lp = null, dSend = null, playing = false, timer = 0, step = 0, nextT = 0, vol = 0.5, noiseBuf = null;
  let crackleG = null, bedSrc = null, bedF = null, bedG = null, dWet = null;
  const hz = m => 440 * Math.pow(2, (m - 69) / 12);
  let seed = 7;
  const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };

  /* ───── 和弦小工具（MIDI） ───── */
  const M7 = r => [r, r + 4, r + 7, r + 11], m7 = r => [r, r + 3, r + 7, r + 10], D7 = r => [r, r + 4, r + 7, r + 10];
  const MA = r => [r, r + 4, r + 7], MI = r => [r, r + 3, r + 7], M9 = r => [r, r + 4, r + 7, r + 11, r + 14], m9 = r => [r, r + 3, r + 7, r + 10, r + 14];
  const sus = r => [r, r + 5, r + 7, r + 10], hd = r => [r, r + 3, r + 6, r + 10], ad9 = r => [r, r + 4, r + 7, r + 14];
  const PENT = [60, 62, 64, 67, 69, 72, 74, 76], MINP = [57, 60, 62, 64, 67, 69, 72, 74], DOR = [62, 64, 65, 67, 69, 71, 72, 74];

  /* ───── 曲風 ─────
   * bpm、progs（兩組四和弦輪流）、scale（旋律音）、inst（和弦音色）、lead（旋律音色）、leadP（旋律出現機率）、
   * drums、amb（環境音事件）、bed（持續的環境底噪）、cut（整體亮度）、delay（回音量）、crackle（黑膠雜訊）、swing */
  const THEMES = {
    town: { bpm: 74, progs: [[M7(53), m7(52), m7(50), M9(48)], [M7(46), m7(45), m7(43), sus(48)]], scale: PENT, inst: "ep", lead: "ep", leadP: 0.22, drums: "lofi", cut: 2600, crackle: 0.35 },
    night: { bpm: 64, progs: [[M7(50), m7(45), M7(46), sus(45)], [m7(43), M7(48), M7(41), sus(43)]], scale: PENT, inst: "ep", lead: "ep", leadP: 0.14, drums: "soft", cut: 1700, crackle: 0.5, delay: 0.15 },
    central: { bpm: 80, progs: [[M7(48), m7(45), m7(50), D7(43)], [M7(53), m7(52), m7(50), sus(43)]], scale: PENT, inst: "ep", lead: "piano", leadP: 0.26, drums: "lofi", cut: 2800, crackle: 0.3 },
    academy: { bpm: 70, progs: [[M7(53), [55, 59, 62, 64], m7(52), m7(45)], [m7(50), D7(43), M7(48), M7(48)]], scale: PENT, inst: "piano", lead: "piano", leadP: 0.3, drums: "brush", amb: "chime", cut: 3000, crackle: 0.2 },
    oldtown: { bpm: 88, progs: [[MI(50), MI(43), MA(45), MI(50)], [MA(46), MA(41), MI(43), MA(45)]], scale: DOR, inst: "accordion", lead: "accordion", leadP: 0.35, drums: "tap", cut: 2200, crackle: 0.45, swing: 0.25 },
    outer: { bpm: 92, progs: [[m7(45), m7(45), M7(41), MA(43)], [m7(50), m7(52), M7(41), [43, 47, 50, 52]]], scale: MINP, inst: "pluck", lead: "pluck", leadP: 0.3, drums: "machine", amb: "clank", cut: 3200, crackle: 0.2 },
    pero: { bpm: 104, progs: [[M7(41), MA(43), m7(40), MI(45)], [m7(50), MA(43), M7(48), D7(45)]], scale: PENT, inst: "pluck", lead: "box", leadP: 0.45, drums: "punchy", cut: 4200, crackle: 0.1 },
    hales: { bpm: 66, progs: [[m9(50), D7(43), M9(48), D7(45)], [M7(41), m7(41), m7(40), D7(45)]], scale: PENT, inst: "ep", lead: "ep", leadP: 0.18, drums: "brush", amb: "cafe", bed: "cafe", cut: 1700, crackle: 0.45 },
    dessert: { bpm: 84, progs: [[M7(48), M7(53), M7(48), MA(43)], [m7(45), M7(53), ad9(48), sus(43)]], scale: PENT, inst: "box", lead: "box", leadP: 0.55, drums: "none", cut: 5000, crackle: 0.15 },
    detective: { bpm: 72, progs: [[m7(45), m7(50), D7(40), m7(45)], [M7(41), hd(47), D7(40), m7(45)]], scale: MINP, inst: "ep", lead: "piano", leadP: 0.2, drums: "brush", amb: "clock", cut: 1900, crackle: 0.4, walk: true },
    nightmarket: { bpm: 96, progs: [[MI(45), MA(41), MA(48), MA(43)], [MI(45), MA(41), MA(43), MA(43)]], scale: MINP, inst: "pluck", lead: "pluck", leadP: 0.45, drums: "punchy", bed: "crowd", cut: 3400, crackle: 0.15 },
    lake: { bpm: 56, progs: [[m9(38), M7(46), M7(41), ad9(48)], [m9(38), M7(46), sus(43), ad9(45)]], scale: PENT, inst: "pad", lead: "celesta", leadP: 0.18, drums: "none", amb: "drip", bed: "water", cut: 1600, delay: 0.38, crackle: 0.1 },
    wizard: { bpm: 60, progs: [[[52, 55, 59, 66], [48, 52, 55, 59, 66], m9(45), D7(47)], [[52, 55, 59, 66], [48, 52, 55, 59, 66], m9(45), [47, 51, 54, 57, 60]]], scale: [64, 66, 67, 71, 72, 74, 76, 79], inst: "pad", lead: "celesta", leadP: 0.35, drums: "none", amb: "chime", cut: 2400, delay: 0.42, crackle: 0.1 },
    park: { bpm: 82, progs: [[M7(43), M7(48), m7(40), MA(50)], [M7(43), M7(48), m7(45), sus(50)]], scale: PENT, inst: "guitar", lead: "piano", leadP: 0.28, drums: "soft", amb: "birds", cut: 3200, crackle: 0.15 },
    spooky: { bpm: 58, progs: [[MI(45), MI(38), MA(40), MI(45)], [MI(41), MI(38), MA(40), MA(40)]], scale: [57, 59, 60, 63, 64, 67, 68, 69], inst: "pad", lead: "celesta", leadP: 0.12, drums: "none", bed: "wind", cut: 1100, delay: 0.3, crackle: 0.4, low: true },
    station: { bpm: 90, progs: [[M7(48), m7(40), M7(41), MA(43)], [M7(48), m7(45), M7(41), sus(43)]], scale: PENT, inst: "ep", lead: "ep", leadP: 0.2, drums: "lofi", amb: "train", cut: 2600, crackle: 0.3 },
    home: { bpm: 70, progs: [[M7(48), M7(53), m7(45), sus(43)], [m7(50), M7(48), M7(53), sus(43)]], scale: PENT, inst: "piano", lead: "ep", leadP: 0.18, drums: "soft", cut: 2200, crackle: 0.35 }
  };
  let th = THEMES.town, thName = "town";

  function init() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0;
    lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = th.cut; lp.Q.value = 0.4;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 3;
    lp.connect(comp); comp.connect(master); master.connect(ctx.destination);
    // 回音（湖、塔屋這種空間感）
    dSend = ctx.createGain(); dSend.gain.value = 1;
    const dl = ctx.createDelay(1.5); dl.delayTime.value = 0.42; const fb = ctx.createGain(); fb.gain.value = 0.38; const dlp = ctx.createBiquadFilter(); dlp.type = "lowpass"; dlp.frequency.value = 1800;
    dWet = ctx.createGain(); dWet.gain.value = th.delay || 0;
    dSend.connect(dWet); dWet.connect(dl); dl.connect(dlp); dlp.connect(fb); fb.connect(dl); dlp.connect(lp);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // 黑膠雜訊
    const cb = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate), cd = cb.getChannelData(0);
    for (let i = 0; i < cd.length; i++) cd[i] = (Math.random() < 0.0009 ? (Math.random() * 2 - 1) * 0.9 : 0) + (Math.random() * 2 - 1) * 0.012;
    const crackle = ctx.createBufferSource(); crackle.buffer = cb; crackle.loop = true;
    crackleG = ctx.createGain(); crackleG.gain.value = th.crackle; const chp = ctx.createBiquadFilter(); chp.type = "highpass"; chp.frequency.value = 900;
    crackle.connect(chp); chp.connect(crackleG); crackleG.connect(master); crackle.start();
    // 環境底噪（咖啡廳的人聲、夜市、風、水聲）
    bedSrc = ctx.createBufferSource(); bedSrc.buffer = noiseBuf; bedSrc.loop = true;
    bedF = ctx.createBiquadFilter(); bedG = ctx.createGain(); bedG.gain.value = 0;
    bedSrc.connect(bedF); bedF.connect(bedG); bedG.connect(master); bedSrc.start();
    applyBed();
    return true;
  }
  function applyBed() {
    if (!bedG) return;
    const t = ctx.currentTime, B = { cafe: ["bandpass", 520, 0.05], crowd: ["bandpass", 850, 0.08], wind: ["lowpass", 420, 0.07], water: ["lowpass", 900, 0.035] }[th.bed] || [null, 600, 0];
    if (B[0]) bedF.type = B[0]; bedF.frequency.setValueAtTime(B[1], t); bedF.Q.value = th.bed === "crowd" ? 0.6 : 0.8;
    bedG.gain.cancelScheduledValues(t); bedG.gain.linearRampToValueAtTime(B[2], t + 1.2);
    crackleG.gain.linearRampToValueAtTime(th.crackle == null ? 0.3 : th.crackle, t + 1);
    dWet.gain.linearRampToValueAtTime(th.delay || 0, t + 1);
    lp.frequency.linearRampToValueAtTime(th.cut || 2600, t + 1);
  }
  const out = (node, wet) => { node.connect(lp); if (wet !== false) node.connect(dSend); };

  /* ───── 音色 ───── */
  function note(t, midi, dur, gain, kind) {
    const f0 = hz(midi), g = ctx.createGain(), f = ctx.createBiquadFilter(); f.type = "lowpass";
    const osc = (type, mul, lvl, det) => { const o = ctx.createOscillator(), og = ctx.createGain(); o.type = type; o.frequency.value = f0 * mul; o.detune.value = det || 0; og.gain.value = lvl; o.connect(og); og.connect(g); o.start(t); o.stop(t + dur + 0.1); return o; };
    const det = (rnd() - 0.5) * 6;
    let a = 0.02, peak = gain;
    switch (kind) {
      case "piano":
        osc("triangle", 1, 1, det); osc("sine", 2, 0.25, det); osc("sine", 3, 0.06);
        f.frequency.setValueAtTime(3200, t); f.frequency.exponentialRampToValueAtTime(900, t + dur);
        a = 0.005; dur = Math.min(dur, 2.4); break;
      case "accordion": {
        const o1 = osc("sawtooth", 1, 0.5, det - 7), o2 = osc("square", 1, 0.25, det + 7);
        const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 5.5; lg.gain.value = 9; lfo.connect(lg); lg.connect(o1.detune); lg.connect(o2.detune); lfo.start(t); lfo.stop(t + dur + 0.1);
        f.frequency.value = 1300; a = 0.06; peak = gain * 0.7; break;
      }
      case "pluck":
        osc("square", 1, 0.5, det); osc("triangle", 2, 0.3);
        f.frequency.setValueAtTime(3600, t); f.frequency.exponentialRampToValueAtTime(380, t + 0.3);
        a = 0.004; dur = Math.min(dur, 0.55); peak = gain * 0.8; break;
      case "box":
        osc("sine", 2, 1); osc("sine", 6, 0.12);
        f.frequency.value = 8000; a = 0.003; dur = Math.min(dur, 0.9); peak = gain * 0.9; break;
      case "guitar":
        osc("triangle", 1, 0.8, det); osc("sawtooth", 1, 0.12, det + 4);
        f.frequency.setValueAtTime(2600, t); f.frequency.exponentialRampToValueAtTime(600, t + 0.6);
        a = 0.004; dur = Math.min(dur, 1.4); break;
      case "pad":
        osc("sine", 1, 0.8, det); osc("triangle", 1, 0.3, det + 6); osc("sine", 0.5, 0.25);
        f.frequency.value = 1400; a = Math.min(0.8, dur * 0.3); peak = gain * 0.9; break;
      case "celesta":
        osc("sine", 2, 1); osc("sine", 8, 0.08); osc("sine", 4.02, 0.12);
        f.frequency.value = 9000; a = 0.003; dur = Math.min(dur, 1.6); peak = gain * 0.8; break;
      default:   // 電鋼琴
        osc("triangle", 1, 1, det); osc("sine", 2, 0.18, det);
        f.frequency.setValueAtTime(1800, t); f.frequency.exponentialRampToValueAtTime(700, t + dur);
    }
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + a);
    if (kind === "pad" || kind === "accordion") { g.gain.setValueAtTime(peak, t + dur * 0.6); g.gain.linearRampToValueAtTime(0.0001, t + dur); }
    else { g.gain.exponentialRampToValueAtTime(peak * 0.35, t + a + 0.45); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); }
    g.connect(f); out(f);
  }
  function bass(t, midi, dur, lvl) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "sine"; o.frequency.value = hz(midi - 12);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(lvl || 0.32, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); out(g, false); o.start(t); o.stop(t + dur + 0.05);
  }
  function kick(t, lvl) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.18);
    g.gain.setValueAtTime(lvl || 0.55, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    o.connect(g); out(g, false); o.start(t); o.stop(t + 0.35);
  }
  function noiseHit(t, freq, type, gain, dur, q) {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; f.type = type; f.frequency.value = freq; if (q) f.Q.value = q;
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); out(g, false); s.start(t, Math.random()); s.stop(t + dur + 0.02);
  }
  function ping(t, f1, f2, dur, lvl, wet) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "sine"; o.frequency.setValueAtTime(f1, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur * 0.8);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(lvl, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); out(g, wet); o.start(t); o.stop(t + dur + 0.05);
  }

  /* ───── 鼓 ───── */
  function drums(t, pos) {
    switch (th.drums) {
      case "lofi":
        if (pos === 0 || (pos === 5 && rnd() < 0.5)) kick(t);
        if (pos === 4) noiseHit(t, 1800, "bandpass", 0.16, 0.18);
        if (pos % 2 === 0 || rnd() < 0.25) noiseHit(t, 7000, "highpass", pos % 2 ? 0.025 : 0.045, 0.05);
        break;
      case "soft":
        if (pos === 0) kick(t, 0.32);
        if (pos === 4) noiseHit(t, 2400, "bandpass", 0.06, 0.14);
        if (pos % 4 === 2) noiseHit(t, 8000, "highpass", 0.02, 0.04);
        break;
      case "brush":
        if (pos === 0) kick(t, 0.28);
        if (pos === 2 || pos === 6) noiseHit(t, 3200, "lowpass", 0.05, 0.32);
        if (pos % 2 === 1) noiseHit(t, 6000, "highpass", 0.014, 0.08);
        break;
      case "tap":
        if (pos === 0 || pos === 4) kick(t, 0.4);
        if (pos === 2 || pos === 6) noiseHit(t, 2600, "bandpass", 0.12, 0.06, 4);
        if (pos % 2) noiseHit(t, 7500, "highpass", 0.02, 0.03);
        break;
      case "machine":
        if (pos === 0 || pos === 4) kick(t, 0.5);
        if (pos === 2 || pos === 6) noiseHit(t, 3400, "bandpass", 0.18, 0.09, 14);
        noiseHit(t, 9000, "highpass", pos % 2 ? 0.018 : 0.03, 0.03);
        break;
      case "punchy":
        if (pos === 0 || pos === 3 || (pos === 6 && rnd() < 0.5)) kick(t, 0.6);
        if (pos === 4) noiseHit(t, 1900, "bandpass", 0.22, 0.16);
        noiseHit(t, 8000, "highpass", pos % 2 ? 0.025 : 0.04, 0.04);
        break;
    }
  }
  /* ───── 環境音事件 ───── */
  function ambience(t, pos, bar) {
    switch (th.amb) {
      case "cafe": if (rnd() < 0.07) ping(t, 2400 + rnd() * 1400, 0, 0.25, 0.03, false); break;   // 杯盤輕碰
      case "chime": if (rnd() < 0.035) { const f = hz(84 + [0, 4, 7, 12][Math.floor(rnd() * 4)]); ping(t, f, 0, 2.2, 0.035); ping(t, f * 2.76, 0, 1.2, 0.01); } break;
      case "clank": if (rnd() < 0.05) noiseHit(t, 2200 + rnd() * 2400, "bandpass", 0.08, 0.12, 18); break;
      case "clock": if (pos % 2 === 0) noiseHit(t, 5200, "bandpass", pos === 0 ? 0.04 : 0.025, 0.02, 10); break;
      case "drip": if (rnd() < 0.09) ping(t, 1400 + rnd() * 800, 420, 0.16, 0.05); break;
      case "birds": if (rnd() < 0.06) { const f = 3200 + rnd() * 1800; ping(t, f, f * 1.4, 0.09, 0.02, false); ping(t + 0.11, f * 1.1, f * 1.5, 0.08, 0.016, false); } break;
      case "train": if (pos === 0 && bar % 8 === 0) { ping(t, hz(79), 0, 1.4, 0.035); ping(t + 0.45, hz(76), 0, 1.6, 0.035); } break;
    }
  }
  function schedule() {
    const SPB = 60 / th.bpm / 2;
    while (nextT < ctx.currentTime + 0.25) {
      const bar = Math.floor(step / 8), pos = step % 8;
      const prog = th.progs[Math.floor(bar / 4) % th.progs.length], chord = prog[bar % 4];
      const swing = pos % 2 ? SPB * (th.swing == null ? 0.18 : th.swing) : 0, t = nextT + swing;
      const oct = th.low ? -12 : 0;
      if (pos === 0) { chord.forEach((m, i) => note(t + i * 0.012, m + oct, SPB * 7.5, th.inst === "pad" ? 0.06 : 0.07, th.inst)); bass(t, chord[0] + oct, SPB * 3.5); }
      if (th.inst === "accordion" && pos === 4) chord.forEach(m => note(t, m, SPB * 3.5, 0.045, "accordion"));
      if (th.inst === "guitar" && (pos === 3 || pos === 6)) chord.slice(1).forEach((m, i) => note(t + i * 0.02, m, SPB * 3, 0.04, "guitar"));
      if (th.inst === "pluck" && pos % 2 === 0 && pos) note(t, chord[1 + (pos >> 1) % (chord.length - 1)], SPB * 2, 0.05, "pluck");
      if (th.walk) { if (pos % 2 === 0) bass(t, chord[0] + [0, 3, 7, 5][pos >> 1], SPB * 1.8, 0.26); }
      else if (pos === 4 && rnd() < 0.6) bass(t, chord[0] + oct + (rnd() < 0.5 ? 7 : 0), SPB * 3);
      drums(t, pos);
      if (rnd() < th.leadP) note(t, th.scale[Math.floor(rnd() * th.scale.length)] + 12 + oct, SPB * 2.5, 0.045, th.lead);
      ambience(t, pos, bar);
      step++; nextT += SPB;
    }
  }
  function start() {
    if (playing) return true;
    if (!ctx && !init()) return false;
    if (ctx.state === "suspended") ctx.resume();
    playing = true; nextT = ctx.currentTime + 0.1;
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.linearRampToValueAtTime(vol * 0.5, ctx.currentTime + 1.5);
    timer = setInterval(schedule, 60); schedule();
    return true;
  }
  function stop() {
    if (!playing) return;
    playing = false;
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.6);
    setTimeout(() => { if (!playing) clearInterval(timer); }, 700);
  }
  // 換曲風：淡出 → 換 → 淡入
  let swapT = 0;
  function setTheme(name) {
    if (!THEMES[name] || name === thName) return;
    thName = name;
    if (!playing || !ctx) { th = THEMES[name]; return; }
    clearTimeout(swapT);
    const t = ctx.currentTime;
    master.gain.cancelScheduledValues(t); master.gain.setValueAtTime(master.gain.value, t); master.gain.linearRampToValueAtTime(0, t + 0.8);
    swapT = setTimeout(() => {
      th = THEMES[thName]; step = 0; nextT = Math.max(nextT, ctx.currentTime + 0.05); applyBed();
      if (playing) master.gain.linearRampToValueAtTime(vol * 0.5, ctx.currentTime + 1.4);
    }, 850);
  }
  function setVolume(v) { vol = Math.max(0, Math.min(1, v)); if (playing && master) master.gain.linearRampToValueAtTime(vol * 0.5, ctx.currentTime + 0.2); }
  function pause(p) { if (!ctx) return; if (p) ctx.suspend(); else if (playing) ctx.resume(); }
  N.lofi = { start, stop, toggle: () => (playing ? (stop(), false) : start()), setVolume, isPlaying: () => playing, pause, setTheme, theme: () => thName, themes: Object.keys(THEMES) };
})();
