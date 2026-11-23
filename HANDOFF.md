# 諾文小鎮：交接說明（給接手的 AI）

這是一個手機優先的「小鎮觀察」網頁 App（PWA）。世界觀與 16 位角色是使用者的原創設定（時間融合時代 × 蓋亞聯邦，小鎮「諾文」）。使用者想要的感覺是：**他們在一個地方好好活著**，玩家主要是觀察，偶爾互動。

目前版本：v2.8.0

---

## 一、技術架構

- 純原生 JavaScript，**沒有建置步驟、沒有框架、沒有 npm 套件**。直接用瀏覽器開啟即可。
- 所有檔案掛在全域命名空間 `window.NOVUM`（程式裡簡寫成 `N`）。
- 3D 用 three.js r128，放在 `vendor/three.min.js`，第一次切到 3D 時才載入；裝置不支援 WebGL 時自動退回 2D 街區圖。
- 存檔在 `localStorage`，鍵名 `novum-town`。有兩個存檔槽：`real`（跟現實時間同步）與 `preview`（小鎮時間，可快轉）。
- `sw.js` 是 Service Worker，負責離線快取。**每次改檔都要把裡面的快取名稱版本號加一**（例如 `novum-town-v2.4.1` → `v2.4.2`），並且同步改 `js/app.js` 開頭的 `VERSION`。新增檔案時也要加進 `sw.js` 的檔案清單和 `index.html` 的 `<script>`。

### 本機測試
```
cd novum-town
python3 -m http.server 8765
# 用瀏覽器開 http://localhost:8765
node tools/validate.js .      # 檢查行程、地點、事件能不能觸發、禁用符號
```
手機版面以 390×844 為準，所有按鈕至少 44px 高。

---

## 二、檔案地圖

### 程式（js/）
| 檔案 | 內容 |
|---|---|
| `app.js` | 主程式：時間、存檔、畫面切換、觀察、相遇對話、互動、關係、聚會、節日、需求（餓／累／無聊）、日記、日報、通知、放著看模式、音樂按鈕、設定 |
| `engine.js` | 行程解析（`resolve`）、事件挑選、角色之間的閒聊與鬥嘴 |
| `town3d.js` | 3D 小鎮（建築、街道、日夜、天氣、走路的人、泡泡、貓／貓頭鷹／鴿子／路人、自動導演鏡頭）＋房間平面圖的等角 3D 視圖 `N.room3d`（家具 `furn()`、座位、分樓層） |
| `voxroom.js` | 房間的體素建模：每個房間用 0.1 公尺的小方塊堆出來（`InstancedMesh`），每顆方塊依鄰居多寡算角落陰影。家具外觀在 `vfurn()`；座位位置仍由 `town3d.js` 的 `furn()` 提供。房間配色、`dark`（只靠蠟燭）、`outdoor`（戶外地面）寫在 `data/interiors.js` 的 `theme` |
| `voxtown.js` | 體素小鎮：每個地點依類型（house、shop、tall、school、street、tower、park…）用 0.125 的方塊蓋出建築和院子（`design()`），地標細節在 `landmark()`，街區人行道在 `block()`，空格的小花園／背景小屋在 `filler()`。網格用貪婪合併、不畫朝下的面；窗戶玻璃和燈另外做成夜裡會發光的網格（用 town3d 的 `winMat`、`lampMat`）。town3d 的 `buildLot()` 會把舊幾何換成這裡的網格 |
| （小鎮街景・舊） | 小鎮改回平滑低多邊形的「微縮模型」風格（不再體素化）。`buildStreets()` 負責：每個街區四周的人行道（行道樹、路燈、垃圾桶、消防栓只放在人行道上）、各地點兩側的背景窄樓、門口生活小物（依店／家／學校不同）、地標細節（偵探社放大鏡、Hale’s 冒煙煙囪、甜點店甜甜圈…）、時間融合物（老爺車、紀元裂縫、蒸汽管線與齒輪）、路口斑馬線與紅綠燈、寬馬路邊停的車。馬路中線是居民走路的路線，不要在上面放東西 |
| `picto.js` | 角色的 3D 人形：像標誌那種站著的圓潤人形，身體用角色代表色，頭是頭像圖示（Sprite） |
| `life.js` | 生活層：每半小時（小鎮時間）跑一步，離線回來時補算。包含每日焦點、八卦傳播、物品流轉、蝴蝶效應（`chains` 排程後續）、紀元層異常、地點記憶、無聲互動。資料存在 `slot().life`；對外 `N.life.sync / onAction / placeHTML / gossipHTML / itemsHTML …`。v2.6 加上自主性：自主聚會、互相約人（`plansAt` 會覆蓋行程）、小圈子（群組 id 為 `circle:<id>`）、關係里程碑（`relChanged`，由 app 的 `setRel` 通知）、固定配對自己告白、進展速度 `store.pace` |
| `lofi.js` | 即時合成的 lofi 背景音樂（WebAudio，不用音檔） |

