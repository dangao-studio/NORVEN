/* 諾文小鎮：居民自己會做的事（點居民 →「✨ 自己做點什麼」）
 *
 * uses：每一種「可以做的事」
 *   icon、label（選單上的字）、act（他在做什麼，顯示在卡片和行程上）、min（做多久，小鎮時間分鐘）
 *   anim：做的時候的小動作（js/blocky.js 的 act）；only：只有這些人會做（別人的鼓組、魔藥鍋不會亂碰）
 * useOf：家具種類 → 預設是哪一種事（js/town3d.js 的 furn() 會照這張表替座位標上 use；同一件家具有好幾個位置、用途不同的，在 furn() 裡直接寫）
 * likes：每個人特別喜歡做的事，選了之後他說的話（選單上會標 ⭐）
 * ok：選了他沒那麼熱衷的事時，他隨口答應的話
 * no：這個人不會去做的事（不出現在選單上）
 */
window.NOVUM = window.NOVUM || {};

NOVUM.doings = {
  uses: {
    rest: { icon: "🪑", label: "坐下來歇一會", act: "坐著歇一會", min: 30 },
    nap: { icon: "💤", label: "小睡一下", act: "小睡片刻", min: 40 },
    eat: { icon: "🍙", label: "坐下來吃點東西", act: "坐著吃點東西", min: 30 },
    read: { icon: "📖", label: "坐著看書、寫點東西", act: "坐著看書寫字", min: 45 },
    write: { icon: "📝", label: "在打字機前打幾行字", act: "在打字機前打字", min: 40 },
    pc: { icon: "💻", label: "開電腦", act: "盯著電腦螢幕", min: 40 },
    drum: { icon: "🥁", label: "打一段鼓", act: "打鼓", min: 30, only: ["玫君"] },
    tinker: { icon: "🔧", label: "動手修點東西", act: "在工作台敲敲打打", min: 45, only: ["黑子", "何禹瀧", "癇癪"] },
    cook: { icon: "🍳", label: "做點吃的", act: "在爐台前做吃的", min: 40, only: ["海爾"] },
    case: { icon: "🔎", label: "盯著線索板想案子", act: "盯著線索板想案子", min: 30, only: ["史威特", "沏萊爾", "佐代", "白", "黑子"] },
    altar: { icon: "🕯️", label: "在祭壇前點蠟燭", act: "在祭壇前點蠟燭", min: 20, anim: "work", only: ["星星"] },
    dimbox: { icon: "🌀", label: "翻翻異次元箱", act: "在異次元箱裡翻東西", min: 15, anim: "browse", only: ["白", "佐代"] },
    brew: { icon: "🧪", label: "顧一下魔藥鍋", act: "顧著魔藥鍋", min: 30, anim: "cook", only: ["梅魯塔"] },
    // 小鎮上
    swing: { icon: "🎠", label: "盪鞦韆", act: "在鞦韆上慢慢盪著", min: 25, anim: "swing" },
    fountain: { icon: "⛲", label: "坐在噴泉邊", act: "坐在噴泉邊吹風", min: 25 },
    picnic: { icon: "🧺", label: "坐在野餐墊上", act: "坐在野餐墊上吃點心", min: 35, anim: "eat" },
    vend: { icon: "🥤", label: "買罐飲料", act: "在販賣機前買飲料", min: 15, anim: "drink" },
    news: { icon: "📰", label: "翻翻報紙雜誌", act: "在書報攤翻雜誌", min: 20, anim: "browse" },
    board: { icon: "📌", label: "看看公布欄", act: "看公布欄上的告示", min: 15, anim: "look" },
    well: { icon: "💧", label: "探頭看看井裡", act: "趴在井邊往下看", min: 15, anim: "peer" },
    shop: { icon: "🛍️", label: "逛逛攤子", act: "在攤子前東看西看", min: 25, anim: "browse" },
    viewer: { icon: "🔭", label: "用望遠鏡看遠方", act: "用投幣望遠鏡看遠方", min: 15, anim: "scope" },
    claw: { icon: "🧸", label: "夾娃娃", act: "在夾娃娃機前奮戰", min: 20, anim: "play" },
    fish: { icon: "🎣", label: "坐在碼頭邊釣魚", act: "坐在碼頭邊釣魚", min: 50, anim: "fish" },
    // 房間裡
    book: { icon: "📚", label: "到書櫃前挑本書", act: "站在書櫃前挑書", min: 15, anim: "browse" },
    music: { icon: "🎵", label: "放張唱片來聽", act: "放著唱片聽", min: 30, anim: "listen" },
    tank: { icon: "🐠", label: "看看魚缸", act: "盯著魚缸看", min: 15, anim: "look" },
    stars: { icon: "🔭", label: "湊到望遠鏡前看看", act: "湊在望遠鏡前看", min: 20, anim: "scope" },
    vanity: { icon: "💄", label: "在梳妝台前整理", act: "在梳妝台前整理頭髮", min: 20, anim: "look" },
    mirror: { icon: "🪞", label: "照照鏡子", act: "對著鏡子整理儀容", min: 10, anim: "look" },
    fire: { icon: "🔥", label: "到壁爐前烤火", act: "站在壁爐前烤火", min: 20, anim: "warm" },
    owl: { icon: "🦉", label: "照顧貓頭鷹", act: "替貓頭鷹整理羽毛", min: 15, anim: "pet" },
    cat: { icon: "🐈", label: "摸摸店裡的貓", act: "蹲在貓窩旁摸貓", min: 15, anim: "pet" },
    fridge: { icon: "🧊", label: "翻翻冰箱", act: "打開冰箱找吃的", min: 10, anim: "browse" },
    snack: { icon: "🍬", label: "拿點零食", act: "翻零食吃", min: 10, anim: "eat" },
    clothes: { icon: "👕", label: "挑挑衣服", act: "在衣架前挑衣服", min: 20, anim: "browse" },
    globe: { icon: "🌍", label: "轉轉地球儀", act: "轉著地球儀看", min: 10, anim: "browse" },
    arcade: { icon: "🕹️", label: "打一場街機", act: "打街機", min: 30, anim: "play" },
    tea: { icon: "🍵", label: "泡杯熱的", act: "泡熱飲", min: 15, anim: "cook" },
    tackle: { icon: "🧰", label: "整理釣具", act: "整理釣具箱", min: 25, anim: "work" }
  },

  useOf: {
    bed: "nap", hammock: "nap", sofa: "rest", beanbag: "rest", readchair: "rest", gamechair: "rest", bench2: "rest",
    table: "eat", desk: "read", magicdesk: "read", longtable: "read", classroom: "read", computer: "pc", typewriter: "write",
    drums: "drum", bench: "tinker", arm: "tinker", caseboard: "case", oven: "cook", stove: "cook", counter: "cook", altar: "altar", dimbox: "dimbox", cauldron: "brew",
    swing: "swing", fountain: "fountain", picnic: "picnic", vending: "vend", newsstand: "news", board: "board", well: "well", stall: "shop", viewer: "viewer", claw: "claw", dock: "fish",
    shelf: "book", record: "music", tank: "tank", telescope: "stars", vanity: "vanity", mirror: "mirror", fireplace: "fire", perch: "owl", catbed: "cat",
    fridge: "fridge", snacks: "snack", clothes: "clothes", globe: "globe", arcade: "arcade", kettle: "tea", tackle: "tackle"
  },

  likes: {
    "史威特": {
      case: "線索就在這裡面，我感覺得到。", swing: "好久沒盪鞦韆了呢。……只盪一下下。", fountain: "坐在水聲旁邊，腦袋會比較清楚。",
      viewer: "看得到偵探社的屋頂嗎？", news: "今天的報紙，有沒有我們的委託呢？", fire: "暖呼呼的，正適合整理推理。", tea: "來杯紅茶吧，配推理剛剛好。"
    },
    "沏萊爾": {
      read: "……別吵，我看完這章就好。", tea: "泡杯茶。不是因為累，是剛好想喝。", vend: "黑咖啡。社長那份？她自己買。",
      news: "看看社長又上了哪條新聞。", case: "她又把線連錯了……我來理一下。", rest: "坐一下而已，別以為我在偷懶。"
    },
    "佐代": {
      read: "……安靜。正好。", book: "……這本，上次沒看完。", well: "……底下有東西在反光。",
      fountain: "……水聲，不錯。", case: "……第三條線，不對。", dimbox: "……白又塞了什麼進去。"
    },
    "白": {
      dimbox: "我記得上次把布丁收進去了♪", claw: "惡魔的手氣，讓你見識一下～", swing: "盪高一點！再高一點～♪",
      vend: "全部的按鈕一起按會怎樣呢～？", shop: "這個貼上『白的』標籤，就是我的了♪", mirror: "鏡子裡的我也在笑呢♪"
    },
    "玫君": {
      drum: "……別說話。我要打了。", vend: "可樂。冰的。", rest: "……累了，坐一下。",
      nap: "吵死了……睡一下。", music: "這張還行。", arcade: "……一場。就一場。"
    },
    "黑子": {
      tinker: "這、這個螺絲鬆了……我來。", claw: "爪子的角度……再、再試一次。", cat: "毛、毛好軟……",
      tank: "魚、魚在看我……", viewer: "好、好遠……看得到學校耶。", globe: "蓋亞在、在這裡……"
    },
    "櫻子": {
      vanity: "頭髮有點亂了，整理一下。", clothes: "這件給黑子穿，應該很好看。", picnic: "下次帶便當來這裡吧。",
      fountain: "坐在這裡等黑子，剛剛好。", book: "幫黑子找本好讀的。", read: "先把明天的課預習完。"
    },
    "何禹瀧": {
      tinker: "這種東西，三分鐘搞定。", arcade: "最高分？看我刷新給你看。", claw: "這台的爪子被調鬆了吧，嘖。",
      vend: "飲料錢記在吳大鼓手帳上。", swing: "盪鞦韆？……好啦，沒人看就行。", shop: "這做工，我做的都比較好。"
    },
    "海爾": {
      cook: "正好，試個新菜。", tea: "泡壺茶，歇口氣。", cat: "吃飽了嗎，小傢伙。",
      shop: "看看今天有什麼好食材。", rest: "坐一下。等等還要顧店。", fish: "偶爾也學瑞特坐一下好了。"
    },
    "瑞特": {
      fish: "今天絕對釣到大的，賭一頓飯！", tackle: "魚鉤、浮標……嘿，這個還能用。", tank: "你們幾個，今天精神不錯嘛。",
      fridge: "冰箱裡……只剩魚餌。算了。", viewer: "看看河面，哪裡有魚在跳。", vend: "請客？好啊，你付。"
    },
    "禮": {
      music: "……這張唱片，聲音很沉。", write: "有個故事，剛好想到結尾。", read: "這本的結局，有點冷。",
      book: "聽說有一本會自己翻頁。", well: "……井底下，好像有人在看。", fire: "火光裡的影子，會說話。"
    },
    "人間天使": {
      eat: "有甜甜圈嗎～沒有的話天使會哭喔～", news: "今天的八卦在第幾版呢～", board: "誰貼了新告示～天使要第一個看～",
      swing: "飛起來的感覺～天使最喜歡了～", picnic: "野餐！甜甜圈也要一起～", fountain: "坐在這裡，八卦會自己飛過來～", nap: "天使要睡午覺了～"
    },
    "星星": {
      altar: "嘻嘻，蠟燭要點成一圈才行～", swing: "盪高一點，影子就追不上了～", well: "井裡的聲音，在叫我的名字耶～",
      book: "這本書在發光喔～嘻嘻～", mirror: "鏡子裡的我，比較愛笑呢～"
    },
    "癇癪": {
      arcade: "看好了！這關我閉著眼都能過！", pc: "誰又把我的設定改了啊！？", tinker: "這什麼爛接線！我來！",
      claw: "這台絕對有問題！再一次！", vend: "可樂！ミニクイ那份也買了啦！"
    },
    "ミニクイ": {
      eat: "開動！我要吃三碗！", tea: "熱水！泡麵時間到了！", fridge: "冰箱裡有什麼！？全部都好！",
      snack: "零食！一包不夠吧！", shop: "那攤聞起來好香！", picnic: "野餐！拉麵也可以帶嗎！"
    },
    "梅魯塔": {
      brew: "火候差一點。我來看著。", owl: "今天的羽毛很漂亮。", read: "這段文獻，要再對一次。",
      stars: "今晚的星位，值得記下來。", book: "那本筆記，我放在第三層。", tea: "一杯茶的時間，剛好。"
    }
  },

  ok: {
    "史威特": ["好呀，就這麼辦。", "嗯，聽起來不錯呢。", "那我去一下，馬上回來。"],
    "沏萊爾": ["……好啦，去就去。", "行。反正也沒別的事。", "知道了，別一直看著我。"],
    "佐代": ["……嗯。", "……好。", "知道了。"],
    "白": ["好呀～惡魔出發♪", "嘻嘻，交給我～", "聽起來很好玩～"],
    "玫君": ["……隨便。", "嘖。好啦。", "行吧，反正閒著。"],
    "黑子": ["好、好的！", "我、我試試看……", "嗯！我去。"],
    "櫻子": ["好的，我去一下。", "嗯，好主意。", "那我先過去囉。"],
    "何禹瀧": ["行啊，反正閒著。", "知道了，別催。", "好喔，走了走了。"],
    "海爾": ["好。", "行，我去一下。", "嗯，聽起來不壞。"],
    "瑞特": ["走就走！", "行啊，看我的！", "好！反正閒著也是閒著。"],
    "禮": ["嗯，好。", "……好，我去。", "聽起來不錯。"],
    "人間天使": ["好呀～", "天使出發～", "嗯嗯，聽起來不錯～"],
    "星星": ["好呀～嘻嘻～", "嗯～我知道了～", "聽你的～"],
    "癇癪": ["好啦好啦！", "知道了啦！不要催！", "去就去！"],
    "ミニクイ": ["好啊！", "出發！", "沒問題！順便找吃的！"],
    "梅魯塔": ["好。", "可以。", "嗯，我去看看。"]
  },

  no: {
    "梅魯塔": ["swing", "claw", "arcade"],
    "海爾": ["claw"],
    "佐代": ["claw", "swing"],
    "玫君": ["swing"]
  }
};
