/* 諾文小鎮：商店、背包、更多互動、戀愛選項
 *
 * 錢：每個居民有自己的零用錢（諾幣），每天領一次；在店裡打工也能賺。
 * 背包：在店裡買的東西放進背包，可以自己吃／用，也可以送人。
 *
 * items：東西。tags 是給「喜不喜歡」對照用的標籤；eat 有的話可以吃（自己吃、內用、餵食）。
 * shops：可以互動的店（地點 id）。items：賣什麼　acts：店裡能做的事（eatin 內用、show 看展、perform 看演出、borrow 借書、work 打工）
 * giftPref：每個人 love（最喜歡）、like（喜歡）、dislike（不太喜歡）的標籤。送禮：最喜歡 +8、喜歡 +5、普通 +2、不太喜歡 +0（客氣收下）。
 * moreActs：一般互動（一起做事、小動作、小遊戲）；loveMore：親密小動作；dateSpots：約會地點。
 * 佔位：{me} 說話的人（敘述用）　{other} 對方（敘述用）　{to} 對對方的稱呼（台詞用）　{place} 現在的地點　{go} 要去的地點　{item} 東西　{fest} 節日
 */
window.NOVUM = window.NOVUM || {};

NOVUM.money = { name: "諾幣", start: 300, daily: 150 };