### 資料（data/）
| 檔案 | 內容 |
|---|---|
| `characters.js` | 16 位角色：`id`、`full`、`color`（代表色）、`role`、`traits`、`relations`；最後有 `NOVUM.avatars`（頭像檔名對照） |
| `schedules.js` | 每個人一週的行程，格式寫在檔案開頭的註解 |
| `locations.js` | 區域與地點 |
| `interiors.js` | 每個地點的室內家具（位置是房間寬深的 0～1 比例）；可以分樓層 `{ floors: [{ name, match, items }] }` |
| `floorplans.js` | 2D 平面圖 |
| `events-*.js` | 相遇事件（共約 470 則）。`lines` 是 `[說話的人, 台詞]`，`"＊"` 代表旁白 |
| `voices.js`、`voices-b.js` | 每個角色的說話方式、口頭禪、怎麼稱呼別人（`NOVUM.nick`）、兩兩鬥嘴（`NOVUM.banter`） |
| `phone.js`、`phone-voices.js` | 偷看手機的群組與私訊 |
| `relations.js` | 起始好感、年齡組、關係階段 |
| `festivals.js` | 節日、聚會、出遊 |
| `diary.js` | 睡前一行日記的句型 |

### 其他
- `icons/avatars/av01～av16.webp`：16 張頭像（使用者自己畫的）。
- `tools/validate.js`：資料檢查。
- `README.txt`：給使用者看的玩法說明（改功能時順便更新）。

---

- 房間背景隨時間變化：`roomLight()` 依夜晚程度把背景從白天的暖米色漸變到夜裡的深黑。

- 方塊小人：`js/blocky.js` 讀 `data/skins.js` 列出的麥塊 64×64 skin（`icons/skins/skNN.png`，編號跟頭像 avNN 相同，`slim` 表示細手臂），介面跟 `N.picto` 一樣。沒有 skin 的角色自動用圖示人形。新增 skin 時：放檔案、在 skins.js 加一行、把檔案加進 sw.js 的 FILES。

## 三、內容規則（很重要，請一定遵守）

1. 介面與所有文字一律**繁體中文**。
2. **絕對不要使用破折號**（U+2014 長破折號、U+2013 短破折號都不要），`validate.js` 會檢查。
3. 每個角色說話要**有鮮明的個人語氣**，不要大家講話都一樣。修改或新增台詞前，先看 `voices.js`／`voices-b.js` 裡那個角色的設定。
4. 角色有**自己的意志和生活**，不會無條件喜歡玩家或某個人；不要寫成中二台詞、口號式金句或誇張的告白。
5. 年齡規則：
   - 高中生**玫君 × 何禹瀧**是「拌嘴搭檔」，只能有清淡、純純的互動。
   - 國中生**黑子、櫻子、星星**完全沒有戀愛線。
6. 固定配對（`data/relations.js` 的 `NOVUM.cpPairs`）：史威特×沏萊爾、佐代×禮、玫君×何禹瀧、白×海爾，互相告白一定成功。使用者希望大家關係「只往好的方向走」，不要做關係變壞、冷戰。
7. 幾個固定設定：
   - 史威特：政治世家的長女，樂觀但保有優雅，和沏萊爾是青梅竹馬。
   - 玫君：冷淡、不太耐煩。
   - 何禹瀧：毒舌又輕浮，老是跟玫君拌嘴。
8. 畫面上**不要放給開發者看的註解或「暫定」字樣**。
9. 建築與房間是體素（方塊）風格。人物之後會改成使用者自己畫的 Minecraft 標準皮膚（64×64 PNG）做的方塊小人；在那之前維持「標誌人形＋代表色＋頭像圖示」。使用者明確不要換裝系統。

---

## 四、程式慣例

- 用 `$("#id")` 取元素；`esc()` 處理要放進 HTML 的文字。
- 點擊事件集中在 `app.js` 底部的 `document.addEventListener("click", …)`，用 `data-*` 屬性分派。
- 抽屜面板：`openSheet()`／`closeSheet()`，內容寫進 `#sheetBody`。
- 存檔：改 `store` 之後呼叫 `save()`；目前存檔槽是 `slot()`。
- 時間：`clockNow()` 取得小鎮時間；`currentWhere(clock)` 得到每個人此刻在哪、在做什麼。
- 3D 對外介面：`N.town3d = { mount, update, say, focus, flyLoc, setDirector, … }`、`N.room3d = { mount, update, stop }`。
- 房間家具：`town3d.js` 裡的 `furn(type, o, g)`，每種家具會回傳座位點 `{ x, z, pose: "sit"|"lie"|"stand", tag, y, face }`。`face` 是坐的人面向的角度（家具自己的座標），椅子用 `chair(g, x, z, 面向x, 面向z, 顏色)`。

---

## 五、可以接著做的功能（使用者還沒決定，先跟他確認要做哪個）

（v2.5 已經加入：離線補算、蝴蝶效應、八卦、物品流轉、紀元層異常、地點記憶、無聲互動與每日焦點）
1. **留言給他們**：在某人房間留紙條，他會在下一次對話或當天日記裡回應。（最推薦）
2. **季節與天氣的生活感**：下雪會積雪、冬天多圍巾、節日房間裡出現裝飾。
3. **房間會慢慢變**：依日常留下痕跡（玫君房間多鼓譜、禮的書越堆越高）。
4. **一週回顧卡**：每週日整理誰最常在一起、發生了什麼，可以存成圖片。
5. **照相模式**：在 3D 小鎮或房間按一下存下畫面，附上時間地點，放進相簿。
6. **偵探社的案子**：史威特偵探社偶爾接委託，幾天內不同角色去不同地點查線索，最後在黑板前結案。

