光瀨都市鉄道 入口網站（靜態網站）
================================

【這是什麼】
純 HTML／CSS／JavaScript 的靜態網站，沒有後端，放到任何能放靜態檔案的地方就能用。
頁面：首頁（橫幅、選單、滾動廣告、時刻表查詢、運行情報、最新消息、路線圖）
      時刻表與班次/票價查詢（車站時刻表、乘車・轉乘查詢、票價查詢、路線圖）
      即時列車動態（拓樸路線圖＋依時刻表推算的列車位置）
      線上訂票、機場聯外交通（目前是「準備中」頁面）
      企業管理登入（選單右側，連到 ATOS）

【本機預覽】
不能直接雙擊 index.html（瀏覽器會擋讀取 JSON）。在這個資料夾開終端機：
    python -m http.server 8000
再開 http://localhost:8000/

【發布到 GitHub（最簡單的流程，只做一次）】
 1. 登入 github.com → 右上「＋」→ New repository。名稱隨意（例：hikarise-railways），選 Public，按 Create repository。
 2. 在新倉庫頁面按「uploading an existing file」，把這個資料夾「裡面的所有檔案與資料夾」（不是外面那層資料夾）拖進去，
    按 Commit changes。（資料夾很多時，可先把 zip 解壓縮再整批拖曳。）
 3. 倉庫 Settings → 左側 Pages → Source 選「Deploy from a branch」→ Branch 選 main、資料夾 / (root) → Save。
 4. 等 1～2 分鐘，網址是  https://你的帳號.github.io/倉庫名/  （Pages 頁面頂端會顯示）。
之後更新網站：直接在倉庫網頁上傳覆蓋檔案即可；時刻表資料則交給下面的「自動回傳」。
（想用自己的網域或 Cloudflare Pages 也行：連同一個 GitHub 倉庫即可。）

【時刻表資料：ATOS 自動回傳（0.16.0 起）】
資料檔是 data/snapshot.json（與 ATOS 網頁「下載路網快照」同一格式）。ATOS 0.16.0 會自動把它寫進倉庫：
 進世界約 3 分鐘後、之後每 12 小時、離開世界前各一次；路網沒變就不傳。
設定一次即可（在遊戲那台電腦的 config/hikarise_atos.properties 加上）：
    publish.repo=你的帳號/倉庫名
    publish.token=（下面取得的 token）
 取得 token：GitHub 右上頭像 → Settings → Developer settings → Personal access tokens → Fine-grained tokens →
 Generate new token → Repository access 選「Only select repositories」只勾這個倉庫 →
 Permissions → Repository permissions → Contents 選「Read and write」→ Generate，複製貼上。
 （token 等於這個倉庫的寫入密碼，不要貼到公開的地方；只給這一個倉庫權限是為了就算外流也傷不到別的。）
遊戲內指令：/atos publish reload（改完設定檔後讀取）、/atos publish now（立刻傳）、/atos publish（看狀態）。
資料更新後，GitHub Pages 約 1～2 分鐘內重新發布。

手動更新（沒有用自動回傳時）：ATOS 網頁頁尾下載路網快照 → 改名 snapshot.json → 覆蓋 data/snapshot.json 上傳。
路線圖版面：每次載入網頁時即時計算；若想固定版面並減少計算，可在本機執行  node tools/build-layout.js  產生 data/layout.json
（路網車站有增減時，舊的 layout.json 會自動作廢，不會卡住新路網）。
目前附的 snapshot.json 是 10/13 的舊存檔資料，只是範例；第一次自動回傳成功後就會被取代。

【設定】assets/js/site-config.js
 - atosUrl：「企業管理登入」要開啟的位址。ATOS 在遊戲那台電腦上跑，只有那台（或同區網）打得開。
 - tzOffsetSec：網站顯示的時區（台灣 8*3600、日本 9*3600）。
 - fareBase／fareStep：起步票價 290、每跨一個分區 +200。
 - zoneOverride：車站分區。票價依「遊戲內車站的分區欄位」計算；若遊戲內沒設，可在這裡寫
   { 'みつせ': 1, '谷山': 2 }。所有車站都沒有分區時，任何區間都是起步票價 290。

【最新消息】data/news.json（日期與內容目前是範本，請自行修改）。

【路線圖】
自動由路網產生，只用橫、直、45 度的線。若某站位置不滿意，改 data/layout.json 裡該站的 [x, y]。
路線一律用白與綠表現；識別圖上的六色塊沒有用在班次或路線上。

【素材】assets/img：logo-dark／logo-light（深底用／淺底用）、mark-dark／mark-light（只有鶴）。
識別圖副標已修正為 HIKARISE RAILWAYS；網站左上的識別圖是深色版直接放在橫幅照片上（沒有白底面板）。