NOVUM.items = {
  // ── 甜點店 ──
  tart: { name: "草莓塔", icon: "🍓", price: 45, tags: ["sweet"], eat: "{me}咬下一口，酥皮碎得到處都是，酸甜的草莓汁沾到了嘴角。" },
  macaron: { name: "馬卡龍禮盒", icon: "🍬", price: 60, tags: ["sweet", "cute", "gift"], eat: "{me}挑了一顆淡紫色的，外殼一咬就碎，裡面是薰衣草奶油餡。" },
  cocoa: { name: "熱可可", icon: "☕", price: 30, tags: ["sweet", "drink"], eat: "{me}捧著熱可可吹了吹，鼻尖沾到一點奶泡也沒發現。" },
  tea: { name: "伯爵紅茶", icon: "🫖", price: 30, tags: ["tea", "drink"], eat: "{me}慢慢喝了一口紅茶，佛手柑的香氣在舌尖散開。" },
  choco: { name: "手工巧克力", icon: "🍫", price: 85, tags: ["sweet", "gift"], eat: "{me}剝開一顆巧克力，裡面藏著一點點蘭姆酒的香氣。" },
  puff: { name: "鐘塔泡芙", icon: "🧁", price: 40, tags: ["sweet"], eat: "{me}一口咬下鐘塔形狀的泡芙，卡士達醬從另一頭擠了出來。" },
  // ── Hale’s Oven ──
  croissant: { name: "剛出爐的可頌", icon: "🥐", price: 30, tags: ["bread"], eat: "{me}撕開還冒著熱氣的可頌，一層一層的奶油香撲了滿臉。" },
  cinnamon: { name: "肉桂捲", icon: "🌀", price: 35, tags: ["sweet", "bread"], eat: "{me}從外圈開始一圈一圈地撕著吃，指尖都是糖霜。" },
  stewbread: { name: "燉肉麵包碗", icon: "🍲", price: 55, tags: ["hearty", "bread"], eat: "{me}挖了一大匙麵包碗裡的燉肉，整個人都暖了起來。" },
  latte: { name: "熱拿鐵", icon: "☕", price: 35, tags: ["coffee", "drink"], eat: "{me}喝了一口拿鐵，拉花的葉子在杯裡慢慢散開。" },
  soup: { name: "今日濃湯", icon: "🥣", price: 40, tags: ["hearty"], eat: "{me}拿麵包沾著濃湯吃，碗底很快就見了光。" },
  // ── 夜市 ──
  ramen: { name: "豚骨拉麵", icon: "🍜", price: 70, tags: ["hearty", "ramen"], eat: "{me}呼嚕呼嚕地吸著麵，湯頭濃得在嘴唇上留了一層亮亮的油光。" },
  chicken: { name: "炸雞排", icon: "🍗", price: 60, tags: ["hearty", "fried"], eat: "{me}咬下一口雞排，酥脆的聲音大到旁邊的人都回頭看。" },
  squid: { name: "烤魷魚", icon: "🦑", price: 50, tags: ["seafood"], eat: "{me}拿著竹籤啃烤魷魚，醬汁滴到手腕上，趕緊舔了一下。" },
  tanghulu: { name: "糖葫蘆", icon: "🍡", price: 30, tags: ["sweet", "cute"], eat: "{me}咬下一顆糖葫蘆，糖衣喀啦一聲裂開，酸得瞇起眼睛。" },
  boba: { name: "珍珠奶茶", icon: "🧋", price: 40, tags: ["sweet", "drink"], eat: "{me}用力吸了一口，一顆珍珠卡在吸管裡，憋了好久才吸上來。" },
  donut: { name: "糖霜甜甜圈", icon: "🍩", price: 35, tags: ["sweet", "donut"], eat: "{me}咬了一口甜甜圈，糖霜掉了一身，乾脆不管了。" },
  // ── 轉角騎樓（販賣機、零食攤） ──
  cancoffee: { name: "罐裝咖啡", icon: "🥫", price: 25, tags: ["coffee", "drink"], eat: "{me}拉開罐裝咖啡的拉環，喝了一口，苦得剛剛好。" },
  soda: { name: "彈珠汽水", icon: "🫧", price: 25, tags: ["drink", "cute"], eat: "{me}把彈珠按進瓶子裡，氣泡衝上來，差點噴了一手。" },
  chips: { name: "洋芋片", icon: "🥔", price: 30, tags: ["snack", "fried"], eat: "{me}一片接一片地吃，回過神來袋子已經空了。" },
  // ── 舊物市場 ──
  watch: { name: "古董懷錶", icon: "⌚", price: 180, tags: ["antique", "gift"] },
  postcard: { name: "舊紀元明信片", icon: "🖼️", price: 20, tags: ["antique", "paper"] },
  record: { name: "紀元黑膠唱片", icon: "💿", price: 120, tags: ["music", "antique"] },
  specimen: { name: "蝴蝶標本", icon: "🦋", price: 90, tags: ["specimen", "odd"] },
  drumsticks: { name: "舊鼓棒", icon: "🥢", price: 70, tags: ["music", "drum"] },
  plant: { name: "小盆栽", icon: "🪴", price: 50, tags: ["plant", "cute"] },
  // ── 機械市集 ──
  gear: { name: "黃銅齒輪組", icon: "⚙️", price: 40, tags: ["mech"] },
  tools: { name: "迷你工具組", icon: "🧰", price: 120, tags: ["mech", "gift"] },
  ledlights: { name: "彩色燈串", icon: "💡", price: 60, tags: ["mech", "cute"] },
  mechbird: { name: "發條小鳥", icon: "🐦", price: 150, tags: ["mech", "cute", "gift"] },
  neonpaint: { name: "螢光綠噴漆", icon: "🟢", price: 45, tags: ["neon", "mech"] },
  bait: { name: "特製釣餌", icon: "🪱", price: 25, tags: ["fishing"] },
  // ── 草藥市集 ──
  lavender: { name: "薰衣草香包", icon: "💜", price: 40, tags: ["herb", "flower"] },
  mint: { name: "薄荷茶包", icon: "🌿", price: 30, tags: ["herb", "tea"] },
  crystal: { name: "魔力水晶碎片", icon: "🔮", price: 160, tags: ["magic", "gift"] },
  bouquet: { name: "乾燥花束", icon: "💐", price: 80, tags: ["flower", "gift"] },
  owltreat: { name: "貓頭鷹點心", icon: "🦉", price: 35, tags: ["pet"] },
  spice: { name: "香料小罐", icon: "🧂", price: 55, tags: ["herb", "cooking"] },
  // ── 書街、古籍巷 ──
  mystery: { name: "推理小說", icon: "📕", price: 90, tags: ["book", "mystery"] },
  horror: { name: "恐怖小說", icon: "📓", price: 90, tags: ["book", "horror"] },
  poetry: { name: "詩集", icon: "📗", price: 70, tags: ["book"] },
  musicmag: { name: "樂團雜誌", icon: "📰", price: 40, tags: ["music", "paper"] },
  gossipmag: { name: "八卦週刊", icon: "🗞️", price: 30, tags: ["gossip", "paper"] },
  oldmap: { name: "古地圖", icon: "🗺️", price: 130, tags: ["antique", "mystery"] },
  rune: { name: "符文抄本", icon: "📜", price: 110, tags: ["magic", "book"] }
};

