/* 諾文小鎮：3D 小鎮的拍照模式
 * 介面全部收起來，只留快門和一排調整：時間、天氣（只改畫面，不動存檔和行程）、濾鏡與移軸微縮、鏡頭角度與焦距、定格。
 * 拍下來的是 3D 畫面本身（不含按鈕），可以下載或用手機的分享選單存進相簿。
 * 3D 那邊的功能在 N.town3d.photo（town3d.js 最後面）。 */
(function () {
  const N = window.NOVUM = window.NOVUM || {};
  const FILTERS = [["原色", 0], ["底片", 1], ["黑白", 2], ["懷舊", 3], ["粉彩", 4], ["電影", 5]];
  const WEATHER = [["☀️", "晴"], ["⛅", "多雲"], ["🌧️", "雨"], ["🌫️", "霧"]];
  let layer = null, tab = "time", lastURL = null, lastBlob = null;

  const P = () => N.town3d && N.town3d.photo;
  const pad = n => String(n).padStart(2, "0");
  function timeText(m) {
    const h = Math.floor(m / 60), mm = m % 60;
    const part = h < 5 ? "深夜" : h < 8 ? "清晨" : h < 11 ? "上午" : h < 13 ? "中午" : h < 17 ? "下午" : h < 19 ? "傍晚" : h < 23 ? "晚上" : "深夜";
    return part + " " + pad(h) + ":" + pad(mm);
  }

  function open() {
    const ph = P(); if (!ph || layer) return;
    if (!ph.enter()) return;
    document.body.classList.add("photo-on");
    layer = document.createElement("div");
    layer.className = "ph-layer"; layer.id = "phLayer";
    document.body.appendChild(layer);
    render();
    try { if (document.documentElement.requestFullscreen && !document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {}); } catch (e) { /* 不支援就算了 */ }
    window.addEventListener("keydown", onKey);
  }
  function close() {
    const ph = P(); if (ph) ph.exit();
    document.body.classList.remove("photo-on", "ph-bare");
    if (layer) layer.remove(); layer = null;
    closePreview();
    window.removeEventListener("keydown", onKey);
    try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) { /* ignore */ }
  }
  function onKey(e) {
    if (/INPUT|TEXTAREA/.test(document.activeElement && document.activeElement.tagName) && document.activeElement.type !== "range") return;
    if (e.key === "Escape") { if (document.getElementById("phPreview")) closePreview(); else close(); }
    else if (e.key === " " && !document.getElementById("phPreview")) { e.preventDefault(); shoot(); }
    else if (e.key.toLowerCase() === "h") document.body.classList.toggle("ph-bare");
  }

  function chips(items, cur, attr) {
    return items.map(([label, v]) => `<button type="button" class="ph-chip ${cur === v ? "on" : ""}" data-${attr}="${v}">${label}</button>`).join("");
  }
  function panelHTML(g) {
    if (tab === "time") {
      const m = g.min == null ? g.realMin : g.min;
      return `<div class="ph-row"><span class="ph-val" id="phTimeVal">${timeText(m)}</span>
          <button type="button" class="ph-chip ${g.min == null ? "on" : ""}" data-phmin="real">跟著小鎮</button></div>
        <input type="range" class="ph-range" id="phTime" min="0" max="1430" step="10" value="${m}" aria-label="時間">`;
    }
    if (tab === "weather") {
      return `<div class="ph-row ph-wrap">${chips([["跟著小鎮", ""]], g.weather || "", "phwx")}${WEATHER.map(([ic, w]) => `<button type="button" class="ph-chip ${g.weather === w ? "on" : ""}" data-phwx="${w}">${ic} ${w}</button>`).join("")}</div>`;
    }
    if (tab === "filter") {
      return `<div class="ph-row ph-wrap">${chips(FILTERS, g.filter, "phfilter")}</div>
        <label class="ph-lab"><span>移軸微縮</span><input type="range" class="ph-range" id="phTilt" min="0" max="100" step="5" value="${Math.round(g.tilt * 100)}" aria-label="移軸微縮"></label>
        <label class="ph-lab ${g.tilt > 0 ? "" : "off"}"><span>對焦位置</span><input type="range" class="ph-range" id="phFocus" min="15" max="85" step="1" value="${Math.round((1 - g.focus) * 100)}" aria-label="對焦位置（上下）"></label>`;
    }
    return `<label class="ph-lab"><span>俯視 ⇄ 平視</span><input type="range" class="ph-range" id="phPolar" min="25" max="150" step="1" value="${Math.round(g.polar * 100)}" aria-label="鏡頭角度"></label>
      <label class="ph-lab"><span>廣角 ⇄ 望遠</span><input type="range" class="ph-range" id="phFov" min="14" max="70" step="1" value="${Math.round(84 - g.fov)}" aria-label="焦距"></label>
      <div class="ph-row ph-wrap">
        <button type="button" class="ph-chip ${g.freeze ? "on" : ""}" data-phtoggle="freeze">⏸ 定格</button>
        <button type="button" class="ph-chip ${g.clean ? "" : "on"}" data-phtoggle="clean">🏷️ 名牌與標記</button>
      </div>`;
  }
  function render() {
    if (!layer) return;
    const g = P().get();
    const tabs = [["time", "🕒 時間"], ["weather", "🌤️ 天氣"], ["filter", "🎞️ 濾鏡"], ["cam", "🎥 鏡頭"]];
    layer.innerHTML = `
      <div class="ph-top">
        <button type="button" class="ph-btn" id="phClose" aria-label="離開拍照模式">✕</button>
        <span class="ph-title">📷 拍照模式</span>
        <button type="button" class="ph-btn" id="phBare" aria-label="收起面板" title="收起面板（H）">👁</button>
      </div>
      <button type="button" class="ph-show" id="phShow" aria-label="顯示面板">⚙</button>
      <div class="ph-panel">
        <div class="ph-tabs" role="tablist">${tabs.map(([k, l]) => `<button type="button" role="tab" aria-selected="${tab === k}" class="${tab === k ? "on" : ""}" data-phtab="${k}">${l}</button>`).join("")}</div>
        <div class="ph-body">${panelHTML(g)}</div>
        <div class="ph-hint">拖曳移動、兩指縮放旋轉${matchMedia("(pointer:fine)").matches ? "（滑鼠右鍵拖曳轉角度、空白鍵拍照）" : ""}</div>
      </div>
      <button type="button" class="ph-shutter" id="phShoot" aria-label="拍照"><i></i></button>`;
  }
  function body() { const b = layer && layer.querySelector(".ph-body"); if (b) b.innerHTML = panelHTML(P().get()); }

  /* ─── 拍照、預覽、存檔 ─── */
  function stamp() { const d = new Date(); return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + "-" + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds()); }
  function shoot() {
    const ph = P(); if (!ph || !layer) return;
    if (N.sfx) try { N.sfx.play("tap"); } catch (e) { /* ignore */ }
    ph.capture(canvas => {
      canvas.toBlob(blob => {
        if (!blob) return;
        flash();
        showPreview(blob);
      }, "image/png");
    });
  }
  function flash() {
    const f = document.createElement("div"); f.className = "ph-flash"; document.body.appendChild(f);
    setTimeout(() => f.remove(), 450);
  }
  function canShare(file) { try { return !!(navigator.canShare && navigator.canShare({ files: [file] })); } catch (e) { return false; } }
  function showPreview(blob) {
    closePreview();
    lastBlob = blob; lastURL = URL.createObjectURL(blob);
    const name = "諾文小鎮-" + stamp() + ".png";
    const file = window.File ? new File([blob], name, { type: "image/png" }) : null;
    const share = file && canShare(file) && !matchMedia("(pointer:fine)").matches;
    const el = document.createElement("div");
    el.className = "ph-preview"; el.id = "phPreview";
    el.innerHTML = `<div class="ph-card">
        <img src="${lastURL}" alt="剛剛拍的小鎮照片">
        <p class="ph-tip">${share ? "按「存到相簿」會打開分享選單，選「儲存影像」就會進相簿。" : (matchMedia("(pointer:fine)").matches ? "也可以在圖片上按右鍵另存。" : "也可以長按圖片儲存。")}</p>
        <div class="ph-acts">
          <button type="button" class="btn soft" id="phAgain">再拍一張</button>
          ${share ? `<button type="button" class="btn primary" id="phShare">存到相簿</button>` : ""}
          <a class="btn ${share ? "soft" : "primary"}" id="phSave" href="${lastURL}" download="${name}">下載</a>
        </div>
      </div>`;
    document.body.appendChild(el);
    el.querySelector("#phAgain").addEventListener("click", closePreview);
    const sb = el.querySelector("#phShare");
    if (sb) sb.addEventListener("click", () => { navigator.share({ files: [file], title: "諾文小鎮" }).catch(() => {}); });
    el.addEventListener("click", e => { if (e.target === el) closePreview(); });
  }
  function closePreview() {
    const el = document.getElementById("phPreview"); if (el) el.remove();
    if (lastURL) { const u = lastURL; setTimeout(() => URL.revokeObjectURL(u), 1000); lastURL = null; lastBlob = null; }
  }

  /* ─── 事件 ─── */
  document.addEventListener("click", ev => {
    const t = ev.target.closest && ev.target.closest("button");
    if (!t) return;
    if (t.id === "t3dPhoto") { ev.stopPropagation(); return open(); }
    if (!layer || !layer.contains(t)) return;
    ev.stopPropagation();
    const ph = P(), d = t.dataset;
    if (t.id === "phClose") return close();
    if (t.id === "phShoot") return shoot();
    if (t.id === "phBare") return document.body.classList.add("ph-bare");
    if (t.id === "phShow") return document.body.classList.remove("ph-bare");
    if (d.phtab) { tab = d.phtab; return render(); }
    if (d.phmin) { ph.set({ min: null }); return body(); }
    if (d.phwx !== undefined) { ph.set({ weather: d.phwx || null }); return body(); }
    if (d.phfilter !== undefined) { ph.set({ filter: +d.phfilter }); return body(); }
    if (d.phtoggle === "freeze") { ph.set({ freeze: !ph.get().freeze }); return body(); }
    if (d.phtoggle === "clean") { ph.set({ clean: !ph.get().clean }); return body(); }
  }, true);
  document.addEventListener("input", ev => {
    if (!layer || !layer.contains(ev.target)) return;
    const ph = P(), t = ev.target, v = +t.value;
    if (t.id === "phTime") {
      ph.set({ min: v });
      const lab = document.getElementById("phTimeVal"); if (lab) lab.textContent = timeText(v);
      const real = layer.querySelector("[data-phmin]"); if (real) real.classList.remove("on");
    }
    else if (t.id === "phTilt") { ph.set({ tilt: v / 100 }); const f = document.getElementById("phFocus"); if (f) f.closest(".ph-lab").classList.toggle("off", v <= 0); }
    else if (t.id === "phFocus") ph.set({ focus: 1 - v / 100 });
    else if (t.id === "phPolar") ph.set({ polar: v / 100 });
    else if (t.id === "phFov") ph.set({ fov: 84 - v });
  });
  // 小鎮畫面被換掉（切到別的分頁）就自動離開
  setInterval(() => { if (layer && !document.querySelector(".t3d-canvas")) close(); }, 1500);

  N.photo = { open, close, isOn: () => !!layer };
})();