【已知限制（誠實說明）】
 - 只用 10/13 的舊存檔資料與 Chromium 做過測試，沒有在其他瀏覽器、真實手機上實測。
 - 「即時列車動態」是依時刻表推算，不是遊戲內車輛的真實位置。
 - 路線圖為自動排版，站數變多或路網變複雜時，可能需要手動微調 layout.json。


──────── v6（2026-11 更新）────────
新增頁面：路線資訊（routes.html）、發車顯示（board.html）、沿線景點（sights.html）；首頁加了導覽方塊與景點縮圖。
 - 沿線景點的文字與照片放在 data/sights.json（名稱、最近車站、介紹、照片檔），要改文字或換照片直接改這個檔；照片放 assets/photo/。
   最近車站的名稱要與遊戲內車站中文名一致，找不到時只顯示名稱、不顯示時刻表按鈕（目前快照裡還沒有「天鳥崎中央」，新快照上傳後就會自動出現）。
 - 發車顯示：選車站，列出接下來 10 班發車與倒數，每秒更新時鐘；網址可帶 ?s=車站ID。
 - 路線資訊：停靠站、各站所要時間、可轉乘路線、班距、首末班、各種別停車一覽；網址可帶 ?r=路線名稱。
修正：
 - 車站時刻表的種別標示：各停不標示；其他種別標示種別略稱的第一個字（特急・特別快速＝特、快速＝快、環狀快速＝環）。環狀快速不再被當成一般快速。
   想改略稱可在 site-config.js 加 typeMarks: { '環状快速': '環' }。圖例會列出該站出現的所有種別。
 - 依調度模式顯示班次（離峰・深夜・收車）：補回 v5 漏掉的過濾，時刻表、乘車查詢、訂票、列車位置都會套用。
更新方式：覆蓋全部檔案，但「不要覆蓋 data/snapshot.json、data/layout.json」（那是 ATOS 自動回傳的）；data/sights.json 是新檔。

──────── v7 更新 ────────
1. 「發車顯示」選單移除：在「時刻表→路線圖」或首頁路線圖點選車站，會跳出小視窗（接下來的發車、方向、倒數、時刻表連結）。舊的 board.html 保留為轉址頁。
2. 新增「乘車指南・FAQ」(guide.html)：種別差別、指定席／自由席／立席特急券、怎麼選車、一天的發車班次圖（依快照即時計算）、避免搭錯車、常見問題。
3. 新增景點：多見瀨河濱公園、平倉市革命紀念公園（data/sights.json；照片 tomise1.webp、heikura1.webp）。景點可有多個最近車站。
4. 機場聯外交通 (airport.html) 正式上線：搭乘方式、所要時間與班次（依時刻表計算）、三日券 3,900 円／五日券 4,800 円。
5. 新增特急こばな專頁 (kobana.html) 與首頁輪播；輪播順序：機場聯外 → 特急こばな → 新2100形 → 10000系 → 時刻表票價改訂。
6. 修復：assets/js/atos-model.js 換成與 ATOS 網頁相同的新版 model.js（舊版合併路線不看名稱，環狀快速會被併入特急こばな）。
更新檔案：所有 *.html、assets/js/（atos-model.js、hk-core 不變、pages2.js、pages3.js、site.js）、assets/css/site.css、assets/photo/、data/sights.json、tools/make_pages.py。
data/news.v7.json 是新增兩則消息的建議（特急こばな、機場套票）：請自行合併到你的 data/news.json（不直接覆蓋，以免蓋掉你已改的內容）。

【v7.1 路線圖修正】
- 路網（站名、新站）改變後，舊 layout.json 會失效，手機只好即時重算；舊版重算有「時間上限」，手機慢就算得粗，路線圖會打結。
- 現在失效時改以內建底稿（assets/js/layout-seed.js，以車站 id 記錄每條線的方向）為底，只調整新增／改變的線；次數固定、不看時間，所有裝置結果相同。
- 瀏覽器快取改用新名稱（hk-layout4-），舊版存的粗糙結果不再沿用。
- 想要最佳結果：在本機執行 node tools/build-layout.js，產生新的 data/layout.json（內含 seed），並覆蓋到伺服器。