NOVUM.shops = {
  "諾文甜點店": { title: "諾文甜點店", icon: "🍰", greet: ["歡迎光臨！今天的草莓塔剛出爐喔。", "歡迎～要內用還是外帶呢？"], items: ["tart", "puff", "macaron", "choco", "cocoa", "tea"], acts: ["eatin", "work"], work: { label: "幫忙顧店", pay: 70, mins: 60, act: "在甜點店幫忙顧店" } },
  "Hale’s Oven": { title: "Hale’s Oven", icon: "🥐", keeper: "海爾", greet: ["歡迎。今天的濃湯是南瓜的，麵包剛出爐。", "來了啊。坐吧，要吃什麼？"], items: ["croissant", "cinnamon", "stewbread", "soup", "latte", "spice"], acts: ["eatin", "work"], work: { label: "幫忙揉麵團", pay: 80, mins: 60, act: "在 Hale’s Oven 幫忙揉麵團" } },
  "諾文夜市": { title: "諾文夜市", icon: "🏮", greet: ["來喔來喔！剛炸好的雞排！", "拉麵一碗，湯頭熬了一整天喔！"], items: ["ramen", "chicken", "squid", "tanghulu", "boba", "donut", "bait"], acts: ["eatin", "work"], work: { label: "幫攤販顧攤", pay: 90, mins: 60, act: "在夜市幫忙顧攤" } },
  "諾文轉角騎樓": { title: "騎樓販賣機", icon: "🥫", greet: ["（販賣機發出嗡嗡的聲音，燈閃了兩下。）"], items: ["cancoffee", "soda", "chips", "donut"], acts: ["eatin"] },
  "諾文舊物市場": { title: "舊物市場", icon: "🕰️", greet: ["隨便看隨便挑，每樣東西都有故事喔。", "這個是 EL-3 時代的，你摸摸看，還是溫的。"], items: ["watch", "postcard", "record", "specimen", "drumsticks", "plant"], acts: [] },
  "諾文機械市集": { title: "機械市集", icon: "⚙️", greet: ["零件、工具、發條玩具，要什麼有什麼。", "那個發條小鳥會唱歌喔，上緊發條試試看。"], items: ["gear", "tools", "ledlights", "mechbird", "neonpaint", "bait"], acts: ["work"], work: { label: "幫忙分類零件", pay: 75, mins: 60, act: "在機械市集幫忙分類零件" } },
  "維塔・草藥市集": { title: "草藥市集", icon: "🌿", greet: ["聞聞看，這是今天早上才摘的薄荷。", "水晶碎片要挑有光暈的，那種比較有魔力。"], items: ["lavender", "mint", "bouquet", "spice", "owltreat", "crystal"], acts: [] },
  "諾文混合書街": { title: "混合書街", icon: "📚", greet: ["新書在左邊，舊書在右邊，中間那堆不知道是哪個時代的。", "要找什麼書嗎？"], items: ["mystery", "horror", "poetry", "musicmag", "gossipmag"], acts: [] },
  "諾文古籍巷": { title: "古籍巷", icon: "📜", greet: ["小心翻，這些紙比你的祖父還老。", "符文抄本只賣給看得懂的人……開玩笑的，誰都能買。"], items: ["oldmap", "rune", "poetry", "postcard"], acts: [] },
  "諾文聯邦圖書館": { title: "聯邦圖書館", icon: "🏛️", greet: ["（櫃台的館員抬頭笑了笑，指了指「請保持安靜」的牌子。）"], items: [], acts: ["borrow"] },
  "諾文古神話展館": { title: "古神話展館", icon: "🗿", greet: ["本期特展：「沉睡的第四面鐘」。全票三十諾幣。"], items: [], acts: ["show"], show: { price: 30, title: "沉睡的第四面鐘", lines: ["展廳很暗，只有一座從鐘塔拆下來的舊鐘面在中間發著光。", "說明牌上寫著：這面鐘曾經停在同一個時刻整整一百年。", "{me}站在鐘面前很久。指針好像動了一下……大概是錯覺。"] } },
  "奧克托拉・研究展示區": { title: "研究展示區", icon: "🔭", greet: ["歡迎參觀。最新的時間結晶標本在三號展台。票價四十諾幣。"], items: [], acts: ["show"], show: { price: 40, title: "時間結晶標本展", lines: ["玻璃櫃裡的結晶慢慢轉動，每一面都映著不同時代的天空。", "研究員正在解說：這些結晶裡封著一秒鐘，永遠不會結束的一秒鐘。", "{me}湊近看，結晶裡好像有個很小很小的人影在揮手。"] } },
  "佩洛・表演廣場": { title: "表演廣場", icon: "🎭", greet: ["今晚的演出快開始了！站票五十諾幣。"], items: ["soda", "boba"], acts: ["perform", "eatin"], perform: { price: 50, title: "廣場街頭演出", lines: ["舞台燈一亮，台下的人瞬間安靜下來。", "鼓聲一下一下地敲進胸口，吉他手在第二段副歌時跳下了舞台。", "最後一個音落下，全場的歡呼聲大到連遠處的塗鴉街都聽得見。"] } }
};