### 已知的小問題
- 史威特偵探社 1 樓的沙發背對鏡頭，坐在上面只看得到頭像（可以在 `interiors.js` 把它轉向）。

---

## 六、交付前請檢查

1. `node tools/validate.js .` 沒有警告。
2. 瀏覽器主控台沒有錯誤；3D 小鎮、房間平面圖、2D 街區圖都能正常顯示。
3. `sw.js` 版本號與 `app.js` 的 `VERSION` 都更新了。
4. 新檔案有加進 `index.html` 與 `sw.js`。
5. 交回完整的資料夾（或 zip），讓使用者可以直接拖進 Netlify Drop 部署。

## v3.6.0 操控居民
- 觀察頁「🎮 操控」或 3D 小鎮人物卡「🎮 操控」進入全螢幕房間（app.js ctlStart / ctlEnter / ctlEnd，#ctl）。
- 點地板走過去、點家具（附近有座位）出圓環選單、點別人出互動圓環（N.actions＋戀愛線），對話在下方對話框一句一句看。
- WASD／方向鍵、手機左下搖桿直接走（town3d ctlStep，用房間 occupancy 擋家具）。
- 「出門」選地點：用 s.assign[id]（ctl:true）讓小鎮知道他在哪；結束操控就刪掉指派回到行程；睡覺時間到自動結束。
- town3d：N.room3d.control(id, hooks)、ctlGo、ctlUseSpot、ctlMove、ctlApproach；鏡頭跟著操控的人並放大。

## v3.7.0 高畫質城市（電腦版）
- js/voxcity.js：10 公分一格的城市建築。每層樓一種風格（E 歐式、C 中式、J 日式、Y 賽博龐克），上層換風格時往後縮一格、加支架或鐵皮雨遮（加蓋感）。每棟蓋在共用的稀疏格子裡，合併同色面成網格（牆內側面不畫、瓦片一排一色）。
- 區域主風格：POOL（central0 歐、central1 日歐、academy 歐中、oldtown 中日、outer 賽博混搭）；指定地點外觀在 SPEC；styleOf(l) 給外觀，室內也照它配色。
- town3d：BLOCK 改成 3×3 棋盤（學院北、舊城西靠河、外城東、住宅南，中央街區有鐘塔廣場），roads 多一條 z=52.5，不再有火車。
- 畫質：localStorage「novum-quality」auto/high/low（設定裡「3D 畫質」）。auto＝滑鼠操作＋螢幕寬 ≥1000 用高畫質；一般畫質維持 voxtown.js。
- 高畫質後製 makePost：HalfFloat 渲染目標 → 亮部柔和收住（防過曝）＋移軸景深；小鎮的霧跟著鏡頭距離蓋住城市外圍。
- 室內：styleTheme(id, 樓層) 照外觀風格換牆、護牆板、窗框、窗戶造型、主燈（歐式燭台／碗型、中式紅燈籠、日式紙燈籠／吸頂、賽博工業風／燈泡串）。
- 放燈原則（roomLight）：光量＝面積×0.05×(1−0.35×牆亮度)，主燈七成、小燈三成；主燈 0.3+0.7×夜、小燈 0.55+0.45×夜；燈色偏橘；陰暗房間不開主燈。
- 試做頁：proto.html（街景＋甜點店室內燈光）、proto.html?scene=mix（風格交錯疊加）。

## v3.7.3 圓形城鎮＋假山＋光影
- GRID 只保留 hypot(colX,rowZ) ≤ RC(84) 的街區，城鎮是圓的；地面也是圓
- 鏡頭目標限制在 RC·0.82 內，HQ 最遠 105；Q/E 旋轉、R/F 俯仰、右鍵/Shift/Alt 拖曳旋轉
- voxCity.mountains：RC+34 到 RC+120 的環形假山（草→岩→雪），自訂 fog 只吃 62%，遠處看得到稜線；城外一圈樹
- HQ：太陽與陰影跟著鏡頭走（每 12 格），日照 ×1.18、環境光 ×0.78；夜晚 14 盞彩色點光源照亮附近路燈的牆面
- HQ 霧：near = dist·0.7+22，far = near+125

## v3.7.1 城市擴散
- GRID（town3d）：11×9 格的棋盤，橢圓形範圍內都有街區。正中間一整格是鐘塔廣場（voxCity.clockTower＋石板廣場＋樹、長椅、花圃）；廣場旁的十字大道寬 7，其他巷道 4.5。
- 九個有地點的街區分散在 LOC 指定的格子；其他格子：靠近中心的是細緻的裝飾街區（voxCity.filler），外圍是 40 公分一格的簡化街區（voxCity.farBlock），再外面是霧。
- sideX／roads 改用 GRID.sideOf、GRID.zr；鐘塔廣場的位置和旁邊的路特別處理（isPlaza）。
- 大道的中線、斑馬線、紅綠燈、停的車、鎮民散步路線都照 GRID 算。