【v8.0：多語言與營運狀況列】
 - 語言：日本語（預設）／中文／English。最上方細條右側可切換，選擇存在瀏覽器（也可用網址 ?lang=ja|zh|en）。
   頁面原文是中文，執行時依 assets/js/i18n-dict.js 的對照表替換成日文或英文；沒有翻譯的字串會維持中文。
   對照表由 tools/build_i18n.py 產生（翻譯原稿在 tools/t1.py～t4.py）。新增頁面文字時，補上翻譯後執行 python3 tools/build_i18n.py。
   英文模式的站名、路線名用路網資料裡的英文名。
 - 營運狀況列：每一頁選單下方的細條，讀 ATOS 心跳（atos-status 分支的 status.json）。需要 ATOS 0.25.4 以上才有誤點／停車資料；
   舊版 ATOS 只會顯示「ATOS 系統運作中」。ATOS 超過 3 分鐘沒回報或讀不到時，顯示「沒有即時資料」，不會假裝平常運轉。
   設定沿用 site-config.js 的 atosStatus（repo、branch、onlineWithinSec）。

v8.1：車站編碼徽章（路線圖、車站彈窗、時刻表、乘規劃、景點最近車站）。資料來自 ATOS 0.26.0 快照的 stationCodes；顏色在 assets/js/site-config.js 的 codeColors 設定。

v8.2：新增景點與餐廳
 - 沿線景點新增 3 處：戸宮武道競技場（最近車站：戸宮、中央戸宮/光大前）、懷永美術館（曲江）、流星樹（みつせ）。文字與照片在 data/sights.json，照片 assets/photo/（budokan1/2、kaiei1/2、tower1/2.webp）。
   「曲江」目前不在 data/snapshot.json 的車站裡，所以只顯示站名、沒有時刻表按鈕；新快照上傳、車站名稱一致後會自動出現。
 - 沿線景點頁分成「景點」「餐廳」兩個分頁（sights.html#dining 直接開餐廳）。餐廳可用價位（平價〜2,000円／中價〜5,000円／高級〜10,000円）與車站篩選，網址可帶 ?tier=1|2|3&station=車站名。
 - 餐廳資料在 data/dining.json（36 間，三個價位各 12 間，涵蓋 14 站；店名、住址、營業時間皆為虛構）。要改內容直接改這個檔；也可改 tools/make_v82.py 後執行 python3 tools/make_v82.py 重新產生（會覆蓋 dining.json，並補上尚未存在的景點）。
   餐廳說明有中文與日文；英文模式顯示日文說明，菜系名稱有英文。
 - 車站名稱比對現在把「澤」視為「沢」（東松澤＝東松沢）。
 - 日英翻譯已補進 tools/t4.py，並重新產生 assets/js/i18n-dict.js。
更新檔案：sights.html 不需改；data/sights.json、data/dining.json（新）、assets/photo/（新增 6 張）、assets/js/pages2.js、assets/js/i18n-dict.js、assets/css/site.css、tools/。不要覆蓋 data/snapshot.json、data/layout.json。

v8.3：車站專屬頁面
 - 新頁面 station.html（?s=車站ID 或 ?n=車站名稱）：照片、介紹、停靠路線、票價分區、首班／末班、步行轉乘、接下來的發車、停靠的列車（日間每小時、一天班數）、月台與停車時間、到主要車站所要時間、車站周邊的景點與餐廳。時刻表、路線、月台由 ATOS 快照自動產生；介紹與照片在 data/stations.json（也可填 exits 出口、facilities 設施、link 連結，有填才顯示）。
   車站不在快照裡（目前：曲江、天鳥崎中央）也能顯示介紹與周邊，只是沒有時刻表資料；新快照上傳後自動補上。
 - 入口：路線圖／即時列車動態點車站的小視窗有「車站介紹」；車站時刻表頁有「車站介紹」按鈕；沿線景點的「最近車站」有「車站介紹」按鈕；沿線景點頁新增「車站介紹」分頁（可依路線篩選）。
 - 「沿線景點」改名為「沿線景點與車站介紹」（選單、頁尾、標題、日英翻譯）。
 - 第一批 14 站：戸宮、紫市、勝守、松沢国際空港（有額外照片）＋船井大島、天鳥崎中央、ひがしいち、九里橋三丁目、多見瀨、平倉公園西、東平倉、中央戸宮/光大前、曲江、みつせ（用景點照片）。要增加車站：在 data/stations.json 加一筆（或改 tools/make_stations.py 後重新執行）。
 - 照片 assets/photo/st-*.webp；戸宮（第1・2張）、紫市（第5張）、勝守（第3・4張）、松沢国際空港（第6・7張）的照片分配已由您確認。
更新檔案：station.html（新）、所有 *.html（選單改名）、data/stations.json（新）、assets/photo/st-*.webp（新）、assets/js/pages2.js、site.js、i18n-dict.js、assets/css/site.css、tools/。不要覆蓋 data/snapshot.json、data/layout.json。