// 圖書館借的書：看完就還
NOVUM.borrowBooks = ["《諾文鐘塔的一百個謎》", "《紀元交界處的植物圖鑑》", "《蓋亞聯邦簡史（第七版）》", "《地下湖的魚類與傳說》", "《如何與惡魔簽約（以及解約）》", "《機械心臟的保養手冊》", "《時間結晶入門》"];

NOVUM.giftPref = {
  "史威特": { love: ["mystery", "tea"], like: ["sweet", "antique", "gift"], dislike: ["horror"] },
  "沏萊爾": { love: ["coffee"], like: ["mystery", "mech", "bread"], dislike: ["cute"] },
  "佐代": { love: ["book", "tea"], like: ["magic", "antique", "herb"], dislike: ["fried"] },
  "白": { love: ["sweet", "odd"], like: ["specimen", "antique", "cute"], dislike: ["herb"] },
  "玫君": { love: ["drum", "music"], like: ["hearty", "fried", "coffee"], dislike: ["cute", "flower"] },
  "黑子": { love: ["mech"], like: ["sweet", "cute", "drink"], dislike: ["horror"] },
  "櫻子": { love: ["flower"], like: ["sweet", "tea", "gift"], dislike: ["fried"] },
  "何禹瀧": { love: ["mech"], like: ["hearty", "music", "fried"], dislike: ["flower", "cute"] },
  "海爾": { love: ["cooking", "herb"], like: ["antique", "tea", "bread"], dislike: ["snack"] },
  "瑞特": { love: ["fishing"], like: ["seafood", "hearty", "drink"], dislike: ["book"] },
  "禮": { love: ["horror", "specimen"], like: ["music", "book", "antique"], dislike: ["cute"] },
  "人間天使": { love: ["donut", "gossip"], like: ["sweet", "drink"], dislike: ["book"] },
  "星星": { love: ["odd", "magic"], like: ["sweet", "cute"], dislike: ["coffee"] },
  "癇癪": { love: ["neon"], like: ["mech", "hearty"], dislike: ["flower"] },
  "ミニクイ": { love: ["ramen"], like: ["hearty", "fried", "snack"], dislike: ["herb"] },
  "梅魯塔": { love: ["pet", "magic"], like: ["tea", "book", "antique"], dislike: ["fried"] }
};

