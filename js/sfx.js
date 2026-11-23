/* 諾文小鎮：按鈕與互動音效（WebAudio 即時合成，不需要音效檔）
 * 跟背景音樂分開：自己的音量、自己的開關（設定裡）。
 * 第一次點擊之後才會有聲音（瀏覽器規定）。 */
(function () {
  "use strict";
  const N = window.NOVUM = window.NOVUM || {};
  let ctx = null, out = null, noise = null, on = true, vol = 0.6, lastTap = 0;
  const hz = m => 440 * Math.pow(2, (m - 69) / 12);

  function init() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
    ctx = new AC();
    out = ctx.createGain(); out.gain.value = vol * 0.6;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    out.connect(comp); comp.connect(ctx.destination);
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return true;
  }
  function ready() {
    if (!on || !init()) return false;
    if (ctx.state === "suspended") ctx.resume();
    return true;
  }
  // 一個音：波形、起始頻率（可滑到 f2）、長度、音量、起音時間
  function tone(t, f1, f2, dur, lvl, type, att) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || "sine"; o.frequency.setValueAtTime(f1, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur * 0.9);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(lvl, t + (att || 0.004)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.05);
  }
  function hiss(t, freq, type, dur, lvl, q, f2) {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noise; f.type = type; f.frequency.setValueAtTime(freq, t); if (f2) f.frequency.exponentialRampToValueAtTime(f2, t + dur); if (q) f.Q.value = q;
    g.gain.setValueAtTime(lvl, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(out); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }
  const arp = (t, notes, gap, dur, lvl, type) => notes.forEach((m, i) => tone(t + i * gap, hz(m), 0, dur, lvl, type));

  const S = {
    tap(t) { tone(t, 1250, 880, 0.045, 0.09, "sine"); },                                     // 一般按鈕：輕輕的「嗒」
    open(t) { tone(t, hz(72), 0, 0.12, 0.07); tone(t + 0.06, hz(79), 0, 0.16, 0.06); },          // 打開面板
    close(t) { tone(t, hz(79), 0, 0.1, 0.05); tone(t + 0.05, hz(72), 0, 0.14, 0.045); },         // 關閉
    pop(t) { tone(t, 520, 900, 0.07, 0.07, "sine"); },                                         // 對話下一句：泡泡
    ring(t) { hiss(t, 900, "bandpass", 0.18, 0.06, 1.2, 2600); tone(t + 0.02, hz(84), 0, 0.12, 0.03); },   // 圓環選單打開：咻
    coin(t) { tone(t, hz(83), 0, 0.09, 0.07, "square"); tone(t + 0.08, hz(88), 0, 0.28, 0.06, "square"); },   // 買東西：叮鈴
    cash(t) { S.coin(t); hiss(t + 0.05, 5000, "highpass", 0.12, 0.04); tone(t + 0.22, hz(91), 0, 0.3, 0.05, "triangle"); },   // 打工拿到錢
    eat(t) { for (let i = 0; i < 3; i++) hiss(t + i * 0.09, 1800 + Math.random() * 900, "bandpass", 0.06, 0.12, 2); },   // 咬一口：喀滋喀滋
    ticket(t) { hiss(t, 3000, "highpass", 0.08, 0.05); tone(t + 0.05, hz(76), 0, 0.2, 0.06, "triangle"); tone(t + 0.12, hz(81), 0, 0.3, 0.05, "triangle"); },   // 撕票
    gift(t) { arp(t, [76, 80, 83, 88, 92], 0.055, 0.35, 0.05, "sine"); hiss(t, 7000, "highpass", 0.4, 0.015); },   // 送禮：閃閃的
    heart(t) { arp(t, [72, 76, 79, 84], 0.08, 0.6, 0.05, "triangle"); tone(t + 0.32, hz(88), 0, 0.8, 0.035, "sine"); },   // 戀愛：暖暖的和弦
    gain(t) { tone(t, hz(84), 0, 0.18, 0.05, "sine"); tone(t + 0.07, hz(91), 0, 0.3, 0.045, "sine"); },   // 好感上升：小小的「叮」
    door(t) { tone(t, 140, 70, 0.18, 0.18, "sine"); hiss(t, 400, "lowpass", 0.12, 0.12); hiss(t + 0.02, 1400, "bandpass", 0.35, 0.02, 8, 900); },   // 開門
    notify(t) { tone(t, hz(88), 0, 0.5, 0.04, "sine"); tone(t + 0.12, hz(84), 0, 0.6, 0.035, "sine"); },   // 通知：輕輕的鈴
    win(t) { arp(t, [72, 76, 79, 84], 0.06, 0.22, 0.05, "square"); },
    lose(t) { tone(t, hz(67), hz(60), 0.35, 0.05, "triangle"); },
    toggle(t) { tone(t, 900, 0, 0.03, 0.06, "square"); tone(t + 0.04, 1400, 0, 0.04, 0.05, "square"); }
  };
  function play(name) {
    if (!S[name] || !ready()) return;
    const now = ctx.currentTime;
    if (name === "tap") { if (now - lastTap < 0.04) return; lastTap = now; }
    S[name](now + 0.005);
  }
  N.sfx = {
    play,
    setOn(v) { on = !!v; },
    isOn: () => on,
    setVolume(v) { vol = Math.max(0, Math.min(1, v)); if (out) out.gain.value = vol * 0.6; },
    volume: () => vol
  };
})();