──────── v8.4（日文・英文の補完）────────
・車站介紹文、照片說明、餐廳的步行時間／公休日、路線名（花川本線、特急あおさぎ 等）、「內回／外回」を日・英に対応。
・餐廳資料（data/dining.json）に英語用欄位を追加：en（紹介文）、nameEn（店名ローマ字）、dishEn（名物料理）、addressEn（英語表記の住所）。
  英語表示では価格を「¥900–1,300」、営業時間を「11:00–15:00 / 17:30–21:30 (reservation required)」の形に整えます。
・「A、B、C」と並ぶ路線名・行先・駅名を要素ごとに訳すようにしました（i18n.js）。
・英語表記を推測した名称（要確認）：曲江＝Kyokko、天鳥崎中央＝Amatorizaki-Chuo、光大前＝Kodai-mae。スナップショットに英語名がないための暫定値です。
・翻訳の追加は tools/t4.py の EXTRA → python3 tools/build_i18n.py（assets/js/i18n-dict.js を再生成）。

──────── v8.5（住所の行政区分）────────
・餐廳の住所を行政区分に合わせて作り直し：光瀨政令特別市（谷山・見沼・栗田・花倉・戸宮・白藏山の6区）／十万浦郡（平倉市・松沢町）／光瀨郡（名島市・勝守市・天鳥崎町・紫市）。生成は tools/make_v85.py。
・駅の英語名はMTRデータの正式名に統一：曲江＝Magarie、天鳥崎中央＝Tentori-Chuo（v8.4 で書いた Kyokko／Amatorizaki-Chuo／Kodai-mae は撤回）。


【v9.0　デザイン方向B（写真と1色）】
・共通ヘッダーを1段に統合（ロゴ・ナビ・言語切替）。1220px 以下（英語は 1420px 以下）は ≡ ボタンでメニューに折りたたむ。
・トップ：ヘッダーを写真の上に重ね、スライドは全面表示。運行情報の帯を写真の直下へ移動。
・見出しを明朝系（端末の標準明朝）に、左の太線を細い下線に変更。
・設定：assets/css/site.css 末尾の v9.0 ブロック。ヘッダー差し替えは tools/make_v90.py（再実行しても、すでに差し替え済みの頁は無視される）。
・data/snapshot.json と data/layout.json は上書きしないこと。

v9.1
- 路線資訊 → 設備與服務介紹（routes.html，assets/js/pages4.js）：四種種別（特急あおさぎ／特急こばな／花川本線特別快速／環狀快速白藏山線直通）的車型規格、照片、停靠站、所要時間、全日時刻表。車型文字與照片在 pages4.js 的 SERVICES。
- kobana.html 自動轉址到 routes.html?s=kobana。
- 車站頁：時刻表取代「接下來的發車」、移除月台停車時間；みつせ、戸宮加入出口與設施。
- 上傳時請勿覆蓋 data/snapshot.json、data/layout.json。

──────── 1.1.0（高速鉄道：万瀨高速鉄道線）────────
這次只動入口網站，沒有動模組，也沒有用到 ATOS。
・新增「高速鉄道」判斷：遊戲內路線的「種類」設為 HIGH_SPEED、而且路線名稱裡有「高速鉄道」兩個字，才會被認定是高速鉄道（雙重判斷，避免其他路線不小心被設成 HIGH_SPEED 時被誤判）。對照表：assets/js/hk-core.js（svcs 建立那段）。
・高速鉄道不納入光瀨都市鉄道的拓樸路線圖與一般票價的路徑搜尋（不進 H.edges／H.adj），路線圖改用虛線另外畫出來，並標出轉乘站（同站轉乘，或 site-config.js 的 walkLinks 站外轉乘，例如幸村／新光瀨）。
・高速鉄道獨立票價制度：每跨一個分區 800 円（hsFareStep）、指定席特急券固定 800 円（hsSeatFee，不打折、沒有立席特急券）；全部 8 輛編組（hsCars），1・8 号車各只有 8 席（hsEdgeCarSeats）。可以跟光瀨都市鉄道的所有路線一起查詢車站、規劃路線、查詢與訂票——查詢時預設不開啟，要勾選「可以利用高速鐵路」才會出現在搜尋結果裡（site.js／booking.js 的 allowHighSpeed）。
・票價查詢、車站時刻表、乘車・轉乘查詢三個頁面都加了「高速鉄道」欄位／標示，統一用識別色 #136880（site-config.js 的 hsColor）：
  - 票價查詢頁新增一個獨立的「万瀨高速鉄道線　獨立票價查詢」區塊（不跟一般票價混算）。
  - 車站時刻表新增「只顯示高速鉄道的班次」篩選；高速鉄道往東平倉方向的班次固定標示「東平倉・新岩沢　方面」（下面的地圖外延伸設定），反方向維持原本的終點命名。
  - 乘車・轉乘查詢既有的「可以利用高速鐵路」勾選框加上識別色樣式。
  - 時刻表格子、路線資訊等處的種別標籤，高速鉄道固定顯示「高速」（teal 底色），不再套用一般種別或路線色。