/* 答應邀約時各自的口氣（一起散步、一起吃飯、玩小遊戲…） */
NOVUM.okLines = {
  "史威特": ["當然好！我們走吧！", "好主意！我正想找人一起呢。", "樂意之至～"],
  "沏萊爾": ["……行啊，反正我也沒事。", "好啦，別拉我袖子。", "嗯，走吧。"],
  "佐代": ["……好。", "可以。", "嗯。走吧。"],
  "白": ["好呀好呀～", "嘻嘻，就等你這句話。", "當然囉，我很閒的～"],
  "玫君": ["……隨便，走吧。", "嘖，好啦。", "可以，別太久。"],
  "黑子": ["好、好的！我可以！", "真、真的可以嗎？好！", "嗯！我跟你去！"],
  "櫻子": ["好啊，一起吧。", "我剛好也想去呢。", "沒問題～"],
  "何禹瀧": ["喔？難得你會約我，走啊。", "行啊，你請客的話。", "好啦好啦，陪你。"],
  "海爾": ["好。我把圍裙脫了就來。", "走吧，正好休息一下。", "嗯，可以。"],
  "瑞特": ["哈！就等你開口了！", "走走走，誰怕誰！", "好啊，別落後喔！"],
  "禮": ["好的，我陪你。", "嗯……好啊，我很樂意。", "可以呀，慢慢來。"],
  "人間天使": ["好啊～有甜甜圈嗎？", "走吧走吧～", "嗯哼，可以喔。"],
  "星星": ["好呀……嘻嘻。", "跟你一起嗎？好啊～", "嗯，星星也要去。"],
  "癇癪": ["哼，好啦，就陪你一下！", "快點啦，要走就走！", "……好啦，我又沒說不要。"],
  "ミニクイ": ["好欸！！走！！", "OK！我超閒的！", "好啊好啊！！"],
  "梅魯塔": ["好。正好也該活動活動。", "可以，帶路吧。", "嗯，我陪你走一段。"]
};
/* 小遊戲贏了／輸了的反應 */
NOVUM.winLines = {
  "史威特": ["我贏了！這就是推理的力量！", "呵呵，承讓了～"], "沏萊爾": ["……運氣好而已。", "哼，我早就看穿了。"], "佐代": ["……嗯。", "我贏了。"],
  "白": ["嘻嘻～惡魔是不會輸的喔。", "我贏啦～"], "玫君": ["……就這樣？", "太弱了。"], "黑子": ["欸？我、我贏了？！", "贏、贏了！"],
  "櫻子": ["好險，差一點點。", "嘿嘿，我贏囉。"], "何禹瀧": ["哈！就這點本事？", "認輸吧，手下敗將。"], "海爾": ["我贏了。下次讓你。", "嗯，還不錯。"],
  "瑞特": ["哈哈！誰都別想贏我！", "再來十次也一樣！"], "禮": ["啊，我贏了……不好意思。", "運氣比較好而已。"], "人間天使": ["耶～我贏了！請我吃甜甜圈！", "嘿嘿～"],
  "星星": ["嘻嘻，星星贏了。", "……我早就知道會贏喔。"], "癇癪": ["看吧！我就說我會贏！", "哼！這是當然的！"], "ミニクイ": ["耶——！！贏了！！", "我超強的對吧！！"], "梅魯塔": ["經驗的差距。", "嗯，不錯的對局。"]
};
NOVUM.loseLines = {
  "史威特": ["唔……再一次！這次我會贏的！", "輸了……不過很好玩！"], "沏萊爾": ["……再來。", "剛剛那個不算。"], "佐代": ["……輸了。", "下次不會。"],
  "白": ["欸～不算不算，再一次～", "哼～讓你的。"], "玫君": ["嘖。", "……再一局。"], "黑子": ["嗚……輸了。", "我、我下次會加油的！"],
  "櫻子": ["唉呀，輸了。", "好吧，你比較厲害。"], "何禹瀧": ["喂，你作弊吧？", "剛剛是我手滑。"], "海爾": ["輸了。厲害。", "嗯，你贏了。"],
  "瑞特": ["什麼？！再來！", "不可能！再一次！"], "禮": ["輸了呢……你很厲害。", "嗯，我輸了。"], "人間天使": ["欸～輸了啦。", "好吧好吧～"],
  "星星": ["……下次星星會贏。", "嗚。"], "癇癪": ["剛、剛才不算！", "可惡！再來！"], "ミニクイ": ["啊——輸了！！不甘心！！", "再一次再一次！！"], "梅魯塔": ["輸了。你進步了。", "嗯，是我大意了。"]
};