## v3.8.0 裝飾街區、夜市、地下湖
- voxcity.js `block(T, { key, seed, lite })`：裝飾街區（HQ 的 near／far 格子都用它；一般畫質仍是 voxTown 小屋＋farBlock）。四排房子（南北各 22.4 公尺、東西夾在中間），全部正面朝外，中間 6.4×17.6 公尺中庭（`courtyard`）。房子是樣板 `template(pool, 寬, 款式, lite)`：同一套 `building()` 蓋好後存成陣列，`merger()` 旋轉後合併成每個街區三個網格（法線、顏色用 8 位元）。寬度從 `WIDTHS`（4.8～9.6 公尺）切。
- `LITE`：遠處用，牆面花紋變平、瓦片不分排、不加凸出的小東西、不投影子。
- `sideBack()`（每層都跑）：側窗（深度每 2.4 公尺一扇）、背面窗、後門；非 LITE 再加排水管、冷氣、晾衣竿（中日）、陽台（歐）、鐵梯與管線（賽博）。`roof()` 在山牆加小窗，閣樓內部標成 inside，屋瓦內側不畫；meshBox 不畫貼地的底面。
- 夜市：`town3d nightStreet(l)` 算出旁邊大道的位置；`voxCity.marketStreet(T, { len, width, seed })` 兩排攤子＋燈籠串，轉 90 度擺到大道上。lots["諾文夜市"] 的 x、z 是街上中點（居民站在街上），原本的格子用 voxCity.lot（HQ）／voxTown street（一般）蓋一排小吃店，SPEC 有「諾文夜市」。
- 地下湖：`voxCity.lakeGate(T)`（兩種畫質都用），居民站在洞口前（spotFor 的 lake 分支）。房間尺寸在 interiors-extra.js（18×14），湖面和碼頭（`dock` 支援 `l` 長度）在 interiors.js。
- 效能參考（HQ 全城）：約 450 萬三角形、幾何資料約 260 MB（原本約 310 萬、250 MB）。
- town3d_debug() 多回傳 cam，方便截圖測試。

## v3.9.0 戶外平台＝小鎮模型、在小鎮上操控
- 戶外地點（interiors 有 outdoor 且不是 dark）＝「平台」。town3d `platModel(id)` 用 voxRoom.build（`{ noMesh: true }`，回傳 grid）蓋出跟房間一樣的擺設，再用 `voxCity.fromVoxels` 分 6.4 公尺一塊轉成合併網格；`placePlat(id, x, z, rot)` 擺進小鎮（高 0.16、縮 1/1.6），座位 `spots`、擋路 `occ`、`tw()`／`local()` 座標轉換都掛在 lots[id].plat。
- 尺寸在 interiors-extra.js：一般 11.2×11.2；鐘塔廣場 22.4×33.6（`noGen` 不自動補植物，大鐘塔是 voxroom `clocktower` 的 `big`）；夜市 13×7（沿大道轉 −90°）。地下湖仍是房間（18×14），小鎮上是 lakeGate。
- buildPlaza 改放廣場平台；buildStreets 的廣場樹、長椅只在沒有平台資料時才放。update() 讓平台上的人照 `sit` 座位坐。
- 小鎮操控（town3d 最後一段，對外 `N.town3d.ctl`）：`walkGrid()` 0.35 單位一格（城外、裝飾街區、建築格子、平台家具擋路），`wPath` A*（二元堆積）＋拉直；`tControl(id, hooks, { loc, at })`、`ctlGo`、`ctlMove`、`ctlUseSpot`、`ctlApproach`、`doorPos`、`isOutdoor`。`tFrame` 處理搖桿移動、走進平台換地點（hooks.onLoc）、走到門口／湖口（hooks.onDoor）。操控中地名牌隱藏，鏡頭拉近、俯角 0.42。
- app.js：`CT()` 依 `ctl.mode`（"town"／"room"）選用 town3d.ctl 或 room3d；`ctlEnter(loc, opt)` 戶外或 `opt.street` 走 `ctlTown()`（把小鎮 canvas 掛到操控畫面）；出門面板多「走到街上」（data-ctl="street"）；ctlTick 在小鎮模式時更新 town3d。
- marketStreet（v3.8 的沿街攤子）已不用，留著備用。
- v3.9.1：戶外地點在 interiors-extra.js 都設 `noGen: true, add: []`（不自動補東西），擺設全寫在 interiors.js（表演廣場、草藥市集在 interiors-extra.js）。voxroom `draw()` 支援 `o.k` 整件縮放；戶外沒寫 k 時用 `OUTK` 預設（樹 2.6、路燈 1.6、噴水池 2、石燈 1.3、井 1.4、灌木 1.5、花 1.3、書報攤 1.25、攤子 1.4、石頭 1.4、盆栽 1.4）。furn() 的 stall 站位跟著 k。