・地圖外的假想延伸（site-config.js 的 hsExt，純設定、不影響真正車次的判斷與運作）：万瀨高速鉄道線目前地圖內是新勝守／新光瀨／東平倉三站；東平倉之後設定了還沒建成的延伸——東平倉—48.6km(18分)—花宮天照—51.3km(20分)—豐守—23.1km(12分)—新岩沢，其中東平倉—豐守算一個收費分區、豐守—新岩沢算另一個分區（花宮天照跟東平倉同區）。這些延伸站只會出現在票價查詢頁新增的高速鉄道獨立查詢欄位裡（H.hsQueryStations／H.hsFareExt），不會進地圖、不會進拓樸、不會影響任何真正的車次。
  注意：目前附的 data/snapshot.json 裡沒有「新勝守」這個站、「新光瀨」也還沒有實際班次停靠，所以查詢欄位現在只會顯示「東平倉・花宮天照・豐守・新岩沢」；上傳新快照、這兩站有實際班次之後，新勝守／新光瀨會自動補進查詢清單，不需要再改程式。
・日文／英文翻譯已補進 tools/build_i18n.py 的 MORE 字典與 assets/js/i18n.js 的 special() 規則，並重新產生 assets/js/i18n-dict.js。
更新檔案（只需上傳有改到的檔案）：assets/js/hk-core.js、assets/js/hk-ui.js、assets/js/site.js、assets/js/booking.js、assets/js/i18n.js、assets/js/i18n-dict.js、assets/js/site-config.js、assets/js/atos-model.js、assets/css/site.css、tools/build_i18n.py。不要覆蓋 data/snapshot.json、data/layout.json。

──────── 1.1.1（新路網快照、特急号碼規則、路線圖、假想延伸合併計算）────────
這次也只動入口網站，沒有動模組，也沒有用到 ATOS。
・換上新的路網快照（data/snapshot.json）：萬瀨高速鉄道線在遊戲裡已經是真正的 HIGH_SPEED 路線（路線編號「特急とりさわ」），新勝守／新光瀨兩站也已經有實際班次。
・路線圖（data/layout.json）用新快照重新產生（node tools/build-layout.js data/snapshot.json 80），讓版面恢復成整齊、直線為主的樣子；tools/build-layout.js 本身補了一個只在 Node 環境生效的小修正（window 物件不存在時借用 global），跟瀏覽器執行沒有關係。
・特急「○号」編號規則放寬：原本只看路線全名有沒有「特急」兩個字才編號；現在路線的編號／簡稱欄位（遊戲內的 routeNumber）只要也出現「特急」，或者路線本身是高速鉄道，一律視為特急來編號。編號優先用路線編號欄位裡「特急」以外剩下的暱稱（例如「特急とりさわ」→「とりさわ」），沒有剩下暱稱才退回用路線全名（assets/js/hk-core.js 的號碼編排那段）。
・假想延伸合併計算：乘車・轉乘查詢（timetable.html?tab=route）與線上訂票（booking.html）勾選「利用高速鐵路」後，起訖站可以直接選地圖外的假想延伸站（花宮天照／豐守／新岩沢），不用再另外去獨立票價查詢欄位分開算：
  - 一端是地圖內真實車站、一端是假想站：正常搜尋真實路網到銜接站（東平倉）的班次，加上銜接站到假想站的分區運費與指定席特急券，合併顯示成一張行程卡片／一張車票的總價，並附一行說明這段假想延伸沒有真的車、僅供試算。
  - 兩端都是假想站，或其中一端剛好就是銜接站本身：沒有真實路段可查，直接顯示假想延伸的票價試算（沿用原本獨立票價查詢欄位那一套排版），不跑時刻表搜尋。
  - 訂票頁的候選行程清單、選位畫面、車票上都會分開列出「真實乘車段」與「假想延伸段」兩筆費用，假想延伸段明確標示沒有實際車次、無法選位。
