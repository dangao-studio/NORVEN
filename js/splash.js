/* 諾文小鎮：載入頁
 * 幾個居民（用他們的方塊小人 skin 畫）在進度條上走來走去，下面是進度和一句小提示。
 * N.splash.progress(0~1, 文字)、N.splash.done() 淡出。 */
(function () {
  "use strict";
  const N = window.NOVUM = window.NOVUM || {};
  const el = document.getElementById("splash"); if (!el) { N.splash = { progress() {}, done() {} }; return; }
  const t0 = Date.now();
  const TIPS = [
    "點一下居民，可以看他現在在做什麼、在想什麼。",
    "打開地點，可以看到房間裡誰在、坐在哪裡。",
    "📺 放著看：鏡頭會自己跟著有事發生的地方。",
    "就算你不在，居民也會自己聚會、慢慢變熟。",
    "每個地方的背景音樂都不一樣，記得點一下 🎵。",
    "晚上的小鎮會點起窗燈和路燈。",
    "設定裡可以切換「小鎮時間」，快轉或暫停都可以。",
    "史威特正在拆今天的委託信……",
    "Hale’s Oven 的爐子已經熱了。",
    "梅魯塔教授的貓頭鷹剛飛回塔屋。",
    "瑞特又跑去地下湖釣魚了。",
    "ミニクイ在找今天的拉麵店。"
  ];
  const tip = document.getElementById("spTip"); if (tip) tip.textContent = TIPS[Math.floor(Math.random() * TIPS.length)];
  // 走路的方塊小人
  const cv = document.getElementById("spWalk"), g = cv && cv.getContext("2d");
  const walkers = [];
  if (g && N.skins) {
    const ids = Object.keys(N.skins).sort(() => Math.random() - 0.5).slice(0, 5);
    ids.forEach((id, i) => {
      const img = new Image(); img.src = "icons/skins/" + N.skins[id].f + ".png";
      walkers.push({ img, slim: N.skins[id].slim, x: 10 + i * 62 + Math.random() * 20, v: 34 + Math.random() * 10, ph: Math.random() * 6 });
    });
  }
  const S = 2;   // 1 格 = 2 像素
  function drawFig(w, t) {
    const x = Math.round(w.x), base = cv.height - 2, step = Math.sin(t * 8 + w.ph), bob = Math.abs(step) > 0.5 ? 0 : 1;
    const d = (sx, sy, sw, sh, dx, dy) => g.drawImage(w.img, sx, sy, sw, sh, x + dx * S, base - (32 - dy) * S - bob * S, sw * S, sh * S);
    const aw = w.slim ? 3 : 4;
    // 腳（前後交替）
    const la = step > 0 ? 1 : 0;
    d(4, 20, 4, 12 - la, 4 - aw + aw, 20 + la); d(20, 52, 4, 12 - (1 - la), 8 - aw + aw, 20 + (1 - la));
    d(20, 20, 8, 12, 4, 8); d(20, 36, 8, 12, 4, 8);            // 身體＋外層
    d(44, 20, aw, 12, 4 - aw, 8); d(36, 52, aw, 12, 12, 8);      // 手
    d(8, 8, 8, 8, 4, 0); d(40, 8, 8, 8, 4, 0);                   // 臉＋頭髮
  }
  let raf = 0, last = 0, gone = false;
  function frame(now) {
    if (gone) return;
    raf = requestAnimationFrame(frame);
    const t = now / 1000, dt = last ? Math.min(0.05, t - last) : 0.016; last = t;
    if (!g) return;
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, cv.width, cv.height);
    for (const w of walkers) {
      w.x += w.v * dt; if (w.x > cv.width + 20) w.x = -40 - Math.random() * 80;
      if (w.img.complete && w.img.naturalWidth) drawFig(w, t);
    }
  }
  raf = requestAnimationFrame(frame);
  const fill = document.getElementById("spFill"), stepEl = document.getElementById("spStep");
  let shown = 0;
  function progress(p, text) {
    if (gone) return;
    shown = Math.max(shown, Math.min(1, p));
    if (fill) fill.style.width = Math.round(shown * 100) + "%";
    if (text && stepEl) stepEl.textContent = text;
  }
  function done() {
    if (gone) return;
    progress(1);
    const wait = Math.max(0, 900 - (Date.now() - t0));
    setTimeout(() => {
      el.classList.add("out");
      setTimeout(() => { gone = true; cancelAnimationFrame(raf); el.remove(); }, 450);
    }, wait);
  }
  progress(0.02);
  N.splash = { progress, done, active: () => !gone };
})();