## v3.10.0 小配件、招牌、夜景
- voxcity.js `extras()`（building() 蓋完樓層和屋頂後呼叫，LITE 不跑）：正面每層在窗與窗之間隨機放冷氣／通風口／電錶箱／小點燈；賽博樓層的霓虹圖示；直式燈箱（中日賽博 55%、歐式 22%）；歐式鐵架吊牌；屋頂天線＋航空燈（`F_BLINK`，第四組材質 `blink`，`voxCity.tick(t)` 讓它閃）、水塔、碟形天線、屋頂看板。圖示在 `ICONS`（7×7）。
- `Box.tint`：building() 期間開，F_WIN 的格子依 1.6 公尺見方＋樓層的雜湊換成暖／冷／粉／不亮。
- town3d `buildOverheads()`（HQ）：路口兩側、門前小路的電線（LineSegments）＋燈籠／燈泡（InstancedMesh，`OVH.lanMat` 隨夜晚調亮）＋小旗子；窄路的空橋 `voxCity.skywalk`。兩端只掛在有房子的地方（平台、空地不掛）。
- makePost 加光暈（亮部抽出→半解析度兩輪模糊→加回），`bloom` 由 town3d 依夜晚設定；房間 bloom=0。名牌、泡泡 sprite 放 layer 1，在後製之後另外畫（背景要暫時設 null，否則 three 會清畫面）；點擊的 Raycaster 要 `layers.enableAll()`。
- 高畫質全城約 480 萬三角形、幾何約 290 MB。
- v3.10.1：bloom＝夜晚×0.42、門檻 0.88，白天 0；地上光圈 buildLampPools 2.4 單位內只放一個、HQ 透明度 0.5；夜晚點光源 0.9。extras() 加鷹架（r(16) < 0.08）與跑馬燈（`F_TICK` 第五組材質 `tick`，shader 依世界座標切點陣、`uTime` 由 voxCity.tick 推進）。材質群組編碼改成 grp×2^24（0～4）＋occ×2^27。
- v3.10.2：storey() 的 Y 風格：窗改成 6×7 一扇扇（交給 Box.tint 上色）；每層 `board()` 掛 1～2 塊招牌、店面上方一塊、直立燈箱用 `signCol()`（SIGNC 12 組底色＋字色）。拿掉每層頂的粉／青燈條；SIDEWIN.Y 改成小窗；farBlock 的粉紅燈條拿掉。
- v3.10.3：Y 風格招牌（storey）改成「招牌欄＋散落＋刀旗」，board() 多 `dz`（凸出深度，有支架）。voxroom `PROP`／`prop()`：戶外掛半空的東西自動加柱子（string）或背板＋腳（wall）。platModel 算 `stand`（沒被占的格子，間隔 0.75 公尺），update() 沒座位的人站那裡。夜市：interiors-extra `noFloor`（小鎮上濾掉 y<0 的地板）、尺寸 13×8.6；nightStreet() 依兩側實際邊界（地點街區人行道 1.2、裝飾街區 0.3）算中心和寬。

## v3.11.0 魔導科技、彩色夜景
- makePost 多 `grade`（夜晚調色：飽和×1.45、對比、冷暖分離、暗角），town3d 依 nightFactor 設；HQ 夜晚 hemi 改深藍紫、sky 0x140E2A；nightLights 22 盞、2.6～4.4 高、顏色飽和化（低飽和的換成洋紅／青／橘／紫），強度 1.25；地上光圈 HQ 0.22。
- voxcity 新材質群組：`holo`（F_HOLO，加法混色半透明＋掃描線）、`flow`（F_FLOW，沿世界座標的光脈衝）；群組編碼 0～6。extras()：魔力管線（r(40)<0.4）、全息牆前圖示（含 Y 樓層 r(30)<0.45）、屋頂全息（平頂 r(35)<0.25）。Y 樓層 storey：heroF 那層一塊主招牌，其他招牌改小。
- voxtown.block `info.crystal`：i%4===0 的路燈換托架並回傳 crystals；town3d `buildCrystals()`／`crystalFrame()`（InstancedMesh 八面體，CRYC 依區域上色）。buildOverheads 每 5 條電線 1 條魔力線（OVH.manaMat）。
- 天空：`buildSky()`（HQ）九座 `voxCity.island()`、`SKYO.relic` 巨劍（剪影＋EdgesGeometry 發光邊＋兩個符文環），`skyFrame()` 每幀；星星 1400 顆有顏色、半數在銀河帶。camera far 1200；HQ 俯仰上限 1.5，>1.25 時視線往上抬（placeCamera）。
- HQ 全城約 490 萬三角形。
- v3.11.1：grade 飽和 1+0.2×grade、點光源飽和×0.8。template() 依 hk 分矮／中（<0.3，4～5 層）／大樓（<0.08 且寬≥64，7～10 層）；extras() n≥6 加轉角直立大招牌；屋頂看板支架往下接到實體；屋頂全息加框、牆前全息加支撐臂。