・順便修掉一個被新快照「新快照首次出現真正的高速鉄道班次」才會觸發、跟上面這些改動無關的既有小毛病：乘車指南頁（guide.html）「發車班次圖」原本用一個只認得「各停／快速／特急」三種的統計表，遇到高速鉄道班次會整頁壞掉（算進特急那一類就不會壞）；同一個檔案（pages3.js）裡還有兩處排序表也沒算到高速鉄道，順序會跑掉（不會壞，但排序不對）——三處都已修正。
・日文／英文翻譯已補進 tools/build_i18n.py 的 MORE 字典（上面這幾項新文字），並重新產生 assets/js/i18n-dict.js。
更新檔案（只需上傳有改到的檔案）：data/snapshot.json、data/layout.json、tools/build-layout.js、assets/js/hk-core.js、assets/js/hk-ui.js、assets/js/site.js、assets/js/booking.js、assets/js/pages3.js、tools/build_i18n.py、assets/js/i18n-dict.js。

──────── 1.1.2（路線圖高速鉄道線形・全站翻譯補完）────────
這次也只動入口網站，沒有動模組，也沒有用到 ATOS。
・路線圖（timetable.html?tab=map）：高速鉄道線改用跟站名識別色一致的 teal 虛線（#136880，CFG.hsColor），不再跟一般路線共用灰色；線形限制成跟一般鉄道一樣只能走 45°／90° 的折角，而且永遠以一般鉄道已經排好的站位為準——高速鉄道的畫法只是沿著既有站位另外算一條折線，不會回頭影響任何一般路線的站位或線形（assets/js/hk-map.js 新增 layoutHsPaths()；assets/js/hk-ui.js、assets/css/site.css 配合調整畫法與顏色）。data/layout.json 已用 tools/build-layout.js 重新產生，一般鉄道的指標（crossings／bends／touch／near／offGrid）完全沒變，確認沒有受到影響。
・全站日文／英文翻譯補完（前輩反映「整個網站許多地方的翻譯沒有完善」）：
  - 修掉兩個會讓翻譯規則失效的架構性問題：(1) 比對字串前會先把全形空格收成半形空格（norm()），但有幾條規則的比對樣板是直接寫死全形空格，永遠比對不到，導致特定幾句英文版會漏翻或顯示不完整；(2) 字典裡有兩個早期、沒有真正用到的樣板字串殘留（strings.json 擷取時被截斷造成的半成品），寫得太寬鬆，會搶在正確的規則前面誤比對命中、吃掉後面「經由○○」「可利用高速鐵路」等內容。兩類問題都已修正／移除，這類「規則本身壞掉」的問題修好以後，之後同樣寫法的句子不會再漏翻，不只是補了幾句翻譯而已。
  - 另外補了約 15 處實際漏翻的內容：運行狀況的新時段文字、花川本線特別快速／松歲線直通等列車顯示名稱、訂票頁與地圖外延伸站相關的說明段落、照片說明文字、時刻表格子的小時刻度、選單的無障礙標籤、以及兩個因為頁面文字後來改過／加長而跟不上的舊翻譯對照（「路線資訊」改名「設備與服務介紹」後的 FAQ 說明；轉乘時間說明段落後來加了高速鉄道的補充句）。
  - 地圖外延伸站（花宮天照／豐守／新岩沢）補上英文站名（site-config.js 的 hsExt.stops 加 en 欄位），讓這三站在英文版的選單、查票、查詢結果裡都有名字可顯示，不再是空白。這三個拼音是人家先暫定的（花宮天照＝HANAMIYA-TENSHO、豐守＝TOYOMORI、新岩沢＝SHIN-IWASAWA），尤其「花宮天照」讀法比較不確定，前輩可以直接改 site-config.js 裡的 en 欄位，改完重新整理網頁就會套用，不用再跑其他工具。
  - 已用自動化工具逐頁逐語言（日文／英文）掃過全站，確認剩下沒翻到的都是故意保留原文的部分（語言切換器本身的「日本語」「中文」、列車車次名稱、時刻表格子裡的種別略稱單字如「特」「快」「環」等），沒有遺漏真正該翻而沒翻到的地方。
更新檔案（只需上傳有改到的檔案）：assets/js/hk-map.js、assets/js/hk-ui.js、assets/css/site.css、data/layout.json、assets/js/i18n.js、assets/js/pages2.js、assets/js/pages3.js、assets/js/site.js、assets/js/site-config.js、assets/js/hk-core.js、tools/build_i18n.py、tools/strings.json、tools/t1.py、tools/t2.py、tools/t3.py、tools/t4.py、assets/js/i18n-dict.js。不要覆蓋 data/snapshot.json。