/* 一般互動：together 一起做事（做完兩個人會一起去 go 那裡待一陣子）、small 小動作、game 小遊戲 */
NOVUM.moreActs = {
  walk: { group: "together", label: "一起散步", icon: "🚶", gain: 4, go: ["諾文河岸步道", "諾文公園", "諾文鐘塔廣場"], act: "和{other}一起散步",
    open: ["{to}，要不要一起去{go}走走？", "{to}，陪我去{go}散個步好不好？", "整天待著有點悶。{to}，去{go}走一圈吧？"],
    mid: ["兩個人並肩走到{go}。風從河面吹過來，誰都沒急著說話。", "一路上{me}指著路邊的東西東聊西聊，{other}偶爾應一聲，步伐卻一直配合著。", "走到{go}的時候，天色剛好變了一點，兩個人停下來看了好一會兒。"],
    end: ["……偶爾這樣走走也不錯。", "下次再一起來吧。", "走一走，心情都變好了。"] },
  meal: { group: "together", label: "一起吃飯", icon: "🍽️", gain: 4, go: ["Hale’s Oven", "諾文甜點店", "諾文夜市"], act: "和{other}一起吃飯",
    open: ["{to}，肚子餓了嗎？一起去{go}吃點東西吧。", "{to}，{go}今天好像有新菜色，要不要去試試？", "我請客……開玩笑的，各付各的。{to}，去{go}吃飯吧？"],
    mid: ["兩個人在{go}找了個靠窗的位子。點的東西一上桌，{me}就忍不住先偷吃了一口{other}的。", "{other}把自己盤子裡的配菜默默推了一點過去，{me}假裝沒發現地吃掉了。", "吃到一半，兩個人同時伸手拿最後一塊，又同時縮了回去。"],
    end: ["吃飽了。……下次換你選地方。", "好好吃。改天再來吧。", "跟你一起吃，好像特別香。"] },
  read: { group: "together", label: "一起讀書", icon: "📖", gain: 3, go: ["諾文聯邦圖書館", "諾文混合書街"], act: "和{other}一起讀書",
    open: ["{to}，要不要一起去{go}看書？一個人容易分心。", "{to}，我想找一本書，陪我去{go}好嗎？", "{to}，去{go}吧，那裡很安靜。"],
    mid: ["兩個人在{go}的長桌對面坐下。翻頁的聲音一前一後，像是在悄悄對話。", "{me}看到有趣的段落，把書推過去給{other}看，{other}看完輕輕點了點頭。", "時間過得很慢。窗外的光從桌子這頭，移到了另一頭。"],
    end: ["……今天看了好多。謝謝你陪我。", "下次也一起來吧。", "嗯，這樣讀書效率好像比較高。"] },
  photo: { group: "together", label: "一起拍照", icon: "📸", gain: 3,
    open: ["{to}，來拍一張！難得天氣這麼好。", "{to}，看這邊——要拍了喔！", "{to}，站過來一點，不然拍不進去。"],
    mid: ["{me}舉起手機，{other}在最後一秒比了個手勢。", "第一張有人眨眼，第二張有人在笑，第三張兩個人都笑了出來。", "照片裡的背景是{place}，光線剛剛好。"],
    end: ["這張拍得真好，我要留著。", "等等傳給你。", "……不准刪喔。"] },
  highfive: { group: "small", label: "擊掌", icon: "✋", gain: 2,
    open: ["{to}，來！擊掌！", "{to}，手舉起來！", "耶！{to}，give me five！"],
    mid: ["啪的一聲，兩隻手在半空中拍在一起。", "{other}愣了一下，還是舉起手跟{me}拍了一下。", "擊掌的聲音清脆得讓路人都回頭看了一眼。"],
    end: ["嘿嘿，精神都來了。", "好，今天也加油吧。", "……幹嘛突然這樣啦。"] },
  pat: { group: "small", label: "摸摸頭", icon: "🫳", gain: 3, need: 50,
    open: ["{to}，今天辛苦了。", "{to}，過來一下。", "做得很好喔，{to}。"],
    mid: ["{me}伸手在{other}頭上輕輕拍了兩下。", "{other}縮了一下脖子，但沒有躲開。", "頭髮被揉得有點亂，{other}一邊抱怨一邊伸手整理。"],
    end: ["……我又不是小孩子。", "嘿嘿。", "好啦，謝謝你。"] },
  shoulder: { group: "small", label: "拍拍肩", icon: "🤚", gain: 2,
    open: ["{to}，別想太多。", "{to}，有我在呢。", "辛苦啦，{to}。"],
    mid: ["{me}拍了拍{other}的肩膀，手掌停留了一下才放開。", "{other}抬頭看了{me}一眼，表情鬆了一點。"],
    end: ["……嗯，謝了。", "說得也是。", "好，我沒事。"] },
  tsukkomi: { group: "small", label: "吐槽", icon: "🙄", gain: 2,
    open: ["{to}，你剛剛那句話自己聽聽看合理嗎？", "{to}，你是認真的嗎？", "等一下，{to}，這邏輯哪裡怪怪的。"],
    mid: ["{other}張了張嘴想反駁，結果自己先笑了出來。", "兩個人你一句我一句地抬起槓來，越吵越起勁。", "旁邊的人聽著聽著也忍不住跟著笑。"],
    end: ["好啦好啦，算你對一半。", "……下次不准再這樣講。", "哈，跟你說話真的不會無聊。"] },
  gossip: { group: "small", label: "聊八卦", icon: "🤫", gain: 3,
    open: ["{to}，過來過來，我跟你說一件事……", "{to}，你聽說了嗎？", "{to}，這件事你絕對不能說出去喔。"],
    mid: ["{me}壓低聲音說了一大串，{other}的眼睛越睜越大。", "「真的假的？！」{other}忍不住拉高了聲音，又趕緊摀住嘴。", "兩個人頭湊在一起，嘰嘰喳喳地講了好久。"],
    end: ["噓——這是我們的秘密。", "好啦，我什麼都沒聽到。", "改天再跟你說後續。"] },
  rps: { group: "game", label: "猜拳", icon: "✊", gain: 2, game: true,
    open: ["{to}，猜拳！輸的人請喝飲料！", "{to}，來猜拳決定！", "剪刀石頭布，{to}，敢不敢？"],
    mid: ["「剪刀、石頭——布！」", "兩隻手同時伸出來。第一輪平手，第二輪又平手。", "第三輪終於分出勝負。"] },
  arm: { group: "game", label: "比腕力", icon: "💪", gain: 2, game: true,
    open: ["{to}，比腕力！我今天狀態很好！", "{to}，敢不敢跟我比腕力？", "來吧{to}，手放上來。"],
    mid: ["兩個人的手肘抵在桌上，手指扣在一起。", "僵持了好幾秒，桌子都在微微發抖。", "最後一刻，其中一隻手猛地壓了下去。"] },
  quiz: { group: "game", label: "問答比賽", icon: "❓", gain: 2, game: true,
    open: ["{to}，來玩問答！諾文鐘塔有幾面鐘？", "{to}，我考你：地下湖最深的地方有多深？", "{to}，猜謎時間！準備好了嗎？"],
    mid: ["題目一題比一題刁鑽，兩個人搶答搶到差點撞在一起。", "比分咬得很緊，最後一題決勝負。", "「答案是——」兩個人同時開口。"] }
};

