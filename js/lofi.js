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

  /* ───── 歌單裡的歌：有寫好的旋律（A、B 兩段），前奏 4 小節、尾奏 4 小節 ─────
   * mel：兩段旋律，各 4 小節（32 個八分音符），格式「位置:音名:長度」，位置和長度都以八分音符算；
   *      第一段配 progs[0]、第二段配 progs[1]。melOct 是整段移調（音色本身高八度的用 -12）。 */
  const SONGS = {
    s_clock: { name: "鐘塔的第四面鐘", mood: "慢半拍的午後，鐘聲一下一下", bpm: 68, progs: [[M7(53), m7(52), m7(50), M9(48)], [M7(46), m7(45), m7(43), sus(48)]], inst: "ep", lead: "celesta", melOct: -12, drums: "soft", amb: "chime", cut: 2600, crackle: 0.3, delay: 0.18, bars: 52,
      mel: ["0:A5:2 2:G5:2 4:E5:4 8:G5:3 11:B5:1 12:D6:4 16:C6:2 18:A5:2 20:F5:4 24:E5:2 26:D5:2 28:G5:4",
            "0:D6:4 4:A5:2 6:F5:2 8:E5:3 11:G5:1 12:C6:4 16:Bb5:2 18:A5:2 20:G5:2 22:F5:2 24:G5:6 30:F5:2"] },
    s_lamp: { name: "河岸第十二盞路燈", mood: "夜裡的爵士，慢慢散步", bpm: 66, progs: [[m7(50), D7(43), M7(48), D7(45)], [M7(41), m7(40), m7(45), D7(43)]], inst: "ep", lead: "piano", drums: "brush", walk: true, swing: 0.3, cut: 2000, crackle: 0.4, delay: 0.12, bars: 52,
      mel: ["0:F5:2 2:A5:2 4:C6:3 7:A5:1 8:B5:4 12:A5:2 14:G5:2 16:E5:6 22:G5:2 24:C#6:2 26:E6:2 28:A5:4",
            "0:A5:3 3:C6:1 4:E6:4 8:D6:2 10:B5:2 12:G5:4 16:C6:2 18:E6:2 20:G5:4 24:F5:2 26:D5:2 28:B4:4"] },
    s_dessert: { name: "甜點店的早晨", mood: "巴薩諾瓦，草莓塔剛出爐", bpm: 86, progs: [[M7(48), m7(50), m7(52), D7(43)], [M7(53), m7(52), m7(50), sus(43)]], inst: "guitar", lead: "marimba", drums: "bossa", amb: "cafe", cut: 3600, crackle: 0.15, bars: 56,
      mel: ["0:G5:1 1:E5:1 3:G5:2 5:B5:3 8:A5:1 9:F5:1 11:A5:2 13:C6:3 16:B5:1 17:G5:1 19:B5:2 21:D6:3 24:D6:2 26:B5:2 28:F5:2 30:G5:2",
            "0:A5:3 3:C6:3 6:E6:2 8:D6:3 11:B5:3 14:G5:2 16:F5:2 18:A5:2 20:C6:4 24:C6:4 28:D6:4"] },
    s_train: { name: "蒸氣列車往佩洛", mood: "窗外的風景一直往後跑", bpm: 108, progs: [[MA(43), MA(48), MA(43), MA(50)], [MI(52), MA(48), MA(43), MA(50)]], inst: "pluck", lead: "flute", drums: "chug", amb: "train", cut: 3800, crackle: 0.12, bars: 64,
      mel: ["0:B5:2 2:D6:2 4:G6:2 6:D6:2 8:E6:2 10:C6:2 12:G5:4 16:D6:2 18:B5:2 20:G5:2 22:B5:2 24:A5:4 28:F#5:4",
            "0:E6:3 3:D6:1 4:B5:4 8:C6:3 11:B5:1 12:G5:4 16:B5:2 18:D6:2 20:G6:4 24:F#6:2 26:E6:2 28:D6:4"] },
    s_lake: { name: "地下湖的回聲", mood: "水滴、回音、很深很深的地方", bpm: 54, progs: [[m9(38), M7(46), M7(41), ad9(48)], [m9(45), M7(41), sus(43), ad9(45)]], inst: "pad", lead: "harp", drums: "none", amb: "drip", bed: "water", cut: 1700, delay: 0.45, crackle: 0.08, bars: 40,
      mel: ["0:A5:4 4:E6:4 8:D6:4 12:F6:4 16:C6:4 20:A5:4 24:D6:8",
            "0:B5:4 4:C6:4 8:A5:8 16:C6:4 20:D6:4 24:C#6:4 28:E6:4"] },
    s_accordion: { name: "舊城的手風琴", mood: "石板路上轉圈圈", bpm: 96, progs: [[MI(50), MA(48), MA(46), MA(45)], [MI(50), MA(53), MA(48), MA(45)]], inst: "accordion", lead: "accordion", drums: "tap", swing: 0.25, cut: 2300, crackle: 0.45, bars: 56,
      mel: ["0:D6:2 2:E6:1 3:F6:1 4:A6:2 6:F6:2 8:E6:2 10:G6:2 12:E6:2 14:C6:2 16:D6:2 18:F6:2 20:D6:2 22:Bb5:2 24:C#6:4 28:A5:4",
            "0:F6:3 3:E6:1 4:D6:4 8:C6:2 10:A5:2 12:F5:4 16:G5:2 18:C6:2 20:E6:4 24:E6:2 26:C#6:2 28:A5:4"] },
    s_lantern: { name: "夜市燈籠", mood: "炸雞排的香味和人聲", bpm: 100, progs: [[MI(45), MA(41), MA(48), MA(43)], [MA(41), MA(43), MI(45), MI(45)]], inst: "pluck", lead: "flute", drums: "punchy", bed: "crowd", cut: 3400, crackle: 0.15, bars: 56,
      mel: ["0:E6:2 2:G6:2 4:A6:2 6:G6:1 7:E6:1 8:D6:2 10:C6:2 12:A5:4 16:C6:2 18:D6:2 20:E6:2 22:G6:2 24:D6:6 30:B5:2",
            "0:A6:4 4:G6:2 6:E6:2 8:D6:4 12:G6:4 16:E6:2 18:D6:2 20:C6:2 22:A5:2 24:A5:8"] },
    s_rain: { name: "雨天的混合書街", mood: "窗外下雨，翻一本舊書", bpm: 70, progs: [[m9(45), M7(41), M7(48), D7(43)], [M7(41), m7(40), m9(45), sus(43)]], inst: "piano", lead: "piano", drums: "soft", bed: "rain", cut: 2100, crackle: 0.35, bars: 52,
      mel: ["0:B5:2 2:C6:2 4:E6:4 8:A5:2 10:C6:2 12:E6:4 16:G5:2 18:B5:2 20:D6:2 22:E6:2 24:D6:4 28:B5:4",
            "0:E6:4 4:C6:4 8:B5:4 12:G5:4 16:A5:2 18:B5:2 20:C6:4 24:D6:2 26:C6:2 28:G5:4"] },
    s_crystal: { name: "時間結晶", mood: "封在裡面、永遠不會結束的一秒", bpm: 62, progs: [[[52, 55, 59, 66], [48, 52, 55, 59, 66], m9(45), [47, 51, 54, 57]], [[52, 55, 59, 66], [48, 52, 55, 59, 66], m9(45), [47, 51, 54, 57, 60]]], inst: "pad", lead: "bell", drums: "none", amb: "chime", cut: 2600, delay: 0.42, crackle: 0.08, bars: 44,
      mel: ["0:B5:4 4:F#6:4 8:E6:4 12:G6:4 16:C6:4 20:B5:4 24:D#6:4 28:F#6:4",
            "0:G6:6 6:F#6:2 8:E6:6 14:D6:2 16:C6:4 20:E6:4 24:D#6:8"] },
    s_devil: { name: "惡魔的下午茶", mood: "搖擺爵士，茶裡好像加了什麼", bpm: 92, progs: [[m7(45), hd(47), D7(40), m7(45)], [m7(50), D7(43), M7(48), D7(40)]], inst: "ep", lead: "piano", drums: "shuffle", walk: true, swing: 0.34, cut: 2600, crackle: 0.3, bars: 56,
      mel: ["0:E5:1 1:G5:1 2:A5:2 4:C6:2 6:A5:2 8:D6:2 10:F6:2 12:D6:2 14:B5:2 16:G#5:3 19:B5:1 20:D6:2 22:E6:2 24:C6:2 26:B5:2 28:A5:4",
            "0:F6:2 2:E6:2 4:D6:2 6:A5:2 8:B5:2 10:D6:2 12:F6:4 16:E6:6 22:D6:2 24:B5:2 26:G#5:2 28:E5:4"] },
    s_roof: { name: "放學後的屋頂", mood: "晚霞、汽水、誰都不想先回家", bpm: 96, progs: [[M7(41), MA(43), m7(40), MI(45)], [M7(41), MA(43), MA(48), sus(43)]], inst: "guitar", lead: "ep", drums: "lofi", cut: 3000, crackle: 0.2, bars: 56,
      mel: ["0:C6:2 2:A5:2 4:C6:2 6:E6:2 8:D6:4 12:B5:4 16:G5:2 18:B5:2 20:D6:2 22:E6:2 24:C6:6 30:A5:2",
            "0:A5:2 2:C6:2 4:F6:4 8:G6:2 10:F6:2 12:D6:4 16:E6:4 20:C6:4 24:D6:8"] },
    s_star: { name: "星星的夢遊", mood: "八音盒，轉著轉著就睡著了", bpm: 76, progs: [[MA(48), MI(45), MA(41), MA(43)], [MA(41), MA(43), MI(52), MI(45)]], inst: "pad", lead: "box", melOct: -12, drums: "none", cut: 4600, crackle: 0.12, delay: 0.25, bars: 44,
      mel: ["0:G6:2 2:E6:2 4:C6:2 6:E6:2 8:A6:4 12:E6:4 16:F6:2 18:A6:2 20:C7:4 24:B6:4 28:G6:4",
            "0:A6:2 2:G6:2 4:F6:4 8:G6:2 10:F6:2 12:D6:4 16:E6:2 18:G6:2 20:B6:4 24:A6:8"] },
    s_home: { name: "回家的路", mood: "路燈一盞一盞亮起來", bpm: 64, progs: [[ad9(48), MA(43), MI(45), M7(41)], [M7(41), MA(43), m7(40), MI(45)]], inst: "strings", lead: "piano", drums: "soft", cut: 2200, crackle: 0.3, bars: 48,
      mel: ["0:E5:2 2:G5:2 4:C6:4 8:B5:2 10:D6:2 12:G5:4 16:A5:2 18:C6:2 20:E6:4 24:F6:2 26:E6:2 28:C6:4",
            "0:A5:4 4:C6:4 8:B5:2 10:D6:2 12:G6:4 16:G6:2 18:E6:2 20:B5:4 24:C6:6 30:B5:2"] },
    s_hales: { name: "海爾的週日早午餐", mood: "烤箱的嗡嗡聲、咖啡和肉桂", bpm: 72, progs: [[m9(50), D7(43), M9(48), D7(45)], [M7(41), m7(40), m7(38), D7(43)]], inst: "ep", lead: "flute", drums: "brush", amb: "cafe", bed: "cafe", cut: 1900, crackle: 0.4, bars: 52,
      mel: ["0:F5:2 2:A5:2 4:E6:4 8:D6:2 10:B5:2 12:F5:4 16:E5:2 18:G5:2 20:D6:4 24:C#6:2 26:A5:2 28:G5:4",
            "0:A5:2 2:C6:2 4:E6:4 8:D6:2 10:B5:2 12:G5:4 16:F5:2 18:A5:2 20:C6:4 24:B5:2 26:D6:2 28:F6:4"] }
  };
  // 每個地方的曲子也放進歌單（沒有寫好的旋律，即興）
  const PLACE_NAMES = { town: ["諾文的午後", "小鎮平常的一天"], night: ["夜裡的鐘塔廣場", "安靜下來的城"], central: ["中央區的街角", "人來人往"], academy: ["學區的圖書館", "翻書聲和風鈴"],
    oldtown: ["舊城的石板路", "手風琴從巷子裡傳出來"], outer: ["外環的機械市集", "齒輪和扳手"], pero: ["佩洛的表演廣場", "今晚的演出"], hales: ["Hale’s Oven", "咖啡廳的早晨"],
    dessert: ["甜點店的玻璃櫃", "八音盒和馬卡龍"], detective: ["史威特偵探社", "線索、時鐘和走路的貝斯"], nightmarket: ["諾文夜市", "熱鬧的攤販"], lake: ["地下湖", "水滴落下的聲音"],
    wizard: ["梅魯塔的塔屋", "魔法和星圖"], park: ["公園的長椅", "鳥叫和吉他"], spooky: ["起霧的小巷", "有點冷的風"], station: ["蒸氣列車月台", "列車進站"], home: ["回到房間", "終於可以休息了"] };
  const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const midiOf = n => { const m = /^([A-G])(#|b)?(-?\d)$/.exec(n); return m ? 12 * (+m[3] + 1) + NOTE[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0) : null; };
  for (const k in SONGS) {
    const S = SONGS[k];
    S.melP = S.mel.map(str => { const at = []; for (let i = 0; i < 32; i++) at.push([]); str.trim().split(/\s+/).forEach(tok => { const [p, n, l] = tok.split(":"), m = midiOf(n); if (m != null && +p < 32) at[+p].push([m, +l]); }); return at; });
    if (S.leadP == null) S.leadP = 0.05;
    if (!S.scale) S.scale = PENT;
  }
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
    const t = ctx.currentTime, B = { cafe: ["bandpass", 520, 0.05], crowd: ["bandpass", 850, 0.08], wind: ["lowpass", 420, 0.07], water: ["lowpass", 900, 0.035], rain: ["highpass", 2600, 0.06] }[th.bed] || [null, 600, 0];
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
      case "marimba":
        osc("sine", 1, 1); osc("sine", 4, 0.18); osc("sine", 10, 0.03);
        f.frequency.value = 6000; a = 0.002; dur = Math.min(dur, 0.7); peak = gain * 1.1; break;
      case "flute": {
        const o = osc("sine", 1, 0.9, det); osc("triangle", 2, 0.08);
        const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 5; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(12, t + 0.4); lfo.connect(lg); lg.connect(o.detune); lfo.start(t); lfo.stop(t + dur + 0.1);
        const br = ctx.createBufferSource(), bf = ctx.createBiquadFilter(), bg = ctx.createGain(); br.buffer = noiseBuf; bf.type = "bandpass"; bf.frequency.value = f0 * 2; bf.Q.value = 3;
        bg.gain.setValueAtTime(gain * 0.25, t); bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.18); br.connect(bf); bf.connect(bg); bg.connect(g); br.start(t, Math.random()); br.stop(t + 0.2);
        f.frequency.value = 3200; a = 0.06; peak = gain * 0.85; break;
      }
      case "bell": {
        const car = osc("sine", 1, 1), mod = ctx.createOscillator(), mg = ctx.createGain();
        mod.frequency.value = f0 * 3.5; mg.gain.setValueAtTime(f0 * 2.2, t); mg.gain.exponentialRampToValueAtTime(f0 * 0.05, t + 1.4);
        mod.connect(mg); mg.connect(car.frequency); mod.start(t); mod.stop(t + dur + 0.1);
        f.frequency.value = 7000; a = 0.003; dur = Math.min(Math.max(dur, 1.6), 3); peak = gain * 0.7; break;
      }
      case "harp":
        osc("triangle", 1, 0.9, det); osc("sine", 2, 0.3); osc("sine", 3, 0.08);
        f.frequency.setValueAtTime(4200, t); f.frequency.exponentialRampToValueAtTime(1200, t + 1.2);
        a = 0.003; dur = Math.min(Math.max(dur, 1.2), 2.6); break;
      case "strings":
        osc("sawtooth", 1, 0.35, det - 8); osc("sawtooth", 1, 0.35, det + 8); osc("triangle", 0.5, 0.2);
        f.frequency.value = 1500; a = Math.min(0.9, dur * 0.35); peak = gain * 0.75; break;
      default:   // 電鋼琴
        osc("triangle", 1, 1, det); osc("sine", 2, 0.18, det);
        f.frequency.setValueAtTime(1800, t); f.frequency.exponentialRampToValueAtTime(700, t + dur);
    }
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + a);
    if (kind === "pad" || kind === "accordion" || kind === "strings" || kind === "flute") { g.gain.setValueAtTime(peak, t + dur * 0.6); g.gain.linearRampToValueAtTime(0.0001, t + dur); }
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
      case "bossa":
        if (pos === 0 || pos === 3 || pos === 4 || pos === 7) kick(t, pos % 4 ? 0.22 : 0.3);
        if (pos === 0 || pos === 3 || pos === 6) noiseHit(t, 3000, "bandpass", 0.07, 0.03, 8);   // 邊擊
        noiseHit(t, 9000, "highpass", 0.012, 0.03);
        break;
      case "chug":   // 火車：咻咻咻咻
        if (pos === 0 || pos === 4) kick(t, 0.45);
        noiseHit(t, 2600, "bandpass", pos % 2 ? 0.05 : 0.09, 0.07, 2);
        if (pos === 2 || pos === 6) noiseHit(t, 1900, "bandpass", 0.14, 0.12);
        break;
      case "shuffle":
        if (pos === 0 || pos === 5) kick(t, 0.38);
        if (pos === 2 || pos === 6) noiseHit(t, 2200, "bandpass", 0.12, 0.12);
        noiseHit(t, 7000, "highpass", pos % 2 ? 0.03 : 0.018, 0.05);
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
      const total = mode === "list" ? (th.bars || 48) : 1e9, song = !!th.melP;
      // 歌單：最後兩小節慢慢淡出，播完換下一首
      if (bar >= total) { if (!advancing) { advancing = true; setTimeout(() => next(true), 0); } step++; nextT += SPB; continue; }
      if (bar === total - 2 && pos === 0) { const t0 = ctx.currentTime; master.gain.cancelScheduledValues(t0); master.gain.setValueAtTime(master.gain.value, t0); master.gain.linearRampToValueAtTime(0, nextT + SPB * 16); }
      const pi = song ? (bar < 4 ? 0 : Math.floor((bar - 4) / 4) % th.progs.length) : Math.floor(bar / 4) % th.progs.length;
      const prog = th.progs[pi], chord = prog[bar % 4];
      const swing = pos % 2 ? SPB * (th.swing == null ? 0.18 : th.swing) : 0, t = nextT + swing;
      const oct = th.low ? -12 : 0;
      if (pos === 0) { chord.forEach((m, i) => note(t + i * 0.012, m + oct, SPB * 7.5, th.inst === "pad" ? 0.06 : 0.07, th.inst)); bass(t, chord[0] + oct, SPB * 3.5); }
      if (th.inst === "accordion" && pos === 4) chord.forEach(m => note(t, m, SPB * 3.5, 0.045, "accordion"));
      if (th.inst === "guitar" && (pos === 3 || pos === 6)) chord.slice(1).forEach((m, i) => note(t + i * 0.02, m, SPB * 3, 0.04, "guitar"));
      if (th.inst === "pluck" && pos % 2 === 0 && pos) note(t, chord[1 + (pos >> 1) % (chord.length - 1)], SPB * 2, 0.05, "pluck");
      if (th.walk) { if (pos % 2 === 0) bass(t, chord[0] + [0, 3, 7, 5][pos >> 1], SPB * 1.8, 0.26); }
      else if (pos === 4 && rnd() < 0.6) bass(t, chord[0] + oct + (rnd() < 0.5 ? 7 : 0), SPB * 3);
      if (!song || (bar >= 2 && bar < total - 1)) drums(t, pos);
      if (song && bar >= 4 && bar < total - 4) {
        const ph = th.melP[pi % th.melP.length][((bar - 4) % 4) * 8 + pos];
        for (const [m, l] of ph) note(t, m + (th.melOct || 0), SPB * l * 0.95, 0.06, th.lead);
      }
      if (rnd() < th.leadP && (!song || bar >= 4)) note(t, th.scale[Math.floor(rnd() * th.scale.length)] + 12 + oct + (song ? (th.melOct || 0) : 0), SPB * 2.5, 0.04, th.lead);
      ambience(t, pos, bar);
      step++; nextT += SPB;
    }
  }
  function start() {
    if (playing) return true;
    if (mode === "list" && !cur) { reshuffle(); cur = order[0]; th = themeOf(cur); thName = cur; step = 0; }
    if (!ctx && !init()) return false;
    if (ctx.state === "suspended") ctx.resume();
    playing = true; nextT = ctx.currentTime + 0.1;
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.linearRampToValueAtTime(vol * 0.5, ctx.currentTime + 1.5);
    timer = setInterval(schedule, 60); schedule();
    emit();
    return true;
  }
  function stop() {
    if (!playing) return;
    playing = false;
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.6);
    setTimeout(() => { if (!playing) clearInterval(timer); }, 700);
    emit();
  }
  /* ───── 換曲：淡出 → 換 → 淡入 ─────
   * 兩種模式：place＝跟著所在地點換曲風（app 呼叫 setTheme）；list＝歌單，一首播完換下一首（可隨機）。 */
  let swapT = 0, mode = "list", cur = null, shuffle = true, order = [], placeName = "town", advancing = false;
  const listeners = [];
  const emit = () => listeners.forEach(f => { try { f(); } catch (e) { } });
  const TRACKS = Object.keys(SONGS).map(id => ({ id, name: SONGS[id].name, mood: SONGS[id].mood, song: true }))
    .concat(Object.keys(THEMES).map(k => ({ id: "p_" + k, name: (PLACE_NAMES[k] || [k])[0], mood: (PLACE_NAMES[k] || ["", ""])[1], song: false })));
  const themeOf = id => id && id.startsWith("p_") ? THEMES[id.slice(2)] : SONGS[id];
  function swap(obj, name) {
    thName = name;
    if (!playing || !ctx) { th = obj; step = 0; advancing = false; if (ctx) applyBed(); return; }
    clearTimeout(swapT);
    const t = ctx.currentTime;
    master.gain.cancelScheduledValues(t); master.gain.setValueAtTime(master.gain.value, t); master.gain.linearRampToValueAtTime(0, t + 0.8);
    swapT = setTimeout(() => {
      th = obj; step = 0; nextT = Math.max(nextT, ctx.currentTime + 0.05); applyBed(); advancing = false;
      if (playing) { master.gain.cancelScheduledValues(ctx.currentTime); master.gain.setValueAtTime(0, ctx.currentTime); master.gain.linearRampToValueAtTime(vol * 0.5, ctx.currentTime + 1.4); }
    }, 850);
  }
  function setTheme(name) {
    if (!THEMES[name]) return;
    placeName = name;
    if (mode !== "place" || name === thName) return;
    swap(THEMES[name], name); emit();
  }
  function reshuffle() {
    order = TRACKS.map(x => x.id);
    if (shuffle) for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    if (cur && order[0] === cur && order.length > 1) order.push(order.shift());
    if (!cur) { const k = order.findIndex(id => SONGS[id]); if (k > 0) order.unshift(order.splice(k, 1)[0]); }   // 第一次播先放一首寫好的歌
  }
  function playTrack(id) {
    const T = themeOf(id); if (!T) return false;
    mode = "list"; cur = id; advancing = false;
    swap(T, id);
    if (!playing) start(); else emit();
    return true;
  }
  function next(auto) {
    if (mode !== "list") { mode = "list"; }
    if (!order.length || (cur && order.indexOf(cur) === order.length - 1)) reshuffle();
    let i = cur ? order.indexOf(cur) + 1 : 0; if (i >= order.length) i = 0;
    const id = order[i] || TRACKS[0].id;
    cur = id; swap(themeOf(id), id); emit();
  }
  function setMode(m) {
    if (m === mode) return;
    mode = m === "place" ? "place" : "list";
    if (mode === "place") swap(THEMES[placeName] || THEMES.town, placeName);
    else { if (!cur) { reshuffle(); cur = order[0]; } swap(themeOf(cur), cur); }
    emit();
  }
  function progress() { if (!playing || mode !== "list" || !th.bars) return 0; return Math.min(1, step / 8 / th.bars); }
  function current() {
    if (mode === "place") return { id: "p_" + placeName, name: (PLACE_NAMES[placeName] || [placeName])[0], mood: "跟著所在的地方換曲", song: false };
    return TRACKS.find(x => x.id === cur) || null;
  }
  function setVolume(v) { vol = Math.max(0, Math.min(1, v)); if (playing && master) master.gain.linearRampToValueAtTime(vol * 0.5, ctx.currentTime + 0.2); }
  function pause(p) { if (!ctx) return; if (p) ctx.suspend(); else if (playing) ctx.resume(); }
  N.lofi = { start, stop, toggle: () => (playing ? (stop(), false) : start()), setVolume, isPlaying: () => playing, pause, setTheme, theme: () => thName, themes: Object.keys(THEMES),
    tracks: () => TRACKS, playTrack, next: () => next(false), current, progress, mode: () => mode, setMode,
    shuffle: v => { if (v != null) { shuffle = !!v; reshuffle(); emit(); } return shuffle; },
    restore: (m, c, sh) => { if (sh != null) shuffle = !!sh; if (m) mode = m === "place" ? "place" : "list"; if (c && themeOf(c)) cur = c; if (mode === "list" && cur) { th = themeOf(cur); thName = cur; } else if (mode === "place") { th = THEMES[placeName]; thName = placeName; } },
    onChange: f => listeners.push(f) };
})();