──────── 1.2.3（HS 延伸段路線搜尋修正・車票格式改方案B）────────
這次也只動入口網站，沒有動模組，也沒有用到 ATOS。隨這次 ATOS 模組 1.2.3 一起交付，但入口網站這邊的改動跟模組完全獨立，可以單獨上傳更新。
・修好 3 個高速鉄道延伸段相關的路線搜尋 bug（assets/js/hk-core.js 的 H.hsExtLeg()／H.searchEx()，assets/js/site.js 的 viewRoute()，assets/js/booking.js 的 extLegInfo()）：
  - 延伸段選任一站查詢時，中間站現在會完整列在停靠順序內（原本只顯示頭尾兩站）。
  - 延伸段不再在東平倉（銜接站）顯示成一次多餘的「轉乘」，而是合併顯示成像同一班車直接開到延伸段終點（新增 H.mergeExtLeg()；這只影響顯示層的合併判斷，不影響 ATOS 與班表本身的實際運作資料）。
  - 查詢結果會避免「搭高速鉄道又繞回一般鐵路再繞回高速鉄道」的路徑建議；需要在高速鉄道與一般鐵路間轉乘時，到達時間相差在 5 分鐘內的候選方案，會優先選「利用一般鐵路最短、高速鐵路最長」的路徑（這個 ±5 分鐘的容忍窗口是人家自己抓的合理預設值，日後想調整可以直接改 H.searchEx() 裡的那個常數）。
・車票格式改成方案 B（assets/js/booking.js 的 ticket()）：訂票完成後不再是一張票，而是「一張全區間乘車券（起訖站的基礎乘車費用，綠色）＋每個有指定席的區間各一張獨立的特急券（依路線識別色上色，高速鉄道用 #136880）」，沿用現有 .tk 系列票面樣式，沒有新增 CSS。
・新光瀨跟幸村／新光瀨相互轉乘的站外轉乘設定，確認既有 walkLinks 設定已經符合需求，這次沒有再改動。
更新檔案（只需上傳有改到的檔案）：assets/js/hk-core.js、assets/js/site.js、assets/js/booking.js。不要覆蓋 data/snapshot.json、data/layout.json。

──────── 1.2.4（高速鉄道延伸段：同一班車・路徑長度優先／車票三種樣式／高速介面統一／防快取）────────
這次也只動入口網站，沒有動模組，也沒有用到 ATOS。請整包覆蓋上傳（data/snapshot.json、data/layout.json 這次沒有改，維持你原本的即可，不要被覆蓋成範例）。
・高速鉄道（延伸段，純假想判斷，不影響 ATOS 與班表）：
  - 延伸段與相鄰的高速鉄道班次併成「同一班車」直接開到地圖外（H.attachExtLeg，hk-core.js）。查詢頁（timetable.html?tab=route）與訂票頁（booking.html）都一樣：東平倉不再出現轉乘、列表不再顯示「高速 ＋ 高速」兩段、座位是同一班車連續的一次選位、指定席特急券只收一次。
  - 起訖兩端都在延伸段、或一端剛好是東平倉時，到達時間與票價路徑改用最後一站（原本誤取第 2 站，延伸段有中間站時會錯）。
  - 延伸段接在「一般鐵路」之後（要從一般鐵路換高速鉄道）時，仍算一次轉乘，並依最短轉乘時間（H.minTransfer）排出發時刻。
  - 路線建議：避免「高速→一般→高速」（實測 1,980 筆查詢結果裡沒有出現）；必須在高速與一般鐵路之間轉乘時，改以「總路徑長度」比較——一般鐵路最短、高速鐵路最長者優先（1.2.3 誤用時間，已改）。只在到達時間相差 CFG.hsPreferTolSec（site-config.js，預設 900 秒＝15 分）以內的方案之間比較，避免挑到晚很多才到的班次；想完全不管到達時間，可把它設得很大。
  - 站外轉乘 新光瀨↔幸村/新光瀨：既有 walkLinks 設定已符合，這次只做驗證。
・車票：一張全區間乘車券（起訖站的基礎乘車費用）＋每個指定席車次各一張獨立的特急券（延伸段併班後同一車次只有一張）。票面有三種樣式，在 assets/js/site-config.js 的 ticketStyle 設定：
  'A'＝硬券・指定券風（橫長，直書券種）　'B'＝識別色・Web 票卡（預設）　'C'＝券売機・感熱紙風（直式，點陣字體 DotGothic16，booking.html 已加上 Google Fonts 連結）。
  決定後只要把 ticketStyle 改成想要的字母即可。