/* 戀愛：親密小動作（need：好感門檻；dating：要交往中；adult：只限成年人之間，高中生只到牽手和靠肩） */
NOVUM.loveMore = {
  hand: { label: "牽手", icon: "🤝", gain: 4, need: 80,
    open: ["……{to}，手。", "{to}，人好多，我怕走散了。", "{to}，可以……牽一下嗎？"],
    mid: ["{me}伸出手，指尖碰到的時候，兩個人都頓了一下。", "{other}沒有說話，只是把手輕輕握了回去。", "掌心有點熱，不知道是誰的。"],
    end: ["……就這樣走一段吧。", "嗯。", "不要放開喔。"] },
  lean: { label: "靠肩", icon: "😌", gain: 4, dating: true,
    open: ["{to}，借我靠一下。", "……{to}，有點累了。", "{to}，就一下下。"],
    mid: ["{me}的頭輕輕靠上{other}的肩膀。", "{other}僵了一秒，然後慢慢放鬆下來，調整成讓{me}比較好靠的姿勢。", "周圍的聲音好像都變小了。"],
    end: ["……好安心。", "再一下就好。", "嗯，這樣就好。"] },
  hug: { label: "擁抱", icon: "🫂", gain: 5, dating: true, adult: true,
    open: ["{to}，過來。", "……{to}，可以抱一下嗎？", "{to}，今天好想你。"],
    mid: ["{me}張開手臂，{other}走進來，把下巴擱在{me}的肩上。", "抱得不算緊，卻很久都沒有人先鬆手。", "聽得見彼此的心跳，一下，又一下。"],
    end: ["……好了，再抱下去就不想走了。", "謝謝你在這裡。", "嗯。我也是。"] },
  feed: { label: "餵一口", icon: "🥄", gain: 4, dating: true, adult: true,
    open: ["{to}，張嘴——", "{to}，這個很好吃，你嚐嚐。", "{to}，啊——"],
    mid: ["{me}把叉子遞到{other}嘴邊，{other}猶豫了一下，還是乖乖咬了下去。", "{other}嚼著嚼著，耳朵慢慢紅了。", "旁邊的人看了一眼，又裝作沒看到地轉過頭去。"],
    end: ["……好吃。", "下次換我餵你。", "這種事不要在外面做啦……好吃就是了。"] }
};

