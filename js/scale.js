/* 諾文小鎮：比例預覽（試做中）
 * localStorage "novum-scale" = A／B／C 切換小鎮的比例，沒設就是原本的樣子。
 *   person：小鎮上居民放大幾倍　aw／nw：大道、一般街寬（單位）　tree：行道樹放大幾倍
 *   outTree／outLamp：廣場、公園的樹和路燈（房間平台）放大幾倍　lamp：人行道路燈高度（格，0.2 公尺）
 *   lakeK：地下湖洞口放大幾倍　door：歐式大門頂（格，0.1 公尺；其他風格少 3 格） */
(function () {
  "use strict";
  const N = window.NOVUM = window.NOVUM || {};
  const P = {
    "": { person: 1, aw: 9.5, nw: 6.5, tree: 1, outTree: 2.6, outLamp: 1.6, lamp: 22, lakeK: 1.5, door: 25 },
    A: { person: 1, aw: 9.5, nw: 6.5, tree: 1.5, outTree: 4.2, outLamp: 1.75, lamp: 18, lakeK: 1.0, door: 25 },
    B: { person: 1.3, aw: 6.5, nw: 5.0, tree: 1.3, outTree: 3.6, outLamp: 1.9, lamp: 20, lakeK: 1.2, door: 28 },
    C: { person: 1.2, aw: 7.0, nw: 6.0, tree: 1.4, outTree: 4.0, outLamp: 1.85, lamp: 19, lakeK: 1.1, door: 28 }
  };
  let k = ""; try { k = (localStorage.getItem("novum-scale") || "").toUpperCase(); } catch (e) { }
  N.SC = Object.assign({ key: P[k] ? k : "" }, P[k] || P[""]);
})();