・高速鉄道介面統一：assets/css/site.css 末端 1.2.4 區塊。高速鉄道欄位改成與主系統一致的直角・細線・白底・深綠文字；識別色 #136880 只留在小標籤、路線圖虛線、時刻表記號與高速鉄道特急券。
・日文／英文：訂票頁標題改成逐段翻譯（原本整句連在一起，不會被翻譯，日文與英文介面都會露出中文），並補上乗車券・特急券等新字串，已重新產生 assets/js/i18n-dict.js（只新增、沒有改動舊的）。用瀏覽器走完訂票與查詢流程、日文與英文各一次掃過，沒有再發現殘留的中文；餐廳名稱與列車名稱是日文原文，保留。
・防快取：所有頁面載入 JS／CSS 時加上 ?v=1.2.4，之後更新請遞增這個數字，避免瀏覽器或 GitHub Pages 繼續讀到舊檔（之前車票還是舊格式，很可能就是舊的 booking.js 被快取）。
更新檔案：所有 *.html（加版本參數；booking.html 另加字型連結）、assets/js/hk-core.js、site.js、booking.js、site-config.js、i18n-dict.js、assets/css/site.css、tools/build_i18n.py。


══ 1.2.5 ══
● 車票定案為 A 方案（硬券・指定券風）：site-config.js 的 ticketStyle 預設 'A'，booking.js 固定使用 A（B／C 程式碼保留但不再呼叫）。
● 每張票（乘車券、各特急券）日文＋英文同時印在同一版面，與網站語言設定無關。英文站名取自路網資料的 en 欄位（首字大寫），
  英文路線名取自 route.en；票面區塊加上 data-i18n-off，i18n.js 不會再改寫它（i18n.js 新增此屬性的略過判斷）。
● 票面比例固定 寬 10.5 : 高 5.7（CSS aspect-ratio: 10.5 / 5.7），文字用容器單位等比縮放；票面最小寬度 440px，更窄的螢幕改為橫向捲動以維持比例。
● 所有頁面的 ?v= 快取版本號更新為 1.2.5。


══ 1.3.0 ══（設計更新：A 方案字體＋B 方案版面）
● 新增 assets/css/theme.css（所有頁面在 site.css 之後載入）。只改外觀，頁面結構與功能不變；刪掉那一行 <link> 即可回到 1.2.5 的外觀。
● 字體：只用 Noto Sans 一族（日文用 Noto Sans JP、中文／英文用 Noto Sans TC，Google Fonts 載入；沒有網路時退回系統的黑體）。
  不再混用襯線體（--serif 直接指向無襯線字體）。字重只用 400／500／700／900。
● 版面（B 方案）：深綠細條（標誌・語言切換・企業管理登入）＋白底選單列（中文／日文主標＋英文小標，hover 與目前頁面有底線）；
  區塊標題為「英文小標在上、主標在下」；ご案內改為編號＋細線；表格・消息改為細線列表。
  選單列在寬度 1421px 以上顯示雙層；以下維持原本的漢堡選單。首頁橫幅不再覆蓋在照片上。
● 副色：暖黃（只用在深綠底上的強調，例如橫幅的種別小標、頁尾 hover）、砂金（編號與小標的細線）、各路線的識別色
  （首頁「運行情報」每條路線前面的色條，取自路網資料的路線顏色；site.js 只加了讀取顏色的兩行）。
● 動態：按鈕・卡片・列表・選單的 hover 回饋；橫幅照片緩慢放大、文字依序淡入；各區塊進場淡入；營運正常的小圓點呼吸燈。
  系統設定「減少動態」時全部關閉。
● 線上訂票表單改為依寬度自動換行，「列車を検索」按鈕不再被切字。
● 所有頁面的 ?v= 快取版本號更新為 1.3.0。data/snapshot.json、data/layout.json 沒有動。


══ 1.4.0 ══
・新增「高速鉄道」專頁 hs.html（导覽列第 2 個、首頁第一張輪播與「ご案内」磚）：2026.11.16 開通倒數／開業第 N 日、開業記念指定席特急券、
  一日往返（首末班・所要時間・停留時間由時刻表資料與 site-config 的 hsExt 自動算出）、水平路線圖（光瀨都市鉄道／白令鉄道管轄、新岩沢＝目前終點）、
  HR-新01系 介紹與照片、四站轉乘方式、票價（自動算）、高速鉄道消息（data/news.json 裡 tag＝高速鉄道 的項目）。
  日・中・英都有翻譯；專頁用的樣式在 assets/css/hs.css、程式在 assets/js/hs.js。
・高速鉄道「指定席特急券」改用專用票面（夕陽列車照片＋開業記念章），比例 10.5:5.7 與內文同一般車票；一般乘車券不變。
  開業記念章由 site-config.js 的 hsMemorial（'2026-11-16'）控制，設成 '' 就不印。以後高速鉄道的指定席特急券都用這個票面。
・訂票頁座位圖：高速鉄道 1・8 號車（車頭・車尾）只有 8 席（2+2、共 2 排），空席數也一併改正。
・data/snapshot.json、layout.json 不變。