/* 約會地點：選了地點之後，兩個人會一起過去約會一個半小時 */
NOVUM.dateSpots = [
  { loc: "諾文甜點店", label: "甜點店", icon: "🍰", beats: ["甜點店靠窗的位子，陽光剛好落在桌上那兩杯飲料之間。", "{me}點了草莓塔，{other}點了巧克力蛋糕，結果兩個人都一直在吃對方的。", "櫃台的店員偷偷多送了一顆馬卡龍，說是給「看起來很配的客人」。"] },
  { loc: "諾文河岸步道", label: "河岸散步", icon: "🌊", beats: ["傍晚的河岸，路燈一盞一盞亮起來，倒影在水面上搖晃。", "兩個人沿著河慢慢走，影子一下靠近、一下分開。", "走到第十二盞路燈下的時候，{other}停下來，指著河面上一盞漂過的小燈。"] },
  { loc: "諾文夜市", label: "逛夜市", icon: "🏮", beats: ["夜市的燈籠一路掛到街尾，空氣裡都是炸物和糖的味道。", "{me}在撈金魚攤前蹲了好久，一隻都沒撈到，{other}在旁邊笑得肩膀發抖。", "最後兩個人一人一串糖葫蘆，邊走邊吃，被糖衣黏住了牙齒。"] },
  { loc: "諾文古神話展館", label: "看展覽", icon: "🗿", beats: ["展館裡很暗，只有展品被燈光照得發亮。", "{me}小聲地解說每一件展品的故事，{other}聽得很認真，偶爾低聲問一句。", "走出展館時，兩個人的手不知道什麼時候已經牽在一起了。"] },
  { loc: "諾文公園", label: "公園野餐", icon: "🧺", beats: ["公園的草地上鋪了一塊格子野餐布，上面擺滿了 Hale’s Oven 的麵包。", "風吹過來，{me}的帽子差點飛走，{other}伸手接住，順手替{me}戴回去。", "吃飽了之後兩個人躺在草地上，數著飄過去的雲。"] },
  { loc: "佩洛・表演廣場", label: "看演出", icon: "🎭", beats: ["表演廣場的人潮擠得水洩不通，{other}一直護在{me}身邊。", "副歌響起時全場跟著唱，{me}轉頭，發現{other}也在看著自己。", "散場後耳朵還嗡嗡的，兩個人笑著說剛剛根本聽不清楚對方在說什麼。"] },
  { loc: "諾文鐘塔廣場", label: "鐘塔夜景", icon: "🕰️", beats: ["夜晚的鐘塔廣場，四面鐘的燈光把整個廣場照成淡淡的金色。", "兩個人坐在噴水池邊，聽著鐘聲一下一下地響。", "第四面鐘又慢了半小時。{me}說：「這樣我們就多了半小時。」"] }
];

/* 紀念日、節日的特別約會 */
NOVUM.loveSpecial = {
  anniv: { label: "紀念日", icon: "🎂", gain: 8,
    open: ["{to}，你記得今天是什麼日子嗎？", "{to}，今天……是我們在一起滿{n}了喔。", "{to}，這個給你。紀念日快樂。"],
    mid: ["{other}愣了一下，然後笑了出來：「我怎麼可能忘記。」", "兩個人交換了準備好的小禮物，拆開的時候都有點不好意思。", "{me}把這一路的小事一件一件說出來，{other}聽著聽著，眼眶有點紅。"],
    end: ["以後的每個月，也都一起過吧。", "……謝謝你一直在。", "下個月，也請多指教。"] },
  fest: { label: "一起過節", icon: "🎉", gain: 6,
    open: ["{to}，今天是{fest}，要一起過嗎？", "{to}，{fest}耶！我們一起去吧！", "{to}，{fest}……想跟你一起過。"],
    mid: ["節日的燈火把{place}照得暖暖的，兩個人在人群裡並肩走著。", "{me}偷偷許了個願，{other}問是什麼，{me}笑著說不告訴你。", "人很多，{other}自然地牽起{me}的手，怕走散。"],
    end: ["明年的{fest}，也一起過吧。", "今天好開心。", "……有你在，節日才像節日。"] }
};