## v3.12.0
- voxcity courtyard()：草地＋十字路＋中央噴水池＋四角（樹／櫻花／花圃／灌木長椅），網格墊高 0.12 公尺（不然被 town3d 的街區地坪蓋住）。extras()：爬藤 r(60)<0.3、窗台盆栽 r(63)<0.45、屋頂花園（平頂 r(67)<0.4）。
- town3d `buildMagic()`（HQ，在 buildSky 後）：法陣（canvas 畫的符文圈，加法混色平面）、全息螢幕（canvas 面板），`magicFrame()` 由 skyFrame 呼叫；星座 LineSegments＋Points 在天球半徑 590，依夜晚淡入。town3d_debug() 多回傳 GRID。
- v3.12.1：buildMagic 只留廣場法陣。extras() 爬藤：r(60)<0.88，每棟 2～5 片（face 正 40%／側 35%／背 25%，三成由簷往下垂），主莖蜿蜒＋左右葉片，葉色以 4 格區塊取兩色（減少網格）。HQ 全城約 590 萬三角形、載入較久。
- v3.12.2：爬藤 r(60)<0.7、1～2 片、寬 10～26 格、密度 0.68 起、高度 0.6～2.4 層。
- v3.12.3：爬藤 q0／q1 固定左右側牆，q2（四成）正面或背面；側牆高度 Ht×0.45～0.9；出現率 92%（雜湊改用 sd>>3 與寬、層數）。
- v3.12.4：nightLights 改成 lampClusters()（同色相 8 分、6.5 單位內合併，顏色依位置固定）＋ nightLightsFrame()（每 0.4 秒依距離／群大小挑、間隔 5 單位，淡入淡出 2.5/s）；HQ 霧固定 80～215。

## v3.13.0 手機城市（quality "mobile"）
- town3d `MQ()`；`HQ()` 對 high 和 mobile 都是 true（走 voxCity 那條路），MQ 再減量：GRID 只蓋 r≤0.5 的裝飾格、裝飾街區全用 lite（但有中庭 `yard`）、地點兩旁陪襯樓 lite（lot info.lite）、山 `mountains(…, coarse)` 4.8 公尺一格、點光源 6 盞（距離 14）、makePost amount 0（跳過景深迴圈）且 bloom 0、pixelRatio ≤1.25、陰影貼圖 1024、浮島 4 座、霧 55～150、鏡頭最遠 75。auto：滑鼠＋大螢幕→high，其他→mobile。
- 手機城市約 220 萬三角形、幾何約 160 MB（電腦高畫質約 590 萬、350 MB）。
- v3.13.1：app.js `isPhone()`（非滑鼠或螢幕 <1000）：use3d() false、canTown() false、隱藏 3D/街區切換和畫質設定。town3d quality() auto 的非電腦→"low"（房間不用 HQ 後製）。

## v3.14.0 第一人稱
- town3d `FP`（on/yaw/pitch），`setFP()`（near 0.04、markCull、從門出來時面向巷口）、placeCamera FP 分支（眼高 0.94 單位）、bindInput FP 分支（pointer lock / 拖曳）、tFrame 移動方向用 FP.yaw、自己的 walker 隱藏、post amount 0、霧 28～118、`cullFrame()`（FP 時隱藏距離 >112 的 root 子物件）。`fpInteract()`／`tCtl.aim()`：準心射線對人；地面點附近的門（doorAt 1.4）／座位。tCtl.fp/isFP/interact/aim。tControl 的 opt.at 改成 doorOf+0.35 往外找能走的格子。
- app.js：ctl.kd 的 V（切換，ctl.fp 記住）、E（互動）；`ctlFPUI()` 準心＋提示（每 0.2 秒 aim）；`ctlFade()` 改成載入畫面（.ctl-load），then 後 650ms 淡出；ctlTown 掛好後若 ctl.fp 就恢復第一人稱。
- v3.14.1：town3d `WALK`=1.0 單位/秒，搬家路線 speed=clamp(total/40, WALK, 1.8×WALK)；TSPEED 1.1、TRUN 2.2（Shift，全域 shiftDown）；folk 0.8～1.25；房間 1.3；blocky update 依 o.speed 調步頻、步幅。
- v3.14.2：routeTo 改用 wPath 網格 A*（起點/終點走 doorOf±0.35，失敗退回 routeToOld）；render 時 ctl.mode==="town" 不呼叫 renderTown3d（單例 canvas 會被搬走）；ctlTick 戶外地點不 ctlFade；ctlTown 已有 canvas 直接更新 HUD；tCtl.setBusy 選單/對話開啟時 exitPointerLock、擋 fpInteract；FP 名牌 k=0.13+min(0.2,d×0.022)、泡泡 clamp(d×0.035,0.11,0.3)。
- v3.15.0：voxcity storey() 一樓結尾呼叫 frontage()（台階/腳踏墊/盆栽/A 字牌/販賣機/菜攤/腳踏車，樣板快取共用）；block(info.alley "w"|"e") 該排在 c=72～104 格留 3.2m 空，alleyGate() 蓋門樓＋石板＋燈串；town3d alleyOf(c)（HQ 非手機的 near 街區，1/5 沒有）傳給 voxCity.block 與 voxTown.block（人行道巷口前不放東西），walkGrid 在 rect 之後 open() 中庭與巷子；voxTown.block 加 furn() 街道家具與路口石柱；buildEntrances()/entranceFrame()：門楣 CanvasTexture 木牌、壁燈、lampSpots 光圈，FP.aimDoor 由 tCtl.aim 設定。
- v3.15.1：voxtown mesh() 原本完全不畫朝下的面，改成只略過 y≤2 貼地的底面。
- v3.16.0：GRID 改 NC=6/NR=5，rb(x,z) 不規則輪廓（RB(θ) 疊波），kind 新增 open/harbor；coastAt(z)＝每排最西格往外 8 → 滑動最小值 → 高斯平滑 → 局部外凸；basin 挖掉 j=-1 最西格；coast 折線、seaAt、onRoad。buildCoast()：Batch（多方塊合成單一網格、noVox）蓋海/陸多邊形、路網（格子±3.6）、路緣、岸壁、步道、欄杆/繫船柱、路燈、港池、棧橋、防波堤燈塔、isle+archBridge（COAST.bridge/isle → groundAt 讓走路有高度）、浪花；coastFrame() 動畫；buildOutskirts() 田/樹/農舍。voxTown.park（park/plaza/garden）、voxTown.harbor（倉庫/貨櫃）。walkGrid 範圍改由格子算，海不能走、步道/橋/島能走。mountains() 第 5 參數 isSea 回傳 1＝海、0～1＝靠海變矮。clampTarget 改用 rb。
- v3.17.0：GRID 改成島：所有格子（含港池格）往外 8＋bump 的歐氏距離做 0.5 格陸地遮罩，挖港池、填內陸水窪，倒角距離場 coastDist，沿陸地格外框描封閉折線＋Chaikin×3 → GRID.coast（陸地在右手邊）。seaAt/coastDist 取代 coastAt。buildCoast：海＝大方塊挖洞、島＝岸線多邊形；spot(score, dir) 沿岸線找棧橋/防波堤/離島位置；railBridge()（COAST.railPiers 擋走路格、COAST.train 在 coastFrame 動畫）。buildOutskirts 不再呼叫。open/harbor 格子不放地坪 slab。
- v3.17.1：buildCoast 的欄杆/繫船柱/壓頂移到 railings()，在所有 features 擺好之後跑；用岸線頂點的斜接平移（off(i,d)）蓋相連的段。
- v3.17.2：buildLife 不再產生 life.folk；buildTraffic() 用 xr×zr 路口建路網（邊上每 1/10 取樣要 onRoad 且 coastDist≥3，排除 nightStreet 那段直向街），carsFrame() 移動（注意：原本就有 trafficFrame(tt) 是紅綠燈，別撞名）。大道車道偏移 1.4、窄街 0.55。停車 rnd 門檻 0.45→0.85。
- v3.18.0：GRID.AW=9.5/NW=6.5/SIDEW=2.05/ROADE=AW/2+0.1，onRoad/路網方塊/路緣/島遮罩都用 ROADE；GRID.walkway()。voxTown.block S=14、物件位置以 S 推算。walkGrid 另建 WG.ped（車道擋起來、只留 xr×zr 路口）＋WG.cost；wPath→wPath2(ped) 失敗退回全格；A* 改 Float64＋closed set（舊版 Float32＋重複出堆在 47 萬格上會跑滿 guard 失敗）。far 格子也蓋 voxTown 人行道。
- v3.19.0：town3d 房間區新增 RFP（透視鏡頭、roomFPWalls() 右牆/前牆含門/天花板、roomFPCam、roomFPAim、roomFPInteract）；placeRoomCam/roomFrame 依 RFP.on 換鏡頭；ctlStep 用 RFP.yaw；N.room3d 新增 fp/isFP/aim/interact/setBusy/_dbg。app：V/E 改用 CT()（town 或 room），ctl-top 加 👁 按鈕（data-ctl="fp"），updateRoom 掛上 control 後套 setBusy、ctl.fp 時開 room FP；ctlFPUI 在房間也顯示準心（ctl.mode 一開始是 undefined＝房間）。
- v3.19.1：SKY/SUNC/HEMIC 重寫，新增 GNDC（hemi 地面色）與 morningK/eveK；applySky 依 mk/ek 調 sun/hemi 強度；makePost 新增白天調色 uniform dSat/dCon/dHi/dSh（每幀在 townPost 依時間設定，房間的 post 維持 0）。
- v3.19.2：voxroom windows() 記錄 th._wins（公尺）；town3d windowSun(min,nf,allow)：RM.sun 放左後方窗外、投影子（radius 3、HQ 2048）、RM.lid 隱形擋光天花板（colorWrite:false、只投影）、RM.shafts 光柱（窗角沿光線投到地板的四面體、Additive）。roomLight 在有陽光時壓低 hemi 和主燈。
- v3.19.3：WALK=1.1、route 速度 WALK×(0.94～1.06)。app state3d 多給 ahead（12 分鐘內誰要換地方、幾分鐘後）和 rate（時間流速）；currentWhere(clock, peek) 的 peek 不清除到期指派。town3d update 依距離×1.3＋4 ÷ WALK 換算成遊戲分鐘，不夠就把那個人歸到下一個地點先走。
- v3.19.4：roomFPWalls 的門板標 RFP.door；roomFPAim 回傳 {kind:"exit"}；ctlStep 在 FP 往門走（z>D/2-0.5，或 1.5 內被擋住）呼叫 hooks.onExit；app CTL_HOOKS.onExit：canTown() 時 ctlFade→ctlEnter(loc,{street,at:doorPos})，否則 ctlOut()。
- v3.20.0：新檔 data/shops.js（N.money、items、shops、borrowBooks、giftPref、okLines/winLines/loseLines、moreActs{group together|small|game, go, need, gain}、loveMore{need, dating, adult}、dateSpots、loveSpecial{anniv, fest}），index.html 與 sw.js 都要列。app.js 新區塊「錢包、背包、商店、更多互動」：wal(id)（slot.wallet[id]={money,bag,pay,work}，pay 依 dayKeyOf 每天補 daily）、ctlShop/ctlBag/shopClick（ctl-panel 內 data-shopbuy/shopeat/shopact/bageat/baggive/giveto/datespot，ctlClick 先攔）、giveGift（prefTier love>dislike>like>neutral）、startGen(title,lines,cast,loc,delta,afterAct)（ctlTalkNext 結束時用 enc.afterAct 設 act）、doMore（moreActs/loveMore/anniv/festdate，doInteract 開頭轉過來）、moreWhy（null＝不顯示、字串＝原因）、dateWhy、annivInfo（r.since 遊戲日、r.anniv 已過的里程碑 "w"/"m{n}"，confess 成功時設 since）、festDateOf（r.fest＝dayKey+節日 id）、doDateSpot、moveSelf（操控中就 ctlFade 換房間）。ctlPersonRing → ringMenu(a,b,group,x,y) 分類子選單；ctlRing n>8 半徑 112。computeDelta 多一個 base 參數。ctl-top 新增 .ctl-shopbtn（shopAt(ctl.loc) 才顯示，手機只顯示圖示）與 🎒。除錯用 N._shopDbg。
- v3.20.1：town3d MM 小地圖：mmBase() 第一次開 FP 時畫底圖（2px/單位；陸地底色→每格 ROADE 外擴當街→街區依 kind 上色→seaAt 逐像素蓋海（coastDist 深淺）→isle、bridge），mmShow 把 .fp-minimap 掛在 host、unmount 時拿掉，mmFrame(dt) 在 frame 的 tFrame 後呼叫，每 0.1 秒依 FP.yaw 旋轉（rot=-π/2-atan2(fz,fx)），view 48／放大 110。房間第一人稱沒有小地圖。
- v3.20.2：閃爍修正：voxtown mesh()／voxcity emit() 朝上的面四邊外擴 0.02 格、側面若上方沒方塊則上緣下壓 0.02 格（蓋 T 字接縫、避免側面在地板接縫跟鄰格地板 z-fighting）；voxify 片段著色器用 fwidth(q) 依每像素格數淡出格線與每格明暗（m.extensions.derivatives）；makePost 的 rt 在 WebGL2 用 WebGLMultisampleRenderTarget samples 4；shadowCenter() 粗對齊 6 單位後投到光源座標對齊影子貼圖像素，FP 時中心在眼前 26 單位；near/far 格地坪、街區地坪頂 0.1→0.06，鐘塔廣場貼圖平面 0.1→0.06；FP camera.near 0.1。
- v3.21.0：lofi.js 加 SONGS（mel 兩段「位置:音名:長度」字串 → melP[段][32 格]，melOct、bars；前奏 4 小節、bar≥4 才有旋律、最後 4 小節無旋律、total-2 開始淡出、bar≥total 呼叫 next）、新音色 marimba/flute/bell/harp/strings、鼓 bossa/chug/shuffle、bed rain。播放模式 mode list|place：place 時 app 的 setTheme 才生效；list 用 order（shuffle 洗牌、第一次先放 SONGS）。API：tracks/playTrack/next/current/progress/mode/setMode/shuffle/restore/onChange。app.js：radioHTML() 放在 townTopHTML、updateRadio/updateRadioProgress（每秒）、openMusicSheet/renderMusicSheet（sheetState.type "music"）、musicClick；store.ui.musicMode/track/shuffle。
- v3.22.0：js/sfx.js → N.sfx.play(name)（tap/open/close/pop/ring/coin/cash/eat/ticket/gift/heart/gain/door/notify/win/lose/toggle）、setOn、setVolume；自己的 AudioContext。app.js：document click 對所有 button 播 tap；openSheet/closeSheet、nextLine/ctlTalkNext、finishEncounter（amt>0：戀愛類 heart、其他 gain）、ctlRing、ctlFade（door）、shopClick、giveGift 各自播；store.ui.sfx/sfxVol，設定頁 #sfxBtn、#sfxVol。index.html、sw.js 有加 js/sfx.js。
- v3.22.1：大道路口（AX×AZ）斑馬線條數 nS=floor((AH-0.45)/0.5)，跨全路寬；刪掉那四個路口的紅綠燈（traffic 陣列現在是空的，trafficFrame 不影響）；刪 rift(plaza.x-2.6, plaza.z-2.6)。debug 匯出多了 scene。
